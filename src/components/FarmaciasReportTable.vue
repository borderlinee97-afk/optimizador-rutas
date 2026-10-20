<template>
  <div class="report-table-scroll">
    <table>
      <thead>
        <tr>
          <th v-for="(label, i) in columns" :key="i" scope="col">
            {{ label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, r) in rows" :key="row.id || r">
          <td v-for="(value, i) in row.cells" :key="i">
            <button
              v-if="cell(value).action"
              class="table-action"
              @click="
                $emit('action', {
                  kind: cell(value).action,
                  id: cell(value).id,
                })
              "
            >
              {{ cell(value).text }}
            </button>
            <RouterLink v-else-if="cell(value).link" :to="cell(value).link">{{
              cell(value).text
            }}</RouterLink>
            <span
              v-else
              :class="cell(value).tone ? ['tag', cell(value).tone] : ''"
              >{{ cell(value).text }}</span
            >
            <small v-for="(line, j) in cell(value).secondary || []" :key="j">{{
              line
            }}</small>
            <details v-if="cell(value).details?.length">
              <summary>Ver actividad</summary>
              <p v-for="(line, j) in cell(value).details" :key="j">
                {{ line }}
              </p>
            </details>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length" class="empty">
            Sin registros para el periodo y los filtros elegidos.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script setup>
defineProps({
  columns: { type: Array, required: true },
  rows: { type: Array, required: true },
})
defineEmits(['action'])
const cell = (value) =>
  value && typeof value === 'object' ? value : { text: value ?? '—' }
</script>
<style scoped>
.report-table-scroll {
  overflow: auto;
  max-height: 660px;
  border: 1px solid #e1e8f1;
  border-radius: 8px;
}
table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
  text-align: left;
  font-size: 12px;
  color: #243b56;
}
th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #eef4fa;
  padding: 13px 12px;
  color: #536c89;
  font-size: 11px;
  white-space: nowrap;
  border-bottom: 1px solid #dce5ef;
}
td {
  padding: 14px 12px;
  border-bottom: 1px solid #e9eef5;
  vertical-align: top;
  line-height: 1.5;
  min-width: 65px;
  max-width: 290px;
  overflow-wrap: anywhere;
}
tbody tr:hover {
  background: #f8fbff;
}
tr:last-child td {
  border-bottom: 0;
}
small {
  display: block;
  font-size: 11px;
  color: #697d94;
  margin-top: 5px;
  white-space: pre-wrap;
}
.tag {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 15px;
  background: #eef3f9;
  color: #5d7088;
  font-size: 11px;
}
.tag.done {
  background: #e7f5ee;
  color: #23734e;
}
.tag.vacation {
  background: #fff2dd;
  color: #956115;
}
.tag.progress {
  background: #e8f0ff;
  color: #2863aa;
}
.table-action,
a {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-weight: 700;
  color: #265f9f;
  cursor: pointer;
  text-align: left;
  text-decoration: none;
}
.table-action:focus-visible,
a:focus-visible {
  outline: 3px solid #77aaff;
  outline-offset: 3px;
}
.empty {
  text-align: center;
  padding: 28px;
  color: #72839a;
}
summary {
  cursor: pointer;
  color: #3c659c;
  font-size: 11px;
  margin-top: 6px;
}
details p {
  font-size: 11px;
  color: #536b86;
  white-space: pre-wrap;
}
</style>
