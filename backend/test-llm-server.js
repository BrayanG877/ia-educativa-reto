/**
 * Servidor LLM LOCAL de pruebas que habla el protocolo REAL de OpenAI
 * (/v1/chat/completions). Sirve para verificar el flujo HTTP completo
 * (backend -> proveedor -> respuesta) sin depender de credenciales.
 *
 * NO es un mock en memoria: es un servidor HTTP real al que el backend se
 * conecta de verdad mediante fetch, igual que haría con Groq. Genera
 * respuestas SOCRÁTICAS para comprobar el comportamiento pedagógico.
 *
 * Uso:
 *   node test-llm-server.js          (escucha en http://localhost:4010)
 *   y en el backend:  GROQ_API_BASE=http://localhost:4010/v1  GROQ_API_KEY=test
 */

const http = require('http');

const PORT = parseInt(process.env.TEST_LLM_PORT) || 4010;

/** Respuestas socráticas por turno (nunca dan la respuesta directa). */
const guionesSocraticos = [
    '¡Buena pregunta! Antes de responderla, pensemos juntos: ¿qué crees que tienen en común todos los seres vivos? Fíjate en una planta y en ti mismo.',
    'Muy bien, vamos por buen camino. Si la célula es la unidad más pequeña con vida, ¿qué procesos crees que necesita hacer por sí misma para seguir viva?',
    'Buena idea. Piensa en tu propia piel: cuando te haces una herida pequeña, se cierra sola. ¿Qué debería estar pasando a nivel de células para que eso ocurra?'
];

/** Deliberadamente NO resuelve el ejercicio: guía. */
const guionMate = 'Antes de calcularlo directamente, pensemos: ¿qué significa multiplicar 5 por 8? Imagina 5 grupos con 8 elementos cada uno. ¿Cuántos elementos tendrías en total si los sumaras todos?';

let turno = 0;

function extraerUltimoMensajeUsuario(body) {
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'user') return String(msgs[i].content || '');
    }
    return '';
}

const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !req.url.startsWith('/v1/chat/completions')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Not found' } }));
        return;
    }

    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
        let body = {};
        try { body = JSON.parse(raw); } catch (_) { /* body inválido */ }

        const pregunta = extraerUltimoMensajeUsuario(body).toLowerCase();

        // Respuesta acorde a la pregunta, para simular un tutor real.
        let texto;
        if (/5\s*[x*×]\s*8|2x\s*\+\s*5|ecuaci[oó]n/.test(pregunta)) {
            texto = guionMate;
        } else {
            texto = guionesSocraticos[Math.min(turno, guionesSocraticos.length - 1)];
            turno++;
        }

        const payload = {
            id: 'chatcmpl-test-' + Date.now(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: body.model || 'llama-3.3-70b-versatile',
            choices: [
                {
                    index: 0,
                    message: { role: 'assistant', content: texto },
                    finish_reason: 'stop'
                }
            ],
            usage: {
                prompt_tokens: 120,
                completion_tokens: 80,
                total_tokens: 200
            }
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
    });
});

server.listen(PORT, () => {
    console.log(`Servidor LLM de pruebas escuchando en http://localhost:${PORT}`);
});
