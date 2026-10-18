# Guía de Conexión a SQL Server Azure

## ✅ Migración Completada: PostgreSQL → SQL Server

El backend ha sido migrado exitosamente para conectarse a tu base de datos Microsoft SQL Server en Azure.

### Cambios Realizados

1. **✅ Instalado driver `mssql`** para Node.js
2. **✅ Actualizado `database.js`** con configuración de SQL Server
3. **✅ Creado `schema_sqlserver.sql`** compatible con T-SQL
4. **✅ Actualizado `.env.example`** con credenciales de Azure SQL
5. **✅ Removido dependencia `pg`** (PostgreSQL)

---

## 📋 Configuración de Conexión

### Datos de tu servidor SQL Server:
```
Servidor: miservidorbr.database.windows.net
Puerto: 1433
Usuario: adminsoloverde
Base de datos: ia_educativa
```

---

## 🚀 Pasos para Inicializar

### 1. Crear archivo `.env`

Necesitas crear el archivo `.env` con la contraseña de tu base de datos:

```bash
cd backend
cp .env.example .env
```

Luego edita `.env` y configura:
```env
DB_PASSWORD=tu_password_real_aqui
```

### 2. Ejecutar el Schema en SQL Server

Conéctate a tu base de datos Azure SQL y ejecuta el schema:

**Opción A: Usando Azure Portal**
1. Ve a https://portal.azure.com
2. Navega a tu SQL Database
3. Abre "Query editor"
4. Copia y pega el contenido de `backend/database/schema_sqlserver.sql`
5. Ejecuta el script

**Opción B: Usando SQL Server Management Studio (SSMS)**
1. Abre SSMS
2. Conéctate a `miservidorbr.database.windows.net`
3. Abre el archivo `schema_sqlserver.sql`
4. Ejecuta (F5)

**Opción C: Usando Azure Data Studio**
1. Abre Azure Data Studio
2. Conéctate al servidor
3. Abre el archivo `schema_sqlserver.sql`
4. Ejecuta

**Opción D: Usando sqlcmd (línea de comandos)**
```bash
sqlcmd -S miservidorbr.database.windows.net -U adminsoloverde -P tu_password -d ia_educativa -i backend/database/schema_sqlserver.sql
```

### 3. Iniciar el Servidor

```bash
cd backend
npm run dev
```

Si todo está bien, deberías ver:
```
✅ SQL Server conectado: miservidorbr.database.windows.net
✅ Base de datos SQL Server conectada: 2026-05-23...
🚀 Servidor escuchando en http://localhost:3001
```

---

## 🔍 Verificar Conexión

### Test 1: Health Check
```bash
curl http://localhost:3001/health
```

### Test 2: Verificar tablas creadas
Desde Azure Portal o SSMS, ejecuta:
```sql
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE';
```

Deberías ver estas tablas:
- users
- subjects (con 13 materias precargadas)
- conversations
- messages
- user_metrics
- cache_responses
- moderation_logs
- audit_logs

---

## 🛠️ Diferencias Principales vs PostgreSQL

### Tipos de Datos
| PostgreSQL | SQL Server |
|------------|------------|
| UUID | UNIQUEIDENTIFIER |
| SERIAL | IDENTITY(1,1) |
| BOOLEAN | BIT |
| TIMESTAMP | DATETIME2 |
| JSONB | NVARCHAR(MAX) |
| INET | VARCHAR(45) |

### Funciones
| PostgreSQL | SQL Server |
|------------|------------|
| NOW() | GETDATE() |
| CURRENT_DATE | CAST(GETDATE() AS DATE) |
| uuid_generate_v4() | NEWID() |

### Sintaxis de Parámetros
- **PostgreSQL**: `$1, $2, $3`
- **SQL Server**: `@param1, @param2, @param3`

⚠️ **Nota**: El código de `database.js` convierte automáticamente los parámetros de PostgreSQL a SQL Server, por lo que no necesitas cambiar el código de los servicios.

---

## 🔐 Seguridad en Azure SQL

Tu configuración ya incluye:
- ✅ **Encriptación**: `encrypt: true` (obligatorio para Azure)
- ✅ **Firewall**: Asegúrate de permitir tu IP en Azure Portal
- ✅ **Conexión segura**: TLS/SSL automático

### Configurar Firewall en Azure

1. Ve a Azure Portal → Tu SQL Server
2. Click en "Firewalls and virtual networks"
3. Agrega tu IP actual o permite servicios de Azure

---

## 📊 Stored Procedures Incluidos

El schema incluye estos procedimientos útiles:

```sql
-- Limpiar caché expirado
EXEC sp_clean_expired_cache;

-- Obtener estadísticas de caché
EXEC sp_get_cache_stats;
```

---

## 🐛 Troubleshooting

### Error: "Login failed for user 'adminsoloverde'"
**Solución**: Verifica la contraseña en el archivo `.env`

### Error: "Cannot open server"
**Solución**:
1. Verifica que el nombre del servidor sea correcto
2. Revisa las reglas de firewall en Azure Portal
3. Asegúrate de tener acceso a Internet

### Error: "Database does not exist"
**Solución**: Crea la base de datos en Azure Portal antes de ejecutar el schema

### Error: "Connection timeout"
**Solución**:
1. Verifica conectividad a Azure
2. Revisa reglas de firewall
3. Aumenta el timeout en `database.js` si es necesario

---

## 📈 Compatibilidad del Código Existente

**✅ Los servicios existentes NO necesitan cambios:**
- ✅ `ai.service.js` - Compatible
- ✅ `cache.service.js` - Compatible
- ✅ `prompt.service.js` - No usa BD

**⚠️ Nota sobre queries:**
El módulo `database.js` convierte automáticamente:
- `.rows` funciona igual (alias de `.recordset`)
- `.rowCount` funciona igual
- Parámetros `$1, $2` → `@param1, @param2`

---

## 🎯 Próximos Pasos

Una vez que el servidor esté conectado:

1. ✅ Verificar que todas las tablas se crearon
2. ✅ Verificar que las 13 materias se insertaron
3. ✅ Probar el health check
4. ⏳ Crear los endpoints REST
5. ⏳ Conectar el frontend

---

## 📞 Soporte

Si tienes problemas con la conexión:
1. Verifica los logs del servidor (muy detallados)
2. Revisa la configuración de firewall en Azure
3. Asegúrate de que la contraseña sea correcta
4. Verifica que la base de datos exista

---

**¡Listo!** Tu backend ahora está configurado para usar SQL Server en Azure.
