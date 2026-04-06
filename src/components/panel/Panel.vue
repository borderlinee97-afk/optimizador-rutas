<template>
  <div class="panel" :class="{ collapsed: collapsed }">
    <div class="panel-header">
      <h4>Panel</h4>
      <div class="panel-actions">
        <label class="toggle">
          <input type="checkbox" :checked="unifyColors" @change="$emit('toggle-unify-colors')" />
          Unificar color
        </label>
        <button class="btn-mini" @click="$emit('toggle-collapsed')">
          {{ collapsed ? 'Expandir' : 'Contraer' }}
        </button>
      </div>
    </div>

    <div class="panel-body" v-if="!collapsed">
      <!-- Selector de vista -->
      <div style="display:flex; gap:8px; margin:8px 0;">
        <button class="btn-mini" :class="{active:viewMode==='GENERAL'}" @click="$emit('set-view-mode','GENERAL')">General</button>
        <button class="btn-mini" :class="{active:viewMode==='OPERADORES'}" @click="$emit('set-view-mode','OPERADORES')">Operadores de reparto</button>
        <button class="btn-mini" :class="{active:viewMode==='SUPERVISORES'}" @click="$emit('set-view-mode','SUPERVISORES')">Supervisor de Farmacias</button>
        <button class="btn-mini" :class="{active:viewMode==='PERSONAS'}" @click="$emit('set-view-mode','PERSONAS')">Personas</button>
      </div>

      <!-- Contenido por vista -->
      <slot name="general" v-if="viewMode==='GENERAL'"></slot>
      <slot name="operadores" v-else-if="viewMode==='OPERADORES'"></slot>
      <slot name="supervisores" v-else-if="viewMode==='SUPERVISORES'"></slot>
      <slot name="personas" v-else></slot>
    </div>
  </div>
</template>

<script setup>
defineProps({
  collapsed:   { type: Boolean, required: true },
  unifyColors: { type: Boolean, required: true },
  viewMode:    { type: String,  required: true },
});
defineEmits(['toggle-collapsed','toggle-unify-colors','set-view-mode']);
</script>

<style scoped>
.panel { position:absolute; right:20px; bottom:20px; z-index:9998; background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:0; width: 420px; max-width:92vw; box-shadow:0 2px 8px rgba(0,0,0,.15); font:13px/1.35 system-ui; }
.panel-header { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid #e5e7eb; }
.panel-actions { display:flex; gap:8px; align-items:center; }
.panel-body { max-height: 56vh; overflow:auto; padding:10px 12px; }
.panel.collapsed .panel-body { display:none; }

.btn-mini { background:#fff; color:#111827; border:1px solid #d1d5db; border-radius:6px; padding:4px 8px; cursor:pointer; }
.btn-mini.active { background:#111827; color:#fff; border-color:#111827; }
.toggle { font-size:12px; color:#111827; }
</style>