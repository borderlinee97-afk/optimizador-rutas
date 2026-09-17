# Encargo para Codex — preparar piloto con dos supervisores

Trabaja directamente en:

```text
C:\Proyectos-program\optimizador-rutas\optimizador-rutas
```

Lee primero `AGENTS.md` y `docs/PROJECT_STATE.md`. Confirma rama, HEAD y estado Git. Conserva todos los cambios existentes.

## Objetivo

Deja APP DE RUTAS lista para una prueba real con dos supervisores. Haz el trabajo directamente en el repositorio y avanza de forma autónoma hasta obtener un resultado ejecutable y verificable. No generes ZIP ni helpers para que el usuario aplique cambios manualmente.

## Alcance obligatorio

1. Audita el estado funcional actual de web, backend, móvil y Supabase. Identifica huecos reales; no repitas bloques ya terminados.
2. Define y documenta la arquitectura mínima de prueba. Evalúa con información vigente si conviene Vercel para la web, Supabase para Auth/PostgreSQL y un servicio administrado o VPS para el backend Express. Considera costo, seguridad, mantenimiento, Google Route Optimization y capacidad de crecer.
3. Prepara la configuración de despliegue: variables de entorno documentadas sin secretos, CORS, URLs permitidas de Supabase Auth, health checks, logs, manejo de errores, rate limiting y separación entre prueba y producción.
4. Ejecuta una auditoría de seguridad de autenticación, autorización por jerarquía, endpoints, RLS, secretos, dependencias, geolocalización, datos personales y respaldos. Corrige los problemas que puedan resolverse con seguridad y valida cada corrección.
5. Deja listo el proceso para crear dos usuarios supervisores de prueba y sus datos mínimos. Si faltan correos, nombres o contraseñas, termina primero todo lo independiente y solicita únicamente esos datos concretos antes de crear cuentas.
6. Prepara y compila una versión instalable de la aplicación móvil adecuada para las pruebas. Resuelve configuración de Expo/EAS o Android según la estructura actual, valida variables y documenta instalación y actualización.
7. Diseña y ejecuta pruebas de punta a punta para ambos supervisores: login, carga de plan, sincronización, modo sin conexión, check-in, actividades DONE/SKIPPED, checkout, geocerca, paradas adicionales, reprogramación, cancelación, aprobaciones y reportes.
8. Ejecuta build web, TypeScript móvil, pruebas relacionadas del backend, validaciones de migraciones y revisión del diff.
9. Actualiza `docs/PROJECT_STATE.md` con lo realizado, lo validado y cualquier decisión o dato todavía pendiente.

## Forma de trabajo

- Usa el código y el esquema remoto como fuente de verdad.
- Investiga documentación oficial vigente cuando una decisión dependa de precios, límites o capacidades actuales.
- Realiza primero todas las acciones locales, reversibles y de solo lectura.
- Deja cualquier despliegue público, creación de cuentas o cambio irreversible como el último paso, con una descripción concreta para revisión.
- No muestres ni guardes claves, tokens, contraseñas o cadenas de conexión.
- No hagas commit, push de Git, merge ni despliegue público sin solicitud explícita.

## Estado de partida confirmado

- Rama: `feature/visit-activities`.
- HEAD inicial: `21d9f87ad18cd9cf68ed138257d8cf42f75abcbf`.
- F8B.5 móvil está implementado y enviado.
- Docker Desktop y WSL2 funcionan.
- Supabase CLI está instalado y el proyecto está enlazado.
- La línea base y las tres migraciones posteriores están aplicadas y alineadas con el remoto.
- El acceso anónimo a las tablas operativas fue cerrado y Auth continúa funcionando.
- Hay cambios locales sin commit; deben conservarse y revisarse.

Comienza inspeccionando el repositorio y presenta avances mediante cambios y comprobaciones concretas. No pidas al usuario que ejecute comandos que Codex pueda ejecutar directamente.
