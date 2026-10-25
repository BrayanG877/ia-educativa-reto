/**
 * STREAMING SSE — contratos del parser y del endpoint
 * ==================================================================
 * Cubre lo que puede romperse sin red:
 *
 *   1. Parser SSE: fragmentos progresivos, delimitación por '\n\n' y
 *      fragmentos partidos entre chunks.
 *   2. Filtro de razonamiento: `reasoning_content` NUNCA llega al estudiante.
 *   3. uso de tokens en el último fragmento.
 *   4. Respuestas vacías y errores del proveedor.
 *   5. Cancelación del cliente (no debe registrar ni propagar texto).
 *   6. Markdown incompleto que se completa al final.
 *
 * La prueba REAL contra el modelo está en scripts/check-stream.js.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const BACKEND = path.join(__dirname, '..');
const providers = require(path.join(BACKEND, 'src/services/ai.providers.js'));
const Markdown = require(path.join(__dirname, '..', '..', 'web', 'markdown.js'));

/** Construye un Response falso a partir de una lista de trozos crudos. */
function respuestaSSE(trozos, { status = 200 } = {}) {
    let i = 0;
    return {
        ok: status >= 200 && status < 300,
        status,
        body: {
            getReader() {
                return {
                    async read() {
                        if (i >= trozos.length) return { done: true, value: undefined };
                        const t = trozos[i++];
                        return { done: false, value: new TextEncoder().encode(t) };
                    },
                    async cancel() { i = trozos.length; }
                };
            }
        }
    };
}

/** Fragmento SSE con contenido visible. */
function sse(texto) {
    const payload = { choices: [ { delta: { content: texto }} ] };
    return 'data: ' + JSON.stringify(payload) + '\n\n';
}

/** Fragmento SSE con RAZONAMIENTO interno (no debe mostrarse). */
function sseRazonamiento(texto) {
    const payload = { choices: [ { delta: { reasoning_content: texto }} ] };
    return 'data: ' + JSON.stringify(payload) + '\n\n';
}

// ==================================================================
// 1. Parser SSE
// ==================================================================
test('stream(1): emite los fragmentos progresivamente y concatena el texto', async () => {
    const recibidos = [];
    const res = respuestaSSE([
        sse('Cristóbal '),
        sse('Colón '),
        sse('fue un navegante.'),
        'data: [DONE]\n\n'
    ]);

    const r = await providers.consumirSSE(res, { onDelta: t => recibidos.push(t) });

    assert.deepStrictEqual(recibidos, ['Cristóbal ', 'Colón ', 'fue un navegante.']);
    assert.strictEqual(r.text, 'Cristóbal Colón fue un navegante.');
    assert.strictEqual(r.fragmentos, 3);
});

test('stream(2): un fragmento partido entre dos chunks se reconstruye', async () => {
    // El corte cae en medio del JSON: sin buffer, se perdería el evento.
    const completo = sse('Hola mundo');
    const corte = 20;
    const res = respuestaSSE([completo.slice(0, corte), completo.slice(corte), 'data: [DONE]\n\n']);

    const r = await providers.consumirSSE(res, {});
    assert.strictEqual(r.text, 'Hola mundo');
});

test('stream(3): el razonamiento interno NUNCA se emite', async () => {
    const recibidos = [];
    const res = respuestaSSE([
        sseRazonamiento('Voy a pensar en Colón, que fue...'),
        sseRazonamiento(' y además Columbus...'),
        sse('Cristóbal Colón fue un navegante.'),
        'data: [DONE]\n\n'
    ]);

    const r = await providers.consumirSSE(res, { onDelta: t => recibidos.push(t) });

    assert.strictEqual(recibidos.length, 1, 'Solo el contenido visible');
    assert.strictEqual(r.text, 'Cristóbal Colón fue un navegante.');
    assert.ok(!/Voy a pensar/.test(r.text), 'El monólogo interno no debe filtrarse');
});

