/**
 * Rutas de Chat con IA
 * Endpoints para interactuar con el sistema de tutorización
 */

const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller');
const { aiRateLimiter } = require('../middleware/rateLimit.middleware');
const { authenticateToken, optionalAuth } = require('../middleware/auth.middleware');

// El rate limiter de IA se salta las rutas que NO invocan al modelo. Antes se
// aplicaba a TODAS las rutas de /api/chat, así que listar materias o consultar
// el historial gastaba la cuota de IA (una recarga de la interfaz podía dejar
// al estudiante sin poder preguntar).
const rutasSinIA = new Set([
    '/subjects',
    '/conversations'
]);
const skipAiLimit = (req) => {
    // GET que sólo leen datos no consumen tokens.
    if (req.method === 'GET') return true;
    return rutasSinIA.has(req.path);
};

// optionalAuth va PRIMERO para que req.userId ya exista cuando el keyGenerator
// del limiter decide la clave; si no, la cuota se contaba por IP y varios
// estudiantes en la misma red compartían el mismo límite.
router.use(optionalAuth, (req, res, next) => {
    if (skipAiLimit(req)) return next();
    return aiRateLimiter(req, res, next);
});

/**
 * POST /api/chat/message
 * Enviar mensaje a la IA y obtener respuesta
 * Body: { message, subject, mode, conversationId? }
 */
router.post('/message', authenticateToken, chatController.sendMessage);

/**
 * POST /api/chat/stream
 * Igual que /message, pero devuelve la respuesta en streaming (SSE).
 * Body: { message, subject?, mode, conversationId? }
 *
 * La respuesta NO es JSON: es text/event-stream con eventos
 * meta / delta / done / error.
 */
router.post('/stream', authenticateToken, chatController.streamMessage);

/**
 * GET /api/chat/history/:conversationId
 * Obtener historial de una conversación
 */
router.get('/history/:conversationId', authenticateToken, chatController.getHistory);

/**
 * GET /api/chat/conversations
 * Obtener lista de conversaciones del usuario
 */
router.get('/conversations', authenticateToken, chatController.getConversations);

/**
 * POST /api/chat/conversation/new
 * Crear nueva conversación
 * Body: { subjectId, mode, title? }
 */
router.post('/conversation/new', authenticateToken, chatController.createConversation);

/**
 * DELETE /api/chat/conversation/:conversationId
 * Eliminar conversación y sus mensajes
 */
router.delete('/conversation/:conversationId', authenticateToken, chatController.deleteConversation);

/**
 * POST /api/chat/icfes/question
 * Generar pregunta estilo ICFES
 * Body: { subject, topic, difficulty }
 */
router.post('/icfes/question', authenticateToken, chatController.generateICFESQuestion);

/**
 * GET /api/chat/subjects
 * Obtener lista de materias disponibles
 */
router.get('/subjects', chatController.getSubjects);

module.exports = router;
