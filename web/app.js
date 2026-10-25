/**
 * PLATAFORMA EDUCATIVA DE IA
 * Módulo principal - Gestión de interfaz de usuario
 * Estilo tipo Gemini
 *
 * Este archivo gestiona la interacción del usuario con la interfaz,
 * preparado para integración futura con backend y API de IA.
 */

// ===================================
// ESTADO DE LA APLICACIÓN
// ===================================

const AppState = {
    selectedSubject: null,
    selectedTool: null,
    isMenuOpen: false,
    isToolsMenuOpen: false,
    messages: [],
    conversationStarted: false,
    isSending: false, // Prevenir envíos duplicados
    conversationId: null // ID de conversación actual
};

// ===================================
// ELEMENTOS DEL DOM
// ===================================

// Los elementos se capturarán después de que el DOM esté cargado
let elements = {};

// ===================================
// GESTIÓN DEL MENÚ DE OPCIONES
// ===================================

/**
 * Alterna la visibilidad del menú de opciones de materias
 */
function toggleOptionsMenu() {
    AppState.isMenuOpen = !AppState.isMenuOpen;

    // Cerrar menú de herramientas si está abierto
    if (AppState.isMenuOpen && AppState.isToolsMenuOpen) {
        closeToolsMenu();
    }

    if (AppState.isMenuOpen) {
        elements.optionsMenu.classList.remove('hidden');
    } else {
        elements.optionsMenu.classList.add('hidden');
    }
}

/**
 * Cierra el menú de opciones de materias
 */
function closeOptionsMenu() {
    AppState.isMenuOpen = false;
    elements.optionsMenu.classList.add('hidden');
}

// ===================================
// GESTIÓN DEL MENÚ DE HERRAMIENTAS
// ===================================

/**
 * Alterna la visibilidad del menú de herramientas
 */
function toggleToolsMenu() {
    AppState.isToolsMenuOpen = !AppState.isToolsMenuOpen;

    // Cerrar menú de opciones si está abierto
    if (AppState.isToolsMenuOpen && AppState.isMenuOpen) {
        closeOptionsMenu();
    }

    if (AppState.isToolsMenuOpen) {
        elements.toolsMenu.classList.remove('hidden');
    } else {
        elements.toolsMenu.classList.add('hidden');
    }
}

/**
 * Cierra el menú de herramientas
 */
function closeToolsMenu() {
    AppState.isToolsMenuOpen = false;
    elements.toolsMenu.classList.add('hidden');
}

// ===================================
// GESTIÓN DE SELECCIÓN DE MATERIAS
// ===================================

/**
 * Maneja la selección de una materia
 * @param {string} subject - Identificador de la materia seleccionada
 * @param {string} displayName - Nombre para mostrar de la materia
 */
function selectSubject(subject, displayName) {
    AppState.selectedSubject = {
        id: subject,
        name: displayName
    };

    // Actualizar indicador visual
    elements.indicatorText.textContent = `Modo: ${displayName}`;
    elements.subjectIndicator.classList.remove('hidden');
    updateModeIndicator();

    // Estado accesible de las tarjetas de materias: aria-pressed refleja la
    // selección real para lectores de pantalla (y activa el estilo de la
    // materia elegida). NO se oculta ninguna opción.
    document.querySelectorAll('.subject-item').forEach(item => {
        const btn = item.querySelector('.subject-button');
        if (!btn) return;
        const esActiva = item.dataset.subject === subject;
        btn.setAttribute('aria-pressed', esActiva ? 'true' : 'false');
    });

    // Cerrar menú
    closeOptionsMenu();

    // Enfocar el input para continuar escribiendo
    elements.messageInput.focus();

    // Log para desarrollo (preparado para envío a backend)
    console.log('Materia seleccionada:', AppState.selectedSubject);

    // En futuras fases: Aquí se enviará el contexto al backend
    // prepareContextForAI(subject);
}

/**
 * Reflejar en la interfaz el modo pedagógico activo. El método socrático es el
 * modo por defecto; ICFES/quiz sólo se activan con herramientas o la materia ICFES.
 */
function updateModeIndicator() {
    if (!elements.modeText) return;
    let texto = 'Método socrático activo';
    const toolId = AppState.selectedTool?.id;
    if (toolId === 'test-prep' || toolId === 'quizzes') {
        texto = 'Modo quiz activo';
    } else if (toolId === 'evaluation' || AppState.selectedSubject?.id === 'icfes') {
        texto = 'Modo ICFES activo';
    }
    elements.modeText.textContent = texto;
}

/**
 * Limpia la selección de materia actual
 */
function clearSubjectSelection() {
    AppState.selectedSubject = null;
    elements.subjectIndicator.classList.add('hidden');
    updateModeIndicator();

    console.log('Selección de materia limpiada');

    // En futuras fases: Resetear contexto de IA
    // resetAIContext();
}

// ===================================
// GESTIÓN DE HERRAMIENTAS
// ===================================

/**
 * Maneja la selección de una herramienta
 * @param {string} tool - Identificador de la herramienta seleccionada
 * @param {string} displayName - Nombre para mostrar de la herramienta
 */
