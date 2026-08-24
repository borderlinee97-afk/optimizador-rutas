<template>
  <div class="fab-group">
    <!-- =====================================================
         FILA 1
    ====================================================== -->
    <button
      type="button"
      class="fab fab-primary"
      @click="$emit('open-criteria')"
    >
      Calcular ruta
    </button>

    <button
      type="button"
      class="fab"
      :class="{
        active: trafficEnabled
      }"
      @click="$emit('toggle-traffic')"
    >
      {{
        trafficEnabled
          ? 'Ocultar tráfico'
          : 'Mostrar tráfico'
      }}
    </button>

    <!-- =====================================================
         FILA 2
    ====================================================== -->
    <button
      type="button"
      class="fab"
      :class="{
        active: markersVisible
      }"
      @click="$emit('toggle-markers')"
    >
      {{
        markersVisible
          ? 'Ocultar marcadores'
          : 'Mostrar marcadores'
      }}
    </button>

    <button
      type="button"
      class="fab fab-close"
      :disabled="!hasAnyRoute"
      @click="$emit('close-route')"
    >
      Cerrar ruta
    </button>

    <!-- =====================================================
         PERSONA
    ====================================================== -->
    <button
      type="button"
      class="fab fab-persona"
      @click="$emit('open-persona')"
    >
      <span class="plus">
        +
      </span>

      Persona
    </button>
  </div>
</template>

<script setup>
defineProps({
  trafficEnabled: {
    type: Boolean,
    required: true,
  },

  markersVisible: {
    type: Boolean,
    required: true,
  },

  hasAnyRoute: {
    type: Boolean,
    required: true,
  },
})

defineEmits([
  'open-criteria',
  'toggle-traffic',
  'toggle-markers',
  'close-route',
  'open-persona',
])
</script>

<style scoped>
/*
 * ============================================================
 * CONTENEDOR
 * ============================================================
 */

.fab-group {
  position: absolute;

  top: 18px;
  right: 18px;

  z-index: 9999;

  display: grid;

  grid-template-columns:
    repeat(
      2,
      minmax(
        0,
        132px
      )
    );

  gap: 6px;

  width: 270px;

  padding: 6px;

  border:
    1px solid
    rgba(
      203,
      213,
      225,
      .9
    );

  border-radius: 13px;

  background:
    rgba(
      255,
      255,
      255,
      .92
    );

  box-shadow:
    0 8px 24px
      rgba(
        15,
        23,
        42,
        .12
      );

  backdrop-filter:
    blur(10px);
}

/*
 * ============================================================
 * BOTÓN BASE
 * ============================================================
 */

.fab {
  display: inline-flex;

  min-width: 0;
  min-height: 34px;

  align-items: center;
  justify-content: center;

  gap: 5px;

  padding:
    6px
    9px;

  border:
    1px solid #d7dee7;

  border-radius: 8px;

  background:
    #ffffff !important;

  color:
    #334155 !important;

  cursor: pointer;

  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  font-size: 10px;

  font-weight: 750;

  line-height: 1.15;

  text-align: center;

  white-space: nowrap;

  box-shadow:
    0 1px 3px
      rgba(
        15,
        23,
        42,
        .07
      );

  transition:
    background .15s ease,
    border-color .15s ease,
    color .15s ease,
    transform .15s ease,
    box-shadow .15s ease;
}

.fab:hover:not(:disabled) {
  border-color:
    #93c5fd;

  background:
    #f8fbff !important;

  color:
    #0f64ad !important;

  box-shadow:
    0 2px 7px
      rgba(
        15,
        23,
        42,
        .10
      );
}

.fab:active:not(:disabled) {
  transform:
    scale(.98);
}

/*
 * ============================================================
 * CALCULAR RUTA
 * ============================================================
 */

.fab-primary {
  border-color:
    #0f64ad;

  background:
    #0f64ad !important;

  color:
    #ffffff !important;
}

.fab-primary:hover:not(:disabled) {
  border-color:
    #0b568f;

  background:
    #0b568f !important;

  color:
    #ffffff !important;
}

/*
 * ============================================================
 * ESTADO ACTIVO
 * ============================================================
 */

.fab.active {
  border-color:
    #93c5fd;

  background:
    #eff8ff !important;

  color:
    #0f64ad !important;
}

/*
 * ============================================================
 * CERRAR RUTA
 * ============================================================
 */

.fab-close:not(:disabled) {
  border-color:
    #fecaca;

  background:
    #fffafa !important;

  color:
    #b42318 !important;
}

.fab-close:hover:not(:disabled) {
  border-color:
    #fca5a5;

  background:
    #fff1f2 !important;

  color:
    #991b1b !important;
}

/*
 * ============================================================
 * PERSONA
 * Ocupa el ancho completo para no crear una tercera fila rara.
 * ============================================================
 */

.fab-persona {
  grid-column:
    1 / -1;

  min-height: 32px;

  border-style:
    dashed;

  background:
    #f8fafc !important;

  color:
    #475569 !important;
}

.fab-persona:hover:not(:disabled) {
  border-style:
    solid;

  background:
    #eff8ff !important;

  color:
    #0f64ad !important;
}

.plus {
  color:
    inherit !important;

  font-size: 14px;

  font-weight: 800;

  line-height: 1;
}

/*
 * ============================================================
 * DESHABILITADO
 * ============================================================
 */

.fab:disabled {
  border-color:
    #e2e8f0;

  background:
    #f1f5f9 !important;

  color:
    #a1aab7 !important;

  cursor:
    not-allowed;

  box-shadow: none;

  opacity: 1;
}

/*
 * ============================================================
 * RESPONSIVE
 * ============================================================
 */

@media (
  max-width: 760px
) {
  .fab-group {
    top: 12px;
    right: 12px;

    width:
      min(
        260px,
        calc(100vw - 24px)
      );

    grid-template-columns:
      repeat(
        2,
        minmax(
          0,
          1fr
        )
      );

    gap: 5px;

    padding: 5px;
  }

  .fab {
    min-height: 32px;

    padding:
      5px
      7px;

    font-size: 9px;
  }
}

@media (
  max-width: 420px
) {
  .fab-group {
    width:
      min(
        220px,
        calc(100vw - 24px)
      );
  }

  .fab {
    white-space: normal;
  }
}
</style>