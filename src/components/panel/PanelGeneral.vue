<template>
  <div class="panel-general">
    <div v-if="routeTotal" class="resume-block">
      <div class="resume-main">
        <b>Total:</b>
        {{ formatKm(routeTotal.distanceMeters) }} · {{ formatDur(routeTotal.duration) }}
      </div>

      <div v-if="routeFuel?.totalLiters != null" class="fuel-block">
        <b>Combustible estimado:</b>
        {{ Number(routeFuel.totalLiters).toFixed(2) }} LT
        <span v-if="routeFuel.kmPerLiter">
          - Rendimiento {{ routeFuel.kmPerLiter }} km/L
        </span>
      </div>

      <div v-if="routeTotal?.totalEstimatedCost != null" class="fuel-block">
        <b>Costo estimado total:</b>
        ${{ Number(routeTotal.totalEstimatedCost).toFixed(2) }}
        <span v-if="routeTotal.fuelCost != null">
          · Combustible ${{ Number(routeTotal.fuelCost).toFixed(2) }}
        </span>
        <span v-if="routeTotal.allowanceCost != null">
          · Viáticos ${{ Number(routeTotal.allowanceCost).toFixed(2) }}
        </span>
      </div>

      <div v-if="routeTolls" class="tolls-block">
        <b>Peajes estimados:</b>
        <span v-if="routeTolls.known">{{ routeTolls.text }}</span>
        <span v-else>{{ routeTolls.text || 'Sin peajes estimados' }}</span>
      </div>
    </div>

    <section v-if="operatorRoutes.length" class="module-block">
      <details open>
        <summary><b>Rutas calculadas</b></summary>

        <div class="operator-list">
          <div
            v-for="op in operatorRoutes"
            :key="op.operator"
            class="operator-card"
            :class="{ selected: selectedOperator === op.operator }"
            @click="$emit('select-operator', op.operator)"
          >
            <div class="operator-header">
              <b>{{ op.label || `Ruta ${op.operator}` }}</b>
              <span>{{ op.pointCount || 0 }} unidades</span>
            </div>

            <div v-if="op.regions?.length" class="operator-regions">
              {{ op.regions.join(' · ') }}
            </div>

            <div class="operator-metrics">
              <span><b>Distancia:</b> {{ formatKm(op.distanceMeters) }}</span>
              <span><b>Tiempo total:</b> {{ formatDur(op.duration) }}</span>
              <span v-if="op.fuelLiters != null">
                <b>Litros:</b> {{ Number(op.fuelLiters).toFixed(2) }} L
              </span>

              <span v-if="op.costs?.totalEstimatedCost != null">
                <b>Costo:</b> ${{ Number(op.costs.totalEstimatedCost).toFixed(2) }}
              </span>
              <span v-if="op.costs?.fuelCost != null">
                <b>Combustible:</b> ${{ Number(op.costs.fuelCost).toFixed(2) }}
              </span>
              <span v-if="op.costs?.allowanceCost != null">
                <b>Viáticos:</b> ${{ Number(op.costs.allowanceCost).toFixed(2) }}
              </span>
            </div>

            <div v-if="op.days?.length" class="operator-days">
              <details
                v-for="day in op.days"
                :key="day.day"
                class="day-card"
                :open="selectedOperator === op.operator && selectedOperatorDay === day.day"
                :class="{
                  selected: selectedOperator === op.operator && selectedOperatorDay === day.day
                }"
              >
                <summary @click.prevent.stop="$emit('select-operator-day', op.operator, day.day)">
                  <b>{{ day.label || `Operador ${day.day}` }}</b>
                  <span>{{ day.pointCount || 0 }} unidades</span>
                </summary>

                <div class="day-metrics">
                  <span><b>Distancia:</b> {{ formatKm(day.distanceMeters) }}</span>
                  <span><b>Tiempo con servicio:</b> {{ formatDur(day.duration) }}</span>
                  <span><b>Recorrido:</b> {{ formatDur(day.driveDuration) }}</span>
                  <span v-if="day.fuelLiters != null">
                    <b>Litros:</b> {{ Number(day.fuelLiters).toFixed(2) }} L
                  </span>
                  <span v-if="day.schedule">
                    <b>Salida sugerida:</b> {{ day.schedule.suggestedStart }}
                  </span>
                  <span v-if="day.schedule">
                    <b>Límite última unidad:</b> {{ day.schedule.limitLastArrival }}
                  </span>
                  <span v-if="day.schedule">
                    <b>Servicio:</b> {{ day.schedule.serviceMinutesPerUnit }} min por unidad
                  </span>
                </div>

                <ol class="day-points">
                  <li v-for="p in day.points" :key="p.id">
                    {{ p.order }}. {{ p.name }}
                    <span v-if="p.meta?.unidad"> — {{ p.meta.unidad }}</span>
                  </li>
                </ol>
              </details>
            </div>

            <details class="operator-points">
              <summary>Ver unidades de la ruta</summary>
              <ol>
                <li v-for="p in op.points" :key="p.id">
                  {{ p.order }}. {{ p.name }}
                  <span v-if="p.meta?.unidad"> — {{ p.meta.unidad }}</span>
                </li>
              </ol>
            </details>
          </div>
        </div>
      </details>
    </section>

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
      <details>
        <summary><b>Tramos (punto → punto)</b> (ver más)</summary>

        <ol class="legs">
          <li v-for="(leg, i) in routeLegs" :key="i">
            {{ i + 1 }}) {{ formatKm(leg.distanceMeters) }} ·
            {{ formatDur(leg.duration) }}
          </li>
        </ol>
      </details>
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
              Enlace {{ l.label ? `${l.label} · ` : '' }}Enlace {{ idx + 1 }} (puntos {{ l.from }}→{{ l.to }})
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
  routeFuel: { type: Object, default: null },
  operatorRoutes: { type: Array, default: () => [] },
  selectedOperator: { type: [Number, null], default: null },
  selectedOperatorDay: { type: [Number, null], default: null },
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
  'select-operator',
  'select-operator-day',
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

.tolls-block,
.fuel-block {
  font-size: 14px;
  color: #374151;
}

.operator-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.operator-card {
  border: 1px solid #edf1f5;
  border-radius: 10px;
  background: #fafbfc;
  padding: 12px;
}

.operator-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 14px;
  margin-bottom: 8px;
}

.operator-header span {
  color: #6b7280;
  font-size: 12px;
}

.operator-metrics {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #374151;
}

.operator-points {
  margin-top: 10px;
  font-size: 13px;
}

.operator-points ol {
  margin: 8px 0 0;
  padding-left: 18px;
}

.operator-points li + li {
  margin-top: 4px;
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

.operator-card {
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.operator-card.selected {
  border-color: #111827;
  background: #eef2ff;
  box-shadow: 0 0 0 2px rgba(17, 24, 39, 0.08);
}

.operator-regions {
  margin-bottom: 8px;
  font-size: 12px;
  color: #4b5563;
  line-height: 1.35;
}

.operator-days {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.day-card {
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  background: #ffffff;
  padding: 8px 10px;
}

.day-card summary {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
}

.day-card summary span {
  color: #6b7280;
  font-size: 12px;
}

.day-metrics {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 8px;
  font-size: 12px;
  color: #374151;
}

.day-points {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
}

.day-points li + li {
  margin-top: 3px;
}

.day-card {
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.day-card.selected {
  border-color: #111827;
  background: #eef2ff;
  box-shadow: 0 0 0 2px rgba(17, 24, 39, 0.08);
}
</style>