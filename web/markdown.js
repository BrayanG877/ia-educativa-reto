/**
 * Renderizador Markdown seguro para las respuestas del tutor IA
 * ==================================================================
 * Sustituye el render ad-hoc de app.js, que tenía tres defectos reales:
 *   1. Convertía CADA salto de línea en <br>, rompiendo listas y párrafos.
 *   2. El regex de tablas `\|(.+)\|` trataba cualquier línea con barras
 *      como fila de tabla.
 *   3. No soportaba listas, citas, enlaces ni separadores.
 *
 * SEGURIDAD (regla absoluta)
 *   - Se ESCAPA el HTML del modelo ANTES de interpretar Markdown. El texto
 *     nunca llega a innerHTML sin escapar.
 *   - Los únicos elementos generados son de una lista blanca fija.
 *   - Los enlaces solo admiten http/https/mailto y rel="noopener noreferrer".
 *   - No se permiten imágenes remotas (evita fugas y contenido no deseado).
 *   - No se inyecta HTML arbitrario: `<script>` llega como texto literal.
 *
 * USO
 *   const html = Markdown.safeRender(texto);
 *   el.innerHTML = html;
 *
 * SINTAXIS SOPORTADA
 *   # ## ### ####        títulos
 *   **negrita**  *cursiva*  `código`  ~~tachado~~
 *   - item / * item      listas
 *   1. item              listas numeradas
 *   > cita               citas
 *   ```bloque```         bloques de código
 *   | a | b |            tablas con separador |
 *   ---                  separador
 *   [texto](url)         enlaces (http, https, mailto)
 *   $...$ y $$...$$      fórmulas (se muestran en bloque monoespaciado)
 */