async function selectTool(tool, displayName) {
    AppState.selectedTool = {
        id: tool,
        name: displayName
    };

    // Cerrar menú
    closeToolsMenu();

    // Log para desarrollo
    console.log('Herramienta seleccionada:', AppState.selectedTool);
    updateModeIndicator();

    // Iniciar conversación si no ha empezado
    startConversation();

    // Mostrar mensaje del sistema indicando activación
    const systemMessage = {
        id: Date.now(),
        text: `🛠️ **${displayName}** activado. ${getToolInstructions(tool)}`,
        type: 'system',
        timestamp: new Date().toISOString(),
        sender: 'system'
    };

    displayMessage(systemMessage);

    // Algunas herramientas requieren parámetros específicos
    if (['test-prep', 'quizzes', 'evaluation', 'mindmap', 'conceptmap', 'image-generator', 'video-generator'].includes(tool)) {
        // Pedir información adicional al usuario
        promptToolParameters(tool, displayName);
    }

    // Enfocar el input
    elements.messageInput.focus();
}

/**
 * Obtener instrucciones para cada herramienta
 */
function getToolInstructions(tool) {
    const instructions = {
        'test-prep': 'Escribe el tema para generar preguntas de práctica.',
        'quizzes': 'Escribe el tema para generar un quiz interactivo.',
        'evaluation': 'Escribe los temas para una evaluación estilo ICFES.',
        'mindmap': 'Escribe el tema para generar un mapa mental.',
        'conceptmap': 'Escribe el tema para generar un mapa conceptual.',
        'image-generator': 'Describe el concepto que quieres visualizar.',
        'video-generator': 'Escribe el tema para generar un guion de video educativo.'
    };
    return instructions[tool] || 'Herramienta lista para usar.';
}

/**
 * Solicitar parámetros específicos para herramientas
 */
function promptToolParameters(tool, displayName) {
    // Por ahora, simplemente actualizar el placeholder del input
    const placeholders = {
        'test-prep': 'Ej: "Ecuaciones cuadráticas"',
        'quizzes': 'Ej: "Ciclo del agua"',
        'evaluation': 'Ej: "Fotosíntesis, respiración celular"',
        'mindmap': 'Ej: "Sistema solar"',
        'conceptmap': 'Ej: "Reacciones químicas"',
        'image-generator': 'Ej: "Estructura del átomo"',
        'video-generator': 'Ej: "Leyes de Newton"'
    };

    elements.messageInput.placeholder = placeholders[tool] || 'Escribe tu pregunta...';
}

/**
 * Procesar herramienta seleccionada al enviar mensaje
 */
async function processToolRequest(toolId, message, subject) {
    if (!toolsClient) {
        throw new Error('Cliente de herramientas no disponible');
    }

    // Igual que en el chat: las herramientas de evaluación también deben
    // respetar la materia real. Sin selección explícita no se impone una.
    const subjectCode = subject || 'general';

    switch(toolId) {
        case 'test-prep':
            return await toolsClient.generateTestPrep(subjectCode, message, 10, 'intermedio');

        case 'quizzes':
            return await toolsClient.generateQuiz(subjectCode, message, 'mixed', 5);

        case 'evaluation':
            // Dividir temas por coma
            const topics = message.split(',').map(t => t.trim());
            return await toolsClient.generateEvaluation(subjectCode, topics, 15);

        case 'mindmap':
            return await toolsClient.generateMindMap(subjectCode, message, 3);

        case 'conceptmap':
            return await toolsClient.generateConceptMap(subjectCode, message);

        case 'image-generator':
            return await toolsClient.generateImagePrompt(subjectCode, message, 'illustration');

        case 'video-generator':
            return await toolsClient.generateVideoScript(subjectCode, message, 3, 'secundaria');

        default:
            return null;
    }
}

// ===================================
// GESTIÓN DE MENSAJES
// ===================================

/**
 * Inicia la conversación (oculta welcome screen)
 */
function startConversation() {
    if (!AppState.conversationStarted) {
        AppState.conversationStarted = true;
        elements.welcomeScreen.classList.add('hidden');
        elements.messagesArea.classList.remove('hidden');
    }
}

/**
 * Maneja el envío de mensajes a la IA
 */
