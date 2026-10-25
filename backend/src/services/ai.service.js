/**
 * Servicio de IA
 * Maneja todas las interacciones con el modelo de IA.
 *
 * El proveedor es conmutable (AI_PROVIDER): Anthropic Claude por defecto,
 * o proveedores gratuitos (Gemini, Groq, OpenRouter, Ollama local) para
 * hacer pruebas sin costo. El resto del flujo no cambia.
 */

const { DEFAULT_CONFIG, calculateCost } = require('../config/anthropic');
const aiProviders = require('./ai.providers');
// Se invoca a traves de `aiProviders.*` en lugar de destructurar, para que las
// funciones puedan sustituirse en pruebas (y en un futuro plugin/selector de
// proveedor) sin quedar "congeladas" por el destructuring en tiempo de carga.
const { listProviders } = aiProviders;
const cacheService = require('./cache.service');
const promptService = require('./prompt.service');
const intentService = require('./intent.service');
const tutorIntegration = require('./tutor.integration');
const { AppError } = require('../middleware/error.middleware');
const crypto = require('crypto');

// Configuración central del agente (validada). Si no estuviera disponible, se
// usan los valores heredados para no romper el arranque.
let aiConfig = null;
try { aiConfig = require('../config/ai.config'); } catch (_) { aiConfig = null; }
const AI_MAX_INPUT_CHARS = (aiConfig && aiConfig.maxInputChars) || 5000;

/**
 * Espera de forma ACOTADA si el error trae una indicacion Retry-After.
 * - Solo actua si error.retryAfterSeconds es un numero valido.
 * - Tope maximo de 5s para no bloquear la respuesta al estudiante.
 * - No se aplica a errores 401/403 (no tiene sentido esperar credenciales).
 * Nunca lanza.
 */
async function esperarRetryAfter(error) {
    try {
        const s = error && error.retryAfterSeconds;
        if (!Number.isFinite(s) || s <= 0) return;
        const MAX_ESPERA_MS = 5000;
        const ms = Math.min(s * 1000, MAX_ESPERA_MS);
        console.warn(`[AI] Respetando Retry-After acotado: ${Math.round(ms)}ms`);
        await new Promise(resolve => setTimeout(resolve, ms));
    } catch (_) {
        // La espera es best-effort: si algo falla, se continua sin esperar.
    }
}

/**
 * Generar respuesta de la IA
 * @param {Object} params - Parámetros de la request
 * @param {string} params.message - Mensaje del usuario
 * @param {string} params.subject - Materia seleccionada
 * @param {Array} params.history - Historial de conversación
 * @param {string} params.mode - Modo de conversación (socratic, direct, icfes)
 * @param {string} params.userId - ID del usuario
 */
async function generateResponse({ message, subject, history = [], mode = 'socratic', userId }) {
    // Intento 1: proveedor ACTIVO (el que resuelve getProviderName, normalmente
    // groq por AI_PROVIDER). El pipeline completo (cache, prompt, historial,
    // formato) vive en generateWithProvider para no duplicar logica.
    const activeId = aiProviders.getProviderName();
    try {
        return await generateWithProvider({
            provider: aiProviders.getProvider(),
            providerName: activeId,
            message, subject, history, mode, userId
        });
    } catch (error) {
        if (!(error instanceof AppError)) throw error;

        // Fallback configurable (AI_FALLBACK_ENABLED). Si esta desactivado, se
        // propaga el error sin intentar otro proveedor.
        const fallbackEnabled = (aiConfig && typeof aiConfig.fallbackEnabled === 'boolean')
            ? aiConfig.fallbackEnabled
            : true;
        if (!fallbackEnabled) throw error;

        // Solo se intenta el secundario ante errores RECUPERABLES (credenciales,
        // cuota, saturacion, timeout) y si existe OTRO proveedor configurado.
        // - Numero de intentos acotado por AI_MAX_RETRIES (default 1): nunca hay
        //   bucle ilimitado.
        // - Si el error es de peticion/modelo (400/404) no se cambia de proveedor:
        //   no arreglaria nada y gastaria cuota.
        if (!error.recoverable) throw error;

        const maxRetries = (aiConfig && Number.isInteger(aiConfig.maxRetries)) ? aiConfig.maxRetries : 1;
        if (maxRetries < 1) throw error; // sin reintentos permitidos

        const secondary = aiProviders.getSecondaryProvider(activeId);
        if (!secondary) throw error; // no hay respaldo configurado

        // Respeto de Retry-After: si el proveedor indico una espera y el error
        // la trae, se espera de forma ACOTADA antes de reintentar (evita
        // martillear al proveedor). Se limita a un maximo razonable.
        await esperarRetryAfter(error);

        console.warn(`[AI] Proveedor '${activeId}' falló (${error.statusCode}). Reintentando una vez con '${secondary.id}'.`);

        try {
            const result = await generateWithProvider({
                provider: secondary.provider,
                providerName: secondary.id,
                message, subject, history, mode, userId
            });
            // Marca informativa: se uso el respaldo. No altera el formato que
            // espera el frontend; solo anade un campo de diagnostico no critico.
            result.fallback = { from: activeId, to: secondary.id };
            return result;
        } catch (secondaryError) {
            // Si el respaldo tambien falla, se devuelve el error ORIGINAL del
            // proveedor principal (mas representativo) sin intentar mas veces.
            console.error(`[AI] El respaldo '${secondary.id}' tambien fallo:`, {
                status: secondaryError.statusCode || secondaryError.status,
                message: secondaryError.message
            });
            throw error;
        }
    }
}