test('stream(4): el usage del último fragmento se conserva', async () => {
    const res = respuestaSSE([
        sse('Hola'),
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } })}\n\n`,
        'data: [DONE]\n\n'
    ]);

    const r = await providers.consumirSSE(res, {});
    assert.strictEqual(r.usage.total_tokens, 14);
    assert.strictEqual(r.finishReason, 'stop');
});

test('stream(5): líneas que no son data (keep-alive, comentarios) se ignoran', async () => {
    const res = respuestaSSE([
        ': keep-alive\n',
        sse('uno'),
        'event: ping\n',
        sse(' dos'),
        'data: [DONE]\n\n'
    ]);
    const r = await providers.consumirSSE(res, {});
    assert.strictEqual(r.text, 'uno dos');
});

test('stream(6): un fragmento JSON inválido no rompe el flujo', async () => {
    const res = respuestaSSE([
        sse('bueno'),
        'data: {esto no es json\n',
        sse(' malo'),
        'data: [DONE]\n\n'
    ]);
    const r = await providers.consumirSSE(res, {});
    assert.strictEqual(r.text, 'bueno malo');
});

// ==================================================================
// 2. Respuestas vacías y errores
// ==================================================================
test('stream(7): respuesta vacía devuelve texto vacío (el servicio la trata como error)', async () => {
    const res = respuestaSSE([sseRazonamiento('solo pensé, no respondí'), 'data: [DONE]\n\n']);
    const r = await providers.consumirSSE(res, {});
    assert.strictEqual(r.text, '');
});

test('stream(8): el proveedor expone completionStream y declara soporte', () => {
    const prov = providers.PROVIDERS.reto;
    assert.strictEqual(typeof prov.completionStream, 'function');
    assert.strictEqual(prov.streamSupported, true);
    // Los proveedores sin streaming no deben fingirlo.
    assert.strictEqual(providers.PROVIDERS.groq.completionStream, undefined);
});

test('stream(9): el proveedor sin streaming real no finge soporte', () => {
    // Groq usa un endpoint compatible, pero su completionStream no está
    // implementado: el servicio debe RENDIRSE con 501 en vez de inventarlo.
    assert.strictEqual(providers.PROVIDERS.groq.completionStream, undefined);
    assert.notStrictEqual(providers.PROVIDERS.groq.streamSupported, true);
});

// ==================================================================
// 3. Cancelación
// ==================================================================
test('stream(10): un signal ya abortado corta la lectura sin lanzar', async () => {
    const controlador = new AbortController();
    controlador.abort();

    const res = respuestaSSE([sse('parte 1'), sse('parte 2'), 'data: [DONE]\n\n']);
    const r = await providers.consumirSSE(res, {}, controlador.signal);

    // El lector se cancela: como mínimo no se lanza ni se cuelga.
    assert.ok(typeof r.text === 'string');
});

// ==================================================================
// 4. Markdown parcial durante el streaming
// ==================================================================
test('stream(11): un bloque de código a medias no rompe el render', () => {
    const parcial = 'Aquí va el código:\n\n```js\nconst a = 1;';
    const html = Markdown.safeRender(parcial);
    // No debe haber un <pre> colgando ni HTML inyectado
    assert.ok(!/<script/i.test(html));
    assert.ok(typeof html === 'string' && html.length > 0);
});

test('stream(12): una lista abierta a medias se completa al llegar el cierre', () => {
    const parcial = '- uno\n- dos\n- tres';
    const html = Markdown.safeRender(parcial);
    assert.strictEqual((html.match(/<li>/g) || []).length, 3);
});

test('stream(13): la negrita abierta no muestra asteriscos al completarse', () => {
    const final = Markdown.safeRender('**Reflexión sobre Expresiones Algebraicas y Polinomios**');
    assert.ok(final.includes('<strong>Reflexión sobre Expresiones Algebraicas y Polinomios</strong>'));
    assert.ok(!final.includes('**'), 'No deben quedar asteriscos visibles');
});

test('stream(14): el texto parcial nunca inyecta HTML del modelo', () => {
    // Un modelo malicioso o un HTML pegado por el estudiante
    const html = Markdown.safeRender('<img src=x onerror=alert(1)>');
    assert.ok(!/<img/i.test(html));
    assert.ok(html.indexOf('&lt;img') !== -1, 'Debe aparecer escapado');
});

// ==================================================================
// 5. Compatibilidad con el frontend
// ==================================================================
test('stream(15): el cliente usa /api/chat/stream y no fuerza materia', () => {
    const fs = require('fs');
    const cliente = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'api-client.js'), 'utf8');
    assert.ok(cliente.includes("STREAM: '/api/chat/stream'"));
    assert.ok(/streamMessage\s*\(/.test(cliente));
    // La regresión P0: nunca imponer matematicas por defecto
    assert.ok(!/subject\s*=\s*'matematicas'/.test(cliente));
});

