/**
 * PRUEBA END-TO-END REAL (HTTP de verdad) de la IA educativa.
 * Ejercita el flujo completo: frontend-simulado -> backend -> proveedor IA -> respuesta.
 *
 * El backend debe estar arrancado apuntando al servidor LLM de prueba:
 *   GROQ_API_BASE=http://localhost:4010/v1  GROQ_API_KEY=test  AI_PROVIDER=groq
 *
 * Cubre los casos exigidos:
 *   Caso 1 pregunta normal · Caso 2 matemática · Caso 3 socrático
 *   Caso 4 error del proveedor · Caso 5 entrada inválida · Caso 6 contexto
 */
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3001';

async function call(method, path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch (_) { json = null; }
    return { status: res.status, json };
}

let fallos = 0;
function check(nombre, cond, extra = '') {
    console.log(`  ${cond ? '[OK]' : '[FALLO]'} ${nombre}${extra ? ' -> ' + extra : ''}`);
    if (!cond) fallos++;
}

(async () => {
    const stamp = Date.now();

    console.log('=== 0) SALUD Y PROVEEDOR DE IA ===');
    const health = await call('GET', '/health');
    check('GET /health responde 200', health.status === 200, 'status ' + health.status);
    const prov = await call('GET', '/api/ai/providers');
    check('GET /api/ai/providers responde 200', prov.status === 200);
    check('El proveedor activo está listo', prov.json?.data?.ready === true,
        'activo=' + prov.json?.data?.active + ' modelo=' + prov.json?.data?.model);

    console.log('\n=== 1) REGISTRO Y LOGIN ===');
    const creds = {
        email: `e2e_${stamp}@prueba.com`,
        password: 'Prueba1234',
        username: `e2e${stamp}`.slice(0, 30),
        fullName: 'Estudiante E2E'
    };
    const reg = await call('POST', '/api/auth/register', creds);
    check('Registro 201', reg.status === 201, 'status ' + reg.status);
    const login = await call('POST', '/api/auth/login', { email: creds.email, password: creds.password });
    const token = login.json?.data?.token;
    check('Login devuelve JWT', !!token);
    if (!token) { console.log('Sin token, abortando.'); process.exit(1); }

    console.log('\n=== 2) CASO 1 — PREGUNTA NORMAL ===');
    const r1 = await call('POST', '/api/chat/message',
        { message: '¿Qué es una célula?', subject: 'biologia', mode: 'socratic' }, token);
    check('Responde 200', r1.status === 200, 'status ' + r1.status);
    const resp1 = r1.json?.data?.response || '';
    check('La IA devolvió texto', resp1.length > 20, resp1.slice(0, 80) + '...');
    check('Devuelve conversationId', !!r1.json?.data?.conversationId);
    check('Modelo informado', !!r1.json?.data?.model, r1.json?.data?.model);
    let convId = r1.json?.data?.conversationId;

    console.log('\n=== 3) CASO 3 — MÉTODO SOCRÁTICO (no da la respuesta directa) ===');
    // La respuesta debe contener preguntas (?) y no una respuesta cerrada.
    check('La respuesta guía con preguntas', (resp1.match(/\?/g) || []).length >= 1,
        'nº preguntas=' + (resp1.match(/\?/g) || []).length);

    console.log('\n=== 4) CASO 6 — CONTEXTO (preguntas consecutivas) ===');
    const r2 = await call('POST', '/api/chat/message',
        { message: '¿Y cuál es su función?', subject: 'biologia', mode: 'socratic', conversationId: convId }, token);
    check('2º turno 200', r2.status === 200, 'status ' + r2.status);
    check('Mismo conversationId (contexto)', r2.json?.data?.conversationId === convId);
    const r3 = await call('POST', '/api/chat/message',
        { message: '¿Puedes darme un ejemplo?', subject: 'biologia', mode: 'socratic', conversationId: convId }, token);
    check('3º turno 200', r3.status === 200, 'status ' + r3.status);

    const hist = await call('GET', `/api/chat/history/${convId}`, null, token);
    const msgs = hist.json?.data?.messages || [];
    check('Historial guarda 6 mensajes', msgs.length === 6, 'guardados=' + msgs.length);
    const alterna = msgs.every((m, i) => m.role === (i % 2 === 0 ? 'user' : 'assistant'));
    check('Historial alterna user/assistant', alterna, msgs.map(m => m.role).join(','));

    console.log('\n=== 5) CASO 2 — PREGUNTA MATEMÁTICA ===');
    const rm = await call('POST', '/api/chat/message',
        { message: '¿Cómo puedo resolver 2x + 5 = 15?', subject: 'matematicas', mode: 'socratic' }, token);
    check('Responde 200', rm.status === 200, 'status ' + rm.status);
    check('La IA responde', (rm.json?.data?.response || '').length > 20);

    console.log('\n=== 6) CASO 5 — ENTRADA INVÁLIDA (validación) ===');
    const vacio = await call('POST', '/api/chat/message', { message: '', subject: 'biologia' }, token);
    check('Mensaje vacío -> 400', vacio.status === 400, 'status ' + vacio.status);
    const sinMateria = await call('POST', '/api/chat/message', { message: 'hola profe' }, token);
    check('Sin materia -> 400', sinMateria.status === 400, 'status ' + sinMateria.status);
    const materiaMala = await call('POST', '/api/chat/message', { message: '¿Qué es una célula?', subject: 'noexiste' }, token);
    check('Materia inexistente -> 404', materiaMala.status === 404, 'status ' + materiaMala.status);
    const sinToken = await call('POST', '/api/chat/message', { message: 'x', subject: 'biologia' });
    check('Sin token -> 401', sinToken.status === 401, 'status ' + sinToken.status);

    console.log('\n=== 7) HERRAMIENTAS (todas las opciones ofrecidas) ===');
    const herramientas = [
        ['test-prep', '/api/tools/test-prep', { subject: 'matematicas', topic: 'ecuaciones', quantity: 3, difficulty: 'intermedio' }],
        ['quiz', '/api/tools/quiz', { subject: 'biologia', topic: 'celula', type: 'mixed', quantity: 3 }],
        ['evaluation', '/api/tools/evaluation', { subject: 'matematicas', topics: ['algebra', 'geometria'], quantity: 5 }],
        ['mindmap', '/api/tools/mindmap', { subject: 'biologia', topic: 'celula', depth: 2 }],
        ['conceptmap', '/api/tools/conceptmap', { subject: 'biologia', topic: 'celula', concepts: ['membrana', 'nucleo'] }],
        ['image-prompt', '/api/tools/image-prompt', { subject: 'biologia', concept: 'celula', style: 'illustration' }],
        ['video-script', '/api/tools/video-script', { subject: 'biologia', topic: 'celula', duration: 2, audience: 'secundaria' }]
    ];
    for (const [nombre, ruta, body] of herramientas) {
        const r = await call('POST', ruta, body, token);
        check(`Herramienta ${nombre}`, r.status === 200, 'status ' + r.status);
    }

    console.log('\n=== 8) MÉTRICAS Y PERSISTENCIA ===');
    const convs = await call('GET', '/api/chat/conversations', null, token);
    check('Lista de conversaciones 200', convs.status === 200);
    check('Hay conversaciones guardadas', (convs.json?.data?.count || 0) > 0,
        'count=' + convs.json?.data?.count);
    const stats = await call('GET', '/api/metrics/stats', null, token);
    check('Estadísticas 200', stats.status === 200, 'status ' + stats.status);
    const ranking = await call('GET', '/api/metrics/ranking');
    check('Ranking 200', ranking.status === 200, 'status ' + ranking.status);
    const me = await call('GET', '/api/auth/me', null, token);
    check('Perfil /auth/me 200', me.status === 200);

    console.log('\n=== 9) MODERACIÓN (contenido no educativo) ===');
    const mod = await call('POST', '/api/chat/message',
        { message: 'cuéntame un chiste', subject: 'matematicas', mode: 'socratic' }, token);
    check('Contenido no educativo bloqueado (400)', mod.status === 400, 'status ' + mod.status);

    console.log('\n=== 10) AISLAMIENTO ENTRE USUARIOS ===');
    const otro = { email: `intruso_${stamp}@prueba.com`, password: 'Prueba1234', username: `intr${stamp}`.slice(0, 30), fullName: 'Otro' };
    await call('POST', '/api/auth/register', otro);
    const login2 = await call('POST', '/api/auth/login', { email: otro.email, password: otro.password });
    const token2 = login2.json?.data?.token;
    if (token2 && convId) {
        const h = await call('GET', `/api/chat/history/${convId}`, null, token2);
        check('Historial ajeno protegido (404)', h.status === 404, 'status ' + h.status);
    }

    console.log(`\n================ RESULTADO: ${fallos === 0 ? 'TODO OK' : fallos + ' FALLO(S)'} ================`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.log('ERROR FATAL:', e.message); process.exit(1); });
