// src/utils/export.js
import { durToSeconds } from './format.js';
import { toLatLngString } from './links.js';

export async function exportToExcelSingle({ criteria, lastRegionUsed, lastOriginUsed, linkChunkSize, lastRawData, mapsLinks, farmacias }) {
  const XLSX = await import('xlsx'); // lazy
  const wb = XLSX.utils.book_new();

  const region = lastRegionUsed.value || criteria.value.region || '';
  const now = new Date();
  const meta = [{
    fecha: now.toISOString(),
    estrategia: criteria.value.strategy,
    region,
    origen: lastOriginUsed.value ? `${lastOriginUsed.value.lat},${lastOriginUsed.value.lng}` : '—',
    evitar_cuota: criteria.value.options.avoidTolls,
    alternativas: criteria.value.options.showAlternatives,
    regresar_origen: criteria.value.options.returnToOrigin,
    intermedios_por_enlace: linkChunkSize.value,
    total_dist_m: lastRawData.value?.total?.distanceMeters ?? 0,
    total_dur_s: durToSeconds(lastRawData.value?.total?.duration ?? '0s')
  }];

  const subs = (lastRawData.value?.subroutes ?? []).map((sr, i) => ({
    subruta_idx: i+1,
    distancia_m: sr.distance ?? 0,
    duracion_s:  durToSeconds(sr.duration ?? '0s'),
    conteo:      Number(sr.count || 0)
  }));

  const vo = (lastRawData.value?.visitOrder ?? []).filter(p => toLatLngString(p) && p.name !== 'ORIGEN');
  const counts = (lastRawData.value?.subroutes ?? []).map(s => Number(s.count||0));
  let borders=[]; { let acc=0; for (const c of counts){ borders.push([acc, acc+c-1]); acc+=c; } }
  const visitas = vo.map((p, idx) => {
    const subidx = borders.findIndex(b => idx >= b[0] && idx <= b[1]);
    return { orden: idx+1, id: p.id ?? '', nombre: p.name ?? '', lat: p.lat, lng: p.lng, subruta_idx: subidx>=0 ? (subidx+1) : '' };
  });

  const legs = Array.isArray(lastRawData.value?.legs) ? lastRawData.value.legs : [];
  const legsRows = [];
  for (let i=0;i<legs.length;i++){
    const from = vo[i] ?? null, to = vo[i+1] ?? null, L = legs[i] ?? {};
    legsRows.push({
      tramo_idx: i+1,
      de: from ? (from.name ?? '') : '', a: to ? (to.name ?? '') : '',
      distancia_m: L.distanceMeters ?? 0, distancia_km: ((L.distanceMeters ?? 0)/1000),
      duracion_s: durToSeconds(L.duration ?? '0s'), duracion_min: Math.round(durToSeconds(L.duration ?? '0s')/60)
    });
  }

  const setNames = new Set(vo.map(p => p.name));
  const farmRows = farmacias.value
    .filter(f => setNames.has(f.clues) || setNames.has(f.unidad))
    .map(f => ({
      id: f.id ?? '', clues: f.clues ?? '', unidad: f.unidad ?? '', region: f.region_sanitaria ?? '', supervisor: f.supervisor ?? '',
      estatus: f.estatus ?? '', direccion: f.direccion ?? '', lat: f.latitud ?? '', lng: f.longitud ?? ''
    }));

  const enlaces = mapsLinks.value.map((l, i) => ({ enlace_idx: i+1, de: l.from, a: l.to, url: l.url }));

  const sheets = [
    { name:'Meta', rows: meta },
    { name:'Visitas', rows: visitas },
    { name:'Tramos', rows: legsRows },
    { name:'Subrutas', rows: subs },
    { name:'Enlaces', rows: enlaces },
    { name:'Farmacias', rows: farmRows }
  ];

  for (const s of sheets){
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0,31));
  }
  const dateTag = new Date().toISOString().replace(/[:\-T]/g,'').slice(0,15);
  XLSX.writeFile(wb, `ruta_${(region||'region')}_${dateTag}.xlsx`);
}

export async function exportToExcelMassive({ linkChunkSize, massiveResults }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const now = new Date();
  const meta = [{ fecha: now.toISOString(), ambito: 'TODAS', intermedios_por_enlace: linkChunkSize.value }];
  const sheets = [{ name:'Meta', rows: meta }];

  const allVisitas = [], allLegs = [], allSubs = [];
  for (const mr of massiveResults.value){
    const data = mr._rawData;
    const region = mr.region;
    const vo = (data?.visitOrder ?? []).filter(p => toLatLngString(p) && p.name !== 'ORIGEN');
    const counts = (data?.subroutes ?? []).map(s => Number(s.count||0));
    let borders=[]; { let acc=0; for (const c of counts){ borders.push([acc, acc+c-1]); acc+=c; } }
    vo.forEach((p, idx) => {
      const subidx = borders.findIndex(b => idx>=b[0] && idx<=b[1]);
      allVisitas.push({ region, orden: idx+1, id: p.id ?? '', nombre: p.name ?? '', lat: p.lat, lng: p.lng, subruta_idx: subidx>=0 ? (subidx+1) : '' });
    });
    const legs = Array.isArray(data?.legs) ? data.legs : [];
    for (let i=0;i<legs.length;i++){
      const from = vo[i] ?? null, to = vo[i+1] ?? null, L = legs[i] ?? {};
      allLegs.push({
        region, tramo_idx: i+1,
        de: from ? (from.name ?? '') : '', a: to ? (to.name ?? '') : '',
        distancia_m: L.distanceMeters ?? 0, distancia_km: ((L.distanceMeters ?? 0)/1000),
        duracion_s: durToSeconds(L.duration ?? '0s'), duracion_min: Math.round(durToSeconds(L.duration ?? '0s')/60)
      });
    }
    (data?.subroutes ?? []).forEach((sr, i) => {
      allSubs.push({ region, subruta_idx: i+1, distancia_m: sr.distance ?? 0, duracion_s: durToSeconds(sr.duration ?? '0s'), conteo: Number(sr.count||0) });
    });
  }
  sheets.push({ name:'Visitas', rows: allVisitas });
  sheets.push({ name:'Tramos', rows: allLegs });
  sheets.push({ name:'Subrutas', rows: allSubs });

  for (const s of sheets){
    const ws = XLSX.utils.json_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0,31));
  }
  const dateTag = new Date().toISOString().replace(/[:\-T]/g,'').slice(0,15);
  XLSX.writeFile(wb, `rutas_todas_${dateTag}.xlsx`);
}

export function exportCsv(rows, filenamePrefix = 'visitas') {
  if (!rows.length) { alert('No hay visitas para exportar.'); return; }
  const headers = Object.keys(rows[0]);
  const CSV = [headers.join(',')].concat(rows.map(r => headers.map(h => {
    const v = r[h] == null ? '' : String(r[h]);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g,'""')}"` : v;
  }).join(','))).join('\r\n');
  const blob = new Blob([CSV], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  const dateTag = new Date().toISOString().replace(/[:\-T]/g,'').slice(0,15);
  a.download = `${filenamePrefix}_${dateTag}.csv`; a.click(); URL.revokeObjectURL(a.href);
}