/**
 * REGRESIÓN DEL FALLO P0 — CONTEXTO DEL TUTOR
 * ==================================================================
 * Reproduce exactamente el error reportado:
 *
 *   Estudiante: «¿Quién fue Cristóbal Colón?»
 *   Tutor:      «¿Qué operaciones matemáticas básicas recuerdas...?»
 *
 * CAUSA RAÍZ (verificada):
 *   1. `web/app.js` enviaba `subject: 'matematicas'` por defecto cuando el
 *      estudiante no elegía materia.
 *   2. El prompt socrático decía «NUNCA des respuestas directas», así que el
 *      modelo convertía cualquier mensaje en una pregunta de sondeo.
 *
 * Estas pruebas fijan el comportamiento CORRECTO. No tocan red ni BD: el
 * modelo se sustituye por un doble que aplica las MISMAS reglas que el
 * proveedor recibe, para verificar la construcción del prompt.
 *
 * La validación contra el modelo real se hace con scripts/smoke-tutor.js.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const intent = require(path.join(BACKEND, 'src/services/intent.service.js'));
const promptService = require(path.join(BACKEND, 'src/services/prompt.service.js'));

// ==================================================================
// 1. El prompt ya NO prohíbe responder
// ==================================================================
test('tutor(1): el prompt socrático exige responder primero la pregunta', () => {
    const p = promptService.getSystemPrompt('socratic', 'sociales');
    assert.ok(/prioridad absoluta/i.test(p), 'Debe declarar la prioridad');
    assert.ok(/responde esa pregunta|responde la pregunta/i.test(p), 'Debe mandar responder');
    // La regla que causaba el fallo no debe seguir vigente
    assert.ok(!/NUNCA des respuestas directas/i.test(p),
        'La regla «NUNCA des respuestas directas» causaba el fallo');
});

test('tutor(2): el prompt obliga a corregir cuando el estudiante señala el error', () => {
    const p = promptService.getSystemPrompt('socratic', null);
    assert.ok(/por qué me respondes eso/i.test(p), 'Debe contemplar la queja literal');
    assert.ok(/reconoce el error/i.test(p));
});

test('tutor(3): el contexto de materia NO es una camisa de fuerza', () => {
    const p = promptService.getSystemPrompt('socratic', 'matematicas');
    assert.ok(/si la pregunta no es matemática|responderla sigue siendo la prioridad|Orientación de profundidad/i.test(p));
});

test('tutor(4): el prompt pide perspectivas equilibradas en temas históricos', () => {
    const p = promptService.getSystemPrompt('socratic', 'sociales');
    assert.ok(/pueblos indígenas|pueblos indigenas/i.test(p));
    assert.ok(/no presentes la colonización|exclusivamente positivo/i.test(p));
});

// ==================================================================
// 2. Detección de materia
// ==================================================================
test('tutor(5): «¿Quién fue Cristóbal Colón?» se detecta como Historia', () => {
    const d = intent.detectarMateria('¿Quién fue Cristóbal Colón?', null);
    assert.strictEqual(d.materia, 'sociales');
    assert.strictEqual(d.confianza, 'alta');
});

test('tutor(6): una pregunta de Historia gana a un «subject=matematicas» heredado', () => {
    // Así llegaba realmente al backend desde el frontend antiguo
    const d = intent.detectarMateria('¿Quién fue Cristóbal Colón?', 'matematicas');
    assert.strictEqual(d.materia, 'sociales', 'El mensaje manda sobre el subject del cliente');
    assert.strictEqual(d.cambioTema, true);
});

test('tutor(7): «¿Qué es una ecuación cuadrática?» se detecta como Matemáticas', () => {
    const d = intent.detectarMateria('¿Qué es una ecuación cuadrática?', null);
    assert.strictEqual(d.materia, 'matematicas');
});

test('tutor(8): «Explícame la segunda ley de Newton» se detecta como Física', () => {
    const d = intent.detectarMateria('Explícame la segunda ley de Newton', null);
    assert.strictEqual(d.materia, 'fisica');
});

test('tutor(9): otras materias no se confunden entre sí', () => {
    assert.strictEqual(intent.detectarMateria('Explícame la fotosíntesis', null).materia, 'biologia');
    assert.strictEqual(intent.detectarMateria('¿Qué es un enlace covalente?', null).materia, 'quimica');
    assert.strictEqual(intent.detectarMateria('Analiza el poema de García Márquez', null).materia, 'español');
    assert.strictEqual(intent.detectarMateria('¿Quién fue Platón?', null).materia, 'filosofia');
});

test('tutor(10): un saludo sin señales no inventa materia', () => {
    const d = intent.detectarMateria('hola, buenos días', null);
    assert.strictEqual(d.materia, null);
    assert.strictEqual(d.confianza, 'ninguna');
});

test('tutor(11): una señal débil no cambia la materia de la conversación', () => {
    const d = intent.detectarMateria('y el número?', 'sociales');
    assert.strictEqual(d.materia, 'sociales', 'Sin señal fuerte se mantiene el hilo');
    assert.strictEqual(d.cambioTema, false);
});

test('tutor(12): un cambio de tema explícito sí actualiza la materia', () => {
    const d = intent.detectarMateria('Ahora explícame la fotosíntesis', 'sociales');
    assert.strictEqual(d.materia, 'biologia');
    assert.strictEqual(d.cambioTema, true);
});

// ==================================================================
// 3. Detección de intención
// ==================================================================
test('tutor(13): detecta petición de dato frente a explicación o práctica', () => {
    assert.strictEqual(intent.detectarIntencion('¿Quién fue Cristóbal Colón?'), 'dato');
    assert.strictEqual(intent.detectarIntencion('Explícame la fotosíntesis'), 'explicacion');
    assert.strictEqual(intent.detectarIntencion('¿Cómo se resuelve paso a paso?'), 'procedimiento');
    assert.strictEqual(intent.detectarIntencion('Quiero practicar ejercicios'), 'practica');
});

test('tutor(14): reconoce las quejas sobre la respuesta recibida', () => {
    const quejas = [
        '¿Por qué me respondes eso?',
        'No te pregunté eso',
        'Esa no es mi pregunta',
        'No tiene nada que ver con lo que pregunté',
        'No entendiste'
    ];
    for (const q of quejas) {
        assert.strictEqual(intent.detectarIntencion(q), 'correccion', `No detectó: ${q}`);
    }
});

test('tutor(15): la instrucción de corrección recupera la pregunta original', () => {
    const historial = [
        { role: 'user', content: '¿Quién fue Cristóbal Colón?' },
        { role: 'assistant', content: '¿Qué operaciones matemáticas básicas recuerdas?' }
    ];
    const previa = intent.ultimaPreguntaDelEstudiante(historial);
    assert.strictEqual(previa, '¿Quién fue Cristóbal Colón?');

    const instruccion = intent.construirInstruccionDeTurno({
        mensaje: '¿Por qué me respondes eso?',
        materia: 'sociales',
        intencion: 'correccion',
        historial
    });
    assert.ok(instruccion.includes('Cristóbal Colón'), 'Debe citar la pregunta original');
    assert.ok(/reconoce el error/i.test(instruccion));
});

// ==================================================================
// 4. Instrucción de turno
// ==================================================================
test('tutor(16): una pregunta de dato recibe instrucción de dar el dato', () => {
    const i = intent.construirInstruccionDeTurno({
        mensaje: '¿Quién fue Cristóbal Colón?',
        materia: 'sociales',
        intencion: 'dato',
        historial: []
    });
    assert.ok(/Da el dato/i.test(i));
    assert.ok(/Ciencias Sociales|Historia/i.test(i));
});

test('tutor(17): sin materia detectada se pide inferirla, no imponerla', () => {
    const i = intent.construirInstruccionDeTurno({
        mensaje: 'hola',
        materia: null,
        intencion: 'conversacion',
        historial: []
    });
    assert.ok(/no determinada|Infi[eé]rela/i.test(i));
    assert.ok(!/Matemáticas/.test(i));
});

// ==================================================================
// 5. Integridad del frontend (la otra mitad de la causa)
// ==================================================================
test('tutor(18): el frontend NO impone matematicas cuando no hay materia', () => {
    const fs = require('fs');
    const app = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'app.js'), 'utf8');

    // El patrón exacto que causaba el fallo
    assert.ok(!/selectedSubject\?\.id\s*\|\s*'matematicas'/.test(app),
        'app.js no debe usar `selectedSubject?.id || \'matematicas\'`');
    assert.ok(!/subject\s*\|\s*'matematicas'/.test(app),
        'processToolRequest no debe imponer matematicas');
});
