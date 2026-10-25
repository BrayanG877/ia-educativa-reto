#!/usr/bin/env node
/**
 * SEED DE DESARROLLO — Cuenta de profesor de prueba y datos de demostración
 * ========================================================================
 * ⚠️  EXCLUSIVO DE ENTORNO LOCAL. NO EJECUTAR EN PRODUCCIÓN.
 *
 * QUÉ HACE
 *   1. Crea (idempotente) la cuenta de profesor de prueba.
 *   2. Crea un grupo de demostración y una matrícula de estudiantes sintéticos.
 *   3. Asigna el profesor a (Matemáticas, grupo demostración).
 *   4. Genera eventos de aprendizaje sintéticos (marcados is_demo=1) para que
 *      el panel muestre datos reales de la BD, no valores inventados en JS.
 *
 * QUÉ NO HACE
 *   - No modifica esquema ni borra datos existentes.
 *   - No usa datos académicos reales de estudiantes.
 *   - No asigna roles administrativos.
 *   - No escribe en producción: se niega a arrancar si NODE_ENV=production.
 *
 * USO
 *   cd backend
 *   npm run seed:teacher           # crea cuenta + grupo + datos demo
 *   npm run seed:teacher --reset   # borra SOLO los datos demo y vuelve a crear
 *
 * REQUISITOS PREVIOS (en orden):
 *   database/schema_sqlserver.sql
 *   database/migration_teacher_assignment.sql  (no imprescindible)
 *   database/migration_agent.sql               (no imprescindible)
 *   database/migration_teacher_panel.sql       (OBLIGATORIO para este seed)
 *
 * IDEMPOTENCIA
 *   Todas las inserciones comprueban existencia previa. Ejecutar dos veces no
 *   duplica ni falla.
 */
'use strict';

require('dotenv').config();

const bcrypt = require('bcryptjs');
const { query, testConnection } = require('../src/config/database');

// ---------------------------------------------------------------------
// Parámetros de la cuenta de prueba (documentados, no secretos de prod)
// ---------------------------------------------------------------------
const CUENTA = {
    email: 'profesorprueba@gmail.com',
    // Contraseña inicial SOLO para pruebas. Se guarda con bcrypt: nunca en
    // texto plano en la base de datos ni en el repositorio.
    password: '123456',
    username: 'profesorprueba',
    fullName: 'Profesor de Prueba',
    role: 'teacher',
    subject: 'matematicas'
};

const GRUPO = {
    code: 'DEMO-701',
    name: 'Grupo 701 (demostración)',
    gradeLevel: '7',
    institution: 'Institución de demostración'
};

/** Estudiantes sintéticos. Nombres ficticios, NO personas reales. */
const ESTUDIANTES_DEMO = [
    { username: 'demo_ana', fullName: 'Ana Demo (ficticio)', perfil: 'refuerzo_fracciones' },
    { username: 'demo_bruno', fullName: 'Bruno Demo (ficticio)', perfil: 'favorable' },
    { username: 'demo_carla', fullName: 'Carla Demo (ficticio)', perfil: 'refuerzo_ecuaciones' },
    { username: 'demo_diego', fullName: 'Diego Demo (ficticio)', perfil: 'pocos_datos' },
    { username: 'demo_elena', fullName: 'Elena Demo (ficticio)', perfil: 'autonomia_baja' }
];

const PASSWORD_DEMO_USUARIOS = 'DemoAlumno123';

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
function log(msg) { console.log('  ' + msg); }
function titulo(msg) { console.log('\n=== ' + msg + ' ==='); }

/** Ejecuta una sentencia SELECT TOP 1 y devuelve la primera fila o null. */
async function uno(sql, params) {
    const r = await query(sql, params);
    return (r.rows && r.rows.length) ? r.rows[0] : null;
}

