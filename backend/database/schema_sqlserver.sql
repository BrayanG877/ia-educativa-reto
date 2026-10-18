-- =============================================
-- ESQUEMA DE BASE DE DATOS - IA EDUCATIVA
-- Sistema de tutorización con IA y método socrático
-- Microsoft SQL Server (Azure SQL)
-- =============================================

-- Configurar opciones de base de datos
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- TABLA: users
-- Almacena información de usuarios (estudiantes)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[users]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[users] (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),

        -- Información del estudiante
        grade_level VARCHAR(50), -- Ej: "10mo", "11mo"
        institution VARCHAR(255),

        -- Control de acceso
        is_active BIT DEFAULT 1,
        is_verified BIT DEFAULT 0,
        parent_consent BIT DEFAULT 0, -- Consentimiento de padres (menores)

        -- Metadata
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        last_login DATETIME2
    );

    CREATE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_users_username ON users(username);
    CREATE INDEX idx_users_role ON users(role);
END
GO

-- =============================================
-- TABLA: subjects
-- Materias disponibles en el sistema
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[subjects]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[subjects] (
        id INT IDENTITY(1,1) PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description NVARCHAR(MAX),
        emoji NVARCHAR(10), -- Emoji representativo
        is_active BIT DEFAULT 1,
        created_at DATETIME2 DEFAULT GETDATE()
    );
END
GO

-- Insertar materias iniciales
IF NOT EXISTS (SELECT 1 FROM subjects WHERE code = 'matematicas')
BEGIN
    INSERT INTO subjects (code, name, emoji) VALUES
    ('matematicas', N'Matemáticas', N'🔢'),
    ('biologia', N'Biología / Ciencias Naturales', N'🔬'),
    ('fisica', N'Física', N'⚛️'),
    ('quimica', N'Química', N'⚗️'),
    ('sociales', N'Ciencias Sociales / Historia / Geografía', N'🌍'),
    ('español', N'Español / Lengua Castellana / Literatura', N'📖'),
    ('filosofia', N'Filosofía', N'🤔'),
    ('informatica', N'Informática / Tecnología', N'💻'),
    ('ingles', N'Inglés / Lenguas Extranjeras', N'🗣️'),
    ('arte', N'Arte / Educación Artística', N'🎨'),
    ('educacion-fisica', N'Educación Física / Deportes', N'⚽'),
    ('religion', N'Religión', N'✝️'),
    ('icfes', N'Preparación ICFES', N'📝');
END
GO

-- =============================================
-- TABLA: conversations
-- Conversaciones con la IA
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[conversations]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[conversations] (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        user_id UNIQUEIDENTIFIER NOT NULL,
        subject_id INT,
        title VARCHAR(255),

        -- Configuración de conversación
        mode VARCHAR(50) DEFAULT 'socratic' CHECK (mode IN ('socratic', 'direct', 'icfes', 'quiz')),

        -- Metadata
        started_at DATETIME2 DEFAULT GETDATE(),
        last_message_at DATETIME2 DEFAULT GETDATE(),
        is_active BIT DEFAULT 1,

        -- Estadísticas
        message_count INT DEFAULT 0,
        total_tokens INT DEFAULT 0,
        estimated_cost DECIMAL(10, 6) DEFAULT 0,

        CONSTRAINT FK_conversations_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT FK_conversations_subjects FOREIGN KEY (subject_id) REFERENCES subjects(id)
    );

    CREATE INDEX idx_conversations_user ON conversations(user_id);
    CREATE INDEX idx_conversations_subject ON conversations(subject_id);
    CREATE INDEX idx_conversations_active ON conversations(is_active);
END
GO

