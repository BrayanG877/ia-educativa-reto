/**
 * Script para LIMPIAR y RE-INICIALIZAR la base de datos
 * ADVERTENCIA: Esto eliminará TODAS las tablas existentes
 */

require('dotenv').config();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

async function cleanAndInitialize() {
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║   ⚠️  LIMPIEZA E INICIALIZACIÓN BD    ║');
    console.log('╚═══════════════════════════════════════════╝\n');
    console.log('⚠️  ADVERTENCIA: Esto eliminará todas las tablas existentes\n');

    try {
        console.log('🔌 Conectando a SQL Server...');
        const pool = await sql.connect(config);
        console.log('✅ Conectado\n');

        // Paso 1: Eliminar todas las tablas existentes
        console.log('🗑️  Paso 1: Eliminando tablas existentes...\n');

        // Eliminar en orden inverso por dependencias
        const tablesToDrop = [
            'audit_logs',
            'moderation_logs',
            'messages',
            'conversations',
            'user_metrics',
            'cache_responses',
            'users',
            'Users', // Por si existe con mayúscula
            'subjects'
        ];

        for (const table of tablesToDrop) {
            try {
                await pool.request().query(`
                    IF OBJECT_ID('${table}', 'U') IS NOT NULL
                    DROP TABLE ${table}
                `);
                console.log(`   ✓ Eliminada: ${table}`);
            } catch (error) {
                // Ignorar errores si la tabla no existe
                if (!error.message.includes('does not exist')) {
                    console.log(`   ⚠️ ${table}: ${error.message.substring(0, 50)}`);
                }
            }
        }

        // Eliminar vistas
        console.log('\n🗑️  Eliminando vistas...');
        const viewsToDrop = ['student_ranking', 'user_statistics'];
        for (const view of viewsToDrop) {
            try {
                await pool.request().query(`
                    IF OBJECT_ID('${view}', 'V') IS NOT NULL
                    DROP VIEW ${view}
                `);
                console.log(`   ✓ Eliminada vista: ${view}`);
            } catch (error) {
                // Ignorar
            }
        }

        // Eliminar stored procedures
        console.log('\n🗑️  Eliminando stored procedures...');
        const procsToDrop = ['sp_clean_expired_cache', 'sp_get_cache_stats'];
        for (const proc of procsToDrop) {
            try {
                await pool.request().query(`
                    IF OBJECT_ID('${proc}', 'P') IS NOT NULL
                    DROP PROCEDURE ${proc}
                `);
                console.log(`   ✓ Eliminado SP: ${proc}`);
            } catch (error) {
                // Ignorar
            }
        }

        console.log('\n✅ Limpieza completada\n');

        // Paso 2: Ejecutar el schema completo
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🚀 Paso 2: Ejecutando schema completo...\n');

        const schemaPath = path.join(__dirname, 'database', 'schema_sqlserver.sql');
        const schemaSQL = fs.readFileSync(schemaPath, 'utf8');

        const batches = schemaSQL
            .split(/\bGO\b/i)
            .map(batch => batch.trim())
            .filter(batch => batch.length > 10 && !batch.startsWith('--'));

        console.log(`📋 Ejecutando ${batches.length} batches...\n`);

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];

            try {
                await pool.request().query(batch);
                successCount++;

                if ((i + 1) % 3 === 0) {
                    console.log(`   ⏳ Progreso: ${i + 1}/${batches.length}`);
                }
            } catch (error) {
                errorCount++;

                // Solo mostrar errores críticos
                if (!error.message.includes('already exists') &&
                    !error.message.includes('Cannot drop')) {
                    console.error(`   ⚠️ Batch ${i + 1}: ${error.message.substring(0, 100)}`);
                }
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ Batches exitosos: ${successCount}`);
        if (errorCount > 0) {
            console.log(`⚠️  Errores: ${errorCount} (ignorados si no críticos)`);
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Paso 3: Verificación final
        console.log('🔍 Paso 3: Verificación final...\n');

        const tablesResult = await pool.request().query(`
            SELECT TABLE_NAME
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
            AND TABLE_NAME NOT LIKE 'sysdac%'
            ORDER BY TABLE_NAME
        `);

        console.log(`   ✅ ${tablesResult.recordset.length} tablas creadas:\n`);
        tablesResult.recordset.forEach(row => {
            console.log(`      ✓ ${row.TABLE_NAME}`);
        });

        // Verificar materias
        console.log('\n📚 Verificando materias precargadas:');
        const subjectsResult = await pool.request().query('SELECT COUNT(*) as count FROM subjects');
        const count = subjectsResult.recordset[0].count;
        console.log(`   ✅ ${count} materias insertadas\n`);

        if (count > 0) {
            const materiasResult = await pool.request().query('SELECT code, name, emoji FROM subjects ORDER BY id');
            console.log('   Materias disponibles:');
            materiasResult.recordset.forEach((row, i) => {
                console.log(`      ${i+1}. ${row.emoji} ${row.name} (${row.code})`);
            });
        }

        await pool.close();

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 INICIALIZACIÓN EXITOSA');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n✅ La base de datos está lista');
        console.log('🔄 El servidor se reiniciará automáticamente\n');

    } catch (error) {
        console.error('\n❌ Error crítico:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

cleanAndInitialize();
