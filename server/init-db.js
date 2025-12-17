require('dotenv').config();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Crear directorio data si no existe
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const { initDatabase } = require('./db');

async function initDB() {
    console.log('🔧 Inicializando base de datos...');
    
    // Primero inicializar la base de datos
    await initDatabase();
    
    // Ahora podemos usar las funciones de db
    const db = require('./db');

    // Crear usuario admin
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin_benowu25';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const existingAdmin = db.prepare('SELECT id FROM users WHERE dni = ?').get('ADMIN');
    
    if (!existingAdmin) {
        db.prepare(`
            INSERT INTO users (dni, name, password_hash, role)
            VALUES (?, ?, ?, ?)
        `).run('ADMIN', 'Administrador', hashedPassword, 'admin');
        console.log('✅ Usuario admin creado');
        console.log(`   DNI: ADMIN`);
        console.log(`   Contraseña: ${adminPassword}`);
    } else {
        console.log('ℹ️  Usuario admin ya existe');
    }

    // Verificar si ya hay exámenes
    const examCount = db.prepare('SELECT COUNT(*) as count FROM exams').get();
    
    if (examCount.count === 0) {
        console.log('📝 Creando exámenes de ejemplo...');

        // Examen 1: Fotografía Básica
        const exam1 = db.prepare(`
            INSERT INTO exams (title, icon, description, time_limit, points_correct, points_incorrect, max_attempts, deadline, shuffle_questions, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('Fotografía Básica', '📷', 'Conceptos fundamentales de fotografía', 1800, 1, 0, 2, '2026-01-15', 1, 1);

        const questions1 = [
            {t:"¿Qué es el triángulo de exposición?", o:["Un accesorio para estabilizar la cámara","La relación entre ISO, apertura y velocidad de obturación","Un tipo de composición fotográfica","El sensor de la cámara"], c:1},
            {t:"¿Qué controla la apertura del diafragma?", o:["El tiempo que el sensor está expuesto a la luz","La sensibilidad del sensor","La cantidad de luz que entra y la profundidad de campo","El enfoque automático"], c:2},
            {t:"Un número f/ bajo (ej: f/1.8) significa:", o:["Menor entrada de luz y mayor profundidad de campo","Mayor entrada de luz y menor profundidad de campo","Imagen más oscura","Mayor velocidad de obturación"], c:1},
            {t:"¿Qué es el ISO en fotografía?", o:["Un formato de archivo de imagen","La sensibilidad del sensor a la luz","El tamaño del sensor","La distancia focal del objetivo"], c:1},
            {t:"¿Qué sucede al aumentar mucho el ISO?", o:["La imagen se vuelve más nítida","Aparece más ruido/grano en la imagen","Los colores se saturan más","Se reduce la profundidad de campo"], c:1},
            {t:"La regla de los tercios consiste en:", o:["Usar siempre tres fuentes de luz","Dividir la imagen en 9 partes y situar elementos en las intersecciones","Fotografiar solo en formato 3:2","Usar tres colores principales"], c:1},
            {t:"¿Qué es la profundidad de campo?", o:["La distancia entre la cámara y el sujeto","La zona de la imagen que aparece enfocada","La cantidad de megapíxeles del sensor","El ángulo de visión del objetivo"], c:1},
            {t:"Una velocidad de obturación de 1/1000 es:", o:["Muy lenta, ideal para larga exposición","Muy rápida, ideal para congelar movimiento","Estándar para retratos","Solo útil en fotografía nocturna"], c:1},
            {t:"El balance de blancos sirve para:", o:["Aumentar el contraste de la imagen","Corregir la dominante de color según la luz","Enfocar correctamente","Reducir el ruido"], c:1},
            {t:"¿Qué tipo de objetivo tiene una distancia focal de 50mm?", o:["Gran angular","Teleobjetivo","Objetivo estándar/normal","Ojo de pez"], c:2},
            {t:"El formato RAW se caracteriza por:", o:["Ocupar menos espacio que JPEG","Guardar toda la información del sensor sin comprimir","Ser compatible con todas las aplicaciones","Tener los colores ya procesados"], c:1},
            {t:"¿Qué es el bokeh?", o:["Un tipo de flash externo","El desenfoque estético del fondo","Una técnica de iluminación","Un filtro de color"], c:1},
            {t:"Para fotografiar un paisaje con todo enfocado, necesitas:", o:["Apertura amplia (f/1.8)","Apertura cerrada (f/11 o superior)","ISO muy alto","Velocidad muy rápida"], c:1},
            {t:"¿Qué es la luz dura?", o:["Luz que crea sombras suaves y difusas","Luz direccional que crea sombras marcadas y definidas","La luz del amanecer","Luz artificial de estudio"], c:1},
            {t:"El histograma de una foto nos muestra:", o:["Los metadatos de la imagen","La distribución de tonos claros y oscuros","El tamaño en megapíxeles","La temperatura de color"], c:1}
        ];

        const insertQ = db.prepare(`
            INSERT INTO questions (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, order_num)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        questions1.forEach((q, idx) => {
            insertQ.run(exam1.lastInsertRowid, q.t, q.o[0], q.o[1], q.o[2], q.o[3], q.c, idx);
        });

        // Examen 2: Fotografía Avanzada
        const exam2 = db.prepare(`
            INSERT INTO exams (title, icon, description, time_limit, points_correct, points_incorrect, max_attempts, deadline, shuffle_questions, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('Fotografía Avanzada', '🎞️', 'Técnicas avanzadas de fotografía', 2400, 1, 0.25, 2, '2026-01-20', 1, 1);

        const questions2 = [
            {t:"¿Qué es la hiperfocal?", o:["La distancia mínima de enfoque","La distancia a la que enfocar para maximizar la profundidad de campo","El punto más lejano que puede enfocar un objetivo","La distancia entre el sensor y el objetivo"], c:1},
            {t:"El bracketing de exposición consiste en:", o:["Usar un trípode especial","Tomar varias fotos con diferentes exposiciones","Combinar varias fotos en una sola","Ajustar el balance de blancos automáticamente"], c:1},
            {t:"¿Para qué sirve el modo bulb?", o:["Para fotografía macro","Para exposiciones muy largas controladas manualmente","Para sincronizar con flash","Para fotografía deportiva"], c:1},
            {t:"¿Qué es el efecto moiré?", o:["Un tipo de viñeteo","Un patrón de interferencia que aparece en tejidos finos","Un efecto de desenfoque circular","Una aberración cromática"], c:1},
            {t:"La técnica de 'dragging the shutter' se usa para:", o:["Congelar el movimiento","Combinar flash con luz ambiente en exposiciones largas","Crear efecto de zoom","Fotografiar estrellas"], c:1},
            {t:"¿Qué es el 'focus stacking'?", o:["Un tipo de enfoque automático","Combinar varias fotos con diferentes puntos de enfoque","Una técnica de iluminación","El apilamiento de filtros"], c:1},
            {t:"El número guía de un flash indica:", o:["Su temperatura de color","Su potencia y alcance","Su velocidad de reciclado","Su ángulo de cobertura"], c:1},
            {t:"¿Qué es la sincronización de alta velocidad (HSS)?", o:["Usar velocidades superiores a 1/250s con flash","Disparar en ráfaga rápida","Sincronizar múltiples cámaras","Un modo de enfoque rápido"], c:0},
            {t:"La difracción óptica en fotografía ocurre cuando:", o:["Usamos aperturas muy abiertas","Usamos aperturas muy cerradas (f/16+)","Fotografiamos a través de cristal","Usamos teleobjetivos"], c:1},
            {t:"¿Qué ventaja tiene el sensor full frame sobre APS-C?", o:["Es más barato","Mejor rendimiento en ISO alto y profundidad de campo","Tiene más alcance (crop factor)","Es más ligero"], c:1}
        ];

        questions2.forEach((q, idx) => {
            insertQ.run(exam2.lastInsertRowid, q.t, q.o[0], q.o[1], q.o[2], q.o[3], q.c, idx);
        });

        // Examen 3: Iluminación
        const exam3 = db.prepare(`
            INSERT INTO exams (title, icon, description, time_limit, points_correct, points_incorrect, max_attempts, deadline, shuffle_questions, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('Iluminación Fotográfica', '💡', 'Técnicas de iluminación para fotografía', 1800, 1, 0, 2, '2026-01-25', 1, 1);

        const questions3 = [
            {t:"¿Qué es un softbox?", o:["Un estuche para guardar equipo","Un modificador que suaviza la luz del flash","Un tipo de trípode","Un filtro de densidad neutra"], c:1},
            {t:"La luz de relleno (fill light) sirve para:", o:["Ser la luz principal","Reducir las sombras creadas por la luz principal","Crear efectos especiales","Iluminar el fondo"], c:1},
            {t:"¿Qué es un reflector de 5 en 1?", o:["Un objetivo especial","Un reflector con 5 superficies intercambiables","Un flash con 5 modos","Una luz LED con 5 temperaturas"], c:1},
            {t:"La iluminación Rembrandt se caracteriza por:", o:["Iluminación plana y uniforme","Un triángulo de luz en la mejilla del lado en sombra","Luz completamente lateral","Luz desde abajo"], c:1},
            {t:"¿Qué temperatura de color tiene la luz de tungsteno?", o:["2700-3200K (cálida/amarillenta)","5500K (neutra)","6500K (fría/azulada)","10000K (muy fría)"], c:0},
            {t:"Un beauty dish produce:", o:["Luz muy suave como un softbox grande","Luz dura como flash directo","Luz semi-suave con más contraste que un softbox","Luz coloreada"], c:2},
            {t:"¿Para qué sirve un snoot?", o:["Suavizar la luz","Concentrar la luz en un haz estrecho","Difundir la luz en todas direcciones","Cambiar el color de la luz"], c:1},
            {t:"El esquema de iluminación 'clamshell' usa:", o:["Una sola luz lateral","Dos luces, una arriba y otra abajo del sujeto","Luz trasera únicamente","Cuatro luces en cruz"], c:1},
            {t:"¿Qué es la ley del inverso del cuadrado en iluminación?", o:["La luz pierde intensidad proporcionalmente al cuadrado de la distancia","La luz se duplica al acercarse a la mitad","El tamaño de la fuente determina la dureza","Mayor ISO requiere menos luz"], c:0},
            {t:"Un gel de color en el flash sirve para:", o:["Proteger el flash del calor","Modificar la temperatura o color de la luz","Aumentar la potencia","Difundir la luz"], c:1}
        ];

        questions3.forEach((q, idx) => {
            insertQ.run(exam3.lastInsertRowid, q.t, q.o[0], q.o[1], q.o[2], q.o[3], q.c, idx);
        });

        console.log('✅ 3 exámenes de ejemplo creados');
    } else {
        console.log(`ℹ️  Ya existen ${examCount.count} exámenes en la base de datos`);
    }

    console.log('\n🚀 Base de datos inicializada correctamente!');
    console.log('\nPara iniciar el servidor ejecuta: npm start');
    
    // Guardar la base de datos
    db.save();
}

initDB().catch(console.error);