// ---------------------------------------------------------------------
// Comprobaciones previas
// ---------------------------------------------------------------------
async function verificarEntorno() {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
        console.error(
            '\n❌ ABORTADO: NODE_ENV=production.\n' +
            '   Este script crea cuentas de prueba y datos de demostración.\n' +
            '   Ejecútalo solo contra una base de datos de desarrollo.\n'
        );
        process.exit(1);
    }

    const tablas = await query(
        `SELECT name FROM sys.objects
          WHERE type = 'U' AND name IN
            ('users','subjects','class_groups','teacher_assignments',
             'group_enrollments','learning_events','curriculum_topics')`
    );
    const presentes = (tablas.rows || []).map(r => r.name);
    const requeridas = ['users', 'subjects', 'class_groups', 'teacher_assignments',
                        'group_enrollments', 'learning_events', 'curriculum_topics'];
    const faltan = requeridas.filter(t => !presentes.includes(t));

    if (faltan.length > 0) {
        console.error(
            '\n❌ Faltan tablas: ' + faltan.join(', ') + '\n\n' +
            '   Aplica primero la migración del panel docente:\n' +
            '     sqlcmd -S <servidor> -d <base> -i database/migration_teacher_panel.sql\n'
        );
        process.exit(1);
    }
    log('Tablas requeridas presentes.');
}

// ---------------------------------------------------------------------
// 1. Asignatura
// ---------------------------------------------------------------------
async function asegurarAsignatura() {
    titulo('Asignatura: ' + CUENTA.subject);
    const existente = await uno(
        'SELECT code, name FROM subjects WHERE code = @param1',
        [CUENTA.subject]
    );
    if (existente) {
        log(`Ya existe: ${existente.code} — ${existente.name}`);
        return;
    }
    await query(
        `INSERT INTO subjects (code, name, emoji, description, is_active)
         VALUES (@param1, @param2, @param3, @param4, 1)`,
        [CUENTA.subject, 'Matemáticas', '🔢',
         'Aritmética, álgebra y pensamiento numérico.']
    );
    log('Creada: matematicas — Matemáticas');
}

// ---------------------------------------------------------------------
// 2. Cuenta de profesor
// ---------------------------------------------------------------------
async function asegurarProfesor() {
    titulo('Cuenta de profesor: ' + CUENTA.email);

    const existente = await uno(
        'SELECT id, role, primary_subject FROM users WHERE email = @param1',
        [CUENTA.email]
    );

    if (existente) {
        log(`La cuenta ya existe (id=${existente.id}, rol=${existente.role}).`);
        if (existente.role !== 'teacher') {
            throw new Error(
                `El usuario ${CUENTA.email} existe con rol "${existente.role}". ` +
                'No se modifica automáticamente: revisa manualmente para evitar ' +
                'escalar privilegios sobre una cuenta inesperada.'
            );
        }
        // Se asegura que la asignatura de perfil esté fijada.
        if (existente.primary_subject !== CUENTA.subject) {
            await query(
                'UPDATE users SET primary_subject = @param1 WHERE id = @param2',
                [CUENTA.subject, existente.id]
            );
            log('primary_subject actualizado a ' + CUENTA.subject);
        }
        return existente.id;
    }

    // Mismo hash que usa el registro del backend (bcrypt, coste 10).
    const passwordHash = await bcrypt.hash(CUENTA.password, 10);

    const creado = await uno(
        `INSERT INTO users (
            email, password_hash, username, full_name,
            grade_level, institution, parent_consent, role, primary_subject, is_active
         )
         OUTPUT INSERTED.id
         VALUES (@param1, @param2, @param3, @param4, NULL, @param5, 0, 'teacher', @param6, 1)`,
        [CUENTA.email, passwordHash, CUENTA.username, CUENTA.fullName,
         GRUPO.institution, CUENTA.subject]
    );

    await query(
        `INSERT INTO audit_logs (user_id, action, resource, details)
         VALUES (@param1, @param2, @param3, @param4)`,
        [creado.id, 'DEV_SEED_TEACHER_CREATED', 'users',
         JSON.stringify({ username: CUENTA.username, role: 'teacher', subject: CUENTA.subject })]
    );

    log(`Creada con rol teacher (id=${creado.id}) y asignatura ${CUENTA.subject}.`);
    log('Contraseña inicial: almacenada con bcrypt (no se imprime en claro).');
    return creado.id;
}

