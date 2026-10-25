/**
 * PANEL DOCENTE — Autorización, autorización horizontal y analítica
 * ==================================================================
 * Verifica lo que hace segura y real la funcionalidad:
 *   1. Un profesor NO ve grupos ajenos aunque cambie el id en la URL.
 *   2. Un estudiante NO accede al panel docente (403).
 *   3. Sin asignación -> 403; con asignación -> 200.
 *   4. Las estadísticas se CALCULAN en el servidor (no llegan del cliente).
 *   5. Sin datos suficientes se responde 'insuficientes', sin inventar.
 *   6. Los DTO no filtran email ni password_hash.
 *   7. Los parámetros se validan (400 ante entradas malformadas).
 *
 * Todas las pruebas usan el stub de BD: NO se contacta con SQL Server.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const http = require('http');
const { Duplex } = require('stream');
const jwt = require('jsonwebtoken');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

const TEST_JWT_SECRET = 'panel-docente-test-secret-solo-pruebas';
const TEACHER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeee';
const OTHER_TEACHER_ID = 'ffff-1111-2222-3333-444';
const STUDENT_ID = '9999aaaa-bbbb-4ccc-8ddd-eeee00001111';
const STUDENT_OUTSIDE_GROUP = '8888aaaa-bbbb-4ccc-8ddd-eeee00002222';
const GROUP_AUTH = 701;
const GROUP_FOREIGN = 999;

// ------------------------------------------------------------------
// Arnés HTTP in-process (sin red)
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

// ------------------------------------------------------------------
// Invalida la caché de src/ para que el próximo `require` reconstruya los
// módulos (y por tanto capturen el stub de BD vigente).
//
// NOTA: `aislar.purgarModulosSrc` compara rutas con `path.join('backend','src')`,
// que no coincide en un sistema de archivos con otro separador. Aquí se usa una
// comprobación insensible a mayúsculas y a separadores.
// ------------------------------------------------------------------
function invalidaSrc() {
    const marcador = `${path.sep}src${path.sep}`;
    for (const k of Object.keys(require.cache)) {
        if (k.toLowerCase().includes(marcador.toLowerCase())) {
            delete require.cache[k];
        }
    }
}

// ------------------------------------------------------------------
// Stub de base de datos: simula las relaciones reales del panel.
// ------------------------------------------------------------------
/**
 * El stub responde a las consultas del panel según la relación:
 *   TEACHER_ID  -> asignado a (matematicas, GROUP_AUTH)
 *   STUDENT_ID  -> matriculado en GROUP_AUTH
 *   STUDENT_OUTSIDE_GROUP -> NO matriculado en GROUP_AUTH
 */
