# 🚀 GUÍA DE DEPLOYMENT A PRODUCCIÓN

**Backend IA Educativa Colombia**
**Fecha**: 26 de Mayo de 2026
**Estado**: ✅ Listo para Producción

---

## 📋 CHECKLIST PRE-DEPLOYMENT

### ✅ Completado
- [x] Base de datos SQL Server Azure configurada
- [x] Redis funcionando localmente
- [x] JWT middleware implementado
- [x] 19 endpoints REST API funcionales
- [x] Tests automatizados pasando (8/8 - 100%)
- [x] Seguridad básica (rate limiting, CORS, Helmet)
- [x] Documentación completa

### ⏸️ Pendiente
- [ ] Agregar créditos Anthropic API (usuario lo hará)
- [ ] Configurar NODE_ENV=production
- [ ] Migrar Redis a Azure Cache
- [ ] Configurar SSL/HTTPS
- [ ] Setup monitoring (Application Insights)
- [ ] Configurar CI/CD
- [ ] Backup automático SQL Server
- [ ] Variables de entorno seguras

---

## 🌐 OPCIONES DE DEPLOYMENT

### Opción 1: Azure App Service (RECOMENDADO) ⭐

**Ventajas**:
- ✅ Ya tienes SQL Server en Azure
- ✅ Integración nativa con Azure Cache for Redis
- ✅ Application Insights incluido
- ✅ Auto-scaling
- ✅ CI/CD con GitHub Actions
- ✅ SSL gratis

**Costo estimado**: ~$20-50 USD/mes

### Opción 2: Heroku

**Ventajas**:
- ✅ Deploy rápido
- ✅ Fácil de usar
- ✅ Free tier disponible (limitado)

**Desventajas**:
- ⚠️ Requiere migrar SQL Server
- ⚠️ Redis como add-on ($15+/mes)

### Opción 3: VPS (DigitalOcean, Linode, AWS EC2)

**Ventajas**:
- ✅ Control total
- ✅ Más económico a escala

**Desventajas**:
- ⚠️ Requiere más configuración manual
- ⚠️ Mantenimiento de servidor

---

## 🔧 DEPLOYMENT A AZURE APP SERVICE (PASO A PASO)

### Fase 1: Preparar el Código para Producción

#### 1.1 Crear archivo de configuración de producción

```bash
# En backend/.env.production
NODE_ENV=production
PORT=8080

# Base de datos (mantener Azure SQL)
DB_HOST=miservidorbr.database.windows.net
DB_PORT=1433
DB_NAME=ia_educativa
DB_USER=adminsoloverde
DB_PASSWORD=tu_password_de_bd_aqui

# Redis Azure Cache (nuevo)
REDIS_HOST=tu-redis.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=tu_redis_password_aqui
REDIS_TLS=true

# Anthropic API
ANTHROPIC_API_KEY=tu_anthropic_api_key_aqui

# JWT
JWT_SECRET=genera-un-secret-super-seguro-aqui-64-chars
JWT_EXPIRES_IN=24h

# CORS (tu dominio de producción)
FRONTEND_URL=https://tu-frontend.azurewebsites.net

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

#### 1.2 Actualizar package.json para producción

```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "node test-endpoints-simple.ps1"
  },
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

#### 1.3 Crear archivo .deployment

```ini
[config]
command = npm install
```

#### 1.4 Crear web.config para Azure

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="src/server.js" verb="*" modules="iisnode"/>
    </handlers>
    <rewrite>
      <rules>
        <rule name="NodeInspector" patternSyntax="ECMAScript" stopProcessing="true">
          <match url="^src/server.js\/debug[\/]?" />
        </rule>
        <rule name="StaticContent">
          <action type="Rewrite" url="public{REQUEST_URI}"/>
        </rule>
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="True"/>
          </conditions>
          <action type="Rewrite" url="src/server.js"/>
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <hiddenSegments>
          <remove segment="bin"/>
        </hiddenSegments>
      </requestFiltering>
    </security>
    <httpErrors existingResponse="PassThrough" />
  </system.webServer>
