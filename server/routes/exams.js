const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Obtener todos los exámenes disponibles
router.get('/', authenticateToken, (req, res) => {
    try {
        const exams = db.prepare(`
            SELECT 
                e.id, e.title, e.icon, e.description, e.time_limit, 
                e.max_attempts, e.deadline, e.points_correct, e.points_incorrect,
                (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count
            FROM exams e
            WHERE e.is_active = 1
            ORDER BY e.created_at DESC
        `).all();

        // Para cada examen, obtener intentos del usuario
        const examsWithAttempts = exams.map(exam => {
            const attempts = db.prepare(`
                SELECT id, score, status, finished_at
                FROM exam_attempts
                WHERE user_id = ? AND exam_id = ? AND status = 'completed'
                ORDER BY finished_at DESC
            `).all(req.user.id, exam.id);

            const passed = attempts.some(a => a.score >= 5);
            const canRetake = !passed && attempts.length < exam.max_attempts;

            return {
                ...exam,
                attempts: attempts.length,
                bestScore: attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : null,
                passed,
                canRetake,
                canStart: attempts.length === 0 || canRetake
            };
        });

        res.json({ exams: examsWithAttempts });
    } catch (err) {
        console.error('Error fetching exams:', err);
        res.status(500).json({ error: 'Error al obtener exámenes' });
    }
});

// Iniciar un examen
router.post('/:id/start', authenticateToken, (req, res) => {
    try {
        const examId = parseInt(req.params.id);
        
        // Verificar que el examen existe
        const exam = db.prepare('SELECT * FROM exams WHERE id = ? AND is_active = 1').get(examId);
        if (!exam) {
            return res.status(404).json({ error: 'Examen no encontrado' });
        }

        // Verificar deadline
        if (exam.deadline && new Date(exam.deadline) < new Date()) {
            return res.status(400).json({ error: 'El plazo para este examen ha expirado' });
        }

        // Verificar intentos previos
        const completedAttempts = db.prepare(`
            SELECT COUNT(*) as count FROM exam_attempts 
            WHERE user_id = ? AND exam_id = ? AND status = 'completed'
        `).get(req.user.id, examId);

        const passed = db.prepare(`
            SELECT COUNT(*) as count FROM exam_attempts 
            WHERE user_id = ? AND exam_id = ? AND status = 'completed' AND score >= 5
        `).get(req.user.id, examId);

        if (passed.count > 0) {
            return res.status(400).json({ error: 'Ya has aprobado este examen' });
        }

        if (completedAttempts.count >= exam.max_attempts) {
            return res.status(400).json({ error: 'Has agotado todos los intentos para este examen' });
        }

        // Verificar si hay un intento en progreso
        const inProgress = db.prepare(`
            SELECT * FROM exam_attempts 
            WHERE user_id = ? AND exam_id = ? AND status = 'in_progress'
        `).get(req.user.id, examId);

        if (inProgress) {
            // Retomar examen en progreso
            const questions = db.prepare(`
                SELECT id, question_text, option_a, option_b, option_c, option_d
                FROM questions WHERE exam_id = ?
                ORDER BY order_num, id
            `).all(examId);

            // Obtener respuestas ya dadas
            const answers = db.prepare(`
                SELECT question_id, selected_option FROM answers WHERE attempt_id = ?
            `).all(inProgress.id);

            const answersMap = {};
            answers.forEach(a => { answersMap[a.question_id] = a.selected_option; });

            // Calcular tiempo restante
            const elapsed = Math.floor((Date.now() - new Date(inProgress.started_at).getTime()) / 1000);
            const timeLeft = Math.max(0, exam.time_limit - elapsed);

            if (timeLeft <= 0) {
                // Tiempo expirado, finalizar automáticamente
                finalizeAttempt(inProgress.id, examId);
                return res.status(400).json({ error: 'El tiempo del examen ha expirado' });
            }

            // Aplicar orden aleatorio si existe
            let orderedQuestions = questions;
            if (inProgress.question_order) {
                const order = JSON.parse(inProgress.question_order);
                orderedQuestions = order.map(id => questions.find(q => q.id === id));
            }

            return res.json({
                attemptId: inProgress.id,
                exam: {
                    id: exam.id,
                    title: exam.title,
                    icon: exam.icon,
                    timeLimit: exam.time_limit,
                    pointsCorrect: exam.points_correct,
                    pointsIncorrect: exam.points_incorrect
                },
                questions: orderedQuestions.map(q => ({
                    id: q.id,
                    text: q.question_text,
                    options: [q.option_a, q.option_b, q.option_c, q.option_d]
                })),
                answers: answersMap,
                timeLeft,
                resumed: true
            });
        }

        // Crear nuevo intento
        const questions = db.prepare(`
            SELECT id, question_text, option_a, option_b, option_c, option_d
            FROM questions WHERE exam_id = ?
            ORDER BY order_num, id
        `).all(examId);

        if (questions.length === 0) {
            return res.status(400).json({ error: 'Este examen no tiene preguntas' });
        }

        // Mezclar preguntas si está habilitado
        let orderedQuestions = [...questions];
        let questionOrder = null;
        
        if (exam.shuffle_questions) {
            orderedQuestions = shuffleArray(questions);
            questionOrder = JSON.stringify(orderedQuestions.map(q => q.id));
        }

        const result = db.prepare(`
            INSERT INTO exam_attempts (user_id, exam_id, question_order, status)
            VALUES (?, ?, ?, 'in_progress')
        `).run(req.user.id, examId, questionOrder);

        res.json({
            attemptId: result.lastInsertRowid,
            exam: {
                id: exam.id,
                title: exam.title,
                icon: exam.icon,
                timeLimit: exam.time_limit,
                pointsCorrect: exam.points_correct,
                pointsIncorrect: exam.points_incorrect
            },
            questions: orderedQuestions.map(q => ({
                id: q.id,
                text: q.question_text,
                options: [q.option_a, q.option_b, q.option_c, q.option_d]
            })),
            answers: {},
            timeLeft: exam.time_limit,
            resumed: false
        });
    } catch (err) {
        console.error('Error starting exam:', err);
        res.status(500).json({ error: 'Error al iniciar examen' });
    }
});

