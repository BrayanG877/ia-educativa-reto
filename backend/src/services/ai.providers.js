/**
 * Proveedores de IA conmutables
 * ------------------------------------------------------------------
 * Permite usar Anthropic Claude (por defecto) o proveedores GRATUITOS
 * (Google Gemini, Groq, OpenRouter, Ollama local) sin cambiar el resto
 * de la aplicación: todos exponen la misma función
 *
 *     createCompletion({ system, messages, model, maxTokens, temperature })
 *
 * y devuelven la misma forma:
 *
 *     { text: string, inputTokens: number, outputTokens: number }
 *
 * El proveedor se elige con la variable de entorno AI_PROVIDER:
 *   groq (por defecto si falta) | reto (gateway de Grok) | gemini |
 *   openrouter | anthropic | ollama
 *
 * Así el flujo pregunta -> IA -> respuesta, el historial, la validación,
 * los prompts socráticos y todas las opciones siguen funcionando igual.
 */

const DEFAULT_MAX_TOKENS = parseInt(process.env.MAX_TOKENS_PER_REQUEST) || 1000;

// ------------------------------------------------------------------
// FUENTE ÚNICA de modelos por defecto.
// Cada adaptador y la entrada del catálogo PROVIDERS usan la MISMA
// constante, de modo que no puedan divergir (p. ej. adaptador y catálogo
// apuntando a modelos distintos de Gemini). El modelo real siempre puede
// sobreescribirse con la variable de entorno correspondiente o con el
// parámetro `model` de completion().
// ------------------------------------------------------------------
const DEFAULT_MODELS = {
    anthropic: 'claude-sonnet-4-5',
    reto: 'grok-4.6',
    // Alias vigente de Google; antes 'gemini-2.0-flash' (retirado, 404).
    gemini: 'gemini-flash-latest',
    groq: 'openai/gpt-oss-120b',
    openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
    ollama: 'llama3.2'
};

// Configuración central del agente (validada). Se usa para el timeout por
// defecto y el orden de fallback. Si el módulo no estuviera disponible por
// cualquier motivo, se conservan los valores heredados del proyecto.
let aiConfig = null;
try { aiConfig = require('../config/ai.config'); } catch (_) { aiConfig = null; }
const DEFAULT_TIMEOUT_MS = (aiConfig && aiConfig.timeoutMs) || 60000;

/**
 * Lanza un POST JSON y devuelve { status, data } sin lanzar excepción por
 * códigos HTTP de error (para poder mapearlos a mensajes claros).
 */
