/**
 * Middleware de Autenticación JWT
 * Protege rutas que requieren usuario autenticado
 */

const jwt = require('jsonwebtoken');
const { AppError } = require('./error.middleware');
const { query } = require('../config/database');

// EL ROL NO VIAJA EN EL JWT (solo userId/email). Se consulta SIEMPRE a la BD
// con el userId del token ya verificado. Así, revocar/rebajar un rol en la BD
// tiene efecto inmediato y el cliente no puede elevar su rol manipulando el
// token. Solo se aplica a rutas que lo necesitan (métricas), no a todo el API.

/**
 * Middleware para verificar JWT token
 * Lee el token del header Authorization: Bearer <token>
 * Añade el userId al request para uso en controladores
 */
const authenticateToken = (req, res, next) => {
    try {
        // Obtener token del header Authorization
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            throw new AppError('Token de autenticación requerido', 401);
        }

        // Verificar formato: "Bearer <token>"
        if (!authHeader.startsWith('Bearer ')) {
            throw new AppError('Formato de token inválido. Use: Bearer <token>', 401);
        }

        // Extraer token
        const token = authHeader.split(' ')[1];

        if (!token) {
            throw new AppError('Token no proporcionado', 401);
        }

        // Verificar JWT_SECRET
        if (!process.env.JWT_SECRET) {
            console.error('❌ JWT_SECRET no configurado en .env');
            throw new AppError('Error de configuración del servidor', 500);
        }

        // Verificar y decodificar token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Añadir información del usuario al request
        req.userId = decoded.userId;
        req.userEmail = decoded.email;

        // Continuar al siguiente middleware/controlador
        next();

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return next(new AppError('Token inválido', 401));
        }
        if (error.name === 'TokenExpiredError') {
            return next(new AppError('Token expirado. Por favor inicie sesión nuevamente', 401));
        }

        // Pasar cualquier otro error al error handler
        next(error);
    }
};

/**
 * Middleware opcional - intenta autenticar pero no falla si no hay token
 * Útil para rutas que pueden funcionar con o sin autenticación
 */
const optionalAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];

            if (token && process.env.JWT_SECRET) {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                req.userId = decoded.userId;
                req.userEmail = decoded.email;
            }
        }

        // Siempre continuar, incluso sin token
        next();

    } catch (error) {
        // Ignorar errores de token en modo opcional
        next();
    }
};

/**
 * Devuelve el rol REAL del usuario autenticado (student|teacher|admin).
 * Nunca confía en datos del cliente. Devuelve null si el usuario no existe.
 */
async function getAuthenticatedRole(userId) {
    if (!userId) return null;
    const result = await query(
        'SELECT role FROM users WHERE id = @param1',
        [userId]
    );
    return result.rows.length > 0 ? result.rows[0].role : null;
}

/**
 * Middleware: carga req.userRole desde la BD. Requiere authenticateToken antes.
 * No falla si el usuario no existe (el controlador decide), pero deja
 * req.userRole = null.
 */
async function loadUserRole(req, res, next) {
    try {
        if (!req.userId) return next(new AppError('Token de autenticación requerido', 401));
        req.userRole = await getAuthenticatedRole(req.userId);
        return next();
    } catch (error) {
        return next(error);
    }
}

/**
 * Middleware: exige uno de los roles indicados (comparados con users.role).
 * Requiere authenticateToken -> loadUserRole antes.
 */
function requireRole(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.userRole || !rolesPermitidos.includes(req.userRole)) {
            return next(new AppError('No autorizado para acceder a este recurso', 403));
        }
        return next();
    };
}

module.exports = {
    authenticateToken,
    optionalAuth,
    getAuthenticatedRole,
    loadUserRole,
    requireRole
};
