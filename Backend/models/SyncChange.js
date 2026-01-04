const mongoose = require('mongoose');
const { createModelProxy } = require('../db/modelProxy');

const syncChangeSchema = new mongoose.Schema({
  modelName: { type: String, required: true, index: true },
  operation: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  options: { type: mongoose.Schema.Types.Mixed, default: {} },
  origin: {
    type: String,
    enum: ['cloud', 'local'],
    default: 'local',
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'synced', 'failed'],
    default: 'pending',
  },
  error: {
    code: String,
    message: String,
    stack: String,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  lastTriedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

syncChangeSchema.index({ status: 1, createdAt: 1 });

const SyncChange = createModelProxy('SyncChange', syncChangeSchema);
SyncChange.schema = syncChangeSchema;

module.exports = SyncChange;

