# hypercore-proof-queue

First install it

```
npm install hypercore-proof-queue
```

## API

Then in one process

``` js
const HPQ = require('hypercore-proof-queue')
const q = new HPQ('/tmp/my-queue') // which file to use

q.push({
  discoveryKey, // which core
  // add the proof below
  fork: 0,
  block: {
    index: 10,
    value: Buffer.from('hello'),
    nodes: []
  }
})
```

And simply in another one, at any future or concurrent point

``` js
const q = new HPQ('/tmp/my-queue', async function (proofs) {
  console.log('incoming proofs', proofs)
})
```

That is it

## License

Apache-2.0