/**
 * ¿El error permite intentar con otro proveedor?
 * Recuperables: 401/403 (credenciales del proveedor activo), 429 (cuota),
 * 408/504 (timeout), >=500 (caida/saturacion) y los marcados como recuperables
 * por el propio proveedor (p. ej. respuesta vacia de un modelo de razonamiento).
 * NO recuperables: 400/404 de peticion/modelo mal configurados (no se arregla
 * cambiando de proveedor) salvo que sea puntual.
 */
function isRecoverableError(error) {
    const s = error && error.status;
    if (error && error.recoverable === true) return true;
    if (s === 401 || s === 403) return true;
    if (s === 408 || s === 429 || s === 504) return true;
    if (typeof s === 'number' && s >= 500) return true;
    return false;
}

/**
 * Convierte un error crudo del proveedor en un AppError con mensaje seguro
 * y status HTTP adecuado. Diferencia credenciales, cuota, modelo y saturacion.
 * NUNCA expone la API key ni cabeceras de autorizacion.
 */
function toAppError(error, providerName) {
    const s = error && error.status;

    if (s === 401 || s === 403) {
        const varKey = providerName === 'reto' ? 'RETO_KEY' : 'la API key del proveedor';
        return new AppError(
            `El servicio de IA (${providerName}) rechazó las credenciales. ` +
            `Revisa ${varKey} en la configuración del backend`,
            503
        );
    }

    if (s === 404) {
        const pistas = {
            groq: 'Lista los modelos de tu cuenta en https://api.groq.com/openai/v1/models y pon uno vigente en GROQ_MODEL.',
            gemini: 'Lista los modelos de tu key en https://generativelanguage.googleapis.com/v1beta/models y pon uno vigente en GEMINI_MODEL.',
            anthropic: 'Usa un ID vigente en ANTHROPIC_MODEL (p. ej. claude-sonnet-4-5).',
            reto: 'Lista los modelos del gateway (GET {RETO_BASE_URL}/models) y pon uno vigente en RETO_MODEL (p. ej. grok-4.6).'
        };
        const pista = pistas[providerName] || 'Revisa la variable de modelo en backend/.env.';
        return new AppError(
            `El modelo de IA configurado no existe o no está disponible en ${providerName}. ${pista}`,
            503
        );
    }

    if (s === 429) {
        return new AppError(
            'El proveedor de IA alcanzó su límite de solicitudes o cuota. Intenta de nuevo en unos segundos.',
            429
        );
    }

    if (s === 408 || s === 504 || error?.name === 'AbortError') {
        return new AppError(
            'El tutor tardó más de lo esperado en responder. Tu pregunta no se perdió: ' +
            'vuelve a enviarla o prueba a pedir algo más concreto. ' +
            '(Si se repite, el modelo está saturado; intenta en unos minutos.)',
            504
        );
    }

    if (s === 502) {
        return new AppError('El servicio de IA devolvió una respuesta inválida. Intenta de nuevo.', 502);
    }

    if (typeof s === 'number' && s >= 500) {
        return new AppError('El proveedor de IA está saturado o no disponible temporalmente. Intenta de nuevo en unos segundos.', 503);
    }

    if (providerName === 'ollama') {
        return new AppError(
            'El proveedor de IA local (Ollama) no está en ejecución. ' +
            'Inícialo con "ollama serve" o cambia AI_PROVIDER a groq/gemini en backend/.env.',
            503
        );
    }

    if (s === 400) {
        return new AppError('No se pudo procesar la conversación. Intenta reformular tu pregunta.', 400);
    }

    return new AppError('El servicio de IA no está disponible temporalmente.', 503);
}

