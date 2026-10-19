# P0.1 — lectura móvil sin conexión

Alcance inicial histórico. La ejecución completa de visitas se documenta ahora
en [OFFLINE_EXECUTION.md](OFFLINE_EXECUTION.md).

Implementación local del 2026-10-16. No incluye check-in/check-out offline,
nuevos tipos de operaciones ni cambios del backend, PostgreSQL o WebApp.

## Identidad y autorización

- Supabase sigue siendo el único propietario de la sesión y sus tokens. Se lee
  su mismo registro persistido al arrancar; no se duplican tokens ni contraseñas.
- Un perfil offline sólo se habilita con una sesión previamente persistida por
  Supabase y un snapshot de `/api/auth/me` para ese mismo `user.id`. El ID de
  persona del perfil no se confunde con el ID de Supabase.
- Un fallo NETWORK_ERROR o de renovación por red conserva sesión, perfil,
  actividades, evidencias y colas. El primer acceso sin sesión exige internet.
- Un 403, un rechazo real del refresh o un 401 persistente después de renovar
  bloquean la reutilización del snapshot hasta una validación satisfactoria. Un
  401 por token vencido permite renovar mediante el SDK; si la renovación falla
  por red se conserva el perfil offline ya validado de la misma cuenta. No genera
  un ciclo de reintentos. SIGNED_OUT oculta todo y bloquea el snapshot,
  conservando los datos locales. Logout sigue usando Supabase; si éste devuelve
  un error offline se informa y se conserva la sesión, sin simular un logout.
- La autorización se revalida al volver al primer plano, al cambiar el token y
  cada 20 segundos en primer plano cuando el perfil está offline/no disponible.
  `/api/auth/me` tiene un límite de espera de diez segundos. El backend sigue
  validando cada petición y cada mutación.

## Propiedad de datos y pendientes

- Cada ID real de Supabase utiliza `user-<uuid>.db`, con el esquema SQLite
  existente. No se modifican tablas ni migraciones del servidor.
- Logout, revocación, cambio de cuenta y cambio de perfil nunca borran bases,
  fotos ni colas. Las pantallas se remontan por identidad y los callbacks de
  sincronización conservan el handle de su base original o rechazan respuestas
  obsoletas. Una cuenta no sincroniza fotografías de otra.
- La subida conserva ticket, bytes nativos, URL firmada, idempotencia,
  reintentos y confirmación READY. Sus cambios se limitan a enlazar la
  persistencia y la sesión con el propietario.
- Un plan no se reemplaza mientras existan evidencias PENDING/UPLOADING/FAILED
  o ejecuciones pendientes que resultarían afectadas. El historial recuperado
  se conserva por separado y no bloquea la descarga de otras visitas; si una
  visita histórica pendiente reaparece en la respuesta, se aplaza el reemplazo
  para protegerla. No se descartan pendientes ni se implementa ejecución offline.
- Agenda mantiene sus colas existentes de estado/comentario, ahora aisladas
  por usuario. NETWORK_ERROR se trata como recuperable.

### Instalaciones anteriores / piloto

`local.db` anterior no registra de forma fiable el usuario autenticado que creó
cada pendiente. Se lee sin ejecutar migraciones, UPDATE, DELETE ni INSERT sobre
ella. Las fotografías no se mueven ni se borran. No se atribuye toda la base al
primer login, al último perfil, a quien puede ver una tarea ni a su responsable
actual. El servidor puede demostrar la propiedad de algunos registros:

| Registro | Prueba exigida para copiar a la base del usuario |
| --- | --- |
| Visita | Detalle del plan cuyo `supervisorId` sea exactamente el ID de persona de `/auth/me`, con coincidencia de visita y plan. El endpoint actual filtra por propietario exacto. |
| Actividad | ID y visita coincidentes en ese mismo detalle autorizado. |
| Foto de visita pendiente | Visita de propietario exacto y actividad verificada cuando exista. Si falta el padre local, se busca en los planes propios, incluidos los archivados, y se reconstruye desde el servidor. |
| Foto de visita eliminada | Evidencia READY del servidor con coincidencia exacta de ID, supervisor, visita y actividad. La visibilidad por jerarquía sola no basta. |
| Foto de Agenda | Evidencia del servidor con ID, tarea y `supervisor_id` exactos. Si el servidor confirma READY, se recupera READY sin encolarla otra vez. La asignación actual es mutable y no prueba quién creó la foto. |
| Ejecución pendiente | Visita y actividad verificadas, y evidencia dependiente recuperada cuando corresponda. Se conserva; no se ejecuta. |
| Comentario de Agenda | ID de idempotencia, tarea, cuerpo y `author_id` exactos en un comentario ya recibido por el servidor. Se registra SYNCED y no se reenvía. |
| Snapshot del plan | Plan propio y todas sus visitas locales verificadas; nunca reemplaza un snapshot más reciente de la cuenta. |

