# Notificaciones Android: activación pendiente

## Preparado en el código

- Supervisor: coordinador o gerente de su estructura aprueba/rechaza. Coordinador: sólo su gerente. Conserva Puebla compartida, anti-autoaprobación y permisos de cancelaciones.
- Un envío nuevo avisa a sus coordinadores autorizados; un plan de coordinador avisa a su gerente. La aprobación avisa al propietario.
- Registro Android por instalación/cuenta y token Expo, cola transaccional idempotente, reintentos y recibos. Los errores de notificaciones no impiden enviar o aprobar planes.
- Al cerrar sesión se intenta desactivar los dispositivos de esa cuenta, acorde con el cierre global de sesión existente. Sin internet esa desactivación remota no puede garantizarse: los mensajes son genéricos y su apertura exige la cuenta destinataria y los permisos del backend.
- Al volver a estar en línea, en primer plano, se sincronizan las colas existentes de tareas/evidencias. Sólo avisa una vez si hubo pendientes y ya no queda ninguno, incluidos errores o ejecuciones antiguas no sincronizadas. La ejecución completa de visitas se detalla en OFFLINE_EXECUTION.md; no se garantiza sincronización con la app cerrada.
- El aviso global de modo sin conexión sólo se muestra cuando NetInfo detecta falta de conexión/internet. Recuperación de datos anteriores sigue accesible en Mis planes.

## Requisitos antes de compilar otra APK

1. Registrar una app Android en Firebase con paquete exacto `mx.appderutas.supervision`.
2. `google-services.json` recibido y validado: proyecto Firebase `appderutas`, paquete `mx.appderutas.supervision`. Copia local en `mobile/google-services.json`, excluida de Git; la configuración la detecta automáticamente. Con autorización explícita del usuario, se cargó y verificó en `@borderline97/app-de-rutas`, entorno Expo EAS `preview`, como variable **de tipo archivo**, visibilidad secreta, nombre `GOOGLE_SERVICES_JSON`. Entorno `production` intacto. `mobile/app.config.js` prioriza esa variable en EAS. Render, Supabase y Maps conservan sus conexiones.
3. **FCM V1 configurado por el usuario y asociación verificada** mediante EAS credentials con perfil preview: proyecto Expo `app-de-rutas` de `borderline97`, paquete `mx.appderutas.supervision`, cuenta de servicio del proyecto Firebase `appderutas`. La clave privada permanece en EAS; no se descargó ni se incorporó a la APK o a Git. La recepción real queda pendiente de la nueva APK y del backend actualizado.
4. Migración `20261019140000_plan_approvals_notifications.sql`: **aplicada por el usuario en Supabase** y verificada. Se registró como aplicada en el historial remoto sin repetir su SQL. No volver a ejecutarla.
5. Publicación y nueva APK preview autorizadas por el usuario; ejecución en curso. La APK anterior no incorpora estos cambios. El teléfono debe conceder permiso de notificaciones.

Guía oficial: https://docs.expo.dev/push-notifications/fcm-credentials/

## Prueba final en Android físico (pendiente)

- Enviar un plan con supervisor y abrir el aviso desde su coordinador; aprobar con coordinador y con gerente en planes separados. Verificar que un coordinador no apruebe el plan de otro coordinador.
- Confirmar aviso de aprobación en la cuenta propietaria, con la app abierta y cerrada.
- Descargar la semana, activar modo avión y comprobar el banner; guardar tareas/evidencias permitidas. Reconectar con la app abierta: desaparece banner, se drena la cola y aparece un único aviso de sincronización. Un registro con error debe impedir el aviso de finalización.
- Cambiar de cuenta: una notificación de la cuenta anterior no debe abrir sus datos. Rechazar el permiso de notificaciones no debe impedir el trabajo.

No se han enviado notificaciones reales. La configuración Firebase/EAS está preparada. La integración push requiere el backend actualizado, una nueva APK y la prueba real de recepción.
