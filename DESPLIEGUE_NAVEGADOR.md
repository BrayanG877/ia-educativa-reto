# 🚀 DESPLEGAR EN EL NAVEGADOR — Paso a Paso

> **Tu App Service:** `ia-educativa-br-b7gggrhcg6cxedfy.westus3-01.azurewebsites.net`
> **Paquete listo:** `deploy-ia-educativa.zip` (ya creado en la raíz del proyecto)
> **Estado verificado:** backend probado en modo producción → `/health` = OK (BD + Redis + IA conectados)

---

## 📋 Antes de empezar

Ya dejé listas dos cosas clave:

1. **`deploy-ia-educativa.zip`** — el paquete con backend + frontend + configuración correcta.
   Los scripts de empaquetado (Fase 5C.1) excluyen explícitamente `node_modules`, `.env`,
   `.env.production`, `.backups/`, `test/` y credenciales, y **validan el ZIP antes de publicarlo**
   (abortan si detectan un archivo prohibido). Ver la nota de la sección «variables sensibles»
   más abajo: la exclusión está verificada por código, no solo afirmada.
2. **`web.config` corregido** — el anterior usaba `iisnode`, que está obsoleto y hacía que
   el backend NO arrancara (por eso tu sitio mostraba la página de bienvenida de Azure).

---

## ✅ Tu App Service es LINUX (confirmado)

Esto significa:
- El **`web.config` NO se usa** (es sólo para Windows — puede quedar ahí sin molestar).
- **Todo depende del Startup Command** (`bash startup.sh`). Si no lo configuras, la app no arranca.
- El arranque se probó simulando exactamente Linux: ZIP extraído + `npm install` + variables → `HEALTH: OK`.

---

## 🅰️ OPCIÓN 1 — Subir el ZIP por el Portal (RECOMENDADO, no necesitas instalar nada)

### 1. Abre Azure Portal
```
https://portal.azure.com
```

### 2. Busca tu App Service
En la barra superior escribe: **`ia-educativa-br`** y haz clic en él.

### 3. Sube el archivo
**Menú izquierdo → Implementación → Centro de implementación**
(Deployment Center)

- En **Origen**, elige **Usuario local / Local Git** o **Archivo ZIP** según lo que ofrezca.
- La vía más simple: **"Cargar el archivo ZIP"** / **"Descargar archivos"**.
- Selecciona tu archivo:
  ```
  C:\Users\USER\Downloads\claurst-main\claurst-main\deploy-ia-educativa.zip
  ```
- Confirma.

> 💡 Si tu portal no muestra la opción de ZIP, usa el **Debug Console / Kudu** (sección C).

### 5. Espera
Verás "Deployment completed successfully". Puede tardar **2-5 minutos** la primera vez.

---

## 🅱️ Paso 2 — Configurar el Startup Command (OBLIGATORIO en Linux)

**Configuración → Configuración general → Comando de inicio (Startup Command):**

```
bash startup.sh
```

Y guarda. Esto le dice a Azure que ejecute `startup.sh`, que:
- entra a `backend/`,
- instala las dependencias correctas (¡incluido `mssql ^12`!),
- y arranca el servidor en el puerto que Azure asigna.

> Si NO pones el Startup Command, Azure intentará `npm start` de la raíz, que puede
> instalar la versión equivocada de `mssql` y fallar con "Cannot find module".

---

## 🔑 Paso 3 — Pegar las variables de entorno (OBLIGATORIO)

**Configuración → Variables de entorno → + Agregar** (una por una):

| Nombre | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `WEBSITE_NODE_DEFAULT_VERSION` | `22-lts` |
| `AI_PROVIDER` | `groq` |
| `GROQ_API_KEY` | *(tu key de Groq)* |
| `GROQ_MODEL` | `openai/gpt-oss-120b` |
| `DB_HOST` | `sql-ia-educativa.database.windows.net` |
| `DB_PORT` | `1433` |
| `DB_NAME` | `ia_educativa` |
| `DB_USER` | `brca` |
| `DB_PASSWORD` | *(tu password)* |
| `REDIS_HOST` | `IA-EDUCATIVA-REDIS.westus3.redis.azure.net` |
| `REDIS_PORT` | `10000` |
| `REDIS_USERNAME` | `default` |
| `REDIS_PASSWORD` | *(tu Access Key)* |
| `REDIS_TLS` | `true` |
| `JWT_SECRET` | *(una cadena larga y aleatoria)* |
| `JWT_EXPIRES_IN` | `24h` |
| `RATE_LIMIT_WINDOW_MS` | `900000` |
| `RATE_LIMIT_MAX_REQUESTS` | `600` |
| `MAX_TOKENS_PER_REQUEST` | `1000` |
| `MAX_CONVERSATION_HISTORY` | `5` |
| `CACHE_TTL_SECONDS` | `3600` |
| `FRONTEND_URL` | `https://ia-educativa-br-b7gggrhcg6cxedfy.westus3-01.azurewebsites.net` |

> 📄 La lista completa lista para copiar está en **`variables-para-copiar.txt`**.

**⚠️ MUY IMPORTANTE:** después de agregarlas, haz clic en **"Aplicar"** (abajo del todo).
Si no lo haces, no se guardan (es el error más común).

---

## 🔥 Paso 4 — Firewalls (causa #1 de fallos)