async function postJson(url, body, headers, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        let data = null;
        try { data = await res.json(); } catch (_) { data = null; }
        // Retry-After (segundos) si el proveedor lo indica (tipico en 429/503).
        // Se propaga como dato, sin exponer cabeceras sensibles al cliente.
        let retryAfterSeconds;
        const ra = res.headers && res.headers.get ? res.headers.get('retry-after') : null;
        if (ra) {
            const n = parseInt(ra, 10);
            if (!Number.isNaN(n)) retryAfterSeconds = n;
        }
        return { status: res.status, data, retryAfterSeconds };
    } catch (error) {
        // Un timeout/abort se convierte en un error 408 claro para que el
        // servicio pueda responder "tardó demasiado" en vez de "no disponible".
        if (error.name === 'AbortError') {
            const e = new Error(`El proveedor tardó más de ${Math.round(timeoutMs / 1000)}s en responder`);
            e.status = 408;
            throw e;
        }
        // Fallo de red (DNS, TLS, conexión rechazada): 503 para el mapeo de errores.
        const e = new Error(`No se pudo contactar al proveedor: ${error.message}`);
        e.status = 503;
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Validar que el texto devuelto por un proveedor sea una respuesta utilizable.
 * Algunos servicios "gratuitos" responden HTTP 200 con un mensaje de error
 * ("budget exceeded", "rate limit") o con una cadena vacía; si eso se guarda
 * como respuesta, el estudiante recibe basura. Aquí se detecta y se convierte
 * en un error tipado.
 */
function assertValidText(text, providerLabel) {
    const limpio = typeof text === 'string' ? text.trim() : '';
    if (!limpio) {
        // Respuesta vacia con HTTP 200. En modelos de RAZONAMIENTO
        // (p. ej. Groq openai/gpt-oss-120b) puede ocurrir cuando el presupuesto
        // de tokens se agota generando el razonamiento interno antes de emitir
        // texto. NO es un fallo de credenciales, asi que se marca como
        // RECUPERABLE (permite el respaldo a otro proveedor) y con status 502
        // (respuesta invalida), no 401.
        const e = new Error(`${providerLabel} devolvió una respuesta vacía (posible presupuesto de tokens agotado en el razonamiento)`);
        e.status = 502;
        e.recoverable = true;
        throw e;
    }
    const lower = limpio.toLowerCase();
    const firmasInvalidas = [
        'budget', 'quota', 'rate limit', 'too many requests',
        'insufficient', 'no credits', 'credit balance'
    ];
    const pareceError = firmasInvalidas.some(f => lower.includes(f)) && limpio.length < 300;
    if (pareceError) {
        const e = new Error(`${providerLabel} no tiene cuota disponible: ${limpio.slice(0, 120)}`);
        e.status = 429;
        e.recoverable = true;
        throw e;
    }
    return limpio;
}

// ------------------------------------------------------------------
// ANTHROPIC (Claude)
// ------------------------------------------------------------------
async function anthropicCompletion({ system, messages, model, maxTokens, temperature }) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
        const e = new Error('ANTHROPIC_API_KEY no configurada');
        e.status = 401;
        throw e;
    }

    const { status, data, retryAfterSeconds } = await postJson(
        'https://api.anthropic.com/v1/messages',
        {
            model: model || process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic,
            max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
            temperature: temperature ?? 0.7,
            system,
            messages
        },
        {
            'x-api-key': key,
            'anthropic-version': '2023-06-01'
        }
    );

    if (status >= 400) {
        const err = new Error(data?.error?.message || `Anthropic HTTP ${status}`);
        err.status = status;
        if (Number.isFinite(retryAfterSeconds)) err.retryAfterSeconds = retryAfterSeconds;
        err.type = data?.error?.type;
        throw err;
    }

    const text = (data?.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

    return {
        text: assertValidText(text, 'Anthropic'),
        inputTokens: data?.usage?.input_tokens || 0,
        outputTokens: data?.usage?.output_tokens || 0
    };
}

// ------------------------------------------------------------------
// GOOGLE GEMINI (nivel gratuito)
// ------------------------------------------------------------------
async function geminiCompletion({ system, messages, model, maxTokens, temperature }) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        const e = new Error('GEMINI_API_KEY no configurada');
        e.status = 401;
        throw e;
    }

    const modelName = model || process.env.GEMINI_MODEL || DEFAULT_MODELS.gemini;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;

    // Gemini usa roles "user" y "model" (no "assistant")
    const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    const { status, data, retryAfterSeconds } = await postJson(url, {
        system_instruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: {
            maxOutputTokens: maxTokens || DEFAULT_MAX_TOKENS,
            temperature: temperature ?? 0.7
        }
    }, {});

    if (status >= 400) {
        const err = new Error(data?.error?.message || `Gemini HTTP ${status}`);
        err.status = status;
        if (Number.isFinite(retryAfterSeconds)) err.retryAfterSeconds = retryAfterSeconds;
        throw err;
    }

    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('\n');
    const usage = data?.usageMetadata || {};

    return {
        text: assertValidText(text, 'Gemini'),
        inputTokens: usage.promptTokenCount || 0,
        outputTokens: usage.candidatesTokenCount || 0
    };
}

