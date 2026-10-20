<template>
  <section
    class="execution-summary"
    aria-label="Ejecución registrada de la visita"
  >
    <div class="execution-caption">
      Ejecución registrada <span>Hora Guadalajara</span>
    </div>
    <dl class="execution-grid">
      <div>
        <dt>Entrada</dt>
        <dd>{{ formatRecordedAt(item.checkInAt) }}</dd>
      </div>
      <div>
        <dt>Salida</dt>
        <dd>{{ formatRecordedAt(item.checkOutAt) }}</dd>
      </div>
      <div>
        <dt>Tiempo en unidad</dt>
        <dd>{{ formatPresence(item.dwellSeconds) }}</dd>
      </div>
      <div>
        <dt>Actividades completadas</dt>
        <dd>{{ done }} / {{ item.activities?.length || 0 }}</dd>
      </div>
    </dl>
    <p
      v-if="item.status === 'IN_PROGRESS' && !item.checkOutAt"
      class="execution-hint"
    >
      Visita en curso. La duración se confirmará cuando se registre y sincronice
      la salida.
    </p>
    <p v-if="item.executionIssue" class="execution-warning">
      {{ item.executionIssue }}. No se estima una duración.
    </p>
    <p v-if="item.notes"><b>Observaciones:</b> {{ item.notes }}</p>
    <p v-if="item.skipReason">
      <b>Motivo de omisión:</b> {{ item.skipReason }}
    </p>
    <p v-if="item.rescheduleReason">
      <b>Reprogramación:</b> {{ item.rescheduleReason }}
    </p>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { formatRecordedAt, formatPresence } from '../utils/farmaciasReports.js'
const props = defineProps({ item: { type: Object, required: true } })
const done = computed(
  () => props.item.activities?.filter((a) => a.status === 'DONE').length || 0
)
</script>
<style scoped>
.execution-summary {
  margin-top: 16px;
  border: 1px solid #dce6f1;
  border-left: 3px solid #3373bf;
  border-radius: 10px;
  padding: 14px 16px;
  background: #f8fbff;
  color: #20334c;
}
.execution-caption {
  font-size: 13px;
  font-weight: 750;
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.execution-caption span {
  font-size: 11px;
  color: #61728a;
  font-weight: 500;
}
.execution-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 12px 0 0;
}
.execution-grid dt {
  font-size: 12px;
  color: #62728a;
}
.execution-grid dd {
  margin: 5px 0 0;
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.execution-summary p {
  font-size: 13px;
  line-height: 1.5;
  margin: 12px 0 0;
  white-space: pre-wrap;
}
.execution-hint {
  color: #426590;
}
.execution-warning {
  color: #9a4a11;
}
@media (max-width: 900px) {
  .execution-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 520px) {
  .execution-grid {
    grid-template-columns: 1fr;
  }
  .execution-caption {
    flex-wrap: wrap;
  }
}
</style>
