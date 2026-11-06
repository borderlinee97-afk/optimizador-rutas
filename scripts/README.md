# Herramientas de recuperación

## Ensayar una restauración

`rehearse-restore.mjs` comprueba un respaldo PostgreSQL en formato custom. Requiere las dependencias de la raíz, PostgreSQL local y `pg_restore` disponible en PATH o mediante `PG_RESTORE_BIN`.

Configura `RESTORE_TEST_DATABASE_URL` con la base de control `postgres` de localhost y un usuario autorizado para crear bases. El respaldo debe permanecer fuera del repositorio.

Desde la raíz:

```text
node scripts/rehearse-restore.mjs <ruta-al-respaldo.dump>
```

El comando crea una base aleatoria nueva, restaura el archivo y muestra un resumen. Conserva la base para inspección, incluso si falla la restauración. Después de revisarla, el operador puede eliminar únicamente esa base de ensayo mediante su herramienta PostgreSQL habitual.

El script rechaza destinos remotos y archivos de respaldo dentro del repositorio. No reemplaza bases existentes ni se ejecuta al compilar o arrancar la aplicación. Consulta también [el procedimiento de publicación y recuperación](../docs/operations/RELEASE_AND_RECOVERY.md).