// ------------------------------------------------------------------
// GROQ (nivel gratuito, compatible OpenAI)
// ------------------------------------------------------------------
async function groqCompletion({ system, messages, model, maxTokens, temperature }) {
    const key = process.env.GROQ_API_KEY;
    if (!key) {
        const e = new Error('GROQ_API_KEY no configurada');
        e.status = 401;
        throw e;
    }

    const chatMessages = system
        ? [{ role: 'system', content: system }, ...messages]
        : messages;

    // GROQ_API_BASE permite apuntar a un proxy/compatible (útil para pruebas).
    const base = process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1';

    const { status, data, retryAfterSeconds } = await postJson(
        `${base}/chat/completions`,
        {
            // Modelo: el configurado por entorno o, si falta, un modelo VIGENTE.
            // Antes el fallback era 'llama-3.3-70b-versatile', retirado por Groq
            // (devolvia 404). Se usa openai/gpt-oss-120b como valor por defecto
            // seguro, coherente con PROVIDERS.groq.model().
            model: model || process.env.GROQ_MODEL || DEFAULT_MODELS.groq,
            messages: chatMessages,
            max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
            temperature: temperature ?? 0.7
        },
        { 'Authorization': `Bearer ${key}` }
    );

    if (status >= 400) {
        const err = new Error(data?.error?.message || `Groq HTTP ${status}`);
        err.status = status;
        if (Number.isFinite(retryAfterSeconds)) err.retryAfterSeconds = retryAfterSeconds;
        throw err;
    }

    return {
        text: assertValidText(data?.choices?.[0]?.message?.content, 'Groq'),
        inputTokens: data?.usage?.prompt_tokens || 0,
        outputTokens: data?.usage?.completion_tokens || 0
    };
}

// ------------------------------------------------------------------
// RETO PLTK (compatible OpenAI)
// ------------------------------------------------------------------
// IMPORTANTE DE SEGURIDAD (SSRF): la URL base NUNCA procede de la petición del
// cliente ni de una variable controlada por el usuario del chat. Solo puede ser
// la constante de código o RETO_BASE_URL, que es configuración del operador.
//
// VERIFICADO (prueba real, sin reintentos): GET /v1/models del gateway devuelve
// HTTP 200 con 14 modelos, entre ellos 'grok-4.6', y POST /v1/chat/completions
// responde correctamente con grok-4.6. El formato es compatible con OpenAI
// ({model, messages, max_tokens, temperature} -> choices[0].message.content).
//
// URL base del proveedor RETO PLTK. Se puede sobreescribir con la variable de
// entorno RETO_BASE_URL (igual que GROQ_API_BASE / OLLAMA_HOST), de modo que la
// configuración del .env sea la fuente de verdad. El valor por defecto es el
// endpoint oficial documentado.
const RETO_DEFAULT_BASE_URL = 'https://api.reto.pltk.mx/v1';

/**
 * Normaliza la URL base de RETO PLTK:
 *  - '' o ausente  -> endpoint oficial por defecto.
 *  - Solo http/https (un valor inválido en el .env no debe producir una URL rota).
 *  - Sin barras finales, para no generar '.../v1//chat/completions'.
 */
function retoBaseUrl() {
    const raw = (process.env.RETO_BASE_URL || '').trim();
    if (!raw) return RETO_DEFAULT_BASE_URL;
    let parsed;
    try { parsed = new URL(raw); } catch (_) { return RETO_DEFAULT_BASE_URL; }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return RETO_DEFAULT_BASE_URL;
    return raw.replace(/\/+$/, '');
}

/**
 * Adjunta a un error de proveedor una pista técnica NO sensible (variable o
 * endpoint a revisar). Nunca incluye el valor de la clave ni cabeceras.
 */
function withHint(error, hint) {
    if (error && !error.hint) error.hint = hint;
    return error;
}

