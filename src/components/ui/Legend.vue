<template>
  <aside class="legend">
    <!-- =====================================================
         CABECERA
    ====================================================== -->
    <div class="legend-header">
      <div class="legend-heading">
        <span class="legend-kicker">
          Filtro territorial
        </span>

        <strong>
          {{
            selectedProject
              ? 'Jurisdicciones'
              : 'Proyectos'
          }}
        </strong>
      </div>

      <button
        v-if="selectedProject"
        type="button"
        class="mini-btn"
        @click="
          emit('back-projects')
        "
      >
        <span aria-hidden="true">
          ←
        </span>

        Proyectos
      </button>
    </div>

    <!-- =====================================================
         LIMPIAR
    ====================================================== -->
    <button
      type="button"
      class="clear-btn"
      @click="
        emit('clear-filters')
      "
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          d="M4 6h16"
        />

        <path
          d="M9 6V4h6v2"
        />

        <path
          d="m7 6 1 14h8l1-14"
        />
      </svg>

      <span>
        Limpiar filtros
      </span>
    </button>

    <!-- =====================================================
         PROYECTOS
    ====================================================== -->
    <div
      v-if="!selectedProject"
      class="legend-list"
    >
      <button
        v-for="project in projects"
        :key="project"
        type="button"
        class="legend-item"
        @click="
          emit(
            'select-project',
            project
          )
        "
      >
        <span
          class="project-icon"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
          >
            <path
              d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"
            />

            <path
              d="m4 7.5 8 4.5 8-4.5"
            />

            <path
              d="M12 12v9"
            />
          </svg>
        </span>

        <span class="label">
          {{
            formatProject(
              project
            )
          }}
        </span>

        <span
          class="item-chevron"
          aria-hidden="true"
        >
          ›
        </span>
      </button>

      <div
        v-if="!projects.length"
        class="legend-empty"
      >
        No hay proyectos disponibles.
      </div>
    </div>

    <!-- =====================================================
         JURISDICCIONES
    ====================================================== -->
    <div
      v-else
      class="legend-list"
    >
      <div class="selected-project">
        <span>
          Proyecto
        </span>

        <strong>
          {{
            formatProject(
              selectedProject
            )
          }}
        </strong>
      </div>

      <button
        v-for="region in regiones"
        :key="region"
        type="button"
        class="legend-item"
        @click="
          emit(
            'select-region',
            region
          )
        "
      >
        <span
          class="swatch"
          :style="{
            backgroundColor:
              getColorForRegion(
                region
              )
          }"
          aria-hidden="true"
        ></span>

        <span class="label">
          {{ region }}
        </span>

        <span
          class="item-chevron"
          aria-hidden="true"
        >
          ›
        </span>
      </button>

      <div
        v-if="!regiones.length"
        class="legend-empty"
      >
        No hay jurisdicciones disponibles
        para este proyecto.
      </div>
    </div>
  </aside>
</template>

<script setup>
const props =
  defineProps({
    projects: {
      type: Array,
      default: () => [],
    },

    selectedProject: {
      type: String,
      default: null,
    },

    regiones: {
      type: Array,
      default: () => [],
    },

    getColorForRegion: {
      type: Function,
      required: true,
    },
  })

const emit =
  defineEmits([
    'select-project',
    'select-region',
    'back-projects',
    'clear-filters',
  ])

function formatProject(
  project
) {
  const value =
    String(
      project ??
      ''
    ).trim()

  if (!value) {
    return 'Sin nombre'
  }

  return value
    .toLowerCase()
    .replace(
      /_/g,
      ' '
    )
    .replace(
      /(^|\s)\S/g,
      letter =>
        letter.toUpperCase()
    )
}
</script>

<style scoped>
/*
 * ============================================================
 * CONTENEDOR
 * ============================================================
 */

.legend {
  position: absolute;

  bottom: 20px;
  left: 20px;

  z-index: 9999;

  width:
    min(
      260px,
      calc(100vw - 40px)
    );

  max-height:
    min(
      430px,
      calc(100vh - 150px)
    );

  overflow:
    auto;

  padding:
    13px;

  border:
    1px solid #d8e1ea;

  border-radius:
    14px;

  background:
    rgba(
      255,
      255,
      255,
      .97
    );

  color:
    #0f172a !important;

  box-shadow:
    0 10px 30px
      rgba(
        15,
        23,
        42,
        .14
      );

  backdrop-filter:
    blur(12px);

  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  font-size:
    12px;

  line-height:
    1.3;
}

/*
 * Protección contra estilos globales de button.
 */
.legend button {
  font:
    inherit;

  color:
    #1e293b !important;

  -webkit-text-fill-color:
    currentColor;

  opacity:
    1;
}

/*
 * ============================================================
 * HEADER
 * ============================================================
 */

.legend-header {
  display: flex;

  align-items:
    center;

  justify-content:
    space-between;

  gap: 8px;

  margin-bottom:
    10px;
}

.legend-heading {
  display: flex;

  min-width: 0;

  flex-direction:
    column;

  gap: 1px;
}

.legend-heading strong {
  color:
    #0f172a !important;

  font-size:
    16px;

  font-weight:
    850;
}

.legend-kicker {
  color:
    #0f64ad !important;

  font-size:
    8px;

  font-weight:
    850;

  letter-spacing:
    .08em;

  text-transform:
    uppercase;
}

/*
 * ============================================================
 * VOLVER
 * ============================================================
 */

