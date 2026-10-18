/**
 * Pruebas de seguridad: garantizar que NINGÚN secreto se filtra en la salida
 * del subsistema de IA (que en este proyecto usa console.* directamente).
 * NO requiere módulos que no existan.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const CENTINELA = 'gsk_SECRETO_CENTINELA_1234567890';

// Captura stdout+stderr durante la ejecución de fn().
async function capturandoSalida(fn) {
    const capturas = [];
    const origOut = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = (c) => { capturas.push(String(c)); return true; };
    process.stderr.write = (c) => { capturas.push(String(c)); return true; };
    try { await fn(); } finally {
        process.stdout.write = origOut;
        process.stderr.write = origErr;
    }
    return capturas.join('\n');
}

function cargarProviders() {
    delete require.cache[require.resolve(path.join(BACKEND, 'src/services/ai.providers.js'))];
    return require(path.join(BACKEND, 'src/services/ai.providers.js'));
}

test('listProviders() NO expone el valor de las claves', () => {
    process.env.GROQ_API_KEY = CENTINELA;
    const aiProviders = cargarProviders();
    const salida = JSON.stringify(aiProviders.listProviders());
    assert.ok(!salida.includes(CENTINELA), 'la clave no debe aparecer en la lista de proveedores');
});

test('la configuración exportada NO contiene valores de claves', () => {
    process.env.GROQ_API_KEY = CENTINELA;
    process.env.RETO_KEY = CENTINELA;
    delete require.cache[require.resolve(path.join(BACKEND, 'src/config/ai.config.js'))];
    const aiConfig = require(path.join(BACKEND, 'src/config/ai.config.js'));
    const s = JSON.stringify(aiConfig);
    assert.ok(!s.includes(CENTINELA), 'la config no debe serializar el valor de la clave');
    assert.ok(!/gsk_|sk-ant|sk-or-|AIza/.test(s), 'la config no debe contener patrones de clave');
});

test('validate() AVISA de clave ausente SIN imprimir la clave del otro proveedor', () => {
    process.env.GROQ_API_KEY = CENTINELA;
    delete require.cache[require.resolve(path.join(BACKEND, 'src/config/ai.config.js'))];
    const aiConfig = require(path.join(BACKEND, 'src/config/ai.config.js'));
    const r = aiConfig.validate();
    const texto = JSON.stringify(r);
    assert.ok(!texto.includes(CENTINELA), 'el informe de validación no debe contener la clave');
});

test('un error del proveedor NO incluye la clave en su mensaje', async () => {
    process.env.GROQ_API_KEY = CENTINELA;
    const aiProviders = cargarProviders();
    const origFetch = global.fetch;
    global.fetch = async () => ({
        status: 401,
        headers: { get: () => null },
        json: async () => ({ error: { message: 'invalid api key' } })
    });
    let capturado = null;
    try {
        await aiProviders.PROVIDERS.groq.completion({ system: 's', messages: [{ role: 'user', content: 'x' }] });
    } catch (e) {
        capturado = e;
    } finally {
        global.fetch = origFetch;
    }
    assert.ok(capturado, 'debe lanzar error');
    assert.ok(!String(capturado.message).includes(CENTINELA), 'el mensaje de error no debe contener la clave');
});

test('la salida del flujo (console) no filtra la clave durante una llamada mockeada', async () => {
    process.env.GROQ_API_KEY = CENTINELA;
    process.env.AI_PROVIDER = 'groq';
    const aiProviders = cargarProviders();
    const aiService = require(path.join(BACKEND, 'src/services/ai.service.js'));

    const origGet = aiProviders.getProvider, origName = aiProviders.getProviderName;
    aiProviders.getProviderName = () => 'groq';
    aiProviders.getProvider = () => ({
        configured: () => true, model: () => 'm', paid: false,
        completion: async () => ({ text: 'respuesta', inputTokens: 1, outputTokens: 1 })
    });
    const cacheService = require(path.join(BACKEND, 'src/services/cache.service.js'));
    const og = cacheService.getFromCache, os = cacheService.saveToCache;
    cacheService.getFromCache = async () => null; cacheService.saveToCache = async () => { };

    try {
        const salida = await capturandoSalida(async () => {
            await aiService.generateResponse({ message: 'hola', subject: 'matematicas', history: [], mode: 'socratic', userId: 'u' });
        });
        assert.ok(!salida.includes(CENTINELA), 'los logs del flujo no deben contener la clave');
    } finally {
        aiProviders.getProvider = origGet; aiProviders.getProviderName = origName;
        cacheService.getFromCache = og; cacheService.saveToCache = os;
    }
});
