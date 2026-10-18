/**
 * PRUEBAS FASE 5B.4 — RETO PLTK (respuestas simuladas; NINGUNA llamada real).
 * Aislamiento de la Fase 5A (preload ./test/_setup.js).
 *
 * Cubre las cuatro pruebas pendientes de la Fase 5B.2/5B.3:
 *   R1. Fallback Groq -> RETO cuando RETO es el secundario (resuelto por la
 *       lógica REAL de selección getSecondaryProvider; HTTP simulado).
 *   R2. Error HTTP 403 de RETO.
 *   R3. HTTP 200 con contenido que indica cuota agotada -> error controlado.
 *   R4. La clave (centinela) NUNCA aparece en errores ni logs de retoCompletion.
 *
 * Se usan claves FICTICIAS solo en memoria.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

const CENTINELA_KEY = 'reto-clave-ficticia-CENTINELA-123456';

// Fija variables de entorno concretas y devuelve un restaurador.
function conEnv(env) {
    const prev = {};
    for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }
    return () => {
        for (const [k, v] of Object.entries(prev)) {
            if (v === undefined) delete process.env[k]; else process.env[k] = v;
        }
    };
}

// Respuesta fetch simulada genérica.
function respuestaFetch({ status = 200, json = {}, retryAfter = null } = {}) {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? retryAfter : null) },
        json: async () => json
    };
}

// Captura console.error/console.warn durante fn().
async function capturandoConsola(fn) {
    const capturas = [];
    const origErr = console.error, origWarn = console.warn;
    console.error = (...a) => { capturas.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); };
    console.warn = (...a) => { capturas.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); };
    try { await fn(); } finally { console.error = origErr; console.warn = origWarn; }
    return capturas.join('\n');
}

// ==================================================================
// R1. FALLBACK GROQ -> RETO (secundario resuelto por la lógica REAL)
// ==================================================================
test('reto(R1): si Groq falla (401), responde RETO como secundario real', async () => {
    aislar.purgarModulosSrc(path);
    // Config: groq principal, RETO como ÚNICO respaldo configurado.
    const restaurarEnv = conEnv({
        AI_PROVIDER: 'groq',
        GROQ_API_KEY: 'groq-dummy',
        RETO_KEY: CENTINELA_KEY,
        AI_FALLBACK_ENABLED: 'true',
        AI_FALLBACK_PROVIDERS: 'reto'
    });

    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const restaurarCache = aislar.aislarCacheService(cacheService);

    // Comprobación de que la lógica REAL resuelve reto como secundario.
    const sec = aiProviders.getSecondaryProvider('groq');
    assert.ok(sec, 'debe existir secundario');
    assert.strictEqual(sec.id, 'reto');

    // El proveedor principal (groq) falla con 401 (recuperable).
    const origGet = aiProviders.getProvider;
    const origName = aiProviders.getProviderName;
    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({
        configured: () => true, model: () => 'm', paid: false,
        completion: async () => { const e = new Error('bad groq key'); e.status = 401; throw e; }
    });

    // RETO (secundario) usa fetch SIMULADO que devuelve formato OpenAI.
    try {
        const res = await aislar.instalarFetchMock(async (url) => {
            assert.strictEqual(url, 'https://api.reto.pltk.mx/v1/chat/completions');
            return respuestaFetch({
                status: 200,
                json: { choices: [{ message: { content: 'PREGUNTA DESDE RETO' } }], usage: { prompt_tokens: 3, completion_tokens: 5 } }
            });
        }, async () => {
            return aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        });

        assert.strictEqual(res.content, 'PREGUNTA DESDE RETO');
        assert.deepStrictEqual(res.fallback, { from: 'groq', to: 'reto' });
    } finally {
        aiProviders.getProvider = origGet;
        aiProviders.getProviderName = origName;
        restaurarCache();
        restaurarEnv();
    }
});

// ==================================================================
// R2. HTTP 403 DE RETO
// ==================================================================
test('reto(R2): HTTP 403 se propaga con status 403', async () => {
    aislar.purgarModulosSrc(path);
    const restaurarEnv = conEnv({ RETO_KEY: CENTINELA_KEY });
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    try {
        await aislar.instalarFetchMock(async () => respuestaFetch({ status: 403, json: { error: { message: 'forbidden' } } }), async () => {
            await assert.rejects(
                () => aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
                (e) => e.status === 403
            );
        });
    } finally { restaurarEnv(); }
});

// ==================================================================
// R3. HTTP 200 CON CONTENIDO DE CUOTA AGOTADA
// ==================================================================
test('reto(R3): HTTP 200 con "cuota agotada" NO es éxito falso (error 429 recuperable)', async () => {
    aislar.purgarModulosSrc(path);
    const restaurarEnv = conEnv({ RETO_KEY: CENTINELA_KEY });
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    try {
        await aislar.instalarFetchMock(async () => respuestaFetch({
            status: 200,
            json: { choices: [{ message: { content: 'Rate limit reached: insufficient quota for this model.' } }] }
        }), async () => {
            await assert.rejects(
                () => aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
                (e) => e.status === 429 && e.recoverable === true
            );
        });
    } finally { restaurarEnv(); }
});

// ==================================================================
// R4. LA CLAVE NUNCA APARECE EN ERRORES NI LOGS
// ==================================================================
test('reto(R4): RETO_KEY no aparece en el error ni en los logs de retoCompletion', async () => {
    aislar.purgarModulosSrc(path);
    const restaurarEnv = conEnv({ RETO_KEY: CENTINELA_KEY });
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));

    let capturado = null;
    const salida = await capturandoConsola(async () => {
        await aislar.instalarFetchMock(async () => respuestaFetch({ status: 500, json: { error: { message: 'boom' } } }), async () => {
            try {
                await aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
            } catch (e) { capturado = e; }
        });
    });

    try {
        assert.ok(capturado, 'debe lanzar error');
        assert.ok(!String(capturado.message).includes(CENTINELA_KEY), 'el mensaje de error no debe contener la clave');
        assert.ok(!JSON.stringify(salida).includes(CENTINELA_KEY), 'los logs no deben contener la clave');
        // Tampoco en el objeto serializado del error (por si llevara headers).
        assert.ok(!JSON.stringify(capturado).includes(CENTINELA_KEY), 'el error serializado no debe contener la clave');
    } finally { restaurarEnv(); }
});

test('reto(R4b): la guardia de fetch sigue activa tras estas pruebas', async () => {
    await assert.rejects(
        async () => global.fetch('https://api.reto.pltk.mx/v1/chat/completions'),
        (e) => /AISLAMIENTO/.test(e.message)
    );
});