async function handleSendMessage() {
    const messageText = elements.messageInput.value.trim();

    // Validar mensaje vacío
    if (!messageText) {
        return;
    }

    // Prevenir envíos duplicados
    if (AppState.isSending) {
        console.log('Ya hay un envío en progreso');
        return;
    }

    // Verificar autenticación
    if (!authManager.isAuthenticated()) {
        window.location.href = 'login.html';
        return;
    }

    // Marcar como enviando
    AppState.isSending = true;

    try {
        // Iniciar conversación si es el primer mensaje
        startConversation();

        // Crear objeto de mensaje del usuario
        const message = {
            id: Date.now(),
            text: messageText,
            subject: AppState.selectedSubject,
            tool: AppState.selectedTool,
            timestamp: new Date().toISOString(),
            sender: 'user'
        };

        // Agregar a estado
        AppState.messages.push(message);

        // Mostrar mensaje en interfaz
        displayMessage(message);

        // Limpiar input
        elements.messageInput.value = '';

        // Deshabilitar input y botón durante envío
        elements.messageInput.disabled = true;
        elements.micButton.disabled = true;
        // Estado visual del compositor mientras el tutor responde
        document.querySelector('.prompt-box')?.classList.add('is-sending');

        // Mostrar indicador de escritura
        showTypingIndicator();

        // Verificar si hay una herramienta seleccionada que requiere procesamiento especial
        const toolsWithSpecialProcessing = ['test-prep', 'quizzes', 'evaluation', 'mindmap', 'conceptmap', 'image-generator', 'video-generator'];

        let response;
        // `mode` se declara en el ámbito de la función: antes se declaraba dentro
        // del bloque `else` y el console.log posterior lanzaba
        // "ReferenceError: mode is not defined", que caía en el catch y pintaba
        // un mensaje de error falso DESPUÉS de una respuesta correcta de la IA.
        let mode = 'socratic';

        if (AppState.selectedTool && toolsWithSpecialProcessing.includes(AppState.selectedTool.id)) {
            // Procesar con herramienta específica.
            // Se respeta la materia elegida; si no hay, NO se impone una.
            const subject = AppState.selectedSubject?.id || null;
            response = await processToolRequest(AppState.selectedTool.id, messageText, subject);

            // Convertir respuesta de herramienta al formato estándar
            if (response && response.success) {
                response.response = formatToolResponse(AppState.selectedTool.id, response);
                response.conversationId = AppState.conversationId;
            }
        } else {
            // Enviar mensaje normal al backend.
            //
            // CORRECCIÓN DEL FALLO P0 «¿Quién fue Cristóbal Colón?»:
            // antes se enviaba `|| 'matematicas'`, de modo que CUALQUIER pregunta
            // sin materia elegida llegaba al modelo como si fuera de Matemáticas
            // y el tutor respondía con preguntas de operaciones básicas.
            //
            // Ahora, sin selección explícita, se envía `null`: el backend infiere
            // la materia del propio mensaje (intent.service) y el tutor responde
            // en la materia que el estudiante preguntó.
            const subject = AppState.selectedSubject?.id || null;

            // MODO SOCRÁTICO POR DEFECTO (obligatorio)
            // Las herramientas pueden cambiar el modo
            if (AppState.selectedTool?.id === 'test-prep' || AppState.selectedTool?.id === 'quizzes') {
                mode = 'quiz';
            } else if (AppState.selectedTool?.id === 'evaluation') {
                mode = 'icfes';
            } else if (subject === 'icfes') {
                mode = 'icfes';
            }

            // Se pasa AppState.conversationId para que el backend continúe la MISMA
            // conversación y la IA reciba el historial (contexto).
            //
            // STREAMING: se pide la respuesta en flujo.
            //  - El primer fragmento se pinta en cuanto llega (menos espera
            //    percibida) sin cambiar el modelo ni el contexto.
            //  - Si el servidor no admite streaming (501) o el flujo falla ANTES de
            //    recibir texto, se reintenta UNA vez por el endpoint clásico.
            //    Si ya había texto, NO se reintenta: evita respuestas duplicadas
            //    y eventos de aprendizaje dobles.
            const stream = empezarMensajeStreaming();
            let recibidos = 0;

            const resultado = await aiClient.streamMessage({
                message: messageText,
                subject,
                mode,
                conversationId: AppState.conversationId,
                onDelta: (trozo) => {
                    if (recibidos === 0) hideTypingIndicator();
                    recibidos += trozo.length;
                    stream.agregar(trozo);
                }
            });

            if (resultado.success) {
                stream.finalizar(resultado.text);
                AppState.conversationId = resultado.conversationId || AppState.conversationId;
                const aiMessage = {
                    id: Date.now(),
                    text: resultado.text,
                    subject: AppState.selectedSubject,
                    tool: AppState.selectedTool,
                    timestamp: new Date().toISOString(),
                    sender: 'assistant',
                    model: resultado.model,
                    usage: resultado.usage,
                    /* el mensaje ya está pintado por el streaming */
                    yaMostrado: true
                };
                AppState.messages.push(aiMessage);
                response = { success: true, response: resultado.text, conversationId: resultado.conversationId };
            } else if (recibidos === 0) {
                // Sin texto recibido: es seguro reintentar por el flujo clásico.
                stream.eliminar();
                response = await aiClient.sendMessage(messageText, subject, mode, AppState.conversationId);
            } else {
                // Se recibió texto parcial: se conserva lo mostrado.
                stream.finalizar(resultado.text || '');
                response = { success: false, message: resultado.message };
            }
        }

        // Ocultar indicador de escritura
        hideTypingIndicator();

        if (response && response.success) {
            // Guardar ID de conversación
            if (response.conversationId) {
                AppState.conversationId = response.conversationId;
            }

            // Mostrar respuesta de Claude
            const aiMessage = {
                id: Date.now(),
                text: response.response,
                subject: AppState.selectedSubject,
                tool: AppState.selectedTool,
                timestamp: new Date().toISOString(),
                sender: 'assistant',
                model: response.model,
                usage: response.usage,
                cost: response.cost
            };

            AppState.messages.push(aiMessage);
            // Si el texto ya se pintó durante el streaming, NO se vuelve a
            // insertar: duplicaría el mensaje en la conversación.
            if (!aiMessage.yaMostrado) {
                displayMessage(aiMessage);
            }

            // Log para desarrollo (defensivo: las herramientas no devuelven usage/cost)
            console.log('✅ Respuesta de Claude:', {
                conversationId: AppState.conversationId,
                model: response.model,
                tokens: response.usage?.totalTokens,
                cost: response.cost?.totalCost,
                mode: mode
            });
        } else {
            // Mostrar error amigable
            const errorMessage = {
                id: Date.now(),
                text: getErrorMessage(response.message || `HTTP ${response.status || 'desconocido'}`),
                sender: 'system',
                timestamp: new Date().toISOString()
            };
            displayMessage(errorMessage);
            console.error('❌ Error en respuesta:', response.status, response.message);

            // Sesión caída: volver al login tras avisar al estudiante
            if (response.status === 401) {
                setTimeout(() => { window.location.href = 'login.html'; }, 2500);
            }
        }
    } catch (error) {
        // Ocultar indicador si hay error
        hideTypingIndicator();

        // Mostrar error amigable
        const errorMessage = {
            id: Date.now(),
            text: getErrorMessage(error.message),
            sender: 'system',
            timestamp: new Date().toISOString()
        };
        displayMessage(errorMessage);
        console.error('❌ Error al enviar mensaje:', error);
    } finally {
        // Rehabilitar input y botón
        elements.messageInput.disabled = false;
        elements.micButton.disabled = false;
        document.querySelector('.prompt-box')?.classList.remove('is-sending');
        autoAjustarEntrada();
        elements.messageInput.focus();

        // Marcar como no enviando
        AppState.isSending = false;
    }
}

