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

## 5. Streaming (implementado)

### Por qué
La medición anterior mostró **TTFT ≈ 9,5 s y total ≈ 10,1 s**: el gateway tarda
en *empezar* a generar. Sin streaming el estudiante espera el total completo;
con streaming empieza a leer en el primer fragmento.

### Protocolo real de RETO (verificado)

`backend/scripts/audit-stream.js` confirmó que el gateway emite SSE compatible
OpenAI, pero con un detalle **crítico**:

```
delta.reasoning_content  →  razonamiento interno del modelo  (NO mostrar)
delta.content            →  texto destinado al estudiante    (mostrar)
```

`ai.providers.consumirSSE()` **descarta por completo** `reasoning_content`.
El estudiante nunca ve el monólogo interno.

El `usage` llega en el último fragmento (con `stream_options.include_usage`).

### Capas
| Capa | Archivo | Cambio |
|---|---|---|
| Proveedor | `ai.providers.js` | `retoCompletionStream`, `consumirSSE`, filtro de razonamiento, cancelación |
| Servicio | `ai.service.js` | `generateResponseStream` reutiliza el mismo contexto (materia inferida, instrucción de turno, agente) |
| Controlador | `chat.controller.js` | `streamMessage` con eventos `meta`/`delta`/`done`/`error` |
| Ruta | `chat.routes.js` | `POST /api/chat/stream` (JWT + rate limit) |
| Frontend | `api-client.js`, `app.js` | `streamMessage()`, render progresivo con rAF |

### Garantías
- **Texto visible solo**: `reasoning_content` filtrado en el proveedor.
- **Markdown seguro durante el flujo**: cada reintegro pasa por
  `Markdown.safeRender` (escapa antes de interpretar, lista blanca de etiquetas).
- **Un único evento de aprendizaje**, y solo si el turno termina bien. Un
  fallo, timeout o cancelación **no** dejan eventos parciales.
- **Sin reintentos tras haber emitido texto**: evita respuestas y eventos
  duplicados. Si falla *antes* del primer fragmento, el frontend reintenta una
  vez por el endpoint clásico.
- **Cancelación**: si el cliente cierra, se aborta la llamada al proveedor
  (no se sigue consumiendo cuota) y no se persiste nada.
- **Aislamiento**: mismas comprobaciones de propiedad de conversación que el
  flujo normal.
- **Nginx**: `X-Accel-Buffering: no` evita que el proxy acumule el flujo.

### Métricas medidas (real, N=1 por pregunta)

Contra RETO/grok-4.6. `bench-stream.js`.

| Pregunta | Sin stream (total) | TTFT con stream | Total con stream | Ahorro percibido |
|---|---|---|
| Historia | 14 608 ms | 14 485 ms | 21 846 ms | **123 ms** |
| Matemáticas | 14 684 ms | 5 047 ms | 7 902 ms | **9 637 ms** |
| Física | 14 031 ms | 17 197 ms | 23 045 ms | **−3 166 ms** |

**Conclusión honesta:** el resultado **no es concluyente**. En Matemáticas el
ahorro es de casi 10 s; en Historia es nulo; en Física fue negativo (el primer
fragmento llegó *después* que la respuesta completa de la otra petición).

**N=1 es insuficiente.** La varianza del proveedor (±7 s entre llamadas
idénticas) domina. **No se puede afirmar una mejora porcentual.**

Lo que sí es estructuralmente cierto: con streaming el estudiante ve el primer
texto en TTFT en lugar de esperar el total. Cuando el proveedor empieza a
generar rápido (caso Matemáticas), la mejora es real y grande; cuando tarda en
arrancar, el streaming no puede adelantar lo que el modelo aún no ha producido.

**Repetir con N≥10** antes de presentar cifras como definitivas.

## 6. Pruebas

| Suite | Qué fija |
|---|---|
| `tutor.context-regression.test.js` (18) | El fallo exacto, detección de materia, intención, corrección y que el frontend no vuelva a imponer `matematicas`. |
| `markdown.renderer.test.js` (19) | XSS, `javascript:`/`data:`, formato, tablas, listas, código. |
| `scripts/smoke-tutor.js` | Prueba **real** contra RETO/grok-4.6 (requiere clave; no forma parte de `npm test`). |

La prueba de regresión usa dobles, así que **no** demuestra por sí sola el
comportamiento del modelo. El smoke test sí, y fue el que validó el caso P0
contra `grok-4.6`.
