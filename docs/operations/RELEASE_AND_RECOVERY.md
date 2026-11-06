# Publicación controlada y recuperación

## Entornos y responsabilidades

- Producción actual: web en Vercel, API en Render, datos/Auth/Storage en Supabase. No modificar sus destinos para simular pruebas.
- Pruebas locales: PostgreSQL desechable con datos ficticios. La integración continua utiliza servicios aislados.
- Android piloto: perfil EAS `preview`, APK interna y firma existente. Validar primero con supervisores/coordinadores designados.
- Un entorno remoto de staging debe tener proyecto de datos, credenciales, almacenamiento y aplicaciones separados. Esta entrega no provisiona ese entorno ni copia datos productivos.

## Puerta de publicación

1. Revisar diferencias, permisos, migraciones y archivos excluidos. Ejecutar `git diff --check`, build web, TypeScript móvil y las regresiones relacionadas. La pipeline automatiza estas verificaciones con una base de prueba.
2. Identificar commit, versión de APK y compatibilidad con API/esquema. Ejecutar export Android/Hermes antes de solicitar una compilación.
3. Distribuir una preview al grupo piloto; comprobar funcionamiento conectado, offline, reconexión, cambio de cuenta, cámara, ubicación, teclado y sesiones web/móvil simultáneas.
4. Publicar web/API únicamente con autorización. Verificar commit activo, salud, autenticación de endpoints y diagnóstico posterior. No duplicar un despliegue automático con otro manual.
5. Promover Android al canal estable sólo después de probar el artefacto real, comprobar su firma y utilizar el panel administrativo existente. El sistema impide descensos de versión.

## Respaldo y ensayo de restauración

El script `scripts/rehearse-restore.mjs` restaura únicamente un archivo PostgreSQL custom ya existente en una base nueva y aleatoria de localhost. Nunca acepta una base remota como destino ni reemplaza una base existente. Conserva la base restaurada y emite un resumen de tablas para inspección.

Los respaldos deben quedar fuera del repositorio, con acceso restringido. Un respaldo de base no incluye automáticamente archivos de Storage ni la configuración externa de Auth, Render, Vercel, Expo o DNS; estos componentes requieren procedimientos y responsables específicos.

Antes de declarar recuperable producción se debe obtener un respaldo autorizado, restaurarlo en un entorno aislado, verificar datos y archivos, medir el tiempo y registrar fecha, responsable, origen y resultado. El ensayo automatizado con datos ficticios demuestra el mecanismo, no la recuperabilidad de un respaldo productivo que no se haya probado.

## Regreso a una versión compatible

- Web/API: seleccionar una versión anterior compatible con el esquema vigente, desplegarla y repetir salud y permisos. Revertir código no revierte datos ni migraciones.
- Android: retirar una publicación problemática mediante el panel y distribuir una versión corregida con código superior y firma válida. No forzar downgrade ni borrar datos locales pendientes.
- Registrar incidente, versión afectada, validación y resolución sin contraseñas, tokens, evidencias ni datos personales en logs.

## Diagnóstico y avisos

El panel de administración muestra eventos limitados de la instancia, errores HTTP y tiempos; se reinicia al desplegar. La APK permite revisar sus colas locales. La captura de errores de pantalla no detecta todos los cierres nativos o del sistema operativo.

Retención externa, alertas automáticas, captura de fallos nativos y escalamiento requieren una plataforma de monitoreo y reglas de destinatarios/horarios configuradas. No se consideran activados por la existencia del panel. Los avisos push existentes mantienen su comportamiento.
