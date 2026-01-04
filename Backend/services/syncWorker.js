const {
  connectivity,
  isCloudOnline,
  getRegisteredModel,
  getCloudConnection: _getCloudConnection,
  logConnectionEvent
} = require('../db/connectionManager')
const { getModel } = require('./dataStore')
const { claimNext, markSynced, markFailed } = require('./syncQueue')

let processing = false
let initialized = false

function ensureCloudModel (modelName) {
  // Ensure registration via proxy loader
  getModel(modelName)
  const model = getRegisteredModel(modelName, 'cloud')
  if (!model) return null
  const ready =
    model.db && typeof model.db.readyState === 'number'
      ? model.db.readyState === 1
      : true
  return ready ? model : null
}

/**
 * Resolves User model sync conflicts by checking for existing documents
 * by business keys (email, studentId) before upserting by _id.
 *
 * @param {Model} cloudModel - The cloud MongoDB model
 * @param {Object} docPayload - The document payload to sync
 * @returns {ObjectId|null} - Existing document _id if found, null otherwise
 */
async function resolveUserSyncConflict (cloudModel, docPayload) {
  // Check by email (primary identifier)
  if (docPayload.email) {
    const existing = await cloudModel
      .findOne({
        email: docPayload.email.toLowerCase().trim()
      })
      .lean()
    if (existing) {
      console.log(
        `🔍 Conflict resolution: Found existing User by email: ${docPayload.email}`
      )
      return existing._id
    }
  }

  // Check by studentId (secondary identifier, if provided and not null/undefined)
  if (
    docPayload.studentId &&
    docPayload.studentId !== null &&
    docPayload.studentId !== undefined
  ) {
    const existing = await cloudModel
      .findOne({
        studentId: docPayload.studentId
      })
      .lean()
    if (existing) {
      console.log(
        `🔍 Conflict resolution: Found existing User by studentId: ${docPayload.studentId}`
      )
      return existing._id
    }
  }

  return null
}

/**
 * Resolves Session model sync conflicts by checking for existing documents
 * by business keys (meetCode, sessionDate) before upserting by _id.
 *
 * @param {Model} cloudModel - The cloud MongoDB model
 * @param {Object} docPayload - The document payload to sync
 * @returns {ObjectId|null} - Existing document _id if found, null otherwise
 */
async function resolveSessionSyncConflict (cloudModel, docPayload) {
  // Session unique index: { meetCode: 1, sessionDate: 1 }
  if (docPayload.meetCode && docPayload.sessionDate) {
    const existing = await cloudModel
      .findOne({
        meetCode: docPayload.meetCode,
        sessionDate: docPayload.sessionDate
      })
      .lean()
    if (existing) {
      logConnectionEvent('sync', 'conflict', {
        modelName: 'Session',
        resolution: 'found_by_business_key',
        meetCode: docPayload.meetCode,
        sessionDate: docPayload.sessionDate,
        existingId: String(existing._id),
        newId: String(docPayload._id)
      })
      return existing._id
    }
  }
  return null
}

/**
 * Resolves Attendance model sync conflicts by checking for existing documents
 * by business keys (sessionId, userId) before upserting by _id.
 *
 * @param {Model} cloudModel - The cloud MongoDB model
 * @param {Object} docPayload - The document payload to sync
 * @returns {ObjectId|null} - Existing document _id if found, null otherwise
 */
async function resolveAttendanceSyncConflict (cloudModel, docPayload) {
  // Attendance unique index: { sessionId: 1, userId: 1 }
  if (docPayload.sessionId && docPayload.userId) {
    const existing = await cloudModel
      .findOne({
        sessionId: docPayload.sessionId,
        userId: docPayload.userId
      })
      .lean()
    if (existing) {
      logConnectionEvent('sync', 'conflict', {
        modelName: 'Attendance',
        resolution: 'found_by_business_key',
        sessionId: String(docPayload.sessionId),
        userId: String(docPayload.userId),
        existingId: String(existing._id),
        newId: String(docPayload._id)
      })
      return existing._id
    }
  }
  return null
}

