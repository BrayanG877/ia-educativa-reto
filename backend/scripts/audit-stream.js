/**
 * Auditoría del protocolo de streaming de RETO PLTK.
 * Muestra la ESTRUCTURA de los fragmentos (sin contenido sensible).
 * Uso: node scripts/audit-stream.js
 */
'use strict';
const path = require('path');
const BACKEND = path.join(__dirname, '..');
require(path.join(BACKEND, 'node_modules', 'dotenv')).config({ path: path.join(BACKEND, '.env') });

const BASE = process.env.RETO_BASE_URL;
const KEY = process.env.RETO_KEY;
const MODEL = process.env.RETO_MODEL || 'grok-4.6';

(async function () {
    console.log('Base: ' + BASE);
    console.log('Modelo: ' + MODEL);
    console.log('');

    const t0 = Date.now();
    const res = await fetch(BASE + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
        body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'user', content: 'Di exactamente: Hola mundo. Nada mas.' }],
            max_tokens: 30,
            temperature: 0,
            stream: true,
            stream_options: { include_usage: true }
        }),
        signal: AbortSignal.timeout(60000)
    });

    console.log('HTTP ' + res.status);
    console.log('Content-Type: ' + res.headers.get('content-type'));
    console.log('Transfer-Encoding: ' + res.headers.get('transfer-encoding'));
    console.log('');

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let n = 0, ttft = null, texto = '';
    const formas = new Set();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lineas = buf.split('\n');
        buf = lineas.pop() || '';
        for (const l of lineas) {
            if (!l.startsWith('data:')) continue;
            const d = l.slice(5).trim();
            if (d === '[DONE]') { console.log('[DONE] recibido'); continue; }
            let j;
            try { j = JSON.parse(d); } catch (_) { console.log('fragmento NO-JSON: ' + d.slice(0, 60)); continue; }
            n++;
            // Forma del objeto (claves) sin revelar contenido
            const claves = Object.keys(j).sort().join(',');
            formas.add(claves);
            const delta = j.choices && j.choices[0] && j.choices[0].delta;
            const textoDelta = delta && (delta.content || '');
            if (textoDelta && ttft === null) ttft = Date.now() - t0;
            if (textoDelta) texto += textoDelta;
            if (n <= 3) {
                console.log('fragmento ' + n + ': claves=[' + claves + ']');
                console.log('   choices[0].delta claves=[' + (delta ? Object.keys(delta).join(',') : 'sin delta') + ']');
                console.log('   finish_reason=' + (j.choices && j.choices[0] ? j.choices[0].finish_reason : '?'));
                if (j.usage) console.log('   usage=' + JSON.stringify(j.usage));
            }
            if (j.usage && n > 3) console.log('   [usage en fragmento ' + n + '] ' + JSON.stringify(j.usage));
        }
    }

    console.log('');
    console.log('=== RESUMEN ===');
    console.log('fragmentos JSON: ' + n);
    console.log('TTFT: ' + ttft + ' ms | total: ' + (Date.now() - t0) + ' ms');
    console.log('texto concatenado: ' + texto.length + ' chars -> "' + texto.trim().slice(0, 60) + '"');
    console.log('formas distintas: ' + Array.from(formas).join(' | '));
    process.exit(0);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
