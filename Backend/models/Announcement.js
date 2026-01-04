const mongoose = require('mongoose');
const { createModelProxy } = require('../db/modelProxy');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  subjectIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  }],
  groupIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  }],
  isPinned: {
    type: Boolean,
    default: false
  },
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    fileSize: Number
  }],
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  expiresAt: {
    type: Date,
    default: null
  },
  targetAudience: {
    type: String,
    enum: ['all', 'specific_groups', 'specific_subjects'],
    default: 'all'
  },
  sections: [{
    type: String,
    trim: true
  }],
  schoolYear: {
    type: String,
    trim: true
  },
  yearLevel: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for faster queries
announcementSchema.index({ instructorId: 1, createdAt: -1 });
announcementSchema.index({ isPinned: -1, createdAt: -1 });
announcementSchema.index({ groupIds: 1 });
announcementSchema.index({ expiresAt: 1 });

const Announcement = createModelProxy('Announcement', announcementSchema);
Announcement.schema = announcementSchema;

module.exports = Announcement;
