# Panel docente y analítica de aprendizaje

Documentación de la funcionalidad docente añadida a IA-Educativa: cómo se
obtiene cada indicador, qué garantiza la autorización y cómo activarla.

## 1. Resumen

El profesor autenticado accede a `teacher.html` y ve **únicamente** sus grupos y
asignaturas: estadísticas del curso, temas que requieren refuerzo, alertas
pedagógicas y el perfil académico individual de cada estudiante.

Los datos proceden de `learning_events`, una tabla de **eventos estructurados**
que el backend escribe en cada turno pedagógico. El frontend no calcula nada:
recibe agregados ya calculados en el servidor.

## 2. Modelo de datos

Migración: `backend/database/migration_teacher_panel.sql` (idempotente).

| Tabla | Función |
|---|---|
| `class_groups` | Grupo real (código, grado, institución, `is_demo`). |
| `teacher_assignments` | **Única fuente de autorización**: (profesor, asignatura, grupo). |
| `group_enrollments` | Matrícula de un estudiante en un grupo. |
| `learning_events` | Evento de aprendizaje por turno. Base de todos los indicadores. |
| `curriculum_topics` | Catálogo de temas por asignatura, con palabras clave. |

Además, `users.primary_subject` guarda la asignatura que declaró el profesor.
Es **un dato de perfil, no una autorización**: el acceso se decide siempre con
`teacher_assignments`.

> `users.grade_level` es texto libre y **no** se usa para permisos. La
> pertenencia a un grupo se decide con `group_enrollments`.

### Columnas de `learning_events`

`user_id`, `group_id`, `conversation_id`, `subject_code`, `topic`, `concept`,
`phase`, `action`, `help_level`, `hints_given`, `attempts`, `outcome`,
`error_type`, `evidence`, `source`, `confidence`, `needs_more_evidence`,
`provider`, `model`, `fallback_from`, `activity_type`, `duration_ms`,
`is_demo`, `created_at`.

No se almacena el texto de la conversación. `evidence` es una descripción
factual corta (p. ej. `tema_detectado_por_palabras_clave=3; accion=evaluate;
ayuda=hint`).

## 3. Instrumentación

`chat.controller.js` → `analytics.service.registrarEvento()` en cada turno.

El plan pedagógico se calcula con `tutor.integration.planInstrumentacion()`,
que **no** exige `AGENT_ENABLED`. Eso importa: el enriquecimiento del prompt
sigue gobernado por esa bandera (el estudiante recibe exactamente el mismo
texto), pero la analítica funciona igual.

**Registro tolerante a fallos**: si la BD falla o la migración no está
aplicada, `registrarEvento` devuelve `{persisted:false}` y el estudiante recibe
su respuesta con normalidad.

### Clasificación del tema

`learning.classifier.clasificarTema()` compara el mensaje con las palabras
clave de `curriculum_topics` (insensible a acentos y mayúsculas).

Se usa **a propósito** un clasificador por reglas y no un LLM:

- el indicador debe ser reproducible y auditable;
- dos ejecuciones del modelo darían valores distintos sobre los mismos datos;
- la confianza se registra explícitamente y una coincidencia léxica es una
  **hipótesis**, nunca un diagnóstico.

### Pedagogía del desenlace

| Situación observada | `outcome` | `help_level` |
|---|---|---|
| Correcto sin pistas | `correct` | `none` |
| Correcto tras pistas | `correct_with_help` | `hint` |
| Incorrecto tras verificar | `incorrect` | — |
| El estudiante dice que no entiende | `not_evaluated` + `error_type=not_understood` | `guided` |
| Turno sin verificación | `not_evaluated` | — |

**Una respuesta correcta después de recibir pistas no es dominio
independiente**: se registra como `correct_with_help` y sigue marcada como
hipótesis. Solo una comprobación posterior puede fijar
`needs_more_evidence = 0`.

## 4. Cálculo de los indicadores

Umbrales en `analytics.service.UMBRALES` (documentados y probados):

| Constante | Valor | Significado |
|---|---|---|
| `MIN_EVENTOS_GRUPO` | 10 | Menos eventos → `status: 'insuficientes'` |
| `MIN_EVENTOS_ESTUDIANTE` | 3 | Menos eventos → perfil parcial |
| `MIN_EVIDENCIAS_TEMA` | 3 | Menos evidencias → tema sin concluir |
| `TASA_ACIERTO_REFUERZO` | 0.5 | Por debajo → `refuerzo` |
| `TASA_ACIERTO_DOMINIO` | 0.75 | Por encima → `favorable` |

