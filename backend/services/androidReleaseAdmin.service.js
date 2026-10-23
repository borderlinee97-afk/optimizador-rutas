import { readAndroidRelease, validateAndroidRelease, releaseFromBuild, fingerprintApk } from './androidRelease.service.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function updateError(code,message,status=409){return Object.assign(new Error(message),{code,status})}
export function assertUpdateAdmin(actor){
 if(actor?.activo!==true || actor.system_role!=='ADMIN')throw updateError('APP_UPDATE_ADMIN_REQUIRED','Sólo un administrador activo puede gestionar actualizaciones.',403)
}
export function parseExpoBuild(value){
 const text=String(value??'').trim()
 if(UUID.test(text))return text.toLowerCase()
 try{
  const url=new URL(text),match=url.pathname.match(/^\/accounts\/borderline97\/projects\/app-de-rutas\/builds\/([0-9a-f-]{36})\/?$/i)
  if(url.protocol==='https:'&&url.hostname==='expo.dev'&&!url.port&&!url.username&&!url.password&&!url.search&&!url.hash&&match&&UUID.test(match[1]))return match[1].toLowerCase()
 }catch{}
 throw updateError('EXPO_BUILD_INVALID','Pega el enlace de una compilación del proyecto app-de-rutas en Expo.',422)
}
export async function fetchExpoBuild(input,{token=process.env.EXPO_TOKEN,fetcher=fetch}={}){
 const id=parseExpoBuild(input)
 if(!token?.trim())throw updateError('EXPO_NOT_CONFIGURED','Falta configurar la credencial de Expo en el servidor.',503)
 try{
  const response=await fetcher('https://api.expo.dev/graphql',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({query:'query($id: ID!){builds{byId(buildId:$id){id status platform buildProfile distribution appVersion appBuildVersion appIdentifier artifacts{applicationArchiveUrl}project{id}}}}',variables:{id}})})
  const payload=await response.json()
  if(!response.ok||payload.errors?.length||!payload.data?.builds?.byId)throw Error('EXPO_UNAVAILABLE')
  const build=payload.data.builds.byId
  if(build.id!==id)throw Error('EXPO_BUILD_MISMATCH')
  // Reuse the same project/platform/finished-preview/permanent-APK policy as the existing CLI.
  releaseFromBuild(build,null,'',{sha256:'0'.repeat(64),byteSize:1})
  return build
 }catch{
  throw updateError('EXPO_BUILD_UNVERIFIED','No se pudo verificar una APK preview terminada de este proyecto. Revisa la compilación y el acceso de Expo.',502)
 }
}
export async function verifyExpoApk(build,{fetcher=fetch}={}){
 const url=releaseFromBuild(build,null,'',{sha256:'0'.repeat(64),byteSize:1}).artifactUrl
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000)
 try{
  const response=await fetcher(url,{signal:controller.signal})
  if(!response.ok||!response.body)throw Error('APK_DOWNLOAD_FAILED')
  return await fingerprintApk(response.body)
 }catch{throw updateError('APK_VERIFICATION_FAILED','No se pudo verificar el archivo APK de Expo. No se ha publicado ninguna actualización.',502)}
 finally{clearTimeout(timer);controller.abort()}
}
export async function readCurrentAndroidRelease(db,fallback=readAndroidRelease){
 try{
  const result=await db.query(`SELECT c.initialized,c.current_build_id,r.metadata,r.published_at FROM public.app_android_channel c LEFT JOIN public.app_android_release r ON r.build_id=c.current_build_id WHERE c.singleton=true`)
  const row=result.rows[0]
  if(!row?.initialized)return fallback()
  if(!row.current_build_id)return null
  if(!row.metadata||!row.published_at)throw Error('INVALID_RELEASE_CHANNEL')
  return validateAndroidRelease({...row.metadata,publishedAt:new Date(row.published_at).toISOString()})
 }catch(error){if(error.code==='42P01')return fallback();throw error}
}
async function transaction(db,operation){
 const client=await db.connect()
 try{await client.query('BEGIN');const value=await operation(client);await client.query('COMMIT');return value}
 catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
const busyPreparations=new WeakSet()
export function createAndroidReleaseAdmin(db,{getBuild=fetchExpoBuild,inspectApk=verifyExpoApk,fallback=readAndroidRelease,expoConfigured=()=>Boolean(process.env.EXPO_TOKEN?.trim())}={}){
 const audit=(client,id,actor,action,reason='')=>client.query('INSERT INTO public.app_android_release_event(build_id,actor_id,action,reason) VALUES($1,$2,$3,$4)',[id,actor.id,action,reason])
 const state=async actor=>{
  assertUpdateAdmin(actor)
  const [channel,releases,events,current]=await Promise.all([
   db.query('SELECT revision,highest_version_code FROM public.app_android_channel WHERE singleton=true'),
   db.query('SELECT r.build_id,r.version_code,r.metadata,r.prepared_at,r.published_at,p.nombre AS prepared_by_name FROM public.app_android_release r JOIN public.personas p ON p.id=r.prepared_by ORDER BY r.prepared_at DESC LIMIT 20'),
   db.query('SELECT e.build_id,e.action,e.reason,e.created_at,p.nombre AS actor_name FROM public.app_android_release_event e JOIN public.personas p ON p.id=e.actor_id ORDER BY e.created_at DESC,e.id DESC LIMIT 30'),
   readCurrentAndroidRelease(db,fallback),
  ])
  if(!channel.rows[0])throw updateError('APP_UPDATES_NOT_READY','El panel requiere completar su migración de base de datos.',503)
  return {revision:channel.rows[0].revision,highestVersionCode:Math.max(channel.rows[0].highest_version_code,current?.versionCode??0),current,expoConfigured:expoConfigured(),releases:releases.rows,events:events.rows}
 }
 return {
  state,
  async prepare(actor,{buildUrl,notes}={}){
   assertUpdateAdmin(actor)
   if(typeof notes!=='string'||notes.length>4000)throw updateError('APP_UPDATE_NOTES_INVALID','Escribe notas de hasta 4,000 caracteres.',422)
   parseExpoBuild(buildUrl)
   if(busyPreparations.has(db))throw updateError('APP_UPDATE_VERIFY_BUSY','Ya se está verificando una APK. Espera un momento y vuelve a intentar.')
   busyPreparations.add(db)
   try{
    const build=await getBuild(buildUrl),integrity=await inspectApk(build),release=releaseFromBuild(build,null,notes.trim(),integrity)
    return await transaction(db,async client=>{
     // Serializes both preparation and publication and avoids duplicate audit entries on retry.
     await client.query('SELECT singleton FROM public.app_android_channel WHERE singleton=true FOR UPDATE')
     const existing=(await client.query('SELECT metadata FROM public.app_android_release WHERE build_id=$1',[release.buildId])).rows[0]
     if(existing){
      if(existing.metadata.sha256!==release.sha256||existing.metadata.byteSize!==release.byteSize||existing.metadata.notes!==release.notes)throw updateError('APP_UPDATE_ALREADY_PREPARED','Esta compilación ya está registrada con otros datos. Selecciónala en el historial.')
      return {release:existing.metadata,existing:true}
     }
     const sameCode=await client.query('SELECT build_id FROM public.app_android_release WHERE version_code=$1',[release.versionCode])
     if(sameCode.rowCount)throw updateError('APP_UPDATE_VERSION_USED','Ese código de versión ya pertenece a otra compilación. Genera una APK con un código superior.')
     await client.query('INSERT INTO public.app_android_release(build_id,version_code,metadata,prepared_by) VALUES($1,$2,$3,$4)',[release.buildId,release.versionCode,release,actor.id])
     await audit(client,release.buildId,actor,'PREPARED')
     return {release,existing:false}
    })
   }finally{busyPreparations.delete(db)}
  },
  async publish(actor,{buildId,expectedRevision,confirmTested}={}){
   assertUpdateAdmin(actor)
   if(typeof buildId!=='string'||!UUID.test(buildId)||!Number.isSafeInteger(expectedRevision)||confirmTested!==true)throw updateError('APP_UPDATE_CONFIRM_REQUIRED','Selecciona una APK verificada y confirma que la probaste antes de publicarla.',422)
   const record=(await db.query('SELECT metadata FROM public.app_android_release WHERE build_id=$1',[buildId])).rows[0]
   if(!record)throw updateError('APP_UPDATE_NOT_FOUND','La compilación no está verificada en este panel.',404)
   const build=await getBuild(buildId),release=releaseFromBuild(build,null,record.metadata.notes,record.metadata)
   if(release.artifactUrl!==record.metadata.artifactUrl||release.versionCode!==record.metadata.versionCode||release.version!==record.metadata.version)throw updateError('APP_UPDATE_BUILD_CHANGED','Los datos de Expo cambiaron. No se publicó la actualización.')
   return transaction(db,async client=>{
    const channel=(await client.query('SELECT * FROM public.app_android_channel WHERE singleton=true FOR UPDATE')).rows[0]
    if(channel?.current_build_id===buildId)return {published:true,unchanged:true}
    if(!channel||channel.revision!==expectedRevision)throw updateError('APP_UPDATE_STALE','Otro administrador cambió el canal. Actualiza el panel antes de continuar.')
    const minimum=Math.max(channel.highest_version_code,fallback()?.versionCode??0)
    if(release.versionCode<=minimum)throw updateError('APP_UPDATE_DOWNGRADE','El código debe superar todas las versiones publicadas. Una versión retirada no se vuelve a anunciar.')
    await client.query('UPDATE public.app_android_release SET published_at=$2 WHERE build_id=$1',[buildId,release.publishedAt])
    await client.query('UPDATE public.app_android_channel SET current_build_id=$1,highest_version_code=$2,revision=revision+1,initialized=true WHERE singleton=true',[buildId,release.versionCode])
    await audit(client,buildId,actor,'PUBLISHED')
    return {published:true,unchanged:false}
   })
  },
  async withdraw(actor,{expectedRevision,reason}={}){
   assertUpdateAdmin(actor)
   if(!Number.isSafeInteger(expectedRevision)||typeof reason!=='string'||reason.trim().length<5||reason.length>500)throw updateError('APP_UPDATE_REASON_REQUIRED','Indica por qué retiras la actualización (entre 5 y 500 caracteres).',422)
   return transaction(db,async client=>{
    const channel=(await client.query('SELECT * FROM public.app_android_channel WHERE singleton=true FOR UPDATE')).rows[0]
    if(!channel||channel.revision!==expectedRevision)throw updateError('APP_UPDATE_STALE','Otro administrador cambió el canal. Actualiza el panel antes de continuar.')
    if(!channel.current_build_id)throw updateError('APP_UPDATE_NOT_PUBLISHED','No hay una actualización publicada para retirar.')
    await audit(client,channel.current_build_id,actor,'WITHDRAWN',reason.trim())
    await client.query('UPDATE public.app_android_channel SET current_build_id=NULL,revision=revision+1,initialized=true WHERE singleton=true')
    return {withdrawn:true}
   })
  },
 }
}
