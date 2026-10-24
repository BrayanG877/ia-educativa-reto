# Despliegue y operación

Documento operativo. **No debe contener credenciales, IPs privadas ni endpoints
administrativos.** Esos valores viven en el gestor de secretos del entorno.

## 1. Requisitos del entorno

| Recurso | Nota |
|---|---|
| Node.js | ≥ 18 |
| SQL Server | Accesible desde el servidor de aplicación. |
| Redis | Opcional (caché). |
| Variables de entorno | Inyectadas por la plataforma, nunca desde el repositorio. |

## 2. Variables obligatorias en producción

```env
NODE_ENV=production
PORT=<puerto asignado por la plataforma>
DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
JWT_SECRET=<secreto propio de producción>
AI_PROVIDER=<proveedor elegido>
<PROVEEDOR>_KEY=<clave>
RETO_MODEL=grok-4.6            # si AI_PROVIDER=reto
FRONTEND_URL=<URL pública del frontend>
```

Plantilla: `backend/.env.production.example`.

## 3. Arranque

Comando de inicio:

```bash
npm start                      # desde la raíz: node backend/src/server.js
# o
cd backend && npm run prod     # fija NODE_ENV=production de forma multiplataforma
```

`npm run prod` lanza `backend/scripts/start-prod.js`, que ejecuta `src/server.js`
como proceso principal con `NODE_ENV=production` y reenvía `SIGTERM`/`SIGINT`
para un apagado limpio.

Con `NODE_ENV=production`, el backend sirve `web/` como estático: no se necesita
un servidor web aparte para el frontend.

## 4. Base de datos

Aplicar en orden antes del primer arranque:

```
backend/database/00_crear_base_datos.sql
backend/database/schema_sqlserver.sql
backend/database/migration_teacher_assignment.sql
backend/database/migration_agent.sql            # solo si AGENT_ENABLED=true
```

Las migraciones son manuales y **no** se ejecutan automáticamente al arrancar.
Aplícalas con `sqlcmd` o con un cliente SQL, y verifica el resultado antes de
activar el agente.

> Las pruebas automatizadas validan el esquema esperado
> (`ai.persistence-schema.test.js`) pero **no** lo aplican.

## 5. Verificación tras el despliegue

```bash
curl -s https://<host>/health
curl -s https://<host>/api/ai/providers
```

Qué revisar en `/health`:

| Campo | Correcto |
|---|---|
| `status` | `OK` |
| `dependencies.database` | `connected` |
| `dependencies.redis` | `connected` o `unavailable` (aceptable) |
| `dependencies.ai` | `<proveedor> (<modelo>)` con el modelo esperado |

`/api/ai/providers` devuelve el estado y el campo `active` de cada proveedor.
**No devuelve claves.**

Si el proveedor activo aparece como `configured: false`, falta la credencial en
el entorno del servidor. El chat responderá `503` con el nombre de la variable
faltante. No es un error de código.

## 6. Operación

### Cambiar de proveedor

Cambiar `AI_PROVIDER` (y su clave) en el entorno del servicio y reiniciar. El
valor explícito se respeta aunque falte la clave; no hay conmutación silenciosa.

### Logs

El backend escribe en stdout/stderr; los recoge la plataforma. No se generan
archivos de log dentro del repositorio.

### Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| `EADDRINUSE` | Otro proceso en el puerto. Liberar o cambiar `PORT`. |
| `/health` → `DEGRADED` con error de login SQL | Credenciales o red hacia SQL Server. |
| Chat `503` "rechazó las credenciales" | Clave del proveedor inválida o revocada. |
| Chat `503` "modelo no encontrado" | `RETO_MODEL` obsoleto o `RETO_BASE_URL` incorrecto. |
| Redis `ENOTFOUND` | Host de Redis mal configurado. La app sigue funcionando sin caché. |

## 7. Seguridad operativa

1. Secretos solo en el gestor de la plataforma, nunca en el repositorio.
2. `JWT_SECRET` distinto en cada entorno.
3. Rotar cualquier credencial que haya estado expuesta en el historial de Git.
4. Restringir el acceso de red a SQL Server y Redis al servidor de aplicación.
5. Revisar `/api/ai/providers` solo desde redes de confianza.
