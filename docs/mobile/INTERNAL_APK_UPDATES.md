# Actualización de APK desde APP DE RUTAS

## Flujo del usuario

1. Una sola instalación manual incorpora este sistema en las APK ya distribuidas. No cambia paquete ni keystore.
2. Al usar la app con conexión, aparece el aviso de versión aprobada disponible. También se puede buscar desde Perfil.
3. Pulsar **Actualizar** inicia la descarga dentro de la app y muestra progreso. No abre navegador, enlace ni carpeta Descargas.
4. Se verifican tamaño, SHA-256 del archivo aprobado, paquete, código de versión y los mismos certificados firmantes de la app instalada. Ningún error se resuelve desinstalando.
5. Si Android no permite a APP DE RUTAS solicitar instalaciones, se abre su pantalla de permiso. Se concede una vez y, al volver, se continúa automáticamente. Si se rechaza, no se vuelve a abrir en bucle: el usuario puede pulsar Dar permiso y continuar.
6. Se abre directamente la confirmación del instalador de Android; el usuario confirma la actualización. No se promete instalación silenciosa, omitir protecciones ni una cantidad idéntica de pantallas en todos los fabricantes.
7. Android reemplaza el programa conservando su espacio de datos cuando firma/paquete son compatibles. En el arranque de la nueva versión se limpian sólo las copias `update-N.apk` del directorio privado de actualizaciones cuyo código ya está instalado. No se borran APK antiguas de Descargas ajenas a este sistema, fotos, SQLite, sesiones, planes ni pendientes.

Antes de actualizar se recomienda terminar la visita activa y sincronizar los pendientes. La app no bloquea el trabajo offline ni obliga a actualizar.

## Consulta y descarga

- Consulta independiente de Auth/sincronización: arranque diferido diez segundos, al regresar al primer plano o recuperar conexión. Como máximo una consulta automática exitosa cada doce horas dentro del proceso; reintentos separados por cinco minutos. No es push con la app cerrada.
- Consulta de versión con timeout de ocho segundos y solicitudes simultáneas deduplicadas. No espera su respuesta para iniciar sesión o ejecutar visitas.
- La descarga se hace sólo tras pulsar Actualizar, desde la ruta fija HTTPS del backend `/api/app/android/download?versionCode=N`. Ninguna URL proporcionada por notas/metadatos puede lanzar otro archivo.
- La descarga usa caché privada, máximo 512 MiB por APK; informa progreso y pausa ante dos minutos sin avances. Una transferencia incompleta no se instala. Se puede reintentar sin afectar registros de trabajo.
- Verificación de publicación antes y después de la descarga. Una versión retirada/reemplazada no abre el instalador; no hay instalación automática de cada compilación de Expo.
- Al volver desde permisos o reintentar tras cancelar Android, reutiliza el archivo completo en caché, verifica de nuevo publicación e integridad y vuelve a abrir el instalador. Una validación fallida descarta sólo esa copia de actualización y permite descargar otra vez.
- La política nativa rechaza paquete incorrecto, código distinto al anunciado, versión igual/anterior y certificados distintos. La firma no se regenera ni se rota con este bloque.
- El FileProvider no está exportado y comparte mediante permiso temporal de lectura únicamente `cache/app-updates/`, nunca el directorio general de datos. La única facultad nativa nueva es solicitar instalaciones mediante `REQUEST_INSTALL_PACKAGES`.

## Versión de pruebas y versión aprobada

El usuario prueba la APK preview y **después decide cuál aprobar**. El resultado FINISHED de Expo no equivale a aprobación.

1. Conservar `mx.appderutas.supervision`, proyecto EAS `2e1997e4-1a88-4623-afe6-3a3a58a95998`, entorno preview y la misma keystore. Las claves privadas no se guardan en este repositorio.
2. `eas.json` usa numeración remota e incremento automático en preview. Antes de la primera compilación, consultar/inicializar el contador para que supere todas las APK distribuidas; `app.json:1` no acredita lo instalado. Publicación autorizada el 23/10/2026: el contador se inicializa desde el último código utilizado (1); preview incrementa automáticamente en la siguiente compilación.
3. Compilar sólo con autorización. Probar en un Android real actualización sobre la anterior, flujo offline, conservación de pendientes y permisos. El usuario entrega/aprueba la APK exacta que pasó estas pruebas.
4. Desde mobile, obtener `eas build:view <UUID> --json` de esa build terminada. Guardar los metadatos en un archivo temporal fuera de los archivos versionados; nunca credenciales.
5. Desde raíz ejecutar: `node backend/scripts/prepare-android-release.mjs --build-json <metadatos.json> --apk <APK_aprobada.apk> --notes-file <notas.txt>`.
6. El preparador comprueba proyecto, plataforma Android, perfil preview, distribución interna, estado FINISHED y código creciente. Calcula tamaño y SHA-256 del archivo aprobado y verifica que sean idénticos a los del artefacto permanente de Expo. Rechaza links temporales, otros hosts y AAB. Si falla, no modifica el manifiesto.
7. Sólo prepara localmente `backend/config/android-release.json`. Revisar ese diff y publicar el backend con autorización. La app verá la versión habilitada; no necesita otra APK sólo para anunciarla. Mantener disponible ese artefacto en Expo.
8. Para nuevas actualizaciones, repetir aprobación/preparación/publicación del manifiesto. No se envían enlaces a cada usuario ni se promueve automáticamente cada build de pruebas. No existe un endpoint público de escritura ni se automatiza el consentimiento del responsable.

## Estado y contingencias

- Manifiesto inicial `{"release":null}`: ninguna APK previa se publicó ni se inventaron hashes. No hay canal activo hasta publicar backend y habilitar una APK aprobada.
- APIs nuevas de sólo lectura: `/api/app/android/release` y descarga del código vigente. Sin caché. Sólo contienen información de versión y el archivo de la app; no exponen usuarios ni datos operativos. El binario no tiene control de descarga por cuenta; el uso de la aplicación conserva la autenticación y permisos existentes. Si se exige distribución restringida a dispositivos/cuentas, se requiere otro bloque.
- Retirada: publicar `release:null` con autorización y registrar el último código distribuido. Corrección: una APK con código mayor a todas las distribuidas. No pedir desinstalar para regresar de versión.
- No se implementa EAS Update/OTA, Play Store, MDM ni instalación silenciosa. No se compila ni se publica automáticamente.
- Pruebas realizadas: metadatos/rutas/fingerprint del backend; consulta/temporización/consentimiento de actualización; descarga/reintentos/permisos/retiro/errores; política Java real de integridad, identidad, versión, firma y límites. Expo detecta el módulo local; TypeScript y sintaxis aprobados. Estas pruebas no equivalen a ejecutar el instalador de Android.
- Pendiente obligatorio antes de distribuir: compilar el módulo en la primera APK y comprobar en Android real descarga, concesión/rechazo del permiso, cancelación/reintento, pantalla del instalador, actualización conservando sesión/datos offline y limpieza exclusiva del APK privado después del arranque actualizado. El usuario autorizó publicar el sistema y compilar una APK preview el 23/10/2026. Esta autorización no promueve la APK de pruebas como versión aprobada para todos los usuarios; se mantiene release:null hasta aprobar una APK exacta.

## Referencias

- Android, acciones del instalador: https://developer.android.com/reference/android/content/pm/PackageInstaller.SessionParams
- Android, compartir sólo un directorio con FileProvider: https://developer.android.com/training/secure-file-sharing/setup-sharing
- Expo, numeración: https://docs.expo.dev/build-reference/app-versions/
