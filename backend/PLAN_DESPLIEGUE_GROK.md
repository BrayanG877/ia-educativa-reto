# Plan de despliegue controlado — Proveedor Grok (RETO PLTK) y agente pedagógico

> Estado: **NO EJECUTADO**. Requiere autorización expresa del responsable del proyecto.
> Este documento no contiene secretos y no debe incluirse con valores reales.

## 0. Resumen de la auditoría

| Objetivo | Resultado |
|---|---|
| Gateway real de Grok | **RETO PLTK** (`https://api.reto.pltk.mx/v1`), modelo `grok-4.6`. Verificado con una solicitud mínima (HTTP 200, "conexión correcta"). `GET /v1/models` devuelve 14 modelos, entre ellos `grok-4.6`. |
| Proveedor efectivo local (antes) | `groq` (`openai/gpt-oss-120b`), porque `.env` define `AI_PROVIDER=groq`. |
| Riesgo documentado | `getProviderName()` sustituía **en silencio** el proveedor configurado si faltaba su clave. Con `AI_PROVIDER=reto` y `RETO_KEY` ausente, el tráfico se desviaba a Groq/Gemini sin evidencia en la interfaz. **Corregido.** |
| Agente pedagógico | Conectado al flujo (`ai.service` → `construirContextoPedagogico` → system prompt). Está **apagado por defecto**: `backend/.env` no define `AGENT_ENABLED` (0 coincidencias). |
| Producción (AWS EC2) | **No verificada.** No hay acceso ni evidencia en el repositorio. Ver §5. |

Flujo real de una petición:

```
Frontend (web/app.js) → POST /api/chat/message
  → chat.controller (JWT, moderación, historial en RDS)
  → ai.service.generateResponse
      → aiProviders.getProviderName()  ← decide proveedor/modelo (único punto)
      → tutor.integration.construirContextoPedagogico()  (si AGENT_ENABLED=true)
      → PROVIDERS.<id>.completion()  → fetch POST {BASE}/chat/completions
      → caché Valkey (namespace v0/v1) → respuesta
```

## 1. Cambios que deben publicarse

> **CORRECCIÓN (auditoría EC2, solo lectura).** La versión anterior de este plan
decía que bastaban **2 archivos** (`ai.providers.js` + `ai.service.js`).
> **Es insuficiente y está demostrado.** Se simuló localmente ese parche exacto
> (los 2 archivos nuevos sobre el resto del `src` local) y el resultado fue
> **25 pruebas fallidas de 194**. Los fallos incluyen `flags(2)`, `flags(2b)`,
> `flags(5)`, `agente(1b)`, `agente(2b)`, `cache-ped(1)`, `cache-ped(3)` y
> `ai.persistence-schema.test.js` (no encuentra la migración), más pruebas de
> `fallback`, `http`, `metrics` y empaquetado.
>
> **Causa:** `ai.service.js` hace `require('./tutor.integration')` y
> `require('../config/ai.config')`. Sin esos módulos, el arranque real falla con
> `MODULE_NOT_FOUND` (p. ej. `Error: Cannot find module '../config/ai.config'`).
> Y sin `tutor.agent.js`, el agente no existe aunque `AGENT_ENABLED=true`:
> `tutor.integration` lo carga con `try/catch` y se degrada en silencio a
> contexto vacío.
>
> **Alcance real:** publicar la cadena completa de dependencias, no 2 archivos.

### 1.1 Proveedor Grok (mínimo imprescindible)

| Archivo | Motivo | Riesgo |
|---|---|---|
| `backend/src/services/ai.providers.js` | La selección explícita de `AI_PROVIDER` ya no se sustituye; adaptador RETO con normalización de URL base, pistas de error y estado de disponibilidad propio. **Además importa `../config/ai.config` para el timeout.** | Bajo. Conserva interfaces (`completion`, `model`, `configured`). |
| `backend/src/services/ai.service.js` | Mensajes/pistas de error para el gateway de Grok; se registra `hint` (sin secretos). **Importa `./tutor.integration` y `../config/ai.config`.** | Bajo. No cambia el contrato de respuesta. |
| `backend/src/config/ai.config.js` | **Dependencia del servicio**: sin él el arranque falla (`MODULE_NOT_FOUND`, código de salida 1). | Bajo. Solo lee entorno. |
| `backend/src/services/tutor.integration.js` | **Dependencia del servicio**: `ai.service` lo requiere de forma incondicional. | Bajo. Con `AGENT_ENABLED` ausente devuelve contexto vacío (comportamiento previo). |
| `backend/src/services/tutor.agent.js` | Sin él el agente se degrada **en silencio** (try/catch) y `AGENT_ENABLED=true` no tendría efecto visible. | Bajo. No llama al modelo ni a la BD por sí solo. |