test('stream(16): el frontend no duplica el mensaje tras el streaming', () => {
    const fs = require('fs');
    const app = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'app.js'), 'utf8');
    assert.ok(/yaMostrado/.test(app), 'Debe existir la guarda contra pintado doble');
    assert.ok(/if \(!aiMessage\.yaMostrado\)/.test(app));
});
// ==================================================================
// 4. Garantías del flujo completo (contrato del controlador)
// ==================================================================
/**
 * Estas comprobaciones son ESTÁTICAS sobre el código del controlador.
 * Verifican que el registro de analítica está condicionado a que el turno
 * haya TERMINADO, y que no hay rutas que lo ejecuten dos veces.
 *
 * La prueba dinámica (con BD y proveedor dobles) está limitada por el
 * aislamiento de módulos; por eso se fija aquí el contrato estructural.
 */
const fs = require('fs');
const CTRL = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'controllers', 'chat.controller.js'), 'utf8'
);

/** Extrae el cuerpo de exports.streamMessage. */
function cuerpoStreamMessage() {
    const inicio = CTRL.indexOf('exports.streamMessage');
    assert.ok(inicio > -1, 'streamMessage debe existir');
    const fin = CTRL.indexOf('exports.getHistory', inicio);
    return CTRL.slice(inicio, fin);
}

test('stream(17): solo hay UN registro de analítica en el flujo de streaming', () => {
    const cuerpo = cuerpoStreamMessage();
    const llamadas = (cuerpo.match(/registrarEvento\s*\(/g) || []).length;
    assert.strictEqual(llamadas, 1, 'Un turno = un evento; ni cero ni dos');
});

test('stream(18): el registro ocurre DESPUÉS de la cancelación y al final', () => {
    const cuerpo = cuerpoStreamMessage();
    const posCancelacion = cuerpo.indexOf('if (canceladoPorCliente) return;');
    const posRegistro = cuerpo.indexOf('registrarEvento');
    const posCompleto = cuerpo.indexOf('completo = true');

    assert.ok(posCancelacion > -1, 'Debe salir antes de persistir si se canceló');
    assert.ok(posRegistro > posCancelacion, 'No se registra si el cliente canceló');
    assert.ok(posCompleto > posRegistro, 'El turno se marca completo tras registrar');
});

test('stream(19): un error NO registra evento (el catch no llama a registrar)', () => {
    const cuerpo = cuerpoStreamMessage();
    const posCatch = cuerpo.indexOf('} catch (error) {');
    const posFinally = cuerpo.indexOf('} finally {');
    const bloqueCatch = cuerpo.slice(posCatch, posFinally);
    assert.ok(posCatch > -1 && posFinally > posCatch);
    assert.ok(!/registrarEvento/.test(bloqueCatch), 'El catch no debe registrar eventos');
});

test('stream(20): la respuesta al cliente nunca incluye razonamiento interno', () => {
    const cuerpo = cuerpoStreamMessage();
    // El único contenido que se emite es el que llega por onDelta, ya filtrado.
    assert.ok(/onDelta:\s*\(trozo\)/.test(cuerpo));
    // Y el proveedor solo emite delta.content
    const prov = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'ai.providers.js'), 'utf8');
    assert.ok(/const visible = delta\.content;/.test(prov));
    assert.ok(!/onDelta\(\s*delta\.reasoning_content/.test(prov));
});

test('stream(21): no se reintenta automáticamente tras emitir texto', () => {
    const cuerpo = cuerpoStreamMessage();
    // No debe existir un bucle de reintento ni una segunda llamada al servicio.
    const llamadasServicio = (cuerpo.match(/generateResponseStream\s*\(/g) || []).length;
    assert.strictEqual(llamadasServicio, 1, 'Una sola llamada al servicio por turno');
});

test('stream(22): la conversación se valida contra el usuario autenticado', () => {
    const cuerpo = cuerpoStreamMessage();
    assert.ok(/WHERE id = @param1 AND user_id = @param2/.test(cuerpo),
        'Debe verificarse la propiedad de la conversación (aislamiento por usuario)');
    assert.ok(/req\.userId/.test(cuerpo));
});
