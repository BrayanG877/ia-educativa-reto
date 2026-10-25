/**
 * Controlador de Chat
 * Maneja la interacción con la IA educativa
 */

const aiService = require('../services/ai.service');
const moderationService = require('../services/moderation.service');
const tutorIntegration = require('../services/tutor.integration');
const analyticsService = require('../services/analytics.service');
const intentService = require('../services/intent.service');
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
 * Esquema del endpoint de streaming.
 * Diferencia clave con el esquema normal: `subject` es OPCIONAL.
 *
 * Por qué: exigir materia era otra vía para el fallo P0 — el cliente tenía que
 * inventar una (y elegía 'matematicas') aunque el estudiante preguntara de
 * Historia. Sin materia, el backend la infiere del mensaje.
 */
const streamMessageSchema = Joi.object({
    message: Joi.string().required().max(2000).messages({
        'string.empty': 'El mensaje no puede estar vacío',
        'string.max': 'El mensaje no puede exceder 2000 caracteres',
        'any.required': 'El mensaje es obligatorio'
    }),
    subject: Joi.string().allow(null, '').default(null),
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

    // ANALÍTICA DE APRENDIZAJE (panel docente).
    // Se registra un evento estructurado por turno pedagógico, con el tema
    // clasificado por reglas reproducibles y el desenlace observado.
    //
    // Se usa planInstrumentacion() y NO aiResponse.agentPlan porque este último
    // solo existe con AGENT_ENABLED=true. La analítica debe funcionar sin
    // cambiar el prompt que recibe el estudiante: el plan se calcula aquí solo
    // para clasificar el turno.
    //
    // Independiente de AGENT_PERSISTENCE_ENABLED: esa bandera controla las
    // tablas del agente (agent_evidence); learning_events es la fuente de
    // verdad del panel docente.
    //
    // Tolerante a fallos: registrarEvento nunca lanza. Si la migración
    // migration_teacher_panel.sql no está aplicada, no se escribe nada y el
    // estudiante recibe su respuesta con normalidad.
    if (analyticsService) {
        const planAnalitica = tutorIntegration.planInstrumentacion({
            message, subject, mode, history
        });
        if (planAnalitica) {
            const grupoId = await analyticsService.grupoDelEstudiante(query, userId);
            await analyticsService.registrarEvento(query, {
                userId,
                groupId: grupoId,
                conversationId: currentConversationId,
                subject,
                message,
                plan: planAnalitica,
                mode,
                provider: aiResponse.fallback ? aiResponse.fallback.to : undefined,
                model: aiResponse.model,
                fallbackFrom: aiResponse.fallback ? aiResponse.fallback.from : null,
                durationMs: aiResponse.duration,
                activityType: mode === 'icfes' ? 'icfes' : (mode === 'quiz' ? 'quiz' : 'chat')
            });
        }
    }

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
/**
 * Enviar mensaje a la IA devolviendo la respuesta EN STREAMING (SSE)
 * ==================================================================
 * Protocolo (text/event-stream) hacia el navegador:
 *
 *   event: meta    {conversationId, model, provider}    inicio
 *   event: delta   {text}                               trozo visible
 *   event: done    {conversationId, model, usage, duration}
 *   event: error   {message, code}                      fin anómalo
 *
 * GARANTÍAS
 *  - Solo se envía contenido VISIBLE: el razonamiento interno del modelo se
 *    filtra en el proveedor (consumirSSE descarta reasoning_content).
 *  - UN único registro de analítica, y solo si el turno termina bien.
 *    Un fallo, un timeout o una cancelación NO dejan eventos a medias.
 *  - El mensaje del estudiante se guarda antes de llamar al modelo (igual que
 *    el flujo normal), para no perder la pregunta si la generación falla.
 *  - Si el cliente cierra la conexión, se aborta la llamada al proveedor
 *    (no se sigue consumiendo cuota) y no se persiste nada.
 *  - No se reintenta automáticamente: ya se pudo enviar texto al estudiante.
 */
exports.streamMessage = async (req, res) => {
    // 1) Validación
    const { error, value } = streamMessageSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ success: false, message: error.details[0].message });
    }

    const { message, subject, mode, conversationId } = value;
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
    }

    // 2) Moderación previa (antes de abrir el flujo)
    const moderation = await moderationService.moderateMessage(userId, message);
    if (!moderation.isValid) {
        return res.status(400).json({
            success: false,
            message: `Contenido no permitido: ${moderation.reason}`
        });
    }
    if (!aiService.isEducationalContent(message)) {
        return res.status(400).json({
            success: false,
            message: 'El contenido debe ser de naturaleza educativa'
        });
    }

    // 3) Materia: si no viene, se usa la inferida del mensaje.
    //    El id es obligatorio en la tabla conversations; el código se resuelve
    //    aquí para no romper el esquema.
    const deteccion = intentService.detectarMateria(message, subject);
    const materia = deteccion.materia || subject || 'matematicas';
    const subjectResult = await query('SELECT id FROM subjects WHERE code = @param1', [materia]);
    const subjectId = subjectResult.rows.length ? subjectResult.rows[0].id : null;

    // 4) Conversación (crear o verificar propiedad)
    let currentConversationId = conversationId;
    if (!currentConversationId) {
        const nueva = await query(
            `INSERT INTO conversations (user_id, subject_id, mode, title)
             OUTPUT INSERTED.id
             VALUES (@param1, @param2, @param3, @param4)`,
            [userId, subjectId, mode, message.substring(0, 100)]
        );
        currentConversationId = nueva.rows[0].id;
    } else {
        const owner = await query(
            'SELECT id FROM conversations WHERE id = @param1 AND user_id = @param2',
            [currentConversationId, userId]
        );
        if (owner.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Conversación no encontrada' });
        }
    }

    // 5) Historial previo (sin incluir el mensaje actual, que se añade después)
    const historyResult = await query(
        `SELECT TOP 5 role, content
           FROM messages
          WHERE conversation_id = @param1
          ORDER BY created_at DESC`,
        [currentConversationId]
    );
    const history = historyResult.rows.reverse();

    // 6) Guardar la pregunta ANTES de generar
    await query(
        `INSERT INTO messages (conversation_id, role, content, created_at)
         VALUES (@param1, @param2, @param3, SYSDATETIME())`,
        [currentConversationId, 'user', message]
    );

    // 7) Abrir el flujo SSE
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');  // evita el buffering de Nginx
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const enviar = (evento, datos) => {
        if (res.writableEnded) return;
        res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
    };

    // Cancelación: si el cliente cierra, se aborta la llamada al proveedor.
    const controlador = new AbortController();
    let canceladoPorCliente = false;
    const alCerrar = () => {
        canceladoPorCliente = true;
        controlador.abort();
    };
    req.on('close', alCerrar);
    res.on('close', alCerrar);

    let completo = false;
    try {
        const aiResponse = await aiService.generateResponseStream({
            message,
            subject,
            history,
            mode,
            userId,
            signal: controlador.signal,
            onDelta: (trozo) => {
                // Defensa en profundidad: nunca se emite un trozo vacío ni de
                // razonamiento (el proveedor ya lo filtra).
                if (typeof trozo === 'string' && trozo.length > 0) {
                    enviar('delta', { text: trozo });
                }
            }
        });

        if (canceladoPorCliente) return;

        enviar('meta', {
            conversationId: currentConversationId,
            model: aiResponse.model,
            provider: aiResponse.provider
        });

        // Persistir la respuesta completa
        await query(
            `INSERT INTO messages (
                conversation_id, role, content, model,
                prompt_tokens, completion_tokens, total_tokens,
                cost, was_cached, created_at
             )
             VALUES (@param1, @param2, @param3, @param4, @param5, @param6, @param7, @param8, @param9, SYSDATETIME())`,
            [currentConversationId, 'assistant', aiResponse.content, aiResponse.model,
             aiResponse.usage.inputTokens, aiResponse.usage.outputTokens,
             aiResponse.usage.totalTokens, aiResponse.cost.totalCost, 0]
        );

        await query(
            `UPDATE conversations
                SET last_message_at = GETDATE(),
                    message_count = message_count + 2,
                    total_tokens = total_tokens + @param1,
                    estimated_cost = estimated_cost + @param2
              WHERE id = @param3`,
            [aiResponse.usage.totalTokens, aiResponse.cost.totalCost, currentConversationId]
        );

        // ANALÍTICA: UN evento por turno COMPLETADO. No hay registro parcial.
        if (analyticsService) {
            const grupoId = await analyticsService.grupoDelEstudiante(query, userId);
            await analyticsService.registrarEvento(query, {
                userId,
                groupId: grupoId,
                conversationId: currentConversationId,
                subject: aiResponse.materiaEfectiva || subject,
                message,
                plan: aiResponse.agentPlan,
                mode,
                provider: aiResponse.provider,
                model: aiResponse.model,
                durationMs: aiResponse.duration,
                activityType: mode === 'icfes' ? 'icfes' : (mode === 'quiz' ? 'quiz' : 'chat')
            });
        }

        completo = true;
        enviar('done', {
            conversationId: currentConversationId,
            model: aiResponse.model,
            usage: aiResponse.usage,
            duration: aiResponse.duration
        });
    } catch (error) {
        // Cancelación del estudiante: no es un error, no se registra nada.
        if (canceladoPorCliente || (error && error.cancelado)) {
            return;
        }
        enviar('error', {
            message: (error && error.message) || 'No se pudo generar la respuesta',
            code: (error && error.statusCode) || 500
        });
    } finally {
        req.removeListener('close', alCerrar);
        res.removeListener('close', alCerrar);
        // Nunca se intenta reintentar aquí: ya se pudo enviar texto al
        // estudiante y un reintento duplicaría el turno y el evento.
        if (!res.writableEnded) res.end();
        if (!completo && !canceladoPorCliente) {
            console.warn('[STREAM] turno incompleto', { conversacion: currentConversationId });
        }
    }
};

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
