/**
 * Limpiar localStorage corrupto al cargar (FIX para error JSON.parse)
 */
(function() {
    try {
        const userStr = localStorage.getItem('user');
        if (userStr === 'undefined' || userStr === 'null') {
            console.warn('⚠️ localStorage corrupto detectado, limpiando...');
            localStorage.removeItem('user');
            localStorage.removeItem('auth_token');
        }
    } catch (e) {
        console.error('Error limpiando localStorage:', e);
    }
})();

/**
 * Configuración del API Backend
 * Detecta automáticamente si está en desarrollo o producción
 */
const API_CONFIG = {
    // En producción, usar URLs relativas; en desarrollo, localhost.
    // El caso file:// hay que tratarlo aparte: al abrir index.html con doble clic
    // hostname queda vacío y window.location.origin vale "null", así que TODAS
    // las peticiones se construían como "null/api/..." y fallaban antes de salir.
    BASE_URL: (function () {
        const { protocol, hostname, origin } = window.location;

        if (protocol === 'file:' || !hostname) {
            console.warn('[API] Página abierta como archivo local (file://). ' +
                'Se usará http://localhost:3001. Para evitar problemas de CORS, ' +
                'sirve la carpeta web con: npm start (http://localhost:3000)');
            return 'http://localhost:3001';
        }

        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'http://localhost:3001';
        }

        return origin;
    })(),
    ENDPOINTS: {
        LOGIN: '/api/auth/login',
        REGISTER: '/api/auth/register',
        LOGOUT: '/api/auth/logout',
        PROFILE: '/api/auth/me',
        SUBJECTS: '/api/chat/subjects',
        MESSAGE: '/api/chat/message',
        CONVERSATIONS: '/api/chat/conversations',
        NEW_CONVERSATION: '/api/chat/conversation/new',
        HISTORY: '/api/chat/history',
        RANKING: '/api/metrics/ranking',
        STATS: '/api/metrics/stats',
        // Herramientas
        TEST_PREP: '/api/tools/test-prep',
        QUIZ: '/api/tools/quiz',
        EVALUATION: '/api/tools/evaluation',
        MINDMAP: '/api/tools/mindmap',
        CONCEPTMAP: '/api/tools/conceptmap',
        IMAGE_PROMPT: '/api/tools/image-prompt',
        VIDEO_SCRIPT: '/api/tools/video-script'
    }
};

/**
 * Lee una respuesta como JSON de forma SEGURA.
 *
 * Problema que resuelve: cuando el backend esta caido, el proxy (Nginx) responde
 * 502/504 con una pagina HTML. `response.json()` entonces lanzaba
 *     "SyntaxError: Unexpected token '<', \"<html>...\" is not valid JSON"
 * que no explica nada al usuario ni al desarrollador.
 *
 * Devuelve SIEMPRE un objeto { ok, status, data, error }:
 *   - ok:     true si la respuesta vino con 2xx Y un JSON valido
 *   - status: codigo HTTP real
 *   - data:   el JSON parseado, o null
 *   - error:  mensaje legible cuando no fue posible leer JSON
 */
async function parseJsonResponse(response) {
    const status = response.status;
    const text = await response.text();

    let data = null;
    // Un JSON valido puede venir con content-type application/json o text/json;
    // ademas algunas respuestas (p. ej. errores del proxy) no lo declaran, asi
    // que se intenta parsear de todos modos cuando el cuerpo parece JSON.
    const pareceJson = text && (text.trim().startsWith('{') || text.trim().startsWith('['));
    if (pareceJson) {
        try { data = JSON.parse(text); } catch (_) { data = null; }
    }

    if (data === null) {
        // El proxy (Nginx) o cualquier intermediario devolvio algo que no es JSON
        // (tipicamente su pagina HTML de 502/504 Bad Gateway).
        const esHtml = /^\s*</.test(text || '');
        const detalle = esHtml
            ? 'El servidor no esta disponible (respuesta HTML del proxy).'
            : 'Respuesta no valida del servidor.';
        return {
            ok: false,
            status,
            data: null,
            error: `${detalle} (HTTP ${status})`
        };
    }

    return { ok: response.ok, status, data, error: null };
}

