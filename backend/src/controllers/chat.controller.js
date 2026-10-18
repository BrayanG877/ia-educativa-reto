/**
 * Controlador de Chat
 * Maneja la interacción con la IA educativa
 */

const aiService = require('../services/ai.service');
const moderationService = require('../services/moderation.service');
const tutorIntegration = require('../services/tutor.integration');
const { query } = require('../config/database');
const { AppError, catchAsync } = require('../middleware/error.middleware');
const Joi = require('joi');

/**
 * Validación de mensajes
 */
const messageSchema = Joi.object({
    message: Joi.string().required().max(2000).messages({
        'string.empty': 'El mensaje no puede estar vacío',
        'string.max': 'El mensaje no puede exceder 2000 caracteres',
        'any.required': 'El mensaje es obligatorio'
    }),
    subject: Joi.string().required().messages({
        'string.empty': 'La materia es obligatoria',
        'any.required': 'La materia es obligatoria'
    }),
    mode: Joi.string().valid('socratic', 'direct', 'icfes', 'quiz').default('socratic'),
    conversationId: Joi.string().uuid().allow(null)
});

/**
 * Enviar mensaje a la IA
 */
exports.sendMessage = catchAsync(async (req, res) => {
    // Validar request
    const { error, value } = messageSchema.validate(req.body);
    if (error) {
        throw new AppError(error.details[0].message, 400);
    }

    const { message, subject, mode, conversationId } = value;
    const userId = req.userId; // Viene del middleware JWT

    if (!userId) {
        throw new AppError('Usuario no autenticado', 401);
    }

    // Moderar contenido
    const moderation = await moderationService.moderateMessage(userId, message);

    if (!moderation.isValid) {
        throw new AppError(`Contenido no permitido: ${moderation.reason}`, 400);
    }

    // Validar contenido educativo (doble verificación)
    if (!aiService.isEducationalContent(message)) {
        throw new AppError('El contenido debe ser de naturaleza educativa', 400);
    }

    // Obtener ID de materia
    const subjectResult = await query(
        'SELECT id FROM subjects WHERE code = @param1',
        [subject]
    );

    if (subjectResult.rows.length === 0) {
        throw new AppError('Materia no encontrada', 404);
    }

    const subjectId = subjectResult.rows[0].id;

    // Obtener o crear conversación
    let currentConversationId = conversationId;

    if (!currentConversationId) {
        // Crear nueva conversación
        const newConvResult = await query(
            `INSERT INTO conversations (user_id, subject_id, mode, title)
             OUTPUT INSERTED.id
             VALUES (@param1, @param2, @param3, @param4)`,
            [userId, subjectId, mode, message.substring(0, 100)]
        );
        currentConversationId = newConvResult.rows[0].id;
    } else {
        // Verificar que la conversación pertenece a este usuario.
        // Sin esta comprobación, cualquier estudiante autenticado podía inyectar
        // mensajes en la conversación de otro conociendo su UUID.
        const ownerResult = await query(
            'SELECT id FROM conversations WHERE id = @param1 AND user_id = @param2',
            [currentConversationId, userId]
        );

        if (ownerResult.rows.length === 0) {
            throw new AppError('Conversación no encontrada', 404);
        }
    }

    // Obtener historial de la conversación (últimos 5 mensajes)
    const historyResult = await query(
        `SELECT TOP 5 role, content
         FROM messages
         WHERE conversation_id = @param1
         ORDER BY created_at DESC`,
        [currentConversationId]
    );

    const history = historyResult.rows.reverse();

    // Guardar el mensaje del usuario ANTES de llamar a la IA.
    // Si se guarda después y la IA falla, la pregunta del estudiante se pierde y
    // el historial queda incoherente al reintentar.
    // Nota: se guarda tras leer el historial para no duplicar el mensaje actual,
    // que ya se envía por separado a generateResponse().
    await query(
        `INSERT INTO messages (conversation_id, role, content, created_at)
         VALUES (@param1, @param2, @param3, SYSDATETIME())`,
        [currentConversationId, 'user', message]
    );

    // Generar respuesta de IA
    const aiResponse = await aiService.generateResponse({
        message,
        subject,
        history,
        mode,
        userId
    });

    // Guardar respuesta de la IA
    await query(
        `INSERT INTO messages (
            conversation_id, role, content, model,
            prompt_tokens, completion_tokens, total_tokens,
            cost, was_cached, created_at
         )
         VALUES (@param1, @param2, @param3, @param4, @param5, @param6, @param7, @param8, @param9, SYSDATETIME())`,
        [
            currentConversationId,
            'assistant',
            aiResponse.content,
            aiResponse.model,
            aiResponse.usage?.inputTokens || 0,
            aiResponse.usage?.outputTokens || 0,
            aiResponse.usage?.totalTokens || 0,
            aiResponse.cost?.totalCost || 0,
            aiResponse.fromCache ? 1 : 0
        ]
    );

    // Actualizar última actividad de conversación
    await query(
        `UPDATE conversations
         SET last_message_at = GETDATE(),
             message_count = message_count + 2,
             total_tokens = total_tokens + @param1,
             estimated_cost = estimated_cost + @param2
         WHERE id = @param3`,
        [aiResponse.usage?.totalTokens || 0, aiResponse.cost?.totalCost || 0, currentConversationId]
    );

    // Agente tutor: registrar evidencia SOLO si la persistencia está habilitada
    // (AGENT_PERSISTENCE_ENABLED=true) y si el agente produjo un plan. Es
    // tolerante a fallos: nunca rompe la respuesta al estudiante. Con la
    // persistencia desactivada (por defecto) NO se realiza ninguna consulta.
    await tutorIntegration.registrarTurno(query, {
        plan: aiResponse.agentPlan,
        conversationId: currentConversationId,
        userId,
        subject,
        mode,
        provider: aiResponse.fallback ? aiResponse.fallback.to : undefined,
        model: aiResponse.model,
        fallbackFrom: aiResponse.fallback ? aiResponse.fallback.from : null
    });

    // Responder
    res.json({
        success: true,
        data: {
            conversationId: currentConversationId,
            response: aiResponse.content,
            model: aiResponse.model,
            usage: aiResponse.usage,
            cost: aiResponse.cost,
            fromCache: aiResponse.fromCache,
            duration: aiResponse.duration
        }
    });
});

