<template>
  <div class="panel-general">
    <div v-if="routeTotal" class="resume-block">
      <div class="resume-main">
        <b>Total:</b>
        {{ formatKm(routeTotal.distanceMeters) }} · {{ formatDur(routeTotal.duration) }}
      </div>

      <div v-if="routeTolls" class="tolls-block">
        <b>Peajes estimados:</b>
        <span v-if="routeTolls.known">{{ routeTolls.text }}</span>
        <span v-else>{{ routeTolls.text || 'Sin peajes estimados' }}</span>
      </div>
    </div>

    <section v-if="subroutesUi.length" class="module-block">
      <details open>
        <summary><b>Sub-rutas</b></summary>
        <ul class="subroutes-list">
          <li
            v-for="sr in subroutesUi"
            :key="sr.idx"
            @click="$emit('focus-subroute', sr.idx)"
            class="subroute-item"
          >
            <span class="swatch" :style="{ backgroundColor: sr.color }"></span>
            <span class="label">
              #{{ sr.idx + 1 }} · {{ sr.range }} —
              {{ formatKm(sr.distance) }}, {{ formatDur(sr.duration) }}
            </span>
            <span class="subroute-toll" v-if="sr.tolls">
              · {{ sr.tolls.text || 'Sin peajes estimados' }}
            </span>
          </li>
        </ul>
      </details>
    </section>

    <section v-if="readableOrder.length" class="module-block">
      <details>
        <summary><b>Orden de visita</b> (ver más)</summary>
        <ol class="simple-list">
          <li v-for="(n, i) in readableOrder" :key="i">{{ n }}</li>
        </ol>
      </details>
    </section>

    <section v-if="routeLegs.length" class="module-block">
      <div class="module-title">
        <b>Tramos (punto → punto)</b>
      </div>
      <ol class="legs">
        <li v-for="(leg, i) in routeLegs" :key="i">
          {{ i + 1 }}) {{ formatKm(leg.distanceMeters) }} ·
          {{ formatDur(leg.duration) }}
        </li>
      </ol>
    </section>

    <section v-if="postOrder.length" class="module-block">
      <details open>
        <summary><b>Editar orden (post-cálculo)</b></summary>
        <p class="module-help">
          Arrastra para reordenar; clic para excluir/incluir; luego “Recalcular”.
        </p>

        <div class="post-list" @dragover.prevent @drop="$emit('post-drop')">
          <div
            v-for="(p, i) in postOrder"
            :key="p.id"
            class="post-item"
            :class="{ off: !p.enabled }"
            draggable="true"
            @dragstart="$emit('post-drag-start', i)"
            @dragenter.prevent="$emit('post-drag-enter', i)"
            @click="$emit('toggle-post-item', i)"
            title="Clic para (des)activar; arrastra para reordenar"
          >
            <span class="drag-handle">⣿</span>
            <span class="name">
              {{ i + 1 }}. {{ p.clues }} — {{ p.unidad || p.name }}
            </span>
            <span class="badge" v-if="!p.enabled">omitido</span>
            <span
              v-if="p.hard"
              class="badge-hard"
              title="Difícil acceso"
            >
              Difícil
            </span>
          </div>
        </div>

        <div class="post-actions">
          <button class="btn-primary" @click="$emit('recalc')">
            Recalcular
          </button>
        </div>
      </details>
    </section>

    <section class="module-block subtle-block">
      <div class="chunk-info">
        <b>Intermedios por enlace:</b>
        10 (fijo)
        <span class="hint">
          Google Maps limita la estabilidad arriba de 10 puntos intermedios.
        </span>
      </div>
    </section>

    <section v-if="mapsLinks.length" class="module-block">
      <details open>
        <summary><b>Abrir en Google Maps</b></summary>
        <ol class="links-list">
          <li v-for="(l, idx) in mapsLinks" :key="idx" class="link-item">
            <div class="link-text">
              Enlace {{ idx + 1 }} (puntos {{ l.from }}→{{ l.to }})
            </div>

            <div class="link-actions">
              <a
                class="alink"
                :href="l.url"
                target="_blank"
                rel="noopener"
                title="Abrir en Google Maps"
              >Abrir enlace</a>

              <button class="btn-mini" @click="$emit('copy-link', l.url)">Copiar</button>
            </div>
          </li>
        </ol>

        <p class="hint">
          Si hay muchos puntos, verás varios enlaces segmentados automáticamente.
        </p>
      </details>
    </section>

    <section class="module-block export-block">
      <div class="module-title">
        <b>Exportación</b>
      </div>

      <div class="export-actions">
        <button class="btn-primary" @click="$emit('export-excel')">
          Exportar a Excel (.xlsx)
        </button>
        <button class="btn-ghost" @click="$emit('export-csv')">
          Exportar CSV (visitas)
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
defineProps({
  routeTotal: { type: Object, default: null },
  routeTolls: {
    type: Object,
    default: () => ({
      hasTolls: false,
      known: false,
      currencyCode: null,
      amount: null,
      text: 'Sin peajes estimados'
    })
  },
  subroutesUi: { type: Array, required: true },
  readableOrder: { type: Array, required: true },
  routeLegs: { type: Array, required: true },
  postOrder: { type: Array, required: true },
  mapsLinks: { type: Array, required: true },
  formatKm: { type: Function, required: true },
  formatDur: { type: Function, required: true },
})