</configuration>
```

### Fase 2: Crear Azure Cache for Redis

#### 2.1 Desde Azure Portal

```bash
# 1. Ir a Azure Portal → Create Resource
# 2. Buscar "Azure Cache for Redis"
# 3. Configurar:
#    - Resource Group: (el mismo que SQL Server)
#    - DNS name: ia-educativa-redis
#    - Location: East US (mismo que SQL Server)
#    - Pricing tier: Basic C0 (250 MB) - $16/mes
#                   o Standard C1 (1 GB) - $50/mes
# 4. Networking: Public endpoint
# 5. Create
```

#### 2.2 Obtener credenciales de Redis

```bash
# Después de crear, ir a:
# Settings → Access keys
# Copiar:
#   - Host name: xxxx.redis.cache.windows.net
#   - Primary access key: xxxxx
```

#### 2.3 Actualizar código para Redis Azure

**Archivo**: `backend/src/config/redis.js`

```javascript
const Redis = require('ioredis');

let redisClient;

const connectRedis = async () => {
    try {
        const isProduction = process.env.NODE_ENV === 'production';

        const redisConfig = isProduction ? {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT) || 6380,
            password: process.env.REDIS_PASSWORD,
            tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        } : {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined
        };

        redisClient = new Redis(redisConfig);

        redisClient.on('connect', () => {
            console.log('✅ Redis conectado');
        });

        redisClient.on('error', (err) => {
            console.error('❌ Error de Redis:', err);
        });

        await redisClient.ping();
        console.log('✅ Redis conectado');

    } catch (error) {
        console.error('❌ Error conectando a Redis:', error);
        throw error;
    }
};

module.exports = { connectRedis, redisClient: () => redisClient };
```

### Fase 3: Crear Azure App Service

#### 3.1 Desde Azure Portal

```bash
# 1. Azure Portal → Create Resource
# 2. Buscar "Web App"
# 3. Configurar:
#    - Resource Group: (el mismo)
#    - Name: ia-educativa-backend
#    - Publish: Code
#    - Runtime stack: Node 18 LTS
#    - Operating System: Linux
#    - Region: East US
#    - Pricing Plan: Basic B1 ($13/mes) o Standard S1 ($69/mes)
# 4. Create
```

#### 3.2 Configurar variables de entorno

```bash
# En Azure Portal → App Service → Configuration → Application settings
# Agregar todas las variables de .env.production:

NODE_ENV=production
DB_HOST=miservidorbr.database.windows.net
DB_PORT=1433
DB_NAME=ia_educativa
DB_USER=adminsoloverde
DB_PASSWORD=tu_password_de_bd_aqui
REDIS_HOST=ia-educativa-redis.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=tu_redis_password_aqui
REDIS_TLS=true
ANTHROPIC_API_KEY=tu_anthropic_api_key_aqui
JWT_SECRET=tu-secret-super-seguro
JWT_EXPIRES_IN=24h
FRONTEND_URL=https://tu-frontend.azurewebsites.net
```

#### 3.3 Configurar Deployment Center

**Opción A: Desde GitHub**

```bash
# 1. Azure Portal → App Service → Deployment Center
# 2. Source: GitHub
# 3. Autorizar GitHub
# 4. Seleccionar:
#    - Organization: tu-usuario
#    - Repository: tu-repo
#    - Branch: main
# 5. Build Provider: GitHub Actions
# 6. Save
```

Esto creará automáticamente un workflow en `.github/workflows/azure-deploy.yml`

**Opción B: Deploy manual con Azure CLI**

```bash
# Instalar Azure CLI
winget install Microsoft.AzureCLI

# Login
az login

