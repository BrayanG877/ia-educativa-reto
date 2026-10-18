/**
 * Pruebas automatizadas del subsistema de IA (SIN llamadas reales a proveedores).
 * Runner nativo de Node: node --test  (Node >=18). No añade dependencias.
 *
 * Cubre: configuración, selección de proveedor, normalización, errores HTTP,
 * timeouts, fallback, límites, contrato y ausencia de secretos en logs.
 *
 * Las peticiones de red se SIMULAN reemplazando global.fetch por un mock.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

// Aislamiento hermético: guardias de red/TCP/DNS + helpers de mock.
// (El preload _setup.js ya desactiva fetch/TCP/DNS al arrancar el runner.)
const aislar = require('./_aislamiento');

const BACKEND = path.join(__dirname, '..');

// Helper: carga un módulo fresco con variables de entorno concretas.
function cargarFresco(rel, env) {
    // Limpiar la caché de require para reevaluar la config con otras env vars.
    for (const k of Object.keys(require.cache)) {
        if (k.includes(path.join('backend', 'src'))) delete require.cache[k];
    }
    const prev = {};
    for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }
    const mod = require(path.join(BACKEND, rel));
    return { mod, restore: () => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } } };
}

// ==================================================================
// 1. CONFIGURACIÓN CENTRAL (ai.config.js)
// ==================================================================
test('config: defaults seguros cuando no hay variables', () => {
    const { mod, restore } = cargarFresco('src/config/ai.config.js', {
        AI_PROVIDER: '', AI_FALLBACK_ENABLED: '', AI_TIMEOUT_MS: '', AI_MAX_RETRIES: '',
        AI_FALLBACK_PROVIDERS: '', AI_MAX_INPUT_CHARS: '', AI_LOG_LEVEL: ''
    });
    assert.strictEqual(mod.provider, 'groq');
    assert.strictEqual(mod.timeoutMs, 30000);
    assert.strictEqual(mod.maxRetries, 1);
    assert.strictEqual(mod.fallbackEnabled, true);
    assert.ok(Array.isArray(mod.fallbackProviders));
    restore();
});

test('config: valores fuera de rango usan default', () => {
    const { mod, restore } = cargarFresco('src/config/ai.config.js', {
        AI_TIMEOUT_MS: '999999', AI_MAX_RETRIES: '-5', AI_DEFAULT_TEMPERATURE: '9'
    });
    assert.strictEqual(mod.timeoutMs, 30000);   // fuera de rango -> default
    assert.strictEqual(mod.maxRetries, 1);      // negativo -> default
    assert.strictEqual(mod.temperature, 0.7);   // >2 -> default
    restore();
});

test('config: AI_PROVIDER desconocido cae a groq con advertencia', () => {
    const { mod, restore } = cargarFresco('src/config/ai.config.js', { AI_PROVIDER: 'inventado' });
    assert.strictEqual(mod.provider, 'groq');
    assert.ok(mod.validate().avisos.length > 0);
    restore();
});

test('config: el proveedor principal NUNCA aparece en la lista de fallback', () => {
    const { mod, restore } = cargarFresco('src/config/ai.config.js', {
        AI_PROVIDER: 'groq', AI_FALLBACK_PROVIDERS: 'groq,gemini'
    });
    assert.ok(!mod.fallbackProviders.includes('groq'));
    restore();
});

test('config: fallback deshabilitado deja la lista vacía', () => {
    const { mod, restore } = cargarFresco('src/config/ai.config.js', {
        AI_FALLBACK_ENABLED: 'false', AI_FALLBACK_PROVIDERS: 'gemini,openrouter'
    });
    assert.strictEqual(mod.fallbackEnabled, false);
    assert.strictEqual(mod.fallbackProviders.length, 0);
    restore();
});

test('config: validate() no falla por un proveedor ALTERNATIVO sin clave', () => {
    const { mod, restore } = cargarFresco('src/config/ai.config.js', {
        AI_PROVIDER: 'groq', GROQ_API_KEY: 'dummy', AI_FALLBACK_PROVIDERS: 'gemini'
    });
    delete process.env.GEMINI_API_KEY;
    const r = mod.validate();
    assert.strictEqual(r.ok, true);            // el principal está -> ok
    assert.ok(r.avisos.some(a => a.includes('gemini')));  // pero avisa del alternativo
    restore();
});

// ==================================================================
// 2. PROVEEDORES: selección, normalización, errores (con fetch mockeado)
// ==================================================================
const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));

test('providers: getProviderName respeta AI_PROVIDER configurado', () => {
    process.env.AI_PROVIDER = 'groq'; process.env.GROQ_API_KEY = 'dummy';
    assert.strictEqual(aiProviders.getProviderName(), 'groq');
});

test('providers: RETO está en el registro y se reporta su modelo', () => {
    const lista = aiProviders.listProviders();
    const reto = lista.find(p => p.id === 'reto');
    assert.ok(reto, 'RETO debe estar registrado');
    assert.strictEqual(reto.configured, false); // sin RETO_KEY -> no configurado
});

test('providers: normaliza respuesta válida de Groq (forms OpenAI)', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
        status: 200,
        headers: { get: () => null },
        json: async () => ({ choices: [{ message: { content: 'Hola tutor' } }], usage: { prompt_tokens: 3, completion_tokens: 5 } })
    });
    process.env.GROQ_API_KEY = 'dummy';
    const r = await aiProviders.PROVIDERS.groq.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
    assert.strictEqual(r.text, 'Hola tutor');
    assert.strictEqual(r.inputTokens, 3);
    assert.strictEqual(r.outputTokens, 5);
    global.fetch = originalFetch;
});

test('providers: HTTP 401 se propaga como error status 401', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({ status: 401, headers: { get: () => null }, json: async () => ({ error: { message: 'invalid key' } }) });
    process.env.GROQ_API_KEY = 'dummy';
    await assert.rejects(
        () => aiProviders.PROVIDERS.groq.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
        (e) => e.status === 401
    );
    global.fetch = originalFetch;
});

test('providers: HTTP 429 propaga Retry-After', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
        status: 429,
        headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? '2' : null) },
        json: async () => ({ error: { message: 'rate limit' } })
    });
    process.env.GROQ_API_KEY = 'dummy';
    await assert.rejects(
        () => aiProviders.PROVIDERS.groq.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
        (e) => e.status === 429 && e.retryAfterSeconds === 2
    );
    global.fetch = originalFetch;
});

test('providers: respuesta VACÍA se trata como error (no éxito falso)', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({ status: 200, headers: { get: () => null }, json: async () => ({ choices: [{ message: { content: '' } }] }) });
    process.env.GROQ_API_KEY = 'dummy';
    await assert.rejects(
        () => aiProviders.PROVIDERS.groq.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] })
    );
    global.fetch = originalFetch;
});

test('providers: timeout se convierte en error 408', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
    process.env.GROQ_API_KEY = 'dummy';
    await assert.rejects(
        () => aiProviders.PROVIDERS.groq.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
        (e) => e.status === 408
    );
    global.fetch = originalFetch;
});

test('providers: error de conexión se convierte en error 503', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error('ECONNREFUSED'); };
    process.env.GROQ_API_KEY = 'dummy';
    await assert.rejects(
        () => aiProviders.PROVIDERS.groq.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
        (e) => e.status === 503
    );
    global.fetch = originalFetch;
});

test('providers: proveedor sin clave lanza 401 sin tocar la red', async () => {
    delete process.env.RETO_KEY;
    await assert.rejects(
        () => aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
        (e) => e.status === 401
    );
});

// ==================================================================
// 3. FALLBACK (ai.service.js con proveedores mockeados)
// ==================================================================
test('fallback: si el primario falla (401), responde el secundario', async () => {
    // CRÍTICO: recargar AMBOS módulos juntos para que ai.service y aiProviders
    // apunten a la MISMA instancia (evita que un test previo deje módulos
    // descuadrados y se acabe llamando al proveedor REAL).
    for (const k of Object.keys(require.cache)) {
        if (k.includes(path.join('backend', 'src'))) delete require.cache[k];
    }
    const aiProvidersFresh = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));

    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'dummy';
    process.env.GEMINI_API_KEY = 'dummy';
    process.env.AI_FALLBACK_ENABLED = 'true';

    const origGet = aiProvidersFresh.getProvider;
    const origGetName = aiProvidersFresh.getProviderName;
    const origGetSecondary = aiProvidersFresh.getSecondaryProvider;

    aiProvidersFresh.getProviderName = () => 'groq';
    aiProvidersFresh.getProvider = () => ({ configured: () => true, model: () => 'm', paid: false, completion: async () => { const e = new Error('bad key'); e.status = 401; throw e; } });
    aiProvidersFresh.getSecondaryProvider = () => ({ id: 'gemini', provider: { configured: () => true, model: () => 'g', paid: false, completion: async () => ({ text: 'RESPUESTA SECUNDARIA', inputTokens: 1, outputTokens: 2 }) } });

    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const origGet2 = cacheService.getFromCache; const origSave = cacheService.saveToCache;
    cacheService.getFromCache = async () => null;
    cacheService.saveToCache = async () => { };

    try {
        const res = await aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        assert.strictEqual(res.content, 'RESPUESTA SECUNDARIA');
        assert.deepStrictEqual(res.fallback, { from: 'groq', to: 'gemini' });
    } finally {
        aiProvidersFresh.getProvider = origGet; aiProvidersFresh.getProviderName = origGetName; aiProvidersFresh.getSecondaryProvider = origGetSecondary;
        cacheService.getFromCache = origGet2; cacheService.saveToCache = origSave;
    }
});

test('fallback: fallback deshabilitado propaga el error sin cambiar de proveedor', async () => {
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
    process.env.AI_FALLBACK_ENABLED = 'false';
    // recargar config para que tome el valor
    delete require.cache[require.resolve(path.join(BACKEND, 'src/config/ai.config.js'))];

    // AISLAMIENTO: cacheService debe quedar inerte ANTES de invocar el flujo,
    // porque ai.service.js ya capturó su referencia.
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const restaurarCache = aislar.aislarCacheService(cacheService);

    const origGet = aiProviders.getProvider; const origGetName = aiProviders.getProviderName;
    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({ configured: () => true, model: () => 'm', paid: false, completion: async () => { const e = new Error('bad'); e.status = 401; throw e; } });
    const secundarioLlamado = { v: false };
    const origSec = aiProviders.getSecondaryProvider;
    aiProviders.getSecondaryProvider = () => { secundarioLlamado.v = true; return { id: 'gemini', provider: { completion: async () => ({ text: 'x' }) } }; };

    try {
        await assert.rejects(() => aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' }));
        assert.strictEqual(secundarioLlamado.v, false, 'no debe intentar el secundario');
    } finally {
        aiProviders.getProvider = origGet; aiProviders.getProviderName = origGetName; aiProviders.getSecondaryProvider = origSec;
        restaurarCache();
        process.env.AI_FALLBACK_ENABLED = 'true';
    }
});

// ==================================================================
// 4. LÍMITES Y CONTRATO
// ==================================================================
test('límites: mensaje que excede AI_MAX_INPUT_CHARS devuelve 400', async () => {
    process.env.AI_MAX_INPUT_CHARS = '10';
    delete require.cache[require.resolve(path.join(BACKEND, 'src/config/ai.config.js'))];
    delete require.cache[require.resolve(path.join(BACKEND, 'src/services/ai.service.js'))];
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));

    const origGet = aiProviders.getProvider; const origGetName = aiProviders.getProviderName;
    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({ configured: () => true, model: () => 'm', paid: false, completion: async () => ({ text: 'x' }) });
    // AISLAMIENTO: aunque el 400 se lanza antes de tocar caché, se deja el
    // cacheService inerte para que la prueba sea independiente del orden.
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const restaurarCache = aislar.aislarCacheService(cacheService);
    try {
        await assert.rejects(
            () => aiService.generateResponse({ message: 'a'.repeat(50), subject: 'x', history: [], mode: 'socratic', userId: 'u' }),
            (e) => e.statusCode === 400
        );
    } finally {
        aiProviders.getProvider = origGet; aiProviders.getProviderName = origGetName;
        restaurarCache();
        process.env.AI_MAX_INPUT_CHARS = '5000';
    }
});

test('contrato: la respuesta conserva {content, model, usage, cost, duration, fromCache}', async () => {
    for (const k of Object.keys(require.cache)) {
        if (k.includes(path.join('backend', 'src'))) delete require.cache[k];
    }
    const aiProvidersFresh = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
    const origGet = aiProvidersFresh.getProvider; const origGetName = aiProvidersFresh.getProviderName;
    aiProvidersFresh.getProviderName = () => 'groq';
    aiProvidersFresh.getProvider = () => ({ configured: () => true, model: () => 'modelo-x', paid: false, completion: async () => ({ text: 'ok', inputTokens: 1, outputTokens: 1 }) });
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const o1 = cacheService.getFromCache, o2 = cacheService.saveToCache;
    cacheService.getFromCache = async () => null; cacheService.saveToCache = async () => { };
    try {
        const r = await aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        for (const campo of ['content', 'model', 'usage', 'cost', 'duration', 'fromCache']) {
            assert.ok(campo in r, `falta el campo ${campo}`);
        }
    } finally {
        aiProvidersFresh.getProvider = origGet; aiProvidersFresh.getProviderName = origGetName;
        cacheService.getFromCache = o1; cacheService.saveToCache = o2;
    }
});
