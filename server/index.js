require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { initDatabase, getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Demasiadas solicitudes, intenta de nuevo más tarde' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Demasiados intentos de login' }
});
app.use('/api/auth/login', authLimiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Initialize database and start server
async function startServer() {
    try {
        await initDatabase();
        
        // Make db available globally
        global.db = getDb();

        // Routes
        const authRoutes = require('./routes/auth');
        const examRoutes = require('./routes/exams');
        const resultsRoutes = require('./routes/results');
        const adminRoutes = require('./routes/admin');

        app.use('/api/auth', authRoutes);
        app.use('/api/exams', examRoutes);
        app.use('/api/results', resultsRoutes);
        app.use('/api/admin', adminRoutes);

        // SPA fallback
        app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });

        // Error handler
        app.use((err, req, res, next) => {
            console.error('Error:', err);
            res.status(500).json({ error: 'Error interno del servidor' });
        });

        app.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   🎓 BENOWU - Plataforma de Exámenes                 ║
║                                                       ║
║   ✅ Servidor iniciado en puerto ${PORT}                ║
║   🌐 http://localhost:${PORT}                          ║
║                                                       ║
║   👤 Admin: DNI "ADMIN" + contraseña                  ║
║   📚 Estudiantes: DNI + Nombre                        ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
            `);
        });
    } catch (err) {
        console.error('❌ Error al iniciar:', err);
        process.exit(1);
    }
}

startServer();
