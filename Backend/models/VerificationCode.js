const mongoose = require('mongoose');
const { createModelProxy } = require('../db/modelProxy');

const verificationCodeSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  code: { type: String, required: true },
  purpose: { type: String, enum: ['register', 'reset'], default: 'register' },
  expiresAt: { type: Date, required: true },
  consumed: { type: Boolean, default: false }
}, { timestamps: true });

verificationCodeSchema.index({ email: 1, purpose: 1 });

const VerificationCode = createModelProxy('VerificationCode', verificationCodeSchema);
VerificationCode.schema = verificationCodeSchema;

module.exports = VerificationCode;
