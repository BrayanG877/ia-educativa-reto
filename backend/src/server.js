/**
 * Servidor Principal - Backend IA Educativa
 * Punto de entrada de la aplicación
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Configuraciones
const { connectDatabase } = require('./config/database');
const { connectRedis } = require('./config/redis');

// Middlewares personalizados
const { rateLimiter } = require('./middleware/rateLimit.middleware');
const { errorHandler } = require('./middleware/error.middleware');

// Rutas
const authRoutes = require('./routes/auth.routes');
const chatRoutes = require('./routes/chat.routes');
const metricsRoutes = require('./routes/metrics.routes');
const toolsRoutes = require('./routes/tools.routes');
const teacherRoutes = require('./routes/teacher.routes');

const app = express();
const PORT = process.env.PORT || 3001;

// Estado real de las dependencias, reportado por /health.
// Permite distinguir "backend caído" de "backend arriba pero BD caída".
const aiProviders = require('./services/ai.providers');
const activeProvider = aiProviders.getProvider();

const systemStatus = {
    database: 'pending',
    redis: 'pending',
    ai: activeProvider.configured()
        ? `${aiProviders.getProviderName()} (${activeProvider.model()})`
        : `${aiProviders.getProviderName()} SIN CONFIGURAR`
};

// ===================================
// CONFIGURACIÓN DE MIDDLEWARES
// ===================================

// Seguridad
// helmet() por defecto aplica una Content-Security-Policy con
// `script-src 'self'`, que BLOQUEA los <script> inline de las páginas
// (login.html, register.html, index.html...). Resultado: el navegador
// cargaba el HTML pero los botones de login/registro no hacían nada,
// porque su código inline nunca se ejecutaba.
//
// Se personaliza la CSP para permitir los scripts y estilos inline de
// NUESTRAS páginas (servidas desde el mismo origen). El resto de
// protecciones de helmet se mantienen.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // 'unsafe-inline' es necesario por los <script> inline del frontend.
            scriptSrc: ["'self'", "'unsafe-inline'"],
            // El frontend usa atributos style="..." inline.
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'https:', 'data:'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"]
        }
    }
}));

// CORS - Permitir múltiples orígenes para desarrollo
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Permitir requests sin origin (como mobile apps o curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'production') {
            return callback(null, true);
        }

        // En desarrollo, aceptar cualquier puerto local y las páginas abiertas
        // como file:// (que envían "Origin: null"). Antes sólo se aceptaba el
        // puerto 3000, así que abrir el HTML con Live Server (5500) o con doble
        // clic provocaba un error de CORS y parecía que la IA no respondía.
        if (process.env.NODE_ENV !== 'production') {
            if (origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
                return callback(null, true);
            }
        }

        console.warn('[CORS] Origen rechazado:', origin);
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parseo de JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting global
app.use(rateLimiter);

// ===================================
// SERVIR ARCHIVOS ESTÁTICOS (PRODUCCIÓN)
// ===================================

if (process.env.NODE_ENV === 'production') {
    const path = require('path');

    // Servir archivos estáticos desde la carpeta web
    app.use(express.static(path.join(__dirname, '../../web'), {
        maxAge: '1d',
        etag: true
    }));

    console.log('📁 Sirviendo archivos estáticos desde:', path.join(__dirname, '../../web'));
}

// ===================================
// RUTAS
// ===================================

// Ruta de health check
app.get('/health', async (req, res) => {
    const degraded = systemStatus.database !== 'connected';

    // Comprobacion LIGERA de cada proveedor configurado (listado de modelos,
    // sin consumir cuota de generacion; cacheada ~60s). Es opcional: si el
    // operador no la quiere, AI_HEALTHCHECK=off la desactiva.
    let providerStates = null;
    if (process.env.AI_HEALTHCHECK !== 'off') {
        try {
            providerStates = await buildProviderStates();
        } catch (e) {
            providerStates = null;
        }
    }

    res.status(200).json({
        status: degraded ? 'DEGRADED' : 'OK',
        timestamp: new Date().toISOString(),
        service: 'IA Educativa Backend',
        version: '1.0.0',
        dependencies: systemStatus,
        ai: {
            provider: aiProviders.getProviderName(),
            providers: aiProviders.listProviders(),
            ...(providerStates && { states: providerStates })
        }
    });
});

/**
 * Construye el estado detallado de cada proveedor: configurado, operativo,
 * error de autenticacion, cuota, temporal o modelo no disponible.
 * NO revela ninguna API key.
 */
