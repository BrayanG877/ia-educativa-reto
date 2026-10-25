/**
 * ANALÍTICA DE APRENDIZAJE — Clasificación e instrumentación
 * ==================================================================
 * Verifica el corazón pedagógico del panel: que los indicadores del
 * profesor provengan de reglas reproducibles y de eventos registrados
 * de verdad, no de valores inventados.
 *
 *   1. Clasificación de tema por palabras clave (reproducible, sin IA).
 *   2. "Correcto con pistas" NO se registra como dominio independiente.
 *   3. Registrar un evento escribe columnas correctas y no lanza si falla.
 *   4. Los umbrales de dificultad se aplican tal y como se documentan.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const classifier = require(path.join(BACKEND, 'src/services/learning.classifier.js'));
const analytics = require(path.join(BACKEND, 'src/services/analytics.service.js'));

function invalidaSrc() {
    const marcador = `${path.sep}src${path.sep}`;
    for (const k of Object.keys(require.cache)) {
        if (k.toLowerCase().includes(marcador.toLowerCase())) delete require.cache[k];
    }
}

const CATALOGO = [
    { subjectCode: 'matematicas', topic: 'Operaciones con fracciones', concept: 'Suma y resta',
      keywords: ['fraccion', 'fracciones', 'numerador', 'denominador'] },
    { subjectCode: 'matematicas', topic: 'Ecuaciones de primer grado', concept: 'Transposición',
      keywords: ['ecuacion', 'ecuaciones', 'despejar', 'incognita'] },
    { subjectCode: 'matematicas', topic: 'Porcentajes', concept: 'Cálculo',
      keywords: ['porcentaje', 'descuento'] }
];

// ==================================================================
// 1. Clasificación de tema
// ==================================================================
test('analitica(1): clasifica el tema por palabras clave', () => {
    classifier._reset();
    classifier._setCatalogo(CATALOGO);

    const r = classifier.clasificarTema('no entiendo las fracciones con distinto denominador', 'matematicas');
    assert.ok(r, 'Debe detectar un tema');
    assert.strictEqual(r.topic, 'Operaciones con fracciones');
    assert.strictEqual(r.concept, 'Suma y resta');
    assert.ok(r.confidence >= 0.3 && r.confidence <= 0.9);
    // 'fracciones', 'denominador' y 'fraccion' (subcadena de 'fracciones') = 3
    assert.strictEqual(r.matches, 3);
});

test('analitica(2): la clasificación es insensible a acentos y mayúsculas', () => {
    classifier._reset();
    classifier._setCatalogo(CATALOGO);

    const a = classifier.clasificarTema('No sé despejar la INCÓGNITA', 'matematicas');
    assert.ok(a);
    assert.strictEqual(a.topic, 'Ecuaciones de primer grado');
});

test('analitica(3): el mensaje sin palabras clave devuelve null (no adivina)', () => {
    classifier._reset();
    classifier._setCatalogo(CATALOGO);

    assert.strictEqual(classifier.clasificarTema('hola, buenos días', 'matematicas'), null);
});

test('analitica(4): no cruza asignaturas', () => {
    classifier._reset();
    classifier._setCatalogo(CATALOGO);

    assert.strictEqual(classifier.clasificarTema('fracciones', 'biologia'), null);
});

test('analitica(5): sin catálogo cargado no hay clasificación', () => {
    classifier._reset();
    assert.strictEqual(classifier.clasificarTema('fracciones', 'matematicas'), null);
});

// ==================================================================
// 2. Pedagogía del desenlace
// ==================================================================
test('analitica(6): acierto CON pistas no es dominio independiente', () => {
    const d = classifier.clasificarDesenlace({ action: 'evaluate' }, { hintsGiven: 2 });
    assert.strictEqual(d.outcome, 'correct_with_help');
    assert.strictEqual(d.helpLevel, 'hint');
    // Ningún turno aislado confirma dominio
    assert.strictEqual(d.needsMoreEvidence, true);
});

test('analitica(7): no comprender algo registra dificultad y sigue siendo hipótesis', () => {
    const d = classifier.clasificarDesenlace({ action: 'teach' }, {});
    assert.strictEqual(d.errorType, 'not_understood');
    assert.strictEqual(d.needsMoreEvidence, true);
});

test('analitica(8): la fase se mapea al ciclo pedagógico', () => {
    assert.strictEqual(classifier.faseDeAccion('diagnostic'), 'diagnostic');
    assert.strictEqual(classifier.faseDeAccion('guided_hint'), 'teach');
    assert.strictEqual(classifier.faseDeAccion('practice'), 'practice');
    assert.strictEqual(classifier.faseDeAccion('evaluate'), 'evaluate');
    assert.strictEqual(classifier.faseDeAccion('accion_desconocida'), 'teach');
});

// ==================================================================
// 3. Registro real de eventos
// ==================================================================
test('analitica(9): registrarEvento escribe un evento con la evidencia correcta', async () => {
    classifier._reset();
    classifier._setCatalogo(CATALOGO);

    const insertados = [];
    const query = async (sql, params) => {
        if (/FROM curriculum_topics/i.test(String(sql))) return { rows: [] };
        if (/INSERT INTO learning_events/i.test(String(sql))) {
            insertados.push(params);
            return { rows: [] };
        }
        return { rows: [] };
    };

    const res = await analytics.registrarEvento(query, {
        userId: '9999aaaa-bbbb-4ccc-8ddd-eeee00001111',
        groupId: 701,
        conversationId: '11111-1111-1111-1111-111',
        subject: 'matematicas',
        message: 'no entiendo las fracciones',
        plan: { action: 'evaluate' },
        hintsGiven: 1,
        provider: 'reto',
        model: 'grok-4.6',
        durationMs: 1234
    });

    assert.strictEqual(res.persisted, true);
    assert.strictEqual(res.topic, 'Operaciones con fracciones');
    assert.strictEqual(res.outcome, 'correct_with_help');
    assert.strictEqual(insertados.length, 1);

    // params: [userId, groupId, conversationId, sessionRef, subject, topic, concept,
    //          phase, action, helpLevel, hintsGiven, attempts, outcome, errorType,
    //          evidence, source, confidence, needsMoreEvidence, provider, model,
    //          fallbackFrom, activityType, durationMs]
    const p = insertados[0];
    assert.strictEqual(p[1], 701);
    assert.strictEqual(p[4], 'matematicas');
    assert.strictEqual(p[5], 'Operaciones con fracciones');
    assert.strictEqual(p[7], 'evaluate');
    assert.strictEqual(p[9], 'hint');
    assert.strictEqual(p[10], 1);
    assert.strictEqual(p[12], 'correct_with_help');
    assert.strictEqual(p[15], 'agent_rules');
    assert.strictEqual(p[17], 1, 'sigue siendo hipótesis');
    assert.strictEqual(p[18], 'reto');
    assert.strictEqual(p[19], 'grok-4.6');
    assert.strictEqual(p[21], 'chat');
    assert.strictEqual(p[22], 1234);
});

test('analitica(10): un fallo de BD al registrar NO rompe el chat', async () => {
    const query = async () => { throw new Error('BD caída'); };
    const res = await analytics.registrarEvento(query, {
        userId: 'u-1', subject: 'matematicas', message: 'x',
        plan: { action: 'evaluate' }
    });
    assert.strictEqual(res.persisted, false);
    assert.strictEqual(res.reason, 'error');
});

test('analitica(11): sin plan o sin asignatura no se escribe nada', async () => {
    let escrituras = 0;
    const query = async (sql) => {
        if (/INSERT/i.test(String(sql))) escrituras++;
        return { rows: [] };
    };

    const sinPlan = await analytics.registrarEvento(query, {
        userId: 'u-1', subject: 'matematicas', message: 'x', plan: null
    });
    const sinAsignatura = await analytics.registrarEvento(query, {
        userId: 'u-1', subject: null, message: 'x', plan: { action: 'evaluate' }
    });

    assert.strictEqual(sinPlan.persisted, false);
    assert.strictEqual(sinAsignatura.persisted, false);
    assert.strictEqual(escrituras, 0);
});

// ==================================================================
// 4. Umbrales documentados
// ==================================================================
test('analitica(12): los umbrales son los documentados en el código', () => {
    assert.strictEqual(analytics.UMBRALES.MIN_EVIDENCIAS_TEMA, 3);
    assert.strictEqual(analytics.UMBRALES.TASA_ACIERTO_REFUERZO, 0.5);
    assert.strictEqual(analytics.UMBRALES.TASA_ACIERTO_DOMINIO, 0.75);
    assert.strictEqual(analytics.UMBRALES.MIN_EVENTOS_GRUPO, 10);
});

test('analitica(13): ratio no divide por cero', () => {
    assert.strictEqual(analytics.ratio(5, 0), 0);
    assert.strictEqual(analytics.ratio(1, 3), 0.33);
});
