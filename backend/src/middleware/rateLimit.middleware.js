/**
 * Middleware de Rate Limiting
 * Limita el número de peticiones por usuario/IP
 */

const rateLimit = require('express-rate-limit');

/**
 * Rate limiter global para todas las rutas
 */
const rateLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 600, // límite de requests
    // La clave debe llamarse `message`: el frontend lee `data.message`.
    // Con sólo `error` recibía undefined y mostraba "error inesperado".
    message: {
        error: true,
        message: 'Demasiadas peticiones desde esta IP, por favor intenta más tarde.',
        retryAfter: '15 minutos'
    },
    standardHeaders: true, // Devuelve info en headers `RateLimit-*`
    legacyHeaders: false, // Deshabilita headers `X-RateLimit-*`
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    // Los sondeos de estado no deben consumir la cuota de uso normal.
    skip: (req) => req.path === '/health' || req.path === '/api/ai/providers'
});

/**
 * Rate limiter para rutas de IA.
 * Limita el consumo del modelo para controlar costos, pero con un margen que
 * no estorbe a un estudiante real: un turno de conversación puede usar varias
 * llamadas (mensaje + herramienta). El valor es configurable por entorno.
 *
 * NO se aplica a rutas que sólo leen datos (p. ej. GET /subjects): contarlas
 * gastaba la cuota de IA sin consumir IA, y una recarga de la interfaz podía
 * dejar al estudiante sin poder preguntar.
 */
const aiRateLimiter = rateLimit({
    windowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS) || 60 * 1000, // 1 minuto
    max: parseInt(process.env.AI_RATE_LIMIT_MAX) || 30, // por usuario/minuto
    message: {
        error: true,
        message: 'Límite de consultas a la IA alcanzado. Por favor espera un momento.',
        retryAfter: '1 minuto'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Sólo cuentan las peticiones que realmente invocan al modelo.
    // (Se decide por método/ruta en chat.routes.js con `skip`.)
    keyGenerator: (req) => {
        // req.userId lo pone authenticateToken; req.user nunca se asigna en este
        // proyecto, así que antes TODOS los usuarios compartían el límite por IP
        // y un estudiante agotaba la cuota de sus compañeros en la misma red.
        return req.userId || req.ip;
    }
});

/**
 * Rate limiter para autenticación
 * Previene ataques de fuerza bruta
 */
const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 intentos
    message: {
        error: 'Demasiados intentos de inicio de sesión. Por favor intenta más tarde.',
        retryAfter: '15 minutos'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // No contar requests exitosos
});

module.exports = {
    rateLimiter,
    aiRateLimiter,
    authRateLimiter
};