async function retoCompletion({ system, messages, model, maxTokens, temperature }) {
    const key = process.env.RETO_KEY;
    if (!key) {
        const e = new Error('RETO_KEY no configurada');
        e.status = 401;
        throw withHint(e, 'Falta RETO_KEY en el entorno del backend');
    }

    // El formato documentado admite model + messages. El system prompt se envía
    // como un mensaje con role 'system' (mismo criterio que Groq/OpenRouter).
    const chatMessages = system
        ? [{ role: 'system', content: system }, ...messages]
        : messages;

    const base = retoBaseUrl();
    const modelName = model || process.env.RETO_MODEL || DEFAULT_MODELS.reto;

    const { status, data, retryAfterSeconds } = await postJson(
        `${base}/chat/completions`,
        {
            model: modelName,
            messages: chatMessages,
            max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
            temperature: temperature ?? 0.7
        },
        { 'Authorization': `Bearer ${key}` }
    );

    if (status >= 400) {
        // Mensaje del upstream (formato OpenAI {error:{message}} o texto plano),
        // recortado para el log. NUNCA contiene la clave.
        const upstream = data?.error?.message || data?.message || `RETO PLTK HTTP ${status}`;
        const err = new Error(String(upstream).slice(0, 300));
        err.status = status;
        if (Number.isFinite(retryAfterSeconds)) err.retryAfterSeconds = retryAfterSeconds;
        // Pistas de diagnóstico por código (sin secretos): distinguen credencial
        // inválida, modelo inexistente, base URL equivocada o cuota agotada.
        const pistas = {
            400: `Solicitud rechazada: revisa el modelo '${modelName}' y el formato de mensajes`,
            401: 'RETO_KEY rechazada por el gateway (Bearer inválido o revocado)',
            403: 'La clave no tiene permiso para este modelo en el gateway',
            404: `Endpoint o modelo no encontrado. Verifica RETO_BASE_URL (${base}) y RETO_MODEL (${modelName})`,
            429: 'El gateway aplicó límite de solicitudes o cuota'
        };
        if (pistas[status]) err.hint = pistas[status];
        if (status === 408 || status === 429 || status >= 500) err.recoverable = true;
        throw err;
    }

    // Normalización defensiva. Si el formato real difiere del esperado,
    // assertValidText lo convierte en un error controlado (no en un éxito falso).
    let text;
    try {
        text = assertValidText(data?.choices?.[0]?.message?.content, 'RETO PLTK');
    } catch (e) {
        throw withHint(e, 'Respuesta 200 sin choices[0].message.content (formato distinto o presupuesto de tokens agotado)');
    }

    return {
        text,
        inputTokens: data?.usage?.prompt_tokens || 0,
        outputTokens: data?.usage?.completion_tokens || 0
    };
}

// ------------------------------------------------------------------
// OPENROUTER (modelos :free, compatible OpenAI)
// ------------------------------------------------------------------
async function openrouterCompletion({ system, messages, model, maxTokens, temperature }) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
        const e = new Error('OPENROUTER_API_KEY no configurada');
        e.status = 401;
        throw e;
    }

    const chatMessages = system
        ? [{ role: 'system', content: system }, ...messages]
        : messages;

    const { status, data, retryAfterSeconds } = await postJson(
        'https://openrouter.ai/api/v1/chat/completions',
        {
            model: model || process.env.OPENROUTER_MODEL || DEFAULT_MODELS.openrouter,
            messages: chatMessages,
            max_tokens: maxTokens || DEFAULT_MAX_TOKENS,
            temperature: temperature ?? 0.7
        },
        {
            'Authorization': `Bearer ${key}`,
            'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:3000',
            'X-Title': 'IA Educativa'
        }
    );

    if (status >= 400) {
        const err = new Error(data?.error?.message || `OpenRouter HTTP ${status}`);
        err.status = status;
        if (Number.isFinite(retryAfterSeconds)) err.retryAfterSeconds = retryAfterSeconds;
        throw err;
    }

    return {
        text: assertValidText(data?.choices?.[0]?.message?.content, 'OpenRouter'),
        inputTokens: data?.usage?.prompt_tokens || 0,
        outputTokens: data?.usage?.completion_tokens || 0
    };
}

