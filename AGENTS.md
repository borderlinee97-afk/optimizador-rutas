# APP DE RUTAS — instrucciones para Codex

## Forma de trabajo

- Trabaja directamente en este repositorio. No generes ZIP, helpers de aplicación masiva ni instrucciones para que el usuario edite archivos manualmente, salvo que lo solicite.
- Antes de editar, confirma la rama, `HEAD` y `git status --short`. Conserva cambios existentes y no sobrescribas trabajo ajeno.
- Implementa cada solicitud como un bloque funcional coherente entre frontend, backend, móvil y base de datos cuando corresponda.
- Continúa hasta dejar el cambio implementado, revisado y validado. Resuelve decisiones técnicas rutinarias usando el código actual como fuente de verdad.
- No hagas commit, push, merge, despliegue ni cambios destructivos en datos sin una solicitud explícita del usuario.

## Base de datos y Supabase

- Ejecuta Supabase CLI desde la raíz con `npx supabase`.
- Guarda cambios de esquema como migraciones versionadas en `supabase/migrations/`.
- Revisa toda migración generada antes de aplicarla. No incluyas datos productivos, contraseñas, tokens, cadenas de conexión ni contenido de archivos `.env`.
- Prueba migraciones en el entorno local de Supabase/Docker antes de proponer su aplicación al proyecto remoto.
- Nunca ejecutes `supabase db reset --linked`, borrados remotos, restauraciones o seeds remotos sin autorización explícita y comprobación del proyecto objetivo.
- Prefiere `supabase db push --dry-run` antes de aplicar migraciones remotas.

## Validación mínima

- Frontend web: `npm run build` desde la raíz.
- Móvil: `node mobile/node_modules/typescript/bin/tsc --noEmit --incremental false --project mobile/tsconfig.json`.
- Backend: ejecuta las pruebas relacionadas y `node --check` sobre archivos JavaScript modificados cuando no exista una prueba específica.
- Repositorio: `git diff --check` y revisión completa del diff.
- Amplía las validaciones cuando el cambio afecte autenticación, permisos, geolocalización, planificación, sincronización, migraciones o datos.

## Entrega

- Resume qué cambió, por qué, cómo se validó y los riesgos o pruebas manuales pendientes.
- Distingue claramente entre validaciones realizadas y supuestos todavía no comprobados.
- Mantén `docs/PROJECT_STATE.md` actualizado al cerrar cada bloque funcional importante.
