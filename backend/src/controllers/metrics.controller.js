/**
 * Controlador de Métricas
 * Maneja estadísticas, progreso y ranking de estudiantes
 */

const { query } = require('../config/database');
const cacheService = require('../services/cache.service');
const { AppError, catchAsync } = require('../middleware/error.middleware');

// POLÍTICA DE ACCESO A MÉTRICAS AJENAS (explícita):
//  - student -> solo sus propias métricas.
//  - teacher -> SOLO estudiantes que tenga ASIGNADOS mediante una relación
//               verificable en la BD.
//  - admin   -> métricas ajenas conforme a sus permisos administrativos.
//
// ESTADO ACTUAL DEL ESQUEMA: NO existe relación profesor-alumno (no hay tabla
// de asignaciones, ni curso/grupo, ni vínculo por institución). `users.institution`
// es solo un VARCHAR libre que escribe el propio alumno al registrarse, por lo
// que NO es una relación verificable. Mientras esa relación no exista, las
// consultas de métricas ajenas de un TEACHER se DENIEGAN (403) de forma segura.
// Ver database/migration_teacher_assignment.sql (cambio de esquema propuesto,
// NO aplicado) para habilitarlas en una fase posterior.
const ROLES_VER_METRICAS_AJENAS = ['admin'];

// Rango permitido para ?limit del ranking (entero).
const RANKING_LIMIT_MIN = 1;
const RANKING_LIMIT_MAX = 100;
const RANKING_LIMIT_DEFAULT = 10;

/**
 * ¿El rol actual puede consultar métricas de otros usuarios?
 * El rol teacher NO entra aquí hasta que exista asignación verificable.
 */
function puedeVerMetricasAjenas(role) {
    return ROLES_VER_METRICAS_AJENAS.includes(role);
}

/**
 * Valida ?limit como entero en [1, 100]. Rechaza (400) negativos, cero,
 * fraccionarios, no numéricos y valores excesivos. Nunca devuelve datos del
 * cliente sin validar.
 */
function parseRankingLimit(rawLimit) {
    if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
        return RANKING_LIMIT_DEFAULT;
    }
    // Solo dígitos: evita '5abc', '1e3', ' 3 ', '+5', '5.0', '-1'...
    if (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit)) {
        throw new AppError(`El parámetro limit debe ser un entero entre ${RANKING_LIMIT_MIN} y ${RANKING_LIMIT_MAX}`, 400);
    }
    const n = parseInt(rawLimit, 10);
    if (!Number.isInteger(n) || n < RANKING_LIMIT_MIN || n > RANKING_LIMIT_MAX) {
        throw new AppError(`El parámetro limit debe estar entre ${RANKING_LIMIT_MIN} y ${RANKING_LIMIT_MAX}`, 400);
    }
    return n;
}

/**
 * Obtener métricas de un usuario
 */
exports.getUserMetrics = catchAsync(async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        throw new AppError('ID de usuario requerido', 400);
    }

    // AUTORIZACIÓN HORIZONTAL (IDOR). Antes cualquier estudiante autenticado
    // podía leer las métricas de otro cambiando el UUID de la URL. El UUID del
    // cliente NO es prueba de autorización: se compara contra req.userId (del
    // JWT verificado) y, para otros usuarios, se exige un rol consultado en la
    // BD (req.userRole), no en el token.
    //
    // Los TEACHER quedan fuera de ROLES_VER_METRICAS_AJENAS mientras no exista
    // la relación de asignación: sin ella, "profesor" no prueba acceso a ningún
    // estudiante concreto. Denegar es la opción segura pedida por la política.
    const esPropio = String(userId) === String(req.userId);
    if (!esPropio && !puedeVerMetricasAjenas(req.userRole)) {
        // 403 (y no 404): el usuario está autenticado pero no autorizado.
        // No revelamos si el UUID existe.
        throw new AppError('No autorizado para consultar métricas de otro usuario', 403);
    }

    // Obtener métricas agregadas de los últimos 30 días
    const result = await query(
        `SELECT
            SUM(time_spent_minutes) as total_time,
            SUM(messages_sent) as total_messages,
            SUM(conversations_started) as total_conversations,
            SUM(exercises_completed) as total_exercises,
            SUM(correct_answers) as total_correct,
            SUM(topics_mastered) as total_topics,
            SUM(tokens_used) as total_tokens,
            SUM(estimated_cost) as total_cost
         FROM user_metrics
         WHERE user_id = @param1
         AND date >= DATEADD(day, -30, GETDATE())`,
        [userId]
    );

    // Obtener métricas por día (últimos 7 días)
    const dailyResult = await query(
        `SELECT TOP 7
            date,
            time_spent_minutes,
            messages_sent,
            exercises_completed,
            correct_answers
         FROM user_metrics
         WHERE user_id = @param1
         ORDER BY date DESC`,
        [userId]
    );

    res.json({
        success: true,
        data: {
            summary: result.rows[0],
            daily: dailyResult.rows
        }
    });
});

