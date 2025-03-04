const FIFOFile = require('fifofile')
const messages = require('hypercore/messages')
const c = require('compact-encoding')

const encoding = {
  preencode (state, proof) {
    c.fixed32.preencode(state, proof.discoveryKey)
    if (!proof.data.request) proof.data.request = 0
    messages.wire.data.preencode(state, proof.data)
  },
  encode (state, proof) {
    c.fixed32.encode(state, proof.discoveryKey)
    if (!proof.data.request) proof.data.request = 0
    messages.wire.data.encode(state, proof.data)
  },
  decode (state) {
    return {
      discoveryKey: c.fixed32.decode(state),
      data: messages.wire.data.decode(state)
    }
  }
}

module.exports = class HypercoreProofQueue {
  constructor (filename, onincoming) {
    this.filename = filename
    this.draining = false
    this.pushed = false
    this.suspending = true // unset in resume
    this.ff = null
    this.onincoming = onincoming || null
    this._resolve = null
    this.resume()
  }

  resume () {
    if (this.suspending !== true) return
    this.suspending = false

    this.pushed = false
    this.ff = new FIFOFile(this.filename, {
      valueEncoding: encoding
    })

    if (this.onincoming !== null) {
      this.ff.on('readable', this._drain.bind(this))
      this._drain()
    }

    this.ff.on('error', noop)
  }

  suspend () {
    if (this.suspending !== false) return Promise.resolve()
    this.suspending = true
    if (this.ff === null) return Promise.resolve()

    return new Promise((resolve) => {
      const ff = this.ff

      const onclose = () => {
        if (this.ff === ff) this.ff = null
        if (this.draining === true) this._resolve = resolve
        else resolve()
      }

      if (ff.destroyed) return onclose()
      ff.destroy()
      ff.on('close', onclose)
    })
  }

  async _drain () {
    while (this.draining === false && this.suspending === false) {
      const batch = []
      while (true) {
        const next = this.ff.read()
        if (next === null) break
        batch.push(next)
      }

      if (batch.length === 0) return

      this.draining = true
      try {
        await this.onincoming(batch)
      } catch {
        if (this.ff !== null) this.ff.destroy()
      }
      this.draining = false
      if (this.suspending && this._resolve) this._resolve()
    }
  }

  push (entry) {
    if (this.ff !== null) {
      this.pushed = true
      this.ff.write(entry)
    }
  }

  async close () {
    if (this.pushed && this.ff) {
      await new Promise(resolve => {
        this.ff.end()
        this.ff.on('finish', resolve)
        this.ff.on('close', resolve)
      })
    }

    return this.suspend()
  }
}

function noop () {}
