/**
 * Configuración de Microsoft SQL Server
 * Gestión de conexión a la base de datos Azure SQL
 */

const sql = require('mssql');

// Configuración de conexión a SQL Server
const config = {
    server: process.env.DB_HOST || 'miservidorbr.database.windows.net',
    database: process.env.DB_NAME || 'ia_educativa',
    user: process.env.DB_USER || 'adminsoloverde',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 1433,
    // IMPORTANTE: en mssql/tedious estos dos van a NIVEL RAÍZ, no dentro de `options`.
    // Dentro de `options` se ignoran silenciosamente y queda el default de 15s, que no
    // alcanza para despertar una Azure SQL serverless en auto-pause (tarda 30-60s).
    connectionTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT) || 60000,
    requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT) || 30000,
    options: {
        encrypt: true, // Obligatorio para Azure SQL
        trustServerCertificate: false,
        enableArithAbort: true
    },
    pool: {
        max: 20,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let poolPromise;

/**
 * Obtener el pool de conexiones (singleton)
 */
function getPool() {
    if (!poolPromise) {
        poolPromise = new sql.ConnectionPool(config)
            .connect()
            .then(pool => {
                console.log('✅ SQL Server conectado:', config.server);

                pool.on('error', err => {
                    console.error('❌ Error en pool de SQL Server:', err);
                    poolPromise = null;
                });

                return pool;
            })
            .catch(err => {
                console.error('❌ Error al conectar con SQL Server:', err.message);
                poolPromise = null;
                throw err;
            });
    }
    return poolPromise;
}

/**
 * Conectar a la base de datos y verificar conexión
 */
async function connectDatabase() {
    try {
        const pool = await getPool();
        const result = await pool.request().query('SELECT GETDATE() AS CurrentDateTime');
        console.log('✅ Base de datos SQL Server conectada:', result.recordset[0].CurrentDateTime);
        return true;
    } catch (error) {
        console.error('❌ Error al conectar con SQL Server:', error.message);
        throw error;
    }
}

/**
 * Ejecutar query con parámetros
 * @param {string} text - Query SQL
 * @param {Array} params - Parámetros de la query
 * @returns {Object} - Resultado con recordset (equivalente a rows de PostgreSQL)
 */
async function query(text, params = []) {
    const start = Date.now();
    try {
        const pool = await getPool();
        const request = pool.request();

        // Agregar parámetros (convertir de PostgreSQL $1, $2 a @param1, @param2)
        let queryText = text;
        if (params && params.length > 0) {
            params.forEach((param, index) => {
                const paramName = `param${index + 1}`;
                request.input(paramName, param);
                // Reemplazar $1, $2, etc. con @param1, @param2
                queryText = queryText.replace(new RegExp(`\\$${index + 1}`, 'g'), `@${paramName}`);
            });
        }

        const result = await request.query(queryText);
        const duration = Date.now() - start;

        if (process.env.NODE_ENV === 'development') {
            console.log('📝 Query ejecutada:', {
                query: queryText.substring(0, 100),
                duration: `${duration}ms`,
                rows: result.recordset ? result.recordset.length : 0
            });
        }

        // Adaptar resultado para compatibilidad con código PostgreSQL
        return {
            rows: result.recordset || [],
            recordset: result.recordset || [],
            rowCount: result.rowsAffected[0] || 0,
            rowsAffected: result.rowsAffected
        };
    } catch (error) {
        console.error('❌ Error en query SQL Server:', error.message);
        console.error('Query:', text);
        throw error;
    }
}

/**
 * Obtener una conexión del pool para transacciones
 */
async function getClient() {
    try {
        const pool = await getPool();
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        const client = {
            query: async (text, params = []) => {
                const request = transaction.request();

                let queryText = text;
                if (params && params.length > 0) {
                    params.forEach((param, index) => {
                        const paramName = `param${index + 1}`;
                        request.input(paramName, param);
                        queryText = queryText.replace(new RegExp(`\\$${index + 1}`, 'g'), `@${paramName}`);
                    });
                }

                const result = await request.query(queryText);
                return {
                    rows: result.recordset || [],
                    recordset: result.recordset || [],
                    rowCount: result.rowsAffected[0] || 0
                };
            },
            commit: async () => {
                await transaction.commit();
            },
            rollback: async () => {
                await transaction.rollback();
            },
            release: () => {
                // No-op para compatibilidad con PostgreSQL
            }
        };

        return client;
    } catch (error) {
        console.error('❌ Error al obtener cliente para transacción:', error);
        throw error;
    }
}

/**
 * Cerrar todas las conexiones del pool
 */
async function closePool() {
    try {
        if (poolPromise) {
            const pool = await poolPromise;
            await pool.close();
            poolPromise = null;
            console.log('🔌 Pool de SQL Server cerrado');
        }
    } catch (error) {
        console.error('❌ Error al cerrar pool:', error);
    }
}

module.exports = {
    connectDatabase,
    query,
    getClient,
    closePool,
    sql // Exportar para tipos de datos SQL Server
};