async function buildProviderStates() {
    const proveedores = aiProviders.listProviders();
    const estados = {};

    for (const p of proveedores) {
        // Solo se comprueba disponibilidad de los proveedores CONFIGURADOS.
        if (!p.configured) {
            estados[p.id] = { configurado: false, estado: 'no_configurado' };
            continue;
        }
        const disp = await aiProviders.checkAvailability(p.id);
        estados[p.id] = {
            configurado: true,
            estado: disp.state,
            modelo: p.model,
            activo: p.active
        };
    }

    return estados;
}

// Estado de los proveedores de IA (público): útil para saber si el chat puede responder.
app.get('/api/ai/providers', async (req, res) => {
    const activo = aiProviders.getProviderName();
    const providers = aiProviders.listProviders();
    const actual = providers.find(p => p.id === activo);

    // Estado de disponibilidad (comprobacion ligera, cacheada). No expone claves.
    let states = null;
    if (process.env.AI_HEALTHCHECK !== 'off') {
        try { states = await buildProviderStates(); } catch (e) { states = null; }
    }

    res.json({
        success: true,
        data: {
            active: activo,
            // ready = el proveedor activo tiene lo necesario para responder
            ready: !!actual?.configured,
            model: actual?.model,
            providers,
            ...(states && { states })
        }
    });
});

// Ruta raíz
app.get('/', (req, res) => {
    res.json({
        message: 'API de IA Educativa',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            auth: '/api/auth',
            chat: '/api/chat',
            tools: '/api/tools',
            metrics: '/api/metrics',
            ai: '/api/ai/providers'
        }
    });
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/teacher', teacherRoutes);

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({
        error: 'Ruta no encontrada',
        path: req.path
    });
});

// Middleware de manejo de errores
app.use(errorHandler);

// ===================================
// INICIALIZACIÓN DEL SERVIDOR
// ===================================

