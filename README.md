# Optimizador de Rutas

Aplicación web para visualizar unidades en mapa, calcular rutas optimizadas y generar planes de trabajo operativos mediante rutas personalizadas y exportación PDF.

---

## Descripción

El sistema permite consultar farmacias/unidades georreferenciadas, visualizarlas en Google Maps y calcular recorridos optimizados de acuerdo con diferentes criterios operativos.

La aplicación está enfocada en facilitar la planeación de visitas de supervisión mediante herramientas de visualización, optimización y exportación de rutas.

La versión incluida en este repositorio contempla el flujo web estable hasta la funcionalidad de rutas personalizadas mediante carrito temporal y generación de planes de trabajo.

---

## Tecnologías principales

### Frontend
- Vue 3
- Vite
- Google Maps JavaScript API

### Backend
- Node.js
- Express

### Base de datos
- PostgreSQL
- Supabase

### APIs externas
- Google Maps JavaScript API
- Google Routes API

---

## Funcionalidades incluidas

- Visualización de unidades en Google Maps.
- Marcadores por región sanitaria.
- Identificación visual de unidades de difícil acceso.
- Cálculo de rutas optimizadas.
- Configuración de origen de ruta.
- Ruta personalizada mediante carrito temporal.
- Reordenamiento manual de puntos.
- Generación de enlaces de Google Maps.
- División automática por subrutas.
- Generación de plan de trabajo en PDF.
- Exportación de rutas con mapa y detalle operativo.
- Exportación de resultados a Excel y CSV.
- Visualización de distancia, duración, subrutas y peajes estimados.

---

## Estructura general del proyecto

```txt
.
├── backend/              # API Node.js + Express
├── public/               # Archivos públicos
├── src/                  # Aplicación frontend Vue
├── package.json          # Dependencias frontend
└── README.md