const test = require('node:test')
const assert = require('node:assert/strict')
const { loadTs, hooks } = require('./helpers/loadTs.cjs')
const crypto = require('node:crypto')

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const sessionFor = id => ({ user: { id }, access_token: `token-${id}`, refresh_token: 'sdk-owned', expires_at: 1 })
const profileFor = id => ({ id: `persona-${id}`, nombre: id, area: 'FARMACIAS', rol: 'SUPERVISOR', activo: true, superiorId: null })
class ApiError extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code } }
const network = () => new ApiError('offline', 0, 'NETWORK_ERROR')

function harness({ storage = new Map(), secureStorage = new Map(), stored = sessionFor(A), sdkNetworkError = false, initialError = null, refreshEmitsEvent = false, platform = 'android', area = 'FARMACIAS',
  refreshError = null, recovery = async () => ({ copied: 0, retained: 0 }) } = {}) {
  const storageApi = { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value) } }
  const cache = loadTs('src/services/profileCache.ts', { '@react-native-async-storage/async-storage': { default: storageApi } })
  let disconnected = sdkNetworkError
  const offlineLogin = loadTs('src/services/offlineLogin.ts', {
    '@react-native-async-storage/async-storage': { default: storageApi },
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
      getItemAsync: async key => secureStorage.get(key) ?? null,
      setItemAsync: async (key, value) => { secureStorage.set(key, value) },
      deleteItemAsync: async key => { secureStorage.delete(key) } },
    'expo': { requireOptionalNativeModule: () => null },
    'expo-crypto': { getRandomBytesAsync: async size => new Uint8Array(crypto.randomBytes(size)) },
    '@noble/hashes/pbkdf2': { pbkdf2Async: async (_, input, salt, opts) => new Uint8Array(crypto.pbkdf2Sync(input, salt, opts.c, opts.dkLen, 'sha256')) },
    '@noble/hashes/sha256': { sha256: {} }, 'react-native': { Platform: { OS: platform } },
  })
  const runner = hooks()
  let authCallback, sdkSession = stored, error = initialError, activeOwner = null, deferred = null, profileOverride = null
  const calls = [], revoked = []
  const sdk = {
    onAuthStateChange(callback) { authCallback = callback; return { data: { subscription: { unsubscribe() {} } } } },
    getSession: async () => sdkNetworkError
      ? { data: { session: null }, error: { name: 'AuthRetryableFetchError' } }
      : { data: { session: sdkSession }, error: null },
    refreshSession: async () => {
      if (refreshError) return { data: { session: null }, error: refreshError }
      if (refreshEmitsEvent) {
        sdkSession = { ...sdkSession, access_token: `token-${sdkSession.user.id}-renewed` }
        authCallback('TOKEN_REFRESHED', sdkSession)
      }
      return { data: { session: sdkSession }, error: null }
    },
    signInWithPassword: async () => {
      if (error?.code === 'NETWORK_ERROR') return { error }
      sdkSession = sessionFor(A); authCallback('SIGNED_IN', sdkSession); return { data: { session: sdkSession }, error: null }
    },
    signOut: async () => { sdkSession = null; authCallback('SIGNED_OUT', null); return { error: null } },
    resetPasswordForEmail: async () => ({ error: null }),
  }
  const exports = loadTs('src/context/AuthContext.tsx', {
    ...runner.modules,
    '@react-native-community/netinfo': { default: { fetch: async () => ({ isConnected: !disconnected, isInternetReachable: !disconnected }) } },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '../lib/api': { ApiError, unregisterPushSession: async token => { revoked.push(token); if (sdkNetworkError) throw network() }, getCurrentProfile: async token => {
      calls.push(token)
      if (deferred) return deferred
      const failure = typeof error === 'function' ? error(token) : error
      if (failure) throw failure
      const id = token.slice('token-'.length, 'token-'.length + 36)
      return { user: { id }, profile: profileOverride ?? { ...profileFor(id), area } }
    } },
    '../lib/supabase': { supabase: { auth: sdk }, readPersistedAuthSession: async () => sdkSession },
    '../../storage/db': {
      activateUserDatabase: id => { activeOwner = id }, deactivateUserDatabase: () => { activeOwner = null }, hasLegacyLocalData: () => false,
      isDatabaseActive: id => activeOwner === id,
    },
    '../services/profileCache': cache,
    '../services/offlineLogin': offlineLogin,
    '../services/legacyRecovery': { recoverLegacyData: recovery },
  }, { setInterval: () => 0, clearInterval() {} })
  runner.mount(exports.AuthProvider)
  return { runner, storage, secureStorage, cache, calls, revoked, offlineLogin, get owner() { return activeOwner },
    setDisconnected(value) { disconnected = value },
    setProfile(value) { profileOverride = value },
    setError(value) { error = value }, defer(value) { deferred = value },
    changeUser(id) { sdkSession = sessionFor(id); authCallback('SIGNED_IN', sdkSession) },
    revokeSession() { sdkSession = null; authCallback('SIGNED_OUT', null) } }
}