async function startServer() {
    try {
        console.log('🚀 Iniciando servidor...');

        // Conectar a la base de datos.
        // NO se aborta el arranque si falla: si el proceso muere, el frontend sólo
        // recibe "Failed to fetch" y el estudiante cree que la IA no responde.
        // Se arranca el servidor y /health reporta el estado real de cada dependencia.
        console.log('📦 Conectando a SQL Server...');
        try {
            await connectDatabase();
            systemStatus.database = 'connected';
            console.log('✅ SQL Server conectado');
        } catch (dbError) {
            systemStatus.database = `error: ${dbError.message}`;
            console.error('❌ SQL Server NO conectado:', dbError.message);
            console.warn('⚠️ El servidor arranca en modo degradado. /health mostrará el detalle.');
        }

        // Conectar a Redis (opcional: el caché no es crítico para responder)
        console.log('🔴 Conectando a Redis...');
        const redisClient = await connectRedis();
        systemStatus.redis = redisClient ? 'connected' : 'unavailable (sin caché)';
        console.log(redisClient ? '✅ Redis conectado' : '⚠️ Redis no disponible, se continúa sin caché');

        // Validar la configuración del subsistema de IA (nunca imprime secretos).
        // Un fallo de un proveedor ALTERNATIVO solo genera aviso; el arranque NO
        // se aborta por ello. Solo se advierte fuerte si el proveedor PRINCIPAL
        // no tiene credencial (el chat no podrá responder hasta configurarla).
        try {
            const aiConfig = require('./config/ai.config');
            const reporte = aiConfig.validate();
            console.log('\n🤖 Configuración de IA:');
            console.log(`   - Proveedor principal: ${reporte.provider}` +
                (reporte.providerHasKey ? ' (clave configurada)' : ' (SIN CLAVE)'));
            console.log(`   - Fallback: ${reporte.fallbackEnabled ? 'activado' : 'desactivado'}` +
                (reporte.fallbackProviders.length ? ` -> [${reporte.fallbackProviders.join(', ')}]` : ''));
            reporte.avisos.forEach(a => console.warn(`   ⚠️ ${a}`));
            reporte.errores.forEach(e => console.error(`   ❌ ${e}`));
        } catch (aiCfgError) {
            console.warn('⚠️ No se pudo validar la configuración de IA:', aiCfgError.message);
        }

        // Iniciar servidor
        const server = app.listen(PORT, () => {
            console.log('✅ Servidor iniciado correctamente');
            console.log(`🌐 Servidor escuchando en puerto ${PORT}`);
            console.log(`🔗 URL: http://localhost:${PORT}`);
            console.log(`📚 Documentación: http://localhost:${PORT}/`);
            console.log('\n📊 Estado del sistema:');
            console.log(`   - Entorno: ${process.env.NODE_ENV || 'development'}`);
            console.log(`   - Base de datos: SQL Server (Azure)`);
            console.log(`   - Caché: Redis`);
            console.log(`   - IA: ${aiProviders.getProviderName()} -> ${activeProvider.model()}`);
            console.log('\n📍 Endpoints disponibles:');
            console.log(`   - POST /api/auth/register - Registrar usuario`);
            console.log(`   - POST /api/auth/login - Iniciar sesión`);
            console.log(`   - POST /api/chat/message - Enviar mensaje a IA`);
            console.log(`   - GET  /api/chat/history/:id - Obtener historial`);
            console.log(`   - GET  /api/chat/subjects - Listar materias`);
            console.log(`   - GET  /api/metrics/ranking - Ver ranking`);
            console.log('\n⚡ El servidor está listo para recibir peticiones\n');
        });

        // Puerto ocupado: antes el proceso moría con un stack trace crudo de
        // EADDRINUSE. Ahora se explica la causa y cómo resolverla, y se sale
        // con un código claro en vez de un volcado de error confuso.
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`\n❌ El puerto ${PORT} ya está en uso.`);
                console.error('   Probablemente el servidor ya está corriendo en otra ventana.');
                console.error('   Soluciones:');
                console.error(`     • Windows: netstat -ano | findstr :${PORT}  y luego  taskkill /PID <pid> /F`);
                console.error('     • O cambia PORT en backend/.env y vuelve a arrancar.');
                process.exit(1);
            }
            console.error('❌ Error en el servidor:', err);
            process.exit(1);
        });

    } catch (error) {
        console.error('❌ Error al iniciar el servidor:', error);
        process.exit(1);
    }
}

// ===================================
// ARRANQUE SOLO CUANDO SE EJECUTA COMO PROGRAMA PRINCIPAL (Fase 5B.8)
// ===================================
// Motivo: antes, cualquier `require('./server.js')` (por ejemplo desde una
// prueba) llamaba a startServer() y ABRÍA PUERTOS / CONECTABA a SQL Server y
// Redis como efecto secundario de la importación. Se separa el arranque
// automático del código importable con el cambio mínimo en CommonJS:
// `require.main === module` es true SOLO cuando este archivo es el punto de
// entrada (`node src/server.js` o `npm start`), no cuando se importa.
if (require.main === module) {
    // Manejo de señales de terminación
    process.on('SIGTERM', () => {
        console.log('\n🛑 Señal SIGTERM recibida, cerrando servidor...');
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log('\n🛑 Señal SIGINT recibida, cerrando servidor...');
        process.exit(0);
    });

    // Iniciar servidor
    startServer();
}

module.exports = app;
module.exports.startServer = startServer;