/**
 * Genera la respuesta usando un proveedor concreto, con el pipeline completo
 * (cache -> prompt -> historial -> proveedor -> costo -> guardado en cache).
 * Se extrae a su propia funcion para poder reutilizarla con el proveedor activo
 * y con el secundario sin duplicar logica.
 */
async function generateWithProvider({ provider, providerName, message, subject, history, mode, userId }) {
    const modelName = provider.model();

    try {
        // Verificar que el proveedor activo tenga credenciales
        if (!provider.configured()) {
            throw new AppError(
                `El proveedor de IA "${providerName}" no está configurado. ` +
                `Revisa las variables de entorno en backend/.env`,
                503
            );
        }

        // Límite de entrada configurable (AI_MAX_INPUT_CHARS). Protege frente a
        // mensajes excesivamente largos (costo y abuso). La validación Joi del
        // controlador ya limita a 2000; este es un tope de la capa de IA.
        if (typeof message === 'string' && message.length > AI_MAX_INPUT_CHARS) {
            throw new AppError(
                `El mensaje supera el límite permitido (${AI_MAX_INPUT_CHARS} caracteres).`,
                400
            );
        }

        // Generar cache key para respuestas frecuentes (incluye el historial:
        // ver generateCacheKey).
        //
        // COMPATIBILIDAD CON EL AGENTE PEDAGÓGICO:
        // La clave incorpora la VERSIÓN del estado de la integración (ver
        // generateCacheKey). Respuestas generadas con una combinación distinta
        // de AGENT_ENABLED/modo/proveedor/modelo viven en un espacio de nombres
        // distinto, de modo que un HIT nunca omite silenciosamente el contexto
        // pedagógico. Con el agente DESACTIVADO, el namespace es el HISTÓRICO
        // ('v0'), por lo que se siguen reutilizando las respuestas cacheadas
        // antes de esta corrección: no se invalida ni se cambia el TTL.
        const cacheKey = generateCacheKey(message, subject, mode, history);

        // Intentar obtener de caché
        const cachedResponse = await cacheService.getFromCache(cacheKey);
        if (cachedResponse) {
            console.log('✅ Respuesta obtenida de caché');
            // Asegurar que tenga la estructura correcta
            return {
                content: cachedResponse.content || cachedResponse.response || '',
                model: cachedResponse.model || modelName,
                usage: cachedResponse.usage || {
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: cachedResponse.totalTokens || 0
                },
                cost: cachedResponse.cost || {
                    inputCost: 0,
                    outputCost: 0,
                    totalCost: 0
                },
                duration: 0,
                fromCache: true,
                tokensSaved: cachedResponse.totalTokens || 0,
                // El plan del turno NO se persiste en caché. Se expone en null
                // (en vez de omitir la propiedad) para que el contrato del
                // resultado sea estable entre HIT y MISS. El controlador ya
                // tolera null (no registra evidencia).
                agentPlan: null
            };
        }

        // Preparar system prompt según modo y materia.
        //
        // CONTEXTO DEL TURNO (corrección del fallo «Cristóbal Colón»):
        //   - Si el cliente no envía materia (o envía una que no corresponde
        //     al mensaje), se infiere la materia del propio texto.
        //   - Se añade al MISMO system prompt una instrucción breve que fija
        //     qué se preguntó y qué se debe hacer en este turno.
        //   La inferencia es puramente léxica (intent.service): no añade una
        //     llamada al modelo, así que no cuesta latencia.
        const deteccion = intentService.detectarMateria(message, subject);
        const materiaEfectiva = deteccion.materia || subject;
        const intencion = intentService.detectarIntencion(message);

        const baseSystemPrompt = promptService.getSystemPrompt(mode, materiaEfectiva);

        // Agente tutor: si está habilitado (AGENT_ENABLED=true), se AÑADE el
        // contexto pedagógico del turno AL MISMO system prompt (no se crea un
        // segundo mensaje system, que rompería el formato del proveedor). Si el
        // agente está desactivado o falla, el contexto es '' y el prompt queda
        // idéntico al anterior (fallback seguro).
        const contextoPedagogico = tutorIntegration.construirContextoPedagogico({
            message, subject: materiaEfectiva, mode, history
        });

        // Instrucción de turno: qué se preguntó exactamente y cómo responderlo.
        const instruccionTurno = intentService.construirInstruccionDeTurno({
            mensaje: message,
            materia: materiaEfectiva,
            intencion,
            historial: history
        });
        const systemPrompt = [baseSystemPrompt, contextoPedagogico, instruccionTurno]
            .filter(Boolean)
            .join('\n\n');

        // Preparar historial de mensajes (limitar para optimizar costos)
        const messages = prepareMessages(history, message);

        // Llamar al proveedor de IA activo (misma interfaz para todos).
        // Los límites salen de la config central si está disponible, con
        // fallback a DEFAULT_CONFIG del proyecto.
        const startTime = Date.now();
        const completion = await provider.completion({
            system: systemPrompt,
            messages: messages,
            model: modelName,
            maxTokens: (aiConfig && aiConfig.maxOutputTokens) || DEFAULT_CONFIG.max_tokens,
            temperature: (aiConfig && typeof aiConfig.temperature === 'number')
                ? aiConfig.temperature
                : DEFAULT_CONFIG.temperature
        });

        const duration = Date.now() - startTime;

        console.log(`[AI] Respuesta recibida (${providerName})`, {
            model: modelName,
            duracion: `${duration}ms`
        });

        const inputTokens = completion.inputTokens || 0;
        const outputTokens = completion.outputTokens || 0;
        const contentText = completion.text || 'Sin respuesta';

        // Costo: 0 para proveedores gratuitos; tarifa real para Anthropic.
        // Los proveedores gratuitos no tienen tarifa en PRICING, así que
        // calculateCost devuelve 0 salvo que el modelo coincida.
        const cost = provider.paid
            ? calculateCost(modelName, inputTokens, outputTokens)
            : { inputCost: '0.000', outputCost: '0.000', totalCost: '0.000', currency: 'USD' };

        // Preparar resultado
        const result = {
            content: contentText,
            model: modelName,
            usage: {
                inputTokens: inputTokens,
                outputTokens: outputTokens,
                totalTokens: inputTokens + outputTokens
            },
            cost: cost,
            duration: duration,
            fromCache: false,
            // Plan pedagógico del turno (interno; NO forma parte del contrato
            // del frontend). Permite al controlador registrar evidencia si la
            // persistencia está habilitada. Puede ser null.
            agentPlan: contextoPedagogico ? tutorIntegration.planificarSeguro({ message, subject, mode, history }) : null
        };

        // Guardar en caché respuestas comunes
        await cacheService.saveToCache(cacheKey, result, subject);

        // Log para desarrollo
        console.log('✅ Respuesta generada:', {
            duration: `${duration}ms`,
            tokens: result.usage.totalTokens,
            cost: `$${cost.totalCost}`
        });

        return result;

    } catch (error) {
        // Si ya es un AppError (p. ej. proveedor sin configurar), propagarlo tal cual.
        if (error instanceof AppError) {
            throw error;
        }

        // Log tecnico completo para el operador (NO se envia al estudiante).
        // IMPORTANTE: nunca se registran cabeceras de autorizacion ni la API key,
        // solo el estado/ tipo/ mensaje que devuelve el proveedor.
        console.error(`[AI] ❌ Error al generar respuesta (${providerName}):`, {
            name: error.name,
            status: error.status,
            type: error.type,
            message: error.message,
            // Pista técnica del adaptador (variable/endpoint a revisar). No es
            // un secreto: nunca contiene claves ni cabeceras.
            ...(error.hint && { hint: error.hint })
        });

        // Mensaje apto para el estudiante + codigo HTTP correcto, clasificado por
        // tipo (credenciales, cuota, modelo, saturacion, timeout). Se marca si el
        // error es RECUPERABLE para que generateResponse pueda intentar el
        // proveedor secundario sin repetir llamadas si no procede.
        const appErr = toAppError(error, providerName);
        appErr.recoverable = isRecoverableError(error);
        // Propaga Retry-After (si el proveedor lo dio) para que el fallback
        // pueda esperar de forma acotada antes de reintentar.
        if (Number.isFinite(error.retryAfterSeconds)) {
            appErr.retryAfterSeconds = error.retryAfterSeconds;
        }
        throw appErr;
    }
}

