# 🚀 Guía de Implementación de Redis

## 📌 ¿Qué es Redis y Por Qué lo Necesitas?

**Redis** (Remote Dictionary Server) es una base de datos en memoria ultra-rápida que funciona como sistema de caché.

### ✨ Beneficios para tu Proyecto IA Educativa:

1. **💰 Ahorro de Costos**: Reduce llamadas a la API de Anthropic Claude (que es costosa)
2. **⚡ Velocidad**: Respuestas instantáneas para preguntas repetidas
3. **📊 Eficiencia**: Almacena respuestas comunes en memoria
4. **🎯 Rate Limiting**: Controla el número de peticiones por usuario
5. **🔄 Sesiones**: Gestiona sesiones de usuario de manera eficiente

### 💡 Ejemplo Práctico:

Sin Redis:
```
Usuario pregunta: "¿Qué es el álgebra?"
→ Llamada a Claude API ($$$) → 2-3 segundos → Respuesta
```

Con Redis:
```
Usuario pregunta: "¿Qué es el álgebra?"
Primera vez → Claude API → Guarda en Redis
Segunda vez → Redis → 0.01 segundos → ¡Respuesta instantánea!
```

---

## 🎯 Estado Actual

- ⚠️ **Redis no está instalado**: El servidor funciona sin caché
- ✅ **Código preparado**: Tu servidor ya tiene integración Redis lista
- 📝 **Configuración**: El `.env` ya tiene las variables necesarias

---

## 🔧 Opciones de Instalación

### Opción 1: Windows (Local) - Recomendado para Desarrollo ⭐

**Ventajas:**
- Fácil de instalar
- No requiere Docker
- Ideal para desarrollo local

**Pasos:**

#### 1. Descargar Redis para Windows

Redis no tiene soporte oficial para Windows, pero hay distribuciones alternativas:

**Método A: Usando Memurai (Redis Compatible)**
```
1. Visita: https://www.memurai.com/get-memurai
2. Descarga Memurai Developer (Gratis)
3. Ejecuta el instalador
4. Memurai se instala como servicio de Windows
```

**Método B: Usando Redis (versión no oficial)**
```
1. Visita: https://github.com/tporadowski/redis/releases
2. Descarga: Redis-x64-5.0.14.1.zip (o la última versión)
3. Extrae en: C:\Redis
```

#### 2. Instalar Redis (Método B)

Si elegiste el Método B (redis no oficial):

```powershell
# Abre PowerShell como Administrador

# Navega a la carpeta de Redis
cd C:\Redis

# Instala Redis como servicio de Windows
.\redis-server.exe --service-install redis.windows.conf

# Inicia el servicio
.\redis-server.exe --service-start

# Verifica que está corriendo
.\redis-cli.exe ping
# Deberías ver: PONG
```

#### 3. Verificar Instalación

```powershell
# Test básico
C:\Redis\redis-cli.exe

# En el CLI de Redis:
127.0.0.1:6379> ping
PONG

127.0.0.1:6379> set test "Hola Redis"
OK

127.0.0.1:6379> get test
"Hola Redis"

127.0.0.1:6379> exit
```

---

### Opción 2: Docker (Multiplataforma) 🐳

**Ventajas:**
- Entorno aislado
- Fácil de actualizar
- Funciona en cualquier OS

**Requisitos:**
- Docker Desktop instalado

#### 1. Instalar Docker Desktop

```
1. Descarga: https://www.docker.com/products/docker-desktop
2. Instala Docker Desktop
3. Inicia Docker Desktop
```

#### 2. Ejecutar Redis en Docker

```powershell
# Descargar e iniciar Redis
docker run -d --name redis-ia-educativa -p 6379:6379 redis:latest

# Verificar que está corriendo
docker ps

# Ver logs
docker logs redis-ia-educativa

# Conectar al CLI de Redis
docker exec -it redis-ia-educativa redis-cli

# Test
ping
# Deberías ver: PONG

exit
```

