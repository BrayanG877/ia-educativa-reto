# IA-Educativa

Plataforma educativa de tutoría con IA para estudiantes de colegio en Colombia.
Un tutor socrático conversa con el estudiante, genera quiz, preparación de pruebas
y materiales de estudio, y registra su progreso.

- **Backend**: Node.js 18+ y Express 4 (API REST + JWT + SQL Server + Redis).
- **Frontend**: HTML, CSS y JavaScript estático servido por el propio backend en producción.
- **Proveedores de IA**: RETO PLTK (`grok-4.6`), Groq, Google Gemini, OpenRouter,
  Anthropic Claude y Ollama local, con respaldo automático entre proveedores.

---

## 1. Arquitectura

```
.
├── backend/                 # API REST (Node.js + Express)
│   ├── src/
│   │   ├── server.js        # Punto de entrada y arranque
│   │   ├── config/          # ai.config, anthropic, database, redis
│   │   ├── routes/          # auth, chat, metrics, tools
│   │   ├── controllers/     # Lógica de cada ruta
│   │   ├── middleware/      # auth (JWT), error, rateLimit
│   │   └── services/        # ai.service, ai.providers, tutor.agent,
│   │                        # tutor.integration, cache, moderation, prompt
│   ├── database/            # Esquema y migraciones SQL Server
│   ├── test/                # Suites automatizadas (node:test)
│   ├── scripts/             # start-prod.js (lanzador de producción)
│   └── serve-web.js         # Servidor estático local del frontend
├── web/                     # Frontend estático (sin build)
├── docs/                    # Documentación técnica
└── package.json             # Scripts raíz (delegan en backend/)
```

Flujo de una petición de chat:

```
web/app.js -> POST /api/chat/message -> chat.controller
  -> ai.service (cache -> moderacion -> prompt socratico -> proveedor)
  -> tutor.integration (enriquecimiento pedagogico opcional)
  -> proveedor de IA (RETO PLTK / Groq / Gemini / ...)
  -> persistencia del historial en SQL Server
```

## 2. Requisitos

| Componente | Versión / Nota |
|---|---|
| Node.js | >= 18 (probado con Node 24) |
| npm | >= 9 |
| SQL Server | 2019+ / Azure SQL — necesario para autenticación, historial y métricas |
| Redis | Opcional: sin Redis la aplicación funciona, sin caché |
| Proveedor de IA | Al menos una clave de API, o Ollama local |

## 3. Instalación desde cero

```bash
git clone https://github.com/BrayanG877/ia-educativa-reto.git
cd ia-educativa-reto/backend
npm install
```

Crear la base de datos (SQL Server), en este orden:

```
backend/database/00_crear_base_datos.sql
backend/database/schema_sqlserver.sql
backend/database/migration_teacher_assignment.sql   # opcional
backend/database/migration_agent.sql                # solo si se activa el agente
```

Configurar variables de entorno:

```bash
cd backend
cp .env.example .env     # completar con valores reales; .env NUNCA se versiona
```

## 4. Variables de entorno imprescindibles

El archivo de referencia completo está en [`backend/.env.example`](backend/.env.example).
Las mínimas para arrancar:

```env
PORT=3001
NODE_ENV=development

# Base de datos
DB_HOST=<servidor>
DB_PORT=1433
DB_NAME=ia_educativa
DB_USER=<usuario>
DB_PASSWORD=<contrasena>

# Autenticación
JWT_SECRET=<cadena larga y aleatoria>

# Proveedor de IA
AI_PROVIDER=reto
RETO_KEY=<tu clave RETO PLTK>
RETO_MODEL=grok-4.6

# Frontend (CORS)
FRONTEND_URL=http://localhost:3000
```

## 5. Proveedor RETO PLTK y modelo `grok-4.6`

El proveedor `reto` habla el protocolo compatible con OpenAI del gateway RETO PLTK.

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `RETO_BASE_URL` | `https://api.reto.pltk.mx/v1` | Endpoint del gateway. Opcional. |
| `RETO_KEY` | — | Clave Bearer. **Obligatoria** para usar `reto`. |
| `RETO_MODEL` | `grok-4.6` | Modelo a invocar. |

Para usarlo:

```env
AI_PROVIDER=reto
RETO_KEY=...
RETO_MODEL=grok-4.6
```

Comportamiento verificado en `backend/src/services/ai.providers.js`:

- Si `AI_PROVIDER` tiene un valor **explícito**, se usa ese proveedor aunque le
  falte la clave. El flujo responde `503` con un mensaje claro en lugar de
  cambiar de proveedor en silencio.
