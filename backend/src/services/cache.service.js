/**
 * Servicio de Caché
 * Optimiza costos mediante almacenamiento de respuestas frecuentes
 */

const redis = require('../config/redis');
const { query } = require('../config/database');

const DEFAULT_TTL = parseInt(process.env.CACHE_TTL_SECONDS) || 3600; // 1 hora

/**
 * Obtener respuesta de caché (Redis o PostgreSQL)
 */
async function getFromCache(cacheKey) {
    try {
        // Intentar obtener de Redis primero (más rápido)
        const redisData = await redis.get(cacheKey);
        if (redisData) {
            console.log('📦 Hit de caché (Redis)');
            await incrementCacheHit(cacheKey);
            return redisData;
        }

        // Si no está en Redis, buscar en SQL Server
        const result = await query(
            `SELECT response, model, tokens_saved
             FROM cache_responses
             WHERE cache_key = @param1
             AND (expires_at IS NULL OR expires_at > GETDATE())`,
            [cacheKey]
        );

        if (result.rows.length > 0) {
            const data = {
                content: result.rows[0].response,
                model: result.rows[0].model,
                totalTokens: result.rows[0].tokens_saved || 0
            };

            // Guardar en Redis para próximas consultas
            await redis.set(cacheKey, data, DEFAULT_TTL);

            // Incrementar contador de hits
            await incrementCacheHit(cacheKey);

            console.log('📦 Hit de caché (PostgreSQL)');
            return data;
        }

        return null;

    } catch (error) {
        console.error('⚠️ Error al obtener de caché:', error);
        return null; // Si falla el caché, continuar sin él
    }
}

/**
 * Guardar respuesta en caché
 */
async function saveToCache(cacheKey, data, subject = null) {
    try {
        // Guardar en Redis
        await redis.set(cacheKey, {
            content: data.content,
            model: data.model,
            totalTokens: data.usage?.totalTokens || 0
        }, DEFAULT_TTL);

        // Guardar en SQL Server para persistencia
        const questionHash = cacheKey.split(':')[1]; // Extraer hash

        await query(
            `MERGE cache_responses AS target
             USING (SELECT @param1 AS cache_key) AS source
             ON target.cache_key = source.cache_key
             WHEN MATCHED THEN
                UPDATE SET last_used_at = GETDATE(), hit_count = target.hit_count + 1
             WHEN NOT MATCHED THEN
                INSERT (cache_key, question_hash, response, model, tokens_saved, expires_at)
                VALUES (@param1, @param2, @param3, @param4, @param5, DATEADD(day, 7, GETDATE()));`,
            [
                cacheKey,
                questionHash,
                data.content,
                data.model,
                data.usage?.totalTokens || 0
            ]
        );

        console.log('💾 Respuesta guardada en caché');

    } catch (error) {
        console.error('⚠️ Error al guardar en caché:', error);
        // No lanzar error, el caché es opcional
    }
}

/**
 * Incrementar contador de hits de caché
 */
async function incrementCacheHit(cacheKey) {
    try {
        await query(
            `UPDATE cache_responses
             SET hit_count = hit_count + 1, last_used_at = GETDATE()
             WHERE cache_key = @param1`,
            [cacheKey]
        );
    } catch (error) {
        console.error('⚠️ Error al incrementar hit de caché:', error);
    }
}

/**
 * Limpiar caché expirado
 */
async function cleanExpiredCache() {
    try {
        const result = await query(
            `DELETE FROM cache_responses
             OUTPUT DELETED.id
             WHERE expires_at < GETDATE()`
        );

        console.log(`🗑️ ${result.rowCount} entradas de caché eliminadas`);

        return result.rowCount;
    } catch (error) {
        console.error('⚠️ Error al limpiar caché:', error);
        return 0;
    }
}

/**
 * Obtener estadísticas de caché
 */
async function getCacheStats() {
    try {
        const result = await query(
            `SELECT
                COUNT(*) as total_entries,
                SUM(hit_count) as total_hits,
                SUM(tokens_saved * hit_count) as total_tokens_saved,
                AVG(hit_count) as avg_hits_per_entry
             FROM cache_responses`
        );

        return result.rows[0];
    } catch (error) {
        console.error('⚠️ Error al obtener estadísticas de caché:', error);
        return null;
    }
}

/**
 * Invalidar caché de una materia específica
 */
async function invalidateSubjectCache(subjectId) {
    try {
        const result = await query(
            `DELETE FROM cache_responses WHERE subject_id = $1`,
            [subjectId]
        );

        console.log(`🗑️ Caché de materia ${subjectId} invalidado (${result.rowCount} entradas)`);

        return result.rowCount;
    } catch (error) {
        console.error('⚠️ Error al invalidar caché:', error);
        return 0;
    }
}

module.exports = {
    getFromCache,
    saveToCache,
    cleanExpiredCache,
    getCacheStats,
    invalidateSubjectCache
};
