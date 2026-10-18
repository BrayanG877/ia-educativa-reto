-- =============================================
-- PASO 1: CREAR BASE DE DATOS
-- Ejecutar este script primero en Azure Portal
-- conectado a la base de datos 'master'
-- =============================================

-- Crear base de datos si no existe
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'ia_educativa')
BEGIN
    CREATE DATABASE ia_educativa;
    PRINT '✅ Base de datos ia_educativa creada exitosamente';
END
ELSE
BEGIN
    PRINT 'ℹ️ La base de datos ia_educativa ya existe';
END
GO

-- Configurar opciones de la base de datos
ALTER DATABASE ia_educativa SET RECOVERY SIMPLE;
GO

PRINT '✅ Base de datos configurada y lista para usar';
PRINT 'Siguiente paso: Ejecutar schema_sqlserver.sql en la base de datos ia_educativa';
GO