function crearStubBD() {
    const consultas = [];
    return {
        consultas,
        async query(text, params = []) {
            const t = String(text);
            consultas.push({ text: t, params });

            // loadUserRole: 'SELECT role FROM users WHERE id = @param1'
            if (/SELECT\s+role\s+FROM\s+users/i.test(t)) {
                if (params[0] === TEACHER_ID || params[0] === OTHER_TEACHER_ID) {
                    return { rows: [{ role: 'teacher' }] };
                }
                return { rows: [{ role: 'student' }] };
            }
            if (/FROM users\s+WHERE id = @param1/i.test(t)) {
                return { rows: [{ id: params[0], role: 'teacher', is_active: 1 }] };
            }

            // Asignaciones del profesor (panel).
            // IMPORTANTE: el texto es idéntico al de profesorTieneGrupo salvo el
            // JOIN; ambas empiezan por "FROM teacher_assignments ta".
            if (/FROM teacher_assignments ta\s+JOIN class_groups/i.test(t)) {
                if (params[0] !== TEACHER_ID) return { rows: [] };
                return {
                    rows: [{
                        groupId: GROUP_AUTH, groupCode: '701', groupName: 'Grupo 701',
                        gradeLevel: '7', isDemo: 1, subjectCode: 'matematicas',
                        subjectName: 'Matemáticas', subjectEmoji: '🔢', studentCount: 3
                    }]
                };
            }

            // Verificación de asignación (profesorTieneGrupo)
            if (/FROM teacher_assignments ta/i.test(t)) {
                const [teacherId, subjectCode, groupId] = params;
                const ok = teacherId === TEACHER_ID &&
                           subjectCode === 'matematicas' &&
                           Number(groupId) === GROUP_AUTH;
                return { rows: ok ? [{ ok: 1 }] : [] };
            }

            // Verificación de matrícula (profesorPuedeVerEstudiante)
            if (/FROM group_enrollments\s+WHERE group_id = @param1 AND student_id = @param2/i.test(t)) {
                const [groupId, studentId] = params;
                const ok = Number(groupId) === GROUP_AUTH && studentId === STUDENT_ID;
                return { rows: ok ? [{ ok: 1 }] : [] };
            }

            // Catálogo de temas
            if (/FROM curriculum_topics/i.test(t)) {
                return {
                    rows: [
                        { id: 1, subject_code: 'matematicas', topic: 'Operaciones con fracciones',
                          concept: 'Suma y resta', keywords: 'fraccion,fracciones,numerador' },
                        { id: 2, subject_code: 'matematicas', topic: 'Ecuaciones de primer grado',
                          concept: 'Transposición', keywords: 'ecuacion,ecuaciones,despejar' }
                    ]
                };
            }

            // Asignaciones del profesor (ya resuelto arriba)

            // Estudiantes del grupo
            if (/FROM group_enrollments ge\s+JOIN users u/i.test(t)) {
                return {
                    rows: [
                        { id: STUDENT_ID, fullName: 'Estudiante Uno', academicId: 'alumno1',
                          gradeLevel: '7', eventCount: 12, lastActivity: new Date(),
                          correctCount: 7, evaluatedCount: 10 },
                        { id: STUDENT_OUTSIDE_GROUP, fullName: 'Estudiante Dos', academicId: 'alumno2',
                          gradeLevel: '7', eventCount: 1, lastActivity: new Date(),
                          correctCount: 0, evaluatedCount: 0 }
                    ]
                };
            }

            // Resumen del grupo.
            // SQL real: SELECT (SELECT COUNT(*) FROM group_enrollments ge ...) AS enrolled,
            //           COUNT(*) AS eventos, COUNT(DISTINCT le.user_id) AS estudiantesActivos, ...
            if (/AS enrolled/i.test(t) && /AS estudiantesActivos/i.test(t)) {
                return {
                    rows: [{
                        enrolled: 3, eventos: 42, estudiantesActivos: 3,
                        aciertos: 20, errores: 15, evaluados: 35, confirmados: 8
                    }]
                };
            }

            // Por tema — GRUPO (vista docente).
            // Solo la consulta de grupo selecciona COUNT(DISTINCT le.user_id).
            if (/GROUP BY le\.topic/i.test(t) && /COUNT\(DISTINCT le\.user_id\)/i.test(t)) {
                return {
                    rows: [
                        { topic: 'Operaciones con fracciones', evidencias: 14, estudiantes: 3,
                          aciertos: 4, errores: 10, evaluados: 14, hipotesis: 0, confirmadas: 4 },
                        { topic: 'Ecuaciones de primer grado', evidencias: 12, estudiantes: 2,
                          aciertos: 11, errores: 1, evaluados: 12, hipotesis: 1, confirmadas: 6 },
                        { topic: 'Proporcionalidad', evidencias: 2, estudiantes: 1,
                          aciertos: 1, errores: 1, evaluados: 2, hipotesis: 2, confirmadas: 0 }
                    ]
                };
            }

            // Errores frecuentes
            if (/GROUP BY le\.error_type/i.test(t)) {
                return { rows: [{ errorType: 'conceptual', total: 9 }, { errorType: 'procedural', total: 4 }] };
            }

            // Evolución
            if (/CONVERT\(date, le\.created_at\)/i.test(t) && /GROUP BY/i.test(t)) {
                return {
                    rows: [
                        { dia: '2026-10-20', aciertos: 5, evaluados: 10, eventos: 12 },
                        { dia: '2026-10-21', aciertos: 7, evaluados: 10, eventos: 11 }
                    ]
                };
            }

            // Perfil: datos del estudiante.
            // SQL real: SELECT u.id, u.full_name AS fullName, u.username AS academicId,
            //                  u.grade_level AS gradeLevel FROM users u WHERE u.id = @param1
            if (/FROM users u\s+WHERE u\.id = @param1/i.test(t)) {
                return { rows: [{ id: params[0], fullName: 'Estudiante Uno',
                    academicId: 'alumno1', gradeLevel: '7' }] };
            }

            // Perfil: totales del estudiante
            if (/AS temasTrabajados/i.test(t)) {
                return {
                    rows: [{
                        eventos: 12, temasTrabajados: 2,
                        primeraActividad: new Date(Date.now() - 10 * 86400000),
                        ultimaActividad: new Date(),
                        evaluados: 10, aciertos: 4, sin_ayuda: 0, con_ayuda: 4,
                        errores: 6, confirmados: 4
                    }]
                };
            }

            // Perfil: por tema
            if (/MIN\(le\.created_at\) AS desde/i.test(t)) {
                return {
                    rows: [
                        { topic: 'Operaciones con fracciones', evidencias: 8, aciertos: 2,
                          errores: 6, evaluados: 8, confirmadas: 4, desde: new Date(), hasta: new Date() }
                    ]
                };
            }

            // Perfil: señales de error
            if (/le\.needs_more_evidence AS hipotesis/i.test(t)) {
                return {
                    rows: [{
                        topic: 'Operaciones con fracciones', errorType: 'conceptual',
                        evidence: 'evento_sintetico', at: new Date(), confidence: 0.7, hipotesis: 0
                    }]
                };
            }

            return { rows: [], rowCount: 0 };
        }
    };
}

