/**
 * PRUEBAS FASE 5B.8 — COMPATIBILIDAD DE PERSISTENCIA (revisión estática).
 * ==================================================================
 * Objetivo: comparar, SIN conectarse a ninguna base de datos, las columnas y
 * parámetros que escribe `tutor.agent.js` con las columnas declaradas en
 * `database/migration_agent.sql`.
 *
 * NO ejecuta la migración, NO se conecta a RDS, NO usa el driver mssql. Solo
 * lee el .sql como texto y analiza las sentencias SQL embebidas en el código.
 *
 * Detecta la clase de incompatibilidad "columna escrita por el código que no
 * existe en la tabla" y "placeholder sin parámetro".
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { columnasDeTabla, leerMigracion } = require('./_sql-cols');
const BACKEND = path.join(__dirname, '..');

const SQL_MIGRACION = leerMigracion(BACKEND);
const COLS_EVIDENCE = columnasDeTabla(SQL_MIGRACION, 'agent_evidence');
const COLS_DIFFICULTIES = columnasDeTabla(SQL_MIGRACION, 'agent_difficulties');

const CODIGO = fs.readFileSync(path.join(BACKEND, 'src/services/tutor.agent.js'), 'utf8');

// ------------------------------------------------------------------
// Helpers de extracción sobre el código del agente
// ------------------------------------------------------------------

/** Extrae las columnas de una lista INSERT INTO <tabla> (col, col, ...). */
function columnasInsert(codigo, tabla) {
    const re = new RegExp('INSERT\\s+INTO\\s+' + tabla + '\\s*\\(([\\s\\S]*?)\\)\\s*VALUES', 'i');
    const m = re.exec(codigo);
    if (!m) return null;
    return m[1].split(',').map(s => s.trim().replace(/[`'"]/g, '')).filter(Boolean);
}

/** Extrae las columnas asignadas en un UPDATE <tabla> SET col = @..., col = @... */
function columnasUpdate(codigo, tabla) {
    const re = new RegExp('UPDATE\\s+' + tabla + '\\s+SET([\\s\\S]*?)WHERE', 'i');
    const m = re.exec(codigo);
    if (!m) return null;
    return m[1]
        .split(',')
        .map(s => s.trim())
        .filter(s => s.includes('='))
        .map(s => s.split('=')[0].trim().replace(/[`'"]/g, ''))
        .filter(Boolean);
}

// ==================================================================
// 1. El archivo de migración declara las columnas esperadas
// ==================================================================
test('persistencia(1): la migración declara las tablas del agente', () => {
    assert.ok(COLS_EVIDENCE.length > 0, 'agent_evidence debe tener columnas');
    assert.ok(COLS_DIFFICULTIES.length > 0, 'agent_difficulties debe tener columnas');
});

// ==================================================================
// 2. INSERT de agent_evidence: todas las columnas existen en la tabla
// ==================================================================
test('persistencia(2): el INSERT de agent_evidence usa columnas existentes', () => {
    const cols = columnasInsert(CODIGO, 'agent_evidence');
    assert.ok(cols && cols.length === 15, `deben ser 15 columnas, fueron ${cols && cols.length}`);
    const faltantes = cols.filter(c => !COLS_EVIDENCE.includes(c.toLowerCase()));
    assert.deepStrictEqual(faltantes, [], `columnas escritas que NO existen en la tabla: ${faltantes.join(', ')}`);
});

test('persistencia(2b): los placeholders del INSERT coinciden con el número de columnas', () => {
    const re = /INSERT\s+INTO\s+agent_evidence[\s\S]*?VALUES\s*\(([\s\S]*?)\)`/i;
    const m = re.exec(CODIGO);
    assert.ok(m, 'debe encontrarse el VALUES del INSERT de agent_evidence');
    const placeholders = (m[1].match(/@param\d+/g) || []).length;
    const cols = columnasInsert(CODIGO, 'agent_evidence');
    assert.strictEqual(placeholders, cols.length, 'cada columna debe tener su @paramN');
});

// ==================================================================
// 3. UPDATE de agent_difficulties: todas las columnas existen
// ==================================================================
test('persistencia(3): el UPDATE de agent_difficulties usa columnas existentes', () => {
    const cols = columnasUpdate(CODIGO, 'agent_difficulties');
    assert.ok(cols && cols.length > 0, 'debe haber un UPDATE de agent_difficulties');
    const faltantes = cols.filter(c => !COLS_DIFFICULTIES.includes(c.toLowerCase()));
    assert.deepStrictEqual(faltantes, [], `columnas del UPDATE que NO existen en la tabla: ${faltantes.join(', ')}`);
});

// ==================================================================
// 4. INSERT de agent_difficulties: todas las columnas existen
// ==================================================================
test('persistencia(4): el INSERT de agent_difficulties usa columnas existentes', () => {
    const cols = columnasInsert(CODIGO, 'agent_difficulties');
    assert.ok(cols && cols.length > 0, 'debe haber un INSERT de agent_difficulties');
    const faltantes = cols.filter(c => !COLS_DIFFICULTIES.includes(c.toLowerCase()));
    assert.deepStrictEqual(faltantes, [], `columnas escritas que NO existen en la tabla: ${faltantes.join(', ')}`);
});

// ==================================================================
// 5. Columnas leídas en SELECT existen en las tablas
// ==================================================================
test('persistencia(5): las columnas leídas por los SELECT existen', () => {
    // SELECT id, evidence FROM agent_difficulties ...
    assert.ok(COLS_DIFFICULTIES.includes('id'), 'agent_difficulties debe tener id');
    assert.ok(COLS_DIFFICULTIES.includes('evidence'), 'agent_difficulties debe tener evidence');
    // SELECT outcome FROM agent_evidence ...
    assert.ok(COLS_EVIDENCE.includes('outcome'), 'agent_evidence debe tener outcome');
    assert.ok(COLS_EVIDENCE.includes('session_ref'), 'agent_evidence debe tener session_ref');
    assert.ok(COLS_EVIDENCE.includes('competence'), 'agent_evidence debe tener competence');
    assert.ok(COLS_EVIDENCE.includes('created_at'), 'agent_evidence debe tener created_at (usado en ORDER BY)');
});

// ==================================================================
// 6. Tipos: confidence admite los valores que escribe el código
// ==================================================================
test('persistencia(6): confidence es DECIMAL(3,2) y admite 0.40 / 0.85', () => {
    // DECIMAL(3,2) => 3 dígitos, 2 decimales => rango -9.99..9.99. Los valores
    // escritos (0.4 y 0.85) caben con holgura.
    const re = /confidence\s+DECIMAL\((\d+)\s*,\s*(\d+)\)/i;
    const m = re.exec(SQL_MIGRACION);
    assert.ok(m, 'confidence debe ser DECIMAL');
    const precision = parseInt(m[1], 10), escala = parseInt(m[2], 10);
    for (const v of [0.4, 0.85]) {
        const entero = Math.trunc(v).toString().length;
        const decimales = (v.toString().split('.')[1] || '').length;
        assert.ok(entero + decimales <= precision && decimales <= escala, `${v} debe caber en DECIMAL(${precision},${escala})`);
    }
});

// ==================================================================
// 7. Tipos: measured_improvement y needs_more_evidence son BIT (1/0)
// ==================================================================
test('persistencia(7): measured_improvement y needs_more_evidence son BIT', () => {
    assert.match(SQL_MIGRACION, /measured_improvement\s+BIT/i);
    assert.match(SQL_MIGRACION, /needs_more_evidence\s+BIT/i);
});

// ==================================================================
// 8. Unicidad de sesión/competencia: el UPDATE busca por session_ref+competence
// ==================================================================
test('persistencia(8): agent_difficulties tiene las columnas de la clave de búsqueda', () => {
    for (const c of ['session_ref', 'competence', 'status']) {
        assert.ok(COLS_DIFFICULTIES.includes(c), `agent_difficulties debe tener ${c}`);
    }
});

// ==================================================================
// 9. Salvaguarda: no se ha tocado ninguna base de datos en estas pruebas
// ==================================================================
test('persistencia(9): las pruebas de esquema no abren conexiones', async () => {
    // La guardia de red sigue activa: si algo intentara conectar, fallaría.
    await assert.rejects(async () => global.fetch('https://example.com'), (e) => /AISLAMIENTO/.test(e.message));
});