// ------------------------------------------------------------------
// OLLAMA (local, 100% gratis, sin API key)
// ------------------------------------------------------------------
// HABILITACIÓN EXPLÍCITA: Ollama NO se selecciona por defecto. Solo se
// considera disponible para el enrutado si OLLAMA_ENABLED es EXACTAMENTE
// 'true'. Motivo: es un servicio LOCAL que puede no estar en ejecución; sin
// esta guarda, el sistema podía "elegirlo" como activo o respaldo y luego
// fallar por conexión rechazada, o intentar localhost:11434 sin necesidad.
//
// Conceptos separados (no confundir):
//   registrado  -> está en PROVIDERS (catálogo)
//   enabled     -> OLLAMA_ENABLED === 'true' (decisión del operador)
//   configured  -> enabled (no requiere clave; tener host/modelo NO basta)
//   available   -> resultado de checkAvailability() (comprobación real)
// ------------------------------------------------------------------

/** ¿Ollama está habilitado explícitamente por el operador? */
function ollamaEnabled() {
    return process.env.OLLAMA_ENABLED === 'true';
}

async function ollamaCompletion({ system, messages, model, maxTokens, temperature }) {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';

    const chatMessages = system
        ? [{ role: 'system', content: system }, ...messages]
        : messages;

    const { status, data, retryAfterSeconds } = await postJson(
        `${host}/api/chat`,
        {
            model: model || process.env.OLLAMA_MODEL || DEFAULT_MODELS.ollama,
            messages: chatMessages,
            stream: false,
            options: {
                num_predict: maxTokens || DEFAULT_MAX_TOKENS,
                temperature: temperature ?? 0.7
            }
        },
        {},
        120000 // el modelo local puede tardar en cargar
    );

    if (status >= 400) {
        const err = new Error(data?.error || `Ollama HTTP ${status}`);
        err.status = status;
        if (Number.isFinite(retryAfterSeconds)) err.retryAfterSeconds = retryAfterSeconds;
        throw err;
    }

    return {
        text: assertValidText(data?.message?.content, 'Ollama'),
        inputTokens: data?.prompt_eval_count || 0,
        outputTokens: data?.eval_count || 0
    };
}

const PROVIDERS = {
    anthropic: {
        name: 'Anthropic Claude',
        completion: anthropicCompletion,
        configured: () => !!process.env.ANTHROPIC_API_KEY,
        model: () => process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic,
        paid: true
    },
    reto: {
        name: 'RETO PLTK',
        completion: retoCompletion,
        // Solo se considera configurado si RETO_KEY existe. NO se activa por
        // defecto: la selección depende de AI_PROVIDER=reto.
        configured: () => !!process.env.RETO_KEY,
        model: () => process.env.RETO_MODEL || DEFAULT_MODELS.reto,
        paid: false
    },
    gemini: {
        name: 'Google Gemini (gratuito)',
        completion: geminiCompletion,
        configured: () => !!process.env.GEMINI_API_KEY,
        // Modelo por defecto: alias al flash vigente (DEFAULT_MODELS.gemini).
        // Antes era 'gemini-2.0-flash', retirado: la API responde 404
        // "no longer available to new users". Consulta los modelos de TU key en
        // GET https://generativelanguage.googleapis.com/v1beta/models?key=...
        model: () => process.env.GEMINI_MODEL || DEFAULT_MODELS.gemini,
        paid: false
    },
    groq: {
        name: 'Groq (gratuito)',
        completion: groqCompletion,
        configured: () => !!process.env.GROQ_API_KEY,
        // Modelo por defecto: openai/gpt-oss-120b (DEFAULT_MODELS.groq).
        // Antes era 'llama-3.3-70b-versatile', que Groq retiró: la API responde
        // 404 "does not exist or you do not have access to it". Consulta los
        // modelos disponibles de TU cuenta en GET https://api.groq.com/openai/v1/models
        model: () => process.env.GROQ_MODEL || DEFAULT_MODELS.groq,
        paid: false
    },
    openrouter: {
        name: 'OpenRouter (gratuito)',
        completion: openrouterCompletion,
        configured: () => !!process.env.OPENROUTER_API_KEY,
        model: () => process.env.OPENROUTER_MODEL || DEFAULT_MODELS.openrouter,
        paid: false
    },
    ollama: {
        name: 'Ollama (local, gratuito)',
        completion: ollamaCompletion,
        // Ollama local no requiere key, PERO debe habilitarse explícitamente
        // con OLLAMA_ENABLED=true. Sin esa variable, no está "configured", por
        // lo que getProviderName()/getSecondaryProvider() no lo seleccionan.
        enabled: ollamaEnabled,
        configured: ollamaEnabled,
        model: () => process.env.OLLAMA_MODEL || DEFAULT_MODELS.ollama,
        paid: false
    }
};