// Guardar respuesta
router.post('/:id/answer', authenticateToken, (req, res) => {
    try {
        const { attemptId, questionId, selectedOption } = req.body;

        // Verificar que el intento pertenece al usuario y está en progreso
        const attempt = db.prepare(`
            SELECT ea.*, e.time_limit 
            FROM exam_attempts ea
            JOIN exams e ON ea.exam_id = e.id
            WHERE ea.id = ? AND ea.user_id = ? AND ea.status = 'in_progress'
        `).get(attemptId, req.user.id);

        if (!attempt) {
            return res.status(400).json({ error: 'Intento no válido o ya finalizado' });
        }

        // Verificar tiempo
        const elapsed = Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000);
        if (elapsed > attempt.time_limit) {
            finalizeAttempt(attemptId, attempt.exam_id);
            return res.status(400).json({ error: 'El tiempo ha expirado' });
        }

        // Guardar o actualizar respuesta
        const existing = db.prepare(
            'SELECT id FROM answers WHERE attempt_id = ? AND question_id = ?'
        ).get(attemptId, questionId);

        if (existing) {
            db.prepare(
                'UPDATE answers SET selected_option = ?, answered_at = CURRENT_TIMESTAMP WHERE id = ?'
            ).run(selectedOption, existing.id);
        } else {
            db.prepare(
                'INSERT INTO answers (attempt_id, question_id, selected_option) VALUES (?, ?, ?)'
            ).run(attemptId, questionId, selectedOption);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Error saving answer:', err);
        res.status(500).json({ error: 'Error al guardar respuesta' });
    }
});

// Finalizar examen
router.post('/:id/finish', authenticateToken, (req, res) => {
    try {
        const { attemptId, studentNote } = req.body;

        // Verificar que el intento pertenece al usuario
        const attempt = db.prepare(`
            SELECT ea.* FROM exam_attempts ea
            WHERE ea.id = ? AND ea.user_id = ? AND ea.status = 'in_progress'
        `).get(attemptId, req.user.id);

        if (!attempt) {
            return res.status(400).json({ error: 'Intento no válido o ya finalizado' });
        }

        const result = finalizeAttempt(attemptId, attempt.exam_id, studentNote);
        res.json(result);
    } catch (err) {
        console.error('Error finishing exam:', err);
        res.status(500).json({ error: 'Error al finalizar examen' });
    }
});

