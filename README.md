# 🎓 Benowu - Plataforma de Exámenes Online

Plataforma profesional de exámenes online con backend Node.js, autenticación JWT y base de datos SQLite.

## ✨ Características

- ✅ Autenticación segura con JWT
- ✅ Múltiples exámenes con configuración flexible
- ✅ Sistema de intentos (máx. 2 por defecto)
- ✅ Puntuación con penalización opcional
- ✅ Revisión de respuestas bloqueada hasta aprobar/agotar intentos
- ✅ Certificados PDF para exámenes aprobados
- ✅ Panel de administración completo
- ✅ Estadísticas y ranking de alumnos
- ✅ Notas de alumnos visibles por el profesor
- ✅ Aviso sonoro a 5 minutos del fin
- ✅ Tema oscuro/claro
- ✅ Responsive (móvil y escritorio)
- ✅ Listo para producción

---

## 🚀 Despliegue Ultra Rápido

### Opción 1: Railway (Recomendado - GRATIS)

1. Crea cuenta en [railway.app](https://railway.app)
2. Conecta tu repositorio de GitHub
3. Railway detecta automáticamente Node.js
4. Añade estas variables de entorno:
   ```
   NODE_ENV=production
   JWT_SECRET=tu-clave-secreta-muy-larga-y-aleatoria-de-64-caracteres
   ADMIN_PASSWORD=tu-contraseña-admin-segura
   ```
5. ¡Listo! Railway te da una URL pública

### Opción 2: Render (GRATIS)

1. Crea cuenta en [render.com](https://render.com)
2. New → Web Service → Conecta GitHub
3. Configuración:
   - **Build Command:** `npm install`
   - **Start Command:** `npm run init-db && npm start`
4. Añade las variables de entorno
5. ¡Desplegado!

### Opción 3: DigitalOcean App Platform

1. New App → GitHub → Selecciona repo
2. Edita el plan a Basic ($5/mes)
3. Añade variables de entorno
4. Deploy

---

## 🖥️ Instalación Local

```bash
# 1. Clonar el proyecto
git clone https://github.com/tu-usuario/benowu-platform.git
cd benowu-platform

# 2. Instalar dependencias
npm install

# 3. Copiar configuración
cp .env.example .env

# 4. Editar .env con tus valores
nano .env

# 5. Inicializar base de datos
npm run init-db

# 6. Arrancar servidor
npm start
```

Abre http://localhost:3000

---

## 🔐 Acceso

### Administrador
- **DNI:** `ADMIN`
- **Contraseña:** La que configures en `ADMIN_PASSWORD` (por defecto: `admin_benowu25`)

### Estudiantes
- Entran con su **DNI** (8 números + 1 letra) y **Nombre**
- Se registran automáticamente en el primer acceso
- No necesitan contraseña

---

## 📋 Configuración de Producción

### Variables de Entorno Importantes

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `PORT` | Puerto del servidor | `3000` |
| `NODE_ENV` | Entorno | `production` |
| `JWT_SECRET` | Clave para tokens (¡CAMBIAR!) | Cadena aleatoria de 64+ caracteres |
| `JWT_EXPIRES_IN` | Duración del token | `24h` |
| `ADMIN_PASSWORD` | Contraseña admin (¡CAMBIAR!) | Tu contraseña segura |
| `FRONTEND_URL` | URL para CORS | `https://tu-dominio.com` |

### Generar JWT_SECRET seguro

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 🏗️ Arquitectura

```
benowu-production/
├── server/
│   ├── index.js          # Express server
│   ├── db.js             # SQLite (sql.js)
│   ├── init-db.js        # Inicialización BD
│   ├── routes/
│   │   ├── auth.js       # Login/registro
│   │   ├── exams.js      # Exámenes
│   │   ├── results.js    # Historial/certificados
│   │   └── admin.js      # Panel admin
│   └── middleware/
│       └── auth.js       # JWT middleware
├── public/
│   ├── index.html        # Frontend SPA
│   └── app.js            # JavaScript cliente
├── data/
│   └── benowu.db         # Base de datos SQLite
├── package.json
└── .env
```

---

## 📊 API Endpoints

### Autenticación
- `POST /api/auth/login` - Login/registro
- `GET /api/auth/me` - Perfil actual
- `PUT /api/auth/avatar` - Actualizar avatar

### Exámenes
- `GET /api/exams` - Listar exámenes
- `POST /api/exams/:id/start` - Iniciar examen
- `POST /api/exams/:id/answer` - Guardar respuesta
- `POST /api/exams/:id/finish` - Finalizar examen
- `GET /api/exams/attempt/:id` - Ver resultado

### Resultados
- `GET /api/results/history` - Historial del alumno
- `GET /api/results/certificate/:id` - Generar certificado

### Admin
- `GET /api/admin/stats` - Estadísticas
- `GET /api/admin/results` - Todos los resultados
- `GET /api/admin/ranking` - Ranking de alumnos
- `GET/POST/PUT/DELETE /api/admin/exams` - CRUD exámenes

---

## 🔒 Seguridad Implementada

- ✅ Contraseñas hasheadas con bcrypt (10 rounds)
- ✅ Tokens JWT con expiración
- ✅ Rate limiting (100 req/15min, 20 para auth)
- ✅ Helmet.js (headers de seguridad)
- ✅ CORS configurado
- ✅ Respuestas correctas NO se envían al cliente hasta que puede verlas
- ✅ Validación de tiempo en servidor
- ✅ Validación de intentos en servidor

---

## 📱 Capturas

La plataforma incluye:
- Login con auto-registro
- Dashboard de exámenes
- Examen con temporizador y navegación
- Resultados con revisión
- Certificados imprimibles
- Panel de administración completo

---

## 🆘 Soporte

¿Problemas? Revisa:
1. Las variables de entorno están configuradas
2. El puerto no está en uso
3. Node.js versión 18 o superior

---

## 📄 Licencia

© 2026 Benowu Academy - Todos los derechos reservados

---

*Transformando el futuro a través del conocimiento* ✨
