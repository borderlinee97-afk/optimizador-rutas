# APP DE RUTAS — estado del proyecto

## Seguimiento de visitas, agenda y acceso — publicación autorizada (2026-10-20)

- Farmacias pendientes por responsable y asignaciones del periodo: última visita
  autorizada al cierre, programación, vacaciones aprobadas y cobertura temporal.
  La atención completada por apoyo autorizado evita un pendiente ficticio.
- Comparación planeado/realizado con pendientes, en curso, omisiones, cancelaciones,
  reprogramaciones, adicionales y registros sin marcas válidas. Exportaciones CSV.
- Cancelación conjunta de unidades pendientes de un plan aprobado con motivo,
  confirmación y auditoría: el dueño solicita; su superior autorizado resuelve.
  Se conservan visitas iniciadas, realizadas y solicitudes ya enviadas.
- Vacaciones disponibles según la jerarquía normal; aprobación compartida de
  coordinadores exclusivamente para Puebla. Fechas, cruces y reintentos validados.
- Web: recuperar contraseña desde acceso y cambiarla verificando la actual.
  Recuperación por Supabase con manejo de enlace expirado. En código móvil,
  la pantalla conserva el flujo al crearse la sesión y comparte el canje de
  un código de un solo uso entre remontajes; al terminar exige nuevo acceso.
- Agenda: resumen, horario de Guadalajara, actualización controlada y acceso al
  detalle desde avisos. Avisos web con permiso y página abierta. Cola push existente
  ampliada para asignaciones y recordatorios 30 minutos antes; deduplicación,
  validación de destinatario/jerarquía y descarte de tareas cerradas o reasignadas.
- Supabase: creadas sólo REGION SANITARIA COLOTLAN (3214) y ALMACEN DE REGION
  SANITARIA I (3215), asignadas a DEL REAL QUEZADA OCTAVIO ALONSO. Referencias
  internas provisionales INT-JAL-RS01-COLOTLAN e INT-JAL-RS01-ALMACEN.
- Filtro web Regiones sanitarias y código móvil preparado. UNITS conserva la
  compatibilidad de la APK instalada; UNITS_ONLY separa las sedes en clientes nuevos.
  Estas sedes administrativas no aumentan el denominador de farmacias clínicas.
- Validación: 49 casos enfocados aprobados, PostgreSQL local desechable, catálogo,
  notificaciones y recuperación; TypeScript, build web y sintaxis backend correctos.
  Revisión visual con datos simulados; registro de sedes probado idempotentemente.
- Migración 20261020120000_task_push_notifications.sql probada localmente y
  aplicada a Supabase tras autorización explícita del usuario y dry-run exclusivo.
  Verificadas columna, índice de deduplicación, restricción de origen y RLS.
- Usuario autorizó publicar exclusivamente web/backend y la migración, sin APK.
  Publicación mediante GitHub, Render y Vercel existentes. Los ajustes móviles
  permanecen locales para una futura compilación; no se incluyen en este commit.
  Prueba real de correo/cambio de contraseña y recepción push en dispositivo
  pendiente tras publicación, con cuenta del usuario.

## Indicadores y reportes de ejecución de Farmacias — publicación autorizada (2026-10-19)

- Nuevas vistas web /farmacias/indicadores y /farmacias/reportes para DIRECTOR,
  GERENTE y COORDINADOR. API GET /api/web/farmacias-reports, /options y /export;
  consultas autenticadas, transacciones REPEATABLE READ READ ONLY y no-store.
- Filtros por fechas (hasta 366 días), persona, coordinación, proyecto, entidad y
  jurisdicción. Se conserva jerarquía activa y supervisión compartida de Puebla;
  los totales generales no duplican supervisores. Los visitantes externos sólo
  se incluyen para coberturas autorizadas de una unidad de un titular del ámbito.
- Criterio confirmado: denominador de farmacias con asignación vigente durante
  cualquier parte del intervalo. La cobertura propia exige visita durante la
  vigencia del titular; el apoyo temporal se presenta por separado. Historial por
  farmacia con visitante efectivo, fechas, marcas horarias y cobertura; CEDIS y
  paradas sin farmacia vinculada no incrementan ese denominador.
- Visitas finalizadas por fecha de salida; permanencia real entre entrada/salida,
  dividida por día de Guadalajara sin sumar intervalos superpuestos. No se
  extrapola tiempo para entradas abiertas o marcas inválidas. Indicadores de
  repetición, cumplimiento, registros incompletos y visitas de más de 12 horas.
- Vacaciones aprobadas superpuestas al intervalo, por persona y en días calendario;
  se respetan filtros territoriales. Periodos semanales, quincenales y mensuales.
- Exportación CSV de personal, visitas, unidades, jornada, coberturas, vacaciones y
  periodos, con neutralización de fórmulas. PDF ejecutivo del filtro aplicado.
  Actividades detalladas se consultan sólo para la página visible mediante el
  servicio existente; los indicadores no cargan todos sus textos.
- Detalle web del plan: entrada, salida, duración calculada desde marcas, avance
  de actividades, ejecución, notas y omisiones. No cambia aprobación ni ejecución.
