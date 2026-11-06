# APP DE RUTAS

Sistema de planificación, aprobación, agenda y ejecución de visitas de supervisión. Incluye web Vue, API Express, aplicación Android Expo/React Native y migraciones PostgreSQL/Supabase.

## Estructura

- `src/`, `public/`: web, recursos y manual descargable.
- `backend/`: API, permisos, auditoría y pruebas.
- `mobile/`: Android, almacenamiento por cuenta, ejecución offline y sincronización.
- `supabase/migrations/`: historial versionado del esquema.
- `docs/manual/`: manual de usuario, también disponible dentro de web y móvil.
- `docs/operations/`: publicación controlada, entornos y recuperación.
- `scripts/`: herramientas de recuperación documentadas; no se ejecutan durante el arranque.
- `backend/scripts/`: preparación de versiones Android y herramientas de pruebas piloto.

## Desarrollo

Utiliza Node.js 22, npm y PostgreSQL local para las pruebas de integración. Las pruebas de políticas nativas también requieren un JDK.

1. Ejecuta `npm ci`, `npm ci --prefix backend` y `npm ci --prefix mobile`.
2. Configura las variables de ejemplo en archivos locales no versionados. Mantén separados pruebas y producción. No subas credenciales ni datos operativos.
3. Web: `npm run dev`. API: `npm start --prefix backend`. Android: `npm start --prefix mobile`.

La web usa `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_GOOGLE_MAPS_API_KEY`. El móvil usa `EXPO_PUBLIC_*` y la configuración de Maps/Firebase existente en EAS. El backend requiere su conexión de base, Auth y las integraciones habilitadas para el entorno.

## Verificación

```text
npm run build
node mobile/node_modules/typescript/bin/tsc --noEmit --incremental false --project mobile/tsconfig.json
node --test --test-concurrency=1 backend/tests/*.test.*
node --test mobile/tests/*.test.cjs
```

Para las integraciones utiliza `TEST_ADMIN_DATABASE_URL` y `TEST_PUEBLA_DATABASE_URL` con PostgreSQL de localhost desechable. Nunca apuntes esas variables a producción. Configura `DATABASE_URL` y Auth ficticios locales para importar adaptadores en las pruebas. La pipeline incluida ejecuta ese entorno aislado.

Las pruebas de planificación, calidad, geocerca y territorio forman parte de `backend/tests/` y se incluyen en esa ejecución. La prueba integral con Auth y Storage de Supabase requiere el entorno local completo y se ejecuta aparte con `npm run test:pilot:e2e --prefix backend`.

## Herramientas y manuales

- [Recuperación de respaldos](scripts/README.md): ensayo en una base nueva de localhost.
- [Publicación Android y pilotos](backend/scripts/README.md): propósito, requisitos y alcance de los comandos de mantenimiento.
- [Manual completo de operación](docs/manual/MANUAL_DE_USO.md): 28 capítulos, capturas, diagramas y espacios para completar imágenes. El PDF descargable está en `public/manual/Manual-APP-DE-RUTAS.pdf` y la edición editable en `docs/manual/Manual-APP-DE-RUTAS.docx`.
- [Visitas sin conexión](docs/mobile/OFFLINE_EXECUTION.md): garantías técnicas y validación Android. La ayuda breve integrada en los clientes se conserva como consulta rápida.

Los archivos de diagnóstico de casos concretos y las herramientas de reestructura retiradas se conservan en el historial de Git. No son pasos de instalación ni de despliegue.

## Operación

Las visitas anteriores pendientes conservan evidencia y estado y no bloquean las de hoy. El mismo día se mantiene la exclusión de visitas simultáneas. Las autorizaciones se validan en servidor; los clientes no conceden permisos por caché.

Las colas locales son independientes por cuenta. Las sesiones ordinarias se cierran sólo en el dispositivo actual. La retención del diagnóstico integrado es limitada; consulta el procedimiento de operación para monitoreo externo y recuperación.

El perfil EAS `preview` produce APK interna y no publica automáticamente en el canal estable. Las publicaciones y migraciones productivas son operaciones explícitas y verificadas.
