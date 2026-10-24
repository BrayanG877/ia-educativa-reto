/**
 * PRUEBAS — ENRUTADO AL GATEWAY DE GROK (RETO PLTK)
 * ==================================================================
 * Motivo (hallazgo de la auditoría): `getProviderName()` sustituía en SILENCIO
 * el proveedor configurado cuando su credencial faltaba (primero de
 * FALLBACK_ORDER). Con `AI_PROVIDER=reto` y `RETO_KEY` ausente, el tráfico se
 * desviaba a Groq/Gemini sin que la interfaz lo evidenciara. Estas pruebas
 * fijan el contrato:
 *
 *   R1. La selección explícita NUNCA se sustituye (aunque falte la clave).
 *   R2. Sin AI_PROVIDER, se conserva el orden heredado (solo aquí).
 *   R3. El adaptador RETO usa la base URL configurada, Bearer y modelo efectivo.
 *   R4. La URL base se normaliza (barras finales, valores inválidos).
 *   R5. Los errores del gateway traen pistas de diagnóstico sin secretos.
 *   R6. No hay respaldo automático hacia otro proveedor si está desactivado.
 *   R7. El bloqueo por credencial faltante ocurre ANTES de tocar la red.
 *
 * Sin red real: preload ./test/_setup.js + fetch simulado por prueba.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

const CENTINELA = 'reto_CENTINELA_9f8e7d6c';

const CLAVES = [
    'ANTHROPIC_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY',
    'RETO_KEY', 'RETO_BASE_URL', 'RETO_MODEL', 'AI_PROVIDER', 'AI_FALLBACK_ENABLED',
    'AI_FALLBACK_PROVIDERS', 'OLLAMA_ENABLED'
];

/** Ejecuta fn con un entorno EXACTO (las variables no indicadas se borran). */
async function conEntorno(env, fn) {
    const prev = {};
    for (const k of CLAVES) {
        prev[k] = process.env[k];
        delete process.env[k];
    }
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    aislar.purgarModulosSrc(path);
    try {
        return await fn();
    } finally {
        for (const k of CLAVES) {
            if (prev[k] === undefined) delete process.env[k];
            else process.env[k] = prev[k];
        }
        aislar.purgarModulosSrc(path);
    }
}

function respuestaFetch({ status = 200, json = {}, retryAfter = null } = {}) {
    return {
        status,
        headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? retryAfter : null) },
        json: async () => json
    };
}

const cargarProviders = () => require(path.join(BACKEND, 'src/services/ai.providers.js'));

// ==================================================================
// R1. LA SELECCIÓN EXPLÍCITA NO SE SUSTITUYE
// ==================================================================
test('reto(S1): AI_PROVIDER=reto sin RETO_KEY NO se cambia por otro proveedor', async () => {
    await conEntorno({
        AI_PROVIDER: 'reto',
        GROQ_API_KEY: 'groq-dummy',      // hay otro proveedor utilizable...
        GEMINI_API_KEY: 'gemini-dummy'   // ...pero NO debe elegirse
    }, async () => {
        const p = cargarProviders();
        assert.strictEqual(p.getProviderName(), 'reto', 'debe respetarse la selección explícita');
        const d = p.describeSelection();
        assert.strictEqual(d.active, 'reto');
        assert.strictEqual(d.configured, false, 'reto no tiene credencial');
        assert.strictEqual(d.mismatch, false, 'no debe haber sustitución silenciosa');
    });
});

test('reto(S1b): listProviders marca reto como activo solo si está configurado', async () => {
    await conEntorno({ AI_PROVIDER: 'reto', GROQ_API_KEY: 'groq-dummy' }, async () => {
        const p = cargarProviders();
        const info = p.listProviders().find(x => x.id === 'reto');
        assert.strictEqual(info.active, false);
        assert.strictEqual(info.configured, false);
    });
});

// ==================================================================
// R2. SIN SELECCIÓN EXPLÍCITA SE MANTIENE EL ORDEN HEREDADO
// ==================================================================
test('reto(S2): sin AI_PROVIDER se usa el primer proveedor configurado', async () => {
    await conEntorno({ GROQ_API_KEY: 'groq-dummy' }, async () => {
        assert.strictEqual(cargarProviders().getProviderName(), 'groq');
    });
});

test('reto(S2b): AI_PROVIDER desconocido cae al orden heredado (no rompe)', async () => {
    await conEntorno({ AI_PROVIDER: 'inexistente', GEMINI_API_KEY: 'g-dummy' }, async () => {
        assert.strictEqual(cargarProviders().getProviderName(), 'gemini');
    });
});