test('A: online password login persists only the backend profile under the real auth ID', async () => {
  const h = harness({ stored: null }); await h.runner.flush()
  assert.equal(h.runner.value.accessState, 'signed_out')
  assert.equal(h.runner.value.sessionEndReason, 'no_previous_session')
  await h.runner.value.signIn('user@example.test', 'not-persisted'); await h.runner.flush()
  assert.equal(h.runner.value.accessState, 'online'); assert.equal(h.owner, A)
  const saved = await h.cache.readProfileSnapshot(A)
  assert.equal(saved.profile.id, profileFor(A).id)
  assert.ok(!JSON.stringify([...h.storage]).includes('not-persisted'))
  h.runner.stop()
})

test('C/D/E: cold start with expired SDK session and network failure restores the same profile without deleting it', async () => {
  const first = harness(); await first.runner.flush(); first.runner.stop()
  const before = JSON.stringify([...first.storage])
  const offline = harness({ storage: first.storage, sdkNetworkError: true, initialError: network() })
  await offline.runner.flush()
  assert.equal(offline.runner.value.session.user.id, A)
  assert.equal(offline.runner.value.profile.id, profileFor(A).id)
  assert.equal(offline.runner.value.accessState, 'offline')
  assert.equal(JSON.stringify([...first.storage]), before)
  offline.runner.stop()
})

test('F: reconnect validates with the backend and updates the snapshot', async () => {
  const h = harness(); await h.runner.flush()
  h.setError(network()); await h.runner.value.refreshProfile(); await h.runner.flush()
  assert.equal(h.runner.value.accessState, 'offline')
  h.setError(null); await h.runner.value.refreshProfile(); await h.runner.flush()
  assert.equal(h.runner.value.accessState, 'online'); assert.ok(h.calls.length >= 3)
  h.runner.stop()
})

test('G: a cached profile alone never grants a first offline login without an SDK session', async () => {
  const first = harness(); await first.runner.flush(); first.runner.stop()
  const h = harness({ stored: null, storage: first.storage, initialError: network() }); await h.runner.flush()
  assert.equal(h.runner.value.session, null); assert.equal(h.runner.value.profile, null)
  const result = await h.runner.value.signIn('user@example.test', 'password')
  assert.ok(result.error); assert.equal(h.calls.length, 0)
  h.runner.stop()
})

test('H: changing accounts hides A immediately and ignores a late A response', async () => {
  const h = harness(); await h.runner.flush()
  let resolveA
  h.defer(new Promise(resolve => { resolveA = resolve }))
  const late = h.runner.value.refreshProfile()
  h.changeUser(B); h.defer(null); await h.runner.flush()
  assert.equal(h.runner.value.profile.id, profileFor(B).id); assert.equal(h.owner, B)
  resolveA({ user: { id: A }, profile: profileFor(A) }); await late; await h.runner.flush()
  assert.equal(h.runner.value.profile.id, profileFor(B).id)
  h.runner.stop()
})

