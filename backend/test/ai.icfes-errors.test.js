/**
 * PRUEBAS FASE 5B.4 — H-01: generateICFESQuestion NO filtra el mensaje crudo
 * del proveedor al estudiante ni a los logs.
 *
 * Sin conexiones reales: aislamiento de la Fase 5A (preload ./test/_setup.js).
 * El proveedor se stubea; nunca se toca la red.
 *
 * Verifica además que se preservan:
 *   - la propagación de AppError previos,
 *   - los códigos HTTP que asigna toAppError(),
 *   - la clasificación de errores recuperables,
 *   - retryAfterSeconds cuando corresponde,
 *   - el mensaje controlado ante proveedor sin configurar.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

const CENTINELA = 'DETALLE_UPSTREAM_INTERNO_XYZ_123';

// Carga ai.service fresco con un proveedor stubeado cuyo completion lanza el
// error indicado. Devuelve { aiService, restore }.
function conProveedorQueFalla(errorAFabricar, { configured = true } = {}) {
    aislar.purgarModulosSrc(path);
    const aiProviders = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));

    const orig = {
        getProvider: aiProviders.getProvider,
        getProviderName: aiProviders.getProviderName
    };
    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({
        configured: () => configured,
        model: () => 'modelo-test',
        paid: false,
        completion: async () => { throw errorAFabricar(); }
    });

    return {
        aiService,
        restore: () => {
            aiProviders.getProvider = orig.getProvider;
            aiProviders.getProviderName = orig.getProviderName;
        }
    };
}

// Captura console.error durante fn().
async function capturandoErrores(fn) {
    const capturas = [];
    const orig = console.error;
    console.error = (...args) => { capturas.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); };
    try { return await fn(); } finally { console.error = orig; }
}

// Ejecuta generateICFESQuestion y devuelve el error lanzado (o null).
async function capturarError(aiService) {
    try {
        await aiService.generateICFESQuestion({ subject: 'matematicas', topic: 'algebra', difficulty: 'medium', userId: 'u' });
        return null;
    } catch (e) {
        return e;
    }
}

// ==================================================================
// 1. NO FILTRA EL MENSAJE CRUDO DEL PROVEEDOR
// ==================================================================
test('icfes(1): el mensaje crudo del proveedor NO aparece en la respuesta', async () => {
    const err = new Error(CENTINELA);
    err.status = 500;
    const { aiService, restore } = conProveedorQueFalla(() => err);
    try {
        const capturado = await capturarError(aiService);
        assert.ok(capturado, 'debe lanzar un error');
        assert.ok(!String(capturado.message).includes(CENTINELA), 'el mensaje al cliente no debe contener el texto crudo');
        assert.strictEqual(capturado.statusCode, 503);
    } finally { restore(); }
});

test('icfes(1b): el mensaje crudo tampoco aparece en los logs', async () => {
    const err = new Error(CENTINELA);
    err.status = 500;
    const { aiService, restore } = conProveedorQueFalla(() => err);
    try {
        const salida = await capturandoErrores(() => capturarError(aiService));
        const texto = JSON.stringify(salida);
        assert.ok(!texto.includes(CENTINELA), 'los logs no deben contener el texto crudo del proveedor');
    } finally { restore(); }
});

// ==================================================================
// 2. CÓDIGOS HTTP PRESERVADOS
// ==================================================================
test('icfes(2): 429 conserva el código HTTP 429', async () => {
    const err = new Error(CENTINELA); err.status = 429;
    const { aiService, restore } = conProveedorQueFalla(() => err);
    try {
        const c = await capturarError(aiService);
        assert.strictEqual(c.statusCode, 429);
        assert.ok(!String(c.message).includes(CENTINELA));
    } finally { restore(); }
});

test('icfes(2): 400 conserva el código HTTP 400', async () => {
    const err = new Error(CENTINELA); err.status = 400;
    const { aiService, restore } = conProveedorQueFalla(() => err);
    try {
        const c = await capturarError(aiService);
        assert.strictEqual(c.statusCode, 400);
    } finally { restore(); }
});

test('icfes(2): 401 se mapea a 503 (credenciales)', async () => {
    const err = new Error(CENTINELA); err.status = 401;
    const { aiService, restore } = conProveedorQueFalla(() => err);
    try {
        const c = await capturarError(aiService);
        assert.strictEqual(c.statusCode, 503);
        assert.ok(!String(c.message).includes(CENTINELA));
    } finally { restore(); }
});

test('icfes(2): 404 se mapea a 503 (modelo inexistente)', async () => {
    const err = new Error(CENTINELA); err.status = 404;
    const { aiService, restore } = conProveedorQueFalla(() => err);
    try {
        const c = await capturarError(aiService);
        assert.strictEqual(c.statusCode, 503);
    } finally { restore(); }
});

test('icfes(2): timeout (408) se mapea a 504', async () => {
    const err = new Error('aborted'); err.status = 408; err.name = 'AbortError';
    const { aiService, restore } = conProveedorQueFalla(() => err);
    try {
        const c = await capturarError(aiService);
        assert.strictEqual(c.statusCode, 504);
    } finally { restore(); }
});

// ==================================================================
test('icfes(2): 502 conserva el codigo HTTP y el mensaje especifico', async () => {
    const err = new Error(CENTINELA); err.status = 502;
    const { aiService, restore } = conProveedorQueFalla(() => err);
    try {
        const c = await capturarError(aiService);
        assert.strictEqual(c.statusCode, 502);
        assert.match(c.message, /respuesta inv.lida/i);
        assert.ok(!String(c.message).includes(CENTINELA));
    } finally { restore(); }
});

test('icfes(2): 503 sigue mapeado a indisponibilidad temporal', async () => {
    const err = new Error(CENTINELA); err.status = 503;
    const { aiService, restore } = conProveedorQueFalla(() => err);
    try {
        const c = await capturarError(aiService);
        assert.strictEqual(c.statusCode, 503);
        assert.ok(!String(c.message).includes(CENTINELA));
    } finally { restore(); }
});

// 3. AppError PREVIO SE PROPAGA TAL CUAL
// ==================================================================
test('icfes(3): un AppError previo se propaga sin transformar', async () => {
    const { aiService, restore } = conProveedorQueFalla(() => {
        const { AppError } = require(path.join(BACKEND, 'src/middleware/error.middleware.js'));
        return new AppError('Error operacional propio', 400);
    });
    try {
        const c = await capturarError(aiService);
        assert.strictEqual(c.statusCode, 400);
        assert.strictEqual(c.message, 'Error operacional propio');
    } finally { restore(); }
});

// ==================================================================
// 4. PROVEEDOR NO CONFIGURADO -> ERROR CONTROLADO
// ==================================================================
test('icfes(4): proveedor sin configurar produce error controlado 503', async () => {
    const { aiService, restore } = conProveedorQueFalla(() => new Error('no deberia llamarse'), { configured: false });
    try {
        const c = await capturarError(aiService);
        assert.strictEqual(c.statusCode, 503);
        assert.ok(/no está configurado/i.test(c.message));
    } finally { restore(); }
});

// ==================================================================
// 5. CLASIFICACIÓN DE RECUPERABLE Y RETRY-AFTER
// ==================================================================
test('icfes(5): 429 se marca como recuperable y propaga retryAfterSeconds', async () => {
    const err = new Error('rate limit'); err.status = 429; err.retryAfterSeconds = 7;
    const { aiService, restore } = conProveedorQueFalla(() => err);
    try {
        const c = await capturarError(aiService);
        assert.strictEqual(c.recoverable, true);
        assert.strictEqual(c.retryAfterSeconds, 7);
    } finally { restore(); }
});

test('icfes(5): 400 NO se marca como recuperable', async () => {
    const err = new Error('bad request'); err.status = 400;
    const { aiService, restore } = conProveedorQueFalla(() => err);
    try {
        const c = await capturarError(aiService);
        assert.strictEqual(c.recoverable, false);
    } finally { restore(); }
});

// ==================================================================
// 6. LOS MOCKS NO DEPENDEN DE LA RED (guardia activa)
// ==================================================================
test('icfes(6): la guardia de fetch sigue activa tras estas pruebas', async () => {
    await assert.rejects(
        async () => global.fetch('https://api.groq.com/openai/v1/models'),
        (e) => /AISLAMIENTO/.test(e.message)
    );
});