#### 3. Comandos Útiles Docker

```powershell
# Detener Redis
docker stop redis-ia-educativa

# Iniciar Redis
docker start redis-ia-educativa

# Reiniciar Redis
docker restart redis-ia-educativa

# Ver logs en tiempo real
docker logs -f redis-ia-educativa

# Eliminar contenedor (si necesitas empezar de nuevo)
docker rm -f redis-ia-educativa
```

#### 4. Redis con Persistencia en Docker

Si quieres que los datos persistan incluso si eliminas el contenedor:

```powershell
# Crear volumen persistente
docker volume create redis-data

# Ejecutar Redis con persistencia
docker run -d \
  --name redis-ia-educativa \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:latest redis-server --appendonly yes
```

---

### Opción 3: Azure Cache for Redis (Producción) ☁️

**Ventajas:**
- Alta disponibilidad
- Escalable
- Respaldos automáticos
- Ideal para producción

**Costo:**
- Basic C0 (250 MB): ~$15/mes
- Standard C0 (250 MB): ~$30/mes (recomendado)

#### 1. Crear Instancia en Azure Portal

```
1. Ve a: https://portal.azure.com
2. Busca: "Azure Cache for Redis"
3. Click: "+ Create"
4. Configuración:
   - Resource Group: (el mismo de tu SQL Server)
   - Name: ia-educativa-cache
   - Location: East US (o el más cercano)
   - Cache type: Basic C0 (para empezar)
   - Enable non-SSL port: Yes (para desarrollo)
5. Review + Create
6. Espera 10-15 minutos
```

#### 2. Obtener Credenciales

```
1. Ve a tu instancia de Redis
2. Settings → Access keys
3. Copia:
   - Host name: [algo].redis.cache.windows.net
   - Primary access key: [tu-key]
```

#### 3. Actualizar .env

```env
REDIS_HOST=ia-educativa-cache.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=tu_redis_password_aqui
```

---

## ⚙️ Configuración en tu Proyecto

### 1. Verificar que las Dependencias Estén Instaladas

```powershell
cd backend

# Verificar que ioredis está instalado
npm list ioredis

# Si no está instalado:
npm install ioredis
```

### 2. Configurar Variables de Entorno

Tu archivo `backend/.env` ya tiene la configuración base:

```env
# Redis - Configuración Local
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
tu_redis_password_aqui

**Para Azure Redis:**
```env
REDIS_HOST=tu-cache.redis.cache.windows.net
REDIS_PORT=6380
REDIS_PASSWORD=tu_redis_password_aqui
```

### 3. Reiniciar el Servidor

```powershell
# Si el servidor está corriendo, detenerlo (Ctrl+C)
# Luego iniciarlo de nuevo:
npm run dev
```

### 4. Verificar Conexión

Deberías ver en los logs:
```
✅ Redis conectado
✅ SQL Server conectado
✅ Cliente de Anthropic Claude inicializado
🚀 Servidor escuchando en http://localhost:3001
```

---

## 🧪 Pruebas de Verificación

### Test 1: Verificar que Redis está corriendo

**Para instalación local (Windows/Docker):**
```powershell
# Usando redis-cli (Windows)
C:\Redis\redis-cli.exe ping

# Usando Docker
docker exec -it redis-ia-educativa redis-cli ping

# Ambos deben responder:
PONG
```

### Test 2: Verificar desde tu Aplicación

Crea un archivo de test: `backend/test-redis.js`

```javascript
require('dotenv').config();
const Redis = require('ioredis');

