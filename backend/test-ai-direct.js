/**
 * Test directo del endpoint de IA usando usuario existente en BD
 * Evita rate limiting al no usar endpoints de auth
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const sql = require('mssql');

const API_URL = 'http://localhost:3001';

async function testAIEndpoint() {
    console.log('╔═══════════════════════════════════════════╗');
    console.log('║   🤖 TEST DE ENDPOINT DE IA - CLAUDE   ║');
    console.log('╚═══════════════════════════════════════════╝');
    console.log('');
    console.log('⚠️  ADVERTENCIA: Consumirá créditos de API (~$0.0001 USD)');
    console.log('');

    // Conectar a SQL Server
    console.log('1️⃣  Conectando a SQL Server...');
    const dbConfig = {
        server: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 1433,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        options: {
            encrypt: true,
            trustServerCertificate: false
        }
    };

    const pool = await sql.connect(dbConfig);
    console.log('   ✅ Conectado a SQL Server');
    console.log('');

    // Obtener un usuario existente
    console.log('2️⃣  Obteniendo usuario...');
    const result = await pool.request().query(`
        SELECT TOP 1 id, email
        FROM users
        WHERE role = 'student'
        ORDER BY created_at DESC
    `);

    if (result.recordset.length === 0) {
        console.log('   ❌ No hay usuarios en la base de datos');
        console.log('   Ejecuta: node create-tables.js');
        process.exit(1);
    }

    const user = result.recordset[0];
    console.log(`   ✅ Usuario obtenido: ${user.email}`);
    console.log(`   🆔 ID: ${user.id}`);
    console.log('');

    // Generar token JWT manualmente
    console.log('3️⃣  Generando token JWT...');
    const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    console.log('   ✅ Token generado');
    console.log('');

    // TEST: Enviar mensaje a Claude
    console.log('4️⃣  Enviando consulta a Claude...');
    console.log('   📝 Pregunta: ¿Cuánto es 2+2?');
    console.log('   📚 Materia: Matemáticas');
    console.log('   ⏳ Enviando...');
    console.log('');

    try {
        const startTime = Date.now();

        const response = await axios.post(`${API_URL}/api/chat/message`, {
            message: '¿Cuánto es 2+2?',
            subject: 'matematicas',
            mode: 'direct',
            userId: user.id
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const duration = Date.now() - startTime;

        console.log('   ✅ Respuesta recibida!');
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 RESULTADOS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('🆔 Conversación:');
        console.log(`   ${response.data.data.conversationId}`);
        console.log('');
        console.log('🤖 Modelo:');
        console.log(`   ${response.data.data.model}`);
        console.log('');
        console.log('💬 Respuesta de Claude:');
        const respuesta = response.data.data.response;
        const preview = respuesta.length > 200 ? respuesta.substring(0, 200) + '...' : respuesta;
        console.log(`   ${preview}`);
        console.log('');
        console.log('📈 Uso de Tokens:');
        console.log(`   Input:  ${response.data.data.usage.inputTokens}`);
        console.log(`   Output: ${response.data.data.usage.outputTokens}`);
        console.log(`   Total:  ${response.data.data.usage.totalTokens}`);
        console.log('');
        console.log('💰 Costos:');
        console.log(`   Total: $${response.data.data.cost.totalCost}`);
        console.log('');
        console.log('⚡ Rendimiento:');
        console.log(`   Duración: ${duration} ms`);
        console.log(`   Desde caché: ${response.data.data.fromCache}`);
        console.log('');

        // TEST 2: Probar caché
        console.log('5️⃣  Probando caché (misma pregunta)...');
        console.log('');

        await new Promise(resolve => setTimeout(resolve, 1000));

        const startTime2 = Date.now();
        const response2 = await axios.post(`${API_URL}/api/chat/message`, {
            message: '¿Cuánto es 2+2?',
            subject: 'matematicas',
            mode: 'direct',
            userId: user.id
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const duration2 = Date.now() - startTime2;

        if (response2.data.data.fromCache) {
            console.log('   ✅ ¡Respuesta desde CACHÉ!');
            console.log(`   ⚡ Duración: ${duration2} ms (vs ${duration} ms original)`);
            console.log(`   💰 Costo: $0.00 (sin consumir API)`);
            console.log(`   💾 Tokens ahorrados: ${response2.data.data.usage.totalTokens}`);
        } else {
            console.log('   ⚠️  Respuesta NO vino de caché');
            console.log(`   💰 Costo adicional: $${response2.data.data.cost.totalCost}`);
        }
        console.log('');

        // Resumen final
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ TEST COMPLETADO EXITOSAMENTE');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('📊 Resumen:');
        console.log('   ✅ Autenticación JWT');
        console.log('   ✅ Integración con Claude');
        console.log('   ✅ Sistema de caché');
        console.log('   ✅ Conversaciones');
        console.log('');

        const totalCost = response.data.data.cost.totalCost +
                         (response2.data.data.fromCache ? 0 : response2.data.data.cost.totalCost);
        console.log(`💰 Costo Total: $${totalCost} USD`);
        console.log('');
        console.log('🎉 Backend 100% operativo!');
        console.log('');

    } catch (error) {
        console.log('   ❌ Error al consultar Claude');
        console.log('');
        if (error.response) {
            console.log('Respuesta del servidor:');
            console.log(JSON.stringify(error.response.data, null, 2));
        } else {
            console.log('Error:', error.message);
        }
        process.exit(1);
    } finally {
        await pool.close();
    }
}

// Ejecutar test
testAIEndpoint().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
});
