import NotificationQueue from './index.js'
import Hypercore from 'hypercore'

const hc = new Hypercore('/tmp/a-core')
await hc.ready()

if (hc.length < 1) await hc.append('hello')

const clone = new Hypercore('/tmp/a-core-clone', hc.key, {
  manifest: hc.manifest
})
await clone.ready()

clone.on('append', function () {
  console.log('appended...')
})

clone.get(0).then(function () {
  console.log('got it!')
})

const q = new NotificationQueue('/tmp/a-queue', async function (incoming) {
  for (const proof of incoming) {
    try {
      await clone.core.verify(proof.data, null)
    } catch (e) {
      continue
    }
  }
  q.suspend()
})

const data = await hc.core.tree.proof({
  block: { index: 0, nodes: 0 },
  upgrade: { start: 0, length: hc.length }
})

data.block.value = await hc.get(0)

q.push({
  discoveryKey: Buffer.alloc(32),
  data
})
