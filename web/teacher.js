/**
 * Panel docente — IA Educativa
 * ==================================================================
 * Consume EXCLUSIVAMENTE los endpoints /api/teacher/*. No genera ni
 * inventa datos: si el backend responde "datos insuficientes", la
 * interfaz lo muestra como tal y no dibuja gráficas vacías.
 *
 * SEGURIDAD
 *  - La autorización real vive en el backend. Aquí solo se gestiona la
 *    experiencia (redirecciones y ocultación de vistas).
 *  - Todo texto procedente de la BD se inserta con textContent o pasa
 *    por escapeHtml antes de llegar a innerHTML.
 */
'use strict';

(function () {
    // ------------------------------------------------------------------
    // Estado
    // ------------------------------------------------------------------
    const State = {
        groups: [],
        current: null,          // { groupId, subjectCode, subjectName, ... }
        stats: null,
        students: [],
        profile: null,
        period: 30,
        lastFocus: null
    };

    // ------------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------------
    function $(id) { return document.getElementById(id); }

    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /** Porcentaje entero a partir de una proporción 0..1. */
    function pct(valor) {
        if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return null;
        return Math.round(Number(valor) * 100);
    }

    function pctLabel(valor) {
        const p = pct(valor);
        return p === null ? '—' : p + '%';
    }

    /** Fecha corta legible en español. */
    function fechaCorta(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function fechaHora(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleString('es-CO', {
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
        });
    }

    /** "Hace 3 días" para la última actividad. */
    function tiempoRelativo(iso) {
        if (!iso) return 'Sin actividad';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return 'Sin actividad';
        const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
        if (dias <= 0) return 'Hoy';
        if (dias === 1) return 'Ayer';
        if (dias < 7) return `Hace ${dias} días`;
        if (dias < 30) return `Hace ${Math.floor(dias / 7)} semana(s)`;
        return `Hace ${Math.floor(dias / 30)} mes(es)`;
    }

    const ETIQUETAS_ESTADO = {
        refuerzo: 'Necesita refuerzo',
        favorable: 'Progreso favorable',
        en_progreso: 'En progreso',
        sin_evaluacion: 'Sin evaluación',
        insuficiente: 'Datos insuficientes'
    };

    const ETIQUETAS_ERROR = {
        conceptual: 'Error conceptual',
        procedural: 'Error de procedimiento',
        careless: 'Descuido',
        incomplete: 'Respuesta incompleta',
        not_understood: 'No comprendió el concepto'
    };

    // ------------------------------------------------------------------
    // Estados de la vista
    // ------------------------------------------------------------------
    function mostrarEstado(cual) {
        ['loadingState', 'errorState', 'emptyState', 'panelContent'].forEach(id => {
            const el = $(id);
            if (el) el.classList.toggle('hidden', id !== cual);
        });
    }

    function mostrarMensajeGlobal(texto, tipo) {
        const el = $('globalMessage');
        if (!el) return;
        el.textContent = texto;
        el.className = 'alert ' + (tipo || 'info');
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 6000);
    }

    // ------------------------------------------------------------------
    // Carga inicial
    // ------------------------------------------------------------------
    async function init() {
        // Protección de ruta en el cliente (UX). El backend es la fuente de verdad.
        if (!authManager.isAuthenticated()) {
            window.location.href = 'login.html';
            return;
        }

        // getProfile() devuelve el objeto del usuario o null (no un envoltorio).
        const perfil = await authManager.getProfile();
        const usuario = authManager.getUser ? authManager.getUser() : null;
        const rol = (perfil && perfil.role) || (usuario && usuario.role);

        if (rol && rol !== 'teacher') {
            // Estudiante en una ruta de docente: se le devuelve a su chat.
            window.location.href = 'index.html';
            return;
        }

        const nombre = (perfil && perfil.full_name) ||
                       (usuario && usuario.fullName) || 'Docente';
        $('teacherName').textContent = nombre;

        $('logoutBtn').addEventListener('click', () => authManager.logout());
        $('retryBtn').addEventListener('click', () => cargarGrupos());
        $('groupIdSelect').addEventListener('change', onCambioGrupo);
        $('periodSelect').addEventListener('change', onCambioPeriodo);
        $('studentSearch').addEventListener('input', filtrarEstudiantes);
        $('drawerClose').addEventListener('click', cerrarDrawer);
        $('drawerBackdrop').addEventListener('click', cerrarDrawer);
        document.addEventListener('keydown', ev => {
            if (ev.key === 'Escape' && !$('studentDrawer').classList.contains('hidden')) {
                cerrarDrawer();
            }
        });

        await cargarGrupos();
    }

    async function cargarGrupos() {
        mostrarEstado('loadingState');
        const res = await authManager.getTeacherGroups();

        if (!res.success) {
            $('errorText').textContent = res.message || 'No se pudieron cargar tus grupos.';
            mostrarEstado('errorState');
            return;
        }

        State.groups = res.data.groups || [];

        if (State.groups.length === 0) {
            mostrarEstado('emptyState');
            return;
        }

        // Si solo hay un grupo, se selecciona automáticamente.
        renderSelectorGrupos();
        const primero = State.groups[0];
        await seleccionar(primero.groupId, primero.assignments[0].subjectCode);
    }

    function renderSelectorGrupos() {
        const select = $('groupIdSelect');
        const opciones = [];
        for (const g of State.groups) {
            for (const a of g.assignments) {
                opciones.push({
                    value: `${g.groupId}|${a.subjectCode}`,
                    label: `${a.subjectName} · Grado ${g.gradeLevel}.º · ${g.groupName}`
                });
            }
        }
        select.innerHTML = opciones.map(o =>
            `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`
        ).join('');
    }

    function onCambioGrupo(ev) {
        const [groupId, subjectCode] = ev.target.value.split('|');
        seleccionar(parseInt(groupId, 10), subjectCode);
    }

    function onCambioPeriodo(ev) {
        State.period = parseInt(ev.target.value, 10) || 30;
        if (State.current) {
            seleccionar(State.current.groupId, State.current.subjectCode);
        }
    }

    // ------------------------------------------------------------------
    // Carga del grupo seleccionado
    // ------------------------------------------------------------------
    async function seleccionar(groupId, subjectCode) {
        const grupo = State.groups.find(g => g.groupId === groupId);
        if (!grupo) return;
        const asignacion = grupo.assignments.find(a => a.subjectCode === subjectCode) || grupo.assignments[0];

        State.current = {
            groupId,
            subjectCode: asignacion.subjectCode,
            subjectName: asignacion.subjectName,
            groupName: grupo.groupName,
            gradeLevel: grupo.gradeLevel,
            studentCount: grupo.studentCount
        };

        // Encabezado académico
        $('subjectLabel').textContent = asignacion.subjectName;
        $('groupLabel').textContent = `Grado ${grupo.gradeLevel}.º · ${grupo.groupName}`;
        $('enrolledLabel').textContent = `${grupo.studentCount} estudiante(s) inscrito(s)`;

        const select = $('groupIdSelect');
        select.value = `${groupId}|${asignacion.subjectCode}`;

        mostrarEstado('loadingState');

        const [stats, students] = await Promise.all([
            authManager.getGroupStats(groupId, asignacion.subjectCode, State.period),
            authManager.getGroupStudents(groupId, asignacion.subjectCode)
        ]);

        if (!stats.success) {
            $('errorText').textContent = stats.message || 'No se pudieron cargar las estadísticas.';
            mostrarEstado('errorState');
            return;
        }

        State.stats = stats.data;
        State.students = students.success ? (students.data.students || []) : [];

        renderPanel();
        mostrarEstado('panelContent');
    }

    // ------------------------------------------------------------------
    // Render
    // ------------------------------------------------------------------
    function renderPanel() {
        const s = State.stats;

        // KPIs
        $('kpiEnrolled').textContent = s.enrolled;
        $('kpiActive').textContent = s.estudiantesActivos !== undefined ? s.estudiantesActivos : '—';

        const precision = pctLabel(s.tasaAcierto);
        $('kpiAccuracy').textContent = precision;
        $('kpiAccuracy').title = precision === '—'
            ? 'Sin turnos evaluados en el período'
            : `${s.aciertos} de ${s.evaluados} turnos evaluados`;

        const temasConEvidencia = (s.temas || []).filter(t => t.estado !== 'insuficiente').length;
        $('kpiTopics').textContent = temasConEvidencia;
        $('kpiTopicsNote').textContent = temasConEvidencia === 0
            ? 'Sin conceptos identificados aún'
            : `${(s.temas || []).length} tema(s) detectado(s)`;

        $('updatedLabel').textContent = s.generadoEn
            ? `Actualizado ${fechaHora(s.generadoEn)}`
            : 'Sin datos aún';

        // Datos insuficientes
        if (s.status !== 'ok') {
            $('insufficient').classList.remove('hidden');
            $('insufficientText').textContent =
                `Todavía no hay suficientes actividades para identificar una tendencia de aprendizaje ` +
                `(${s.eventos || 0} de ${s.minimoRequerido} interacciones mínimas en el período de ${s.periodDays} días).`;
        } else {
            $('insufficient').classList.add('hidden');
        }

        renderTemas('reinforceList', s.temasRefuerzo || [], 'No se detectan temas que requieran refuerzo con la evidencia actual.');
        renderTemas('favorableList', s.temasFavorables || [], 'Aún no hay temas con progreso favorable sostenido.');
        renderAlertas(s);
        renderEvolucion(s);
        renderErrores(s);
        renderEstudiantes();
    }

    function renderTemas(contenedorId, temas, mensajeVacio) {
        const cont = $(contenedorId);
        if (!temas || temas.length === 0) {
            cont.innerHTML = `<p class="empty-inline">${escapeHtml(mensajeVacio)}</p>`;
            return;
        }
        cont.innerHTML = temas.map(t => {
            const tasa = t.tasaAcierto === null ? 'sin turnos evaluados' : `${pctLabel(t.tasaAcierto)} de acierto`;
            const conf = t.confirmadas > 0
                ? `${t.confirmadas} comprobación(es) confirmada(s)`
                : `${t.hipotesis} evidencia(s) por confirmar`;
            return `
                <div class="topic ${escapeHtml(t.estado)}">
                    <div class="topic-main">
                        <p class="topic-name">${escapeHtml(t.topic)}</p>
                        <p class="topic-meta">
                            ${t.estudiantes} estudiante(s) · ${t.evidencias} evidencia(s) · ${escapeHtml(tasa)}
                        </p>
                        <p class="topic-meta">${escapeHtml(conf)}</p>
                    </div>
                    <span class="badge ${escapeHtml(t.estado)}">${escapeHtml(ETIQUETAS_ESTADO[t.estado] || t.estado)}</span>
                </div>`;
        }).join('');
    }

    function renderAlertas(s) {
        const cont = $('alertsList');
        const alertas = [];

        if (s.status !== 'ok') {
            cont.innerHTML = '<p class="empty-inline">Sin datos suficientes para generar alertas.</p>';
            return;
        }

        for (const t of (s.temasRefuerzo || []).slice(0, 3)) {
            alertas.push({
                clase: 'alta',
                icono: '⚠️',
                texto: `<strong>${escapeHtml(t.topic)}</strong>: ${t.estudiantes} estudiante(s) con dificultad sostenida ` +
                       `(tasa de acierto ${pctLabel(t.tasaAcierto)}). Conviene repasar el concepto en clase.`
            });
        }

        if (Number(s.estudiantesActivos) < Number(s.enrolled) * 0.5 && s.enrolled > 0) {
            alertas.push({
                clase: '',
                icono: '👥',
                texto: `Solo ${s.estudiantesActivos} de ${s.enrolled} estudiantes registraron actividad en el período. ` +
                       `Puede ser útil revisar el acceso a la plataforma.`
            });
        }

        const errores = s.erroresFrecuentes || [];
        if (errores.length > 0 && errores[0].total >= 3) {
            alertas.push({
                clase: 'info',
                icono: '🔎',
                texto: `El error más frecuente es «${escapeHtml(ETIQUETAS_ERROR[errores[0].errorType] || errores[0].errorType)}», ` +
                       `con ${errores[0].total} registro(s).`
            });
        }

        if (alertas.length === 0) {
            cont.innerHTML = '<p class="empty-inline">No hay alertas pedagógicas en este período.</p>';
            return;
        }

        cont.innerHTML = alertas.map(a => `
            <div class="alert-item ${escapeHtml(a.clase)}">
                <span class="alert-icon" aria-hidden="true">${a.icono}</span>
                <div>${a.texto}</div>
            </div>`).join('');
    }

    function renderEvolucion(s) {
        const area = $('chartArea');
        const puntos = (s.evolucion || []).filter(p => p.tasaAcierto !== null);

        if (s.status !== 'ok' || puntos.length < 2) {
            area.innerHTML = '<p class="empty-inline">Todavía no hay suficientes actividades para identificar una tendencia de aprendizaje.</p>';
            $('chartLegend').textContent = '';
            return;
        }

        // Gráfico de línea accesible: SVG + tabla de texto alternativo.
        const W = 600, H = 170, PAD = 26;
        const valores = puntos.map(p => p.tasaAcierto);
        const maxY = 1;
        const pasoX = puntos.length > 1 ? (W - PAD * 2) / (puntos.length - 1) : 0;

        const coords = puntos.map((p, i) => {
            const x = PAD + i * pasoX;
            const y = H - PAD - (p.tasaAcierto / maxY) * (H - PAD * 2);
            return { x, y, p };
        });

        const linea = coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
        const areaPath = `M ${coords[0].x} ${H - PAD} L ` +
            coords.map(c => `${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' L ') +
            ` L ${coords[coords.length - 1].x} ${H - PAD} Z`;

        const puntosSvg = coords.map(c =>
            `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="#63b3ed">` +
            `<title>${escapeHtml(c.p.dia)}: ${pctLabel(c.p.tasaAcierto)} de acierto (${c.p.eventos} interacciones)</title></circle>`
        ).join('');

        const guias = [0, 0.5, 1].map(v => {
            const y = H - PAD - v * (H - PAD * 2);
            return `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>` +
                   `<text x="4" y="${y + 3}" fill="#6e7d8f" font-size="9">${pct(v)}%</text>`;
        }).join('');

        area.innerHTML = `
            <svg viewBox="0 0 ${W} ${H}" role="img"
                 aria-label="Evolución de la tasa de acierto del grupo por día">
                ${guias}
                <path d="${areaPath}" fill="rgba(99,179,237,0.10)"/>
                <polyline points="${linea}" fill="none" stroke="#63b3ed" stroke-width="2"
                          stroke-linejoin="round" stroke-linecap="round"/>
                ${puntosSvg}
            </svg>`;

        const nEventos = valores.length;
        $('chartLegend').textContent =
            `${nEventos} día(s) con evaluaciones · Primera: ${fechaCorta(puntos[0].dia)} · ` +
            `Última: ${fechaCorta(puntos[puntos.length - 1].dia)} · ` +
            `Tasa de acierto = proporción de turnos evaluados correctos (no es una calificación).`;
    }

    function renderErrores(s) {
        const cont = $('errorsList');
        const errores = s.erroresFrecuentes || [];
        if (errores.length === 0) {
            cont.innerHTML = '<p class="empty-inline">Sin errores clasificados en el período.</p>';
            return;
        }
        cont.innerHTML = errores.map(e =>
            `<span class="tag"><strong>${escapeHtml(ETIQUETAS_ERROR[e.errorType] || e.errorType)}</strong> · ${e.total}</span>`
        ).join('');
    }

    // ------------------------------------------------------------------
    // Lista de estudiantes
    // ------------------------------------------------------------------
    function renderEstudiantes() {
        const tbody = $('studentsBody');
        const busqueda = ($('studentSearch').value || '').trim().toLowerCase();
        const lista = State.students.filter(est =>
            !busqueda ||
            String(est.fullName).toLowerCase().includes(busqueda) ||
            String(est.academicId).toLowerCase().includes(busqueda)
        );

        $('studentsEmpty').classList.toggle('hidden', State.students.length > 0);
        $('studentsSub').textContent = State.students.length > 0
            ? `${State.students.length} estudiante(s). Selecciona uno para ver su perfil académico.`
            : 'Selecciona un estudiante para ver su perfil académico.';

        if (lista.length === 0) {
            tbody.innerHTML = State.students.length === 0
                ? ''
                : `<tr><td colspan="6" class="table-empty">Ningún estudiante coincide con «${escapeHtml(busqueda)}».</td></tr>`;
            return;
        }

        tbody.innerHTML = lista.map(est => {
            const activo = !!est.lastActivity && (Date.now() - new Date(est.lastActivity).getTime()) < 7 * 86400000;
            const tasa = est.tasaAcierto === null
                ? '<span class="stat-none">Sin evaluaciones</span>'
                : `${pctLabel(est.tasaAcierto)}`;
            return `
                <tr>
                    <td>
                        <div class="student-name">${escapeHtml(est.fullName)}</div>
                        <div class="student-sub">${est.eventCount} interacción(es) registrada(s)</div>
                    </td>
                    <td>${escapeHtml(est.academicId)}</td>
                    <td>
                        <span class="activity-dot ${activo ? 'active' : ''}" aria-hidden="true"></span>
                        ${activo ? 'Activo' : (est.eventCount > 0 ? 'Inactivo' : 'Sin actividad')}
                    </td>
                    <td class="stat-cell">${tasa}</td>
                    <td class="stat-cell">${escapeHtml(tiempoRelativo(est.lastActivity))}</td>
                    <td>
                        <button class="link-btn" type="button"
                                data-student="${escapeHtml(est.id)}"
                                aria-label="Ver perfil académico de ${escapeHtml(est.fullName)}">
                            Ver perfil
                        </button>
                    </td>
                </tr>`;
        }).join('');

        tbody.querySelectorAll('button[data-student]').forEach(btn => {
            btn.addEventListener('click', () => abrirPerfil(btn.dataset.student, btn));
        });
    }

    function filtrarEstudiantes() {
        renderEstudiantes();
    }

    // ------------------------------------------------------------------
    // Drawer de perfil
    // ------------------------------------------------------------------
    async function abrirPerfil(studentId, disparador) {
        State.lastFocus = disparador || document.activeElement;
        const drawer = $('studentDrawer');
        const body = $('drawerBody');

        $('drawerBackdrop').classList.remove('hidden');
        drawer.classList.remove('hidden');
        drawer.focus();

        $('drawerTitle').textContent = 'Cargando…';
        $('drawerSub').textContent = '';
        body.innerHTML = '<div class="state-panel"><div class="spinner" aria-hidden="true"></div><p>Cargando perfil…</p></div>';

        const res = await authManager.getStudentProfile(
            State.current.groupId, studentId, State.current.subjectCode, 90
        );

        if (!res.success) {
            $('drawerTitle').textContent = 'No disponible';
            body.innerHTML = `<p class="empty-inline">${escapeHtml(res.message || 'No se pudo cargar el perfil.')}</p>`;
            return;
        }

        const p = res.data;
        State.profile = p;

        const nombre = p.student ? p.student.fullName : 'Estudiante';
        $('drawerTitle').textContent = nombre;
        $('drawerSub').textContent = p.student
            ? `${p.student.academicId} · ${State.current.subjectName} · últimos ${p.periodDays} días`
            : '';

        if (p.status !== 'ok') {
            body.innerHTML = `
                <div class="profile-section">
                    <h3>Resumen de aprendizaje</h3>
                    <p class="empty-inline">
                        Este estudiante tiene ${p.eventos || 0} interacción(es) registrada(s) en el período.
                        Se necesitan al menos ${p.minimoRequerido} para generar un perfil de aprendizaje fiable.
                    </p>
                    <div class="mini-stats">
                        <div class="mini-stat"><span>Interacciones</span><strong>${p.eventos || 0}</strong></div>
                        <div class="mini-stat"><span>Mínimo requerido</span><strong>${p.minimoRequerido}</strong></div>
                    </div>
                </div>`;
            return;
        }

        body.innerHTML = `
            <section class="profile-section">
                <h3>Resumen de aprendizaje</h3>
                <div class="mini-stats">
                    <div class="mini-stat"><span>Actividades</span><strong>${p.eventos}</strong></div>
                    <div class="mini-stat"><span>Temas trabajados</span><strong>${p.temasTrabajados}</strong></div>
                    <div class="mini-stat"><span>Tasa de acierto</span><strong>${pctLabel(p.tasaAcierto)}</strong></div>
                    <div class="mini-stat"><span>Última actividad</span><strong style="font-size:0.9rem">${escapeHtml(tiempoRelativo(p.ultimaActividad))}</strong></div>
                </div>
                <p class="card-sub" style="margin-top:10px">
                    ${p.aciertos} acierto(s) de ${p.evaluados} turno(s) evaluado(s) ·
                    ${p.sinAyuda} sin ayuda, ${p.conAyuda} con pistas ·
                    ${p.temasTrabajados} tema(s) distintos
                </p>
            </section>

            ${renderSeccionDificultades(p)}
            ${renderSeccionFortalezas(p)}
            ${renderSeccionRecomendaciones(p.recomendaciones || [])}
        `;
    }

    function renderSeccionDificultades(p) {
        if (!p.dificultades || p.dificultades.length === 0) {
            return `
                <section class="profile-section">
                    <h3>Dificultades específicas</h3>
                    <p class="empty-inline">No se detectan dificultades sostenidas con la evidencia actual.</p>
                </section>`;
        }
        const hallazgos = p.dificultades.map(d => `
            <div class="finding refuerzo">
                <p class="finding-title">${escapeHtml(d.topic)}</p>
                <p class="finding-text">
                    ${d.errores} respuesta(s) incorrecta(s) sobre ${d.evaluados} turno(s) evaluado(s)
                    (tasa de acierto ${pctLabel(d.tasaAcierto)}).
                </p>
                <p class="finding-meta">
                    ${d.evidencias} evidencia(s) · ${d.confirmadas > 0
                        ? d.confirmadas + ' comprobación(es) confirmada(s)'
                        : 'inferencia por confirmar en una nueva comprobación'}
                </p>
            </div>`).join('');

        // Señales de error concretas asociadas al tema
        const senales = (p.senalesDeError || []).filter(s => !s.hipotesis).slice(0, 4).map(s => `
            <div class="finding">
                <p class="finding-title">${escapeHtml(ETIQUETAS_ERROR[s.errorType] || s.errorType)}</p>
                <p class="finding-text">${escapeHtml(s.topic || 'Tema no clasificado')}</p>
                <p class="finding-meta">Registrado ${escapeHtml(fechaCorta(s.at))}</p>
            </div>`).join('');

        return `
            <section class="profile-section">
                <h3>Dificultades específicas</h3>
                ${hallazgos}
                ${senales}
            </section>`;
    }

    function renderSeccionFortalezas(p) {
        if (!p.fortalezas || p.fortalezas.length === 0) {
            return `
                <section class="profile-section">
                    <h3>Fortalezas y progreso</h3>
                    <p class="empty-inline">Aún no hay temas con evidencia suficiente de dominio.</p>
                </section>`;
        }
        return `
            <section class="profile-section">
                <h3>Fortalezas y progreso</h3>
                ${p.fortalezas.map(f => `
                    <div class="finding favorable">
                        <p class="finding-title">${escapeHtml(f.topic)}</p>
                        <p class="finding-text">
                            Tasa de acierto de ${pctLabel(f.tasaAcierto)} sobre ${f.evaluados} turno(s) evaluado(s).
                        </p>
                        <p class="finding-meta">${f.evidencias} evidencia(s) registrada(s)</p>
                    </div>`).join('')}
            </section>`;
    }

    function renderSeccionRecomendaciones(recs) {
        if (!recs || recs.length === 0) {
            return `
                <section class="profile-section">
                    <h3>Recomendaciones docentes</h3>
                    <p class="empty-inline">Sin recomendaciones por ahora.</p>
                </section>`;
        }
        return `
            <section class="profile-section">
                <h3>Recomendaciones docentes</h3>
                ${recs.map(r => `
                    <div class="rec prioridad-${escapeHtml(r.prioridad)}">
                        <p class="rec-title">${escapeHtml(r.titulo)}</p>
                        <p class="rec-detail">${escapeHtml(r.detalle)}</p>
                        <p class="rec-action">${escapeHtml(r.accionSugerida)}</p>
                    </div>`).join('')}
            </section>`;
    }

    function cerrarDrawer() {
        $('studentDrawer').classList.add('hidden');
        $('drawerBackdrop').classList.add('hidden');
        $('drawerBody').innerHTML = '';
        State.profile = null;
        if (State.lastFocus && typeof State.lastFocus.focus === 'function') {
            State.lastFocus.focus();
        }
    }

    // Arranque
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
