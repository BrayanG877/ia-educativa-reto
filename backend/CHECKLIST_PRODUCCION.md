# 📋 CHECKLIST DE PRODUCCIÓN - IA EDUCATIVA BACKEND

## 🎯 FASE 1: PREPARACIÓN PRE-DEPLOYMENT

### ✅ Código y Configuración
- [x] Backend migrado a SQL Server Azure
- [x] Redis configurado para desarrollo y producción
- [x] JWT authentication implementado y testeado
- [x] 8/8 endpoints testeados localmente
- [x] Rate limiting configurado
- [x] Security headers (Helmet) implementados
- [x] CORS configurado
- [x] Validación con Joi en todos los endpoints
- [x] Error handling middleware completo

### ✅ Archivos Necesarios
- [x] `.env.production.example` creado
- [x] `web.config` para IIS/Azure creado
- [x] `Dockerfile` creado (opcional)
- [x] `.dockerignore` creado
- [x] `deploy-azure.ps1` script de deployment
- [x] `DEPLOYMENT_PRODUCCION.md` guía completa
- [x] `RESUMEN_PRODUCCION.md` resumen ejecutivo
- [x] `COMANDOS_AZURE.md` referencia rápida
- [x] GitHub Actions workflow `.github/workflows/azure-deploy.yml`

---

## 🔧 FASE 2: CONFIGURACIÓN DE AZURE

### ☐ 1. Anthropic API Credits
**Status**: ⏸️ PENDIENTE DEL USUARIO

```
✓ Ir a: https://console.anthropic.com
✓ Agregar créditos (mínimo $5 USD recomendado)
✓ Verificar API key funcione:
  curl https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d '{"model":"claude-3-haiku-20240307","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

**Costo estimado**: ~$0.25 USD por 1M tokens input, ~$1.25 USD por 1M tokens output

---

### ☐ 2. Azure App Service

**Crear en Azure Portal**:
```
Portal → Create a resource → Web App

Configuración:
├─ Subscription: [Tu subscription]
├─ Resource Group: ia-educativa-rg (crear nuevo)
├─ Name: ia-educativa-backend
├─ Publish: Code
├─ Runtime stack: Node 18 LTS
├─ Operating System: Linux
├─ Region: East US
└─ App Service Plan:
   ├─ Name: ia-educativa-plan
   ├─ Pricing tier: Basic B1
   └─ Costo: ~$13 USD/mes
```

**Post-creación**:
```
✓ Settings → Configuration → General settings
  └─ Startup Command: node src/server.js

✓ Settings → Configuration → Application settings
  └─ PORT = 8080
```

**Obtener información**:
```powershell
# URL del backend
https://ia-educativa-backend.azurewebsites.net

# Outbound IPs (para SQL Server firewall)
az webapp show --name ia-educativa-backend --resource-group ia-educativa-rg --query "outboundIpAddresses" --output tsv
```

---

### ☐ 3. Azure Cache for Redis

**Crear en Azure Portal**:
```
Portal → Create a resource → Azure Cache for Redis

Configuración:
├─ DNS name: ia-educativa-redis
├─ Subscription: [Tu subscription]
├─ Resource Group: ia-educativa-rg (mismo que App Service)
├─ Location: East US
├─ Cache type: Basic C0 (250 MB)
├─ Clustering: Disabled
└─ Costo: ~$16 USD/mes
```

**Post-creación**:
```
✓ Resource → Overview
  └─ Copiar: Host name (ia-educativa-redis.redis.cache.windows.net)

✓ Resource → Access keys
  ├─ Copiar: Primary key
  └─ Verificar: Port = 6380, TLS = Enabled
```

**Guardar para variables de entorno**:
```
REDIS_HOST=ia-educativa-redis.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=tu_redis_password_aqui
REDIS_TLS=true
```

---

### ☐ 4. SQL Server - Firewall Configuration

**Configurar en Azure Portal**:
```
Portal → SQL Server (miservidorbr) → Security → Networking

Reglas de Firewall:
✓ Agregar: "AllowAzureServices"
  ├─ Start IP: 0.0.0.0
  └─ End IP: 0.0.0.0

✓ Agregar: Outbound IPs del App Service
  └─ (Obtenidas en paso 2)
