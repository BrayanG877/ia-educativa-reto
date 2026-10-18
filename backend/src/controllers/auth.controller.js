/**
 * Controlador de Autenticación
 * Maneja registro, login, logout y gestión de usuarios
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { AppError, catchAsync } = require('../middleware/error.middleware');
const Joi = require('joi');

/**
 * Validación de registro
 */
const registerSchema = Joi.object({
    email: Joi.string().email().required().messages({
        'string.email': 'Email inválido',
        'any.required': 'El email es obligatorio'
    }),
    password: Joi.string().min(6).required().messages({
        'string.min': 'La contraseña debe tener al menos 6 caracteres',
        'any.required': 'La contraseña es obligatoria'
    }),
    username: Joi.string().alphanum().min(3).max(30).required().messages({
        'string.alphanum': 'El usuario solo puede contener letras y números',
        'string.min': 'El usuario debe tener al menos 3 caracteres',
        'any.required': 'El usuario es obligatorio'
    }),
    fullName: Joi.string().required().messages({
        'any.required': 'El nombre completo es obligatorio'
    }),
    gradeLevel: Joi.string().allow(null, ''),
    institution: Joi.string().allow(null, ''),
    parentConsent: Joi.boolean().default(false)
});

/**
 * Validación de login
 */
const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

/**
 * Generar JWT
 */
function generateToken(userId, email) {
    return jwt.sign(
        { userId, email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
}

/**
 * Registrar nuevo usuario
 */
exports.register = catchAsync(async (req, res) => {
    // Validar datos
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
        throw new AppError(error.details[0].message, 400);
    }

    const { email, password, username, fullName, gradeLevel, institution, parentConsent } = value;

    // Verificar si el email ya existe
    const emailCheck = await query(
        'SELECT id FROM users WHERE email = @param1',
        [email]
    );

    if (emailCheck.rows.length > 0) {
        throw new AppError('El email ya está registrado', 400);
    }

    // Verificar si el username ya existe
    const usernameCheck = await query(
        'SELECT id FROM users WHERE username = @param1',
        [username]
    );

    if (usernameCheck.rows.length > 0) {
        throw new AppError('El nombre de usuario ya está en uso', 400);
    }

    // Hash de contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Crear usuario
    const result = await query(
        `INSERT INTO users (
            email, password_hash, username, full_name,
            grade_level, institution, parent_consent, role
        )
        OUTPUT INSERTED.id, INSERTED.email, INSERTED.username, INSERTED.created_at
        VALUES (@param1, @param2, @param3, @param4, @param5, @param6, @param7, @param8)`,
        [email, passwordHash, username, fullName, gradeLevel, institution, parentConsent ? 1 : 0, 'student']
    );

    const newUser = result.rows[0];

    // Generar token
    const token = generateToken(newUser.id, newUser.email);

    // Log de auditoría
    await query(
        `INSERT INTO audit_logs (user_id, action, resource, details)
         VALUES (@param1, @param2, @param3, @param4)`,
        [newUser.id, 'USER_REGISTERED', 'users', JSON.stringify({ username, email })]
    );

    res.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente',
        data: {
            userId: newUser.id,
            email: newUser.email,
            username: newUser.username,
            token
        }
    });
});

/**
 * Iniciar sesión
 */
exports.login = catchAsync(async (req, res) => {
    // Validar datos
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
        throw new AppError(error.details[0].message, 400);
    }

    const { email, password } = value;

    // Buscar usuario
    const result = await query(
        `SELECT id, email, password_hash, username, full_name, role, is_active
         FROM users
         WHERE email = @param1`,
        [email]
    );

    if (result.rows.length === 0) {
        throw new AppError('Email o contraseña incorrectos', 401);
    }

    const user = result.rows[0];

    // Verificar si está activo
    if (!user.is_active) {
        throw new AppError('Cuenta desactivada. Contacta al administrador', 403);
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
        throw new AppError('Email o contraseña incorrectos', 401);
    }

    // Actualizar último login
    await query(
        'UPDATE users SET last_login = GETDATE() WHERE id = @param1',
        [user.id]
    );

    // Generar token
    const token = generateToken(user.id, user.email);

    // Log de auditoría
    await query(
        `INSERT INTO audit_logs (user_id, action, resource, ip_address)
         VALUES (@param1, @param2, @param3, @param4)`,
        [user.id, 'USER_LOGIN', 'users', req.ip]
    );

    res.json({
        success: true,
        message: 'Inicio de sesión exitoso',
        data: {
            userId: user.id,
            email: user.email,
            username: user.username,
            fullName: user.full_name,
            role: user.role,
            token
        }
    });
});

/**
 * Cerrar sesión
 */
exports.logout = catchAsync(async (req, res) => {
    // En este caso simple, el logout es del lado del cliente
    // (eliminar token del localStorage)
    // Pero registramos el evento en auditoría

    const userId = req.userId; // Del middleware JWT

    if (userId) {
        await query(
            `INSERT INTO audit_logs (user_id, action, resource)
             VALUES (@param1, @param2, @param3)`,
            [userId, 'USER_LOGOUT', 'users']
        );
    }

    res.json({
        success: true,
        message: 'Sesión cerrada exitosamente'
    });
});

/**
 * Obtener perfil del usuario
 */
exports.getProfile = catchAsync(async (req, res) => {
    const userId = req.userId; // Del middleware JWT

    if (!userId) {
        throw new AppError('No autorizado', 401);
    }

    const result = await query(
        `SELECT
            id, email, username, full_name, role,
            grade_level, institution, parent_consent,
            is_active, is_verified, created_at, last_login
         FROM users
         WHERE id = @param1`,
        [userId]
    );

    if (result.rows.length === 0) {
        throw new AppError('Usuario no encontrado', 404);
    }

    res.json({
        success: true,
        data: result.rows[0]
    });
});

/**
 * Verificar email (placeholder)
 */
exports.verifyEmail = catchAsync(async (req, res) => {
    const { token } = req.body;

    // TODO: Implementar lógica de verificación de email
    // Por ahora solo un placeholder

    res.json({
        success: true,
        message: 'Funcionalidad de verificación de email pendiente de implementar'
    });
});

/**
 * Olvidé mi contraseña (placeholder)
 */
exports.forgotPassword = catchAsync(async (req, res) => {
    const { email } = req.body;

    // TODO: Implementar lógica de reset de contraseña
    // Enviar email con token de reset

    res.json({
        success: true,
        message: 'Si el email existe, recibirás instrucciones para resetear tu contraseña'
    });
});

/**
 * Resetear contraseña (placeholder)
 */
exports.resetPassword = catchAsync(async (req, res) => {
    const { token, newPassword } = req.body;

    // TODO: Implementar lógica de reset

    res.json({
        success: true,
        message: 'Funcionalidad de reset de contraseña pendiente de implementar'
    });
});
