-- =============================================
-- MIGRACIÓN PROPUESTA (NO APLICADA): ASIGNACIÓN PROFESOR-ESTUDIANTE
-- =============================================
-- PROPÓSITO
--   Habilitar la política "un profesor solo puede consultar las métricas de
--   estudiantes que tenga ASIGNADOS mediante una relación verificable en BD".
--
-- ESTADO
--   Este archivo es una PROPUESTA de esquema. NO se ha ejecutado en ninguna
--   base de datos (ni local ni RDS). Mientras no se aplique:
--     - El backend DENIEGA (403) las consultas de métricas ajenas de un
--       teacher (ver src/controllers/metrics.controller.js).
--     - El flujo del tutor NO se ve afectado: no usa estas tablas.
--
-- POR QUÉ NO SE USA users.institution
--   `institution` es un VARCHAR libre que el propio alumno escribe al
--   registrarse. Un alumno podría escribir la institución de otro y obtener
--   acceso. No es una relación verificable ni autoritativa.
--
-- IDEMPOTENTE: solo crea tablas/índices nuevos. No modifica ni borra datos.
-- COMPATIBLE: Microsoft SQL Server (Azure SQL / RDS SQL Server).
-- =============================================

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- TABLA: teacher_students
-- Asignación explícita alumno -> profesor.
-- Un par (teacher_id, student_id) es único: evita duplicados.
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[teacher_students]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[teacher_students] (
        id          INT IDENTITY(1,1) PRIMARY KEY,

        teacher_id  UNIQUEIDENTIFIER NOT NULL,
        student_id  UNIQUEIDENTIFIER NOT NULL,

        -- Trazabilidad de la asignación (quién la creó y cuándo)
        assigned_by UNIQUEIDENTIFIER NULL,
        assigned_at DATETIME2 DEFAULT GETDATE(),

        -- Baja lógica: permite revocar sin perder historial de auditoría
        is_active   BIT DEFAULT 1,
        revoked_at  DATETIME2 NULL,

        CONSTRAINT FK_teacher_students_teacher
            FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT FK_teacher_students_student
            FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT FK_teacher_students_assigned_by
            FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,

        -- Un alumno no puede asignarse a sí mismo como profesor
        CONSTRAINT CK_teacher_students_distintos CHECK (teacher_id <> student_id)
    );

    -- Un alumno tiene, como mucho, UNA asignación activa por profesor.
    -- (Índice único filtrado: admite historial de altas/bajas.)
    CREATE UNIQUE INDEX ux_teacher_students_activa
        ON teacher_students(teacher_id, student_id)
        WHERE is_active = 1;

    CREATE INDEX idx_teacher_students_teacher ON teacher_students(teacher_id, is_active);
    CREATE INDEX idx_teacher_students_student ON teacher_students(student_id, is_active);
END
GO

-- =============================================
-- CONSULTA DE AUTORIZACIÓN (la que usaría el backend al habilitarla)
-- =============================================
-- Un teacher obtiene 1 fila solo si el alumno está activo y asignado:
--
--   SELECT 1
--   FROM teacher_students ts
--   JOIN users u ON u.id = ts.teacher_id AND u.role = 'teacher' AND u.is_active = 1
--   WHERE ts.teacher_id = @param1      -- profesor (del JWT verificado)
--     AND ts.student_id = @param2      -- alumno solicitado
--     AND ts.is_active  = 1;
-- =============================================

PRINT 'Migración teacher_students PREPARADA. No se habilita acceso hasta aplicarla y actualizar el controlador.';
GO