/**
 * Formatear respuesta de herramienta para visualización
 */
function formatToolResponse(toolId, response) {
    const toolNames = {
        'test-prep': '📝 Test de Preparación',
        'quizzes': '❓ Quiz Interactivo',
        'evaluation': '📋 Evaluación ICFES',
        'mindmap': '🧠 Mapa Mental',
        'conceptmap': '🗺️ Mapa Conceptual',
        'image-generator': '🖼️ Generador de Imagen',
        'video-generator': '🎬 Guion de Video'
    };

    let formatted = `## ${toolNames[toolId] || 'Resultado'}\n\n`;

    // Agregar el contenido principal
    if (response.questions) {
        formatted += response.questions;
    } else if (response.quiz) {
        formatted += response.quiz;
    } else if (response.evaluation) {
        formatted += response.evaluation;
    } else if (response.mindmap) {
        formatted += response.mindmap;
    } else if (response.conceptmap) {
        formatted += response.conceptmap;
    } else if (response.imagePrompt) {
        formatted += response.imagePrompt;
    } else if (response.videoScript) {
        formatted += response.videoScript;
    }

    // Agregar nota si existe
    if (response.note) {
        formatted += `\n\n---\n\n*${response.note}*`;
    }

    return formatted;
}

/**
 * Obtener mensaje de error amigable
 */
function getErrorMessage(technicalError) {
    if (!technicalError) {
        return '⚠️ Ocurrió un error inesperado. Por favor intenta de nuevo.';
    }

    const errorLower = technicalError.toLowerCase();

    if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
        return '⏱️ La respuesta está tardando más de lo esperado. Por favor intenta con una pregunta más simple.';
    }

    if (errorLower.includes('network') || errorLower.includes('fetch')) {
        return '📡 Error de conexión. Verifica tu internet e intenta de nuevo.';
    }

    if (errorLower.includes('401') || errorLower.includes('unauthorized')) {
        return '🔒 Tu sesión ha expirado. Por favor inicia sesión de nuevo.';
    }

    if (errorLower.includes('429') || errorLower.includes('rate limit')) {
        return '⏳ Has alcanzado el límite de consultas. Por favor espera un momento e intenta de nuevo.';
    }

    if (errorLower.includes('500') || errorLower.includes('internal')) {
        return '🔧 Error del servidor. Nuestro equipo está trabajando en solucionarlo.';
    }

    return `⚠️ ${technicalError}`;
}

/**
 * Muestra un mensaje en la interfaz con formato Markdown
 * @param {Object} message - Objeto con los datos del mensaje
 */
function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function displayMessage(message) {
    const messageElement = document.createElement('div');
    const esAsistente = message.sender === 'assistant';
    messageElement.className = `message ${message.sender}`;

    // El mensaje del estudiante es texto plano; el del tutor es Markdown.
    // En AMBOS casos el render escapa el HTML antes de interpretar nada:
    // `Markdown.safeRender` escapa primero y solo genera elementos de una
    // lista blanca (h1-h4, p, ul, ol, li, strong, em, code, pre, table...).
    // Un <img src=x onerror=...> o un enlace javascript: quedan inertes.
    //
    // Antes esta función aplicaba <br> a cada salto ANTES de procesar listas,
    // lo que deformaba el Markdown real del modelo (listas sin viñeta,
    // tablas falsas generadas por cualquier línea con barras).
    if (typeof Markdown !== 'undefined' && Markdown.safeRender) {
        messageElement.innerHTML = esAsistente
            ? Markdown.safeRender(message.text)
            : Markdown.plainRender(message.text);
    } else {
        // Fallback defensivo si markdown.js no cargó: texto plano escapado.
        messageElement.textContent = String(message.text ?? '');
    }

    elements.messagesContainer.appendChild(messageElement);

    // Scroll automático al último mensaje
    elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
}

