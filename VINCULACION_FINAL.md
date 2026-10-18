# ====================================================
# GUIA DE VINCULACION FINAL - AZURE + LOCALHOST
# ====================================================

## ESTADO ACTUAL

✅ **FUNCIONANDO:**
- Tu App Service en Azure está ACTIVO y accesible
- Servidores locales funcionando (backend:3001, frontend:3000)

❌ **PENDIENTE DE CONFIGURAR:**
- Variables de entorno en Azure Portal
- Firewall de SQL Server para Azure
- Reinicio del App Service

---

## PASO 1: CONFIGURAR VARIABLES DE ENTORNO EN AZURE

**Método más rápido: Azure Portal**

1. Abre: https://portal.azure.com
2. Busca: "mini-banco77" en la barra de búsqueda
3. Click en tu App Service: **mini-banco77**
4. En el menú izquierdo: **Configuración** → **Variables de entorno**
5. Click en **"+ Agregar"** para cada variable
6. Copia y pega estas 18 variables:

### Variables a Agregar (copiar exactamente):

```
NODE_ENV = production
PORT = 8080
WEBSITE_NODE_DEFAULT_VERSION = 22-lts

DB_HOST = miservidorbr.database.windows.net
DB_PORT = 1433
DB_NAME = ia_educativa
DB_USER = adminsoloverde
DB_PASSWORD = tu_password_de_bd_aqui

REDIS_HOST = localhost
REDIS_PORT = 6379
REDIS_PASSWORD =

tu_redis_password_aqui
JWT_EXPIRES_IN = 24h

ANTHROPIC_API_KEY = tu_anthropic_api_key_aqui

RATE_LIMIT_WINDOW_MS = 900000
RATE_LIMIT_MAX_REQUESTS = 100

MAX_TOKENS_PER_REQUEST = 1000
MAX_CONVERSATION_HISTORY = 5
CACHE_TTL_SECONDS = 3600

FRONTEND_URL = https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net
```

7. Después de agregar todas, click en **"Aplicar"** (parte inferior)
8. Espera a que se guarden

---

## PASO 2: CONFIGURAR FIREWALL DE SQL SERVER

1. En Azure Portal, busca: **miservidorbr** (tu SQL Server)
2. En el menú izquierdo: **Seguridad** → **Redes**
3. En **"Excepciones"**, activa la casilla:
   - ✅ **"Permitir que los servicios y recursos de Azure accedan a este servidor"**
4. Click en **"Guardar"**

**Alternativa - Agregar regla manual:**
- Nombre de regla: `AllowAzureServices`
- IP inicial: `0.0.0.0`
- IP final: `0.0.0.0`
- Click **"Guardar"**

---

## PASO 3: REINICIAR APP SERVICE

**Opción A - Azure Portal:**
1. Ve a tu App Service: **mini-banco77**
2. En **"Información general"** (Overview)
3. Click en **"Reiniciar"** (Restart)
4. Confirma

**Opción B - Azure Cloud Shell:**
1. En Azure Portal, click en el ícono de Cloud Shell (>_) arriba a la derecha
2. Ejecuta:
```bash
az webapp restart --name mini-banco77 --resource-group mini-banco77_group
```

---

## PASO 4: VERIFICAR QUE FUNCIONA

Espera 1-2 minutos y ejecuta este script:

```powershell
.\test-produccion.ps1
```

Deberías ver:
- ✅ [Test 1] Sitio accesible
- ✅ [Test 2] Backend funcionando
- ✅ [Test 3] Login accesible

---

## VINCULACION AUTOMATICA: ¿COMO FUNCIONA?

### EN DESARROLLO (localhost):
```
http://127.0.0.1:3000/login.html
     ↓ (api-client.js detecta "localhost")
     ↓
http://localhost:3001/api/...
```

### EN PRODUCCION (Azure):
```
https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net/login.html
     ↓ (api-client.js detecta dominio de producción)
     ↓
https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net/api/...
```

### CODIGO DE DETECCIÓN AUTOMÁTICA:

En `web/api-client.js` (líneas 21-23):
```javascript
BASE_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'      // DESARROLLO
    : window.location.origin        // PRODUCCION
```

**¡NO HAY QUE CAMBIAR NADA MANUALMENTE!**

El código detecta automáticamente donde está corriendo:
- Si hostname = "localhost" → usa localhost:3001
- Si hostname = "mini-banco77-..." → usa la misma URL

---

## RESPUESTA A TUS DUDAS

### 1. ¿Por qué backend y frontend están separados?

**Arquitectura Cliente-Servidor (estándar en web moderna):**

```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND                           │
│  (HTML/CSS/JavaScript en el navegador)             │
│                                                      │
│  • Interfaz de usuario                              │
│  • Renderiza mensajes                               │
│  • Captura eventos (clicks, Enter)                  │
│  • Valida datos del usuario                         │
│                                                      │
│  ARCHIVOS: web/index.html, app.js, styles.css      │
└─────────────────────────────────────────────────────┘
                        │
                        │ HTTP/HTTPS
                        │ (Peticiones AJAX/Fetch)
                        ↓
┌─────────────────────────────────────────────────────┐
│                    BACKEND                           │
│  (Node.js + Express en el servidor)                │
│                                                      │
│  • Lógica de negocio                                │
│  • Comunicación con Claude AI                       │
│  • Acceso a base de datos                           │
│  • Autenticación JWT                                │
│  • Caché con Redis                                  │
│                                                      │
│  ARCHIVOS: backend/src/*.js                         │
└─────────────────────────────────────────────────────┘
                        │
                        ↓
            ┌───────────────────────┐
            │   SQL Server Azure    │
            │   (Base de datos)     │
            └───────────────────────┘
                        │
                        ↓
            ┌───────────────────────┐
            │   Anthropic Claude    │
            │   (API de IA)         │
            └───────────────────────┘
```

