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
.legend {
  position: absolute;

  box-sizing: border-box;

  z-index: 9998;

  bottom: 16px;
  left: 16px;

  width:
    min(
      290px,
      calc(100vw - 32px)
    );

  max-height:
    min(
      480px,
      calc(100vh - 130px)
    );

  overflow: auto;

  padding: 16px;

  border:
    1px solid
    rgba(203, 213, 225, .95);

  border-radius:
    var(--radius-lg);

  background:
    rgba(255, 255, 255, .97);

  color:
    var(--color-text);

  box-shadow:
    0 12px 32px
    rgba(15, 23, 42, .16);

  backdrop-filter:
    blur(10px);

  font-family:
    var(--font-sans);

  scrollbar-width: thin;

  scrollbar-color:
    #cbd5e1
    transparent;
}

.legend::-webkit-scrollbar {
  width: 6px;
}

.legend::-webkit-scrollbar-thumb {
  border-radius: 999px;

  background: #cbd5e1;
}

.legend button {
  font: inherit;

  -webkit-text-fill-color:
    currentColor;
}

/* ============================================================
   HEADER
   ============================================================ */

.legend-header {
  display: flex;

  align-items: center;

  justify-content:
    space-between;

  gap: 9px;

  margin-bottom: 10px;
}

.legend-heading {
  display: flex;

  min-width: 0;

  flex-direction: column;
}

.legend-heading strong {
  margin-top: 2px;

  color:
    var(--color-text);

  font-size: 16px;
  font-weight: 750;
}

.legend-kicker {
  color:
    var(--color-primary-dark);

  font-size: 12px;
  font-weight: 700;

  letter-spacing: .04em;

  text-transform: uppercase;
}

/* ============================================================
   VOLVER
   ============================================================ */

.mini-btn {
  display: inline-flex;

  min-height: 32px;

  flex: 0 0 auto;

  align-items: center;

  justify-content: center;

  gap: 4px;

  padding:
    0
    8px;

  border:
    1px solid
    var(--color-border);

  border-radius:
    var(--radius-md);

  background:
    var(--color-surface);

  color:
    #475569;

  cursor: pointer;

  font-size: 12px;
  font-weight: 650;
}

.mini-btn:hover {
  border-color: #bfdbfe;

  background:
    var(--color-primary-soft);

  color:
    var(--color-primary-dark);
}

/* ============================================================
   LIMPIAR
   ============================================================ */

.clear-btn {
  display: flex;

  width: 100%;
  min-height: 38px;

  align-items: center;

  justify-content: center;

  gap: 7px;

  margin-bottom: 10px;

  padding:
    0
    10px;

  border:
    1px solid
    var(--color-border);

  border-radius:
    var(--radius-md);

  background:
    var(--color-surface-muted);

  color:
    #475569;

  cursor: pointer;

  font-size: 12px;
  font-weight: 650;
}

.clear-btn svg {
  width: 15px;
  height: 15px;

  fill: none;

  stroke:
    currentColor;

  stroke-width: 1.8;

  stroke-linecap: round;
  stroke-linejoin: round;
}

.clear-btn:hover {
  border-color: #bfdbfe;

  background:
    var(--color-primary-soft);

  color:
    var(--color-primary-dark);
}

/* ============================================================
   LISTA
   ============================================================ */

.legend-list {
  display: grid;

  gap: 4px;
}

.selected-project {
  display: flex;

  flex-direction: column;

  gap: 2px;

  margin-bottom: 5px;

  padding:
    9px
    10px;

  border:
    1px solid
    #bfdbfe;

  border-radius:
    var(--radius-md);

  background:
    var(--color-primary-soft);
}

.selected-project span {
  color:
    var(--color-text-secondary);

  font-size: 12px;
  font-weight: 600;
}

.selected-project strong {
  overflow: hidden;

  color:
    var(--color-primary-dark);

  font-size: 13px;
  font-weight: 700;

  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ============================================================
   ITEMS
   ============================================================ */

.legend-item {
  display: flex;

  width: 100%;
  min-height: 42px;

  align-items: center;

  gap: 8px;

  padding:
    6px
    8px;

  border:
    1px solid transparent;

  border-radius:
    var(--radius-md);

  background:
    transparent;

  color:
    #334155;

  cursor: pointer;

  text-align: left;

  transition:
    border-color 140ms ease,
    background 140ms ease;
}

.legend-item:hover {
  border-color: #bfdbfe;

  background:
    #f8fbff;

  color:
    var(--color-primary-dark);
}

.legend button:focus-visible {
  outline: 3px solid #2563eb;
  outline-offset: 2px;
}

.legend-item .label {
  display: block;

  min-width: 0;

  overflow: hidden;

  flex: 1;

  color: inherit;

  font-size: 13px;
  font-weight: 650;

  line-height: 1.3;

  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ============================================================
   ICONOS
   ============================================================ */

.project-icon {
  display: grid;

  width: 28px;
  height: 28px;

  flex:
    0
    0
    28px;

  place-items: center;

  border:
    1px solid
    #bfdbfe;

  border-radius:
    var(--radius-md);

  background:
    var(--color-primary-soft);

  color:
    var(--color-primary-dark);
}

.project-icon svg {
  width: 15px;
  height: 15px;

  fill: none;

  stroke:
    currentColor;

  stroke-width: 1.7;

  stroke-linecap: round;
  stroke-linejoin: round;
}

.swatch {
  width: 16px;
  height: 16px;

  flex:
    0
    0
    16px;

  border:
    2px solid
    #ffffff;

  border-radius: 5px;

  box-shadow:
    0 0 0 1px
    rgba(15, 23, 42, .18);
}

.item-chevron {
  flex:
    0
    0
    auto;

  color:
    #94a3b8;

  font-size: 18px;
}

/* ============================================================
   VACÍO
   ============================================================ */

.legend-empty {
  padding:
    13px
    9px;

  border:
    1px dashed
    #cbd5e1;

  border-radius:
    var(--radius-md);

  background:
    var(--color-surface-muted);

  color:
    var(--color-text-secondary);

  font-size: 12px;

  line-height: 1.4;

  text-align: center;
}

/* ============================================================
   RESPONSIVE
   ============================================================ */

@media (
  max-width: 640px
) {
  .legend {
    right: 12px;
    bottom: calc(48vh + 22px);
    left: 12px;

    width: min(290px, calc(100vw - 24px));

    max-height:
      min(
        27vh,
        260px
      );

    padding: 11px;
  }

  .legend-heading strong {
    font-size: 15px;
  }

  .legend-item {
    min-height: 40px;
  }
}
</style>