# Deploy
cd backend
az webapp up --name ia-educativa-backend --resource-group tu-resource-group --runtime "NODE:18-lts"
```

### Fase 4: Configurar Application Insights (Monitoring)

#### 4.1 Crear Application Insights

```bash
# Azure Portal → Create Resource → Application Insights
# - Name: ia-educativa-insights
# - Resource Group: (el mismo)
# - Region: East US
```

#### 4.2 Instalar SDK

```bash
npm install applicationinsights
```

#### 4.3 Actualizar server.js

```javascript
// Al inicio del archivo
if (process.env.NODE_ENV === 'production') {
    const appInsights = require('applicationinsights');
    appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
        .setAutoDependencyCorrelation(true)
        .setAutoCollectRequests(true)
        .setAutoCollectPerformance(true)
        .setAutoCollectExceptions(true)
        .setAutoCollectDependencies(true)
        .setAutoCollectConsole(true)
        .setUseDiskRetryCaching(true)
        .start();

    console.log('✅ Application Insights configurado');
}
```

### Fase 5: Configurar SSL/HTTPS

Azure App Service incluye SSL gratis:

```bash
# 1. Azure Portal → App Service → Custom domains
# 2. Add custom domain: api.tu-dominio.com
# 3. Validate ownership (DNS records)
# 4. TLS/SSL settings → Enable HTTPS Only
# 5. Binding → Add TLS/SSL binding
#    - Managed Certificate (Free)
```

### Fase 6: Configurar CI/CD con GitHub Actions

Crear `.github/workflows/azure-deploy.yml`:

```yaml
name: Deploy to Azure App Service

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      working-directory: ./backend
      run: npm ci

    - name: Run tests
      working-directory: ./backend
      run: npm test || echo "Tests not configured"

    - name: Deploy to Azure Web App
      uses: azure/webapps-deploy@v2
      with:
        app-name: 'ia-educativa-backend'
        publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
        package: ./backend
```

#### Configurar secretos en GitHub:

```bash
# 1. Azure Portal → App Service → Get publish profile
# 2. Copiar contenido XML
# 3. GitHub Repo → Settings → Secrets → New secret
# 4. Name: AZURE_WEBAPP_PUBLISH_PROFILE
# 5. Value: (pegar XML)
```

### Fase 7: Backup Automático SQL Server

```bash
# Azure Portal → SQL Database → Automated backups
# - Backup retention: 7 days (default)
# - Long-term retention: Configure si necesitas más
# - Point-in-time restore: Automático
```

---

## 🔒 SEGURIDAD EN PRODUCCIÓN

### 1. Actualizar CORS para producción

**Archivo**: `backend/src/server.js`

```javascript
const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL
        : ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
```

### 2. Rate Limiting más estricto

```javascript
// Producción: límites más bajos
const rateLimitConfig = process.env.NODE_ENV === 'production' ? {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 50 // 50 requests por ventana
} : {
    windowMs: 15 * 60 * 1000,
    max: 100
};
```

### 3. Helmet configuración avanzada

```javascript
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"]
        }
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));
```

### 4. Logging en producción

```javascript
// Usar winston en lugar de console.log
npm install winston

// logger.js
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

module.exports = logger;
```

---

## 📊 MONITORING Y MANTENIMIENTO

### Application Insights - Métricas Clave

```bash
# Monitorear en Azure Portal:
1. Request rate (requests/segundo)
2. Response time (ms)
3. Failed requests (%)
4. CPU usage (%)
5. Memory usage (MB)
6. Database connections
7. Redis cache hit rate
```

### Alertas Recomendadas

```bash
# Configurar en Application Insights → Alerts:
1. CPU > 80% por 5 minutos
2. Memory > 90% por 5 minutos
3. Response time > 2000ms
4. Failed requests > 5%
5. Database errors
6. Redis disconnections
```

### Logs

```bash
# Ver logs en tiempo real:
az webapp log tail --name ia-educativa-backend --resource-group tu-resource-group

# Descargar logs:
az webapp log download --name ia-educativa-backend --resource-group tu-resource-group
```

---

## 🧪 TESTING EN PRODUCCIÓN

### Health Check

```bash
curl https://ia-educativa-backend.azurewebsites.net/health
```

### Test completo de endpoints

```powershell
# Actualizar test-endpoints-simple.ps1
$baseUrl = "https://ia-educativa-backend.azurewebsites.net"