- Validación: 17 casos enfocados, con SQL real sobre PostgreSQL local desechable,
  permisos, Puebla, vacaciones, coberturas canceladas, cambios de titular,
  medianoche/DST, paginación y exportaciones. Build web, sintaxis backend y diff
  correctos. Revisión visual local con datos ficticios y PDF generado por la
  utilidad real; no se accedió ni modificó actividad productiva.
- Publicación de backend y web autorizada explícitamente por el usuario.
  Despliegue mediante el flujo existente de GitHub, Render y Vercel.
  Sin migraciones ni cambios móviles; no requiere compilación de APK.


## Rendimiento del acceso móvil — publicación autorizada (2026-10-19)

- El usuario confirmó ejecución offline y sincronización correctas; solicitó sólo
  optimizar la lentitud del acceso y del flujo local, conservando lo conseguido.
- Eliminada una petición de perfil duplicada inmediatamente después del login
  explícito ya validado. En modo avión conocido se usa el perfil autorizado local
  sin intentar /me ni la renovación explícita del SDK en el arranque. Se conserva
  validación al recuperar conexión, cambio de token, reanudación y reintento periódico.
- La comprobación PBKDF2 de 600,000 iteraciones se ejecuta opcionalmente con el
  proveedor nativo Android en un AsyncFunction de Expo, fuera del hilo JavaScript.
  Mismo SHA256, sal, tamaño, registro v1, límites de intentos y vigencia: no requiere
  borrar credenciales ni datos. Android anterior a 8, Expo Go o módulo no disponible
  conservan el algoritmo JS existente. Sin dependencias nuevas ni cambio de permisos.
- No se modifica check-in/out, GPS, evidencias, colas, fechas, backend ni Supabase.
- Validados 52 casos: 29 de AuthProvider, cinco de credenciales (incluyendo la
  clase Java real con cinco vectores ASCII/Unicode/vacío/NUL/contraseña larga) y
  18 de caché semanal y ejecución offline con SQLite real. TypeScript y diff
  correctos; Expo autolinking detecta y resuelve el módulo Android.
- El usuario autorizó publicar exclusivamente este bloque y generar una nueva APK
  preview. Publicación y compilación EAS en curso; no hay SDK Android local.
  Pendiente medir el inicio con red y en modo avión en el teléfono, instalando
  sobre la APK anterior para conservar información local.

## Mi trabajo ocultaba fechas serializadas con hora — backend (2026-10-19)

- El usuario aclaró que las nuevas paradas aparecen en el plan, pero no en Mi
  trabajo. La corrección anterior de CURRENT_DATE fue insuficiente: DATE de pg
  se devuelve como objeto Date, Express lo serializa con hora y SQLite compara
  scheduled_date exactamente contra AAAA-MM-DD cuando hay descarga semanal.
  La fecha en la base estaba correcta; el listado diario quedaba vacío.
- Normalizado scheduledDate a AAAA-MM-DD en mapPlanItem de mobile.farmacias y
  mapExtraStop. Se conservan nulls, fechas de calendario y marcas de tiempo reales.
  Sin cambios en código de la APK, datos productivos, permisos ni ejecución.
- Nueva regresión usa el mapeador real, serialización JSON y SQLite real de la
  APK: el formato anterior guarda cuatro filas y muestra cero; el corregido muestra
  dos adicionales y una unidad de hoy, dejando la de mañana para su día. Repetir
  sincronización repara fechas con hora ya descargadas y se conserva al reiniciar.
- Validados 18 casos de caché/ejecución offline y nueve de PostgreSQL real; estos
  últimos ahora exigen la fecha exacta sin convertirla desde el propio test.
  Sintaxis y diff correctos. Backend publicado; el usuario confirmó que 519/518
  aparecen en Mi trabajo y que check-in offline y sincronización funcionan.

## Calendario operativo Guadalajara — corrección backend (2026-10-19)

- Confirmado el desfase: Supabase usa UTC y la parada adicional se fechaba con
  CURRENT_DATE; después de las 18:00 de Guadalajara eso corresponde al día siguiente.
