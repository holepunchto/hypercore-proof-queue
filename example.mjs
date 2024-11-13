import NotificationQueue from './index.js'

const q = new NotificationQueue('/tmp/a-queue', async function (incoming) {
  console.log('-->', incoming)
})

q.push({
  discoveryKey: Buffer.alloc(32),
  fork: 0,
  block: {
    index: 10,
    value: Buffer.from('hello'),
    nodes: []
  }
})