function montarEntorno(opciones = {}) {
    // AISLAMIENTO ENTRE PRUEBAS.
    // auth.middleware y los controladores guardan una referencia a `query` en
    // el momento de cargarse. Si un test anterior dejó módulos en caché con el
    // stub viejo, el siguiente test reutilizaría esa referencia y vería datos
    // del test anterior.
    invalidaSrc();

    const prev = {};
    const ENV = {
        JWT_SECRET: TEST_JWT_SECRET,
        NODE_ENV: 'test',
        AGENT_ENABLED: 'false',
        AGENT_PERSISTENCE_ENABLED: 'false'
    };
    for (const [k, v] of Object.entries(ENV)) { prev[k] = process.env[k]; process.env[k] = v; }

    const database = require(path.join(BACKEND, 'src/config/database.js'));
    const origQuery = database.query;
    const stub = crearStubBD();
    database.query = stub.query;

    // El stub activo puede sustituirse antes de cargar la app (casos de fallo).
    if (typeof opciones.query === 'function') database.query = opciones.query;

    const app = require(path.join(BACKEND, 'src/server.js'));

    return {
        app,
        database,
        consultas: stub.consultas,
        restore() {
            database.query = origQuery;
            for (const [k, v] of Object.entries(prev)) {
                if (v === undefined) delete process.env[k]; else process.env[k] = v;
            }
            // Se descarta la app y todos los módulos que la caché arrastra, para
            // que el siguiente test construya su propia instancia con su stub.
            invalidaSrc();
        }
    };
}

function token(role_user) {
    return jwt.sign(
        { userId: role_user, email: 'x@local.test' },
        TEST_JWT_SECRET,
        { expiresIn: '5m' }
    );
}

function auth(userId) {
    return { authorization: `Bearer ${token(userId)}` };
}

// ==================================================================
// 1. Autenticación y rol
// ==================================================================
test('panel(1): sin token -> 401', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: '/api/teacher/groups'
        });
        assert.strictEqual(r.status, 401);
    } finally { env.restore(); }
});

test('panel(2): estudiante autenticado -> 403 en todas las rutas del panel', async () => {
    const env = montarEntorno();
    try {
        const rutas = [
            '/api/teacher/groups',
            `/api/teacher/groups/${GROUP_AUTH}/students?subject=matematicas`,
            `/api/teacher/groups/${GROUP_AUTH}/stats?subject=matematicas`,
            `/api/teacher/groups/${GROUP_AUTH}/students/${STUDENT_ID}?subject=matematicas`
        ];
        for (const url of rutas) {
            const r = await peticionInProcess(env.app, {
                method: 'GET', url, headers: auth(STUDENT_ID)
            });
            assert.strictEqual(r.status, 403, `La ruta ${url} debe denegar a un estudiante`);
        }
    } finally { env.restore(); }
});

test('panel(3): token con userId falsificado no otorga rol docente (el rol se lee de la BD)', async () => {
    const env = montarEntorno();
    try {
        // Token firmado correctamente pero para un usuario cuyo rol en BD es student.
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: '/api/teacher/groups', headers: auth(STUDENT_ID)
        });
        assert.strictEqual(r.status, 403);
    } finally { env.restore(); }
});

// ==================================================================
// 2. Grupos del profesor
// ==================================================================
test('panel(4): profesor con asignación -> 200 y solo sus grupos', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: '/api/teacher/groups', headers: auth(TEACHER_ID)
        });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.json.success, true);
        assert.ok(Array.isArray(r.json.data.groups));
        assert.strictEqual(r.json.data.groups.length, 1);
        const g = r.json.data.groups[0];
        assert.strictEqual(g.groupId, GROUP_AUTH);
        assert.strictEqual(g.assignments[0].subjectCode, 'matematicas');
    } finally { env.restore(); }
});

