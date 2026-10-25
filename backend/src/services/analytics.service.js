/**
 * Servicio de analítica de aprendizaje
 * ==================================================================
 * ÚNICA puerta de escritura de `learning_events` y única puerta de lectura
 * de la analítica que consume el panel docente.
 *
 * PRINCIPIOS
 *  - Todo indicador se calcula en el servidor, a partir de filas reales.
 *    El cliente NUNCA envía porcentajes ni niveles.
 *  - Si no hay datos suficientes, se responde `datos: 'insuficientes'` y
 *    NO se inventan valores para rellenar gráficas.
 *  - Se distingue HIPÓTESIS (needs_more_evidence=1) de DOMINIO CONFIRMADO
 *    (needs_more_evidence=0).
 *  - Todos los parámetros llegan ya validados; las consultas son
 *    parametrizadas (@paramN) igual que el resto del proyecto.
 *
 * Todas las funciones reciben la función `query` por inyección para poder
 * probarlas sin SQL Server (mismo patrón que tutor.integration.js).
 */
'use strict';

const classifier = require('./learning.classifier');

// Umbrales documentados y usados por los cálculos del panel.
const UMBRALES = Object.freeze({
    // Menos de este número de eventos en el grupo -> "datos insuficientes".
    MIN_EVENTOS_GRUPO: 10,
    // Menos de este número de eventos por estudiante -> perfil parcial.
    MIN_EVENTOS_ESTUDIANTE: 3,
    // Menos de este número de evidencias sobre un tema -> no se concluye nada.
    MIN_EVIDENCIAS_TEMA: 3,
    // Un tema se marca "refuerzo" si su tasa de acierto es inferior a esto.
    TASA_ACIERTO_REFUERZO: 0.5,
    // Un tema se marca "dominado" si su tasa de acierto es superior a esto.
    TASA_ACIERTO_DOMINIO: 0.75
});

// Correcciones que cuentan como "hubo acierto" para la tasa de acierto.
const OUTCOMES_ACIERTO = ['correct', 'correct_with_help'];

/** Redondea a 2 decimales de forma estable. */
function r2(n) {
    return Math.round(Number(n) * 100) / 100;
}

/** División segura: 0 si el denominador es 0. */
function ratio(num, den) {
    return den > 0 ? r2(num / den) : 0;
}

/**
 * Registra un evento de aprendizaje a partir del plan del agente.
 *
 * NUNCA lanza hacia arriba: si falla, el chat del estudiante no se ve afectado.
 *
 * @param {Function} query
 * @param {object} ctx
 * @param {string} ctx.userId
 * @param {string|null} ctx.groupId
 * @param {string|null} ctx.conversationId
 * @param {string} ctx.subject
 * @param {string} ctx.message - mensaje del estudiante (solo para clasificar)
 * @param {object|null} ctx.plan - plan del agente tutor
 * @param {string} ctx.mode
 * @param {string} [ctx.provider]
 * @param {string} [ctx.model]
 * @param {string} [ctx.fallbackFrom]
 * @param {number} [ctx.durationMs]
 * @param {number} [ctx.hintsGiven]
 * @param {number} [ctx.attempts]
 * @param {string} [ctx.activityType]
 * @returns {Promise<{persisted:boolean, reason:string}>}
 */
