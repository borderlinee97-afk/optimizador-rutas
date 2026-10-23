import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createAndroidReleaseRouter } from '../routes/androidRelease.route.js'
import { validateAndroidRelease, releaseFromBuild, fingerprintApk, MAX_APK_BYTES, ANDROID_PACKAGE, EXPO_PROJECT } from '../services/androidRelease.service.js'
const release = { packageName: ANDROID_PACKAGE, projectId: EXPO_PROJECT, version: '1.0.1', versionCode: 3,
  buildId: '11111111-1111-4111-8111-111111111111', artifactUrl: 'https://expo.dev/artifacts/eas/testBuild.apk',
  publishedAt: '2026-10-23T18:00:00Z', notes: 'Mejoras de la app', sha256: 'a'.repeat(64), byteSize: 12345 }
const build = { id: release.buildId, platform: 'ANDROID', status: 'FINISHED', distribution: 'INTERNAL', buildProfile: 'preview',
  project: { id: EXPO_PROJECT }, appVersion: '1.0.1', appBuildVersion: '3', artifacts: { applicationArchiveUrl: release.artifactUrl } }

test('release preparation accepts only finished Android preview builds from our project and increasing versions', () => {
  assert.equal(releaseFromBuild(build, { versionCode: 2 }, '', release).versionCode, 3)
  for (const patch of [{status:'ERRORED'}, {status:'IN_PROGRESS'}, {platform:'IOS'}, {buildProfile:'production'},
    {distribution:'STORE'}, {project:{id:'other'}}, {appIdentifier:'other'}, {appBuildVersion:'NaN'}]) {
    assert.throws(() => releaseFromBuild({...build,...patch}, null, '', release))
  }
  assert.throws(() => releaseFromBuild(build, {versionCode:3}, '', release))
  assert.throws(() => releaseFromBuild(build, {versionCode:4}, '', release))
})

test('release rejects temporary downloads, arbitrary hosts, credentials, non-APK files and invalid metadata', () => {
  assert.equal(validateAndroidRelease(release).artifactUrl, release.artifactUrl)
  for (const artifactUrl of ['http://expo.dev/artifacts/eas/x.apk','https://evil.test/x.apk','https://expo.dev.evil.test/artifacts/eas/x.apk',
    'https://expo.dev/artifacts/eas/x.aab','https://expo.dev/artifacts/eas/x.apk?X-Amz-Signature=expired',
    'https://expo.dev/artifacts/eas/x.apk#fragment','https://user:password@expo.dev/artifacts/eas/x.apk',
    'https://wf-artifacts.eascdn.net/builds/file.apk', 'javascript:alert(1)']) {
    assert.throws(() => validateAndroidRelease({...release,artifactUrl}))
  }
  for (const patch of [{versionCode:0},{versionCode:3.5},{projectId:'other'},{packageName:'other'}, {buildId:'bad'},
    {version:'<script>'},{publishedAt:'invalid'},{notes:'a'.repeat(4001)}, {sha256:'bad'}, {byteSize:0}, {byteSize:MAX_APK_BYTES+1}]) assert.throws(() => validateAndroidRelease({...release,...patch}))
})

test('approved APK fingerprint is streamed and bounded; rejects empty or oversized files', async () => {
  assert.deepEqual(await fingerprintApk([Buffer.from('a'),Buffer.from('bc')]), {
    sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', byteSize:3,
  })
  await assert.rejects(fingerprintApk([]),/vacía/)
  await assert.rejects(fingerprintApk([{byteLength:MAX_APK_BYTES+1}]),/512/)
  assert.throws(() => releaseFromBuild(build, null), /inválidos/)
})

async function withServer(read, run) {
  const app = express(); app.use(createAndroidReleaseRouter(read)); app.get('/unrelated', (_req,res) => res.json({ok:true}))
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening',resolve))
  try { await run(`http://127.0.0.1:${server.address().port}`) }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
}

test('public distribution works without authentication; metadata is minimal and download is pinned to current version', async () => {
  await withServer(() => validateAndroidRelease(release), async base => {
    assert.equal((await fetch(base+'/unrelated')).headers.get('cache-control'),null)
    const response = await fetch(base+'/api/app/android/release'), data = await response.json()
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store')
    assert.equal(data.release.versionCode,3); assert.equal(data.release.artifactUrl,undefined)
    assert.equal(data.release.projectId,undefined)
    const download = await fetch(base+'/api/app/android/download?versionCode=3',{redirect:'manual'})
    assert.equal(download.status,302); assert.equal(download.headers.get('location'),release.artifactUrl)
    assert.equal((await fetch(base+'/api/app/android/download?versionCode=2',{redirect:'manual'})).status,409)
    assert.equal((await fetch(base+'/api/app/android/download',{redirect:'manual'})).status,409)
    assert.equal(data.release.sha256,release.sha256); assert.equal(data.release.byteSize,release.byteSize)
    assert.equal((await fetch(base+'/api/app/android/release',{method:'POST'})).status,404)
  })
})

test('unpublished or corrupt channel never downloads a fabricated/stale release or leaks a server error', async () => {
  await withServer(() => null, async base => {
    assert.deepEqual(await (await fetch(base+'/api/app/android/release')).json(),{available:false,release:null})
    assert.equal((await fetch(base+'/api/app/android/download?versionCode=3')).status,404)
  })
  await withServer(() => {throw new Error('private filesystem path')}, async base => {
    const response = await fetch(base+'/api/app/android/release');assert.equal(response.status,503)
    assert.ok(!(await response.text()).includes('private filesystem'))
  })
})


test('persistent async channel preserves the existing mobile response and fails closed on database errors',async()=>{
 await withServer(async()=>validateAndroidRelease(release),async base=>{
  const response=await fetch(base+'/api/app/android/release');assert.equal(response.status,200)
  const data=await response.json();assert.equal(data.release.versionCode,3);assert.equal(data.release.buildId,undefined)
  assert.equal((await fetch(base+'/api/app/android/download?versionCode=3',{redirect:'manual'})).status,302)
 })
 await withServer(async()=>{throw Error('private database error')},async base=>{
  const response=await fetch(base+'/api/app/android/release');assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private'))
 })
})
