const express = require('express')
const router = express.Router()
const { getModel } = require('../services/dataStore')
const Notification = getModel('Notification')
const { requireAuth } = require('../middleware/auth')

/**
 * GET /api/notifications
 * Get all notifications for the current user
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      })
    }
    const { limit = 50, unreadOnly = false } = req.query

    const query = { userId }
    if (unreadOnly === 'true') {
      query.isRead = false
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .lean()

    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false
    })

    res.json({
      success: true,
      data: notifications,
      unreadCount
    })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    })
  }
})

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications
 */
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      })
    }

    const count = await Notification.countDocuments({
      userId,
      isRead: false
    })

    res.json({
      success: true,
      count
    })
  } catch (error) {
    console.error('Error fetching unread count:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unread count'
    })
  }
})

/**
 * PUT /api/notifications/:id/read
 * Mark a single notification as read
 */
router.put('/:id/read', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      })
    }
    const { id } = req.params

    const notification = await Notification.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    )

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      })
    }

    res.json({
      success: true,
      data: notification
    })
  } catch (error) {
    console.error('Error marking notification as read:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read'
    })
  }
})

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read for the current user
 */
router.put('/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      })
    }

    const result = await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() }
    )

    res.json({
      success: true,
      modifiedCount: result.modifiedCount
    })
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read'
    })
  }
})

/**
 * DELETE /api/notifications/:id
 * Delete a single notification
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      })
    }
    const { id } = req.params

    const notification = await Notification.findOneAndDelete({
      _id: id,
      userId
    })

    if (!notification) {
      return res.status(404).json({
        success: false,
        error: 'Notification not found'
      })
    }

    res.json({
      success: true,
      message: 'Notification deleted'
    })
  } catch (error) {
    console.error('Error deleting notification:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete notification'
    })
  }
})

/**
 * DELETE /api/notifications
 * Delete all notifications for the current user
 */
router.delete('/', requireAuth, async (req, res) => {
  try {
    const userId = req.auth?.userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized'
      })
    }

    const result = await Notification.deleteMany({ userId })

    res.json({
      success: true,
      deletedCount: result.deletedCount
    })
  } catch (error) {
    console.error('Error deleting all notifications:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete all notifications'
    })
  }
})

module.exports = router