async function registrarEvento(query, ctx) {
    try {
        if (typeof query !== 'function') return { persisted: false, reason: 'sin_query' };
        if (!ctx || !ctx.userId) return { persisted: false, reason: 'sin_usuario' };
        if (!ctx.plan || !ctx.plan.action) return { persisted: false, reason: 'sin_plan' };

        const subject = ctx.subject || null;
        if (!subject) return { persisted: false, reason: 'sin_asignatura' };

        // Clasificación reproducible (no IA): tema + desenlace.
        await classifier.cargarCatalogo(query);
        const tema = classifier.clasificarTema(ctx.message, subject);
        const desenlace = classifier.clasificarDesenlace(ctx.plan, {
            hintsGiven: ctx.hintsGiven,
            attempts: ctx.attempts
        });
        const fase = classifier.faseDeAccion(ctx.plan.action);

        const sessionRef = `${String(ctx.userId).slice(0, 8)}-${ctx.conversationId || 'sin-conv'}`;
        const evidencia = [
            tema ? `tema_detectado_por_palabras_clave=${tema.matches}` : 'tema_sin_clasificar',
            `accion=${ctx.plan.action}`,
            `ayuda=${desenlace.helpLevel}`
        ].join('; ');

        await query(
            `INSERT INTO learning_events (
                user_id, group_id, conversation_id, session_ref,
                subject_code, topic, concept,
                phase, action, help_level, hints_given, attempts,
                outcome, error_type, evidence,
                source, confidence, needs_more_evidence,
                provider, model, fallback_from,
                activity_type, duration_ms, is_demo
             )
             VALUES (
                @param1, @param2, @param3, @param4,
                @param5, @param6, @param7,
                @param8, @param9, @param10, @param11, @param12,
                @param13, @param14, @param15,
                @param16, @param17, @param18,
                @param19, @param20, @param21,
                @param22, @param23, 0
             )`,
            [
                ctx.userId,
                ctx.groupId ? parseInt(ctx.groupId, 10) : null,
                ctx.conversationId || null,
                sessionRef.slice(0, 64),
                subject,
                tema ? tema.topic : null,
                tema ? tema.concept : null,
                fase,
                ctx.plan.action,
                desenlace.helpLevel,
                Number(ctx.hintsGiven) || 0,
                Number(ctx.attempts) || 0,
                desenlace.outcome,
                desenlace.errorType,
                evidencia,
                'agent_rules',
                tema ? tema.confidence : null,
                desenlace.needsMoreEvidence ? 1 : 0,
                ctx.provider || null,
                ctx.model || null,
                ctx.fallbackFrom || null,
                ctx.activityType || 'chat',
                Number.isFinite(ctx.durationMs) ? Math.round(ctx.durationMs) : null
            ]
        );

        return {
            persisted: true,
            reason: 'registrado',
            topic: tema ? tema.topic : null,
            outcome: desenlace.outcome
        };
    } catch (error) {
        // Nunca romper la respuesta al estudiante por un fallo de analítica.
        console.error('[ANALITICA] No se pudo registrar el evento:', {
            name: error && error.name,
            code: error && error.number
        });
        return { persisted: false, reason: 'error' };
    }
}

/**
 * Resuelve el grupo activo del estudiante para etiquetar sus eventos.
 * Un estudiante pertenece a un grupo; si tiene varios activos, se usa el más
 * reciente. Devuelve null si no hay matrícula (no es un error).
 */
async function grupoDelEstudiante(query, userId) {
    try {
        const r = await query(
            `SELECT TOP 1 ge.group_id
               FROM group_enrollments ge
              WHERE ge.student_id = @param1 AND ge.is_active = 1
              ORDER BY ge.enrolled_at DESC`,
            [userId]
        );
        return r.rows && r.rows.length ? r.rows[0].group_id : null;
    } catch (_) {
        return null;
    }
}

/**
 * Verifica que un profesor tenga asignado (subject_code, group_id).
 * Es la comprobación de AUTORIZACIÓN del panel docente.
 *
 * @returns {Promise<boolean>}
 */
async function profesorTieneGrupo(query, teacherId, subjectCode, groupId) {
    try {
        if (!teacherId || !subjectCode || !groupId) return false;
        const gid = parseInt(groupId, 10);
        if (!Number.isInteger(gid)) return false;
        const r = await query(
            `SELECT TOP 1 1 AS ok
               FROM teacher_assignments ta
               JOIN users u ON u.id = ta.teacher_id
              WHERE ta.teacher_id = @param1
                AND ta.subject_code = @param2
                AND ta.group_id = @param3
                AND ta.is_active = 1
                AND u.role = 'teacher'
                AND u.is_active = 1`,
            [teacherId, subjectCode, gid]
        );
        return !!(r.rows && r.rows.length);
    } catch (_) {
        // ANTE CUALQUIER FALLO SE DENIEGA (fail-closed).
        // Un error de BD NO puede convertirse en un "sí". Sin esta garantía,
        // una tabla ausente o una caída transitoria abriría datos académicos
        // de menores a cualquier docente autenticado.
        return false;
    }
}