```

**Verificar conexión**:
```powershell
# Desde local
$env:DB_HOST="miservidorbr.database.windows.net"
$env:DB_NAME="ia_educativa"
$env:DB_USER="adminsoloverde"
$env:DB_PASSWORD="[password]"

node -e "const sql = require('mssql'); sql.connect({server:'miservidorbr.database.windows.net', database:'ia_educativa', user:'adminsoloverde', password:'[pass]', options:{encrypt:true}}).then(()=>console.log('OK')).catch(console.error)"
```

---

### ☐ 5. Application Insights (Opcional pero recomendado)

**Crear en Azure Portal**:
```
Portal → Create a resource → Application Insights

Configuración:
├─ Name: ia-educativa-insights
├─ Resource Group: ia-educativa-rg
├─ Region: East US
└─ Costo: Gratis hasta 5GB/mes
```

**Obtener connection string**:
```
Resource → Overview → Instrumentation Key
Copiar: Connection String completo
```

**Agregar a variables de entorno**:
```
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=...
```

---

## 🔐 FASE 3: VARIABLES DE ENTORNO

### ☐ Configurar en Azure App Service

**Azure Portal → App Service → Configuration → Application settings**

```
NODE_ENV = production
PORT = 8080

# Database
DB_HOST = miservidorbr.database.windows.net
DB_PORT = 1433
DB_NAME = ia_educativa
DB_USER = adminsoloverde
DB_PASSWORD = tu_password_de_bd_aqui

# Redis
REDIS_HOST = ia-educativa-redis.redis.cache.windows.net
REDIS_PORT = 6380
REDIS_PASSWORD = tu_redis_password_aqui
REDIS_TLS = true

# Anthropic
ANTHROPIC_API_KEY = tu_anthropic_api_key_aqui

