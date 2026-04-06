<template>
  <div class="legend" v-if="regiones && regiones.length">
    <div class="legend-item" v-for="r in regiones" :key="r">
      <span class="swatch" :style="{ backgroundColor: getColorForRegion(r) }"></span>
      <span class="label">{{ r }}</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  regiones: { type: Array, required: true },
  getColorForRegion: { type: Function, required: true },
});
</script>

<style scoped>
.legend { position:absolute; bottom:20px; left:20px; z-index:9999; background:#fff; border:1px solid #ccc; border-radius:8px; padding:10px 12px; box-shadow:0 2px 8px rgba(0,0,0,.15); font:13px/1.2 system-ui; max-width:320px; }
.legend-item { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.legend-item:last-child { margin-bottom:0; }
.swatch { width:14px; height:14px; border-radius:3px; border:1px solid #999; }
</style>