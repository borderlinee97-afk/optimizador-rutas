# Herramientas de publicación y pilotos

Estos comandos son operaciones explícitas de mantenimiento. El arranque de la API y la pipeline habitual no los ejecutan automáticamente. Las pruebas regulares están en `backend/tests/`.

## Preparar una versión Android

Desde la raíz:

```text
node backend/scripts/prepare-android-release.mjs --build-json <metadatos-EAS.json> --apk <APK-aprobada.apk> --notes-file <notas.txt>
```

Comprueba la huella SHA-256 y el tamaño de la APK aprobada contra el artefacto de Expo y actualiza únicamente `backend/config/android-release.json`. Requiere la APK probada y los metadatos de su compilación. No compila ni publica por sí solo. Sigue el [procedimiento de actualizaciones internas](../../docs/mobile/INTERNAL_APK_UPDATES.md).

## Ejecutar la prueba integral del piloto

```text
npm run test:pilot:e2e --prefix backend
```

Requiere Supabase CLI y el entorno local completo iniciado desde la raíz. Consulta la configuración local mediante la CLI, utiliza Auth, PostgreSQL y Storage locales, crea datos ficticios y comprueba aislamiento, ejecución y evidencia. Es una comprobación adicional a la pipeline PostgreSQL habitual.

## Preparar cuentas de un piloto

```text
npm run pilot:users:preview --prefix backend
npm run pilot:users:apply --prefix backend
```

`preview` valida la configuración requerida sin crear usuarios. `apply` crea o vincula dos supervisores en Auth y en `personas`, y puede actualizar el perfil de una cuenta existente. Define `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` y las variables `PILOT_SUPERVISOR_1_*` y `PILOT_SUPERVISOR_2_*` para correo, nombre y contraseña mediante el entorno local no versionado. Usa `PILOT_MANAGER_EMAIL` si no existe un gerente único.

La aplicación sólo se ejecuta con autorización del responsable y después de confirmar el proyecto y los usuarios objetivo. El restablecimiento de contraseñas existentes exige además `PILOT_RESET_EXISTING_PASSWORDS=true`. No guardes credenciales en este directorio.
