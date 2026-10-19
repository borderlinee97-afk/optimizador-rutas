const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { loadTs } = require('./helpers/loadTs.cjs')
const noble = require('@noble/hashes/pbkdf2')
const { sha256 } = require('@noble/hashes/sha256')

function harness() {
  const secure = new Map(), storage = new Map()
  let now = Date.now()
  const api = loadTs('src/services/offlineLogin.ts', {
    '@react-native-async-storage/async-storage': { default: { getItem: async k => storage.get(k), setItem: async (k,v) => storage.set(k,v) } },
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6, getItemAsync: async k => secure.get(k),
      setItemAsync: async (k,v) => secure.set(k,v), deleteItemAsync: async k => secure.delete(k) },
    'expo-crypto': { getRandomBytesAsync: async n => new Uint8Array(crypto.randomBytes(n)) },
    '@noble/hashes/pbkdf2': noble, '@noble/hashes/sha256': { sha256 }, 'react-native': { Platform: { OS: 'android' } },
  }, { Date: class extends Date { static now() { return now } } })
  return { api, secure, storage, advance: ms => { now += ms } }
}

test('native PBKDF2 verifier supports Unicode, matches the standard, never stores the password or tokens', async () => {
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
