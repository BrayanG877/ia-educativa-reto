/**
 * PRUEBAS FASE 5C.1 — EXCLUSIONES DE EMPAQUETADO Y VALIDADOR DE PAQUETES.
 * ==================================================================
 * Objetivo: verificar, SIN generar paquetes definitivos ni publicar nada, que:
 *   1) Las reglas de exclusión (pack-exclusions.ps1) bloquean secretos,
 *      respaldos, credenciales, node_modules, pruebas y artefactos locales.
 *   2) Las plantillas de ejemplo (.env.example) SÍ se permiten.
 *   3) Copy-ArbolFiltrado no copia ningún archivo/directorio prohibido.
 *   4) Assert-PaqueteLimpio ABORTA (exit != 0) si el ZIP contiene un archivo
 *      prohibido, y pasa si está limpio.
 *
 * Se invoca PowerShell en modo no interactivo. NO se conecta a nada externo.
 * Se trabaja siempre en un directorio TEMPORAL nuevo.
 */
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const PROJECT_ROOT = path.join(BACKEND, '..');
const MODULO = path.join(PROJECT_ROOT, 'pack-exclusions.ps1');

// ¿Está PowerShell disponible? (Windows: powershell; otros: pwsh)
function resolverPwsh() {
    for (const exe of ['pwsh', 'powershell']) {
        const r = spawnSync(exe, ['-NoProfile', '-Command', 'exit 0'], { encoding: 'utf8' });
        if (!r.error && r.status === 0) return exe;
    }
    return null;
}
const PWSH = resolverPwsh();

// Ejecuta un script PowerShell y devuelve { status, stdout, stderr }.
function ejecutarPwsh(script, args = []) {
    return spawnSync(PWSH, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        encoding: 'utf8',
        env: { ...process.env, PWSH_TEST_ARGS: args.join('|') }
    });
}

// Prueba cada ruta contra Test-RutaProhibida y devuelve 'BLOCK'|'ALLOW'.
function clasificar(rutas) {
    const lista = rutas.map(r => `'${r.replace(/'/g, "''")}'`).join(',');
    const script = `. "${MODULO.replace(/\\/g, '\\\\')}"; foreach ($p in @(${lista})) { $t = 'ALLOW'; if (Test-RutaProhibida -RelativePath $p) { $t = 'BLOCK' }; Write-Output "$t|$p" }`;
    const r = ejecutarPwsh(script);
    const salida = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
    const mapa = {};
    for (const linea of salida) {
        const [tag, ...rest] = linea.split('|');
        mapa[rest.join('|')] = tag;
    }
    return mapa;
}

// ------------------------------------------------------------------
// Si no hay PowerShell, se OMITE (no se puede probar) sin falso verde.
// ------------------------------------------------------------------
test('pack(0): PowerShell está disponible para ejecutar las pruebas', () => {
    assert.ok(PWSH, 'Se requiere pwsh/powershell para validar los scripts de empaquetado');
    assert.ok(fs.existsSync(MODULO), `Debe existir el módulo: ${MODULO}`);
});

test('pack(1): las rutas prohibidas se BLOQUEAN', { skip: !PWSH }, () => {
    const prohibidas = [
        'backend/.env',
        'backend/.env.production',
        'backend/.env.local',
        '.backups/5C.1/x.bak',
        'backend/x.secret-backup-1',
        'ftp-credentials.txt',
        'variables-para-copiar.txt',
        'backend/node_modules/express/index.js',
        'backend/test/ai.x.test.js',
        'backend/coverage/lcov.info',
        'backend/server.log',
        'deploy-final.zip',
        'backend/id_rsa',
        'backend/app.pem',
        'backend/config.pfx',
        'backend/test-redis.js',
        'backend/check-database.js',
        'backend/serve-web.js',
        'backend/deploy-azure.ps1.tmp'
    ];
    const mapa = clasificar(prohibidas);
    const malClasificadas = prohibidas.filter(p => mapa[p] !== 'BLOCK');
    assert.deepStrictEqual(malClasificadas, [], `Estas rutas deberían bloquearse pero no lo hacen: ${malClasificadas.join(', ')}`);
});

test('pack(2): las rutas legítimas se PERMITEN', { skip: !PWSH }, () => {
    const permitidas = [
        'backend/.env.example',
        'backend/.env.production.example',
        'backend/src/server.js',
        'backend/src/config/ai.config.js',
        'backend/package.json',
        'backend/package-lock.json',
        'backend/Dockerfile',
        'backend/database/migration_agent.sql',
        'web/login.html',
        'web/api-client.js',
        'package.json',
        'startup.sh',
        'web.config',
        '.deployment',
        'backend/README.md'
    ];
    const mapa = clasificar(permitidas);
    const malClasificadas = permitidas.filter(p => mapa[p] !== 'ALLOW');
    assert.deepStrictEqual(malClasificadas, [], `Estas rutas deberían permitirse pero se bloquean: ${malClasificadas.join(', ')}`);
});

