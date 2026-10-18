/**
 * PRUEBAS FASE 5B.8 — GUARDIAS DE RED (aislamiento hermético).
 * ==================================================================
 * Objetivo: DEMOSTRAR, con aserciones explícitas, que bajo el preload
 * test/_setup.js NINGUNA prueba puede realizar una conexión no autorizada:
 *
 *   1) global.fetch real está bloqueado y LANZA.
 *   2) http.request / https.request reales están bloqueados y LANZAN.
 *   3) net.Socket#connect real está bloqueado (emite error de guardia).
 *   4) dns.lookup y dns.promises.lookup reales están bloqueados y LANZAN.
 *   5) ioredis y mssql están sustituidos por stubs inertes (no abren socket).
 *   6) Un mock de fetch autorizado SÍ funciona y, al salir, la guardia vuelve.
 *   7) axios (dependencia del proyecto) NO puede saltarse la guardia.
 *
 * No se ejecuta ninguna conexión real: todas las guardias lanzan de inmediato.
 * Este archivo NO contiene secretos ni se usa en producción.
 */
const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const dns = require('dns');
const http = require('http');
const https = require('https');

const aislar = require('./_aislamiento');

// ------------------------------------------------------------------
// 1. fetch real bloqueado
// ------------------------------------------------------------------
test('guardias(1): global.fetch real está bloqueado y lanza', async () => {
    assert.strictEqual(typeof global.fetch, 'function');
    await assert.rejects(
        async () => global.fetch('https://api.groq.com/openai/v1/models'),
        (e) => /AISLAMIENTO/.test(e.message)
    );
});

test('guardias(1b): fetch bloqueado también para http:// y para localhost', async () => {
    for (const url of ['http://localhost:11434/api/tags', 'https://example.com', 'http://127.0.0.1:3001/health']) {
        await assert.rejects(async () => global.fetch(url), (e) => /AISLAMIENTO/.test(e.message));
    }
});

// ------------------------------------------------------------------
// 2. http/https.request bloqueados
// ------------------------------------------------------------------
test('guardias(2): http.request real está bloqueado y lanza', () => {
    assert.throws(() => http.request('http://example.com'), (e) => /AISLAMIENTO/.test(e.message));
});

test('guardias(2b): https.request real está bloqueado y lanza', () => {
    assert.throws(() => https.request('https://example.com'), (e) => /AISLAMIENTO/.test(e.message));
});

// ------------------------------------------------------------------
// 3. net.Socket#connect bloqueado (canal de error asíncrono)
// ------------------------------------------------------------------
test('guardias(3): net.Socket#connect real está bloqueado (emite error de guardia)', () => {
    return new Promise((resolve, reject) => {
        const s = new net.Socket();
        s.once('error', (e) => {
            try {
                assert.ok(/AISLAMIENTO/.test(e.message), 'el error debe venir de la guardia');
                resolve();
            } catch (err) { reject(err); }
        });
        s.connect(6379, '127.0.0.1'); // intento de Redis real -> interceptado
    });
});

// ------------------------------------------------------------------
// 4. DNS bloqueado
// ------------------------------------------------------------------
test('guardias(4): dns.lookup real está bloqueado y lanza', async () => {
    await assert.rejects(
        () => new Promise((resolve, reject) =>
            dns.lookup('example.com', (err, addr) => (err ? reject(err) : resolve(addr)))),
        (e) => /AISLAMIENTO/.test(e.message)
    );
});

test('guardias(4b): dns.promises.lookup real está bloqueado y lanza', async () => {
    assert.ok(dns.promises && typeof dns.promises.lookup === 'function');
    await assert.rejects(() => dns.promises.lookup('example.com'), (e) => /AISLAMIENTO/.test(e.message));
});

// ------------------------------------------------------------------
// 5. ioredis y mssql son stubs inertes
// ------------------------------------------------------------------
test('guardias(5): ioredis está sustituido por un stub inerte (no conecta)', async () => {
    const Redis = require('ioredis');
    const cliente = new Redis({ host: '127.0.0.1', port: 6379 });
    // El stub devuelve valores inertes sin abrir socket.
    assert.strictEqual(await cliente.get('x'), null);
    assert.strictEqual(await cliente.set('x', 'y'), 'OK');
    // ping está bloqueado explícitamente por el stub.
    await assert.rejects(() => cliente.ping(), (e) => /AISLAMIENTO/.test(e.message));
});

test('guardias(5b): mssql está sustituido por un stub que no conecta', async () => {
    const sql = require('mssql');
    const pool = new sql.ConnectionPool({ server: 'real.example.net' });
    await assert.rejects(() => pool.connect(), (e) => /AISLAMIENTO/.test(e.message));
    assert.throws(() => pool.request(), (e) => /AISLAMIENTO/.test(e.message));
});

// ------------------------------------------------------------------
// 6. Mock autorizado funciona y la guardia se restaura
// ------------------------------------------------------------------
test('guardias(6): un fetch mock autorizado funciona y al salir vuelve la guardia', async () => {
    let llamada = null;
    const r = await aislar.instalarFetchMock(async (url) => {
        llamada = url;
        return { status: 200, headers: { get: () => null }, json: async () => ({ ok: true }) };
    }, async () => global.fetch('https://api.permitida.test/x'));

    assert.strictEqual(llamada, 'https://api.permitida.test/x');
    assert.strictEqual(r.status, 200);

    // Al salir del mock, la guardia real vuelve a estar activa.
    await assert.rejects(async () => global.fetch('https://api.permitida.test/x'), (e) => /AISLAMIENTO/.test(e.message));
});

// ------------------------------------------------------------------
// 7. axios no puede saltarse la guardia (usa http/https internamente)
// ------------------------------------------------------------------
test('guardias(7): axios NO puede saltarse la guardia de red', async () => {
    let axios = null;
    try { axios = require('axios'); } catch (_) { axios = null; }
    if (!axios) return; // axios no instalado: nada que comprobar

    await assert.rejects(
        () => axios.get('https://example.com'),
        (e) => /AISLAMIENTO/.test(String(e && e.message))
    );
});

// ------------------------------------------------------------------
// 8. Salvaguarda: las guardias siguen activas al terminar este archivo
// ------------------------------------------------------------------
test('guardias(8): las guardias siguen activas al final del archivo', async () => {
    await assert.rejects(async () => global.fetch('https://example.com'), (e) => /AISLAMIENTO/.test(e.message));
    assert.throws(() => http.request('http://example.com'), (e) => /AISLAMIENTO/.test(e.message));
});