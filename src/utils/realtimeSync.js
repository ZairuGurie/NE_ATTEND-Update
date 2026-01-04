/**
 * NE-ATTEND Real-Time Sync Utility
 *
 * Handles synchronization between browser extension data and Dashboard display.
 * Provides localStorage persistence with real-time duration updates.
 */

import { REALTIME_KEYS } from './constants/storage'
import { THRESHOLDS, INTERVALS } from './constants/timing'

// Re-export storage keys for backward compatibility
// Components importing from this file will still work
export const REALTIME_STORAGE_KEYS = {
  liveParticipants: REALTIME_KEYS.LIVE_PARTICIPANTS,
  activeMeeting: REALTIME_KEYS.ACTIVE_MEETING,
  lastUpdate: REALTIME_KEYS.LAST_UPDATE,
  durationTracker: REALTIME_KEYS.DURATION_TRACKER
}

// Export threshold for history save (used by Dashboard)
export const HISTORY_SAVE_THRESHOLD_MS = THRESHOLDS.HISTORY_SAVE

/**
 * Save real-time participants to localStorage
 * @param {Array} participants - Array of participant objects
 * @param {string} meetCode - Meeting code
 */
export const saveParticipantsToStorage = (participants, meetCode) => {
  if (typeof window === 'undefined') return

  try {
    const data = {
      meetCode,
      participants,
      updatedAt: new Date().toISOString(),
      count: participants.length
    }
    window.localStorage.setItem(
      REALTIME_STORAGE_KEYS.liveParticipants,
      JSON.stringify(data)
    )
    window.localStorage.setItem(
      REALTIME_STORAGE_KEYS.lastUpdate,
      new Date().toISOString()
    )
  } catch (error) {
    console.warn('Failed to save participants to localStorage:', error)
  }
}

/**
 * Load real-time participants from localStorage
 * @returns {Object|null} - Stored participants data or null
 */
export const loadParticipantsFromStorage = () => {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(
      REALTIME_STORAGE_KEYS.liveParticipants
    )
    if (!raw) return null
    return JSON.parse(raw)
  } catch (error) {
    console.warn('Failed to load participants from localStorage:', error)
    return null
  }
}

/**
 * Clear real-time data from localStorage
 */
export const clearRealtimeStorage = () => {
  if (typeof window === 'undefined') return

  try {
    Object.values(REALTIME_STORAGE_KEYS).forEach(key => {
      window.localStorage.removeItem(key)
    })
  } catch (error) {
    console.warn('Failed to clear realtime storage:', error)
  }
}

/**
 * Duration tracker for real-time updates
 * Tracks when each participant joined and calculates live duration
 */
export class DurationTracker {
  constructor () {
    this.participants = new Map()
    this.intervalId = null
    this.listeners = new Set()
    this.isPaused = false // Pause tracking when instructor leaves
    this.pausedAt = null // Timestamp when tracking was paused
    this.instructorLeft = false // Track if instructor has left
    this.load()
  }

  /**
   * Load tracker state from localStorage
   * Restores participants AND pause state (isPaused, pausedAt, instructorLeft)
   */
  load () {
    if (typeof window === 'undefined') return

    try {
      const raw = window.localStorage.getItem(
        REALTIME_STORAGE_KEYS.durationTracker
      )
      if (raw) {
        const data = JSON.parse(raw)
        this.participants = new Map(Object.entries(data.participants || {}))

        // Restore pause state - CRITICAL for correct behavior after page refresh
        if (data.isPaused !== undefined) {
          this.isPaused = data.isPaused
        }
        if (data.pausedAt !== undefined) {
          this.pausedAt = data.pausedAt
        }
        if (data.instructorLeft !== undefined) {
          this.instructorLeft = data.instructorLeft
        }

        console.log(
          `📥 DurationTracker loaded: isPaused=${this.isPaused}, instructorLeft=${this.instructorLeft}`
        )
      }
    } catch (error) {
      console.warn('Failed to load duration tracker:', error)
    }
  }

  /**
   * Save tracker state to localStorage
   * Persists participants AND pause state (isPaused, pausedAt, instructorLeft)
   */
  save () {
    if (typeof window === 'undefined') return

    try {
      const data = {
        participants: Object.fromEntries(this.participants),
        savedAt: new Date().toISOString(),
        // CRITICAL: Persist pause state for correct behavior after page refresh
        isPaused: this.isPaused,
        pausedAt: this.pausedAt,
        instructorLeft: this.instructorLeft
      }
      window.localStorage.setItem(
        REALTIME_STORAGE_KEYS.durationTracker,
        JSON.stringify(data)
      )
    } catch (error) {
      console.warn('Failed to save duration tracker:', error)
    }
  }

