# 📚 Guía Rápida - Sistema IA Educativa

## 📂 Documentación Disponible

### 🚀 Inicio Rápido
- **[INICIO_RAPIDO.md](INICIO_RAPIDO.md)** - Guía para comenzar con el proyecto

### 🗄️ Base de Datos
- **[INICIALIZAR_BASE_DATOS.md](INICIALIZAR_BASE_DATOS.md)** - Configuración de SQL Server en Azure
- **[CONEXION_SQLSERVER.md](CONEXION_SQLSERVER.md)** - Guía de conexión a SQL Server

### ⚡ Redis (Caché)
- **[GUIA_REDIS.md](GUIA_REDIS.md)** - Instalación y configuración de Redis

### 📈 Progreso
- **[FASE2_PROGRESO.md](FASE2_PROGRESO.md)** - Estado actual del proyecto

---

## 🎯 Estado Actual del Proyecto

### ✅ Completado

1. **Backend Base**
   - ✅ Servidor Express corriendo en puerto 3001
   - ✅ Conexión a Azure SQL Server establecida
   - ✅ Base de datos `ia_educativa` creada y configurada
   - ✅ API de Anthropic Claude integrada
   - ✅ Health check endpoint funcionando

2. **Base de Datos**
   - ✅ 8 tablas creadas
   - ✅ 13 materias precargadas
   - ✅ 2 vistas (estadísticas y ranking)
   - ✅ 2 stored procedures
   - ✅ 2 triggers automáticos

3. **Configuración**
   - ✅ Variables de entorno configuradas
   - ✅ Dependencias instaladas
   - ✅ Middleware de errores implementado
   - ✅ Rate limiting configurado

### ⏳ Pendiente

1. **Redis (Caché)**
   - ⏳ Instalación de Redis local o Docker
   - ⏳ Verificación de conexión
   - 📖 Ver: [GUIA_REDIS.md](GUIA_REDIS.md)

2. **Endpoints REST API**
   - ⏳ Implementar endpoints de conversación
   - ⏳ Implementar endpoints de usuarios
   - ⏳ Implementar endpoints de materias

---

## 🚀 Comandos Rápidos

### Backend

```powershell
# Iniciar servidor
cd backend
npm run dev

# Test de conexión
Invoke-RestMethod -Uri http://localhost:3001/health | ConvertTo-Json

# Test de Redis (cuando esté instalado)
node backend/test-redis.js
```

### Base de Datos

```sql
-- Ver todas las tablas
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME;

-- Ver materias precargadas
SELECT code, name, emoji FROM subjects ORDER BY id;

-- Estadísticas
SELECT COUNT(*) as total FROM conversations;
SELECT COUNT(*) as total FROM messages;
```

### Redis (cuando esté instalado)

```powershell
# Windows
C:\Redis\redis-cli.exe ping

# Docker
docker exec -it redis-ia-educativa redis-cli ping

# Ver todas las claves
redis-cli KEYS *

# Monitorear en tiempo real
redis-cli MONITOR
```

---

## 🛠️ Tecnologías

### Backend
- **Node.js** + **Express** - Servidor API REST
- **mssql** - Driver de Microsoft SQL Server
- **ioredis** - Cliente de Redis para caché
- **@anthropic-ai/sdk** - API de Claude AI

### Base de Datos
- **Azure SQL Server** - Base de datos en la nube
- **Redis** - Caché en memoria (pendiente instalación)

### Frontend (Pendiente)
- **React** - Framework web
- **Axios** - Cliente HTTP

---

## 📊 Arquitectura

```
┌─────────────────┐
│   Frontend      │
│   (React)       │
└────────┬────────┘
         │ HTTP/REST
         ↓
┌─────────────────┐
│   Backend       │
│   (Express)     │
├─────────────────┤
│   Middlewares   │
│   - Rate Limit  │
│   - Errors      │
└─┬───────────┬───┘
  │           │
  ↓           ↓
┌──────┐   ┌──────┐
│Redis │   │ SQL  │
│Cache │   │Server│
└──────┘   └──────┘
            Azure
```