/**
 * Preparar mensajes para el modelo
 * Limita el historial para optimizar costos
 */
function prepareMessages(history, newMessage) {
    const maxHistory = parseInt(process.env.MAX_CONVERSATION_HISTORY) || 5;

    // Tomar solo los últimos N mensajes del historial
    const limitedHistory = (history || []).slice(-maxHistory);

    // Convertir historial al formato de Claude, descartando mensajes sin contenido
    // (un content vacío o null hace que la API responda 400).
    let messages = limitedHistory
        .filter(msg => msg && typeof msg.content === 'string' && msg.content.trim() !== '')
        .map(msg => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        }));

    // La API de Anthropic exige que el PRIMER mensaje sea de role "user".
    // Al recortar el historial a los últimos N mensajes puede quedar un
    // "assistant" en primera posición (ocurre desde el 4º turno con N=5),
    // lo que devuelve 400 y el estudiante ve "la IA no responde".
    while (messages.length > 0 && messages[0].role !== 'user') {
        messages.shift();
    }

    // Agregar nuevo mensaje
    messages.push({
        role: 'user',
        content: newMessage
    });

    return messages;
}

/**
 * Generar clave de caché para una request
 */
function generateCacheKey(message, subject, mode, history = []) {
    // Validación defensiva
    if (!message || typeof message !== 'string') {
        console.warn('⚠️ generateCacheKey: message inválido', { message, subject, mode });
        return `ai:nocache:${Date.now()}`;
    }

    const normalizedMessage = message.toLowerCase().trim();

    // El historial DEBE formar parte de la clave. Sin él, preguntas de
    // seguimiento como "¿y cuál es su función?" o "¿puedes darme un ejemplo?"
    // colisionan entre conversaciones distintas y el caché devuelve la
    // respuesta de otro estudiante, rompiendo el hilo socrático.
    // Con historial vacío (1ª pregunta) la clave sigue siendo compartida,
    // así que se conserva el ahorro de costos en las preguntas frecuentes.
    const historySignature = (history || [])
        .map(m => `${m.role}:${String(m.content || '').slice(0, 200)}`)
        .join('||');

    // FIRMA DE COMPATIBILIDAD PEDAGÓGICA: cualquier estado que cambie
    // MATERIALMENTE la respuesta generada debe formar parte de la clave.
    //   - v0: agente desactivado -> MISMO namespace histórico (sin invalidar).
    //   - v1: agente activo     -> namespace nuevo, nunca colisiona con el
    //         anterior; un HIT sí llevó el contexto pedagógico al generarse.
    // El proveedor/modelo también se incluyen: cambiar de proveedor o modelo
    // produce respuestas distintas y no debe servirse la del anterior.
    // NO se incluye userId ni PII: basta con el contenido y la configuración.
    const agenteActivo = !!(aiConfig && aiConfig.agentEnabled === true);
    const estadoPedagogico = agenteActivo ? 'v1' : 'v0';
    const proveedor = aiProviders.getProviderName();
    const modelo = aiProviders.getProvider().model();

    const data = `${estadoPedagogico}|${proveedor}|${modelo}|${normalizedMessage}|${subject || 'general'}|${mode || 'direct'}|${historySignature}`;
    return `ai:${crypto.createHash('sha256').update(data).digest('hex')}`;
}

