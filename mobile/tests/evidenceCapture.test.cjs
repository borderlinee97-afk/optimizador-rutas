const test = require('node:test'), assert = require('node:assert/strict')
const { loadTs, hooks } = require('./helpers/loadTs.cjs')

function harness({ status, otherPhotoSynced = false, online = true }) {
  const h = hooks(), alerts = [], files = [], database = {}, rows = []
  const Component = loadTs('src/components/EvidenceCapture.tsx', {
    ...h.modules, './EvidenceGallery': { EvidenceGallery: 'EvidenceGallery' },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@react-native-community/netinfo': { useNetInfo: () => ({ isConnected: online, isInternetReachable: online }) },
    'expo-crypto': { randomUUID: () => 'current-photo' },
    'expo-image-picker': { requestCameraPermissionsAsync: async () => ({ granted: true }), launchCameraAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///camera.jpg', mimeType: 'image/jpeg' }] }) },
    'expo-location': { Accuracy: { High: 1 }, requestForegroundPermissionsAsync: async () => ({ status: 'granted' }), getCurrentPositionAsync: async () => ({ mocked: false, coords: { latitude: 19, longitude: -98, accuracy: 10 } }) },
    'expo-file-system/legacy': { documentDirectory: 'file:///documents/', makeDirectoryAsync: async () => {}, copyAsync: async options => files.push(options.to), deleteAsync: async () => assert.fail('Queued photo must not be deleted') },
    'expo-file-system': { File: class { size = 3 } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native': { ActivityIndicator: 'Spinner', Alert: { alert: (...args) => alerts.push(args) }, Image: 'Image', Pressable: 'Button', Text: 'Text', View: 'View' },
    '../../storage/db': { db: database, getDatabaseUserId: () => 'owner', isDatabaseActive: () => true },
    '../services/evidenceSync': {
      listLocalEvidence: () => rows,
      queueEvidence: row => rows.push({ ...row, status: 'PENDING' }),
      syncPendingEvidence: async () => { rows[0].status = status; rows[0].lastError = status === 'READY' ? null : 'TICKET: Carga rechazada por el servidor'; return { synced: otherPhotoSynced || status === 'READY' ? 1 : 0, failed: status === 'FAILED' ? 1 : 0, pending: status === 'PENDING' ? 1 : 0 } }
    }
  }).EvidenceCapture
  h.mount(() => ({ props: { value: Component({ planItemId: 'visit', accessToken: 'token' }) } }))
  function nodes(node = h.value) { return !node || typeof node !== 'object' ? [] : [node, ...(Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]).filter(child => child && typeof child === 'object').flatMap(child => nodes(child))] }
  return { h, rows, alerts, files, async capture() {
    await h.flush()
    const button = nodes().find(n => n.type?.name === 'EvidenceButton' && n.props.label === 'Tomar foto')
    assert.ok(button); button.props.onPress(); await h.flush()
  } }
}

test('a rejected current photo is never announced as synced because another photo uploaded', async () => {
  const t = harness({ status: 'FAILED', otherPhotoSynced: true }); await t.capture()
  assert.match(t.alerts.at(-1)[0], /requiere revisión/)
  assert.match(t.alerts.at(-1)[1], /Carga rechazada por el servidor/)
  assert.equal(t.rows[0].localUri, t.files[0]); assert.equal(t.rows[0].status, 'FAILED'); t.h.stop()
})

test('only confirmation of the captured photo displays synchronized', async () => {
  const t = harness({ status: 'READY' }); await t.capture()
  assert.equal(t.alerts.at(-1)[0], 'Evidencia sincronizada'); t.h.stop()
})

test('offline capture keeps its durable file and reports pending without claiming upload', async () => {
  const t = harness({ status: 'PENDING', online: false }); await t.capture()
  assert.match(t.alerts.at(-1)[0], /guardada en el dispositivo/)
  assert.equal(t.rows[0].status, 'PENDING'); assert.equal(t.rows[0].localUri, t.files[0]); t.h.stop()
})
