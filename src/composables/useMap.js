// src/composables/useMap.js
import { ref, shallowRef, onBeforeUnmount } from 'vue'

/**
 * Este composable asume que Google Maps JS API ya fue cargada
 * en main.js con @googlemaps/js-api-loader (window.google listo).
 */
export function useMap() {
  const mapEl = ref(null)
  const map = shallowRef(null)
  const infoWindow = shallowRef(null)
  const trafficLayer = shallowRef(null)
  const markers = ref([])
  const trafficEnabled = ref(true)
  const markersVisible = ref(true)

  // Overlays de rutas (polylines, markers secuencia, etc.)
  const routeOverlays = new Set()
  function trackOverlay(o) { if (o) routeOverlays.add(o) }
  function detachOverlay(o) {
    if (!o) return
    try {
      if (typeof o.setMap === 'function') o.setMap(null)
      else if ('map' in o) o.map = null
    } catch {}
  }
  function clearAllOverlays() {
    routeOverlays.forEach(detachOverlay)
    routeOverlays.clear()
  }

  let mapClickListener = null

  /**
   * Crea mapa y todos los marcadores de farmacias.
   * - getColorForRegion: fn(region) -> color
   * - farmacias: ref([]) con { latitud, longitud, region_sanitaria, clues, dificil_acceso, ... }
   */
  async function initMap({ getColorForRegion, farmacias }) {
    if (!window.google || !google.maps) {
      throw new Error('Google Maps JS API no está cargada aún (ver main.js).')
    }

    const { Map } = await google.maps.importLibrary('maps')
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary('marker')

    map.value = new Map(mapEl.value, {
      center: { lat: 20.6597, lng: -103.3496 },
      zoom: 12,
      mapId: 'DEMO_MAP_ID'
    })

    infoWindow.value = new google.maps.InfoWindow({ maxWidth: 280 })

    trafficLayer.value = new google.maps.TrafficLayer()
    trafficLayer.value.setMap(map.value)

    mapClickListener = map.value.addListener('click', () => infoWindow.value && infoWindow.value.close())

    // Marcadores por farmacia
    const bounds = new google.maps.LatLngBounds()
    markers.value = []

    for (const f of farmacias.value) {
      if (f.latitud == null || f.longitud == null) continue

      const isHard = !!f.dificil_acceso
      const pin = new PinElement({
        background: isHard ? '#9E9E9E' : getColorForRegion(f.region_sanitaria),
        borderColor: isHard ? '#FF3B30' : '#ffffff',
        glyphColor: '#ffffff',
        scale: 1.0
      })

      const marker = new AdvancedMarkerElement({
        map: map.value,
        position: { lat: +f.latitud, lng: +f.longitud },
        title: `${f.clues} — ${f.unidad ?? ''}`,
        content: pin
      })

      marker.__data = {
        clues: f.clues,
        unidad: f.unidad ?? '',
        region: f.region_sanitaria ?? '—',
        estatus: f.estatus ?? '—',
        supervisor: f.supervisor ?? '—',
        direccion: f.direccion ?? '',
        dificil: isHard
      }

      marker.addEventListener('gmp-click', (ev) => {
        const d = ev?.target?.__data || marker.__data
        infoWindow.value.setContent(`
          <div style="max-width:260px">
            <strong>${d.clues}</strong> — ${d.unidad}<br/>
            Región: <b>${d.region}</b><br/>
            ${d.dificil ? '<span style="display:inline-block;padding:2px 6px;border:1px solid #FF3B30;border-radius:10px;color:#FF3B30;font-size:12px;">Difícil acceso</span><br/>' : ''}
            Estatus: ${d.estatus}<br/>
            Supervisor: ${d.supervisor}<br/>
            ${d.direccion || ''}
          </div>
        `)
        infoWindow.value.open({ map: map.value, anchor: marker })
      })

      markers.value.push(marker)
      if (marker.position) bounds.extend(marker.position)
    }

    if (!bounds.isEmpty()) map.value.fitBounds(bounds)
  }

  function toggleTraffic() {
    if (!map.value || !trafficLayer.value) return
    trafficLayer.value.setMap(trafficEnabled.value ? null : map.value)
    trafficEnabled.value = !trafficEnabled.value
  }

  function toggleMarkers() {
    markersVisible.value = !markersVisible.value
    for (const m of markers.value) {
      try { m.map = markersVisible.value ? map.value : null } catch {}
    }
  }

  onBeforeUnmount(() => {
    if (mapClickListener) {
      try { google.maps.event.removeListener(mapClickListener) } catch {}
      mapClickListener = null
    }
  })

  return {
    mapEl, map, infoWindow,
    trafficEnabled, markersVisible, markers,
    initMap, toggleTraffic, toggleMarkers,
    trackOverlay, detachOverlay, clearAllOverlays
  }
}
``