### 4.1 Azure SQL — permite que App Service se conecte
Portal → **SQL servers → sql-ia-educativa → Redes** (Networking):
- ✅ **"Permitir que los servicios y recursos de Azure accedan a este servidor"**
- **Guardar**

### 4.2 Redis — verifica que sea público
Portal → tu **Azure Managed Redis → Redes**:
- Confirma que NO está sólo con Private Endpoint (el App Service no lo alcanzaría).
- Si es privado, agrégale el acceso público o la IP del App Service.

---

## 🔄 Paso 5 — Reiniciar y probar

**Información general → Reiniciar** (Restart). Espera 2-3 minutos.

Luego prueba en el navegador:
```
https://ia-educativa-br-b7gggrhcg6cxedfy.westus3-01.azurewebsites.net/health
```

Debe responder:
```json
{
  "status": "OK",
  "dependencies": {
    "database": "connected",
    "redis": "connected",
    "ai": "groq (openai/gpt-oss-120b)"
  }
}
```

Y la app en el navegador:
```
https://ia-educativa-br-b7gggrhcg6cxedfy.westus3-01.azurewebsites.net/login.html
```

---

## 🅲 Alternativa — Subir por Kudu (si el ZIP del portal no aparece)

1. Abre: `https://ia-educativa-br-b7gggrhcg6cxedfy.scm.azurewebsites.net/DebugConsole`
2. Arriba a la derecha hay un botón **"Bash"** (Linux) — úsalo.
3. Ve a `/home/site/wwwroot` y **borra todo** (incluido `hostingstart.html`).
4. Arrastra **el contenido del ZIP** (no el ZIP) a `wwwroot`.
   - Descomprime `deploy-ia-educativa.zip` en tu PC primero.
   - Arrastra las carpetas `backend`, `web` y los archivos `package.json`, `startup.sh`, `.deployment` (el `web.config` puede ir o no).

> 💡 En Linux también puedes desplegar por **Git** o por **Deployment Center → Usuario local / FTPS**.

---

## 🐛 Si algo falla — ver los logs

```
Portal → tu App Service → Supervisión → Flujo de registro (Log stream)
```

| Error que veas | Causa | Solución |
|---|---|---|
| `Cannot find module 'mssql'` | Deps instaladas en carpeta equivocada | Configura Startup Command `bash startup.sh` |
| `Cannot connect to SQL` | Firewall SQL | Paso 4.1 |
| `WRONGPASS` en Redis | Access Key mal pegada | Revisa `REDIS_PASSWORD` |
| Página de bienvenida de Azure | Código no desplegado | Repite paso 4 (subir ZIP) |
| `EADDRINUSE` | Proceso viejo colgado | Reinicia el App Service |
| Nada conecta, todo lento | Variables sin guardar | Verifica "Aplicar" en el paso 3 |
| IA responde con Ollama/error | Falta `AI_PROVIDER=groq` en variables | Agrega esa variable y Aplica |

---

## 🧠 Hallazgo importante sobre la IA (probado)

Al simular Azure **sin** las variables de entorno, el sistema cayó al proveedor por defecto
(`ollama`) y avisó que la BD no conectaba. Al poner **las variables correctas**, quedó:
```
HEALTH: OK | BD: connected | Redis: connected | IA: groq
```

➡️ **Por eso es obligatorio el Paso 3 completo:** sin `AI_PROVIDER=groq` y las credenciales,
la IA no usará Groq y la BD fallará. Con las variables, todo queda en verde.

---

## ✅ Checklist final

- [ ] ZIP subido (`deploy-ia-educativa.zip`)
- [ ] SO del App Service identificado (Linux/Windows)
- [ ] Startup Command = `bash startup.sh` (si Linux)
- [ ] Las 24 variables de entorno pegadas
- [ ] Clic en **"Aplicar"** después de las variables
- [ ] Firewall Azure SQL activado
- [ ] Redis accesible (no sólo privado)
- [ ] App Service reiniciado
- [ ] `/health` responde OK
- [ ] `/login.html` carga en el navegador

---

## 💡 Nota sobre las variables sensibles

`REDIS_PASSWORD`, `DB_PASSWORD`, `GROQ_API_KEY` y demás claves son secretos. **NO deben viajar dentro del ZIP**.
Se configuran sólo como variables de entorno en el portal de Azure.

> **Verificación (Fase 5C.1).** La exclusión ya no es una afirmación sin respaldo: los scripts de
> empaquetado (`deploy-to-azure.ps1`, `crear-zip-*.ps1`, `crear-paquete-azure.ps1`, `despliegue-*.ps1`,
> `subir-a-kudu.ps1`, `backend/deploy-azure.ps1`) cargan el módulo compartido `pack-exclusions.ps1` y
> llaman a `Assert-PaqueteLimpio` sobre el ZIP resultante, que **aborta la publicación** si encuentra
> `.env*` reales (salvo `.example`), `.backups/`, `*.secret-backup-*`, `node_modules/`, `test/`,
> credenciales o logs. La comprobación está cubierta por pruebas automatizadas
> (`backend/test/ai.packaging-exclusions.test.js`, ejecutadas con `npm test`).
>
> ⚠️ **Los ZIP generados ANTES de la Fase 5C.1 sí contenían `.env`/`.env.production`** (verificado).
> No reutilices paquetes antiguos: regenera el paquete con los scripts corregidos y confirma el
> mensaje `[VALIDACION] OK` antes de subirlo.
