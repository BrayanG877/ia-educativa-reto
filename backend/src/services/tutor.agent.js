/**
 * Agente IA-Educativa Tutor (Fase 1)
 * ------------------------------------------------------------------
 * Núcleo del ciclo pedagógico:
 *   Diagnosticar -> Enseñar -> Practicar -> Evaluar -> Detectar dificultades
 *   -> Adaptar -> Registrar progreso
 *
 * PRINCIPIOS (obligatorios):
 *  - Nunca registra una dificultad, mejora o "dominio" sin evidencia real.
 *  - Distingue HIPOTESIS (una respuesta errónea) de DIFICULTAD CONFIRMADA
 *    (patrón repetido en >=2 evidencias).
 *  - No inventa calificaciones ni progreso: si no hay dato, no lo escribe.
 *  - No guarda el texto completo de la conversación en las evidencias.
 *
 * Este módulo NO llama directamente al modelo: construye el contexto
 * pedagógico y registra evidencias. La generación de texto la hace
 * aiService.generateResponse (que ya usa proveedores + fallback).
 */

const crypto = require('crypto');

// --- Analizadores de intención del estudiante -------------------------
// Se basan en el TEXTO del mensaje (evidencia observable), no en supuestos.

const INTENCIONES = [
    { id: 'pide_respuesta',  re: /\b(dame|escribe|cu[aá]l es)\s+(la\s+)?(respuesta|soluci[oó]n|resultado)\b|resu[eé]lve(lo|me)?|haz(me)?\s+(la\s+)?tarea/i },
    { id: 'no_entiende',     re: /\bno\s+(entiendo|comprendo|me\s+queda\s+claro)|\bno\s+s[eé]\b|estoy\s+perdid|confundid/i },
    { id: 'pide_explicacion', re: /\bexpl[ií]came|explica(me)?\b|\bc[oó]mo\s+funciona|\bpor\s+qu[eé]\b/i },
    { id: 'pide_ejemplo',    re: /\b(ejemplo|ejemplos)\b|mu[eé]strame\s+uno/i },
    { id: 'pide_practicar',  re: /\b(ejercicio|practicar|pr[aá]ctica|ponme\s+uno|un\s+reto)\b/i },
    { id: 'pista',           re: /\b(pista|ayuda|ay[uú]dame)\b/i }
];

/**
 * Devuelve las intenciones detectadas en el mensaje (0 o más).
 */
function detectarIntencion(mensaje) {
    const texto = String(mensaje || '');
    return INTENCIONES.filter(i => i.re.test(texto)).map(i => i.id);
}

// --- Analizadores de la respuesta del estudiante ---------------------

/**
 * ¿La respuesta del estudiante es evaluable? Solo lo es si el agente
 * había planteado una pregunta/ejercicio y el estudiante responde con
 * algo concreto (no un "gracias" o una pregunta).
 */
function esRespuestaEvaluable(mensaje) {
    const t = String(mensaje || '').trim();
    if (t.length < 2) return false;
    // Preguntas del estudiante NO son respuestas evaluables
    if (/[?¿]\s*$/.test(t)) return false;
    // Cortesías / continuaciones
    if (/^(gracias|ok|okay|vale|listo|ya|hola|sip|no)$/i.test(t)) return false;
    return true;
}

/**
 * Heurística local para clasificar una respuesta corta como correcta,
 * incorrecta o parcial. Es SOLO una señal de apoyo: la evaluación real
 * la confirma el modelo/profesor. Se registra el criterio utilizado.
 */
function clasificarRespuestaCorta(respuesta, esperada) {
    if (!esperada) {
        return { outcome: 'not_evaluated', criterion: 'sin_respuesta_esperada' };
    }
    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const r = norm(respuesta);
    const e = norm(esperada);

    if (r === e) return { outcome: 'correct', criterion: 'coincidencia_exacta' };
    if (r.includes(e) || e.includes(r)) return { outcome: 'partial', criterion: 'coincidencia_parcial' };
    return { outcome: 'incorrect', criterion: 'discrepancia' };
}

// --- Seudónimo de sesión ---------------------------------------------
// Deriva un id estable y no reversible a partir de userId + conversación,
// para el panel, sin exponer el userId.
function sessionRef(userId, conversationId) {
    const base = String(userId || 'anon') + '|' + String(conversationId || 'nueva');
    return crypto.createHash('sha256').update(base).digest('hex').slice(0, 32);
}

// --- Registro de evidencias (tolerante a fallos) ---------------------

/**
 * Guarda una evidencia estructurada del agente.
 * NUNCA lanza: un fallo de registro no debe tumbar el chat del estudiante.
 * @returns {boolean} true si se registró.
 */
