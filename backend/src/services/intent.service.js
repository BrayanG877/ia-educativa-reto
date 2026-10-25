/**
 * Detección de intención y materia — reglas ligeras, sin LLM
 * ==================================================================
 * POR QUÉ EXISTE
 *   El fallo reportado («¿Quién fue Cristóbal Colón?» → el tutor preguntaba
 *   por operaciones matemáticas) tenía dos causas en cadena:
 *
 *     1. El frontend enviaba `subject: 'matematicas'` por defecto cuando el
 *        estudiante no elegía materia (web/app.js).
 *     2. El prompt del modo socrático decía «NUNCA des respuestas directas»,
 *        así que el modelo no podía responder una pregunta factual y
 *        convertía cualquier mensaje en una pregunta de sondeo.
 *
 *   Este módulo resuelve la parte de CONTEXTO: inferir de qué habla el
 *   estudiante a partir de su propio texto, sin añadir una llamada al modelo
 *   (coste cero de latencia: son expresiones regulares sobre una sola cadena).
 *
 * REGLAS DE DISEÑO
 *   - Determinista y auditable: mismas entradas → mismas salidas.
 *   - Los indicadores específicos mandan (un «Newton» fuerte pesa más que un
 *     «ecuación» débil).
 *   - Empate → se conserva la materia anterior de la conversación (no se salta
 *     de tema sin motivo).
 *   - Es una AYUDA, no un candado: nunca impide responder; solo evita imponer
 *     una materia que el estudiante no pidió.
 */
'use strict';

/**
 * Materias soportadas por el producto, con sus señales.
 * `fuerte` = términos casi inequívocos de la materia.
 * `debil`  = términos que aparecen en esa materia pero también en otras.
 */
