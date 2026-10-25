/**
 * Configuración centralizada del agente de IA
 * ------------------------------------------------------------------
 * Un único lugar donde se leen, validan y normalizan las variables de
 * entorno del subsistema de IA. La aplicación NO necesita editar código
 * para cambiar de proveedor, modelo, timeout o política de fallback:
 * basta con las variables de entorno.
 *
 * Uso:
 *   const aiConfig = require('../config/ai.config');
 *   aiConfig.provider          // 'groq' | 'gemini' | ... | 'reto'
 *   aiConfig.fallbackEnabled   // boolean
 *   aiConfig.fallbackProviders // ['gemini','openrouter',...]
 *   aiConfig.timeoutMs         // number
 *
 * Principios de diseño:
 *  - Valores por defecto SEGUROS: si falta una variable opcional, se usa un
 *    default razonable y se emite una advertencia (nunca un secreto).
 *  - El arranque NO falla por una clave de proveedor ALTERNATIVO ausente.
 *  - La validación distingue config obligatoria de opcional.
 *  - No se imprime nunca el valor de una variable secreta.
 *
 * No introduce dependencias nuevas.
 */

// ------------------------------------------------------------------
// Proveedores reconocidos por la plataforma. Debe coincidir con las claves
// de PROVIDERS en services/ai.providers.js. Se mantiene aquí como referencia
// para validar AI_PROVIDER y AI_FALLBACK_PROVIDERS.
// ------------------------------------------------------------------
const KNOWN_PROVIDERS = ['groq', 'gemini', 'reto', 'openrouter', 'anthropic', 'ollama'];

// Proveedores que NO requieren API key.
const PROVIDERS_SIN_CLAVE = ['ollama'];

// Nombre de la variable de entorno que contiene la clave de cada proveedor.
// Se usa para diagnosticar "falta la clave de X" SIN imprimir su valor.
const PROVIDER_KEY_VARS = {
    groq: 'GROQ_API_KEY',
    gemini: 'GEMINI_API_KEY',
    reto: 'RETO_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    ollama: null
};

// ------------------------------------------------------------------
// Helpers de lectura y validación de tipos (sin dependencias).
// ------------------------------------------------------------------

/** Lee una variable booleana aceptando true/false/1/0/yes/no/on/off. */
function readBool(raw, defaultValue) {
    if (raw === undefined || raw === null || raw === '') return defaultValue;
    const v = String(raw).trim().toLowerCase();
    if (['true', '1', 'yes', 'on', 'si', 'sí'].includes(v)) return true;
    if (['false', '0', 'no', 'off'].includes(v)) return false;
    return defaultValue; // valor no reconocido -> default seguro
}

/** Lee un entero dentro de un rango; fuera de rango -> default. */
function readInt(raw, defaultValue, min, max) {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return defaultValue;
    if (min !== undefined && n < min) return defaultValue;
    if (max !== undefined && n > max) return defaultValorRango(defaultValue, min, max);
    return n;
}

/** Lee un flotante dentro de un rango; fuera de rango -> default. */
function readFloat(raw, defaultValue, min, max) {
    const n = parseFloat(raw);
    if (Number.isNaN(n)) return defaultValue;
    if (min !== undefined && n < min) return defaultValue;
    if (max !== undefined && n > max) return defaultValorRango(defaultValue, min, max);
    return n;
}

function defaultValorRango(def, min, max) {
    // Si el default está a su vez fuera de rango, se acota.
    if (min !== undefined && def < min) return min;
    if (max !== undefined && def > max) return max;
    return def;
}

/** Lee una lista separada por comas, en minúsculas, sin duplicados ni vacíos. */
function readList(raw, fallbackList) {
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return fallbackList.slice();
    }
    const vistos = new Set();
    const out = [];
    for (const item of String(raw).split(',')) {
        const s = item.trim().toLowerCase();
        if (!s || vistos.has(s)) continue;
        vistos.add(s);
        out.push(s);
    }
    return out.length ? out : fallbackList.slice();
}