async function registrarEvidencia(query, evidencia) {
    try {
        await query(
            `INSERT INTO agent_evidence (
                conversation_id, user_id, session_ref, subject_code, competence, mode,
                action, evidence, outcome, measured_improvement, next_step,
                status, provider, model, fallback_from
            ) VALUES (@param1, @param2, @param3, @param4, @param5, @param6,
                      @param7, @param8, @param9, @param10, @param11,
                      @param12, @param13, @param14, @param15)`,
            [
                evidencia.conversationId || null,
                evidencia.userId || null,
                evidencia.sessionRef,
                evidencia.subjectCode || null,
                evidencia.competence || null,
                evidencia.mode || null,
                evidencia.action,
                evidencia.evidence || null,
                evidencia.outcome || null,
                evidencia.measuredImprovement ? 1 : 0,
                evidencia.nextStep || null,
                evidencia.status || 'recorded',
                evidencia.provider || null,
                evidencia.model || null,
                evidencia.fallbackFrom || null
            ]
        );
        return true;
    } catch (error) {
        // Log tecnico para el operador; no se interrumpe la tutoria por esto.
        console.error('[AGENTE] No se pudo registrar evidencia:', {
            action: evidencia.action, error: error.message
        });
        return false;
    }
}

/**
 * Registra o actualiza una dificultad. Si ya existe una dificultad ABIERTA
 * para la misma competencia y sesión, incrementa la evidencia (y puede pasar
 * de hipótesis a confirmada) en vez de duplicar filas.
 */
async function registrarDificultad(query, dificultad) {
    try {
        const existente = await query(
            `SELECT id, evidence FROM agent_difficulties
             WHERE session_ref = @param1 AND competence = @param2 AND status = 'open'`,
            [dificultad.sessionRef, dificultad.competence || '']
        );

        const evidenciaNueva = dificultad.evidence || '';

        if (existente.rows.length > 0) {
            const prev = String(existente.rows[0].evidence || '');
            // Patrón repetido: 2+ evidencias -> deja de ser hipótesis.
            const acumulada = prev ? (prev + ' || ' + evidenciaNueva) : evidenciaNueva;
            const confirmada = acumulada.split('||').length >= 2;
            await query(
                `UPDATE agent_difficulties
                 SET evidence = @param1,
                     needs_more_evidence = @param2,
                     confidence = @param3,
                     recommendation = @param4,
                     suggested_exercise = @param5,
                     updated_at = GETDATE()
                 WHERE id = @param6`,
                [
                    acumulada.slice(0, 1000),
                    confirmada ? 0 : 1,
                    confirmada ? 0.85 : 0.4,
                    dificultad.recommendation || null,
                    dificultad.suggestedExercise || null,
                    existente.rows[0].id
                ]
            );
            return { updated: true, confirmed: confirmada };
        }

        await query(
            `INSERT INTO agent_difficulties (
                user_id, session_ref, subject_code, competence, evidence,
                error_type, needs_more_evidence, confidence,
                recommendation, suggested_exercise, status
            ) VALUES (@param1, @param2, @param3, @param4, @param5,
                      @param6, @param7, @param8, @param9, @param10, 'open')`,
            [
                dificultad.userId || null,
                dificultad.sessionRef,
                dificultad.subjectCode || null,
                dificultad.competence || null,
                evidenciaNueva.slice(0, 1000),
                dificultad.errorType || null,
                1,                 // primera observación = hipótesis
                0.4,
                dificultad.recommendation || null,
                dificultad.suggestedExercise || null
            ]
        );
        return { updated: false, confirmed: false };
    } catch (error) {
        console.error('[AGENTE] No se pudo registrar dificultad:', error.message);
        return { updated: false, confirmed: false };
    }
}

/**
 * Comprueba si hay mejora demostrada entre un intento previo comparable
 * (misma competencia) y el intento actual. Solo devuelve true si hay
 * EVIDENCIA de un intento anterior incorrecto y uno actual correcto.
 */
async function hayMejoraDemostrada(query, sessionRefValue, competence) {
    try {
        const prev = await query(
            `SELECT outcome FROM agent_evidence
             WHERE session_ref = @param1 AND competence = @param2
               AND action = 'evaluate' AND outcome IN ('incorrect','partial')
             ORDER BY created_at DESC`,
            [sessionRefValue, competence || '']
        );
        return prev.rows.length > 0; // hubo un fallo previo comparable
    } catch (error) {
        console.error('[AGENTE] Error comprobando mejora:', error.message);
        return false;
    }
}

