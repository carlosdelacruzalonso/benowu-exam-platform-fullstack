Benowu - Plataforma de Exámenes Online

https://benowu-exam-platform-fullstack-production.up.railway.app/

Plataforma profesional de exámenes online con backend Node.js, autenticación JWT y base de datos SQLite.

Características

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

Despliegue Ultra Rápido

Railway

1. Crea cuenta en [railway.app](https://railway.app)
2. Conecta tu repositorio de GitHub
3. Railway detecta automáticamente Node.js
4. Añade estas variables de entorno:
   ```
   NODE_ENV=production
   JWT_SECRET=tu-clave-secreta-muy-larga-y-aleatoria-de-64-caracteres
   ADMIN_PASSWORD=tu-contraseña-admin-segura
   ```
5. Railway te da una URL pública

Seguridad Implementada

- ✅ Contraseñas hasheadas con bcrypt (10 rounds)
- ✅ Tokens JWT con expiración
- ✅ Rate limiting (100 req/15min, 20 para auth)
- ✅ Helmet.js (headers de seguridad)
- ✅ CORS configurado
- ✅ Respuestas correctas NO se envían al cliente hasta que puede verlas
- ✅ Validación de tiempo en servidor
- ✅ Validación de intentos en servidor

Capturas

La plataforma incluye:
- Login con auto-registro
- Dashboard de exámenes
- Examen con temporizador y navegación
- Resultados con revisión
- Certificados imprimibles
- Panel de administración completo
  