test('panel(5): profesor sin asignación -> lista vacía (no 500)', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET', url: '/api/teacher/groups', headers: auth(OTHER_TEACHER_ID)
        });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.json.data.count, 0);
    } finally { env.restore(); }
});

// ==================================================================
// 3. Autorización horizontal (IDOR)
// ==================================================================
test('panel(6): IDOR — profesor consulta un grupo ajeno -> 403', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET',
            url: `/api/teacher/groups/${GROUP_FOREIGN}/students?subject=matematicas`,
            headers: auth(TEACHER_ID)
        });
        assert.strictEqual(r.status, 403, 'Cambiar el groupId no debe dar acceso');
    } finally { env.restore(); }
});

test('panel(7): IDOR — profesor consulta otra asignatura en su grupo -> 403', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET',
            url: `/api/teacher/groups/${GROUP_AUTH}/students?subject=biologia`,
            headers: auth(TEACHER_ID)
        });
        assert.strictEqual(r.status, 403, 'La asignatura debe estar en la asignación');
    } finally { env.restore(); }
});

test('panel(8): IDOR — profesor abre el perfil de un estudiante de otro grupo -> 403', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET',
            url: `/api/teacher/groups/${GROUP_AUTH}/students/${STUDENT_OUTSIDE_GROUP}?subject=matematicas`,
            headers: auth(TEACHER_ID)
        });
        assert.strictEqual(r.status, 403);
    } finally { env.restore(); }
});

test('panel(9): profesor abre el perfil de SU estudiante -> 200', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET',
            url: `/api/teacher/groups/${GROUP_AUTH}/students/${STUDENT_ID}?subject=matematicas`,
            headers: auth(TEACHER_ID)
        });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.json.success, true);
    } finally { env.restore(); }
});

// ==================================================================
// 4. Validación de parámetros
// ==================================================================
test('panel(10): parámetros inválidos -> 400 sin llegar a la BD', async () => {
    const env = montarEntorno();
    try {
        const casos = [
            '/api/teacher/groups/abc/students?subject=matematicas',
            `/api/teacher/groups/0/students?subject=matematicas`,
            `/api/teacher/groups/${GROUP_AUTH}/students?subject=MATEMATICAS%20DROP`,
            `/api/teacher/groups/${GROUP_AUTH}/stats?subject=matematicas&days=9999`,
            `/api/teacher/groups/${GROUP_AUTH}/stats?subject=matematicas&days=abc`,
            `/api/teacher/groups/${GROUP_AUTH}/students/estudiante-invalido?subject=matematicas`
        ];
        for (const url of casos) {
            const r = await peticionInProcess(env.app, {
                method: 'GET', url, headers: auth(TEACHER_ID)
            });
            assert.strictEqual(r.status, 400, `Debe rechazar con 400: ${url}`);
        }    } finally { env.restore(); }
});

// ==================================================================
// 5. Cálculo de estadísticas (en servidor, sobre datos reales)
// ==================================================================
test('panel(11): estadísticas calculadas en servidor con valores correctos', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET',
            url: `/api/teacher/groups/${GROUP_AUTH}/stats?subject=matematicas&days=30`,
            headers: auth(TEACHER_ID)
        });
        assert.strictEqual(r.status, 200);
        const d = r.json.data;

        assert.strictEqual(d.status, 'ok');
        assert.strictEqual(d.enrolled, 3);

        // tasaAcierto = aciertos / evaluados = 20/35 = 0.57
        assert.strictEqual(d.tasaAcierto, 0.57);
        assert.strictEqual(d.evaluados, 35);

        // Clasificación por tema según umbrales documentados
        const fracciones = d.temas.find(t => t.topic === 'Operaciones con fracciones');
        assert.strictEqual(fracciones.estado, 'refuerzo', '4/14 = 28% < 50%');

        const ecuaciones = d.temas.find(t => t.topic === 'Ecuaciones de primer grado');
        assert.strictEqual(ecuaciones.estado, 'favorable', '11/12 = 92% >= 75%');

        const proporcion = d.temas.find(t => t.topic === 'Proporcionalidad');
        assert.strictEqual(proporcion.estado, 'insuficiente', 'Solo 2 evidencias < 3');

        // Las listas derivadas deben ser coherentes
        assert.strictEqual(d.temasRefuerzo.length, 1);
        assert.strictEqual(d.temasFavorables.length, 1);

        // Definiciones expuestas para auditoría del indicador
        assert.ok(d.definiciones.tasaAcierto);
    } finally { env.restore(); }
});

