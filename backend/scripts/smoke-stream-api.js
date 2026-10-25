// Verifica el endpoint /api/chat/stream de extremo a extremo (SSE real).
// Uso: node scripts/smoke-stream-api.js
'use strict';
const path = require('path');
const http = require('http');
const { Duplex } = require('stream');
const jwt = require('jsonwebtoken');

const BACKEND = path.join(__dirname, '..');
process.chdir(BACKEND);
require(path.join(BACKEND, 'node_modules', 'dotenv')).config({ path: path.join(BACKEND, '.env') });

const TEST_SECRET = 'smoke-stream-secret-solo-pruebas';
process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_SECRET;
process.env.AI_PROVIDER = 'reto';

// Stub de BD: conversación nueva y sin historial.
const dbPath = path.join(BACKEND, 'src/config/database.js');
require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
        query: async (text) => {
            const t = String(text);
            if (/SELECT id FROM subjects/i.test(t)) return { rows: [{ id: 1 }] };
            if (/INSERT INTO conversations/i.test(t)) return { rows: [{ id: '22222-2222-2222-2222-222' }] };
            if (/SELECT TOP 5 role, content/i.test(t)) return { rows: [] };
            return { rows: [] };
        },
        testConnection: async () => true,
        getPool: async () => ({}),
        config: {}
    }
};
const cachePath = path.join(BACKEND, 'src/services/cache.service.js');
require.cache[cachePath] = {
    id: cachePath, filename: cachePath, loaded: true,
    exports: { getFromCache: async () => null, saveToCache: async () => true, cleanExpiredCache: async () => 0, getCacheStats: async () => ({}), invalidateSubjectCache: async () => 0 }
};

const app = require(path.join(BACKEND, 'src/server.js'));

function peticionSSE(body) {
    return new Promise((resolve) => {
        const s = new Duplex({ read() { }, write(c, e, cb) { cb(); } });
        s.remoteAddress = '127.0.0.1'; s.remotePort = 1; s.destroyed = false;
        s.setTimeout = () => s; s.setNoDelay = () => s; s.setKeepAlive = () => s;

        const payload = JSON.stringify(body);
        const rq = new http.IncomingMessage(s);
        rq.method = 'POST'; rq.url = '/api/chat/stream';
        rq.socket = s; rq.connection = s;
        rq.headers = {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
            authorization: 'Bearer ' + jwt.sign({ userId: '10101010-1111-2222-3333-444', email: 'a@b.c' }, process.env.JWT_SECRET, { expiresIn: '5m' })
        };

        const rs = new http.ServerResponse(rq);
        rs.assignSocket(s);

        const t0 = Date.now();
        let primero = null;
        let crudo = '';
        const eventos = [];

        const escribir = rs.write.bind(rs);
        rs.write = function (chunk) {
            if (primero === null && chunk) primero = Date.now() - t0;
            crudo += String(chunk);
            return true;
        };
        const terminar = rs.end.bind(rs);
        rs.end = function (d) {
            if (d) crudo += String(d);
            // Parsear eventos SSE completos
            for (const bloque of crudo.split('\n\n')) {
                let nombre = null, datos = '';
                for (const l of bloque.split('\n')) {
                    if (l.startsWith('event:')) nombre = l.slice(6).trim();
                    else if (l.startsWith('data:')) datos += l.slice(5).trim();
                }
                if (nombre && datos) {
                    try { eventos.push({ nombre, datos: JSON.parse(datos) }); } catch (_) { }
                }
            }
            resolve({ status: rs.statusCode, primero, total: Date.now() - t0, eventos });
            return terminar(d);
        };

        try {
            app.handle(rq, rs);
            rq.push(payload);
            rq.push(null);
        } catch (e) {
            resolve({ status: 500, error: e.message, eventos: [] });
        }
    });
}

(async function () {
    console.log('=== ENDPOINT /api/chat/stream (SSE real) ===');
    const r = await peticionSSE({ message: '¿Quién fue Cristóbal Colón?' });

    const deltas = r.eventos.filter(e => e.nombre === 'delta');
    const meta = r.eventos.find(e => e.nombre === 'meta');
    const done = r.eventos.find(e => e.nombre === 'done');
    const error = r.eventos.find(e => e.nombre === 'error');
    const texto = deltas.map(d => d.datos.text).join('');

    console.log('  HTTP:            ' + r.status);
    console.log('  primer byte:     ' + r.primero + ' ms');
    console.log('  total:           ' + r.total + ' ms');
    console.log('  eventos delta:   ' + deltas.length);
    console.log('  evento meta:     ' + (meta ? 'SI' : 'NO'));
    console.log('  evento done:     ' + (done ? 'SI' : 'NO'));
    console.log('  evento error:    ' + (error ? 'SI -> ' + error.datos.message : 'no'));
    console.log('  texto recibido:  ' + texto.length + ' chars');
    console.log('');
    console.log('  ¿Responde sobre Colón? ' +
        (/col[oó]n|1492|navegante/i.test(texto) ? 'SI' : 'NO'));
    console.log('  ¿Filtra razonamiento?  ' +
        (/voy a pensar|razonamiento interno|let me think/i.test(texto) ? 'NO (REVISAR)' : 'SI'));
    console.log('');
    console.log('  inicio: ' + texto.slice(0, 160).split('\n').join(' '));
    process.exit(0);
})().catch(e => { console.error('FALLO: ' + e.message); process.exit(1); });