/**
 * Crea el mensaje del tutor en el DOM y devuelve una función para ir
 * actualizándolo con los fragmentos del streaming.
 *
 * SEGURIDAD: cada actualización pasa por Markdown.safeRender, que ESCAPA el
 * HTML y solo genera etiquetas de lista blanca. Nunca se inserta texto crudo
 * del modelo.
 *
 * MARKDOWN PARCIAL: durante la escritura una lista o un bloque de código
 * pueden estar abiertos a medias. safeRender ya tolera ese caso (un ``` sin
 * cerrar se muestra como texto, y al llegar el cierre pasa a bloque); el
 * resultado no se rompe, solo mejora al completarse.
 *
 * RENDIMIENTO: se repinta como máximo cada 60 ms (rAF + umbral), no en cada
 * fragmento: con 60-80 deltas por respuesta, repintar cada uno produce jank.
 */
function empezarMensajeStreaming() {
    const el = document.createElement('div');
    el.className = 'message assistant streaming';
    el.setAttribute('aria-live', 'polite');
    elements.messagesContainer.appendChild(el);

    let pendiente = '';
    let ultimoPin = 0;
    let acumulado = '';

    function pintar() {
        ultimoPin = Date.now();
        el.innerHTML = Markdown.safeRender(acumulado);
        el.classList.add('is-streaming');
        elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
    }

    return {
        agregar(trozo) {
            acumulado += trozo;
            pendiente += trozo;
            const ahora = Date.now();
            if (ahora - ultimoPin >= 60) {
                pendiente = '';
                pintar();
            } else if (!el._raf) {
                el._raf = true;
                requestAnimationFrame(() => { el._raf = false; pintar(); });
            }
        },
        finalizar(textoFinal) {
            acumulado = typeof textoFinal === 'string' ? textoFinal : acumulado;
            el.classList.remove('is-streaming');
            el.innerHTML = Markdown.safeRender(acumulado);
            elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
            return el;
        },
        eliminar() {
            if (el.parentNode) el.parentNode.removeChild(el);
        },
        elemento: el
    };
}

/**
 * Copiar código de las respuestas del tutor.
 * Delegación en el contenedor: un solo listener sirve para todos los bloques,
 * incluidos los que se añadan después.
 */
function manejarCopiaCodigo(event) {
    const boton = event.target.closest('[data-copy]');
    if (!boton) return;

    const envoltorio = boton.closest('.md-code-wrap');
    const codigo = envoltorio && envoltorio.querySelector('code');
    if (!codigo) return;

    const texto = codigo.textContent;
    const confirmar = () => {
        const original = boton.textContent;
        boton.textContent = 'Copiado';
        boton.classList.add('copiado');
        setTimeout(() => {
            boton.textContent = original;
            boton.classList.remove('copiado');
        }, 1600);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(confirmar).catch(() => { });
    } else {
        // Fallback para contextos sin Clipboard API (http no seguro)
        const area = document.createElement('textarea');
        area.value = texto;
        area.setAttribute('readonly', '');
        area.style.position = 'absolute';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy'); confirmar(); } catch (_) { /* sin permiso */ }
        document.body.removeChild(area);
    }
}

/**
 * Muestra indicador de que la IA está escribiendo
 */
function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing';
    typingDiv.id = 'typingIndicator';
    typingDiv.setAttribute('role', 'status');
    typingDiv.setAttribute('aria-live', 'polite');
    typingDiv.innerHTML = '<span class="typing-label">El tutor está pensando</span>' +
        '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>';
    elements.messagesContainer.appendChild(typingDiv);
    elements.messagesArea.scrollTop = elements.messagesArea.scrollHeight;
}

/**
 * Oculta indicador de escritura
 */
function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

/**
 * Simulación de respuesta de IA (para pruebas)
 * Esta función será reemplazada por la integración real en futuras fases
 */
function simulateAIResponse(userMessage) {
    let responseText = '';

    if (AppState.selectedSubject) {
        responseText = `Esta es una simulación de respuesta en el contexto de ${AppState.selectedSubject.name}. `;
    }

    if (AppState.selectedTool) {
        responseText += `Usando la herramienta: ${AppState.selectedTool.name}. `;
    }

    responseText += 'En la próxima fase, aquí aparecerá la respuesta real de la IA con método socrático.';

    const aiMessage = {
        id: Date.now(),
        text: responseText,
        subject: AppState.selectedSubject,
        tool: AppState.selectedTool,
        timestamp: new Date().toISOString(),
        sender: 'assistant',
        inReplyTo: userMessage.id
    };

    AppState.messages.push(aiMessage);
    displayMessage(aiMessage);
}

// ===================================
// MANEJO DE EVENTOS DEL TECLADO
// ===================================

/**
 * Maneja el evento de tecla presionada en el input
 */
function handleKeyPress(event) {
    // Enter envía; Shift+Enter inserta una nueva línea.
    // `keydown` (no `keypress`) es el evento fiable para Enter dentro de un
    // <textarea>: `keypress` no se dispara en todos los IME/navegadores tras
    // Shift+Enter, y el campo quedaba sin poder enviar.
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
    }
}

