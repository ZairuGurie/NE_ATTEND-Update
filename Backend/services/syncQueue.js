const { getModel } = require('./dataStore');
const { getRegisteredModel, isConnectionReady } = require('../db/connectionManager');

function ensureLocalSyncModel() {
  // Ensure model is registered through proxy loader
  getModel('SyncChange');
  const model = getRegisteredModel('SyncChange', 'local');
  if (!model) return null;
  
  // Validate connection is ready
  if (!isConnectionReady(model.db)) {
    console.warn('Local database connection not ready for sync queue operations');
    return null;
  }
  
  return model;
}

async function queueChange(change) {
  try {
    const model = ensureLocalSyncModel();
    if (!model) {
      console.warn('No local database available to queue change. Change discarded.');
      return null;
    }

    const payload = {
      modelName: change.modelName,
      operation: change.operation,
      payload: change.payload,
      origin: change.origin || 'local',
      status: 'pending',
      attempts: 0,
    };

    return await model.create(payload);
  } catch (error) {
    console.error('Failed to queue sync change:', error);
    // Don't throw - allow operation to continue even if sync queue fails
    return null;
  }
}

async function claimNext() {
  try {
    const model = ensureLocalSyncModel();
    if (!model) return null;

    const doc = await model.findOneAndUpdate(
      { status: { $in: ['pending', 'failed'] } },
      { status: 'processing', lastTriedAt: new Date(), $inc: { attempts: 1 } },
      { sort: { createdAt: 1 }, new: true }
    );

    return doc ? doc.toObject() : null;
  } catch (error) {
    console.error('Failed to claim next sync item:', error);
    return null;
  }
}

async function markSynced(id) {
  try {
    const model = ensureLocalSyncModel();
    if (!model) {
      console.warn('Cannot mark sync as synced: local database not available');
      return;
    }

    await model.findByIdAndUpdate(id, {
      status: 'synced',
      error: null,
      syncedAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to mark sync as synced:', error);
  }
}

async function markFailed(id, error) {
  try {
    const model = ensureLocalSyncModel();
    if (!model) {
      console.warn('Cannot mark sync as failed: local database not available');
      return;
    }

    const errPayload = error
      ? {
          code: error.code || null,
          message: error.message || String(error),
          stack: error.stack || null,
        }
      : null;

    await model.findByIdAndUpdate(id, {
      status: 'failed',
      error: errPayload,
      lastTriedAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to mark sync as failed:', error);
  }
}

/**
 * Get sync queue statistics
 * @returns {Object} Statistics about the sync queue
 */
async function getSyncStats() {
  try {
    const model = ensureLocalSyncModel();
    if (!model) {
      return {
        available: false,
        reason: 'local_db_unavailable',
        pending: 0,
        processing: 0,
        synced: 0,
        failed: 0,
        total: 0
      };
    }

    const [pending, processing, synced, failed] = await Promise.all([
      model.countDocuments({ status: 'pending' }),
      model.countDocuments({ status: 'processing' }),
      model.countDocuments({ status: 'synced' }),
      model.countDocuments({ status: 'failed' })
    ]);

    // Get last synced timestamp
    const lastSynced = await model
      .findOne({ status: 'synced' })
      .sort({ syncedAt: -1 })
      .select('syncedAt')
      .lean();

    // Get last failed entry for debugging
    const lastFailed = await model
      .findOne({ status: 'failed' })
      .sort({ lastTriedAt: -1 })
      .select('modelName operation error lastTriedAt')
      .lean();

    return {
      available: true,
      pending,
      processing,
      synced,
      failed,
      total: pending + processing + synced + failed,
      lastSyncedAt: lastSynced?.syncedAt || null,
      lastFailure: lastFailed ? {
        modelName: lastFailed.modelName,
        operation: lastFailed.operation,
        error: lastFailed.error?.message || null,
        at: lastFailed.lastTriedAt
      } : null
    };
  } catch (error) {
    console.error('Failed to get sync stats:', error);
    return {
      available: false,
      reason: 'error',
      error: error.message,
      pending: 0,
      processing: 0,
      synced: 0,
      failed: 0,
      total: 0
    };
  }
}

module.exports = {
  queueChange,
  claimNext,
  markSynced,
  markFailed,
  getSyncStats,
};