/**
 * Proveedor secundario para el respaldo automatico (vive junto a PROVIDERS,
 * que es quien conoce que proveedores estan configurados).
 *
 * Orden: se usa la lista configurable de ai.config (AI_FALLBACK_PROVIDERS),
 * excluyendo el proveedor activo. Si no hay ai.config disponible, se cae al
 * orden histórico del proyecto. Devuelve el primer proveedor CONFIGURADO que
 * NO sea el activo, o null.
 *
 * NOTA (dos listas distintas, no confundir):
 *   - AI_FALLBACK_PROVIDERS (ai.config.fallbackProviders) = orden del RESPALDO
 *     cuando el proveedor activo falla. Es la lista que usa ESTA función.
 *   - FALLBACK_ORDER (abajo) = orden para ELEGIR el proveedor activo SOLO cuando
 *     AI_PROVIDER no está definido o es desconocido (getProviderName). Si la
 *     selección es explícita, nunca se sustituye.
 * No existe ninguna variable AI_FALLBACK_ORDER en el proyecto.
 */
function getSecondaryProvider(activeId) {
    const orden = (aiConfig && Array.isArray(aiConfig.fallbackProviders) && aiConfig.fallbackProviders.length)
        ? aiConfig.fallbackProviders
        : ['gemini', 'openrouter', 'anthropic'];

    // Se recorren TODOS los candidatos configurados en orden y NUNCA se repite
    // el activo (evita ciclos y solicitudes duplicadas al mismo proveedor).
    const candidatos = orden
        .filter(id => id !== activeId && PROVIDERS[id] && PROVIDERS[id].configured());

    if (candidatos.length === 0) return null;
    const id = candidatos[0];
    return { id, provider: PROVIDERS[id] };
}

/**
 * Orden de preferencia para ELEGIR el proveedor ACTIVO cuando AI_PROVIDER no
 * está definido o es desconocido (ver getProviderName). Los gratuitos primero;
 * Anthropic al final por ser de pago. NO se usa si hay selección explícita.
 *
 * OJO: NO es lo mismo que AI_FALLBACK_PROVIDERS (orden del RESPALDO ante un
 * fallo del activo). Son dos listas con propósitos distintos.
 */
const FALLBACK_ORDER = ['groq', 'gemini', 'openrouter', 'ollama', 'anthropic'];

/**
 * Nombre del proveedor activo. FUENTE ÚNICA de la decisión de enrutado.
 *
 * - AI_PROVIDER definido y con credencial -> se usa EXACTAMENTE ese proveedor.
 * - AI_PROVIDER definido SIN credencial -> NO se cambia de proveedor: se
 *   devuelve el solicitado y el flujo falla con un error claro indicando qué
 *   variable falta. (Antes se caía silenciosamente al primer proveedor de
 *   FALLBACK_ORDER: con AI_PROVIDER=reto y RETO_KEY ausente, el tráfico se
 *   desviaba a Groq/Gemini sin evidencia en la interfaz, y las respuestas
 *   dejaban de venir de Grok.)
 * - AI_PROVIDER ausente o desconocido -> selección por FALLBACK_ORDER (solo
 *   aquí, porque no hay una selección explícita que respetar).
 */
