<template>
  <div>
    <details open>
      <summary><b>Carrito de rutas (sandbox)</b></summary>

      <!-- Región + filtro -->
      <div class="row">
        <label>Región sanitaria</label>
        <select v-model="cartRegion">
          <option value="" disabled>— Selecciona región —</option>
          <option v-for="r in regiones" :key="r" :value="r">{{ r }}</option>
        </select>
      </div>

      <div class="row">
        <label>Buscar (CLUES o unidad)</label>
        <input v-model="search" placeholder="Ej. CLU12345 o Nombre unidad" />
      </div>

      <!-- Lista de farmacias -->
      <div class="list">
        <div
          v-for="f in farmaciasByRegion"
          :key="String(f.id)"
          class="cell"
          @click="addToCart(f.id)"
          :title="(f.unidad || 'Sin nombre') + ' — clic para agregar al carrito'"
        >
          <div class="cell-title">
            <b>{{ f.clues }}</b> — {{ f.unidad || 'Sin nombre' }}
          </div>
          <div class="cell-meta">
            <span v-if="f.dificil_acceso" class="badge-hard" title="Difícil acceso">Difícil</span>
            <span class="badge">ID: {{ f.id }}</span>
          </div>
        </div>
        <div v-if="!farmaciasByRegion.length" class="hint">No hay resultados</div>
      </div>

      <!-- Carrito -->
      <div class="carrito" v-if="cartList.length">
        <details open>
          <summary><b>Carrito</b></summary>
          <p><small>Arrastra para ordenar; clic para (des)activar; usa el botón de cálculo.</small></p>

          <div class="post-list" @dragover.prevent @drop="cartDrop">
            <div
              v-for="(p,i) in cartList"
              :key="String(p.id)"
              class="post-item"
              :class="{ off: !p.enabled }"
              draggable="true"
              @dragstart="cartDragStart(i)"
              @dragenter.prevent="cartDragEnter(i)"
              @click="toggleCartItem(i)"
              :title="p.unidad || p.name"
            >
              <span class="drag-handle">⣿</span>
              <span class="name">
                {{ i+1 }}. <b>{{ p.clues || p.name }}</b> — {{ p.unidad || 'Sin nombre' }}
              </span>
              <span class="badge" v-if="!p.enabled">omitido</span>
              <span v-if="p.hard" class="badge-hard" title="Difícil acceso">Difícil</span>
              <button class="btn-mini danger" @click.stop="removeFromCart(p.id)">Quitar</button>
            </div>
          </div>

          <div class="actions">
            <button class="btn-ghost" @click="clearCart">Limpiar carrito</button>
            <button class="btn-primary" @click="computeCart">Calcular carrito</button>
          </div>
        </details>
      </div>

      <!-- Resultados carrito -->
      <div v-if="cartTotal" class="results">
        <div><b>Total:</b> {{ formatKm(cartTotal.distanceMeters) }} · {{ formatDur(cartTotal.duration) }}</div>

        <div v-if="cartSubroutesUi.length" class="subroutes">
          <details open>
            <summary><b>Sub-rutas</b></summary>
            <ul class="subroutes-list">
              <li
                v-for="sr in cartSubroutesUi"
                :key="sr.idx"
                @click="focusCartSubroute(sr.idx)"
                class="subroute-item"
              >
                <span class="swatch" :style="{ backgroundColor: sr.color }"></span>
                <span class="label">
                  #{{ sr.idx + 1 }} · {{ sr.range }} —
                  {{ formatKm(sr.distance) }}, {{ formatDur(sr.duration) }}
                </span>
              </li>
            </ul>
          </details>
        </div>

        <!-- Info enlaces -->
        <div class="chunk-info">
          <b>Intermedios por enlace:</b>
          10 (fijo)
          <span class="hint">
            Google Maps limita la estabilidad arriba de 10 puntos intermedios.
          </span>
        </div>

        <!-- Abrir en Google Maps -->
        <div v-if="cartMapsLinks.length" style="margin-top:8px">
          <details open>
            <summary><b>Abrir en Google Maps</b></summary>
            <ol>
              <li v-for="(l, idx) in cartMapsLinks" :key="idx">
                Enlace {{ idx+1 }} (puntos {{ l.from }}→{{ l.to }})
                &nbsp;•&nbsp;

                <a
                  class="alink"
                  :href="l.url"
                  target="_blank"
                  rel="noopener"
                  title="Abrir en Google Maps"
                >
                  Abrir enlace
                </a>

                &nbsp;•&nbsp;

                <button class="btn-mini" @click="copyToClipboard(l.url)">
                  Copiar
                </button>
              </li>
            </ol>

            <p class="hint">
              Segmentado automáticamente con hasta 10 intermedios por enlace.
            </p>
          </details>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup>
