const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Login / Registro de estudiantes
router.post('/login', async (req, res) => {
    try {
        const { dni, name, password } = req.body;

        if (!dni) {
            return res.status(400).json({ error: 'DNI es requerido' });
        }

        const dniUpper = dni.toUpperCase().trim();

        // Buscar usuario existente
        let user = db.prepare('SELECT * FROM users WHERE dni = ?').get(dniUpper);

        if (user) {
            // Usuario existe
            if (user.role === 'admin') {
                // Admin necesita contraseña
                if (!password) {
                    return res.status(400).json({ error: 'Contraseña requerida para administrador' });
                }
                
                const validPassword = await bcrypt.compare(password, user.password_hash);
                if (!validPassword) {
                    return res.status(401).json({ error: 'Contraseña incorrecta' });
                }
            }
            // Estudiante no necesita contraseña, solo DNI
        } else {
            // Nuevo estudiante - crear cuenta
            if (!name || name.trim().length < 3) {
                return res.status(400).json({ error: 'Nombre debe tener al menos 3 caracteres' });
            }

            // Validar formato DNI para estudiantes
            if (!/^[0-9]{8}[A-Za-z]$/.test(dniUpper)) {
                return res.status(400).json({ error: 'Formato de DNI inválido (8 números + 1 letra)' });
            }

            const result = db.prepare(
                'INSERT INTO users (dni, name, role) VALUES (?, ?, ?)'
            ).run(dniUpper, name.trim(), 'student');

            user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
        }

        // Generar token
        const token = generateToken(user.id, user.role);

        res.json({
            token,
            user: {
                id: user.id,
                dni: user.dni,
                name: user.name,
                role: user.role,
                avatar: user.avatar
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// Obtener perfil actual
router.get('/me', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

// Actualizar avatar
router.put('/avatar', authenticateToken, (req, res) => {
    try {
        const { avatar } = req.body;
        
        if (!avatar) {
            return res.status(400).json({ error: 'Avatar es requerido' });
        }

        // Limitar tamaño del avatar (base64)
        if (avatar.length > 500000) {
            return res.status(400).json({ error: 'Imagen demasiado grande (máx 500KB)' });
        }

        db.prepare('UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(avatar, req.user.id);

        res.json({ message: 'Avatar actualizado' });
    } catch (err) {
        console.error('Avatar update error:', err);
        res.status(500).json({ error: 'Error al actualizar avatar' });
    }
});

// Logout (opcional - para invalidar tokens en el futuro)
router.post('/logout', authenticateToken, (req, res) => {
    // En una implementación más robusta, aquí invalidaríamos el token
    res.json({ message: 'Sesión cerrada' });
});

module.exports = router;
