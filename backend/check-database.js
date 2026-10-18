/**
 * Script para verificar el estado de la base de datos
 */

require('dotenv').config();
const sql = require('mssql');

const config = {
    server: process.env.DB_HOST || 'miservidorbr.database.windows.net',
    database: process.env.DB_NAME || 'ia_educativa',
    user: process.env.DB_USER || 'adminsoloverde',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 1433,
    options: {
        encrypt: true,
        trustServerCertificate: false,
        enableArithAbort: true,
        connectionTimeout: 30000,
        requestTimeout: 30000
    }
};

async function checkDatabase() {
    console.log('🔍 Verificando estado de la base de datos...\n');

    try {
        const pool = await sql.connect(config);

        // Verificar tablas existentes
        console.log('📋 Verificando tablas existentes:');
        const tablesResult = await pool.request().query(`
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `);

        if (tablesResult.recordset.length === 0) {
            console.log('   ❌ No se encontraron tablas');
            console.log('\n⚠️  La base de datos existe pero está vacía');
            console.log('📝 Necesitas ejecutar: database/schema_sqlserver.sql\n');
        } else {
            console.log(`   ✅ ${tablesResult.recordset.length} tablas encontradas:\n`);
            tablesResult.recordset.forEach(row => {
                console.log(`      - ${row.TABLE_NAME}`);
            });

            // Si existe la tabla subjects, verificar materias
            const hasSubjects = tablesResult.recordset.some(row => row.TABLE_NAME === 'subjects');
            if (hasSubjects) {
                console.log('\n📚 Verificando materias precargadas:');
                const subjectsResult = await pool.request().query('SELECT COUNT(*) as count FROM subjects');
                const count = subjectsResult.recordset[0].count;
                console.log(`   ✅ ${count} materias encontradas`);

                if (count > 0) {
                    const materiasResult = await pool.request().query('SELECT code, name FROM subjects ORDER BY id');
                    console.log('\n   Materias:');
                    materiasResult.recordset.forEach(row => {
                        console.log(`      - ${row.code}: ${row.name}`);
                    });
                }
            }
        }

        await pool.close();

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkDatabase();