---

## 🎓 Materias Disponibles

| Código | Materia                    | Emoji |
|--------|----------------------------|-------|
| MAT    | Matemáticas                | 🔢    |
| ESP    | Español                    | 📚    |
| ING    | Inglés                     | 🌍    |
| CNA    | Ciencias Naturales         | 🔬    |
| CSO    | Ciencias Sociales          | 🌎    |
| EDU    | Educación Física           | ⚽    |
| ART    | Educación Artística        | 🎨    |
| ETI    | Ética y Valores            | 🤝    |
| REL    | Religión                   | ✝️    |
| TEC    | Tecnología e Informática   | 💻    |
| ECO    | Economía                   | 💰    |
| FIL    | Filosofía                  | 🤔    |
| CIE    | Ciencias Políticas         | 🏛️    |

---

## 🐛 Troubleshooting Común

### Servidor no inicia

```powershell
# Verificar que el puerto 3001 esté libre
netstat -ano | findstr :3001

# Si está ocupado, cambiar PORT en .env
PORT=3002
```

### Error de conexión a SQL Server

```powershell
# Verificar credenciales en .env
DB_HOST=miservidorbr.database.windows.net
DB_NAME=ia_educativa
DB_USER=adminsoloverde
DB_PASSWORD=tu_password_de_bd_aqui
```

### Redis no conecta

```powershell
# Verificar que Redis esté corriendo
# Windows:
C:\Redis\redis-cli.exe ping

# Docker:
docker ps | findstr redis
```

---

## 📞 Próximos Pasos

1. **Instalar Redis** → Ver [GUIA_REDIS.md](GUIA_REDIS.md)
2. **Implementar Endpoints REST** → Crear controladores y rutas
3. **Frontend** → Crear interfaz de usuario con React
4. **Testing** → Pruebas automatizadas
5. **Deploy** → Subir a producción

---

## 📈 Endpoints Disponibles

### Actuales

| Método | Ruta | Descripción | Estado |
|--------|------|-------------|--------|
| GET | `/health` | Health check del servidor | ✅ |

### Planeados

| Método | Ruta | Descripción | Estado |
|--------|------|-------------|--------|
| POST | `/api/auth/register` | Registrar usuario | ⏳ |
| POST | `/api/auth/login` | Login de usuario | ⏳ |
| GET | `/api/subjects` | Listar materias | ⏳ |
| POST | `/api/conversations` | Crear conversación | ⏳ |
| GET | `/api/conversations/:id` | Ver conversación | ⏳ |
| POST | `/api/messages` | Enviar mensaje a IA | ⏳ |
| GET | `/api/user/metrics` | Ver progreso del usuario | ⏳ |
| GET | `/api/cache/stats` | Estadísticas de Redis | ⏳ |

---

## 🔐 Seguridad

- ✅ Variables sensibles en `.env` (no se suben a Git)
- ✅ Rate limiting activo (100 requests/15min)
- ✅ Middleware de manejo de errores
- ⏳ JWT para autenticación (pendiente)
- ⏳ Validación de inputs (pendiente)
- ⏳ Sanitización de queries SQL (pendiente)

---

## 💡 Tips de Desarrollo

### Ver logs en tiempo real

```powershell
# Backend con reinicio automático
npm run dev

# Logs detallados
set DEBUG=* && npm run dev
```

### Limpiar caché de Redis

```powershell
redis-cli FLUSHALL
```

### Reiniciar todo desde cero

```powershell
# Backend
cd backend
rm -rf node_modules
npm install
npm run dev

# Redis
docker restart redis-ia-educativa
```

---

## 📚 Recursos Útiles

- [Documentación Express](https://expressjs.com/)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [Azure SQL Database](https://learn.microsoft.com/azure/sql-database/)
- [Redis Documentation](https://redis.io/documentation)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

---

**Última actualización:** Mayo 2026
**Versión:** 1.0.0
**Estado:** Desarrollo activo 🚀
