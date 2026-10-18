/**
 * Script para inicializar la base de datos
 * Ejecuta el schema completo de SQL Server
 */

require('dotenv').config();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

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
        requestTimeout: 60000
    }
};

async function initializeDatabase() {
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║   🚀 INICIALIZACIÓN DE BASE DE DATOS   ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    try {
        // Leer el archivo schema
        const schemaPath = path.join(__dirname, 'database', 'schema_sqlserver.sql');
        console.log('📄 Leyendo schema:', schemaPath);
        const schemaSQL = fs.readFileSync(schemaPath, 'utf8');

        // Conectar
        console.log('🔌 Conectando a SQL Server...');
        const pool = await sql.connect(config);
        console.log('✅ Conectado\n');

        // Dividir el schema en batches (separado por GO)
        const batches = schemaSQL
            .split(/\bGO\b/i)
            .map(batch => batch.trim())
            .filter(batch => batch.length > 0);

        console.log(`📋 Ejecutando ${batches.length} batches del schema...\n`);

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];

            // Saltar comentarios vacíos
            if (batch.startsWith('--') || batch.length < 10) {
                continue;
            }

            try {
                await pool.request().query(batch);
                successCount++;

                // Mostrar progreso cada 5 batches
                if ((i + 1) % 5 === 0) {
                    console.log(`   ⏳ Progreso: ${i + 1}/${batches.length} batches`);
                }
            } catch (error) {
                errorCount++;
                console.error(`   ⚠️ Error en batch ${i + 1}:`, error.message.substring(0, 100));

                // Si es un error de "ya existe", no es crítico
                if (error.message.includes('already exists') ||
                    error.message.includes('ya existe') ||
                    error.message.includes('Cannot drop')) {
                    console.log('      (No es crítico - objeto ya existe)');
                }
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ Batches exitosos: ${successCount}`);
        if (errorCount > 0) {
            console.log(`⚠️  Batches con errores: ${errorCount} (mayormente no críticos)`);
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Verificar tablas creadas
        console.log('🔍 Verificando tablas creadas:');
        const tablesResult = await pool.request().query(`
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
            AND TABLE_NAME NOT LIKE 'sysdac%'
            ORDER BY TABLE_NAME
        `);

        console.log(`   ✅ ${tablesResult.recordset.length} tablas encontradas:\n`);
        tablesResult.recordset.forEach(row => {
            console.log(`      ✓ ${row.TABLE_NAME}`);
        });

        // Verificar materias
        console.log('\n📚 Verificando materias precargadas:');
        try {
            const subjectsResult = await pool.request().query('SELECT COUNT(*) as count FROM subjects');
            const count = subjectsResult.recordset[0].count;
            console.log(`   ✅ ${count} materias encontradas`);

            if (count > 0) {
                const materiasResult = await pool.request().query('SELECT TOP 5 code, name FROM subjects ORDER BY id');
                console.log('\n   Primeras materias:');
                materiasResult.recordset.forEach(row => {
                    console.log(`      - ${row.code}: ${row.name}`);
                });
                console.log('      ...\n');
            }
        } catch (error) {
            console.error('   ⚠️ No se pudo verificar materias:', error.message);
        }

        await pool.close();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 INICIALIZACIÓN COMPLETADA');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n✅ La base de datos está lista para usar');
        console.log('🔄 Reinicia el servidor: npm run dev\n');

    } catch (error) {
        console.error('\n❌ Error crítico:', error.message);
        console.error('\nStack:', error.stack);
        process.exit(1);
    }
}

initializeDatabase();
