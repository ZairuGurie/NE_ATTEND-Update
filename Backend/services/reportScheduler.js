/**
 * Report Scheduler Service
 * Handles periodic generation of attendance reports for instructors
 * Can precompute weekly/monthly summaries and optionally send email exports
 */

const { getModel } = require('./dataStore')
const { getInstructorAttendanceSummary } = require('./reportService')

const User = getModel('User')

// Configuration from environment
const REPORT_SCHEDULE_ENABLED = process.env.REPORT_SCHEDULE_ENABLED !== 'false'
const WEEKLY_REPORT_DAY = Number(process.env.WEEKLY_REPORT_DAY || 1) // Monday = 1
const WEEKLY_REPORT_HOUR = Number(process.env.WEEKLY_REPORT_HOUR || 8) // 8 AM
const MONTHLY_REPORT_DAY = Number(process.env.MONTHLY_REPORT_DAY || 1) // 1st of month
const MONTHLY_REPORT_HOUR = Number(process.env.MONTHLY_REPORT_HOUR || 9) // 9 AM

let schedulerInterval = null
let lastWeeklyRun = null
let lastMonthlyRun = null

/**
 * Get date range for the previous week (Mon-Sun)
 */
function getPreviousWeekRange() {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0 = Sunday
  
  // Calculate days to go back to last Monday
  const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek + 6
  
  const from = new Date(now)
  from.setDate(now.getDate() - daysToLastMonday)
  from.setHours(0, 0, 0, 0)
  
  const to = new Date(from)
  to.setDate(from.getDate() + 6)
  to.setHours(23, 59, 59, 999)
  
  return { from, to }
}

/**
 * Get date range for the previous month
 */
function getPreviousMonthRange() {
  const now = new Date()
  
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  from.setHours(0, 0, 0, 0)
  
  const to = new Date(now.getFullYear(), now.getMonth(), 0) // Last day of prev month
  to.setHours(23, 59, 59, 999)
  
  return { from, to }
}

/**
 * Generate weekly report for an instructor
 */
async function generateWeeklyReport(instructorId, logger = console) {
  const { from, to } = getPreviousWeekRange()
  
  try {
    const report = await getInstructorAttendanceSummary({
      instructorId,
      from: from.toISOString(),
      to: to.toISOString(),
      includeDetails: false
    })
    
    return {
      instructorId,
      period: 'weekly',
      from,
      to,
      generatedAt: new Date(),
      summary: report.summary,
      breakdown: report.breakdown
    }
  } catch (error) {
    logger.error(`Failed to generate weekly report for instructor ${instructorId}:`, error.message)
    return null
  }
}

/**
 * Generate monthly report for an instructor
 */
async function generateMonthlyReport(instructorId, logger = console) {
  const { from, to } = getPreviousMonthRange()
  
  try {
    const report = await getInstructorAttendanceSummary({
      instructorId,
      from: from.toISOString(),
      to: to.toISOString(),
      includeDetails: false
    })
    
    return {
      instructorId,
      period: 'monthly',
      from,
      to,
      generatedAt: new Date(),
      summary: report.summary,
      breakdown: report.breakdown
    }
  } catch (error) {
    logger.error(`Failed to generate monthly report for instructor ${instructorId}:`, error.message)
    return null
  }
}

/**
 * Process weekly reports for all instructors
 */
async function processWeeklyReports(logger = console) {
  logger.log('📊 Starting weekly report generation...')
  
  const instructors = await User.find({ role: 'instructor', active: { $ne: false } })
    .select('_id firstName lastName email')
    .lean()
  
  const results = {
    total: instructors.length,
    generated: 0,
    failed: 0,
    reports: []
  }
  
  for (const instructor of instructors) {
    const report = await generateWeeklyReport(instructor._id, logger)
    if (report) {
      results.generated++
      results.reports.push({
        instructorId: instructor._id,
        name: `${instructor.firstName} ${instructor.lastName}`,
        email: instructor.email,
        summary: report.summary
      })
    } else {
      results.failed++
    }
  }
  
  logger.log(`📊 Weekly reports complete: ${results.generated}/${results.total} generated`)
  return results
}

/**
 * Process monthly reports for all instructors
 */