function getProviderName() {
    const requested = (process.env.AI_PROVIDER || '').trim().toLowerCase();

    if (requested && PROVIDERS[requested]) {
        return requested; // respeta la selección explícita, tenga clave o no
    }

    // Sin selección explícita válida: buscar uno utilizable en el orden heredado.
    const disponible = FALLBACK_ORDER.find(id => PROVIDERS[id].configured());
    if (disponible) return disponible;

    return 'groq'; // pista para el mensaje de error (nada configurado)
}

/**
 * Diagnóstico de la selección (para /health y logs de arranque; sin secretos).
 * Distingue "proveedor activo" de "proveedor configurado pero sin credencial".
 */
function describeSelection() {
    const id = getProviderName();
    const p = PROVIDERS[id];
    const requested = (process.env.AI_PROVIDER || '').trim().toLowerCase();
    return {
        active: id,
        requested: requested || null,
        configured: p.configured(),
        model: p.model(),
        explicit: !!requested,
        // True si la selección explícita no coincide con el proveedor que se
        // usará: NO ocurre en el flujo normal (ya no hay sustitución), pero se
        // expone para que nunca pase desapercibido en producción.
        mismatch: !!requested && requested !== id
    };
}

/** Objeto del proveedor activo. */
function getProvider() {
    return PROVIDERS[getProviderName()];
}

/** Lista de proveedores disponibles con su estado de configuración. */
function listProviders() {
    const activo = getProviderName();
    return Object.entries(PROVIDERS).map(([id, p]) => ({
        id,
        name: p.name,
        model: p.model(),
        // `enabled`: distingue un proveedor deshabilitado explícitamente
        // (hoy solo Ollama) de uno configurado. Se expone para diagnóstico;
        // no cambia el contrato previo (configured/paid/active siguen igual).
        enabled: typeof p.enabled === 'function' ? p.enabled() : true,
        configured: p.configured(),
        paid: p.paid,
        // `active` solo si el proveedor es el seleccionado Y además es
        // utilizable (configured). Sin esto, un proveedor DESHABILITADO podía
        // aparecer como activo cuando getProviderName() devolvía su nombre
        // como mera pista (nada configurado), lo que inducía a error.
        active: id === activo && p.configured()
    }));
}

// ------------------------------------------------------------------
// DISPONIBILIDAD (comprobacion ligera, sin gastar cuota de generacion)
// ------------------------------------------------------------------

/**
 * Ultimo error observado por proveedor, para diagnostico en /health.
 * Solo guarda estado/tipo/mensaje corto; NUNCA la clave ni cabeceras.
 */
const lastErrors = {};

function getLastError(id) {
    return lastErrors[id] || null;
}

/** Cache en memoria de la ultima comprobacion por proveedor. */
const availabilityCache = {};
const AVAILABILITY_TTL_MS = parseInt(process.env.AI_HEALTH_TTL_MS) || 60000; // 60s

/**
 * Comprobacion LIGERA de disponibilidad del proveedor.
 * No genera texto: usa el endpoint de LISTADO de modelos, que verifica credencial
 * y conectividad sin consumir cuota de generacion.
 *
 * Resultado por proveedor:
 *   'operativo'      -> credencial valida y servicio responde
 *   'auth'           -> 401/403 (credencial invalida o sin permisos)
 *   'cuota'          -> 429 (limite/cuota)
 *   'temporal'       -> 5xx o error de red (saturado/no disponible)
 *   'no_configurado' -> falta la API key
 *
 * El resultado se cachea AVAILABILITY_TTL_MS para que /health pueda llamarse
 * a menudo sin golpear al proveedor en cada peticion.
 */