- Alta, orden por día, edición y cancelación de paradas adicionales ahora usan
  (CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date. Se alinean las
  vigencias de coberturas, catálogo, asignaciones y sus contadores de Farmacias:
  23 sustituciones puntuales en siete archivos. No cambia el horario de la base,
  los instantes timestamptz/NOW, permisos, rutas ni el flujo offline.
- La APK actual ya calcula el día con America/Mexico_City y recibe la fecha de la
  parada desde el backend. Este ajuste no modifica móvil ni requiere otra APK.
- Prueba PostgreSQL local desechable: consultas reales de alta/edición/cancelación
  en medianoche UTC y local, domingo/lunes, fin de mes/año y distintas zonas de
  sesión de base; se conserva el bloqueo para editar/cancelar días pasados.
  Prueba opt-in: backend/tests/farmaciasTimeZone.test.cjs con TEST_ADMIN_DATABASE_URL
  exclusivamente local; la base de prueba se crea y elimina sin tocar tablas reales.
- Publicación del backend y corrección puntual con auditoría de la parada pendiente
  identificada en curso; no se modificarán visitas ya completadas ni datos Auth.

## Reapertura offline y selector de CEDIS — publicación autorizada (2026-10-19)

El usuario confirmó en la APK preview d2aa4937-6742-4484-b74c-16cc5295b317 que
check-in, evidencias, actividades, check-out y sincronización funcionan. La versión
77027a4 ya fue publicada en main/Render/Vercel. Reportó una nueva observación:
salir y volver a entrar sin red; pidió además separar unidades y CEDIS al agregar visita.

- Farmacias nativo: salir bloquea la aplicación y desmonta los datos de la cuenta,
  conservando la sesión renovable del SDK y las colas existentes. No revoca la
  sesión remota en esta salida local. Se exige el mismo correo y contraseña antes
  de reabrir offline; el primer acceso después de actualizar debe ser online.
  Se guarda sólo un verificador PBKDF2-SHA256 con sal aleatoria en SecureStore,
  nunca la contraseña ni una segunda copia de tokens. Requiere sesión SDK y perfil
  previamente autorizado de la misma cuenta; vencimiento de ocho días desde la
  última validación online y bloqueo temporal tras cinco intentos incorrectos.
  SDK refresh no desbloquea la pantalla de acceso. Revocaciones reales eliminan
  el verificador y bloquean el perfil. Web y Operaciones conservan logout remoto.
- Agregar/editar visita: botones Unidades asignadas y CEDIS, usando el catálogo
  autorizado existente. Filtro opcional kind=UNITS/CEDIS aplicado antes de LIMIT;
  ALMACENES identifica CEDIS. Sin kind se conserva el comportamiento anterior.
  Las coberturas siguen disponibles; respuestas tardías no mezclan categorías.
- Validación: 30 pruebas de autenticación/verificador, cuatro de catálogo y seis
  de ejecución offline; TypeScript, compilación web, export Android con Metro y
  revisión de diff. Sin cambios de esquema, datos, .env ni flujos de ejecución.
- El usuario autorizó publicar únicamente estos cambios y compilar otra APK
  Android preview. Se publica en el mismo backend de Render y rama main, con las
  conexiones de Supabase/Render y firma de Android existentes. Sin migraciones,
  modificaciones de datos, .env ni credenciales. Publicación/compilación en curso;
  pendiente la prueba física de salir y reabrir en modo avión y del selector CEDIS.

## Publicación autorizada y APK preview (2026-10-19)

El usuario autorizó commit, push y despliegue de lo validado, seguido de APK
preview. Tras su aviso de espera se corrigió y probó la ejecución completa offline
y se aplicó la columna estado solicitada; se retoma la publicación del alcance
acordado. Objetivo Render confirmado: My Workspace, optimizador-rutas-api,
srv-d79i0m6dqaus73dgq3sg, rama main; se conserva configuración y conexiones.
Firebase cliente y FCM V1 están verificados en EAS preview, firma existente intacta.
Ningún archivo .env, configuración Firebase local o clave privada entra en Git.
La verificación final en Android físico se hará con la nueva APK de pruebas.

## Ejecución completa offline y columna estado (2026-10-19)

- El usuario confirmó prueba en APK instalada y solicitó check-in, actividades,
  fotos y check-out sin internet, con sincronización al recuperar la conexión.
  Se implementó cola transaccional sobre execution_outbox existente y progreso
  local por cuenta. Guardar la foto offline no espera llamadas de red. La UI
  distingue progreso local provisional, pendientes y errores del servidor.
- Backend: endpoint Farmacias /offline-execution, sólo perfil activo propietario,
  plan aprobado y no archivado, fecha de captura, geocerca/GPS/asignaciones y
  evidencia READY antes de cerrar actividades/visita. Conserva hora capturada
  y registra hora de recepción; ventana de envío de ocho días. Usa work_plan_event
  como recibo idempotente, sin tablas nuevas. Un bloqueo por persona serializa
  inicios online/offline. No duplica visitas al reintentar ni repone caché sobre
  avance local aún pendiente. Los conflictos conservan los datos para revisión.
- Cliente: la conexión normal conserva sus endpoints. Al estar offline o existir
  ejecución pendiente se usa la cola, incluso para las visitas siguientes. Al
  reconectar procesa check-in → fotos → actividades → check-out, con confirmación
  del servidor, aislamiento de cuenta y reintento manual de errores definitivos.
  No se habilitan reprogramaciones, cancelaciones ni altas nuevas offline.
- Validado con SQLite real: dos visitas completas y fotos, reinicio de servicios,
  reintentos, errores, GPS, solapamiento, evidencia y cambio de cuenta. PostgreSQL
  aislado comprobó las mismas transiciones, horas/duración, transacciones,
  duplicados concurrentes y rechazos. TypeScript y pruebas relacionadas aprobados.
  Falta comprobar el comportamiento en Android físico con una APK nueva.
- Solicitud adicional explícita: aplicada 20261019160000_personas_estado.sql,
  previa prueba PostgreSQL aislada y dry-run que mostró sólo esa migración.
  public.personas.estado identifica 25 supervisores activos de Jalisco y 5 de
  Puebla según ámbitos existentes. No crea Auth ni modifica auth_user_id:
  siguen sin enlace 22 de Jalisco y 5 de Puebla. El usuario hará sus cuentas/enlaces.
  La columna es informativa; los permisos siguen basados en person_state_scope.

## Revisión offline previa a publicación (2026-10-19)

El usuario detuvo la publicación antes de commit/push/despliegue y antes de una
nueva APK: reporta pérdida de sesión y check-in sin conexión bloqueado. Se mantiene
esa pausa. Confirmado que check-in/out y resolución de actividades actuales llaman
al servidor; P0.1 sólo cubre lectura/caché, evidencia pendiente y tareas, por lo que
no constituye ejecución completa de visitas offline. No se presenta como resuelto.

Reproducido con prueba fallida: una respuesta 401 de token vencido seguida de
AuthRetryableFetchError durante refresh marcaba unauthorized y bloqueaba el perfil
descargado. Corregido localmente para conservar el perfil previamente validado
de esa misma cuenta cuando falla la red al renovar. Un rechazo real del refresh,
un 403 o un 401 persistente con sesión renovada siguen bloqueando la reutilización.
20 pruebas de autenticación y TypeScript móvil aprobados; incluye arranque en frío
con token vencido y red caída. El usuario confirmó APK y flujo completo; su implementación posterior está descrita
en la sección anterior. Falta la prueba física en modo avión con una APK nueva.

## Aprobación de planes y notificaciones Android (2026-10-19)

- Corregida la autorización de planes: coordinador directo/compartido Puebla o gerente de la estructura pueden revisar planes de supervisor; sólo gerente directo revisa planes de coordinador. La misma función SQL gobierna acciones, bandejas y capacidades web/móvil. Se conservan permisos de cancelaciones y el paso de lectura del Director; el servicio no le permite aprobar planes.
- OfflineStatus usa conectividad real de NetInfo y no muestra el banner por caché/recuperación heredada cuando hay internet. Mis planes conserva acceso a recuperación.
- Preparadas notificaciones Expo Android para envío/aprobación y notificación local de sincronización completa. Colas aisladas por cuenta, drenaje concurrente deduplicado, reintentos/recibos y desactivación de tokens inválidos; errores de push no revierten planes. Los pendientes fallidos/ejecuciones heredadas impiden anunciar finalización.
- Dependencias compatibles SDK 54: expo-notifications, expo-device y NetInfo; plugin Expo y ruta opcional GOOGLE_SERVICES_JSON, sin modificar .env/conexiones.
- Migración aditiva `20261019140000_plan_approvals_notifications.sql`: probada en PostgreSQL aislado; inicialmente la revisión automática bloqueó su aplicación. Posteriormente el usuario confirmó haber ejecutado el SQL en Supabase. Se verificaron función, columnas, restricciones, índices, RLS y permisos; se registró exclusivamente la versión como aplicada con migration repair, sin repetir DDL ni modificar planes/personas. Historial alineado con el repositorio.
- Firebase: el usuario entregó google-services.json del proyecto appderutas; paquete mx.appderutas.supervision validado. Instalado como mobile/google-services.json, ignorado por Git. app.config.js permite usarlo localmente y prioriza GOOGLE_SERVICES_JSON para EAS. Prueba de configuración local/remota aprobada. Tras autorización explícita del usuario, se subió a @borderline97/app-de-rutas en Expo/EAS exclusivamente al entorno preview como variable de tipo archivo, visibilidad secret, nombre GOOGLE_SERVICES_JSON. Creación y presencia en preview verificadas; no se modificó production. FCM V1: tras la carga del usuario, EAS credentials (perfil preview) confirmó la credencial de cuenta de servicio del proyecto Firebase appderutas asociada al identificador mx.appderutas.supervision. No se descargó la clave privada ni se alteró la firma existente. Faltan backend actualizado, nueva APK y prueba real de recepción; instrucciones y prueba Android en docs/mobile/NOTIFICATIONS.md. No se envió push real, no se compiló otra APK, no hubo commit/push/despliegue.
- Verificación: compilación web y TypeScript móvil aprobados; pruebas focalizadas de permisos, offline, aislamiento de cuentas y notificaciones; integración PostgreSQL con aprobación transaccional y proveedor de push simulado. Falta verificación física de Android con FCM.

## Almacén compartido de Jalisco (2026-10-19)

Registrado en Supabase `CEDIS METROPOLITANO AEROPUERTO` como `ALMACENES`,
referencia existente `CMAE`, unidad 3213, estado Jalisco/proyecto JALISCO.
Coordenadas solicitadas conservadas en coordenadas_raw; campos geográficos
20.4979202, -103.2754570 (precisión del esquema), con geometría validada.
Se aplicó sólo `20261019120000_shared_plan_warehouse.sql`, tras prueba PostgreSQL
local aislada y dry-run. La tabla aditiva pharmacy_shared_plan_access habilita
el almacén a los 25 supervisores activos con ámbito explícito Jalisco y a los
futuros supervisores que cumplan esa regla. No crea titularidad exclusiva ni
modifica las asignaciones o el CEDIS de Operaciones.
Código local: catálogo/filtros, alta/edición, detalle y envío de planes ordinarios
y extraordinarios reconocen el acceso compartido. Web y móvil lo identifican
como Almacén con referencia CMAE. Build web, TypeScript, ocho pruebas de edición,
sintaxis y flujos reales contra PostgreSQL temporal aprobados. La carga de datos
se probó dos veces sin duplicar. Se comprobó rechazo para otros estados, perfiles
inactivos, otros roles y permisos revocados.
Pendiente desplegar el código backend/web y compilar una APK que incluya estas
últimas etiquetas; la compilación enviada antes de este cambio no las incorpora.
No hubo commit, push, despliegue, cambio de .env ni una segunda compilación Expo.

## APK interna de pruebas (2026-10-19)

Compilación solicitada y enviada en Expo EAS con perfil `preview` (Android APK,
distribución interna), conservando la firma existente y las variables del entorno
preview: Render `https://optimizador-rutas-api.onrender.com` y Supabase
`sgmezyynqhahzmfrehou`. No se modificaron conexiones, cuentas ni servicios.
Build: `528890b2-3635-4a37-b662-fc5c8fced7e1`, pendiente en cola de Expo.
Incluye los cambios locales móviles; no despliega los cambios locales del backend.
No hubo commit, push, publicación en tiendas ni cambios de `.env`.

## Puebla y descarga semanal (2026-10-18)

Bloque implementado en `prod-hotfix`, rama `hotfix/coordinator-web-production`,
sobre HEAD `8c84431`, conservando los cambios offline P0.1 que ya estaban pendientes.

- Se aplicó exclusivamente la migración aditiva
  `20261018120000_puebla_shared_reporting_availability.sql`, con RLS y sin acceso
  directo de anon/authenticated a las tablas nuevas. La simulación propuso sólo
  esa migración. Se validó antes en una base PostgreSQL local aislada, eliminada
  al terminar; la base local `rutas` no se utilizó para ensayar escrituras.
- Supabase: creados cinco perfiles SUPERVISOR y dos COORDINADOR del Excel
  DISTRIBUCIÓN SUPERVISORES APP.xlsx. No se crearon cuentas de autenticación;
  sus auth_user_id están vacíos. Ambos coordinadores dependen del perfil existente
  de DAMARIS RODRIGUEZ PATRICIO. Los cinco supervisores conservan un padre canónico
  (Antonio) por compatibilidad y diez relaciones explícitas habilitan a Antonio
  y Juan Alejandro como coordinadores inmediatos compartidos, sólo en Puebla.
- Los 37 CLUES del Excel existen y quedaron asignados 7/9/9/7/5 a José Luis,
  Juan Antonio, Alejandro, Guillermo y Julián. Su proyecto ya era PUEBLA pero
  estado decía Chiapas: se corrigió únicamente estado a Puebla, con autorización
  expresa. No se cambiaron nombres, coordenadas ni datos de otros proyectos.
  La carga fue transaccional, auditada e idempotente; no reemplaza otros titulares.
- Vacaciones: petición del supervisor y revisión por cualquiera de los dos
  coordinadores autorizados, con fechas, comentario, estados y revisor. Se impiden
  cruces de fechas y doble revisión concurrente. No se desactivan cuentas ni se
  modifican planes aprobados. Panel disponible en Planes web/móvil y aprobaciones
  móviles; el resto de estados conserva sus permisos.
- Planes: Supervisor envía al coordinador; Coordinador envía al gerente.
  Toda cobertura registrada por coordinador o gerente se aprueba automáticamente,
  incluso si las visitas las hace un supervisor, manteniendo validación de ámbito.
  Las asignaciones permanentes conservan su flujo de aprobación existente.
- Descarga semanal móvil: consulta con scope=week, lunes a domingo en zona México;
  el endpoint sin parámetro sigue sirviendo el día para versiones anteriores.
  SQLite conserva la semana y filtra el día local, con refresco al volver al primer
  plano y cambio de fecha. Se conservan aislamiento por cuenta, actividades,
  evidencias, recuperación heredada y protección de pendientes.
- Comprobaciones: build web y TypeScript móvil aprobados; permisos de aprobación,
  SQLite semanal y fallos de red comprobados. PostgreSQL aislado verificó carga
  repetida sin duplicados, Jalisco intacto, vacaciones concurrentes y coberturas.
  Falta la prueba con cuentas reales y un teléfono en modo avión, y desplegar
  backend/web más generar manualmente la compilación móvil para activar el código.
- Sin cambios de .env, autenticación, Operaciones ni Calculador CEDIS. Sin commit,
  push ni despliegue de código; sin compilación Expo/EAS.

## Offline móvil P0.1 (2026-10-16)

Implementada recuperación offline del perfil validado por backend y del plan de
la misma cuenta. Supabase conserva la propiedad de la sesión; NETWORK_ERROR no
borra la caché ni las colas. SQLite se aísla por ID de Supabase y los callbacks
asíncronos no escriben en el espacio de otra cuenta. Logout y denegación real del
servidor ocultan datos, conservando pendientes. La UI informa SIN CONEXIÓN,
última sincronización y falta de datos descargados.

El reemplazo del plan se aplaza si afectaría evidencias/ejecuciones pendientes.
Ticket, Storage y confirmación de evidencias conservan su funcionamiento.
Se añadió recuperación explícita online desde `local.db`, previa validación de
perfil y propiedad exacta mediante endpoints existentes. La fuente y las fotos
se conservan sin migrar, mover ni borrar. Un journal separado reserva tabla/ID/
hash a una sola identidad; transacciones y recibos permiten reanudar sin duplicar
operaciones consumidas ni reasignar registros tras cambiar de cuenta. Visitas
huérfanas se reconstruyen sólo desde planes del propietario exacto. El historial
recuperado sobrevive a sincronizaciones sin sustituir un plan actual. La copia
no sube evidencias ni ejecuta pendientes. Tareas mutables no demuestran autoría:
pendientes de Agenda sin prueba permanecen conservados sin asignarse; comentarios
ya confirmados se registran SYNCED. No se accedió a datos físicos del piloto.
No se modificó backend, WebApp, módulo Operaciones ni esquema remoto.
No se inició P0.2/P0.3 ni se ejecutaron commit, push o deploy.

Pruebas y reproducción nativa: [OFFLINE_P0_1.md](mobile/OFFLINE_P0_1.md).
Validación local: 71/71 pruebas automatizadas aprobadas, TypeScript sin emisión
aprobado y `git diff --check` sin errores. Sigue pendiente la prueba Android/iOS
de actualización conservando datos, recuperación interrumpida, fotos físicas,
modo avión y reintento real. Los registros sin autor demostrable siguen retenidos
por política; nunca se atribuyen a la cuenta actual por inferencia.

## Agenda Operativa (2026-09-18)

Se completó el bloque funcional de Agenda reutilizando `operational_task`,
`operational_task_comment`, `operational_task_event` y `visit_evidence`.

- El backend comparte una sola política para web y móvil, valida jerarquía en
  listados y mutaciones, filtra por estado, prioridad, responsable y rango de
  vencimiento, y expone creación, edición, cancelación, transiciones, detalle,
  comentarios, historial y evidencias.
- La auditoría de creación, edición y estado continúa a cargo del trigger
  existente. Los comentarios agregan su evento explícito.
- La web de Farmacias incorpora `/farmacias/agenda` para DIRECTOR, GERENTE,
  COORDINADOR y SUPERVISOR. Los perfiles con estructura pueden asignar tareas;
  SUPERVISOR crea tareas personales y conserva únicamente sus permisos válidos.
- La app móvil completa Agenda con agrupación, filtros, tarea personal, detalle,
  comentarios, historial, evidencia y acciones autorizadas.
- La web de Farmacias visualiza evidencias `READY` tanto en tareas de Agenda
  como en visitas del detalle del plan. El backend valida primero la jerarquía,
  mantiene el bucket privado y entrega URLs firmadas con vigencia de cinco
  minutos sin exponer `storage_bucket` ni `storage_path`.
- SQLite conserva la última respuesta sincronizada y una cola de estados y
  comentarios. Cada elemento usa un UUID de idempotencia; el backend lo registra
  en el evento de estado o lo usa como identificador del comentario. La misma
  clave acompaña el primer intento y cualquier reintento, evitando duplicados si
  el servidor guardó una acción pero el móvil perdió la respuesta. La pantalla
  muestra operaciones rechazadas y permite reintentarlas o descartarlas con
  confirmación.

El esquema vigente cubre este bloque y no fue necesario crear ni modificar
migraciones. La creación de tareas sin conexión queda fuera de este bloque; se
requiere conexión porque no se solicitó una política de conciliación para tareas
nuevas y sus identificadores temporales.

Validación local: 16/16 pruebas de Agenda y evidencias aprobadas, build web
de producción con Vite aprobado, TypeScript móvil aprobado y revisión de diff
sin errores. No se ejecutaron Supabase, SQL, migraciones, Expo, EAS, Gradle,
push ni deploy.

Actualizado: 2026-09-18

## Repositorio activo

- Ruta Windows: `C:\\Proyectos-program\\optimizador-rutas\\optimizador-rutas`
- Rama base: `main`.
- HEAD base: `4112578add2ad1327980c36af4760455f3b5c017`.
- Remoto: `origin/main` apunta al mismo commit.
- Agenda fue implementada y validada en un worktree aislado antes de su
  integración al checkout principal. La prueba manual con roles reales y el
  despliegue permanecen pendientes.

## Último bloque funcional confirmado

F8B.5 móvil está implementado, validado, confirmado y enviado al remoto:

```text
21d9f87 feat: execute planned visit activities on mobile
```

Archivos del bloque:

- `mobile/src/types/mobilePlan.ts`
- `mobile/src/lib/api.ts`
- `mobile/storage/db.ts`
- `mobile/src/services/planSync.ts`
- `mobile/app/unit/[id].tsx`

Alcance principal:

- tipos y respuestas para actividades de visita;
- endpoints móviles DONE y SKIPPED;
- almacenamiento y sincronización SQLite;
- resolución de actividades en la pantalla de visita;
- motivo obligatorio para SKIPPED;
- bloqueo de checkout con actividades pendientes;
- compatibilidad con visitas históricas sin actividades;
- exclusión de EXTRA_STOP del flujo de actividades.

Validaciones registradas:

- TypeScript móvil correcto;
- `git diff --check` correcto;
- pruebas SQLite de inserción, reemplazo, rollback y cascada;
- aplicación y restauración byte por byte del helper transitorio usado para F8B.5.

## Supabase CLI y Docker

Estado confirmado el 2026-09-17:

- Supabase CLI `2.117.0` está instalado como dependencia de desarrollo en la raíz.
- `supabase init` creó `supabase/config.toml`.
- El inicio de sesión y `supabase link` están completos. El identificador remoto no se documenta aquí.
- Docker Desktop `29.8.0` funciona sobre WSL2.
- La distribución `docker-desktop` está activa con WSL versión 2.
- El stack local de Supabase inicia correctamente en Docker.
- El seed local está desactivado mientras no exista `supabase/seed.sql`.

## Línea base del esquema remoto

`npx supabase db pull` generó:

```text
supabase/migrations/20260917181330_remote_schema.sql
```

La línea base tiene 1,186 líneas, contiene esquema y permisos, y no contiene filas de negocio, contraseñas, tokens ni cadenas de conexión.

El CLI registró automáticamente la versión `20260917181330` como aplicada en el historial remoto. Esto modificó únicamente el historial de migraciones de Supabase; no cambió tablas ni datos de la aplicación. La lista local y remota quedó alineada en esa versión.

Comparación con `backend/sql/`:

- paradas adicionales y cancelación ya están reflejadas en el remoto;
- `supervisor_territorial_origin` ya está reflejada en el remoto;
- la ejecución de `pharmacy_activity` todavía no está en el remoto;
- `visit_geofence_attempt` todavía no está en el remoto.

## Riesgo de acceso público confirmado

Una comprobación de solo lectura con la clave pública confirmó filas visibles sin sesión en:

- `public.personas`;
- `public.farmacia`;
- `public.work_plan`.

La línea base concede permisos amplios a `anon` y `authenticated`, mientras 24 de las 29 tablas de la aplicación no tenían RLS. La web y el móvil usan Supabase directamente solo para autenticación; las operaciones de negocio pasan por el backend PostgreSQL.

La conexión PostgreSQL configurada para el backend fue comprobada y puede omitir RLS, por lo que el cierre del Data API no bloquea el acceso normal del backend.

## Migraciones aplicadas y verificadas

```text
20260917182000_pharmacy_activity_execution.sql
20260917182100_visit_geofence_attempt.sql
20260917182200_lock_down_public_api.sql
```

Detalles:

- la migración de actividades agrega estado, ejecución, auditoría y orden;
- el backfill de `ord` fue corregido para ordenar varias actividades existentes como `1..N` por visita, evitando duplicados;
- la migración de geocerca crea la tabla de auditoría y sus índices;
- la migración de seguridad habilita RLS en las 29 tablas propias de la app y revoca permisos de tablas, vistas y secuencias a `PUBLIC`, `anon` y `authenticated`;
- los objetos internos de PostGIS quedan intactos;
- los privilegios predeterminados quedan cerrados para objetos futuros.

Validación local realizada desde una base vacía:

- las cuatro migraciones se aplican en orden;
- fixture con dos actividades previas convertido a órdenes `1` y `2`;
- diez columnas de ejecución presentes en `pharmacy_activity`;
- `visit_geofence_attempt` presente;
- RLS activo en las 29 tablas de la aplicación;
- cero privilegios de tabla para `anon` y `authenticated`;
- TypeScript móvil correcto;
- build web correcto;
- archivos JavaScript relacionados pasan `node --check`;
- `git diff --check` correcto.

El ensayo remoto `npx supabase db push --dry-run` enumeró únicamente estas tres migraciones. Después de la autorización del usuario, `npx supabase db push --yes` las aplicó correctamente al proyecto enlazado.

Verificación posterior sobre el remoto:

- las cuatro versiones aparecen alineadas entre local y remoto;
- Auth responde correctamente con la clave pública;
- la clave pública ya no obtiene filas de `personas`, `farmacia`, `work_plan` ni `pharmacy_activity`;
- un dump de solo esquema confirmó las diez columnas de ejecución, el índice único de orden, `visit_geofence_attempt`, sus dos índices y RLS en las tablas comprobadas;
- no se descargaron ni mostraron filas de negocio ni secretos durante la comprobación.

## Estado local sin commit

El árbol de trabajo contiene la instalación/configuración de Supabase, la línea base, las tres migraciones ya aplicadas, la corrección del SQL histórico y estos archivos de continuidad. Revisar `git status --short` antes de cualquier commit.

No se ha hecho commit, push de Git, merge ni despliegue de estos cambios.

## Siguiente bloque: piloto con dos supervisores

Se recuperó el objetivo más reciente de la conversación “Continuar app de rutas”. El usuario quiere dejar la aplicación lista para pruebas reales con dos supervisores.

El siguiente bloque debe abarcar, en este orden:

1. revisar y consolidar el estado Git actual sin perder cambios;
2. definir la arquitectura mínima de prueba para frontend, backend y Supabase, comparando Vercel más un backend administrado frente a un VPS;
3. preparar configuración de producción, variables, CORS, URLs de Auth, secretos, salud, logs y límites;
4. auditar seguridad de autenticación, API, permisos, datos, geolocalización y dependencias;
5. preparar dos usuarios supervisores y datos de prueba sin inventar correos o contraseñas;
6. compilar una versión instalable de la app móvil y documentar su distribución;
7. ejecutar pruebas completas de inicio de sesión, planes, sincronización, trabajo sin conexión, check-in/out, actividades, geocerca, aprobaciones y reportes;
8. entregar una lista final de incidencias, correcciones y pasos de despliegue.

El encargo reutilizable está en `docs/CODEX_HANDOFF.md`.

## Límites de seguridad

- No ejecutar `supabase db reset --linked` contra el proyecto remoto.
- No aplicar seeds al proyecto remoto.
- No mostrar ni guardar tokens, contraseñas, claves de servicio o cadenas de conexión.
- No ejecutar cambios destructivos de datos sin autorización explícita y una copia verificable.
- Tratar el proyecto remoto como un entorno con datos que deben preservarse.

## 2026-10-20 - Destino de recuperacion de contrasena web

- Proyecto Supabase sgmezyynqhahzmfrehou: corregida exclusivamente la configuracion Auth de destinos; Site URL pasa de http://localhost:3000 a https://optimizador-rutas-theta.vercel.app y se autoriza el retorno exacto https://optimizador-rutas-theta.vercel.app/?password=recovery.
- CLI config diff previo: dos propiedades declaradas; config push confirmo dos propiedades aplicadas y nueve propiedades remotas no declaradas conservadas. Verificacion posterior: cero cambios declarados pendientes. Pagina publicada de recuperacion: HTTP 200.
- Sin cambios de codigo funcional, credenciales, usuarios, esquema, backend o APK. No se envio correo ni se cambio ninguna contrasena durante la validacion. Sin commit, push ni despliegue.
- Pendiente: usuario debe solicitar un enlace nuevo y completar el cambio; la captura anterior devolvio otp_expired y el enlace anterior no se reutiliza. La disponibilidad HTTP y configuracion verificadas no sustituyen esa prueba real.
## 2026-10-20 - Retorno automatico al login tras restablecer contrasena

- src/components/PasswordAccess.vue: exclusivamente mode=reset, despues de actualizar la contrasena y cerrar la sesion local correctamente, emite close para salir del formulario de recuperacion y mostrar el login existente. Comprueba errores de signOut antes de salir. Los modos forgot y change conservan su comportamiento.
- Validacion: cinco comprobaciones del componente compilado con Auth simulado (exito, fallo de actualizacion, fallo de cierre, solicitud de enlace y cambio dentro de sesion); npm run build aprobado, advertencia de tamano existente. Sin correos reales ni cambios de contrasenas de usuarios.
- Publicacion web autorizada expresamente por el usuario. Commit limitado al componente y este registro; Vercel mediante origin/main. Sin cambios de backend ni APK. Cambios moviles preexistentes conservados y excluidos del commit. Prueba final con enlace real pendiente del usuario.

## 2026-10-21 - Actividades adicionales durante una visita movil (local)

- Solicitud limitada a agregar actividades despues del check-in, conservando las precargadas. Se confirmo que antes solo se podian resolver las existentes.
- mobile/app/unit/[id].tsx y AddVisitActivityModal.tsx: boton Agregar actividad adicional solamente en farmacia de plan activa, con descripcion y nota opcional. No permite crear antes del check-in ni despues de finalizar; conserva el limite existente de 50 actividades por visita.
- executionSync.ts y evidenceSync.ts: creacion atomica en cache y cola, UUID estable para reintentos, primero actividad y despues fotografia/resultado. Conserva pendientes al reiniciar y la comprobacion habitual de evidencia antes de resolver y finalizar. La sincronizacion confirma que el servidor devolvio la nueva actividad.
- backend/services/offlineVisitExecution.service.js: nuevo evento ACTIVITY_ADDED en el endpoint existente, con los mismos controles de identidad, propietario, plan aprobado, visita activa, orden de captura y cancelaciones. Inserta al final sin reemplazar actividades, registra auditoria y reutiliza el recibo idempotente. No cambia la huella de eventos antiguos. No requiere migracion.
- Validacion focalizada aprobada: 33 comprobaciones de ejecucion offline/evidencias; siete comprobaciones del backend con PostgreSQL local desechable, incluidos reintentos, permisos, concurrencia y limite de actividades. Tras precisar la prueba de espera de evidencia se repitio solo la suite de ejecucion afectada (ocho aprobadas). TypeScript movil y node --check del servicio aprobados. Revision del diff sin errores.
- Usuario autorizo publicar este bloque en backend y compilar APK Android preview para probar con red y modo avion. Publicacion limitada a los archivos de actividades adicionales y sus pruebas. La APK se prepara desde una copia limpia del commit; quedan excluidos los otros cambios moviles locales pendientes. Sin migraciones ni cambios de datos productivos. Validacion fisica pendiente.
