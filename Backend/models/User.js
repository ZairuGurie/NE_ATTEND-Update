const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const { createModelProxy } = require('../db/modelProxy')

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    userPassword: {
      type: String,
      required: false
    },
    // Plaintext password for admin viewing purposes only
    // WARNING: This is stored for admin convenience but is a security risk
    plaintextPassword: {
      type: String,
      select: false // Never include in regular queries by default
    },
    role: {
      type: String,
      enum: ['student', 'instructor', 'admin'],
      default: 'student'
    },
    studentId: {
      type: String,
      unique: true,
      sparse: true
    },
    schoolYear: {
      type: String,
      trim: true
    },
    semester: {
      type: String,
      trim: true
    },
    department: {
      type: String,
      trim: true
    },
    course: {
      type: String,
      trim: true
    },
    profilePhotoUrl: {
      type: String,
      default: null
    },
    profilePicture: {
      type: String,
      default: null
    },
    imageScale: {
      type: Number,
      default: 1
    },
    notifications: {
      emailAlerts: { type: Boolean, default: true },
      attendanceReminders: { type: Boolean, default: true },
      gradeUpdates: { type: Boolean, default: false },
      announcementAlerts: { type: Boolean, default: true },
      studentMessages: { type: Boolean, default: true },
      systemUpdates: { type: Boolean, default: true }
    },
    phone: {
      type: String,
      trim: true
    },
    // Student-specific fields
    section: {
      type: String,
      trim: true
    },
    yearLevel: {
      type: String,
      trim: true
    },
    units: {
      type: String,
      trim: true
    },
    gpa: {
      type: String,
      trim: true
    },
    dateOfBirth: {
      type: Date
    },
    address: {
      type: String,
      trim: true
    },
    guardianName: {
      type: String,
      trim: true
    },
    guardianPhone: {
      type: String,
      trim: true
    },
    guardianRelation: {
      type: String,
      trim: true
    },
    emergencyContact: {
      type: String,
      trim: true
    },
    emergencyPhone: {
      type: String,
      trim: true
    },
    // Instructor/Admin-specific fields
    officeLocation: {
      type: String,
      trim: true
    },
    // Deprecated: officeHours and education fields are no longer used by frontend
    // Kept in schema for backward compatibility with existing data
    officeHours: {
      type: String,
      trim: true
    },
    education: {
      type: String,
      trim: true
    },
    experience: {
      type: String,
      trim: true
    },
    specialization: {
      type: String,
      trim: true
    },
    certifications: {
      type: String,
      trim: true
    },
    linkedin: {
      type: String,
      trim: true
    },
    researchGate: {
      type: String,
      trim: true
    },
    subjects: [
      {
        type: String,
        trim: true
      }
    ],
    sections: [
      {
        type: String,
        trim: true
      }
    ],
    bio: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
)

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`
})

// Hash password if modified
userSchema.pre('save', async function (next) {
  // Only hash password if it's been modified (or is new) and is not already hashed
  if (!this.isModified('userPassword')) {
    return next()
  }

  // Skip hashing if password is empty or already looks like a hash (starts with $2a$ or $2b$)
  if (
    !this.userPassword ||
    this.userPassword.startsWith('$2a$') ||
    this.userPassword.startsWith('$2b$')
  ) {
    return next()
  }

  try {
    // Hash password with salt rounds of 10
    const salt = await bcrypt.genSalt(10)
    this.userPassword = await bcrypt.hash(this.userPassword, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Compare password helper
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.userPassword || !candidatePassword) {
    return false
  }

  // If password is already hashed (starts with $2a$ or $2b$), use bcrypt.compare
  if (
    this.userPassword.startsWith('$2a$') ||
    this.userPassword.startsWith('$2b$')
  ) {
    try {
      return await bcrypt.compare(candidatePassword, this.userPassword)
    } catch (error) {
      console.error('Error comparing password:', error)
      return false
    }
  }

  // BACKWARD COMPATIBILITY: Allow plaintext password comparison
  // This enables users with plaintext passwords to log in
  // Passwords will be automatically migrated to hashed format on successful login
  if (
    this.userPassword &&
    !this.userPassword.startsWith('$2a$') &&
    !this.userPassword.startsWith('$2b$')
  ) {
    console.warn(
      `⚠️ SECURITY: User ${this._id} has plaintext password. Allowing login for migration.`
    )
    // Compare plaintext passwords directly
    return this.userPassword === candidatePassword
  }

  return false
}

// Ensure virtual fields are serialized
userSchema.set('toJSON', {
  virtuals: true,
  transform: function (doc, ret) {
    delete ret.userPassword
    return ret
  }
})

const User = createModelProxy('User', userSchema)
User.schema = userSchema

module.exports = User