// ==================================================================
// R3. CONTRATO DE LA PETICIÓN AL GATEWAY
// ==================================================================
test('reto(R3): POST {RETO_BASE_URL}/chat/completions con Bearer, modelo y system', async () => {
    await conEntorno({
        AI_PROVIDER: 'reto', RETO_KEY: CENTINELA, RETO_MODEL: 'grok-4.6'
    }, async () => {
        const p = cargarProviders();
        const visto = {};
        await aislar.instalarFetchMock(async (url, opts) => {
            visto.url = url; visto.opts = opts;
            return respuestaFetch({
                json: {
                    choices: [{ message: { content: 'conexión correcta' } }],
                    usage: { prompt_tokens: 659, completion_tokens: 2 }
                }
            });
        }, async () => {
            const r = await p.PROVIDERS.reto.completion({
                system: 'SYS', messages: [{ role: 'user', content: 'hola' }],
                model: 'grok-4.6', maxTokens: 100, temperature: 0
            });
            assert.strictEqual(r.text, 'conexión correcta');
            assert.strictEqual(r.inputTokens, 659);
            assert.strictEqual(r.outputTokens, 2);
        });

        assert.strictEqual(visto.url, 'https://api.reto.pltk.mx/v1/chat/completions');
        assert.strictEqual(visto.opts.method, 'POST');
        assert.strictEqual(visto.opts.headers['Content-Type'], 'application/json');
        assert.strictEqual(visto.opts.headers.Authorization, `Bearer ${CENTINELA}`);
        const body = JSON.parse(visto.opts.body);
        assert.strictEqual(body.model, 'grok-4.6');
        assert.strictEqual(body.messages[0].role, 'system');
        assert.strictEqual(body.messages[0].content, 'SYS');
        assert.strictEqual(body.max_tokens, 100);
        assert.strictEqual(body.temperature, 0);
        // No se envían parámetros propios de Anthropic (max_tokens sí es OpenAI).
        assert.ok(!('system' in body), 'system debe ir como mensaje, no como campo aparte');
        assert.ok(!('anthropic_version' in body));
    });
});

test('reto(R3b): el flujo aiService usa el proveedor elegido y su modelo', async () => {
    await conEntorno({
        AI_PROVIDER: 'reto', RETO_KEY: CENTINELA, RETO_MODEL: 'grok-4.6',
        AI_FALLBACK_ENABLED: 'false', GROQ_API_KEY: 'groq-dummy'
    }, async () => {
        const aiProviders = cargarProviders();
        const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
        const cache = require(path.join(BACKEND, 'src/services/cache.service.js'));
        const restaurarCache = aislar.aislarCacheService(cache);

        let destino = null;
        let cuerpo = null;
        try {
            await aislar.instalarFetchMock(async (url, opts) => {
                destino = url; cuerpo = JSON.parse(opts.body);
                return respuestaFetch({ json: { choices: [{ message: { content: 'desde grok' } }] } });
            }, async () => {
                const r = await aiService.generateResponse({
                    message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u'
                });
                assert.strictEqual(r.content, 'desde grok');
                assert.strictEqual(r.model, 'grok-4.6');
                assert.ok(!r.fallback, 'no debe haber respaldo');
            });
            assert.match(destino, /^https:\/\/api\.reto\.pltk\.mx\/v1\/chat\/completions$/);
            assert.strictEqual(cuerpo.model, 'grok-4.6');
        } finally { restaurarCache(); }
    });
});

// ==================================================================
// R4. NORMALIZACIÓN DE LA URL BASE
// ==================================================================
test('reto(R4): barras finales en RETO_BASE_URL no producen "//"', async () => {
    await conEntorno({ RETO_KEY: CENTINELA, RETO_BASE_URL: 'https://gateway.local/v1///' }, async () => {
        const p = cargarProviders();
        let url = null;
        await aislar.instalarFetchMock(async (u) => {
            url = u;
            return respuestaFetch({ json: { choices: [{ message: { content: 'ok' } }] } });
        }, async () => {
            await p.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
        });
        assert.strictEqual(url, 'https://gateway.local/v1/chat/completions');
    });
});

test('reto(R4b): RETO_BASE_URL inválida cae al endpoint oficial (no rompe el chat)', async () => {
    await conEntorno({ RETO_KEY: CENTINELA, RETO_BASE_URL: 'no-es-una-url' }, async () => {
        const p = cargarProviders();
        let url = null;
        await aislar.instalarFetchMock(async (u) => {
            url = u;
            return respuestaFetch({ json: { choices: [{ message: { content: 'ok' } }] } });
        }, async () => {
            await p.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
        });
        assert.strictEqual(url, 'https://api.reto.pltk.mx/v1/chat/completions');
    });
});

