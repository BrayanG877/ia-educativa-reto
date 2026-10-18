# Plataforma Educativa de IA - Frontend
Interfaz web para plataforma de inteligencia artificial educativa dirigida a estudiantes de colegios en Colombia.

## Descripción del Proyecto
Este es el frontend de una plataforma educativa que utiliza IA con método socrático para ayudar a estudiantes a aprender y prepararse para pruebas estandarizadas como el ICFES.

**Fase Actual:** Fase 2 - Integración completa con el backend (lista para pruebas reales)

## Características Implementadas
### ✓ Autenticación
- Login con JWT (`login.html`)
- Registro de estudiantes (`register.html`)
- Cierre de sesión con notificación al backend
- Reconstrucción del perfil desde `/api/auth/me` si falta en localStorage
### ✓ Barra superior
- Nombre/avatar del usuario
- Botón **Nueva** (reinicia la conversación)
- Botón **Historial** (lista de conversaciones guardadas)
- Botón **Progreso** (estadísticas + ranking)
- Botón **Salir** (cerrar sesión)

### ✓ Interfaz Principal de Conversación
- Área de chat para interacción con IA
- Barra de entrada de texto para preguntas
- Indicador de modo pedagógico (socrático / quiz / ICFES)
- Historial de mensajes con contexto entre turnos
- Reapertura de conversaciones antiguas desde el panel de historial
- Diseño responsivo y moderno

### ✓ Menú de Opciones de Estudio
- Botón "+" para desplegar opciones
- **Sección 1: Estudiar materias por separado**
  - Sociales
  - Biología
  - Física
  - Química
  - Español
  - Matemáticas
  - Inglés
- **Sección 2: Preparación para pruebas**
  - ICFES (Preparación para pruebas estandarizadas)

### ✓ Indicador de Contexto
- Muestra la materia o modo seleccionado
- Permite limpiar la selección rápidamente
### ✓ Progreso y Ranking
- Conversaciones, mensajes y tokens usados
- Materias más estudiadas
- Ranking de estudiantes (top 5)

## Estructura del Proyecto

```
web/
├── index.html          # Chat principal + barra superior + paneles laterales
├── login.html          # Inicio de sesión
├── register.html       # Registro de estudiantes
├── styles.css          # Estilos CSS modulares
├── app.js              # Lógica de la interfaz (chat, historial, progreso)
├── api-client.js       # Cliente REST (auth, chat, herramientas, métricas)
├── package.json        # Configuración del proyecto
└── README.md           # Esta documentación
```

## Instalación

No requiere instalación de dependencias. El servidor HTTP se ejecuta usando `npx`.

## Ejecución Local

Para iniciar el servidor local:

```bash
cd web
npm start
```

Esto abrirá automáticamente la página en tu navegador en `http://localhost:3000`

### Alternativa sin Node.js

Si prefieres usar Python:

```bash
cd web
python -m http.server 3000
```

Luego abre `http://localhost:3000` en tu navegador.

### Alternativa directa

También puedes abrir directamente el archivo `index.html` en tu navegador.

## Uso de la Interfaz

1. **Seleccionar una materia:**
   - Haz clic en el botón "+"
   - Selecciona una materia del menú desplegable
   - El contexto seleccionado aparecerá en la parte superior

2. **Escribir preguntas:**
   - Escribe tu pregunta en el campo de texto
   - Presiona Enter o haz clic en el botón de enviar (→)

3. **Cambiar de materia:**
   - Haz clic en la "×" del indicador superior para limpiar la selección
   - Selecciona una nueva materia del menú "+"

4. **Modo ICFES:**
   - Selecciona "ICFES" del menú de opciones
   - Este modo está preparado para activar preparación de pruebas en futuras fases

## Requisitos para pruebas reales
1. **Backend en marcha** en `http://localhost:3001` (ver `backend/`).
2. **API key válida de Anthropic** en `backend/.env` (`ANTHROPIC_API_KEY`).
   Sin ella el chat responde 503 "El servicio de IA no está disponible temporalmente".
3. **SQL Server y Redis** accesibles (el backend lo reporta en `GET /health`).

### Arrancar el frontend
```bash
cd web
npm start                 # npx http-server -p 3000 -o
```

Alternativa sin `npx` (servidor estático incluido en el repo):

```bash
cd backend
node serve-web.js         # sirve web/ en http://localhost:3000
```

Luego abre `http://localhost:3000/login.html`.

### Credenciales del usuario de prueba
- Email: `camilamiamor@gmail.com`
- Contraseña: `camila2804`

## Arquitectura y Escalabilidad

El código está diseñado con las siguientes consideraciones:

- **Modularidad:** Separación clara entre HTML, CSS y JavaScript
- **Estado centralizado:** Objeto `AppState` que gestiona el estado de la aplicación
- **Preparado para backend:** Funciones placeholder comentadas para integración futura
- **Componentes reutilizables:** Estructura que facilita la migración a frameworks como React

## Próximas Fases (Pendientes)

- [x] **Fase 2:** Integración con backend y API de IA
- [x] **Fase 3:** Implementación de método socrático (prompt + modo por defecto)
- [ ] **Fase 4:** Generación de preguntas tipo ICFES (endpoint listo, UI en proceso)
- [x] **Fase 5:** Sistema de métricas y ranking
- [x] **Fase 6:** Autenticación y gestión de usuarios
- [ ] **Fase 7:** Protección de datos y cumplimiento legal

## Tecnologías Utilizadas

- HTML5
- CSS3 (Variables CSS, Flexbox, Animaciones)
- JavaScript Vanilla (ES6+)
- Diseño responsivo

## Consideraciones Técnicas

### Preparación para Integración Backend

El archivo `app.js` incluye funciones placeholder comentadas para:
- Envío de contexto al backend (`prepareContextForAI`)
- Envío de mensajes a la IA (`sendMessageToAI`)
- Carga de historial de conversación (`loadChatHistory`)
- Guardado de preferencias (`saveUserPreferences`)

### Estructura de Datos

```javascript
// Ejemplo de mensaje
{
  id: 1620000000000,
  text: "¿Cómo resuelvo ecuaciones de segundo grado?",
  subject: { id: "matematicas", name: "Matemáticas" },
  timestamp: "2026-05-11T23:00:00.000Z",
  sender: "user"
}
```

## Notas de Desarrollo

- El botón "+" es temporal y será reemplazado por un icono profesional en futuras versiones
- La simulación de respuesta de IA está desactivada por defecto (comentada en el código)
- El proyecto cumple con estándares de accesibilidad (ARIA labels)
- Optimizado para navegadores modernos

## Contribución

Este proyecto está en fase de desarrollo activo. La arquitectura está preparada para:
- Migración a React/Vue.js si se requiere
- Integración con APIs REST o GraphQL
- Implementación de WebSockets para chat en tiempo real
- Sistema de autenticación JWT

## Licencia y Cumplimiento Legal

Este proyecto está diseñado para cumplir con:
- Ley 1581 de 2012 (Protección de Datos Personales en Colombia)
- Normativas educativas colombianas
- Estándares de protección de datos de menores

Para más información sobre consideraciones legales, consulta el archivo `analisis_ia_educativa.txt` en el directorio raíz del proyecto.
