/**
 * Rutas de Métricas y Estadísticas
 * Endpoints para progreso y ranking de estudiantes
 */

const express = require('express');
const router = express.Router();
const metricsController = require('../controllers/metrics.controller');
const { authenticateToken, loadUserRole, requireRole } = require('../middleware/auth.middleware');

/**
 * GET /api/metrics/user/:userId
 * Obtener métricas de un usuario específico.
 * Autorización HORIZONTAL en el controlador: el propio usuario, o
 * teacher/admin (rol leído de la BD con loadUserRole).
 */
router.get('/user/:userId', authenticateToken, loadUserRole, metricsController.getUserMetrics);

/**
 * GET /api/metrics/ranking
 * Obtener ranking de estudiantes.
 * Requiere AUTENTICACIÓN: expone nombre de usuario y puntuaciones de
 * estudiantes, por lo que no puede quedar público. La respuesta tiene
 * identidad reducida (sin UUID ni nombre completo).
 * Query: ?limit=10 (entero 1..100)
 */
router.get('/ranking', authenticateToken, metricsController.getRanking);

/**
 * GET /api/metrics/stats
 * Obtener estadísticas generales del usuario actual
 */
router.get('/stats', authenticateToken, metricsController.getUserStats);

/**
 * POST /api/metrics/update
 * Actualizar métricas del usuario
 * Body: { timeSpent, messagesCount, exercisesCompleted, correctAnswers }
 */
router.post('/update', authenticateToken, metricsController.updateMetrics);

/**
 * GET /api/metrics/cache
 * Obtener estadísticas del sistema de caché. SOLO admin (rol leído de la BD).
 */
router.get('/cache', authenticateToken, loadUserRole, requireRole('admin'), metricsController.getCacheStats);

module.exports = router;
