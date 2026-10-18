/**
 * DIAGNÓSTICO DE LA CADENA COMPLETA (solo lectura, no modifica nada)
 * Ejecutar: node diagnostico-cadena.js
 */
require('dotenv').config();

const results = [];
function ok(stage, detail) { results.push(['OK ', stage, detail]); }
function fail(stage, detail) { results.push(['FAIL', stage, detail]); }

async function testEnv() {
    const required = ['ANTHROPIC_API_KEY', 'JWT_SECRET', 'DB_HOST', 'DB_PASSWORD'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length) fail('ENV', 'faltan: ' + missing.join(','));
    else ok('ENV', 'todas las variables críticas presentes');
}

async function testSql() {
    try {
        const { query } = require('./src/config/database');
        const r = await query('SELECT COUNT(*) AS n FROM subjects WHERE is_active = 1');
        ok('SQL SERVER', `conectado, subjects activas = ${r.rows[0].n}`);
        const t = await query(`SELECT name FROM sys.tables ORDER BY name`);
        ok('SQL TABLAS', t.rows.map(x => x.name).join(', '));
    } catch (e) {
        fail('SQL SERVER', e.message);
    }
}

async function testRedis() {
    try {
        const redis = require('./src/config/redis');
        const client = await redis.connectRedis();
        if (!client) return fail('REDIS', 'connectRedis devolvió null');
        await redis.set('diag:test', { v: 1 }, 10);
        const got = await redis.get('diag:test');
        if (got && got.v === 1) ok('REDIS', 'set/get/serialización OK');
        else fail('REDIS', 'set/get no devolvió el valor');
        await redis.closeRedis();
    } catch (e) {
        fail('REDIS', e.message);
    }
}

async function testAnthropic() {
    try {
        const { getAnthropicClient, DEFAULT_MODEL } = require('./src/config/anthropic');
        const client = getAnthropicClient();
        if (!client) return fail('ANTHROPIC CLIENTE', 'getAnthropicClient() devolvió null');
        ok('ANTHROPIC CLIENTE', 'instanciado, modelo=' + DEFAULT_MODEL);

        const res = await client.messages.create({
            model: DEFAULT_MODEL,
            max_tokens: 16,
            system: 'Responde solo con la palabra: PONG',
            messages: [{ role: 'user', content: 'ping' }]
        });
        ok('ANTHROPIC API', `respuesta="${res.content?.[0]?.text}" tokens_in=${res.usage?.input_tokens} tokens_out=${res.usage?.output_tokens}`);
    } catch (e) {
        fail('ANTHROPIC API', `${e.status || ''} ${e.name}: ${e.message}`);
    }
}

async function testHistoryOrder() {
    // Reproduce prepareMessages con un historial que empieza en assistant
    try {
        const { prepareMessages } = require('./src/services/ai.service');
        const history = [
            { role: 'assistant', content: 'a1' },
            { role: 'user', content: 'u2' },
            { role: 'assistant', content: 'a2' },
            { role: 'user', content: 'u3' },
            { role: 'assistant', content: 'a3' }
        ];
        const msgs = prepareMessages(history, 'nueva pregunta');
        if (msgs[0].role !== 'user') {
            fail('PREPARE MESSAGES', `primer mensaje role="${msgs[0].role}" -> Anthropic exige "user" (400)`);
        } else {
            ok('PREPARE MESSAGES', 'primer mensaje es user');
        }
    } catch (e) {
        fail('PREPARE MESSAGES', e.message);
    }
}

(async () => {
    console.log('=== DIAGNÓSTICO CADENA IA EDUCATIVA ===\n');
    await testEnv();
    await testSql();
    await testRedis();
    await testAnthropic();
    await testHistoryOrder();

    console.log('');
    for (const [status, stage, detail] of results) {
        console.log(`[${status}] ${stage.padEnd(20)} ${detail}`);
    }
    console.log('');
    process.exit(0);
})();
