# Comportamiento del tutor

Cómo decide qué responder el tutor de IA-Educativa, y por qué.

## 1. El fallo corregido (P0)

**Síntoma reportado:**

```
Estudiante: ¿Quién fue Cristóbal Colón?
Tutor:      ¿Qué operaciones matemáticas básicas recuerdas haber usado
            recientemente en tu día a día?
```

Y tras la queja del estudiante, el tutor insistía en matemáticas.

### Causa raíz (doble, en cadena)

| # | Dónde | Qué ocurría |
|---|---|---|
| 1 | `web/app.js` | Enviaba `subject: 'matematicas'` **por defecto** cuando el estudiante no había elegido materia. Toda pregunta sin materia llegaba al backend etiquetada como Matemáticas. |
| 2 | `backend/src/services/prompt.service.js` | El prompt socrático abría con **«NUNCA des respuestas directas ni resuelvas ejercicios»**. Con un dato etiquetado como matemáticas y prohibición de responder, el modelo solo podía hacer una pregunta de sondeo. |

Ninguna de las dos por separado explica el fallo: hacían falta las dos.

### Correcciones aplicadas

1. **Frontend**: sin materia seleccionada se envía `null`. El backend decide.
2. **Prompt**: la Regla 1 es ahora «responde primero la pregunta explícita».
   La regla socrática pasa a ser un **estilo posterior**, no un sustituto.
3. **Detección de materia** (`intent.service.js`): se infiere la materia del
   propio mensaje. Si el cliente envía una materia que no corresponde, **gana
   el mensaje**.
4. **Corrección de error**: si el estudiante dice «¿por qué me respondes eso?»,
   el prompt indica reconocer el error en una frase y responder la pregunta
   original, que se recupera del historial.

## 2. Pipeline de una respuesta

```
mensaje
  │
  ├─ detectarIntencion()      reglas léxicas, ~0 ms
  ├─ detectarMateria()        reglas léxicas sobre 12 materias, ~1 ms
  ├─ getSystemPrompt()        base + contexto de materia
  ├─ construirInstruccionDeTurno()   qué se preguntó y qué hacer
  │
  ├─ caché (Redis)            HIT → respuesta inmediata
  │
  └─ proveedor LLM            el 99 % del tiempo (ver §4)
       └─ fallback si es recuperable y no es timeout
```

La clasificación es **determinista y léxica**: no añade una llamada al modelo,
así que no cuesta latencia. Los indicadores *fuertes* (p. ej. «newton»,
«fotosíntesis», «colón») pesan 3 y los *débiles* 1. Ante empate gana quien
tenga más señales fuertes.

## 3. Reglas del tutor

1. **Responder primero la pregunta explícita.** Una pregunta factual recibe un
   dato, no una pregunta de reflexión.
2. **La materia sale del mensaje.** No hay materia por defecto.
3. **Corrección inmediata** si el estudiante señala una respuesta inconexa.
4. **El método socrático va después**: comprobar y practicar, no esquivar datos.
5. **Exactitud**: no inventar datos; en historia y ciencias sociales, presentar
   perspectivas equilibradas (la colonización no se presenta como un hecho
   exclusivamente positivo).

## 4. Latencia medida (evidencia real)

Medición contra **RETO / grok-4.6**, 2-3 muestras por caso, pipeline completo
con caché en frío.

| Caso | Antes (media) | Después (media) |
|---|---|---|
| Historia («Cristóbal Colón») | 19 652 ms | 24 653 ms |
| Matemáticas («ecuación cuadrática») | 13 075 ms | 9 829 ms |
| Física («segunda ley de Newton») | 19 073 ms | 16 812 ms |

**Conclusión honesta:** mejoró en 2 de 3 casos (−25 % y −12 %), pero la varianza
del proveedor (±10 s entre llamadas idénticas) es mayor que la mejora. **No
puedo afirmar una mejora porcentual fiable.**

### Dónde se va el tiempo

| Etapa | Coste medido |
|---|---|
| Construcción del prompt (detectores incluidos) | **~1 ms** |
| Proveedor LLM (`grok-4.6`) | 99,9 % |

El proveedor es el cuello de botella. `grok-4.6` tarda 10–55 s en respuestas
de ~700–1500 caracteres.

### Ajustes de latencia aplicados (minimizan el peor caso, no la media)

1. **Un timeout ya no se reintenta** (`ai.providers.js`).
   Antes: si a los 30 s se abortaba, se reintentaba con otro proveedor. Eso
   *duplicaba* la espera y, si el segundo también expiraba, el estudiante
   recibía un error tras ~60 s. Medido: una respuesta de 54 s se convertía en
   más de 90 s.
2. **Timeout por defecto 30 s → 60 s** (`ai.config.js`).
   Cortaba respuestas que sí terminaban; el reintento no las salvaba.
3. **Mensaje de error accionable** en vez de «La respuesta está tardando más de
   lo esperado. Intenta con una pregunta más corta».

## 5. Streaming: disponible pero no activado

Verificado: el gateway **sí soporta SSE**. Medición:

| Modo | TTFT | Total |
|---|---|---|
| Sin streaming | — | ~10 600 ms |
| Streaming SSE | ~9 500 ms | ~10 100 ms |

**TTFT ≈ total** significa que el servidor tarda en *empezar* a generar, no en
producir el texto. El streaming reduciría la espera *percibida* (~40 % en colas
largas) pero **no** el tiempo total.

No se activó porque exige cambios en tres capas (proveedor → servicio →
controlador → frontend), una prueba de que el `usage` se conserva para el
registro de costes, y validación de que la instrumentación de aprendizaje no se
duplica al recibir fragmentos. Es el siguiente paso con mayor impacto real.

## 6. Pruebas

| Suite | Qué fija |
|---|---|
| `tutor.context-regression.test.js` (18) | El fallo exacto, detección de materia, intención, corrección y que el frontend no vuelva a imponer `matematicas`. |
| `markdown.renderer.test.js` (19) | XSS, `javascript:`/`data:`, formato, tablas, listas, código. |
| `scripts/smoke-tutor.js` | Prueba **real** contra RETO/grok-4.6 (requiere clave; no forma parte de `npm test`). |

La prueba de regresión usa dobles, así que **no** demuestra por sí sola el
comportamiento del modelo. El smoke test sí, y fue el que validó el caso P0
contra `grok-4.6`.
