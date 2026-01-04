const mongoose = require('mongoose')
const EventEmitter = require('events')

const cloudUri = process.env.MONGODB_URI
// DISABLED: Local MongoDB fallback - Force Cloud MongoDB only
// const localUri = process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/neattend_local'
const localUri = null // Set to null to disable local MongoDB connection

const connectivity = new EventEmitter()

// Track last known active connection for change detection
let lastActiveType = null

/**
 * Structured logging for connection events
 */
function logConnectionEvent (type, event, details = {}) {
  const timestamp = new Date().toISOString()
  const logEntry = {
    timestamp,
    component: 'connectionManager',
    type,
    event,
    ...details
  }

  const icon =
    {
      'cloud:connected': '🌐',
      'cloud:disconnected': '⚠️',
      'cloud:error': '❌',
      'local:connected': '💾',
      'local:disconnected': '⚠️',
      'local:error': '❌',
      'active:switched': '🔄',
      'sync:conflict': '⚡'
    }[`${type}:${event}`] || '📋'

  console.log(`${icon} [DB] ${JSON.stringify(logEntry)}`)
}

const state = {
  cloud: {
    uri: cloudUri,
    status: 'disconnected',
    connection: null,
    lastError: null
  },
  local: {
    uri: localUri,
    status: 'disconnected',
    connection: null,
    lastError: null
  },
  registeredModels: new Map()
}

const trackedSchemas = new WeakSet()

function shouldQueue (name, connection) {
  return (
    name !== 'SyncChange' &&
    connection &&
    state.local.connection &&
    connection === state.local.connection &&
    !isCloudOnline()
  )
}

async function enqueueChange (change) {
  try {
    const { queueChange } = require('../services/syncQueue')
    await queueChange(change)
  } catch (error) {
    console.error('Failed to enqueue sync change:', error)
  }
}

function attachSyncPlugin (name, schema) {
  if (trackedSchemas.has(schema) || name === 'SyncChange') {
    return
  }
  trackedSchemas.add(schema)

  schema.post(
    'save',
    { document: true, query: false },
    async function (doc, next) {
      try {
        const conn = doc.constructor.db
        if (shouldQueue(name, conn)) {
          await enqueueChange({
            modelName: name,
            operation: 'save',
            payload: {
              doc: doc.toObject({
                depopulate: true,
                getters: false,
                virtuals: false
              }),
              op: 'save'
            }
          })
        }
      } catch (err) {
        console.error('Sync save hook failed:', err)
      }
      next()
    }
  )

  schema.post('insertMany', async function (result, next) {
    try {
      const docs = Array.isArray(result) ? result : []
      const conn = this.db ? this.db : docs[0] && docs[0].constructor.db
      if (shouldQueue(name, conn)) {
        for (const doc of docs) {
          await enqueueChange({
            modelName: name,
            operation: 'save',
            payload: {
              doc: doc.toObject({
                depopulate: true,
                getters: false,
                virtuals: false
              }),
              op: 'insertMany'
            }
          })
        }
      }
    } catch (err) {
      console.error('Sync insertMany hook failed:', err)
    }
    if (typeof next === 'function') next()
  })

  const queryOps = [
    'findOneAndUpdate',
    'findByIdAndUpdate',
    'updateOne',
    'updateMany',
    'findOneAndDelete',
    'findByIdAndDelete',
    'deleteOne',
    'deleteMany'
  ]

  queryOps.forEach(op => {
    schema.post(op, async function (result, next) {
      try {
        const model =
          this.model ||
          (result && result.constructor && result.constructor.model)
        const conn = model ? model.db : null
        if (shouldQueue(name, conn)) {
          const filter =
            typeof this.getFilter === 'function'
              ? this.getFilter()
              : this._conditions
          const update =
            typeof this.getUpdate === 'function'
              ? this.getUpdate()
              : this._update
          const options =
            typeof this.getOptions === 'function'
              ? this.getOptions()
              : this.options
          const action = op.startsWith('delete') ? 'delete' : 'update'
          await enqueueChange({
            modelName: name,
            operation: action,
            payload: {
              filter,
              update,
              options,
              op
            }
          })
        }
      } catch (err) {
        console.error(`Sync ${op} hook failed:`, err)
      }
      if (typeof next === 'function') next()
    })
  })
}