async function processMonthlyReports(logger = console) {
  logger.log('📊 Starting monthly report generation...')
  
  const instructors = await User.find({ role: 'instructor', active: { $ne: false } })
    .select('_id firstName lastName email')
    .lean()
  
  const results = {
    total: instructors.length,
    generated: 0,
    failed: 0,
    reports: []
  }
  
  for (const instructor of instructors) {
    const report = await generateMonthlyReport(instructor._id, logger)
    if (report) {
      results.generated++
      results.reports.push({
        instructorId: instructor._id,
        name: `${instructor.firstName} ${instructor.lastName}`,
        email: instructor.email,
        summary: report.summary
      })
    } else {
      results.failed++
    }
  }
  
  logger.log(`📊 Monthly reports complete: ${results.generated}/${results.total} generated`)
  return results
}

/**
 * Check if it's time to run weekly reports
 */
function shouldRunWeeklyReport() {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const hour = now.getHours()
  
  // Check if it's the right day and hour
  if (dayOfWeek !== WEEKLY_REPORT_DAY || hour !== WEEKLY_REPORT_HOUR) {
    return false
  }
  
  // Check if we already ran today
  if (lastWeeklyRun) {
    const sameDay = 
      lastWeeklyRun.getFullYear() === now.getFullYear() &&
      lastWeeklyRun.getMonth() === now.getMonth() &&
      lastWeeklyRun.getDate() === now.getDate()
    if (sameDay) return false
  }
  
  return true
}

/**
 * Check if it's time to run monthly reports
 */
function shouldRunMonthlyReport() {
  const now = new Date()
  const dayOfMonth = now.getDate()
  const hour = now.getHours()
  
  // Check if it's the right day and hour
  if (dayOfMonth !== MONTHLY_REPORT_DAY || hour !== MONTHLY_REPORT_HOUR) {
    return false
  }
  
  // Check if we already ran this month
  if (lastMonthlyRun) {
    const sameMonth = 
      lastMonthlyRun.getFullYear() === now.getFullYear() &&
      lastMonthlyRun.getMonth() === now.getMonth()
    if (sameMonth) return false
  }
  
  return true
}

/**
 * Scheduler tick - check if reports should be generated
 */
async function schedulerTick(logger = console) {
  if (!REPORT_SCHEDULE_ENABLED) return
  
  try {
    if (shouldRunWeeklyReport()) {
      logger.log('📅 Triggering scheduled weekly reports...')
      await processWeeklyReports(logger)
      lastWeeklyRun = new Date()
    }
    
    if (shouldRunMonthlyReport()) {
      logger.log('📅 Triggering scheduled monthly reports...')
      await processMonthlyReports(logger)
      lastMonthlyRun = new Date()
    }
  } catch (error) {
    logger.error('Report scheduler tick failed:', error)
  }
}

/**
 * Start the report scheduler
 * Checks every hour if reports should be generated
 */
function startReportScheduler(logger = console) {
  if (!REPORT_SCHEDULE_ENABLED) {
    logger.log('📊 Report scheduler is disabled (REPORT_SCHEDULE_ENABLED=false)')
    return
  }
  
  if (schedulerInterval) {
    logger.log('📊 Report scheduler already running')
    return
  }
  
  logger.log('📊 Starting report scheduler...')
  logger.log(`   Weekly reports: Day ${WEEKLY_REPORT_DAY} at ${WEEKLY_REPORT_HOUR}:00`)
  logger.log(`   Monthly reports: Day ${MONTHLY_REPORT_DAY} at ${MONTHLY_REPORT_HOUR}:00`)
  
  // Check every hour
  schedulerInterval = setInterval(() => {
    schedulerTick(logger).catch(err => logger.error('Scheduler tick error:', err))
  }, 60 * 60 * 1000) // 1 hour
  
  // Also run immediately to catch any missed reports
  schedulerTick(logger).catch(err => logger.error('Initial scheduler tick error:', err))
}

/**
 * Stop the report scheduler
 */
function stopReportScheduler(logger = console) {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    logger.log('📊 Report scheduler stopped')
  }
}

/**
 * Get scheduler status
 */
function getSchedulerStatus() {
  return {
    enabled: REPORT_SCHEDULE_ENABLED,
    running: !!schedulerInterval,
    config: {
      weeklyReportDay: WEEKLY_REPORT_DAY,
      weeklyReportHour: WEEKLY_REPORT_HOUR,
      monthlyReportDay: MONTHLY_REPORT_DAY,
      monthlyReportHour: MONTHLY_REPORT_HOUR
    },
    lastRuns: {
      weekly: lastWeeklyRun,
      monthly: lastMonthlyRun
    }
  }
}

module.exports = {
  startReportScheduler,
  stopReportScheduler,
  getSchedulerStatus,
  processWeeklyReports,
  processMonthlyReports,
  generateWeeklyReport,
  generateMonthlyReport,
  getPreviousWeekRange,
  getPreviousMonthRange
}
