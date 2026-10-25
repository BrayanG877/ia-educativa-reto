/**
 * Controlador del Panel Docente
 * ==================================================================
 * Expone la analítica de aprendizaje de los grupos ASIGNADOS al profesor.
 *
 * MODELO DE AUTORIZACIÓN (defensa en profundidad)
 *  1. `authenticateToken`  -> el JWT debe ser válido.
 *  2. `loadUserRole`       -> el rol se lee de la BASE DE DATOS, no del token.
 *  3. `requireRole('teacher')` -> solo docentes.
 *  4. Comprobación por recurso: (teacher_id, subject_code, group_id) debe
 *     existir en `teacher_assignments`. Cambiar el groupId de la URL por otro
 *     grupo devuelve 403: el UUID/int del cliente NO es prueba de acceso.
 *
 * El rol `admin` NO se incluye a propósito: el panel expone datos académicos
 * de menores y no se pidió para ese rol.
 *
 * PRIVACIDAD: los DTO de salida excluyen email, institution, password_hash y
 * cualquier dato que el profesor no necesite para su función.
 */
'use strict';

const analytics = require('../services/analytics.service');
const { query } = require('../config/database');
const { AppError, catchAsync } = require('../middleware/error.middleware');

/** Código de asignatura válido: minúsculas, dígitos, guion y guion bajo.
 *  Debe aceptar el catálogo REAL de `subjects`: 'matematicas', 'espanol',
 *  'educacion-fisica', 'icfes'. No se permite ningún otro carácter (espacios,
 *  comillas, '%', ';') porque el código se usa en filtros de análisis. */
const SUBJECT_RE = /^[a-z][a-z0-9_-]{1,49}$/;

/**
 * Valida el identificador de grupo recibido por URL.
 * Solo enteros positivos: descarta '1 OR 1=1', 'abc', '1.5', negativos.
 */
function parseGroupId(raw) {
    if (typeof raw !== 'string' || !/^\d{1,9}$/.test(raw)) {
        throw new AppError('El identificador de grupo no es válido', 400);
    }
    const n = parseInt(raw, 10);
    if (!Number.isInteger(n) || n <= 0) {
        throw new AppError('El identificador de grupo no es válido', 400);
    }
    return n;
}

/** Valida el código de asignatura. */
function parseSubjectCode(raw) {
    if (typeof raw !== 'string' || !SUBJECT_RE.test(raw)) {
        throw new AppError('La asignatura no es válida', 400);
    }
    return raw;
}

/** Valida el identificador de estudiante (UUID). */
function parseStudentId(raw) {
    const re = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (typeof raw !== 'string' || !re.test(raw)) {
        throw new AppError('El identificador de estudiante no es válido', 400);
    }
    return raw;
}

/** Ventana temporal en días, acotada a [1, 365]. */
function parseDays(raw) {
    if (raw === undefined || raw === null || raw === '') return 30;
    if (typeof raw !== 'string' || !/^\d{1,3}$/.test(raw)) {
        throw new AppError('El período debe ser un número de días entre 1 y 365', 400);
    }
    const n = parseInt(raw, 10);
    if (n < 1 || n > 365) {
        throw new AppError('El período debe estar entre 1 y 365 días', 400);
    }
    return n;
}

/**
 * Comprueba la asignación docente. Lanza 403 si el profesor no imparte esa
 * asignatura en ese grupo. Se llama en TODOS los endpoints del panel.
 */
async function exigirAsignacion(req, subjectCode, groupId) {
    const ok = await analytics.profesorTieneGrupo(query, req.userId, subjectCode, groupId);
    if (!ok) {
        throw new AppError(
            'No tiene acceso a este grupo para esa asignatura',
            403
        );
    }
}

/**
 * GET /api/teacher/groups
 * Grupos y asignaturas asignados al profesor autenticado.
 */
