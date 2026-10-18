/**
 * Rutas de Herramientas Educativas
 */

const express = require('express');
const router = express.Router();
const toolsController = require('../controllers/tools.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const { aiRateLimiter } = require('../middleware/rateLimit.middleware');

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Aplicar rate limiter a todas las rutas de herramientas
router.use(aiRateLimiter);

/**
 * POST /api/tools/test-prep
 * Genera test de preparación con preguntas de opción múltiple
 */
router.post('/test-prep', toolsController.generateTestPrep);

/**
 * POST /api/tools/quiz
 * Genera quiz interactivo con diferentes tipos de preguntas
 */
router.post('/quiz', toolsController.generateQuiz);

/**
 * POST /api/tools/evaluation
 * Genera evaluación estilo ICFES
 */
router.post('/evaluation', toolsController.generateEvaluation);

/**
 * POST /api/tools/mindmap
 * Genera estructura de mapa mental
 */
router.post('/mindmap', toolsController.generateMindMap);

/**
 * POST /api/tools/conceptmap
 * Genera estructura de mapa conceptual
 */
router.post('/conceptmap', toolsController.generateConceptMap);

/**
 * POST /api/tools/image-prompt
 * Genera prompt para generador de imágenes
 */
router.post('/image-prompt', toolsController.generateImagePrompt);

/**
 * POST /api/tools/video-script
 * Genera guion para video educativo
 */
router.post('/video-script', toolsController.generateVideoScript);

module.exports = router;
