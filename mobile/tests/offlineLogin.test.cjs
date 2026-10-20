const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { loadTs } = require('./helpers/loadTs.cjs')
const noble = require('@noble/hashes/pbkdf2')
const { sha256 } = require('@noble/hashes/sha256')

function harness(nativeVerifier = null, secure = new Map()) {
  const storage = new Map()
  let now = Date.now()
  const api = loadTs('src/services/offlineLogin.ts', {
    '@react-native-async-storage/async-storage': { default: { getItem: async k => storage.get(k), setItem: async (k,v) => storage.set(k,v) } },
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6, getItemAsync: async k => secure.get(k),
      setItemAsync: async (k,v) => secure.set(k,v), deleteItemAsync: async k => secure.delete(k) },
    'expo': { requireOptionalNativeModule: () => nativeVerifier },
    'expo-crypto': { getRandomBytesAsync: async n => new Uint8Array(crypto.randomBytes(n)) },
    '@noble/hashes/pbkdf2': noble, '@noble/hashes/sha256': { sha256 }, 'react-native': { Platform: { OS: 'android' } },
  }, { Date: class extends Date { static now() { return now } } })
  return { api, secure, storage, advance: ms => { now += ms } }
}

test('JS PBKDF2 verifier supports Unicode, matches the standard, never stores the password or tokens', async () => {
  const h = harness(), password = 'Contraseña🔐Á-2026'
  await h.api.saveOfflineLogin('A',' Usuario@Example.test ',password)
  const c = JSON.parse([...h.secure.values()][0])
  assert.equal(c.verifier, crypto.pbkdf2Sync(password, Buffer.from(c.salt,'hex'),600000,32,'sha256').toString('hex'))
  await h.api.verifyOfflineLogin('A','usuario@example.test',password)
  assert.ok(!JSON.stringify([...h.secure]).includes(password))
  assert.equal(h.storage.size,0)
  assert.equal(Object.keys(c).some(k => /password|token/.test(k)), false)
  await assert.rejects(h.api.verifyOfflineLogin('B','usuario@example.test',password), /internet/)
})

test('wrong email/password is refused and repeated failures persist a five-minute lock', async () => {
  const h = harness()
  await h.api.saveOfflineLogin('A','user@example.test','correct')
  await assert.rejects(h.api.verifyOfflineLogin('A','other@example.test','correct'), /incorrectos/)
  for(let i=0;i<4;i++) await assert.rejects(h.api.verifyOfflineLogin('A','user@example.test','wrong'), /incorrectos/)
  await assert.rejects(h.api.verifyOfflineLogin('A','user@example.test','correct'), /cinco minutos/)
  h.advance(300001)
  await h.api.verifyOfflineLogin('A','user@example.test','correct')
})

test('expiration, server revocation and account replacement require fresh online authentication', async () => {
  const h = harness()
  await h.api.saveOfflineLogin('A','a@example.test','one')
  h.advance(8*86400000+1)
  await assert.rejects(h.api.verifyOfflineLogin('A','a@example.test','one'), /internet/)
  await h.api.renewOfflineLogin('B')
  await assert.rejects(h.api.verifyOfflineLogin('A','a@example.test','one'), /internet/)
  await h.api.renewOfflineLogin('A')
  await h.api.verifyOfflineLogin('A','a@example.test','one')
  await h.api.saveOfflineLogin('B','b@example.test','two')
  await assert.rejects(h.api.verifyOfflineLogin('A','a@example.test','one'), /internet/)
  await h.api.forgetOfflineLogin('A')
  await h.api.verifyOfflineLogin('B','b@example.test','two')
  await h.api.forgetOfflineLogin('B')
  await assert.rejects(h.api.verifyOfflineLogin('B','b@example.test','two'), /internet/)
})


test('native acceleration reads existing v1 records; JS remains compatible if the native module is absent or unavailable',async()=>{
  const legacy=harness()
  await legacy.api.saveOfflineLogin('A','a@example.test','Contraseña🔐')
  let calls=0, unavailable=false
  const h=harness({deriveAsync:async(password,salt)=>{
    calls++
    if(unavailable)throw Error('unavailable')
    return crypto.pbkdf2Sync(password,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex')
  }},legacy.secure)
  await h.api.verifyOfflineLogin('A','a@example.test','Contraseña🔐')
  const c=JSON.parse([...h.secure.values()][0]);assert.equal(c.version,1)
  assert.equal(c.verifier,crypto.pbkdf2Sync('Contraseña🔐',Buffer.from(c.salt,'hex'),600000,32,'sha256').toString('hex'))
  await h.api.verifyOfflineLogin('A','a@example.test','Contraseña🔐');assert.equal(calls,2)
  unavailable=true
  await h.api.verifyOfflineLogin('A','a@example.test','Contraseña🔐');assert.equal(calls,3)
  await assert.rejects(h.api.verifyOfflineLogin('A','a@example.test','wrong'),/incorrectos/)
  assert.equal(JSON.parse([...h.secure.values()][0]).failures,1)
})

test('actual Java verifier agrees with PBKDF2 reference vectors including Unicode and long passwords',async t=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path')
  const {execFile}=require('node:child_process'),{promisify}=require('node:util'),run=promisify(execFile)
  try{await run('javac',['-version'])}catch{t.skip('JDK required for native verifier check');return}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'routes-password-verifier-'))
  try{
    const main=path.join(dir,'VerifierCheck.java')
    fs.writeFileSync(main,`import mx.appderutas.offlineauth.PasswordVerifier;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
public class VerifierCheck {
  public static void main(String[] args) throws Exception {
    for (int i=0;i<args.length;i+=2) {
      String password=new String(Base64.getDecoder().decode(args[i]),StandardCharsets.UTF_8);
      System.out.println(PasswordVerifier.derive(password,args[i+1]));
    }
  }
}`)
    const source=path.resolve(__dirname,'../modules/offline-password-verifier/android/src/main/java/mx/appderutas/offlineauth/PasswordVerifier.java')
    await run('javac',['-d',dir,source,main])
    const passwords=['ascii-2026','Contraseña🔐Á-2026','', 'nul\0password','長'.repeat(90)]
    const salt='01'.repeat(32),args=passwords.flatMap(p=>[Buffer.from(p).toString('base64'),salt])
    const result=await run('java',['-cp',dir,'VerifierCheck',...args])
    assert.deepEqual(result.stdout.trim().split(/\r?\n/),passwords.map(p=>crypto.pbkdf2Sync(p,Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex')))
  }finally{
    if(!dir.startsWith(path.join(os.tmpdir(),'routes-password-verifier-')))throw Error('Invalid test directory')
    fs.rmSync(dir,{recursive:true,force:true})
  }
})
