/**
 * Configuración de Redis
 * Sistema de caché para optimización de costos de IA
 * Soporta Redis local (desarrollo) y Azure (producción).
 *
 * Azure tiene DOS sabores y cada uno usa un puerto distinto:
 *   - Azure Cache for Redis (clásico): host *.redis.cache.windows.net  -> puerto 6380 (TLS)
 *   - Azure Managed Redis (nuevo):     host *.redis.azure.net          -> puerto 10000 (TLS)
 * En AMBOS Azure exige TLS y la autenticación con Access Key usa el
 * usuario "default" + la key como contraseña.
 *
 * Antes se elegía Azure vs local según NODE_ENV === 'production'. Eso está
 * mal: si despliegas con NODE_ENV=development (o lo pruebas en local contra
 * Azure) quedaba sin TLS y con el usuario equivocado, y la conexión fallaba.
 * Ahora se decide por el HOST, que es lo que realmente importa.
 */

const Redis = require('ioredis');

let redisClient = null;

/**
 * ¿El host apunta a un Redis de Azure? (requiere TLS)
 */
function isAzureHost(host) {
    if (!host) return false;
    return host.endsWith('.redis.azure.net') || host.endsWith('.redis.cache.windows.net');
}

/**
 * Conectar a Redis
 */
async function connectRedis() {
    try {
        const host = process.env.REDIS_HOST || 'localhost';
        const isAzure = isAzureHost(host) || process.env.REDIS_TLS === 'true';

        // Puerto por defecto según el tipo de Redis:
        //   Azure Managed Redis -> 10000
        //   Azure Cache clásico -> 6380
        //   Local               -> 6379
        const defaultPort = host.endsWith('.redis.azure.net') ? 10000 : (isAzure ? 6380 : 6379);

        const redisConfig = {
            host,
            port: parseInt(process.env.REDIS_PORT) || defaultPort,
            retryStrategy: (times) => {
                if (times > 3) return null; // rendirse en lugar de reconectar sin fin
                return Math.min(times * 200, 2000);
            },
            maxRetriesPerRequest: 3
        };

        if (isAzure) {
            // Azure siempre exige TLS.
            redisConfig.tls = { servername: host }; // SNI: imprescindible para Azure Managed Redis
            // La autenticación con Access Key usa el usuario "default".
            redisConfig.username = process.env.REDIS_USERNAME || 'default';
            redisConfig.password = process.env.REDIS_PASSWORD;
            redisConfig.enableOfflineQueue = true;
        } else {
            // Sólo enviar contraseña si realmente hay una definida. Un Redis
            // local sin contraseña avisaba con el WARN "does not require a
            // password, but a password was supplied".
            redisConfig.password = process.env.REDIS_PASSWORD ? process.env.REDIS_PASSWORD : undefined;
        }

        console.log(`🔴 Conectando a Redis (${isAzure ? 'Azure' : 'Local'}) en ${host}:${redisConfig.port}...`);

        redisClient = new Redis(redisConfig);

        redisClient.on('connect', () => {
            console.log(`✅ Redis conectado (${isAzure ? 'Azure' : 'Local'})`);
        });

        redisClient.on('error', (error) => {
            console.error('❌ Error de Redis:', error.message);
        });

        redisClient.on('reconnecting', () => {
            console.log('🔄 Reconectando a Redis...');
        });

        // Verificar conexión
        await redisClient.ping();

        return redisClient;
    } catch (error) {
        console.error('❌ Error al conectar con Redis:', error.message);
        console.warn('⚠️ Continuando sin Redis (sin caché)');
        // Descartar el cliente roto: si se deja asignado, get()/set() no
        // cortocircuitan y cada llamada al caché vuelve a fallar y a loguear.
        if (redisClient) {
            try { redisClient.disconnect(); } catch (_) { /* ya está caído */ }
            redisClient = null;
        }
        return null;
    }
}

/**
 * Obtener valor de caché
 * @param {string} key - Clave del caché
 */
async function get(key) {
    if (!redisClient) return null;

    try {
        const value = await redisClient.get(key);
        return value ? JSON.parse(value) : null;
    } catch (error) {
        console.error('❌ Error al obtener de caché:', error);
        return null;
    }
}

/**
 * Guardar valor en caché
 * @param {string} key - Clave del caché
 * @param {any} value - Valor a guardar
 * @param {number} ttl - Tiempo de vida en segundos (opcional)
 */
async function set(key, value, ttl = null) {
    if (!redisClient) return false;

    try {
        const serialized = JSON.stringify(value);

        if (ttl) {
            await redisClient.setex(key, ttl, serialized);
        } else {
            await redisClient.set(key, serialized);
        }

        return true;
    } catch (error) {
        console.error('❌ Error al guardar en caché:', error);
        return false;
    }
}

/**
 * Eliminar valor de caché
 * @param {string} key - Clave del caché
 */
async function del(key) {
    if (!redisClient) return false;

    try {
        await redisClient.del(key);
        return true;
    } catch (error) {
        console.error('❌ Error al eliminar de caché:', error);
        return false;
    }
}

/**
 * Limpiar todo el caché (usar con precaución)
 */
async function flush() {
    if (!redisClient) return false;

    try {
        await redisClient.flushdb();
        console.log('🗑️ Caché limpiado');
        return true;
    } catch (error) {
        console.error('❌ Error al limpiar caché:', error);
        return false;
    }
}

/**
 * Cerrar conexión a Redis
 */
async function closeRedis() {
    if (redisClient) {
        await redisClient.quit();
        console.log('🔌 Conexión a Redis cerrada');
    }
}

module.exports = {
    connectRedis,
    get,
    set,
    del,
    flush,
    closeRedis,
    getClient: () => redisClient
};