// ---------------------------------------------------------------------
// 3. Grupo y matrícula
// ---------------------------------------------------------------------
async function asegurarGrupo() {
    titulo('Grupo de demostración: ' + GRUPO.code);
    const existente = await uno(
        'SELECT id FROM class_groups WHERE code = @param1',
        [GRUPO.code]
    );
    if (existente) {
        log(`Ya existe (id=${existente.id}).`);
        return existente.id;
    }
    const creado = await uno(
        `INSERT INTO class_groups (code, name, grade_level, institution, academic_year, is_active, is_demo)
         OUTPUT INSERTED.id
         VALUES (@param1, @param2, @param3, @param4, @param5, 1, 1)`,
        [GRUPO.code, GRUPO.name, GRUPO.gradeLevel, GRUPO.institution, new Date().getFullYear()]
    );
    log(`Creado (id=${creado.id}).`);
    return creado.id;
}

async function asegurarEstudiantes(groupId) {
    titulo('Estudiantes sintéticos');
    const hash = await bcrypt.hash(PASSWORD_DEMO_USUARIOS, 10);
    const ids = [];

    for (const est of ESTUDIANTES_DEMO) {
        let fila = await uno(
            'SELECT id FROM users WHERE username = @param1',
            [est.username]
        );
        if (!fila) {
            fila = await uno(
                `INSERT INTO users (
                    email, password_hash, username, full_name,
                    grade_level, institution, parent_consent, role, is_active
                 )
                 OUTPUT INSERTED.id
                 VALUES (@param1, @param2, @param3, @param4, @param5, @param6, 1, 'student', 1)`,
                [`${est.username}@demo.local`, hash, est.username, est.fullName,
                 GRUPO.gradeLevel, GRUPO.institution]
            );
            log(`Creado: ${est.fullName} (id=${fila.id})`);
        } else {
            log(`Ya existe: ${est.fullName} (id=${fila.id})`);
        }

        const matricula = await uno(
            `SELECT id FROM group_enrollments
              WHERE group_id = @param1 AND student_id = @param2 AND is_active = 1`,
            [groupId, fila.id]
        );
        if (!matricula) {
            await query(
                `INSERT INTO group_enrollments (group_id, student_id, is_active)
                 VALUES (@param1, @param2, 1)`,
                [groupId, fila.id]
            );
            log(`  Matriculado en ${GRUPO.code}`);
        }

        ids.push({ id: fila.id, perfil: est.perfil });
    }
    return ids;
}

// ---------------------------------------------------------------------
// 4. Asignación docente
// ---------------------------------------------------------------------
async function asegurarAsignacion(teacherId, groupId) {
    titulo('Asignación profesor → grupo');
    const existente = await uno(
        `SELECT id FROM teacher_assignments
          WHERE teacher_id = @param1 AND subject_code = @param2
            AND group_id = @param3 AND is_active = 1`,
        [teacherId, CUENTA.subject, groupId]
    );
    if (existente) {
        log('La asignación ya existe.');
        return;
    }
    await query(
        `INSERT INTO teacher_assignments
            (teacher_id, subject_code, group_id, assigned_by, is_active)
         VALUES (@param1, @param2, @param3, @param1, 1)`,
        [teacherId, CUENTA.subject, groupId]
    );
    log(`Asignado: ${CUENTA.subject} en ${GRUPO.code}`);
}

// ---------------------------------------------------------------------
// 5. Eventos de aprendizaje sintéticos
// ---------------------------------------------------------------------
/**
 * Genera un evento por día, repartido en los últimos `dias`.
 * Todos llevan is_demo=1 para poder identificarlos y eliminarlos.
 */