exports.getGroups = catchAsync(async (req, res) => {
    const filas = await analytics.gruposDelProfesor(query, req.userId);

    // Agrupamos por grupo para que el frontend reciba un objeto coherente:
    // un profesor puede tener varias asignaturas en el mismo grupo.
    const porGrupo = new Map();
    for (const f of filas) {
        const key = f.groupId;
        if (!porGrupo.has(key)) {
            porGrupo.set(key, {
                groupId: f.groupId,
                groupCode: f.groupCode,
                groupName: f.groupName,
                gradeLevel: f.gradeLevel,
                isDemo: !!f.isDemo,
                studentCount: Number(f.studentCount) || 0,
                assignments: []
            });
        }
        porGrupo.get(key).assignments.push({
            subjectCode: f.subjectCode,
            subjectName: f.subjectName || f.subjectCode,
            subjectEmoji: f.subjectEmoji || null
        });
    }

    res.json({
        success: true,
        data: {
            groups: Array.from(porGrupo.values()),
            count: porGrupo.size
        }
    });
});

/**
 * GET /api/teacher/groups/:groupId/students?subject=matematicas
 * Estudiantes inscritos en el grupo, con actividad reciente.
 */
exports.getGroupStudents = catchAsync(async (req, res) => {
    const groupId = parseGroupId(req.params.groupId);
    const subject = parseSubjectCode(req.query.subject);
    await exigirAsignacion(req, subject, groupId);

    const filas = await analytics.estudiantesDelGrupo(query, groupId);

    const students = filas.map(s => {
        const evaluados = Number(s.evaluatedCount) || 0;
        const aciertos = Number(s.correctCount) || 0;
        return {
            id: s.id,
            fullName: s.fullName,
            // Identificador académico: username, NO el email.
            academicId: s.academicId,
            eventCount: Number(s.eventCount) || 0,
            lastActivity: s.lastActivity || null,
            tasaAcierto: evaluados > 0 ? analytics.ratio(aciertos, evaluados) : null,
            tieneDatos: (Number(s.eventCount) || 0) >= analytics.UMBRALES.MIN_EVENTOS_ESTUDIANTE
        };
    });

    res.json({
        success: true,
        data: {
            groupId,
            subject,
            students,
            count: students.length,
            // Umbral explícito para que el frontend explique el estado vacío.
            minEventosPerfil: analytics.UMBRALES.MIN_EVENTOS_ESTUDIANTE
        }
    });
});

/**
 * GET /api/teacher/groups/:groupId/stats?subject=matematicas&days=30
 * Analítica agregada del grupo.
 */
exports.getGroupStats = catchAsync(async (req, res) => {
    const groupId = parseGroupId(req.params.groupId);
    const subject = parseSubjectCode(req.query.subject);
    const days = parseDays(req.query.days);
    await exigirAsignacion(req, subject, groupId);

    const stats = await analytics.estadisticasGrupo(query, {
        groupId,
        subjectCode: subject,
        days
    });

    res.json({
        success: true,
        data: {
            groupId,
            subject,
            ...stats,
            // Definiciones expuestas al cliente para que la interfaz pueda
            // mostrar de dónde sale cada número sin ambigüedad.
            definiciones: {
                tasaAcierto: 'Proporción de turnos evaluados que resultaron correctos. No es una calificación formal.',
                estudiantesActivos: 'Estudiantes con al menos un evento de aprendizaje en el período.',
                estadoRefuerzo: `Tasa de acierto inferior a ${analytics.UMBRALES.TASA_ACIERTO_REFUERZO * 100}% con al menos ${analytics.UMBRALES.MIN_EVIDENCIAS_TEMA} evidencias.`,
                estadoDominio: `Tasa de acierto superior a ${analytics.UMBRALES.TASA_ACIERTO_DOMINIO * 100}%.`,
                hipotesis: 'Inferencia del agente pendiente de comprobación; no es un diagnóstico.'
            }
        }
    });
});

/**
 * GET /api/teacher/groups/:groupId/students/:studentId?subject=...&days=...
 * Perfil de aprendizaje individual.
 */