// ------------------------------------------------------------------
// Construcción de la configuración (evaluada una vez al cargar el módulo).
// Se leen las variables en el momento del require, igual que el resto del
// proyecto (sin frameworks de config).
// ------------------------------------------------------------------

const env = process.env;

const warnings = [];

// --- Proveedor principal ---
// AI_PROVIDER: si falta o es desconocido, se usa 'groq' (comportamiento
// heredado del proyecto) y se emite advertencia. NO se cambia el default.
let provider = (env.AI_PROVIDER || '').trim().toLowerCase();
if (!provider) {
    provider = 'groq';
} else if (!KNOWN_PROVIDERS.includes(provider)) {
    warnings.push(`AI_PROVIDER="${provider}" no es un proveedor reconocido (${KNOWN_PROVIDERS.join(', ')}). Se usará "groq".`);
    provider = 'groq';
}

// --- Fallback ---
const fallbackEnabled = readBool(env.AI_FALLBACK_ENABLED, true);

// Orden por defecto coherente con FALLBACK_ORDER histórico del proyecto.
const DEFAULT_FALLBACK = ['gemini', 'openrouter', 'anthropic'];

let fallbackProviders = readList(env.AI_FALLBACK_PROVIDERS, DEFAULT_FALLBACK);

// Coherencia: quitar el proveedor principal del orden de fallback (evita
// intentar dos veces el mismo), quitar desconocidos y, si el fallback está
// deshabilitado, dejar la lista vacía.
fallbackProviders = fallbackProviders.filter(p => {
    if (p === provider) return false;                        // no repetir el principal
    if (!KNOWN_PROVIDERS.includes(p)) {                       // no aceptar inventados
        warnings.push(`AI_FALLBACK_PROVIDERS incluye "${p}", que no es un proveedor reconocido; se ignora.`);
        return false;
    }
    return true;
});
if (!fallbackEnabled) fallbackProviders = [];

// --- Parámetros numéricos ---
const timeoutMs = readInt(env.AI_TIMEOUT_MS, 60000, 1000, 120000);
const maxRetries = readInt(env.AI_MAX_RETRIES, 1, 0, 3);
const maxInputChars = readInt(env.AI_MAX_INPUT_CHARS, 5000, 1, 100000);
const maxOutputTokens = readInt(env.AI_MAX_OUTPUT_TOKENS, parseInt(env.MAX_TOKENS_PER_REQUEST, 10) || 1000, 1, 32000);
const temperature = readFloat(env.AI_DEFAULT_TEMPERATURE, 0.7, 0, 2);

// --- Agente tutor (pedagogía) ---
// Dos banderas INDEPENDIENTES, ambas DESACTIVADAS por defecto. Solo se activan
// con una configuración EXPLÍCITA a 'true' (se aceptan true/1/yes/on/si).
// Cualquier otro valor (ausente, vacío, 'false', 'no', basura...) => false.
//
// AGENT_ENABLED
//   true  -> ai.service.js AÑADE el contexto pedagógico del turno al system
//            prompt (diagnosticar/ensenar/practicar/evaluar/adaptar) y expone
//            `agentPlan` en el resultado.
//   false -> el flujo de chat se comporta EXACTAMENTE como antes (sin plan).
//
// AGENT_PERSISTENCE_ENABLED
//   true  -> el agente puede ESCRIBIR evidencias/dificultades en RDS
//            (tablas agent_evidence / agent_difficulties).
//   false -> NO se realiza ninguna consulta de escritura al agente. Es el
//            default porque la migración database/migration_agent.sql NO está
//            verificada como aplicada en producción.
//
// NOTA de acoplamiento: la persistencia SOLO tiene efecto si además hay un
// plan, y un plan SOLO existe si AGENT_ENABLED=true. Es decir, la persistencia
// nunca escribe por sí sola sin el agente activo (ver tutor.integration.js).
const agentEnabled = readBool(env.AGENT_ENABLED, false);
const agentPersistenceEnabled = readBool(env.AGENT_PERSISTENCE_ENABLED, false);

