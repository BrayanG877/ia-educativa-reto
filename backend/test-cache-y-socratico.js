/**
 * PRUEBA A: aislamiento del caché por historial (FIX 5)
 *   "¿Puedes darme un ejemplo?" en una conversación de BIOLOGÍA y otra de FÍSICA
 *   debe producir respuestas DISTINTAS. Antes la clave de caché ignoraba el
 *   historial y ambas devolvían lo mismo.
 *
 * PRUEBA B: método socrático (§20)
 *   "¿Cuánto es 5 x 8?" NO debe responderse con "40" directo.
 */
const BASE = 'http://localhost:3001';

async function post(path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function nuevoUsuario() {
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const creds = {
        email: `c${stamp}@prueba.com`, password: 'Prueba1234',
        username: `c${stamp}`.slice(0, 30), fullName: 'Test Cache'
    };
    await post('/api/auth/register', creds);
    const r = await post('/api/auth/login', { email: creds.email, password: creds.password });
    return r.json?.data?.token;
}

async function turno(token, convId, message, subject) {
    const r = await post('/api/chat/message',
        { message, subject, mode: 'socratic', conversationId: convId }, token);
    if (r.status !== 200) {
        console.log(`   ❌ HTTP ${r.status}: ${r.json.message}`);
        return null;
    }
    return r.json.data;
}

(async () => {
    const token = await nuevoUsuario();
    if (!token) { console.log('No se pudo autenticar'); process.exit(1); }

    console.log('=== PRUEBA A: aislamiento del cache por historial ===\n');

    console.log('Conversacion 1 (biologia): "¿Qué es una célula?"');
    const a1 = await turno(token, null, '¿Qué es una célula?', 'biologia');
    console.log(`   fromCache=${a1?.fromCache}`);
    console.log('Conversacion 1: "¿Puedes darme un ejemplo?"');
    const a2 = await turno(token, a1?.conversationId, '¿Puedes darme un ejemplo?', 'biologia');
    console.log(`   fromCache=${a2?.fromCache}`);

    console.log('\nConversacion 2 (fisica): "¿Qué es la aceleración?"');
    const b1 = await turno(token, null, '¿Qué es la aceleración?', 'fisica');
    console.log(`   fromCache=${b1?.fromCache}`);
    console.log('Conversacion 2: "¿Puedes darme un ejemplo?"  <-- MISMO texto que arriba');
    const b2 = await turno(token, b1?.conversationId, '¿Puedes darme un ejemplo?', 'fisica');
    console.log(`   fromCache=${b2?.fromCache}`);

    if (a2 && b2) {
        const iguales = a2.response === b2.response;
        console.log(`\n   Respuestas identicas: ${iguales}`);
        console.log(iguales
            ? '   ❌ FALLA: el cache sigue colisionando entre conversaciones'
            : '   ✅ OK: cada conversacion recibe su propia respuesta contextual');
        console.log(`\n   [biologia] ${String(b2 && a2.response).replace(/\s+/g, ' ').slice(0, 150)}...`);
        console.log(`   [fisica]   ${String(b2.response).replace(/\s+/g, ' ').slice(0, 150)}...`);
    }

    console.log('\n\n=== PRUEBA B: metodo socratico (§20) ===\n');
    console.log('Estudiante: "¿Cuánto es 5 x 8?"');
    const s = await turno(token, null, '¿Cuánto es 5 x 8?', 'matematicas');
    if (s) {
        const txt = String(s.response);
        console.log('\nIA:', txt.replace(/\s+/g, ' ').slice(0, 400) + '...');
        const tienePregunta = txt.includes('?');
        // Da el resultado "pelado" sin invitar a razonar
        const daResultadoDirecto = /(?:es|=|resultado es)\s*\**\s*40\b/i.test(txt) && !tienePregunta;
        console.log('\n   Formula preguntas al estudiante:', tienePregunta ? '✅ si' : '❌ no');
        console.log('   Suelta el resultado sin guiar:', daResultadoDirecto ? '❌ si' : '✅ no');
    }

    process.exit(0);
})();
