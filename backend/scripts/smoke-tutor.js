/**
 * Prueba REAL del caso reportado P0 contra el proveedor de producción (RETO/grok-4.6).
 * Uso: node scripts/smoke-tutor.js
 * No escribe en la base de datos.
 */
'use strict';

const path = require('path');
const BACKEND = path.join(__dirname, '..');
process.chdir(BACKEND);
require('../node_modules/dotenv').config({ path: path.join(BACKEND, '.env') });

// Stub de BD (no toca SQL Server)
const dbPath = path.join(BACKEND, 'src/config/database.js');
require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
        query: async () => ({ rows: [] }),
        testConnection: async () => true,
        getPool: async () => ({}),
        config: {}
    }
};
const cachePath = path.join(BACKEND, 'src/services/cache.service.js');
require.cache[cachePath] = {
    id: cachePath, filename: cachePath, loaded: true,
    exports: {
        getFromCache: async () => null,
        saveToCache: async () => true,
        cleanExpiredCache: async () => 0,
        getCacheStats: async () => ({}),
        invalidateSubjectCache: async () => 0
    }
};

const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));
const intent = require(path.join(BACKEND, 'src/services/intent.service.js'));

const CASOS = [
    {
        nombre: 'P0 — Historia (el fallo reportado)',
        message: '¿Quién fue Cristóbal Colón?',
        subject: 'matematicas', // el frontend antiguo enviaba esto por defecto
        history: [],
        debe: ['colon', 'navegante', '1492', 'america'],
        noDebe: ['operaciones matematicas basicas', 'operaciones matematicas'],
        minimo: 3
    },
    {
        nombre: 'P0 — Matemáticas',
        message: '¿Qué es una ecuación cuadrática?',
        subject: null,
        history: [],
        debe: ['cuadratica', 'ax', 'discriminante', 'grado'],
        noDebe: [],
        minimo: 2
    },
    {
        nombre: 'P0 — Física',
        message: 'Explícame la segunda ley de Newton',
        subject: null,
        history: [],
        debe: ['newton', 'fuerza', 'masa', 'aceleracion'],
        noDebe: [],
        minimo: 3
    },
    {
        nombre: 'P0 — Corrección de error contextual',
        message: '¿Por qué me respondes eso? Yo te pregunté quién fue Cristóbal Colón.',
        subject: 'matematicas',
        history: [
            { role: 'user', content: '¿Quién fue Cristóbal Colón?' },
            { role: 'assistant', content: '¿Qué operaciones matemáticas básicas recuerdas haber usado recientemente en tu día a día?' }
        ],
        debe: ['colon'],
        noDebe: ['operaciones matematicas'],
        minimo: 1
    },
    {
        nombre: 'P0 — Cambio de tema en la conversación',
        message: 'Ahora explícame la fotosíntesis',
        subject: null,
        history: [
            { role: 'user', content: '¿Quién fue Cristóbal Colón?' },
            { role: 'assistant', content: 'Cristóbal Colón fue un navegante genovés.' }
        ],
        debe: ['fotosintesis', 'clorofila', 'planta'],
        noDebe: [],
        minimo: 2
    }
];

function normalizar(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

(async function () {
    process.env.AI_PROVIDER = 'reto';
    process.env.AI_FALLBACK_ENABLED = 'false';

    console.log('');
    console.log('=== SMOKE TEST REAL DEL TUTOR (RETO / grok-4.6) ===');

    let aprobados = 0;

    for (const caso of CASOS) {
        const det = intent.detectarMateria(caso.message, caso.subject);
        const intencion = intent.detectarIntencion(caso.message);

        console.log('');
        console.log('--------------------------------------------------');
        console.log('CASO: ' + caso.nombre);
        console.log('  mensaje   : ' + caso.message);
        console.log('  subject   : ' + (caso.subject || '(ninguno)'));
        console.log('  detectado : materia=' + (det.materia || 'ninguna') + ' (' + det.confianza + ') | intencion=' + intencion);

        const t0 = Date.now();
        let r;
        try {
            r = await aiService.generateResponse({
                message: caso.message,
                subject: caso.subject,
                history: caso.history,
                mode: 'socratic',
                userId: 'smoke-user'
            });
        } catch (e) {
            console.log('  ERROR: ' + (e.code || '') + ' | ' + String(e.message).slice(0, 140));
            continue;
        }
        const ms = Date.now() - t0;

        const texto = normalizar(r.content);
        const encontrados = caso.debe.filter(k => texto.includes(normalizar(k)));
        const prohibidos = caso.noDebe.filter(k => texto.includes(normalizar(k)));
        const primero = normalizar(String(r.content).split('\n')[0]).slice(0, 90);

        console.log('  latencia  : ' + ms + ' ms | ' + String(r.content).length + ' chars');
        console.log('  inicio    : ' + primero);
        console.log('  señales   : ' + (encontrados.length ? encontrados.join(', ') : '(ninguna)') +
                    ' [' + encontrados.length + '/' + caso.debe.length + ']');
        if (prohibidos.length) console.log('  PROHIBIDO : ' + prohibidos.join(', '));

        const ok = encontrados.length >= caso.minimo && prohibidos.length === 0;
        console.log('  RESULTADO : ' + (ok ? 'PASA' : 'FALLA'));
        if (ok) aprobados++;

        console.log('');
        console.log('  --- respuesta (400 chars) ---');
        console.log('  ' + String(r.content).split('\n').slice(0, 12).join('\n  ').slice(0, 700));
    }

    console.log('');
    console.log('==================================================');
    console.log('TOTAL: ' + aprobados + '/' + CASOS.length + ' casos pasan');
    process.exit(aprobados === CASOS.length ? 0 : 1);
})();