async function crearEvento(groupId, userId, { topic, concept, outcome, errorType,
                                               needsMoreEvidence, daysAgo, phase, action,
                                               helpLevel, confidence }) {
    const fecha = new Date(Date.now() - daysAgo * 86400000);
    await query(
        `INSERT INTO learning_events (
            user_id, group_id, conversation_id, session_ref,
            subject_code, topic, concept,
            phase, action, help_level, hints_given, attempts,
            outcome, error_type, evidence,
            source, confidence, needs_more_evidence,
            activity_type, is_demo, created_at
         )
         VALUES (
            @param1, @param2, NULL, @param3,
            @param4, @param5, @param6,
            @param7, @param8, @param9, @param10, @param11,
            @param12, @param13, @param14,
            'seed', @param15, @param16,
            'chat', 1, @param17
         )`,
        [userId, groupId, `seed-${String(userId).slice(0, 8)}`,
         CUENTA.subject, topic, concept,
         phase, action, helpLevel,
         helpLevel === 'none' ? 0 : 1, 1,
         outcome, errorType, 'evento_sintetico_de_demostracion',
         confidence, needsMoreEvidence ? 1 : 0,
         fecha]
    );
}

async function crearEventosDemo(groupId, estudiantes) {
    titulo('Eventos de aprendizaje sintéticos');

    const existentes = await uno(
        'SELECT COUNT(*) AS n FROM learning_events WHERE group_id = @param1 AND is_demo = 1',
        [groupId]
    );
    if (existentes && Number(existentes.n) > 0) {
        log(`Ya hay ${existentes.n} evento(s) demo. Usa --reset para regenerarlos.`);
        return 0;
    }

    const T = {
        fracciones: { topic: 'Operaciones con fracciones', concept: 'Suma y resta de fracciones' },
        equivalentes: { topic: 'Fracciones equivalentes', concept: 'Relación numerador-denominador' },
        ecuaciones: { topic: 'Ecuaciones de primer grado', concept: 'Transposición de términos' },
        enteros: { topic: 'Números enteros', concept: 'Operaciones con signos' },
        proporcion: { topic: 'Proporcionalidad', concept: 'Regla de tres' },
        porcentajes: { topic: 'Porcentajes', concept: 'Cálculo de porcentajes' }
    };

    let total = 0;

    for (const est of estudiantes) {
        const t = T;

        if (est.perfil === 'refuerzo_fracciones') {
            // Dificultad sostenida en fracciones + algo de progreso en enteros
            for (let d = 20; d >= 1; d -= 2) {
                await crearEvento(groupId, est.id, {
                    ...t.fracciones, outcome: 'incorrect', errorType: 'conceptual',
                    needsMoreEvidence: false, daysAgo: d, phase: 'evaluate',
                    action: 'evaluate', helpLevel: 'hint', confidence: 0.7
                });
                total++;
            }
            for (let d = 14; d >= 2; d -= 4) {
                await crearEvento(groupId, est.id, {
                    ...t.enteros, outcome: 'correct', errorType: null,
                    needsMoreEvidence: false, daysAgo: d, phase: 'evaluate',
                    action: 'evaluate', helpLevel: 'none', confidence: 0.8
                });
                total++;
            }
            await crearEvento(groupId, est.id, {
                ...t.equivalentes, outcome: 'incorrect', errorType: 'procedural',
                needsMoreEvidence: true, daysAgo: 3, phase: 'practice',
                action: 'practice', helpLevel: 'guided', confidence: 0.5
            });
            total++;

        } else if (est.perfil === 'favorable') {
            for (let d = 21; d >= 1; d -= 3) {
                await crearEvento(groupId, est.id, {
                    ...t.proporcion, outcome: 'correct', errorType: null,
                    needsMoreEvidence: false, daysAgo: d, phase: 'evaluate',
                    action: 'evaluate', helpLevel: 'none', confidence: 0.85
                });
                total++;
            }
            for (let d = 18; d >= 2; d -= 4) {
                await crearEvento(groupId, est.id, {
                    ...t.porcentajes, outcome: 'correct', errorType: null,
                    needsMoreEvidence: false, daysAgo: d, phase: 'evaluate',
                    action: 'evaluate', helpLevel: 'none', confidence: 0.8
                });
                total++;
            }

        } else if (est.perfil === 'refuerzo_ecuaciones') {
            for (let d = 19; d >= 1; d -= 2) {
                await crearEvento(groupId, est.id, {
                    ...t.ecuaciones, outcome: 'incorrect', errorType: 'procedural',
                    needsMoreEvidence: false, daysAgo: d, phase: 'evaluate',
                    action: 'evaluate', helpLevel: 'guided', confidence: 0.75
                });
                total++;
            }
            for (let d = 12; d >= 4; d -= 4) {
                await crearEvento(groupId, est.id, {
                    ...t.fracciones, outcome: 'correct_with_help', errorType: null,
                    needsMoreEvidence: true, daysAgo: d, phase: 'evaluate',
                    action: 'evaluate', helpLevel: 'hint', confidence: 0.6
                });
                total++;
            }

        } else if (est.perfil === 'autonomia_baja') {
            // Solo acierta con pistas: señal real de falta de autonomía
            for (let d = 16; d >= 2; d -= 2) {
                await crearEvento(groupId, est.id, {
                    ...t.enteros, outcome: 'correct_with_help', errorType: null,
                    needsMoreEvidence: false, daysAgo: d, phase: 'evaluate',
                    action: 'evaluate', helpLevel: 'hint', confidence: 0.65
                });
                total++;
            }
            await crearEvento(groupId, est.id, {
                ...t.equivalentes, outcome: 'incorrect', errorType: 'incomplete',
                needsMoreEvidence: true, daysAgo: 5, phase: 'practice',
                action: 'practice', helpLevel: 'none', confidence: 0.5
            });
            total++;

        } else {
            // 'pocos_datos': menos del mínimo -> fuerza el estado "insuficientes"
            await crearEvento(groupId, est.id, {
                ...t.porcentajes, outcome: 'not_evaluated', errorType: null,
                needsMoreEvidence: true, daysAgo: 2, phase: 'teach',
                action: 'teach', helpLevel: 'guided', confidence: 0.4
            });
            total++;
        }
    }

    log(`Creados ${total} evento(s) sintéticos (is_demo=1).`);
    return total;
}

