// src/utils/links.js
export function toLatLngString(p) {
  return (p && typeof p.lat === 'number' && typeof p.lng === 'number') ? `${p.lat},${p.lng}` : null;
}

export function buildMapsDirUrl({ origin, destination, waypoints = [], travelmode = 'driving' }) {
  const params = new URLSearchParams({ api: '1', origin, destination, travelmode, dir_action: 'navigate' });
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildLinksFromVisitOrder(visitOrder = [], chunkIntermediates = 10) {
  const pts = visitOrder.filter(p => toLatLngString(p) && p.name !== 'ORIGEN');
  if (pts.length < 2) return [];
  const links = [];
  let i = 0;
  while (i < pts.length - 1) {
    const origin = toLatLngString(pts[i]);
    const destIndex = Math.min(i + chunkIntermediates + 1, pts.length - 1);
    const destination = toLatLngString(pts[destIndex]);
    const inter = pts.slice(i + 1, destIndex).map(toLatLngString);
    links.push({ from: i + 1, to: destIndex + 1, url: buildMapsDirUrl({ origin, destination, waypoints: inter }) });
    i = destIndex;
  }
  return links;
}

export async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); alert('Enlace copiado al portapapeles'); }
  catch { prompt('Copia el enlace:', text); }
}