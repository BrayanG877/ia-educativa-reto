-- =============================================
-- MIGRACIÓN: PANEL DOCENTE Y ANALÍTICA DE APRENDIZAJE
-- =============================================
-- Crea SOLO estructuras nuevas. NO modifica ni borra datos existentes.
-- Idempotente: puede ejecutarse varias veces sin efecto secundario.
-- Compatible con Microsoft SQL Server (Azure SQL / RDS SQL Server).
--
-- PROPÓSITO
--   Permitir que un profesor vea únicamente los estudiantes de LOS GRUPOS
--   que tiene asignados PARA SU ASIGNATURA. Sin esta relación, el backend
--   deniega (403) cualquier consulta de analítica ajena.
--
-- PRIVACIDAD (menores de edad)
--   - No se guarda texto de conversaciones.
--   - Los eventos de aprendizaje son estructurados y minimizados.
--   - Se distingue inferencia (needs_more_evidence=1) de dominio confirmado.
--
-- ORDEN DE APLICACIÓN: después de schema_sqlserver.sql y migration_agent.sql.
-- =============================================
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- =============================================
-- TABLA: class_groups
-- Grupo/curso real (p. ej. "Grado 7.º · Grupo 701"-- Sustituye el uso de users.grade_level (texto libre, no verificable)
-- como fuente de autorización. users.grade_level se conserva por
-- compatibilidad, pero NO se usa para decidir permisos.
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[class_groups]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[class_groups] (
        id           INT IDENTITY(1,1) PRIMARY KEY,
        code         VARCHAR(50)  NOT NULL UNIQUE,   -- '701', '1002'
        name         VARCHAR(120) NOT NULL,          -- 'Grupo 701'
        grade_level  VARCHAR(20)  NOT NULL,          -- '7', '10'
        institution  VARCHAR(255) NULL,
        academic_year INT         NULL,              -- 2026
        is_active    BIT          NOT NULL DEFAULT 1,
        is_demo      BIT          NOT NULL DEFAULT 0,-- datos sintéticos de demostración
        created_at   DATETIME2    DEFAULT GETDATE()
    );
    CREATE INDEX idx_class_groups_grade ON class_groups(grade_level, is_active);
END
GO

-- =============================================
-- TABLA: teacher_assignments
-- Asignación explícita (profesor, asignatura, grupo).
-- Es la ÚNICA fuente de verdad de autorización del panel docente.
--
-- Una fila = "este profesor imparte ESTA asignatura en ESTE grupo".
-- Un profesor puede tener varias filas (varios grupos y/o asignaturas),
-- pero solo verá datos que cumplan simultáneamente asignatura y grupo.
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[teacher_assignments]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[teacher_assignments] (
        id            INT IDENTITY(1,1) PRIMARY KEY,
        teacher_id    UNIQUEIDENTIFIER NOT NULL,
        subject_code  VARCHAR(50)  NOT NULL,
        group_id      INT          NOT NULL,
        assigned_by   UNIQUEIDENTIFIER NULL,
        assigned_at   DATETIME2    DEFAULT GETDATE(),
        is_active     BIT          NOT NULL DEFAULT 1,
        revoked_at    DATETIME2    NULL,
        CONSTRAINT FK_teacher_assignments_teacher
            FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT FK_teacher_assignments_group
            FOREIGN KEY (group_id)   REFERENCES class_groups(id) ON DELETE CASCADE,
        CONSTRAINT FK_teacher_assignments_assigned_by
            FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
    );
    -- Un profesor no puede tener duplicada la misma asignatura en el mismo grupo.
    CREATE UNIQUE INDEX ux_teacher_assignments_activa
        ON teacher_assignments(teacher_id, subject_code, group_id)
        WHERE is_active = 1;
    CREATE INDEX idx_teacher_assignments_teacher
        ON teacher_assignments(teacher_id, is_active);
    CREATE INDEX idx_teacher_assignments_group
        ON teacher_assignments(group_id, subject_code, is_active);
END
GO

-- =============================================
-- TABLA: group_enrollments
-- Matrícula explícita de un estudiante en un grupo.
-- La autorización del profesor se deriva de aquí:
--   teacher_assignments(group_id, subject_code)  JOIN  group_enrollments(group_id)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[group_enrollments]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[group_enrollments] (
        id           INT IDENTITY(1,1) PRIMARY KEY,
        group_id     INT            NOT NULL,
        student_id   UNIQUEIDENTIFIER NOT NULL,
        enrolled_at  DATETIME2      DEFAULT GETDATE(),
        is_active    BIT            NOT NULL DEFAULT 1,
        CONSTRAINT FK_group_enrollments_group
            FOREIGN KEY (group_id)   REFERENCES class_groups(id) ON DELETE CASCADE,
        CONSTRAINT FK_group_enrollments_student
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX ux_group_enrollments_activa
        ON group_enrollments(group_id, student_id)
        WHERE is_active = 1;
    CREATE INDEX idx_group_enrollments_group
        ON group_enrollments(group_id, is_active);
    CREATE INDEX idx_group_enrollments_student
        ON group_enrollments(student_id, is_active);
END
GO

-- =============================================
-- TABLA: learning_events
-- Evento estructurado de aprendizaje por turno pedagógico.
-- Es la base de TODOS los indicadores del panel docente.
--
-- Cada fila responde a: quién, en qué materia, de qué grupo, sobre qué
-- tema, qué acción pedagógica, con qué resultado y con cuánta confianza.
--
-- No contiene texto libre de la conversación: `topic` y `concept` son
-- etiquetas cortas (máx. 255) y `evidence` es una descripción factual corta.
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[learning_events]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[learning_events] (
        id              BIGINT IDENTITY(1,1) PRIMARY KEY,
        user_id         UNIQUEIDENTIFIER NOT NULL,          -- estudiante
        group_id        INT NULL,                            -- grupo al registrar
        conversation_id UNIQUEIDENTIFIER NULL,
        session_ref     VARCHAR(64)  NOT NULL,

        -- Contexto académico
        subject_code    VARCHAR(50)  NOT NULL,               -- 'matematicas'
        topic           VARCHAR(255) NULL,                   -- 'Ecuaciones de primer grado'
        concept         VARCHAR(255) NULL,                   -- 'Transposición de términos'

        -- Fase del ciclo pedagógico
        -- diagnostic | teach | practice | evaluate | detect_difficulty | adapt
        phase           VARCHAR(30)  NOT NULL,
        -- Acción concreta del agente (guided_question, practice, evaluate...)
        action          VARCHAR(50)  NOT NULL,

        -- Nivel de ayuda que necesitó el estudiante en este turno
        -- none | hint | guided | revealed
        help_level      VARCHAR(20)  DEFAULT 'none',
        hints_given     INT          DEFAULT 0,
        attempts        INT          DEFAULT 0,

        -- Resultado observable del turno
        -- correct | correct_with_help | incorrect | explained | not_evaluated
        outcome         VARCHAR(30)  DEFAULT 'not_evaluated',
        -- Tipo de error, cuando el resultado no fue correcto
        -- conceptual | procedural | careless | incomplete | not_understood
        error_type      VARCHAR(50)  NULL,
        -- Evidencia factual corta (sin texto de la conversación)
        evidence        NVARCHAR(1000) NULL,

        -- Procedencia y confianza de la inferencia
        source          VARCHAR(30)  DEFAULT 'agent_rules',  -- agent_rules | llm | teacher
        confidence      DECIMAL(3,2) NULL,                   -- 0.00 – 1.00
        -- 1 = hipótesis (falta evidencia) | 0 = dominio/evaluación confirmada
        needs_more_evidence BIT      NOT NULL DEFAULT 1,

        -- Trazabilidad del proveedor de IA (sin claves)
        provider        VARCHAR(50)  NULL,
        model           VARCHAR(100) NULL,
        fallback_from   VARCHAR(50)  NULL,

        -- Contexto de la actividad
        activity_type   VARCHAR(50)  NULL,                   -- chat | quiz | icfes | tools
        duration_ms     INT          NULL,
        is_demo         BIT          NOT NULL DEFAULT 0,
        created_at      DATETIME2    DEFAULT GETDATE(),

        CONSTRAINT FK_learning_events_users
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT FK_learning_events_group
            FOREIGN KEY (group_id) REFERENCES class_groups(id) ON DELETE SET NULL
    );
    CREATE INDEX idx_learning_events_user_time
        ON learning_events(user_id, created_at DESC);
    CREATE INDEX idx_learning_events_group_subject
        ON learning_events(group_id, subject_code, created_at DESC);
    CREATE INDEX idx_learning_events_topic
        ON learning_events(subject_code, topic);
    CREATE INDEX idx_learning_events_outcome
        ON learning_events(outcome, needs_more_evidence);
END
GO

PRINT 'Migración de panel docente completada: class_groups, teacher_assignments, group_enrollments, learning_events';
GO

-- =============================================
-- COLUMNA: users.primary_subject
-- Asignatura principal declarada por un usuario con rol 'teacher'.
-- Es un DATO DE PERFIL, NO una autorización: el acceso a grupos se decide
-- exclusivamente con teacher_assignments. Se usa para precargar el formulario.
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[users]') AND name = N'primary_subject')
BEGIN
    ALTER TABLE [dbo].[users] ADD primary_subject VARCHAR(50) NULL;
END
GO

-- =============================================
-- TABLA: curriculum_topics
-- Catálogo canónico de temas por asignatura.
-- Permite clasificar cada evento de aprendizaje en un tema verificable
-- en lugar de aceptar texto libre del modelo o del cliente.
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[curriculum_topics]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[curriculum_topics] (
        id           INT IDENTITY(1,1) PRIMARY KEY,
        subject_code VARCHAR(50)  NOT NULL,
        topic        VARCHAR(255) NOT NULL,
        concept      VARCHAR(255) NULL,
        grade_level  VARCHAR(20)  NULL,
        -- Palabras clave para clasificar el mensaje del estudiante (minúsculas,
        -- separadas por coma). NO se usa IA para esto: regla reproducible.
        keywords     NVARCHAR(500) NULL,
        is_active    BIT          NOT NULL DEFAULT 1,
        CONSTRAINT UQ_curriculum_topics UNIQUE (subject_code, topic)
    );
    CREATE INDEX idx_curriculum_topics_subject
        ON curriculum_topics(subject_code, is_active);
END
GO

-- Catálogo inicial de Matemáticas (grado 7.º). Idempotente.
IF NOT EXISTS (SELECT 1 FROM curriculum_topics WHERE subject_code = 'matematicas')
BEGIN
    INSERT INTO curriculum_topics (subject_code, topic, concept, grade_level, keywords) VALUES
    ('matematicas', N'Ecuaciones de primer grado', N'Transposición de términos', '7',
     N'ecuacion,ecuaciones,incognita,despejar,x=,igualdad,transponer'),
    ('matematicas', N'Operaciones con fracciones', N'Suma y resta de fracciones', '7',
     N'fraccion,fracciones,numerador,denominador,mcm,denominador comun'),
    ('matematicas', N'Fracciones equivalentes', N'Relación numerador-denominador', '7',
     N'equivalente,equivalentes,simplificar,amplificar,simplificacion'),
    ('matematicas', N'Proporcionalidad', N'Regla de tres', '7',
     N'proporcion,proporcionalidad,regla de tres,razon,escala'),
    ('matematicas', N'Números enteros', N'Operaciones con signos', '7',
     N'entero,enteros,negativo,negativos,signo,opuesto,valor absoluto'),
    ('matematicas', N'Potenciación y radicación', N'Propiedades de potencias', '7',
     N'potencia,potencias,exponente,raiz,radicacion,cuadrado'),
    ('matematicas', N'Porcentajes', N'Cálculo de porcentajes', '7',
     N'porcentaje,porcentajes,descuento,aumento,tanto por ciento'),
    ('matematicas', N'Geometría: perímetro y área', N'Figuras planas', '7',
     N'perimetro,area,figura,triangulo,rectangulo,circulo'),
    ('matematicas', N'Estadística descriptiva', N'Media, mediana y moda', '7',
     N'media,mediana,moda,estadistica,promedio,tabla de datos'),
    ('matematicas', N'Funciones lineales', N'Pendiente e intercepto', '9',
     N'funcion,lineal,pendiente,intercepto,recta,grafica');
END
GO

PRINT 'Catálogo de temas y columna primary_subject listos.';
GO
