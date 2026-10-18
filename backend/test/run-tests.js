/**
 * RUNNER DE PRUEBAS (Fase 5B.8)
 * ==================================================================
 * Motivo: el comando `node --test <patron-glob>` NO funciona de forma fiable.
 *   (Se evita escribir el patrón glob literal en este comentario porque su
 *    secuencia de cierre cerraria el bloque y romperia el archivo.)
 *   - PowerShell (Windows) NO expande globs; el patrón llega literal y
 *     Node no lo interpreta como glob -> 0 pruebas, exit 0 (FALSO VERDE).
 *   - Bash sí expande, pero el proyecto debe ser multiplataforma y el
 *     entorno de despliegue puede ser cualquiera.
 *
 * Solución: descubrir los archivos de prueba AQUÍ, en Node (que sí controla
 * el proyecto), y lanzar el runner nativo con la lista REAL de archivos.
 * Así funciona igual en Windows, Linux y CI, sin depender del shell.
 *
 * - Carga las guardias de red/TCP/DNS con `--require ./test/_setup.js`
 *   ANTES de cualquier módulo bajo prueba.
 * - Falla con código != 0 si no se descubre NINGUNA prueba (evita el
 *   falso verde de "exit 0 con 0 tests").
 * - No añade dependencias.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TEST_DIR = __dirname;
const SETUP = path.join(TEST_DIR, '_setup.js');

// Archivos que NO son pruebas (helpers/preload), se excluyen del descubrimiento.
const NO_ES_PRUEBA = new Set(['_setup.js', '_aislamiento.js', 'run-tests.js']);

const archivos = fs.readdirSync(TEST_DIR)
    .filter((f) => f.endsWith('.test.js') && !NO_ES_PRUEBA.has(f))
    .map((f) => path.join(TEST_DIR, f))
    .sort();

if (archivos.length === 0) {
    console.error(
        '[RUN-TESTS] No se descubrió ningún archivo *.test.js en ' + TEST_DIR +
        '. Abortando con código 1 para evitar un falso verde.'
    );
    process.exit(1);
}

console.log(`[RUN-TESTS] Descubiertos ${archivos.length} archivos de prueba:`);
for (const a of archivos) console.log('   - ' + path.basename(a));

const args = ['--require', SETUP, '--test', ...archivos];
const node = process.execPath; // el mismo binario de Node que ejecuta este script

// Se captura stdout+stderr para poder contar las pruebas ejecutadas y a la vez
// mostrarlas al operador (no se pierde salida).
const res = spawnSync(node, args, { encoding: 'utf8' });
const salida = `${res.stdout || ''}${res.stderr || ''}`;
process.stdout.write(salida);

if (res.error) {
    console.error('[RUN-TESTS] Error lanzando el runner de Node:', res.error.message);
    process.exit(1);
}

// --- Segunda barrera anti-falso-verde: contar pruebas ejecutadas ---------
// El reporter nativo cambia según la versión de Node:
//   - TAP:  "ok N - nombre" / "not ok N - nombre" y resumen "# tests N".
//   - spec (Node >= 22): líneas con marca "✔" (pasa) o "✖" (falla) y
//     resumen "ℹ tests N".
//
// Preferencia: si el runner emitió una línea de resumen "tests N" (que es la
// fuente AUTORITATIVA y no se duplica), se usa ESA. Solo si no existe (p. ej.
// un reporter distinto), se recurre a contar marcas TAP/spec.
function contarPruebas(texto) {
    // 1) Resumen autoritativo: "# tests N" (TAP) o "ℹ tests N" (spec).
    const reResumen = /^\s*(?:#|\u2139)\s*tests\s+(\d+)\s*$/gm;
    let mt;
    let totalResumen = 0;
    while ((mt = reResumen.exec(texto)) !== null) {
        const n = parseInt(mt[1], 10);
        if (Number.isFinite(n) && n > totalResumen) totalResumen = n;
    }
    if (totalResumen > 0) return totalResumen;

    // 2) Sin resumen: TAP -> máximo índice de "ok N" / "not ok N".
    let maxTap = 0;
    const reTap = /^\s*(?:ok|not ok)\s+(\d+)\b/gm;
    let m;
    while ((m = reTap.exec(texto)) !== null) {
        const n = parseInt(m[1], 10);
        if (Number.isFinite(n) && n > maxTap) maxTap = n;
    }
    if (maxTap > 0) return maxTap;

    // 3) Último recurso: contar marcas de resultado por prueba (✔ / ✖).
    let marcasSpec = 0;
    const reSpec = /^\s*[\u2714\u2716\u2717\u2718]\s+\S/gm;
    while (reSpec.exec(texto) !== null) marcasSpec++;
    return marcasSpec;
}

const pruebasEjecutadas = contarPruebas(salida);

if (pruebasEjecutadas === 0) {
    console.error(
        '\n[RUN-TESTS] ERROR: se lanzó el runner pero se ejecutaron 0 pruebas. ' +
        'Esto es un falso verde. Abortando con código 1.'
    );
    process.exit(1);
}

console.log(`\n[RUN-TESTS] Pruebas ejecutadas: ${pruebasEjecutadas}`);

if (res.status === null) {
    console.error('[RUN-TESTS] El runner terminó sin código de salida (posible señal).');
    process.exit(1);
}

process.exit(res.status);