/**
 * Ajusta la altura del campo de escritura al contenido (1–5 líneas),
 * sin ocultar nunca el texto.
 */
function autoAjustarEntrada() {
    const el = elements.messageInput;
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    const max = 5 * 24 + 24; // ~5 líneas + padding
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
}

// ===================================
// MANEJO DE CHIPS DE SUGERENCIAS
// ===================================

/**
 * Maneja el clic en un chip de sugerencia
 */
function handleChipClick(chip) {
    const action = chip.dataset.action;
    const subject = chip.dataset.subject;

    if (action === 'subject' && subject) {
        const subjectName = chip.textContent.trim();
        selectSubject(subject, subjectName);
    } else if (action === 'icfes') {
        selectSubject('icfes', 'ICFES');
    } else if (action === 'help') {
        elements.messageInput.value = '¿Cómo puedes ayudarme a aprender?';
        elements.messageInput.focus();
    }
}

// ===================================
// CERRAR MENÚS AL HACER CLIC FUERA
// ===================================

/**
 * Cierra los menús si se hace clic fuera de ellos
 */
function handleClickOutside(event) {
    // Cerrar menú de opciones
    if (AppState.isMenuOpen &&
        !elements.optionsMenu.contains(event.target) &&
        !elements.optionsButton.contains(event.target)) {
        closeOptionsMenu();
    }

    // Cerrar menú de herramientas
    if (AppState.isToolsMenuOpen &&
        !elements.toolsMenu.contains(event.target) &&
        !elements.toolsButton.contains(event.target)) {
        closeToolsMenu();
    }
}

// ===================================
// INICIALIZACIÓN
// ===================================

/**
 * Inicializa todos los event listeners
 */
function initializeEventListeners() {
    // Botón de opciones
    elements.optionsButton.addEventListener('click', toggleOptionsMenu);

    // Botón de herramientas
    elements.toolsButton.addEventListener('click', toggleToolsMenu);

    // Botón de envío (flecha)
    elements.micButton.addEventListener('click', () => {
        handleSendMessage();
    });

    // Input de mensaje
    elements.messageInput.addEventListener('keydown', handleKeyPress);
    elements.messageInput.addEventListener('input', autoAjustarEntrada);
    elements.messagesContainer.addEventListener('click', manejarCopiaCodigo);

    // Botón de limpiar materia
    elements.clearSubject.addEventListener('click', clearSubjectSelection);

    // Botones de materias
    elements.subjectButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const subjectItem = event.target.closest('.subject-item');
            const subjectId = subjectItem.dataset.subject;
            // El botón contiene emoji + nombre: se toma solo el texto del nombre
            // para no mostrar el emoji en el indicador de modo.
            const nombreVisible = button.querySelector('.subject-name');
            const subjectName = (nombreVisible ? nombreVisible.textContent : button.textContent).trim();

            selectSubject(subjectId, subjectName);
        });
    });

    // Botones de herramientas
    elements.toolButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const toolItem = event.target.closest('.tool-item');
            const toolId = toolItem.dataset.tool;
            const toolName = button.querySelector('.tool-name').textContent.trim();

            selectTool(toolId, toolName);
        });
    });

    // Chips de sugerencias
    elements.chips.forEach(chip => {
        chip.addEventListener('click', () => handleChipClick(chip));
    });

    // Barra superior
    if (elements.newConversationButton) {
        elements.newConversationButton.addEventListener('click', startNewConversation);
    }
    if (elements.historyButton) {
        elements.historyButton.addEventListener('click', toggleHistoryPanel);
    }
    if (elements.statsButton) {
        elements.statsButton.addEventListener('click', toggleStatsPanel);
    }
    if (elements.logoutButton) {
        elements.logoutButton.addEventListener('click', handleLogout);
    }
    if (elements.historyClose) {
        elements.historyClose.addEventListener('click', () => closeSidePanels());
    }
    if (elements.statsClose) {
        elements.statsClose.addEventListener('click', () => closeSidePanels());
    }

    // Cerrar menús al hacer clic fuera
    document.addEventListener('click', handleClickOutside);
}

/**
 * Capturar elementos del DOM
 */
function captureElements() {
    elements = {
        // Acciones existentes
        optionsButton: document.getElementById('optionsButton'),
        optionsMenu: document.getElementById('optionsMenu'),
        toolsButton: document.getElementById('toolsButton'),
        toolsMenu: document.getElementById('toolsMenu'),
        messageInput: document.getElementById('messageInput'),
        micButton: document.getElementById('micButton'),
        messagesContainer: document.getElementById('messagesContainer'),
        messagesArea: document.getElementById('messagesArea'),
        welcomeScreen: document.getElementById('welcomeScreen'),
        subjectIndicator: document.getElementById('subjectIndicator'),
        indicatorText: document.getElementById('indicatorText'),
        clearSubject: document.getElementById('clearSubject'),
        subjectButtons: document.querySelectorAll('.subject-button'),
        toolButtons: document.querySelectorAll('.tool-button'),
        chips: document.querySelectorAll('.chip'),

        // Barra superior y paneles laterales
        newConversationButton: document.getElementById('newConversationButton'),
        historyButton: document.getElementById('historyButton'),
        statsButton: document.getElementById('statsButton'),
        logoutButton: document.getElementById('logoutButton'),
        historyPanel: document.getElementById('historyPanel'),
        historyList: document.getElementById('historyList'),
        historyClose: document.getElementById('historyClose'),
        statsPanel: document.getElementById('statsPanel'),
        statsList: document.getElementById('statsList'),
        statsClose: document.getElementById('statsClose'),
        userName: document.getElementById('userName'),
        userAvatar: document.getElementById('userAvatar'),
        modeText: document.getElementById('modeText')
    };

    // Verificar que todos los elementos críticos existen
    const criticalElements = ['optionsButton', 'toolsButton', 'messageInput', 'micButton', 'messagesContainer', 'welcomeScreen'];
    const missing = criticalElements.filter(key => !elements[key]);

    if (missing.length > 0) {
        console.error('❌ Elementos críticos no encontrados:', missing);
        throw new Error(`Elementos del DOM no encontrados: ${missing.join(', ')}`);
    }

    console.log('✓ Elementos del DOM capturados correctamente');
}

