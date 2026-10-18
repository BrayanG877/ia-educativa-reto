/**
 * PRUEBAS DE AISLAMIENTO (hermeticidad).
 * Demuestran que, bajo el preload _setup.js:
 *   1) Los proveedores responden mediante mocks (fetch simulado).
 *   2) Las operaciones de caché NO abren conexión real (Redis/BD simulados).
 *   3) Las operaciones de base de datos NO abren conexión real.
 *   4) Un intento accidental de conexión real HACE FALLAR la prueba.
 *
 * No se ejecuta ninguna conexión real: las guardias lanzan de inmediato.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

// ------------------------------------------------------------------
// 1. La guardia de fetch lanza ante una llamada real.
// ------------------------------------------------------------------
test('aislamiento: global.fetch real está bloqueado (lanza)', async () => {
    await assert.rejects(
        async () => global.fetch('https://api.groq.com/openai/v1/models'),
        (e) => /AISLAMIENTO/.test(e.message)
    );
});

// ------------------------------------------------------------------
// 2. Un proveedor funciona con fetch SIMULADO (sin red real).
// ------------------------------------------------------------------
test('aislamiento: un proveedor responde mediante fetch simulado', async () => {
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    process.env.GROQ_API_KEY = 'dummy';

    let urlLlamada = null;
    await aislar.instalarFetchMock(async (url) => {
        urlLlamada = url;
        return {
            status: 200,
            headers: { get: () => null },
            json: async () => ({
                choices: [{ message: { content: 'respuesta simulada' } }],
                usage: { prompt_tokens: 1, completion_tokens: 2 }
            })
        };
    }, async () => {
        const r = await aiProviders.PROVIDERS.groq.completion({
            system: 's', messages: [{ role: 'user', content: 'x' }]
        });
        assert.strictEqual(r.text, 'respuesta simulada');
    });

    assert.strictEqual(urlLlamada, 'https://api.groq.com/openai/v1/chat/completions');
    // Al salir del mock, la guardia vuelve a estar activa.
    await assert.rejects(async () => global.fetch('https://example.com'), /AISLAMIENTO/);
});

// ------------------------------------------------------------------
// 3. La caché no abre conexiones reales: cache.service con stubs inertes.
// ------------------------------------------------------------------
test('aislamiento: getFromCache/saveToCache con stubs no tocan red ni BD', async () => {
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const restaurar = aislar.aislarCacheService(cacheService);
    try {
        const c = await cacheService.getFromCache('ai:test');
        assert.strictEqual(c, null);
        await cacheService.saveToCache('ai:test', { content: 'x', model: 'm', usage: { totalTokens: 1 } });
    } finally {
        restaurar();
    }
});

// ------------------------------------------------------------------
// 4. Las dependencias de BD/Redis son stubs que NO conectan.
// ------------------------------------------------------------------
test('aislamiento: net.Socket#connect real está bloqueado (lanza)', () => {
    const net = require('net');
    const s = new net.Socket();
    // La guardia emite "error" de forma asíncrona; se verifica escuchando.
    return new Promise((resolve, reject) => {
        s.once('error', (e) => {
            try {
                assert.ok(/AISLAMIENTO/.test(e.message), 'el error debe ser de la guardia');
                resolve();
            } catch (err) { reject(err); }
        });
        // Intentar conectar a un host real: debe ser interceptado por la guardia.
        s.connect(6379, '127.0.0.1');
    });
});

test('aislamiento: dns.lookup real está bloqueado (lanza)', async () => {
    const dns = require('dns');
    await assert.rejects(
        () => new Promise((resolve, reject) => dns.lookup('example.com', (err, addr) => err ? reject(err) : resolve(addr))),
        (e) => /AISLAMIENTO/.test(e.message)
    );
});

// ------------------------------------------------------------------
// 5. El flujo completo (generateResponse) no toca red/BD reales.
// ------------------------------------------------------------------
test('aislamiento: generateResponse con proveedor y caché simulados no abre conexiones', async () => {
    aislar.purgarModulosSrc(path);
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));

    const restaurarCache = aislar.aislarCacheService(cacheService);
    const origGet = aiProviders.getProvider;
    const origName = aiProviders.getProviderName;
    const origSec = aiProviders.getSecondaryProvider;

    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({
        configured: () => true, model: () => 'm', paid: false,
        completion: async () => ({ text: 'ok', inputTokens: 1, outputTokens: 1 })
    });
    aiProviders.getSecondaryProvider = () => { throw new Error('no debe usarse el fallback'); };

    try {
        const r = await aiService.generateResponse({
            message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u'
        });
        assert.strictEqual(r.content, 'ok');
    } finally {
        aiProviders.getProvider = origGet;
        aiProviders.getProviderName = origName;
        aiProviders.getSecondaryProvider = origSec;
        restaurarCache();
    }
});