exports.getStudentProfile = catchAsync(async (req, res) => {
    const groupId = parseGroupId(req.params.groupId);
    const studentId = parseStudentId(req.params.studentId);
    const subject = parseSubjectCode(req.query.subject);
    const days = parseDays(req.query.days);
    await exigirAsignacion(req, subject, groupId);

    // Además de la asignación, el estudiante debe estar matriculado en el grupo.
    const puede = await analytics.profesorPuedeVerEstudiante(
        query, req.userId, subject, groupId, studentId
    );
    if (!puede) {
        throw new AppError('No tiene acceso a este estudiante', 403);
    }

    const perfil = await analytics.perfilEstudiante(query, {
        studentId,
        groupId,
        subjectCode: subject,
        days
    });

    if (!perfil) {
        throw new AppError('Estudiante no encontrado', 404);
    }

    res.json({
        success: true,
        data: {
            groupId,
            subject,
            ...perfil,
            recomendaciones: construirRecomendaciones(perfil)
        }
    });
});

/**
 * Recomendaciones docentes derivadas de la evidencia real.
 *
 * REGLA: cada recomendación cita el dato que la justifica. No se generan
 * recomendaciones genéricas ni se inventan dificultades.
 * Se presentan como apoyo a la decisión del docente, no como sustituto.
 */
function construirRecomendaciones(perfil) {
    if (!perfil || perfil.status !== 'ok') return [];

    const recs = [];

    for (const d of perfil.dificultades || []) {
        recs.push({
            tipo: 'refuerzo_tema',
            prioridad: 'alta',
            titulo: `Reforzar ${d.topic}`,
            detalle:
                `El estudiante acumula ${d.errores} respuesta(s) incorrecta(s) sobre ` +
                `${d.evaluados} turno(s) evaluado(s) en este tema ` +
                `(tasa de acierto ${Math.round((d.tasaAcierto || 0) * 100)}%).`,
            evidencia: {
                topic: d.topic,
                errores: d.errores,
                evaluados: d.evaluados,
                evidencias: d.evidencias
            },
            accionSugerida: 'Proponer ejercicios graduados de menor a mayor dificultad y comprobar la comprensión con una pregunta nueva.'
        });
    }

    // Dificultad apoyada en varias evidencias (no una sola respuesta aislada).
    const persistentes = (perfil.senalesDeError || []).filter(s => !s.hipotesis);
    if (persistentes.length > 0) {
        const porTipo = {};
        for (const s of persistentes) {
            porTipo[s.errorType] = (porTipo[s.errorType] || 0) + 1;
        }
        const tipoMasFrecuente = Object.entries(porTipo).sort((a, b) => b[1] - a[1])[0];
        if (tipoMasFrecuente) {
            recs.push({
                tipo: 'error_recurrente',
                prioridad: 'media',
                titulo: `Patrón de error: ${tipoMasFrecuente[0]}`,
                detalle: `Se registraron ${tipoMasFrecuente[1]} evidencia(s) de este tipo de error en distintos momentos.`,
                evidencia: { errorType: tipoMasFrecuente[0], total: tipoMasFrecuente[1] },
                accionSugerida: 'Hacer una actividad de diagnóstico breve para comprobar si el patrón persiste en un contexto distinto.'
            });
        }
    }

    if ((perfil.fortalezas || []).length > 0) {
        const f = perfil.fortalezas[0];
        recs.push({
            tipo: 'fortaleza',
            prioridad: 'info',
            titulo: `Mantener el avance en ${f.topic}`,
            detalle: `Tasa de acierto de ${Math.round((f.tasaAcierto || 0) * 100)}% con ${f.evidencias} evidencia(s).`,
            evidencia: { topic: f.topic, tasaAcierto: f.tasaAcierto },
            accionSugerida: 'Proponer un reto de mayor complejidad en este tema para consolidar el dominio.'
        });
    }

    if (perfil.conAyuda > 0 && perfil.sinAyuda === 0) {
        recs.push({
            tipo: 'autonomia',
            prioridad: 'media',
            titulo: 'Fomentar la autonomía',
            detalle: 'Todas las respuestas correctas registradas ocurrieron después de recibir pistas.',
            evidencia: { sinAyuda: perfil.sinAyuda, conAyuda: perfil.conAyuda },
            accionSugerida: 'Proponer un ejercicio similar pidiendo al estudiante que lo resuelva sin pistas para verificar dominio independiente.'
        });
    }

    return recs;
}

exports.construirRecomendaciones = construirRecomendaciones;
exports.parseGroupId = parseGroupId;
exports.parseSubjectCode = parseSubjectCode;
exports.parseStudentId = parseStudentId;
exports.parseDays = parseDays;