/**
 * Obtener ranking de estudiantes
 */
exports.getRanking = catchAsync(async (req, res) => {
    const { limit: rawLimit } = req.query;

    // Validación ESTRICTA del límite (entero 1..100).
    const limit = parseRankingLimit(rawLimit);

    // Consulta PARAMETRIZADA (TOP (@param1) es válido en SQL Server).
    // Antes se interpolaba `TOP ${parseInt(limit)}` en el texto SQL.
    //
    // PRIVACIDAD: el endpoint es accesible a usuarios AUTENTICADOS (ver
    // metrics.routes.js) porque la UI del estudiante muestra un ranking. Para
    // no exponer identidad innecesaria, la respuesta tiene identidad reducida:
    // sin `id` (UUID) ni `full_name`; solo `username` (seudónimo visible
    // elegido) y métricas agregadas.
    const queryText = `
        SELECT TOP (@param1)
            username,
            total_time_minutes,
            total_messages,
            total_exercises,
            topics_mastered,
            score
        FROM student_ranking
        ORDER BY score DESC
    `;

    const result = await query(queryText, [limit]);

    res.json({
        success: true,
        data: {
            ranking: result.rows,
            count: result.rows.length
        }
    });
});

/**
 * Obtener estadísticas del usuario actual
 */
exports.getUserStats = catchAsync(async (req, res) => {
    const userId = req.userId; // Del middleware JWT

    if (!userId) {
        throw new AppError('Usuario no autorizado', 401);
    }

    // Estadísticas generales
    const statsResult = await query(
        `SELECT * FROM user_statistics WHERE id = @param1`,
        [userId]
    );

    if (statsResult.rows.length === 0) {
        throw new AppError('Usuario no encontrado', 404);
    }

    // Conversaciones recientes
    const conversationsResult = await query(
        `SELECT TOP 5
            c.id, c.title, c.mode, c.last_message_at, c.message_count,
            s.name as subject_name, s.emoji
         FROM conversations c
         LEFT JOIN subjects s ON c.subject_id = s.id
         WHERE c.user_id = @param1 AND c.is_active = 1
         ORDER BY c.last_message_at DESC`,
        [userId]
    );

    // Materias más estudiadas
    const subjectsResult = await query(
        `SELECT TOP 3
            s.name, s.emoji, s.code,
            COUNT(c.id) as conversation_count,
            SUM(c.message_count) as total_messages
         FROM conversations c
         JOIN subjects s ON c.subject_id = s.id
         WHERE c.user_id = @param1
         GROUP BY s.name, s.emoji, s.code
         ORDER BY conversation_count DESC`,
        [userId]
    );

    res.json({
        success: true,
        data: {
            stats: statsResult.rows[0],
            recentConversations: conversationsResult.rows,
            topSubjects: subjectsResult.rows
        }
    });
});

/**
 * Actualizar métricas del usuario
 */
exports.updateMetrics = catchAsync(async (req, res) => {
    const userId = req.userId; // Del middleware JWT
    const { timeSpent, messagesCount, exercisesCompleted, correctAnswers } = req.body;

    if (!userId) {
        throw new AppError('Usuario no autorizado', 401);
    }

    // Obtener o crear registro de hoy
    const today = new Date().toISOString().split('T')[0];

    const checkResult = await query(
        `SELECT id FROM user_metrics WHERE user_id = @param1 AND date = @param2`,
        [userId, today]
    );

    if (checkResult.rows.length === 0) {
        // Crear nuevo registro
        await query(
            `INSERT INTO user_metrics (
                user_id, date, time_spent_minutes, messages_sent,
                exercises_completed, correct_answers
            )
            VALUES (@param1, @param2, @param3, @param4, @param5, @param6)`,
            [userId, today, timeSpent || 0, messagesCount || 0, exercisesCompleted || 0, correctAnswers || 0]
        );
    } else {
        // Actualizar registro existente
        await query(
            `UPDATE user_metrics
             SET time_spent_minutes = time_spent_minutes + @param1,
                 messages_sent = messages_sent + @param2,
                 exercises_completed = exercises_completed + @param3,
                 correct_answers = correct_answers + @param4
             WHERE user_id = @param5 AND date = @param6`,
            [timeSpent || 0, messagesCount || 0, exercisesCompleted || 0, correctAnswers || 0, userId, today]
        );
    }

    res.json({
        success: true,
        message: 'Métricas actualizadas correctamente'
    });
});

/**
 * Obtener estadísticas del caché (admin)
 */
exports.getCacheStats = catchAsync(async (req, res) => {
    const stats = await cacheService.getCacheStats();

    res.json({
        success: true,
        data: stats
    });
});
