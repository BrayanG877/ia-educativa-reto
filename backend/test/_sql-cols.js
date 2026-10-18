/**
 * Utilidad de PRUEBAS (no es un test en sí): extrae las columnas declaradas
 * en database/migration_agent.sql para compararlas con las columnas que el
 * código escribe. Solo LEE el archivo .sql como texto; NO se conecta a ninguna
 * base de datos ni ejecuta SQL.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** Devuelve la lista de nombres de columna de una tabla CREATE TABLE [dbo].[t]. */
function columnasDeTabla(sqlTexto, tabla) {
    // Localiza el bloque CREATE TABLE [dbo].[tabla] ( ... ); equilibrando paréntesis.
    const inicioRe = new RegExp('CREATE\\s+TABLE\\s+\\[dbo\\]\\.\\[' + tabla + '\\]\\s*\\(', 'i');
    const m = inicioRe.exec(sqlTexto);
    if (!m) return [];
    // El paréntesis de apertura de la tabla ya está consumido por el match;
    // se empieza a contar desde el final del match con profundidad 1.
    let i = m.index + m[0].length;
    let profundidad = 1;
    let fin = -1;
    for (; i < sqlTexto.length; i++) {
        const c = sqlTexto[i];
        if (c === '(') profundidad++;
        else if (c === ')') {
            profundidad--;
            if (profundidad === 0) { fin = i; break; }
        }
    }
    if (fin === -1) return [];
    const cuerpo = sqlTexto.slice(m.index + m[0].length, fin);

    const columnas = [];
    for (const lineaCruda of cuerpo.split('\n')) {
        const linea = lineaCruda.trim();
        // Salta líneas de constraint, comentarios y vacías.
        if (!linea || linea.startsWith('--')) continue;
        if (/^CONSTRAINT\b/i.test(linea)) continue;
        // Una definición de columna empieza con un identificador seguido de un tipo.
        const mm = /^([a-z_][a-z0-9_]*)\s+(BIGINT|INT|BIT|VARCHAR|NVARCHAR|UNIQUEIDENTIFIER|DECIMAL|DATETIME2|DATE|TEXT)\b/i.exec(linea);
        if (mm) columnas.push(mm[1].toLowerCase());
    }
    return columnas;
}

/** Carga el texto de la migración (o el que se indique). */
function leerMigracion(backendDir) {
    const ruta = path.join(backendDir, 'database', 'migration_agent.sql');
    return fs.readFileSync(ruta, 'utf8');
}

module.exports = { columnasDeTabla, leerMigracion };