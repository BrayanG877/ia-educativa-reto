/**
 * Rutas del Panel Docente — /api/teacher
 * ------------------------------------------------------------------
 * Todas las rutas exigen, EN ESTE ORDEN:
 *   authenticateToken -> loadUserRole -> requireRole('teacher')
 * La autorización por grupo/asignatura se valida dentro del controlador.
 */
const express = require('express');
const router = express.Router();

const teacherController = require('../controllers/teacher.controller');
const { authenticateToken, loadUserRole, requireRole } = require('../middleware/auth.middleware');

// Cadena de autorización común a todo el panel.
router.use(authenticateToken, loadUserRole, requireRole('teacher'));

/** Grupos y asignaturas asignados al profesor autenticado. */
router.get('/groups', teacherController.getGroups);

/** Estudiantes inscritos en un grupo autorizado. */
router.get('/groups/:groupId/students', teacherController.getGroupStudents);

/** Estadísticas agregadas del grupo. */
router.get('/groups/:groupId/stats', teacherController.getGroupStats);

/** Perfil de aprendizaje individual de un estudiante del grupo. */
router.get('/groups/:groupId/students/:studentId', teacherController.getStudentProfile);

module.exports = router;