/**
 * Obtener historial de conversación
 */
exports.getHistory = catchAsync(async (req, res) => {
    const { conversationId } = req.params;
    const userId = req.userId; // Del middleware JWT

    // Validar UUID
    if (!conversationId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
        throw new AppError('ID de conversación inválido', 400);
    }

    // Verificar propiedad: antes se devolvía el historial de CUALQUIER
    // conversación con solo conocer su UUID, incluida la de otro estudiante.
    const ownerResult = await query(
        'SELECT id FROM conversations WHERE id = @param1 AND user_id = @param2',
        [conversationId, userId]
    );

    if (ownerResult.rows.length === 0) {
        throw new AppError('Conversación no encontrada', 404);
    }

    // Obtener mensajes
    const result = await query(
        `SELECT
            id, role, content, created_at,
            model, total_tokens, cost, was_cached
         FROM messages
         WHERE conversation_id = @param1
         ORDER BY created_at ASC`,
        [conversationId]
    );

    res.json({
        success: true,
        data: {
            conversationId,
            messages: result.rows,
            count: result.rows.length
        }
    });
});

/**
 * Obtener lista de conversaciones
 */
exports.getConversations = catchAsync(async (req, res) => {
    const userId = req.userId; // Del middleware JWT

    const result = await query(
        `SELECT
            c.id, c.title, c.mode, c.started_at, c.last_message_at,
            c.message_count, c.total_tokens, c.estimated_cost,
            s.name as subject_name, s.code as subject_code, s.emoji
         FROM conversations c
         LEFT JOIN subjects s ON c.subject_id = s.id
         WHERE c.user_id = @param1 AND c.is_active = 1
         ORDER BY c.last_message_at DESC`,
        [userId]
    );

    res.json({
        success: true,
        data: {
            conversations: result.rows,
            count: result.rows.length
        }
    });
});

/**
 * Crear nueva conversación
 */
exports.createConversation = catchAsync(async (req, res) => {
    const { subjectId, mode = 'socratic', title } = req.body;
    const userId = req.userId; // Del middleware JWT

    if (!subjectId) {
        throw new AppError('La materia es obligatoria', 400);
    }

    const result = await query(
        `INSERT INTO conversations (user_id, subject_id, mode, title)
         OUTPUT INSERTED.id, INSERTED.started_at
         VALUES (@param1, @param2, @param3, @param4)`,
        [userId, subjectId, mode, title || 'Nueva conversación']
    );

    res.status(201).json({
        success: true,
        data: {
            conversationId: result.rows[0].id,
            createdAt: result.rows[0].started_at
        }
    });
});

/**
 * Eliminar conversación
 */
exports.deleteConversation = catchAsync(async (req, res) => {
    const { conversationId } = req.params;

    // Validar UUID
    if (!conversationId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)) {
        throw new AppError('ID de conversación inválido', 400);
    }

    // Marcar como inactiva (soft delete), sólo si pertenece al usuario.
    // Sin el filtro por user_id cualquiera podía borrar conversaciones ajenas.
    const result = await query(
        'UPDATE conversations SET is_active = 0 WHERE id = @param1 AND user_id = @param2',
        [conversationId, req.userId]
    );

    if (result.rowCount === 0) {
        throw new AppError('Conversación no encontrada', 404);
    }

    res.json({
        success: true,
        message: 'Conversación eliminada correctamente'
    });
});

/**
 * Generar pregunta ICFES
 */
exports.generateICFESQuestion = catchAsync(async (req, res) => {
    const { subject, topic, difficulty = 'medium', userId } = req.body;

    if (!subject || !topic) {
        throw new AppError('Materia y tema son obligatorios', 400);
    }

    const question = await aiService.generateICFESQuestion({
        subject,
        topic,
        difficulty,
        userId
    });

    res.json({
        success: true,
        data: question
    });
});

/**
 * Obtener materias disponibles
 */
exports.getSubjects = catchAsync(async (req, res) => {
    const result = await query(
        `SELECT id, code, name, emoji, description
         FROM subjects
         WHERE is_active = 1
         ORDER BY id`
    );

    res.json({
        success: true,
        data: {
            subjects: result.rows,
            count: result.rows.length
        }
    });
});