### 1.2 Integración completa del agente (para que la pedagogía se refleje)

| Archivo | Motivo | Riesgo |
|---|---|---|
| `backend/src/controllers/chat.controller.js` | Llama a `tutorIntegration.registrarTurno` (persistencia). Si la versión desplegada es anterior, **no existe esta llamada** y la evidencia nunca se registra. | Medio: toca el flujo de chat. Validar antes el diff. |
| `backend/src/services/prompt.service.js` | Prompts socráticos/ICFES que el agente complementa. Versión local distinta a la desplegada. | Bajo. |
| `backend/database/migration_agent.sql` | Solo si se activará `AGENT_PERSISTENCE_ENABLED=true`. **No crear tablas en RDS sin autorización específica.** | Alto si se aplica. |

Los 17 archivos restantes de `src/` (auth, metrics, tools, middleware, config de BD/Redis)
forman parte de la misma versión validada; publicarlos reduce el riesgo de mezclar
versiones, pero **no son necesarios para Grok** y requieren su propia revisión del diff.
| `backend/test/_setup.js` | Neutraliza credenciales en pruebas (evita tráfico externo accidental al ejecutar `npm test`). | Ninguno en producción (no se despliega). |
| `backend/test/ai.ollama.test.js`, `backend/test/ai.secrets.test.js` | Ajuste al nuevo contrato y restauración de variables. | Ninguno en producción. |
| `backend/test/ai.proveedor-reto.test.js` | Nuevas pruebas de enrutado al gateway. | Ninguno en producción. |

**No se despliegan** `backend/.env`, `.env.production`, certificados ni datos.

## 2. Verificación previa (obligatoria)

```bash
cd backend
npm test                     # esperado: 203 pruebas, 0 fallos
node scripts/check-reto.js   # 1 sola solicitud; esperado RESULTADO: OK
```

`check-reto.js` no reintenta, no imprime la clave y no modifica nada.

## 3. Archivos afectados en el servidor

- Backend (proveedor, 5 archivos): `src/services/ai.providers.js`, `src/services/ai.service.js`,
  `src/config/ai.config.js`, `src/services/tutor.integration.js`, `src/services/tutor.agent.js`
- Backend (agente completo, +2): `src/controllers/chat.controller.js`, `src/services/prompt.service.js`
- Servicio systemd: `ia-educativa-backend`
- Frontend estático: `/opt/ia-educativa/web` — **no requiere cambios de código**:
  el contrato de `/api/chat/message` no cambia (`agentPlan` es interno y no se envía).
  Lo que se evidencia en la UI es el **contenido** de la respuesta del tutor.

## 4. Procedimiento (con autorización)

1. **Respaldo con fecha** (sin sobrescribir respaldos anteriores):
   ```bash
   TS=$(date +%Y%m%d-%H%M%S)
   sudo mkdir -p /opt/ia-educativa/backups/$TS
   sudo cp -a /opt/ia-educativa/backend/src /opt/ia-educativa/backups/$TS/src
   sudo systemctl is-active ia-educativa-backend
   ```
2. **Transferir solo los 5 archivos de proveedor** (o los 7 con el agente completo) a un directorio temporal.
3. **Comparar antes de mover** (`diff` local vs servidor) archivo por archivo y confirmar que solo difieren los cambios revisados.
4. **Reemplazar** con permisos y propietario originales.
5. **Sintaxis y carga**: `node --check` de cada archivo y, sobre todo, comprobar que el
   arranque resuelve toda la cadena (`ai.service → tutor.integration → tutor.agent → ai.config`).
   Si falta un archivo de la cadena, el servicio **no arranca** (MODULE_NOT_FOUND).
6. **Variables de entorno** (editar solo las líneas indicadas, nunca reescribir el `.env`):
   - `AI_PROVIDER=reto` — proveedor efectivo.
   - `RETO_MODEL=grok-4.6` — ya presente en el `.env` local.
   - `RETO_KEY` — debe existir (solo comprobar presencia, nunca imprimir su valor).
   - `RETO_BASE_URL` — opcional; si falta, se usa el endpoint oficial.
   - `AGENT_ENABLED=true` — solo si se desea activar el contexto pedagógico.
   - `AGENT_PERSISTENCE_ENABLED=false` — mantener OFF hasta verificar la migración.
   - `AI_FALLBACK_PROVIDERS` — revisar: el valor por defecto (`gemini,openrouter,anthropic`) permite respaldo a **Anthropic (de pago)**. Si no se autoriza, excluirlo.
7. **Reinicio controlado** (solo con autorización):
   ```bash
   sudo systemctl restart ia-educativa-backend
   sudo systemctl status ia-educativa-backend --no-pager
   ```
