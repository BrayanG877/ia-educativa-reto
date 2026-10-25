/**
 * RATE LIMIT DE AUTENTICACIÓN — regresión del 429 masivo
 * ==================================================================
 * Fallo real en producción: tras unos pocos inicios de sesión, TODOS los
 * usuarios recibían 429 en /api/auth/login.
 *
 * CAUSA: el backend está detrás de Nginx, que reenvía desde 127.0.0.1. Sin
 * `app.set('trust proxy')`, `req.ip` es siempre 127.0.0.1, así que el
 * limitador (5 intentos / 15 min, clave = IP) contaba a TODO el colegio en un
 * único cubo.
 *
 * Estas pruebas fijan las dos mitades de la corrección:
 *  1. La clave combina IP + correo, para que un compañero de aula no herede
 *     los fallos de otro.
 *  2. `trust proxy` está configurado y NO en `true` (que permitiría falsificar
 *     X-Forwarded-For y eludir el límite).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const RATE = fs.readFileSync(path.join(BACKEND, 'src', 'middleware', 'rateLimit.middleware.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(BACKEND, 'src', 'server.js'), 'utf8');

test('ratelimit(1): trust proxy está configurado en server.js', () => {
    assert.ok(/app\.set\(\s*['"]trust proxy['"]/.test(SERVER),
        'Sin trust proxy, req.ip es 127.0.0.1 para todos los usuarios');
});

test('ratelimit(2): NO se usa trust proxy = true', () => {
    // `true` confía en cualquier X-Forwarded-For: un cliente podría falsificar
    // su IP y eludir el límite de fuerza bruta.
    assert.ok(!/app\.set\(\s*['"]trust proxy['"]\s*,\s*true\s*\)/.test(SERVER),
        'trust proxy = true permite falsificar la IP');
});

test('ratelimit(3): la clave del limitador combina IP y correo', () => {
    assert.ok(/keyGenerator/.test(RATE), 'Debe existir keyGenerator');
    assert.ok(/req\.ip/.test(RATE), 'La IP debe formar parte de la clave');
    assert.ok(/req\.body\s*&&\s*typeof\s+req\.body\.email/.test(RATE),
        'El correo debe formar parte de la clave (aulas que comparten IP)');
});

test('ratelimit(4): el límite ya no es 5 fijo y es configurable', () => {
    assert.ok(!/max:\s*5\s*,/.test(RATE), 'El 5 fijo bloqueaba al aula entera');
    assert.ok(/AUTH_RATE_LIMIT_MAX/.test(RATE), 'Debe poder configurarse por entorno');
});

test('ratelimit(5): el limitador sigue protegiendo contra fuerza bruta', () => {
    // Un límite razonable: no infinito, y con ventana temporal.
    assert.ok(/AUTH_WINDOW_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/.test(RATE), 'La ventana debe seguir existiendo');
    assert.ok(/n\s*>=\s*5/.test(RATE), 'El máximo configurable no puede ser inferior a 5');
    assert.ok(/n\s*<=\s*500/.test(RATE), 'El máximo configurable no puede ser ilimitado');
});

test('ratelimit(6): solo los inicios de sesión EXITOS no cuentan', () => {
    assert.ok(/skipSuccessfulRequests:\s*true/.test(RATE),
        'Los fallos deben seguir contando (protección real)');
});

// ==================================================================
// Normalización del correo en la clave
// ==================================================================
const { normalizarCorreo } = require(path.join(BACKEND, 'src', 'middleware', 'rateLimit.middleware.js'));

test('ratelimit(7): mayúsculas y espacios no crean un cubo distinto', () => {
    assert.strictEqual(normalizarCorreo('Alumno@Colegio.EDU'), 'alumno@colegio.edu');
    assert.strictEqual(normalizarCorreo('  alumno@colegio.edu  '), 'alumno@colegio.edu');
    assert.strictEqual(
        normalizarCorreo('Alumno@Colegio.EDU'),
        normalizarCorreo(' alumno@colegio.edu ')
    );
});

test('ratelimit(8): la etiqueta + no permite eludir el límite', () => {
    const base = normalizarCorreo('alumno@colegio.edu');
    assert.strictEqual(normalizarCorreo('alumno+1@colegio.edu'), base);
    assert.strictEqual(normalizarCorreo('alumno+999@colegio.edu'), base);
});

test('ratelimit(9): NO mezcla cuentas distintas', () => {
    assert.notStrictEqual(normalizarCorreo('ana@colegio.edu'), normalizarCorreo('bruno@colegio.edu'));
    // Un '+' en el DOMINIO es válido y no debe cortarse
    assert.strictEqual(normalizarCorreo('ana@sub+corp.edu'), 'ana@sub+corp.edu');
    // Un '+' al inicio de la parte local no es un alias: se conserva
    assert.strictEqual(normalizarCorreo('+ana@colegio.edu'), '+ana@colegio.edu');
});

test('ratelimit(10): entrada vacía o rara no rompe la clave', () => {
    assert.strictEqual(normalizarCorreo(''), '');
    assert.strictEqual(normalizarCorreo(null), '');
    assert.strictEqual(normalizarCorreo(undefined), '');
    assert.ok(normalizarCorreo('x'.repeat(500)).length <= 120, 'Debe acotarse');
});