**Recuperación explícita:** entrar con conexión, validar el perfil, abrir
“Revisar recuperación de mis datos” y pulsar “Verificar y recuperar mis datos”.
Cada intento vuelve a consultar `/api/auth/me` con la sesión del SDK. No se
habilita recuperación offline para atribuir registros nuevos. Se puede consultar
sin conexión lo ya recuperado. La copia sólo hace peticiones GET; no dispara
subidas ni ejecuta pendientes. Los reintentos posteriores utilizan el flujo
existente de evidencias y los permisos vigentes del servidor.

**Interrupciones y repetición:** `legacy-recovery.db` reserva cada tabla/ID y
SHA-256 del registro a un único ID real de Supabase y perfil. La fila y su recibo
se guardan en una transacción de la base de esa cuenta. Una interrupción entre
ambas bases se reanuda con la reserva/recibo; nunca se concede a otra cuenta.
Una operación ya consumida no se vuelve a insertar. Conflictos de identidad,
idempotencia, hash, esquema o recibos faltantes permanecen sin sobrescribir.
El cierre/cambio de cuenta detiene nuevas copias y oculta el resultado anterior.

**Consulta:** las visitas y fotos recuperadas se pueden revisar en esa pantalla.
El historial no sustituye un plan actual descargado, y sobrevive a las siguientes
descargas. Si aún no existe ningún snapshot de la cuenta, puede restaurarse el
último snapshot heredado completamente verificado con su hora original.

**Límites seguros:** fotos nunca enviadas y cambios de estado/comentarios de
Agenda sin autor demostrable permanecen en `local.db`, sin asignarse ni enviarse.
El JSON compartido de caché de Agenda se vuelve a descargar; no se copia por
contener potencialmente datos de varias cuentas. Los registros retenidos no
significan necesariamente que pertenezcan al usuario actual. Un plan/actividad
eliminado sin evidencia de propietario no se atribuye por suposición. La copia
no evita restricciones sobre planes archivados ni garantiza que un pendiente
pueda enviarse: decide el backend. No se alteran permisos para recuperarlo.

**No desinstalar, borrar datos de la app ni eliminar local.db, las bases por
usuario, legacy-recovery.db o las fotos en dispositivos del piloto.** No se
accedió a bases o fotografías reales del piloto durante estas pruebas.

## Validaciones automatizadas

Ejecutar desde la raíz:

```text
node mobile/node_modules/typescript/bin/tsc --noEmit --incremental false --project mobile/tsconfig.json
node --test mobile/tests/offlineAuth.test.cjs mobile/tests/offlinePlan.test.cjs mobile/tests/evidenceSync.test.cjs mobile/tests/legacyRecovery.test.cjs
git diff --check
git status -sb
```

Resultado local: 71/71 pruebas aprobadas; TypeScript sin emisión y
`git diff --check` aprobados.

Las pruebas ejecutan los providers con un runner de hooks y adaptadores de
sesión/red controlados; las pruebas del plan usan SQLite real en memoria. No
leen ni escriben los datos reales del dispositivo o del servidor. Cubren A–J,
incluidos restauración de sesión expirada ante error de red, rechazo persistente
del servidor, respuestas tardías de otra cuenta, rollback y colas conservadas.
La recuperación usa SQLite real en memoria y SHA-256 real: fuente intacta,
propietario exacto frente a visibilidad jerárquica, tareas reasignadas, pendientes
sin autor, cambios de cuenta durante la copia, reservas/recibos ante interrupción,
conflictos, dependencias huérfanas, esquemas desconocidos y repetición sin replay.

## Comprobación manual en Android/iOS (pendiente)

Usar cuentas de prueba y un dispositivo/emulador de pruebas. No limpiar datos
de un dispositivo del piloto.

