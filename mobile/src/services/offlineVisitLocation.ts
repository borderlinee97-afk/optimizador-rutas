// Same baseline limits as the existing server geofence. The server revalidates
// its configured policy on sync; local progress remains provisional until then.
export function evaluateOfflineLocation(target:{lat:number|null;lng:number|null},location:{lat?:number;lng?:number;accuracyM?:number|null;mocked?:boolean}) {
  if (target.lat==null||target.lng==null||!Number.isFinite(target.lat)||!Number.isFinite(target.lng))throw new Error('La unidad no tiene coordenadas válidas descargadas.')
  const lat=location.lat,lng=location.lng
  if(typeof lat!=='number'||typeof lng!=='number'||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw new Error('No se obtuvo una ubicación GPS válida.')
  if(location.mocked)throw new Error('No se permiten ubicaciones simuladas.')
  if(location.accuracyM!=null&&(!Number.isFinite(location.accuracyM)||location.accuracyM<0||location.accuracyM>100))throw new Error('Espera una mejor señal GPS (precisión de 100 metros o mejor).')
  const r=(v:number)=>v*Math.PI/180,dlat=r(lat-target.lat),dlng=r(lng-target.lng)
  const a=Math.sin(dlat/2)**2+Math.cos(r(target.lat))*Math.cos(r(lat))*Math.sin(dlng/2)**2
  const distance=6371008.8*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)))
  if(distance>200)throw new Error(`Debes estar dentro de 200 m de la unidad. Distancia aproximada: ${Math.round(distance)} m.`)
  return distance
}
