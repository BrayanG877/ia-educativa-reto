-- =============================================
-- MIGRACIÓN: AGENTE IA-EDUCATIVA TUTOR (Fase 1)
-- =============================================
-- Crea SOLO tablas nuevas. NO modifica ni borra tablas existentes.
-- Idempotente: puede ejecutarse varias veces sin efecto secundario.
-- Compatible con Microsoft SQL Server (Azure SQL / RDS).
--
-- Diseño de privacidad (menores de edad):
--  - No se guarda el texto completo de las conversaciones aquí.
--  - Se usan identificadores seudonimizados de sesión (session_ref).
--  - Las evidencias son estructuradas (acción, resultado, métrica), no frases libres.
-- =============================================

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- TABLA: agent_evidence
-- Registro estructurado y verificable de CADA acción del agente tutor.
-- Cada indicador del panel se calcula a partir de filas de esta tabla.
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[agent_evidence]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[agent_evidence] (
        id            BIGINT IDENTITY(1,1) PRIMARY KEY,

        -- Vínculo con la conversación existente (opcional: puede haber evidencia sin chat guardado)
        conversation_id UNIQUEIDENTIFIER NULL,
        user_id         UNIQUEIDENTIFIER NULL,

        -- Seudónimo de sesión: permite agrupar evidencias de una misma sesión
        -- sin exponer el user_id en el panel. NO es reversible a datos personales.
        session_ref   VARCHAR(64)  NOT NULL,

        -- Contexto pedagógico
        subject_code  VARCHAR(50)  NULL,     -- 'matematicas', 'biologia', ...
        competence    VARCHAR(255) NULL,     -- competencia o concepto trabajado
        mode          VARCHAR(50)  NULL,     -- socratic | direct | icfes | quiz

        -- QUÉ HIZO EL AGENTE (acción pedagógica observada)
        -- diagnostic | guided_question | graded_hint | teach | practice |
        -- evaluate | detect_difficulty | recommend | adapt | reveal_solution
        action        VARCHAR(50)  NOT NULL,

        -- EVIDENCIA OBSERVADA (minimizada, sin texto libre de la conversación)
        -- Ej: "student_answer_matched_expected=false", "attempts=2"
        evidence      NVARCHAR(1000) NULL,

        -- RESULTADO OBJETIVO de la acción, cuando aplica
        -- correct | incorrect | partial | neutral | not_evaluated
        outcome       VARCHAR(30)  NULL,

        -- Se puede medir mejora? (intento previo comparable vs actual)
        measured_improvement BIT DEFAULT 0,

        -- Recomendación / siguiente paso sugerido (texto corto, no la conversación)
        next_step     NVARCHAR(500) NULL,

        -- Estado de la operación registrada
        -- recorded | failed | pending
        status        VARCHAR(20)  NOT NULL DEFAULT 'recorded',

        -- Trazabilidad del proveedor de IA (sin claves): proveedor + modelo
        provider      VARCHAR(50)  NULL,
        model         VARCHAR(100) NULL,
        fallback_from VARCHAR(50)  NULL,   -- si hubo respaldo, el proveedor original

        created_at    DATETIME2 DEFAULT GETDATE(),

        CONSTRAINT FK_agent_evidence_users
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX idx_agent_evidence_session ON agent_evidence(session_ref);
    CREATE INDEX idx_agent_evidence_user ON agent_evidence(user_id);
    CREATE INDEX idx_agent_evidence_action ON agent_evidence(action);
    CREATE INDEX idx_agent_evidence_created ON agent_evidence(created_at);
END
GO

-- =============================================
-- TABLA: agent_difficulties
-- Dificultades detectadas por el agente a partir de evidencias.
-- Distingue HIPÓTESIS (needs_more_evidence=1) de CONFIRMADA (0).
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[agent_difficulties]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[agent_difficulties] (
        id            BIGINT IDENTITY(1,1) PRIMARY KEY,

        user_id       UNIQUEIDENTIFIER NULL,
        session_ref   VARCHAR(64)  NOT NULL,

        -- Área / competencia
        subject_code  VARCHAR(50)  NULL,
        competence    VARCHAR(255) NULL,

        -- Evidencia observada que sustenta el diagnóstico
        evidence      NVARCHAR(1000) NULL,

        -- Tipo de error identificado
        -- conceptual | procedural | careless | incomplete | not_understood
        error_type    VARCHAR(50)  NULL,

        -- Hipótesis vs confirmada
        needs_more_evidence BIT DEFAULT 1,
        confidence    DECIMAL(3,2) NULL,   -- 0.00 a 1.00

        -- Recomendación pedagógica y ejercicio de verificación
        recommendation NVARCHAR(500) NULL,
        suggested_exercise NVARCHAR(500) NULL,

        -- Estado del refuerzo
        -- open | reinforced | resolved
        status        VARCHAR(20) DEFAULT 'open',

        created_at    DATETIME2 DEFAULT GETDATE(),
        updated_at    DATETIME2 DEFAULT GETDATE(),

        CONSTRAINT FK_agent_difficulties_users
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX idx_agent_diff_user ON agent_difficulties(user_id);
    CREATE INDEX idx_agent_diff_status ON agent_difficulties(status);
    CREATE INDEX idx_agent_diff_subject ON agent_difficulties(subject_code);
END
GO

PRINT 'Migración del agente completada: agent_evidence + agent_difficulties';
GO
