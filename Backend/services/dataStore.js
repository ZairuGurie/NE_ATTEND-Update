const _path = require('path')
const {
  isCloudOnline,
  getActiveConnection
} = require('../db/connectionManager')
const { ensureModel } = require('../db/modelProxy')

const modelLoaders = {
  Attendance: () => require('../models/Attendance'),
  Session: () => require('../models/Session'),
  User: () => require('../models/User'),
  Subject: () => require('../models/Subject'),
  Note: () => require('../models/Note'),
  Announcement: () => require('../models/Announcement'),
  Notification: () => require('../models/Notification'),
  VerificationCode: () => require('../models/VerificationCode'),
  AttendanceToken: () => require('../models/AttendanceToken'),
  SyncChange: () => require('../models/SyncChange'),
  Appeal: () => require('../models/Appeal')
}

const cache = {}

function getModel (name) {
  if (!modelLoaders[name]) {
    throw new Error(`Unknown model: ${name}`)
  }
  if (!cache[name]) {
    cache[name] = modelLoaders[name]()
    const proxy = cache[name]
    try {
      if (proxy && proxy.schema) {
        ensureModel(name, proxy.schema)
      }
    } catch (err) {
      // ignore missing connection initialization errors; model will register once connection is ready
      if (!/No database connection available/.test(err.message)) {
        throw err
      }
    }
  }

  // Check if connection is available before returning model
  const active = getActiveConnection()
  if (!active) {
    // In test mode we allow models to be required even if the database
    // connection is not ready, so that pure logic can be tested in isolation.
    if (
      process.env.NODE_ENV === 'test' ||
      process.env.NE_ATTEND_TEST_ALLOW_NO_DB === '1'
    ) {
      return cache[name]
    }

    throw new Error(
      'No database connection available. Please ensure MongoDB is running.'
    )
  }

  return cache[name]
}

async function runOnActiveConnection (callback) {
  const conn = getActiveConnection()
  if (!conn) {
    throw new Error('No available database connection')
  }
  return callback(conn)
}

module.exports = {
  getModel,
  runOnActiveConnection,
  isCloudOnline
}