-- =============================================
-- TABLA: messages
-- Mensajes individuales en conversaciones
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[messages]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[messages] (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        conversation_id UNIQUEIDENTIFIER NOT NULL,

        -- Contenido
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content NVARCHAR(MAX) NOT NULL,

        -- Información de IA
        model VARCHAR(100),
        prompt_tokens INT,
        completion_tokens INT,
        total_tokens INT,
        cost DECIMAL(10, 6),

        -- Metadata
        created_at DATETIME2 DEFAULT GETDATE(),

        -- Flags
        was_cached BIT DEFAULT 0,
        was_moderated BIT DEFAULT 0,
        moderation_passed BIT DEFAULT 1,

        CONSTRAINT FK_messages_conversations FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX idx_messages_created_at ON messages(created_at);
END
GO

-- =============================================
-- TABLA: user_metrics
-- Métricas de uso y progreso del estudiante
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[user_metrics]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[user_metrics] (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id UNIQUEIDENTIFIER NOT NULL,
        date DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),

        -- Métricas de uso
        time_spent_minutes INT DEFAULT 0,
        messages_sent INT DEFAULT 0,
        conversations_started INT DEFAULT 0,

        -- Métricas de progreso
        exercises_completed INT DEFAULT 0,
        correct_answers INT DEFAULT 0,
        topics_mastered INT DEFAULT 0,

        -- Métricas de IA
        tokens_used INT DEFAULT 0,
        api_calls INT DEFAULT 0,
        estimated_cost DECIMAL(10, 6) DEFAULT 0,

        -- Timestamp
        updated_at DATETIME2 DEFAULT GETDATE(),

        CONSTRAINT FK_user_metrics_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT UQ_user_metrics_user_date UNIQUE(user_id, date)
    );

    CREATE INDEX idx_user_metrics_user_date ON user_metrics(user_id, date);
END
GO

-- =============================================
-- TABLA: cache_responses
-- Caché de respuestas frecuentes para optimización
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[cache_responses]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[cache_responses] (
        id INT IDENTITY(1,1) PRIMARY KEY,
        cache_key VARCHAR(255) UNIQUE NOT NULL,
        subject_id INT,

        -- Contenido
        question_hash VARCHAR(64) NOT NULL, -- Hash de la pregunta
        response NVARCHAR(MAX) NOT NULL,

        -- Metadata
        hit_count INT DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE(),
        last_used_at DATETIME2 DEFAULT GETDATE(),
        expires_at DATETIME2,

        -- Información de IA original
        model VARCHAR(100),
        tokens_saved INT DEFAULT 0,

        CONSTRAINT FK_cache_responses_subjects FOREIGN KEY (subject_id) REFERENCES subjects(id)
    );

    CREATE INDEX idx_cache_key ON cache_responses(cache_key);
    CREATE INDEX idx_cache_expires ON cache_responses(expires_at);
END
GO

-- =============================================
-- TABLA: moderation_logs
-- Registro de moderación de contenido
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[moderation_logs]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[moderation_logs] (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id UNIQUEIDENTIFIER,
        message_id UNIQUEIDENTIFIER,

        -- Contenido moderado
        content NVARCHAR(MAX) NOT NULL,

        -- Resultado de moderación
        flagged BIT DEFAULT 0,
        reason VARCHAR(255),
        categories NVARCHAR(MAX), -- JSON de categorías detectadas

        -- Acción tomada
        action VARCHAR(50) CHECK (action IN ('allowed', 'blocked', 'warned', 'reviewed')),

        -- Timestamp
        created_at DATETIME2 DEFAULT GETDATE(),

        CONSTRAINT FK_moderation_logs_users FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT FK_moderation_logs_messages FOREIGN KEY (message_id) REFERENCES messages(id)
    );

    CREATE INDEX idx_moderation_user ON moderation_logs(user_id);
    CREATE INDEX idx_moderation_flagged ON moderation_logs(flagged);
END
GO

