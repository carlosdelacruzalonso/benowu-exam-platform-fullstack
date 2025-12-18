const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/benowu.db');
let db = null;

class DatabaseWrapper {
    constructor(sqlDb) {
        this.db = sqlDb;
    }

    prepare(sql) {
        const self = this;
        return {
            run(...params) {
                try {
                    self.db.run(sql, params);
                    const lastId = self.db.exec("SELECT last_insert_rowid()");
                    return {
                        lastInsertRowid: lastId[0]?.values[0]?.[0] || 0,
                        changes: self.db.getRowsModified()
                    };
                } catch (e) {
                    console.error('SQL Run Error:', sql, params, e.message);
                    throw e;
                }
            },
            get(...params) {
                try {
                    const stmt = self.db.prepare(sql);
                    stmt.bind(params);
                    if (stmt.step()) {
                        const cols = stmt.getColumnNames();
                        const vals = stmt.get();
                        stmt.free();
                        const result = {};
                        cols.forEach((col, i) => result[col] = vals[i]);
                        return result;
                    }
                    stmt.free();
                    return undefined;
                } catch (e) {
                    console.error('SQL Get Error:', sql, params, e.message);
                    throw e;
                }
            },
            all(...params) {
                try {
                    const stmt = self.db.prepare(sql);
                    stmt.bind(params);
                    const results = [];
                    while (stmt.step()) {
                        const cols = stmt.getColumnNames();
                        const vals = stmt.get();
                        const row = {};
                        cols.forEach((col, i) => row[col] = vals[i]);
                        results.push(row);
                    }
                    stmt.free();
                    return results;
                } catch (e) {
                    console.error('SQL All Error:', sql, params, e.message);
                    throw e;
                }
            }
        };
    }

    exec(sql) {
        try {
            this.db.run(sql);
        } catch (e) {
            console.error('SQL Exec Error:', e.message);
            throw e;
        }
    }

    save() {
        try {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            const dir = path.dirname(dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(dbPath, buffer);
            console.log('💾 Base de datos guardada');
        } catch (e) {
            console.error('Error saving database:', e.message);
        }
    }
}

async function initDatabase() {
    if (db) return db;

    console.log('🔧 Inicializando base de datos...');
    const SQL = await initSqlJs();
    
    let sqlDb;
    if (fs.existsSync(dbPath)) {
        console.log('📂 Cargando base de datos existente...');
        const buffer = fs.readFileSync(dbPath);
        sqlDb = new SQL.Database(buffer);
    } else {
        console.log('📂 Creando nueva base de datos...');
        sqlDb = new SQL.Database();
    }

    db = new DatabaseWrapper(sqlDb);

    // Create tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dni TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password_hash TEXT,
            avatar TEXT,
            role TEXT DEFAULT 'student',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            icon TEXT DEFAULT '📝',
            description TEXT,
            time_limit INTEGER NOT NULL DEFAULT 1800,
            points_correct REAL DEFAULT 1.0,
            points_incorrect REAL DEFAULT 0.0,
            max_attempts INTEGER DEFAULT 2,
            deadline TEXT,
            is_active INTEGER DEFAULT 1,
            shuffle_questions INTEGER DEFAULT 1,
            show_results INTEGER DEFAULT 1,
            created_by INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER NOT NULL,
            question_text TEXT NOT NULL,
            option_a TEXT NOT NULL,
            option_b TEXT NOT NULL,
            option_c TEXT NOT NULL,
            option_d TEXT NOT NULL,
            correct_option INTEGER NOT NULL,
            explanation TEXT,
            order_num INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS exam_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            exam_id INTEGER NOT NULL,
            started_at TEXT DEFAULT CURRENT_TIMESTAMP,
            finished_at TEXT,
            score REAL,
            correct_count INTEGER DEFAULT 0,
            incorrect_count INTEGER DEFAULT 0,
            unanswered_count INTEGER DEFAULT 0,
            time_spent INTEGER,
            status TEXT DEFAULT 'in_progress',
            question_order TEXT,
            student_note TEXT
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            attempt_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            selected_option INTEGER,
            is_correct INTEGER,
            answered_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create admin if not exists
    const bcrypt = require('bcryptjs');
    const existingAdmin = db.prepare('SELECT id FROM users WHERE dni = ?').get('ADMIN');
    
    if (!existingAdmin) {
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin_benowu25';
        const hashedPassword = bcrypt.hashSync(adminPassword, 10);
        db.prepare(`INSERT INTO users (dni, name, password_hash, role) VALUES (?, ?, ?, ?)`).run('ADMIN', 'Administrador', hashedPassword, 'admin');
        console.log('✅ Usuario admin creado');
    }

    // Create sample exams if none exist
    const examCount = db.prepare('SELECT COUNT(*) as count FROM exams').get();
    if (examCount.count === 0) {
        console.log('📝 Creando exámenes de ejemplo...');
        
        const exam1 = db.prepare(`INSERT INTO exams (title, icon, description, time_limit, points_correct, points_incorrect, max_attempts, deadline, shuffle_questions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Fotografía Básica', '📷', 'Conceptos fundamentales de fotografía', 1800, 1, 0, 2, '2026-01-15', 1, 1);

        const questions1 = [
            {t:"¿Qué es el triángulo de exposición?", o:["Un accesorio para estabilizar la cámara","La relación entre ISO, apertura y velocidad de obturación","Un tipo de composición fotográfica","El sensor de la cámara"], c:1},
            {t:"¿Qué controla la apertura del diafragma?", o:["El tiempo que el sensor está expuesto a la luz","La sensibilidad del sensor","La cantidad de luz que entra y la profundidad de campo","El enfoque automático"], c:2},
            {t:"Un número f/ bajo (ej: f/1.8) significa:", o:["Menor entrada de luz y mayor profundidad de campo","Mayor entrada de luz y menor profundidad de campo","Imagen más oscura","Mayor velocidad de obturación"], c:1},
            {t:"¿Qué es el ISO en fotografía?", o:["Un formato de archivo de imagen","La sensibilidad del sensor a la luz","El tamaño del sensor","La distancia focal del objetivo"], c:1},
            {t:"¿Qué sucede al aumentar mucho el ISO?", o:["La imagen se vuelve más nítida","Aparece más ruido/grano en la imagen","Los colores se saturan más","Se reduce la profundidad de campo"], c:1}
        ];

        questions1.forEach((q, idx) => {
            db.prepare(`INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, order_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(exam1.lastInsertRowid, q.t, q.o[0], q.o[1], q.o[2], q.o[3], q.c, idx);
        });

        console.log('✅ Exámenes de ejemplo creados');
    }

    db.save();
    
    // Auto-save every 30 seconds
    setInterval(() => {
        if (db) db.save();
    }, 30000);

    // Save on process exit
    process.on('SIGINT', () => {
        if (db) db.save();
        process.exit();
    });
    process.on('SIGTERM', () => {
        if (db) db.save();
        process.exit();
    });

    console.log('✅ Base de datos inicializada');
    return db;
}

function getDb() {
    return db;
}

// Proxy para acceso directo desde las rutas
const dbProxy = {
    prepare: (sql) => {
        if (!db) throw new Error('Database not initialized');
        return db.prepare(sql);
    },
    exec: (sql) => {
        if (!db) throw new Error('Database not initialized');
        return db.exec(sql);
    },
    save: () => {
        if (db) db.save();
    }
};

module.exports = { initDatabase, getDb, ...dbProxy };
