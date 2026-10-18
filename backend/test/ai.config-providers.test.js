/**
 * PRUEBAS FASE 5B — Estabilización de proveedores y configuración.
 * Sin llamadas reales: se usan mocks de fetch y el aislamiento de la Fase 5A
 * (preload ./test/_setup.js).
 *
 * Cubre:
 *   A. Nomenclatura de variables de entorno (AI_FALLBACK_PROVIDERS vs
 *      AI_FALLBACK_ORDER; AI_DEFAULT_TEMPERATURE vs AI_TEMPERATURE).
 *   C. Decisiones de fallback ante 401/403/429/timeout/conexión, y que no
 *      haya reintentos infinitos ni fallback en errores NO recuperables.
 *   D. Fuente única del modelo Gemini (adaptador == catálogo).
 *   E. RETO PLTK mediante respuestas simuladas (URL, Bearer, modelo, parsing,
 *      errores HTTP, JSON inválido, timeout, ausencia de RETO_KEY).
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

// Carga un módulo fresco con variables de entorno concretas y restaura después.
function cargarFresco(rel, env) {
    aislar.purgarModulosSrc(path);
    const prev = {};
    for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }
    const mod = require(path.join(BACKEND, rel));
    return {
        mod,
        restore: () => {
            for (const [k, v] of Object.entries(prev)) {
                if (v === undefined) delete process.env[k]; else process.env[k] = v;
            }
        }
    };
}

// Respuesta fetch simulada genérica.
function respuestaFetch({ status = 200, json = {}, retryAfter = null } = {}) {
    return {
        status,
        headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? retryAfter : null) },
        json: async () => json
    };
}

// ==================================================================
// A. NOMENCLATURA DE VARIABLES
// ==================================================================
test('config(A): AI_FALLBACK_PROVIDERS es la variable que se usa', () => {
    const { mod, restore } = cargarFresco('src/config/ai.config.js', {
        AI_PROVIDER: 'groq',
        AI_FALLBACK_PROVIDERS: 'gemini,openrouter',
        AI_FALLBACK_ORDER: 'openrouter,gemini' // NO debe tener efecto
    });
    try {
        assert.deepStrictEqual(mod.fallbackProviders, ['gemini', 'openrouter']);
    } finally { restore(); }
});

test('config(A): AI_FALLBACK_ORDER no existe ni afecta al orden real', () => {
    const { mod, restore } = cargarFresco('src/config/ai.config.js', {
        AI_PROVIDER: 'groq',
        AI_FALLBACK_PROVIDERS: '',
        AI_FALLBACK_ORDER: 'ollama,anthropic'
    });
    try {
        // Sin AI_FALLBACK_PROVIDERS se usa el default documentado.
        assert.deepStrictEqual(mod.fallbackProviders, mod.DEFAULT_FALLBACK);
        assert.ok(!mod.fallbackProviders.includes('ollama'));
    } finally { restore(); }
});

test('config(A): AI_DEFAULT_TEMPERATURE es la variable que se usa', () => {
    const { mod, restore } = cargarFresco('src/config/ai.config.js', {
        AI_DEFAULT_TEMPERATURE: '0.3'
    });
    try {
        assert.strictEqual(mod.temperature, 0.3);
    } finally { restore(); }
});

test('config(A): AI_TEMPERATURE no tiene efecto (no es alias)', () => {
    const { mod, restore } = cargarFresco('src/config/ai.config.js', {
        AI_DEFAULT_TEMPERATURE: '',
        AI_TEMPERATURE: '1.9'
    });
    try {
        assert.strictEqual(mod.temperature, 0.7); // default, NO 1.9
    } finally { restore(); }
});

// ==================================================================
// C. DECISIONES DE FALLBACK
// ==================================================================
// Helper: prepara ai.service con un proveedor primario que falla con `status`
// y un secundario que responde OK, y devuelve el resultado o el error.
async function ejecutarConFallback(statusPrimario, { secundarioConfigurado = true } = {}) {
    aislar.purgarModulosSrc(path);
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));

    const restaurarCache = aislar.aislarCacheService(cacheService);
    const orig = {
        getProvider: aiProviders.getProvider,
        getProviderName: aiProviders.getProviderName,
        getSecondaryProvider: aiProviders.getSecondaryProvider
    };

    process.env.AI_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'dummy';
    process.env.AI_FALLBACK_ENABLED = 'true';

    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({
        configured: () => true, model: () => 'm', paid: false,
        completion: async () => { const e = new Error('fallo primario'); e.status = statusPrimario; throw e; }
    });
    const secundarioLlamado = { v: false };
    aiProviders.getSecondaryProvider = () => {
        secundarioLlamado.v = true;
        if (!secundarioConfigurado) return null;
        return { id: 'gemini', provider: { configured: () => true, model: () => 'g', paid: false, completion: async () => ({ text: 'OK SECUNDARIO', inputTokens: 1, outputTokens: 1 }) } };
    };

    try {
        const res = await aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        return { res, secundarioLlamado: secundarioLlamado.v };
    } catch (e) {
        return { error: e, secundarioLlamado: secundarioLlamado.v };
    } finally {
        aiProviders.getProvider = orig.getProvider;
        aiProviders.getProviderName = orig.getProviderName;
        aiProviders.getSecondaryProvider = orig.getSecondaryProvider;
        restaurarCache();
    }
}

test('fallback(C): 401 dispara respaldo (credenciales del activo)', async () => {
    const { res, secundarioLlamado } = await ejecutarConFallback(401);
    assert.ok(secundarioLlamado, 'debe intentar el secundario');
    assert.strictEqual(res.content, 'OK SECUNDARIO');
});

test('fallback(C): 403 dispara respaldo', async () => {
    const { res, secundarioLlamado } = await ejecutarConFallback(403);
    assert.ok(secundarioLlamado);
    assert.strictEqual(res.content, 'OK SECUNDARIO');
});

test('fallback(C): 429 dispara respaldo (cuota)', async () => {
    const { res, secundarioLlamado } = await ejecutarConFallback(429);
    assert.ok(secundarioLlamado);
    assert.strictEqual(res.content, 'OK SECUNDARIO');
});

test('fallback(C): timeout (408) dispara respaldo', async () => {
    const { res, secundarioLlamado } = await ejecutarConFallback(408);
    assert.ok(secundarioLlamado);
    assert.strictEqual(res.content, 'OK SECUNDARIO');
});

test('fallback(C): error de conexión (503) dispara respaldo', async () => {
    const { res, secundarioLlamado } = await ejecutarConFallback(503);
    assert.ok(secundarioLlamado);
    assert.strictEqual(res.content, 'OK SECUNDARIO');
});

test('fallback(C): 400 NO dispara respaldo (error de petición)', async () => {
    const { error, secundarioLlamado } = await ejecutarConFallback(400);
    assert.ok(error, 'debe propagar el error');
    assert.strictEqual(secundarioLlamado, false, 'no debe intentar el secundario');
});

test('fallback(C): 404 NO dispara respaldo (modelo inexistente)', async () => {
    const { error, secundarioLlamado } = await ejecutarConFallback(404);
    assert.ok(error);
    assert.strictEqual(secundarioLlamado, false);
});

test('fallback(C): sin secundario configurado, propaga el error original', async () => {
    const { error, secundarioLlamado } = await ejecutarConFallback(401, { secundarioConfigurado: false });
    assert.ok(error);
    assert.ok(secundarioLlamado, 'se consultó el secundario, pero no había ninguno');
    // No se produce una segunda llamada real: el error es el del primario.
    assert.strictEqual(error.statusCode, 503); // 401 -> AppError 503
});

test('fallback(C): no hay reintentos en bucle (el secundario se llama una sola vez)', async () => {
    aislar.purgarModulosSrc(path);
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const restaurarCache = aislar.aislarCacheService(cacheService);
    const orig = {
        getProvider: aiProviders.getProvider,
        getProviderName: aiProviders.getProviderName,
        getSecondaryProvider: aiProviders.getSecondaryProvider
    };
    process.env.AI_FALLBACK_ENABLED = 'true';
    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({ configured: () => true, model: () => 'm', paid: false, completion: async () => { const e = new Error('x'); e.status = 500; throw e; } });
    let vecesSecundario = 0;
    aiProviders.getSecondaryProvider = () => {
        vecesSecundario++;
        return { id: 'gemini', provider: { configured: () => true, model: () => 'g', paid: false, completion: async () => { const e = new Error('y'); e.status = 500; throw e; } } };
    };
    try {
        await assert.rejects(() => aiService.generateResponse({ message: 'hola', subject: 'm', history: [], mode: 'socratic', userId: 'u' }));
        assert.strictEqual(vecesSecundario, 1, 'el respaldo se intenta exactamente una vez');
    } finally {
        aiProviders.getProvider = orig.getProvider;
        aiProviders.getProviderName = orig.getProviderName;
        aiProviders.getSecondaryProvider = orig.getSecondaryProvider;
        restaurarCache();
    }
});

// ==================================================================
// D. FUENTE ÚNICA DEL MODELO GEMINI
// ==================================================================
test('gemini(D): adaptador y catálogo usan el MISMO modelo por defecto', () => {
    aislar.purgarModulosSrc(path);
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    // Sin GEMINI_MODEL en entorno, ambos deben resolver a DEFAULT_MODELS.gemini.
    delete process.env.GEMINI_MODEL;
    assert.strictEqual(aiProviders.DEFAULT_MODELS.gemini, 'gemini-flash-latest');
    assert.strictEqual(aiProviders.PROVIDERS.gemini.model(), aiProviders.DEFAULT_MODELS.gemini);
});

test('gemini(D): GEMINI_MODEL sobreescribe en adaptador y catálogo', () => {
    aislar.purgarModulosSrc(path);
    process.env.GEMINI_MODEL = 'gemini-custom-x';
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    try {
        assert.strictEqual(aiProviders.PROVIDERS.gemini.model(), 'gemini-custom-x');
    } finally {
        delete process.env.GEMINI_MODEL;
    }
});

test('gemini(D): el adaptador NO usa el modelo retirado gemini-2.0-flash', () => {
    aislar.purgarModulosSrc(path);
    delete process.env.GEMINI_MODEL;
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    assert.notStrictEqual(aiProviders.DEFAULT_MODELS.gemini, 'gemini-2.0-flash');
});

// ==================================================================
// E. RETO PLTK (respuestas simuladas; NINGUNA llamada real)
// ==================================================================
test('reto(E): sin RETO_KEY lanza 401 SIN tocar la red', async () => {
    aislar.purgarModulosSrc(path);
    delete process.env.RETO_KEY;
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    await assert.rejects(
        () => aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
        (e) => e.status === 401
    );
});

test('reto(E): construye URL, Bearer y modelo correctos', async () => {
    aislar.purgarModulosSrc(path);
    process.env.RETO_KEY = 'clave-de-prueba';
    delete process.env.RETO_MODEL;
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));

    let visto = null;
    await aislar.instalarFetchMock(async (url, opts) => {
        visto = { url, opts };
        return respuestaFetch({
            status: 200,
            json: { choices: [{ message: { content: 'hola reto' } }], usage: { prompt_tokens: 4, completion_tokens: 6 } }
        });
    }, async () => {
        const r = await aiProviders.PROVIDERS.reto.completion({ system: 'SYS', messages: [{ role: 'user', content: 'hola' }] });
        assert.strictEqual(r.text, 'hola reto');
        assert.strictEqual(r.inputTokens, 4);
        assert.strictEqual(r.outputTokens, 6);
    });

    assert.strictEqual(visto.url, 'https://api.reto.pltk.mx/v1/chat/completions');
    assert.strictEqual(visto.opts.method, 'POST');
    assert.strictEqual(visto.opts.headers.Authorization, 'Bearer clave-de-prueba');
    const body = JSON.parse(visto.opts.body);
    assert.strictEqual(body.model, 'grok-4.6');           // DEFAULT_MODELS.reto
    assert.strictEqual(body.messages[0].role, 'system');  // system como primer mensaje
    assert.strictEqual(body.messages[0].content, 'SYS');
    delete process.env.RETO_KEY;
});

// ------------------------------------------------------------------
// RETO_BASE_URL configurable por entorno (Fase 5D.2).
// El adaptador DEBE leer process.env.RETO_BASE_URL y caer al endpoint
// oficial si la variable falta o está vacía.
// ------------------------------------------------------------------
test('reto(E2): RETO_BASE_URL sobreescribe la URL base', async () => {
    aislar.purgarModulosSrc(path);
    process.env.RETO_KEY = 'clave-de-prueba';
    process.env.RETO_BASE_URL = 'https://proxy.interno.local/v1';
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));

    let url = null;
    try {
        await aislar.instalarFetchMock(async (u) => {
            url = u;
            return respuestaFetch({ status: 200, json: { choices: [{ message: { content: 'ok' } }] } });
        }, async () => {
            await aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
        });
        assert.strictEqual(url, 'https://proxy.interno.local/v1/chat/completions');
    } finally {
        delete process.env.RETO_KEY; delete process.env.RETO_BASE_URL;
    }
});

test('reto(E2): RETO_BASE_URL vacía cae al endpoint oficial por defecto', async () => {
    aislar.purgarModulosSrc(path);
    process.env.RETO_KEY = 'clave-de-prueba';
    process.env.RETO_BASE_URL = '';
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));

    let url = null;
    try {
        await aislar.instalarFetchMock(async (u) => {
            url = u;
            return respuestaFetch({ status: 200, json: { choices: [{ message: { content: 'ok' } }] } });
        }, async () => {
            await aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
        });
        assert.strictEqual(url, 'https://api.reto.pltk.mx/v1/chat/completions');
    } finally {
        delete process.env.RETO_KEY; delete process.env.RETO_BASE_URL;
    }
});

test('reto(E2): sin RETO_BASE_URL usa el endpoint oficial por defecto', async () => {
    aislar.purgarModulosSrc(path);
    process.env.RETO_KEY = 'clave-de-prueba';
    delete process.env.RETO_BASE_URL;
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));

    let url = null;
    try {
        await aislar.instalarFetchMock(async (u) => {
            url = u;
            return respuestaFetch({ status: 200, json: { choices: [{ message: { content: 'ok' } }] } });
        }, async () => {
            await aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
        });
        assert.strictEqual(url, 'https://api.reto.pltk.mx/v1/chat/completions');
    } finally {
        delete process.env.RETO_KEY;
    }
});

test('reto(E): RETO_MODEL sobreescribe el modelo por defecto', async () => {
    aislar.purgarModulosSrc(path);
    process.env.RETO_KEY = 'clave-de-prueba';
    process.env.RETO_MODEL = 'modelo-custom';
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));

    let body = null;
    await aislar.instalarFetchMock(async (url, opts) => {
        body = JSON.parse(opts.body);
        return respuestaFetch({ status: 200, json: { choices: [{ message: { content: 'ok' } }] } });
    }, async () => {
        await aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
    });

    assert.strictEqual(body.model, 'modelo-custom');
    delete process.env.RETO_KEY; delete process.env.RETO_MODEL;
});

test('reto(E): error HTTP 500 se propaga con su status', async () => {
    aislar.purgarModulosSrc(path);
    process.env.RETO_KEY = 'clave-de-prueba';
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    await aislar.instalarFetchMock(async () => respuestaFetch({ status: 500, json: { error: { message: 'boom' } } }), async () => {
        await assert.rejects(
            () => aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
            (e) => e.status === 500
        );
    });
    delete process.env.RETO_KEY;
});

test('reto(E): respuesta JSON inválida (sin choices) NO es un éxito falso', async () => {
    aislar.purgarModulosSrc(path);
    process.env.RETO_KEY = 'clave-de-prueba';
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    await aislar.instalarFetchMock(async () => respuestaFetch({ status: 200, json: { resultado: 'formato inesperado' } }), async () => {
        await assert.rejects(
            () => aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
            (e) => e.status === 502
        );
    });
    delete process.env.RETO_KEY;
});

test('reto(E): timeout (AbortError) se convierte en error 408', async () => {
    aislar.purgarModulosSrc(path);
    process.env.RETO_KEY = 'clave-de-prueba';
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    await aislar.instalarFetchMock(async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }, async () => {
        await assert.rejects(
            () => aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
            (e) => e.status === 408
        );
    });
    delete process.env.RETO_KEY;
});

test('reto(E): 429 propaga Retry-After', async () => {
    aislar.purgarModulosSrc(path);
    process.env.RETO_KEY = 'clave-de-prueba';
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    await aislar.instalarFetchMock(async () => respuestaFetch({ status: 429, retryAfter: '3', json: { error: { message: 'rate limit' } } }), async () => {
        await assert.rejects(
            () => aiProviders.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] }),
            (e) => e.status === 429 && e.retryAfterSeconds === 3
        );
    });
    delete process.env.RETO_KEY;
});

test('reto(E): RETO está registrado en el catálogo y en KNOWN_PROVIDERS', () => {
    aislar.purgarModulosSrc(path);
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiConfig = require(path.join(BACKEND, 'src/config/ai.config.js'));
    assert.ok(aiProviders.PROVIDERS.reto, 'debe existir PROVIDERS.reto');
    assert.ok(aiConfig.KNOWN_PROVIDERS.includes('reto'), 'reto debe ser reconocido por la config');
});
