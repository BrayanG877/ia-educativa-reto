-- =============================================
-- ESQUEMA DE BASE DE DATOS - IA EDUCATIVA
-- Sistema de tutorización con IA y método socrático
-- =============================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================
-- TABLA: users
-- Almacena información de usuarios (estudiantes)
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),

    -- Información del estudiante
    grade_level VARCHAR(50), -- Ej: "10mo", "11mo"
    institution VARCHAR(255),

    -- Control de acceso
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    parent_consent BOOLEAN DEFAULT false, -- Consentimiento de padres (menores)

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,

    -- Índices
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);

-- =============================================
-- TABLA: subjects
-- Materias disponibles en el sistema
-- =============================================
CREATE TABLE IF NOT EXISTS subjects (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    emoji VARCHAR(10), -- Emoji representativo
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar materias iniciales
INSERT INTO subjects (code, name, emoji) VALUES
('matematicas', 'Matemáticas', '🔢'),
('biologia', 'Biología / Ciencias Naturales', '🔬'),
('fisica', 'Física', '⚛️'),
('quimica', 'Química', '⚗️'),
('sociales', 'Ciencias Sociales / Historia / Geografía', '🌍'),
('español', 'Español / Lengua Castellana / Literatura', '📖'),
('filosofia', 'Filosofía', '🤔'),
('informatica', 'Informática / Tecnología', '💻'),
('ingles', 'Inglés / Lenguas Extranjeras', '🗣️'),
('arte', 'Arte / Educación Artística', '🎨'),
('educacion-fisica', 'Educación Física / Deportes', '⚽'),
('religion', 'Religión', '✝️'),
('icfes', 'Preparación ICFES', '📝')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- TABLA: conversations
-- Conversaciones con la IA
-- =============================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id),
    title VARCHAR(255),

    -- Configuración de conversación
    mode VARCHAR(50) DEFAULT 'socratic' CHECK (mode IN ('socratic', 'direct', 'icfes', 'quiz')),

    -- Metadata
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,

    -- Estadísticas
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    estimated_cost DECIMAL(10, 6) DEFAULT 0
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_subject ON conversations(subject_id);
CREATE INDEX idx_conversations_active ON conversations(is_active);

-- =============================================
-- TABLA: messages
-- Mensajes individuales en conversaciones
-- =============================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

    -- Contenido
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,

    -- Información de IA
    model VARCHAR(100),
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    cost DECIMAL(10, 6),

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Flags
    was_cached BOOLEAN DEFAULT false,
    was_moderated BOOLEAN DEFAULT false,
    moderation_passed BOOLEAN DEFAULT true
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- =============================================
-- TABLA: user_metrics
-- Métricas de uso y progreso del estudiante
-- =============================================
CREATE TABLE IF NOT EXISTS user_metrics (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Métricas de uso
    time_spent_minutes INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    conversations_started INTEGER DEFAULT 0,

    -- Métricas de progreso
    exercises_completed INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    topics_mastered INTEGER DEFAULT 0,

    -- Métricas de IA
    tokens_used INTEGER DEFAULT 0,
    api_calls INTEGER DEFAULT 0,
    estimated_cost DECIMAL(10, 6) DEFAULT 0,

    -- Timestamp
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Constraint para evitar duplicados
    UNIQUE(user_id, date)
);

CREATE INDEX idx_user_metrics_user_date ON user_metrics(user_id, date);

-- =============================================
-- TABLA: cache_responses
-- Caché de respuestas frecuentes para optimización
-- =============================================
CREATE TABLE IF NOT EXISTS cache_responses (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    subject_id INTEGER REFERENCES subjects(id),

    -- Contenido
    question_hash VARCHAR(64) NOT NULL, -- Hash de la pregunta
    response TEXT NOT NULL,

    -- Metadata
    hit_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,

    -- Información de IA original
    model VARCHAR(100),
    tokens_saved INTEGER DEFAULT 0
);

