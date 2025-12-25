(function() {
    'use strict';

    const API = '/api';
    let token = localStorage.getItem('bnw_token');
    let user = JSON.parse(localStorage.getItem('bnw_user') || 'null');

    let S = {
        theme: localStorage.getItem('bnw_theme') || 'dark',
        examData: null,
        attemptId: null,
        qIdx: 0,
        answers: {},
        marked: [],
        timeLeft: 0,
        timer: null,
        questions: [],
        editingExamId: null,
        fiveMinWarningShown: false
    };

    const $ = id => document.getElementById(id);
    const screens = { login: $('loginScreen'), dash: $('dashboardScreen'), admin: $('adminScreen'), exam: $('examScreen'), results: $('resultsScreen'), hReview: $('historyReviewScreen') };

    // Audio context for notification sound
    let audioCtx = null;
    function playNotificationSound() {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            // Pleasant chime sound
            osc.frequency.setValueAtTime(880, audioCtx.currentTime);
            osc.frequency.setValueAtTime(660, audioCtx.currentTime + 0.15);
            osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.3);
            gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.6);
        } catch (e) { console.log('Audio not available'); }
    }

    function showTimeWarning() {
        const toast = document.createElement('div');
        toast.className = 'time-warning-toast';
        toast.innerHTML = '⚠️ ¡Quedan 5 minutos!';
        document.body.appendChild(toast);
        playNotificationSound();
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    async function api(endpoint, options = {}) {
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        try {
            const res = await fetch(API + endpoint, { ...options, headers });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401) { logout(); throw new Error('Sesión expirada'); }
                throw new Error(data.error || 'Error del servidor');
            }
            return data;
        } catch (err) {
            console.error('API Error:', err);
            throw err;
        }
    }

    function setTheme(t) {
        S.theme = t;
        $('app').dataset.theme = t;
        $('themeBtn').textContent = t === 'dark' ? '☀️' : '🌙';
        localStorage.setItem('bnw_theme', t);
    }

    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.add('hidden'));
        screens[name].classList.remove('hidden');
        window.scrollTo(0, 0);
    }

    function updateHeader() {
        if (user) {
            $('userMenu').classList.remove('hidden');
            $('headerName').textContent = user.name;
            $('headerAvatar').innerHTML = user.avatar ? `<img src="${user.avatar}">` : user.name.charAt(0).toUpperCase();
            $('adminBadge').classList.toggle('hidden', user.role !== 'admin');
        } else {
            $('userMenu').classList.add('hidden');
        }
    }

    async function handleLogin(e) {
        e.preventDefault();
        const name = $('nameInput').value.trim();
        const dni = $('dniInput').value.trim().toUpperCase();
        const password = $('passwordInput').value;

        $('nameGroup').classList.remove('error');
        $('dniGroup').classList.remove('error');
        $('passwordGroup').classList.remove('error');

        if (dni === 'ADMIN') {
            $('nameGroup').classList.add('hidden');
            $('passwordGroup').classList.remove('hidden');
            if (!password) return;
        }

        try {
            const data = await api('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ dni, name, password })
            });
            token = data.token;
            user = data.user;
            localStorage.setItem('bnw_token', token);
            localStorage.setItem('bnw_user', JSON.stringify(user));
            updateHeader();
            if (user.role === 'admin') {
                loadAdmin();
                showScreen('admin');
            } else {
                loadExams();
                showScreen('dash');
            }
        } catch (err) {
            if (err.message.includes('Contraseña')) $('passwordGroup').classList.add('error');
            else if (err.message.includes('DNI')) $('dniGroup').classList.add('error');
            else if (err.message.includes('Nombre')) $('nameGroup').classList.add('error');
            else showAlert('Error', err.message, 'error');
        }
    }

    function logout() {
        token = null;
        user = null;
        localStorage.removeItem('bnw_token');
        localStorage.removeItem('bnw_user');
        $('nameInput').value = '';
        $('dniInput').value = '';
        $('passwordInput').value = '';
        $('nameGroup').classList.remove('hidden');
        $('passwordGroup').classList.add('hidden');
        updateHeader();
        $('alertBanner').classList.add('hidden');
        showScreen('login');
    }

    async function loadExams() {
        try {
            const data = await api('/exams');
            renderExamGrid(data.exams);
            checkPendingExams(data.exams);
        } catch (err) {
            showAlert('Error', 'No se pudieron cargar los exámenes', 'error');
        }
    }

    function renderExamGrid(exams) {
        const grid = $('examGrid');
        if (!exams || exams.length === 0) {
            grid.innerHTML = `<div class="empty-state"><div class="icon">📚</div><h3>No hay exámenes disponibles</h3></div>`;
            return;
        }
        grid.innerHTML = exams.map(exam => {
            const deadlineStr = exam.deadline ? new Date(exam.deadline).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
            let statusHtml = '';
            if (exam.attempts > 0) {
                if (exam.passed) {
                    statusHtml = `<div class="exam-status passed">✓ Aprobado (${exam.bestScore.toFixed(1)})<span class="attempts-badge">${exam.attempts}/${exam.max_attempts}</span></div>`;
                } else if (!exam.canStart) {
                    statusHtml = `<div class="exam-status failed">✗ Suspenso (${exam.bestScore.toFixed(1)})<span class="attempts-badge">Agotados</span></div>`;
                } else {
                    statusHtml = `<div class="exam-status pending">⚠ Intento ${exam.attempts}/${exam.max_attempts}</div>`;
                }
            }
            return `
                <div class="exam-card ${!exam.canStart ? 'locked' : ''}" data-id="${exam.id}" data-can="${exam.canStart}">
                    <div class="exam-card-head">
                        <div class="exam-icon">${exam.icon || '📝'}</div>
                        <div><h3>${exam.title}</h3><p>${exam.question_count} preguntas · ${Math.floor(exam.time_limit/60)} min</p></div>
                    </div>
                    <div class="exam-card-meta">
                        ${deadlineStr ? `<span>📅 ${deadlineStr}</span>` : ''}
                        ${exam.points_incorrect > 0 ? `<span>⚠️ Penaliza</span>` : ''}
                    </div>
                    ${statusHtml}
                </div>
            `;
        }).join('');
        grid.querySelectorAll('.exam-card').forEach(c => {
            c.onclick = () => {
                if (c.dataset.can === 'true') startExam(parseInt(c.dataset.id));
                else showAlert('Bloqueado', 'Ya completaste este examen o agotaste tus intentos', 'warning');
            };
        });
    }

    function checkPendingExams(exams) {
        const pending = exams.filter(e => e.canStart && e.deadline && new Date(e.deadline) > new Date());
        if (pending.length > 0) {
            pending.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
            $('alertDeadline').textContent = new Date(pending[0].deadline).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
            $('alertBanner').classList.remove('hidden');
        } else {
            $('alertBanner').classList.add('hidden');
        }
    }

    async function loadHistory() {
        try {
            const data = await api('/results/history');
            renderHistory(data.results);
        } catch (err) {
            $('historyContent').innerHTML = `<div class="empty-state"><div class="icon">📋</div><h3>Error al cargar historial</h3></div>`;
        }
    }

    function renderHistory(results) {
        const cont = $('historyContent');
        if (!results || results.length === 0) {
            cont.innerHTML = `<div class="empty-state"><div class="icon">📋</div><h3>Sin exámenes</h3><p>Aquí aparecerán tus resultados</p></div>`;
            return;
        }
        cont.innerHTML = results.map(r => {
            const date = new Date(r.finished_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            const cls = r.score >= 9 ? 'excellent' : r.score >= 7 ? 'good' : r.score >= 5 ? 'regular' : 'poor';
            return `
                <div class="history-item" data-id="${r.id}">
                    <div class="history-score ${cls}">${r.score.toFixed(1)}</div>
                    <div class="history-info"><h4>${r.exam_title}</h4><p>${date} · ${r.correct_count}/${r.total}</p></div>
                    <div class="history-actions">
                        <button class="icon-btn view-btn" data-id="${r.id}" data-can="${r.canViewAnswers}">👁️</button>
                        ${r.passed ? `<button class="icon-btn cert-btn" data-id="${r.id}" style="background:linear-gradient(135deg,#f59e0b,#d97706);border:none;color:white">🏆</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        cont.querySelectorAll('.view-btn').forEach(b => b.onclick = e => { e.stopPropagation(); viewAttempt(parseInt(b.dataset.id), b.dataset.can === 'true'); });
        cont.querySelectorAll('.cert-btn').forEach(b => b.onclick = e => { e.stopPropagation(); showCertificate(parseInt(b.dataset.id)); });
    }

    async function viewAttempt(attemptId, canView) {
        try {
            const data = await api(`/exams/attempt/${attemptId}`);
            $('hReviewTitle').textContent = data.attempt.examTitle;
            $('hScoreVal').textContent = data.attempt.score.toFixed(1);
            const pct = Math.round((data.attempt.correct / (data.attempt.correct + data.attempt.incorrect + data.attempt.unanswered)) * 100);
            const cls = data.attempt.score >= 9 ? 'excellent' : data.attempt.score >= 7 ? 'good' : data.attempt.score >= 5 ? 'regular' : 'poor';
            const bar = $('hScoreBar');
            bar.className = 'score-bar-fill ' + cls;
            bar.style.width = '0%';
            setTimeout(() => bar.style.width = pct + '%', 100);

            if (data.canViewAnswers && data.review) {
                $('hReviewSection').innerHTML = `<h3>Revisión de respuestas</h3><div id="hReviewList"></div>`;
                renderReview($('hReviewList'), data.review);
            } else {
                $('hReviewSection').innerHTML = `<div class="review-locked"><div class="icon">🔒</div><h3>Respuestas bloqueadas</h3><p>Quedan ${data.maxAttempts - data.attemptsUsed} intentos. Verás las respuestas al aprobar o agotar intentos.</p></div>`;
            }

            const hCertBtn = $('hCertBtn');
            if (data.attempt.passed) {
                hCertBtn.classList.remove('hidden');
                hCertBtn.onclick = () => showCertificate(attemptId);
            } else {
                hCertBtn.classList.add('hidden');
            }

            showScreen('hReview');
        } catch (err) {
            showAlert('Error', err.message, 'error');
        }
    }

    function renderReview(cont, review) {
        const letters = ['A', 'B', 'C', 'D'];
        cont.innerHTML = review.map(q => {
            const skip = q.selectedOption === null || q.selectedOption === undefined;
            const clsItem = skip ? 'skip' : q.isCorrect ? 'correct' : 'incorrect';
            let ans = '';
            if (skip) {
                ans = `<p class="user-ans">— Sin contestar</p><p class="correct-ans">✓ ${letters[q.correctOption]}) ${q.options[q.correctOption]}</p>`;
            } else if (q.isCorrect) {
                ans = `<p class="user-ans is-correct">✓ ${letters[q.selectedOption]}) ${q.options[q.selectedOption]}</p>`;
            } else {
                ans = `<p class="user-ans">✗ ${letters[q.selectedOption]}) ${q.options[q.selectedOption]}</p><p class="correct-ans">✓ ${letters[q.correctOption]}) ${q.options[q.correctOption]}</p>`;
            }
            return `<div class="review-item ${clsItem}"><div class="review-item-head"><div class="review-item-num">${q.number}</div><div class="review-item-q">${q.text}</div></div><div class="review-answers">${ans}</div></div>`;
        }).join('');
    }

    async function startExam(examId) {
        try {
            const data = await api(`/exams/${examId}/start`, { method: 'POST' });
            S.examData = data.exam;
            S.attemptId = data.attemptId;
            S.questions = data.questions;
            S.answers = data.answers || {};
            S.timeLeft = data.timeLeft;
            S.qIdx = 0;
            S.marked = new Array(S.questions.length).fill(false);
            S.fiveMinWarningShown = false;

            $('examTitle').textContent = S.examData.title;
            renderGrid();
            renderQuestion();
            startTimer();
            showScreen('exam');
        } catch (err) {
            showAlert('Error', err.message, 'error');
        }
    }

    function renderQuestion() {
        const q = S.questions[S.qIdx];
        const total = S.questions.length;
        const answered = Object.keys(S.answers).length;

        $('qCounter').textContent = `Pregunta ${S.qIdx + 1} de ${total}`;
        $('aCounter').textContent = `${answered} respondidas`;
        $('progressFill').style.width = `${((S.qIdx + 1) / total) * 100}%`;
        $('qLabel').textContent = `Pregunta ${S.qIdx + 1}`;
        $('qText').textContent = q.text;

        const letters = ['A', 'B', 'C', 'D'];
        const currentAnswer = S.answers[q.id];
        $('optionsList').innerHTML = q.options.map((o, i) => `
            <div class="option ${currentAnswer === i ? 'selected' : ''}" data-idx="${i}">
                <span class="letter">${letters[i]}</span>
                <span class="text">${o}</span>
            </div>
        `).join('');

        $('optionsList').querySelectorAll('.option').forEach(o => {
            o.onclick = () => saveAnswer(q.id, parseInt(o.dataset.idx));
        });

        $('markToggle').classList.toggle('active', S.marked[S.qIdx]);
        $('prevBtn').disabled = S.qIdx === 0;

        if (S.qIdx === total - 1) {
            $('nextBtn').classList.add('hidden');
            $('finishBtn').classList.remove('hidden');
        } else {
            $('nextBtn').classList.remove('hidden');
            $('finishBtn').classList.add('hidden');
        }
        updateGrid();
    }

    async function saveAnswer(questionId, selectedOption) {
        S.answers[questionId] = selectedOption;
        renderQuestion();
        try {
            await api(`/exams/${S.examData.id}/answer`, {
                method: 'POST',
                body: JSON.stringify({ attemptId: S.attemptId, questionId, selectedOption })
            });
        } catch (err) {
            console.error('Error saving answer:', err);
        }
    }

    function renderGrid() {
        $('qGrid').innerHTML = S.questions.map((_, i) => `<div class="q-num" data-idx="${i}">${i + 1}</div>`).join('');
        $('qGrid').querySelectorAll('.q-num').forEach(n => {
            n.onclick = () => { S.qIdx = parseInt(n.dataset.idx); renderQuestion(); };
        });
    }

    function updateGrid() {
        $('qGrid').querySelectorAll('.q-num').forEach((n, i) => {
            n.classList.remove('current', 'answered', 'marked');
            const q = S.questions[i];
            if (i === S.qIdx) n.classList.add('current');
            else if (S.answers[q.id] !== undefined) n.classList.add('answered');
            if (S.marked[i]) n.classList.add('marked');
        });
    }

    function startTimer() {
        if (S.timer) clearInterval(S.timer);
        updateTimer();
        S.timer = setInterval(() => {
            S.timeLeft--;
            updateTimer();
            // 5 minute warning
            if (S.timeLeft === 300 && !S.fiveMinWarningShown) {
                S.fiveMinWarningShown = true;
                showTimeWarning();
            }
            if (S.timeLeft <= 0) { clearInterval(S.timer); showNoteModal(); }
        }, 1000);
    }

    function updateTimer() {
        const m = Math.floor(S.timeLeft / 60);
        const s = S.timeLeft % 60;
        const t = $('timer');
        t.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        t.classList.remove('warning', 'danger');
        if (S.timeLeft <= 60) t.classList.add('danger');
        else if (S.timeLeft <= 300) t.classList.add('warning');
    }

    function showConfirm() {
        const u = S.questions.length - Object.keys(S.answers).length;
        $('confirmMsg').textContent = u > 0 ? `Tienes ${u} pregunta${u > 1 ? 's' : ''} sin contestar.` : '¿Finalizar el examen?';
        $('confirmModal').classList.add('active');
    }

    function showNoteModal() {
        if (S.timer) clearInterval(S.timer);
        $('confirmModal').classList.remove('active');
        $('studentNoteInput').value = '';
        $('noteModal').classList.add('active');
    }

    async function finishExam(studentNote = null) {
        $('noteModal').classList.remove('active');

        try {
            const data = await api(`/exams/${S.examData.id}/finish`, {
                method: 'POST',
                body: JSON.stringify({ attemptId: S.attemptId, studentNote: studentNote || null })
            });

            $('resultsTitle').textContent = S.examData.title;
            $('scoreVal').textContent = data.score.toFixed(1);
            $('correctNum').textContent = data.correct;
            $('incorrectNum').textContent = data.incorrect;
            $('skipNum').textContent = data.unanswered;

            const pct = Math.round((data.correct / data.total) * 100);
            const cls = data.score >= 9 ? 'excellent' : data.score >= 7 ? 'good' : data.score >= 5 ? 'regular' : 'poor';
            const bar = $('scoreBar');
            bar.className = 'score-bar-fill ' + cls;
            bar.style.width = '0%';
            setTimeout(() => bar.style.width = pct + '%', 100);

            const passBadge = $('passBadge');
            passBadge.className = 'pass-badge ' + (data.passed ? 'passed' : 'failed');
            passBadge.innerHTML = data.passed ? '✓ APROBADO' : '✗ SUSPENSO';

            // Fetch attempt details for review
            const attemptData = await api(`/exams/attempt/${S.attemptId}`);
            if (attemptData.canViewAnswers && attemptData.review) {
                $('reviewSection').innerHTML = `<h3>Revisión de respuestas</h3><div id="reviewList"></div>`;
                renderReview($('reviewList'), attemptData.review);
            } else {
                $('reviewSection').innerHTML = `<div class="review-locked"><div class="icon">🔒</div><h3>Respuestas bloqueadas</h3><p>Podrás ver las respuestas al aprobar o agotar tus intentos.</p></div>`;
            }

            const certBtn = $('certBtn');
            if (data.passed) {
                certBtn.classList.remove('hidden');
                certBtn.onclick = () => showCertificate(S.attemptId);
                launchConfetti();
            } else {
                certBtn.classList.add('hidden');
            }

            showScreen('results');
        } catch (err) {
            showAlert('Error', err.message, 'error');
        }
    }

    function launchConfetti() {
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden';
        document.body.appendChild(container);
        const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6'];
        for (let i = 0; i < 100; i++) {
            const c = document.createElement('div');
            c.style.cssText = `position:absolute;width:10px;height:10px;left:${Math.random()*100}%;background:${colors[Math.floor(Math.random()*colors.length)]};border-radius:${Math.random()>.5?'50%':'0'};animation:confetti 3s linear forwards;animation-delay:${Math.random()*2}s`;
            container.appendChild(c);
        }
        const style = document.createElement('style');
        style.textContent = '@keyframes confetti{0%{transform:translateY(-100px) rotate(0);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}';
        document.head.appendChild(style);
        setTimeout(() => { container.remove(); style.remove(); }, 5000);
    }

    async function showCertificate(attemptId) {
        try {
            const data = await api(`/results/certificate/${attemptId}`);
            const cert = data.certificate;
            const date = new Date(cert.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
            $('certificateContent').innerHTML = `
                <div class="cert-border">
                    <div class="cert-corner tl"></div><div class="cert-corner tr"></div><div class="cert-corner bl"></div><div class="cert-corner br"></div>
                    <div class="cert-logo">Benowu</div>
                    <div class="cert-subtitle">Educación Online · Certificado de Aprovechamiento</div>
                    <div class="cert-title">Certificado de Finalización</div>
                    <div class="cert-text">Este documento certifica que</div>
                    <div class="cert-name">${cert.userName}</div>
                    <div class="cert-text">ha completado satisfactoriamente el curso</div>
                    <div class="cert-course">${cert.examTitle}</div>
                    <div class="cert-score">Calificación: ${cert.score.toFixed(1)} / 10</div>
                    <div class="cert-seal">⭐</div>
                    <div class="cert-footer">
                        <div class="cert-sig"><div class="cert-sig-line"></div><div class="cert-sig-name">Director Académico</div></div>
                        <div class="cert-sig"><div class="cert-sig-line"></div><div class="cert-sig-name">Benowu Academy</div></div>
                    </div>
                    <div class="cert-date">Expedido el ${date} · ID: ${cert.id}</div>
                </div>
            `;
            $('certModal').classList.add('active');
        } catch (err) {
            showAlert('Error', err.message, 'error');
        }
    }

    async function loadAdmin() {
        loadAdminStats();
    }

    async function loadAdminStats() {
        $('adminStatsTab').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const data = await api('/admin/stats');
            $('adminStatsTab').innerHTML = `
                <div class="stats-row">
                    <div class="stat-box"><div class="value">${data.totalStudents}</div><div class="label">Alumnos</div></div>
                    <div class="stat-box"><div class="value">${data.totalExams}</div><div class="label">Exámenes</div></div>
                    <div class="stat-box"><div class="value">${data.avgScore}</div><div class="label">Nota media</div></div>
                    <div class="stat-box"><div class="value">${data.passRate}%</div><div class="label">Aprobados</div></div>
                </div>
                <div class="chart-container">
                    <div class="chart-title">📊 Distribución de notas</div>
                    <div class="bar-chart" id="gradeChart"></div>
                </div>
            `;
            const grades = data.gradeDistribution;
            const maxGrade = Math.max(...Object.values(grades), 1);
            $('gradeChart').innerHTML = Object.entries(grades).map(([label, count]) => `
                <div class="bar-item">
                    <div class="bar" style="height: ${Math.max((count / maxGrade) * 160, 4)}px;" data-value="${count}"></div>
                    <div class="bar-label">${label}</div>
                </div>
            `).join('');
        } catch (err) {
            $('adminStatsTab').innerHTML = `<div class="empty-state"><h3>Error al cargar estadísticas</h3></div>`;
        }
    }

    async function loadAdminResults() {
        $('adminResultsTab').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const data = await api('/admin/results');
            if (!data.results || data.results.length === 0) {
                $('adminResultsTab').innerHTML = `<div class="empty-state"><div class="icon">📋</div><h3>Sin resultados</h3></div>`;
                return;
            }
            $('adminResultsTab').innerHTML = `
                <div class="data-table">
                    <div class="table-header"><span>Alumno</span><span>Examen</span><span>Nota</span><span>Aciertos</span><span>💬</span></div>
                    <div id="tableBody">${data.results.map(r => {
                        const cls = r.score >= 9 ? 'excellent' : r.score >= 7 ? 'good' : r.score >= 5 ? 'regular' : 'poor';
                        const hasNote = r.student_note && r.student_note.trim();
                        return `<div class="table-row clickable" data-id="${r.id}"><div><span class="name">${r.name}</span><br><span class="dni">${r.dni}</span></div><span class="exam">${r.exam_title}</span><span class="score ${cls}">${r.score.toFixed(1)}</span><span class="aciertos">${r.correct_count}/${r.total}</span><span class="note-indicator ${hasNote ? 'has-note' : ''}" data-note="${encodeURIComponent(r.student_note || '')}" title="${hasNote ? 'Ver nota' : 'Sin nota'}">${hasNote ? '💬' : '—'}</span></div>`;
                    }).join('')}</div>
                </div>
            `;
            document.querySelectorAll('.table-row.clickable').forEach(row => {
                row.onclick = e => {
                    if (!e.target.classList.contains('note-indicator')) {
                        viewAdminResult(parseInt(row.dataset.id));
                    }
                };
            });
            document.querySelectorAll('.note-indicator').forEach(n => {
                n.onclick = e => {
                    e.stopPropagation();
                    const note = decodeURIComponent(n.dataset.note);
                    if (note && note.trim()) {
                        $('viewNoteText').textContent = note;
                        $('viewNoteModal').classList.add('active');
                    }
                };
            });
        } catch (err) {
            $('adminResultsTab').innerHTML = `<div class="empty-state"><h3>Error al cargar resultados</h3></div>`;
        }
    }

    async function viewAdminResult(attemptId) {
        try {
            const data = await api(`/admin/results/${attemptId}`);
            $('hReviewTitle').textContent = `${data.attempt.userName} - ${data.attempt.examTitle}`;
            $('hScoreVal').textContent = data.attempt.score.toFixed(1);
            const pct = Math.round((data.attempt.correct / (data.attempt.correct + data.attempt.incorrect + data.attempt.unanswered)) * 100);
            const cls = data.attempt.score >= 9 ? 'excellent' : data.attempt.score >= 7 ? 'good' : data.attempt.score >= 5 ? 'regular' : 'poor';
            const bar = $('hScoreBar');
            bar.className = 'score-bar-fill ' + cls;
            bar.style.width = '0%';
            setTimeout(() => bar.style.width = pct + '%', 100);

            $('hReviewSection').innerHTML = `<h3>Revisión de respuestas</h3><div id="hReviewList"></div>`;
            renderReview($('hReviewList'), data.review);

            $('hCertBtn').classList.add('hidden');
            showScreen('hReview');
        } catch (err) {
            showAlert('Error', err.message, 'error');
        }
    }

    async function loadAdminRanking() {
        $('adminRankingTab').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const data = await api('/admin/ranking');
            if (!data.ranking || data.ranking.length === 0) {
                $('adminRankingTab').innerHTML = `<div class="empty-state"><div class="icon">🏆</div><h3>Sin datos de ranking</h3></div>`;
                return;
            }
            $('adminRankingTab').innerHTML = `<div class="ranking-list">${data.ranking.map(s => {
                const topClass = s.position === 1 ? 'top-1' : s.position === 2 ? 'top-2' : s.position === 3 ? 'top-3' : '';
                const medal = s.position === 1 ? '🥇' : s.position === 2 ? '🥈' : s.position === 3 ? '🥉' : '';
                return `<div class="ranking-item ${topClass}"><div class="ranking-pos">${s.position}</div><div class="ranking-info"><h4>${s.name}</h4><p>${s.examCount} exámenes · ${s.dni}</p></div><div class="ranking-score">${s.avgScore}</div>${medal ? `<div class="ranking-medal">${medal}</div>` : ''}</div>`;
            }).join('')}</div>`;
        } catch (err) {
            $('adminRankingTab').innerHTML = `<div class="empty-state"><h3>Error al cargar ranking</h3></div>`;
        }
    }

    async function loadAdminExams() {
        $('adminExamsTab').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const data = await api('/admin/exams');
            $('adminExamsTab').innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
                    <h3 style="color:var(--text-0)">Gestión de Exámenes</h3>
                    <button class="btn btn-primary" id="newExamBtn">+ Nuevo Examen</button>
                </div>
                <div class="exam-manager-grid">${data.exams.map(e => `
                    <div class="exam-manager-item">
                        <div class="exam-manager-icon">${e.icon || '📝'}</div>
                        <div class="exam-manager-info">
                            <h4>${e.title}</h4>
                            <p>${e.question_count} preguntas · ${Math.floor(e.time_limit/60)} min · ${e.attempt_count} intentos</p>
                        </div>
                        <div class="exam-manager-actions">
                            <button class="btn btn-sm btn-secondary edit-exam" data-id="${e.id}">✏️</button>
                            <button class="btn btn-sm btn-danger delete-exam" data-id="${e.id}">🗑️</button>
                        </div>
                    </div>
                `).join('')}</div>
            `;
            $('newExamBtn').onclick = () => openExamEditor(null);
            document.querySelectorAll('.edit-exam').forEach(b => b.onclick = () => openExamEditor(parseInt(b.dataset.id)));
            document.querySelectorAll('.delete-exam').forEach(b => b.onclick = () => deleteExam(parseInt(b.dataset.id)));
        } catch (err) {
            $('adminExamsTab').innerHTML = `<div class="empty-state"><h3>Error al cargar exámenes</h3></div>`;
        }
    }

    async function openExamEditor(examId) {
        S.editingExamId = examId;
        $('examEditTitle').textContent = examId ? 'Editar Examen' : 'Nuevo Examen';
        
        if (examId) {
            try {
                const exams = await api('/admin/exams');
                const exam = exams.exams.find(e => e.id === examId);
                const questions = await api(`/admin/exams/${examId}/questions`);
                
                $('editExamTitle').value = exam.title;
                $('editExamIcon').value = exam.icon || '📝';
                $('editExamTime').value = Math.floor(exam.time_limit / 60);
                $('editExamPoints').value = exam.points_correct;
                $('editExamPenalty').value = exam.points_incorrect;
                $('editExamDeadline').value = exam.deadline || '';
                $('editExamAttempts').value = exam.max_attempts;
                $('editExamQuestions').value = JSON.stringify(questions.questions, null, 2);
            } catch (err) {
                showAlert('Error', 'No se pudo cargar el examen', 'error');
                return;
            }
        } else {
            $('editExamTitle').value = '';
            $('editExamIcon').value = '📝';
            $('editExamTime').value = 30;
            $('editExamPoints').value = 1;
            $('editExamPenalty').value = 0;
            $('editExamDeadline').value = '';
            $('editExamAttempts').value = 2;
            $('editExamQuestions').value = '';
        }
        $('examEditModal').classList.add('active');
    }

    async function saveExam(e) {
        e.preventDefault();
        try {
            const questions = JSON.parse($('editExamQuestions').value);
            const examData = {
                title: $('editExamTitle').value,
                icon: $('editExamIcon').value,
                timeLimit: parseInt($('editExamTime').value) * 60,
                pointsCorrect: parseFloat($('editExamPoints').value),
                pointsIncorrect: parseFloat($('editExamPenalty').value),
                deadline: $('editExamDeadline').value || null,
                maxAttempts: parseInt($('editExamAttempts').value),
                questions
            };

            if (S.editingExamId) {
                await api(`/admin/exams/${S.editingExamId}`, { method: 'PUT', body: JSON.stringify(examData) });
            } else {
                await api('/admin/exams', { method: 'POST', body: JSON.stringify(examData) });
            }

            $('examEditModal').classList.remove('active');
            loadAdminExams();
            showAlert('Guardado', 'Examen guardado correctamente', 'success');
        } catch (err) {
            showAlert('Error', err.message || 'Error al guardar', 'error');
        }
    }

    async function deleteExam(examId) {
        if (!confirm('¿Eliminar este examen?')) return;
        try {
            await api(`/admin/exams/${examId}`, { method: 'DELETE' });
            loadAdminExams();
            showAlert('Eliminado', 'Examen eliminado', 'success');
        } catch (err) {
            showAlert('Error', err.message, 'error');
        }
    }

    function showAlert(title, msg, type = 'success') {
        $('alertModalTitle').textContent = title;
        $('alertModalMsg').textContent = msg;
        const icon = $('alertModalIcon');
        if (type === 'success') { icon.style.background = 'rgba(34, 197, 94, 0.15)'; icon.textContent = '✓'; }
        else if (type === 'error') { icon.style.background = 'rgba(239, 68, 68, 0.15)'; icon.textContent = '✗'; }
        else { icon.style.background = 'rgba(234, 179, 8, 0.15)'; icon.textContent = '⚠️'; }
        $('alertModal').classList.add('active');
    }

    function showProfile() {
        $('profileAvatar').innerHTML = user.avatar ? `<img src="${user.avatar}">` : user.name.charAt(0).toUpperCase();
        $('profileName').textContent = user.name;
        $('profileDNI').textContent = user.role === 'admin' ? 'Administrador' : `DNI: ${user.dni}`;
        $('profileModal').classList.add('active');
    }

    async function handleAvatar(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async ev => {
            try {
                await api('/auth/avatar', { method: 'PUT', body: JSON.stringify({ avatar: ev.target.result }) });
                user.avatar = ev.target.result;
                localStorage.setItem('bnw_user', JSON.stringify(user));
                updateHeader();
                showProfile();
            } catch (err) {
                showAlert('Error', err.message, 'error');
            }
        };
        reader.readAsDataURL(file);
    }

    function goHome() {
        if (user?.role === 'admin') { loadAdmin(); showScreen('admin'); }
        else { loadExams(); showScreen('dash'); }
    }

    function init() {
        setTheme(S.theme);
        $('themeBtn').onclick = () => setTheme(S.theme === 'dark' ? 'light' : 'dark');
        $('logoBtn').onclick = goHome;
        $('loginForm').onsubmit = handleLogin;
        $('logoutBtn').onclick = logout;
        $('profileBtn').onclick = showProfile;
        $('closeProfileBtn').onclick = () => $('profileModal').classList.remove('active');
        $('avatarEdit').onclick = () => $('avatarInput').click();
        $('avatarInput').onchange = handleAvatar;

        $('dniInput').oninput = () => {
            const dni = $('dniInput').value.toUpperCase();
            if (dni === 'ADMIN') {
                $('nameGroup').classList.add('hidden');
                $('passwordGroup').classList.remove('hidden');
            } else {
                $('nameGroup').classList.remove('hidden');
                $('passwordGroup').classList.add('hidden');
            }
        };

        document.querySelectorAll('.tab[data-tab]').forEach(t => {
            t.onclick = () => {
                document.querySelectorAll('.tab[data-tab]').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                $('examsTab').classList.add('hidden');
                $('historyTab').classList.add('hidden');
                if (t.dataset.tab === 'exams') { $('examsTab').classList.remove('hidden'); loadExams(); }
                else { $('historyTab').classList.remove('hidden'); loadHistory(); }
            };
        });

        document.querySelectorAll('.tab[data-admin-tab]').forEach(t => {
            t.onclick = () => {
                document.querySelectorAll('.tab[data-admin-tab]').forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                $('adminStatsTab').classList.add('hidden');
                $('adminResultsTab').classList.add('hidden');
                $('adminRankingTab').classList.add('hidden');
                $('adminExamsTab').classList.add('hidden');
                if (t.dataset.adminTab === 'stats') { $('adminStatsTab').classList.remove('hidden'); loadAdminStats(); }
                else if (t.dataset.adminTab === 'results') { $('adminResultsTab').classList.remove('hidden'); loadAdminResults(); }
                else if (t.dataset.adminTab === 'ranking') { $('adminRankingTab').classList.remove('hidden'); loadAdminRanking(); }
                else { $('adminExamsTab').classList.remove('hidden'); loadAdminExams(); }
            };
        });

        $('prevBtn').onclick = () => { if (S.qIdx > 0) { S.qIdx--; renderQuestion(); } };
        $('nextBtn').onclick = () => { if (S.qIdx < S.questions.length - 1) { S.qIdx++; renderQuestion(); } };
        $('finishBtn').onclick = showConfirm;
        $('markToggle').onclick = () => { S.marked[S.qIdx] = !S.marked[S.qIdx]; renderQuestion(); };

        $('cancelBtn').onclick = () => $('confirmModal').classList.remove('active');
        $('confirmBtn').onclick = showNoteModal;
        $('confirmModal').onclick = e => { if (e.target === $('confirmModal')) $('confirmModal').classList.remove('active'); };
        
        // Note modal handlers
        $('skipNoteBtn').onclick = () => finishExam(null);
        $('saveNoteBtn').onclick = () => finishExam($('studentNoteInput').value.trim());
        $('noteModal').onclick = e => { if (e.target === $('noteModal')) finishExam(null); };

        $('profileModal').onclick = e => { if (e.target === $('profileModal')) $('profileModal').classList.remove('active'); };
        $('certModal').onclick = e => { if (e.target === $('certModal')) $('certModal').classList.remove('active'); };
        $('closeCertBtn').onclick = () => $('certModal').classList.remove('active');
        $('printCertBtn').onclick = () => window.print();
        $('closeAlertBtn').onclick = () => $('alertModal').classList.remove('active');
        $('alertModal').onclick = e => { if (e.target === $('alertModal')) $('alertModal').classList.remove('active'); };
        
        $('closeViewNoteBtn').onclick = () => $('viewNoteModal').classList.remove('active');
        $('viewNoteModal').onclick = e => { if (e.target === $('viewNoteModal')) $('viewNoteModal').classList.remove('active'); };

        $('homeBtn').onclick = goHome;
        $('backBtn').onclick = goHome;

        $('examEditForm').onsubmit = saveExam;
        $('cancelExamBtn').onclick = () => $('examEditModal').classList.remove('active');
        $('examEditModal').onclick = e => { if (e.target === $('examEditModal')) $('examEditModal').classList.remove('active'); };

        document.onkeydown = e => {
            if (!screens.exam.classList.contains('hidden')) {
                if (e.key === 'ArrowLeft' && S.qIdx > 0) { S.qIdx--; renderQuestion(); }
                else if (e.key === 'ArrowRight' && S.qIdx < S.questions.length - 1) { S.qIdx++; renderQuestion(); }
                else if (e.key >= '1' && e.key <= '4') {
                    const q = S.questions[S.qIdx];
                    saveAnswer(q.id, parseInt(e.key) - 1);
                }
            }
        };

        // Legal modal handlers
        $('closeLegalBtn').onclick = () => $('legalModal').classList.remove('active');
        $('legalModal').onclick = e => { if (e.target === $('legalModal')) $('legalModal').classList.remove('active'); };

        // Check existing session
        if (token && user) {
            updateHeader();
            if (user.role === 'admin') { loadAdmin(); showScreen('admin'); }
            else { loadExams(); showScreen('dash'); }
        }
    }

    // Legal modal content
    window.showLegalModal = function(type) {
        const modal = $('legalModal');
        const title = $('legalModalTitle');
        const icon = $('legalModalIcon');
        const content = $('legalModalContent');

        const legalContent = {
            terms: {
                icon: '📜',
                title: 'Términos de Uso',
                content: `
                    <p><strong>1. Aceptación de los términos</strong></p>
                    <p>Al acceder y utilizar la plataforma Benowu, aceptas cumplir con estos términos de uso. Si no estás de acuerdo, no utilices la plataforma.</p>
                    
                    <p><strong>2. Uso de la plataforma</strong></p>
                    <p>La plataforma está diseñada exclusivamente para fines educativos. Los usuarios se comprometen a:</p>
                    <ul style="margin-left: 20px; margin-bottom: 12px;">
                        <li>Proporcionar información veraz al registrarse</li>
                        <li>No compartir credenciales de acceso</li>
                        <li>Realizar los exámenes de forma individual y honesta</li>
                        <li>No intentar acceder a contenido no autorizado</li>
                    </ul>
                    
                    <p><strong>3. Propiedad intelectual</strong></p>
                    <p>Todo el contenido de la plataforma (preguntas, diseño, código) es propiedad de Benowu Academy y está protegido por derechos de autor.</p>
                    
                    <p><strong>4. Limitación de responsabilidad</strong></p>
                    <p>Benowu no se hace responsable de problemas técnicos durante los exámenes. Se recomienda usar una conexión estable.</p>
                    
                    <p><strong>5. Modificaciones</strong></p>
                    <p>Nos reservamos el derecho de modificar estos términos en cualquier momento.</p>
                    
                    <p style="margin-top: 16px; color: var(--text-3); font-size: 12px;">Última actualización: Enero 2026</p>
                `
            },
            privacy: {
                icon: '🔒',
                title: 'Política de Privacidad',
                content: `
                    <p><strong>1. Datos que recopilamos</strong></p>
                    <p>Recopilamos los siguientes datos personales:</p>
                    <ul style="margin-left: 20px; margin-bottom: 12px;">
                        <li>Nombre completo</li>
                        <li>DNI/Código de acceso</li>
                        <li>Resultados de exámenes</li>
                        <li>Notas y comentarios enviados</li>
                    </ul>
                    
                    <p><strong>2. Uso de los datos</strong></p>
                    <p>Utilizamos tus datos únicamente para:</p>
                    <ul style="margin-left: 20px; margin-bottom: 12px;">
                        <li>Identificarte en la plataforma</li>
                        <li>Registrar tu progreso académico</li>
                        <li>Generar certificados de aprovechamiento</li>
                        <li>Mejorar nuestros servicios</li>
                    </ul>
                    
                    <p><strong>3. Protección de datos</strong></p>
                    <p>Implementamos medidas de seguridad como encriptación de contraseñas y tokens JWT para proteger tu información.</p>
                    
                    <p><strong>4. Retención de datos</strong></p>
                    <p>Conservamos tus datos mientras mantengas una cuenta activa. Puedes solicitar la eliminación contactando a soporte.</p>
                    
                    <p><strong>5. Tus derechos</strong></p>
                    <p>Tienes derecho a acceder, rectificar y eliminar tus datos personales según el RGPD.</p>
                    
                    <p style="margin-top: 16px; color: var(--text-3); font-size: 12px;">Última actualización: Enero 2026</p>
                `
            },
            support: {
                icon: '💬',
                title: 'Soporte',
                content: `
                    <p><strong>¿Necesitas ayuda?</strong></p>
                    <p>Estamos aquí para asistirte con cualquier problema o duda que tengas.</p>
                    
                    <p><strong>📧 Contacto por email</strong></p>
                    <p style="margin-bottom: 16px;">Envíanos un correo a: <a href="mailto:soporte@benowu.com" style="color: var(--accent);">soporte@benowu.com</a></p>
                    
                    <p><strong>❓ Preguntas frecuentes</strong></p>
                    
                    <p><em>¿Olvidé mi contraseña?</em></p>
                    <p style="margin-bottom: 12px;">Los estudiantes no necesitan contraseña, solo DNI y nombre. Si eres administrador, contacta con soporte.</p>
                    
                    <p><em>¿Puedo repetir un examen?</em></p>
                    <p style="margin-bottom: 12px;">Cada examen permite un máximo de 2 intentos. Una vez agotados, no podrás repetirlo.</p>
                    
                    <p><em>¿Dónde veo mis resultados?</em></p>
                    <p style="margin-bottom: 12px;">En la pestaña "Historial" de tu panel principal encontrarás todos tus exámenes realizados.</p>
                    
                    <p><em>¿Cómo descargo mi certificado?</em></p>
                    <p style="margin-bottom: 12px;">Si aprobaste un examen, verás el icono 🏆 junto al resultado. Haz clic para ver e imprimir tu certificado.</p>
                    
                    <p style="margin-top: 16px; color: var(--text-3); font-size: 12px;">Horario de atención: Lunes a Viernes, 9:00 - 18:00</p>
                `
            }
        };

        const data = legalContent[type];
        if (data) {
            icon.textContent = data.icon;
            title.textContent = data.title;
            content.innerHTML = data.content;
            modal.classList.add('active');
        }
    };

    init();
})();