const MATERIAS = {
    sociales: {
        nombre: 'Ciencias Sociales / Historia / Geografía',
        emoji: '🌍',
        fuerte: [
            'cristobal colon', 'colón', 'colombina', 'independencia', 'colonizacion', 'colonia',
            'conquista', 'reyes catolicos', 'america precolombina', 'inca', 'azteca', 'maya',
            'simon bolivar', 'bolivar', 'santander', 'napoleon', 'primera guerra', 'segunda guerra',
            'guerra fria', 'revolucion francesa', 'revolucion industrial', 'roma antigua',
            'grecia antigua', 'edad media', 'renacimiento', 'ilustracion', 'feudalismo',
            'historia', 'historico', 'historia de', 'geografia', 'mapa', 'continente',
            'pais', 'capital de', 'frontera', 'bioma', 'clima', 'democracia', 'constitucion',
            'presidente', 'derechos humanos', 'esclavitud', 'mestizaje'
        ],
        debil: ['siglo', 'siglos', 'antiguo', 'movimiento', 'cultura', 'pueblo', 'gobierno']
    },

    matematicas: {
        nombre: 'Matemáticas',
        emoji: '➗',
        fuerte: [
            'ecuacion', 'ecuaciones', 'cuadratica', 'polinomio', 'polinomios', 'factorizacion',
            'derivada', 'integral', 'logaritmo', 'matriz', 'fraccion', 'fracciones',
            'porcentaje', 'porcentajes', 'proporcionalidad', 'regla de tres', 'teorema',
            'pitagoras', 'trigonometria', 'seno', 'coseno', 'tangente', 'funcion cuadratica',
            'discriminante', 'raiz cuadrada', 'mcm', 'mcd', 'numerador', 'denominador',
            'algebra', 'algebraica', 'aritmetica', 'geometria', 'estadistica', 'probabilidad',
            'area de', 'perimetro', 'angulo', 'triangulo', 'binomio', 'inecuacion'
        ],
        debil: ['numero', 'números', 'suma', 'resta', 'multiplicacion', 'division', 'calculo',
                'problema', 'resultado', 'valor', 'igual', 'x =', 'grafica']
    },

    fisica: {
        nombre: 'Física',
        emoji: '⚛️',
        fuerte: [
            'newton', 'segunda ley', 'primera ley', 'tercera ley', 'ley de newton',
            'velocidad', 'aceleracion', 'gravedad', 'friccion', 'masa', 'peso',
            'energia cinetica', 'energia potencial', 'momento lineal', 'impulso',
            'electricidad', 'corriente electrica', 'voltaje', 'resistencia electrica',
            'magnetismo', 'onda', 'frecuencia', 'longitud de onda', 'optica', 'lente',
            'termodinamica', 'calor especifico', 'presion', 'densidad', 'trabajo mecanico',
            'fisica', 'caida libre', 'movimiento rectilineo', 'cinematica', 'dinamica'
        ],
        debil: ['fuerza', 'fuerzas', 'movimiento', 'energia', 'campo', 'particula']
    },

    quimica: {
        nombre: 'Química',
        emoji: '🧪',
        fuerte: [
            'quimica', 'atomo', 'molecula', 'enlace quimico', 'enlace covalente', 'enlace ionico',
            'tabla periodica', 'elemento quimico', 'reaccion quimica', 'estequiometria',
            'mol', 'moles', 'acido', 'base', 'ph', 'oxido', 'oxidacion', 'reduccion',
            'compuesto', 'solucion quimica', 'electrolisis', 'orbital', 'valencia',
            'formula quimica', 'h2o', 'co2'
        ],
        debil: ['gas', 'liquido', 'solido', 'mezcla', 'disolucion', 'enlace']
    },

    biologia: {
        nombre: 'Biología / Ciencias Naturales',
        emoji: '🧬',
        fuerte: [
            'celula', 'adn', 'arn', 'genetica', 'gen', 'cromosoma', 'mitosis', 'meiosis',
            'fotosintesis', 'respiracion celular', 'ecosistema', 'ecologia', 'evolucion',
            'especie', 'bacteria', 'virus', 'organelo', 'mitocondria', 'nucleo celular',
            'sistema digestivo', 'sistema nervioso', 'sistema circulatorio', 'sangre',
            'biologia', 'biodiversidad', 'taxonomia', 'hongo', 'planta', 'animal'
        ],
        debil: ['vida', 'organismo', 'cuerpo humano', 'salud', 'reproduccion']
    },

    'español': {
        nombre: 'Español / Lengua Castellana / Literatura',
        emoji: '📚',
        fuerte: [
            'literatura', 'poema', 'poesia', 'novela', 'cuento', 'narrador', 'protagonista',
            'metafora', 'simbolo literario', 'figura literaria', 'sintaxis', 'morfologia',
            'sustantivo', 'adjetivo', 'verbo', 'oracion gramatical', 'ortografia',
            'acento', 'tildacion', 'garcia marquez', 'gabriel garcia marquez', 'quijote',
            'genero literario', 'ensayo', 'redaccion', 'comentario de texto', 'rima', 'verso'
        ],
        debil: ['texto', 'lectura', 'escribir', 'palabra', 'frase', 'autor', 'obra']
    },

    filosofia: {
        nombre: 'Filosofía',
        emoji: '🤔',
        fuerte: [
            'filosofia', 'platon', 'aristoteles', 'socrates', 'descartes', 'kant', 'hegel',
            'nietzsche', 'marx', 'epistemologia', 'ontologia', 'etica', 'metafisica',
            'existencialismo', 'empirismo', 'racionalismo', 'dialectica', 'silogismo'
        ],
        debil: ['pensamiento', 'verdad', 'libertad', 'moral', 'conocimiento']
    },

    ingles: {
        nombre: 'Inglés / Lenguas Extranjeras',
        emoji: '🗣️',
        fuerte: [
            'ingles', 'en ingles', 'present perfect', 'past simple', 'phrasal verb',
            'vocabulary', 'grammar', 'verb to be', 'translation to english'
        ],
        debil: ['english', 'traduce', 'traducir']
    },

    informatica: {
        nombre: 'Informática / Tecnología',
        emoji: '💻',
        fuerte: [
            'programacion', 'codigo fuente', 'algoritmo', 'javascript', 'python', 'variable',
            'bucle', 'funcion de programacion', 'javascript', 'html', 'css', 'base de datos',
            'servidor', 'internet', 'red de computadores', 'informatica'
        ],
        debil: ['computador', 'software', 'hardware', 'tecnologia', 'app']
    },

    arte: {
        nombre: 'Arte / Educación Artística',
        emoji: '🎨',
        fuerte: [
            'pintura', 'escultura', 'arquitectura', 'dibujo artistico', 'tecnica artistica',
            'botero', 'picasso', 'davinci', 'impresionismo', 'cubismo', 'color primario'
        ],
        debil: ['arte', 'artista', 'obra de arte', 'museo', 'colores']
    },

    'educacion-fisica': {
        nombre: 'Educación Física / Deportes',
        emoji: '⚽',
        fuerte: [
            'educacion fisica', 'deporte', 'futbol', 'baloncesto', 'voleibol', 'atletismo',
            'calentamiento', 'entrenamiento deportivo', 'resistencia muscular'
        ],
        debil: ['ejercicio fisico', 'salud deportiva']
    },

    religion: {
        nombre: 'Religión',
        emoji: '✅',
        fuerte: [
            'religion', 'religioso', 'biblia', 'cristianismo', 'islam', 'judaismo',
            'budismo', 'hinduismo', 'catolico', 'protestante', 'fe religiosa'
        ],
        debil: ['dios', 'iglesia', 'espiritualidad']
    }
};

