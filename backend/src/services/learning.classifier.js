/**
 * Clasificador de temas del currículo
 * ==================================================================
 * Asigna un TEMA verificable a cada turno educativo a partir del mensaje del
 * estudiante, usando reglas reproducibles sobre el catálogo
 * `curriculum_topics` (tabla, no regex incrustadas en el código).
 *
 * POR QUÉ NO SE USA EL LLM AQUÍ:
 *  - Un indicador del panel docente debe poder explicarse y reproducirse.
 *  - Si el modelo clasificara, dos ejecuciones darían valores distintos sobre
 *    los mismos datos y la estadística del grupo no sería auditable.
 *  - La confianza se registra explícitamente: una coincidencia por palabra
 *    clave es una HIPÓTESIS (needs_more_evidence=1), no un diagnóstico.
 *
 * El catálogo se carga una vez y se mantiene en memoria. Si no está
 * disponible, todas las funciones devuelven null y el flujo continúa.
 */
'use strict';

let cache = null;          // [{ id, subjectCode, topic, concept, keywords: [] }]
let cargado = false;
let cargando = null;

/**
 * Normaliza texto para comparar: minúsculas y sin acentos.
 * "Ecuación" -> "ecuacion"
 */
function normalizar(texto) {
    return String(texto ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Carga el catálogo desde la BD. Idempotente y tolerante a fallos:
 * si la tabla no existe (migración no aplicada), deja el catálogo vacío
 * y el sistema sigue funcionando sin clasificación.
 *
 * @param {Function} query - función de acceso a BD del proyecto.
 */
async function cargarCatalogo(query) {
    if (cargado) return cache;
    if (cargando) return cargando;
    cargando = (async () => {
        try {
            const resultado = await query(
                `SELECT id, subject_code, topic, concept, keywords
                   FROM curriculum_topics
                  WHERE is_active = 1`
            );
            cache = (resultado.rows || []).map(r => ({
                id: r.id,
                subjectCode: r.subject_code,
                topic: r.topic,
                concept: r.concept,
                keywords: String(r.keywords || '')
                    .split(',')
                    .map(k => normalizar(k).trim())
                    .filter(Boolean)
            }));
        } catch (_) {
            // Migración no aplicada o tabla ausente: sin clasificación.
            cache = [];
        }
        cargado = true;
        cargando = null;
        return cache;
    })();
    return cargando;
}

/** Solo para pruebas: reinicia el estado interno. */
function _reset() {
    cache = null;
    cargado = false;
    cargando = null;
}

/** Solo para pruebas: inyecta un catálogo sin BD. */
function _setCatalogo(entradas) {
    cache = (entradas || []).map(e => ({
        subjectCode: e.subjectCode,
        topic: e.topic,
        concept: e.concept || null,
        keywords: (e.keywords || []).map(k => normalizar(k))
    }));
    cargado = true;
}

/**
 * Devuelve el tema que mejor corresponde al mensaje, o null.
 *
 * Criterio: gana el tema con más palabras clave distintas presentes en el
 * mensaje. Empate -> se queda el primero (orden estable del catálogo).
 *
 * @returns {{ topic: string, concept: string|null, confidence: number,
 *             matches: number } | null}
 */
function clasificarTema(mensaje, subjectCode) {
    if (!Array.isArray(cache) || cache.length === 0) return null;
    const texto = normalizar(mensaje);
    if (!texto) return null;

    const candidatos = cache.filter(t => t.subjectCode === subjectCode);
    if (candidatos.length === 0) return null;

    let mejor = null;
    for (const t of candidatos) {
        let coincidencias = 0;
        for (const k of t.keywords) {
            if (k && texto.includes(k)) coincidencias++;
        }
        if (coincidencias > 0 && (!mejor || coincidencias > mejor.matches)) {
            mejor = { topic: t.topic, concept: t.concept, matches: coincidencias };
        }
    }
    if (!mejor) return null;

    // Confianza acotada a [0.3, 0.9]: una coincidencia léxica nunca es
    // evidencia suficiente para declarar dominio ni dificultad confirmada.
    const confianza = Math.min(0.9, 0.3 + 0.2 * mejor.matches);
    return {
        topic: mejor.topic,
        concept: mejor.concept,
        confidence: Number(confianza.toFixed(2)),
        matches: mejor.matches
    };
}

/**
 * Clasifica el desenlace pedagógico de un turno a partir del plan del agente.
 *
 * IMPORTANTE (pedagogía): una respuesta correcta DESPUÉS de recibir pistas
 * NO es dominio independiente. Se registra como 'correct_with_help'.
 *
 * @param {object} plan - plan devuelto por tutor.agent.planificarTurno()
 * @param {object} opciones - { hintsGiven, attempts }
 */
function clasificarDesenlace(plan, opciones = {}) {
    const hints = Number(opciones.hintsGiven) || 0;
    const attempts = Number(opciones.attempts) || 0;
    const accion = plan && plan.action;

    if (accion === 'evaluate') {
        if (hints > 0) {
            return {
                outcome: 'correct_with_help',
                helpLevel: 'hint',
                needsMoreEvidence: true,
                errorType: null
            };
        }
        return {
            outcome: 'correct',
            helpLevel: 'none',
            needsMoreEvidence: true, // un turno aislado no confirma dominio
            errorType: null
        };
    }

    if (accion === 'guided_hint') {
        return {
            outcome: 'not_evaluated',
            helpLevel: hints > 0 ? 'guided' : 'hint',
            needsMoreEvidence: true,
            errorType: null
        };
    }

    if (accion === 'teach') {
        // El estudiante declaró que no entiende: señal de dificultad inicial.
        return {
            outcome: 'not_evaluated',
            helpLevel: 'guided',
            needsMoreEvidence: true,
            errorType: 'not_understood'
        };
    }

    if (accion === 'practice') {
        return {
            outcome: 'not_evaluated',
            helpLevel: 'none',
            needsMoreEvidence: true,
            errorType: null
        };
    }

    if (accion === 'diagnostic') {
        return {
            outcome: 'not_evaluated',
            helpLevel: 'none',
            needsMoreEvidence: true,
            errorType: null
        };
    }

    // guided_question y cualquier acción desconocida
    return {
        outcome: 'not_evaluated',
        helpLevel: attempts > 1 ? 'guided' : 'none',
        needsMoreEvidence: true,
        errorType: null
    };
}

/**
 * Mapea la acción del agente a la fase del ciclo pedagógico:
 * Diagnóstico -> Enseñar -> Practicar -> Evaluar -> Detectar -> Adaptar.
 */
function faseDeAccion(accion) {
    return {
        diagnostic: 'diagnostic',
        teach: 'teach',
        guided_question: 'teach',
        guided_hint: 'teach',
        practice: 'practice',
        evaluate: 'evaluate',
        detect_difficulty: 'detect_difficulty',
        recommend: 'adapt',
        adapt: 'adapt',
        reveal_solution: 'evaluate'
    }[accion] || 'teach';
}

module.exports = {
    cargarCatalogo,
    clasificarTema,
    clasificarDesenlace,
    faseDeAccion,
    normalizar,
    _reset,
    _setCatalogo
};
