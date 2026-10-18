/**
 * PRUEBAS FASE 5B.8 — AISLAMIENTO DEL ARRANQUE DE server.js.
 * ==================================================================
 * Objetivo: DEMOSTRAR que IMPORTAR server.js (require) NO produce efectos
 * secundarios de arranque:
 *   - No abre el puerto HTTP (no llama a app.listen).
 *   - No conecta con SQL Server ni con Redis.
 *   - No registra los manejadores de señales de terminación.
 *
 * El arranque automático está condicionado a `require.main === module`, de
 * modo que sigue funcionando igual cuando se ejecuta `node src/server.js`
 * (producción) pero NO al importarlo desde una prueba.
 *
 * Además se comprueba que el módulo SÍ exporta la app de Express y startServer,
 * para que el arranque real siga siendo posible cuando se desee.
 *
 * Aislamiento: preload test/_setup.js (guardias de red/TCP/DNS + stubs de
 * ioredis/mssql). No se inicia el servidor real en ningún momento.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

// ------------------------------------------------------------------
// Helper: registra si app.listen fue invocado durante la importación.
// ------------------------------------------------------------------
function importarServidorConEspia() {
    aislar.purgarModulosSrc(path);

    const express = require('express');
    const origListen = express.application.listen;
    let listenLlamado = false;
    express.application.listen = function (...args) {
        listenLlamado = true;
        // No se delega al listen real: si se llamara, abriría un puerto.
        throw new Error('[TEST] app.listen fue invocado durante la importación (NO debe ocurrir).');
    };

    const señalesAntes = {
        SIGTERM: process.listenerCount('SIGTERM'),
        SIGINT: process.listenerCount('SIGINT')
    };

    let mod = null;
    let error = null;
    try {
        mod = require(path.join(BACKEND, 'src/server.js'));
    } catch (e) {
        error = e;
    }

    const señalesDespues = {
        SIGTERM: process.listenerCount('SIGTERM'),
        SIGINT: process.listenerCount('SIGINT')
    };

    express.application.listen = origListen;
    return { mod, error, listenLlamado, señalesAntes, señalesDespues };
}

// ==================================================================
// 1. IMPORTAR NO ABRE PUERTO NI LANZA
// ==================================================================
test('server-import(1): importar server.js NO llama a app.listen y no lanza', () => {
    const { mod, error, listenLlamado } = importarServidorConEspia();
    assert.strictEqual(error, null, `importar server.js no debe lanzar: ${error && error.message}`);
    assert.strictEqual(listenLlamado, false, 'app.listen NO debe invocarse al importar');
    assert.ok(mod, 'el módulo debe exportarse');
});

// ==================================================================
// 2. EXPORTA LA APP Y startServer
// ==================================================================
test('server-import(2): el módulo exporta la app de Express y startServer', () => {
    const { mod, error } = importarServidorConEspia();
    assert.strictEqual(error, null);
    assert.strictEqual(typeof mod, 'function', 'la exportación por defecto debe ser la app (función de Express)');
    assert.strictEqual(typeof mod.startServer, 'function', 'debe exportarse startServer para el arranque explícito');
});

// ==================================================================
// 3. IMPORTAR NO REGISTRA MANEJADORES DE SEÑALES
// ==================================================================
test('server-import(3): importar server.js NO registra SIGTERM/SIGINT', () => {
    const { señalesAntes, señalesDespues, error } = importarServidorConEspia();
    assert.strictEqual(error, null);
    assert.strictEqual(señalesDespues.SIGTERM, señalesAntes.SIGTERM, 'no debe añadirse un manejador SIGTERM al importar');
    assert.strictEqual(señalesDespues.SIGINT, señalesAntes.SIGINT, 'no debe añadirse un manejador SIGINT al importar');
});

// ==================================================================
// 4. IMPORTAR NO CONECTA A SQL SERVER NI REDIS
// ==================================================================
test('server-import(4): importar server.js NO conecta a SQL Server ni Redis', () => {
    aislar.purgarModulosSrc(path);

    // Se espían las funciones de conexión ANTES de importar server.js.
    const database = require(path.join(BACKEND, 'src/config/database.js'));
    const redis = require(path.join(BACKEND, 'src/config/redis.js'));

    const origConnectDatabase = database.connectDatabase;
    const origConnectRedis = redis.connectRedis;
    let dbLlamada = false;
    let redisLlamada = false;

    // Se parchean las funciones del módulo ya cargado. server.js hace
    // `require('./config/database')` y usa la MISMA instancia cacheada.
    database.connectDatabase = async () => { dbLlamada = true; return true; };
    redis.connectRedis = async () => { redisLlamada = true; return null; };

    try {
        require(path.join(BACKEND, 'src/server.js'));
        assert.strictEqual(dbLlamada, false, 'no debe conectarse a SQL Server al importar');
        assert.strictEqual(redisLlamada, false, 'no debe conectarse a Redis al importar');
    } finally {
        database.connectDatabase = origConnectDatabase;
        redis.connectRedis = origConnectRedis;
    }
});

// ==================================================================
// 5. startServer ES INYECTABLE (se puede llamar explícitamente)
// ==================================================================
test('server-import(5): startServer está disponible para arranque explícito', () => {
    const { mod, error } = importarServidorConEspia();
    assert.strictEqual(error, null);
    assert.strictEqual(typeof mod.startServer, 'function');
    // NO se invoca: arrancarlo abriría un puerto. Solo se comprueba su presencia.
});

// ==================================================================
// 6. La guardia de red sigue activa tras importar el servidor
// ==================================================================
test('server-import(6): la guardia de red sigue activa tras importar server.js', async () => {
    importarServidorConEspia();
    await assert.rejects(async () => global.fetch('https://example.com'), (e) => /AISLAMIENTO/.test(e.message));
});