// Función para finalizar un intento
function finalizeAttempt(attemptId, examId, studentNote = null) {
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
    const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ?').all(examId);
    const answers = db.prepare('SELECT * FROM answers WHERE attempt_id = ?').all(attemptId);
    const attempt = db.prepare('SELECT * FROM exam_attempts WHERE id = ?').get(attemptId);

    let correct = 0, incorrect = 0, unanswered = 0;
    const answersMap = {};
    answers.forEach(a => { answersMap[a.question_id] = a.selected_option; });

    questions.forEach(q => {
        const userAnswer = answersMap[q.id];
        if (userAnswer === undefined || userAnswer === null) {
            unanswered++;
        } else if (userAnswer === q.correct_option) {
            correct++;
            db.prepare('UPDATE answers SET is_correct = 1 WHERE attempt_id = ? AND question_id = ?')
                .run(attemptId, q.id);
        } else {
            incorrect++;
            db.prepare('UPDATE answers SET is_correct = 0 WHERE attempt_id = ? AND question_id = ?')
                .run(attemptId, q.id);
        }
    });

    // Calcular puntuación
    const rawScore = (correct * exam.points_correct) - (incorrect * exam.points_incorrect);
    const maxScore = questions.length * exam.points_correct;
    const score = Math.max(0, Math.min(10, (rawScore / maxScore) * 10));

    // Calcular tiempo empleado
    const timeSpent = Math.floor((Date.now() - new Date(attempt.started_at).getTime()) / 1000);

    // Actualizar intento con nota del alumno
    db.prepare(`
        UPDATE exam_attempts 
        SET status = 'completed', 
            finished_at = CURRENT_TIMESTAMP,
            score = ?,
            correct_count = ?,
            incorrect_count = ?,
            unanswered_count = ?,
            time_spent = ?,
            student_note = ?
        WHERE id = ?
    `).run(score, correct, incorrect, unanswered, timeSpent, studentNote, attemptId);

    return {
        score: Math.round(score * 10) / 10,
        correct,
        incorrect,
        unanswered,
        total: questions.length,
        passed: score >= 5,
        timeSpent
    };
}

// Obtener resultado de un intento
router.get('/attempt/:attemptId', authenticateToken, (req, res) => {
    try {
        const attemptId = parseInt(req.params.attemptId);

        const attempt = db.prepare(`
            SELECT ea.*, e.title as exam_title, e.icon, e.max_attempts,
                   e.points_correct, e.points_incorrect
            FROM exam_attempts ea
            JOIN exams e ON ea.exam_id = e.id
            WHERE ea.id = ? AND ea.user_id = ?
        `).get(attemptId, req.user.id);

        if (!attempt) {
            return res.status(404).json({ error: 'Intento no encontrado' });
        }

        // Verificar si puede ver las respuestas
        const allAttempts = db.prepare(`
            SELECT id, score FROM exam_attempts 
            WHERE user_id = ? AND exam_id = ? AND status = 'completed'
        `).all(req.user.id, attempt.exam_id);

        const passed = allAttempts.some(a => a.score >= 5);
        const canViewAnswers = passed || allAttempts.length >= attempt.max_attempts;

        let review = null;
        if (canViewAnswers) {
            const questions = db.prepare(`
                SELECT q.*, a.selected_option
                FROM questions q
                LEFT JOIN answers a ON a.question_id = q.id AND a.attempt_id = ?
                WHERE q.exam_id = ?
                ORDER BY q.order_num, q.id
            `).all(attemptId, attempt.exam_id);

            review = questions.map((q, idx) => ({
                number: idx + 1,
                text: q.question_text,
                options: [q.option_a, q.option_b, q.option_c, q.option_d],
                correctOption: q.correct_option,
                selectedOption: q.selected_option,
                isCorrect: q.selected_option === q.correct_option,
                explanation: q.explanation
            }));
        }

        res.json({
            attempt: {
                id: attempt.id,
                examTitle: attempt.exam_title,
                icon: attempt.icon,
                score: attempt.score,
                correct: attempt.correct_count,
                incorrect: attempt.incorrect_count,
                unanswered: attempt.unanswered_count,
                timeSpent: attempt.time_spent,
                finishedAt: attempt.finished_at,
                passed: attempt.score >= 5
            },
            canViewAnswers,
            attemptsUsed: allAttempts.length,
            maxAttempts: attempt.max_attempts,
            review
        });
    } catch (err) {
        console.error('Error fetching attempt:', err);
        res.status(500).json({ error: 'Error al obtener resultado' });
    }
});

// Función para mezclar array (Fisher-Yates)
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

module.exports = router;
