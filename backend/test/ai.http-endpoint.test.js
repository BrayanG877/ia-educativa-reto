/**
 * PRUEBAS FASE 5D.4 — VALIDACIÓN HTTP CONTROLADA DEL AGENTE TUTOR IA.
 * ==================================================================
 * Objetivo: ejercitar el ENDPOINT REAL de chat (POST /api/chat/message)
 * a través de la app de Express REAL (src/server.js), sin abrir puertos,
 * sin tocar SQL Server, Redis, ni ningún servicio externo.
 *
 * Cómo se logra el "HTTP real" sin red:
 *   - La app se importa SIN arrancar (server.js sólo llama a app.listen
 *     cuando require.main === module, ver Fase 5B.8).
 *   - La petición se inyecta con objetos REALES de Node (http.IncomingMessage
 *     + http.ServerResponse sobre un socket Duplex local) y app.handle().
 *     Es exactamente el mecanismo interno de supertest: NO se abre ningún
 *     socket de red ni puerto.
 *   - El pipeline completo de Express se mantiene intacto: enrutamiento,
 *     optionalAuth, rate-limit, authenticateToken (JWT REAL), controlador y
 *     errorHandler.
 *
 * Aislamiento:
 *   - Preload ./test/_setup.js: guardias de red/TCP/DNS + stubs de ioredis/mssql.
 *   - `config/database.query` se sustituye por un stub determinista ANTES de
 *     cargar el controlador (que captura `query` por destructuring).
 *   - El proveedor de IA se simula (getProvider/getProviderName + completion).
 *   - cache.service se deja inerte (getFromCache/saveToCache).
 *   - AGENT_PERSISTENCE_ENABLED=false: registrarTurno NO debe escribir.
 *   - NO se usa ni se imprime ningún secreto real; el JWT se firma con una
 *     clave EXCLUSIVA de prueba.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const http = require('http');
const { Duplex } = require('stream');
const jwt = require('jsonwebtoken');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

// Clave JWT EXCLUSIVA de esta prueba. Nunca se usa la de .env ni se imprime.
const TEST_JWT_SECRET = 'fase5d4-test-only-secret-no-usar-en-produccion';
const TEST_USER_ID = 'usuario-test-5d4';
const CONV_UUID = '11111111-1111-1111-1111-111111111111';

// ------------------------------------------------------------------
// Utilidades de aislamiento y de petición HTTP in-process
// ------------------------------------------------------------------

/** Socket local (Duplex) con la superficie mínima que Node/Express esperan. */
function socketFalso() {
    const s = new Duplex({ read() { }, write(chunk, enc, cb) { cb(); } });
    s.remoteAddress = '127.0.0.1';
    s.remotePort = 12345;
    s.destroyed = false;
    s.setTimeout = () => s;
    s.setNoDelay = () => s;
    s.setKeepAlive = () => s;
    return s;
}

/**
 * Ejecuta una petición HTTP contra la app de Express SIN red.
 * Devuelve { status, json, raw }.
 */