.mini-btn {
  display: inline-flex;

  min-height:
    30px;

  align-items:
    center;

  justify-content:
    center;

  gap: 4px;

  padding:
    0
    8px;

  border:
    1px solid #cbd5e1;

  border-radius:
    7px;

  background:
    #ffffff !important;

  color:
    #475569 !important;

  cursor:
    pointer;

  font-size:
    9px !important;

  font-weight:
    800;
}

.mini-btn:hover {
  border-color:
    #93c5fd;

  background:
    #eff8ff !important;

  color:
    #0f64ad !important;
}

/*
 * ============================================================
 * LIMPIAR
 * ============================================================
 */

.clear-btn {
  display: flex;

  width: 100%;

  min-height:
    35px;

  align-items:
    center;

  justify-content:
    center;

  gap: 6px;

  margin-bottom:
    9px;

  padding:
    0
    10px;

  border:
    1px solid #d8e1ea;

  border-radius:
    8px;

  background:
    #f8fafc !important;

  color:
    #475569 !important;

  cursor:
    pointer;

  font-size:
    10px !important;

  font-weight:
    800;
}

.clear-btn svg {
  width:
    14px;

  height:
    14px;

  fill:
    none;

  stroke:
    currentColor;

  stroke-width:
    1.8;

  stroke-linecap:
    round;

  stroke-linejoin:
    round;
}

.clear-btn span {
  color:
    inherit !important;
}

.clear-btn:hover {
  border-color:
    #bfdbfe;

  background:
    #eff8ff !important;

  color:
    #0f64ad !important;
}

/*
 * ============================================================
 * LISTA
 * ============================================================
 */

.legend-list {
  display: grid;

  gap: 5px;
}

/*
 * ============================================================
 * PROYECTO ACTIVO
 * ============================================================
 */

.selected-project {
  display: flex;

  flex-direction:
    column;

  gap: 2px;

  margin-bottom:
    3px;

  padding:
    8px
    9px;

  border:
    1px solid #bfdbfe;

  border-radius:
    8px;

  background:
    #eff8ff;
}

.selected-project span {
  color:
    #64748b !important;

  font-size:
    8px;

  font-weight:
    700;

  text-transform:
    uppercase;
}

.selected-project strong {
  overflow:
    hidden;

  color:
    #0f64ad !important;

  font-size:
    11px;

  font-weight:
    850;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

/*
 * ============================================================
 * ITEM
 * ============================================================
 */

.legend-item {
  display: flex;

  width: 100%;

  min-height:
    40px;

  align-items:
    center;

  gap: 8px;

  padding:
    6px
    7px;

  border:
    1px solid transparent;

  border-radius:
    9px;

  background:
    transparent !important;

  color:
    #1e293b !important;

  cursor:
    pointer;

  text-align:
    left;

  transition:
    border-color .14s ease,
    background .14s ease,
    color .14s ease;
}

.legend-item:hover {
  border-color:
    #dbeafe;

  background:
    #f8fbff !important;

  color:
    #0f64ad !important;
}

.legend-item .label {
  display: block;

  min-width: 0;

  overflow:
    hidden;

  flex: 1;

  color:
    #1e293b !important;

  -webkit-text-fill-color:
    #1e293b;

  font-size:
    11px;

  font-weight:
    750;

  line-height:
    1.25;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}

.legend-item:hover .label {
  color:
    #0f64ad !important;

  -webkit-text-fill-color:
    #0f64ad;
}

/*
 * ============================================================
 * ICONO PROYECTO
 *
 * Quitamos los antiguos cuadros negros.
 * ============================================================
 */

.project-icon {
  display: grid;

  width:
    26px;

  height:
    26px;

  flex:
    0
    0
    26px;

  place-items:
    center;

  border:
    1px solid #bfdbfe;

  border-radius:
    8px;

  background:
    #eff8ff;

  color:
    #0f64ad !important;
}

.project-icon svg {
  width:
    15px;

  height:
    15px;

  fill:
    none;

  stroke:
    currentColor;

  stroke-width:
    1.7;

  stroke-linecap:
    round;

  stroke-linejoin:
    round;
}

/*
 * ============================================================
 * COLOR JURISDICCIÓN
 * ============================================================
 */

.swatch {
  width:
    15px;

  height:
    15px;

  flex:
    0
    0
    15px;

  border:
    2px solid #ffffff;

  border-radius:
    5px;

  box-shadow:
    0 0 0 1px
      rgba(
        15,
        23,
        42,
        .18
      );
}

/*
 * ============================================================
 * FLECHA
 * ============================================================
 */

.item-chevron {
  flex:
    0
    0
    auto;

  color:
    #94a3b8 !important;

  font-size:
    17px;

  font-weight:
    500;

  line-height:
    1;
}

/*
 * ============================================================
 * VACÍO
 * ============================================================
 */

.legend-empty {
  padding:
    12px
    8px;

  border:
    1px dashed #cbd5e1;

  border-radius:
    8px;

  background:
    #f8fafc;

  color:
    #64748b !important;

  font-size:
    9px;

  line-height:
    1.4;

  text-align:
    center;
}

/*
 * ============================================================
 * RESPONSIVE
 * ============================================================
 */

@media (
  max-width:
    640px
) {
  .legend {
    bottom:
      12px;

    left:
      12px;

    width:
      min(
        230px,
        calc(100vw - 24px)
      );

    padding:
      10px;
  }

  .legend-heading strong {
    font-size:
      14px;
  }

  .legend-item {
    min-height:
      37px;
  }
}
</style>