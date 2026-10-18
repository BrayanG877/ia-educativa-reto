/**
 * PRUEBAS FASE 5B.8 — BANDERAS DEL AGENTE TUTOR (configuración explícita).
 * ==================================================================
 * Objetivo: verificar el comportamiento UNIFICADO y DOCUMENTADO de:
 *   - AGENT_ENABLED
 *   - AGENT_PERSISTENCE_ENABLED
 *
 * Reglas exigidas:
 *   1) Ausencia de configuración -> AMBAS desactivadas (false).
 *   2) 'true' explícito -> la bandera correspondiente se activa.
 *   3) 'false' explícito -> desactivada.
 *   4) La persistencia NO escribe por sí sola sin agente (acoplamiento).
 *   5) Con AGENT_ENABLED=true se conserva el comportamiento pedagógico.
 *
 * Aislamiento: preload test/_setup.js (guardias de red + stubs ioredis/mssql).
 * No se toca RDS, Redis ni ningún proveedor real.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const aislar = require('./_aislamiento');
const BACKEND = path.join(__dirname, '..');

// Variables que podrían filtrarse entre pruebas.
const FLAGS = ['AGENT_ENABLED', 'AGENT_PERSISTENCE_ENABLED'];

function limpiarFlags() { for (const k of FLAGS) delete process.env[k]; }

// Carga ai.config fresco con un entorno concreto y lo restaura.
function cargarConfig(env) {
    aislar.purgarModulosSrc(path);
    limpiarFlags();
    const prev = {};
    for (const [k, v] of Object.entries(env)) { prev[k] = process.env[k]; process.env[k] = v; }
    const mod = require(path.join(BACKEND, 'src/config/ai.config.js'));
    return {
        mod,
        restore: () => {
            for (const [k, v] of Object.entries(prev)) {
                if (v === undefined) delete process.env[k]; else process.env[k] = v;
            }
            limpiarFlags();
        }
    };
}

// ==================================================================
// 1. AUSENCIA DE CONFIGURACIÓN -> DESACTIVADAS POR DEFECTO
// ==================================================================
test('flags(1): sin variables, AGENT_ENABLED=false y AGENT_PERSISTENCE_ENABLED=false', () => {
    const { mod, restore } = cargarConfig({});
    try {
        assert.strictEqual(mod.agentEnabled, false, 'el tutor debe estar desactivado por defecto');
        assert.strictEqual(mod.agentPersistenceEnabled, false, 'la persistencia debe estar desactivada por defecto');
    } finally { restore(); }
});

test('flags(1b): variable vacía se trata como ausente -> false', () => {
    const { mod, restore } = cargarConfig({ AGENT_ENABLED: '', AGENT_PERSISTENCE_ENABLED: '' });
    try {
        assert.strictEqual(mod.agentEnabled, false);
        assert.strictEqual(mod.agentPersistenceEnabled, false);
    } finally { restore(); }
});

test('flags(1c): valores NO reconocidos caen al default seguro (false)', () => {
    // NOTA: 'si'/'sí' SÍ se aceptan como afirmativos (ver readBool), por eso
    // no aparecen aquí. Los valores de abajo no son afirmativos válidos.
    for (const valor of ['quizas', '2', 'enabled', 'x', 'tru', 'off']) {
        const { mod, restore } = cargarConfig({ AGENT_ENABLED: valor, AGENT_PERSISTENCE_ENABLED: valor });
        try {
            assert.strictEqual(mod.agentEnabled, false, `"${valor}" no debe activar el agente`);
            assert.strictEqual(mod.agentPersistenceEnabled, false, `"${valor}" no debe activar la persistencia`);
        } finally { restore(); }
    }
});

test('flags(1d): "si"/"sí" SÍ se aceptan como afirmativos', () => {
    for (const valor of ['si', 'sí']) {
        const { mod, restore } = cargarConfig({ AGENT_ENABLED: valor });
        try {
            assert.strictEqual(mod.agentEnabled, true, `"${valor}" debe activar el agente`);
        } finally { restore(); }
    }
});

// ==================================================================
// 2. 'true' EXPLÍCITO -> ACTIVADAS
// ==================================================================
test('flags(2): AGENT_ENABLED=true activa el tutor', () => {
    const { mod, restore } = cargarConfig({ AGENT_ENABLED: 'true' });
    try {
        assert.strictEqual(mod.agentEnabled, true);
        assert.strictEqual(mod.agentPersistenceEnabled, false, 'la persistencia sigue OFF si no se pide');
    } finally { restore(); }
});

test('flags(2b): AGENT_PERSISTENCE_ENABLED=true activa la persistencia', () => {
    const { mod, restore } = cargarConfig({ AGENT_PERSISTENCE_ENABLED: 'true' });
    try {
        assert.strictEqual(mod.agentPersistenceEnabled, true);
        assert.strictEqual(mod.agentEnabled, false, 'el tutor sigue OFF si no se pide');
    } finally { restore(); }
});

test('flags(2c): variantes aceptadas de "true" (1/yes/on/si)', () => {
    for (const valor of ['true', '1', 'yes', 'on', 'si']) {
        const { mod, restore } = cargarConfig({ AGENT_ENABLED: valor });
        try {
            assert.strictEqual(mod.agentEnabled, true, `"${valor}" debe activar el agente`);
        } finally { restore(); }
    }
});

// ==================================================================
// 3. 'false' EXPLÍCITO -> DESACTIVADAS
// ==================================================================
test('flags(3): AGENT_ENABLED=false desactiva el tutor', () => {
    const { mod, restore } = cargarConfig({ AGENT_ENABLED: 'false' });
    try {
        assert.strictEqual(mod.agentEnabled, false);
    } finally { restore(); }
});

test('flags(3b): AGENT_PERSISTENCE_ENABLED=false desactiva la persistencia', () => {
    const { mod, restore } = cargarConfig({ AGENT_PERSISTENCE_ENABLED: 'false' });
    try {
        assert.strictEqual(mod.agentPersistenceEnabled, false);
    } finally { restore(); }
});

// ==================================================================
// 4. tutor.integration respeta las banderas
// ==================================================================
test('flags(4): persistencia OFF -> registrarTurno NO llama a query', async () => {
    aislar.purgarModulosSrc(path);
    limpiarFlags();
    process.env.AGENT_ENABLED = 'true';
    process.env.AGENT_PERSISTENCE_ENABLED = 'false';
    const integ = require(path.join(BACKEND, 'src/services/tutor.integration.js'));
    try {
        assert.strictEqual(integ.persistenciaHabilitada(), false);
        let llamada = false;
        const r = await integ.registrarTurno(async () => { llamada = true; return { rows: [] }; }, {
            plan: { action: 'teach', competence: 'x', shouldEvaluate: false },
            conversationId: 'c', userId: 'u', subject: 'matematicas', mode: 'socratic'
        });
        assert.strictEqual(llamada, false, 'no debe escribir sin persistencia');
        assert.strictEqual(r.persisted, false);
    } finally { limpiarFlags(); }
});

test('flags(4b): persistencia ON -> registrarTurno intenta registrar', async () => {
    aislar.purgarModulosSrc(path);
    limpiarFlags();
    process.env.AGENT_ENABLED = 'true';
    process.env.AGENT_PERSISTENCE_ENABLED = 'true';
    const integ = require(path.join(BACKEND, 'src/services/tutor.integration.js'));
    try {
        assert.strictEqual(integ.persistenciaHabilitada(), true);
        let llamada = false;
        const r = await integ.registrarTurno(async () => { llamada = true; return { rows: [] }; }, {
            plan: { action: 'teach', competence: 'x', shouldEvaluate: false },
            conversationId: 'c', userId: 'u', subject: 'matematicas', mode: 'socratic'
        });
        assert.strictEqual(llamada, true, 'debe registrar con persistencia activa');
        assert.strictEqual(r.persisted, true);
    } finally { limpiarFlags(); }
});

test('flags(4c): agente OFF -> construirContextoPedagogico devuelve vacío', () => {
    aislar.purgarModulosSrc(path);
    limpiarFlags();
    process.env.AGENT_ENABLED = 'false';
    const integ = require(path.join(BACKEND, 'src/services/tutor.integration.js'));
    try {
        assert.strictEqual(integ.agenteHabilitado(), false);
        const ctx = integ.construirContextoPedagogico({ message: 'no entiendo', subject: 'matematicas', mode: 'socratic', history: [] });
        assert.strictEqual(ctx, '', 'sin agente no debe haber contexto pedagógico');
    } finally { limpiarFlags(); }
});

// ==================================================================
// 5. AGENT_ENABLED=true conserva el comportamiento pedagógico
// ==================================================================
test('flags(5): AGENT_ENABLED=true produce plan y contexto pedagógico', () => {
    aislar.purgarModulosSrc(path);
    limpiarFlags();
    process.env.AGENT_ENABLED = 'true';
    const integ = require(path.join(BACKEND, 'src/services/tutor.integration.js'));
    try {
        assert.strictEqual(integ.agenteHabilitado(), true);
        const plan = integ.planificarSeguro({ message: 'no entiendo nada', subject: 'matematicas', mode: 'socratic', history: [] });
        assert.ok(plan, 'debe haber plan con el agente activo');
        assert.strictEqual(plan.action, 'teach', 'la intención "no entiendo" -> teach');
        const ctx = integ.construirContextoPedagogico({ message: 'no entiendo nada', subject: 'matematicas', mode: 'socratic', history: [] });
        assert.ok(ctx.includes('CONTEXTO PEDAGOGICO DEL TURNO'), 'debe incluir el bloque pedagógico');
    } finally { limpiarFlags(); }
});

// ==================================================================
// 6. La guardia de red sigue activa tras estas pruebas
// ==================================================================
test('flags(6): la guardia de red sigue activa', async () => {
    await assert.rejects(async () => global.fetch('https://example.com'), (e) => /AISLAMIENTO/.test(e.message));
});