- **Tasa de acierto** = turnos con `outcome IN ('correct','correct_with_help')`
  ÷ turnos evaluados. **No es una calificación formal.**
- **Estudiantes activos** = usuarios distintos con al menos un evento en el
  período.
- **Estado por tema**: `insuficiente` → `sin_evaluacion` → `refuerzo` →
  `en_progreso` → `favorable`.
- **Evolución**: agrupada por día, solo se dibuja con ≥ 2 días con evaluaciones.

Si no hay datos, la API responde `status: 'insuficientes'` **sin** incluir
`tasaAcierto` ni listas de temas, para que la interfaz no pueda mostrar cifras
engañosas.

## 5. API

Base: `/api/teacher`. Todas las rutas exigen
`authenticateToken → loadUserRole → requireRole('teacher')`.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/groups` | Grupos y asignaturas asignados. |
| GET | `/groups/:groupId/students?subject=` | Estudiantes del grupo. |
| GET | `/groups/:groupId/stats?subject=&days=` | Analítica agregada. |
| GET | `/groups/:groupId/students/:studentId?subject=&days=` | Perfil individual. |

### Autorización (defensa en profundidad)

1. JWT válido.
2. Rol leído de la **base de datos**, no del token.
3. `requireRole('teacher')`.
4. Comprobación por recurso: debe existir
   `teacher_assignments(teacher_id, subject_code, group_id)`.
5. Para un perfil: además, el estudiante debe estar matriculado en ese grupo.

Cambiar `groupId`, `subject` o `studentId` en la URL devuelve **403**.
Un fallo de BD al comprobar la asignación **también** devuelve 403
(*fail-closed*): un error nunca se interpreta como permiso.

Validación: `groupId` entero positivo, `subject` que cumpla
`^[a-z][a-z0-9_-]{1,49}$`, `studentId` UUID, `days` en `[1,365]`.

### Privacidad

Los DTO **no** incluyen email, institución ni `password_hash`. El identificador
académico es `username`, no el correo.

## 6. Roles de usuario

- `student` — registro público. Va a la interfaz de aprendizaje.
- `teacher` — **requiere aprovisionamiento**. `TEACHER_SELF_REGISTRATION=true`
  habilita el auto-registro en entornos controlados; por defecto responde 403.
- `admin` — nunca se acepta desde el formulario.

La asignatura se valida contra el catálogo real `subjects` en el backend. El
endpoint público `GET /api/auth/subjects` alimenta el desplegable del
formulario: **fuente única**, sin listas duplicadas en el HTML.

Registrarse como profesor **no concede acceso a ningún grupo**. La asignación
es un acto administrativo explícito (`teacher_assignments`).

## 7. Activación

```bash
# 1. Aplicar la migración
sqlcmd -S <servidor> -d <base> -i backend/database/migration_teacher_panel.sql

# 2. Cuenta docente + datos demo (solo desarrollo)
cd backend
npm run seed:teacher

# 3. Iniciar sesión con la cuenta de prueba y abrir teacher.html
```

El seed se niega a ejecutarse con `NODE_ENV=production`, es idempotente y
acepta `--reset` para regenerar solo los datos `is_demo = 1`.

## 8. Datos de demostración

- Grupo `DEMO-701`, marcado con `is_demo = 1`.
- Cinco estudiantes **ficticios** (`demo_ana`, `demo_bruno`, `demo_carla`,
  `demo_diego`, `demo_elena`) con perfiles distintos: refuerzo sostenido,
  progreso favorable, dificultad en ecuaciones, datos insuficientes y falta de
  autonomía (solo acierta con pistas).
- Todos los eventos llevan `is_demo = 1` y pueden borrarse con `--reset`.

Ningún dato corresponde a estudiantes reales.

## 9. Limitaciones conocidas

- El agente no mide duración real de la sesión: `duration_ms` es el tiempo de
  respuesta del proveedor, no el tiempo de aprendizaje.
- `error_type` se deriva de la acción del agente, no de un análisis semántico
  del error del estudiante. Es una señal, no una taxonomía fina.
- Los umbrales están calibrados para grupos de 20–40 estudiantes; con cursos más
  pequeños conviene revisar `MIN_EVENTOS_GRUPO`.
- El período máximo es de 365 días y no hay paginación en la tabla de
  estudiantes (se filtra en cliente, adecuado hasta unos cientos de filas).
