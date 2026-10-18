/**
 * PRUEBAS FASE 5B.6 — Integración del Agente Tutor en el flujo de chat.
 * Herméticas: mocks + guardias de red de la Fase 5A (preload ./test/_setup.js).
 * No usan claves reales, RDS, Redis ni internet.
 *
 * Cubre los 8 requisitos obligatorios:
 *   1. El agente se ejecuta realmente en el flujo de generación.
 *   2. El contexto pedagógico llega al generador de IA (system prompt).
 *   3. El estudiante sigue recibiendo el contrato JSON esperado.
 *   4. Un error del agente no rompe el chat.
 *   5. El agente no filtra errores internos, claves ni datos sensibles.
 *   6. La persistencia desactivada no genera escrituras en BD.
 *   7. Las respuestas educativas siguen respetando el comportamiento socrático.
 *   8. Groq sigue funcionando y el fallback configurado conserva su comportamiento.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

// Carga ai.service + ai.providers frescos con env concreto y un proveedor
// stubeado que captura el `system` recibido y devuelve un texto.
function montarFlujo(env, { capture } = {}) {
    aislar.purgarModulosSrc(path);
    const prev = {};
    for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }

    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const restaurarCache = aislar.aislarCacheService(cacheService);

    const orig = { getProvider: aiProviders.getProvider, getProviderName: aiProviders.getProviderName };
    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({
        configured: () => true, model: () => 'modelo-test', paid: false,
        completion: async (args) => {
            if (capture) capture.system = args.system;
            return { text: 'RESPUESTA TUTOR', inputTokens: 1, outputTokens: 2 };
        }
    });

    return {
        aiService, aiProviders,
        restore: () => {
            aiProviders.getProvider = orig.getProvider;
            aiProviders.getProviderName = orig.getProviderName;
            restaurarCache();
            for (const [k, v] of Object.entries(prev)) {
                if (v === undefined) delete process.env[k]; else process.env[k] = v;
            }
        }
    };
}

// ==================================================================
// 1. EL AGENTE SE EJECUTA EN EL FLUJO
// ==================================================================
test('agente(1): con AGENT_ENABLED=true el plan se ejecuta en el flujo', async () => {
    const { aiService, restore } = montarFlujo({ AGENT_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: 'dummy' });
    try {
        const r = await aiService.generateResponse({ message: 'no entiendo nada', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        assert.ok(r.agentPlan, 'el resultado debe incluir el plan del agente');
        assert.strictEqual(r.agentPlan.action, 'teach'); // intención "no entiendo"
    } finally { restore(); }
});

test('agente(1b): con AGENT_ENABLED desactivado no hay plan (comportamiento previo)', async () => {
    const { aiService, restore } = montarFlujo({ AGENT_ENABLED: 'false', AI_PROVIDER: 'groq', GROQ_API_KEY: 'dummy' });
    try {
        const r = await aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        assert.strictEqual(r.agentPlan, null);
    } finally { restore(); }
});

// ==================================================================
// 2. EL CONTEXTO PEDAGÓGICO LLEGA AL GENERADOR
// ==================================================================
test('agente(2): el system prompt incluye el contexto pedagógico', async () => {
    const capture = {};
    const { aiService, restore } = montarFlujo({ AGENT_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: 'dummy' }, { capture });
    try {
        await aiService.generateResponse({ message: 'dame la respuesta', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        assert.ok(typeof capture.system === 'string');
        assert.ok(capture.system.includes('CONTEXTO PEDAGOGICO DEL TURNO'), 'debe añadirse el bloque pedagógico');
        assert.ok(capture.system.includes('guided_hint'), 'acción esperada para "dame la respuesta"');
    } finally { restore(); }
});

test('agente(2b): sin agente el system prompt NO incluye el bloque pedagógico', async () => {
    const capture = {};
    const { aiService, restore } = montarFlujo({ AGENT_ENABLED: 'false', AI_PROVIDER: 'groq', GROQ_API_KEY: 'dummy' }, { capture });
    try {
        await aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        assert.ok(!capture.system.includes('CONTEXTO PEDAGOGICO DEL TURNO'));
    } finally { restore(); }
});

// ==================================================================
// 3. CONTRATO DE RESPUESTA PRESERVADO
// ==================================================================
test('agente(3): la respuesta conserva {content, model, usage, cost, duration, fromCache}', async () => {
    const { aiService, restore } = montarFlujo({ AGENT_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: 'dummy' });
    try {
        const r = await aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        for (const campo of ['content', 'model', 'usage', 'cost', 'duration', 'fromCache']) {
            assert.ok(campo in r, `falta el campo ${campo}`);
        }
        assert.strictEqual(r.content, 'RESPUESTA TUTOR');
    } finally { restore(); }
});

// ==================================================================
// 4. UN ERROR DEL AGENTE NO ROMPE EL CHAT
// ==================================================================
test('agente(4): si planificarTurno lanza, el chat sigue funcionando', async () => {
    aislar.purgarModulosSrc(path);
    const prev = { AGENT_ENABLED: process.env.AGENT_ENABLED, AI_PROVIDER: process.env.AI_PROVIDER, GROQ_API_KEY: process.env.GROQ_API_KEY };
    process.env.AGENT_ENABLED = 'true'; process.env.AI_PROVIDER = 'groq'; process.env.GROQ_API_KEY = 'dummy';

    // Forzar que el agente real falle.
    const tutorAgent = require(path.join(BACKEND, 'src/services/tutor.agent.js'));
    const origPlan = tutorAgent.planificarTurno;
    tutorAgent.planificarTurno = () => { throw new Error('boom agente'); };

    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const restaurarCache = aislar.aislarCacheService(cacheService);
    const origGet = aiProviders.getProvider, origName = aiProviders.getProviderName;
    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({ configured: () => true, model: () => 'm', paid: false, completion: async () => ({ text: 'OK SIN AGENTE', inputTokens: 1, outputTokens: 1 }) });

    try {
        const r = await aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        assert.strictEqual(r.content, 'OK SIN AGENTE'); // no rompió
        assert.strictEqual(r.agentPlan, null);           // fallback seguro
    } finally {
        tutorAgent.planificarTurno = origPlan;
        aiProviders.getProvider = origGet; aiProviders.getProviderName = origName;
        restaurarCache();
        for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
});

// ==================================================================
// 5. NO FILTRA ERRORES INTERNOS, CLAVES NI DATOS SENSIBLES
// ==================================================================
test('agente(5): el contexto pedagógico no incluye el mensaje del estudiante ni claves', async () => {
    const SECRETO = 'clave-secreta-CENTINELA-999';
    const MENSAJE = 'texto privado del estudiante 12345';
    const capture = {};
    const { aiService, restore } = montarFlujo({ AGENT_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: SECRETO }, { capture });
    try {
        await aiService.generateResponse({ message: MENSAJE, subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        // El bloque pedagógico añadido NO debe contener la clave ni el mensaje crudo.
        const bloque = capture.system.split('CONTEXTO PEDAGOGICO DEL TURNO')[1] || '';
        assert.ok(!bloque.includes(SECRETO), 'no debe filtrar la clave');
        assert.ok(!bloque.includes(MENSAJE), 'no debe filtrar el mensaje del estudiante');
    } finally { restore(); }
});

// ==================================================================
// 6. PERSISTENCIA DESACTIVADA NO ESCRIBE EN BD
// ==================================================================
test('agente(6): con persistencia desactivada registrarTurno NO llama a query', async () => {
    aislar.purgarModulosSrc(path);
    const prev = { AGENT_PERSISTENCE_ENABLED: process.env.AGENT_PERSISTENCE_ENABLED, AGENT_ENABLED: process.env.AGENT_ENABLED };
    process.env.AGENT_PERSISTENCE_ENABLED = 'false';
    process.env.AGENT_ENABLED = 'true';
    const tutorIntegration = require(path.join(BACKEND, 'src/services/tutor.integration.js'));
    try {
        let llamada = false;
        const queryFalsa = async () => { llamada = true; return { rows: [] }; };
        const r = await tutorIntegration.registrarTurno(queryFalsa, {
            plan: { action: 'teach', competence: 'x', shouldEvaluate: false },
            conversationId: 'c', userId: 'u', subject: 'matematicas', mode: 'socratic'
        });
        assert.strictEqual(llamada, false, 'no debe escribir en BD con persistencia desactivada');
        assert.strictEqual(r.persisted, false);
    } finally {
        for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
});

test('agente(6b): con persistencia activada SÍ intenta registrar (query inyectada)', async () => {
    aislar.purgarModulosSrc(path);
    const prev = { AGENT_PERSISTENCE_ENABLED: process.env.AGENT_PERSISTENCE_ENABLED, AGENT_ENABLED: process.env.AGENT_ENABLED };
    process.env.AGENT_PERSISTENCE_ENABLED = 'true';
    process.env.AGENT_ENABLED = 'true';
    const tutorIntegration = require(path.join(BACKEND, 'src/services/tutor.integration.js'));
    try {
        let llamada = false;
        const queryFalsa = async () => { llamada = true; return { rows: [] }; };
        const r = await tutorIntegration.registrarTurno(queryFalsa, {
            plan: { action: 'teach', competence: 'x', shouldEvaluate: false },
            conversationId: 'c', userId: 'u', subject: 'matematicas', mode: 'socratic'
        });
        assert.strictEqual(llamada, true, 'debe registrar cuando la persistencia está activa');
        assert.strictEqual(r.persisted, true);
    } finally {
        for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
});

// ==================================================================
// 7. COMPORTAMIENTO SOCRÁTICO
// ==================================================================
test('agente(7): primer turno produce acción diagnóstica (socrático, sin revelar)', async () => {
    const { aiService, restore } = montarFlujo({ AGENT_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: 'dummy' });
    try {
        const r = await aiService.generateResponse({ message: 'ayúdame con álgebra', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        assert.strictEqual(r.agentPlan.action, 'diagnostic');
    } finally { restore(); }
});

// ==================================================================
// 8. GROQ Y FALLBACK CONSERVAN SU COMPORTAMIENTO
// ==================================================================
test('agente(8): con agente activo el fallback Groq->reto sigue funcionando', async () => {
    aislar.purgarModulosSrc(path);
    const prev = {};
    const env = {
        AGENT_ENABLED: 'true', AI_PROVIDER: 'groq', GROQ_API_KEY: 'dummy',
        RETO_KEY: 'reto-dummy', AI_FALLBACK_ENABLED: 'true', AI_FALLBACK_PROVIDERS: 'reto'
    };
    for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }

    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const restaurarCache = aislar.aislarCacheService(cacheService);

    const sec = aiProviders.getSecondaryProvider('groq');
    assert.ok(sec && sec.id === 'reto', 'reto debe ser el secundario');

    const origGet = aiProviders.getProvider, origName = aiProviders.getProviderName;
    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({ configured: () => true, model: () => 'm', paid: false, completion: async () => { const e = new Error('bad'); e.status = 401; throw e; } });

    try {
        const res = await aislar.instalarFetchMock(async () => ({
            status: 200, ok: true,
            headers: { get: () => null },
            json: async () => ({ choices: [{ message: { content: 'DESDE RETO' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
        }), async () => aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' }));

        assert.strictEqual(res.content, 'DESDE RETO');
        assert.deepStrictEqual(res.fallback, { from: 'groq', to: 'reto' });
    } finally {
        aiProviders.getProvider = origGet; aiProviders.getProviderName = origName;
        restaurarCache();
        for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
});

test('agente(8b): la guardia de fetch sigue activa tras estas pruebas', async () => {
    await assert.rejects(
        async () => global.fetch('https://api.groq.com/openai/v1/models'),
        (e) => /AISLAMIENTO/.test(e.message)
    );
});
