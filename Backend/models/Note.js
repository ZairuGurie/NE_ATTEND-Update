const mongoose = require('mongoose');
const { createModelProxy } = require('../db/modelProxy');

const noteSchema = new mongoose.Schema({
  topic: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userRole: {
    type: String,
    enum: ['student', 'instructor', 'admin'],
    required: true
  }
}, {
  timestamps: true
});

// Index for faster queries
noteSchema.index({ userId: 1 });
noteSchema.index({ userRole: 1 });
noteSchema.index({ date: -1 }); // Sort by date descending

const Note = createModelProxy('Note', noteSchema);
Note.schema = noteSchema;

module.exports = Note;
