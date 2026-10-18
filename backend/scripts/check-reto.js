/**
 * COMPROBACIÓN REAL CONTROLADA DE RETO PLTK (Fase 5D.2)
 * ==================================================================
 * Realiza UNA sola solicitud mínima al proveedor RETO PLTK usando la
 * configuración EXISTENTE del proyecto (backend/.env vía dotenv), con el
 * modelo realmente configurado (RETO_MODEL o DEFAULT_MODELS.reto) y la URL
 * de RETO_BASE_URL (con fallback al endpoint oficial).
 *
 * Reglas de seguridad:
 *   - No imprime la clave, ni cabeceras, ni variables de entorno.
 *   - No reintenta: ante 401/403/404/429 informa el código y termina.
 *   - No hace bucles ni pruebas de carga.
 *   - No modifica ni escribe la clave.
 *
 * Uso:  node scripts/check-reto.js
 */
'use strict';

const path = require('path');

// Carga el .env del backend SIN imprimir nada.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const aiProviders = require('../src/services/ai.providers');
const aiConfig = require('../src/config/ai.config');

async function main() {
    const key = process.env.RETO_KEY;
    if (!key || String(key).trim() === '') {
        console.log('[RETO-CHECK] RETO_KEY no está configurada. No se realiza ninguna solicitud.');
        process.exitCode = 2;
        return;
    }

    const provider = aiProviders.PROVIDERS.reto;
    const modelo = provider.model();
    const base = (process.env.RETO_BASE_URL || '').trim() || 'https://api.reto.pltk.mx/v1';
    const timeoutMs = aiConfig.timeoutMs || 30000;
    const maxOutputTokens = aiConfig.maxOutputTokens || 1000;

    console.log('[RETO-CHECK] Modelo configurado:', modelo);
    console.log('[RETO-CHECK] Endpoint:', base + '/chat/completions');
    console.log('[RETO-CHECK] Timeout (ms):', timeoutMs);
    console.log('[RETO-CHECK] max_tokens:', maxOutputTokens);
    console.log('[RETO-CHECK] Enviando UNA solicitud mínima...');

    const t0 = Date.now();
    let resultado = null;
    let error = null;

    try {
        // UNA sola llamada, sin reintentos.
        resultado = await provider.completion({
            system: 'Eres un asistente. Responde de forma literal y breve.',
            messages: [{ role: 'user', content: 'Responde únicamente: conexión correcta' }],
            model: modelo,
            maxTokens: maxOutputTokens,
            temperature: 0
        });
    } catch (e) {
        error = e;
    }

    const latencia = Date.now() - t0;

    // Se evita process.exit() inmediato (bug de Node en Windows con keep-alive
    // de undici). Se fija process.exitCode y se deja terminar el proceso.
    if (error) {
        const status = error.status || error.statusCode || '(sin status)';
        console.log('[RETO-CHECK] RESULTADO: ERROR');
        console.log('[RETO-CHECK] Código HTTP:', status);
        // Mensaje sanitizado: se recorta y NUNCA contiene la clave por diseño.
        console.log('[RETO-CHECK] Mensaje:', String(error.message || '').slice(0, 200));
        console.log('[RETO-CHECK] Latencia (ms):', latencia);
        process.exitCode = 1;
        return;
    }

    console.log('[RETO-CHECK] RESULTADO: OK');
    console.log('[RETO-CHECK] Latencia (ms):', latencia);
    console.log('[RETO-CHECK] Texto recibido:', JSON.stringify(String(resultado.text).slice(0, 200)));
    console.log('[RETO-CHECK] Tokens (in/out):', resultado.inputTokens, '/', resultado.outputTokens);
    process.exitCode = 0;
}

main().catch((e) => {
    console.log('[RETO-CHECK] Error inesperado:', String(e && e.message || e).slice(0, 200));
    process.exitCode = 1;
});