test('panel(12): datos insuficientes -> estado explícito, sin inventar valores', async () => {
    // Stub con muy pocos eventos: se instala ANTES de cargar la app.
    const base = crearStubBD();
    const pocosEventos = async (text, params) => {
        const t = String(text);
        if (/AS enrolled/i.test(t) && /AS estudiantesActivos/i.test(t)) {
            return { rows: [{ enrolled: 3, eventos: 4, estudiantesActivos: 1,
                              aciertos: 1, errores: 1, evaluados: 2, confirmados: 0 }] };
        }
        return base.query(text, params);
    };

    const env = montarEntorno({ query: pocosEventos });
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET',
            url: `/api/teacher/groups/${GROUP_AUTH}/stats?subject=matematicas`,
            headers: auth(TEACHER_ID)
        });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.json.data.status, 'insuficientes');
        assert.strictEqual(r.json.data.eventos, 4);
        assert.ok(r.json.data.minimoRequerido > 4);
        // NO debe incluir métricas calculadas que podrían malinterpretarse
        assert.strictEqual(r.json.data.tasaAcierto, undefined);
    } finally { env.restore(); }
});

// ==================================================================
// 6. Privacidad de los DTO
// ==================================================================
test('panel(13): la lista de estudiantes NO expone email ni hashes', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET',
            url: `/api/teacher/groups/${GROUP_AUTH}/students?subject=matematicas`,
            headers: auth(TEACHER_ID)
        });
        assert.strictEqual(r.status, 200);
        const bruto = JSON.stringify(r.json);
        assert.ok(!/password_hash/i.test(bruto), 'No debe aparecer password_hash');
        assert.ok(!/@local\.test/.test(bruto), 'No debe aparecer el email');
        assert.ok(!/"email"/i.test(bruto), 'No debe existir campo email');

        // Solo las claves previstas
        const claves = Object.keys(r.json.data.students[0]).sort();
        assert.deepStrictEqual(claves, [
            'academicId', 'eventCount', 'fullName', 'id',
            'lastActivity', 'tasaAcierto', 'tieneDatos'
        ]);
    } finally { env.restore(); }
});

test('panel(14): el perfil individual incluye dificultades, fortalezas y recomendaciones', async () => {
    const env = montarEntorno();
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET',
            url: `/api/teacher/groups/${GROUP_AUTH}/students/${STUDENT_ID}?subject=matematicas`,
            headers: auth(TEACHER_ID)
        });
        assert.strictEqual(r.status, 200);
        const d = r.json.data;
        assert.strictEqual(d.status, 'ok');
        assert.ok(Array.isArray(d.dificultades));
        assert.ok(Array.isArray(d.fortalezas));
        assert.ok(Array.isArray(d.recomendaciones));

        // 2/8 = 25% -> refuerzo, y la recomendación debe citar la evidencia
        assert.strictEqual(d.dificultades.length, 1);
        assert.strictEqual(d.dificultades[0].topic, 'Operaciones con fracciones');

        const refuerzo = d.recomendaciones.find(x => x.tipo === 'refuerzo_tema');
        assert.ok(refuerzo, 'Debe generar recomendación de refuerzo');
        // La recomendación se justifica con los valores REALES del tema
        // (estructurados, no con dígitos sueltos en un texto).
        assert.strictEqual(refuerzo.evidencia.topic, 'Operaciones con fracciones');
        assert.strictEqual(refuerzo.evidencia.errores, 6);
        assert.strictEqual(refuerzo.evidencia.evaluados, 8);
        assert.strictEqual(refuerzo.prioridad, 'alta');
        assert.ok(refuerzo.accionSugerida.length > 0, 'incluye acción concreta');
    } finally { env.restore(); }
});

// ==================================================================
// 7. Fallback seguro si la migración no está aplicada
// ==================================================================
test('panel(15): si la BD falla, la autorización DENIEGA (fail-closed)', async () => {
    // El stub que falla se instala ANTES de cargar la app, de modo que el
    // middleware y el controlador capturen esa referencia desde el inicio.
    const fallando = async (text) => {
        if (/FROM teacher_assignments/i.test(String(text))) {
            throw new Error('tabla inexistente');
        }
        return { rows: [] };
    };

    const env = montarEntorno({ query: fallando });
    try {
        const r = await peticionInProcess(env.app, {
            method: 'GET',
            url: `/api/teacher/groups/${GROUP_AUTH}/stats?subject=matematicas`,
            headers: auth(TEACHER_ID)
        });
        assert.strictEqual(r.status, 403,
            `Un fallo de BD NO debe conceder acceso (obtuvo ${r.status}: ${r.raw.slice(0, 160)})`);
    } finally { env.restore(); }
});