// ==================================================================
// R5. ERRORES ÚTILES SIN SECRETOS
// ==================================================================
test('reto(R5): 401 incluye pista sobre RETO_KEY y NO la clave', async () => {
    await conEntorno({ RETO_KEY: CENTINELA }, async () => {
        const p = cargarProviders();
        let e = null;
        await aislar.instalarFetchMock(
            async () => respuestaFetch({ status: 401, json: { error: { message: 'invalid key' } } }),
            async () => {
                try {
                    await p.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
                } catch (err) { e = err; }
            }
        );
        assert.ok(e, 'debe lanzar');
        assert.strictEqual(e.status, 401);
        assert.match(e.hint || '', /RETO_KEY/);
        assert.ok(!String(e.message).includes(CENTINELA));
        assert.ok(!JSON.stringify(e.hint || '').includes(CENTINELA));
    });
});

test('reto(R5b): 404 menciona base URL y modelo efectivo; 429 es recuperable', async () => {
    await conEntorno({ RETO_KEY: CENTINELA, RETO_MODEL: 'modelo-x' }, async () => {
        const p = cargarProviders();
        let e404 = null, e429 = null;
        await aislar.instalarFetchMock(
            async () => respuestaFetch({ status: 404, json: { error: { message: 'model not found' } } }),
            async () => {
                try {
                    await p.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
                } catch (err) { e404 = err; }
            }
        );
        await aislar.instalarFetchMock(
            async () => respuestaFetch({ status: 429, json: { error: { message: 'rate limited' } }, retryAfter: '3' }),
            async () => {
                try {
                    await p.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
                } catch (err) { e429 = err; }
            }
        );
        assert.match(e404.hint, /RETO_BASE_URL/);
        assert.match(e404.hint, /modelo-x/);
        assert.strictEqual(e429.recoverable, true);
        assert.strictEqual(e429.retryAfterSeconds, 3);
    });
});

test('reto(R5c): HTTP 200 sin contenido se convierte en error controlado (no éxito falso)', async () => {
    await conEntorno({ RETO_KEY: CENTINELA }, async () => {
        const p = cargarProviders();
        let e = null;
        await aislar.instalarFetchMock(
            async () => respuestaFetch({ json: { id: 'x', choices: [] } }),
            async () => {
                try {
                    await p.PROVIDERS.reto.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
                } catch (err) { e = err; }
            }
        );
        assert.ok(e, 'una respuesta sin texto no puede darse por buena');
        assert.strictEqual(e.status, 502);
    });
});

// ==================================================================
// R6. SIN RESPALDO NO AUTORIZADO
// ==================================================================
test('reto(R6): con AI_FALLBACK_ENABLED=false un 503 del gateway NO cambia de proveedor', async () => {
    await conEntorno({
        AI_PROVIDER: 'reto', RETO_KEY: CENTINELA, GROQ_API_KEY: 'groq-dummy',
        AI_FALLBACK_ENABLED: 'false'
    }, async () => {
        cargarProviders();
        const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
        const cache = require(path.join(BACKEND, 'src/services/cache.service.js'));
        const restaurarCache = aislar.aislarCacheService(cache);
        const destinos = [];
        try {
            await aislar.instalarFetchMock(async (u) => {
                destinos.push(u);
                return respuestaFetch({ status: 503, json: { error: { message: 'gateway caído' } } });
            }, async () => {
                await assert.rejects(
                    () => aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' }),
                    (err) => err.statusCode === 503
                );
            });
            assert.strictEqual(destinos.length, 1, 'una sola llamada: sin respaldo no autorizado');
            assert.ok(destinos.every(u => u.includes('api.reto.pltk.mx')), 'solo debe contactarse el gateway configurado');
        } finally { restaurarCache(); }
    });
});

// ==================================================================
// R7. CREDENCIAL FALTANTE: FALLA ANTES DE LA RED
// ==================================================================
test('reto(R7): sin RETO_KEY el flujo falla explicando qué falta y no contacta nada', async () => {
    await conEntorno({
        AI_PROVIDER: 'reto', GROQ_API_KEY: 'groq-dummy', AI_FALLBACK_ENABLED: 'false'
    }, async () => {
        cargarProviders();
        const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
        const cache = require(path.join(BACKEND, 'src/services/cache.service.js'));
        const restaurarCache = aislar.aislarCacheService(cache);
        let llamadas = 0;
        try {
            await aislar.instalarFetchMock(async () => { llamadas++; return respuestaFetch({}); }, async () => {
                await assert.rejects(
                    () => aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' }),
                    (err) => err.statusCode === 503 && /no está configurado/i.test(err.message)
                );
            });
            assert.strictEqual(llamadas, 0, 'no debe salir a la red sin credencial');
        } finally { restaurarCache(); }
    });
});

test('reto(R7b): la guardia de red del runner sigue activa', async () => {
    await assert.rejects(
        async () => global.fetch('https://api.reto.pltk.mx/v1/models'),
        (e) => /AISLAMIENTO/.test(e.message)
    );
});
