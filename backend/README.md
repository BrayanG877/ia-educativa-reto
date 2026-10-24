# Backend — IA Educativa

API REST en Node.js + Express para la plataforma de tutoría con IA.

- Guía completa del proyecto: [`../README.md`](../README.md)
- Arquitectura y contrato de la API: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md)
- Variables de entorno: [`../docs/CONFIGURATION.md`](../docs/CONFIGURATION.md)
- Desarrollo y pruebas: [`../docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md)
- Despliegue: [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md)

## Tecnologías

- **Node.js** + **Express 4** — servidor y API REST.
- **Microsoft SQL Server** (`mssql`) — usuarios, historial, métricas y evidencias del agente.
- **Redis** (`ioredis`) — caché de respuestas. Opcional.
- **JWT** (`jsonwebtoken`) + `bcryptjs` — autenticación y hash de contraseñas.
- **Joi** — validación de entrada.
- **helmet**, `cors`, `express-rate-limit` — cabeceras, CORS y límite de peticiones.

## Estructura

```
backend/
├── src/
│   ├── server.js            # Punto de entrada y arranque
│   ├── config/              # ai.config, anthropic, database, redis
│   ├── routes/              # auth, chat, metrics, tools
│   ├── controllers/         # Lógica de cada endpoint
│   ├── middleware/          # auth (JWT), error, rateLimit
│   └── services/            # ai.service, ai.providers, tutor.agent,
│                            # tutor.integration, cache, moderation, prompt
├── database/                # Esquema y migraciones SQL Server
├── test/                    # Suites automatizadas (node:test) + runner
├── scripts/start-prod.js    # Lanzador de producción multiplataforma
├── serve-web.js             # Servidor estático local del frontend
├── .env.example             # Plantilla de variables (sin secretos)
├── .env.production.example  # Plantilla de producción (sin secretos)
└── Dockerfile
```

## Instalación

```bash
cd backend
npm install
cp .env.example .env      # completar con valores reales
```

Aplicar los scripts de `database/` en el orden indicado en
[`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

## Scripts

| Comando | Acción |
|---|---|
| `npm start` | `node src/server.js` |
| `npm run dev` | `nodemon src/server.js` |
| `npm run prod` | Arranque con `NODE_ENV=production` (multiplataforma) |
| `npm test` | Ejecuta todas las suites con `test/run-tests.js` |
| `npm run serve-web` | Sirve `../web` en `http://localhost:3000` |

## Endpoints

Ver la tabla completa en [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).
Resumen: `/api/auth`, `/api/chat`, `/api/tools`, `/api/metrics`, más `/health` y
`/api/ai/providers` para diagnóstico.

## Proveedores de IA

`anthropic`, `reto` (RETO PLTK, modelo `grok-4.6`), `gemini`, `groq`,
`openrouter` y `ollama`. La selección y el respaldo se describen en
[`../docs/CONFIGURATION.md`](../docs/CONFIGURATION.md).

## Seguridad

- `.env` y `.env.production` están excluidos por `.gitignore`.
- Las pruebas eliminan las credenciales del entorno y bloquean la red.
- Ninguna respuesta HTTP ni log incluye valores de claves.
