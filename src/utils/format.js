// src/utils/format.js
export async function waitForEl(refObj, { tries = 60, delay = 25 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (refObj.value instanceof HTMLElement) return refObj.value;
    await new Promise(r => setTimeout(r, delay));
  }
  return null;
}

export function formatKm(m) {
  return (m / 1000).toFixed(1) + ' km';
}

export function formatDur(d) {
  const s = Math.round(parseFloat(String(d).replace('s','')) || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function durToSeconds(d) {
  return Math.round(parseFloat(String(d).replace('s','')) || 0);
}