8. **Verificación**:
   ```bash
   curl -s localhost:3001/health            # status OK/DEGRADED; ai.provider=reto
   curl -s localhost:3001/api/ai/providers  # active=reto, ready=true, model=grok-4.6
   ```
   Confirmar en Nginx que el proxy apunta al puerto real (`proxy_pass ...:3001`).
9. **Prueba real del proveedor**: `node scripts/check-reto.js` en el servidor.
10. **Prueba pedagógica**: conversación de 3 turnos (ver §6).
11. **Frontend**: `/opt/ia-educativa/web` no cambia. Verificar que Nginx sirve los archivos actuales (`curl -I` y comparar hash de `app.js` con el desplegado).
12. **Rollback** (si falla cualquier paso):
    ```bash
    sudo cp -a /opt/ia-educativa/backups/$TS/src/. /opt/ia-educativa/backend/src/
    sudo systemctl restart ia-educativa-backend
    ```
    Restaurar las variables modificadas a su valor anterior y volver a reiniciar.
    **Nota:** como el cambio abarca 5–7 archivos, el rollback *selectivo* (devolver solo
    `ai.providers.js`) puede dejar versiones mezcladas. El rollback correcto es restaurar
    `src/` completo desde el respaldo.

## 5. Pendiente de evidencia — estado de acceso (2026-10-21)

**No se pudo ejecutar la auditoría de solo lectura en EC2 desde esta máquina:**

| Comprobación | Resultado |
|---|---|
| `~/.ssh/config` | No existe |
| Claves privadas (`*.pem`, `*.ppk`, `id_*`) | No hay ninguna; solo `known_hosts` |
| Host conocido | `3.139.69.85` (único) |
| `ssh -o BatchMode=yes ubuntu@3.139.69.85` | `Permission denied (publickey,...)` — **sin acceso** |
| AWS CLI | No instalada |
| Credenciales `~/.aws` | No existen |

Sin acceso, **no se afirma nada** sobre la versión desplegada. Las secciones siguientes
quedan como pendientes hasta recibir acceso de solo lectura.

## 5.1 Pendiente de evidencia (no verificable desde el repositorio)

- Estado real del servicio, puerto, comando y directorio de trabajo en EC2.
- Contenido efectivo del entorno del servicio (solo nombres y presencia de variables).
- Nginx: `proxy_pass` real y raíz del frontend servido.
- Versión del código en `/opt/ia-educativa/backend` (hashes de `ai.providers.js`, `ai.service.js`, `tutor.integration.js`).
- Existencia de `tutor.agent.js` / `tutor.integration.js` en producción.
- Aplicación de `database/migration_agent.sql` en RDS (solo si se activará la persistencia).

Comandos de solo lectura sugeridos (ejecutar con autorización):

```bash
systemctl cat ia-educativa-backend            # User, WorkingDirectory, ExecStart
systemctl show ia-educativa-backend -p EnvironmentFiles -p ExecStart
ss -ltnp | grep 3001
sha256sum /opt/ia-educativa/backend/src/services/{ai.providers.js,ai.service.js,tutor.integration.js}
grep -E '^(AI_PROVIDER|AGENT_ENABLED|RETO_MODEL)=' /etc/ia-educativa/env   # SIN mostrar claves
journalctl -u ia-educativa-backend -n 200 --no-pager | tail -80
```

## 6. Prueba pedagógica reproducible

Escenario: el estudiante comete dos veces el mismo error con números negativos.

| Turno | Entrada | Esperado con `AGENT_ENABLED=true` |
|---|---|---|
| 1 | "ayúdame con ecuaciones" | `diagnostic`: una pregunta diagnóstica, sin resolver |
| 2 | "x = 5 - (-3) = 2" | `evaluate`: señala el paso del signo, pregunta orientadora |
| 3 | "creo que 2 otra vez" | `evaluate` + práctica progresiva; **debe** retomar el error previo |

Verificado localmente: turnos 1–3 producen `diagnostic`, `evaluate`, `evaluate` y el bloque
"CONTEXTO PEDAGOGICO DEL TURNO" llega al system prompt.

**Limitación demostrada:** el planificador **no lee** en su lógica las acciones previas
(campo `historial` recibido pero no usado) y el bloque de contexto es idéntico en los turnos
2 y 3. La "adaptación" del turno 3 no está garantizada por código: depende de que el modelo
reciba el historial. Con persistencia OFF no hay memoria entre sesiones.

## 7. Orden de activación recomendado

1. Proveedor (código + `AI_PROVIDER=reto`) y validar con `check-reto.js`.
2. `AGENT_ENABLED=true` y validar los 3 turnos.
3. `AGENT_PERSISTENCE_ENABLED=true` **solo después** de verificar la migración en RDS.

No activar los tres a la vez: impide atribuir una regresión a la causa correcta.