async function checkAvailability(id, { force = false } = {}) {
    const p = PROVIDERS[id];
    if (!p) return { state: 'desconocido' };

    if (!p.configured()) {
        return { state: 'no_configurado' };
    }

    const cached = availabilityCache[id];
    if (!force && cached && (Date.now() - cached.at) < AVAILABILITY_TTL_MS) {
        return cached.result;
    }

    let result;
    try {
        if (id === 'groq') {
            const base = process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1';
            const r = await fetch(`${base}/models`, {
                headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
            });
            result = clasificarHttp(r.status);
        } else if (id === 'gemini') {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
            const r = await fetch(url);
            result = clasificarHttp(r.status);
        } else if (id === 'anthropic') {
            const r = await fetch('https://api.anthropic.com/v1/models', {
                headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }
            });
            result = clasificarHttp(r.status);
        } else if (id === 'openrouter') {
            const r = await fetch('https://openrouter.ai/api/v1/models', {
                headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` }
            });
            result = clasificarHttp(r.status);
        } else if (id === 'reto') {
            // Gateway de Grok: GET /models verifica credencial y conectividad sin
            // consumir cuota de generación. (Antes RETO caía en la rama de Ollama
            // y /health intentaba contactar localhost:11434.)
            const r = await fetch(`${retoBaseUrl()}/models`, {
                headers: { 'Authorization': `Bearer ${process.env.RETO_KEY}` }
            });
            result = clasificarHttp(r.status);
        } else if (id === 'ollama') {
            // Ollama local: el propio servicio no siempre expone listado autenticado.
            // Si está deshabilitado, NO se realiza ninguna conexión (la guarda
            // !p.configured() de arriba ya lo corta; esta rama solo se alcanza
            // con OLLAMA_ENABLED=true).
            const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
            const r = await fetch(`${host}/api/tags`);
            result = { state: r.ok ? 'operativo' : 'temporal' };
        } else {
            result = { state: 'desconocido' };
        }
    } catch (error) {
        result = { state: 'temporal', detalle: 'sin conexion con el proveedor' };
    }

    availabilityCache[id] = { at: Date.now(), result };
    return result;
}

/** Traduce un codigo HTTP del endpoint de listado a un estado legible. */
function clasificarHttp(status) {
    if (status >= 200 && status < 300) return { state: 'operativo' };
    if (status === 401 || status === 403) return { state: 'auth' };
    if (status === 429) return { state: 'cuota' };
    if (status === 404) return { state: 'modelo_no_disponible' };
    if (status >= 500) return { state: 'temporal' };
    return { state: 'error', http: status };
}

module.exports = {
    getProvider,
    getProviderName,
    describeSelection,
    listProviders,
    PROVIDERS,
    DEFAULT_MODELS,
    ollamaEnabled,
    getSecondaryProvider,
    checkAvailability,
    getLastError,
    // Endpoint efectivo de cada proveedor (diagnóstico; sin credenciales).
    getEndpoint
};

/**
 * Endpoint efectivo que usará un proveedor (solo lectura, sin secretos).
 * Permite comparar la configuración real con la esperada en producción.
 */
function getEndpoint(id) {
    switch (id) {
        case 'reto': return `${retoBaseUrl()}/chat/completions`;
        case 'groq': return `${process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1'}/chat/completions`;
        case 'anthropic': return 'https://api.anthropic.com/v1/messages';
        case 'openrouter': return 'https://openrouter.ai/api/v1/chat/completions';
        case 'gemini': return 'https://generativelanguage.googleapis.com/v1beta/models/<modelo>:generateContent';
        case 'ollama': return `${process.env.OLLAMA_HOST || 'http://localhost:11434'}/api/chat`;
        default: return null;
    }
}
