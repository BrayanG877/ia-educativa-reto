/**
 * Configuración de Anthropic Claude API
 * Cliente para comunicación con el modelo de IA
 */

const Anthropic = require('@anthropic-ai/sdk');

let anthropicClient = null;

/**
 * Inicializar cliente de Anthropic
 */
function initAnthropic() {
    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('⚠️ ANTHROPIC_API_KEY no configurada');
        return null;
    }

    try {
        anthropicClient = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
        });

        console.log('✅ Cliente de Anthropic Claude inicializado');
        return anthropicClient;
    } catch (error) {
        console.error('❌ Error al inicializar Anthropic:', error);
        return null;
    }
}

/**
 * Obtener cliente de Anthropic
 */
function getAnthropicClient() {
    if (!anthropicClient) {
        anthropicClient = initAnthropic();
    }
    return anthropicClient;
}

/**
 * Configuración de modelos disponibles
 */
const MODELS = {
    // Claude Sonnet 4.5 - Alias oficial de Anthropic (apunta al snapshot más reciente).
    // Antes era 'claude-sonnet-4-6', que NO es un ID de modelo real: la API
    // responde 404 not_found_error y el estudiante veía "la IA no responde".
    SONNET_4: 'claude-sonnet-4-5',

    // Claude Sonnet 4 (snapshot fijo)
    SONNET_4_SNAPSHOT: 'claude-sonnet-4-20250514',

    // Claude Haiku 4.5 (más barato/rápido)
    HAIKU_45: 'claude-haiku-4-5',

    // Claude 3.5 Sonnet (legacy; retirado el 22-oct-2025)
    SONNET_35: 'claude-3-5-sonnet-20240620',

    // Claude 3 Sonnet (legacy)
    SONNET: 'claude-3-sonnet-20240229',

    // Claude 3 Haiku (legacy)
    HAIKU: 'claude-3-haiku-20240307',

    // Claude 2.1 (legacy)
    CLAUDE_2: 'claude-2.1'
};

/**
 * Modelo por defecto para uso educativo.
 * Configurable por entorno (ANTHROPIC_MODEL) sin tocar código. Por defecto
 * Claude Sonnet 4.5, válido en la API de Anthropic.
 */
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || MODELS.SONNET_4;

/**
 * Configuración por defecto para requests
 */
const DEFAULT_CONFIG = {
    model: DEFAULT_MODEL,
    max_tokens: parseInt(process.env.MAX_TOKENS_PER_REQUEST) || 1000,
    temperature: 0.7, // Balance entre creatividad y consistencia
};

/**
 * Límites de tokens por modelo (aproximado)
 */
const TOKEN_LIMITS = {
    [MODELS.SONNET]: 200000, // 200k tokens de contexto
    [MODELS.HAIKU]: 200000,
    [MODELS.SONNET_4]: 200000,
    [MODELS.SONNET_4_SNAPSHOT]: 200000,
    [MODELS.HAIKU_45]: 200000
};

/**
 * Costos aproximados por millón de tokens (USD)
 * Actualizar según pricing de Anthropic
 */
const PRICING = {
    // Claude Sonnet 4.5 / Sonnet 4
    'claude-sonnet-4-5': {
        input: 3.0,
        output: 15.0
    },
    'claude-sonnet-4-20250514': {
        input: 3.0,
        output: 15.0
    },
    [MODELS.SONNET_4]: {
        input: 3.0,
        output: 15.0
    },
    [MODELS.SONNET_4_SNAPSHOT]: {
        input: 3.0,
        output: 15.0
    },
    [MODELS.HAIKU_45]: {
        input: 1.0,
        output: 5.0
    },
    [MODELS.HAIKU]: {
        input: 0.25,
        output: 1.25
    },
    [MODELS.SONNET]: {
        input: 3.0,
        output: 15.0
    },
    [MODELS.SONNET_35]: {
        input: 3.0,
        output: 15.0
    },
    [MODELS.CLAUDE_2]: {
        input: 8.0,
        output: 24.0
    }
};

/**
 * Calcular costo estimado de una request
 * @param {string} model - Modelo utilizado
 * @param {number} inputTokens - Tokens de entrada
 * @param {number} outputTokens - Tokens de salida
 */
function calculateCost(model, inputTokens = 0, outputTokens = 0) {
    // Validación defensiva
    if (!model) {
        model = DEFAULT_MODEL;
    }

    // Buscar pricing, con fallback a SONNET_4
    let pricing = PRICING[model];
    if (!pricing) {
        console.warn(`⚠️ Pricing no encontrado para modelo ${model}, usando SONNET_4`);
        pricing = PRICING[MODELS.SONNET_4] || { input: 3.0, output: 15.0 };
    }

    // Asegurar que pricing tiene las propiedades necesarias
    if (!pricing.input || !pricing.output) {
        console.error('❌ Pricing inválido:', pricing);
        pricing = { input: 3.0, output: 15.0 };
    }

    const inputCost = (inputTokens / 1000000) * pricing.input;
    const outputCost = (outputTokens / 1000000) * pricing.output;

    return {
        inputCost: inputCost.toFixed(6),
        outputCost: outputCost.toFixed(6),
        totalCost: (inputCost + outputCost).toFixed(6),
        currency: 'USD'
    };
}

module.exports = {
    initAnthropic,
    getAnthropicClient,
    MODELS,
    DEFAULT_MODEL,
    DEFAULT_CONFIG,
    TOKEN_LIMITS,
    PRICING,
    calculateCost
};