import { toRefs, computed } from 'vue'
import { useRouteCart } from '../../composables/useRouteCart.js'

const props = defineProps({
  map: { type: Object, required: true },
  trackOverlay: { type: Function, required: true },
  detachOverlay: { type: Function, required: true },
  clearAllOverlays: { type: Function, required: true },
  farmacias: { type: Object, required: true },
  formatKm: { type: Function, required: true },
  formatDur: { type: Function, required: true }
})

const {
  map, trackOverlay, detachOverlay, clearAllOverlays, farmacias, formatKm, formatDur
} = toRefs(props)

const cartApi = useRouteCart({
  map,
  trackOverlay: trackOverlay.value,
  detachOverlay: detachOverlay.value,
  clearAllOverlays: clearAllOverlays.value,
  farmacias
})

const {
  cartRegion, search, regiones, farmaciasByRegion, cart: cartItems,
  addToCart, removeFromCart, clearCart,
  cartDragStart, cartDragEnter, cartDrop, toggleCartItem,
  computeCart, cartTotal, cartSubroutesUi, cartMapsLinks,
  focusCartSubroute, copyToClipboard
} = cartApi

const cartList = computed(() => cartItems.value || [])
</script>

<style scoped>
.row { margin: 8px 0; display:flex; gap:8px; align-items:center; }
.row label { width: 160px; font-weight:600; }
.row select, .row input { flex:1; padding:8px; border:1px solid #d1d5db; border-radius:6px; color:#111827; }

.list { max-height: 180px; overflow:auto; border:1px solid #eee; border-radius:6px; padding:6px; margin-top:6px; }
.cell { padding:6px; border-radius:6px; cursor:pointer; }
.cell:hover { background:#f5f7fb; }
.cell-title { color:#111827; }
.cell-meta { margin-top:4px; display:flex; gap:6px; align-items:center; }
.badge { font-size:11px; background:#eee; border:1px solid #ddd; padding:1px 6px; border-radius:10px; }
.badge-hard { padding:1px 6px; border-radius:10px; border:1px solid #FF3B30; color:#FF3B30; font-size:11px; }

.carrito { margin-top:10px; }
.post-list { max-height:180px; overflow:auto; border:1px dashed #d1d5db; border-radius:6px; padding:6px; }
.post-item { display:flex; align-items:center; gap:8px; padding:6px; border-radius:6px; background:#fafafa; margin-bottom:6px; cursor:grab; color:#111827; }
.post-item.off { opacity:.45; text-decoration: line-through; }
.post-item .drag-handle { user-select:none; }
.post-item .badge { margin-left:auto; font-size:11px; background:#eee; border:1px solid #ddd; padding:1px 6px; border-radius:10px; }
.btn-mini { background:#fff; color:#111827; border:1px solid #d1d5db; border-radius:6px; padding:4px 8px; cursor:pointer; }
.btn-mini.danger { border-color:#ef4444; color:#ef4444; }

.actions { display:flex; gap:8px; margin-top:6px; }
.btn-primary { background:#fff; color:#111827; border:2px solid #111827; padding:8px 12px; border-radius:8px; cursor:pointer; font-weight:700; }
.btn-ghost   { background:#fff; color:#111827; border:1px solid #d1d5db; padding:8px 12px; border-radius:8px; cursor:pointer; }

.results { margin-top:10px; }
.subroutes-list { list-style:none; padding-left:0; margin:6px 0 0; }
.subroute-item { display:flex; align-items:center; gap:8px; padding:4px 2px; cursor:pointer; }
.subroute-item:hover { background:#f5f7fb; border-radius:6px; }
.subroute-item .swatch { width:14px; height:14px; border-radius:3px; border:1px solid #999; }

.hint { display:block; font-size:12px; opacity:.7; }
.alink { color:#111827; text-decoration: underline; }
</style>