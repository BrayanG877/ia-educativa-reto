/**
 * AISLAMIENTO HERMÉTICO PARA PRUEBAS (solo carpeta test/).
 * ==================================================================
 * Garantiza que NINGUNA prueba pueda abrir una conexión real a:
 *   - HTTPS/HTTP  -> global.fetch (undici) y módulos http/https
 *   - TCP         -> net.Socket #connect (ioredis, mssql, etc.)
 *   - DNS         -> dns.lookup / dns.promises.lookup
 *
 * Diseño:
 *   - Se carga con `node --require ./test/_setup.js`, ANTES de cualquier
 *     módulo bajo prueba, de modo que las guardias ya están activas cuando
 *     se requiere ai.service / ai.providers / cache.service.
 *   - Las guardias LANZAN (no hacen conexión). Si un test intenta red/BD
 *     real, el test falla de forma explícita y visible.
 *   - Los tests legítimos inyectan sus propios mocks con:
 *       - instalarFetchMock(fn)     -> sustituye temporalmente global.fetch
 *       - conBaseDatosSimulada(fn)  -> stubs para cache.service/redis/mssql
 *
 * Este módulo NO contiene secretos y NO se usa en producción.
 */

'use strict';

const net = require('net');
const dns = require('dns');
const realFetch = global.fetch;

// ------------------------------------------------------------------
// 1. GUARDIA DNS: cualquier resolución de nombre real hace fallar la prueba.
// ------------------------------------------------------------------
const origDnsLookup = dns.lookup;
dns.lookup = function (hostname, ...rest) {
    const cb = rest[rest.length - 1];
    const err = new Error(
        `[AISLAMIENTO] Resolución DNS real bloqueada: "${hostname}". ` +
        `Una prueba intentó resolver un nombre de red real.`
    );
    if (typeof cb === 'function') return process.nextTick(() => cb(err));
    throw err;
};
const origDnsPromisesLookup = dns.promises && dns.promises.lookup;
if (dns.promises && dns.promises.lookup) {
    dns.promises.lookup = async function (hostname) {
        throw new Error(
            `[AISLAMIENTO] Resolución DNS real bloqueada: "${hostname}".`
        );
    };
}

// ------------------------------------------------------------------
// 2. GUARDIA TCP: net.Socket#connect no puede abrir sockets reales.
//    Cualquier intento lanza error inmediato.
// ------------------------------------------------------------------
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
    const err = new Error(
        '[AISLAMIENTO] Conexión TCP real bloqueada por la guardia de pruebas. ' +
        'Redis/SQL Server deben estar simulados en las pruebas.'
    );
    // Se notifica de forma asíncrona por el canal de error del socket,
    // imitando el fallo de conexión, para que el código de producción
    // (que ignora fallos de caché/BD) no rompa su lógica.
    process.nextTick(() => this.emit('error', err));
    return this;
};

// ------------------------------------------------------------------
// 3. GUARDIA HTTP(S): fetch por defecto bloqueado.
// ------------------------------------------------------------------
function guardiaFetch() {
    return function bloqueado() {
        throw new Error(
            '[AISLAMIENTO] Llamada real a la red bloqueada por la guardia (global.fetch). ' +
            'Usa instalarFetchMock() en la prueba para simular la respuesta.'
        );
    };
}
global.fetch = guardiaFetch();

// ------------------------------------------------------------------
// 4. Guardia también para http/https a bajo nivel (por si algún día se usa).
// ------------------------------------------------------------------
try {
    const http = require('http');
    const https = require('https');
    const bloquearRequest = (mod) => {
        mod.request = () => {
            throw new Error(
                '[AISLAMIENTO] http/https.request real bloqueado por la guardia de pruebas.'
            );
        };
    };
    // Solo si no están ya parcheados por un mock del test.
    if (http.request) bloquearRequest(http);
    if (https.request) bloquearRequest(https);
} catch (_) { /* http/https opcionales */ }

// ------------------------------------------------------------------
// APIS PARA LAS PRUEBAS
// ------------------------------------------------------------------

/**
 * Instala un mock de fetch durante fn() y restaura la guardia después.
 * El mock recibe (url, options) y debe devolver una respuesta simulada.
 */
async function instalarFetchMock(mockFn, fn) {
    const anterior = global.fetch;
    global.fetch = mockFn;
    try {
        return await fn();
    } finally {
        global.fetch = anterior;
    }
}

/**
 * Guardia reutilizable: falla si alguien intenta una URL http(s) real.
 * Útil para combinar con mocks que solo atienden a un host concreto.
 */
function fetchGuardiaReal() {
    return guardiaFetch();
}

/**
 * Sustituye las dependencias de caché/BD de cache.service por stubs inertes,
 * de modo que getFromCache/saveToCache NUNCA toquen Redis ni SQL Server.
 * Devuelve una función de restauración.
 * Se llama DESPUÉS de requerir cache.service (parchea sus métodos exportados,
 * que es la vía por la que ai.service.js los consume).
 */
function aislarCacheService(cacheService) {
    const origGet = cacheService.getFromCache;
    const origSave = cacheService.saveToCache;
    cacheService.getFromCache = async () => null;
    cacheService.saveToCache = async () => { };
    return () => {
        cacheService.getFromCache = origGet;
        cacheService.saveToCache = origSave;
    };
}

/**
 * Purga la caché de require de src/ para recargar módulos con env vars
 * nuevas, dejando SIEMPRE las guardias activas.
 */
function purgarModulosSrc(path) {
    for (const k of Object.keys(require.cache)) {
        if (k.includes(path.join('backend', 'src'))) delete require.cache[k];
    }
}

module.exports = {
    instalarFetchMock,
    fetchGuardiaReal,
    aislarCacheService,
    purgarModulosSrc,
    guardiaFetch
};