function peticionInProcess(app, { method, url, headers = {}, body = null }) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : '';
        const sock = socketFalso();
        const req = new http.IncomingMessage(sock);
        req.method = method;
        req.url = url;
        req.socket = sock;
        req.connection = sock;
        req.headers = Object.assign(
            { 'content-length': Buffer.byteLength(payload) },
            headers
        );

        const res = new http.ServerResponse(req);
        res.assignSocket(sock);

        let raw = '';
        const origEnd = res.end.bind(res);
        res.end = function (data, enc) {
            if (data) raw += Buffer.isBuffer(data) ? data.toString() : String(data);
            let json = null;
            try { json = JSON.parse(raw); } catch (_) { json = null; }
            resolve({ status: res.statusCode, json, raw });
            return origEnd(data, enc);
        };

        try {
            app.handle(req, res);
            if (payload) req.push(payload);
            req.push(null);
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Prepara el entorno aislado: env de prueba, stub de BD, proveedor simulado,
 * caché inerte y purga de módulos de src/. Devuelve todo lo necesario para
 * restaurar y para inspeccionar lo capturado.
 */
function montarEntorno({ proveedor, fallbackProvider } = {}) {
    aislar.purgarModulosSrc(path);

    const ENV = {
        JWT_SECRET: TEST_JWT_SECRET,
        AGENT_ENABLED: 'true',
        AGENT_PERSISTENCE_ENABLED: 'false', // REQUISITO: persistencia OFF
        AI_PROVIDER: 'groq',
        GROQ_API_KEY: 'dummy',
        AI_FALLBACK_ENABLED: 'false',
        NODE_ENV: 'test'
    };
    const prev = {};
    for (const [k, v] of Object.entries(ENV)) { prev[k] = process.env[k]; process.env[k] = v; }

    // --- Aislamiento de SQL Server: stub determinista de database.query ---
    const database = require(path.join(BACKEND, 'src/config/database.js'));
    const origQuery = database.query;
    const queries = [];
    let insertConvCount = 0;
    database.query = async (text) => {
        queries.push(String(text).trim());
        const t = String(text);
        if (/FROM subjects/i.test(t)) return { rows: [{ id: 1 }] };
        if (/INSERT INTO conversations/i.test(t)) {
            insertConvCount += 1;
            return { rows: [{ id: CONV_UUID }] };
        }
        if (/SELECT id FROM conversations/i.test(t)) return { rows: [{ id: CONV_UUID }] };
        if (/FROM messages/i.test(t)) return { rows: [] };
        return { rows: [], rowCount: 0 };
    };

    // --- Aislamiento del proveedor de IA (sin red) ---
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
    const origGet = aiProviders.getProvider;
    const origName = aiProviders.getProviderName;
    const capturado = { system: null, llamadas: 0 };
    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({
        configured: () => true,
        model: () => 'modelo-test',
        paid: false,
        completion: async (args) => {
            capturado.llamadas += 1;
            capturado.system = args && args.system;
            if (typeof proveedor === 'function') return proveedor(args);
            return { text: 'RESPUESTA TUTOR SIMULADA', inputTokens: 1, outputTokens: 2 };
        }
    });
    // Si se pide, el secundario también se simula (para el escenario de fallback).
    let origSec = null;
    if (typeof fallbackProvider === 'function') {
        origSec = aiProviders.getSecondaryProvider;
        aiProviders.getSecondaryProvider = () => ({ id: 'reto', provider: fallbackProvider() });
    }

    // --- Caché inerte ---
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const restaurarCache = aislar.aislarCacheService(cacheService);

    // --- Importar la app REAL (no arranca: require.main !== module) ---
    const app = require(path.join(BACKEND, 'src/server.js'));

    return {
        app, aiService, aiProviders, database, capturado, queries, insertConvCountRef: () => insertConvCount,
        restore: () => {
            database.query = origQuery;
            aiProviders.getProvider = origGet;
            aiProviders.getProviderName = origName;
            if (origSec) aiProviders.getSecondaryProvider = origSec;
            restaurarCache();
            for (const [k, v] of Object.entries(prev)) {
                if (v === undefined) delete process.env[k]; else process.env[k] = v;
            }
        }
    };
}

function tokenValido() {
    return jwt.sign({ userId: TEST_USER_ID, email: 'test5d4@local.test' }, TEST_JWT_SECRET, { expiresIn: '5m' });
}

const MENSAJE_EDUCATIVO = 'no entiendo nada de matematicas, explícame por favor';
const BODY_OK = { message: MENSAJE_EDUCATIVO, subject: 'matematicas', mode: 'socratic' };

// ==================================================================
// 1. AUTENTICACIÓN REAL: token válido -> 200 con contrato JSON
// ==================================================================
test('http(1): token válido -> 200 y contrato JSON del endpoint', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'POST', url: '/api/chat/message',
            headers: { authorization: `Bearer ${tokenValido()}`, 'content-type': 'application/json' },
            body: BODY_OK
        });

        assert.strictEqual(r.status, 200, `esperado 200, recibido ${r.status}: ${r.raw}`);
        assert.ok(r.json, 'la respuesta debe ser JSON parseable');
        assert.strictEqual(r.json.success, true);
        assert.ok(r.json.data, 'debe existir data');
        for (const campo of ['conversationId', 'response', 'model', 'usage', 'cost', 'fromCache', 'duration']) {
            assert.ok(campo in r.json.data, `falta el campo de contrato: ${campo}`);
        }
        assert.strictEqual(r.json.data.response, 'RESPUESTA TUTOR SIMULADA');
        assert.strictEqual(r.json.data.model, 'modelo-test');
        assert.strictEqual(r.json.data.conversationId, CONV_UUID);
    } finally { env.restore(); }
});