/** Borra SOLO los datos marcados como demo. */
async function borrarDemo(groupId) {
    titulo('--reset: borrando datos de demostración');
    await query('DELETE FROM learning_events WHERE group_id = @param1 AND is_demo = 1', [groupId]);
    const alumnos = ESTUDIANTES_DEMO.map(e => e.username);
    for (const u of alumnos) {
        await query(
            `DELETE ge FROM group_enrollments ge
               JOIN users us ON us.id = ge.student_id
              WHERE ge.group_id = @param1 AND us.username = @param2`,
            [groupId, u]
        );
    }
    log('Eventos demo y matrículas demo eliminados (cuenta docente y grupo se conservan).');
}

// ---------------------------------------------------------------------
// main
// ---------------------------------------------------------------------
async function main() {
    const args = process.argv.slice(2);
    const reset = args.includes('--reset');

    console.log('\n════');
    console.log('  SEED DE DESARROLLO — IA Educativa / panel docente');
    console.log('════');

    const conexion = await testConnection();
    if (!conexion) {
        console.error('\n❌ No hay conexión con la base de datos. Revisa backend/.env\n');
        process.exit(1);
    }
    log('Conexión a la base de datos establecida.');
    console.log('  NODE_ENV = ' + (process.env.NODE_ENV || 'development'));

    await verificarEntorno();
    await asegurarAsignatura();
    const teacherId = await asegurarProfesor();
    const groupId = await asegurarGrupo();
    const estudiantes = await asegurarEstudiantes(groupId);
    await asegurarAsignacion(teacherId, groupId);

    if (reset) await borrarDemo(groupId);
    await crearEventosDemo(groupId, estudiantes);

    titulo('Resumen');
    console.log('  Cuenta docente : ' + CUENTA.email);
    console.log('  Rol            : ' + CUENTA.role);
    console.log('  Asignatura     : ' + CUENTA.subject);
    console.log('  Grupo          : ' + GRUPO.code);
    console.log('  Estudiantes    : ' + estudiantes.length + ' (sintéticos, is_demo)');
    console.log('\n  Inicia sesión en login.html y accede a teacher.html\n');

    process.exit(0);
}

main().catch(err => {
    console.error('\n❌ Error en el seed:', err.message);
    if (err.number) console.error('   Código SQL:', err.number);
    process.exit(1);
});