function createConnection (uri, label) {
  if (!uri) {
    state[label].status = 'disabled'
    return null
  }

  const conn = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 5
  })

  conn.on('connected', () => {
    state[label].status = 'connected'
    state[label].lastError = null
    logConnectionEvent(label, 'connected', {
      uri: uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')
    })
    connectivity.emit(`${label}:connected`, conn)
    connectivity.emit('status', getStatus())
    checkActiveConnectionChange()
  })

  conn.on('disconnected', () => {
    state[label].status = 'disconnected'
    logConnectionEvent(label, 'disconnected')
    connectivity.emit(`${label}:disconnected`)
    connectivity.emit('status', getStatus())
    checkActiveConnectionChange()
  })

  conn.on('error', err => {
    state[label].status = 'error'
    state[label].lastError = err
    logConnectionEvent(label, 'error', { error: err.message })
    connectivity.emit(`${label}:error`, err)
    connectivity.emit('status', getStatus())
    checkActiveConnectionChange()
  })

  return conn
}

function ensureConnections () {
  if (!state.cloud.connection && cloudUri) {
    state.cloud.connection = createConnection(cloudUri, 'cloud')
  }

  if (!state.local.connection && localUri) {
    state.local.connection = createConnection(localUri, 'local')
  }
}

function registerModel (name, schema) {
  ensureConnections()

  if (state.registeredModels.has(name)) {
    return state.registeredModels.get(name)
  }

  attachSyncPlugin(name, schema)

  const models = { schema }

  if (state.cloud.connection) {
    models.cloud = state.cloud.connection.model(name, schema)
  }

  if (state.local.connection) {
    models.local = state.local.connection.model(name, schema)
  }

  state.registeredModels.set(name, models)
  return models
}

function getStatus () {
  return {
    cloud: { ...state.cloud, connection: undefined },
    local: { ...state.local, connection: undefined }
  }
}

function getCloudConnection () {
  ensureConnections()
  return state.cloud.connection
}

function getLocalConnection () {
  ensureConnections()
  return state.local.connection
}

function isCloudOnline () {
  return state.cloud.status === 'connected'
}

/**
 * Check if active connection has changed and log the switch
 */
function checkActiveConnectionChange () {
  let currentActiveType = null

  if (isCloudOnline() && state.cloud.connection?.readyState === 1) {
    currentActiveType = 'cloud'
  } else if (state.local.connection?.readyState === 1) {
    currentActiveType = 'local'
  }

  if (lastActiveType !== null && lastActiveType !== currentActiveType) {
    logConnectionEvent('active', 'switched', {
      from: lastActiveType,
      to: currentActiveType || 'unavailable'
    })
    connectivity.emit('active:switched', {
      from: lastActiveType,
      to: currentActiveType
    })
  }

  lastActiveType = currentActiveType
}

function getActiveConnection () {
  ensureConnections()

  // Validate connection state before returning
  if (isCloudOnline() && state.cloud.connection) {
    // Verify cloud connection is actually ready
    if (state.cloud.connection.readyState === 1) {
      return state.cloud.connection
    }
  }

  // DISABLED: Local MongoDB fallback - Force Cloud MongoDB only
  // Fallback to local connection if available and ready
  // if (state.local.connection && state.local.connection.readyState === 1) {
  //   return state.local.connection
  // }

  // Return cloud connection even if not ready (for initialization)
  if (state.cloud.connection) {
    return state.cloud.connection
  }

  // DISABLED: Local MongoDB fallback
  // Return local connection even if not ready (for initialization)
  // return state.local.connection
  return null
}

/**
 * Validate that a connection is ready for operations
 * @param {mongoose.Connection} connection - Connection to validate
 * @returns {boolean} - True if connection is ready
 */
function isConnectionReady (connection) {
  if (!connection) return false

  // Check readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  return connection.readyState === 1
}

/**
 * Get connection health status
 * @returns {Object} - Health status for both connections
 */
function getConnectionHealth () {
  return {
    cloud: {
      status: state.cloud.status,
      ready: isConnectionReady(state.cloud.connection),
      hasConnection: !!state.cloud.connection,
      lastError: state.cloud.lastError?.message || null
    },
    local: {
      status: state.local.status,
      ready: isConnectionReady(state.local.connection),
      hasConnection: !!state.local.connection,
      lastError: state.local.lastError?.message || null
    },
    active: {
      connection: getActiveConnection() ? 'available' : 'unavailable',
      ready: isConnectionReady(getActiveConnection())
    }
  }
}

function getRegisteredModel (name, target = 'active') {
  const entry = state.registeredModels.get(name)
  if (!entry) return null

  if (target === 'cloud') return entry.cloud
  if (target === 'local') return entry.local

  // MODIFIED: Force Cloud MongoDB only - always return cloud model
  const active = getActiveConnection()
  if (active === state.cloud.connection && entry.cloud) {
    return entry.cloud
  }
  // Return cloud model only, no local fallback
  return entry.cloud || null
}

module.exports = {
  registerModel,
  getCloudConnection,
  getLocalConnection,
  getActiveConnection,
  isCloudOnline,
  getStatus,
  connectivity,
  getRegisteredModel,
  isConnectionReady,
  getConnectionHealth,
  logConnectionEvent
}
