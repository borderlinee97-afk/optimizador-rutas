# Visitas completas sin conexión — Farmacias Android

## Uso

1. Iniciar sesión con internet con un perfil activo de Supervisor o Coordinador.
   Después de instalar la actualización de reapertura offline, hacerlo una vez
   introduciendo correo y contraseña para preparar el verificador local seguro.
2. Descargar la semana de planes aprobados y comprobar sus visitas/actividades.
3. Sin red: mantener habilitado GPS, registrar check-in, tomar y guardar fotos,
   resolver actividades (realizada/no realizada con motivo) y registrar check-out.
4. Se muestran como guardadas en el celular, pendientes de aceptación del servidor.
5. Al recuperar internet con la app abierta: sincronización automática. En Mi trabajo
   y en cada visita se ven pendientes/errores y se puede reintentar. Las fotos y
   las acciones no se eliminan si falla la conexión o el servidor rechaza algo.

## Salir y volver a entrar sin red

En Farmacias nativo, Cerrar sesión cierra el acceso local y conserva las colas y
la sesión renovable del SDK. No equivale a revocar remotamente esa sesión. El
bloqueo se conserva al reiniciar y los eventos del SDK no pueden reabrirlo.
Introducir el mismo correo/contraseña permite reabrir únicamente la cuenta
previamente validada en ese dispositivo; no permite el primer acceso offline ni
cambiar a una cuenta que no esté preparada. Sólo se recuerda la última cuenta.

Se verifica PBKDF2-SHA256 (600,000 iteraciones, sal aleatoria de 32 bytes) en
SecureStore; no se guarda contraseña ni otra copia de tokens. Cinco fallos
bloquean la reapertura durante cinco minutos. La autorización offline vence a los
ocho días sin validación del backend; una revocación conocida bloquea el perfil y
elimina el verificador. Al conectar se mantienen las verificaciones existentes del
servidor antes de sincronizar. Las salidas ordinarias de los clientes actualizados
se limitan al dispositivo actual; no revocan la sesión del otro dispositivo.

Validado automáticamente: salida, reinicio bloqueado, credenciales erróneas,
reapertura offline, conexión posterior, revocación y aislamiento por cuenta. Falta
la prueba física de esta nueva reapertura en Android; el usuario ya comprobó el
flujo completo de visitas/sincronización de la APK anterior.

## Garantías y límites técnicos

- Caché y colas aisladas por usuario de Supabase. Cambio de cuenta/logout no borra
  evidencia o acciones; tampoco permite enviarlas como si fueran de otro usuario.
- Captura y transición local en una sola transacción SQLite. Sólo sobre planes
  aprobados descargados; check-in de la fecha programada; una visita activa del
  mismo día a la vez. Una visita anterior sin finalizar no bloquea las de hoy y
  conserva su estado y evidencias para seguimiento.
- GPS real: no permite ubicación simulada y aplica referencia local de 200 m y
  precisión máxima de 100 m. El servidor vuelve a aplicar su configuración vigente.
  La captura sin GPS válido no puede darse por válida por estar en modo avión.
- Las fotos se guardan como archivos del dispositivo antes de resolver una actividad.
  La sincronización respeta check-in → evidencia READY → actividad → check-out.
- Las paradas adicionales admiten más de diez fotos generales, también al reintentar
  después de finalizar la visita. Se mantienen tamaño máximo, formatos, ubicación,
  pertenencia e idempotencia. Una foto en REVISAR conserva su archivo y se reintenta
  con la misma identidad; no hace falta volver a capturarla.
- Si hay evidencias u operaciones pendientes, la descarga puede añadir visitas nuevas
  sin reemplazar los registros locales existentes, sus actividades o sus colas. El
  aviso de pendientes permanece hasta resolver el envío; no se marca una descarga
  completa sobre datos protegidos. Una actualización solicitada durante otra descarga
  se ejecuta al terminar, siempre dentro de la misma cuenta autorizada.
- Se conserva el identificador de cada acción y el servidor registra un recibo en
  work_plan_event dentro de la misma transacción que la ejecución. Reintentar una
  acción ya aceptada devuelve su recibo y no ejecuta otra visita ni cambia su hora.
- Se conserva occurredAt del dispositivo para check-in/actividades/check-out y se
  registra receivedAt por separado. El servidor rechaza fechas futuras >5 minutos,
  capturas de más de ocho días, un inicio anterior a la aprobación, orden inválido,
  planes cambiados/no aprobados, permisos revocados o evidencia incompleta.
- Un rechazo queda visible y bloquea las acciones dependientes; se conserva la captura
  original. Reintentar no altera fotos, coordenadas ni horas para forzar aceptación.
- La renovación de token fallida por red conserva el perfil offline previamente
  validado. Revocaciones reales y denegaciones persistentes siguen bloqueando acceso.
- No incluye primer login sin internet, creación de planes, reprogramaciones
  ni cancelaciones sin conexión. La sincronización en segundo plano depende de
  Android y no garantiza una hora de envío; comprobar pendientes al recuperar red.
- La APK instalada antes de esta implementación no incorpora este flujo.

## Validación

Pruebas con SQLite y proveedor simulado de fotos/API: dos visitas sin red, cierre
de servicios/reapertura de cuenta, envío ordenado, interrupciones/reintentos,
conflictos conservados, prohibición de solapamiento y cambio de cuenta.
Prueba de servidor contra PostgreSQL aislado: transiciones reales, geocerca,
evidencia, idempotencia concurrente, horas originales y duración, rollback y revocación.
TypeScript móvil y pruebas relacionadas aprobados. La aceptación final requiere
probar en Android físico la APK que incluya estos cambios, con backend actualizado.

## Comprobaciones de cuenta y recuperación

- Con A validada y su semana descargada, activar modo avión y reabrir la APK;
  comprobar perfil, visitas y actividades, también después de vencer el token.
- Recuperar conexión y actualizar; un error de red conserva el perfil previamente
  validado, mientras que una revocación confirmada bloquea el acceso.
- Cambiar de A a B con internet; B no debe ver ni enviar datos de A. Al volver a A,
  deben conservarse sus datos y pendientes.
- Interrumpir una subida y reintentar al recuperar red; mantener la misma evidencia
  y comprobar que el servidor no duplica el registro.
- En una instalación antigua de pruebas con `local.db`, conservar primero una copia
  de su base y fotografías. Comprobar la recuperación con la cuenta propietaria y
  repetir después de interrumpirla; no duplicar ni reasignar registros ambiguos.
- Utilizar cuentas y dispositivos de pruebas. Conservar los datos pendientes y
  comprobar versión, resultado local y confirmación del servidor por separado.