// ==================================================================
// 2. AUTENTICACIÓN REAL: sin token -> 401
// ==================================================================
test('http(2): sin token -> 401 (middleware JWT intacto)', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'POST', url: '/api/chat/message',
            headers: { 'content-type': 'application/json' },
            body: BODY_OK
        });
        assert.strictEqual(r.status, 401, `esperado 401, recibido ${r.status}`);
        assert.strictEqual(r.json.success, false);
        assert.match(r.json.message, /Token de autenticación requerido/i);
        // El proveedor NO debe haberse invocado.
        assert.strictEqual(env.capturado.llamadas, 0, 'sin auth no debe llamarse al proveedor');
    } finally { env.restore(); }
});

// ==================================================================
// 3. AUTENTICACIÓN REAL: token inválido -> 401
// ==================================================================
test('http(3): token inválido -> 401 (firma no verificable)', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'POST', url: '/api/chat/message',
            headers: { authorization: 'Bearer token.invalido.xxx', 'content-type': 'application/json' },
            body: BODY_OK
        });
        assert.strictEqual(r.status, 401, `esperado 401, recibido ${r.status}`);
        assert.strictEqual(r.json.success, false);
        assert.match(r.json.message, /Token inválido|Token de autenticación/i);
        assert.strictEqual(env.capturado.llamadas, 0, 'con token inválido no debe llamarse al proveedor');
    } finally { env.restore(); }
});

// ==================================================================
// 4. AISLAMIENTO DEL PROVEEDOR: contexto pedagógico llega al proveedor
// ==================================================================
test('http(4): el contexto pedagógico del agente llega al proveedor simulado', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'POST', url: '/api/chat/message',
            headers: { authorization: `Bearer ${tokenValido()}`, 'content-type': 'application/json' },
            body: BODY_OK
        });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(env.capturado.llamadas, 1, 'el proveedor simulado debe invocarse exactamente una vez');
        assert.ok(typeof env.capturado.system === 'string', 'el proveedor debe recibir un system prompt');
        assert.ok(
            env.capturado.system.includes('CONTEXTO PEDAGOGICO DEL TURNO'),
            'el system prompt debe incluir el bloque pedagógico del agente'
        );
    } finally { env.restore(); }
});

