# Arquitectura

Resumen de módulos, responsabilidades y contratos de IA-Educativa.
Todos los puntos descritos se verificaron leyendo el código de `backend/src/`.

## 1. Backend

Punto de entrada: `backend/src/server.js`.

### 1.1 Arranque

`startServer()` se ejecuta **solo** cuando el archivo es el programa principal
(`require.main === module`). Así, importar el módulo en una prueba no abre
puertos ni conecta a servicios externos.

Secuencia de arranque:

1. Conecta a SQL Server. Si falla, **no aborta**: arranca en modo degradado y
   `/health` informa del error.
2. Conecta a Redis. Es opcional; si no está disponible se continúa sin caché.
3. Valida la configuración de IA (`ai.config.validate()`) sin imprimir secretos.
4. Escucha en `PORT` (por defecto `3001`).

### 1.2 Capas

| Carpeta | Responsabilidad |
|---|---|
| `config/` | `database.js` (SQL Server vía `mssql`), `redis.js` (`ioredis`), `ai.config.js` (variables del subsistema de IA), `anthropic.js` (cliente Anthropic SDK). |
| `routes/` | Definición de endpoints y montaje de middlewares por ruta. |
| `controllers/` | Validación de entrada, orquestación y respuesta HTTP. |
| `middleware/` | `auth` (JWT + carga de rol desde BD), `error`, `rateLimit`. |
| `services/` | Lógica de negocio y de IA (ver abajo). |

### 1.3 Servicios

| Archivo | Función |
|---|---|
| `ai.providers.js` | Adaptadores de proveedor (`anthropic`, `reto`, `gemini`, `groq`, `openrouter`, `ollama`), `getProviderName()`, `describeSelection()`, `listProviders()`, `checkAvailability()` y `getSecondaryProvider()`. Es la **fuente única** de la decisión de enrutado. |
| `ai.service.js` | Flujo completo de una consulta a la IA: caché → moderación → prompt → proveedor → normalización de errores (`toAppError`). |
| `cache.service.js` | Caché de respuestas en Redis. |
| `moderation.service.js` | Filtrado de contenido no educativo. |
| `prompt.service.js` | Construcción de prompts socráticos y de contexto. |
| `tutor.agent.js` | Plan pedagógico: diagnóstico, enseñanza, práctica y evaluación. |
| `tutor.integration.js` | Puente opcional entre el agente y el flujo de chat, con las banderas `AGENT_ENABLED` / `AGENT_PERSISTENCE_ENABLED`. |

### 1.4 Selección y respaldo de proveedores

Hay **dos listas distintas** que no deben confundirse:

- `AI_FALLBACK_PROVIDERS` — orden del **respaldo** cuando el proveedor activo
  falla con un error recuperable.
- `FALLBACK_ORDER` (interno) — orden para **elegir** el proveedor activo cuando
  `AI_PROVIDER` no está definido o es desconocido.

Regla de enrutado:

```
AI_PROVIDER explícito y conocido  -> se usa ese proveedor (haya o no credencial)
AI_PROVIDER ausente o desconocido -> primer proveedor de FALLBACK_ORDER configurado
Ninguno configurado               -> 'groq' como pista para el mensaje de error
```

Si se pidió explícitamente un proveedor sin credencial, la petición falla con
`503` y un mensaje que indica la variable a configurar. **No hay sustitución
silenciosa.**

## 2. Contrato de la API

Base: `/api`. Autenticación por `Authorization: Bearer <JWT>`.

### Autenticación — `/api/auth`

| Método | Ruta | Auth |
|---|---|---|
| POST | `/register` | No (rate limited) |
| POST | `/login` | No (rate limited) |
| POST | `/logout` | Sí |
| GET | `/me` | Sí |
| POST | `/verify-email` | No |
| POST | `/forgot-password` | No (rate limited) |
| POST | `/reset-password` | No (rate limited) |

### Chat — `/api/chat`

| Método | Ruta | Auth |
|---|---|---|
| POST | `/message` | Sí |
| GET | `/history/:conversationId` | Sí |
| GET | `/conversations` | Sí |
| POST | `/conversation/new` | Sí |
| DELETE | `/conversation/:conversationId` | Sí |
| POST | `/icfes/question` | Sí |
| GET | `/subjects` | No |

### Herramientas — `/api/tools`

`POST /test-prep`, `/quiz`, `/evaluation`, `/mindmap`, `/conceptmap`,
`/image-prompt`, `/video-script`.

### Métricas — `/api/metrics`

| Método | Ruta | Auth |
|---|---|---|
| GET | `/user/:userId` | Sí + rol |
| GET | `/ranking` | Sí |
| GET | `/stats` | Sí |
| POST | `/update` | Sí |
| GET | `/cache` | Sí + rol `admin` |

### Diagnóstico

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado de BD, Redis y proveedor de IA. |
| GET | `/api/ai/providers` | Lista de proveedores con su estado. **No expone claves.** |
| GET | `/` | Sirve el frontend. |

## 3. Persistencia

Motor: **Microsoft SQL Server** (paquete `mssql`).

| Script | Contenido |
|---|---|
| `database/00_crear_base_datos.sql` | Creación de la base. |
| `database/schema_sqlserver.sql` | Esquema principal. |
| `database/schema.sql` | Esquema de referencia. |
| `database/migration_teacher_assignment.sql` | Asignación profesor–estudiante. |
| `database/migration_agent.sql` | Tablas `agent_evidence` y `agent_difficulties`. |

## 4. Frontend

`web/` es estático, sin proceso de build ni dependencias npm.

| Archivo | Rol |
|---|---|
| `index.html` | Chat principal + panel de progreso. |
| `login.html`, `register.html` | Autenticación. |
| `app.js` | Lógica de la interfaz. |
| `api-client.js` | Cliente HTTP y gestión del token. |
| `styles.css` | Estilos. |
| `diagnostico.html`, `test-connection.html`, `fix-cache.html` | Utilidades de diagnóstico en el navegador. |

En producción (`NODE_ENV=production`) el backend sirve `web/` como estático desde
`app.use(express.static(...))`.
