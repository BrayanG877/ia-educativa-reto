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
 *
 * NOTA SOBRE EL LÍMITE:
 * Un colegio entero puede compartir una única IP pública (NAT). Con 5
 * intentos / 15 min, la sexta persona que inicie sesión en el aula se queda
 * fuera aunque cada una falle una sola vez. Aun así, el límite debe seguir
 * protegiendo contra fuerza bruta real: 30 / 15 min permite que un aula
 * trabaje y sigue bloqueando un ataque automatizado.
 *
 * Configurable con AUTH_RATE_LIMIT_MAX sin tocar código.
 */
/**
 * Normaliza un correo para la clave del limitador.
 *
 * Objetivo: que las variantes triviales del MISMO correo cuenten juntas, sin
 * normalizar hasta el punto de mezclar cuentas distintas.
 *
 *   " Alumno@X.com "   -> alumno@x.com
 *   "alumno+2@x.com"  -> alumno@x.com   (etiqueta + de los alias)
 *   "alumno@x.com"    -> alumno@x.com
 *
 * Solo se corta el '+' en la parte LOCAL (antes de la '@'): en el dominio un
 * '+' es un carácter válido y cortarlo mezclaría dominios diferentes.
 */
function normalizarCorreo(crudo) {
    let texto = String(crudo || '').trim().toLowerCase();
    if (!texto) return '';

    const arroba = texto.lastIndexOf('@');
    if (arroba > 0) {
        let local = texto.slice(0, arroba);
        const dominio = texto.slice(arroba + 1);
        const mas = local.indexOf('+');
        if (mas > 0) local = local.slice(0, mas);
        texto = local + '@' + dominio;
    }

    // Cota defensiva: el limitador no necesita el correo completo y una cadena
    // gigantesca en la clave desperdicia memoria del store.
    return texto.slice(0, 120);
}

const AUTH_WINDOW_MS = 15 * 60 * 1000;const AUTH_MAX = (() => {
    const n = parseInt(process.env.AUTH_RATE_LIMIT_MAX || '30', 10);
    return Number.isInteger(n) && n >= 5 && n <= 500 ? n : 30;
})();
const authRateLimiter = rateLimit({
    windowMs: AUTH_WINDOW_MS,
    max: AUTH_MAX,
    message: {
        error: 'Demasiados intentos de inicio de sesión. Por favor intenta más tarde.',
        retryAfter: '15 minutos'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // No contar requests exitosos
    // Clave por IP REAL del cliente (ver app.set('trust proxy') en server.js).
    // Se combina con el correo intentado para que un error de una persona no
    // bloquee a sus compañeros de la misma red: un aula comparte IP, no cuenta.
    //
    // NORMALIZACION DEL CORREO: sin esto se podía eludir el límite variando
    // detalles que el sistema considera "otro correo":
    //   Alumno@x.com      vs alumno@x.com      (mayúsculas)
    //   alumno+1@x.com    vs alumno@x.com      (etiqueta +)
    //   alumno@x.com      vs " alumno@x.com "  (espacios)
    // La parte local se lleva a minúsculas y se corta en el '+'; el dominio ya
    // se compara sin distinguir mayúsculas en SQL Server.
    //
    // La IP se normaliza también: IPv4-mapped (::ffff:1.2.3.4) se reduce a la
    // IPv4, para que no genere un cubo distinto del mismo cliente.
    keyGenerator: (req) => {
        const crudo = req && req.body && typeof req.body.email === 'string'
            ? req.body.email
            : '';
        const email = normalizarCorreo(crudo);

        let ip = (req && req.ip) || 'desconocida';
        if (ip.startsWith('::ffff:')) ip = ip.slice(7);

        return `${ip}|${email}`;
    }
});

module.exports = {
    rateLimiter,
    aiRateLimiter,
    authRateLimiter,
    // Expuesta para pruebas: verifica la normalización de la clave.
    normalizarCorreo
};
