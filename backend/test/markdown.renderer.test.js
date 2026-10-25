/**
 * RENDERIZADOR MARKDOWN SEGURO (web/markdown.js)
 * ==================================================================
 * El texto del modelo se inserta en el DOM del estudiante. Este test fija
 * dos garantías:
 *
 *   SEGURIDAD — ningún HTML del modelo se ejecuta, ningún esquema de URL
 *   peligroso sobrevive, y no se generan imágenes ni etiquetas fuera de la
 *   lista blanca.
 *
 *   FORMATO — el Markdown real del tutor (títulos, listas, tablas, código,
 *   fórmulas, citas) se representa con la estructura esperada. El render
 *   anterior convertía cada salto de línea en <br>, lo que rompía listas y
 *   convertía cualquier línea con "|" en una fila de tabla.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const Markdown = require(path.join(__dirname, '..', '..', 'web', 'markdown.js'));

// ==================================================================
// SEGURIDAD
// ==================================================================
test('markdown(1): el HTML del modelo se escapa, no se ejecuta', () => {
    const html = Markdown.safeRender('<img src=x onerror="alert(1)">');

    // No existe ninguna etiqueta real: el '<' inicial está escapado.
    assert.ok(!/<img/i.test(html), 'No debe generarse una etiqueta <img>');
    assert.ok(html.includes('&lt;img'), 'El texto debe aparecer escapado');

    // La garantía fuerte: el marcado del MODELO no genera ninguna etiqueta;
    // solo existen las que produce el propio renderizador (<p>).
    const sinEtiquetaParrafo = html.replace(/<\/?p[^>]*>/g, '');
    assert.ok(!/<\s*\/?\s*[a-zA-Z!]/.test(sinEtiquetaParrafo),
        'No debe quedar ninguna etiqueta HTML procedente del modelo');
});

test('markdown(2): <script> queda como texto inerte', () => {
    const html = Markdown.safeRender('<script>alert("xss")</script>');
    assert.ok(!/<script/i.test(html));
    assert.ok(html.includes('&lt;script&gt;'));
});

test('markdown(3): los enlaces javascript: no se convierten en <a>', () => {
    const variantes = [
        '[click](javascript:alert(1))',
        '[click](JaVaScRiPt:alert(1))',
        '[click](data:text/html;base64,PHNjcmlwdD4=)',
        '[click](vbscript:msgbox)'
    ];
    for (const md of variantes) {
        const html = Markdown.safeRender(md);
        assert.ok(!/<a\s/i.test(html), `No debe crear enlace para: ${md}`);
        assert.ok(!/href=/i.test(html));
    }
});

test('markdown(4): los enlaces http/https/mailto sí son válidos y seguros', () => {
    const html = Markdown.safeRender('[khan](https://es.khanacademy.org)');
    assert.ok(/<a href="https:\/\/es\.khanacademy\.org"/.test(html));
    assert.ok(html.includes('rel="noopener noreferrer"'));
    assert.ok(html.includes('target="_blank"'));

    const mail = Markdown.safeRender('[correo](mailto:a@b.com)');
    assert.ok(mail.includes('href="mailto:a@b.com"'));
});

test('markdown(5): intención de escape con espacios o entidades se rechaza', () => {
    assert.strictEqual(Markdown.urlSegura('java\tscript:alert(1)'), null);
    assert.strictEqual(Markdown.urlSegura(' https://ok.com'), 'https://ok.com');
    assert.strictEqual(Markdown.urlSegura('/relativo'), null);
    assert.strictEqual(Markdown.urlSegura('//evil.com'), null);
});

test('markdown(6): no se generan imágenes remotas', () => {
    const html = Markdown.safeRender('![alt](https://evil.test/x.png)');
    assert.ok(!/<img/i.test(html));
});

test('markdown(7): solo se generan etiquetas de la lista blanca', () => {
    const md = [
        '# Título', '**negrita**', '*cursiva*', '`code`', '~~tachado~~',
        '- item', '1. item', '> cita', '```js\nconst a=1;\n```',
        '| a | b |', '|---|---|', '| 1 | 2 |', '[ok](https://ok.test)'
    ].join('\n\n');
    const html = Markdown.safeRender(md);

    const permitidas = /^<\/?(h1|h2|h3|h4|p|ul|ol|li|strong|em|code|pre|blockquote|table|thead|tbody|tr|th|td|hr|a|del|div|br|i|span)$/;
    const etiquetas = html.match(/<\/?([a-zA-Z0-9]+)/g) || [];
    for (const t of etiquetas) {
        const nombre = t.replace(/[<\/]/g, '').toLowerCase();
        assert.ok(permitidas.test(t.replace(/[<\/]/g, '')) || ['h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li',
            'strong', 'em', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'a', 'del', 'div', 'br', 'i', 'span'].includes(nombre),
            `Etiqueta no permitida: <${nombre}>`);
    }
});

// ==================================================================
// FORMATO
// ==================================================================
test('markdown(8): las listas NO se convierten en <br> sueltos', () => {
    const md = '- uno\n- dos\n- tres';
    const html = Markdown.safeRender(md);
    assert.ok(html.includes('<ul class="md-list">'));
    assert.strictEqual((html.match(/<li>/g) || []).length, 3);
    assert.ok(!/<br/.test(html), 'Una lista no debe generar <br>');
});

test('markdown(9): las listas numeradas usan <ol>', () => {
    const html = Markdown.safeRender('1. Primero\n2. Segundo');
    assert.ok(html.includes('<ol class="md-list">'));
    assert.strictEqual((html.match(/<li>/g) || []).length, 2);
});

test('markdown(10): los títulos usan su nivel correcto', () => {
    const html = Markdown.safeRender('# T1\n## T2\n### T3');
    assert.ok(html.includes('<h1 class="md-h1">T1</h1>'));
    assert.ok(html.includes('<h2 class="md-h2">T2</h2>'));
    assert.ok(html.includes('<h3 class="md-h3">T3</h3>'));
});

test('markdown(11): una línea con "|" NO es una tabla si falta el separador', () => {
    const html = Markdown.safeRender('La razón a | b significa proporción.');
    assert.ok(!html.includes('<table'), 'No debe inventar una tabla');
    assert.ok(html.includes('<p class="md-p">'));
});

test('markdown(12): una tabla real se representa con thead/tbody', () => {
    const md = '| Concepto | Valor |\n|---|---|\n| Área | 12 |\n| Perímetro | 16 |';
    const html = Markdown.safeRender(md);
    assert.ok(html.includes('<table class="md-table">'));
    assert.ok(html.includes('<thead>'));
    assert.ok(html.includes('<tbody>'));
    assert.strictEqual((html.match(/<tr>/g) || []).length, 3); // cabecera + 2 filas
});

test('markdown(13): los bloques de código conservan su contenido literal', () => {
    const md = '```js\nconst x = 1 * 2;\n```';
    const html = Markdown.safeRender(md);
    assert.ok(html.includes('<pre class="md-code-block">'));
    assert.ok(html.includes('const x = 1 * 2;'));
    // El asterisco dentro del código NO debe convertirse en cursiva
    assert.ok(!/<em>/.test(html));
});

test('markdown(14): las fórmulas en bloque se distinguen del texto', () => {
    const html = Markdown.safeRender('$$\nx = \\frac{a}{b}\n$$');
    assert.ok(html.includes('class="md-formula"'));
});

test('markdown(15): las citas se marcan como blockquote', () => {
    const html = Markdown.safeRender('> 💡 La idea clave es...');
    assert.ok(html.includes('<blockquote class="md-quote">'));
});

test('markdown(16): el texto se agrupa por líneas consecutivas sin perder contenido', () => {
    const html = Markdown.safeRender('Primera linea\ncontinua aqui');
    // Las líneas consecutivas forman un bloque (no un <br> por cada salto).
    assert.strictEqual((html.match(/<p class="md-p">/g) || []).length, 1);
    assert.ok(html.includes('Primera linea'));
    assert.ok(html.includes('continua aqui'));
    assert.ok(!/<br/.test(html), 'No debe generar <br> entre líneas de un párrafo');
});

test('markdown(17): el texto del estudiante no interpreta Markdown', () => {
    const html = Markdown.plainRender('# no es titulo\n**no es negrita**');
    assert.ok(!html.includes('<h1'));
    assert.ok(!html.includes('<strong>'));
    assert.ok(html.includes('<br>'));
});

test('markdown(18): entrada vacía o nula no rompe el render', () => {
    assert.strictEqual(Markdown.safeRender(''), '');
    assert.strictEqual(Markdown.safeRender(null), '');
    assert.strictEqual(Markdown.safeRender(undefined), '');
});

test('markdown(19): una respuesta realista del tutor se estructura bien', () => {
    const md = [
        '**🎯 Objetivo:** comprender las fracciones equivalentes.',
        '',
        '## Paso 1: observa el patrón',
        '',
        '- Si multiplicas el numerador y el denominador por el mismo número...',
        '- ...el valor no cambia.',
        '',
        'Ejemplo:',
        '',
        '$$\\frac{1}{2} = \\frac{2}{4}$$',
        '',
        '> 💡 Pregúntate: ¿qué le pasó al numerador?',
        '',
        '**Ahora inténtalo:** ¿3/6 es equivalente a 1/2?'
    ].join('\n');
    const html = Markdown.safeRender(md);

    assert.ok(html.includes('<strong>'), 'conserva negritas');
    assert.ok(html.includes('<h2 class="md-h2">'), 'conserva títulos');
    assert.strictEqual((html.match(/<li>/g) || []).length, 2, 'conserva ambas viñetas');
    assert.ok(html.includes('class="md-formula"'), 'conserva la fórmula');
    assert.ok(html.includes('<blockquote'), 'conserva la pregunta guía');
});