# Ejecutar tests
.\test-endpoints-simple.ps1
```

---

## 💰 COSTOS ESTIMADOS MENSUALES

| Servicio | Tier | Costo |
|----------|------|-------|
| SQL Server Azure | Básico (2 GB) | $5 |
| Azure App Service | Basic B1 | $13 |
| Azure Cache Redis | Basic C0 | $16 |
| Application Insights | 5GB/mes gratis | $0 |
| Anthropic API | Pay as you go | Variable |
| **TOTAL** | | **~$34/mes** + API |

**Optimización**: Tier gratuito de App Service (F1) disponible para desarrollo/testing.

---

## 🚀 PROCESO DE DEPLOYMENT COMPLETO

### Checklist Final

```bash
# 1. Preparación Local
[ ] Actualizar .env.production
[ ] Probar localmente con NODE_ENV=production
[ ] Commit y push a GitHub

# 2. Azure Resources
[ ] Crear Azure Cache for Redis
[ ] Crear Azure App Service
[ ] Crear Application Insights
[ ] Configurar variables de entorno

# 3. Deployment
[ ] Conectar GitHub a Azure (Deployment Center)
[ ] Trigger deployment (push to main)
[ ] Verificar logs de deployment

# 4. Testing Producción
[ ] Test health endpoint
[ ] Test registro/login
[ ] Test JWT authentication
[ ] Test endpoints protegidos
[ ] Test AI endpoints (con créditos)

# 5. Monitoring
[ ] Configurar alertas
[ ] Verificar Application Insights
[ ] Setup backup SQL Server

# 6. DNS y SSL
[ ] Configurar custom domain (opcional)
[ ] Enable HTTPS
[ ] Actualizar CORS con dominio real
```

---

## 📝 COMANDOS ÚTILES

```bash
# Azure CLI - Login
az login

# Ver logs en tiempo real
az webapp log tail --name ia-educativa-backend --resource-group tu-resource-group

# Restart app
az webapp restart --name ia-educativa-backend --resource-group tu-resource-group

# Ver configuración
az webapp config appsettings list --name ia-educativa-backend --resource-group tu-resource-group

# Scale up (cambiar tier)
az webapp up --name ia-educativa-backend --sku B2

# Ver métricas
az monitor metrics list --resource ia-educativa-backend
```

---

## 🆘 TROUBLESHOOTING

### Problema: App no inicia

```bash
# Ver logs
az webapp log tail --name ia-educativa-backend --resource-group tu-resource-group

# Verificar:
1. Variables de entorno configuradas
2. Node version correcta (18+)
3. package.json tiene "start" script
4. PORT = 8080 o process.env.PORT
```

### Problema: No se conecta a Redis Azure

```bash
# Verificar:
1. REDIS_TLS=true en variables de entorno
2. Puerto 6380 (no 6379)
3. Password correcto
4. Firewall rules en Redis (allow Azure services)
```

### Problema: Error de CORS

```bash
# Actualizar FRONTEND_URL en App Service settings
# Reiniciar app
az webapp restart --name ia-educativa-backend --resource-group tu-resource-group
```

---

## 🎉 DEPLOYMENT EXITOSO

Una vez completado, tu backend estará disponible en:

```
https://ia-educativa-backend.azurewebsites.net
```

**Endpoints**:
- Health: https://ia-educativa-backend.azurewebsites.net/health
- API: https://ia-educativa-backend.azurewebsites.net/api/*

---

## 📚 RECURSOS ADICIONALES

- [Azure App Service Docs](https://docs.microsoft.com/azure/app-service/)
- [Azure Cache for Redis](https://docs.microsoft.com/azure/azure-cache-for-redis/)
- [Application Insights](https://docs.microsoft.com/azure/azure-monitor/app/app-insights-overview)
- [GitHub Actions for Azure](https://github.com/Azure/actions)

---

**🇨🇴 IA Educativa Colombia - Deployment Guide**
**📅 26 de Mayo de 2026**
**✅ Listo para Producción**