/**
 * Función principal de inicialización
 */
function initialize() {
    console.log('Plataforma Educativa IA - Inicializando...');
    console.log('Backend API:', API_CONFIG.BASE_URL);

    // Capturar elementos del DOM primero
    captureElements();

    // Verificar autenticación
    if (!authManager.isAuthenticated()) {
        console.log('Usuario no autenticado, redirigiendo a login...');
        window.location.href = 'login.html';
        return;
    }


    // getUser() puede ser null si el token existe pero se perdió el objeto user
    console.log('Usuario autenticado:', authManager.getUser()?.email || '(sin perfil en localStorage)');

    initializeEventListeners();
    renderUserBadge();

    // Enfocar el input al cargar
    elements.messageInput.focus();

    console.log('✓ Interfaz lista');
    console.log('Estado inicial:', AppState);
}

/**
 * Mostrar nombre/avatar del usuario en la barra superior.
 * Si el objeto user no está en localStorage, se pide el perfil al backend.
 */
async function renderUserBadge() {
    let user = authManager.getUser();
    if (!user && elements.userName) {
        // Token presente pero sin perfil: reconstruirlo desde /api/auth/me
        const profile = await authManager.getProfile();
        if (profile) {
            user = profile;
            authManager.user = profile;
            localStorage.setItem('user', JSON.stringify(profile));
        }
    }
    const label = user?.fullName || user?.username || user?.email || 'Estudiante';
    if (elements.userName) elements.userName.textContent = label;
    if (elements.userAvatar) elements.userAvatar.textContent = (label.trim()[0] || '?').toUpperCase();
}

// ===================================
// CONVERSACIONES NUEVAS Y HISTORIAL
// ===================================

/**
 * Empezar una conversación nueva: vacía el chat, resetea el conversationId
 * y limpia los mensajes en memoria. La materia y el modo se conservan.
 */
function startNewConversation() {
    AppState.messages = [];
    AppState.conversationId = null;
    AppState.conversationStarted = false;

    if (elements.messagesContainer) elements.messagesContainer.innerHTML = '';
    if (elements.messagesArea) elements.messagesArea.classList.add('hidden');
    if (elements.welcomeScreen) elements.welcomeScreen.classList.remove('hidden');
    closeSidePanels();
    closeOptionsMenu();
    closeToolsMenu();

    elements.messageInput.focus();
    console.log('[CHAT] Nueva conversación iniciada; conversationId reseteado');
}

/** Cerrar los paneles laterales */
function closeSidePanels() {
    elements.historyPanel?.classList.add('hidden');
    elements.statsPanel?.classList.add('hidden');
}

/** Abrir/cerrar el panel de historial y cargar las conversaciones */
async function toggleHistoryPanel() {
    const estabaAbierto = !elements.historyPanel.classList.contains('hidden');
    closeSidePanels();
    if (estabaAbierto) return;

    elements.historyPanel.classList.remove('hidden');
    elements.historyList.innerHTML = '<p class="side-panel-empty">Cargando...</p>';

    const conversaciones = await aiClient.getConversations();

    if (!conversaciones || conversaciones.length === 0) {
        elements.historyList.innerHTML = '<p class="side-panel-empty">Aún no tienes conversaciones guardadas.</p>';
        return;
    }

    elements.historyList.innerHTML = '';
    conversaciones.forEach(conv => {
        const item = document.createElement('button');
        item.className = 'history-item';
        item.innerHTML = `
            <span class="history-emoji">${escapeHtml(conv.emoji || '💬')}</span>
            <span class="history-main">
                <span class="history-title">${escapeHtml(conv.title || 'Conversación')}</span>
                <span class="history-meta">${escapeHtml(conv.subject_name || 'General')} · ${conv.message_count || 0} mensajes</span>
            </span>`;
        item.addEventListener('click', () => loadConversation(conv.id, conv.title));
        elements.historyList.appendChild(item);
    });
}

/**
 * Cargar una conversación existente en el chat: trae el historial de mensajes
 * y continúa desde ahí (mismo conversationId).
 */