/**
 * Verifica que un estudiante pertenezca al grupo y que el profesor
 * tenga ese grupo asignado. Se usa al abrir el perfil de un estudiante.
 */
async function profesorPuedeVerEstudiante(query, teacherId, subjectCode, groupId, studentId) {
    try {
        const okGrupo = await profesorTieneGrupo(query, teacherId, subjectCode, groupId);
        if (!okGrupo) return false;
        const r = await query(
            `SELECT TOP 1 1 AS ok
               FROM group_enrollments
              WHERE group_id = @param1 AND student_id = @param2 AND is_active = 1`,
            [parseInt(groupId, 10), studentId]
        );
        return !!(r.rows && r.rows.length);
    } catch (_) {
        return false; // fail-closed
    }
}

/**
 * Grupos y asignaturas asignados a un profesor.
 * Devuelve una fila por par (asignatura, grupo).
 */
async function gruposDelProfesor(query, teacherId) {
    const r = await query(
        `SELECT g.id            AS groupId,
                g.code          AS groupCode,
                g.name          AS groupName,
                g.grade_level   AS gradeLevel,
                g.is_demo       AS isDemo,
                ta.subject_code AS subjectCode,
                s.name          AS subjectName,
                s.emoji         AS subjectEmoji,
                (SELECT COUNT(*)
                   FROM group_enrollments ge
                  WHERE ge.group_id = g.id AND ge.is_active = 1) AS studentCount
           FROM teacher_assignments ta
           JOIN class_groups g ON g.id = ta.group_id AND g.is_active = 1
           LEFT JOIN subjects s ON s.code = ta.subject_code
          WHERE ta.teacher_id = @param1 AND ta.is_active = 1
          ORDER BY g.grade_level, g.code, ta.subject_code`,
        [teacherId]
    );
    return r.rows || [];
}

/**
 * Estudiantes inscritos en un grupo, con su actividad reciente.
 */
async function estudiantesDelGrupo(query, groupId) {
    const r = await query(
        `SELECT u.id,
                u.full_name     AS fullName,
                u.username      AS academicId,
                u.grade_level   AS gradeLevel,
                (SELECT COUNT(*) FROM learning_events le
                  WHERE le.user_id = u.id AND le.group_id = @param1) AS eventCount,
                (SELECT MAX(le.created_at) FROM learning_events le
                  WHERE le.user_id = u.id AND le.group_id = @param1) AS lastActivity,
                (SELECT COUNT(*) FROM learning_events le
                  WHERE le.user_id = u.id AND le.group_id = @param1
                    AND le.outcome IN ('correct','correct_with_help')) AS correctCount,
                (SELECT COUNT(*) FROM learning_events le
                  WHERE le.user_id = u.id AND le.group_id = @param1
                    AND le.outcome IN ('correct','correct_with_help','incorrect')) AS evaluatedCount
           FROM group_enrollments ge
           JOIN users u ON u.id = ge.student_id AND u.is_active = 1
          WHERE ge.group_id = @param1 AND ge.is_active = 1
          ORDER BY u.full_name`,
        [parseInt(groupId, 10)]
    );
    return r.rows || [];
}

/**
 * Estadísticas agregadas del grupo para una asignatura y un período.
 *
 * @param {object} opts
 * @param {number} opts.groupId
 * @param {string} opts.subjectCode
 * @param {number} opts.days - ventana temporal (default 30)
 */