(function (global) {
    'use strict';

    /** Escapa HTML. Es la primera barrera de seguridad. */
    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Valida y normaliza una URL de enlace.
     * Devuelve null si el esquema no es explícitamente seguro, incluidos
     * `javascript:`, `data:` y `vbscript:` (y variantes con espacios/entidades).
     */
    function urlSegura(url) {
        if (typeof url !== 'string') return null;
        // Elimina caracteres de control y espacios que se usan para evadir el filtro.
        const limpia = url.replace(/[\u0000-\u0020]/g, '');
        const m = /^(https?:\/\/|mailto:)/i.exec(limpia);
        if (!m) return null;
        return limpia;
    }

    /**
     * Formato en línea. El texto que entra YA está escapado.
     * El orden importa: primero código en línea (protege su contenido),
     * luego enlaces, después estilos.
     */
    function inline(texto) {
        let t = texto;

        // Bloques de código en línea -> marcador temporal para no aplicar
        // negritas ni cursivas dentro del código.
        const codigos = [];
        t = t.replace(/`([^`\n]+)`/g, function (_, contenido) {
            codigos.push(contenido);
            return '\u0000CODE' + (codigos.length - 1) + '\u0000';
        });

        // Enlaces [texto](url) — solo esquemas seguros.
        t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (todo, etiqueta, url) {
            const safe = urlSegura(url.replace(/&amp;/g, '&'));
            if (!safe) return etiqueta; // enlace inseguro -> se deja solo el texto
            return '<a href="' + safe.replace(/"/g, '&quot;') +
                '" target="_blank" rel="noopener noreferrer">' + etiqueta + '</a>';
        });

        // Negrita **texto** y __texto__
        t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');

        // Cursiva *texto* (evita tocar ** ya convertidos)
        t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

        // Tachado ~~texto~~
        t = t.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

        // Restaurar código en línea
        t = t.replace(/\u0000CODE(\d+)\u0000/g, function (_, i) {
            return '<code>' + codigos[Number(i)] + '</code>';
        });

        return t;
    }

    /**
     * Detecta si una línea es un separador de tabla:
     * `|---|:---:|---:|` para alinear columnas.
     */
    function esSeparadorTabla(linea) {
        return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linea);
    }

    /** Convierte una línea de tabla en celdas. */
    function celdas(linea) {
        let l = linea.trim();
        if (l.startsWith('|')) l = l.slice(1);
        if (l.endsWith('|')) l = l.slice(0, -1);
        return l.split('|').map(c => c.trim());
    }

    /**
     * Alineación declarada en el separador de una tabla.
     */
    function alineaciones(separador) {
        return celdas(separador).map(c => {
            const izq = c.startsWith(':');
            const der = c.endsWith(':');
            if (izq && der) return 'center';
            if (der) return 'right';
            if (izq) return 'left';
            return '';
        });
    }

    /**
     * RENDER PRINCIPAL.
     * @param {string} text Markdown del modelo (puede contener HTML; se escapa).
     * @returns {string} HTML seguro.
     */
    function safeRender(text) {
        if (text == null) return '';

        // PASO 0 — SEGURIDAD: se escapa TODO antes de interpretar.
        let src = escapeHtml(text);

        // Normalizar saltos de línea Windows.
        src = src.replace(/\r\n?/g, '\n');

        const lineas = src.split('\n');
        const salida = [];

        let i = 0;
        let enListaUL = false;
        let enListaOL = false;

        function cerrarListas() {
            if (enListaUL) { salida.push('</ul>'); enListaUL = false; }
            if (enListaOL) { salida.push('</ol>'); enListaOL = false; }
        }

        while (i < lineas.length) {
            const linea = lineas[i];
            const recortada = linea.trim();

            // --- Bloque de código ``` ---
            const aperturaFence = /^```(\w*)\s*$/.exec(recortada);
            if (aperturaFence) {
                cerrarListas();
                const lenguaje = aperturaFence[1] || '';
                const cuerpo = [];
                i++;
                while (i < lineas.length && !/^```\s*$/.test(lineas[i].trim())) {
                    cuerpo.push(lineas[i]);
                    i++;
                }
                i++; // salta el cierre
                const clase = lenguaje ? ' class="lang-' + lenguaje.replace(/[^a-z0-9_-]/gi, '') + '"' : '';
                const idioma = lenguaje ? lenguaje.replace(/[^a-z0-9_-]/gi, '') : 'texto';
                salida.push(
                    '<div class="md-code-wrap">' +
                    '<button type="button" class="md-copy" data-copy aria-label="Copiar código">Copiar</button>' +
                    '<pre class="md-code-block"><code' + clase + '>' + cuerpo.join('\n') + '</code></pre>' +
                    '<span class="md-lang" aria-hidden="true">' + idioma + '</span>' +
                    '</div>'
                );
                continue;
            }

            // --- Fórmula en bloque $$...$$ ---
            if (/^\$\$/.test(recortada)) {
                cerrarListas();
                if (/^\$\$.+\$\$$/.test(recortada)) {
                    salida.push('<div class="md-formula">' +
                        recortada.slice(2, -2).trim() + '</div>');
                    i++;
                    continue;
                }
                const cuerpo = [];
                i++;
                while (i < lineas.length && !/\$\$/.test(lineas[i])) {
                    cuerpo.push(lineas[i]);
                    i++;
                }
                i++;
                salida.push('<div class="md-formula">' + cuerpo.join('\n').trim() + '</div>');
                continue;
            }

            // --- Línea vacía: cierra listas ---
            if (recortada === '') {
                cerrarListas();
                i++;
                continue;
            }

            // --- Separador horizontal ---
            if (/^(\*\s*){3,}$/.test(recortada) || /^(-\s*){3,}$/.test(recortada) ||
                /^(_\s*){3,}$/.test(recortada)) {
                cerrarListas();
                salida.push('<hr class="md-hr">');
                i++;
                continue;
            }

            // --- Títulos (se comprueban antes que las listas para no
            //     confundir "# Título" con una lista) ---
            const titulo = /^(#{1,4})\s+(.+)$/.exec(recortada);
            if (titulo) {
                cerrarListas();
                const nivel = titulo[1].length;
                salida.push('<h' + nivel + ' class="md-h' + nivel + '">' +
                    inline(titulo[2]) + '</h' + nivel + '>');
                i++;
                continue;
            }

            // --- Tabla: cabecera + separador ---
            if (recortada.includes('|') && i + 1 < lineas.length &&
                esSeparadorTabla(lineas[i + 1])) {
                cerrarListas();
                const cabecera = celdas(recortada);
                const alin = alineaciones(lineas[i + 1]);
                i += 2;
                const filas = [];
                while (i < lineas.length && lineas[i].includes('|') && lineas[i].trim() !== '') {
                    filas.push(celdas(lineas[i]));
                    i++;
                }
                function celda(valor, idx, etiqueta) {
                    const a = alin[idx] ? ' style="text-align:' + alin[idx] + '"' : '';
                    const contenido = inline(valor || '');
                    return '<' + etiqueta + a + '>' + contenido + '</' + etiqueta + '>';
                }
                let tabla = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
                cabecera.forEach(function (c, idx) { tabla += celda(c, idx, 'th'); });
                tabla += '</tr></thead><tbody>';
                filas.forEach(function (fila) {
                    tabla += '<tr>';
                    for (let c = 0; c < cabecera.length; c++) {
                        tabla += celda(fila[c], c, 'td');
                    }
                    tabla += '</tr>';
                });
                tabla += '</tbody></table></div>';
                salida.push(tabla);
                continue;
            }

            // --- Cita ---
            const cita = /^&gt;\s?(.*)$/.exec(recortada);
            if (cita) {
                cerrarListas();
                const bloques = [cita[1]];
                i++;
                while (i < lineas.length && /^&gt;\s?/.test(lineas[i].trim())) {
                    bloques.push(lineas[i].trim().replace(/^&gt;\s?/, ''));
                    i++;
                }
                salida.push('<blockquote class="md-quote">' +
                    bloques.map(b => inline(b)).join('<br>') + '</blockquote>');
                continue;
            }

            // --- Lista no ordenada ---
            const ul = /^[-*+]\s+(.+)$/.exec(recortada);
            if (ul) {
                if (enListaOL) { salida.push('</ol>'); enListaOL = false; }
                if (!enListaUL) { salida.push('<ul class="md-list">'); enListaUL = true; }
                salida.push('<li>' + inline(ul[1]) + '</li>');
                i++;
                continue;
            }

            // --- Lista ordenada ---
            const ol = /^\d+[.)]\s+(.+)$/.exec(recortada);
            if (ol) {
                if (enListaUL) { salida.push('</ul>'); enListaUL = false; }
                if (!enListaOL) { salida.push('<ol class="md-list">'); enListaOL = true; }
                salida.push('<li>' + inline(ol[1]) + '</li>');
                i++;
                continue;
            }

            // --- Párrafo ---
            cerrarListas();
            const parrafo = [inline(recortada)];
            i++;
            while (i < lineas.length) {
                const siguiente = lineas[i].trim();
                if (siguiente === '' || siguiente.includes('|') ||
                    /^(#{1,4})\s+/.test(siguiente) || /^```/.test(siguiente) ||
                    /^[-*+]\s+/.test(siguiente) || /^\d+[.)]\s+/.test(siguiente) ||
                    /^&gt;/.test(siguiente) || /^\$\$/.test(siguiente)) {
                    break;
                }
                parrafo.push(inline(siguiente));
                i++;
            }
            salida.push('<p class="md-p">' + parrafo.join(' ') + '</p>');
        }

        cerrarListas();
        return salida.join('\n');
    }

    /**
     * Render de texto plano sin Markdown (para el mensaje del estudiante).
     * Conserva los saltos de línea pero no interpreta sintaxis.
     */
    function plainRender(text) {
        return escapeHtml(text).replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
    }

    const Markdown = {
        escapeHtml: escapeHtml,
        urlSegura: urlSegura,
        safeRender: safeRender,
        plainRender: plainRender
    };

    // Navegador
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Markdown;   // Node (pruebas)
    }
    if (global) {
        global.Markdown = Markdown;  // window
    }
})(typeof window !== 'undefined' ? window : globalThis);