1. **A/B:** con internet, iniciar sesión con A y sincronizar un plan con al menos
   una visita y una actividad. Comprobar nombre, plan, actividades y hora de
   última sincronización. Abrir la visita para comprobar sus actividades.
2. **C/D/E:** activar modo avión, forzar cierre sin borrar datos y reabrir.
   Confirmar el mismo perfil y plan, SIN CONEXIÓN y la hora de descarga. Repetir
   después de que expire el access token. Pulsar actualizar: no deben perderse
   perfil, visitas ni actividades; no debe abrirse login por un error de red.
3. **F:** recuperar conexión con la app en primer plano y esperar la próxima
   comprobación (20 segundos más la petición) o pulsar actualizar. Comprobar
   revalidación del perfil y nueva descarga. Probar también volver desde segundo
   plano. La actualización puede esperar si existen pendientes protegidos.
4. **G:** en otra instalación de pruebas vacía, sin internet, intentar login.
   Debe informar que requiere conexión y no abrir ninguna información local.
5. **H:** online, cerrar sesión A e iniciar sesión B. No deben verse nombre,
   plan, fotos ni colas de A. Descargar el plan de B, reabrir offline y comprobar
   B. Volver a A online y comprobar que sus datos siguen conservados.
6. **I:** capturar una evidencia con el flujo existente; interrumpir la conexión
   antes de confirmar READY. Cerrar/reabrir, recuperar conexión y reintentar.
   Mantener la misma foto/ID de idempotencia. Probar logout y cambio de cuenta
   durante una subida: la escritura final debe seguir en la base de A. El plan
   anterior se conserva mientras haya pendientes, incluidos los FAILED.
7. **J:** con una cuenta de prueba preparada como inactiva/revocada por el
   administrador, reconectar. El backend debe rechazarla y la app mostrar acceso
   no autorizado; reabrir offline no debe reactivar ese snapshot. No revocar
   usuarios del piloto para ejecutar esta prueba.
8. **Recuperación heredada:** preparar una instalación anterior de pruebas con
   `local.db`, una visita de A, foto PENDING/FAILED con archivo persistido y una
   ejecución dependiente. Usar las herramientas del emulador, con la app cerrada,
   para conservar una copia de la base (y WAL/SHM si existen) y fotos. Actualizar
   sin borrar datos. Con B, intentar recuperar: no deben copiarse ni mostrarse
   los registros de A. Con A online, ejecutar la recuperación explícita: comparar
   IDs, URI, intentos, estado, idempotencia, dependencia y bytes de la foto con
   la copia inicial. Verificar que los originales siguen existiendo sin cambios.
9. **Interrupción:** en esa instalación de pruebas, cerrar la app durante una
   recuperación extensa. Reabrir A y repetir: no debe duplicar filas ni recrear
   operaciones consumidas. Repetir cambiando a B: no debe reasignar reservas.
   Probar modo avión durante la verificación: conservar todo, sin cerrar sesión.
10. **Historial y reintento:** sincronizar un plan actual distinto, recuperar la
    visita antigua y volver a descargar el actual. La visita/foto antigua debe
    seguir en recuperación sin mezclarse con hoy. Reabrir offline y visualizar
    la foto. Online, reintentar con el botón existente y comprobar ticket/Storage/
    confirmación READY y mismo ID; si el servidor deniega el envío, conservar
    archivo y fila FAILED. No cambiar permisos ni datos del piloto para probarlo.
11. **Agenda ambigua:** preparar una tarea reasignada de B a A y fotos/comentarios/
    estados locales sin prueba de autor. Con A, recuperar: deben quedar retenidos
    sin mostrarse, atribuirse ni enviarse. Una foto con supervisor exacto o un
    comentario ya confirmado con autor/ID/cuerpo coincidentes sí puede recuperarse;
    el comentario queda SYNCED. Confirmar que ningún comentario se envía dos veces.

No se inició P0.2 ni P0.3. Falta ejecutar la validación nativa descrita arriba:
ciclo de vida, modo avión, URI/bytes físicos tras actualizar y reintento real.
La retención de registros sin prueba de autoría es deliberada; recuperarlos por
otra vía exigiría evidencia verificable adicional, nunca una reasignación manual
indiscriminada. Conservarlos no equivale a haberlos enviado al servidor.
