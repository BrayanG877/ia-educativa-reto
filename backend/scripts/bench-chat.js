/**
 * Benchmark de latencia del tutor.
 * Mide el pipeline REAL contra el proveedor configurado en .env.
 * Uso:  node scripts/bench-chat.js [n]
 * NO escribe en la base de datos (usa un stub de query en memoria).
 */
'use strict';

const path = require('path');
const BACKEND = path.join(__dirname, '..');
process.chdir(BACKEND);

require('../node_modules/dotenv').config({ path: path.join(BACKEND, '.env') });

const N = parseInt(process.argv[2] || '3', 10);

// --- Stub de BD: evita tocar SQL Server y registra lo que se escribe ---
const dbPath = path.join(BACKEND, 'src/config/database.js');
require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
        query: async (text) => {
            const t = String(text);
            if (/FROM subjects/i.test(t)) return { rows: [{ id: 1, code: 'matematicas' }] };
            if (/FROM curriculum_topics/i.test(t)) {
                return { rows: [
                    { id: 1, subject_code: 'matematicas', topic: 'Ecuaciones de primer grado',
                      concept: 'Transposición', keywords: 'ecuacion,ecuaciones,despejar' }
                ] };
            }
            return { rows: [] };
        },
        testConnection: async () => true,
        getPool: async () => ({}),
        config: {}
    }
};

// --- Caché inerte para medir el caso sin caché ---
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
const providers = require(path.join(BACKEND, 'src/services/ai.providers.js'));

const CASOS = [
    { nombre: 'historia', message: '¿Quién fue Cristóbal Colón?', subject: 'sociales' },
    { nombre: 'matematicas', message: '¿Qué es una ecuación cuadrática?', subject: 'matematicas' },
    { nombre: 'fisica', message: 'Explícame la segunda ley de Newton', subject: 'fisica' }
];
const HISTORIAL = [
    { role: 'user', content: 'Hola, ¿me puedes ayudar a estudiar?' },
    { role: 'assistant', content: 'Claro, ¿sobre qué tema quieres trabajar hoy?' }
];

function ms(n) { return Math.round(n); }

async function main() {
    // Se fuerza RETO para medir el proveedor de PRODUCCIÓN.
    // El .env local apunta a groq; aquí se elige explícitamente sin editar el .env.
    process.env.AI_PROVIDER = 'reto';
    process.env.AI_FALLBACK_ENABLED = process.env.BENCH_FALLBACK === '1' ? 'true' : 'false';

    const activo = providers.getProviderName();
    const modelo = (providers.describeSelection && providers.describeSelection().model) || '(desconocido)';
    console.log('');
    console.log('=== BENCHMARK DEL TUTOR ===');
    console.log('  proveedor: ' + activo);
    console.log('  modelo:    ' + modelo);
    console.log('  muestras:  ' + N + ' por caso');
    console.log('  MAX_TOKENS_PER_REQUEST: ' + (process.env.MAX_TOKENS_PER_REQUEST || '1000 (defecto)'));

    const resultados = [];

    for (const caso of CASOS) {
        const tiempos = [];
        let caracteres = 0;
        let ok = 0;

        for (let i = 0; i < N; i++) {
            const t0 = Date.now();
            try {
                const r = await aiService.generateResponse({
                    message: caso.message,
                    subject: caso.subject,
                    history: HISTORIAL,
                    mode: 'socratic',
                    userId: 'bench-user'
                });
                const total = Date.now() - t0;
                tiempos.push(total);
                caracteres += (r.content || '').length;
                ok++;
                if (i === 0) {
                    console.log('');
                    console.log('  [' + caso.nombre + '] primera respuesta (' + total + ' ms):');
                    console.log('  ' + String(r.content || '').split('\n').join(' ').slice(0, 150));
                }
            } catch (e) {
                const total = Date.now() - t0;
                tiempos.push(total);
                console.log('');
                console.log('  [' + caso.nombre + '] ERROR tras ' + total + ' ms: ' + (e.code || '') + ' | ' + String(e.message).slice(0, 100));
            }
        }

        if (tiempos.length) {
            const ordenados = tiempos.slice().sort((a, b) => a - b);
            const media = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
            resultados.push({
                caso: caso.nombre,
                muestras: tiempos.length,
                ok: ok,
                media_ms: ms(media),
                min_ms: ms(ordenados[0]),
                max_ms: ms(ordenados[ordenados.length - 1]),
                mediana_ms: ms(ordenados[Math.floor(ordenados.length / 2)]),
                caracteres_por_respuesta: ok ? Math.round(caracteres / ok) : 0
            });
        }
    }

    console.log('');
    console.log('=== RESULTADOS ===');
    console.table(resultados);
    console.log('');
    console.log('NOTA: sin streaming, el "total" ES el tiempo hasta la primera palabra visible.');
    process.exit(0);
}

main().catch(e => {
    console.error('Fallo del benchmark:', e && e.message);
    process.exit(1);
});