-- =============================================
-- TABLA: audit_logs
-- Registro de auditoría para cumplimiento legal
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[audit_logs]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[audit_logs] (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id UNIQUEIDENTIFIER,

        -- Acción
        action VARCHAR(100) NOT NULL,
        resource VARCHAR(100),
        resource_id VARCHAR(255),

        -- Detalles
        details NVARCHAR(MAX), -- JSON
        ip_address VARCHAR(45),
        user_agent NVARCHAR(MAX),

        -- Timestamp
        created_at DATETIME2 DEFAULT GETDATE(),

        CONSTRAINT FK_audit_logs_users FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX idx_audit_user ON audit_logs(user_id);
    CREATE INDEX idx_audit_action ON audit_logs(action);
    CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
END
GO

-- =============================================
-- TRIGGERS
-- =============================================

-- Trigger para actualizar updated_at en users
IF OBJECT_ID('trg_users_update_updated_at', 'TR') IS NOT NULL
    DROP TRIGGER trg_users_update_updated_at;
GO

CREATE TRIGGER trg_users_update_updated_at
ON users
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE users
    SET updated_at = GETDATE()
    FROM users u
    INNER JOIN inserted i ON u.id = i.id;
END
GO

-- Trigger para actualizar updated_at en user_metrics
IF OBJECT_ID('trg_user_metrics_update_updated_at', 'TR') IS NOT NULL
    DROP TRIGGER trg_user_metrics_update_updated_at;
GO

CREATE TRIGGER trg_user_metrics_update_updated_at
ON user_metrics
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE user_metrics
    SET updated_at = GETDATE()
    FROM user_metrics um
    INNER JOIN inserted i ON um.id = i.id;
END
GO

-- =============================================
-- VISTAS ÚTILES
-- =============================================

-- Vista de estadísticas de usuario
IF OBJECT_ID('user_statistics', 'V') IS NOT NULL
    DROP VIEW user_statistics;
GO

CREATE VIEW user_statistics AS
SELECT
    u.id,
    u.username,
    u.full_name,
    COUNT(DISTINCT c.id) as total_conversations,
    COUNT(m.id) as total_messages,
    ISNULL(SUM(m.total_tokens), 0) as total_tokens_used,
    ISNULL(SUM(m.cost), 0) as total_cost,
    MAX(c.last_message_at) as last_activity
FROM users u
LEFT JOIN conversations c ON u.id = c.user_id
LEFT JOIN messages m ON c.id = m.conversation_id
WHERE u.role = 'student'
GROUP BY u.id, u.username, u.full_name;
GO

-- Vista de ranking de estudiantes
IF OBJECT_ID('student_ranking', 'V') IS NOT NULL
    DROP VIEW student_ranking;
GO

CREATE VIEW student_ranking AS
SELECT
    u.id,
    u.username,
    u.full_name,
    ISNULL(SUM(um.time_spent_minutes), 0) as total_time_minutes,
    ISNULL(SUM(um.messages_sent), 0) as total_messages,
    ISNULL(SUM(um.exercises_completed), 0) as total_exercises,
    ISNULL(SUM(um.topics_mastered), 0) as topics_mastered,
    -- Fórmula de puntuación (ajustable)
    (
        ISNULL(SUM(um.time_spent_minutes), 0) * 0.2 +
        ISNULL(SUM(um.messages_sent), 0) * 0.3 +
        ISNULL(SUM(um.exercises_completed), 0) * 0.4 +
        ISNULL(SUM(um.topics_mastered), 0) * 0.1
    ) as score
FROM users u
LEFT JOIN user_metrics um ON u.id = um.user_id
WHERE u.role = 'student' AND u.is_active = 1
GROUP BY u.id, u.username, u.full_name;
GO

-- =============================================
-- STORED PROCEDURES ÚTILES
-- =============================================

-- Procedimiento para limpiar caché expirado
IF OBJECT_ID('sp_clean_expired_cache', 'P') IS NOT NULL
    DROP PROCEDURE sp_clean_expired_cache;
GO

CREATE PROCEDURE sp_clean_expired_cache
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM cache_responses
    WHERE expires_at < GETDATE();

    SELECT @@ROWCOUNT as rows_deleted;
END
GO

-- Procedimiento para obtener estadísticas de caché
IF OBJECT_ID('sp_get_cache_stats', 'P') IS NOT NULL
    DROP PROCEDURE sp_get_cache_stats;
GO

CREATE PROCEDURE sp_get_cache_stats
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        COUNT(*) as total_entries,
        SUM(hit_count) as total_hits,
        SUM(tokens_saved * hit_count) as total_tokens_saved,
        AVG(CAST(hit_count AS FLOAT)) as avg_hits_per_entry
    FROM cache_responses;
END
GO

-- =============================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- =============================================

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Usuarios del sistema (estudiantes, profesores, administradores)',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'users';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Materias disponibles para estudio',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'subjects';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Conversaciones entre estudiantes y la IA',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'conversations';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Mensajes individuales en conversaciones',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'messages';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Métricas diarias de uso y progreso',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'user_metrics';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Caché de respuestas para optimización',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'cache_responses';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Registro de moderación de contenido',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'moderation_logs';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description', @value = N'Registro de auditoría para cumplimiento legal',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'audit_logs';
GO

-- =============================================
-- FIN DEL ESQUEMA
-- =============================================

PRINT '✅ Esquema de base de datos creado exitosamente para SQL Server';
GO
