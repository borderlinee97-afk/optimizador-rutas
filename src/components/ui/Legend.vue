<template>
  <div class="legend">
    <div class="legend-header">
      <strong>{{ selectedProject ? 'Jurisdicciones' : 'Proyectos' }}</strong>

      <button
        v-if="selectedProject"
        class="mini-btn"
        type="button"
        @click="$emit('back-projects')"
      >
        ← Proyectos
      </button>
    </div>

    <button
      class="clear-btn"
      type="button"
      @click="$emit('clear-filters')"
    >
      Limpiar filtros
    </button>

    <template v-if="!selectedProject">
      <button
        v-for="p in projects"
        :key="p"
        class="legend-item clickable"
        type="button"
        @click="$emit('select-project', p)"
      >
        <span class="swatch project"></span>
        <span class="label">{{ formatProject(p) }}</span>
      </button>
    </template>

    <template v-else>
      <button
        v-for="r in regiones"
        :key="r"
        class="legend-item clickable"
        type="button"
        @click="$emit('select-region', r)"
      >
        <span
          class="swatch"
          :style="{ backgroundColor: getColorForRegion(r) }"
        ></span>
        <span class="label">{{ r }}</span>
      </button>
    </template>
  </div>
</template>

<script setup>
defineProps({
  projects: { type: Array, default: () => [] },
  selectedProject: { type: String, default: null },
  regiones: { type: Array, default: () => [] },
  getColorForRegion: { type: Function, required: true }
})

defineEmits([
  'select-project',
  'select-region',
  'back-projects',
  'clear-filters'
])

function formatProject(p) {
  return String(p || '').charAt(0).toUpperCase() + String(p || '').slice(1).toLowerCase()
}
</script>

<style scoped>
.legend {
  position: absolute;
  bottom: 20px;
  left: 20px;
  z-index: 9999;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 10px 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,.15);
  font: 13px/1.2 system-ui;
  max-width: 320px;
}

.legend-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  width: 100%;
  background: transparent;
  border: 0;
  padding: 3px 0;
  text-align: left;
}

.legend-item:last-child {
  margin-bottom: 0;
}

.clickable {
  cursor: pointer;
}

.clickable:hover .label {
  text-decoration: underline;
}

.swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid #999;
  flex: 0 0 auto;
}

.swatch.project {
  background: #111827;
}

.clear-btn,
.mini-btn {
  border: 1px solid #d1d5db;
  background: #ffffff;
  border-radius: 6px;
  padding: 4px 8px;
  font-weight: 700;
  cursor: pointer;
}

.clear-btn {
  width: 100%;
  margin-bottom: 8px;
}
</style>