test('H: offline user B never falls back to the cached profile of A', async () => {
  const h = harness(); await h.runner.flush()
  h.setError(network()); h.changeUser(B); await h.runner.flush()
  assert.equal(h.runner.value.user.id, B)
  assert.equal(h.runner.value.profile, null); assert.equal(h.runner.value.accessState, 'offline')
  assert.ok(await h.cache.readProfileSnapshot(A)); assert.equal(await h.cache.readProfileSnapshot(B), null)
  h.runner.stop()
})

test('J: inactive backend profile blocks offline reuse, including after another cold start', async () => {
  const h = harness(); await h.runner.flush()
  h.setError(new ApiError('inactive', 403, 'PROFILE_INACTIVE'))
  await h.runner.value.refreshProfile(); await h.runner.flush()
  assert.equal(h.runner.value.profile, null); assert.equal(h.runner.value.accessState, 'unauthorized')
  assert.equal(await h.cache.readProfileSnapshot(A), null); h.runner.stop()
  const offline = harness({ storage: h.storage, initialError: network() }); await offline.runner.flush()
  assert.equal(offline.runner.value.profile, null); offline.runner.stop()
})

test('local logout locks account access without discarding the authorized snapshot or SDK session', async () => {
  const h = harness(); await h.runner.flush()
  await h.runner.value.signOut(); await h.runner.flush()
  assert.equal(h.runner.value.profile, null); assert.equal(h.owner, null)
  assert.equal(h.runner.value.accessState, 'signed_out')
  assert.equal(h.runner.value.sessionEndReason, 'explicit_logout')
  assert.ok(await h.cache.readProfileSnapshot(A))
  assert.equal(await h.offlineLogin.isLocalLoginLocked(), true)
  h.runner.stop()
})

test('a snapshot from another account or with an inactive profile is rejected', () => {
  const h = harness()
  assert.equal(h.cache.isUsableSnapshot({ userId: A, profile: profileFor(A), validatedAt: Date.now(), blocked: false }, B), false)
  assert.equal(h.cache.isUsableSnapshot({ userId: A, profile: { ...profileFor(A), activo: false }, validatedAt: Date.now(), blocked: false }, A), false)
})

test('a persistent backend 401 blocks access after one SDK refresh, without a retry loop', async () => {
  const h = harness(); await h.runner.flush()
  h.setError(new ApiError('revoked', 401, 'INVALID_TOKEN'))
  const before = h.calls.length
  await h.runner.value.refreshProfile(); await h.runner.flush()
  assert.equal(h.runner.value.profile, null); assert.equal(h.runner.value.accessState, 'unauthorized')
  assert.equal(h.calls.length - before, 2); assert.equal(await h.cache.readProfileSnapshot(A), null)
  h.runner.stop()
})

test('SDK TOKEN_REFRESHED supersedes the expired-token request and validates the new token', async () => {
  const h = harness({ refreshEmitsEvent: true }); await h.runner.flush()
  h.setError(token => token.endsWith('-renewed') ? null : new ApiError('expired', 401))
  await h.runner.value.refreshProfile(); await h.runner.flush()
  assert.equal(h.runner.value.accessState, 'online')
  assert.equal(h.runner.value.profile.id, profileFor(A).id)
  assert.equal(h.runner.value.session.access_token, `token-${A}-renewed`)
  assert.ok(await h.cache.readProfileSnapshot(A)); h.runner.stop()
})

test('an actual SDK SIGNED_OUT is distinguished from explicit logout and blocks the cached profile', async () => {
  const h = harness(); await h.runner.flush()
  h.revokeSession(); await h.runner.flush()
  assert.equal(h.runner.value.profile, null); assert.equal(h.runner.value.session, null)
  assert.equal(h.runner.value.sessionEndReason, 'server_invalidated')
  assert.match(h.runner.value.profileError, /invalidada/)
  assert.equal(await h.cache.readProfileSnapshot(A), null); h.runner.stop()
})

