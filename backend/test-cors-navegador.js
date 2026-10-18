/**
 * Simula la petición tal como la emite el navegador, con cabecera Origin,
 * incluido el preflight OPTIONS. Prueba los 3 escenarios de servido:
 *   - http://localhost:3000  (npm start en /web)
 *   - http://localhost:5500  (Live Server de VS Code)
 *   - null                   (index.html abierto con doble clic, file://)
 */
const BASE = 'http://localhost:3001';

async function probarOrigen(origin) {
    const etiqueta = origin === 'null' ? 'null (file://)' : origin;

    // 1) Preflight: el navegador lo envía antes de un POST con Authorization
    const pre = await fetch(`${BASE}/api/chat/message`, {
        method: 'OPTIONS',
        headers: {
            'Origin': origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,authorization'
        }
    });
    const allow = pre.headers.get('access-control-allow-origin');

    // 2) GET real a un endpoint público
    const get = await fetch(`${BASE}/api/chat/subjects`, { headers: { 'Origin': origin } });
    const allowGet = get.headers.get('access-control-allow-origin');

    const ok = pre.status < 400 && !!allow && !!allowGet;
    console.log(`${ok ? '✅' : '❌'} Origin: ${etiqueta}`);
    console.log(`     preflight OPTIONS -> HTTP ${pre.status} | allow-origin: ${allow || '(AUSENTE = el navegador bloquea)'}`);
    console.log(`     GET /subjects     -> HTTP ${get.status} | allow-origin: ${allowGet || '(AUSENTE)'}`);
    return ok;
}

(async () => {
    console.log('=== CORS tal como lo evalúa el navegador (NODE_ENV=development) ===\n');
    const origenes = ['http://localhost:3000', 'http://localhost:5500', 'null'];
    let todos = true;
    for (const o of origenes) {
        todos = (await probarOrigen(o)) && todos;
        console.log('');
    }
    console.log(todos
        ? 'RESULTADO: los 3 modos de servir el frontend funcionan'
        : 'RESULTADO: algún origen sigue bloqueado');
})();