/**
 * Mensajes en los que el estudiante señala que el tutor respondió mal.
 * Su detección activa la REGLA 3 del prompt y vuelve a la pregunta anterior.
 */
const PATRONES_CORRECCION = [
    /por\s*qu[eé]\s+me\s+respondes?\s+(eso|as[ií]|de\s+esa\s+forma)/i,
    /no\s+te\s+pregunt[eé]\s+(eso|esto)/i,
    /no\s+entendiste/i,
    /esa\s+no\s+(es|fue)\s+mi\s+pregunta/i,
    /no\s+tiene\s+(nada\s+que\s+ver|relaci[oó]n)/i,
    /no\s+estoy\s+(preguntando|hablando)\s+(de|sobre)\s+eso/i,
    /te\s+estoy\s+preguntando\s+por/i,
    /eso\s+no\s+responde/i,
    /est[aá]s?\s+hablando\s+de\s+otra\s+cosa/i
];

/** Normaliza: minúsculas y sin acentos, preservando la ñ. */
function normalizar(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ñ/g, 'ñ');
}

/**
 * Puntúa cada materia según las señales presentes en el mensaje.
 * @returns {Array<{materia:string, puntaje:number, fuertes:number}>}
 */
function puntuarMaterias(texto) {
    const t = normalizar(texto);
    const resultado = [];

    for (const [clave, def] of Object.entries(MATERIAS)) {
        let puntaje = 0;
        let fuertes = 0;

        for (const termino of def.fuerte) {
            if (t.includes(normalizar(termino))) { puntaje += 3; fuertes += 1; }
        }
        for (const termino of def.debil) {
            if (t.includes(normalizar(termino))) { puntaje += 1; }
        }

        if (puntaje > 0) resultado.push({ materia: clave, puntaje, fuertes });
    }

    return resultado.sort((a, b) => {
        // 1) Puntaje total.
        // 2) Ante empate, gana quien tenga MÁS señales fuertes: una materia
        //    reconocida por dos términos específicos es más probable que una
        //    reconocida por uno que además coincide con una palabra débil.
        if (b.puntaje !== a.puntaje) return b.puntaje - a.puntaje;
        return b.fuertes - a.fuertes;
    });
}

/**
 * Detecta la materia probable del mensaje.
 *
 * @param {string} mensaje
 * @param {string|null} materiaActual  Materia de la conversación (si ya se conocía).
 * @returns {{ materia: string|null, confianza: 'alta'|'media'|'ninguna',
 *             cambioTema: boolean, puntaje: number }}
 */
