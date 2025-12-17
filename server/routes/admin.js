const express = require('express');
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Middleware para todas las rutas admin
router.use(authenticateToken, requireAdmin);

// Estadísticas generales
router.get('/stats', (req, res) => {
    try {
        const stats = db.prepare(`
            SELECT 
                (SELECT COUNT(DISTINCT user_id) FROM exam_attempts WHERE status = 'completed') as total_students,
                (SELECT COUNT(*) FROM exam_attempts WHERE status = 'completed') as total_exams,
                (SELECT AVG(score) FROM exam_attempts WHERE status = 'completed') as avg_score,
                (SELECT COUNT(*) FROM exam_attempts WHERE status = 'completed' AND score >= 5) as passed_count
        `).get();

        const gradeDistribution = db.prepare(`
            SELECT 
                CASE 
                    WHEN score < 2 THEN '0-2'
                    WHEN score < 4 THEN '2-4'
                    WHEN score < 5 THEN '4-5'
                    WHEN score < 6 THEN '5-6'
                    WHEN score < 8 THEN '6-8'
                    ELSE '8-10'
                END as grade_range,
                COUNT(*) as count
            FROM exam_attempts
            WHERE status = 'completed'
            GROUP BY grade_range
            ORDER BY grade_range
        `).all();

        const examPerformance = db.prepare(`
            SELECT 
                e.id,
                e.title,
                e.icon,
                COUNT(ea.id) as attempts,
                AVG(ea.score) as avg_score
            FROM exams e
            LEFT JOIN exam_attempts ea ON e.id = ea.exam_id AND ea.status = 'completed'
            WHERE e.is_active = 1
            GROUP BY e.id
            ORDER BY e.title
        `).all();

        res.json({
            totalStudents: stats.total_students || 0,
            totalExams: stats.total_exams || 0,
            avgScore: stats.avg_score ? Math.round(stats.avg_score * 10) / 10 : 0,
            passRate: stats.total_exams > 0 
                ? Math.round((stats.passed_count / stats.total_exams) * 100) 
                : 0,
            gradeDistribution: {
                '0-2': 0, '2-4': 0, '4-5': 0, '5-6': 0, '6-8': 0, '8-10': 0,
                ...Object.fromEntries(gradeDistribution.map(g => [g.grade_range, g.count]))
            },
            examPerformance: examPerformance.map(e => ({
                ...e,
                avg_score: e.avg_score ? Math.round(e.avg_score * 10) / 10 : null
            }))
        });
    } catch (err) {
        console.error('Error fetching admin stats:', err);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// Todos los resultados
router.get('/results', (req, res) => {
    try {
        const results = db.prepare(`
            SELECT 
                ea.id,
                u.name,
                u.dni,
                e.title as exam_title,
                e.icon,
                ea.score,
                ea.correct_count,
                ea.incorrect_count,
                ea.unanswered_count,
                ea.time_spent,
                ea.finished_at,
                ea.student_note
            FROM exam_attempts ea
            JOIN users u ON ea.user_id = u.id
            JOIN exams e ON ea.exam_id = e.id
            WHERE ea.status = 'completed'
            ORDER BY ea.finished_at DESC
            LIMIT 500
        `).all();

        res.json({ 
            results: results.map(r => ({
                ...r,
                total: r.correct_count + r.incorrect_count + r.unanswered_count
            }))
        });
    } catch (err) {
        console.error('Error fetching results:', err);
        res.status(500).json({ error: 'Error al obtener resultados' });
    }
});

// Detalle de un resultado (admin puede ver cualquiera)
router.get('/results/:attemptId', (req, res) => {
    try {
        const attemptId = parseInt(req.params.attemptId);

        const attempt = db.prepare(`
            SELECT ea.*, e.title as exam_title, e.icon, u.name, u.dni
            FROM exam_attempts ea
            JOIN exams e ON ea.exam_id = e.id
            JOIN users u ON ea.user_id = u.id
            WHERE ea.id = ?
        `).get(attemptId);

        if (!attempt) {
            return res.status(404).json({ error: 'Resultado no encontrado' });
        }

        const questions = db.prepare(`
            SELECT q.*, a.selected_option, a.is_correct
            FROM questions q
            LEFT JOIN answers a ON a.question_id = q.id AND a.attempt_id = ?
            WHERE q.exam_id = ?
            ORDER BY q.order_num, q.id
        `).all(attemptId, attempt.exam_id);

        res.json({
            attempt: {
                id: attempt.id,
                userName: attempt.name,
                userDni: attempt.dni,
                examTitle: attempt.exam_title,
                icon: attempt.icon,
                score: attempt.score,
                correct: attempt.correct_count,
                incorrect: attempt.incorrect_count,
                unanswered: attempt.unanswered_count,
                timeSpent: attempt.time_spent,
                finishedAt: attempt.finished_at
            },
            review: questions.map((q, idx) => ({
                number: idx + 1,
                text: q.question_text,
                options: [q.option_a, q.option_b, q.option_c, q.option_d],
                correctOption: q.correct_option,
                selectedOption: q.selected_option,
                isCorrect: q.is_correct === 1
            }))
        });
    } catch (err) {
        console.error('Error fetching result detail:', err);
        res.status(500).json({ error: 'Error al obtener detalle' });
    }
});

// Ranking
router.get('/ranking', (req, res) => {
    try {
        const ranking = db.prepare(`
            SELECT 
                u.id,
                u.name,
                u.dni,
                COUNT(ea.id) as exam_count,
                AVG(ea.score) as avg_score,
                SUM(CASE WHEN ea.score >= 5 THEN 1 ELSE 0 END) as passed_count
            FROM users u
            JOIN exam_attempts ea ON u.id = ea.user_id
            WHERE ea.status = 'completed' AND u.role = 'student'
            GROUP BY u.id
            ORDER BY avg_score DESC, passed_count DESC
            LIMIT 50
        `).all();

        res.json({
            ranking: ranking.map((r, idx) => ({
                position: idx + 1,
                name: r.name,
                dni: r.dni,
                examCount: r.exam_count,
                avgScore: Math.round(r.avg_score * 10) / 10,
                passedCount: r.passed_count
            }))
        });
    } catch (err) {
        console.error('Error fetching ranking:', err);
        res.status(500).json({ error: 'Error al obtener ranking' });
    }
});

// Listar exámenes (gestión)
router.get('/exams', (req, res) => {
    try {
        const exams = db.prepare(`
            SELECT e.*, 
                   (SELECT COUNT(*) FROM questions WHERE exam_id = e.id) as question_count,
                   (SELECT COUNT(*) FROM exam_attempts WHERE exam_id = e.id AND status = 'completed') as attempt_count
            FROM exams e
            ORDER BY e.created_at DESC
        `).all();

        res.json({ exams });
    } catch (err) {
        console.error('Error fetching exams:', err);
        res.status(500).json({ error: 'Error al obtener exámenes' });
    }
});

// Crear examen
router.post('/exams', (req, res) => {
    try {
        const { 
            title, icon, description, timeLimit, pointsCorrect, pointsIncorrect,
            maxAttempts, deadline, shuffleQuestions, questions 
        } = req.body;

        if (!title || !questions || questions.length === 0) {
            return res.status(400).json({ error: 'Título y preguntas son requeridos' });
        }

        const result = db.prepare(`
            INSERT INTO exams (
                title, icon, description, time_limit, points_correct, points_incorrect,
                max_attempts, deadline, shuffle_questions, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            title,
            icon || '📝',
            description || '',
            timeLimit || 1800,
            pointsCorrect || 1,
            pointsIncorrect || 0,
            maxAttempts || 2,
            deadline || null,
            shuffleQuestions ? 1 : 0,
            req.user.id
        );

        const examId = result.lastInsertRowid;

        // Insertar preguntas
        const insertQuestion = db.prepare(`
            INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, order_num)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        questions.forEach((q, idx) => {
            insertQuestion.run(
                examId,
                q.text || q.t,
                q.options?.[0] || q.o?.[0],
                q.options?.[1] || q.o?.[1],
                q.options?.[2] || q.o?.[2],
                q.options?.[3] || q.o?.[3],
                q.correctOption ?? q.c ?? 0,
                idx
            );
        });

        res.json({ 
            message: 'Examen creado correctamente',
            examId 
        });
    } catch (err) {
        console.error('Error creating exam:', err);
        res.status(500).json({ error: 'Error al crear examen' });
    }
});

// Actualizar examen
router.put('/exams/:id', (req, res) => {
    try {
        const examId = parseInt(req.params.id);
        const { 
            title, icon, description, timeLimit, pointsCorrect, pointsIncorrect,
            maxAttempts, deadline, shuffleQuestions, isActive, questions 
        } = req.body;

        // Verificar que existe
        const exam = db.prepare('SELECT id FROM exams WHERE id = ?').get(examId);
        if (!exam) {
            return res.status(404).json({ error: 'Examen no encontrado' });
        }

        db.prepare(`
            UPDATE exams SET
                title = COALESCE(?, title),
                icon = COALESCE(?, icon),
                description = COALESCE(?, description),
                time_limit = COALESCE(?, time_limit),
                points_correct = COALESCE(?, points_correct),
                points_incorrect = COALESCE(?, points_incorrect),
                max_attempts = COALESCE(?, max_attempts),
                deadline = ?,
                shuffle_questions = COALESCE(?, shuffle_questions),
                is_active = COALESCE(?, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            title, icon, description, timeLimit, pointsCorrect, pointsIncorrect,
            maxAttempts, deadline, shuffleQuestions, isActive, examId
        );

        // Si se proporcionan preguntas, reemplazarlas
        if (questions && questions.length > 0) {
            db.prepare('DELETE FROM questions WHERE exam_id = ?').run(examId);

            const insertQuestion = db.prepare(`
                INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, order_num)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);

            questions.forEach((q, idx) => {
                insertQuestion.run(
                    examId,
                    q.text || q.t,
                    q.options?.[0] || q.o?.[0],
                    q.options?.[1] || q.o?.[1],
                    q.options?.[2] || q.o?.[2],
                    q.options?.[3] || q.o?.[3],
                    q.correctOption ?? q.c ?? 0,
                    idx
                );
            });
        }

        res.json({ message: 'Examen actualizado correctamente' });
    } catch (err) {
        console.error('Error updating exam:', err);
        res.status(500).json({ error: 'Error al actualizar examen' });
    }
});

// Eliminar examen
router.delete('/exams/:id', (req, res) => {
    try {
        const examId = parseInt(req.params.id);

        // Verificar si tiene intentos
        const attempts = db.prepare(
            'SELECT COUNT(*) as count FROM exam_attempts WHERE exam_id = ?'
        ).get(examId);

        if (attempts.count > 0) {
            // Desactivar en lugar de eliminar
            db.prepare('UPDATE exams SET is_active = 0 WHERE id = ?').run(examId);
            return res.json({ message: 'Examen desactivado (tiene resultados asociados)' });
        }

        // Eliminar preguntas y examen
        db.prepare('DELETE FROM questions WHERE exam_id = ?').run(examId);
        db.prepare('DELETE FROM exams WHERE id = ?').run(examId);

        res.json({ message: 'Examen eliminado correctamente' });
    } catch (err) {
        console.error('Error deleting exam:', err);
        res.status(500).json({ error: 'Error al eliminar examen' });
    }
});

// Obtener preguntas de un examen
router.get('/exams/:id/questions', (req, res) => {
    try {
        const examId = parseInt(req.params.id);

        const questions = db.prepare(`
            SELECT id, question_text, option_a, option_b, option_c, option_d, 
                   correct_option, explanation, order_num
            FROM questions
            WHERE exam_id = ?
            ORDER BY order_num, id
        `).all(examId);

        res.json({
            questions: questions.map(q => ({
                id: q.id,
                text: q.question_text,
                options: [q.option_a, q.option_b, q.option_c, q.option_d],
                correctOption: q.correct_option,
                explanation: q.explanation,
                order: q.order_num
            }))
        });
    } catch (err) {
        console.error('Error fetching questions:', err);
        res.status(500).json({ error: 'Error al obtener preguntas' });
    }
});

// Exportar resultados a CSV
router.get('/export/results', (req, res) => {
    try {
        const results = db.prepare(`
            SELECT 
                u.name as "Nombre",
                u.dni as "DNI",
                e.title as "Examen",
                ea.score as "Nota",
                ea.correct_count as "Aciertos",
                ea.incorrect_count as "Errores",
                ea.unanswered_count as "Sin contestar",
                ea.time_spent as "Tiempo (seg)",
                ea.finished_at as "Fecha"
            FROM exam_attempts ea
            JOIN users u ON ea.user_id = u.id
            JOIN exams e ON ea.exam_id = e.id
            WHERE ea.status = 'completed'
            ORDER BY ea.finished_at DESC
        `).all();

        // Generar CSV
        const headers = Object.keys(results[0] || {});
        const csv = [
            headers.join(','),
            ...results.map(r => headers.map(h => `"${r[h] || ''}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=resultados-benowu.csv');
        res.send(csv);
    } catch (err) {
        console.error('Error exporting results:', err);
        res.status(500).json({ error: 'Error al exportar resultados' });
    }
});

// Listar usuarios
router.get('/users', (req, res) => {
    try {
        const users = db.prepare(`
            SELECT 
                u.id, u.dni, u.name, u.role, u.created_at,
                COUNT(ea.id) as exam_count,
                AVG(CASE WHEN ea.status = 'completed' THEN ea.score END) as avg_score
            FROM users u
            LEFT JOIN exam_attempts ea ON u.id = ea.user_id
            GROUP BY u.id
            ORDER BY u.created_at DESC
        `).all();

        res.json({ users });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
});

module.exports = router;
