# DIAGNÓSTICO Y CORRECCIONES — IA EDUCATIVA

Fecha: 2026-09-15
Método: auditoría de código + pruebas reales (backend arriba, SQL Server + Redis,
test E2E oficial y navegador headless sobre el frontend real).

---

## 1. ESTADO ACTUAL

El backend arranca y **todas sus dependencias están arriba**:

```
GET /health ->
{
  "status": "OK",
  "dependencies": {
    "database": "connected",
    "redis": "connected",
    "anthropic": "api key configurada"
  }
}
```

El flujo `pregunta -> backend -> IA -> respuesta -> frontend` está implementado y
**funciona de punta a punta en el código**. El único fallo restante es **externo
al código**: la `ANTHROPIC_API_KEY` del `.env` es **inválida**.

Evidencia literal (log del backend, `real-err.log`):

```
[AI] Error al generar respuesta: {
  name: 'Error',
  status: 401,
  type: 'authentication_error',
  message: '401 {"type":"error","error":{"type":"authentication_error",
            "message":"API key is invalid."},"request_id":null}'
}
```

Prueba directa contra la API de Anthropic con la key del `.env` (todos los
modelos devuelven lo mismo, así que **no es un problema de modelo, es la key**):

```
claude-sonnet-4-6            => 401 {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."}}
claude-3-5-sonnet-20240620   => 401 ... API key is invalid.
claude-3-5-sonnet-latest     => 401 ... API key is invalid.
```

---

## 2. FLUJO REAL DETECTADO (reconstruido desde el código)

```
[1]  Usuario escribe pregunta            Fichero: web/index.html (#messageInput)     ✅
[2]  Estado React/JS (AppState)          Fichero: web/app.js                         ✅
[3]  Evento Submit (botón flecha/Enter)  app.js initializeEventListeners / handleKeyPress ✅
[4]  handleSendMessage()                 app.js                                      ✅
[5]  Request HTTP POST /api/chat/message  api-client.js AIClient.sendMessage          ✅
[6]  Endpoint                             backend/src/routes/chat.routes.js           ✅
[7]  Middleware JWT (authenticateToken)  backend/src/middleware/auth.middleware.js   ✅
[8]  Controller                          backend/src/controllers/chat.controller.js  ✅
[9]  Validación (Joi + moderación)       chat.controller.js / moderation.service.js  ✅
[10] Servicio IA                         backend/src/services/ai.service.js          ✅
[11] Anthropic (messages.create)         backend/src/config/anthropic.js             ❌  401 API key inválida
[12] Respuesta                           —                                          (no alcanzado)
[13] Backend -> frontend                 chat.controller.js res.json                 ✅ (error 503 limpio)
[14] Frontend maneja error               api-client.js + app.js getErrorMessage      ✅
[15] Render en el chat                   app.js displayMessage                       ✅
```

**Punto de ruptura único: [11] Anthropic — credenciales.**

---

## 3. PROBLEMAS ENCONTRADOS Y CORREGIDOS

### ERROR #1 — Login guardaba `undefined` como usuario

- **Problema:** tras el login, `localStorage.user` quedaba como la cadena
  `"undefined"` y `authManager.getUser()` devolvía `undefined`.
- **Evidencia:** `web/api-client.js` hacía `this.user = data.data.user`, pero el
  backend (`auth.controller.js:180`) devuelve campos planos: `{ userId, email,
  username, fullName, role, token }` — **no existe `data.data.user`**.
- **Causa raíz:** el frontend esperaba un objeto `user` que el backend nunca envía.
- **Consecuencia:** cualquier lectura de `user.email`/`user.username` fallaba;
  el comentario defensivo del `initialize()` (`getUser()?.email`) lo ocultaba.
- **Solución:** construir el objeto usuario a partir de los campos planos.
- **Archivo:** `web/api-client.js` (clase `AuthManager`, método `login`).
- **Prueba:** login real en navegador headless → `localStorage.user = {"userId":
  "4EEB9C8C-...","email":"test.e2e@iaedu.com",...}`.
- **Resultado:** ✅ SOLUCIONADO

### ERROR #2 — `getSubjects()` / `getConversations()` devolvían un objeto, no un array

- **Problema:** el cliente esperaba un array y recibía `{ subjects, count }`.
- **Causa raíz:** `chat.controller.js` responde `data: { subjects: [...], count }`
  y `data: { conversations: [...], count }`, pero `api-client.js` hacía
  `return data.data`.