- El respaldo (`AI_FALLBACK_ENABLED=true`, `AI_FALLBACK_PROVIDERS=...`) solo se
  activa ante errores recuperables: `401/403`, `429`, `5xx` o timeout.
- `/health` comprueba la disponibilidad de `reto` con `GET /v1/models`, sin
  consumir cuota de generación.

> La verificación de extremo a extremo contra el gateway requiere una
> `RETO_KEY` válida y consume cuota real; no la ejecutes en pruebas automáticas.

## 6. Ejecución

Desde la **raíz del repositorio**:

```bash
npm start           # node backend/src/server.js
npm run dev         # nodemon en backend/
npm test            # ejecuta las suites automatizadas del backend
```

Desde `backend/`:

```bash
npm start           # node src/server.js
npm run dev         # nodemon
npm run prod        # NODE_ENV=production multiplataforma (scripts/start-prod.js)
npm test            # node test/run-tests.js
npm run serve-web   # sirve web/ en http://localhost:3000
```

Frontend en desarrollo: abre `http://localhost:3000` tras `npm run serve-web`,
o deja que el backend lo sirva en `http://localhost:3001` con `NODE_ENV=production`.

## 7. Pruebas

```bash
cd backend
npm test
```

El runner (`backend/test/run-tests.js`) descubre todos los archivos `*.test.js`,
los ejecuta con `node:test` y **falla si descubre cero pruebas**, para evitar
falsos positivos.

Las pruebas activan `backend/test/_setup.js`, que:

- Bloquea conexiones de red, TCP y DNS.
- Sustituye `mssql` e `ioredis` por stubs en memoria.
- Elimina las credenciales reales de `process.env` para que ninguna prueba
  contacte con un proveedor externo.

## 8. Agente tutor educativo

`backend/src/services/tutor.agent.js` implementa el plan pedagógico
(diagnosticar -> enseñar -> practicar -> evaluar) y `tutor.integration.js` lo
conecta al flujo de chat.

Está **desactivado por defecto** mediante dos banderas independientes:

```env
AGENT_ENABLED=false              # enriquece el prompt con el plan pedagogico
AGENT_PERSISTENCE_ENABLED=false  # escribe evidencias en SQL Server
```

La persistencia solo tiene efecto si además hay plan, y solo tras aplicar
`backend/database/migration_agent.sql`.

## 9. Rol docente y panel de aprendizaje
El profesor accede a `teacher.html` y consulta únicamente sus grupos asignados:
estadísticas del curso, temas que requieren refuerzo, alertas pedagógicas y el
perfil académico individual de cada estudiante.

**Activación** (ver [`docs/TEACHER_PANEL.md`](docs/TEACHER_PANEL.md)):

```bash
sqlcmd -S <servidor> -d <base> -i backend/database/migration_teacher_panel.sql
cd backend && npm run seed:teacher      # cuenta + datos demo (solo desarrollo)
```

El registro como profesor requiere aprovisionamiento: `TEACHER_SELF_REGISTRATION`
debe ser `true` para permitir el auto-registro, y **registrarse no concede acceso
a ningún grupo**. La asignación (profesor, asignatura, grupo) es un acto
administrativo explícito en `teacher_assignments`.

Las estadísticas se calculan en el servidor a partir de `learning_events`,
registrados por el agente en cada turno pedagógico. Cuando no hay evidencia
suficiente la API responde `status: 'insuficientes'` en lugar de mostrar cifras
engañosas.

## 10. Documentación adicional
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — módulos, servicios y contratos.
- [`docs/TEACHER_PANEL.md`](docs/TEACHER_PANEL.md) — panel docente y analítica.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — desarrollo, pruebas y convenciones.
- [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) — variables y proveedores de IA.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — despliegue y operación.
- [`web/README.md`](web/README.md) — detalle de la interfaz.

## 11. Seguridad
- `backend/.env` y `backend/.env.production` están en `.gitignore`: **nunca** se versionan.
- Usa `backend/.env.example` y `backend/.env.production.example` como plantilla.
- No incluyas claves en documentación, scripts ni commits.
- Si una credencial se expuso alguna vez en el historial, **rótala**: borrarla de
  un commit no la elimina de los commits anteriores.
- La autorización del panel docente se decide **siempre en el backend**
  (asignación profesor–asignatura–grupo), nunca ocultando botones.
- Las respuestas del modelo se escapan antes de interpretar Markdown
  (`web/markdown.js`): solo se aceptan enlaces `http`/`https`/`mailto`.

## 12. Licencia

Proyecto educativo. Licencia MIT (ver `package.json`).