  /**
   * Update participant tracking
   * @param {string} key - Participant unique key
   * @param {Object} data - Participant data with durationSeconds
   */
  updateParticipant (key, data) {
    const existing = this.participants.get(key)
    const isCurrentlyInMeeting =
      data.isCurrentlyInMeeting !== false && data.isLive !== false

    if (!existing) {
      // New participant - start tracking
      // FIX (Dec 4, 2025): Prioritize attendedDuration from extension
      this.participants.set(key, {
        key,
        name: data.name,
        startTime: Date.now(),
        baseDuration: data.attendedDuration || data.durationSeconds || 0,
        isCurrentlyInMeeting: isCurrentlyInMeeting,
        lastUpdate: Date.now()
      })
    } else {
      // Existing participant - update
      // FIX: Handle participant return - when they come back, resume duration tracking
      const wasInMeeting = existing.isCurrentlyInMeeting
      const isNowInMeeting = isCurrentlyInMeeting

      if (!wasInMeeting && isNowInMeeting) {
        // Participant RETURNED - resume tracking from where they left off
        // FIX (Dec 4, 2025): Prioritize attendedDuration from extension
        console.log(
          `🔙 DurationTracker: "${data.name}" returned - resuming from ${existing.baseDuration}s`
        )
        this.participants.set(key, {
          ...existing,
          startTime: Date.now(), // Reset start time for elapsed calculation
          baseDuration:
            data.attendedDuration ||
            data.durationSeconds ||
            existing.baseDuration, // Use incoming duration or keep existing
          isCurrentlyInMeeting: true,
          leftAt: null, // Clear left timestamp
          lastUpdate: Date.now()
        })
      } else {
        // Normal update - FIX: Prioritize attendedDuration from extension
        this.participants.set(key, {
          ...existing,
          baseDuration:
            data.attendedDuration ||
            data.durationSeconds ||
            existing.baseDuration,
          isCurrentlyInMeeting: isCurrentlyInMeeting,
          lastUpdate: Date.now()
        })
      }
    }

    this.save()
  }

  /**
   * Mark participant as left
   * @param {string} key - Participant unique key
   */
  markLeft (key) {
    const existing = this.participants.get(key)
    if (existing) {
      this.participants.set(key, {
        ...existing,
        isCurrentlyInMeeting: false,
        leftAt: Date.now()
      })
      this.save()
    }
  }

  /**
   * Get current duration for a participant
   * @param {string} key - Participant unique key
   * @returns {number} - Duration in seconds
   *
   * FIX (Dec 4, 2025): Adopting trackit's approach - trust extension's attendedDuration
   * directly instead of recalculating. Extension counts actual seconds participant was
   * visible in Google Meet, which is more accurate than Dashboard's calculation.
   */
  getDuration (key) {
    const participant = this.participants.get(key)
    if (!participant) return 0

    // FIX: Always return baseDuration from extension's attendedDuration
    // The extension tracks actual visibility time, which is authoritative.
    // Previous bug: Recalculated using Dashboard's startTime (when Dashboard
    // first saw participant) instead of actual join time.
    return participant.baseDuration
  }

  /**
   * Get all durations as a map
   * @returns {Map} - Map of key -> duration
   */
  getAllDurations () {
    const durations = new Map()
    for (const [key] of this.participants) {
      durations.set(key, this.getDuration(key))
    }
    return durations
  }

  /**
   * Subscribe to duration updates
   * @param {Function} callback - Called with updated durations
   * @returns {Function} - Unsubscribe function
   */
  subscribe (callback) {
    this.listeners.add(callback)

    // Start interval if first subscriber
    if (!this.intervalId && this.listeners.size === 1) {
      this.intervalId = setInterval(() => {
        this.notifyListeners()
      }, 1000) // Update every second
    }

    // Immediately notify with current state
    callback(this.getAllDurations())

    return () => {
      this.listeners.delete(callback)
      if (this.listeners.size === 0 && this.intervalId) {
        clearInterval(this.intervalId)
        this.intervalId = null
      }
    }
  }

  /**
   * Notify all listeners with current durations
   */
  notifyListeners () {
    const durations = this.getAllDurations()
    for (const listener of this.listeners) {
      try {
        listener(durations)
      } catch (error) {
        console.warn('Duration listener error:', error)
      }
    }
  }

  /**
   * Clear all tracking data
   */
  clear () {
    this.participants.clear()
    this.isPaused = false
    this.pausedAt = null
    this.instructorLeft = false
    this.save()
  }

  /**
   * Pause duration tracking (called when instructor leaves)
   * All participant durations freeze at current value
   */
  pause () {
    if (this.isPaused) return // Already paused

    console.log('⏸️ DurationTracker: Pausing - Instructor left the meeting')
    this.isPaused = true
    this.pausedAt = Date.now()
    this.instructorLeft = true

    // Freeze all participant durations at current value
    for (const [key, data] of this.participants) {
      if (data.isCurrentlyInMeeting) {
        const currentDuration = this.getDuration(key)
        this.participants.set(key, {
          ...data,
          baseDuration: currentDuration,
          startTime: Date.now() // Reset start time for when we resume
        })
      }
    }

    this.save()
    this.notifyListeners() // Notify that durations are now frozen
  }