async function replaySave (change) {
  const cloudModel = ensureCloudModel(change.modelName)
  if (!cloudModel) {
    throw new Error(`No cloud model available for ${change.modelName}`)
  }

  const docPayload = (change.payload && change.payload.doc) || {}
  if (!docPayload._id) {
    throw new Error(`Cannot sync ${change.modelName} without _id`)
  }

  // Model-specific conflict resolution by business keys before upserting
  const conflictResolvers = {
    User: resolveUserSyncConflict,
    Session: resolveSessionSyncConflict,
    Attendance: resolveAttendanceSyncConflict
  }

  const resolver = conflictResolvers[change.modelName]
  if (resolver) {
    try {
      const existingId = await resolver(cloudModel, docPayload)

      if (existingId) {
        // Conflict found: update existing document instead of upserting by _id
        console.log(
          `✅ Conflict resolution: Updating existing ${change.modelName} document (_id: ${existingId}) instead of creating new one (_id: ${docPayload._id})`
        )
        await cloudModel.updateOne({ _id: existingId }, docPayload, {
          setDefaultsOnInsert: true
        })
        return
      }
    } catch (conflictErr) {
      console.warn(
        `⚠️ Conflict resolution failed for ${change.modelName}, attempting normal upsert:`,
        conflictErr.message
      )
      // Fall through to normal upsert if conflict resolution fails
    }
  }

  // Normal upsert by _id (or fallback if conflict resolution failed)
  try {
    await cloudModel.updateOne({ _id: docPayload._id }, docPayload, {
      upsert: true,
      setDefaultsOnInsert: true
    })
  } catch (err) {
    // Handle E11000 duplicate key errors gracefully
    if (err.code === 11000 || err.codeName === 'DuplicateKey') {
      const errorInfo = err.errorResponse || err.err || {}
      const duplicateField = errorInfo.keyPattern
        ? Object.keys(errorInfo.keyPattern)[0]
        : 'unknown'
      const duplicateValue = errorInfo.keyValue
        ? errorInfo.keyValue[duplicateField]
        : 'unknown'

      logConnectionEvent('sync', 'conflict', {
        field: duplicateField,
        value: duplicateValue,
        modelName: change.modelName,
        documentId: String(docPayload._id),
        errorCode: err.code,
        errorMessage: err.message
      })

      // For models with known unique indexes, try to find and update existing document
      const modelHandlers = {
        User: async () => {
          if (duplicateField) {
            const query = { [duplicateField]: duplicateValue }
            return cloudModel.findOne(query).lean()
          }
          return null
        },
        Session: async () => {
          // Try meetCode + sessionDate composite key
          if (docPayload.meetCode && docPayload.sessionDate) {
            return cloudModel.findOne({
              meetCode: docPayload.meetCode,
              sessionDate: docPayload.sessionDate
            }).lean()
          }
          return null
        },
        Attendance: async () => {
          // Try sessionId + userId composite key
          if (docPayload.sessionId && docPayload.userId) {
            return cloudModel.findOne({
              sessionId: docPayload.sessionId,
              userId: docPayload.userId
            }).lean()
          }
          return null
        }
      }

      const handler = modelHandlers[change.modelName]
      if (handler) {
        try {
          const existing = await handler()

          if (existing) {
            console.log(
              `✅ Found existing ${change.modelName} by business key, updating instead`
            )
            await cloudModel.updateOne({ _id: existing._id }, docPayload, {
              setDefaultsOnInsert: true
            })
            return
          }
        } catch (updateErr) {
          console.error(
            `❌ Failed to update existing ${change.modelName}:`,
            updateErr.message
          )
          // Re-throw original error if update fails
          throw err
        }
      }

      // Re-throw error if we can't resolve it
      throw err
    }

    // Re-throw non-E11000 errors
    throw err
  }
}

async function replayUpdate (change) {
  const cloudModel = ensureCloudModel(change.modelName)
  if (!cloudModel) {
    throw new Error(`No cloud model available for ${change.modelName}`)
  }

  const payload = change.payload || {}
  const filter = payload.filter || {}
  const update = payload.update || {}
  const options = payload.options || {}
  const op = payload.op || 'updateOne'

  if (['findOneAndUpdate', 'findByIdAndUpdate'].includes(op)) {
    await cloudModel.findOneAndUpdate(filter, update, {
      ...options,
      upsert: options.upsert ?? true
    })
  } else if (['updateMany', 'updateOne'].includes(op)) {
    await cloudModel[op](filter, update, options)
  } else {
    await cloudModel.updateOne(filter, update, options)
  }
}

