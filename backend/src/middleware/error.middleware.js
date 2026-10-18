/**
 * Middleware de manejo de errores
 * Centraliza el manejo de errores de la aplicación
 */

/**
 * Clase de error personalizada
 */
class AppError extends Error {
    constructor(message, statusCode, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();

        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Middleware de manejo de errores
 */
function errorHandler(err, req, res, next) {
    let error = { ...err };
    error.message = err.message;
    error.stack = err.stack;

    // Log del error
    console.error('❌ Error:', {
        message: error.message,
        statusCode: error.statusCode,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });

    // Error de validación de Joi.
    // IMPORTANTE: `Object.values(err.errors)` lanzaba TypeError cuando un error
    // se llama "ValidationError" pero NO trae `.errors` (p. ej. un error propio o
    // de una librería). Ese TypeError se producía DENTRO del propio errorHandler,
    // así que Express no podía serializarlo y devolvía HTML en lugar de JSON.
    // Se comprueba que exista antes de recorrerlo.
    if (err.name === 'ValidationError' && err.errors && typeof err.errors === 'object') {
        const message = Object.values(err.errors).map(e => e && e.message).filter(Boolean).join(', ');
        error = new AppError(message || 'Datos inválidos', 400);
    }

    // Error de clave duplicada: PostgreSQL usa 23505, SQL Server usa 2627/2601.
    // Este backend corre sobre SQL Server (mssql), así que sin los códigos de
    // SQL Server un email duplicado se reportaba como 500 en vez de 409.
    if (err.code === '23505' || err.number === 2627 || err.number === 2601) {
        error = new AppError('Este registro ya existe', 409);
    }

    // Violación de clave foránea: PostgreSQL 23503, SQL Server 547.
    if (err.code === '23503' || err.number === 547) {
        error = new AppError('Referencia inválida', 400);
    }

    // Errores de conexión/consulta de SQL Server (mssql/tedious): sin este mapeo
    // caían al 500 genérico y era imposible distinguir "BD caída" de un bug real.
    if (err.name === 'ConnectionError' || err.name === 'RequestError' || err.code === 'ESOCKET' || err.code === 'ELOGIN') {
        error = new AppError('El servicio de datos no está disponible temporalmente.', 503);
    }

    // Error de JWT
    if (err.name === 'JsonWebTokenError') {
        error = new AppError('Token inválido', 401);
    }

    if (err.name === 'TokenExpiredError') {
        error = new AppError('Token expirado', 401);
    }

    // Error de rate limiting
    if (err.name === 'TooManyRequestsError') {
        error = new AppError('Demasiadas peticiones', 429);
    }

    // Respuesta de error
    const statusCode = error.statusCode || 500;
    const message = error.isOperational
        ? error.message
        : 'Error interno del servidor';

    // El stack sólo se expone si se pide EXPLÍCITAMENTE con EXPOSE_ERROR_STACK=true.
    // Antes bastaba NODE_ENV=development para filtrar rutas internas del servidor
    // en la respuesta (visible desde el navegador). Así se evita por defecto.
    const exponerStack = process.env.EXPOSE_ERROR_STACK === 'true';

    // La respuesta incluye `success:false` además de `error:true`.
    // El frontend (api-client.js) y varios consumidores esperan `success`; con
    // sólo `error` un error de validación se mostraba como "error inesperado".
    // Se mantienen ambos campos para no romper a ningún cliente existente.
    const body = {
        success: false,
        error: true,
        message,
        ...(exponerStack && {
            stack: error.stack,
            details: error
        }),
        timestamp: new Date().toISOString()
    };

    // Salvaguarda final: pase lo que pase, la respuesta de la API debe ser JSON.
    // Si `res.json` fallara (cabeceras ya enviadas, error de serialización...),
    // se intenta responder un JSON mínimo en vez de dejar que Express devuelva
    // su página HTML de error (que rompía el parseo en el navegador con
    // "Unexpected token '<'")
    if (res.headersSent) {
        return next(err);
    }
    try {
        return res.status(statusCode).json(body);
    } catch (serializationError) {
        console.error('❌ El errorHandler no pudo serializar la respuesta:', serializationError);
        try {
            return res.status(500).type('application/json').send(
                JSON.stringify({ success: false, error: true, message: 'Error interno del servidor' })
            );
        } catch (_) {
            return next(err);
        }
    }
}

/**
 * Wrapper para funciones async
 * Captura errores automáticamente
 */
function catchAsync(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = {
    AppError,
    errorHandler,
    catchAsync
};
