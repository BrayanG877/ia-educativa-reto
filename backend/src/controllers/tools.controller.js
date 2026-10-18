/**
 * Controlador de Herramientas Educativas
 * Gestiona las diferentes herramientas disponibles para los estudiantes
 */

const Joi = require('joi');
const aiService = require('../services/ai.service');
const promptService = require('../services/prompt.service');

/**
 * Generar Test de Preparación
 * POST /api/tools/test-prep
 */
async function generateTestPrep(req, res, next) {
    try {
        // Validación
        const schema = Joi.object({
            subject: Joi.string().required(),
            topic: Joi.string().required(),
            quantity: Joi.number().integer().min(1).max(20).default(10),
            difficulty: Joi.string().valid('basico', 'intermedio', 'avanzado').default('intermedio')
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: error.details.map(d => d.message)
            });
        }

        const { subject, topic, quantity, difficulty } = value;
        const userId = req.userId;

        // Generar prompt específico para test
        const prompt = `Genera ${quantity} preguntas de opción múltiple (4 opciones) sobre el tema "${topic}"
en nivel ${difficulty}.

Para cada pregunta:
1. Enunciado claro y directo
2. 4 opciones (A, B, C, D)
3. Solo una respuesta correcta
4. Incluye una breve explicación de por qué es correcta

Formato JSON:
[
  {
    "pregunta": "...",
    "opciones": {
      "A": "...",
      "B": "...",
      "C": "...",
      "D": "..."
    },
    "respuestaCorrecta": "A",
    "explicacion": "..."
  }
]`;

        const response = await aiService.generateResponse({
            message: prompt,
            subject: subject,
            history: [],
            mode: 'quiz',
            userId: userId
        });

        res.json({
            success: true,
            data: {
                questions: response.content,
                model: response.model,
                usage: response.usage,
                cost: response.cost
            }
        });

    } catch (error) {
        next(error);
    }
}

/**
 * Generar Quiz Interactivo
 * POST /api/tools/quiz
 */
async function generateQuiz(req, res, next) {
    try {
        const schema = Joi.object({
            subject: Joi.string().required(),
            topic: Joi.string().required(),
            type: Joi.string().valid('multiple', 'truefalse', 'complete', 'mixed').default('mixed'),
            quantity: Joi.number().integer().min(1).max(15).default(5)
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: error.details.map(d => d.message)
            });
        }

        const { subject, topic, type, quantity } = value;
        const userId = req.userId;

        const typeDescriptions = {
            multiple: 'opción múltiple',
            truefalse: 'verdadero o falso',
            complete: 'completar espacios',
            mixed: 'mezcladas (múltiple, verdadero/falso, completar)'
        };

        const prompt = `Genera ${quantity} preguntas de tipo ${typeDescriptions[type]} sobre "${topic}".

Requisitos:
- Dificultad progresiva (empieza fácil, termina más difícil)
- Preguntas que evalúen comprensión, no memorización
- Incluye explicación de cada respuesta
- Usa lenguaje claro y apropiado para estudiantes

Formato JSON según tipo de pregunta.`;

        const response = await aiService.generateResponse({
            message: prompt,
            subject: subject,
            history: [],
            mode: 'quiz',
            userId: userId
        });

        res.json({
            success: true,
            data: {
                quiz: response.content,
                model: response.model,
                usage: response.usage,
                cost: response.cost
            }
        });

    } catch (error) {
        next(error);
    }
}

/**
 * Generar Evaluación Estilo ICFES
 * POST /api/tools/evaluation
 */
async function generateEvaluation(req, res, next) {
    try {
        const schema = Joi.object({
            subject: Joi.string().required(),
            topics: Joi.array().items(Joi.string()).min(1).required(),
            quantity: Joi.number().integer().min(5).max(30).default(15)
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: error.details.map(d => d.message)
            });
        }

        const { subject, topics, quantity } = value;
        const userId = req.userId;

        const prompt = `Genera ${quantity} preguntas estilo ICFES sobre los siguientes temas:
${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Características ICFES:
- Contexto o situación problema
- Evaluación de competencias (no memorización)
- 4 opciones de respuesta
- Solo una correcta
- Redacción formal y clara

Distribuye las preguntas equitativamente entre los temas.
Formato JSON con estructura de pregunta ICFES.`;

        const response = await aiService.generateResponse({
            message: prompt,
            subject: subject,
            history: [],
            mode: 'icfes',
            userId: userId
        });

        res.json({
            success: true,
            data: {
                evaluation: response.content,
                model: response.model,
                usage: response.usage,
                cost: response.cost
            }
        });

    } catch (error) {
        next(error);
    }
}

/**
 * Generar Mapa Mental
 * POST /api/tools/mindmap
 */
async function generateMindMap(req, res, next) {
    try {
        const schema = Joi.object({
            subject: Joi.string().required(),
            topic: Joi.string().required(),
            depth: Joi.number().integer().min(1).max(4).default(3)
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: error.details.map(d => d.message)
            });
        }

        const { subject, topic, depth } = value;
        const userId = req.userId;

        const prompt = `Crea un mapa mental estructurado sobre "${topic}".

Estructura:
- Concepto central: ${topic}
- ${depth} niveles de profundidad
- Ramas principales con sub-ramas
- Usa palabras clave, no oraciones largas
- Incluye conexiones entre conceptos

Formato JSON jerárquico:
{
  "central": "...",
  "ramas": [
    {
      "titulo": "...",
      "subramas": ["...", "..."],
      "conexiones": ["rama2", "rama3"]
    }
  ]
}`;

        const response = await aiService.generateResponse({
            message: prompt,
            subject: subject,
            history: [],
            mode: 'direct',
            userId: userId
        });

        res.json({
            success: true,
            data: {
                mindmap: response.content,
                model: response.model,
                usage: response.usage,
                cost: response.cost
            }
        });

    } catch (error) {
        next(error);
    }
}

