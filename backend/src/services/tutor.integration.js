/**
 * Integración del Agente Tutor en el flujo de generación de IA
 * ------------------------------------------------------------------
 * Conecta `tutor.agent.js` (núcleo pedagógico) con `ai.service.js` SIN acoplar
 * el servicio de IA a la lógica pedagógica ni a la base de datos.
 *
 * Responsabilidades (y límites):
 *  - Calcular el "plan" del turno (diagnosticar/ensenar/practicar/evaluar/...).
 *  - Construir un BLOQUE DE CONTEXTO PEDAGÓGICO que se AÑADE al system prompt
 *    existente (nunca crea un segundo mensaje `system`).
 *  - Persistir evidencias/dificultades SOLO si la persistencia está habilitada
 *    (AGENT_PERSISTENCE_ENABLED=true) y de forma tolerante a fallos.
 *
 * GARANTÍAS:
 *  - Si el agente falla en cualquier punto, se devuelve un contexto vacío y el
 *    chat continúa con el comportamiento previo (fallback seguro).
 *  - NUNCA lanza hacia arriba.
 *  - No registra texto de la conversación ni datos personales; solo metadatos
 *    técnicos (acción, competencia, proveedor/modelo).
 *  - NO afirma progreso persistente si la persistencia está desactivada.
 */

'use strict';

let tutorAgent = null;
try { tutorAgent = require('./tutor.agent'); } catch (_) { tutorAgent = null; }

let aiConfig = null;
try { aiConfig = require('../config/ai.config'); } catch (_) { aiConfig = null; }

/**
 * ¿Está habilitado el agente (enriquecimiento pedagógico del prompt)?
 * Default false -> comportamiento idéntico al anterior.
 */
function agenteHabilitado() {
    return !!(aiConfig && aiConfig.agentEnabled === true);
}

/**
 * ¿Está habilitada la persistencia en RDS? Default false: la migración de
 * agent_evidence/agent_difficulties NO está verificada en producción.
 */
function persistenciaHabilitada() {
    return !!(aiConfig && aiConfig.agentPersistenceEnabled === true);
}

/**
 * Construye el plan pedagógico del turno de forma SEGURA.
 * @returns {object|null} plan, o null si el agente no está disponible/activo.
 */
function planificarSeguro({ message, subject, mode, history }) {
    if (!agenteHabilitado() || !tutorAgent) return null;
    try {
        return tutorAgent.planificarTurno({
            mensaje: message,
            subject,
            mode,
            historial: Array.isArray(history) ? history : []
        });
    } catch (error) {
        // Fallback seguro: se registra SOLO metadatos técnicos (sin el mensaje).
        console.error('[AGENTE] No se pudo planificar el turno:', { name: error && error.name });
        return null;
    }
}

/**
 * Plan del turno para INSTRUMENTACIÓN (analítica del panel docente).
 *
 * Diferencia clave con planificarSeguro(): NO exige AGENT_ENABLED.
 * El enriquecimiento del prompt sigue controlado por esa bandera (el
 * estudiante recibe exactamente el mismo texto que antes); aquí solo se
 * calcula la clasificación pedagógica del turno para poder registrar un
 * evento de aprendizaje verificable.
 *
 * @returns {object|null} plan, o null si el núcleo pedagógico no está disponible.
 */
function planInstrumentacion({ message, subject, mode, history }) {
    if (!tutorAgent) return null;
    try {
        return tutorAgent.planificarTurno({
            mensaje: message,
            subject,
            mode,
            historial: Array.isArray(history) ? history : []
        });
    } catch (error) {
        console.error('[AGENTE] No se pudo planificar para instrumentación:', { name: error && error.name });
        return null;
    }
}

/**
 * Devuelve el texto de contexto pedagógico para AÑADIR al system prompt.
 * Vacío si el agente está desactivado o falla.
 */
function construirContextoPedagogico({ message, subject, mode, history }) {
    const plan = planificarSeguro({ message, subject, mode, history });
    if (!plan) return '';
    try {
        const lineas = [
            'CONTEXTO PEDAGOGICO DEL TURNO (aplicar, no mencionar):',
            `- Accion esperada: ${plan.action}`,
            plan.guidance ? `- Guia: ${plan.guidance}` : null,
            plan.competence ? `- Competencia: ${plan.competence}` : null
        ].filter(Boolean);
        return lineas.join('\n');
    } catch (error) {
        console.error('[AGENTE] No se pudo construir el contexto:', { name: error && error.name });
        return '';
    }
}

/**
 * Registra evidencia/dificultad SOLO si la persistencia está habilitada.
 * Tolerante a fallos y sin lanzar. Devuelve un resumen booleano para pruebas.
 * NUNCA incluye el texto de la conversación.
 *
 * @param {Function} query - función de acceso a BD (inyectada, no importada aquí).
 */
async function registrarTurno(query, { plan, conversationId, userId, subject, mode, provider, model, fallbackFrom }) {
    if (!persistenciaHabilitada() || !tutorAgent || !plan || typeof query !== 'function') {
        return { persisted: false, reason: 'deshabilitado_o_sin_plan' };
    }
    try {
        const sessionRef = tutorAgent.sessionRef(userId, conversationId);
        const ok = await tutorAgent.registrarEvidencia(query, {
            conversationId,
            userId,
            sessionRef,
            subjectCode: subject,
            competence: plan.competence,
            mode,
            action: plan.action,
            evidence: null,          // sin texto libre de la conversación
            outcome: plan.shouldEvaluate ? 'not_evaluated' : 'neutral',
            measuredImprovement: false,
            nextStep: null,
            status: 'recorded',
            provider,
            model,
            fallbackFrom
        });
        return { persisted: !!ok, reason: ok ? 'registrado' : 'fallo_registro' };
    } catch (error) {
        console.error('[AGENTE] Error registrando evidencia:', { name: error && error.name });
        return { persisted: false, reason: 'error' };
    }
}

module.exports = {
    agenteHabilitado,
    persistenciaHabilitada,
    planificarSeguro,
    planInstrumentacion,
    construirContextoPedagogico,
    registrarTurno
};