async function replayDelete (change) {
  const cloudModel = ensureCloudModel(change.modelName)
  if (!cloudModel) {
    throw new Error(`No cloud model available for ${change.modelName}`)
  }

  const payload = change.payload || {}
  const filter = payload.filter || {}
  const op = payload.op || 'deleteOne'

  if (['findOneAndDelete', 'findByIdAndDelete'].includes(op)) {
    await cloudModel.findOneAndDelete(filter)
  } else if (op === 'deleteMany') {
    await cloudModel.deleteMany(filter)
  } else {
    await cloudModel.deleteOne(filter)
  }
}

async function processQueueOnce () {
  if (processing) return
  if (!isCloudOnline()) return

  processing = true
  try {
    // Touch registration for SyncChange model
    getModel('SyncChange')
    const localModel = getRegisteredModel('SyncChange', 'local')
    const localReady =
      localModel &&
      localModel.db &&
      typeof localModel.db.readyState === 'number'
        ? localModel.db.readyState === 1
        : !!localModel
    if (!localReady) {
      return
    }

    let change = await claimNext()
    let syncStats = {
      processed: 0,
      synced: 0,
      failed: 0,
      conflicts: 0
    }

    while (change && isCloudOnline()) {
      try {
        if (change.operation === 'save') {
          await replaySave(change)
        } else if (change.operation === 'update') {
          await replayUpdate(change)
        } else if (change.operation === 'delete') {
          await replayDelete(change)
        } else {
          console.warn(
            `Unknown sync operation "${change.operation}" for ${change.modelName}, marking as synced`
          )
        }
        await markSynced(change._id)
        syncStats.synced++
      } catch (err) {
        await markFailed(change._id, err)
        syncStats.failed++

        // Check if this is an E11000 duplicate key error
        const isDuplicateKeyError =
          err.code === 11000 || err.codeName === 'DuplicateKey'

        if (isDuplicateKeyError) {
          syncStats.conflicts++
          const errorInfo = err.errorResponse || err.err || {}
          const duplicateField = errorInfo.keyPattern
            ? Object.keys(errorInfo.keyPattern)[0]
            : 'unknown'
          const duplicateValue = errorInfo.keyValue
            ? errorInfo.keyValue[duplicateField]
            : 'unknown'

          logConnectionEvent('sync', 'conflict', {
            modelName: change.modelName,
            field: duplicateField,
            value: duplicateValue,
            operation: change.operation,
            changeId: String(change._id),
            errorCode: err.code
          })

          // Continue processing remaining queue items instead of breaking
          // E11000 errors are recoverable conflicts, not fatal errors
        } else {
          // For non-E11000 errors, log and continue (don't break)
          // Only break on truly fatal errors that would prevent any further processing
          console.error(`❌ Failed to replay change for ${change.modelName}:`, {
            operation: change.operation,
            changeId: change._id,
            errorCode: err.code,
            errorName: err.name,
            errorMessage: err.message
          })
        }

        // Continue processing instead of breaking
        // This allows sync to process remaining queue items even if one fails
      }

      syncStats.processed++
      change = await claimNext()
    }

    // Log sync statistics if any changes were processed
    if (syncStats.processed > 0) {
      console.log(
        `📊 Sync statistics: ${syncStats.processed} processed, ${syncStats.synced} synced, ${syncStats.failed} failed (${syncStats.conflicts} conflicts)`
      )
    }
  } finally {
    processing = false
  }
}

function scheduleProcessing () {
  if (!isCloudOnline()) return
  setTimeout(() => {
    processQueueOnce().catch(err => console.error('Sync worker error:', err))
  }, 200)
}

function startSyncWorker () {
  if (initialized) return
  initialized = true

  connectivity.on('cloud:connected', () => {
    console.log('🌐 Cloud connection restored. Replaying queued changes...')
    scheduleProcessing()
  })

  connectivity.on('status', status => {
    if (status.cloud.status === 'connected') {
      scheduleProcessing()
    }
  })

  // Attempt initial processing if server boots with cloud online
  if (isCloudOnline()) {
    scheduleProcessing()
  }
}

module.exports = {
  startSyncWorker,
  processQueueOnce
}
