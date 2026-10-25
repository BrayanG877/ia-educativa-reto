/**
 * Benchmark comparativo: SIN streaming vs CON streaming.
 * Mide TTFT, total, errores y contenido. Usa las mismas preguntas.
 * Uso: node scripts/bench-stream.js [muestras]
 */
'use strict';
const path = require('path');
const BACKEND = path.join(__dirname, '..');
process.chdir(BACKEND);
require(path.join(BACKEND, 'node_modules', 'dotenv')).config({ path: path.join(BACKEND, '.env') });

const providers = require(path.join(BACKEND, 'src/services/ai.providers.js'));
const promptService = require(path.join(BACKEND, 'src/services/prompt.service.js'));
const intent = require(path.join(BACKEND, 'src/services/intent.service.js'));

const N = parseInt(process.argv[2] || '2', 10);

const PREGUNTAS = [
    { nombre: 'Historia',  msg: '¿Quién fue Cristóbal Colón?', esp: ['colon', '1492', 'navegante'] },
    { nombre: 'Matematicas', msg: '¿Qué es una ecuación cuadrática?', esp: ['cuadratica', 'discriminante'] },
    { nombre: 'Fisica',    msg: 'Explícame la segunda ley de Newton', esp: ['newton', 'fuerza', 'masa'] }
];

function norm(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function construir(msg) {
    const det = intent.detectarMateria(msg, null);
    const intencion = intent.detectarIntencion(msg);
    const base = promptService.getSystemPrompt('socratic', det.materia);
    const inst = intent.construirInstruccionDeTurno({ mensaje: msg, materia: det.materia, intencion, historial: [] });
    return { system: base + '\n\n' + inst, materia: det.materia };
}

async function sinStream(prov, system, msg) {
    const t0 = Date.now();
    const r = await prov.completion({
        system, messages: [{ role: 'user', content: msg }],
        model: prov.model(), maxTokens: 1000, temperature: 0.7
    });
    return { ttft: null, total: Date.now() - t0, texto: r.text || '', ok: true };
}

async function conStream(prov, system, msg) {
    const t0 = Date.now();
    let ttft = null;
    const r = await prov.completionStream({
        system, messages: [{ role: 'user', content: msg }],
        model: prov.model(), maxTokens: 1000, temperature: 0.7,
        onDelta: () => { if (ttft === null) ttft = Date.now() - t0; }
    });
    return { ttft, total: Date.now() - t0, texto: r.text || '', ok: true };
}

function media(a) { return a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0; }

(async function () {
    process.env.AI_PROVIDER = 'reto';
    process.env.AI_FALLBACK_ENABLED = 'false';
    const prov = providers.getProvider('reto');

    console.log('=== COMPARATIVA: SIN vs CON STREAMING ===');
    console.log('  modelo: ' + prov.model() + ' | muestras por modo: ' + N);
    console.log('');

    const filas = [];

    for (const p of PREGUNTAS) {
        const { system } = construir(p.msg);

        const sinT = [], sinTTFT = [], conT = [], conTTFT = [];
        let errSin = 0, errCon = 0, charsSin = 0, charsCon = 0;
        let aciertosSin = 0, aciertosCon = 0;
        let integridadOk = 0;

        for (let i = 0; i < N; i++) {
            try {
                const r = await sinStream(prov, system, p.msg);
                sinT.push(r.total); charsSin += r.texto.length;
                const t = norm(r.texto);
                if (p.esp.filter(k => t.includes(norm(k))).length >= 2) aciertosSin++;
            } catch (_) { errSin++; }
        }

        for (let i = 0; i < N; i++) {
            try {
                const r = await conStream(prov, system, p.msg);
                conT.push(r.total); conTTFT.push(r.ttft); charsCon += r.texto.length;
                const t = norm(r.texto);
                if (p.esp.filter(k => t.includes(norm(k))).length >= 2) aciertosCon++;
            } catch (_) { errCon++; }
        }

        filas.push({
            pregunta: p.nombre,
            'sin_total_ms': media(sinT),
            'con_ttft_ms': media(conTTFT),
            'con_total_ms': media(conT),
            'espera_percibida_ahorro_ms': media(sinT) - media(conTTFT),
            'err_sin': errSin, 'err_con': errCon,
            'chars_sin': Math.round(charsSin / Math.max(1, N)),
            'chars_con': Math.round(charsCon / Math.max(1, N)),
            'correcto_sin': aciertosSin + '/' + N,
            'correcto_con': aciertosCon + '/' + N
        });

        console.log('[' + p.nombre + '] listo');
    }

    console.log('');
    console.table(filas);

    const ahorro = filas.reduce((a, f) => a + f.espera_percibida_ahorro_ms, 0) / filas.length;
    console.log('');
    console.log('AHORRO MEDIO EN ESPERA PERCIBIDA (total sin stream - TTFT con stream): ' + Math.round(ahorro) + ' ms');
    console.log('NOTA: el tiempo TOTAL NO mejora con streaming; mejora el tiempo hasta ver la primera palabra.');
    console.log('NOTA: N=' + N + ' muestras. La varianza del proveedor es alta; no es una medición estadística.');
    process.exit(0);
})().catch(e => { console.error('FALLO: ' + e.message); process.exit(1); });
