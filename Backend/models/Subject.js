const mongoose = require('mongoose')
const { createModelProxy } = require('../db/modelProxy')

const subjectSchema = new mongoose.Schema(
  {
    subjectName: {
      type: String,
      required: true,
      trim: true
    },
    subjectCode: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    sections: [
      {
        type: String,
        trim: true
      }
    ],
    day: {
      type: String,
      trim: true
    },
    time: {
      type: String,
      trim: true
    },
    schedule: {
      startDate: {
        type: Date
      },
      endDate: {
        type: Date
      },
      weekdays: [
        {
          type: String,
          trim: true
        }
      ],
      startTime: {
        type: String,
        trim: true
      },
      endTime: {
        type: String,
        trim: true
      }
    },
    room: {
      type: String,
      trim: true
    },
    meetingLink: {
      type: String,
      trim: true
    },
    department: {
      type: String,
      required: true,
      trim: true
    },
    schoolYear: {
      type: String,
      trim: true
    },
    semester: {
      type: String,
      enum: ['1st Semester', '2nd Semester', 'Summer'],
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    credits: {
      type: Number,
      min: 1,
      max: 6
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
)

// Index for faster queries
// Note: subjectCode index is automatically created by unique: true, so we don't need to add it manually
subjectSchema.index({ department: 1 })
subjectSchema.index({ instructorId: 1 })
subjectSchema.index({ sections: 1 })

const Subject = createModelProxy('Subject', subjectSchema)
Subject.schema = subjectSchema

module.exports = Subject
