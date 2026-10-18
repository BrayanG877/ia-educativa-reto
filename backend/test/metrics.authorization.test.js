/**
 * PRUEBAS DE REGRESIÓN — AUTORIZACIÓN DE LA API DE MÉTRICAS.
 * ==================================================================
 * Verifican las correcciones de seguridad aplicadas a:
 *   - GET /api/metrics/user/:userId   (IDOR horizontal)
 *   - GET /api/metrics/ranking        (antes público)
 *   - GET /api/metrics/cache          (antes público)
 *   - validación estricta de ?limit
 *
 * Aislamiento (idéntico a ai.http-endpoint.test.js):
 *   - preload ./test/_setup.js: guardias de red/TCP/DNS + stubs ioredis/mssql.
 *   - `config/database.query` se sustituye por un stub determinista que simula
 *     `users.role` y las consultas de métricas. NUNCA se toca RDS/Redis.
 *   - La app REAL de Express se importa sin arrancar (require.main !== module)
 *     y las peticiones se inyectan con http.IncomingMessage/ServerResponse
 *     sobre un Duplex local: no se abre ningún puerto.
 *   - El JWT se firma con una clave EXCLUSIVA de prueba.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const http = require('http');
const { Duplex } = require('stream');
const jwt = require('jsonwebtoken');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

const TEST_JWT_SECRET = 'metrics-test-only-secret-no-usar-en-produccion';

// Usuarios simulados. UUIDs distintos para cada rol.
const U = {
    alice: '11111111-1111-1111-1111-111111111111', // student
    bob: '22222222-2222-2222-2222-222222222222',   // student (otro)
    profe: '33333333-3333-3333-3333-333333333333', // teacher
    admin: '44444444-4444-4444-4444-444444444444'  // admin
};

// ------------------------------------------------------------------
// Utilidades HTTP in-process (sin red)
// ------------------------------------------------------------------
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

function peticionInProcess(app, { method, url, headers = {} }) {
    return new Promise((resolve, reject) => {
        const sock = socketFalso();
        const req = new http.IncomingMessage(sock);
        req.method = method;
        req.url = url;
        req.socket = sock;
        req.connection = sock;
        req.headers = Object.assign({ 'content-length': 0 }, headers);

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
            req.push(null);
        } catch (e) { reject(e); }
    });
}

// ------------------------------------------------------------------
// Entorno aislado
// ------------------------------------------------------------------
function montarEntorno() {
    aislar.purgarModulosSrc(path);

    const prev = { JWT_SECRET: process.env.JWT_SECRET };
    process.env.JWT_SECRET = TEST_JWT_SECRET;

    const database = require(path.join(BACKEND, 'src/config/database.js'));
    const origQuery = database.query;
    const queries = [];

    const roles = { [U.alice]: 'student', [U.bob]: 'student', [U.profe]: 'teacher', [U.admin]: 'admin' };

    database.query = async (text, params = []) => {
        const t = String(text);
        queries.push({ text: t, params });

        // Rol del usuario: SELECT role FROM users WHERE id = @param1
        if (/FROM users/i.test(t) && /role/i.test(t)) {
            const id = params && params[0];
            return { rows: roles[id] ? [{ role: roles[id] }] : [] };
        }
        // Métricas agregadas / diarias
        if (/FROM user_metrics/i.test(t)) {
            return {
                rows: /SUM\(/i.test(t)
                    ? [{ total_time: 1, total_messages: 2, total_conversations: 1,
                         total_exercises: 3, total_correct: 2, total_topics: 1,
                         total_tokens: 100, total_cost: 0 }]
                    : [{ date: '2026-10-17', time_spent_minutes: 1, messages_sent: 2,
                         exercises_completed: 3, correct_answers: 2 }]
            };
        }
        // Ranking
        if (/FROM student_ranking/i.test(t)) {
            return { rows: [{ username: 'alice', total_time_minutes: 1, total_messages: 2,
                              total_exercises: 3, topics_mastered: 1, score: 9.5 }] };
        }
        return { rows: [] };
    };

    // cache.service se deja inerte (no debe tocar Redis/BD)
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const restaurarCache = aislar.aislarCacheService(cacheService);
    // getCacheStats no está cubierto por aislarCacheService: se stubea.
    const origCacheStats = cacheService.getCacheStats;
    cacheService.getCacheStats = async () => ({ total_entries: 1, total_hits: 0 });
    // El controlador captura `cacheService` como objeto: restaurar los métodos basta.

    // La app REAL (no arranca: require.main !== module).
    const app = require(path.join(BACKEND, 'src/server.js'));

    return {
        app, queries,
        restore: () => {
            database.query = origQuery;
            restaurarCache();
            cacheService.getCacheStats = origCacheStats;
            if (prev.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
            else process.env.JWT_SECRET = prev.JWT_SECRET;
        }
    };
}

function tokenDe(userId, email = `${userId.slice(0, 4)}@test.local`) {
    return jwt.sign({ userId, email }, TEST_JWT_SECRET, { expiresIn: '5m' });
}

function auth(userId) {
    return { authorization: `Bearer ${tokenDe(userId)}` };
}

// ==================================================================
// 1. SIN AUTENTICAR
// ==================================================================
test('metrics(1): ranking sin token -> 401 (ya no es público)', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, { method: 'GET', url: '/api/metrics/ranking' });
        assert.strictEqual(r.status, 401, `esperado 401, recibido ${r.status}: ${r.raw}`);
        assert.strictEqual(r.json.success, false);
        // No debe haberse consultado el ranking
        assert.strictEqual(env.queries.some(q => /student_ranking/i.test(q.text)), false);
    } finally { env.restore(); }
});

test('metrics(2): cache sin token -> 401', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, { method: 'GET', url: '/api/metrics/cache' });
        assert.strictEqual(r.status, 401, `esperado 401, recibido ${r.status}: ${r.raw}`);
    } finally { env.restore(); }
});

test('metrics(3): métricas de usuario sin token -> 401', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, { method: 'GET', url: `/api/metrics/user/${U.alice}` });
        assert.strictEqual(r.status, 401);
    } finally { env.restore(); }
});

// ==================================================================
// 2. ESTUDIANTE: SUS PROPIAS MÉTRICAS
// ==================================================================
test('metrics(4): estudiante consulta SUS métricas -> 200 y contrato {summary,daily}', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: `/api/metrics/user/${U.alice}`, headers: auth(U.alice)
        });
        assert.strictEqual(r.status, 200, `esperado 200, recibido ${r.status}: ${r.raw}`);
        assert.strictEqual(r.json.success, true);
        assert.ok(r.json.data, 'debe existir data');
        assert.ok('summary' in r.json.data, 'falta summary');
        assert.ok('daily' in r.json.data, 'falta daily');
        assert.ok(Array.isArray(r.json.data.daily));
    } finally { env.restore(); }
});

// ==================================================================
// 3. ESTUDIANTE: MÉTRICAS DE OTRO ESTUDIANTE (IDOR)
// ==================================================================
test('metrics(5): estudiante consulta métricas AJENAS -> 403 y NO consulta métricas', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: `/api/metrics/user/${U.bob}`, headers: auth(U.alice)
        });
        assert.strictEqual(r.status, 403, `esperado 403, recibido ${r.status}: ${r.raw}`);
        assert.strictEqual(r.json.success, false);
        assert.match(r.json.message, /No autorizado/i);
        // No debe haberse leído ninguna métrica del otro usuario
        const lecturasMetricas = env.queries.some(q => /FROM user_metrics/i.test(q.text));
        assert.strictEqual(lecturasMetricas, false, 'no debe ejecutarse la consulta de métricas ajenas');
    } finally { env.restore(); }
});

test('metrics(6): token válido de un userId inexistente en BD -> 403, no 500', async () => {
    const env = montarEntorno();
    try {
        const fantasma = '99999999-9999-9999-9999-999999999999';
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: `/api/metrics/user/${U.bob}`, headers: auth(fantasma)
        });
        // No es el propio userId y no tiene rol -> 403
        assert.strictEqual(r.status, 403, `esperado 403, recibido ${r.status}: ${r.raw}`);
    } finally { env.restore(); }
});

// ==================================================================
// 4. PROFESOR / ADMINISTRADOR
// ==================================================================
test('metrics(7): teacher NO asignado consulta métricas de un estudiante -> 403', async () => {
    // El esquema NO tiene relación profesor-alumno verificable, así que el
    // profesor se deniega de forma segura (no existe "profesor asignado").
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: `/api/metrics/user/${U.alice}`, headers: auth(U.profe)
        });
        assert.strictEqual(r.status, 403, `esperado 403, recibido ${r.status}: ${r.raw}`);
        assert.strictEqual(r.json.success, false);
        // No debe haberse leído ninguna métrica
        assert.strictEqual(
            env.queries.some(q => /FROM user_metrics/i.test(q.text)), false,
            'un teacher sin asignación no debe ejecutar la consulta de métricas'
        );
    } finally { env.restore(); }
});

test('metrics(7b): teacher consulta SUS PROPIAS métricas -> no se bloquea por rol', async () => {
    // "Propias" siempre está permitido, sea cual sea el rol.
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: `/api/metrics/user/${U.profe}`, headers: auth(U.profe)
        });
        assert.strictEqual(r.status, 200, `esperado 200, recibido ${r.status}: ${r.raw}`);
    } finally { env.restore(); }
});

test('metrics(8): admin consulta métricas de un estudiante -> 200', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: `/api/metrics/user/${U.bob}`, headers: auth(U.admin)
        });
        assert.strictEqual(r.status, 200);
    } finally { env.restore(); }
});

test('metrics(9): el rol se lee de la BD, no del cliente (JWT manipulado sin rol -> sigue 403)', async () => {
    const env = montarEntorno();
    try {
        // Token firmado válido para un student, con un campo "role":"admin" falsificado
        const token = jwt.sign(
            { userId: U.alice, role: 'admin' },
            TEST_JWT_SECRET, { expiresIn: '5m' }
        );
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: `/api/metrics/user/${U.bob}`,
            headers: { authorization: `Bearer ${token}` }
        });
        assert.strictEqual(r.status, 403, 'el rol afirmado en el token no debe otorgar permisos');
    } finally { env.restore(); }
});

// ==================================================================
// 5. RANKING
// ==================================================================
test('metrics(10): estudiante autenticado consulta ranking -> 200 con identidad reducida', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: '/api/metrics/ranking?limit=5', headers: auth(U.alice)
        });
        assert.strictEqual(r.status, 200, `esperado 200, recibido ${r.status}: ${r.raw}`);
        assert.strictEqual(r.json.success, true);
        assert.ok(Array.isArray(r.json.data.ranking));
        assert.strictEqual(typeof r.json.data.count, 'number');
        const fila = r.json.data.ranking[0];
        assert.ok('username' in fila, 'debe conservar username (contrato/UI)');
        assert.ok('score' in fila, 'debe conservar score');
        assert.strictEqual('id' in fila, false, 'no debe exponer el UUID del estudiante');
        assert.strictEqual('full_name' in fila, false, 'no debe exponer nombre completo');
    } finally { env.restore(); }
});

test('metrics(11): ranking usa SQL parametrizado (TOP (@param1)), sin interpolar el límite', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: '/api/metrics/ranking?limit=5', headers: auth(U.alice)
        });
        assert.strictEqual(r.status, 200);
        const q = env.queries.find(x => /student_ranking/i.test(x.text));
        assert.ok(q, 'debe ejecutarse la consulta del ranking');
        assert.match(q.text, /TOP\s*\(\s*@param1\s*\)/i, 'TOP debe usar parámetro');
        assert.strictEqual(q.params[0], 5, 'el parámetro debe ser el entero validado');
    } finally { env.restore(); }
});

// ==================================================================
// 6. VALIDACIÓN DE ?limit
// ==================================================================
test('metrics(12): limit inválido -> 400 y no ejecuta SQL', async () => {
    const env = montarEntorno();
    const invalidos = ['0', '-1', '-5', '1.5', '2.0', 'abc', '5abc', '1e3', '101', '1000', '+5', '0x10'];
    try {
        for (const limit of invalidos) {
            const r = await peticionInProcess(env.app, {
                method: 'GET', url: `/api/metrics/ranking?limit=${encodeURIComponent(limit)}`,
                headers: auth(U.alice)
            });
            assert.strictEqual(r.status, 400, `limit="${limit}" debía ser 400, fue ${r.status}`);
            assert.strictEqual(r.json.success, false);
        }
        assert.strictEqual(
            env.queries.some(q => /student_ranking/i.test(q.text)), false,
            'ningún limit inválido debe llegar a la consulta'
        );
    } finally { env.restore(); }
});

test('metrics(13): límites válidos 1 y 100 -> 200; sin limit -> default 10', async () => {
    const env = montarEntorno();
    try {
        for (const [url, esperado] of [['/api/metrics/ranking?limit=1', 1],
                                       ['/api/metrics/ranking?limit=100', 100],
                                       ['/api/metrics/ranking', 10]]) {
            const r = await peticionInProcess(env.app, { method: 'GET', url, headers: auth(U.alice) });
            assert.strictEqual(r.status, 200, `${url} debía ser 200, fue ${r.status}`);
            const q = env.queries.filter(x => /student_ranking/i.test(x.text)).pop();
            assert.strictEqual(q.params[0], esperado, `${url} debía usar limit=${esperado}`);
        }
    } finally { env.restore(); }
});

// ==================================================================
// 7. ESTADÍSTICAS DE CACHÉ (ADMIN)
// ==================================================================
test('metrics(14): cache como student -> 403; como teacher -> 403 (solo admin)', async () => {
    const env = montarEntorno();
    try {
        for (const uid of [U.alice, U.profe]) {
            const r = await peticionInProcess(env.app, { method: 'GET', url: '/api/metrics/cache', headers: auth(uid) });
            assert.strictEqual(r.status, 403, `${uid} debía recibir 403, fue ${r.status}`);
        }
    } finally { env.restore(); }
});

test('metrics(15): cache como admin -> 200 con el contrato {data:{...}}', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, { method: 'GET', url: '/api/metrics/cache', headers: auth(U.admin) });
        assert.strictEqual(r.status, 200, `esperado 200, recibido ${r.status}: ${r.raw}`);
        assert.strictEqual(r.json.success, true);
        assert.ok(r.json.data && typeof r.json.data === 'object');
    } finally { env.restore(); }
});

// ==================================================================
// 8. CONTRATOS EXISTENTES QUE NO DEBEN ROMPERSE
// ==================================================================
test('metrics(16): GET /api/metrics/stats (usuario actual) sigue funcionando', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: '/api/metrics/stats', headers: auth(U.alice)
        });
        // Requiere la vista user_statistics, que el stub devuelve vacía -> 404.
        // Lo importante: NO es 401/403 y no se rompe el middleware.
        assert.ok([200, 404].includes(r.status), `estado inesperado: ${r.status}`);
        assert.strictEqual(r.status === 401 || r.status === 403, false);
    } finally { env.restore(); }
});

test('metrics(17): las guardias de red siguen activas (no hubo conexiones)', async () => {
    await assert.rejects(async () => global.fetch('https://sql.example.net'), (e) => /AISLAMIENTO/.test(e.message));
    await assert.rejects(() => require('dns').promises.lookup('example.com'), (e) => /AISLAMIENTO/.test(e.message));
});