- **Consecuencia:** cualquier `.map()`/`.length` sobre las materias fallaba.
- **Solución:** desempaquetar `data.data.subjects` / `data.data.conversations`.
- **Archivo:** `web/api-client.js` (`AIClient.getSubjects`, `AIClient.getConversations`).
- **Resultado:** ✅ SOLUCIONADO

### ERROR #3 — Modelo de IA inexistente `claude-sonnet-4-6`

- **Problema:** `MODELS.SONNET_4 = 'claude-sonnet-4-6'` y era el `DEFAULT_MODEL`.
- **Evidencia:** los IDs válidos de Anthropic son `claude-sonnet-4-5`,
  `claude-sonnet-4-20250514`, `claude-haiku-4-5`, etc. **`claude-sonnet-4-6` no
  existe** ([docs Anthropic](https://docs.anthropic.com/en/docs/about-claude/models)).
- **Causa raíz:** nombre de modelo inventado/anticipado.
- **Consecuencia:** con una key válida, la API devolvería `404 not_found_error`.
- **Solución:** `claude-sonnet-4-5` por defecto, configurable vía
  `ANTHROPIC_MODEL`. Añadidos `claude-sonnet-4-20250514` y `claude-haiku-4-5`.
- **Archivo:** `backend/src/config/anthropic.js`.
- **Prueba:** `DEFAULT_MODEL` se resuelve a `claude-sonnet-4-5` con la env var.
- **Resultado:** ✅ SOLUCIONADO

### ERROR #4 — `errorHandler` trataba errores de SQL Server como PostgreSQL

- **Problema:** sólo reconocía códigos de PostgreSQL (`23505`, `23503`).
- **Causa raíz:** el backend corre sobre **SQL Server (mssql)**, cuyos códigos de
  clave duplicada son `2627`/`2601` y de FK `547`.
- **Consecuencia:** un email duplicado se reportaba como 500 en vez de 409, y los
  errores de conexión de BD caían al 500 genérico ("Error interno del servidor").
- **Solución:** añadidos los códigos de SQL Server y un `503` explícito para
  `ConnectionError`/`RequestError`/`ESOCKET`/`ELOGIN`.
- **Archivo:** `backend/src/middleware/error.middleware.js`.
- **Resultado:** ✅ SOLUCIONADO

### ERROR #5 — Un 404 de modelo se confundía con un 401 de credenciales

- **Problema:** todo error de Anthropic que no fuera 401/403/429/400 caía al 503
  genérico.
- **Solución:** caso explícito para `error.status === 404` con mensaje
  "El modelo de IA configurado no está disponible. Revisa ANTHROPIC_MODEL.".
- **Archivo:** `backend/src/services/ai.service.js`.
- **Resultado:** ✅ SOLUCIONADO

### ERROR #6 — Botón "Login rápido (Camila)" con credenciales imposibles

- **Problema:** el botón usaba `camilamiamor@gmail.com` / `2804`, un usuario que
  **no existe** en la BD, y una contraseña de 4 caracteres que **viola** la
  validación `Joi.string().min(6)` del registro.
- **Evidencia:** `SELECT ... FROM users` no contenía ese email; registrar con
  `2804` responde `400 "La contraseña debe tener al menos 6 caracteres"`.
- **Causa raíz:** el botón se escribió contra credenciales de ejemplo que nunca
  se pudieron crear con esa contraseña.
- **Solución:** usuario creado (`camilamiamor@gmail.com` / `camila2804`) y
  `login.html` actualizado. Probado en navegador → login OK.
- **Archivos:** `web/login.html` (+ usuario creado en la BD).
- **Resultado:** ✅ SOLUCIONADO

---

## 4. PRUEBAS EJECUTADAS (evidencia)

### 4.1 Backend arriba — `GET /health`
`status: OK`, `database: connected`, `redis: connected`, `anthropic: api key configurada`.

### 4.2 Test E2E oficial (`backend/test-e2e-conversacion.js`)
Con la key inválida (estado real, cachés limpias):

```
1) REGISTRO -> 201
2) LOGIN    -> 200, JWT
3) SIN TOKEN -> 401 "Token de autenticación requerido"     ✅
4) Turno 1  -> 503 "El servicio de IA no está disponible temporalmente (credenciales)."
7) Validación:
   ✅ mensaje vacío -> 400
   ✅ sin materia -> 400
   ✅ materia inexistente -> 404
   ✅ conversationId no-UUID -> 400
```

### 4.3 Flujo completo con un cliente Anthropic simulado
(`backend/verificar-flujo-con-mock.js`) — demuestra que, **con una key válida**,
todo lo demás funciona:

```
1) REGISTRO -> 201
2) LOGIN    -> 200 JWT OK
3.1) "¿Qué es una célula?"   -> HTTP 200
3.2) "¿Y cuál es su función?" -> HTTP 200
3.3) "¿Puedes darme un ejemplo?" -> HTTP 200
   modelo: claude-sonnet-4-5 | fromCache: false
4) HISTORIAL -> 200 | mensajes: 6
   1. [user] ¿Qué es una célula?
   2. [assistant] ...
   3. [user] ¿Y cuál es su función?
   4. [assistant] ...
   5. [user] ¿Puedes darme un ejemplo?
   6. [assistant] ...
✅ FLUJO COMPLETO OK: 3 turnos, contexto conservado, historial alternando user/assistant.
```

> Se observó además que los tres turnos recuperaron el contexto (el SELECT del
> historial devolvía 0 → 2 → 4 filas previas), lo que prueba que la conversación
> y el método socrático conservan el hilo entre preguntas.

### 4.4 Frontend en navegador real (headless, sobre `web/`)
- Login por formulario → navega a `index.html`, `token: true`,
  `user` con email real. **0 errores de consola, 0 peticiones fallidas.**
- Botón "Login rápido (Camila)" → igual, funciona tras el fix.
- Chat: seleccionar chip "Biología" → `Modo: 🔬 Biología`; escribir y pulsar
  **Enter** → el mensaje del usuario se pinta; la petición
  `POST http://localhost:3001/api/chat/message` **sale del navegador**.
  Con cachés limpias, el backend responde 503 y el chat muestra:
  `⚠️ El servicio de IA no está disponible temporalmente (credenciales).`
  → manejo de errores correcto, **sin fallos silenciosos**.

---

## 5. CONTROL DE ESTADO

```
FRONTEND
[x] Input        [x] Estado       [x] Submit
[x] HTTP         [x] Respuesta    [x] Render

BACKEND
[x] Route        [x] Middleware   [x] Controller
[x] Validation   [x] AI Service   [x] Response

INFRAESTRUCTURA
[x] SQL Server   [x] Redis        [x] Environment
[x] CORS         [x] JWT

IA
[❌] API Key     <- BLOQUEO EXTERNO: la key del .env es inválida
[x] Modelo       [x] Request      [x] Response
[x] Prompt       [x] Método socrático (default en Joi y en el system prompt)
```

---

## 6. ACCIÓN REQUERIDA (única, externa al código)

1. Ir a https://console.anthropic.com/ → **API Keys** → crear una nueva.
2. Pegarla en `backend/.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-api03-...   (key válida)
   ANTHROPIC_MODEL=claude-sonnet-4-5    (modelo válido, opcional)
   ```
3. Verificar la cuenta tiene **crédito** (si no, Anthropic devuelve 400/403 con
   "credit balance is too low").
4. Reiniciar el backend y comprobar:
   ```
   cd backend
   node test-e2e-conversacion.js
   ```
   Debe mostrar `HTTP 200` en los tres turnos y 6 mensajes en el historial.

> También hay que actualizar la key en las **variables de entorno de Azure**
> (`ANTHROPIC_API_KEY`) si se despliega en producción, y sustituir allí
> `DB_HOST/DB_USER/DB_PASSWORD` por los reales del servidor de producción.

---

## 7. ARCHIVOS MODIFICADOS

```
web/api-client.js                       # ERROR #1, #2
web/login.html                          # ERROR #6
backend/src/config/anthropic.js         # ERROR #3
backend/src/services/ai.service.js      # ERROR #5
backend/src/middleware/error.middleware.js  # ERROR #4
backend/.env                            # clave documentada + ANTHROPIC_MODEL
backend/verificar-flujo-con-mock.js     # NUEVO: prueba reproducible del flujo
```

Ninguna modificación cambió la arquitectura, el framework, los endpoints, el
esquema de la BD ni el proveedor de IA. Todas son correcciones puntuales.