/**
 * Generar Mapa Conceptual
 * POST /api/tools/conceptmap
 */
async function generateConceptMap(req, res, next) {
    try {
        const schema = Joi.object({
            subject: Joi.string().required(),
            topic: Joi.string().required(),
            concepts: Joi.array().items(Joi.string()).optional()
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: error.details.map(d => d.message)
            });
        }

        const { subject, topic, concepts } = value;
        const userId = req.userId;

        const conceptsPrompt = concepts && concepts.length > 0
            ? `Incluye estos conceptos: ${concepts.join(', ')}.`
            : '';

        const prompt = `Crea un mapa conceptual sobre "${topic}".

Requisitos:
- Conceptos clave en cajas/nodos
- Conectores con frases de enlace (verbos)
- Jerarquía: conceptos generales → específicos
- Relaciones cruzadas entre conceptos
${conceptsPrompt}

Formato JSON:
{
  "nodos": [
    {"id": "n1", "concepto": "...", "nivel": 1}
  ],
  "conexiones": [
    {"desde": "n1", "hacia": "n2", "enlace": "produce"}
  ]
}`;

        const response = await aiService.generateResponse({
            message: prompt,
            subject: subject,
            history: [],
            mode: 'direct',
            userId: userId
        });

        res.json({
            success: true,
            data: {
                conceptmap: response.content,
                model: response.model,
                usage: response.usage,
                cost: response.cost
            }
        });

    } catch (error) {
        next(error);
    }
}

/**
 * Generar Prompt para Imagen
 * POST /api/tools/image-prompt
 * Nota: La generación real de imagen requeriría DALL-E u otro servicio
 */
async function generateImagePrompt(req, res, next) {
    try {
        const schema = Joi.object({
            subject: Joi.string().required(),
            concept: Joi.string().required(),
            style: Joi.string().valid('realistic', 'illustration', 'diagram', 'cartoon').default('illustration')
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: error.details.map(d => d.message)
            });
        }

        const { subject, concept, style } = value;
        const userId = req.userId;

        const prompt = `Genera un prompt detallado en inglés para crear una imagen educativa sobre "${concept}".

Estilo: ${style}
Materia: ${subject}

El prompt debe:
1. Describir claramente el concepto visual
2. Especificar el estilo artístico (${style})
3. Incluir elementos educativos relevantes
4. Ser apropiado para estudiantes
5. Ser técnicamente viable para generadores de imagen IA

Proporciona:
- Prompt en inglés (para DALL-E o Stable Diffusion)
- Descripción en español del resultado esperado
- Elementos clave a incluir en la imagen`;

        const response = await aiService.generateResponse({
            message: prompt,
            subject: subject,
            history: [],
            mode: 'direct',
            userId: userId
        });

        res.json({
            success: true,
            data: {
                imagePrompt: response.content,
                model: response.model,
                usage: response.usage,
                cost: response.cost
            },
            note: 'La generación de imagen real requiere integración con DALL-E, Stable Diffusion u otro servicio'
        });

    } catch (error) {
        next(error);
    }
}

/**
 * Generar Script para Video Educativo
 * POST /api/tools/video-script
 */
async function generateVideoScript(req, res, next) {
    try {
        const schema = Joi.object({
            subject: Joi.string().required(),
            topic: Joi.string().required(),
            duration: Joi.number().integer().min(1).max(10).default(3), // minutos
            audience: Joi.string().valid('primaria', 'secundaria', 'universidad').default('secundaria')
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Datos inválidos',
                errors: error.details.map(d => d.message)
            });
        }

        const { subject, topic, duration, audience } = value;
        const userId = req.userId;

        const prompt = `Crea un guion para video educativo de ${duration} minutos sobre "${topic}".

Audiencia: ${audience}
Materia: ${subject}

Estructura del guion:
1. Introducción (gancho + objetivo)
2. Desarrollo (conceptos clave con ejemplos)
3. Práctica/Aplicación
4. Resumen y cierre

Incluye:
- Diálogos/narración
- Sugerencias de visuales
- Timing aproximado
- Transiciones
- Llamados a la acción

Formato: Script detallado paso a paso.`;

        const response = await aiService.generateResponse({
            message: prompt,
            subject: subject,
            history: [],
            mode: 'direct',
            userId: userId
        });

        res.json({
            success: true,
            data: {
                videoScript: response.content,
                model: response.model,
                usage: response.usage,
                cost: response.cost
            },
            note: 'Este es un guion para video. La producción del video requiere software adicional.'
        });

    } catch (error) {
        next(error);
    }
}

module.exports = {
    generateTestPrep,
    generateQuiz,
    generateEvaluation,
    generateMindMap,
    generateConceptMap,
    generateImagePrompt,
    generateVideoScript
};
