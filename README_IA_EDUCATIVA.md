# 🎓 IA Educativa Colombia

Sistema de asistencia educativa con Inteligencia Artificial usando Claude de Anthropic, diseñado específicamente para estudiantes colombianos de educación básica y media.

[![Estado](https://img.shields.io/badge/Estado-En%20Desarrollo-yellow)]()
[![Backend](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-green)]()
[![DB](https://img.shields.io/badge/DB-Azure%20SQL%20Server-blue)]()
[![IA](https://img.shields.io/badge/IA-Claude%203.5%20Sonnet-purple)]()

---

## 📋 Descripción

Sistema educativo inteligente que proporciona apoyo académico personalizado en **13 materias** del currículo colombiano, desde grado 1° hasta grado 11°. Utiliza la API de Anthropic Claude para generar explicaciones, resolver dudas y guiar el aprendizaje de manera interactiva.

### 🎯 Características Principales

- ✅ **13 Materias Colombianas**: Matemáticas, Español, Inglés, Ciencias, etc.
- 🤖 **IA Conversacional**: Powered by Claude 3.5 Sonnet
- 💾 **Historial Persistente**: Todas las conversaciones se guardan
- ⚡ **Caché Inteligente**: Reduce costos con Redis
- 📊 **Métricas de Progreso**: Seguimiento del aprendizaje
- 🔒 **Seguro y Moderado**: Filtros de contenido inapropiado
- 🎨 **Interfaz Amigable**: Diseñada para estudiantes

---

## 🚀 Estado Actual

### ✅ Completado

- [x] Servidor Backend (Express + Node.js)
- [x] Conexión a Azure SQL Server
- [x] Base de datos con 8 tablas, vistas y procedures
- [x] 13 materias precargadas
- [x] Integración con API de Claude
- [x] Health check endpoint
- [x] Middleware de errores y rate limiting
- [x] Sistema de logging

### ⏳ En Progreso

- [ ] Instalación de Redis (caché)
- [ ] Endpoints REST API completos
- [ ] Sistema de autenticación JWT
- [ ] Frontend React

---

## 📚 Documentación

| Guía | Descripción |
|------|-------------|
| **[GUIA_RAPIDA.md](GUIA_RAPIDA.md)** | 📖 Resumen general y comandos útiles |
| **[INICIO_RAPIDO.md](INICIO_RAPIDO.md)** | 🚀 Cómo empezar con el proyecto |
| **[INICIALIZAR_BASE_DATOS.md](INICIALIZAR_BASE_DATOS.md)** | 🗄️ Configurar SQL Server en Azure |
| **[GUIA_REDIS.md](GUIA_REDIS.md)** | ⚡ Instalar y configurar Redis |
| **[CONEXION_SQLSERVER.md](CONEXION_SQLSERVER.md)** | 🔌 Guía de conexión a SQL Server |
| **[FASE2_PROGRESO.md](FASE2_PROGRESO.md)** | 📈 Estado del desarrollo |

---

## 🛠️ Stack Tecnológico

### Backend
- **Node.js** v18+ - Runtime de JavaScript
- **Express** v4 - Framework web
- **mssql** - Driver para SQL Server
- **ioredis** - Cliente de Redis
- **@anthropic-ai/sdk** - API de Claude

### Base de Datos
- **Azure SQL Server** - Base de datos en la nube
- **Redis** - Sistema de caché (opcional)

### Frontend (Planeado)
- **React** v18 - Framework UI
- **Vite** - Build tool
- **TailwindCSS** - Estilos

---

## ⚙️ Instalación Rápida

### Prerrequisitos

```bash
# Node.js 18+ y npm
node --version  # v18.0.0+
npm --version   # 9.0.0+
```

### 1. Clonar Repositorio

```bash
git clone <url-del-repo>
cd claurst-main
```

### 2. Configurar Backend

```bash
cd backend
npm install
```

### 3. Configurar Variables de Entorno

Crea `backend/.env`:

```env
# Servidor
PORT=3001
NODE_ENV=development

# Anthropic Claude API
ANTHROPIC_API_KEY=tu-api-key-aqui

# Azure SQL Server
DB_HOST=tu-servidor.database.windows.net
DB_PORT=1433
DB_NAME=ia_educativa
DB_USER=tu-usuario
DB_PASSWORD=tu-password

# Redis (opcional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=tu-secret-key-super-segura
JWT_EXPIRES_IN=24h

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 4. Inicializar Base de Datos

Consulta [INICIALIZAR_BASE_DATOS.md](INICIALIZAR_BASE_DATOS.md) para crear la base de datos y ejecutar el schema.

### 5. Iniciar Servidor

```bash
npm run dev
```

Deberías ver:

```
✅ SQL Server conectado: tu-servidor.database.windows.net
✅ Base de datos SQL Server conectada
✅ Cliente de Anthropic Claude inicializado
🚀 Servidor escuchando en http://localhost:3001
```

### 6. Verificar Instalación

```bash
curl http://localhost:3001/health
```

Respuesta esperada:

```json
{
  "status": "OK",
  "timestamp": "2026-05-23T...",
  "service": "IA Educativa Backend",
  "version": "1.0.0"
}
```

---

## 📦 Instalación de Redis (Opcional pero Recomendado)

Redis proporciona caché para reducir costos de la API y mejorar velocidad.

### Opción 1: Docker (Recomendado)

```bash
docker run -d --name redis-ia-educativa -p 6379:6379 redis:latest
```

### Opción 2: Script Automático (Windows)

```powershell
.\instalar-redis.ps1
```

### Documentación Completa

Ver [GUIA_REDIS.md](GUIA_REDIS.md) para instrucciones detalladas.

---

## 🎓 Materias Disponibles

El sistema cubre las 13 materias principales del currículo colombiano:

| Código | Materia | Emoji | Grados |
|--------|---------|-------|--------|
| **MAT** | Matemáticas | 🔢 | 1° - 11° |
| **ESP** | Español | 📚 | 1° - 11° |
| **ING** | Inglés | 🌍 | 1° - 11° |
| **CNA** | Ciencias Naturales | 🔬 | 1° - 9° |
| **CSO** | Ciencias Sociales | 🌎 | 1° - 11° |
| **EDU** | Educación Física | ⚽ | 1° - 11° |
| **ART** | Educación Artística | 🎨 | 1° - 11° |
| **ETI** | Ética y Valores | 🤝 | 1° - 11° |
| **REL** | Religión | ✝️ | 1° - 11° |
| **TEC** | Tecnología e Informática | 💻 | 1° - 11° |
| **ECO** | Economía | 💰 | 10° - 11° |
| **FIL** | Filosofía | 🤔 | 10° - 11° |
| **CIE** | Ciencias Políticas | 🏛️ | 10° - 11° |

---

## 🗄️ Estructura de Base de Datos

### Tablas (8)

1. **users** - Usuarios del sistema (estudiantes/profesores)
2. **subjects** - 13 materias precargadas
3. **conversations** - Conversaciones con la IA
4. **messages** - Mensajes individuales (preguntas/respuestas)
5. **user_metrics** - Métricas de progreso del estudiante
6. **cache_responses** - Caché persistente de respuestas
7. **moderation_logs** - Registro de moderación de contenido
8. **audit_logs** - Auditoría legal y compliance

### Vistas (2)

- **user_statistics** - Estadísticas agregadas por usuario
- **student_ranking** - Ranking de estudiantes por desempeño

### Stored Procedures (2)

- **sp_clean_expired_cache** - Limpieza automática de caché
- **sp_get_cache_stats** - Estadísticas del sistema de caché

---

## 📡 API Endpoints (Planeados)

### Autenticación

```
POST   /api/auth/register      Registrar nuevo usuario
POST   /api/auth/login         Iniciar sesión
POST   /api/auth/logout        Cerrar sesión
GET    /api/auth/me            Obtener usuario actual
```

### Materias

```
GET    /api/subjects           Listar todas las materias
GET    /api/subjects/:code     Obtener materia específica
```

### Conversaciones

```
POST   /api/conversations      Crear nueva conversación
GET    /api/conversations      Listar conversaciones del usuario
GET    /api/conversations/:id  Obtener conversación específica
DELETE /api/conversations/:id  Eliminar conversación
```

### Mensajes (IA)

```
POST   /api/messages           Enviar mensaje a la IA
GET    /api/messages/:convId   Obtener mensajes de conversación
```

### Métricas

```
GET    /api/metrics/user       Métricas del usuario
GET    /api/metrics/progress   Progreso por materia
GET    /api/metrics/ranking    Ranking de estudiantes
```

### Administración

```
GET    /api/cache/stats        Estadísticas de caché
POST   /api/cache/clear        Limpiar caché
GET    /health                 Health check del servidor
```

---

## 🏗️ Arquitectura del Sistema

```
┌──────────────────────────────────────────────────┐
│                  FRONTEND                        │
│            (React + TailwindCSS)                 │
└────────────────┬─────────────────────────────────┘
                 │ HTTP/REST API
                 ↓
┌──────────────────────────────────────────────────┐
│              BACKEND (Node.js)                   │
├──────────────────────────────────────────────────┤
│  ┌────────────┐  ┌──────────┐  ┌─────────────┐ │
│  │   Routes   │→ │Controllers│→ │  Services   │ │
│  └────────────┘  └──────────┘  └─────────────┘ │
│                                                  │
│  ┌──────────────────────────────────────────┐  │
│  │          Middlewares                     │  │
│  │  - Rate Limiting                         │  │
│  │  - Authentication (JWT)                  │  │
│  │  - Error Handling                        │  │
│  │  - Request Validation                    │  │
│  └──────────────────────────────────────────┘  │
└──┬──────────────┬──────────────┬───────────────┘
   │              │              │
   ↓              ↓              ↓
┌────────┐  ┌──────────┐  ┌─────────────┐
│ Redis  │  │   SQL    │  │  Anthropic  │
│ Cache  │  │  Server  │  │  Claude API │
│        │  │  (Azure) │  │             │
└────────┘  └──────────┘  └─────────────┘
```

---

## 🧪 Testing

### Health Check

```bash
curl http://localhost:3001/health
```

### Test Redis

```bash
node backend/test-redis.js
```

### Test Base de Datos

```sql
-- En Azure Portal Query Editor
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE';

SELECT code, name, emoji FROM subjects;
```

---

## 🐛 Troubleshooting

### Servidor no inicia

```bash
# Verificar que el puerto esté libre
netstat -ano | findstr :3001

# Cambiar puerto en .env si es necesario
PORT=3002
```

### Error de conexión a SQL Server

1. Verificar credenciales en `.env`
2. Verificar reglas de firewall en Azure Portal
3. Verificar que la base de datos exista

### Redis no conecta

```bash
# Verificar que Redis esté corriendo
redis-cli ping  # Windows
docker ps | grep redis  # Docker
```

Ver [GUIA_REDIS.md](GUIA_REDIS.md) para más detalles.

---

## 📈 Roadmap

### Fase 1: Backend Core ✅
- [x] Configuración del servidor
- [x] Conexión a base de datos
- [x] Integración con Claude API
- [x] Schema de base de datos

### Fase 2: API REST (En Progreso)
- [ ] Endpoints de autenticación
- [ ] Endpoints de conversaciones
- [ ] Sistema de caché con Redis
- [ ] Validación de inputs
- [ ] Tests unitarios

### Fase 3: Frontend
- [ ] Interfaz de usuario React
- [ ] Chat interactivo
- [ ] Dashboard de métricas
- [ ] Selector de materias
- [ ] Perfil de usuario

### Fase 4: Optimización
- [ ] Rate limiting avanzado
- [ ] Caché distribuido
- [ ] Monitoring y analytics
- [ ] Deploy a producción
- [ ] CI/CD

---

## 🔐 Seguridad

- ✅ Variables sensibles en `.env` (excluido de Git)
- ✅ Rate limiting para prevenir abuso
- ✅ Manejo centralizado de errores
- ⏳ JWT para autenticación (planeado)
- ⏳ Validación de inputs (planeado)
- ⏳ Sanitización SQL (planeado)
- ⏳ HTTPS en producción (planeado)

---

## 📄 Licencia

Este proyecto es privado y propietario. Todos los derechos reservados.

---

## 👥 Equipo

Desarrollado con ❤️ para estudiantes colombianos.

---

## 📞 Soporte

¿Problemas con la instalación? Consulta:

1. [GUIA_RAPIDA.md](GUIA_RAPIDA.md) - Resumen general
2. [INICIALIZAR_BASE_DATOS.md](INICIALIZAR_BASE_DATOS.md) - Setup de DB
3. [GUIA_REDIS.md](GUIA_REDIS.md) - Setup de Redis

---

**Última actualización:** Mayo 2026
**Versión:** 1.0.0
**Estado:** En Desarrollo Activo 🚀
