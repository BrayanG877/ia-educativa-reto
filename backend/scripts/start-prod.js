/**
 * LANZADOR DE PRODUCCIÓN MULTIPLATAFORMA (Fase 5C.1)
 * ==================================================================
 * Motivo: el script `prod` era `NODE_ENV=production node src/server.js`,
 * una sintaxis de asignación de variable SOLO válida en shells tipo Unix
 * (bash/sh). En Windows PowerShell/CMD falla con "NODE_ENV no se reconoce
 * como comando". Este lanzador hace lo mismo de forma portable, sin
 * dependencias externas (no requiere cross-env).
 *
 * IMPORTANTE: NO basta con `require('../src/server.js')` desde aquí, porque
 * entonces `require.main !== module` dentro de server.js y su bloque de
 * arranque (`if (require.main === module) { ... startServer(); }`) NO se
 * ejecutaría: no abriría puerto ni registraría señales. Por eso se lanza
 * server.js como PROCESO PRINCIPAL hijo, con NODE_ENV=production en el
 * entorno, preservando exactamente el comportamiento de `node src/server.js`.
 *
 * Uso:  node scripts/start-prod.js   (o `npm run prod`)
 */
'use strict';

const path = require('path');
const { spawn } = require('child_process');

const serverEntry = path.join(__dirname, '..', 'src', 'server.js');

const env = { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' };

// Se reenvían las señales al hijo para un apagado limpio (SIGTERM/SIGINT).
const hijo = spawn(process.execPath, [serverEntry], { stdio: 'inherit', env });

for (const señal of ['SIGTERM', 'SIGINT']) {
    process.on(señal, () => {
        try { hijo.kill(señal); } catch (_) { /* el hijo ya terminó */ }
    });
}

hijo.on('exit', (code, signal) => {
    if (signal) {
        // Terminado por señal: se propaga un código no-cero razonable.
        process.exit(1);
    }
    process.exit(code === null ? 1 : code);
});

hijo.on('error', (err) => {
    console.error('[start-prod] No se pudo iniciar el servidor:', err.message);
    process.exit(1);
});