/**
 * Validar si un mensaje es educativo
 * Primera capa de filtrado antes de enviar a la IA
 */
function isEducationalContent(message) {
    // Igual que en moderation.service: frases de intención, no sustantivos.
    // 'juego' suelto bloqueaba "teoría de juegos" (Matemáticas) y
    // 'instagram'/'red social' bloqueaban análisis de medios (Sociales).
    const nonEducationalKeywords = [
        'videojuego', 'juego online',
        'cuéntame un chiste', 'cuentame un chiste',
        'hazme la tarea', 'resuélveme el examen'
    ];

    const lowerMessage = message.toLowerCase();

    // Verificar si contiene keywords prohibidas
    const hasProhibitedContent = nonEducationalKeywords.some(keyword =>
        lowerMessage.includes(keyword)
    );

    return !hasProhibitedContent;
}

/**
 * Generar pregunta de evaluación para ICFES
 */
async function generateICFESQuestion({ subject, topic, difficulty = 'medium', userId }) {
    const provider = aiProviders.getProvider();
    const modelName = provider.model();
    const providerName = aiProviders.getProviderName();

    try {
        if (!provider.configured()) {
            throw new AppError(`El proveedor de IA "${providerName}" no está configurado.`, 503);
        }

        const systemPrompt = promptService.getICFESPrompt(subject, topic, difficulty);

        const completion = await provider.completion({
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: 'Genera una pregunta estilo ICFES para el tema especificado.'
                }
            ],
            model: modelName,
            maxTokens: 1500,
            temperature: 0.8
        });

        return {
            question: completion.text,
            subject,
            topic,
            difficulty,
            model: modelName,
            usage: {
                inputTokens: completion.inputTokens,
                outputTokens: completion.outputTokens
            }
        };

    } catch (error) {
        // Si ya es un AppError operacional (p. ej. proveedor sin configurar),
        // se propaga tal cual, conservando su código HTTP y mensaje seguro.
        if (error instanceof AppError) throw error;

        // Log tecnico SEGURO: solo metadatos (name/status/type). NUNCA se
        // registra error.message del proveedor (podria contener contenido
        // crudo del upstream); el detalle utilizable se deriva via toAppError.
        console.error(`❌ Error al generar pregunta ICFES (${providerName}):`, {
            name: error && error.name,
            status: error && error.status,
            type: error && error.type
        });

        // Mensaje apto para el estudiante + código HTTP correcto, clasificado
        // por tipo (credenciales, cuota, modelo, saturacion, timeout), igual que
        // en generateResponse. No se filtra el texto crudo del proveedor.
        const appErr = toAppError(error, providerName);
        appErr.recoverable = isRecoverableError(error);
        if (Number.isFinite(error && error.retryAfterSeconds)) {
            appErr.retryAfterSeconds = error.retryAfterSeconds;
        }
        throw appErr;
    }
}

