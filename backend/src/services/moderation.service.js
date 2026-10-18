/**
 * Servicio de Moderación
 * Filtra y valida contenido para asegurar que sea educativo
 */

const { query } = require('../config/database');

/**
 * Keywords no educativas (contenido bloqueado)
 */
// IMPORTANTE: aquí van FRASES DE INTENCIÓN, no sustantivos temáticos.
// Bloquear palabras sueltas como 'violencia', 'armas', 'drogas', 'alcohol' o
// 'comprar' rechazaba preguntas escolares perfectamente válidas:
//   - "¿Cómo influyó la violencia en la historia de Colombia?" (Sociales/ICFES)
//   - "¿Qué es el alcohol etílico y cuál es su fórmula?" (Química)
//   - "¿Cómo actúan las drogas en el sistema nervioso?" (Biología)
//   - "Si quiero comprar 5 cuadernos a 3000 pesos..." (Matemáticas)
// El temario escolar cubre esos temas; lo que hay que filtrar es la intención.
const BLOCKED_KEYWORDS = [
    // Intención de conseguir sustancias o armas, no de estudiarlas
    'como conseguir drogas', 'donde comprar drogas', 'como fabricar drogas',
    'como fabricar un arma', 'como hacer un arma', 'como hacer una bomba',
    'donde comprar armas',

    // Entretenimiento no educativo
    'videojuego', 'juego online', 'tiktok', 'instagram stories',
    'cuéntame un chiste', 'cuentame un chiste',

    // Fraude académico
    'hackear', 'piratería', 'trampa examen', 'copiarme en el examen',
    'hazme la tarea', 'resuélveme el examen'
];

/**
 * Keywords educativas (contenido permitido)
 */
const EDUCATIONAL_KEYWORDS = [
    // Académico
    'matemáticas', 'álgebra', 'geometría', 'cálculo',
    'biología', 'física', 'química', 'ciencias',
    'historia', 'geografía', 'literatura', 'español',
    'inglés', 'filosofía', 'informática',

    // Proceso educativo
    'aprender', 'estudiar', 'entender', 'explicar',
    'resolver', 'ejercicio', 'problema', 'tarea',
    'lección', 'concepto', 'teoría', 'práctica',

    // ICFES
    'icfes', 'prueba', 'examen', 'evaluación',
    'pregunta', 'respuesta', 'opción'
];

/**
 * Validar si el contenido es educativo
 * @param {string} content - Contenido a validar
 * @returns {Object} - { isValid, reason?, categories? }
 */
function validateEducationalContent(content) {
    if (!content || typeof content !== 'string') {
        return { isValid: false, reason: 'Contenido vacío o inválido' };
    }

    const lowerContent = content.toLowerCase();

    // Verificar longitud mínima
    if (lowerContent.length < 3) {
        return { isValid: false, reason: 'Contenido demasiado corto' };
    }

    // Verificar longitud máxima
    if (lowerContent.length > 5000) {
        return { isValid: false, reason: 'Contenido demasiado largo (máximo 5000 caracteres)' };
    }

    // Buscar keywords bloqueadas
    const foundBlocked = BLOCKED_KEYWORDS.filter(keyword =>
        lowerContent.includes(keyword.toLowerCase())
    );

    if (foundBlocked.length > 0) {
        return {
            isValid: false,
            reason: 'Contenido no educativo detectado',
            categories: ['non-educational', 'blocked-keywords'],
            blockedKeywords: foundBlocked
        };
    }

    // Verificar spam (repetición de caracteres)
    if (/(.)\1{10,}/.test(content)) {
        return {
            isValid: false,
            reason: 'Posible spam detectado',
            categories: ['spam']
        };
    }

    // Verificar solo mayúsculas (posible grito)
    const uppercaseRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (uppercaseRatio > 0.7 && content.length > 20) {
        return {
            isValid: false,
            reason: 'Uso excesivo de mayúsculas',
            categories: ['formatting-issue']
        };
    }

    // Buscar keywords educativas (scoring)
    const foundEducational = EDUCATIONAL_KEYWORDS.filter(keyword =>
        lowerContent.includes(keyword.toLowerCase())
    );

    // Si tiene keywords educativas, es válido
    if (foundEducational.length > 0) {
        return {
            isValid: true,
            confidence: 'high',
            educationalKeywords: foundEducational
        };
    }

    // Si no tiene keywords educativas pero tampoco bloqueadas,
    // permitir con confianza media (podría ser una pregunta genérica)
    return {
        isValid: true,
        confidence: 'medium',
        note: 'Sin keywords educativas explícitas, pero no contiene contenido bloqueado'
    };
}

/**
 * Moderar mensaje y registrar en base de datos
 * @param {string} userId - ID del usuario
 * @param {string} content - Contenido a moderar
 * @returns {Object} - Resultado de moderación
 */
async function moderateMessage(userId, content) {
    const validation = validateEducationalContent(content);

    try {
        // Registrar en moderation_logs
        await query(
            `INSERT INTO moderation_logs (
                user_id, content, flagged, reason, categories, action
            )
            VALUES (@param1, @param2, @param3, @param4, @param5, @param6)`,
            [
                userId,
                content,
                validation.isValid ? 0 : 1,
                validation.reason || null,
                JSON.stringify(validation.categories || []),
                validation.isValid ? 'allowed' : 'blocked'
            ]
        );
    } catch (error) {
        console.error('Error al registrar moderación:', error);
        // No bloquear por error de registro
    }

    return validation;
}

/**
 * Obtener estadísticas de moderación
 */
async function getModerationStats() {
    try {
        const result = await query(
            `SELECT
                COUNT(*) as total_checks,
                SUM(CASE WHEN flagged = 1 THEN 1 ELSE 0 END) as flagged_count,
                SUM(CASE WHEN action = 'blocked' THEN 1 ELSE 0 END) as blocked_count,
                SUM(CASE WHEN action = 'allowed' THEN 1 ELSE 0 END) as allowed_count
             FROM moderation_logs
             WHERE created_at >= DATEADD(day, -7, GETDATE())`
        );

        return result.rows[0];
    } catch (error) {
        console.error('Error al obtener estadísticas de moderación:', error);
        return null;
    }
}

/**
 * Obtener mensajes flagged recientes (para revisión)
 */
async function getFlaggedMessages(limit = 20) {
    try {
        const result = await query(
            `SELECT TOP ${limit}
                ml.id, ml.user_id, ml.content, ml.reason,
                ml.categories, ml.created_at,
                u.username, u.email
             FROM moderation_logs ml
             LEFT JOIN users u ON ml.user_id = u.id
             WHERE ml.flagged = 1
             ORDER BY ml.created_at DESC`
        );

        return result.rows;
    } catch (error) {
        console.error('Error al obtener mensajes flagged:', error);
        return [];
    }
}

module.exports = {
    validateEducationalContent,
    moderateMessage,
    getModerationStats,
    getFlaggedMessages,
    BLOCKED_KEYWORDS,
    EDUCATIONAL_KEYWORDS
};