/**
 * Gestor de autenticación con JWT
 */
class AuthManager {
    constructor() {
        this.token = localStorage.getItem('auth_token');

        // Manejar correctamente el caso cuando user no existe o es "undefined"
        const userStr = localStorage.getItem('user');
        try {
            this.user = (userStr && userStr !== 'undefined' && userStr !== 'null')
                ? JSON.parse(userStr)
                : null;
        } catch (e) {
            console.warn('Error parsing user from localStorage:', e);
            this.user = null;
        }
    }

    isAuthenticated() {
        return !!this.token;
    }

    getToken() {
        return this.token;
    }

    getUser() {
        return this.user;
    }

    async login(email, password) {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.LOGIN}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            // Lectura segura: si el proxy devuelve HTML (502/504), se traduce a
            // un mensaje legible en vez de lanzar "Unexpected token '<'"
            // (el fallo original reportado en el navegador).
            const parsed = await parseJsonResponse(response);
            if (parsed.error) {
                return { success: false, message: parsed.error };
            }
            const data = parsed.data;

            if (data.success) {
                this.token = data.data.token;
                // El backend NO devuelve un objeto `user`: envía los campos planos
                // (userId, email, username, fullName, role). Antes se guardaba
                // `data.data.user`, que es `undefined`, así que localStorage.user
                // quedaba como la cadena "undefined" y cualquier lectura de
                // `user.email` (p. ej. en index.html) fallaba.
                this.user = {
                    userId: data.data.userId,
                    email: data.data.email,
                    username: data.data.username,
                    fullName: data.data.fullName,
                    role: data.data.role
                };
                localStorage.setItem('auth_token', this.token);
                localStorage.setItem('user', JSON.stringify(this.user));
                return { success: true, user: this.user };
            } else {
                return { success: false, message: data.message };
            }
        } catch (error) {
            console.error('Error en login:', error);
            return { success: false, message: 'Error de conexión con el servidor' };
        }
    }

    /**
     * Registrar un nuevo usuario. El backend devuelve los mismos campos planos
     * que el login, así que se guarda igual y el usuario queda autenticado.
     */
    async register({ email, password, username, fullName, gradeLevel, institution, role, subject }) {
        try {
            // El backend acepta role='student'|'teacher'. 'teacher' además
            // valida la asignatura contra el catálogo real y puede requerir
            // aprobación (TEACHER_SELF_REGISTRATION). El cliente solo envia
            // los campos que el formulario permite elegir.
            const payload = { email, password, username, fullName, gradeLevel, institution };
            if (role === 'teacher') {
                payload.role = 'teacher';
                payload.subject = subject;
            }

            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.REGISTER}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // Misma lectura segura que en login: un 502 del proxy responde HTML
            // y antes producia SyntaxError en lugar de un mensaje claro.
            const parsed = await parseJsonResponse(response);
            if (parsed.error) {
                return { success: false, message: parsed.error };
            }
            const data = parsed.data;

            if (data.success && data.data?.token) {
                this.token = data.data.token;
                this.user = {
                    userId: data.data.userId,
                    email: data.data.email,
                    username: data.data.username,
                    fullName: data.data.fullName,
                    // El rol viene del backend, no se asume.
                    role: data.data.role || (role === 'teacher' ? 'teacher' : 'student')
                };
                localStorage.setItem('auth_token', this.token);
                localStorage.setItem('user', JSON.stringify(this.user));
                return { success: true, user: this.user };
            }

            return { success: false, message: data.message || 'No se pudo completar el registro' };
        } catch (error) {
            console.error('Error en registro:', error);
            return { success: false, message: 'Error de conexión con el servidor' };
        }
    }

    // ===================================
    // PANEL DOCENTE (rol teacher)
    // Todas las rutas exigen JWT + rol teacher en el backend.
    // ===================================

    /** Petición GET autenticada con lectura segura de errores. */
    async _getAuth(path) {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${path}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
                }
            });
            const parsed = await parseJsonResponse(response);
            if (parsed.error) {
                return { success: false, message: parsed.error, status: response.status };
            }
            const data = parsed.data;
            if (!data.success) {
                return { success: false, message: data.message || 'Error al consultar el panel', status: response.status };
            }
            return { success: true, data: data.data, status: response.status };
        } catch (error) {
            console.error('Error en petición docente:', error);
            return { success: false, message: 'Error de conexión con el servidor' };
        }
    }

    /** Grupos y asignaturas asignados al profesor autenticado. */
    async getTeacherGroups() {
        return this._getAuth('/api/teacher/groups');
    }

    /** Estudiantes inscritos en un grupo autorizado. */
    async getGroupStudents(groupId, subject) {
        return this._getAuth(
            `/api/teacher/groups/${encodeURIComponent(groupId)}/students?subject=${encodeURIComponent(subject)}`
        );
    }

    /** Estadísticas agregadas del grupo (período en días). */
    async getGroupStats(groupId, subject, days = 30) {
        return this._getAuth(
            `/api/teacher/groups/${encodeURIComponent(groupId)}/stats?subject=${encodeURIComponent(subject)}&days=${encodeURIComponent(days)}`
        );
    }

    /** Perfil de aprendizaje individual. */
    async getStudentProfile(groupId, studentId, subject, days = 90) {
        return this._getAuth(
            `/api/teacher/groups/${encodeURIComponent(groupId)}/students/${encodeURIComponent(studentId)}?subject=${encodeURIComponent(subject)}&days=${encodeURIComponent(days)}`
        );
    }

    /**
     * Cerrar sesión. Notifica al backend (auditoría) y limpia el estado local.
     * No se espera la respuesta para no bloquear la salida si el servidor falla.
     */
    async logout() {
        const token = this.token;
        this.token = null;
        this.user = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');

        if (token) {
            try {
                await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.LOGOUT}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
                });
            } catch (_) {
                // El logout local ya se hizo; un fallo de red no debe impedirlo.
            }
        }
    }

    /**
     * Obtener el perfil fresco del usuario desde el backend.
     */
    async getProfile() {
        if (!this.isAuthenticated()) return null;
        try {
            const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.PROFILE}`, {
                headers: this.getHeaders()
            });
            const data = await res.json();
            return data.success ? data.data : null;
        } catch (error) {
            console.error('Error obteniendo perfil:', error);
            return null;
        }
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }
}

/**
 * Cliente del API de IA
 */
class AIClient {
    constructor(authManager) {
        this.auth = authManager;
    }

    async sendMessage(message, subject = 'matematicas', mode = 'socratic', conversationId = null) {
        if (!this.auth.isAuthenticated()) {
            throw new Error('No autenticado');
        }

        try {
            // conversationId es OBLIGATORIO desde el 2º mensaje: sin él el backend
            // abre una conversación nueva cada vez y la IA pierde todo el contexto.
            const payload = {
                message: message,
                subject: subject,
                mode: mode
            };
            if (conversationId) {
                payload.conversationId = conversationId;
            }

            console.log('[CHAT] POST', API_CONFIG.ENDPOINTS.MESSAGE, {
                subject, mode,
                conversationId: conversationId || '(nueva)',
                token: this.auth.getToken() ? 'EXISTE' : 'NO EXISTE'
            });

            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.MESSAGE}`, {
                method: 'POST',
                headers: this.auth.getHeaders(),
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            console.log('[CHAT] HTTP', response.status);

            // Sesión inválida o expirada: cerrar sesión y avisar en lugar de
            // dejar al estudiante creyendo que la IA no responde.
            if (response.status === 401) {
                await this.auth.logout();
                return { success: false, status: 401, message: data.message || 'Sesión expirada' };
            }

            if (data.success) {
                return {
                    success: true,
                    response: data.data.response,
                    conversationId: data.data.conversationId,
                    model: data.data.model,
                    usage: data.data.usage,
                    cost: data.data.cost
                };
            } else {
                return { success: false, status: response.status, message: data.message };
            }
        } catch (error) {
            console.error('Error enviando mensaje:', error);
            return { success: false, message: 'Error de conexión con el servidor' };
        }
    }

    async getSubjects() {
        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SUBJECTS}`);
            const data = await response.json();
            // El backend devuelve { subjects: [...], count: N } dentro de `data`,
            // no un array. Sin este desempaquetado el llamador recibía un objeto
            // y cualquier `.map()`/`.length` sobre "materias" fallaba.
            if (!data.success) return [];
            return data.data?.subjects || [];
        } catch (error) {
            console.error('Error obteniendo materias:', error);
            return [];
        }
    }

    async getConversations() {
        if (!this.auth.isAuthenticated()) {
            throw new Error('No autenticado');
        }

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CONVERSATIONS}`, {
                headers: this.auth.getHeaders()
            });
            const data = await response.json();
            // El backend devuelve { conversations: [...], count: N }.
            if (!data.success) return [];
            return data.data?.conversations || [];
        } catch (error) {
            console.error('Error obteniendo conversaciones:', error);
            return [];
        }
    }

    async getHistory(conversationId) {
        if (!this.auth.isAuthenticated()) {
            throw new Error('No autenticado');
        }

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.HISTORY}/${conversationId}`, {
                headers: this.auth.getHeaders()
            });
            const data = await response.json();
            return data.success ? data.data : null;
        } catch (error) {
            console.error('Error obteniendo historial:', error);
            return null;
        }
    }

    /**
     * Crear una conversación nueva en el backend.
     * Body: { subjectId, mode, title? }
     */
    async createConversation(subjectId, mode = 'socratic', title) {
        if (!this.auth.isAuthenticated()) throw new Error('No autenticado');
        try {
            const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.NEW_CONVERSATION}`, {
                method: 'POST',
                headers: this.auth.getHeaders(),
                body: JSON.stringify({ subjectId, mode, title })
            });
            const data = await res.json();
            return data.success ? data.data : null;
        } catch (error) {
            console.error('Error creando conversación:', error);
            return null;
        }
    }

    /**
     * Eliminar (soft delete) una conversación del usuario.
     */
    async deleteConversation(conversationId) {
        if (!this.auth.isAuthenticated()) throw new Error('No autenticado');
        try {
            const res = await fetch(`${API_CONFIG.BASE_URL}/api/chat/conversation/${conversationId}`, {
                method: 'DELETE',
                headers: this.auth.getHeaders()
            });
            const data = await res.json();
            return !!data.success;
        } catch (error) {
            console.error('Error eliminando conversación:', error);
            return false;
        }
    }

    /**
     * Obtener estadísticas del usuario autenticado (total de conversaciones,
     * mensajes, materias más usadas...).
     */
    async getStats() {
        if (!this.auth.isAuthenticated()) throw new Error('No autenticado');
        try {
            const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.STATS}`, {
                headers: this.auth.getHeaders()
            });
            const data = await res.json();
            return data.success ? data.data : null;
        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            return null;
        }
    }

    /**
     * Obtener el ranking de estudiantes. Requiere sesión: el endpoint ya no es
     * público (expone nombre de usuario y puntuaciones).
     * Query: ?limit=10 (entero 1..100)
     */
    async getRanking(limit = 10, subject = null) {
        if (!this.auth.isAuthenticated()) return null;
        try {
            const qs = new URLSearchParams({ limit });
            if (subject) qs.set('subject', subject);
            const res = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.RANKING}?${qs.toString()}`, {
                headers: this.auth.getHeaders()
            });
            const data = await res.json();
            return data.success ? data.data : null;
        } catch (error) {
            console.error('Error obteniendo ranking:', error);
            return null;
        }
    }
}