function detectarMateria(mensaje, materiaActual = null) {
    const puntuaciones = puntuarMaterias(mensaje);

    if (puntuaciones.length === 0) {
        return {
            materia: materiaActual || null,
            confianza: 'ninguna',
            cambioTema: false,
            puntaje: 0
        };
    }

    const mejor = puntuaciones[0];

    // Una sola palabra débil no basta para cambiar de materia.
    if (mejor.fuertes === 0 && mejor.puntaje < 2 && materiaActual) {
        return {
            materia: materiaActual,
            confianza: 'baja',
            cambioTema: false,
            puntaje: mejor.puntaje
        };
    }

    const confianza = mejor.fuertes >= 1 ? 'alta' : 'media';
    return {
        materia: mejor.materia,
        confianza,
        cambioTema: !!materiaActual && mejor.materia !== materiaActual,
        puntaje: mejor.puntaje
    };
}

/**
 * Detecta si el estudiante está pidiendo un dato, una explicación, un
 * procedimiento, práctica o verificación.
 */
function detectarIntencion(mensaje) {
    const t = normalizar(mensaje);

    if (PATRONES_CORRECCION.some(re => re.test(mensaje))) return 'correccion';
    if (/(quien|que es|que fue|quienes|cual es|cuando|donde|cuanto es|cuantos)/.test(t)) return 'dato';
    if (/(explicame|explica|que significa|como funciona|por que|porque)/.test(t)) return 'explicacion';
    if (/(como (se )?(resuelve|hago|calculo|soluciono)|paso a paso|procedimiento|formula de)/.test(t)) return 'procedimiento';
    if (/(practiquemos|ejercicio|problema|quiero practicar|dame un ejemplo|ponme un reto)/.test(t)) return 'practica';
    if (/(esta bien|es correcto|revisa|revisa|evalua|corrige mi)/.test(t)) return 'verificacion';
    return 'conversacion';
}

/**
 * Texto del historial más reciente del estudiante, para recuperar la pregunta
 * original cuando el mensaje actual es una queja («¿por qué me respondes eso?»).
 */
function ultimaPreguntaDelEstudiante(historial) {
    if (!Array.isArray(historial)) return null;
    for (let i = historial.length - 1; i >= 0; i--) {
        const m = historial[i];
        if (!m || m.role !== 'user') continue;
        const contenido = String(m.content || '').trim();
        if (!contenido) continue;
        if (PATRONES_CORRECCION.some(re => re.test(contenido))) continue;
        return contenido;
    }
    return null;
}

/**
 * Construye una instrucción de turno (se añade al system prompt) que fija el
 * contexto de ESTE mensaje. Es breve para no inflar el prompt.
 *
 * @returns {string} instrucción, o '' si no aporta nada.
 */
function construirInstruccionDeTurno({ mensaje, materia, intencion, historial }) {
    const partes = [];

    const def = materia && MATERIAS[materia];
    if (def) {
        partes.push(`Materia del mensaje actual: ${def.nombre}.`);
    } else {
        partes.push('Materia del mensaje actual: no determinada. Infierela a partir del mensaje.');
    }

    if (intencion === 'correccion') {
        const previa = ultimaPreguntaDelEstudiante(historial);
        partes.push('El estudiante indica que no respondiste su pregunta. Reconoce el error en UNA frase y responde ahora la pregunta real.' + (previa ? ` Pregunta original: "${previa}"` : ''));
    } else if (intencion === 'dato') {
        partes.push('El estudiante pide un DATO. Da el dato con precisión y solo después, si aporta, una pregunta de seguimiento.');
    } else if (intencion === 'explicacion') {
        partes.push('El estudiante pide una explicación. Explica el concepto con claridad y un ejemplo.');
    } else if (intencion === 'procedimiento') {
        partes.push('El estudiante pide un procedimiento. Muéstralo paso a paso.');
    } else if (intencion === 'practica') {
        partes.push('El estudiante quiere practicar. Propón un ejercicio concreto y acompáñalo.');
    }

    return partes.join(' ');
}

module.exports = {
    MATERIAS,
    PATRONES_CORRECCION,
    normalizar,
    puntuarMaterias,
    detectarMateria,
    detectarIntencion,
    ultimaPreguntaDelEstudiante,
    construirInstruccionDeTurno
};
