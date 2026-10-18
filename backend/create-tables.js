/**
 * Crear tablas manualmente - Ejecuta SQL específico
 */

// Forzar recarga de .env
delete require.cache[require.resolve('dotenv')];
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const sql = require('mssql');

console.log('🔍 DEBUG - Variables de entorno:');
console.log(`   DB_NAME: ${process.env.DB_NAME}`);
console.log(`   DB_HOST: ${process.env.DB_HOST}`);
console.log(`   DB_USER: ${process.env.DB_USER}\n`);

// FORZAR base de datos correcta
const DB_NAME_CORRECTO = 'ia_educativa';

const config = {
    server: process.env.DB_HOST || 'miservidorbr.database.windows.net',
    database: DB_NAME_CORRECTO, // FORZADO
    user: process.env.DB_USER || 'adminsoloverde',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 1433,
    options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true,
        connectionTimeout: 30000,
        requestTimeout: 60000
    }
};

console.log('⚠️  FORZANDO conexión a:', DB_NAME_CORRECTO, '\n');

async function createTablesManually() {
    console.log('🚀 Creando tablas manualmente...\n');
    console.log(`📍 Servidor: ${config.server}`);
    console.log(`🗄️  Base de datos: ${config.database}`);
    console.log(`👤 Usuario: ${config.user}\n`);

    try {
        const pool = await sql.connect(config);

        // Verificar que estamos en la BD correcta
        const dbCheck = await pool.request().query('SELECT DB_NAME() as current_db');
        console.log(`✅ Conectado a: ${dbCheck.recordset[0].current_db}\n`);

        if (dbCheck.recordset[0].current_db !== 'ia_educativa') {
            console.error('❌ ERROR: No estás conectado a ia_educativa');
            console.error(`   Estás en: ${dbCheck.recordset[0].current_db}`);
            process.exit(1);
        }

        // 1. Crear tabla users
        console.log('📋 Creando tabla users...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[users]') AND type in (N'U'))
            CREATE TABLE [dbo].[users] (
                id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                username VARCHAR(100) UNIQUE NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
                grade_level VARCHAR(50),
                institution VARCHAR(255),
                is_active BIT DEFAULT 1,
                is_verified BIT DEFAULT 0,
                parent_consent BIT DEFAULT 0,
                created_at DATETIME2 DEFAULT GETDATE(),
                updated_at DATETIME2 DEFAULT GETDATE(),
                last_login DATETIME2
            )
        `);
        console.log('✅ Tabla users creada\n');

        // Crear índices de users
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_email')
            CREATE INDEX idx_users_email ON users(email)
        `);
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_username')
            CREATE INDEX idx_users_username ON users(username)
        `);
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_users_role')
            CREATE INDEX idx_users_role ON users(role)
        `);

        // 2. Crear tabla subjects
        console.log('📋 Creando tabla subjects...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[subjects]') AND type in (N'U'))
            CREATE TABLE [dbo].[subjects] (
                id INT IDENTITY(1,1) PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                description NVARCHAR(MAX),
                emoji NVARCHAR(10),
                is_active BIT DEFAULT 1,
                created_at DATETIME2 DEFAULT GETDATE()
            )
        `);
        console.log('✅ Tabla subjects creada\n');

        // Insertar materias
        console.log('📚 Insertando materias...');
        const checkSubjects = await pool.request().query(`SELECT COUNT(*) as count FROM subjects`);
        if (checkSubjects.recordset[0].count === 0) {
            await pool.request().query(`
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
                ('icfes', N'Preparación ICFES', N'📝')
            `);
            console.log('✅ 13 materias insertadas\n');
        } else {
            console.log('ℹ️  Materias ya existentes\n');
        }

        // 3. Crear tabla conversations
        console.log('📋 Creando tabla conversations...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[conversations]') AND type in (N'U'))
            CREATE TABLE [dbo].[conversations] (
                id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                user_id UNIQUEIDENTIFIER NOT NULL,
                subject_id INT,
                title VARCHAR(255),
                mode VARCHAR(50) DEFAULT 'socratic' CHECK (mode IN ('socratic', 'direct', 'icfes', 'quiz')),
                started_at DATETIME2 DEFAULT GETDATE(),
                last_message_at DATETIME2 DEFAULT GETDATE(),
                is_active BIT DEFAULT 1,
                message_count INT DEFAULT 0,
                total_tokens INT DEFAULT 0,
                estimated_cost DECIMAL(10, 6) DEFAULT 0,
                CONSTRAINT FK_conversations_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                CONSTRAINT FK_conversations_subjects FOREIGN KEY (subject_id) REFERENCES subjects(id)
            )
        `);
        console.log('✅ Tabla conversations creada\n');

        // Índices de conversations
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_conversations_user')
            CREATE INDEX idx_conversations_user ON conversations(user_id)
        `);
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_conversations_subject')
            CREATE INDEX idx_conversations_subject ON conversations(subject_id)
        `);

        // 4. Crear tabla messages
        console.log('📋 Creando tabla messages...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[messages]') AND type in (N'U'))
            CREATE TABLE [dbo].[messages] (
                id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
                conversation_id UNIQUEIDENTIFIER NOT NULL,
                role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
                content NVARCHAR(MAX) NOT NULL,
                model VARCHAR(100),
                prompt_tokens INT,
                completion_tokens INT,
                total_tokens INT,
                cost DECIMAL(10, 6),
                created_at DATETIME2 DEFAULT GETDATE(),
                was_cached BIT DEFAULT 0,
                was_moderated BIT DEFAULT 0,
                moderation_passed BIT DEFAULT 1,
                CONSTRAINT FK_messages_conversations FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Tabla messages creada\n');

        // 5. Crear tabla user_metrics
        console.log('📋 Creando tabla user_metrics...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[user_metrics]') AND type in (N'U'))
            CREATE TABLE [dbo].[user_metrics] (
                id INT IDENTITY(1,1) PRIMARY KEY,
                user_id UNIQUEIDENTIFIER NOT NULL,
                date DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
                time_spent_minutes INT DEFAULT 0,
                messages_sent INT DEFAULT 0,
                conversations_started INT DEFAULT 0,
                exercises_completed INT DEFAULT 0,
                correct_answers INT DEFAULT 0,
                topics_mastered INT DEFAULT 0,
                tokens_used INT DEFAULT 0,
                api_calls INT DEFAULT 0,
                estimated_cost DECIMAL(10, 6) DEFAULT 0,
                updated_at DATETIME2 DEFAULT GETDATE(),
                CONSTRAINT FK_user_metrics_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                CONSTRAINT UQ_user_metrics_user_date UNIQUE(user_id, date)
            )
        `);
        console.log('✅ Tabla user_metrics creada\n');

        // 6. Crear tabla cache_responses
        console.log('📋 Creando tabla cache_responses...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[cache_responses]') AND type in (N'U'))
            CREATE TABLE [dbo].[cache_responses] (
                id INT IDENTITY(1,1) PRIMARY KEY,
                cache_key VARCHAR(255) UNIQUE NOT NULL,
                subject_id INT,
                question_hash VARCHAR(64) NOT NULL,
                response NVARCHAR(MAX) NOT NULL,
                hit_count INT DEFAULT 0,
                created_at DATETIME2 DEFAULT GETDATE(),
                last_used_at DATETIME2 DEFAULT GETDATE(),
                expires_at DATETIME2,
                model VARCHAR(100),
                tokens_saved INT DEFAULT 0,
                CONSTRAINT FK_cache_responses_subjects FOREIGN KEY (subject_id) REFERENCES subjects(id)
            )
        `);
        console.log('✅ Tabla cache_responses creada\n');

        // 7. Crear tabla moderation_logs
        console.log('📋 Creando tabla moderation_logs...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[moderation_logs]') AND type in (N'U'))
            CREATE TABLE [dbo].[moderation_logs] (
                id INT IDENTITY(1,1) PRIMARY KEY,
                user_id UNIQUEIDENTIFIER,
                message_id UNIQUEIDENTIFIER,
                content NVARCHAR(MAX) NOT NULL,
                flagged BIT DEFAULT 0,
                reason VARCHAR(255),
                categories NVARCHAR(MAX),
                action VARCHAR(50) CHECK (action IN ('allowed', 'blocked', 'warned', 'reviewed')),
                created_at DATETIME2 DEFAULT GETDATE(),
                CONSTRAINT FK_moderation_logs_users FOREIGN KEY (user_id) REFERENCES users(id),
                CONSTRAINT FK_moderation_logs_messages FOREIGN KEY (message_id) REFERENCES messages(id)
            )
        `);
        console.log('✅ Tabla moderation_logs creada\n');

        // 8. Crear tabla audit_logs
        console.log('📋 Creando tabla audit_logs...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[audit_logs]') AND type in (N'U'))
            CREATE TABLE [dbo].[audit_logs] (
                id INT IDENTITY(1,1) PRIMARY KEY,
                user_id UNIQUEIDENTIFIER,
                action VARCHAR(100) NOT NULL,
                resource VARCHAR(100),
                resource_id VARCHAR(255),
                details NVARCHAR(MAX),
                ip_address VARCHAR(45),
                user_agent NVARCHAR(MAX),
                created_at DATETIME2 DEFAULT GETDATE(),
                CONSTRAINT FK_audit_logs_users FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        console.log('✅ Tabla audit_logs creada\n');

        // Verificación final
        const tablesResult = await pool.request().query(`
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
            AND TABLE_NAME NOT LIKE 'sysdac%'
            ORDER BY TABLE_NAME
        `);

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ ${tablesResult.recordset.length} tablas creadas:\n`);
        tablesResult.recordset.forEach(row => {
            console.log(`   ✓ ${row.TABLE_NAME}`);
        });

        const subjectsCount = await pool.request().query('SELECT COUNT(*) as count FROM subjects');
        console.log(`\n📚 ${subjectsCount.recordset[0].count} materias disponibles`);

        await pool.close();

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 BASE DE DATOS INICIALIZADA EXITOSAMENTE');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createTablesManually();