async function testRedis() {
    console.log('🧪 Probando conexión a Redis...\n');

    const redis = new Redis({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASSWORD || undefined
    });

    try {
        // Test 1: PING
        console.log('1️⃣ Test PING');
        const pong = await redis.ping();
        console.log(`   Resultado: ${pong}\n`);

        // Test 2: SET/GET
        console.log('2️⃣ Test SET/GET');
        await redis.set('test:mensaje', 'Hola desde IA Educativa');
        const mensaje = await redis.get('test:mensaje');
        console.log(`   Guardado: "Hola desde IA Educativa"`);
        console.log(`   Recuperado: "${mensaje}"\n`);

        // Test 3: SET con TTL
        console.log('3️⃣ Test SET con expiración (5 segundos)');
        await redis.setex('test:temporal', 5, 'Este mensaje expira');
        const ttl = await redis.ttl('test:temporal');
        console.log(`   Tiempo restante: ${ttl} segundos\n`);

        // Test 4: Guardar JSON
        console.log('4️⃣ Test JSON');
        const usuario = { id: 1, nombre: 'Juan', materia: 'Matemáticas' };
        await redis.set('test:usuario', JSON.stringify(usuario));
        const usuarioStr = await redis.get('test:usuario');
        const usuarioObj = JSON.parse(usuarioStr);
        console.log(`   Guardado:`, usuario);
        console.log(`   Recuperado:`, usuarioObj);

        // Limpiar
        await redis.del('test:mensaje', 'test:temporal', 'test:usuario');

        console.log('\n✅ Todos los tests pasaron exitosamente');
        console.log('🎉 Redis está funcionando correctamente\n');

    } catch (error) {
        console.error('\n❌ Error en las pruebas:', error.message);
    } finally {
        redis.disconnect();
    }
}

testRedis();
```

Ejecutar test:
```powershell
node backend/test-redis.js
```

### Test 3: Monitorear Redis en Tiempo Real

**Para Windows local:**
```powershell
# Abrir monitor de Redis
C:\Redis\redis-cli.exe monitor