test('explicit recovery uses the SDK session and exact auth/persona IDs without automatically starting at login', async () => {
  const requests = []
  const h = harness({ recovery: async account => { requests.push(account); assert.equal(account.isCurrent(), true); return { copied: 1, retained: 0 } } })
  await h.runner.flush(); assert.equal(requests.length, 0)
  await h.runner.value.recoverLegacy(); await h.runner.flush()
  assert.equal(requests[0].userId, A); assert.equal(requests[0].profileId, profileFor(A).id)
  assert.equal(requests[0].accessToken, sessionFor(A).access_token)
  assert.equal(h.runner.value.legacyRecovery.result.copied, 1); h.runner.stop()
})

test('offline recovery cannot attribute additional records and does not discard the saved profile', async () => {
  let requests = 0
  const h = harness({ recovery: async () => { requests++; throw new Error('must not run offline') } })
  await h.runner.flush(); h.setError(network()); await h.runner.value.refreshProfile(); await h.runner.flush()
  assert.equal(await h.runner.value.recoverLegacy(), null)
  assert.equal(requests, 0); assert.ok(await h.cache.readProfileSnapshot(A)); h.runner.stop()
})

test('recovery authorization denial blocks offline profile reuse without ending the SDK session', async () => {
  const h = harness({ recovery: async () => { throw new ApiError('inactive', 403, 'PROFILE_INACTIVE') } })
  await h.runner.flush(); await h.runner.value.recoverLegacy(); await h.runner.flush()
  assert.equal(h.runner.value.accessState, 'unauthorized'); assert.equal(h.runner.value.profile, null)
  assert.equal(h.runner.value.session.user.id, A); assert.equal(await h.cache.readProfileSnapshot(A), null)
  assert.equal(h.owner, null); h.runner.stop()
})

test('a recovery result for A never appears in B after an account switch', async () => {
  let finish, account
  const h = harness({ recovery: args => { account = args; return new Promise(resolve => { finish = resolve }) } })
  await h.runner.flush(); const pending = h.runner.value.recoverLegacy(); await h.runner.flush()
  h.changeUser(B); await h.runner.flush(); assert.equal(account.isCurrent(), false)
  finish({ copied: 1, retained: 0 }); await pending; await h.runner.flush()
  assert.equal(h.runner.value.legacyRecovery.result, null); assert.equal(h.runner.value.profile.id, profileFor(B).id)
  h.runner.stop()
})


test('Logout unregisters push online and locks locally offline without erasing authorized snapshots', async () => {
 for(const sdkNetworkError of [false,true]) {
  const h=harness({sdkNetworkError})
  if (sdkNetworkError) await h.cache.saveProfileSnapshot(A, profileFor(A))
  await h.runner.flush()
  const before=h.storage.get(`authorized-profile:v1:${A}`);await h.runner.value.signOut();await h.runner.flush()
  assert.deepEqual(h.revoked,sdkNetworkError?[]:[sessionFor(A).access_token]);assert.equal(h.runner.value.session,null)
  const after=JSON.parse(h.storage.get(`authorized-profile:v1:${A}`));assert.equal(after.blocked,false)
  if(before)assert.deepEqual(after.profile,JSON.parse(before).profile);h.runner.stop()
 }
})


test('Expired access token plus network failure renewing it preserves the validated offline profile', async () => {
  const h = harness({ refreshError: { name: 'AuthRetryableFetchError', message: 'Network request failed' } })
  await h.runner.flush()
  h.setError(new ApiError('Access token expired', 401, 'ACCESS_TOKEN_INVALID'))
  await h.runner.value.refreshProfile(); await h.runner.flush()
  assert.equal(h.runner.value.session.user.id, A)
  assert.equal(h.runner.value.accessState, 'offline')
  assert.equal(h.runner.value.profile.id, profileFor(A).id)
  assert.ok(await h.cache.readProfileSnapshot(A))
  assert.equal(h.owner, A)
  h.runner.stop()
})