// ==================================================================
// 5. FALLBACK ante error simulado del proveedor (secundario simulado)
// ==================================================================
test('http(5): error recuperable del proveedor primario usa el fallback simulado', async () => {
    // Primario falla con 401 (recuperable); secundario simulado responde.
    const primario = async () => { const e = new Error('credenciales simuladas'); e.status = 401; throw e; };
    const secundarioFactory = () => ({
        configured: () => true, model: () => 'modelo-reto', paid: false,
        completion: async () => ({ text: 'RESPUESTA FALLBACK SIMULADA', inputTokens: 2, outputTokens: 3 })
    });

    // El fallback se habilita SOLO en este escenario y SOLO con proveedores simulados.
    const env = montarEntorno({ proveedor: primario, fallbackProvider: secundarioFactory });
    const prevFallback = process.env.AI_FALLBACK_ENABLED;
    process.env.AI_FALLBACK_ENABLED = 'true';
    // ai.service ya capturó aiConfig; se recarga para que vea el flag activado.
    aislar.purgarModulosSrc(path);
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const restaurarCache = aislar.aislarCacheService(cacheService);

    const origGet = aiProviders.getProvider, origName = aiProviders.getProviderName;
    const origSec = aiProviders.getSecondaryProvider;
    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({ configured: () => true, model: () => 'modelo-test', paid: false, completion: primario });
    aiProviders.getSecondaryProvider = () => ({ id: 'reto', provider: secundarioFactory() });

    try {
        const r = await aiService.generateResponse({
            message: 'no entiendo nada', subject: 'matematicas', history: [], mode: 'socratic', userId: TEST_USER_ID
        });
        assert.strictEqual(r.content, 'RESPUESTA FALLBACK SIMULADA');
        assert.deepStrictEqual(r.fallback, { from: 'groq', to: 'reto' });
    } finally {
        aiProviders.getProvider = origGet;
        aiProviders.getProviderName = origName;
        aiProviders.getSecondaryProvider = origSec;
        restaurarCache();
        if (prevFallback === undefined) delete process.env.AI_FALLBACK_ENABLED;
        else process.env.AI_FALLBACK_ENABLED = prevFallback;
        env.restore();
    }
});

// ==================================================================
// 6. PERSISTENCIA DESACTIVADA: registrarTurno NO escribe evidencia
// ==================================================================
test('http(6): con AGENT_PERSISTENCE_ENABLED=false el flujo no persiste evidencia', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'POST', url: '/api/chat/message',
            headers: { authorization: `Bearer ${tokenValido()}`, 'content-type': 'application/json' },
            body: BODY_OK
        });
        assert.strictEqual(r.status, 200);

        // Ninguna de las queries ejecutadas debe tocar tablas de evidencia del agente.
        const tablasAgente = /agent_evidence|agent_difficulties/i;
        const escrituraAgente = env.queries.some(q => tablasAgente.test(q));
        assert.strictEqual(escrituraAgente, false, 'la persistencia del agente NO debe ejecutar escrituras');
    } finally { env.restore(); }
});

// ==================================================================
// 7. SQL Server y Redis permanecen aislados (guardias activas)
// ==================================================================
test('http(7): las guardias de red/TCP/DNS siguen activas tras las peticiones', async () => {
    // Fetch real bloqueado.
    await assert.rejects(async () => global.fetch('https://api.groq.com/openai/v1/models'), (e) => /AISLAMIENTO/.test(e.message));
    // TCP real bloqueado (incluso localhost).
    await new Promise((resolve, reject) => {
        const net = require('net');
        const s = new net.Socket();
        s.once('error', (e) => {
            try { assert.ok(/AISLAMIENTO/.test(e.message)); resolve(); } catch (err) { reject(err); }
        });
        s.connect(6379, '127.0.0.1');
    });
    // DNS real bloqueado.
    const dns = require('dns');
    await assert.rejects(() => dns.promises.lookup('example.com'), (e) => /AISLAMIENTO/.test(e.message));
});

// ==================================================================
// 8. Validación de entrada preservada (Joi) y mensaje no educativo
// ==================================================================
test('http(8): body inválido (sin message) -> 400 sin invocar al proveedor', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'POST', url: '/api/chat/message',
            headers: { authorization: `Bearer ${tokenValido()}`, 'content-type': 'application/json' },
            body: { subject: 'matematicas', mode: 'socratic' }
        });
        assert.strictEqual(r.status, 400, `esperado 400, recibido ${r.status}: ${r.raw}`);
        assert.strictEqual(r.json.success, false);
        assert.match(r.json.message, /mensaje/i);
        assert.strictEqual(env.capturado.llamadas, 0, 'un body inválido no debe llegar al proveedor');
    } finally { env.restore(); }
});
