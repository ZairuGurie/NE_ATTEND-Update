const express = require('express')
const router = express.Router()
const {
  getStatus,
  getConnectionHealth,
  isCloudOnline,
  getActiveConnection
} = require('../db/connectionManager')
const { getSyncStats } = require('../services/syncQueue')
const {
  getSchedulerStatus,
  processWeeklyReports,
  processMonthlyReports
} = require('../services/reportScheduler')

/**
 * GET /api/system/health
 * Basic health check endpoint
 */
router.get('/health', (req, res) => {
  const activeConn = getActiveConnection()
  const isReady = activeConn && activeConn.readyState === 1

  res.json({
    status: isReady ? 'OK' : 'DEGRADED',
    message: 'NE-Attend API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
    }
  })
})

/**
 * GET /api/system/db-status
 * Detailed database connectivity status
 * Returns:
 *   - Active connection type (cloud or local)
 *   - readyState for both connections
 *   - Last sync status if sync worker is enabled
 */
router.get('/db-status', async (req, res) => {
  try {
    const connectionHealth = getConnectionHealth()
    const status = getStatus()
    const syncStats = await getSyncStats()
    
    // Determine active connection type
    let activeType = 'unavailable'
    if (connectionHealth.cloud.ready) {
      activeType = 'cloud'
    } else if (connectionHealth.local.ready) {
      activeType = 'local'
    }

    res.json({
      success: true,
      data: {
        active: activeType,
        cloudOnline: isCloudOnline(),
        connections: {
          cloud: {
            status: status.cloud.status,
            ready: connectionHealth.cloud.ready,
            hasConnection: connectionHealth.cloud.hasConnection,
            lastError: connectionHealth.cloud.lastError
          },
          local: {
            status: status.local.status,
            ready: connectionHealth.local.ready,
            hasConnection: connectionHealth.local.hasConnection,
            lastError: connectionHealth.local.lastError
          }
        },
        sync: syncStats,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('[System] Failed to get DB status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve database status',
      message: error.message
    })
  }
})

/**
 * GET /api/system/sync-status
 * Sync worker status and queue statistics
 */
router.get('/sync-status', async (req, res) => {
  try {
    const syncStats = await getSyncStats()
    const connectionHealth = getConnectionHealth()

    res.json({
      success: true,
      data: {
        enabled: connectionHealth.local.ready && connectionHealth.cloud.ready,
        cloudReady: connectionHealth.cloud.ready,
        localReady: connectionHealth.local.ready,
        queue: syncStats,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('[System] Failed to get sync status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sync status',
      message: error.message
    })
  }
})

/**
 * GET /api/system/report-scheduler
 * Report scheduler status
 */
router.get('/report-scheduler', (req, res) => {
  try {
    const status = getSchedulerStatus()
    res.json({
      success: true,
      data: status
    })
  } catch (error) {
    console.error('[System] Failed to get scheduler status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve scheduler status'
    })
  }
})

/**
 * POST /api/system/report-scheduler/trigger
 * Manually trigger report generation
 * Body: { type: 'weekly' | 'monthly' }
 */
router.post('/report-scheduler/trigger', async (req, res) => {
  try {
    const { type } = req.body

    if (!type || !['weekly', 'monthly'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid report type. Use "weekly" or "monthly"'
      })
    }

    console.log(`📊 Manual ${type} report trigger requested`)

    let result
    if (type === 'weekly') {
      result = await processWeeklyReports(console)
    } else {
      result = await processMonthlyReports(console)
    }

    res.json({
      success: true,
      message: `${type} reports generated`,
      data: {
        type,
        total: result.total,
        generated: result.generated,
        failed: result.failed,
        reports: result.reports
      }
    })
  } catch (error) {
    console.error('[System] Failed to trigger reports:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to generate reports',
      message: error.message
    })
  }
})

module.exports = router