defineEmits([
  'focus-subroute',
  'post-drag-start',
  'post-drag-enter',
  'post-drop',
  'toggle-post-item',
  'recalc',
  'copy-link',
  'export-excel',
  'export-csv'
])
</script>

<style scoped>
.panel-general {
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: #111827;
  width: 100%;
  max-width: 100%;
}

.resume-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid #dbe2ea;
  border-radius: 10px;
  background: #ffffff;
}

.resume-main {
  font-size: 16px;
  line-height: 1.4;
}

.tolls-block {
  font-size: 14px;
  color: #374151;
}

.module-block {
  padding: 14px 16px;
  border: 1px solid #dbe2ea;
  border-radius: 10px;
  background: #ffffff;
}

.subtle-block {
  background: #f8fafc;
}

.module-title {
  margin-bottom: 10px;
  color: #111827;
}

details summary {
  cursor: pointer;
  user-select: none;
  color: #111827;
}

details summary:hover {
  opacity: 0.9;
}

.module-help {
  margin: 10px 0 0;
  font-size: 13px;
  color: #4b5563;
  line-height: 1.45;
}

.subroutes-list {
  list-style: none;
  padding-left: 0;
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.subroute-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  flex-wrap: wrap;
  border: 1px solid #edf1f5;
  border-radius: 8px;
  background: #fafbfc;
}

.subroute-item:hover {
  background: #f3f6f9;
}

.swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid #999;
}

.subroute-toll {
  font-size: 12px;
  color: #374151;
}

.simple-list {
  margin: 12px 0 0;
  padding-left: 20px;
}

.simple-list li + li {
  margin-top: 6px;
}

.legs {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.post-list {
  max-height: 220px;
  overflow: auto;
  border: 1px dashed #cfd8e3;
  border-radius: 8px;
  padding: 8px;
  margin-top: 12px;
  background: #fafbfc;
}

.post-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 8px;
  background: #ffffff;
  margin-bottom: 8px;
  cursor: grab;
  border: 1px solid #edf1f5;
}

.post-item:last-child {
  margin-bottom: 0;
}

.post-item.off {
  opacity: .5;
  text-decoration: line-through;
}

.drag-handle {
  user-select: none;
  color: #6b7280;
}

.name {
  flex: 1;
  min-width: 0;
}

.badge {
  font-size: 11px;
  background: #eef2f7;
  border: 1px solid #d6dde6;
  padding: 2px 8px;
  border-radius: 999px;
}

.badge-hard {
  margin-left: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #ef4444;
  color: #ef4444;
  background: #fff5f5;
  font-size: 11px;
}

.post-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.chunk-info {
  font-size: 14px;
  color: #374151;
  line-height: 1.45;
}

.hint {
  display: block;
  font-size: 12px;
  color: #6b7280;
  margin-top: 6px;
}

.links-list {
  margin: 12px 0 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.link-item {
  padding: 10px 12px;
  border: 1px solid #edf1f5;
  border-radius: 8px;
  background: #fafbfc;
}

.link-text {
  margin-bottom: 8px;
  color: #374151;
}

.link-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.export-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.export-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-mini {
  background: #fff;
  border: 1px solid #d1d5db;
  color: #111827;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
}

.btn-primary {
  background: #111827;
  color: #ffffff;
  border: 1px solid #111827;
  padding: 9px 14px;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
}

.btn-ghost {
  background: #fff;
  border: 1px solid #d1d5db;
  color: #111827;
  padding: 9px 14px;
  border-radius: 8px;
  cursor: pointer;
}

.alink {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border: 1px solid #111827;
  color: #111827;
  text-decoration: none;
  border-radius: 8px;
  padding: 6px 10px;
  font-weight: 600;
}

@media (max-width: 700px) {
  .module-block,
  .resume-block {
    padding: 12px;
  }

  .post-item {
    flex-wrap: wrap;
  }

  .link-actions,
  .export-actions {
    width: 100%;
  }
}
</style>