# JWT (GENERAR NUEVO - IMPORTANTE!)
JWT_SECRET = [ejecutar: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"]
JWT_EXPIRES_IN = 24h

# CORS
FRONTEND_URL = https://tu-frontend.azurewebsites.net

# Rate Limiting
RATE_LIMIT_WINDOW_MS = 900000
RATE_LIMIT_MAX_REQUESTS = 100
RATE_LIMIT_AI_MAX = 10
RATE_LIMIT_AUTH_MAX = 5

# AI Config
MAX_TOKENS_PER_REQUEST = 1000
MAX_CONVERSATION_HISTORY = 5
DEFAULT_AI_MODEL = claude-3-haiku-20240307

# Logging
LOG_LEVEL = info
ENABLE_REQUEST_LOGGING = true

# Application Insights (opcional)
APPLICATIONINSIGHTS_CONNECTION_STRING = [connection-string-aqui]
```

**⚠️ CRÍTICO**: Generar un NUEVO `JWT_SECRET` - NO usar el de desarrollo:
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 🚀 FASE 4: DEPLOYMENT

### ☐ Opción A: Deployment Manual (Rápido)

**Desde PowerShell en directorio `backend/`**:
```powershell
# Asegurarse de estar en el directorio correcto
cd c:\Users\USER\Downloads\claurst-main\claurst-main\backend

# Login a Azure
az login

# Deploy
.\deploy-azure.ps1 -AppServiceName "ia-educativa-backend" -ResourceGroup "ia-educativa-rg"
```

**El script automáticamente**:
- ✓ Verifica Azure CLI
- ✓ Verifica login
- ✓ Instala dependencias de producción
- ✓ Crea ZIP del código
- ✓ Sube a Azure
- ✓ Reinicia el servicio
- ✓ Verifica health check

---

### ☐ Opción B: GitHub Actions (Recomendado para largo plazo)

**Paso 1: Obtener Publish Profile**
```
Azure Portal → App Service → Overview → Get publish profile
└─ Descargar archivo .PublishSettings
```

**Paso 2: Configurar GitHub Secret**
```
GitHub Repository → Settings → Secrets and variables → Actions
└─ New repository secret
   ├─ Name: AZURE_WEBAPP_PUBLISH_PROFILE
   └─ Value: [Pegar contenido completo del archivo .PublishSettings]
```

**Paso 3: Push a main**
```powershell
git add .
git commit -m "Deploy to production"
git push origin main
```

**Verificar deployment**:
```
GitHub → Actions tab
└─ Ver workflow "Deploy Backend to Azure App Service"
```

---

## ✅ FASE 5: VERIFICACIÓN POST-DEPLOYMENT

### ☐ 1. Health Check
```powershell
Invoke-RestMethod -Uri "https://ia-educativa-backend.azurewebsites.net/health"
```

**Respuesta esperada**:
```json
{
  "status": "OK",
  "service": "IA Educativa Backend",
  "version": "1.0.0"
}
```

---

### ☐ 2. Materias Endpoint
```powershell
$subjects = Invoke-RestMethod -Uri "https://ia-educativa-backend.azurewebsites.net/api/subjects"
$subjects.Count # Debe ser 13
```

---

### ☐ 3. Registro de Usuario
```powershell
$registerBody = @{
    email = "test.prod@example.com"
    password = "TestProd123456"
    nombre = "Usuario Producción"
    edad = 16
    grado = 11
} | ConvertTo-Json

$userResponse = Invoke-RestMethod `
    -Uri "https://ia-educativa-backend.azurewebsites.net/api/auth/register" `
    -Method POST `
    -Body $registerBody `
    -ContentType "application/json"

$userResponse
```

---

### ☐ 4. Login y JWT
```powershell
$loginBody = @{
    email = "test.prod@example.com"
    password = "TestProd123456"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod `
    -Uri "https://ia-educativa-backend.azurewebsites.net/api/auth/login" `
    -Method POST `
    -Body $loginBody `
    -ContentType "application/json"

$token = $loginResponse.token
Write-Host "Token obtenido: $token"
```

---

### ☐ 5. Perfil de Usuario (JWT Protected)
```powershell
$headers = @{
    "Authorization" = "Bearer $token"
}

$profile = Invoke-RestMethod `
    -Uri "https://ia-educativa-backend.azurewebsites.net/api/auth/profile" `
    -Headers $headers

$profile
```

---

### ☐ 6. AI Endpoint (Verificar créditos Anthropic)
```powershell
$aiBody = @{
    materia = "matematicas"
    grado = 11
    tema = "ecuaciones cuadraticas"
    mensaje = "¿Cómo resuelvo x^2 + 5x + 6 = 0?"
} | ConvertTo-Json

$aiResponse = Invoke-RestMethod `
    -Uri "https://ia-educativa-backend.azurewebsites.net/api/chat/message" `
    -Method POST `
    -Headers $headers `
    -Body $aiBody `
    -ContentType "application/json"

$aiResponse.respuesta
```

**⚠️ Si falla**: Verificar que Anthropic API tenga créditos suficientes

---

### ☐ 7. Redis Cache Verification
```powershell
# Primera llamada (sin cache - debe consultar AI)
Measure-Command {
    $response1 = Invoke-RestMethod `
        -Uri "https://ia-educativa-backend.azurewebsites.net/api/chat/message" `
        -Method POST `
        -Headers $headers `
        -Body $aiBody `
        -ContentType "application/json"
}

# Segunda llamada (con cache - debe ser más rápida)
Measure-Command {
    $response2 = Invoke-RestMethod `
        -Uri "https://ia-educativa-backend.azurewebsites.net/api/chat/message" `
        -Method POST `
        -Headers $headers `
        -Body $aiBody `
        -ContentType "application/json"
}

# Segunda llamada debe ser <100ms vs >2000ms de la primera
```

---

## 📊 FASE 6: MONITOREO Y ALERTS

### ☐ Application Insights Dashboards

**Azure Portal → Application Insights → Overview**
- ✓ Verificar que lleguen requests
- ✓ Response times < 2s promedio
- ✓ Error rate < 1%
- ✓ Dependency tracking funcionando (SQL Server, Redis, Anthropic)

---

### ☐ Configurar Alertas

**Portal → Application Insights → Alerts → New alert rule**

**Alerta 1: Response Time Alto**
```
Condition: Avg response time > 3 seconds
Window: 5 minutes
Action: Email a admin@example.com
```

**Alerta 2: Error Rate Alto**
```
Condition: Failed requests > 5%
Window: 5 minutes
Action: Email + SMS
```

**Alerta 3: Redis Down**
```
Condition: Dependency failure rate > 50%
Dependency: Redis
Window: 5 minutes
```

---

### ☐ Live Metrics

**Habilitar Live Metrics**:
```
Portal → Application Insights → Live Metrics
└─ Monitorear en tiempo real:
    ├─ Incoming Requests
    ├─ Outgoing Requests (SQL, Redis, AI)
    ├─ Overall Health
    └─ Servers Online
```

---

## 🔒 FASE 7: SEGURIDAD FINAL

### ☐ Security Checklist

- [ ] JWT_SECRET es diferente a desarrollo (64+ chars)
- [ ] DB_PASSWORD es fuerte (12+ chars, mixed case, numbers, symbols)
- [ ] REDIS_PASSWORD rotada desde default
- [ ] SQL Server firewall solo permite IPs de Azure
- [ ] CORS solo permite tu frontend URL
- [ ] Rate limiting activo (verificar con múltiples requests)
- [ ] Helmet headers activos (verificar con browser DevTools)
- [ ] HTTPS forzado (Azure lo hace automáticamente)
- [ ] No hay .env en repositorio (verificar .gitignore)
- [ ] Application Insights no registra passwords (verificar logs)

---

### ☐ Penetration Testing Básico

```powershell
# Test 1: Rate limiting en auth
1..20 | ForEach-Object {
    Invoke-RestMethod -Uri "https://ia-educativa-backend.azurewebsites.net/api/auth/login" -Method POST -Body '{"email":"fake","password":"fake"}' -ContentType "application/json" -ErrorAction SilentlyContinue
}
# Debe retornar 429 Too Many Requests después de 5 intentos

# Test 2: JWT inválido
try {
    Invoke-RestMethod `
        -Uri "https://ia-educativa-backend.azurewebsites.net/api/auth/profile" `
        -Headers @{"Authorization"="Bearer invalid_token"}
} catch {
    Write-Host "✅ JWT inválido rechazado: $($_.Exception.Response.StatusCode)"
}

# Test 3: SQL injection (debe fallar)
$sqlInjection = @{
    email = "admin' OR '1'='1"
    password = "anything"
} | ConvertTo-Json

try {
    Invoke-RestMethod `
        -Uri "https://ia-educativa-backend.azurewebsites.net/api/auth/login" `
        -Method POST `
        -Body $sqlInjection `
        -ContentType "application/json"
} catch {
    Write-Host "✅ SQL injection bloqueado"
}
```

---

## 📈 FASE 8: PERFORMANCE TUNING

### ☐ Optimizaciones

**App Service**:
```
Settings → Configuration → General settings
├─ Always On: Yes (evita cold starts)
├─ ARR affinity: Off (mejor load balancing)
└─ Minimum TLS Version: 1.2
```

**Redis Cache**:
```
Settings → Advanced settings
└─ Maxmemory policy: allkeys-lru (evict least recently used)
```

**SQL Server**:
```
Verificar índices en:
├─ users (email)
├─ conversations (user_id, created_at)
├─ messages (conversation_id)
└─ cache_responses (cache_key)
```

---

## 🎉 CHECKLIST FINAL

### ✅ Pre-Launch Verification

- [ ] Todos los endpoints responden correctamente
- [ ] JWT authentication funciona
- [ ] Redis caching funciona
- [ ] AI endpoints retornan respuestas (Anthropic credits OK)
- [ ] Database operaciones funcionan (CRUD completo)
- [ ] Rate limiting activo y testeado
- [ ] Logs llegando a Application Insights
- [ ] Health check retorna 200 OK
- [ ] No hay errores en logs de Azure
- [ ] Variables de entorno todas configuradas
- [ ] SSL certificate válido (Azure auto)
- [ ] CORS permite frontend correcto

---

### 🚀 LAUNCH READY

Una vez completado todo el checklist:

```
✅ Backend en producción en Azure
✅ Alta disponibilidad con Azure SLA 99.95%
✅ Monitoreo activo con Application Insights
✅ Caché optimizado con Redis
✅ Base de datos segura en SQL Server Azure
✅ API de IA funcionando con Anthropic Claude
✅ Seguridad implementada (JWT, rate limiting, CORS, Helmet)
✅ CI/CD configurado para deployments automáticos
```

**Next steps**:
1. Conectar frontend al backend en producción
2. Configurar dominio custom (opcional)
3. Setup monitoreo de costos en Azure
4. Implementar estrategia de backups
5. Plan de disaster recovery

---

**Estimado de tiempo total**: 2-3 horas
**Costo mensual**: ~$34 USD + costos de Anthropic API (variable)