/**
 * GENERACIÓN CON STREAMING
 * ==================================================================
 * Reutiliza EXACTAMENTE la misma construcción de contexto que
 * generateResponse (materia inferida, instrucción de turno, agente tutor,
 * caché). La única diferencia es que el texto llega trozo a trozo.
 *
 * GARANTÍAS
 *  - `onDelta(texto)` recibe SOLO contenido visible: el razonamiento interno
 *    del modelo (`reasoning_content`) se descarta en el proveedor.
 *  - El texto concatenado es idéntico al que devolvería generateResponse.
 *  - El `usage` se conserva si el proveedor lo entrega.
 *  - Si el cliente cancela (signal abortado), se propaga una cancelación
 *    controlada para que el llamador NO registre el turno como completado.
 */
async function generateResponseStream({ message, subject, history = [], mode = 'socratic', userId, signal, onDelta }) {
    const empezar = Date.now();

    // La validación de longitud la aplica Joi en el controlador (máx. 2000).
    // Aquí solo se rechaza una entrada vacía para no enviar basura al modelo.
    if (!message || typeof message !== 'string' || message.trim() === '') {
        throw new AppError('El mensaje no puede estar vacío', 400);
    }

    const educativa = isEducationalContent(message);
    if (!educativa) {
        const e = new AppError('Solo puedo ayudar con contenido educativo. ¿Sobre qué tema quieres aprender?', 400);
        e.motivoModeracion = true;
        throw e;
    }

    const deteccion = intentService.detectarMateria(message, subject);
    const materiaEfectiva = deteccion.materia || subject;
    const intencion = intentService.detectarIntencion(message);

    const baseSystemPrompt = promptService.getSystemPrompt(mode, materiaEfectiva);
    const contextoPedagogico = tutorIntegration.construirContextoPedagogico({
        message, subject: materiaEfectiva, mode, history
    });
    const instruccionTurno = intentService.construirInstruccionDeTurno({
        mensaje: message, materia: materiaEfectiva, intencion, historial: history
    });
    const systemPrompt = [baseSystemPrompt, contextoPedagogico, instruccionTurno]
        .filter(Boolean)
        .join('\n\n');

    const messages = prepareMessages(history, message);

    const providerName = aiProviders.getProviderName();
    const provider = aiProviders.getProvider();

    if (!provider || typeof provider.completionStream !== 'function') {
        const e = new AppError(
            `El proveedor de IA (${providerName}) no admite streaming en esta configuración.`,
            501
        );
        e.streamingNoSoportado = true;
        throw e;
    }
    if (typeof provider.configured === 'function' && !provider.configured()) {
        const e = new AppError(
            `El proveedor de IA (${providerName}) no tiene credenciales configuradas.`,
            503
        );
        e.recoverable = false;
        throw e;
    }

    const modelName = typeof provider.model === 'function' ? provider.model() : DEFAULT_CONFIG.model;
    const maxTokens = (aiConfig && aiConfig.maxOutputTokens) || DEFAULT_CONFIG.max_tokens;
    const temperature = (aiConfig && typeof aiConfig.temperature === 'number')
        ? aiConfig.temperature
        : DEFAULT_CONFIG.temperature;

    let completion;
    try {
        completion = await provider.completionStream({
            system: systemPrompt,
            messages,
            model: modelName,
            maxTokens,
            temperature,
            signal,
            onDelta
        });
    } catch (error) {
        if (error && (error.cancelado || (signal && signal.aborted))) {
            const e = new Error('Generación cancelada por el cliente');
            e.cancelado = true;
            throw e;
        }
        // Diagnóstico: el mensaje original del proveedor se conserva en el log
        // (sin credenciales) para no perder la causa al mapear a AppError.
        console.error('[STREAM] fallo del proveedor', {
            proveedor: providerName,
            status: error && error.status,
            detalle: error && typeof error.message === 'string' ? error.message.slice(0, 160) : '',
            codigo: error && error.number
        });
        throw toAppError(error, providerName);
    }

    const duration = Date.now() - empezar;
    const inputTokens = completion.inputTokens || 0;
    const outputTokens = completion.outputTokens || 0;
    const totalTokens = completion.totalTokens || (inputTokens + outputTokens);
    const contenido = completion.text || '';

    // Mismo cálculo de coste que el flujo sin streaming (config/anthropic).
    const coste = calculateCost(providerName, inputTokens, outputTokens);
    const cost = coste || { inputCost: 0, outputCost: 0, totalCost: 0 };

    return {
        content: contenido,
        model: modelName,
        provider: providerName,
        usage: { inputTokens, outputTokens, totalTokens },
        cost,
        duration,
        fromCache: false,
        fallback: null,
        // El agente se calcula igual que en el flujo normal, para que la
        // analítica del panel docente registre el mismo turno.
        agentPlan: tutorIntegration.planInstrumentacion({ message, subject: materiaEfectiva, mode, history }),
        materiaEfectiva,
        intencion,
        opciones: { subject: materiaEfectiva, mode, history, userId, message }
    };
}

module.exports = {
    generateResponse,
    generateResponseStream,    generateICFESQuestion,
    isEducationalContent,
    prepareMessages,
    generateCacheKey,
    listProviders
};
