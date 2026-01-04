/**
 * Attendance History Utility
 * Shared localStorage management for attendance sessions
 * Used by instructor views and History (/history) pages
 */

import { ATTENDANCE_KEYS } from './constants/storage'
import { THRESHOLDS } from './constants/timing'
import { apiPost } from './api'

// Re-export storage keys for backward compatibility
const STORAGE_KEYS = {
  attendanceHistory: ATTENDANCE_KEYS.HISTORY,
  currentMeetCode: ATTENDANCE_KEYS.CURRENT_MEET_CODE,
  currentSessionStart: ATTENDANCE_KEYS.CURRENT_SESSION_START
}

// Export storage keys for external use
export const ATTENDANCE_STORAGE_KEYS = STORAGE_KEYS

// Maximum sessions to keep in localStorage - from centralized config
const MAX_HISTORY_SESSIONS = THRESHOLDS.MAX_HISTORY_SESSIONS

/**
 * Check if running in browser environment
 */
const isBrowser = () => typeof window !== 'undefined'

/**
 * Load attendance history from localStorage
 * @returns {Array} Array of saved attendance sessions
 */
export const loadAttendanceHistory = () => {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.attendanceHistory)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn('Unable to load attendance history:', error)
    return []
  }
}

/**
 * Save attendance history to localStorage
 * @param {Array} history - Array of attendance sessions
 */
export const saveAttendanceHistory = history => {
  if (!isBrowser()) return
  try {
    // Keep only the most recent sessions
    const trimmedHistory = history.slice(0, MAX_HISTORY_SESSIONS)
    window.localStorage.setItem(
      STORAGE_KEYS.attendanceHistory,
      JSON.stringify(trimmedHistory)
    )
    console.log(
      `💾 Saved ${trimmedHistory.length} attendance sessions to history`
    )
  } catch (error) {
    console.warn('Unable to save attendance history:', error)
  }
}

/**
 * Save current session to attendance history
 * Saves to BOTH localStorage AND cloud database
 * @param {Object} sessionData - Session data to save
 * @param {boolean} syncToDatabase - Whether to sync to database (default: true)
 * @returns {Promise<boolean>} Success status
 */
export const saveSessionToHistory = async (
  sessionData,
  syncToDatabase = true
) => {
  if (
    !sessionData ||
    !sessionData.meetCode ||
    !sessionData.participants ||
    sessionData.participants.length === 0
  ) {
    console.log('📝 No valid session data to save to history')
    return false
  }

  const history = loadAttendanceHistory()

  // Create session record
  const sessionRecord = {
    id: `${sessionData.meetCode}-${Date.now()}`,
    meetCode: sessionData.meetCode,
    sessionDate:
      sessionData.sessionDate || new Date().toISOString().split('T')[0],
    startTime: sessionData.startTime || new Date().toISOString(),
    endTime: new Date().toISOString(),
    participants: sessionData.participants.map(p => ({
      name: p.name || p.userName || 'Unknown',
      avatarUrl: p.avatarUrl,
      joinTime: p.joinTime || p.joinTimeIso,
      leaveTime: p.leaveTime || p.leaveTimeIso,
      durationSeconds: p.durationSeconds || p.attendedDuration || 0,
      status: p.status || p.rawStatus || 'absent', // Default to absent if status unknown
      isHost: p.isHost || false,
      studentId: p.studentId,
      email: p.email,
      userId: p.userId,
      isUnauthenticated: p.isUnauthenticated || false
    })),
    participantCount: sessionData.participants.length,
    hostCount: sessionData.participants.filter(p => p.isHost).length,
    subjectName: sessionData.subjectName,
    subjectId: sessionData.subjectId,
    savedAt: new Date().toISOString(),
    isSyncedToDatabase: false // Track if synced to backend
  }

  // Add to beginning of history (most recent first)
  history.unshift(sessionRecord)

  // Save to localStorage first (always succeeds)
  saveAttendanceHistory(history)
  console.log(
    `✅ Saved session ${sessionData.meetCode} with ${sessionRecord.participantCount} participants to localStorage`
  )

  // Sync to cloud database (non-blocking, doesn't fail if DB is unavailable)
  if (syncToDatabase) {
    // Use setTimeout to not block the UI
    setTimeout(async () => {
      try {
        await syncSessionToDatabase(sessionRecord)
      } catch (error) {
        console.warn('⚠️ Background database sync failed:', error.message)
        // Session is still in localStorage, can be synced later
      }
    }, 100)
  }

  return true
}

/**
 * Delete a specific session from history
 * @param {string} sessionId - The session ID to delete
 * @returns {Array} Updated history array
 */
export const deleteSessionFromHistory = sessionId => {
  const history = loadAttendanceHistory()
  const filtered = history.filter(s => s.id !== sessionId)
  saveAttendanceHistory(filtered)
  console.log(`🗑️ Deleted session ${sessionId} from history`)
  return filtered
}