async function loadConversation(conversationId, title) {
    closeSidePanels();
    showTypingIndicator();

    const data = await aiClient.getHistory(conversationId);
    hideTypingIndicator();

    if (!data || !data.messages) {
        displayMessage({ id: Date.now(), text: '⚠️ No se pudo cargar la conversación.', sender: 'system' });
        return;
    }

    AppState.conversationId = conversationId;
    AppState.messages = [];
    AppState.conversationStarted = true;
    elements.messagesContainer.innerHTML = '';
    elements.welcomeScreen.classList.add('hidden');
    elements.messagesArea.classList.remove('hidden');

    data.messages.forEach(m => {
        const msg = {
            id: m.id || Date.now(),
            text: m.content,
            sender: m.role === 'assistant' ? 'assistant' : 'user',
            timestamp: m.created_at
        };
        AppState.messages.push(msg);
        displayMessage(msg);
    });

    console.log(`[CHAT] Conversación cargada (${title || conversationId}): ${data.messages.length} mensajes`);
}

// ===================================
// PROGRESO Y RANKING
// ===================================

/** Abrir/cerrar el panel de progreso y cargar estadísticas + ranking */
async function toggleStatsPanel() {
    const estabaAbierto = !elements.statsPanel.classList.contains('hidden');
    closeSidePanels();
    if (estabaAbierto) return;

    elements.statsPanel.classList.remove('hidden');
    elements.statsList.innerHTML = '<p class="side-panel-empty">Cargando...</p>';

    const [stats, ranking] = await Promise.all([
        aiClient.getStats(),
        aiClient.getRanking(5)
    ]);

    let html = '';

    if (stats && stats.stats) {
        const s = stats.stats;
        html += `<div class="stats-grid">
            <div class="stat-card"><span class="stat-value">${s.total_conversations ?? 0}</span><span class="stat-label">Conversaciones</span></div>
            <div class="stat-card"><span class="stat-value">${s.total_messages ?? 0}</span><span class="stat-label">Mensajes</span></div>
            <div class="stat-card"><span class="stat-value">${s.total_tokens_used ?? 0}</span><span class="stat-label">Tokens usados</span></div>
        </div>`;
    } else {
        html += '<p class="side-panel-empty">No hay estadísticas todavía. ¡Haz tu primera pregunta!</p>';
    }

    if (stats && Array.isArray(stats.topSubjects) && stats.topSubjects.length > 0) {
        html += '<h4 class="side-panel-subtitle">Materias más usadas</h4><ul class="stats-list">';
        stats.topSubjects.forEach(s => {
            html += `<li><span>${escapeHtml(s.emoji || '•')} ${escapeHtml(s.name || s.code)}</span><b>${s.conversation_count ?? 0}</b></li>`;
        });
        html += '</ul>';
    }

    if (ranking && Array.isArray(ranking.ranking)) {
        html += '<h4 class="side-panel-subtitle">🏆 Ranking</h4>';
        if (ranking.ranking.length === 0) {
            html += '<p class="side-panel-empty">El ranking está vacío todavía.</p>';
        } else {
            html += '<ul class="stats-list">';
            ranking.ranking.forEach((r, i) => {
                const nombre = r.username || r.full_name || 'Estudiante';
                html += `<li><span>${i + 1}. ${escapeHtml(nombre)}</span><b>${r.total_messages ?? r.score ?? 0}</b></li>`;
            });
            html += '</ul>';
        }
    }

    elements.statsList.innerHTML = html;
}

// ===================================
// CERRAR SESIÓN
// ===================================

/** Cerrar sesión y volver al login */
async function handleLogout() {
    await authManager.logout();
    window.location.href = 'login.html';
}

// ===================================
// PREPARACIÓN PARA FUTURAS FASES
// ===================================

/**
 * Funciones placeholder para integración futura con backend
 * Estas funciones se implementarán en las siguientes fases
 */

// function prepareContextForAI(subject) {
//     // Preparar y enviar contexto de materia seleccionada al backend
//     console.log('TODO: Enviar contexto al backend', subject);
// }

// function resetAIContext() {
//     // Resetear contexto de IA en el backend
//     console.log('TODO: Resetear contexto en backend');
// }

// function activateToolInBackend(tool) {
//     // Activar herramienta en el backend
//     console.log('TODO: Activar herramienta en backend', tool);
// }

// function sendMessageToAI(message) {
//     // Enviar mensaje al backend para procesamiento con IA
//     console.log('TODO: Enviar mensaje al backend', message);
//
//     // Ejemplo de estructura de request:
//     // fetch('/api/chat', {
//     //     method: 'POST',
//     //     headers: { 'Content-Type': 'application/json' },
//     //     body: JSON.stringify({
//     //         message: message.text,
//     //         subject: message.subject,
//     //         tool: message.tool,
//     //         history: AppState.messages
//     //     })
//     // });
// }

// function loadChatHistory() {
//     // Cargar historial de conversación desde backend
//     console.log('TODO: Cargar historial desde backend');
// }

// function saveUserPreferences() {
//     // Guardar preferencias del usuario
//     console.log('TODO: Guardar preferencias del usuario');
// }

// ===================================
// EXPORTACIÓN (Para uso modular futuro)
// ===================================

// Si se migra a módulos ES6 en el futuro:
// export { AppState, selectSubject, clearSubjectSelection, handleSendMessage, selectTool };

// ===================================
// INICIO DE LA APLICACIÓN
// ===================================

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
