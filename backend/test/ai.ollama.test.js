/**
 * PRUEBAS FASE 5B.1 — Gestión segura de Ollama (OLLAMA_ENABLED).
 * Sin conexiones reales: aislamiento de la Fase 5A (preload ./test/_setup.js).
 *
 * Cubre los 7 puntos obligatorios:
 *   1. Ollama deshabilitado por defecto.
 *   2. Ollama habilitado SOLO con OLLAMA_ENABLED='true'.
 *   3. Deshabilitado -> no se selecciona como principal ni secundario.
 *   4. Habilitado -> puede seleccionarse según las reglas existentes.
 *   5. Un fallo de disponibilidad NO se interpreta como conexión exitosa.
 *   6. Los demás proveedores y el fallback conservan su comportamiento.
 *   7. Las pruebas no realizan conexiones reales (guardias activas).
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

// Carga fresca de ai.providers con un entorno concreto y lo restaura.
function cargarProviders(env) {
    aislar.purgarModulosSrc(path);
    const prev = {};
    for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }
    const mod = require(path.join(BACKEND, 'src/services/ai.providers.js'));
    return {
        mod,
        restore: () => {
            for (const [k, v] of Object.entries(prev)) {
                if (v === undefined) delete process.env[k]; else process.env[k] = v;
            }
        }
    };
}

// Limpia variables que podrían interferir entre pruebas.
function limpiarEnv() {
    for (const k of ['AI_PROVIDER', 'OLLAMA_ENABLED', 'OLLAMA_HOST', 'OLLAMA_MODEL',
        'GROQ_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'RETO_KEY']) {
        delete process.env[k];
    }
}

// ==================================================================
// 1. DESHABILITADO POR DEFECTO
// ==================================================================
test('ollama(1): deshabilitado por defecto (sin OLLAMA_ENABLED)', () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({});
    try {
        assert.strictEqual(mod.ollamaEnabled(), false);
        assert.strictEqual(mod.PROVIDERS.ollama.configured(), false);
        const info = mod.listProviders().find(p => p.id === 'ollama');
        assert.strictEqual(info.configured, false);
        assert.strictEqual(info.enabled, false);
    } finally { restore(); limpiarEnv(); }
});

test('ollama(1): valores distintos de "true" no habilitan', () => {
    limpiarEnv();
    for (const valor of ['false', '1', 'yes', 'on', 'TRUE', 'True', ' true', '']) {
        const { mod, restore } = cargarProviders({ OLLAMA_ENABLED: valor });
        try {
            assert.strictEqual(mod.ollamaEnabled(), false, `"${valor}" no debe habilitar`);
        } finally { restore(); }
    }
    limpiarEnv();
});

// ==================================================================
// 2. HABILITADO SOLO CON 'true'
// ==================================================================
test('ollama(2): OLLAMA_ENABLED=true habilita', () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({ OLLAMA_ENABLED: 'true' });
    try {
        assert.strictEqual(mod.ollamaEnabled(), true);
        assert.strictEqual(mod.PROVIDERS.ollama.configured(), true);
        const info = mod.listProviders().find(p => p.id === 'ollama');
        assert.strictEqual(info.enabled, true);
    } finally { restore(); limpiarEnv(); }
});

// ==================================================================
// 3. DESHABILITADO: NO SE SELECCIONA
// ==================================================================
test('ollama(3): deshabilitado NO se usa aunque AI_PROVIDER=ollama (ni se sustituye en silencio)', () => {
    limpiarEnv();
    // Hay OTRO proveedor configurado (groq) y el operador pidió ollama, que está
    // deshabilitado. `getProviderName()` respeta la selección EXPLÍCITA (no se
    // cambia de proveedor a espaldas del operador: esa sustitución silenciosa
    // era el error que desviaba AI_PROVIDER=reto hacia Groq). La garantía
    // defensiva se mantiene: ollama NO está configurado, así que el flujo falla
    // con "no configurado" y NUNCA contacta localhost:11434.
    const { mod, restore } = cargarProviders({ AI_PROVIDER: 'ollama', GROQ_API_KEY: 'dummy' });
    try {
        assert.strictEqual(mod.getProviderName(), 'ollama', 'se respeta la selección explícita');
        assert.strictEqual(mod.PROVIDERS.ollama.configured(), false);
        const info = mod.listProviders().find(p => p.id === 'ollama');
        assert.strictEqual(info.active, false, 'no puede figurar como activo si no está configurado');
        assert.strictEqual(info.enabled, false);
    } finally { restore(); limpiarEnv(); }
});

test('ollama(3): deshabilitado y SIN ningún configurado -> solo es una pista, no un proveedor utilizable', () => {
    limpiarEnv();
    // Caso B: nada configurado. getProviderName() devuelve el nombre pedido como
    // PISTA para el mensaje de error (comportamiento heredado), pero ollama NO
    // está "configured", así que generateResponse fallará con "no configurado"
    // en vez de intentar contactar un Ollama inexistente.
    const { mod, restore } = cargarProviders({ AI_PROVIDER: 'ollama', OLLAMA_ENABLED: 'false' });
    try {
        assert.strictEqual(mod.PROVIDERS.ollama.configured(), false);
        const info = mod.listProviders().find(p => p.id === 'ollama');
        assert.strictEqual(info.active, false);
    } finally { restore(); limpiarEnv(); }
});

test('ollama(3): deshabilitado NO se elige como secundario (orden explícito)', () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({
        OLLAMA_ENABLED: 'false',
        GROQ_API_KEY: 'dummy'
    });
    try {
        // Pide Ollama como respaldo de groq: debe devolver null (no configurado).
        // getSecondaryProvider lee ai.config.fallbackProviders; forzamos el orden
        // consultando directamente los PROVIDERS: Ollama no está configurado.
        assert.strictEqual(mod.PROVIDERS.ollama.configured(), false);
        const sec = mod.getSecondaryProvider('groq');
        assert.notStrictEqual(sec && sec.id, 'ollama');
    } finally { restore(); limpiarEnv(); }
});

test('ollama(3): checkAvailability NO conecta si está deshabilitado', async () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({ OLLAMA_ENABLED: 'false' });
    try {
        // Si intentara conectar, la guardia de red lanzaría; debe devolver
        // no_configurado sin tocar la red.
        const r = await mod.checkAvailability('ollama');
        assert.strictEqual(r.state, 'no_configurado');
    } finally { restore(); limpiarEnv(); }
});

test('ollama(3b): sin AI_PROVIDER, ollama deshabilitado no desplaza al proveedor configurado', () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({ OLLAMA_ENABLED: 'false', GROQ_API_KEY: 'dummy' });
    try {
        assert.strictEqual(mod.getProviderName(), 'groq');
    } finally { restore(); limpiarEnv(); }
});

// ==================================================================
// 4. HABILITADO: PUEDE SELECCIONARSE SEGÚN LAS REGLAS
// ==================================================================
test('ollama(4): habilitado + AI_PROVIDER=ollama -> se elige como principal', () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({ AI_PROVIDER: 'ollama', OLLAMA_ENABLED: 'true' });
    try {
        assert.strictEqual(mod.getProviderName(), 'ollama');
        assert.strictEqual(mod.getProvider().name, mod.PROVIDERS.ollama.name);
    } finally { restore(); limpiarEnv(); }
});

test('ollama(4): habilitado y sin otros configurados -> puede ser el activo por FALLBACK_ORDER', () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({ OLLAMA_ENABLED: 'true' });
    try {
        // Sin AI_PROVIDER (ninguna selección explícita) y sin claves de otros,
        // FALLBACK_ORDER llega a ollama.
        assert.strictEqual(mod.getProviderName(), 'ollama');
    } finally { restore(); limpiarEnv(); }
});

// ==================================================================
// 5. FALLO DE DISPONIBILIDAD != CONEXIÓN EXITOSA
// ==================================================================
test('ollama(5): si el servicio no responde, NO se reporta operativo', async () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({ OLLAMA_ENABLED: 'true' });
    try {
        // fetch simulado: conexión rechazada -> la guardia real no se usa aquí,
        // pero forzamos un fallo de red explícito.
        await aislar.instalarFetchMock(async () => { throw new Error('ECONNREFUSED'); }, async () => {
            const r = await mod.checkAvailability('ollama', { force: true });
            assert.strictEqual(r.state, 'temporal');
            assert.notStrictEqual(r.state, 'operativo');
        });
    } finally { restore(); limpiarEnv(); }
});

test('ollama(5): HTTP no-OK en /api/tags NO se reporta operativo', async () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({ OLLAMA_ENABLED: 'true' });
    try {
        await aislar.instalarFetchMock(async () => ({ ok: false, status: 500, headers: { get: () => null } }), async () => {
            const r = await mod.checkAvailability('ollama', { force: true });
            assert.strictEqual(r.state, 'temporal');
        });
    } finally { restore(); limpiarEnv(); }
});

test('ollama(5): "configurado" no implica "disponible"', () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({ OLLAMA_ENABLED: 'true' });
    try {
        // Habilitado/configured == true, pero eso NO afirma disponibilidad.
        assert.strictEqual(mod.PROVIDERS.ollama.configured(), true);
        // No existe ninguna propiedad que afirme disponibilidad sin comprobarla.
        assert.strictEqual(typeof mod.checkAvailability, 'function');
    } finally { restore(); limpiarEnv(); }
});

// ==================================================================
// 6. LOS DEMÁS PROVEEDORES CONSERVAN SU COMPORTAMIENTO
// ==================================================================
test('ollama(6): groq configurado se elige como principal igual que antes', () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({ AI_PROVIDER: 'groq', GROQ_API_KEY: 'dummy' });
    try {
        assert.strictEqual(mod.getProviderName(), 'groq');
    } finally { restore(); limpiarEnv(); }
});

test('ollama(6): secundario sigue siendo gemini con groq activo y claves presentes', () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({
        AI_PROVIDER: 'groq', GROQ_API_KEY: 'dummy', GEMINI_API_KEY: 'dummy',
        AI_FALLBACK_PROVIDERS: 'gemini,openrouter,anthropic'
    });
    try {
        const sec = mod.getSecondaryProvider('groq');
        assert.ok(sec, 'debe haber un secundario configurado');
        assert.strictEqual(sec.id, 'gemini');
    } finally { restore(); limpiarEnv(); }
});

test('ollama(6): listProviders expone los 6 proveedores con enabled coherente', () => {
    limpiarEnv();
    const { mod, restore } = cargarProviders({});
    try {
        const lista = mod.listProviders();
        assert.strictEqual(lista.length, 6);
        // Todos enabled=true salvo ollama (deshabilitado).
        const ollama = lista.find(p => p.id === 'ollama');
        assert.strictEqual(ollama.enabled, false);
        for (const p of lista) {
            if (p.id !== 'ollama') assert.strictEqual(p.enabled, true, `${p.id} debe estar enabled`);
        }
    } finally { restore(); limpiarEnv(); }
});

// ==================================================================
// 7. SIN CONEXIONES REALES
// ==================================================================
test('ollama(7): la guardia de fetch sigue activa tras estas pruebas', async () => {
    await assert.rejects(
        async () => global.fetch('http://localhost:11434/api/tags'),
        (e) => /AISLAMIENTO/.test(e.message)
    );
});