# Ahora haz peticiones a tu API y verás las operaciones en tiempo real
```

**Para Docker:**
```powershell
docker exec -it redis-ia-educativa redis-cli monitor
```

---

## 📊 Uso en Producción

### Verificar Estadísticas de Caché

Puedes agregar un endpoint para ver estadísticas:

`backend/src/server.js` (agregar):

```javascript
// Endpoint de estadísticas de caché
app.get('/api/cache/stats', async (req, res) => {
    try {
        const redisClient = require('./config/redis').getClient();

        if (!redisClient) {
            return res.json({
                status: 'disabled',
                message: 'Redis no está conectado'
            });
        }

        const info = await redisClient.info('stats');
        const dbsize = await redisClient.dbsize();

        res.json({
            status: 'active',
            keys: dbsize,
            info: info
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

Test:
```powershell
Invoke-RestMethod -Uri http://localhost:3001/api/cache/stats | ConvertTo-Json
```

---

## 🐛 Troubleshooting

### Error: "ECONNREFUSED 127.0.0.1:6379"

**Causa:** Redis no está corriendo

**Solución:**

**Windows:**
```powershell
# Verificar si el servicio está corriendo
sc query Redis

# Iniciar servicio
C:\Redis\redis-server.exe --service-start

# O ejecutar directamente
C:\Redis\redis-server.exe
```

**Docker:**
```powershell
# Verificar si el contenedor está corriendo
docker ps -a | findstr redis

# Iniciar contenedor
docker start redis-ia-educativa

# O crear nuevo contenedor
docker run -d --name redis-ia-educativa -p 6379:6379 redis:latest
```

---

### Error: "Redis timeout" o "Slow Response"

**Causa:** Redis está sobrecargado o mal configurado

**Solución:**
```powershell
# Verificar memoria disponible
C:\Redis\redis-cli.exe info memory

# Limpiar datos si es necesario
C:\Redis\redis-cli.exe FLUSHALL

# Reiniciar Redis
# Windows: Reiniciar servicio
# Docker: docker restart redis-ia-educativa
```

---

### Error: "max number of clients reached"

**Causa:** Demasiadas conexiones abiertas

**Solución:**

Editar `redis.conf` (Windows) o configuración Docker:
```
maxclients 10000
```

---

### Verificar Puerto 6379 en Uso

**Windows:**
```powershell
# Ver qué está usando el puerto 6379
netstat -ano | findstr :6379

# Si algo más lo está usando, cambiar puerto en .env:
REDIS_PORT=6380
```

---

## 🎯 Comandos Redis Útiles

### Comandos Básicos

```bash
# Conectar al CLI
redis-cli

# Ver todas las claves
KEYS *

# Ver claves con patrón
KEYS cache:*

# Obtener valor
GET key_name

# Establecer valor
SET key_name "valor"

# Establecer con expiración (segundos)
SETEX key_name 60 "valor"

# Ver tiempo restante (TTL)
TTL key_name

# Eliminar clave
DEL key_name

# Eliminar todas las claves (¡CUIDADO!)
FLUSHALL

# Ver información del servidor
INFO

# Ver estadísticas
INFO stats

# Ver memoria
INFO memory

# Número de claves
DBSIZE
```

### Comandos de Monitoreo

```bash
# Ver comandos en tiempo real
MONITOR

# Ver clientes conectados
CLIENT LIST

# Ver uso de memoria por clave
MEMORY USAGE key_name

# Estadísticas de comandos
INFO commandstats
```

---

## 🚀 Inicio Rápido (Resumen)

### Para Windows (Método Rápido):

```powershell
# 1. Descargar Redis
# https://github.com/tporadowski/redis/releases

# 2. Extraer a C:\Redis

# 3. Abrir PowerShell como Admin
cd C:\Redis
.\redis-server.exe --service-install redis.windows.conf
.\redis-server.exe --service-start

# 4. Verificar
.\redis-cli.exe ping
# Debe responder: PONG

# 5. Reiniciar tu servidor backend
cd C:\Users\USER\Downloads\claurst-main\claurst-main\backend
npm run dev

# 6. Verificar logs - deberías ver:
# ✅ Redis conectado
```

### Para Docker (Método Rápido):

```powershell
# 1. Ejecutar Redis
docker run -d --name redis-ia-educativa -p 6379:6379 redis:latest

# 2. Verificar
docker exec -it redis-ia-educativa redis-cli ping
# Debe responder: PONG

# 3. Reiniciar tu servidor backend
cd C:\Users\USER\Downloads\claurst-main\claurst-main\backend
npm run dev

# 4. Verificar logs
# ✅ Redis conectado
```

---

## 📈 Siguiente Nivel: Optimizaciones

### 1. Redis Persistence (AOF)

Guardar datos incluso si Redis se reinicia:

`redis.conf`:
```
appendonly yes
appendfsync everysec
```

### 2. Redis Eviction Policy

Qué hacer cuando Redis se queda sin memoria:

```
maxmemory 256mb
maxmemory-policy allkeys-lru
```

### 3. Redis Sentinel (Alta Disponibilidad)

Para producción, considera usar Redis Sentinel o Redis Cluster.

### 4. Monitoreo con RedisInsight

Descarga una GUI gratuita para monitorear Redis:
```
https://redis.com/redis-enterprise/redis-insight/
```

---

## 📞 Próximos Pasos

Una vez que Redis esté funcionando:

1. ✅ Verifica que veas `✅ Redis conectado` en los logs
2. 🧪 Ejecuta el test `node backend/test-redis.js`
3. 📊 Prueba el endpoint `/api/cache/stats`
4. 🎯 Haz peticiones a tu API y verifica que las respuestas se cachean
5. 📈 Monitorea el uso con `redis-cli monitor`

---

## 🎉 ¡Listo!

Con Redis configurado correctamente:
- ⚡ Tu API será **10-100x más rápida** para respuestas cacheadas
- 💰 Ahorrarás **hasta 80% en costos de API**
- 🚀 Podrás manejar **más usuarios concurrentes**
- 📊 Tendrás **mejor control de rate limiting**

---

**Autor:** Sistema IA Educativa
**Fecha:** Mayo 2026
**Estado:** Servidor funcionando sin Redis → Redis pendiente de instalación
