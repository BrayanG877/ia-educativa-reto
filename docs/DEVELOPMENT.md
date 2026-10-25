# Desarrollo y pruebas

## 1. Preparación del entorno

```bash
git clone https://github.com/BrayanG877/ia-educativa-reto.git
cd ia-educativa-reto/backend
npm install
cp .env.example .env
```

Editar `.env` con credenciales de desarrollo. Como mínimo:

- `DB_*` — SQL Server accesible.
- `JWT_SECRET` — cualquier cadena.
- Un proveedor de IA con clave (o `OLLAMA_ENABLED=true` con Ollama local).

## 2. Ejecutar en desarrollo

```bash
# Backend con recarga automática
cd backend
npm run dev            # nodemon src/server.js

# Frontend, en otra terminal
cd backend
npm run serve-web      # http://localhost:3000
```

`web/app.js` apunta al backend según se configure en `web/api-client.js`; el
origen permitido por el backend se controla con `FRONTEND_URL`.

## 3. Pruebas automatizadas

```bash
cd backend
npm test
```

### Cómo funcionan

- Runner propio: `backend/test/run-tests.js`.
- Descubre automáticamente todos los archivos `*.test.js` de `backend/test/`.
- Lanza `node --test --require ./test/_setup.js <archivos>`.
- **Falla con código ≠ 0 si descubre cero pruebas** (protección contra falsos positivos).

### Aislamiento

`backend/test/_setup.js` se carga antes que cualquier módulo bajo prueba y:

1. Bloquea conexiones de red, TCP y DNS (`_aislamiento.js`).
2. Elimina de `process.env` todas las credenciales reales de proveedores.
3. Sustituye `ioredis` y `mssql` por stubs en memoria.

Consecuencia: **ninguna prueba contacta con SQL Server, Redis ni proveedores de
IA externos**, aunque el `.env` local tenga credenciales válidas.

### Cobertura funcional de las suites

| Archivo | Protege |
|---|---|
| `ai.subsystem.test.js` | Flujo general del subsistema de IA. |
| `ai.config-providers.test.js` | Configuración y catálogo de proveedores. |
| `ai.reto-fallback.test.js` | Resiliencia del proveedor RETO. |
| `ai.proveedor-reto.test.js` | Contrato del adaptador RETO PLTK. |
| `ai.ollama.test.js` | Reglas de selección y guardas de Ollama. |
| `ai.secrets.test.js` | Que ninguna clave se filtre en logs, listados ni errores. |
| `ai.aislamiento.test.js` | Que las guardias de red sigan activas. |
| `ai.guardias-red.test.js` | Bloqueo de conexiones salientes en pruebas. |
| `ai.tutor-integration.test.js` | Agente tutor y su integración con el chat. |
| `ai.persistence-schema.test.js` | Esquema de persistencia del agente. |
| `ai.agent-flags.test.js` | Banderas `AGENT_ENABLED` / `AGENT_PERSISTENCE_ENABLED`. |
| `ai.http-endpoint.test.js` | Endpoints HTTP del subsistema de IA. |
| `ai.server-import.test.js` | Que importar `server.js` no arranque el servidor. |
| `ai.cache-pedagogica.test.js` | Caché de respuestas pedagógicas. |
| `ai.icfes-errors.test.js` | Manejo de errores en generación ICFES. |
| `ai.packaging-exclusions.test.js` | Que el paquete de despliegue excluya lo que debe. |
| `metrics.authorization.test.js` | Autorización de métricas por rol e identidad. |
| `teacher.panel.test.js` | Panel docente: rol, autorización por grupo/asignatura, IDOR, validación de parámetros, cálculo de estadísticas y datos insuficientes. |
| `analytics.classifier.test.js` | Clasificación reproducible de tema y desenlace, y registro real de eventos. |
| `markdown.renderer.test.js` | Renderizador Markdown: seguridad (XSS) y formato (listas, tablas, código, fórmulas). |

## 4. Verificación manual del backend

```bash
cd backend
node src/server.js
```

Comprobar:

```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/ai/providers
```

`/health` responde `200` incluso en modo degradado; el campo `status` indica
`OK` o `DEGRADED` y `dependencies` detalla BD, Redis y proveedor de IA.

## 5. Datos de desarrollo
```bash
cd backend
npm run seed:teacher            # cuenta docente + grupo + eventos sintéticos
npm run seed:teacher --reset    # regenera SOLO los datos demo (is_demo = 1)
```

Requiere `backend/database/migration_teacher_panel.sql` aplicada. El script:

- se niega a ejecutarse con `NODE_ENV=production`;
- es **idempotente** (comprueba existencia antes de insertar);
- guarda la contraseña con **bcrypt**, igual que el registro real;
- no asigna roles administrativos;
- usa nombres ficticios y marca todos los registros con `is_demo = 1`.

## 7. Convenciones

- CommonJS (`require`/`module.exports`); no hay transpilación ni build.
- No añadir dependencias sin justificar su necesidad.
- Toda prueba nueva debe llamarse `*.test.js` y usar el runner existente.
- No imprimir valores de credenciales en logs, mensajes de error ni respuestas.
- Los scripts de arranque usan `process.exit` explícito para un código de salida correcto.

## 8. Qué NO hacer en local

- No ejecutar scripts que escriban en producción (base de datos, Redis, cloud).
- No consumir cuota de proveedores de IA en pruebas automáticas.
- No modificar `.env`/`.env.production` para "hacer pasar" pruebas.
- No desactivar las guardias de red de `_setup.js`.
