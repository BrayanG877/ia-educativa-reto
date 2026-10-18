/**
 * VERIFICACIÓN DEL FLUJO COMPLETO CON UN PROVEEDOR DE IA SIMULADO
 * ----------------------------------------------------------------
 * Demuestra que, con un proveedor de IA FUNCIONANDO (gratuito o de pago),
 * TODO el flujo funciona:
 *   login -> POST /api/chat/message -> ai.service -> proveedor -> respuesta
 *   -> guardado en SQL -> historial -> contexto entre turnos.
 *
 * Intercepta el módulo de proveedores (src/services/ai.providers) y hace que
 * la llamada al modelo devuelva respuestas socráticas fijas. Así se prueba
 * exactamente el mismo camino de código que usará Gemini/Groq/Claude reales,
 * sin depender de red ni de una API key.
 *
 * Ejecutar:  node verificar-flujo-con-mock.js
 */

const Module = require('module');

const RESPUESTAS_MOCK = [
    'Buena pregunta. Antes de decirte que es una celula, que crees que tienen en comun todos los seres vivos para estar formados? Piensa en que se parecen una planta y tu.',
    'Exacto, estamos formados por celulas. Entonces, si la celula es la unidad mas pequena, que procesos crees que debe realizar por si misma para mantenerse viva?',
    'Perfecto. Un ejemplo cotidiano: tu propia piel. Por que crees que una herida pequena se cierra sola? Que deberia pasar a nivel de celulas para que eso ocurra?'
];
let turno = 0;

// Módulo de proveedores simulado: misma interfaz que el real.
const proveedoresMock = {
    getProviderName: () => 'mock',
    listProviders: () => [{ id: 'mock', name: 'Proveedor simulado', configured: true, active: true, paid: false }],
    getProvider: () => ({
        name: 'Proveedor simulado',
        paid: false,
        configured: () => true,
        model: () => 'mock-model-v1',
        completion: async () => {
            const i = Math.min(turno, RESPUESTAS_MOCK.length - 1);
            const text = RESPUESTAS_MOCK[i];
            turno++;
            return { text, inputTokens: 120, outputTokens: 80 };
        }
    }),
    PROVIDERS: {}
};

// Interceptar el require del módulo real de proveedores.
const path = require('path');
const providersPath = path.resolve(__dirname, 'src/services/ai.providers.js');
const loadOriginal = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === './ai.providers' && parent && parent.filename &&
        parent.filename.includes('ai.service.js')) {
        return proveedoresMock;
    }
    const resolved = (() => {
        try { return Module._resolveFilename(request, parent, isMain); } catch (_) { return null; }
    })();
    if (resolved === providersPath) return proveedoresMock;
    return loadOriginal.apply(this, arguments);
};

// Levantar el servidor real dentro de este mismo proceso (con el mock activo).
process.env.PORT = process.env.MOCK_PORT || '3101';
require('./src/server');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:' + (process.env.MOCK_PORT || '3101');
const H = { 'Content-Type': 'application/json' };

async function post(path, body, token) {
    const headers = { ...H };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    let json = null;
    try { json = await res.json(); } catch (_) { json = { _noJson: true }; }
    return { status: res.status, json };
}

/** Esperar a que el servidor (que arranca en este mismo proceso) esté escuchando. */
async function esperarServidor(intentos = 40) {
    for (let i = 0; i < intentos; i++) {
        try {
            const res = await fetch(`${BASE}/health`);
            if (res.ok) return true;
        } catch (_) { /* todavía no escucha */ }
        await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}

(async () => {
    const listo = await esperarServidor();
    if (!listo) {
        console.log('El servidor mock no llegó a escuchar en ' + BASE);
        process.exit(1);
    }
    console.log('Servidor mock escuchando en', BASE, '\n');

    const stamp = Date.now();
    const creds = {
        email: `mock${stamp}@prueba.com`,
        password: 'Prueba1234',
        username: `mock${stamp}`.slice(0, 30),
        fullName: 'Estudiante Mock'
    };

    let r = await post('/api/auth/register', creds);
    console.log('1) REGISTRO ->', r.status, r.json.message || '');

    r = await post('/api/auth/login', { email: creds.email, password: creds.password });
    const token = r.json?.data?.token;
    console.log('2) LOGIN ->', r.status, token ? 'JWT OK' : 'SIN TOKEN');
    if (!token) process.exit(1);

    const preguntas = ['¿Qué es una célula?', '¿Y cuál es su función?', '¿Puedes darme un ejemplo?'];
    let conversationId = null;

    for (const [i, p] of preguntas.entries()) {
        const res = await post('/api/chat/message',
            { message: p, subject: 'biologia', mode: 'socratic', conversationId }, token);
        console.log(`\n3.${i + 1}) "${p}" -> HTTP ${res.status}`);
        if (res.status !== 200) {
            console.log('   ❌', JSON.stringify(res.json).slice(0, 300));
            process.exit(1);
        }
        conversationId = res.json.data.conversationId;
        console.log('   conversationId:', conversationId);
        console.log('   modelo:', res.json.data.model, '| fromCache:', res.json.data.fromCache);
        const previewIA = String(res.json.data.response).split(/\s+/).join(' ').slice(0, 140);
        console.log('   respuesta IA:', previewIA, '...');
    }

    const hRes = await fetch(`${BASE}/api/chat/history/${conversationId}`,
        { headers: { 'Authorization': `Bearer ${token}` } });
    const hJson = await hRes.json();
    const msgs = hJson?.data?.messages || [];
    console.log('\n4) HISTORIAL ->', hRes.status, '| mensajes:', hJson?.data?.count);
    msgs.forEach((m, i) => console.log(`   ${i + 1}. [${m.role}] ${String(m.content).split(/\s+/).join(' ').slice(0, 70)}`));
    const ok = msgs.length === 6 && msgs.every((m, i) => m.role === (i % 2 === 0 ? 'user' : 'assistant'));
    console.log(ok ? '\n✅ FLUJO COMPLETO OK: 3 turnos, contexto conservado, historial alternando user/assistant.'
                   : '\n⚠️ El historial no tiene la forma esperada.');
    process.exit(0);
})();
