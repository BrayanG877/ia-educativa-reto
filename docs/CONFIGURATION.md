# Configuración

Referencia de variables de entorno y proveedores de IA.
**Este documento no contiene secretos.** Las plantillas están en:

- `backend/.env.example`
- `backend/.env.production.example`

Copiar a `.env` y rellenar los valores reales. `.env` está excluido por
`.gitignore` y **nunca debe versionarse**.

## 1. Servidor

| Variable | Defecto | Descripción |
|---|---|---|
| `PORT` | `3001` | Puerto del backend. |
| `NODE_ENV` | `development` | En `production` se sirve `web/` como estático. |
| `FRONTEND_URL` | `http://localhost:3000` | Origen permitido por CORS. |

## 2. Base de datos (SQL Server)

| Variable | Descripción |
|---|---|
| `DB_HOST` | Servidor. |
| `DB_PORT` | Puerto, habitualmente `1433`. |
| `DB_NAME` | Nombre de la base. |
| `DB_USER` | Usuario. |
| `DB_PASSWORD` | Contraseña. |
| `DB_CONNECT_TIMEOUT` | Timeout de conexión (ms). |
| `DB_REQUEST_TIMEOUT` | Timeout de petición (ms). |

## 3. Redis (opcional)

| Variable | Defecto | Descripción |
|---|---|---|
| `REDIS_HOST` | `127.0.0.1` | Host. |
| `REDIS_PORT` | `6379` | Puerto (`10000` o `6380` si es gestionado con TLS). |
| `REDIS_USERNAME` | `default` | Usuario. |
| `REDIS_PASSWORD` | — | Contraseña. |
| `REDIS_TLS` | `false` | TLS explícito. |

Si Redis no responde, la aplicación sigue funcionando sin caché.

## 4. Autenticación

| Variable | Descripción |
|---|---|
| `JWT_SECRET` | Cadena larga y aleatoria. **Obligatoria.** |
| `JWT_EXPIRES_IN` | Duración del token, por defecto `24h`. |

Generar un secreto:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 5. Subsistema de IA

| Variable | Defecto | Descripción |
|---|---|---|
| `AI_PROVIDER` | `groq` | Proveedor activo. Si es explícito, no se sustituye. |
| `AI_FALLBACK_ENABLED` | `true` | Activa el respaldo entre proveedores. |
| `AI_FALLBACK_PROVIDERS` | `gemini,openrouter,anthropic` | Orden del respaldo. |
| `AI_TIMEOUT_MS` | `30000` | Timeout por petición (1000–120000). |
| `AI_MAX_RETRIES` | `1` | Reintentos con proveedor alternativo (0–3). |
| `AI_LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error`/`silent`. |
| `AI_MAX_INPUT_CHARS` | `5000` | Tope de caracteres de entrada. |
| `AI_MAX_OUTPUT_TOKENS` | `1000` | Tope de tokens de salida. |
| `AI_DEFAULT_TEMPERATURE` | `0.7` | Rango 0.0–2.0. |
| `AI_HEALTHCHECK` | `on` | `off` desactiva la comprobación de proveedores en `/health`. |
| `AI_HEALTH_TTL_MS` | `60000` | Caché de esa comprobación. |

> Nombres que **no** existen: `AI_FALLBACK_ORDER`, `AI_TEMPERATURE`, `LOG_LEVEL`.
> El código solo lee los nombres de la tabla anterior.

## 6. Proveedores

### RETO PLTK (compatible OpenAI) — modelo `grok-4.6`

| Variable | Defecto |
|---|---|
| `RETO_BASE_URL` | `https://api.reto.pltk.mx/v1` |
| `RETO_KEY` | — (obligatoria) |
| `RETO_MODEL` | `grok-4.6` |

```env
AI_PROVIDER=reto
RETO_KEY=<clave>
RETO_MODEL=grok-4.6
```

`RETO_BASE_URL` solo acepta `http`/`https`; cualquier otro valor cae al endpoint
por defecto. La URL **no** puede venir nunca de la petición del usuario.

### Groq

| Variable | Defecto |
|---|---|
| `GROQ_API_KEY` | — |
| `GROQ_MODEL` | `openai/gpt-oss-120b` |

### Google Gemini

| Variable | Defecto |
|---|---|
| `GEMINI_API_KEY` | — |
| `GEMINI_MODEL` | `gemini-flash-latest` |

### OpenRouter

| Variable | Defecto |
|---|---|
| `OPENROUTER_API_KEY` | — |
| `OPENROUTER_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` |

### Anthropic Claude (de pago)

| Variable | Defecto |
|---|---|
| `ANTHROPIC_API_KEY` | — |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` |

### Ollama (local, sin clave)

| Variable | Defecto |
|---|---|
| `OLLAMA_ENABLED` | `false` |
| `OLLAMA_HOST` | `http://localhost:11434` |
| `OLLAMA_MODEL` | `llama3.2` |

Ollama permanece deshabilitado salvo que `OLLAMA_ENABLED` sea exactamente
`true`. Tener `OLLAMA_HOST` o `OLLAMA_MODEL` no lo activa.

## 7. Agente tutor

| Variable | Defecto | Descripción |
|---|---|---|
| `AGENT_ENABLED` | `false` | Enriquecimiento del prompt con el plan pedagógico. |
| `AGENT_PERSISTENCE_ENABLED` | `false` | Escritura de evidencias en SQL Server. |
| `TEACHER_SELF_REGISTRATION` | `false` | Permite el auto-registro de profesores. **Debe permanecer `false` en producción**: el rol docente se otorga por aprovisionamiento. |

> La analítica del panel docente (`learning_events`) **no** depende de
> `AGENT_ENABLED`: se registra siempre que la migración
> `migration_teacher_panel.sql` esté aplicada, sin alterar el prompt que recibe
> el estudiante.

Ambas exigen un valor afirmativo explícito: `true`, `1`, `yes`, `on`, `si`, `sí`.
Cualquier otro valor (incluido ausente) equivale a `false`.

## 8. Límites y caché

| Variable | Defecto |
|---|---|
| `RATE_LIMIT_WINDOW_MS` | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | `100` |
| `MAX_TOKENS_PER_REQUEST` | `1000` |
| `MAX_CONVERSATION_HISTORY` | `5` |
| `CACHE_TTL_SECONDS` | `3600` |

## 9. Buenas prácticas

1. Nunca commitear `.env` ni `.env.production`.
2. Usar secretos distintos por entorno.
3. Rotar cualquier credencial que haya estado expuesta en el historial de Git.
4. En producción, inyectar las variables desde el gestor de secretos de la
   plataforma (no desde archivos en el repositorio).
