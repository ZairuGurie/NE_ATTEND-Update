const jwt = require('jsonwebtoken')
const { JWT_SECRET } = require('../config/jwt')

function requireAuth (req, res, next) {
  try {
    const header = req.headers['authorization'] || req.headers['Authorization']
    if (!header || !header.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({
          success: false,
          error: 'Missing or invalid authorization header'
        })
    }
    const token = header.slice(7).trim()
    const decoded = jwt.verify(token, JWT_SECRET)
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ success: false, error: 'Invalid token' })
    }
    req.auth = { userId: decoded.userId, role: decoded.role || 'student' }
    next()
  } catch (e) {
    return res
      .status(401)
      .json({ success: false, error: 'Unauthorized', message: e.message })
  }
}

module.exports = { requireAuth }
