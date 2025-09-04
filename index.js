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
  constructor (filename, onincoming, { log = () => {} } = {}) {
    this.filename = filename
    this.draining = false
    this.pushed = false
    this.suspending = true // unset in resume
    this.ff = null
    this.onincoming = onincoming || null
    this._resolve = null
    this.log = log
    this.resume()
  }

  resume () {
    this.log('Trying to resume queue')
    if (this.suspending !== true) return
    this.suspending = false

    this.pushed = false
    this.ff = new FIFOFile(this.filename, {
      valueEncoding: encoding
    })

    this.log('Created new FIFOFile')

    if (this.onincoming !== null) {
      this.ff.on('readable', this._drain.bind(this))
      this.log('Calling drain')
      this._drain()
    }

    this.ff.on('error', (err) => this.log('Error:', err))
  }

  suspend () {
    this.log('Activating queue suspension')
    if (this.suspending !== false) return Promise.resolve()
    this.suspending = true
    this.log('Suspending is set to true, continuing suspension')
    if (this.ff === null) return Promise.resolve()

    return new Promise((resolve) => {
      const ff = this.ff

      const onclose = () => {
        this.log('onclose called')
        if (this.ff === ff) this.ff = null
        if (this.draining === true) this._resolve = resolve
        else resolve()
      }

      if (ff.destroyed) {
        this.log('ff was destroyed')
        return onclose()
      }
      ff.destroy()
      this.log('ff destroyed')
      ff.on('close', onclose)
    })
  }

  async _drain () {
    this.log('Asked to drain ')
    while (this.draining === false && this.suspending === false) {
      const batch = []
      while (true) {
        const next = this.ff.read()
        if (next === null) break
        batch.push(next)
      }

      this.log('Checking if batch is empty')

      if (batch.length === 0) return
      this.log('Batch is empty')
      this.draining = true
      try {
        this.log('Waiting for incoming')
        await this.onincoming(batch)
        this.log('Finished waiting for incoming')
      } catch (e) {
        this.log('Error:', e)
        if (this.ff !== null) {
          this.log('Destroying ff')
          this.ff.destroy()
        }
      }
      this.draining = false
      this.log('Not draining anymore')
      if (this.suspending && this._resolve) {
        this.log('Resolving promise')
        this._resolve()
      }
    }
  }

  push (entry) {
    this.log('Adding new entry')
    if (this.ff !== null) {
      this.pushed = true
      this.ff.write(entry)
      this.log('Added new entry to ff')
    }
  }

  async close () {
    this.log('Asked to close')
    if (this.pushed && this.ff) {
      this.log('Pushed and ff available')
      await new Promise(resolve => {
        this.ff.end()
        this.ff.on('finish', () => {
          this.log('Finished called')
          resolve()
        })
        this.ff.on('close', () => {
          this.log('Closing')
          resolve()
        })
      })
    }

    this.log('Push or ff not available, suspending instead')
    return this.suspend()
  }
}

function noop () {}