**¿Por qué separados?**

1. **Seguridad:**
   - API keys y contraseñas NUNCA van al navegador
   - Solo el backend tiene acceso a recursos sensibles

2. **Escalabilidad:**
   - Frontend puede servirse desde CDN
   - Backend puede escalar independientemente

3. **Mantenibilidad:**
   - Cambiar UI no afecta lógica de negocio
   - Cambiar backend no requiere redesplegar frontend

4. **Profesionalismo:**
   - Es la arquitectura estándar de aplicaciones web modernas
   - Permite múltiples clientes (web, mobile, desktop) usando misma API

### EN TU CASO ESPECÍFICO:

**DESARROLLO (localhost):**
- Frontend: puerto 3000 (http-server)
- Backend: puerto 3001 (Node.js)
- Son 2 procesos separados para facilitar desarrollo

**PRODUCCIÓN (Azure):**
- Frontend: servido por el backend desde `/web`
- Backend: mismo proceso en puerto 8080
- Azure los ve como UNA sola aplicación

El backend en producción hace DOBLE función:
```javascript
// server.js líneas agregadas:
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, '../../web')));
}
```

Esto sirve archivos estáticos (HTML/CSS/JS) Y responde a `/api/*`.

---

### 2. ¿Con el nuevo despliegue ya funciona todo (incluyendo IA)?

**DESPUÉS DE CONFIGURAR LAS VARIABLES:**

✅ **SÍ, TODO FUNCIONARÁ:**

1. **Login/Autenticación** → JWT funcionará
2. **Envío de preguntas** → Botón flecha + Enter
3. **Respuestas de IA** → Claude Sonnet 4 con método socrático
4. **13 Materias** → Contexto cambia según materia seleccionada
5. **Botón +** → Menú de materias funcional
6. **Menú Herramientas** → 7 herramientas (resumen, mapa mental, quiz, etc.)
7. **Historial** → Guardado en SQL Server
8. **Caché** → Redis para respuestas rápidas

**FLUJO COMPLETO:**

```
Usuario escribe pregunta → Enter/Click flecha
    ↓
app.js captura evento
    ↓
api-client.js detecta URL (prod o dev)
    ↓
POST /api/chat/ask {
    message: "¿Qué es fotosíntesis?",
    subject: "biología",
    mode: "socratic"
}
    ↓
Backend (chatController.js):
    1. Valida JWT
    2. Busca en Redis caché
    3. Si no está, llama a Claude AI
    4. Aplica método socrático
    5. Guarda en SQL Server
    6. Guarda en Redis
    7. Retorna respuesta
    ↓
Frontend recibe respuesta
    ↓
Renderiza mensaje con animación
```

**REQUISITO PARA QUE FUNCIONE:**
- ✅ Variables de entorno configuradas en Azure
- ✅ Firewall SQL Server permitiendo Azure
- ✅ App Service reiniciado

**SIN ESOS PASOS:** Backend no puede conectarse a SQL ni Claude.

---

## CHECKLIST FINAL

- [ ] Variables de entorno agregadas en Azure Portal (18 variables)
- [ ] Click en "Aplicar" para guardar
- [ ] Firewall SQL Server configurado (permitir servicios Azure)
- [ ] App Service reiniciado
- [ ] Ejecutar `.\test-produccion.ps1` para verificar
- [ ] Abrir https://mini-banco77-d2bccxa4d3c0egb3.eastus2-01.azurewebsites.net/login.html
- [ ] Login con camilamiamor@gmail.com / 2804
- [ ] Probar pregunta a la IA
- [ ] Verificar que responde con método socrático
- [ ] Probar selección de materia
- [ ] Probar herramientas

---

## SI ALGO FALLA

**Ver logs en tiempo real:**
1. Azure Portal → mini-banco77
2. Monitoring → Log stream
3. Revisa errores de conexión

**Comandos útiles:**
```powershell
# Ver configuración
az webapp config appsettings list --name mini-banco77 --resource-group mini-banco77_group

# Ver logs
az webapp log tail --name mini-banco77 --resource-group mini-banco77_group

# Reiniciar
az webapp restart --name mini-banco77 --resource-group mini-banco77_group
```

---

## RESUMEN EJECUTIVO

**AHORA MISMO:**
- ✅ Código desplegado en Azure
- ✅ App Service activo
- ❌ Variables de entorno faltantes (backend no funciona)

**DESPUÉS DE CONFIGURAR (5-10 minutos):**
- ✅ Backend conectado a SQL Server
- ✅ Backend conectado a Claude AI
- ✅ Login funcional
- ✅ IA respondiendo con método socrático
- ✅ Todas las funciones operativas

**TU TRABAJO:**
1. Agregar 18 variables en Azure Portal (5 min)
2. Configurar firewall SQL (1 min)
3. Reiniciar app (30 seg)
4. Verificar con script (30 seg)
5. ¡Usar tu IA educativa! 🎓

---

**¿Necesitas ayuda con algún paso específico?**