/**
 * Cliente de Herramientas Educativas
 */
class ToolsClient {
    constructor(authManager) {
        this.auth = authManager;
    }

    async generateTestPrep(subject, topic, quantity = 10, difficulty = 'intermedio') {
        if (!this.auth.isAuthenticated()) {
            throw new Error('No autenticado');
        }

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.TEST_PREP}`, {
                method: 'POST',
                headers: this.auth.getHeaders(),
                body: JSON.stringify({ subject, topic, quantity, difficulty })
            });

            const data = await response.json();
            return data.success ? { success: true, ...data.data } : { success: false, message: data.message };
        } catch (error) {
            console.error('Error generando test:', error);
            return { success: false, message: 'Error de conexión' };
        }
    }

    async generateQuiz(subject, topic, type = 'mixed', quantity = 5) {
        if (!this.auth.isAuthenticated()) {
            throw new Error('No autenticado');
        }

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.QUIZ}`, {
                method: 'POST',
                headers: this.auth.getHeaders(),
                body: JSON.stringify({ subject, topic, type, quantity })
            });

            const data = await response.json();
            return data.success ? { success: true, ...data.data } : { success: false, message: data.message };
        } catch (error) {
            console.error('Error generando quiz:', error);
            return { success: false, message: 'Error de conexión' };
        }
    }

    async generateEvaluation(subject, topics, quantity = 15) {
        if (!this.auth.isAuthenticated()) {
            throw new Error('No autenticado');
        }

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.EVALUATION}`, {
                method: 'POST',
                headers: this.auth.getHeaders(),
                body: JSON.stringify({ subject, topics, quantity })
            });

            const data = await response.json();
            return data.success ? { success: true, ...data.data } : { success: false, message: data.message };
        } catch (error) {
            console.error('Error generando evaluación:', error);
            return { success: false, message: 'Error de conexión' };
        }
    }

    async generateMindMap(subject, topic, depth = 3) {
        if (!this.auth.isAuthenticated()) {
            throw new Error('No autenticado');
        }

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.MINDMAP}`, {
                method: 'POST',
                headers: this.auth.getHeaders(),
                body: JSON.stringify({ subject, topic, depth })
            });

            const data = await response.json();
            return data.success ? { success: true, ...data.data } : { success: false, message: data.message };
        } catch (error) {
            console.error('Error generando mapa mental:', error);
            return { success: false, message: 'Error de conexión' };
        }
    }

    async generateConceptMap(subject, topic, concepts = []) {
        if (!this.auth.isAuthenticated()) {
            throw new Error('No autenticado');
        }

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CONCEPTMAP}`, {
                method: 'POST',
                headers: this.auth.getHeaders(),
                body: JSON.stringify({ subject, topic, concepts })
            });

            const data = await response.json();
            return data.success ? { success: true, ...data.data } : { success: false, message: data.message };
        } catch (error) {
            console.error('Error generando mapa conceptual:', error);
            return { success: false, message: 'Error de conexión' };
        }
    }

    async generateImagePrompt(subject, concept, style = 'illustration') {
        if (!this.auth.isAuthenticated()) {
            throw new Error('No autenticado');
        }

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.IMAGE_PROMPT}`, {
                method: 'POST',
                headers: this.auth.getHeaders(),
                body: JSON.stringify({ subject, concept, style })
            });

            const data = await response.json();
            return data.success ? { success: true, ...data.data } : { success: false, message: data.message };
        } catch (error) {
            console.error('Error generando prompt de imagen:', error);
            return { success: false, message: 'Error de conexión' };
        }
    }

    async generateVideoScript(subject, topic, duration = 3, audience = 'secundaria') {
        if (!this.auth.isAuthenticated()) {
            throw new Error('No autenticado');
        }

        try {
            const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.VIDEO_SCRIPT}`, {
                method: 'POST',
                headers: this.auth.getHeaders(),
                body: JSON.stringify({ subject, topic, duration, audience })
            });

            const data = await response.json();
            return data.success ? { success: true, ...data.data } : { success: false, message: data.message };
        } catch (error) {
            console.error('Error generando guion de video:', error);
            return { success: false, message: 'Error de conexión' };
        }
    }
}

// Exportar instancias
const authManager = new AuthManager();
const aiClient = new AIClient(authManager);
const toolsClient = new ToolsClient(authManager);
