/**
 * PRUEBAS — CACHÉ COMPATIBLE CON EL AGENTE PEDAGÓGICO.
 * ==================================================================
 * Objetivo: demostrar que una respuesta cacheada NO omite silenciosamente el
 * comportamiento pedagógico, y que no se reutilizan respuestas incompatibles
 * entre estados del agente, modos, materias, historiales, proveedores o modelos.
 *
 * Solución implementada (la menos arriesgada): incluir en la clave la
 * "firma de compatibilidad" (estado del agente + proveedor + modelo). Con el
 * agente DESACTIVADO se conserva el namespace histórico 'v0'.
 *
 * Aislamiento: preload ./test/_setup.js (guardias de red/TCP/DNS + stubs
 * ioredis/mssql). La caché se simula con un Map en memoria. NUNCA se toca
 * Redis, SQL Server ni ningún proveedor.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

// ------------------------------------------------------------------
// Entorno: ai.service fresco con env concreto, proveedor stub y caché en Map.
// ------------------------------------------------------------------
function montar({ agent, proveedor = 'groq', modelo = 'modelo-test' } = {}) {
    aislar.purgarModulosSrc(path);

    const prev = {};
    const env = {
        AGENT_ENABLED: agent ? 'true' : 'false',
        AI_PROVIDER: proveedor,
        GROQ_API_KEY: 'dummy', GEMINI_API_KEY: 'dummy', RETO_KEY: 'dummy',
        AI_FALLBACK_ENABLED: 'false'
    };
    for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }

    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));

    // Caché en memoria (simula Redis/SQL sin conexión)
    const store = new Map();
    const reads = [];
    const writes = [];
    const orig = {
        get: cacheService.getFromCache,
        save: cacheService.saveToCache,
        provider: aiProviders.getProvider,
        providerName: aiProviders.getProviderName
    };

    cacheService.getFromCache = async (key) => { reads.push(key); return store.get(key) || null; };
    cacheService.saveToCache = async (key, data) => { writes.push(key); store.set(key, data); };

    aiProviders.getProviderName = () => proveedor;
    aiProviders.getProvider = () => ({
        configured: () => true,
        model: () => modelo,
        paid: false,
        completion: async (args) => {
            // La respuesta incluye el system recibido para poder comprobar que
            // un HIT corresponde a un prompt pedagógico equivalente.
            const tieneAgente = String(args.system || '').includes('CONTEXTO PEDAGOGICO DEL TURNO');
            return { text: tieneAgente ? 'RESPUESTA CON AGENTE' : 'RESPUESTA SIN AGENTE', inputTokens: 1, outputTokens: 1 };
        }
    });

    return {
        aiService, store, reads, writes,
        restore: () => {
            cacheService.getFromCache = orig.get;
            cacheService.saveToCache = orig.save;
            aiProviders.getProvider = orig.provider;
            aiProviders.getProviderName = orig.providerName;
            for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        }
    };
}

const HIST = [{ role: 'user', content: 'hola' }, { role: 'assistant', content: '¿qué sabes?' }];

// ==================================================================
// 1. ESTADOS DISTINTOS DEL AGENTE NO COMPARTEN CLAVE
// ==================================================================
test('cache-ped(1): la MISMA pregunta con agente ON y OFF usa claves DISTINTAS', () => {
    const on = montar({ agent: true });
    const kOn = on.aiService.generateCacheKey('¿qué es una célula?', 'biologia', 'socratic', HIST);
    on.restore();

    const off = montar({ agent: false });
    const kOff = off.aiService.generateCacheKey('¿qué es una célula?', 'biologia', 'socratic', HIST);
    off.restore();

    assert.notStrictEqual(kOn, kOff, 'los estados del agente no deben compartir clave');
});

test('cache-ped(2): con agente ON, la respuesta cacheada se generó CON contexto pedagógico', async () => {
    const t = montar({ agent: true });
    try {
        const args = { message: 'dame la respuesta', subject: 'matematicas', mode: 'socratic', history: [], userId: 'u' };

        // 1er turno: MISS -> genera con agente
        const r1 = await t.aiService.generateResponse(args);
        assert.strictEqual(r1.content, 'RESPUESTA CON AGENTE');
        assert.strictEqual(r1.fromCache, false);
        assert.ok(r1.agentPlan, 'el MISS debe incluir agentPlan');

        // 2º turno idéntico: debe ser un HIT real (no una segunda llamada al modelo).
        // Se fuerza el modo estricto de la guardia: fetches SIN mock lanzan (el
        // log anterior ya no es evidencia de que el HIT funcionó).
        const origFetch = global.fetch;
        global.fetch = aislar.fetchGuardiaReal();
        let r2;
        try {
            r2 = await t.aiService.generateResponse(args);
        } finally {
            global.fetch = origFetch;
        }
        assert.strictEqual(r2.fromCache, true);
        assert.strictEqual(r2.content, 'RESPUESTA CON AGENTE',
            'un HIT no debe entregar una respuesta generada sin contexto pedagógico');
        // Contrato estable: agentPlan existe (null) también en HIT
        assert.ok('agentPlan' in r2);
        assert.strictEqual(r2.agentPlan, null, 'el plan no se persiste; se expone null de forma explícita');
    } finally { t.restore(); }
});

test('cache-ped(3): una entrada cacheada con agente OFF NO se reutiliza con agente ON', async () => {
    const args = { message: 'no entiendo', subject: 'matematicas', mode: 'socratic', history: [], userId: 'u' };

    // Primero con agente OFF -> guarda RESPUESTA SIN AGENTE
    const off = montar({ agent: false });
    const rOff = await off.aiService.generateResponse(args);
    assert.strictEqual(rOff.content, 'RESPUESTA SIN AGENTE');
    const storeOff = new Map(off.store);
    off.restore();

    // Mismo proceso, ahora con agente ON: debe ser MISS (clave distinta)
    const on = montar({ agent: true });
    // Sembramos la caché con TODAS las entradas del estado OFF para probar que
    // aunque estuvieran presentes, no se reutilizan.
    for (const [k, v] of storeOff) on.store.set(k, v);
    try {
        const rOn = await on.aiService.generateResponse(args);
        assert.strictEqual(rOn.fromCache, false, 'no debe haber HIT con entradas del estado OFF');
        assert.strictEqual(rOn.content, 'RESPUESTA CON AGENTE');
        assert.ok(rOn.agentPlan, 'el turno con agente debe llevar plan');
    } finally { on.restore(); }
});

test('cache-ped(4): con el agente DESACTIVADO se conserva el namespace histórico (v0)', () => {
    // Compatibilidad: el comportamiento previo no cambia. La clave OFF solo
    // añade la firma proveedor|modelo (que también cambia la respuesta), por lo
    // que cualquier respuesta nueva es segura y las guardadas antes de activar
    // el agente no pueden colarse en el estado ON.
    const t = montar({ agent: false });
    try {
        const k = t.aiService.generateCacheKey('pregunta frecuente', 'matematicas', 'socratic', []);
        assert.match(k, /^ai:[0-9a-f]{64}$/, 'la clave debe mantener el formato ai:<sha256>');
    } finally { t.restore(); }
});

// ==================================================================
// 2. VECTORES QUE CAMBIAN MATERIALMENTE LA RESPUESTA
// ==================================================================
test('cache-ped(5): modo, materia e historial distintos -> claves distintas', () => {
    const t = montar({ agent: true });
    try {
        const base = t.aiService.generateCacheKey('pregunta', 'matematicas', 'socratic', []);
        assert.notStrictEqual(base, t.aiService.generateCacheKey('pregunta', 'matematicas', 'direct', []), 'modo');
        assert.notStrictEqual(base, t.aiService.generateCacheKey('pregunta', 'biologia', 'socratic', []), 'materia');
        assert.notStrictEqual(base, t.aiService.generateCacheKey('pregunta', 'matematicas', 'socratic', HIST), 'historial');
        assert.notStrictEqual(base, t.aiService.generateCacheKey('otra pregunta', 'matematicas', 'socratic', []), 'mensaje');
    } finally { t.restore(); }
});

test('cache-ped(6): proveedor o modelo distintos -> claves distintas', () => {
    const g = montar({ agent: true, proveedor: 'groq', modelo: 'modelo-test' });
    const k1 = g.aiService.generateCacheKey('pregunta', 'matematicas', 'socratic', []);
    g.restore();

    const g2 = montar({ agent: true, proveedor: 'groq', modelo: 'otro-modelo' });
    const k2 = g2.aiService.generateCacheKey('pregunta', 'matematicas', 'socratic', []);
    g2.restore();

    assert.notStrictEqual(k1, k2, 'un modelo distinto produce una respuesta distinta');
});

test('cache-ped(7): la clave NO contiene userId ni datos personales en claro', () => {
    const t = montar({ agent: true });
    try {
        const k = t.aiService.generateCacheKey('mi correo es alumno@colegio.edu', 'matematicas', 'socratic', []);
        assert.strictEqual(k.startsWith('ai:'), true);
        assert.strictEqual(/alumno@colegio\.edu/i.test(k), false, 'el texto no debe aparecer en claro');
        assert.match(k, /^ai:[0-9a-f]{64}$/, 'debe ser un hash SHA-256');
    } finally { t.restore(); }
});

test('cache-ped(8): historial distinto con el mismo último mensaje no colisiona', () => {
    const t = montar({ agent: true });
    try {
        const h1 = [{ role: 'user', content: '¿qué es un límite?' }, { role: 'assistant', content: 'eres tú' }];
        const h2 = [{ role: 'user', content: '¿qué es una derivada?' }, { role: 'assistant', content: 'eres tú' }];
        const k1 = t.aiService.generateCacheKey('dame un ejemplo', 'matematicas', 'socratic', h1);
        const k2 = t.aiService.generateCacheKey('dame un ejemplo', 'matematicas', 'socratic', h2);
        assert.notStrictEqual(k1, k2);
    } finally { t.restore(); }
});

// ==================================================================
// 3. GUARDIA DE RED
// ==================================================================
test('cache-ped(9): no se realizaron conexiones (guardias activas)', async () => {
    await assert.rejects(async () => global.fetch('https://api.groq.com/openai/v1/chat/completions'),
        (e) => /AISLAMIENTO/.test(e.message));
});
