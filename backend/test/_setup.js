/**
 * PRELOAD DE PRUEBAS (solo carpeta test/) — se carga con:
 *     node --require ./test/_setup.js --test ...
 *
 * Objetivos:
 *   1) Activar las guardias de red (fetch, TCP, DNS) ANTES de cargar los
 *      módulos bajo prueba.
 *   2) Sustituir a bajo nivel `ioredis` y `mssql` por stubs inertes, de modo
 *      que ni siquiera una llamada accidental a connectRedis()/getPool()
 *      pueda abrir un socket real.
 *
 * Este archivo NO toca producción ni lee/escribe secretos.
 */

'use strict';

const path = require('path');
const Module = require('module');

// 1) Activar guardias de red/TCP/DNS.
require('./_aislamiento');

// ------------------------------------------------------------------
// 2) Interceptar el cargador de módulos para proveer stubs de ioredis/mssql.
//    Se hace antes de que cualquier módulo de src/ los requiera.
// ------------------------------------------------------------------
const origLoad = Module._load;

const STUB_IOREDIS = function RedisStub() {
    // Cliente inerte: no abre ningún socket.
    return {
        on() { return this; },
        once() { return this; },
        get: async () => null,
        set: async () => 'OK',
        setex: async () => 'OK',
        del: async () => 0,
        ping: async () => { throw new Error('[AISLAMIENTO] ioredis stub: ping no permitido'); },
        quit: async () => 'OK',
        disconnect() { },
        flushdb: async () => 'OK'
    };
};

const STUB_MSSQL = {
    ConnectionPool: function ConnectionPoolStub() {
        return {
            connect: async () => { throw new Error('[AISLAMIENTO] mssql stub: connect no permitido'); },
            on() { return this; },
            request() { throw new Error('[AISLAMIENTO] mssql stub: request no permitido'); }
        };
    },
    Transaction: function TransactionStub() {
        return { begin: async () => { throw new Error('[AISLAMIENTO] mssql stub'); } };
    }
};

Module._load = function (request, parent, isMain) {
    if (request === 'ioredis') return STUB_IOREDIS;
    if (request === 'mssql') return STUB_MSSQL;
    return origLoad.call(this, request, parent, isMain);
};

// ------------------------------------------------------------------
// 3) Salvaguarda final: si por cualquier vía se cuela una conexión TCP,
//    se registra de forma inequívoca (además de la guardia que lanza).
// ------------------------------------------------------------------
process.on('warning', (w) => {
    if (w && w.name === 'UnhandledError') {
        // No re-lanzar: solo asegurar visibilidad.
        console.error('[AISLAMIENTO] Aviso durante tests:', w.message);
    }
});
