/**
 * PRUEBA END-TO-END de la conversación (§18 y §19 del plan)
 * Ejercita exactamente lo que hace el navegador: login -> POST /api/chat/message x3
 * Ejecutar con el servidor arriba: node test-e2e-conversacion.js
 */
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3001';

async function post(path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    let json = null;
    try { json = await res.json(); } catch (_) { json = { _noJson: true }; }
    return { status: res.status, json };
}

(async () => {
    const stamp = Date.now();
    const creds = {
        email: `e2e${stamp}@prueba.com`,
        password: 'Prueba1234',
        username: `e2e${stamp}`.slice(0, 30),
        fullName: 'Estudiante E2E'
    };

    console.log('--- 1) REGISTRO ---');
    let r = await post('/api/auth/register', creds);
    console.log('status:', r.status, '| success:', r.json.success, '| msg:', r.json.message || '');

    console.log('--- 2) LOGIN ---');
    r = await post('/api/auth/login', { email: creds.email, password: creds.password });
    console.log('status:', r.status, '| success:', r.json.success);
    const token = r.json?.data?.token;
    if (!token) {
        console.log('SIN TOKEN. Respuesta:', JSON.stringify(r.json).slice(0, 500));
        process.exit(1);
    }
    console.log('JWT obtenido:', token.slice(0, 12) + '... (len ' + token.length + ')');

    console.log('--- 3) SIN TOKEN (debe ser 401) ---');
    r = await post('/api/chat/message', { message: '¿Qué es una célula?', subject: 'biologia', mode: 'socratic' });
    console.log('status:', r.status, '| msg:', r.json.message);

    const preguntas = [
        '¿Qué es una célula?',
        '¿Y cuál es su función?',
        '¿Puedes darme un ejemplo?'
    ];

    let conversationId = null;
    console.log('--- 4) CONVERSACIÓN DE 3 TURNOS (con conversationId) ---');
    for (const [i, pregunta] of preguntas.entries()) {
        const payload = { message: pregunta, subject: 'biologia', mode: 'socratic', conversationId };
        const t0 = Date.now();
        const res = await post('/api/chat/message', payload, token);
        const ms = Date.now() - t0;

        console.log(`\n[Turno ${i + 1}] "${pregunta}"`);
        console.log(`  enviado conversationId: ${conversationId || '(null, primera vez)'}`);
        console.log(`  HTTP ${res.status} en ${ms}ms`);

        if (res.status !== 200) {
            console.log('  ❌ ERROR:', JSON.stringify(res.json).slice(0, 700));
            break;
        }

        conversationId = res.json.data.conversationId;
        console.log(`  recibido conversationId: ${conversationId}`);
        console.log(`  fromCache: ${res.json.data.fromCache} | modelo: ${res.json.data.model}`);
        console.log(`  respuesta IA: ${String(res.json.data.response).replace(/\s+/g, ' ').slice(0, 220)}...`);
    }

    console.log('\n--- 5) HISTORIAL PERSISTIDO ---');
    let mensajes = [];
    if (conversationId) {
        const res = await fetch(`${BASE}/api/chat/history/${conversationId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const j = await res.json();
        mensajes = j?.data?.messages || [];
        console.log('HTTP', res.status, '| mensajes guardados:', j?.data?.count);
        mensajes.forEach((m, i) =>
            console.log(`  ${i + 1}. [${m.role}] ${String(m.content).replace(/\s+/g, ' ').slice(0, 90)}`)
        );

        // El orden debe alternar user/assistant empezando en user
        const rolesOk = mensajes.every((m, i) => m.role === (i % 2 === 0 ? 'user' : 'assistant'));
        console.log(rolesOk
            ? '  ✅ Orden correcto: alterna user/assistant desde el primer mensaje'
            : '  ❌ Orden INCORRECTO: ' + mensajes.map(m => m.role).join(','));
    }

    console.log('\n--- 6) AISLAMIENTO ENTRE USUARIOS (debe ser 404) ---');
    const otro = {
        email: `intruso${stamp}@prueba.com`,
        password: 'Prueba1234',
        username: `intruso${stamp}`.slice(0, 30),
        fullName: 'Otro Estudiante'
    };
    await post('/api/auth/register', otro);
    const rl = await post('/api/auth/login', { email: otro.email, password: otro.password });
    const tokenIntruso = rl.json?.data?.token;

    if (tokenIntruso && conversationId) {
        const hRes = await fetch(`${BASE}/api/chat/history/${conversationId}`, {
            headers: { 'Authorization': `Bearer ${tokenIntruso}` }
        });
        const hJson = await hRes.json();
        console.log(`  GET /history con token ajeno -> HTTP ${hRes.status} (${hJson.message || 'sin mensaje'})`);
        console.log(hRes.status === 404
            ? '  ✅ Conversación protegida'
            : `  ❌ FUGA: devolvió ${hJson?.data?.count} mensajes de otro usuario`);

        const mRes = await post('/api/chat/message',
            { message: '¿Qué es la fotosíntesis?', subject: 'biologia', mode: 'socratic', conversationId },
            tokenIntruso);
        console.log(`  POST /message en conversación ajena -> HTTP ${mRes.status} (${mRes.json.message || ''})`);
        console.log(mRes.status === 404 ? '  ✅ Inyección bloqueada' : '  ❌ FUGA: permitió escribir');
    }

    console.log('\n--- 7) VALIDACIÓN Y MANEJO DE ERRORES ---');
    const casos = [
        { desc: 'mensaje vacío (espera 400)', body: { message: '', subject: 'biologia' }, esperado: 400 },
        { desc: 'sin materia (espera 400)', body: { message: 'hola profe' }, esperado: 400 },
        { desc: 'materia inexistente (espera 404)', body: { message: '¿Qué es una célula?', subject: 'quenoexiste' }, esperado: 404 },
        { desc: 'conversationId no-UUID (espera 400)', body: { message: '¿Qué es una célula?', subject: 'biologia', conversationId: 'abc' }, esperado: 400 }
    ];
    for (const c of casos) {
        const r2 = await post('/api/chat/message', c.body, token);
        const marca = r2.status === c.esperado ? '✅' : '❌';
        console.log(`  ${marca} ${c.desc} -> HTTP ${r2.status} "${r2.json.message || ''}"`);
    }

    process.exit(0);
})();
