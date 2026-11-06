<template>
  <section class="evidence-gallery">
    <button type="button" class="gallery-toggle" :aria-expanded="expanded" @click="toggle">{{ expanded ? 'Ocultar evidencias' : 'Ver evidencias de la visita' }}</button>
    <template v-if="expanded">
      <p v-if="loading" role="status">Cargando fotografías…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="photo-grid"><button v-for="photo in photos" :key="photo.id" type="button" class="photo-card" @click="open(photo.id)"><img :src="photo.signedUrl" alt="Ampliar evidencia de la visita" loading="lazy" referrerpolicy="no-referrer" /><span>{{ formatDate(photo.capturedAt) }}</span></button></div>
      <p v-if="!loading && !photos.length && !error">Sin fotografías en esta visita.</p>
      <button type="button" class="gallery-toggle" :disabled="loading" @click="refresh">Actualizar fotografías · {{ photos.length }}</button>
    </template>
    <Teleport to="body"><div v-if="active" class="photo-overlay" @click.self="close" @keydown="onKeydown">
      <section ref="dialog" class="photo-dialog" role="dialog" aria-modal="true" aria-label="Evidencia fotográfica" tabindex="-1">
        <header><strong>Evidencia {{ activeIndex + 1 }} de {{ photos.length }}</strong><button type="button" :disabled="removing" @click="close">Cerrar</button></header>
        <div class="photo-stage"><img v-if="!imageError" :key="active.signedUrl" :src="active.signedUrl" alt="Fotografía de evidencia ampliada" referrerpolicy="no-referrer" @error="imageError=true" /><div v-else><p>No fue posible abrir esta imagen.</p><button type="button" @click="refresh">Volver a cargar fotografía</button></div></div>
        <p v-if="error" role="alert" class="viewer-error">{{ error }}</p>
        <footer><button type="button" :disabled="photos.length<2 || removing" @click="navigate(-1)">Anterior</button><span>{{ formatDate(active.capturedAt) }}</span><button v-if="active.canRemove" type="button" class="remove-photo" :disabled="removing" @click="remove">{{ removing ? 'Retirando…' : 'Retirar foto' }}</button><button type="button" :disabled="photos.length<2 || removing" @click="navigate(1)">Siguiente</button></footer>
      </section>
    </div></Teleport>
  </section>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { getVisitEvidence, removeVisitEvidence } from '../services/api.js'
const props = defineProps({ itemId: { type: String, required: true } })
const emit = defineEmits(['removed'])
const expanded = ref(false), photos = ref([]), loading = ref(false), error = ref(''), selectedId = ref(null), removing = ref(false), imageError = ref(false), dialog = ref(null)
const activeIndex = computed(() => photos.value.findIndex(photo => photo.id===selectedId.value))
const active = computed(() => photos.value[activeIndex.value] || null)
let sequence=0, previousFocus=null, previousOverflow=''
const formatDate = value => value ? new Date(value).toLocaleString('es-MX') : ''
async function refresh() {
  const request=++sequence
  loading.value=true
  try {
    const result=await getVisitEvidence(props.itemId)
    if (request!==sequence) return
    photos.value=result.evidence || []; error.value=''; imageError.value=false
  } catch(err) { if(request===sequence) error.value=err?.message || 'No se pudieron cargar las fotografías.' }
  finally { if(request===sequence) loading.value=false }
}
function toggle() { expanded.value=!expanded.value; if(expanded.value) void refresh() }
function open(id) { selectedId.value=id; imageError.value=false; void refresh() }
function close() { if(!removing.value) selectedId.value=null }
function navigate(delta) { if(photos.value.length) { selectedId.value=photos.value[(activeIndex.value+delta+photos.value.length)%photos.value.length].id; imageError.value=false } }
async function remove() {
  const photo=active.value
  if(!photo?.canRemove || removing.value || !window.confirm('¿Retirar esta fotografía de la visita? El registro del retiro se conserva para revisión. Si necesitas evidencia para cerrar, agrega otra foto.')) return
  removing.value=true
  try {
    const result=await removeVisitEvidence(props.itemId,photo.id)
    if(!result.ok || !result.removed) throw new Error('El servidor no confirmó el retiro de la foto.')
    photos.value=photos.value.filter(row=>row.id!==photo.id); selectedId.value=null; error.value=''; emit('removed',photo.id)
  } catch(err) { error.value=err?.message || 'La foto se conserva. No se pudo confirmar el retiro.' }
  finally { removing.value=false }
}
function onKeydown(event) {
  if(event.key==='Escape') { event.preventDefault(); close() }
  if(event.key==='ArrowLeft' && !removing.value) navigate(-1)
  if(event.key==='ArrowRight' && !removing.value) navigate(1)
  if(event.key==='Tab') {
    const buttons=dialog.value?.querySelectorAll('button:not(:disabled),[href]')
    if(!buttons?.length) { event.preventDefault(); return }
    const first=buttons[0],last=buttons[buttons.length-1]
    if(event.shiftKey && (document.activeElement===first || document.activeElement===dialog.value)) { event.preventDefault(); last.focus() }
    else if(!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus() }
  }
}
watch(() => Boolean(active.value), async visible => {
  if(visible) { previousFocus=document.activeElement; previousOverflow=document.body.style.overflow; document.body.style.overflow='hidden'; await nextTick(); dialog.value?.focus() }
  else { document.body.style.overflow=previousOverflow; previousFocus?.focus?.(); previousFocus=null }
})
watch(() => props.itemId, () => { ++sequence; photos.value=[]; selectedId.value=null; if(expanded.value) void refresh() })
onBeforeUnmount(() => { ++sequence; if(previousFocus) { document.body.style.overflow=previousOverflow; previousFocus?.focus?.() } })
</script>
<style scoped>
.evidence-gallery{margin-top:14px;min-width:0}.gallery-toggle{min-height:44px;padding:8px 12px;border:1px solid #b4cfdd;border-radius:10px;background:#edf6fb;color:#174f6d;font-weight:700}.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px;margin:10px 0}.photo-card{padding:0;border:1px solid #bfd0db;border-radius:10px;overflow:hidden;background:#fff;text-align:left;cursor:pointer}.photo-card img{display:block;width:100%;height:112px;object-fit:cover}.photo-card span{display:block;padding:8px;font-size:11px;color:#29475d}.photo-overlay{position:fixed;inset:0;z-index:30000;background:#061320df;display:flex;align-items:center;justify-content:center;padding:16px}.photo-dialog{display:flex;flex-direction:column;width:min(1080px,100%);height:min(900px,calc(100dvh - 32px));border-radius:18px;background:#0c2335;color:#fff;overflow:hidden;box-shadow:0 24px 80px #0008}.photo-dialog header,.photo-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;flex-wrap:wrap}.photo-dialog button{min-height:44px;border:1px solid #7190a7;border-radius:10px;background:#24465e;color:white;padding:8px 14px;cursor:pointer}.photo-dialog button:disabled{opacity:.45;cursor:default}.photo-dialog .remove-photo{background:#a12531;border-color:#e78e97}.photo-stage{flex:1;min-height:0;display:flex;justify-content:center;align-items:center;overflow:auto}.photo-stage img{width:100%;height:100%;object-fit:contain}.viewer-error{padding:8px 18px;margin:0;color:#ffdba4}.photo-dialog footer span{font-size:12px}@media(max-width:600px){.photo-overlay{padding:0}.photo-dialog{height:100dvh;border-radius:0}.photo-dialog footer{gap:6px;padding:12px}.photo-dialog footer span{width:100%;order:-1;text-align:center}.photo-grid{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}}
</style>
