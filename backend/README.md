# Backend - Plataforma Educativa de IA

Backend para sistema de IA educativa con método socrático, integrado con Anthropic Claude API.

## Características

- **IA Educativa**: Integración con Anthropic Claude para tutorización socrática
- **Optimización de costos**: Sistema de caché con Redis para reducir llamadas a la API
- **Seguridad**: Autenticación JWT, rate limiting, validación de contenido
- **Escalabilidad**: Arquitectura modular preparada para crecimiento
- **Cumplimiento legal**: Diseñado según Ley 1581 de 2012 (Colombia)

## Tecnologías

- **Node.js** + **Express.js**: Servidor API REST
- **PostgreSQL**: Base de datos relacional
- **Redis**: Sistema de caché
- **Anthropic Claude API**: Motor de inteligencia artificial
- **JWT**: Autenticación y autorización

## Instalación

### Prerequisitos

- Node.js (v18 o superior)
- PostgreSQL (v14 o superior)
- Redis (v7 o superior)
- Cuenta de Anthropic con API Key

### Pasos de instalación

1. Instalar dependencias:
```bash
cd backend
npm install
```

2. Configurar variables de entorno:
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

3. Crear base de datos:
```bash
# Ejecutar script de inicialización (próximamente)
npm run db:init
```

4. Iniciar servidor en modo desarrollo:
```bash
npm run dev
```

## Estructura del proyecto

```
backend/
├── src/
│   ├── server.js              # Punto de entrada
│   ├── config/                # Configuraciones
│   │   ├── database.js        # Configuración PostgreSQL
│   │   ├── redis.js           # Configuración Redis
│   │   └── anthropic.js       # Configuración Anthropic Claude
│   ├── routes/                # Rutas de la API
│   │   ├── auth.routes.js     # Autenticación
│   │   ├── chat.routes.js     # Chat con IA
│   │   ├── subjects.routes.js # Materias
│   │   └── metrics.routes.js  # Métricas y progreso
│   ├── controllers/           # Controladores
│   │   ├── auth.controller.js
│   │   ├── chat.controller.js
│   │   └── metrics.controller.js
│   ├── services/              # Lógica de negocio
│   │   ├── ai.service.js      # Servicio de IA
│   │   ├── cache.service.js   # Servicio de caché
│   │   ├── moderation.service.js # Moderación de contenido
│   │   └── prompt.service.js  # Gestión de prompts
│   ├── models/                # Modelos de base de datos
│   │   ├── User.js
│   │   ├── Conversation.js
│   │   └── Metrics.js
│   ├── middleware/            # Middlewares
│   │   ├── auth.middleware.js
│   │   ├── validation.middleware.js
│   │   └── rateLimit.middleware.js
│   └── utils/                 # Utilidades
│       ├── logger.js
│       └── errors.js
├── database/                  # Scripts de base de datos
│   └── schema.sql
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## API Endpoints (Planificados)

### Autenticación
- `POST /api/auth/register` - Registro de usuario
- `POST /api/auth/login` - Inicio de sesión
- `POST /api/auth/logout` - Cierre de sesión

### Chat con IA
- `POST /api/chat/message` - Enviar mensaje a la IA
- `GET /api/chat/history` - Obtener historial de conversación
- `DELETE /api/chat/clear` - Limpiar conversación

### Materias
- `GET /api/subjects` - Listar materias disponibles
- `POST /api/subjects/select` - Seleccionar materia activa

### Métricas
- `GET /api/metrics/user` - Obtener métricas del usuario
- `GET /api/metrics/ranking` - Obtener ranking (para profesores)

## Características de Seguridad

- Rate limiting por usuario
- Validación de entrada con Joi
- Moderación de contenido educativo
- Encriptación de contraseñas con bcrypt
- Protección CORS configurada
- Headers de seguridad con Helmet

## Optimización de Costos

- Caché de respuestas frecuentes en Redis
- Límite de tokens por request
- Historial de conversación limitado (últimos 5 mensajes)
- Sistema de throttling

## Cumplimiento Legal

- Protección de datos según Ley 1581 de 2012
- Logs de auditoría
- Consentimiento de padres (sistema pendiente)
- Filtrado de contenido no educativo

## Estado del Proyecto

**Fase actual**: Fase 2 - Implementación de Backend

- [x] Estructura base del proyecto
- [ ] Integración con Anthropic Claude API
- [ ] Esquema de base de datos PostgreSQL
- [ ] Sistema de caché con Redis
- [ ] Endpoints REST básicos
- [ ] Sistema de moderación
- [ ] Implementación de prompts socráticos

## Licencia

Proyecto educativo - En desarrollo