/**
 * Clear all attendance history
 */
export const clearAllAttendanceHistory = () => {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(STORAGE_KEYS.attendanceHistory)
    console.log('🗑️ Cleared all attendance history')
  } catch (error) {
    console.warn('Unable to clear attendance history:', error)
  }
}

/**
 * Get current tracked meeting code
 * @returns {string|null} Current meeting code
 */
export const getCurrentMeetCode = () => {
  if (!isBrowser()) return null
  try {
    return window.localStorage.getItem(STORAGE_KEYS.currentMeetCode)
  } catch {
    return null
  }
}

/**
 * Set current tracked meeting code
 * @param {string|null} meetCode - Meeting code to set
 */
export const setCurrentMeetCode = meetCode => {
  if (!isBrowser()) return
  try {
    if (meetCode) {
      window.localStorage.setItem(STORAGE_KEYS.currentMeetCode, meetCode)
      window.localStorage.setItem(
        STORAGE_KEYS.currentSessionStart,
        new Date().toISOString()
      )
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.currentMeetCode)
      window.localStorage.removeItem(STORAGE_KEYS.currentSessionStart)
    }
  } catch (error) {
    console.warn('Unable to set current meet code:', error)
  }
}

/**
 * Get current session start time
 * @returns {string|null} ISO timestamp
 */
export const getCurrentSessionStart = () => {
  if (!isBrowser()) return null
  try {
    return window.localStorage.getItem(STORAGE_KEYS.currentSessionStart)
  } catch {
    return null
  }
}

/**
 * Mark a session as synced to database
 * @param {string} sessionId - Session ID to mark
 */
export const markSessionAsSynced = sessionId => {
  const history = loadAttendanceHistory()
  const updated = history.map(session => {
    if (session.id === sessionId) {
      return {
        ...session,
        isSyncedToDatabase: true,
        syncedAt: new Date().toISOString()
      }
    }
    return session
  })
  saveAttendanceHistory(updated)
  console.log(`✅ Marked session ${sessionId} as synced to database`)
  return updated
}

/**
 * Get unsynchronized sessions (not yet saved to database)
 * @returns {Array} Array of unsynchronized sessions
 */
export const getUnsyncedSessions = () => {
  const history = loadAttendanceHistory()
  return history.filter(session => !session.isSyncedToDatabase)
}

/**
 * Format duration from seconds to HH:MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
export const formatDurationFromSeconds = seconds => {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * Sync a session to the cloud database
 * @param {Object} sessionRecord - Session record to sync
 * @returns {Promise<boolean>} Success status
 */
export const syncSessionToDatabase = async sessionRecord => {
  if (!sessionRecord || !sessionRecord.meetCode) {
    console.warn('⚠️ Cannot sync empty session to database')
    return false
  }

  try {
    console.log(`☁️ Syncing session ${sessionRecord.meetCode} to database...`)

    const response = await apiPost('/attendance/save-session', {
      sessionId: sessionRecord.id,
      meetCode: sessionRecord.meetCode,
      sessionDate: sessionRecord.sessionDate,
      startTime: sessionRecord.startTime,
      endTime: sessionRecord.endTime,
      participants: sessionRecord.participants,
      participantCount: sessionRecord.participantCount,
      hostCount: sessionRecord.hostCount,
      subjectName: sessionRecord.subjectName,
      subjectId: sessionRecord.subjectId
    })

    if (response && response.success) {
      // Mark as synced in localStorage
      markSessionAsSynced(sessionRecord.id)
      console.log(
        `✅ Session ${sessionRecord.meetCode} synced to database successfully`
      )
      return true
    } else {
      console.warn(
        `⚠️ Failed to sync session to database:`,
        response?.message || 'Unknown error'
      )
      return false
    }
  } catch (error) {
    console.warn(
      `⚠️ Database sync error for session ${sessionRecord.meetCode}:`,
      error.message
    )
    // Don't fail - session is still saved to localStorage
    return false
  }
}

/**
 * Sync all unsynced sessions to database (batch operation)
 * @returns {Promise<number>} Number of successfully synced sessions
 */
export const syncAllUnsyncedSessions = async () => {
  const unsyncedSessions = getUnsyncedSessions()

  if (unsyncedSessions.length === 0) {
    console.log('✅ All sessions already synced to database')
    return 0
  }

  console.log(`☁️ Syncing ${unsyncedSessions.length} sessions to database...`)

  let syncedCount = 0
  for (const session of unsyncedSessions) {
    const success = await syncSessionToDatabase(session)
    if (success) syncedCount++
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  console.log(
    `✅ Synced ${syncedCount}/${unsyncedSessions.length} sessions to database`
  )
  return syncedCount
}

// ATTENDANCE_STORAGE_KEYS already exported at top of file
// MAX_HISTORY_SESSIONS uses centralized THRESHOLDS.MAX_HISTORY_SESSIONS
