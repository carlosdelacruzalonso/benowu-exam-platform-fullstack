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
        console.log('📝 Creando exámenes...');
        
        // EXAMEN 1: Fotografía Básica
        const exam1 = db.prepare(`INSERT INTO exams (title, icon, description, time_limit, points_correct, points_incorrect, max_attempts, deadline, shuffle_questions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Fotografía Básica', '📷', 'Conceptos fundamentales de fotografía', 1800, 1, 0, 2, '2026-01-15', 1, 1);
        const q1 = [
            {t:"¿Qué es el triángulo de exposición?", o:["Un accesorio para estabilizar la cámara","La relación entre ISO, apertura y velocidad de obturación","Un tipo de composición fotográfica","El sensor de la cámara"], c:1},
            {t:"¿Qué controla la apertura del diafragma?", o:["El tiempo que el sensor está expuesto a la luz","La sensibilidad del sensor","La cantidad de luz que entra y la profundidad de campo","El enfoque automático"], c:2},
            {t:"Un número f/ bajo (ej: f/1.8) significa:", o:["Menor entrada de luz y mayor profundidad de campo","Mayor entrada de luz y menor profundidad de campo","Imagen más oscura","Mayor velocidad de obturación"], c:1},
            {t:"¿Qué es el ISO en fotografía?", o:["Un formato de archivo de imagen","La sensibilidad del sensor a la luz","El tamaño del sensor","La distancia focal del objetivo"], c:1},
            {t:"¿Qué sucede al aumentar mucho el ISO?", o:["La imagen se vuelve más nítida","Aparece más ruido/grano en la imagen","Los colores se saturan más","Se reduce la profundidad de campo"], c:1},
            {t:"La regla de los tercios consiste en:", o:["Usar siempre tres fuentes de luz","Dividir la imagen en 9 partes y situar elementos en las intersecciones","Fotografiar solo en formato 3:2","Usar tres colores principales"], c:1},
            {t:"¿Qué es la profundidad de campo?", o:["La distancia entre la cámara y el sujeto","La zona de la imagen que aparece enfocada","La cantidad de megapíxeles del sensor","El ángulo de visión del objetivo"], c:1},
            {t:"Una velocidad de obturación de 1/1000 es:", o:["Muy lenta, ideal para larga exposición","Muy rápida, ideal para congelar movimiento","Estándar para retratos","Solo útil en fotografía nocturna"], c:1},
            {t:"El balance de blancos sirve para:", o:["Aumentar el contraste de la imagen","Corregir la dominante de color según la luz","Enfocar correctamente","Reducir el ruido"], c:1},
            {t:"¿Qué tipo de objetivo tiene una distancia focal de 50mm?", o:["Gran angular","Teleobjetivo","Objetivo estándar/normal","Ojo de pez"], c:2}
        ];
        q1.forEach((q, idx) => {
            db.prepare(`INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, order_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(exam1.lastInsertRowid, q.t, q.o[0], q.o[1], q.o[2], q.o[3], q.c, idx);
        });

        // EXAMEN 2: Composición Fotográfica
        const exam2 = db.prepare(`INSERT INTO exams (title, icon, description, time_limit, points_correct, points_incorrect, max_attempts, deadline, shuffle_questions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Composición Fotográfica', '🎨', 'Técnicas de composición visual', 1500, 1, 0, 2, '2026-01-20', 1, 1);
        const q2 = [
            {t:"¿Qué es la regla de los tercios?", o:["Dividir la imagen en 3 partes iguales horizontales","Dividir la imagen en 9 partes con 4 puntos de interés","Usar 3 colores principales en la foto","Tomar 3 fotos del mismo sujeto"], c:1},
            {t:"¿Qué transmite una composición con líneas diagonales?", o:["Calma y estabilidad","Dinamismo y movimiento","Tristeza y melancolía","Confusión"], c:1},
            {t:"¿Qué es el espacio negativo en fotografía?", o:["Zonas sobreexpuestas de la imagen","Áreas vacías que rodean al sujeto principal","Partes desenfocadas del fondo","Errores de composición"], c:1},
            {t:"¿Qué es la proporción áurea?", o:["Un tipo de objetivo especial","Una proporción matemática (~1.618) usada en composición","El ratio de aspecto 16:9","La relación entre ISO y apertura"], c:1},
            {t:"¿Qué son las líneas guía en composición?", o:["Líneas de la cuadrícula de la cámara","Elementos que dirigen la mirada hacia el sujeto","Marcas para recortar la imagen","Líneas de horizonte"], c:1},
            {t:"¿Qué efecto produce un punto de vista bajo (contrapicado)?", o:["El sujeto parece más pequeño","El sujeto parece más grande e imponente","La imagen se ve más natural","Se reduce la profundidad"], c:1},
            {t:"¿Qué es el marco natural en fotografía?", o:["El borde físico de la foto impresa","Usar elementos de la escena para enmarcar al sujeto","Un tipo de filtro","El visor de la cámara"], c:1},
            {t:"¿Por qué se recomienda dejar espacio en la dirección de la mirada del sujeto?", o:["Para poder recortar después","Para dar sensación de movimiento y naturalidad","Porque lo exige la regla de tercios","Para evitar el viñeteo"], c:1},
            {t:"¿Qué transmite una composición simétrica?", o:["Caos y desorden","Equilibrio, calma y formalidad","Movimiento rápido","Profundidad extrema"], c:1},
            {t:"¿Qué es romper la regla de los tercios intencionadamente?", o:["Un error de principiante","Una técnica para centrar sujetos y crear impacto","Algo que nunca debe hacerse","Usar una cuadrícula diferente"], c:1}
        ];
        q2.forEach((q, idx) => {
            db.prepare(`INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, order_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(exam2.lastInsertRowid, q.t, q.o[0], q.o[1], q.o[2], q.o[3], q.c, idx);
        });

        // EXAMEN 3: Técnicas de Exposición
        const exam3 = db.prepare(`INSERT INTO exams (title, icon, description, time_limit, points_correct, points_incorrect, max_attempts, deadline, shuffle_questions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Técnicas de Exposición', '🎞️', 'Control avanzado de la exposición', 1800, 1, 0.25, 2, '2026-01-25', 1, 1);
        const q3 = [
            {t:"Si duplicas el ISO de 400 a 800, ¿cuántos pasos de luz ganas?", o:["Medio paso","Un paso","Dos pasos","Ninguno"], c:1},
            {t:"¿Qué velocidad mínima se recomienda para evitar trepidación con un 50mm?", o:["1/25s","1/50s o más rápida","1/100s","No importa la velocidad"], c:1},
            {t:"¿Qué indica un histograma pegado a la derecha?", o:["Imagen subexpuesta","Imagen sobreexpuesta","Exposición perfecta","Alto contraste"], c:1},
            {t:"¿Qué es la exposición a la derecha (ETTR)?", o:["Un error de exposición","Sobreexponer ligeramente para maximizar información en RAW","Usar solo la parte derecha del encuadre","Medir la luz desde la derecha"], c:1},
            {t:"En modo Manual, si cierras 2 pasos el diafragma, ¿cómo compensas?", o:["Subir ISO 2 pasos o bajar velocidad 2 pasos","No se puede compensar","Cambiar el balance de blancos","Usar flash obligatoriamente"], c:0},
            {t:"¿Qué es el bracketing de exposición?", o:["Usar un trípode especial","Tomar varias fotos con diferentes exposiciones","Medir la luz en varios puntos","Un tipo de flash"], c:1},
            {t:"¿Para qué sirve la compensación de exposición (+/-)?", o:["Solo funciona en modo Manual","Ajustar la exposición que calcula la cámara en modos automáticos","Cambiar el ISO automáticamente","Activar el flash"], c:1},
            {t:"¿Qué modo de medición es mejor para retratos con fondo brillante?", o:["Matricial/Evaluativa","Puntual o ponderada al centro","Promedio total","Da igual el modo"], c:1},
            {t:"¿Qué es el rango dinámico de una cámara?", o:["La velocidad de disparo continuo","La diferencia entre el tono más oscuro y más claro que puede capturar","El rango de ISOs disponibles","La distancia de enfoque"], c:1},
            {t:"Si una escena tiene 12 pasos de rango dinámico y tu cámara captura 10, ¿qué ocurre?", o:["La foto sale perfecta","Pierdes detalle en sombras, luces o ambos","La cámara lo compensa automáticamente","Solo afecta al color"], c:1},
            {t:"¿Qué es la ley de reciprocidad en exposición?", o:["Diferentes combinaciones de apertura/velocidad/ISO dan la misma exposición","El ISO siempre debe ser recíproco a la velocidad","La apertura y velocidad deben ser iguales","Una ley obsoleta de la fotografía analógica"], c:0},
            {t:"¿Cuándo falla la ley de reciprocidad?", o:["Nunca falla","En exposiciones muy largas (varios segundos) con película","Solo en fotografía digital","Con objetivos gran angular"], c:1}
        ];
        q3.forEach((q, idx) => {
            db.prepare(`INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, order_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(exam3.lastInsertRowid, q.t, q.o[0], q.o[1], q.o[2], q.o[3], q.c, idx);
        });

        // EXAMEN 4: Iluminación Profesional
        const exam4 = db.prepare(`INSERT INTO exams (title, icon, description, time_limit, points_correct, points_incorrect, max_attempts, deadline, shuffle_questions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Iluminación Profesional', '💡', 'Técnicas avanzadas de iluminación', 2100, 1, 0.25, 2, '2026-02-01', 1, 1);
        const q4 = [
            {t:"¿Qué determina la dureza o suavidad de la luz?", o:["La potencia de la fuente","El tamaño relativo de la fuente respecto al sujeto","El color de la luz","La marca del flash"], c:1},
            {t:"¿Qué es el número guía (NG) de un flash?", o:["Su peso en gramos","Un indicador de su potencia y alcance","La temperatura de color","El número de disparos por carga"], c:1},
            {t:"Si un flash tiene NG 40 (ISO 100) y estás a 5 metros, ¿qué apertura necesitas?", o:["f/4","f/8","f/11","f/16"], c:1},
            {t:"¿Qué es la luz de relleno (fill light)?", o:["La luz principal más potente","Una luz secundaria para suavizar sombras","La luz del fondo","El flash incorporado"], c:1},
            {t:"¿Qué ratio de iluminación es más dramático?", o:["1:1","2:1","4:1 o mayor","0:1"], c:2},
            {t:"¿Qué es un beauty dish?", o:["Un plato reflector que produce luz semi-suave característica","Un tipo de difusor muy grande","Un snoot decorativo","Una ventana de luz"], c:0},
            {t:"¿Para qué sirve una bandera o gobo en iluminación?", o:["Aumentar la luz","Bloquear o controlar la dirección de la luz","Cambiar el color","Sujetar el flash"], c:1},
            {t:"¿Qué es la iluminación Rembrandt?", o:["Luz frontal plana","Luz lateral que crea un triángulo en la mejilla sombreada","Iluminación solo desde atrás","Usar solo luz natural"], c:1},
            {t:"¿Qué es la sincronización de alta velocidad (HSS)?", o:["Disparar ráfagas muy rápidas","Usar flash a velocidades superiores a la de sincronización","Un modo de enfoque","Sincronizar varios flashes"], c:1},
            {t:"¿Por qué se usa velocidad de sincronización (1/200-1/250s) con flash?", o:["Para ahorrar batería","Porque a mayor velocidad las cortinillas tapan parte del sensor","Por estética","Solo es necesario en cámaras antiguas"], c:1},
            {t:"¿Qué ventaja tiene rebotar el flash en el techo?", o:["Aumenta la potencia","Crea una luz más suave y natural","Congela mejor el movimiento","Reduce el consumo"], c:1},
            {t:"¿Qué es un gel CTO en flash?", o:["Un gel de protección","Un filtro naranja para igualar luz tungsteno","Un difusor especial","Un accesorio de enfoque"], c:1},
            {t:"¿Qué es la luz parásita o spill?", o:["Luz principal muy potente","Luz no deseada que afecta áreas que no queremos iluminar","Un efecto artístico buscado","La luz del sol"], c:1},
            {t:"¿Qué configuración de luz se llama 'clamshell'?", o:["Una sola luz cenital","Dos luces: una superior y reflector o luz inferior","Luz solo desde atrás","Cuatro luces en cruz"], c:1},
            {t:"¿Por qué la luz del atardecer es más cálida que al mediodía?", o:["El sol cambia de temperatura","La luz atraviesa más atmósfera, filtrando tonos azules","Es una ilusión óptica","Solo parece más cálida en fotos"], c:1}
        ];
        q4.forEach((q, idx) => {
            db.prepare(`INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, order_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(exam4.lastInsertRowid, q.t, q.o[0], q.o[1], q.o[2], q.o[3], q.c, idx);
        });

        // EXAMEN 5: Fotografía Avanzada y Edición
        const exam5 = db.prepare(`INSERT INTO exams (title, icon, description, time_limit, points_correct, points_incorrect, max_attempts, deadline, shuffle_questions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('Fotografía Avanzada y Edición', '🏆', 'Técnicas profesionales y postprocesado', 2400, 1, 0.33, 2, '2026-02-15', 1, 1);
        const q5 = [
            {t:"¿Qué es el focus stacking?", o:["Apilar filtros en el objetivo","Combinar varias fotos con distintos puntos de enfoque","Un modo de enfoque automático","Usar varios objetivos"], c:1},
            {t:"¿Qué profundidad de bits es mejor para edición profesional?", o:["8 bits","16 bits","1 bit","Da igual la profundidad"], c:1},
            {t:"¿Qué es el espacio de color Adobe RGB vs sRGB?", o:["Son idénticos","Adobe RGB tiene gama más amplia, mejor para impresión","sRGB es solo para impresión","Adobe RGB es para vídeo"], c:1},
            {t:"¿Qué es la aberración cromática?", o:["Ruido de color en ISOs altos","Franjas de color en bordes por dispersión de la luz en el objetivo","Un efecto artístico","Falta de nitidez general"], c:1},
            {t:"¿Qué es el efecto moiré?", o:["Desenfoque de movimiento","Patrones de interferencia en tejidos finos o texturas repetitivas","Sobreexposición localizada","Un tipo de bokeh"], c:1},
            {t:"¿Para qué sirve un filtro ND de 10 pasos?", o:["Aumentar el contraste","Permitir exposiciones muy largas en luz diurna","Mejorar los colores","Reducir la aberración"], c:1},
            {t:"¿Qué es el 'clipping' en edición?", o:["Recortar la imagen","Pérdida de información en blancos o negros puros","Un tipo de máscara","Copiar ajustes"], c:1},
            {t:"¿Por qué se edita en formato RAW?", o:["Ocupa menos espacio","Contiene más información y permite ajustes sin degradación","Es más rápido de procesar","Tiene mejor color de fábrica"], c:1},
            {t:"¿Qué es la máscara de luminosidad?", o:["Una selección basada en los valores de brillo de la imagen","Un filtro físico para el objetivo","Un modo de medición","Una técnica de iluminación"], c:0},
            {t:"¿Qué es el dodge and burn?", o:["Dos tipos de objetivos","Técnica de aclarar y oscurecer zonas selectivamente","Un modo de flash","Efectos de Photoshop automáticos"], c:1},
            {t:"¿Qué hace la curva de tonos en edición?", o:["Solo ajusta el brillo","Controla la relación entre tonos de entrada y salida","Cambia la resolución","Añade nitidez"], c:1},
            {t:"¿Qué es el perfil de lente en Lightroom/Camera Raw?", o:["Una marca de agua","Correcciones automáticas de distorsión y viñeteo del objetivo","El nombre del fotógrafo","Un preset de color"], c:1},
            {t:"¿Qué diferencia hay entre claridad y textura?", o:["Son lo mismo","Claridad afecta contraste medio, textura afecta detalles finos","Textura es para paisajes, claridad para retratos","No existen esos ajustes"], c:1},
            {t:"¿Por qué se usa calibración de monitor para edición?", o:["Para que brille más","Para que los colores que ves coincidan con la realidad/impresión","Solo es necesario para vídeo","Es opcional y no afecta al resultado"], c:1},
            {t:"¿Qué es el HDR en fotografía?", o:["Un formato de vídeo","Combinar exposiciones para capturar mayor rango dinámico","Un tipo de flash","Alta Definición de Resolución"], c:1}
        ];
        q5.forEach((q, idx) => {
            db.prepare(`INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, order_num) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(exam5.lastInsertRowid, q.t, q.o[0], q.o[1], q.o[2], q.o[3], q.c, idx);
        });

        console.log('✅ 5 exámenes creados');
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
