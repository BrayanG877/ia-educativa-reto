/**
 * Crear usuario de prueba - camilamiamor@gmail.com
 * Script para crear usuario específico en la base de datos
 */

require('dotenv').config();
const sql = require('mssql');
const bcrypt = require('bcryptjs');

const config = {
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true
    }
};

async function createTestUser() {
    let pool;

    try {
        console.log('🔐 Creando usuario de prueba...\n');

        // Conectar a SQL Server
        pool = await sql.connect(config);
        console.log('✅ Conectado a SQL Server');

        // Datos del usuario
        const email = 'camilamiamor@gmail.com';
        const password = '2804';
        const nombre = 'Camila';

        // Verificar si el usuario ya existe
        const checkResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT id, email FROM users WHERE email = @email');

        if (checkResult.recordset.length > 0) {
            console.log('⚠️  Usuario ya existe, actualizando contraseña...');

            // Hash de la contraseña
            const passwordHash = await bcrypt.hash(password, 10);

            // Actualizar contraseña
            await pool.request()
                .input('email', sql.NVarChar, email)
                .input('passwordHash', sql.NVarChar, passwordHash)
                .query('UPDATE users SET password_hash = @passwordHash WHERE email = @email');

            console.log('✅ Contraseña actualizada');
            console.log(`\n📧 Email: ${email}`);
            console.log(`🔑 Contraseña: ${password}`);
            console.log(`👤 User ID: ${checkResult.recordset[0].id}\n`);

        } else {
            console.log('📝 Creando nuevo usuario...');

            // Hash de la contraseña
            const passwordHash = await bcrypt.hash(password, 10);

            // Crear usuario
            const insertResult = await pool.request()
                .input('email', sql.NVarChar, email)
                .input('passwordHash', sql.NVarChar, passwordHash)
                .input('username', sql.NVarChar, email.split('@')[0])
                .input('fullName', sql.NVarChar, nombre)
                .input('role', sql.NVarChar, 'student')
                .query(`
                    INSERT INTO users (email, password_hash, username, full_name, role, is_active)
                    OUTPUT INSERTED.id
                    VALUES (@email, @passwordHash, @username, @fullName, @role, 1)
                `);

            const userId = insertResult.recordset[0].id;

            console.log('✅ Usuario creado exitosamente');
            console.log(`\n📧 Email: ${email}`);
            console.log(`🔑 Contraseña: ${password}`);
            console.log(`👤 User ID: ${userId}\n`);
        }

        console.log('✅ Listo para pruebas!\n');
        console.log('Puedes usar estas credenciales para:');
        console.log('  - Login: POST /api/auth/login');
        console.log('  - Endpoints protegidos con JWT\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

createTestUser();