test('An actual refresh token rejection still blocks offline reuse after an access-token 401', async () => {
  const h = harness({ refreshError: { name: 'AuthApiError', status: 400, code: 'refresh_token_not_found' } })
  await h.runner.flush()
  h.setError(new ApiError('Token invalid', 401, 'ACCESS_TOKEN_INVALID'))
  await h.runner.value.refreshProfile(); await h.runner.flush()
  assert.equal(h.runner.value.accessState, 'unauthorized')
  assert.equal(h.runner.value.profile, null)
  assert.equal(await h.cache.readProfileSnapshot(A), null)
  h.runner.stop()
})

test('Cold start with a cached profile, expired access token and offline refresh keeps account access', async () => {
  const first = harness(); await first.runner.flush(); first.runner.stop()
  const h = harness({ storage: first.storage, initialError: new ApiError('Expired', 401),
    refreshError: { name: 'AuthRetryableFetchError', message: 'Network request failed' } })
  await h.runner.flush()
  assert.equal(h.runner.value.accessState, 'offline')
  assert.equal(h.runner.value.profile.id, profileFor(A).id)
  assert.equal(h.runner.value.session.user.id, A)
  h.runner.stop()
})

test('password-validated account can logout, restart locked, reopen offline and reconnect without losing its owner', async () => {
  const first = harness({ stored: null }); await first.runner.flush()
  await first.runner.value.signIn('user@example.test','correct-password'); await first.runner.flush()
  first.setDisconnected(true); first.setError(network())
  await first.runner.value.signOut(); await first.runner.flush()
  assert.equal(first.runner.value.session,null)
  first.changeUser(A); await first.runner.flush()
  assert.equal(first.runner.value.session,null, 'SDK events cannot unlock the exited app')
  first.runner.stop()
  const h = harness({ storage:first.storage, secureStorage:first.secureStorage, sdkNetworkError:true, initialError:network() })
  await h.runner.flush()
  assert.equal(h.runner.value.session,null)
  let result = await h.runner.value.signIn('user@example.test','wrong-password'); await h.runner.flush()
  assert.match(result.error.message,/incorrectos/)
  assert.equal(h.owner,null)
  result = await h.runner.value.signIn('user@example.test','correct-password'); await h.runner.flush()
  assert.equal(result.error,null)
  assert.equal(h.runner.value.accessState,'offline')
  assert.equal(h.owner,A)
  h.setDisconnected(false); h.setError(null)
  await h.runner.value.refreshProfile(); await h.runner.flush()
  assert.equal(h.runner.value.accessState,'online')
  assert.equal(h.owner,A)
  h.runner.stop()
})

test('known account cannot reopen offline after a real server profile revocation', async () => {
  const h = harness({stored:null}); await h.runner.flush()
  await h.runner.value.signIn('user@example.test','correct'); await h.runner.flush()
  h.setError(new ApiError('revoked',403,'PROFILE_INACTIVE'))
  await h.runner.value.refreshProfile(); await h.runner.flush()
  assert.equal(h.runner.value.accessState,'unauthorized')
  assert.equal(h.secureStorage.size,0)
  h.setDisconnected(true); h.setError(network())
  await h.runner.value.signOut(); await h.runner.flush()
  const result = await h.runner.value.signIn('user@example.test','correct')
  assert.ok(result.error); assert.equal(h.owner,null)
  h.runner.stop()
})

test('correct offline password never bypasses a profile from another or blocked account', async () => {
  const h = harness({stored:null}); await h.runner.flush()
  await h.runner.value.signIn('user@example.test','correct'); await h.runner.flush()
  await h.runner.value.signOut(); await h.runner.flush()
  await h.cache.blockProfileSnapshot(A)
  h.setDisconnected(true); h.setError(network())
  const result = await h.runner.value.signIn('user@example.test','correct')
  assert.ok(result.error); assert.equal(h.runner.value.session,null); assert.equal(h.owner,null)
  h.runner.stop()
})