test('pack(3): Copy-ArbolFiltrado no copia archivos prohibidos', { skip: !PWSH }, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '5c1-copy-'));
    const origen = path.join(tmp, 'origen');
    const destino = path.join(tmp, 'destino');
    fs.mkdirSync(path.join(origen, 'src'), { recursive: true });
    fs.mkdirSync(path.join(origen, 'node_modules', 'x'), { recursive: true });
    fs.mkdirSync(path.join(origen, '.backups'), { recursive: true });
    fs.mkdirSync(path.join(origen, 'test'), { recursive: true });

    fs.writeFileSync(path.join(origen, 'src', 'server.js'), 'ok');
    fs.writeFileSync(path.join(origen, 'package.json'), '{}');
    fs.writeFileSync(path.join(origen, '.env.example'), 'PLANTILLA');
    fs.writeFileSync(path.join(origen, '.env'), 'SECRETO_REAL');
    fs.writeFileSync(path.join(origen, '.env.production'), 'SECRETO_PROD');
    fs.writeFileSync(path.join(origen, 'node_modules', 'x', 'index.js'), 'dep');
    fs.writeFileSync(path.join(origen, '.backups', 'viejo.bak'), 'backup');
    fs.writeFileSync(path.join(origen, 'test', 'x.test.js'), 'test');
    fs.writeFileSync(path.join(origen, 'ftp-credentials.txt'), 'user:pass');

    try {
        const script = `. "${MODULO.replace(/\\/g, '\\\\')}"; Copy-ArbolFiltrado -Origen '${origen.replace(/\\/g, '\\\\')}' -Destino '${destino.replace(/\\/g, '\\\\')}'`;
        const r = ejecutarPwsh(script);
        assert.strictEqual(r.status, 0, `PowerShell falló: ${r.stderr}`);

        // Deben existir los permitidos...
        assert.ok(fs.existsSync(path.join(destino, 'src', 'server.js')), 'debe copiarse src/server.js');
        assert.ok(fs.existsSync(path.join(destino, 'package.json')), 'debe copiarse package.json');
        assert.ok(fs.existsSync(path.join(destino, '.env.example')), 'debe copiarse .env.example');

        // ...y NO los prohibidos.
        assert.ok(!fs.existsSync(path.join(destino, '.env')), 'NO debe copiarse .env');
        assert.ok(!fs.existsSync(path.join(destino, '.env.production')), 'NO debe copiarse .env.production');
        assert.ok(!fs.existsSync(path.join(destino, 'node_modules')), 'NO debe copiarse node_modules');
        assert.ok(!fs.existsSync(path.join(destino, '.backups')), 'NO debe copiarse .backups');
        assert.ok(!fs.existsSync(path.join(destino, 'test')), 'NO debe copiarse test/');
        assert.ok(!fs.existsSync(path.join(destino, 'ftp-credentials.txt')), 'NO debe copiarse ftp-credentials.txt');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('pack(4): Assert-PaqueteLimpio ABORTA si el ZIP contiene un archivo prohibido', { skip: !PWSH }, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '5c1-zipbad-'));
    const stage = path.join(tmp, 'stage');
    fs.mkdirSync(stage, { recursive: true });
    fs.writeFileSync(path.join(stage, 'ok.js'), 'x');
    fs.writeFileSync(path.join(stage, '.env.production'), 'SECRETO');
    const zip = path.join(tmp, 'malo.zip');

    try {
        // Crear el ZIP con .env.production dentro.
        const crear = `Compress-Archive -Path '${path.join(stage, '*').replace(/\\/g, '\\\\')}' -DestinationPath '${zip.replace(/\\/g, '\\\\')}' -Force`;
        ejecutarPwsh(crear);

        const script = `. "${MODULO.replace(/\\/g, '\\\\')}"; Assert-PaqueteLimpio -ZipPath '${zip.replace(/\\/g, '\\\\')}'`;
        const r = ejecutarPwsh(script);
        assert.notStrictEqual(r.status, 0, 'debe abortar (exit != 0) con un archivo prohibido');
        assert.ok(/RECHAZADO|prohibido/i.test((r.stdout || '') + (r.stderr || '')), 'debe informar del rechazo');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('pack(5): Assert-PaqueteLimpio PASA si el ZIP está limpio', { skip: !PWSH }, () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '5c1-zipok-'));
    const stage = path.join(tmp, 'stage');
    fs.mkdirSync(path.join(stage, 'backend', 'src'), { recursive: true });
    fs.writeFileSync(path.join(stage, 'backend', 'src', 'server.js'), 'x');
    fs.writeFileSync(path.join(stage, 'backend', 'package.json'), '{}');
    fs.writeFileSync(path.join(stage, 'backend', '.env.example'), 'PLANTILLA');
    const zip = path.join(tmp, 'limpio.zip');

    try {
        const crear = `Compress-Archive -Path '${path.join(stage, '*').replace(/\\/g, '\\\\')}' -DestinationPath '${zip.replace(/\\/g, '\\\\')}' -Force`;
        ejecutarPwsh(crear);

        const script = `. "${MODULO.replace(/\\/g, '\\\\')}"; Assert-PaqueteLimpio -ZipPath '${zip.replace(/\\/g, '\\\\')}'`;
        const r = ejecutarPwsh(script);
        assert.strictEqual(r.status, 0, `debe pasar con paquete limpio. Salida: ${r.stdout} ${r.stderr}`);
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('pack(6): los scripts de empaquetado usan el módulo de exclusiones', () => {
    const scripts = [
        'deploy-to-azure.ps1',
        'crear-zip-final.ps1',
        'crear-zip-definitivo.ps1',
        'crear-paquete-azure.ps1',
        'crear-zip-correcto.ps1',
        'despliegue-directo.ps1',
        'despliegue-rapido.ps1',
        'subir-a-kudu.ps1',
        path.join('backend', 'deploy-azure.ps1')
    ];
    const faltantes = [];
    for (const s of scripts) {
        const p = path.join(PROJECT_ROOT, s);
        if (!fs.existsSync(p)) continue;
        const contenido = fs.readFileSync(p, 'utf8');
        if (!/pack-exclusions\.ps1/.test(contenido)) faltantes.push(s);
        if (!/Assert-PaqueteLimpio/.test(contenido)) faltantes.push(`${s} (sin Assert-PaqueteLimpio)`);
    }
    assert.deepStrictEqual(faltantes, [], `Scripts sin validación/exclusiones: ${faltantes.join(', ')}`);
});