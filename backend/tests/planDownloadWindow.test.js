import test from 'node:test'
import assert from 'node:assert/strict'
import { planDownloadWindow } from '../services/planDownloadWindow.js'
test('Download week uses Mexico calendar including Sunday, midnight and month boundary',()=>{
 assert.deepEqual(planDownloadWindow('week',new Date('2026-10-19T05:59:00Z')),{scope:'week',startDate:'2026-10-12',endDate:'2026-10-18'})
 assert.deepEqual(planDownloadWindow('week',new Date('2026-10-19T06:01:00Z')),{scope:'week',startDate:'2026-10-19',endDate:'2026-10-25'})
 assert.deepEqual(planDownloadWindow('week',new Date('2026-11-01T18:00:00Z')),{scope:'week',startDate:'2026-10-26',endDate:'2026-11-01'})
 assert.throws(()=>planDownloadWindow('month'),{status:400})
})