test('an in-flight online validation cannot reopen an account after the user exits', async () => {
  const h = harness({stored:null}); await h.runner.flush()
  await h.runner.value.signIn('user@example.test','correct'); await h.runner.flush()
  let resolve
  h.defer(new Promise(done => { resolve = done }))
  const late = h.runner.value.refreshProfile()
  await h.runner.value.signOut(); await h.runner.flush()
  resolve({user:{id:A},profile:profileFor(A)})
  await late; await h.runner.flush()
  assert.equal(h.runner.value.session,null); assert.equal(h.owner,null)
  h.runner.stop()
})

test('repeated local exit does not revoke the retained session, and another account cannot unlock it', async () => {
  const h=harness({stored:null});await h.runner.flush()
  await h.runner.value.signIn('user@example.test','correct');await h.runner.flush()
  await h.runner.value.signOut();await h.runner.flush()
  await h.runner.value.signOut();await h.runner.flush()
  h.setDisconnected(true);h.setError(network())
  assert.ok((await h.runner.value.signIn('other@example.test','correct')).error)
  assert.equal(h.runner.value.session,null)
  assert.equal((await h.runner.value.signIn('user@example.test','correct')).error,null)
  await h.runner.flush();assert.equal(h.owner,A);h.runner.stop()
})

test('web and Operations retain their server logout and online login behavior', async () => {
  for (const options of [{platform:'web'},{area:'OPERACIONES'}]) {
    const h=harness(options);await h.runner.flush()
    await h.runner.value.signOut();await h.runner.flush()
    assert.equal(h.runner.value.session,null)
    assert.equal((await h.runner.value.signIn('user@example.test','correct')).error,null)
    await h.runner.flush()
    assert.equal(h.runner.value.accessState,'online')
    assert.equal(h.secureStorage.size,0)
    h.runner.stop()
  }
})

test('an inactive backend profile returned during password login revokes the previous offline verifier', async () => {
  const h=harness({stored:null});await h.runner.flush()
  await h.runner.value.signIn('user@example.test','correct');await h.runner.flush()
  await h.runner.value.signOut();await h.runner.flush()
  h.setProfile({...profileFor(A),activo:false})
  assert.ok((await h.runner.value.signIn('user@example.test','correct')).error)
  assert.equal(h.secureStorage.size,0)
  assert.equal(await h.cache.readProfileSnapshot(A),null)
  assert.equal(h.runner.value.session,null)
  h.runner.stop()
})


test('password login validates the online profile exactly once; offline reopen makes no profile request', async () => {
  const h=harness({stored:null});await h.runner.flush()
  assert.equal((await h.runner.value.signIn('user@example.test','correct')).error,null)
  await h.runner.flush();assert.equal(h.calls.length,1)
  await h.runner.value.signOut();await h.runner.flush()
  h.setDisconnected(true);h.setError(network())
  assert.equal((await h.runner.value.signIn('user@example.test','correct')).error,null)
  await h.runner.flush();assert.equal(h.calls.length,1);assert.equal(h.runner.value.accessState,'offline')
  await h.runner.value.refreshProfile();await h.runner.flush()
  assert.equal(h.calls.length,1);assert.equal(h.owner,A)
  h.setDisconnected(false);h.setError(null)
  await h.runner.value.refreshProfile();await h.runner.flush()
  assert.equal(h.calls.length,2);assert.equal(h.runner.value.accessState,'online')
  h.runner.stop()
})

test('known-offline cold start opens only the previously authorized local profile without calling /me',async()=>{
  const h=harness({sdkNetworkError:true})
  await h.cache.saveProfileSnapshot(A,profileFor(A));await h.runner.flush()
  assert.equal(h.calls.length,0);assert.equal(h.runner.value.accessState,'offline');assert.equal(h.owner,A)
  h.runner.stop()
})
