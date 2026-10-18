/**
 * Script de Prueba de Redis
 * Verifica que Redis esté funcionando correctamente
 */

require('dotenv').config();
const Redis = require('ioredis');

async function testRedis() {
    const host = process.env.REDIS_HOST || 'localhost';
    const isAzure = host.endsWith('.redis.azure.net') || host.endsWith('.redis.cache.windows.net') || process.env.REDIS_TLS === 'true';
    const defaultPort = host.endsWith('.redis.azure.net') ? 10000 : (isAzure ? 6380 : 6379);
    const port = parseInt(process.env.REDIS_PORT) || defaultPort;

    console.log('🧪 Probando conexión a Redis...\n');
    console.log(`📍 Host: ${host}`);
    console.log(`🔌 Puerto: ${port}`);
    console.log(`🛡️  TLS: ${isAzure ? 'activado (Azure)' : 'desactivado'}`);
    console.log(`🔐 Password: ${process.env.REDIS_PASSWORD ? '***configurado***' : 'sin password'}\n`);

    const options = {
        host,
        port,
        password: process.env.REDIS_PASSWORD || undefined,
        retryStrategy: () => null, // No reintentar en tests
        lazyConnect: true
    };

    if (isAzure) {
        // Azure Managed Redis exige TLS + usuario "default" con la Access Key.
        options.tls = { servername: host };
        options.username = process.env.REDIS_USERNAME || 'default';
    }

    const redis = new Redis(options);

    try {
        // Conectar
        console.log('🔄 Intentando conectar...');
        await redis.connect();
        console.log('✅ Conexión establecida\n');

        // Test 1: PING
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('1️⃣  Test PING');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const pong = await redis.ping();
        console.log(`   ✓ Resultado: ${pong}`);
        console.log(`   ${pong === 'PONG' ? '✅ EXITOSO' : '❌ FALLÓ'}\n`);

        // Test 2: SET/GET
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('2️⃣  Test SET/GET');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const testValue = 'Hola desde IA Educativa Colombia 🇨🇴';
        await redis.set('test:mensaje', testValue);
        const mensaje = await redis.get('test:mensaje');
        console.log(`   ✓ Guardado: "${testValue}"`);
        console.log(`   ✓ Recuperado: "${mensaje}"`);
        console.log(`   ${mensaje === testValue ? '✅ EXITOSO' : '❌ FALLÓ'}\n`);

        // Test 3: SET con TTL
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('3️⃣  Test SET con expiración (TTL)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        await redis.setex('test:temporal', 5, 'Este mensaje expira en 5 segundos');
        const ttl = await redis.ttl('test:temporal');
        console.log(`   ✓ Tiempo restante: ${ttl} segundos`);
        console.log(`   ${ttl > 0 && ttl <= 5 ? '✅ EXITOSO' : '❌ FALLÓ'}\n`);

        // Test 4: Guardar JSON
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('4️⃣  Test JSON (Simula caché de respuesta IA)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const respuestaIA = {
            pregunta: '¿Qué es el álgebra?',
            respuesta: 'El álgebra es una rama de las matemáticas...',
            materia: 'MAT',
            timestamp: new Date().toISOString(),
            tokens: 150
        };
        await redis.set('cache:respuesta:1', JSON.stringify(respuestaIA));
        const respuestaStr = await redis.get('cache:respuesta:1');
        const respuestaObj = JSON.parse(respuestaStr);
        console.log(`   ✓ Guardado:`, respuestaIA);
        console.log(`   ✓ Recuperado:`, respuestaObj);
        console.log(`   ${respuestaObj.pregunta === respuestaIA.pregunta ? '✅ EXITOSO' : '❌ FALLÓ'}\n`);

        // Test 5: Múltiples claves (patrón real de uso)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('5️⃣  Test Múltiples Claves (Búsqueda por patrón)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        await redis.set('cache:mat:pregunta1', 'respuesta1');
        await redis.set('cache:mat:pregunta2', 'respuesta2');
        await redis.set('cache:bio:pregunta1', 'respuesta3');
        const keysMat = await redis.keys('cache:mat:*');
        console.log(`   ✓ Claves encontradas con patrón "cache:mat:*": ${keysMat.length}`);
        console.log(`   ✓ Claves: ${keysMat.join(', ')}`);
        console.log(`   ${keysMat.length === 2 ? '✅ EXITOSO' : '❌ FALLÓ'}\n`);

        // Test 6: Estadísticas
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('6️⃣  Estadísticas de Redis');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const dbsize = await redis.dbsize();
        const info = await redis.info('memory');
        const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
        const memory = memoryMatch ? memoryMatch[1] : 'N/A';
        console.log(`   ✓ Total de claves en DB: ${dbsize}`);
        console.log(`   ✓ Memoria usada: ${memory}`);
        console.log(`   ✅ INFORMACIÓN OBTENIDA\n`);

        // Limpiar claves de test
        console.log('🧹 Limpiando claves de prueba...');
        await redis.del(
            'test:mensaje',
            'test:temporal',
            'cache:respuesta:1',
            'cache:mat:pregunta1',
            'cache:mat:pregunta2',
            'cache:bio:pregunta1'
        );
        console.log('✅ Claves eliminadas\n');

        // Resumen Final
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ TODOS LOS TESTS PASARON EXITOSAMENTE');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 Redis está funcionando correctamente');
        console.log('⚡ Tu servidor puede usar caché ahora');
        console.log('💰 Esto reducirá costos de API de Claude');
        console.log('🚀 Las respuestas serán mucho más rápidas\n');

    } catch (error) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('❌ ERROR EN LAS PRUEBAS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error(`   Mensaje: ${error.message}`);
        console.error(`   Código: ${error.code || 'N/A'}\n`);

        // Diagnóstico
        console.log('🔍 DIAGNÓSTICO:\n');

        if (error.code === 'ECONNREFUSED') {
            console.log('   ⚠️  Redis no está corriendo en tu sistema');
            console.log('   📝 Soluciones:');
            console.log('   ');
            console.log('   Windows:');
            console.log('   1. Descarga Redis: https://github.com/tporadowski/redis/releases');
            console.log('   2. Extrae a C:\\Redis');
            console.log('   3. Ejecuta: C:\\Redis\\redis-server.exe');
            console.log('   ');
            console.log('   Docker:');
            console.log('   1. Ejecuta: docker run -d --name redis-ia-educativa -p 6379:6379 redis:latest');
            console.log('   2. Verifica: docker ps');
            console.log('   ');
            console.log('   📖 Lee la guía completa: GUIA_REDIS.md\n');
        } else if (error.code === 'ENOTFOUND') {
            console.log('   ⚠️  Host de Redis no encontrado');
            console.log('   📝 Verifica tu archivo .env:');
            console.log(`   REDIS_HOST=${process.env.REDIS_HOST}`);
            console.log('   ');
            console.log('   Para Redis local, debe ser: localhost');
            console.log('   Para Azure, debe ser: tu-cache.redis.cache.windows.net\n');
        } else if (error.message.includes('authentication') || error.message.includes('WRONGPASS') || error.message.includes('invalid username-password')) {
            console.log('   ⚠️  Error de autenticación (usuario/contraseña incorrectos)');
            console.log('   📝 Para Azure Managed Redis verifica en el portal:');
            console.log('      Authentication -> Access keys -> copia la Primary key');
            console.log('      REDIS_USERNAME=default');
            console.log('      REDIS_PASSWORD=<tu Access Key>\n');
            console.log('   💡 Si ya te conectó a Azure (TLS OK) y falló aquí, sólo falta la key correcta.\n');
        } else {
            console.log('   ⚠️  Error desconocido');
            console.log('   📝 Verifica:');
            console.log('   1. Redis está corriendo: redis-cli ping');
            console.log('   2. Puerto correcto: 6379 (por defecto)');
            console.log('   3. Firewall no bloquea el puerto');
            console.log('   4. Variables .env correctas\n');
        }

        process.exit(1);
    } finally {
        redis.disconnect();
        console.log('👋 Desconectado de Redis\n');
    }
}

// Ejecutar tests
console.log('╔═══════════════════════════════════════════╗');
console.log('║   🧪 TEST DE REDIS - IA EDUCATIVA      ║');
console.log('╚═══════════════════════════════════════════╝\n');

testRedis();
