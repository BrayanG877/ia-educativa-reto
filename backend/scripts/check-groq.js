/**
 * COMPROBACIÓN REAL CONTROLADA DE GROQ (Fase 5D.1)
 * ==================================================================
 * Realiza UNA sola solicitud mínima al proveedor Groq usando la
 * configuración EXISTENTE del proyecto (backend/.env vía dotenv), con el
 * modelo realmente configurado (GROQ_MODEL o DEFAULT_MODELS.groq).
 *
 * Reglas de seguridad:
 *   - No imprime la clave, ni cabeceras, ni variables de entorno.
 *   - No reintenta: ante 401/403/404/429 informa el código y termina.
 *   - No hace bucles ni pruebas de carga.
 *   - No modifica ni escribe la clave.
 *   - Mide latencia y muestra el estado HTTP y el texto de la respuesta.
 *
 * Uso:  node scripts/check-groq.js
 */
'use strict';

const path = require('path');

// Carga el .env del backend SIN imprimir nada.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const aiProviders = require('../src/services/ai.providers');

async function main() {
    const key = process.env.GROQ_API_KEY;
    if (!key || String(key).trim() === '') {
        console.log('[GROQ-CHECK] GROQ_API_KEY no está configurada. No se realiza ninguna solicitud.');
        process.exit(2);
    }

    const provider = aiProviders.PROVIDERS.groq;
    const modelo = provider.model();
    const base = process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1';
    const timeoutMs = (require('../src/config/ai.config').timeoutMs) || 30000;
    // El proyecto usa AI_MAX_OUTPUT_TOKENS (default 1000) para el chat real.
    // openai/gpt-oss-120b es un modelo de RAZONAMIENTO: con un tope muy bajo
    // (p. ej. 32) consume el presupuesto en el razonamiento interno y no emite
    // texto final -> el proyecto lo trata como respuesta vacía. Se usa el
    // tope real del proyecto para una comprobación representativa.
    const maxOutputTokens = (require('../src/config/ai.config').maxOutputTokens) || 1000;

    console.log('[GROQ-CHECK] Proveedor principal:', aiProviders.getProviderName());
    console.log('[GROQ-CHECK] Modelo configurado:', modelo);
    console.log('[GROQ-CHECK] Endpoint:', base + '/chat/completions');
    console.log('[GROQ-CHECK] Timeout (ms):', timeoutMs);
    console.log('[GROQ-CHECK] max_tokens:', maxOutputTokens);
    console.log('[GROQ-CHECK] Enviando UNA solicitud mínima...');

    const t0 = Date.now();
    let resultado = null;
    let error = null;

    try {
        // UNA sola llamada, sin reintentos.
        const r = await provider.completion({
            system: 'Eres un asistente. Responde de forma literal y breve.',
            messages: [{ role: 'user', content: 'Responde únicamente: conexión correcta' }],
            model: modelo,
            maxTokens: maxOutputTokens,
            temperature: 0
        });
        resultado = r;
    } catch (e) {
        error = e;
    }

    const latencia = Date.now() - t0;

    // NOTA (Windows/Node): se evita process.exit() inmediato porque, con una
    // conexión keep-alive de undici aún abierta, Node aborta con
    // "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)". En su lugar
    // se fija process.exitCode y se deja que el proceso termine solo (o tras
    // un breve temporizador de seguridad).
    if (error) {
        const status = error.status || error.statusCode || '(sin status)';
        console.log('[GROQ-CHECK] RESULTADO: ERROR');
        console.log('[GROQ-CHECK] Código HTTP:', status);
        // No se imprime la clave ni cabeceras. El mensaje del proveedor puede
        // ser útil, pero se recorta y NUNCA contiene la clave por diseño.
        console.log('[GROQ-CHECK] Mensaje:', String(error.message || '').slice(0, 200));
        console.log('[GROQ-CHECK] Latencia (ms):', latencia);
        process.exitCode = 1;
        return;
    }

    console.log('[GROQ-CHECK] RESULTADO: OK');
    console.log('[GROQ-CHECK] Latencia (ms):', latencia);
    console.log('[GROQ-CHECK] Texto recibido:', JSON.stringify(String(resultado.text).slice(0, 200)));
    console.log('[GROQ-CHECK] Tokens (in/out):', resultado.inputTokens, '/', resultado.outputTokens);
    process.exitCode = 0;
}

main().catch((e) => {
    console.log('[GROQ-CHECK] Error inesperado:', String(e && e.message || e).slice(0, 200));
    process.exitCode = 1;
});