CREATE INDEX idx_cache_key ON cache_responses(cache_key);
CREATE INDEX idx_cache_expires ON cache_responses(expires_at);

-- =============================================
-- TABLA: moderation_logs
-- Registro de moderación de contenido
-- =============================================
CREATE TABLE IF NOT EXISTS moderation_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    message_id UUID REFERENCES messages(id),

    -- Contenido moderado
    content TEXT NOT NULL,

    -- Resultado de moderación
    flagged BOOLEAN DEFAULT false,
    reason VARCHAR(255),
    categories JSONB, -- Categorías detectadas

    -- Acción tomada
    action VARCHAR(50) CHECK (action IN ('allowed', 'blocked', 'warned', 'reviewed')),

    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_moderation_user ON moderation_logs(user_id);
CREATE INDEX idx_moderation_flagged ON moderation_logs(flagged);

-- =============================================
-- TABLA: audit_logs
-- Registro de auditoría para cumplimiento legal
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),

    -- Acción
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id VARCHAR(255),

    -- Detalles
    details JSONB,
    ip_address INET,
    user_agent TEXT,

    -- Timestamp
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);

-- =============================================
-- FUNCIONES Y TRIGGERS
-- =============================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para users
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger para user_metrics
CREATE TRIGGER update_user_metrics_updated_at BEFORE UPDATE ON user_metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- VISTAS ÚTILES
-- =============================================

-- Vista de estadísticas de usuario
CREATE OR REPLACE VIEW user_statistics AS
SELECT
    u.id,
    u.username,
    u.full_name,
    COUNT(DISTINCT c.id) as total_conversations,
    COUNT(m.id) as total_messages,
    SUM(m.total_tokens) as total_tokens_used,
    SUM(m.cost) as total_cost,
    MAX(c.last_message_at) as last_activity
FROM users u
LEFT JOIN conversations c ON u.id = c.user_id
LEFT JOIN messages m ON c.id = m.conversation_id
WHERE u.role = 'student'
GROUP BY u.id, u.username, u.full_name;

-- Vista de ranking de estudiantes
CREATE OR REPLACE VIEW student_ranking AS
SELECT
    u.id,
    u.username,
    u.full_name,
    SUM(um.time_spent_minutes) as total_time_minutes,
    SUM(um.messages_sent) as total_messages,
    SUM(um.exercises_completed) as total_exercises,
    SUM(um.topics_mastered) as topics_mastered,
    -- Fórmula de puntuación (ajustable)
    (
        SUM(um.time_spent_minutes) * 0.2 +
        SUM(um.messages_sent) * 0.3 +
        SUM(um.exercises_completed) * 0.4 +
        SUM(um.topics_mastered) * 0.1
    ) as score
FROM users u
LEFT JOIN user_metrics um ON u.id = um.user_id
WHERE u.role = 'student' AND u.is_active = true
GROUP BY u.id, u.username, u.full_name
ORDER BY score DESC;

-- =============================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- =============================================

COMMENT ON TABLE users IS 'Usuarios del sistema (estudiantes, profesores, administradores)';
COMMENT ON TABLE subjects IS 'Materias disponibles para estudio';
COMMENT ON TABLE conversations IS 'Conversaciones entre estudiantes y la IA';
COMMENT ON TABLE messages IS 'Mensajes individuales en conversaciones';
COMMENT ON TABLE user_metrics IS 'Métricas diarias de uso y progreso';
COMMENT ON TABLE cache_responses IS 'Caché de respuestas para optimización';
COMMENT ON TABLE moderation_logs IS 'Registro de moderación de contenido';
COMMENT ON TABLE audit_logs IS 'Registro de auditoría para cumplimiento legal';

-- =============================================
-- FIN DEL ESQUEMA
-- =============================================

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE '✅ Esquema de base de datos creado exitosamente';
    RAISE NOTICE '📊 Tablas: users, subjects, conversations, messages, user_metrics, cache_responses, moderation_logs, audit_logs';
    RAISE NOTICE '📈 Vistas: user_statistics, student_ranking';
END $$;
