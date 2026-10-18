# 🚀 Guía de Inicialización de Base de Datos SQL Server

## ✅ Estado Actual

- ✅ **Conexión verificada**: El servidor se conecta correctamente a `miservidorbr.database.windows.net`
- ✅ **Credenciales correctas**: Usuario `adminsoloverde` autenticado
- ⏳ **Pendiente**: Crear base de datos `ia_educativa` y ejecutar schema

---

## 📋 Pasos para Inicializar

### Opción 1: Azure Portal (Recomendado - Más Fácil)

1. **Ir a Azure Portal**
   - Abre https://portal.azure.com
   - Inicia sesión con tu cuenta

2. **Navegar a tu SQL Server**
   - Busca "SQL servers" en la barra de búsqueda
   - Selecciona `miservidorbr`

3. **Crear la Base de Datos**
   - Click en "+ Create database"
   - Nombre: `ia_educativa`
   - Usa configuración existente del servidor
   - Selecciona el plan más económico (Basic o S0)
   - Click en "Review + Create" → "Create"
   - Espera 1-2 minutos a que se cree

4. **Ejecutar el Schema**
   - Ve a tu base de datos `ia_educativa`
   - Click en "Query editor" en el menú lateral
   - Inicia sesión con:
     - Usuario: `adminsoloverde`
     - Contraseña: `TU_PASSWORD_BD_AQUI`
   - Copia el contenido de `backend/database/schema_sqlserver.sql`
   - Pégalo en el editor
   - Click en "Run"
   - Deberías ver: `✅ Esquema de base de datos creado exitosamente`

---

### Opción 2: Azure CLI (Para Usuarios Avanzados)

```bash
# Instalar Azure CLI si no lo tienes
# https://learn.microsoft.com/cli/azure/install-azure-cli

# Login
az login

# Crear base de datos
az sql db create \
  --resource-group tu-resource-group \
  --server miservidorbr \
  --name ia_educativa \
  --service-objective Basic

# Ejecutar schema (requiere sqlcmd)
sqlcmd -S miservidorbr.database.windows.net \
  -U adminsoloverde \
  -P TU_PASSWORD_BD_AQUI \
  -d ia_educativa \
  -i backend/database/schema_sqlserver.sql
```

---

### Opción 3: Azure Data Studio (GUI Alternativa)

1. **Descargar Azure Data Studio**
   - https://learn.microsoft.com/sql/azure-data-studio/download

2. **Conectar al Servidor**
   - Nueva conexión
   - Servidor: `miservidorbr.database.windows.net`
   - Usuario: `adminsoloverde`
   - Contraseña: `TU_PASSWORD_BD_AQUI`
   - Base de datos: `master` (temporal)

3. **Crear Base de Datos**
   - Abrir archivo `backend/database/00_crear_base_datos.sql`
   - Ejecutar (F5)

4. **Ejecutar Schema**
   - Cambiar conexión a base de datos `ia_educativa`
   - Abrir archivo `backend/database/schema_sqlserver.sql`
   - Ejecutar (F5)

---

## 🔄 Después de Crear la Base de Datos

### 1. Actualizar el archivo .env

Edita `backend/.env` y cambia:
```env
DB_NAME=ia_educativa
```

(Actualmente está en `master` para testing)

### 2. Reiniciar el Servidor

En tu terminal donde está corriendo el backend:
```
rs
```

O ciérralo (Ctrl+C) y reinicia:
```bash
npm run dev
```

### 3. Verificar Conexión

Deberías ver en los logs:
```
✅ SQL Server conectado: miservidorbr.database.windows.net
✅ Base de datos SQL Server conectada: 2026-05-23...
✅ Cliente de Anthropic Claude inicializado
🚀 Servidor escuchando en http://localhost:3001
```

### 4. Verificar Tablas Creadas

En Azure Portal Query Editor, ejecuta:
```sql
-- Ver todas las tablas
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- Ver materias precargadas (deben ser 13)
SELECT COUNT(*) as total_materias FROM subjects;
SELECT code, name, emoji FROM subjects ORDER BY id;
```

---

## 🎯 Verificación Final

### Test 1: Health Check
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

### Test 2: Verificar Estructura

En Query Editor:
```sql
-- Contar tablas (deben ser 8)
SELECT COUNT(*) as total_tables
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE';

-- Verificar vistas (deben ser 2)
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.VIEWS;

-- Verificar stored procedures (deben ser 2)
SELECT name
FROM sys.procedures
WHERE type = 'P';
```

---

## 📊 Estructura Creada

Una vez ejecutado el schema, tendrás:

### Tablas (8)
1. **users** - Usuarios del sistema
2. **subjects** - 13 materias precargadas
3. **conversations** - Conversaciones con IA
4. **messages** - Mensajes individuales
5. **user_metrics** - Métricas de progreso
6. **cache_responses** - Caché persistente
7. **moderation_logs** - Logs de moderación
8. **audit_logs** - Auditoría legal

### Vistas (2)
- **user_statistics** - Estadísticas agregadas
- **student_ranking** - Ranking de estudiantes

### Stored Procedures (2)
- **sp_clean_expired_cache** - Limpieza automática
- **sp_get_cache_stats** - Estadísticas de caché

### Triggers (2)
- **trg_users_update_updated_at** - Auto-actualización de timestamps
- **trg_user_metrics_update_updated_at** - Auto-actualización de timestamps

---

## 🐛 Troubleshooting

### Error: "Database already exists"
**Solución**: No es un problema, solo ejecuta el schema en esa base de datos

### Error: "Cannot create database"
**Solución**: Verifica que tu plan de Azure permita crear bases de datos adicionales

### Error: "Login failed" después de crear DB
**Solución**:
1. Espera 1-2 minutos (propagación de permisos)
2. Verifica que cambiaste `DB_NAME=ia_educativa` en `.env`
3. Reinicia el servidor con `rs`

### Error de Firewall
**Solución**:
1. Ve a Azure Portal → Tu SQL Server
2. Settings → Firewalls and virtual networks
3. Agrega tu IP actual o habilita "Allow Azure services"

---

## ⚡ Inicio Rápido (Resumen)

```bash
# 1. Crear base de datos en Azure Portal
#    - Nueva base de datos: ia_educativa
#    - Plan: Basic o S0

# 2. Ejecutar schema en Query Editor
#    - Copiar/pegar schema_sqlserver.sql
#    - Run

# 3. Actualizar .env
DB_NAME=ia_educativa

# 4. Reiniciar servidor
rs

# 5. Verificar
curl http://localhost:3001/health
```

---

## 📞 Siguiente Paso

Una vez que veas:
```
✅ SQL Server conectado
✅ Base de datos SQL Server conectada
✅ Cliente de Anthropic Claude inicializado
🚀 Servidor escuchando en http://localhost:3001
```

¡Estás listo para comenzar a desarrollar los endpoints REST!

---

**Estado Actual**: Servidor conectado a `master` (testing). Necesita base de datos `ia_educativa` + schema ejecutado.

**Tiempo Estimado**: 5-10 minutos usando Azure Portal
