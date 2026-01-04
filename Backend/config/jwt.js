// Centralized JWT configuration for NE-Attend backend
// Ensures consistent handling of JWT secrets across routes and middleware

const DEFAULT_DEV_SECRET = 'dev-secret-change-me'

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'development'

// Raw secret from environment
const rawSecret = process.env.JWT_SECRET

// In production, JWT_SECRET must be explicitly set and must not use the default dev secret
if (NODE_ENV === 'production') {
  if (!rawSecret) {
    // Fail fast - running without a secret is unacceptable
    // eslint-disable-next-line no-console
    console.error(
      '❌ CRITICAL: JWT_SECRET environment variable is required in production!'
    )
    // eslint-disable-next-line no-console
    console.error(
      '   Please set JWT_SECRET in your .env file or deployment config'
    )
    process.exit(1)
  }

  if (rawSecret === DEFAULT_DEV_SECRET) {
    // eslint-disable-next-line no-console
    console.error(
      '❌ CRITICAL: Using the default development JWT secret in production is forbidden!'
    )
    // eslint-disable-next-line no-console
    console.error('   Please set a strong, unique JWT_SECRET in your .env file')
    process.exit(1)
  }
}

// For non-production environments, allow a default secret but warn if it is used explicitly
const JWT_SECRET = rawSecret || DEFAULT_DEV_SECRET

if (NODE_ENV !== 'production' && !rawSecret) {
  // eslint-disable-next-line no-console
  console.warn(
    '⚠️  WARNING: Using default development JWT secret. Set JWT_SECRET to override.'
  )
}

module.exports = {
  JWT_SECRET
}