// --- Logs ---
const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'];
let logLevel = (env.AI_LOG_LEVEL || '').trim().toLowerCase();
if (!LOG_LEVELS.includes(logLevel)) {
    if (env.AI_LOG_LEVEL) {
        warnings.push(`AI_LOG_LEVEL="${env.AI_LOG_LEVEL}" no es válido (${LOG_LEVELS.join(', ')}). Se usará "info".`);
    }
    logLevel = 'info';
}

/**
 * ¿El proveedor tiene su credencial configurada? Se comprueba por NOMBRE de
 * variable, nunca por valor (no se imprime el secreto).
 */
function providerHasKey(id) {
    const varName = PROVIDER_KEY_VARS[id];
    if (varName === null) {
        // Proveedores sin clave (hoy solo Ollama): requieren habilitación
        // explícita OLLAMA_ENABLED=true. No basta con que la variable no
        // exista: mientras no esté habilitado, NO se considera utilizable.
        return id === 'ollama' ? env.OLLAMA_ENABLED === 'true' : true;
    }
    if (varName === undefined) return false;   // proveedor desconocido
    const val = env[varName];
    return !!val && String(val).trim() !== '';
}

/**
 * Comprueba la configuración y devuelve un informe para el arranque.
 * - ok=false SOLO si el proveedor principal no tiene su clave (indispensable).
 * - Los proveedores alternativos sin clave generan advertencia, no error.
 */
function validate() {
    const errores = [];
    const avisos = warnings.slice();

    // El proveedor principal debe tener credencial (salvo los que no usan clave).
    const principalTieneClave = providerHasKey(provider);
    const principalEsSinClave = PROVIDERS_SIN_CLAVE.includes(provider);
    if (!principalTieneClave && !principalEsSinClave) {
        errores.push(
            `El proveedor principal "${provider}" no tiene su clave configurada ` +
            `(variable ${PROVIDER_KEY_VARS[provider]}). Configúrala o cambia AI_PROVIDER.`
        );
    }

    // Alternativos sin clave: solo aviso.
    for (const p of fallbackProviders) {
        if (!providerHasKey(p) && !PROVIDERS_SIN_CLAVE.includes(p)) {
            avisos.push(`El proveedor de respaldo "${p}" no tiene clave configurada (${PROVIDER_KEY_VARS[p]}); se omitirá si se necesita.`);
        }
    }

    // Ollama requiere OLLAMA_ENABLED=true. Si aparece como principal o en el
    // respaldo sin estarlo, se avisa (no es error: el sistema seguirá arrancando
    // y Ollama simplemente no se seleccionará).
    const ollamaDeshabilitado = (id) => id === 'ollama' && env.OLLAMA_ENABLED !== 'true';
    if (ollamaDeshabilitado(provider)) {
        avisos.push('AI_PROVIDER=ollama pero OLLAMA_ENABLED no es "true"; Ollama no se seleccionará hasta habilitarlo.');
    }
    for (const p of fallbackProviders) {
        if (ollamaDeshabilitado(p)) {
            avisos.push(`El respaldo "${p}" requiere OLLAMA_ENABLED=true; se omitirá hasta habilitarlo.`);
        }
    }

    return {
        ok: errores.length === 0,
        provider,
        providerHasKey: principalTieneClave,
        fallbackEnabled,
        fallbackProviders,
        errores,
        avisos
    };
}

module.exports = {
    // Identidad
    provider,
    // Fallback
    fallbackEnabled,
    fallbackProviders,
    // Límites y comportamiento
    timeoutMs,
    maxRetries,
    maxInputChars,
    maxOutputTokens,
    temperature,
    logLevel,
    // Agente tutor
    agentEnabled,
    agentPersistenceEnabled,
    // Utilidades
    KNOWN_PROVIDERS,
    PROVIDER_KEY_VARS,
    PROVIDERS_SIN_CLAVE,
    DEFAULT_FALLBACK,
    providerHasKey,
    validate
};
