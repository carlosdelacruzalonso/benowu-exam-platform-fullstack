const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Obtener historial del usuario
router.get('/history', authenticateToken, (req, res) => {
    try {
        const results = db.prepare(`
            SELECT 
                ea.id,
                ea.exam_id,
                e.title as exam_title,
                e.icon,
                e.max_attempts,
                ea.score,
                ea.correct_count,
                ea.incorrect_count,
                ea.unanswered_count,
                ea.time_spent,
                ea.finished_at
            FROM exam_attempts ea
            JOIN exams e ON ea.exam_id = e.id
            WHERE ea.user_id = ? AND ea.status = 'completed'
            ORDER BY ea.finished_at DESC
        `).all(req.user.id);

        // Para cada resultado, verificar si puede ver respuestas
        const resultsWithMeta = results.map(r => {
            const allAttempts = db.prepare(`
                SELECT score FROM exam_attempts 
                WHERE user_id = ? AND exam_id = ? AND status = 'completed'
            `).all(req.user.id, r.exam_id);

            const passed = allAttempts.some(a => a.score >= 5);
            const canViewAnswers = passed || allAttempts.length >= r.max_attempts;

            return {
                ...r,
                passed: r.score >= 5,
                canViewAnswers,
                total: r.correct_count + r.incorrect_count + r.unanswered_count
            };
        });

        res.json({ results: resultsWithMeta });
    } catch (err) {
        console.error('Error fetching history:', err);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

// Obtener certificado
router.get('/certificate/:attemptId', authenticateToken, (req, res) => {
    try {
        const attemptId = parseInt(req.params.attemptId);

        const attempt = db.prepare(`
            SELECT ea.*, e.title as exam_title, u.name as user_name, u.dni
            FROM exam_attempts ea
            JOIN exams e ON ea.exam_id = e.id
            JOIN users u ON ea.user_id = u.id
            WHERE ea.id = ? AND ea.user_id = ? AND ea.status = 'completed'
        `).get(attemptId, req.user.id);

        if (!attempt) {
            return res.status(404).json({ error: 'Resultado no encontrado' });
        }

        if (attempt.score < 5) {
            return res.status(400).json({ error: 'Solo se emiten certificados para exámenes aprobados' });
        }

        // Generar ID único del certificado
        const certId = Buffer.from(`${attempt.dni}-${attempt.finished_at}-${attempt.id}`)
            .toString('base64')
            .slice(0, 12)
            .toUpperCase();

        res.json({
            certificate: {
                id: certId,
                userName: attempt.user_name,
                examTitle: attempt.exam_title,
                score: attempt.score,
                date: attempt.finished_at,
                dni: attempt.dni
            }
        });
    } catch (err) {
        console.error('Error generating certificate:', err);
        res.status(500).json({ error: 'Error al generar certificado' });
    }
});

// Obtener estadísticas personales
router.get('/stats', authenticateToken, (req, res) => {
    try {
        const stats = db.prepare(`
            SELECT 
                COUNT(*) as total_exams,
                AVG(score) as avg_score,
                SUM(CASE WHEN score >= 5 THEN 1 ELSE 0 END) as passed,
                SUM(correct_count) as total_correct,
                SUM(incorrect_count) as total_incorrect,
                SUM(time_spent) as total_time
            FROM exam_attempts
            WHERE user_id = ? AND status = 'completed'
        `).get(req.user.id);

        res.json({
            totalExams: stats.total_exams || 0,
            avgScore: stats.avg_score ? Math.round(stats.avg_score * 10) / 10 : 0,
            passedExams: stats.passed || 0,
            passRate: stats.total_exams > 0 ? Math.round((stats.passed / stats.total_exams) * 100) : 0,
            totalCorrect: stats.total_correct || 0,
            totalIncorrect: stats.total_incorrect || 0,
            totalTime: stats.total_time || 0
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

module.exports = router;
