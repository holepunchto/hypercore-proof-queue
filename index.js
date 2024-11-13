const FIFOFile = require('fifofile')
const messages = require('hypercore/messages')
const c = require('compact-encoding')

const encoding = {
  preencode (state, notification) {
    if (!notification.request) notification.request = 0
    c.fixed32.preencode(state, notification.discoveryKey)
    messages.wire.data.preencode(state, notification)
  },
  encode (state, notification) {
    if (!notification.request) notification.request = 0
    c.fixed32.encode(state, notification.discoveryKey)
    messages.wire.data.encode(state, notification)
  },
  decode (state) {
    return {
      discoveryKey: c.fixed32.decode(state),
      ...messages.wire.data.decode(state)
    }
  }
}

module.exports = class HypercoreProofQueue {
  constructor (filename, onincoming) {
    this.filename = filename
    this.draining = false
    this.suspending = false
    this.onincoming = onincoming || null
    this._resolve = null
    this.resume()
  }

  resume () {
    this.suspending = false

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
    this.suspending = true
    if (this.ff === null) return Promise.resolve()

    return new Promise((resolve) => {
      const ff = this.ff

      ff.end()
      ff.on('close', () => {
        if (this.ff === ff) this.ff = null
        if (this.draining === true) this._resolve = resolve
        else resolve()
      })
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
    if (this.ff !== null) this.ff.write(entry)
  }

  close () {
    return this.suspend()
  }
}

function noop () {}
