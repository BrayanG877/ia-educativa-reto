/**
 * Rutas de Autenticación
 * Endpoints para registro, login, logout
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authRateLimiter } = require('../middleware/rateLimit.middleware');
const { authenticateToken } = require('../middleware/auth.middleware');

/**
 * POST /api/auth/register
 * Registrar nuevo usuario
 * Body: { email, password, username, fullName, gradeLevel?, institution?, parentConsent }
 */
router.post('/register', authRateLimiter, authController.register);

/**
 * POST /api/auth/login
 * Iniciar sesión
 * Body: { email, password }
 */
router.post('/login', authRateLimiter, authController.login);

/**
 * POST /api/auth/logout
 * Cerrar sesión (con token)
 */
router.post('/logout', authenticateToken, authController.logout);

/**
 * GET /api/auth/me
 * Obtener información del usuario autenticado
 * Requiere token JWT
 */
router.get('/me', authenticateToken, authController.getProfile);

/**
 * POST /api/auth/verify-email
 * Verificar email del usuario
 * Body: { token }
 */
router.post('/verify-email', authController.verifyEmail);

/**
 * POST /api/auth/forgot-password
 * Solicitar reseteo de contraseña
 * Body: { email }
 */
router.post('/forgot-password', authRateLimiter, authController.forgotPassword);

/**
 * POST /api/auth/reset-password
 * Resetear contraseña
 * Body: { token, newPassword }
 */
router.post('/reset-password', authController.resetPassword);

module.exports = router;