  /**
   * Resume duration tracking (called when instructor returns)
   * All participant durations resume from where they were paused
   */
  resume () {
    if (!this.isPaused) return // Not paused

    console.log('▶️ DurationTracker: Resuming - Instructor returned to meeting')
    this.isPaused = false
    this.instructorLeft = false

    const pauseDuration = this.pausedAt ? Date.now() - this.pausedAt : 0
    console.log(`   Paused for ${Math.floor(pauseDuration / 1000)} seconds`)

    // Reset start times for all participants still in meeting
    for (const [key, data] of this.participants) {
      if (data.isCurrentlyInMeeting) {
        this.participants.set(key, {
          ...data,
          startTime: Date.now() // Start fresh from now
        })
      }
    }

    this.pausedAt = null
    this.save()
    this.notifyListeners() // Notify that durations are now active again
  }

  /**
   * Check if tracking is paused
   * @returns {boolean}
   */
  isTrackingPaused () {
    return this.isPaused
  }

  /**
   * Check if instructor has left
   * @returns {boolean}
   */
  hasInstructorLeft () {
    return this.instructorLeft
  }

  /**
   * Sync with incoming participant list
   * @param {Array} participants - Array of participant objects
   */
  syncWithParticipants (participants) {
    const incomingKeys = new Set()

    // Update/add participants from incoming data
    for (const p of participants) {
      const key = p.key || p.avatarUrl || p.participantId || `${p.name}-unknown`
      incomingKeys.add(key)
      this.updateParticipant(key, p)
    }

    // Mark participants not in incoming data as potentially left
    for (const [key, data] of this.participants) {
      if (!incomingKeys.has(key) && data.isCurrentlyInMeeting) {
        // Only mark as left if they were in meeting and not in new data
        this.markLeft(key)
      }
    }
  }
}

// Singleton instance
let durationTrackerInstance = null

/**
 * Get the singleton DurationTracker instance
 * @returns {DurationTracker}
 */
export const getDurationTracker = () => {
  if (!durationTrackerInstance) {
    durationTrackerInstance = new DurationTracker()
  }
  return durationTrackerInstance
}

/**
 * Format duration seconds to HH:MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted duration
 */
export const formatDuration = seconds => {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * Process incoming Socket.IO payload and update storage
 * @param {Object} payload - Socket.IO attendance:update payload
 * @returns {Array} - Processed participants for display
 */
export const processRealtimePayload = payload => {
  if (!payload) return []

  const participants = payload.participants || []
  const meetCode = payload.meetCode || 'unknown'

  // Get duration tracker
  const tracker = getDurationTracker()

  // Sync tracker with incoming participants
  tracker.syncWithParticipants(participants)

  // Enhance participants with live durations
  // FIX (Dec 4, 2025): Use extension's attendedDuration directly, tracker as backup
  const enhanced = participants.map(p => {
    const key = p.key || p.avatarUrl || p.participantId || `${p.name}-unknown`

    // Prioritize extension's attendedDuration, use tracker's value as fallback
    const liveDuration = p.attendedDuration || tracker.getDuration(key)

    return {
      ...p,
      durationSeconds: liveDuration,
      attendedDuration: liveDuration, // Preserve for downstream use
      duration: formatDuration(liveDuration),
      // Ensure critical fields are present
      key,
      name: p.name || p.displayName || 'Unknown',
      isCurrentlyInMeeting: p.isCurrentlyInMeeting !== false,
      isHost: p.isHost || false,
      avatarUrl: p.avatarUrl || null
    }
  })

  // Save to localStorage
  saveParticipantsToStorage(enhanced, meetCode)

  return enhanced
}

/**
 * Create a real-time sync hook for React components
 * @param {Function} setRows - State setter for participant rows
 * @returns {Object} - Sync utilities
 */
export const createRealtimeSync = setRows => {
  const tracker = getDurationTracker()
  let unsubscribe = null

  return {
    /**
     * Start real-time duration updates
     */
    start: () => {
      unsubscribe = tracker.subscribe(durations => {
        setRows(prevRows => {
          if (!prevRows || prevRows.length === 0) return prevRows

          let hasChanges = false
          const updated = prevRows.map(row => {
            const liveDuration = durations.get(row.key)
            if (
              liveDuration !== undefined &&
              liveDuration !== row.durationSeconds
            ) {
              hasChanges = true
              return {
                ...row,
                durationSeconds: liveDuration,
                duration: formatDuration(liveDuration)
              }
            }
            return row
          })

          return hasChanges ? updated : prevRows
        })
      })
    },

    /**
     * Stop real-time duration updates
     */
    stop: () => {
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
    },

    /**
     * Process incoming payload and update state
     * @param {Object} payload - Socket.IO payload
     */
    processPayload: payload => {
      const enhanced = processRealtimePayload(payload)
      return enhanced
    },

    /**
     * Clear all tracking data
     */
    clear: () => {
      tracker.clear()
      clearRealtimeStorage()
    }
  }
}

export default {
  REALTIME_STORAGE_KEYS,
  saveParticipantsToStorage,
  loadParticipantsFromStorage,
  clearRealtimeStorage,
  DurationTracker,
  getDurationTracker,
  formatDuration,
  processRealtimePayload,
  createRealtimeSync
}