async function estadisticasGrupo(query, { groupId, subjectCode, days = 30 }) {
    const gid = parseInt(groupId, 10);
    const ventana = Math.max(1, Math.min(365, parseInt(days, 10) || 30));

    const resumen = await query(
        `SELECT
            (SELECT COUNT(*) FROM group_enrollments ge
              WHERE ge.group_id = @param1 AND ge.is_active = 1)                       AS enrolled,
            COUNT(*)                                                                  AS eventos,
            COUNT(DISTINCT le.user_id)                                                AS estudiantesActivos,
            SUM(CASE WHEN le.outcome IN ('correct','correct_with_help') THEN 1 ELSE 0 END) AS aciertos,
            SUM(CASE WHEN le.outcome = 'incorrect' THEN 1 ELSE 0 END)                 AS errores,
            SUM(CASE WHEN le.outcome IN ('correct','correct_with_help','incorrect') THEN 1 ELSE 0 END) AS evaluados,
            SUM(CASE WHEN le.needs_more_evidence = 0 THEN 1 ELSE 0 END)               AS confirmados
           FROM learning_events le
          WHERE le.group_id = @param1
            AND le.subject_code = @param2
            AND le.created_at >= DATEADD(day, -@param3, GETDATE())`,
        [gid, subjectCode, ventana]
    );

    const fila = (resumen.rows && resumen.rows[0]) || {};
    const eventos = Number(fila.eventos) || 0;

    if (eventos < UMBRALES.MIN_EVENTOS_GRUPO) {
        return {
            status: 'insuficientes',
            eventos,
            minimoRequerido: UMBRALES.MIN_EVENTOS_GRUPO,
            enrolled: Number(fila.enrolled) || 0,
            periodDays: ventana
        };
    }

    const porTema = await query(
        `SELECT le.topic,
                COUNT(*)                        AS evidencias,
                COUNT(DISTINCT le.user_id)      AS estudiantes,
                SUM(CASE WHEN le.outcome IN ('correct','correct_with_help') THEN 1 ELSE 0 END) AS aciertos,
                SUM(CASE WHEN le.outcome = 'incorrect' THEN 1 ELSE 0 END) AS errores,
                SUM(CASE WHEN le.outcome IN ('correct','correct_with_help','incorrect') THEN 1 ELSE 0 END) AS evaluados,
                SUM(CASE WHEN le.needs_more_evidence = 1 THEN 1 ELSE 0 END) AS hipotesis,
                SUM(CASE WHEN le.needs_more_evidence = 0 THEN 1 ELSE 0 END) AS confirmadas
           FROM learning_events le
          WHERE le.group_id = @param1
            AND le.subject_code = @param2
            AND le.topic IS NOT NULL
            AND le.created_at >= DATEADD(day, -@param3, GETDATE())
          GROUP BY le.topic
          ORDER BY evidencias DESC`,
        [gid, subjectCode, ventana]
    );

    const temas = (porTema.rows || []).map(t => {
        const evidencias = Number(t.evidencias) || 0;
        const evaluados = Number(t.evaluados) || 0;
        const aciertos = Number(t.aciertos) || 0;
        const tasa = ratio(aciertos, evaluados);

        let estado;
        if (evidencias < UMBRALES.MIN_EVIDENCIAS_TEMA) {
            estado = 'insuficiente';
        } else if (evaluados === 0) {
            estado = 'sin_evaluacion';
        } else if (tasa < UMBRALES.TASA_ACIERTO_REFUERZO) {
            estado = 'refuerzo';
        } else if (tasa >= UMBRALES.TASA_ACIERTO_DOMINIO) {
            estado = 'favorable';
        } else {
            estado = 'en_progreso';
        }

        return {
            topic: t.topic,
            evidencias,
            estudiantes: Number(t.estudiantes) || 0,
            evaluados,
            aciertos,
            errores: Number(t.errores) || 0,
            tasaAcierto: evaluados > 0 ? tasa : null,
            hipotesis: Number(t.hipotesis) || 0,
            confirmadas: Number(t.confirmadas) || 0,
            estado
        };
    });

    const erroresFrecuentes = await query(
        `SELECT le.error_type AS errorType, COUNT(*) AS total
           FROM learning_events le
          WHERE le.group_id = @param1
            AND le.subject_code = @param2
            AND le.error_type IS NOT NULL
            AND le.created_at >= DATEADD(day, -@param3, GETDATE())
          GROUP BY le.error_type
          ORDER BY total DESC`,
        [gid, subjectCode, ventana]
    );

    const evolucion = await query(
        `SELECT CONVERT(date, le.created_at)     AS dia,
                SUM(CASE WHEN le.outcome IN ('correct','correct_with_help') THEN 1 ELSE 0 END) AS aciertos,
                SUM(CASE WHEN le.outcome IN ('correct','correct_with_help','incorrect') THEN 1 ELSE 0 END) AS evaluados,
                COUNT(*) AS eventos
           FROM learning_events le
          WHERE le.group_id = @param1
            AND le.subject_code = @param2
            AND le.created_at >= DATEADD(day, -@param3, GETDATE())
          GROUP BY CONVERT(date, le.created_at)
          ORDER BY dia`,
        [gid, subjectCode, ventana]
    );

    const evaluados = Number(fila.evaluados) || 0;
    const aciertos = Number(fila.aciertos) || 0;

    return {
        status: 'ok',
        enrolled: Number(fila.enrolled) || 0,
        periodDays: ventana,
        eventos,
        estudiantesActivos: Number(fila.estudiantesActivos) || 0,
        // Tasa de acierto del grupo: NO es una calificación formal.
        // Es la proporción de turnos evaluados que resultaron correctos.
        tasaAcierto: evaluados > 0 ? ratio(aciertos, evaluados) : null,
        evaluados,
        aciertos,
        errores: Number(fila.errores) || 0,
        dominioConfirmado: (Number(fila.confirmados) || 0) > 0,
        temas,
        temasRefuerzo: temas.filter(t => t.estado === 'refuerzo'),
        temasFavorables: temas.filter(t => t.estado === 'favorable'),
        erroresFrecuentes: (erroresFrecuentes.rows || []).map(e => ({
            errorType: e.errorType,
            total: Number(e.total) || 0
        })),
        evolucion: (evolucion.rows || []).map(d => {
            const ev = Number(d.evaluados) || 0;
            const ac = Number(d.aciertos) || 0;
            return {
                dia: d.dia instanceof Date ? d.dia.toISOString().slice(0, 10) : String(d.dia),
                eventos: Number(d.eventos) || 0,
                tasaAcierto: ev > 0 ? ratio(ac, ev) : null
            };
        }),
        generadoEn: new Date().toISOString()
    };
}