// --- Planificador del ciclo ------------------------------------------

/**
 * Decide la acción pedagógica del turno actual a partir del contexto.
 * NO genera texto: devuelve un "plan" que aiService usa para enriquecer el
 * prompt y para registrar la evidencia correspondiente.
 *
 * @returns {{ action, guidance, competence, shouldEvaluate, evaluateExpected }}
 */
function planificarTurno({ mensaje, subject, mode, historial = [] }) {
    const intenciones = detectarIntencion(mensaje);
    const esPrimerTurno = !historial || historial.length === 0;
    const respuestaEvaluable = !esPrimerTurno && esRespuestaEvaluable(mensaje);

    // 1) El estudiante pide explícitamente la respuesta/solución.
    //    Se respeta la necesidad, pero se ofrece el mayor andamiaje posible
    //    antes de revelar (principio 10 y 3.2).
    if (intenciones.includes('pide_respuesta')) {
        return {
            action: 'guided_hint',
            guidance: 'El estudiante pide la respuesta. Ofrece el MAYOR andamiaje: ' +
                      'preguntas encadenadas y una pista concreta. Solo si insiste o ya ' +
                      'hubo intentos previos, explica el procedimiento paso a paso.',
            competence: competenciaDeMateria(subject),
            shouldEvaluate: false,
            evaluateExpected: null
        };
    }

    // 2) El estudiante dice que no entiende: cambiar de estrategia (principio 6).
    if (intenciones.includes('no_entiende')) {
        return {
            action: 'teach',
            guidance: 'El estudiante no comprende. Cambia de estrategia: usa lenguaje ' +
                      'mas simple, una analogia cotidiana y una pregunta mas concreta. ' +
                      'No repitas la misma explicacion.',
            competence: competenciaDeMateria(subject),
            shouldEvaluate: false,
            evaluateExpected: null
        };
    }

    // 3) Pide un ejercicio -> entrar en fase de practica.
    if (intenciones.includes('pide_practicar')) {
        return {
            action: 'practice',
            guidance: 'Propón UN ejercicio breve y claro, al nivel del estudiante. ' +
                      'Pide que lo intente antes de dar cualquier resultado.',
            competence: competenciaDeMateria(subject),
            shouldEvaluate: false,
            evaluateExpected: null
        };
    }

    // 4) Primer turno -> diagnóstico inicial.
    if (esPrimerTurno) {
        return {
            action: 'diagnostic',
            guidance: 'Es el primer mensaje. Formula UNA pregunta diagnostica para saber ' +
                      'que conoce ya el estudiante antes de explicar. No des la respuesta.',
            competence: competenciaDeMateria(subject),
            shouldEvaluate: false,
            evaluateExpected: null
        };
    }

    // 5) Hay una respuesta del estudiante susceptible de evaluar.
    if (respuestaEvaluable) {
        return {
            action: 'evaluate',
            guidance: 'El estudiante respondio. Evalua el razonamiento (no solo el ' +
                      'resultado), senala el paso concreto donde acerto o fallo, y ' +
                      'propón el siguiente paso.',
            competence: competenciaDeMateria(subject),
            shouldEvaluate: true,
            evaluateExpected: null
        };
    }

    // 6) Por defecto: continuar guiando con preguntas.
    return {
        action: 'guided_question',
        guidance: 'Continua guiando con una pregunta orientadora, sin revelar la respuesta.',
        competence: competenciaDeMateria(subject),
        shouldEvaluate: false,
        evaluateExpected: null
    };
}

/** Mapea el código de materia a una competencia/concepto base. */
function competenciaDeMateria(subject) {
    const mapa = {
        matematicas: 'Operaciones y razonamiento matematico',
        fisica: 'Razonamiento fisico y resolucion de problemas',
        quimica: 'Conceptos quimicos y estequiometria',
        biologia: 'Conceptos biologicos y sistemas',
        sociales: 'Analisis social e historico',
        'español': 'Comprension y produccion de textos',
        espanol: 'Comprension y produccion de textos',
        filosofia: 'Argumentacion y pensamiento critico',
        informatica: 'Pensamiento computacional',
        ingles: 'Comprension en lengua extranjera',
        icfes: 'Competencias evaluadas por ICFES'
    };
    return mapa[subject] || 'Competencia general de la materia';
}

module.exports = {
    detectarIntencion,
    esRespuestaEvaluable,
    clasificarRespuestaCorta,
    sessionRef,
    registrarEvidencia,
    registrarDificultad,
    hayMejoraDemostrada,
    planificarTurno,
    competenciaDeMateria
};
