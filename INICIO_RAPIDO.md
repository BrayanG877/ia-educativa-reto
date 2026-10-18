# GUÍA RÁPIDA DE INICIO - Backend IA Educativa

## 🚀 Inicio Rápido (5 minutos)

### 1. Instalar Dependencias
```bash
cd backend
npm install
```

### 2. Configurar Variables de Entorno
```bash
cp .env.example .env
```

Edita `.env` y configura:
```env
# Obligatorio - Obtener en https://console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-...

# Obligatorio - Tu contraseña de PostgreSQL
DB_PASSWORD=tu_password

# Obligatorio - Generar string aleatorio seguro
JWT_SECRET=tu_secret_muy_seguro_aqui_12345
```

### 3. Crear Base de Datos
```bash
# Windows (PowerShell)
createdb ia_educativa
psql -d ia_educativa -f database/schema.sql

# Linux/Mac
createdb ia_educativa
psql -d ia_educativa -f database/schema.sql
```

### 4. Iniciar Redis
```bash
# Windows
redis-server

# Linux/Mac
redis-server

# Docker (alternativa)
docker run -d -p 6379:6379 redis
```

### 5. Iniciar Servidor
```bash
npm run dev
```

### 6. Verificar
Abre en tu navegador: http://localhost:3001/health

Deberías ver:
```json
{
  "status": "OK",
  "timestamp": "...",
  "service": "IA Educativa Backend",
  "version": "1.0.0"
}
```

---

## 📋 Prerequisitos

### Requerido
- [x] Node.js v18+ ([descargar](https://nodejs.org))
- [x] PostgreSQL v14+ ([descargar](https://www.postgresql.org/download/))
- [x] Redis v7+ ([descargar](https://redis.io/download))
- [x] Anthropic API Key ([obtener](https://console.anthropic.com))

### Opcional
- [ ] Docker (para Redis)
- [ ] pgAdmin (GUI para PostgreSQL)

---

## 🔑 Obtener API Key de Anthropic

1. Ir a https://console.anthropic.com
2. Crear cuenta o iniciar sesión
3. Ir a "API Keys"
4. Crear nueva API Key
5. Copiar y guardar en `.env`

**Nota**: Anthropic ofrece créditos gratis para nuevos usuarios.

---

## 📊 Estructura del Proyecto

```
backend/
├── src/
│   ├── server.js              # 🚀 Servidor principal
│   ├── config/                # ⚙️ Configuraciones
│   │   ├── anthropic.js       # 🤖 Claude API
│   │   ├── database.js        # 🗄️ PostgreSQL
│   │   └── redis.js           # 🔴 Redis
│   ├── services/              # 🛠️ Lógica de negocio
│   │   ├── ai.service.js      # 🧠 Servicio de IA
│   │   ├── cache.service.js   # 💾 Caché
│   │   └── prompt.service.js  # 📝 Prompts socráticos
│   └── middleware/            # 🛡️ Middlewares
│       ├── rateLimit.js       # ⏱️ Rate limiting
│       └── error.js           # ❌ Manejo de errores
├── database/
│   └── schema.sql             # 📋 Esquema de BD
├── .env.example               # 📄 Plantilla de config
└── package.json               # 📦 Dependencias
```

---

## 🧪 Probar el Sistema

### Test de Health Check
```bash
curl http://localhost:3001/health
```

### Test de Conexión a PostgreSQL
```bash
# Deberías ver esto en los logs:
# ✅ Base de datos conectada: 2026-05-20...
```

### Test de Conexión a Redis
```bash
# Deberías ver esto en los logs:
# ✅ Redis conectado
```

### Test de Anthropic
```bash
# Los logs mostrarán:
# ✅ Cliente de Anthropic Claude inicializado
```

---

## ⚠️ Solución de Problemas

### ❌ Error: "ANTHROPIC_API_KEY not found"
**Solución**: Asegúrate de haber copiado `.env.example` a `.env` y configurado tu API key

### ❌ Error: "connection refused" (PostgreSQL)
**Solución**:
1. Verificar que PostgreSQL esté corriendo
2. Verificar puerto (por defecto 5432)
3. Verificar credenciales en `.env`

### ❌ Error: "connection refused" (Redis)
**Solución**:
1. Verificar que Redis esté corriendo
2. El sistema puede funcionar sin Redis (sin caché)
3. Verificar puerto (por defecto 6379)

### ❌ Error: "database does not exist"
**Solución**:
```bash
createdb ia_educativa
psql -d ia_educativa -f database/schema.sql
```

---

## 🎯 Próximos Pasos

Una vez que el servidor esté corriendo:

1. **Revisar logs**: Verificar que todo se haya inicializado correctamente
2. **Probar health check**: `http://localhost:3001/health`
3. **Ver documentación**: Leer `FASE2_PROGRESO.md` para detalles completos
4. **Preparar frontend**: Conectar el frontend en `/web` con el backend

---

## 📚 Documentación Adicional

- **Progreso completo**: [`FASE2_PROGRESO.md`](FASE2_PROGRESO.md)
- **README del backend**: [`backend/README.md`](backend/README.md)
- **Análisis técnico**: [`analisis_ia_educativa.txt`](analisis_ia_educativa.txt)
- **Documentación de Anthropic**: https://docs.anthropic.com

---

## 🆘 Necesitas Ayuda?

1. Revisar logs del servidor (muy detallados)
2. Consultar `FASE2_PROGRESO.md` sección "Troubleshooting"
3. Verificar que todas las dependencias estén instaladas
4. Asegurarte de que PostgreSQL y Redis estén corriendo

---

## ✅ Checklist de Verificación

- [ ] Node.js instalado y funcionando
- [ ] PostgreSQL instalado y corriendo
- [ ] Redis instalado y corriendo
- [ ] Base de datos `ia_educativa` creada
- [ ] Esquema SQL ejecutado correctamente
- [ ] API Key de Anthropic obtenida
- [ ] Archivo `.env` configurado
- [ ] Dependencias instaladas (`npm install`)
- [ ] Servidor iniciado sin errores
- [ ] Health check responde correctamente

---

**¡Listo!** Si todos los checks están ✅, tu backend está funcionando correctamente.

**Siguiente paso**: Implementar endpoints REST y conectar con el frontend.