/**
 * Perfil de aprendizaje individual de un estudiante dentro de un grupo y
 * asignatura. Incluye fortalezas y dificultades con evidencia.
 */
async function perfilEstudiante(query, { studentId, groupId, subjectCode, days = 90 }) {
    const gid = parseInt(groupId, 10);
    const ventana = Math.max(1, Math.min(365, parseInt(days, 10) || 90));

    const estudiante = await query(
        `SELECT u.id, u.full_name AS fullName, u.username AS academicId, u.grade_level AS gradeLevel
           FROM users u WHERE u.id = @param1`,
        [studentId]
    );
    if (!estudiante.rows || estudiante.rows.length === 0) return null;

    const totales = await query(
        `SELECT COUNT(*) AS eventos,
                COUNT(DISTINCT le.topic) AS temasTrabajados,
                MIN(le.created_at) AS primeraActividad,
                MAX(le.created_at) AS ultimaActividad,
                SUM(CASE WHEN le.outcome IN ('correct','correct_with_help','incorrect') THEN 1 ELSE 0 END) AS evaluados,
                SUM(CASE WHEN le.outcome IN ('correct','correct_with_help') THEN 1 ELSE 0 END) AS aciertos,
                SUM(CASE WHEN le.outcome = 'correct' THEN 1 ELSE 0 END) AS sin_ayuda,
                SUM(CASE WHEN le.outcome = 'correct_with_help' THEN 1 ELSE 0 END) AS con_ayuda,
                SUM(CASE WHEN le.outcome = 'incorrect' THEN 1 ELSE 0 END) AS errores,
                SUM(CASE WHEN le.needs_more_evidence = 0 THEN 1 ELSE 0 END) AS confirmados
           FROM learning_events le
          WHERE le.user_id = @param1 AND le.group_id = @param2 AND le.subject_code = @param3
            AND le.created_at >= DATEADD(day, -@param4, GETDATE())`,
        [studentId, gid, subjectCode, ventana]
    );
    const t = (totales.rows && totales.rows[0]) || {};
    const eventos = Number(t.eventos) || 0;

    if (eventos < UMBRALES.MIN_EVENTOS_ESTUDIANTE) {
        return {
            status: 'insuficientes',
            eventos,
            minimoRequerido: UMBRALES.MIN_EVENTOS_ESTUDIANTE,
            periodDays: ventana,
            student: estudiante.rows[0]
        };
    }

    const porTema = await query(
        `SELECT le.topic,
                COUNT(*) AS evidencias,
                SUM(CASE WHEN le.outcome IN ('correct','correct_with_help') THEN 1 ELSE 0 END) AS aciertos,
                SUM(CASE WHEN le.outcome = 'incorrect' THEN 1 ELSE 0 END) AS errores,
                SUM(CASE WHEN le.outcome IN ('correct','correct_with_help','incorrect') THEN 1 ELSE 0 END) AS evaluados,
                SUM(CASE WHEN le.needs_more_evidence = 0 THEN 1 ELSE 0 END) AS confirmadas,
                MIN(le.created_at) AS desde,
                MAX(le.created_at) AS hasta
           FROM learning_events le
          WHERE le.user_id = @param1 AND le.group_id = @param2 AND le.subject_code = @param3
            AND le.topic IS NOT NULL
            AND le.created_at >= DATEADD(day, -@param4, GETDATE())
          GROUP BY le.topic
          ORDER BY errores DESC, evidencias DESC`,
        [studentId, gid, subjectCode, ventana]
    );

    const temas = (porTema.rows || []).map(x => {
        const ev = Number(x.evaluados) || 0;
        const ac = Number(x.aciertos) || 0;
        const err = Number(x.errores) || 0;
        const tasa = ev > 0 ? ratio(ac, ev) : null;
        let estado;
        if (Number(x.evidencias) < UMBRALES.MIN_EVIDENCIAS_TEMA) estado = 'insuficiente';
        else if (ev === 0) estado = 'sin_evaluacion';
        else if (tasa < UMBRALES.TASA_ACIERTO_REFUERZO) estado = 'refuerzo';
        else if (tasa >= UMBRALES.TASA_ACIERTO_DOMINIO) estado = 'favorable';
        else estado = 'en_progreso';
        return {
            topic: x.topic,
            evidencias: Number(x.evidencias) || 0,
            evaluados: ev,
            aciertos: ac,
            errores: err,
            tasaAcierto: tasa,
            confirmadas: Number(x.confirmadas) || 0,
            estado,
            desde: x.desde,
            hasta: x.hasta
        };
    });

    const errores = await query(
        `SELECT le.topic, le.error_type AS errorType, le.evidence, le.created_at AS at,
                le.confidence, le.needs_more_evidence AS hipotesis
           FROM learning_events le
          WHERE le.user_id = @param1 AND le.group_id = @param2 AND le.subject_code = @param3
            AND le.error_type IS NOT NULL
            AND le.created_at >= DATEADD(day, -@param4, GETDATE())
          ORDER BY le.created_at DESC`,
        [studentId, gid, subjectCode, ventana]
    );

    const evaluados = Number(t.evaluados) || 0;
    const aciertos = Number(t.aciertos) || 0;

    return {
        status: 'ok',
        student: estudiante.rows[0],
        periodDays: ventana,
        eventos,
        temasTrabajados: Number(t.temasTrabajados) || 0,
        primeraActividad: t.primeraActividad,
        ultimaActividad: t.ultimaActividad,
        evaluados,
        aciertos,
        sinAyuda: Number(t.sin_ayuda) || 0,
        conAyuda: Number(t.con_ayuda) || 0,
        errores: Number(t.errores) || 0,
        tasaAcierto: evaluados > 0 ? ratio(aciertos, evaluados) : null,
        temas,
        fortalezas: temas.filter(x => x.estado === 'favorable'),
        dificultades: temas.filter(x => x.estado === 'refuerzo'),
        senalesDeError: (errores.rows || []).map(e => ({
            topic: e.topic,
            errorType: e.errorType,
            evidence: e.evidence,
            at: e.at,
            confidence: e.confidence === null ? null : Number(e.confidence),
            hipotesis: !!e.hipotesis
        })),
        generadoEn: new Date().toISOString()
    };
}

module.exports = {
    UMBRALES,
    OUTCOMES_ACIERTO,
    r2,
    ratio,
    registrarEvento,
    grupoDelEstudiante,
    profesorTieneGrupo,
    profesorPuedeVerEstudiante,
    gruposDelProfesor,
    estudiantesDelGrupo,
    estadisticasGrupo,
    perfilEstudiante
};
