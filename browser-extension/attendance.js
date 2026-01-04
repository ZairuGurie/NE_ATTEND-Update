/**
 * NE-Attend Browser Extension - Attendance Tracking for Google Meet
 *
 * NOTE: Console Deprecation Warnings
 * ===================================
 * You may see browser console warnings about "Unload event listeners are deprecated"
 * from source "MeetingsUi.1JeWK83Uiv4.loadAudioAnalyzer...". This warning originates
 * from Google Meet's internal JavaScript code, NOT from our extension codebase.
 *
 * Our codebase uses modern event patterns:
 * - 'pagehide' event (modern, works with bfcache) instead of deprecated 'beforeunload'
 * - 'visibilitychange' event for tab visibility tracking
 * - Proper cleanup with removeEventListener in all event handlers
 *
 * This is a third-party deprecation warning that we cannot control. The warning
 * suppression code below filters these Google Meet warnings for better UX.
 */

// Suppress Google Meet's unload deprecation warnings (third-party issue)
// Only suppresses warnings from Google Meet's MeetingsUi code, not our own warnings
;(function () {
  const originalWarn = console.warn
  console.warn = function (...args) {
    const message = args.join(' ')
    // Only suppress specific Google Meet deprecation warnings about unload events
    if (
      message.includes('Unload event listeners are deprecated') &&
      (message.includes('MeetingsUi') || message.includes('loadAudioAnalyzer'))
    ) {
      // Suppress this specific third-party warning from Google Meet
      return
    }
    // Pass through all other warnings (including our own)
    originalWarn.apply(console, args)
  }
})()

let meetActionButtons
let participantsList = new Map()
let attendanceData = new Map()
let previousParticipants = new Map() // Track previous state for join/leave detection
let participantsButtonIndex = 1
let startTime
let meetDuration = 1
let _currTime // Reserved for future use
let lastBroadcastAt = 0
let triedOpenPanel = false
let panelOpenRetryCount = 0
const MAX_PANEL_RETRIES = 5

// Reset panel opening state (useful for debugging/retries)
window.resetPanelState = function () {
  triedOpenPanel = false
  panelOpenRetryCount = 0
  console.log('🔄 Panel state reset - will retry opening panel')
}
let _currentUser = null // Reserved for future use
let groupValidation = null
let tracking = null // single interval handle for tracker
let periodicObserverRetryInterval = null // interval for periodic observer retry
let extEnabledCache = true // last known toggle state
let finalizedOnce = false // Track finalization attempts (allow retries)
let finalizationAttempts = 0 // Count finalization attempts
const MAX_FINALIZATION_ATTEMPTS = 3 // Allow up to 3 finalization attempts
let submissionInProgress = false // Track if submission is currently in progress
let submissionCompleted = false // Track if submission has completed successfully
let dashboardOpenedOnce = false // prevent multiple dashboard opens
let authenticationFailedNotified = false // prevent repeated auth failure alerts
let lastErrorNotification = 0 // timestamp of last error notification
let extensionContextInvalidated = false // Track if extension context has been invalidated
let contextInvalidationNotified = false // Prevent repeated notifications
let meetingStatus = 'idle' // Track meeting status: 'idle', 'active', 'scraping', 'data_received'
let meetingStatusTimestamp = Date.now() // Track when status last changed (for timeout detection)
// PHASE 1 FIX: Meeting end detection event listeners
let meetingEndEventListeners = {
  pagehide: null,
  visibilitychange: null,
  hostLeaveObserver: null,
  meetingEndObserver: null,
  leaveDialogObserver: null // NEW: MutationObserver for Google Meet leave/end dialog
}
let visibilityHiddenStartTime = null // Track when page became hidden
const VISIBILITY_HIDDEN_THRESHOLD = 30000 // 30 seconds before considering meeting ended

// PRE-JOIN PAGE DETECTION: Track if waiting for user to join meeting
let waitingForUserToJoin = false // True if on pre-join page, waiting to start tracking
let preJoinCheckInterval = null // Interval to check if user has joined
const PRE_JOIN_CHECK_INTERVAL_MS = 1000 // Check every 1 second

// ========================================================================
// HOST IDENTITY LOCK SYSTEM v2.0 - Robust host identification with persistence
// Once a host is identified and locked, they remain the host until they leave
// Features:
// - Confirmation threshold before locking (reduces false positives)
// - Missed threshold before unlocking (handles brief connection issues)
// - LocalStorage persistence (survives page refresh)
// - Candidate tracking (ensures same host reaches threshold)
// ========================================================================
const HOST_LOCK_STORAGE_KEY = 'neattend_locked_host'

let lockedHost = {
  name: null, // Host's display name
  avatarUrl: null, // Host's avatar URL (primary identifier)
  lockedAt: null, // Timestamp when host was locked
  meetCode: null, // Meet code when locked (clear on new meeting)
  confirmationCount: 0, // Consecutive host detections before locking
  missedCount: 0, // Consecutive scrapes where locked host not found
  candidateName: null, // Current candidate being tracked (for confirmation)
  candidateAvatarUrl: null // Current candidate avatar
}

// Host lock thresholds - INCREASED FOR STABILITY
// Lower confirmation = faster lock, Higher missed = more sticky (prevents flickering)
const HOST_CONFIRMATION_THRESHOLD = 1 // REDUCED: Lock immediately on first detection (was 2)
const HOST_MISSED_THRESHOLD = 10 // INCREASED: Need 10 consecutive misses to unlock (was 3) - prevents flickering

// CRITICAL: Permanent host lock - Host stays locked for ENTIRE SESSION
// When true, host is NEVER auto-unlocked even if they leave the meeting
// Host can only be unlocked by: explicit session end, page refresh, or manual clear
const HOST_PERMANENT_LOCK = true // When true, host identity persists even after leaving

/**
 * Save locked host state to localStorage for persistence
 */
function saveLockedHostState () {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HOST_LOCK_STORAGE_KEY, JSON.stringify(lockedHost))
    }
  } catch (e) {
    console.warn('Failed to save locked host state:', e)
  }
}

/**
 * Load locked host state from localStorage
 */
function loadLockedHostState () {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(HOST_LOCK_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        // Only restore if lock is recent (within 30 minutes) and for same meeting
        const lockAge = Date.now() - (parsed.lockedAt || 0)
        const currentMeetCode = getCurrentMeetCode()

        if (lockAge < 30 * 60 * 1000 && parsed.meetCode === currentMeetCode) {
          lockedHost = { ...lockedHost, ...parsed }
          console.log(
            `🔒 Restored locked host from storage: "${lockedHost.name}"`
          )
          return true
        } else {
          // Clear stale data
          localStorage.removeItem(HOST_LOCK_STORAGE_KEY)
        }
      }
    }
  } catch (e) {
    console.warn('Failed to load locked host state:', e)
  }
  return false
}

/**
 * Clear locked host state from localStorage
 */
function clearLockedHostState () {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(HOST_LOCK_STORAGE_KEY)
    }
  } catch (e) {
    console.warn('Failed to clear locked host state:', e)
  }
}

// Initialize: Try to restore locked host state on script load
setTimeout(() => {
  loadLockedHostState()
}, 100)

// ========================================================================
// SESSION STATE MACHINE v1.0 - Manages recording session lifecycle
// States: IDLE → ACTIVE → ENDING → ENDED
// Features:
// - Token auto-regeneration when instructor joins
// - Single session per browser (prevents duplicate recordings)
// - 30-minute token expiry
// - Persists to chrome.storage for cross-tab awareness
// ========================================================================
const SESSION_STATE = {
  IDLE: 'idle', // No active session
  ACTIVE: 'active', // Recording in progress
  ENDING: 'ending', // Sending final data
  ENDED: 'ended' // Session completed
}

const SESSION_STORAGE_KEY = 'activeSession'
const TOKEN_TTL_MS = 30 * 60 * 1000 // 30 minutes token expiry

let currentSession = {
  state: SESSION_STATE.IDLE,
  meetCode: null,
  startTime: null,
  tokenId: null,
  subjectId: null,
  groupId: null,
  hostName: null,
  participantCount: 0,
  lastUpdated: null
}

/**
 * Save current session state to chrome.storage.local
 */
async function saveSessionState () {
  try {
    await new Promise((resolve, reject) => {
      chrome.storage.local.set(
        { [SESSION_STORAGE_KEY]: currentSession },
        () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
          } else {
            resolve()
          }
        }
      )
    })
    console.log(`📦 Session state saved: ${currentSession.state}`)
  } catch (e) {
    console.error('Failed to save session state:', e)
  }
}

/**
 * Load session state from chrome.storage.local
 */
async function loadSessionState () {
  try {
    const result = await new Promise(resolve => {
      chrome.storage.local.get([SESSION_STORAGE_KEY], resolve)
    })

    if (result[SESSION_STORAGE_KEY]) {
      const saved = result[SESSION_STORAGE_KEY]

      // Check if session is still valid (within 2 hours)
      const sessionAge = Date.now() - (saved.startTime || 0)
      const maxSessionAge = 2 * 60 * 60 * 1000 // 2 hours

      if (saved.state === SESSION_STATE.ACTIVE && sessionAge < maxSessionAge) {
        currentSession = { ...currentSession, ...saved }
        console.log(`📦 Restored active session: ${currentSession.meetCode}`)
        return true
      } else if (saved.state === SESSION_STATE.ACTIVE) {
        // Session expired - clear it
        console.log(
          `⏰ Session expired (${Math.round(
            sessionAge / 60000
          )} min old) - clearing`
        )
        await clearSessionState()
      }
    }
  } catch (e) {
    console.error('Failed to load session state:', e)
  }
  return false
}

/**
 * Clear session state from chrome.storage.local
 */
async function clearSessionState () {
  currentSession = {
    state: SESSION_STATE.IDLE,
    meetCode: null,
    startTime: null,
    tokenId: null,
    subjectId: null,
    groupId: null,
    hostName: null,
    participantCount: 0,
    lastUpdated: null
  }

  try {
    await new Promise(resolve => {
      chrome.storage.local.remove([SESSION_STORAGE_KEY], resolve)
    })
    console.log('📦 Session state cleared')
  } catch (e) {
    console.error('Failed to clear session state:', e)
  }
}

/**
 * Start a new recording session
 * @param {string} meetCode - The Google Meet code
 * @param {Object} tokenData - Token data from backend
 * @returns {boolean} True if session started successfully
 */
async function startSession (meetCode, tokenData = null) {
  // SAFETY: Check if there's already an active session
  if (currentSession.state === SESSION_STATE.ACTIVE) {
    if (currentSession.meetCode === meetCode) {
      console.log(`📦 Session already active for ${meetCode}`)
      return true // Same meeting, continue
    } else {
      console.warn(
        `⚠️ Cannot start new session - already recording ${currentSession.meetCode}`
      )
      console.warn('   End the current session first before starting a new one')
      return false // Different meeting, block
    }
  }

  // Check for active session in storage (cross-tab safety)
  const hasExistingSession = await loadSessionState()
  if (hasExistingSession && currentSession.meetCode !== meetCode) {
    console.warn(`⚠️ Another tab is recording ${currentSession.meetCode}`)
    return false
  }

  // Start new session
  currentSession = {
    state: SESSION_STATE.ACTIVE,
    meetCode: meetCode,
    startTime: Date.now(),
    tokenId: tokenData?.token || null,
    subjectId: tokenData?.subjectId || null,
    groupId: tokenData?.groupId || null,
    hostName: lockedHost.name || null,
    participantCount: 0,
    lastUpdated: Date.now()
  }

  await saveSessionState()
  console.log(`🎬 Session started for ${meetCode}`)
  return true
}

/**
 * Update session with current participant count
 * @param {number} count - Current participant count
 */
async function updateSessionParticipantCount (count) {
  if (currentSession.state !== SESSION_STATE.ACTIVE) return

  currentSession.participantCount = count
  currentSession.lastUpdated = Date.now()
  await saveSessionState()
}

/**
 * End the current session
 * Called by popup "End Session" button or when meeting ends
 */
async function endCurrentSession () {
  if (currentSession.state === SESSION_STATE.IDLE) {
    console.log('📦 No active session to end')
    return
  }

  console.log(`🛑 Ending session for ${currentSession.meetCode}`)
  currentSession.state = SESSION_STATE.ENDING
  await saveSessionState()

  // Clear session state
  await clearSessionState()

  // Clear host lock
  unlockHostIdentity('session_ended')

  console.log('📦 Session ended and cleared')
}

/**
 * Check if we can start a new session (single session safety)
 * @param {string} meetCode - The meet code to check
 * @returns {boolean} True if a new session can be started
 */
async function canStartNewSession (meetCode) {
  // If no active session, allow
  if (currentSession.state !== SESSION_STATE.ACTIVE) {
    return true
  }

  // If same meeting, allow (continuing session)
  if (currentSession.meetCode === meetCode) {
    return true
  }

  // Different meeting with active session - block
  console.warn(`⚠️ BLOCKED: Cannot start session for ${meetCode}`)
  console.warn(`   Active session exists for ${currentSession.meetCode}`)
  return false
}

/**
 * Check if token is expired (30-minute TTL)
 * @param {Object} tokenData - Token data with expiresAt field
 * @returns {boolean} True if token is expired
 */
function isTokenExpired (tokenData) {
  if (!tokenData || !tokenData.expiresAt) {
    return true // No token or no expiry = expired
  }

  const expiresAt = new Date(tokenData.expiresAt).getTime()
  const now = Date.now()
  const isExpired = now >= expiresAt

  if (isExpired) {
    console.log(
      `⏰ Token expired at ${new Date(expiresAt).toLocaleTimeString()}`
    )
  }

  return isExpired
}

/**
 * Check if token should be regenerated
 * Only regenerate if no active session OR token is expired
 * Reserved for future use in token auto-regeneration
 * @param {Object} tokenData - Current token data
 * @param {string} meetCode - Current meet code
 * @returns {boolean} True if token should be regenerated
 */
function _shouldRegenerateToken (tokenData, meetCode) {
  // If session is active with valid token, don't regenerate
  if (
    currentSession.state === SESSION_STATE.ACTIVE &&
    currentSession.meetCode === meetCode &&
    currentSession.tokenId
  ) {
    if (!isTokenExpired(tokenData)) {
      console.log('🔐 Token still valid for active session - not regenerating')
      return false
    }
  }

  // Token is missing or expired - should regenerate
  return !tokenData || isTokenExpired(tokenData)
}

// Initialize: Load session state on script load
setTimeout(async () => {
  await loadSessionState()
}, 150)

/**
 * Check if a participant matches the locked host identity
 * Uses strict matching to avoid false positives
 * @param {Object} participant - Participant to check
 * @returns {boolean} True if matches locked host
 */
function matchesLockedHost (participant) {
  if (!lockedHost.name && !lockedHost.avatarUrl) return false

  // Primary match: avatarUrl (most reliable - unique identifier)
  if (
    lockedHost.avatarUrl &&
    participant.avatarUrl &&
    lockedHost.avatarUrl === participant.avatarUrl
  ) {
    return true
  }

  // Secondary match: name (with strict fuzzy matching)
  if (lockedHost.name && participant.name) {
    const lockedNameLower = lockedHost.name.toLowerCase().trim()
    const participantNameLower = participant.name.toLowerCase().trim()

    // Exact match
    if (lockedNameLower === participantNameLower) return true

    // Remove common suffixes like "(Host)", "(You)", etc. and compare
    const cleanLocked = lockedNameLower.replace(/\s*\([^)]*\)\s*$/g, '').trim()
    const cleanParticipant = participantNameLower
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .trim()

    if (cleanLocked === cleanParticipant && cleanLocked.length > 3) return true

    // Stricter fuzzy: Only match if one is a prefix AND they share the same avatar structure
    // This handles cases like "John Doe" appearing as "John Doe (Presenting)"
    if (lockedHost.avatarUrl && participant.avatarUrl) {
      // Both have avatars but different - different people
      if (lockedHost.avatarUrl !== participant.avatarUrl) return false
    }

    // Name prefix match only if names are substantially similar (>80% overlap)
    if (cleanLocked.length > 5 && cleanParticipant.length > 5) {
      const shorter =
        cleanLocked.length < cleanParticipant.length
          ? cleanLocked
          : cleanParticipant
      const longer =
        cleanLocked.length >= cleanParticipant.length
          ? cleanLocked
          : cleanParticipant

      if (longer.startsWith(shorter) && shorter.length / longer.length > 0.8) {
        return true
      }
    }
  }

  return false
}

/**
 * Check if a participant matches the current candidate (for confirmation tracking)
 * @param {Object} participant - Participant to check
 * @returns {boolean} True if matches current candidate
 */
function matchesCandidate (participant) {
  if (!lockedHost.candidateName && !lockedHost.candidateAvatarUrl) return false

  // Avatar match is definitive
  if (
    lockedHost.candidateAvatarUrl &&
    participant.avatarUrl &&
    lockedHost.candidateAvatarUrl === participant.avatarUrl
  ) {
    return true
  }

  // Name match (exact or cleaned)
  if (lockedHost.candidateName && participant.name) {
    const candidateLower = lockedHost.candidateName.toLowerCase().trim()
    const participantLower = participant.name.toLowerCase().trim()

    if (candidateLower === participantLower) return true

    // Clean and compare
    const cleanCandidate = candidateLower
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .trim()
    const cleanParticipant = participantLower
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .trim()

    if (cleanCandidate === cleanParticipant && cleanCandidate.length > 3)
      return true
  }

  return false
}

/**
 * Lock a participant as the host
 * Also starts a recording session when host is detected (instructor joins)
 * @param {Object} participant - Participant to lock as host
 * @param {string} meetCode - Current meeting code
 */
function lockHostIdentity (participant, meetCode) {
  lockedHost = {
    name: participant.name,
    avatarUrl: participant.avatarUrl,
    lockedAt: Date.now(),
    meetCode: meetCode,
    confirmationCount: HOST_CONFIRMATION_THRESHOLD,
    missedCount: 0,
    candidateName: null, // Clear candidate tracking
    candidateAvatarUrl: null
  }

  // Persist to localStorage
  saveLockedHostState()

  console.log(
    `🔒 HOST LOCKED: "${
      participant.name
    }" (avatar: ${participant.avatarUrl?.substring(0, 50)}...)`
  )

  // SESSION STATE MACHINE: Start session when instructor (host) is detected
  // This triggers token auto-regeneration if needed
  startSession(meetCode)
    .then(started => {
      if (started) {
        console.log(
          '🎬 Recording session started automatically when host joined'
        )
        // Update session with host name
        currentSession.hostName = participant.name
        saveSessionState()
      }
    })
    .catch(err => {
      console.error('Failed to start session:', err)
    })
}

/**
 * Unlock the current host (they left the meeting)
 * @param {string} reason - Reason for unlocking
 */
function unlockHostIdentity (reason = 'unknown') {
  if (lockedHost.name || lockedHost.avatarUrl) {
    console.log(`🔓 HOST UNLOCKED: "${lockedHost.name}" - Reason: ${reason}`)
  }
  lockedHost = {
    name: null,
    avatarUrl: null,
    lockedAt: null,
    meetCode: null,
    confirmationCount: 0,
    missedCount: 0,
    candidateName: null,
    candidateAvatarUrl: null
  }

  // Clear from localStorage
  clearLockedHostState()
}

/**
 * Check if host identity is currently locked
 * @returns {boolean} True if a host is locked
 */
function isHostLocked () {
  return Boolean(lockedHost.name || lockedHost.avatarUrl)
}

// ========================================================================
// WAITING ROOM HOST DETECTION SYSTEM
// Detects and locks the host identity from the waiting room/lobby page
// BEFORE the meeting starts, using the user's own name display
// DOM Structure: div.KASjse > ... > div.MJ4T8e (contains name)
// ========================================================================

// Cache for waiting room detection to prevent redundant DOM queries
let waitingRoomCheckCache = {
  lastCheck: 0,
  isWaitingRoom: false,
  hostName: null,
  checkInterval: 500 // Check every 500ms max
}

/**
 * Check if user is currently in the Google Meet waiting room/lobby
 * The waiting room appears before joining the meeting
 * @returns {boolean} True if in waiting room
 */
function isInWaitingRoom () {
  try {
    const now = Date.now()
    // Use cache if recent check
    if (
      now - waitingRoomCheckCache.lastCheck <
      waitingRoomCheckCache.checkInterval
    ) {
      return waitingRoomCheckCache.isWaitingRoom
    }

    // Waiting room indicators:
    // 1. The KASjse container with the user's name
    // 2. "Ready to join?" or similar text
    // 3. "Ask to join" or "Join now" buttons
    // 4. Absence of participant list (meeting not started yet)

    // Primary check: Look for the waiting room name container
    const nameContainer = document.querySelector('div.KASjse div.MJ4T8e')

    // Secondary check: Look for waiting room specific elements
    const hasJoinButton =
      document.querySelector('[data-mdc-dialog-action="join"]') ||
      document.querySelector('[aria-label*="Join now"]') ||
      document.querySelector('[aria-label*="Ask to join"]') ||
      document.querySelector('button[jsname="Qx7uuf"]') // Common join button

    // Check for "Ready to join?" text
    const hasReadyText = Array.from(
      document.querySelectorAll('div, span')
    ).some(el => el.textContent && el.textContent.includes('Ready to join'))

    // Check for preview/lobby elements (camera preview before joining)
    const hasPreviewElements =
      document.querySelector('[data-call-state="prejoin"]') ||
      document.querySelector('[data-promo-anchor-id="gDjiae"]')

    // NOT in waiting room if we see participant list (meeting already started)
    const hasParticipantList =
      document.querySelector('[data-participant-id]') ||
      document.querySelector('[data-self-name]')

    const isWaiting =
      nameContainer &&
      (hasJoinButton || hasReadyText || hasPreviewElements) &&
      !hasParticipantList

    // Update cache
    waitingRoomCheckCache.lastCheck = now
    waitingRoomCheckCache.isWaitingRoom = isWaiting

    if (isWaiting) {
      console.log('🚪 Detected: In waiting room/lobby')
    }

    return isWaiting
  } catch (e) {
    console.warn('Error checking waiting room state:', e)
    return false
  }
}

/**
 * Get the host's name from the waiting room DOM
 * DOM Structure: div.KASjse > ... > div.MJ4T8e (contains name)
 * @returns {string|null} Host name or null if not found
 */
function getWaitingRoomHostName () {
  try {
    // Primary selector: The name element in the waiting room
    // Based on user-provided DOM: div.KASjse contains div.MJ4T8e with the name
    const nameElement = document.querySelector('div.KASjse div.MJ4T8e')

    if (nameElement) {
      const name = nameElement.textContent?.trim()
      if (name && name.length > 0) {
        console.log(`👤 Found waiting room name: "${name}"`)
        waitingRoomCheckCache.hostName = name
        return name
      }
    }

    // Fallback: Try alternative selectors for the name
    const altSelectors = [
      'div.awLEm div.MJ4T8e', // Inside awLEm container
      'div.WN77kc div.MJ4T8e', // Inside WN77kc container
      '[data-promo-anchor-id="gDjiae"] div.MJ4T8e' // Inside promo anchor
    ]

    for (const selector of altSelectors) {
      const el = document.querySelector(selector)
      if (el) {
        const name = el.textContent?.trim()
        if (name && name.length > 0) {
          console.log(`👤 Found waiting room name (alt): "${name}"`)
          waitingRoomCheckCache.hostName = name
          return name
        }
      }
    }

    return null
  } catch (e) {
    console.warn('Error getting waiting room host name:', e)
    return null
  }
}

/**
 * Lock the host identity from the waiting room
 * This is called BEFORE the meeting starts to pre-lock the host
 * @returns {boolean} True if host was locked from waiting room
 */
function lockHostFromWaitingRoom () {
  try {
    // Only proceed if not already locked
    if (isHostLocked()) {
      console.log('🔒 Host already locked, skipping waiting room detection')
      return false
    }

    // Check if we're in the waiting room
    if (!isInWaitingRoom()) {
      return false
    }

    // Get the host name from waiting room
    const hostName = getWaitingRoomHostName()
    if (!hostName) {
      return false
    }

    // Get current meet code
    const meetCode = extractMeetCode()
    if (!meetCode) {
      console.warn('⚠️ Cannot lock host from waiting room - no meet code')
      return false
    }

    // Create a participant object for the host
    const hostParticipant = {
      name: hostName,
      avatarUrl: null, // We don't have avatar in waiting room
      isHost: true
    }

    // Lock the host identity
    lockHostIdentity(hostParticipant, meetCode)
    console.log(`🔒 PRE-LOCKED HOST FROM WAITING ROOM: "${hostName}"`)

    return true
  } catch (e) {
    console.warn('Error locking host from waiting room:', e)
    return false
  }
}

// ========================================================================
// END WAITING ROOM HOST DETECTION SYSTEM
// ========================================================================

/**
 * Increment host confirmation count (called when host detected)
 * Uses candidate tracking to ensure the same person reaches the confirmation threshold
 * @param {Object} participant - Detected host
 * @param {string} meetCode - Current meeting code
 * @returns {boolean} True if host should be locked after this increment
 */
function confirmHostDetection (participant, meetCode) {
  // If different meeting, reset everything
  if (lockedHost.meetCode && lockedHost.meetCode !== meetCode) {
    unlockHostIdentity('new_meeting')
  }

  // If already locked and same host, just reset missed count
  if (isHostLocked() && matchesLockedHost(participant)) {
    lockedHost.missedCount = 0
    saveLockedHostState() // Persist the reset
    return true
  }

  // If locked but DIFFERENT host detected, don't switch (locked host takes priority)
  if (isHostLocked() && !matchesLockedHost(participant)) {
    console.log(
      `⚠️ Different host detected ("${participant.name}") but "${lockedHost.name}" is locked as host`
    )
    return false
  }

  // ========================================================================
  // NOT LOCKED YET - Track candidate for confirmation
  // ========================================================================

  // Check if this is the same candidate we're tracking
  const isSameCandidate = matchesCandidate(participant)

  if (isSameCandidate) {
    // Same candidate - increment confirmation count
    lockedHost.confirmationCount++
    console.log(
      `👑 Host candidate: "${participant.name}" (${lockedHost.confirmationCount}/${HOST_CONFIRMATION_THRESHOLD})`
    )
  } else {
    // DIFFERENT candidate detected - reset and start tracking new one
    if (lockedHost.candidateName) {
      console.log(
        `🔄 New host candidate detected: "${participant.name}" (was tracking "${lockedHost.candidateName}")`
      )
    }
    lockedHost.confirmationCount = 1
    lockedHost.candidateName = participant.name
    lockedHost.candidateAvatarUrl = participant.avatarUrl
    lockedHost.meetCode = meetCode
    console.log(
      `👑 Host candidate: "${participant.name}" (${lockedHost.confirmationCount}/${HOST_CONFIRMATION_THRESHOLD})`
    )
  }

  // Check if threshold reached
  if (lockedHost.confirmationCount >= HOST_CONFIRMATION_THRESHOLD) {
    lockHostIdentity(participant, meetCode)
    return true
  }

  return false
}

/**
 * Called when locked host is not found in participant list
 * @returns {boolean} True if host should be unlocked (missed too many times)
 */
function incrementHostMissed () {
  if (!isHostLocked()) return false

  lockedHost.missedCount++

  // PERMANENT LOCK: If enabled, host is NEVER auto-unlocked
  // They stay as host for the entire session, even after leaving
  if (HOST_PERMANENT_LOCK) {
    console.log(
      `🔒 PERMANENT LOCK: Host "${lockedHost.name}" not found (${lockedHost.missedCount} misses) - staying locked as host`
    )
    // Mark that host has left but DON'T unlock
    if (!lockedHost.hasLeft) {
      lockedHost.hasLeft = true
      lockedHost.leftAt = new Date().toISOString()
      saveLockedHostState()
      console.log(
        `🚪 Host "${lockedHost.name}" marked as LEFT but remains locked as host`
      )
    }
    return false // Never unlock
  }

  // Legacy behavior (when HOST_PERMANENT_LOCK is false)
  console.log(
    `⚠️ Locked host "${lockedHost.name}" not found (${lockedHost.missedCount}/${HOST_MISSED_THRESHOLD})`
  )

  if (lockedHost.missedCount >= HOST_MISSED_THRESHOLD) {
    unlockHostIdentity('left_meeting')
    return true
  }

  return false
}

/**
 * Detect if user is on the Google Meet pre-join/waiting page
 * Pre-join page has: "Ready to join?" text, "Join now" button, no participants
 * @returns {boolean} true if on pre-join page
 */
function isOnPreJoinPage () {
  try {
    // Method 1: Check for "Ready to join?" heading
    const readyToJoinText = document.body?.innerText?.includes('Ready to join')

    // Method 2: Check for "Join now" button (primary indicator)
    const joinNowButton =
      document.querySelector('[jsname="Qx7uuf"] button') ||
      document.querySelector('button[jslog*="227430"]') ||
      Array.from(document.querySelectorAll('button')).find(
        btn => btn.textContent?.trim() === 'Join now'
      )

    // Method 3: Check for [data-is-prejoin="true"] attribute
    const prejoinElement = document.querySelector('[data-is-prejoin="true"]')

    // Method 4: Check for "No one else is here" status (specific to pre-join)
    const noOneHereText = document.body?.innerText?.includes(
      'No one else is here'
    )

    // Method 5: Check for in-call indicators (if found, NOT on pre-join)
    // In-call pages have the participants panel button or the main meeting UI
    const inCallIndicators =
      document.querySelector('[data-panel-id="1"]') || // Participants panel
      document.querySelector('[jscontroller="yTpiUb"]') || // Main call controls
      document.querySelector('.google-material-icons[data-icon-id="13"]') // End call button

    // If we have in-call indicators, we're NOT on pre-join
    if (inCallIndicators) {
      return false
    }

    // On pre-join if we have "Join now" button or "Ready to join" text
    const isPreJoin = !!(
      joinNowButton ||
      (readyToJoinText && noOneHereText) ||
      prejoinElement
    )

    return isPreJoin
  } catch (e) {
    console.warn('Error checking pre-join page:', e)
    return false
  }
}

/**
 * Wait for user to join the meeting before starting tracking
 * This prevents false "No participants found" warnings on pre-join page
 */
function waitForUserToJoinMeeting (callback) {
  if (waitingForUserToJoin) {
    console.log('⏳ Already waiting for user to join...')
    return
  }

  waitingForUserToJoin = true
  console.log('⏳ === WAITING FOR USER TO JOIN MEETING ===')
  console.log('   📍 User is on pre-join/waiting page')
  console.log('   💡 Tracking will start after clicking "Join now"')

  // Clear any existing interval
  if (preJoinCheckInterval) {
    clearInterval(preJoinCheckInterval)
  }

  // Check periodically if user has joined
  preJoinCheckInterval = setInterval(() => {
    if (!isOnPreJoinPage()) {
      // User has joined the meeting!
      console.log('✅ === USER HAS JOINED THE MEETING ===')
      console.log('   🚀 Starting attendance tracking now...')
      clearInterval(preJoinCheckInterval)
      preJoinCheckInterval = null
      waitingForUserToJoin = false

      // Small delay to let meeting UI load
      setTimeout(() => {
        callback()
      }, 2000)
    }
  }, PRE_JOIN_CHECK_INTERVAL_MS)

  // Safety timeout: if we're still waiting after 5 minutes, start tracking anyway
  setTimeout(() => {
    if (waitingForUserToJoin) {
      console.warn(
        '⚠️ Timeout waiting for user to join - starting tracking anyway'
      )
      if (preJoinCheckInterval) {
        clearInterval(preJoinCheckInterval)
        preJoinCheckInterval = null
      }
      waitingForUserToJoin = false
      callback()
    }
  }, 5 * 60 * 1000) // 5 minutes
}

// Helper function to check if error is extension context invalidation
function isExtensionContextInvalidated (error) {
  if (!error) return false
  const errorMsg = error.message || error.toString()
  return (
    errorMsg.includes('Extension context invalidated') ||
    errorMsg.includes('Extension context') ||
    errorMsg.includes('message channel closed') ||
    errorMsg.includes('message port closed')
  )
}

// Handle extension context invalidation gracefully
function handleExtensionContextInvalidation () {
  if (extensionContextInvalidated) return // Already handled

  extensionContextInvalidated = true

  // Stop all intervals and tracking
  if (tracking) {
    clearInterval(tracking)
    tracking = null
  }
  if (periodicObserverRetryInterval) {
    clearInterval(periodicObserverRetryInterval)
    periodicObserverRetryInterval = null
  }
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval)
    tokenRefreshInterval = null
  }
  if (periodicMeetingEndCheckInterval) {
    clearInterval(periodicMeetingEndCheckInterval)
    periodicMeetingEndCheckInterval = null
  }

  // Cleanup observers
  cleanupParticipantsObserver()
  cleanupMeetingEndListeners()

  // Show one-time notification
  if (!contextInvalidationNotified) {
    contextInvalidationNotified = true
    console.warn('⚠️ ============================================')
    console.warn('⚠️ Extension context invalidated')
    console.warn('⚠️ The extension was reloaded or updated')
    console.warn('⚠️ Please reload this page to resume tracking')
    console.warn('⚠️ ============================================')

    // Try to show a visual notification
    try {
      const message =
        'NE-Attend extension was reloaded. Please refresh the page to resume attendance tracking.'
      if (typeof alert !== 'undefined') {
        // Only show alert once per page load
        setTimeout(() => alert(message), 1000)
      }
    } catch {
      // Silently fail if we can't show alert
    }
  }
}
let stopDebounceTimer = null // Debounce timer for stop() calls
const STOP_DEBOUNCE_MS = 2000 // 2 seconds debounce (default)
// Phase 1 Task 1: Different debounce delays for different event types
const STOP_DEBOUNCE_MS_CRITICAL = 200 // 200ms for critical events (pagehide, meeting end UI) - REDUCED for faster response
const STOP_DEBOUNCE_MS_NORMAL = 2000 // 2s for normal events (visibilitychange, host leave)
let leaveDialogButtonListeners = new Map() // Track click listeners on dialog buttons
let periodicMeetingEndCheckInterval = null // Phase 1 Task 1: Periodic check for meeting end (30s fallback)
const PERIODIC_MEETING_END_CHECK_MS = 30000 // 30 seconds
// Phase 1 Task 3: Retry mechanism for failed submissions
const RETRY_QUEUE_KEY = 'neattend_failed_submissions_queue'
const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAYS = [2000, 4000, 8000] // Exponential backoff: 2s, 4s, 8s
let retryQueueProcessing = false // Flag to prevent concurrent processing
const MEETING_STATUS_TIMEOUTS = {
  scraping: 30000, // 30 seconds max in scraping state
  active: 60000, // 60 seconds max in active state without data
  data_received: Infinity // No timeout for data_received (normal state)
}

// Warning throttling system - prevents duplicate console warnings
const warningThrottle = {
  timestamps: new Map(), // Map of warning key -> last timestamp
  intervals: new Map(), // Map of warning key -> throttle interval in ms
  defaultInterval: 30000, // Default: throttle to once per 30 seconds

  // Register a throttled warning
  warn: function (key, message, interval = null) {
    const now = Date.now()
    const throttleMs = interval || this.defaultInterval
    const lastTime = this.timestamps.get(key) || 0

    if (now - lastTime >= throttleMs) {
      this.timestamps.set(key, now)
      console.warn(message)
      return true // Warning was logged
    }
    return false // Warning was throttled
  },

  // Check if a warning should be logged (without logging)
  shouldLog: function (key, interval = null) {
    const now = Date.now()
    const throttleMs = interval || this.defaultInterval
    const lastTime = this.timestamps.get(key) || 0
    return now - lastTime >= throttleMs
  },

  // Clear throttling for a specific key (useful when state changes)
  clear: function (key) {
    this.timestamps.delete(key)
  },

  // Clear all throttling
  clearAll: function () {
    this.timestamps.clear()
  }
}

// Credential state cache to prevent repeated failed lookups
let credentialStateCache = {
  lastCheck: 0,
  lastResult: null, // null = no credentials, object = credentials found
  checkInterval: 5000, // REDUCED: Only check every 5 seconds when missing (was 30s)
  consecutiveFailures: 0 // Track consecutive failures for exponential backoff
}

// Token retrieval state
let tokenCache = null // Cache for successful token lookups
let tokenCacheTime = 0 // Timestamp when token was cached
const TOKEN_CACHE_TTL = 30000 // Cache token for 30 seconds
let _tokenRetryInProgress = false // Reserved for future use - Prevent duplicate retries
let tokenRefreshInterval = null // Interval for periodic token checks
const TOKEN_REFRESH_INTERVAL = 15000 // Check for token every 15 seconds
let lastTokenCheckResult = null // Track last token check result

// Real-time connection monitoring
// Note: Full Socket.IO integration requires bundling socket.io-client library
// Current implementation uses optimized REST polling with health monitoring
let connectionHealth = {
  lastSuccessfulRequest: 0,
  consecutiveFailures: 0,
  isHealthy: true,
  backendReachable: false
}
const CONNECTION_CHECK_INTERVAL = 60000 // Check connection health every 60s
const MAX_CONSECUTIVE_FAILURES = 3

// Retry queue configuration (legacy - kept for backward compatibility with old retry queue functions)
// Note: New retry queue system uses RETRY_QUEUE_KEY from line 85 ('neattend_failed_submissions_queue')
const RETRY_BACKOFF_BASE = 2000 // 2 seconds
const MAX_QUEUE_SIZE = 50 // Maximum number of failed requests to queue
const RETRY_INTERVAL = 30000 // Check retry queue every 30 seconds

// Configuration management - uses centralized config.js module
// _getConfig() is provided by config.js loaded before this script via window.neattendConfig
// We use a helper function to get the config getter to avoid redeclaration issues
function getConfigFn () {
  // Use centralized config module if available (loaded from config.js)
  if (window.neattendConfig?.getConfig) {
    return window.neattendConfig.getConfig
  }
  // Fallback if config.js not loaded
  const CONFIG_KEY = 'neattend_config'
  const DEFAULT_CONFIG = {
    frontendUrl: 'http://localhost:5173',
    backendUrl: 'http://localhost:8000'
  }
  return async function () {
    return new Promise(resolve => {
      if (
        typeof chrome !== 'undefined' &&
        chrome.storage &&
        chrome.storage.sync
      ) {
        chrome.storage.sync.get([CONFIG_KEY], result => {
          resolve({ ...DEFAULT_CONFIG, ...(result[CONFIG_KEY] || {}) })
        })
      } else {
        resolve(DEFAULT_CONFIG)
      }
    })
  }
}

// Get config function reference (avoids const redeclaration with config.js)
const _getConfig = getConfigFn()

// Retry queue management functions
async function addToRetryQueue (payload, endpoint, type = 'progress') {
  try {
    const queue = await getRetryQueue()

    // Limit queue size to prevent memory issues
    if (queue.length >= MAX_QUEUE_SIZE) {
      console.warn('⚠️ Retry queue full, removing oldest entry')
      queue.shift()
    }

    const entry = {
      id: `retry_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      payload,
      endpoint,
      type,
      attempts: 0,
      createdAt: Date.now(),
      nextRetryAt: Date.now() + RETRY_BACKOFF_BASE
    }

    queue.push(entry)
    await saveRetryQueue(queue)
    console.log('📝 Added to retry queue:', entry.id)
  } catch (error) {
    console.error('❌ Failed to add to retry queue:', error)
  }
}

async function getRetryQueue () {
  return new Promise(resolve => {
    chrome.storage.local.get([RETRY_QUEUE_KEY], result => {
      const queue = result[RETRY_QUEUE_KEY] || []
      resolve(Array.isArray(queue) ? queue : [])
    })
  })
}

async function saveRetryQueue (queue) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [RETRY_QUEUE_KEY]: queue }, () => {
      resolve()
    })
  })
}

async function processRetryQueue () {
  try {
    const queue = await getRetryQueue()
    const now = Date.now()
    const updatedQueue = []
    let successCount = 0
    let failCount = 0

    for (const entry of queue) {
      // Skip if not ready for retry yet
      if (entry.nextRetryAt > now) {
        updatedQueue.push(entry)
        continue
      }

      // Skip if too many attempts
      if (entry.attempts >= MAX_RETRY_ATTEMPTS) {
        console.warn('⚠️ Max retry attempts reached for:', entry.id)
        failCount++
        continue
      }

      // Attempt to send
      try {
        const config = await _getConfig()
        // Use safeFetch to handle Chrome's local network request restrictions
        const safeFetchFn = window.safeFetch || globalThis.safeFetch || fetch
        const response = await safeFetchFn(
          `${config.backendUrl}/api/attendance/${entry.endpoint}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry.payload)
          }
        )

        if (response.ok) {
          console.log('✅ Retry successful:', entry.id)
          successCount++
          // Don't add back to queue - success
        } else {
          // Retry failed, increment attempts and backoff
          entry.attempts++
          entry.nextRetryAt =
            now + RETRY_BACKOFF_BASE * Math.pow(2, entry.attempts)
          updatedQueue.push(entry)
          failCount++
          console.warn(
            `⚠️ Retry failed (attempt ${entry.attempts}/${MAX_RETRY_ATTEMPTS}):`,
            entry.id
          )
        }
      } catch (error) {
        // Network error, retry with backoff
        entry.attempts++
        entry.nextRetryAt =
          now + RETRY_BACKOFF_BASE * Math.pow(2, entry.attempts)
        updatedQueue.push(entry)
        failCount++

        // Enhanced error handling for blocked network requests
        const errorMessage = error.message || String(error)
        if (
          errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('network') ||
          errorMessage.includes('CORS')
        ) {
          console.warn(
            `⚠️ Retry error (possible local network blocking):`,
            entry.id,
            errorMessage
          )
          console.warn(
            '   💡 Ensure Chrome allows local network requests or use targetAddressSpace option'
          )
        } else {
          console.error('❌ Retry error:', entry.id, error.message)
        }
      }
    }

    await saveRetryQueue(updatedQueue)

    if (successCount > 0 || failCount > 0) {
      console.log(
        `🔄 Retry queue processed: ${successCount} successful, ${failCount} failed, ${updatedQueue.length} remaining`
      )
    }
  } catch (error) {
    console.error('❌ Error processing retry queue:', error)
  }
}

// Start retry queue processor - MOVED: Now starts conditionally in startHealthMonitoring()
// setInterval(processRetryQueue, RETRY_INTERVAL) - Disabled: was blocking page load

// Track if health monitoring has started
let healthMonitoringStarted = false

// Start health monitoring only when needed (on actual meeting pages)
function startHealthMonitoring () {
  if (healthMonitoringStarted) return
  if (!isOnMeetPage()) return

  healthMonitoringStarted = true
  console.log('🏥 Starting health monitoring for meeting page')

  // Start retry queue processor (runs every 30s)
  setInterval(processRetryQueue, RETRY_INTERVAL)

  // Start connection health monitoring (runs every 60s)
  setInterval(checkConnectionHealth, CONNECTION_CHECK_INTERVAL)

  // Initial health check after short delay
  setTimeout(checkConnectionHealth, 2000)
}

// Connection health monitoring
async function checkConnectionHealth () {
  try {
    const config = await _getConfig()
    // Use safeFetch to handle Chrome's local network request restrictions
    const safeFetchFn = window.safeFetch || globalThis.safeFetch || fetch
    const response = await safeFetchFn(`${config.backendUrl}/api/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })

    if (response.ok) {
      connectionHealth.lastSuccessfulRequest = Date.now()
      connectionHealth.consecutiveFailures = 0
      connectionHealth.isHealthy = true
      connectionHealth.backendReachable = true
      updateStatusBadge('🟢 NE-Attend Connected', 'green')
    } else {
      throw new Error(`Health check failed: ${response.status}`)
    }
  } catch (error) {
    connectionHealth.consecutiveFailures++
    connectionHealth.backendReachable = false

    // Enhanced error handling for blocked network requests
    const errorMessage = error.message || String(error)
    if (
      errorMessage.includes('Failed to fetch') ||
      errorMessage.includes('network') ||
      errorMessage.includes('CORS')
    ) {
      console.warn(
        '⚠️ Connection health check failed - possible local network request blocking:',
        errorMessage
      )
      console.warn(
        '   💡 Ensure Chrome allows local network requests or use targetAddressSpace option'
      )
    }

    if (connectionHealth.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      connectionHealth.isHealthy = false
      updateStatusBadge('🔴 NE-Attend Offline', 'red')
      showNotification(
        'Cannot reach NE-Attend backend. Attendance data will be queued.',
        'warning'
      )
    }

    console.warn('Connection health check failed:', error)
  }
}

// Start connection monitoring - MOVED: Now starts conditionally in startHealthMonitoring()
// setInterval(checkConnectionHealth, CONNECTION_CHECK_INTERVAL) - Disabled: was blocking page load
// setTimeout(checkConnectionHealth, 2000) - Disabled: was blocking page load

// Helper function to show user notifications
function showNotification (message, type = 'info') {
  // Throttle notifications to prevent spam (max 1 every 10 seconds)
  const now = Date.now()
  if (now - lastErrorNotification < 10000 && type === 'error') {
    console.log('⚠️ Notification throttled:', message)
    return
  }

  if (type === 'error' || type === 'warning') {
    lastErrorNotification = now
  }

  // Try to use Chrome notifications API if available
  if (chrome.notifications && chrome.notifications.create) {
    const iconUrl =
      type === 'error' ? 'icons/mac-logo-128.png' : 'icons/mac-logo-128.png'
    chrome.notifications.create(
      {
        type: 'basic',
        iconUrl: iconUrl,
        title:
          type === 'error'
            ? '❌ NE-Attend Error'
            : type === 'warning'
            ? '⚠️ NE-Attend Warning'
            : 'ℹ️ NE-Attend',
        message: message,
        priority: type === 'error' ? 2 : 1
      },
      _notificationId => {
        if (chrome.runtime.lastError) {
          console.warn(
            'Could not create notification:',
            chrome.runtime.lastError
          )
        }
      }
    )
  }

  // Also log to console
  if (type === 'error') {
    console.error('❌', message)
  } else if (type === 'warning') {
    console.warn('⚠️', message)
  } else {
    console.log('ℹ️', message)
  }
}

function padTime (value) {
  return String(value).padStart(2, '0')
}

function formatTimeHMS (date) {
  if (!(date instanceof Date) || isNaN(date)) return '00:00:00'
  return `${padTime(date.getHours())}:${padTime(date.getMinutes())}:${padTime(
    date.getSeconds()
  )}`
}

// MutationObserver for efficient DOM monitoring
let participantsObserver = null
let participantsContainer = null
const OBSERVER_DEBOUNCE_MS = 500
let observerDebounceTimer = null
let observerSetupAttempted = false // Prevent duplicate setup attempts
let observerSetupWarningLogged = false // Track if warning was already logged

// Setup MutationObserver for participant list
function setupParticipantsObserver () {
  // Prevent duplicate setup attempts
  if (participantsObserver && participantsContainer) {
    return true // Already set up
  }

  // Try to find the participants container with multiple modern selectors
  const possibleContainers = [
    // Modern Google Meet selectors (updated Nov 2025)
    // Priority 0: Nov 2025 side panel and list structure
    document.querySelector('aside#ME4pNd'), // Nov 2025: Side panel container
    document.querySelector('aside.R3Gmyc.P9KVBf'), // Nov 2025: Side panel by classes
    document.querySelector('div[role="list"][aria-label="Participants"]'), // Nov 2025: Participant list
    document.querySelector('div.AE8xFb.OrqRRb.GvcuGe.goTdfd[role="list"]'), // Nov 2025: List specific classes
    // Priority 1: Participant list with classes (Jan 2025)
    document.querySelector(
      'div[role="list"][jsname="jrQDbd"].AE8xFb.OrqRRb.GvcuGe.goTdfd'
    ),
    document.querySelector(
      'div[role="list"][jsname="jrQDbd"][class*="AE8xFb"][class*="OrqRRb"]'
    ),
    // Priority 2: Contributors section (contains participant list)
    document.querySelector('div.oEJUQb.sMVRZe'),
    // Priority 3: Main container (fallback)
    document.querySelector('div.m3Uzve.RJRKn'),
    // Existing selectors (backward compatibility)
    document.querySelector('div[data-panel-id="people"]'),
    document.querySelector('div[jsname*="participants"]'),
    document.querySelector('div[jsname*="Participants"]'),
    document.querySelector('div[jsname="jrQDbd"]'), // Explicit check for jrQDbd
    document.querySelector('div[jsname*="PeoplePanel"]'),
    document.querySelector('div[jsname*="people-panel"]'),
    document.querySelector('aside[data-panel-id="people"]'),
    document.querySelector('div[data-panel-type="people"]'),
    document.querySelector('div[role="complementary"][aria-label*="People"]'),
    document.querySelector('section[aria-label*="Participants"]'),
    document.querySelector('[role="list"][data-panel-id="people"]'),
    document.querySelector('[role="list"][aria-label*="People"]'),
    document.querySelector('[role="list"][aria-label*="Participants"]'),
    document.querySelector('[role="list"][aria-label*="participants"]'),
    // Fallback selectors
    document.querySelector('[role="list"]'),
    document.querySelector('[aria-label*="Participants"]'),
    document.querySelector('[aria-label*="People"]'),
    document.querySelector('.z38b6'), // Legacy fallback class
    // Additional fallbacks
    document.querySelector('div[aria-label*="People"][role="list"]'),
    document.querySelector('div[aria-label*="Participants"][role="list"]')
  ].filter(Boolean)

  // Try visible containers first, but don't require visibility
  // (containers may exist in DOM but be hidden, and we still want to observe them)
  const visibleContainers = possibleContainers.filter(container => {
    try {
      return container && container.offsetParent !== null
    } catch {
      return false
    }
  })

  // Prefer visible containers, but use any container if visible ones aren't found
  // This is important because sometimes the panel exists in DOM but isn't visible yet
  participantsContainer = visibleContainers[0] || possibleContainers[0]

  if (participantsContainer) {
    const containerInfo = {
      tag: participantsContainer.tagName,
      classes: participantsContainer.className || 'no class',
      dataPanelId:
        participantsContainer.getAttribute('data-panel-id') || 'none',
      jsname: participantsContainer.getAttribute('jsname') || 'none',
      role: participantsContainer.getAttribute('role') || 'none',
      visible: participantsContainer.offsetParent !== null
    }
    console.log('✅ Found potential container:', containerInfo)
    console.log(
      `   📍 Container location: ${
        containerInfo.visible ? 'Visible' : 'Hidden but in DOM'
      }`
    )
  }

  if (!participantsContainer) {
    // Try dynamic discovery - look for containers that might contain participant lists
    // First, check for Nov 2025 Google Meet structure
    const nov2025Lists = document.querySelectorAll(
      'div[role="list"][aria-label="Participants"]'
    )
    for (const list of nov2025Lists) {
      const hasParticipantItems =
        list.querySelectorAll('[role="listitem"]').length > 0
      if (hasParticipantItems) {
        participantsContainer = list
        console.log(
          '🔍 Found participants container via Nov 2025 structure (aria-label="Participants")'
        )
        break
      }
    }

    // Second, check for Jan 2025 Google Meet structure classes
    if (!participantsContainer) {
      const newStructureLists = document.querySelectorAll(
        '[role="list"][jsname="jrQDbd"]'
      )
      for (const list of newStructureLists) {
        // Check if it has the new classes
        const hasNewClasses =
          list.classList.contains('AE8xFb') &&
          list.classList.contains('OrqRRb') &&
          list.classList.contains('GvcuGe') &&
          list.classList.contains('goTdfd')
        const hasParticipantIndicators =
          list.querySelectorAll(
            '[data-participant-id], [data-participant], [data-self-name], [role="listitem"]'
          ).length > 0
        if (hasNewClasses || hasParticipantIndicators) {
          participantsContainer = list
          console.log(
            '🔍 Found participants container via Jan 2025 structure classes (AE8xFb OrqRRb GvcuGe goTdfd)'
          )
          break
        }
      }
    }

    // Fallback: try all lists and check for participant indicators
    if (!participantsContainer) {
      const allLists = document.querySelectorAll('[role="list"]')
      for (const list of allLists) {
        // Check if this list might contain participants by looking for images/avatars
        const hasImages =
          list.querySelectorAll(
            'img[src*="googleusercontent"], img[src*="profile"]'
          ).length > 0
        const hasParticipantIndicators =
          list.querySelectorAll(
            '[data-participant-id], [data-participant], [data-self-name]'
          ).length > 0
        if (hasImages || hasParticipantIndicators) {
          participantsContainer = list
          console.log(
            '🔍 Found participants container via dynamic discovery (list with images/indicators)'
          )
          break
        }
      }
    }
  }

  // Enhanced dynamic discovery - check for jsname patterns and data attributes
  if (!participantsContainer) {
    // Look for elements with jsname containing panel/list/container keywords
    const jsnamePatterns = [
      'panel',
      'list',
      'container',
      'people',
      'participants'
    ]
    for (const pattern of jsnamePatterns) {
      const elements = document.querySelectorAll(
        `[jsname*="${pattern}" i], [jsname*="${
          pattern.charAt(0).toUpperCase() + pattern.slice(1)
        }"]`
      )
      for (const el of elements) {
        // Check if it has participant indicators
        const hasParticipantIndicators =
          el.querySelectorAll(
            '[data-participant-id], [data-participant], [data-self-name], [role="listitem"]'
          ).length > 0
        const hasImages =
          el.querySelectorAll(
            'img[src*="googleusercontent"], img[src*="profile"]'
          ).length > 0
        if (hasParticipantIndicators || hasImages) {
          participantsContainer = el
          console.log(
            `🔍 Found participants container via jsname pattern: ${pattern}`
          )
          break
        }
      }
      if (participantsContainer) break
    }
  }

  // Check for data-panel-id or data-panel-type attributes
  if (!participantsContainer) {
    const panelElements = document.querySelectorAll(
      '[data-panel-id], [data-panel-type]'
    )
    for (const el of panelElements) {
      const panelId =
        el.getAttribute('data-panel-id') ||
        el.getAttribute('data-panel-type') ||
        ''
      if (
        panelId.toLowerCase().includes('people') ||
        panelId.toLowerCase().includes('participant')
      ) {
        const hasContent = el.querySelector(
          '[role="listitem"], div[data-participant-id]'
        )
        if (hasContent) {
          participantsContainer = el
          console.log(
            '🔍 Found participants container via data-panel attribute'
          )
          break
        }
      }
    }
  }

  // Check for role="complementary" or role="region" with participant indicators
  if (!participantsContainer) {
    const regions = document.querySelectorAll(
      '[role="complementary"], [role="region"]'
    )
    for (const region of regions) {
      const ariaLabel = (region.getAttribute('aria-label') || '').toLowerCase()
      if (ariaLabel.includes('people') || ariaLabel.includes('participant')) {
        const hasContent = region.querySelector(
          '[role="listitem"], div[data-participant-id], [jsname*="participant"]'
        )
        if (hasContent) {
          participantsContainer = region
          console.log(
            '🔍 Found participants container via role="complementary"/"region"'
          )
          break
        }
      }
    }
  }

  // If still not found, try finding containers by looking for elements that contain participant items
  if (!participantsContainer) {
    // Find any div that contains participant-like elements
    const participantItems = document.querySelectorAll(
      '[role="listitem"], div[data-participant-id], div[jsname*="participant"], div[data-self-name]'
    )
    if (participantItems.length > 0) {
      // Find the common parent of these items
      let commonParent = participantItems[0]
      for (let i = 1; i < participantItems.length; i++) {
        let current = participantItems[i]
        // Find common ancestor
        while (current && !commonParent.contains(current)) {
          current = current.parentElement
        }
        if (current) {
          commonParent = current
        }
      }
      // Walk up to find a suitable container (list or div with role="list")
      while (commonParent && commonParent !== document.body) {
        const role = commonParent.getAttribute('role')
        const jsname = commonParent.getAttribute('jsname') || ''
        const dataPanelId = commonParent.getAttribute('data-panel-id') || ''
        const dataPanelType = commonParent.getAttribute('data-panel-type') || ''

        // Check for new structure classes
        const hasNewClasses =
          commonParent.classList.contains('AE8xFb') ||
          commonParent.classList.contains('OrqRRb') ||
          commonParent.classList.contains('oEJUQb') ||
          commonParent.classList.contains('sMVRZe') ||
          commonParent.classList.contains('m3Uzve') ||
          commonParent.classList.contains('RJRKn')

        if (
          role === 'list' ||
          role === 'complementary' ||
          role === 'region' ||
          role === 'dialog' ||
          commonParent.classList.contains('z38b6') ||
          hasNewClasses ||
          jsname.toLowerCase().includes('panel') ||
          jsname.toLowerCase().includes('list') ||
          jsname.toLowerCase().includes('container') ||
          jsname === 'jrQDbd' ||
          dataPanelId.toLowerCase().includes('people') ||
          dataPanelType.toLowerCase().includes('people') ||
          commonParent.querySelector('[role="listitem"]')
        ) {
          participantsContainer = commonParent
          console.log(
            '🔍 Found participants container via parent traversal' +
              (hasNewClasses ? ' (new structure detected)' : '')
          )
          break
        }
        commonParent = commonParent.parentElement
      }
    }
  }

  // Last resort: find any container that has participant list items as direct or indirect children
  if (!participantsContainer) {
    // Look for divs that contain listitems with images (likely participant containers)
    const allDivs = document.querySelectorAll('div')
    for (const div of allDivs) {
      const listItems = div.querySelectorAll('[role="listitem"]')
      if (listItems.length > 0) {
        // Check if any of these list items have participant-like content
        let hasParticipants = false
        for (const item of listItems) {
          const hasImg = item.querySelector(
            'img[src*="googleusercontent"], img[src*="profile"]'
          )
          const hasName =
            item.textContent &&
            item.textContent.trim().length > 0 &&
            item.textContent.trim().length < 100
          if (hasImg && hasName) {
            hasParticipants = true
            break
          }
        }
        if (hasParticipants) {
          participantsContainer = div
          console.log('🔍 Found participants container via div search')
          break
        }
      }
    }
  }

  // Final fallback: if we still can't find a specific container, use document.body
  // This is less efficient but ensures the observer works
  if (!participantsContainer) {
    // Only use body as last resort if we're actually detecting participants
    const testMap = new Map()
    collectParticipantsInto(testMap)
    if (testMap.size > 0) {
      participantsContainer = document.body
      console.log(
        '⚠️ Using document.body as fallback container (participants are being detected)'
      )
    }
  }

  if (!participantsContainer) {
    // Only log warning once, then throttle
    if (
      !observerSetupWarningLogged ||
      warningThrottle.shouldLog('observer_setup_failed', 60000)
    ) {
      warningThrottle.warn(
        'observer_setup_failed',
        '⚠️ Participants container not found for MutationObserver. Panel may not be open.',
        60000
      )
      console.warn('💡 Tip: Try opening the participants panel manually')
      console.warn(
        '💡 Note: Participant detection is still working via timer fallback'
      )
      console.warn('🔄 Will retry container detection periodically')
      observerSetupWarningLogged = true
    }

    // Schedule periodic retry if not already scheduled
    if (!periodicObserverRetryInterval) {
      let retryAttempts = 0
      const MAX_RETRY_ATTEMPTS = 10 // 10 attempts = 50 seconds (5s intervals)
      const RETRY_INTERVAL = 5000 // 5 seconds

      periodicObserverRetryInterval = setInterval(() => {
        retryAttempts++

        // Check if participants are being detected - if so, container should be findable
        const testMap = new Map()
        collectParticipantsInto(testMap)

        if (testMap.size > 0) {
          // Participants found, try to setup observer again
          console.log(
            `🔄 Retrying observer setup (attempt ${retryAttempts}/${MAX_RETRY_ATTEMPTS}) - ${testMap.size} participants detected`
          )
          const setupResult = setupParticipantsObserver()
          if (setupResult) {
            // Success! Clear the retry interval
            if (periodicObserverRetryInterval) {
              clearInterval(periodicObserverRetryInterval)
              periodicObserverRetryInterval = null
            }
            console.log('✅ Observer setup succeeded on retry')
            return
          }
        }

        // Stop retrying after max attempts
        if (retryAttempts >= MAX_RETRY_ATTEMPTS) {
          if (periodicObserverRetryInterval) {
            clearInterval(periodicObserverRetryInterval)
            periodicObserverRetryInterval = null
          }
          console.warn(
            `⚠️ Stopped retrying observer setup after ${MAX_RETRY_ATTEMPTS} attempts`
          )
        }
      }, RETRY_INTERVAL)
    }

    return false
  }

  // Container found - clear any retry interval if it exists
  if (periodicObserverRetryInterval) {
    clearInterval(periodicObserverRetryInterval)
    periodicObserverRetryInterval = null
  }

  // Disconnect existing observer if any (shouldn't happen, but safety check)
  if (participantsObserver) {
    participantsObserver.disconnect()
    participantsObserver = null
  }

  // Create new observer
  participantsObserver = new MutationObserver(_mutations => {
    // Debounce rapid changes
    clearTimeout(observerDebounceTimer)
    observerDebounceTimer = setTimeout(() => {
      console.log('📊 Participant list changed, collecting...')
      track_attendance()
    }, OBSERVER_DEBOUNCE_MS)
  })

  // Observe the container for changes
  try {
    participantsObserver.observe(participantsContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'class',
        'aria-label',
        'data-participant-id',
        'data-participant'
      ]
    })

    observerSetupAttempted = true
    observerSetupWarningLogged = false // Reset warning flag on success
    console.log('✅ MutationObserver setup for participant list')
    const containerDetails = {
      tag: participantsContainer.tagName,
      classes: participantsContainer.className || 'no class',
      dataPanelId:
        participantsContainer.getAttribute('data-panel-id') || 'none',
      jsname: participantsContainer.getAttribute('jsname') || 'none',
      role: participantsContainer.getAttribute('role') || 'none',
      visible: participantsContainer.offsetParent !== null
    }
    console.log('   📦 Container details:', containerDetails)
    console.log('   👁️ Observer will track: childList, subtree, attributes')
    return true
  } catch (e) {
    console.error('❌ Error setting up MutationObserver:', e)
    return false
  }
}

// Cleanup observer
function cleanupParticipantsObserver () {
  if (participantsObserver) {
    participantsObserver.disconnect()
    participantsObserver = null
  }
  if (observerDebounceTimer) {
    clearTimeout(observerDebounceTimer)
    observerDebounceTimer = null
  }
}

// Clean participant name by removing unwanted text patterns
function cleanParticipantName (name) {
  if (!name || typeof name !== 'string') {
    return ''
  }

  let cleaned = name.trim()

  // Remove "frame_person" (case-insensitive)
  cleaned = cleaned.replace(/frame_person/gi, '').trim()

  // Remove mic status messages (case-insensitive)
  cleaned = cleaned.replace(/your mic is off/gi, '').trim()
  cleaned = cleaned.replace(/mic is off/gi, '').trim()
  cleaned = cleaned.replace(/your microphone is off/gi, '').trim()
  cleaned = cleaned.replace(/microphone is off/gi, '').trim()
  cleaned = cleaned.replace(/mic off/gi, '').trim()

  // Remove other common unwanted patterns
  cleaned = cleaned.replace(/'s profile picture/gi, '').trim()
  cleaned = cleaned.replace(/profile picture/gi, '').trim()

  // Nov 2025: Remove "(You)" indicator from name
  cleaned = cleaned.replace(/\(You\)/gi, '').trim()

  // Remove "Meeting host" label if present
  cleaned = cleaned.replace(/Meeting host/gi, '').trim()

  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  return cleaned
}

// Robust participant scraper to tolerate Meet DOM changes
function collectParticipantsInto (mapRef) {
  mapRef.clear()
  let found = 0
  const debugInfo = { methods: [], found: 0, containerType: 'unknown' }

  // PRIORITY: Try Nov 2025 specific structure first (most reliable)
  const nov2025List = document.querySelector(
    'div[role="list"][aria-label="Participants"]'
  )
  if (nov2025List) {
    console.log('🎯 Using Nov 2025 participant list structure')
    const listitems = nov2025List.querySelectorAll('div[role="listitem"]')

    listitems.forEach(item => {
      try {
        // Get name from aria-label (most reliable in Nov 2025)
        let name = item.getAttribute('aria-label')

        // Get avatar from img.KjWwNd
        const avatarImg = item.querySelector('img.KjWwNd')
        const avatarUrl = avatarImg ? avatarImg.src : null

        // Fallback: try span.zWGUib for name if aria-label is missing
        if (!name || !name.trim()) {
          const nameSpan = item.querySelector('span.zWGUib')
          if (nameSpan) {
            name = nameSpan.textContent.trim()
          }
        }

        // Clean the name
        if (name) {
          name = cleanParticipantName(name)
        }

        // Only add if we have both avatar and name
        if (avatarUrl && name && name.length > 0) {
          mapRef.set(avatarUrl, name)
          found++
          console.log(`   ✓ Found: ${name}`)
        }
      } catch (e) {
        console.debug('Error processing Nov 2025 listitem:', e)
      }
    })

    if (found > 0) {
      console.log(`✅ Nov 2025 structure: Found ${found} participants`)
      debugInfo.methods.push(
        `Nov 2025 listitem structure: ${found} participants`
      )
      debugInfo.found = found
      debugInfo.containerType = 'nov2025-participant-list'
      return found
    }
  }

  // Fallback to comprehensive scraping if Nov 2025 method found nothing
  console.log('🔄 Falling back to comprehensive participant scraping...')

  // Method 1: Modern Google Meet - data attributes and jsname patterns
  // NEW: Prioritize contributors section context if available (updated Nov 2025)
  const contributorsSection = document.querySelector('div.oEJUQb.sMVRZe')
  const mainContainer = document.querySelector('div.m3Uzve.RJRKn')
  const participantList =
    document.querySelector('div[role="list"][aria-label="Participants"]') || // Nov 2025 structure
    document.querySelector('div.AE8xFb.OrqRRb.GvcuGe.goTdfd[role="list"]') || // Nov 2025 specific classes
    document.querySelector('div[role="list"][jsname="jrQDbd"]') // Legacy

  // Determine search context and log container type found
  let searchContext = document
  if (contributorsSection) {
    searchContext = contributorsSection
    debugInfo.containerType = 'contributors-section'
    console.log(
      '📦 Using contributors section (oEJUQb sMVRZe) as search context'
    )
  } else if (participantList) {
    searchContext = participantList
    debugInfo.containerType = 'participant-list'
    console.log('📦 Using participant list (jrQDbd) as search context')
  } else if (mainContainer) {
    searchContext = mainContainer
    debugInfo.containerType = 'main-container'
    console.log('📦 Using main container (m3Uzve RJRKn) as search context')
  } else {
    debugInfo.containerType = 'document'
    console.log(
      '📦 Using document as search context (no specific container found)'
    )
  }

  const modernSelectors = [
    // NEW: Explicit check for new Google Meet structure (January 2025)
    'div[role="listitem"].cxdMu.KV1GEc',
    'div.cxdMu.KV1GEc[role="listitem"]',
    'div.cxdMu.KV1GEc',
    // Existing selectors
    'div[data-participant-id]',
    'div[jsname*="participant"]',
    'div[jsname*="Participant"]',
    'div[jsname*="ParticipantItem"]',
    'div[jsname*="participant-item"]',
    '[role="listitem"][data-participant-id]',
    '[role="listitem"][jsname*="participant"]',
    'div[data-participant-id][role="listitem"]',
    'div[aria-label*="profile"][role="listitem"]',
    'div[data-self-name]',
    'div[data-participant]',
    'div[data-entity-id]'
  ]

  for (const selector of modernSelectors) {
    try {
      // NEW: Search within contributors section if available, otherwise search entire document
      let items = searchContext.querySelectorAll(selector)

      // If no items found in contributors section, try entire document as fallback
      if (items.length === 0 && contributorsSection) {
        items = document.querySelectorAll(selector)
        if (items.length > 0) {
          debugInfo.methods.push(
            `Modern selector (fallback to document): ${selector} (${items.length} items)`
          )
        }
      } else if (items.length > 0) {
        debugInfo.methods.push(
          `Modern selector${
            contributorsSection ? ' (in contributors section)' : ''
          }: ${selector} (${items.length} items)`
        )
      }

      if (items.length > 0) {
        items.forEach(item => {
          try {
            // Try to find avatar image with multiple patterns (updated Nov 2025)
            let img =
              item.querySelector('img.KjWwNd') || // Nov 2025 avatar class (priority)
              item.querySelector('img[data-profile-picture]') ||
              item.querySelector('img[alt*="profile"]') ||
              item.querySelector('img[alt*="Profile"]') ||
              item.querySelector('img[alt*="profile picture"]') ||
              item.querySelector('img[src*="googleusercontent"]') ||
              item.querySelector('img[src*="lh3.googleusercontent"]') ||
              item.querySelector('img[src*="photo"]') ||
              item.querySelector('img')

            // Check for CSS background images (avatars as background-image)
            if (!img || !img.src) {
              const bgDiv = item.querySelector('div[style*="background-image"]')
              if (bgDiv) {
                const bgStyle = bgDiv.getAttribute('style') || ''
                const urlMatch = bgStyle.match(/url\(['"]?([^'"]+)['"]?\)/)
                if (urlMatch && urlMatch[1]) {
                  // Create a temporary img-like object for consistency
                  img = { src: urlMatch[1], getAttribute: () => null }
                }
              }
            }

            // Check for SVG avatars
            if (!img || !img.src) {
              const svg = item.querySelector('svg[data-profile-picture]')
              if (svg) {
                // SVG avatars might have image elements inside
                const svgImg = svg.querySelector('image')
                if (svgImg && svgImg.getAttribute('href')) {
                  img = {
                    src: svgImg.getAttribute('href'),
                    getAttribute: () => null
                  }
                }
              }
            }

            // Try to find name with multiple patterns (updated Nov 2025)
            // NEW: Prioritize aria-label on listitem itself (most reliable in new DOM structure)
            let nameEl = null
            const itemAriaLabel = item.getAttribute('aria-label')
            if (
              itemAriaLabel &&
              itemAriaLabel.trim() &&
              !itemAriaLabel.match(
                /^(on|off|mute|unmute|video|camera|microphone|button|click)$/i
              )
            ) {
              // Use aria-label from listitem itself as primary source
              nameEl = {
                getAttribute: () => itemAriaLabel,
                textContent: itemAriaLabel
              }
            } else {
              // Fallback to other patterns (Nov 2025: prioritize span.zWGUib)
              nameEl =
                item.querySelector('span.zWGUib') || // Nov 2025: Primary name element
                item.querySelector('.jKwXVe span.zWGUib') || // Nov 2025: Name inside container
                item.querySelector('[data-self-name]') ||
                item.querySelector('[data-name]') ||
                item.querySelector('[data-profile-name]') ||
                item.querySelector('[data-display-name]') ||
                item.querySelector('div[data-self-name]') ||
                item.querySelector('div[data-display-name]') ||
                item.querySelector('span[data-name]') ||
                item.querySelector('div[jsname*="name"]') ||
                item.querySelector('span[jsname*="name"]') ||
                item.querySelector('[aria-label]:not([aria-label=""])')
            }

            // If no name element, try text content patterns
            if (!nameEl) {
              const textElements = item.querySelectorAll('span, div, p')
              for (const el of textElements) {
                const text = (el.textContent || '').trim()
                if (
                  text &&
                  text.length > 0 &&
                  text.length < 100 &&
                  !text.match(/^\d+$/) &&
                  !text.includes('@')
                ) {
                  nameEl = el
                  break
                }
              }
            }

            const avatarUrl = img && img.src ? img.src : undefined
            let name = ''

            if (nameEl) {
              name =
                nameEl.textContent && nameEl.textContent.trim()
                  ? nameEl.textContent.trim()
                  : (
                      nameEl.getAttribute('data-name') ||
                      nameEl.getAttribute('data-profile-name') ||
                      nameEl.getAttribute('data-self-name') ||
                      nameEl.getAttribute('aria-label') ||
                      ''
                    ).trim()
            }

            // Fallback: check item's aria-label
            if (!name && item.getAttribute('aria-label')) {
              name = item.getAttribute('aria-label').trim()
            }

            // Fallback: check image alt text
            if (!name && img) {
              name = (
                img.getAttribute('alt') ||
                img.getAttribute('aria-label') ||
                ''
              ).trim()
            }

            // Last resort: find any aria-label in children
            if (!name) {
              const anyLabel = item.querySelector(
                '[aria-label]:not([aria-label=""])'
              )
              if (anyLabel) {
                name = anyLabel.getAttribute('aria-label').trim()
              }
            }

            // Clean the name to remove unwanted patterns
            name = cleanParticipantName(name)

            // NEW: Validate participant item has expected structure (avatar + name)
            const hasValidStructure = avatarUrl && name && name.length > 0

            // NEW: Additional validation - ensure item is within contributors section or participant list
            // This filters out non-participant items that might match selectors
            const isInValidContext =
              !contributorsSection ||
              contributorsSection.contains(item) ||
              participantList?.contains(item) ||
              mainContainer?.contains(item)

            if (hasValidStructure && isInValidContext) {
              // Preserve name casing from UI (don't force uppercase)
              // Backend will resolve to proper name format
              // Note: Host status is detected via isHost() function using detectHostFromDOM()
              mapRef.set(avatarUrl, name)
              found += 1
            } else if (hasValidStructure && !isInValidContext) {
              // Log filtered items for debugging
              console.debug(
                '🔍 Filtered out non-participant item:',
                name,
                'Context:',
                debugInfo.containerType
              )
            }
          } catch (e) {
            console.debug('Error processing participant item:', e)
          }
        })
        if (found > 0) break // Success, stop trying other methods
      }
    } catch (e) {
      console.debug(`Error with selector ${selector}:`, e)
    }
  }

  // Method 2: Role-based list items (if Method 1 found nothing)
  if (found === 0) {
    try {
      // NEW: Prioritize searching within contributors section, then fallback to document
      let listItems = searchContext.querySelectorAll(
        '[role="listitem"], div[aria-label][role="button"], div.cxdMu.KV1GEc'
      )
      if (listItems.length === 0 && contributorsSection) {
        listItems = document.querySelectorAll(
          '[role="listitem"], div[aria-label][role="button"], div.cxdMu.KV1GEc'
        )
      }
      debugInfo.methods.push(
        `Role-based${
          contributorsSection ? ' (in contributors section)' : ''
        }: ${listItems.length} items`
      )
      listItems.forEach(item => {
        try {
          const img = item.querySelector('img')
          // NEW: Prioritize aria-label on listitem itself (most reliable in new DOM structure)
          let nameEl = null
          const itemAriaLabel = item.getAttribute('aria-label')
          if (
            itemAriaLabel &&
            itemAriaLabel.trim() &&
            !itemAriaLabel.match(
              /^(on|off|mute|unmute|video|camera|microphone|button|click)$/i
            )
          ) {
            nameEl = {
              getAttribute: () => itemAriaLabel,
              textContent: itemAriaLabel
            }
          } else {
            nameEl = item.querySelector(
              '.zWGUib, [data-name], [data-profile-name], [aria-label]'
            )
            if (!nameEl) nameEl = item.querySelector('span[dir]:not(:empty)')
            if (!nameEl)
              nameEl = item.querySelector('div[role="button"][aria-label]')
          }
          const avatarUrl = img && img.src ? img.src : undefined
          let name = ''
          if (nameEl) {
            name =
              nameEl.textContent && nameEl.textContent.trim()
                ? nameEl.textContent.trim()
                : (
                    nameEl.getAttribute('data-name') ||
                    nameEl.getAttribute('data-profile-name') ||
                    nameEl.getAttribute('aria-label') ||
                    ''
                  ).trim()
          } else if (item.getAttribute('aria-label')) {
            name = item.getAttribute('aria-label').trim()
          }
          if (!name && img) {
            name = (
              img.getAttribute('alt') ||
              img.getAttribute('aria-label') ||
              ''
            ).trim()
          }
          if (!name) {
            const anyLabel = item.querySelector('[aria-label]')
            if (anyLabel) name = anyLabel.getAttribute('aria-label').trim()
          }
          // Clean the name to remove unwanted patterns
          name = cleanParticipantName(name)
          if (avatarUrl && name && name.length > 0) {
            mapRef.set(avatarUrl, name.toUpperCase())
            found += 1
          }
        } catch {
          /* skip individual element errors */
        }
      })
    } catch (err) {
      console.debug('Error with role-based method:', err)
    }
  }

  // Method 3: Legacy class-based approach (if still nothing found)
  if (found === 0) {
    try {
      const currentParticipants = document.getElementsByClassName('KjWwNd')
      const currentParticipantsName = document.getElementsByClassName('zWGUib')
      debugInfo.methods.push(
        `Legacy classes: ${currentParticipants.length} avatars, ${currentParticipantsName.length} names`
      )
      for (let i = 0; i < currentParticipants.length; i++) {
        const avatar = currentParticipants[i]
        const nameEl = currentParticipantsName[i]
        if (avatar && nameEl) {
          let name = (nameEl.innerText || nameEl.textContent || '').trim()
          // Clean the name to remove unwanted patterns
          name = cleanParticipantName(name)
          if (name && avatar.src) {
            mapRef.set(avatar.src, name.toUpperCase())
            found += 1
          }
        }
      }
    } catch (e) {
      console.debug('Error with legacy method:', e)
    }
  }

  // Method 4: Deep search - look for any divs with images and text that might be participants
  if (found === 0) {
    try {
      const allDivs = document.querySelectorAll(
        'div[role="list"] div, div[role="listitem"]'
      )
      debugInfo.methods.push(`Deep search: ${allDivs.length} divs`)
      allDivs.forEach(div => {
        try {
          const img = div.querySelector(
            'img[src*="googleusercontent"], img[src*="profile"]'
          )
          if (img && img.src) {
            // Look for text content that might be a name
            // Find text nodes for potential name extraction
            const _textNodes = Array.from(div.childNodes).filter(
              n => n.nodeType === 3 && n.textContent.trim().length > 0
            )
            const textContent = Array.from(
              div.querySelectorAll('span, div')
            ).find(el => {
              const text = (el.textContent || '').trim()
              return (
                text.length > 0 &&
                text.length < 50 &&
                !text.match(/^\d+$/) &&
                !text.includes('@')
              )
            })

            if (textContent) {
              let name = textContent.textContent.trim()
              // Clean the name to remove unwanted patterns
              name = cleanParticipantName(name)
              if (name && name.length > 0) {
                mapRef.set(img.src, name.toUpperCase())
                found += 1
              }
            }
          }
        } catch {
          /* skip individual element errors */
        }
      })
    } catch (err) {
      console.debug('Error with deep search method:', err)
    }
  }

  // Method 5: Pattern-based discovery for latest Meet UI
  if (found === 0) {
    try {
      // Search for elements with jsname containing participant-related keywords
      const jsnamePatterns = ['participant', 'user', 'member', 'attendee']
      const patternElements = []

      for (const pattern of jsnamePatterns) {
        const elements = document.querySelectorAll(
          `[jsname*="${pattern}" i], [jsname*="${
            pattern.charAt(0).toUpperCase() + pattern.slice(1)
          }"]`
        )
        patternElements.push(...Array.from(elements))
      }

      debugInfo.methods.push(
        `Pattern-based: ${patternElements.length} candidate elements`
      )

      patternElements.forEach(element => {
        try {
          // Look for image/avatar indicator
          let img = element.querySelector(
            'img[src*="googleusercontent"], img[src*="profile"], img[src*="photo"]'
          )

          // Check for background-image avatars
          if (!img || !img.src) {
            const bgDiv = element.querySelector(
              'div[style*="background-image"]'
            )
            if (bgDiv) {
              const bgStyle = bgDiv.getAttribute('style') || ''
              const urlMatch = bgStyle.match(/url\(['"]?([^'"]+)['"]?\)/)
              if (urlMatch && urlMatch[1]) {
                img = { src: urlMatch[1], getAttribute: () => null }
              }
            }
          }

          // Look for name text in close proximity (within the element or its children)
          if (img && img.src) {
            const textElements = element.querySelectorAll('span, div, p')
            let nameEl = null

            for (const el of textElements) {
              const text = (el.textContent || '').trim()
              // Valid name: not empty, reasonable length, not just numbers, not email
              if (
                text &&
                text.length > 0 &&
                text.length < 100 &&
                !text.match(/^\d+$/) &&
                !text.includes('@') &&
                !text.match(/^(on|off|mute|unmute|video|camera|microphone)$/i)
              ) {
                nameEl = el
                break
              }
            }

            // Also check aria-label on the element itself
            if (!nameEl && element.getAttribute('aria-label')) {
              const ariaText = element.getAttribute('aria-label').trim()
              if (ariaText && ariaText.length > 0 && ariaText.length < 100) {
                let name = cleanParticipantName(ariaText)
                if (name && name.length > 0) {
                  mapRef.set(img.src, name.toUpperCase())
                  found += 1
                }
              }
            } else if (nameEl) {
              let name = nameEl.textContent.trim()
              // Clean the name to remove unwanted patterns
              name = cleanParticipantName(name)
              if (name && name.length > 0) {
                mapRef.set(img.src, name.toUpperCase())
                found += 1
              }
            }
          }
        } catch (e) {
          console.debug('Error processing pattern element:', e)
        }
      })
    } catch (e) {
      console.debug('Error with pattern-based method:', e)
    }
  }

  debugInfo.found = found

  // Log debug info if participants found or if in meeting
  const isInMeeting =
    window.location.hostname === 'meet.google.com' &&
    (document.querySelector('[data-is-muted]') ||
      document.querySelector('[aria-label*="Turn off microphone"]') ||
      document.querySelector('[aria-label*="Turn on microphone"]'))

  if (found > 0) {
    console.log(
      `✅ Found ${found} participant(s) using: ${debugInfo.methods.join(', ')}`
    )
    // Log which method was successful
    const successfulMethod = debugInfo.methods[0] || 'unknown'
    console.log(`   📊 Successful method: ${successfulMethod}`)
    // NEW: Log container type for debugging
    if (debugInfo.containerType && debugInfo.containerType !== 'unknown') {
      console.log(`   📦 Container type: ${debugInfo.containerType}`)
    }
  } else if (isInMeeting) {
    // Only warn if we're actually in a meeting and should have participants
    if (
      warningThrottle.warn(
        'no_participants_found',
        `⚠️ No participants found. Tried: ${debugInfo.methods.join(', ')}`,
        60000
      )
    ) {
      console.warn('🔍 Debug info:', debugInfo)
      console.warn('💡 Tip: Make sure the participants panel is open')
      console.warn(
        '💡 Tip: Try running debugSelectorEffectiveness() to see which selectors are working'
      )
    }
  }
}

// Quick diagnostic for Nov 2025 structure
function diagnosePanelState () {
  const aside = document.querySelector('aside#ME4pNd')
  const list = document.querySelector(
    'div[role="list"][aria-label="Participants"]'
  )
  const button = document.querySelector('button[aria-label*="People"]')
  const expanded = button?.getAttribute('aria-expanded') === 'true'

  console.log('🔬 Panel Diagnostic:', {
    panelExists: !!aside,
    listExists: !!list,
    buttonExists: !!button,
    buttonExpanded: expanded,
    panelVisible: aside?.offsetParent !== null,
    listItemCount: list?.querySelectorAll('[role="listitem"]').length || 0
  })

  return { aside, list, button, expanded }
}

// Try to open the participants panel so the list exists in DOM
function openParticipantsPanelIfClosed () {
  try {
    // Quick diagnostic first
    const state = diagnosePanelState()

    // If panel is already open (button expanded or panel visible), skip
    if (state.expanded || (state.aside && state.aside.offsetParent !== null)) {
      console.log('✅ Panel already open')
      triedOpenPanel = true
      return true
    }

    // Check if panel is already open by looking for participant list containers
    const panelOpenIndicators = [
      // NEW: Updated panel identifiers (Nov 2025)
      'div#ME4pNd', // Panel ID from aria-controls attribute
      'div[id*="ME4pNd"]', // Panel with similar ID pattern
      'button[aria-expanded="true"][aria-label*="People"]', // Button shows panel is expanded
      'button[aria-controls][aria-expanded="true"]', // Any panel button that's expanded
      // Legacy/fallback indicators
      'div[data-panel-id="people"]',
      'div[data-panel-id="1"]', // Numeric panel ID
      'div[jsname*="participants"]',
      'div[jsname*="Participants"]',
      'div[jsname*="PeoplePanel"]',
      'div[jsname*="people-panel"]',
      'div[data-panel-type="people"]',
      'aside[aria-label*="People"]',
      'aside[aria-label*="Participants"]',
      '[role="list"][aria-label*="People"]',
      '[role="list"][aria-label*="Participants"]',
      'div[aria-label*="People"][role="list"]'
    ]

    for (const indicator of panelOpenIndicators) {
      const container = document.querySelector(indicator)
      // Check if visible (offsetParent) or exists in DOM (might be hidden but still accessible)
      if (container) {
        const isVisible = container.offsetParent !== null
        const hasContent = container.querySelector(
          '[role="listitem"], div[data-participant-id], div[jsname*="participant"]'
        )
        if (isVisible || hasContent) {
          console.log(
            `✅ Participants panel already ${
              isVisible ? 'open' : 'present in DOM'
            }`
          )
          triedOpenPanel = true // Mark as tried so we don't keep clicking
          return true
        }
      }
    }

    // Panel not open, try to open it
    // Modern Google Meet button selectors (updated Nov 2025)

    // PRIORITY FIX: Try most specific Nov 2025 selector first with direct check
    let peopleButton = document.querySelector(
      'button[jsname="A5il2e"][aria-label*="People"]'
    )
    if (!peopleButton) {
      peopleButton = document.querySelector(
        'button[data-panel-id="1"][aria-label*="People"]'
      )
    }
    if (!peopleButton) {
      peopleButton = document.querySelector('button[aria-controls="ME4pNd"]')
    }

    // If found, click immediately
    if (peopleButton && peopleButton.offsetParent !== null) {
      console.log('✨ Found People button via priority Nov 2025 selectors')
      console.log('   📍 Button:', {
        jsname: peopleButton.getAttribute('jsname'),
        ariaLabel: peopleButton.getAttribute('aria-label'),
        panelId: peopleButton.getAttribute('data-panel-id'),
        ariaControls: peopleButton.getAttribute('aria-controls')
      })
      peopleButton.click()
      triedOpenPanel = true

      setTimeout(() => {
        const panelOpen =
          document.querySelector('aside#ME4pNd') ||
          document.querySelector(
            'button[aria-expanded="true"][aria-label*="People"]'
          )
        if (panelOpen) {
          console.log('✅ Panel opened successfully via priority selector')
          panelOpenRetryCount = 0
        }
      }, 500)
      return true
    }

    // Fallback to comprehensive selector list
    const candidates = [
      // NEW: Updated selectors based on current Google Meet structure (Nov 2025)
      'button[jsname="A5il2e"]', // Specific jsname for People button (primary)
      'button[aria-label*="People"]', // "People - X joined" format (most reliable)
      'button[data-panel-id][aria-label*="People"]', // Panel button with People label
      'button[data-tooltip-id*="tt-"][aria-label*="People"]', // Tooltip-enabled People button
      'button.VYBDae-Bz112c-LgbsSe[aria-label*="People"]', // Specific class with People label
      'button[aria-controls][aria-label*="People"]', // Button with aria-controls and People label
      'button[aria-controls="ME4pNd"]', // Nov 2025: Direct panel control
      // Legacy/fallback selectors
      'button[data-panel-id="people"]',
      'button[data-panel-id="1"][aria-label*="People"]', // Panel ID might be numeric
      'button[jsname*="people"]',
      'button[jsname*="People"]',
      'button[jsname*="PeopleButton"]',
      'button[jsname*="people-button"]',
      'button[data-tooltip-id*="people"]',
      'button[aria-label*="Show everyone"]',
      'button[aria-label*="Show all"]',
      'button[aria-label*="View all"]',
      'button[aria-label*="See everyone"]',
      'button[aria-label*="Participants"]',
      'button[aria-label*="participants"]',
      'button[title*="People"]',
      'button[title*="Participants"]',
      'div[role="button"][aria-label*="People"]',
      'div[role="button"][data-panel-id="people"]',
      'div[role="button"][jsname*="people"]',
      'button[data-tooltip*="People"]',
      'button[data-tooltip*="people"]'
    ]

    if (!triedOpenPanel) {
      let clicked = false
      let attemptIndex = 0

      // Calculate exponential backoff delay based on retry count
      const getRetryDelay = () => {
        const delays = [500, 1000, 2000]
        return delays[Math.min(panelOpenRetryCount, delays.length - 1)]
      }

      for (const sel of candidates) {
        try {
          const btn = document.querySelector(sel)
          if (btn) {
            // Check if visible
            const isVisible = btn.offsetParent !== null

            if (isVisible) {
              console.log(
                `🔘 Clicking participants button (attempt ${
                  attemptIndex + 1
                }): ${sel}`
              )
              console.log(`   📍 Button details:`, {
                tag: btn.tagName,
                classes: btn.className,
                jsname: btn.getAttribute('jsname'),
                ariaLabel: btn.getAttribute('aria-label'),
                visible: true
              })

              // Try scrolling to button if needed
              try {
                btn.scrollIntoView({ behavior: 'smooth', block: 'center' })
                console.log('   📜 Scrolled to button')
              } catch (e) {
                // Scroll failed, continue anyway
                console.debug('   ⚠️ Scroll failed:', e)
              }

              // Try clicking
              btn.click()
              clicked = true
              attemptIndex++
              console.log(`   ✅ Click executed`)

              // Wait with exponential backoff and verify panel opened
              const delay = getRetryDelay()
              console.log(`   ⏳ Waiting ${delay}ms to verify panel opened...`)
              setTimeout(() => {
                const panelNowOpen = panelOpenIndicators.some(indicator => {
                  const container = document.querySelector(indicator)
                  if (container) {
                    const isVisible = container.offsetParent !== null
                    const hasContent = container.querySelector(
                      '[role="listitem"], div[data-participant-id]'
                    )
                    return isVisible || hasContent
                  }
                  return false
                })

                if (panelNowOpen) {
                  console.log('✅ Participants panel opened successfully')
                  console.log(
                    `   📊 Retry count reset (was: ${panelOpenRetryCount})`
                  )
                  // Reset retry count on success
                  panelOpenRetryCount = 0
                  triedOpenPanel = true
                } else {
                  console.warn(
                    `⚠️ Button clicked but panel may not have opened (delay: ${delay}ms)`
                  )
                  console.warn(
                    `   🔄 Will retry (current retry count: ${panelOpenRetryCount})`
                  )
                  // Allow retry if panel didn't open
                  triedOpenPanel = false
                }
              }, delay)

              break
            } else {
              // Button exists but not visible - try keyboard navigation as fallback
              console.log(
                `   ⚠️ Button found but not visible, trying keyboard navigation: ${sel}`
              )
              try {
                btn.focus()
                console.log('   ⌨️ Button focused')
                // Simulate Enter key press
                const enterEvent = new KeyboardEvent('keydown', {
                  key: 'Enter',
                  code: 'Enter',
                  keyCode: 13,
                  which: 13,
                  bubbles: true
                })
                btn.dispatchEvent(enterEvent)
                console.log(
                  `⌨️ Attempted keyboard navigation on button: ${sel}`
                )
                clicked = true
                attemptIndex++

                const delay = getRetryDelay()
                console.log(
                  `   ⏳ Waiting ${delay}ms to verify panel opened...`
                )
                setTimeout(() => {
                  const panelNowOpen = panelOpenIndicators.some(indicator => {
                    const container = document.querySelector(indicator)
                    return (
                      container &&
                      (container.offsetParent !== null ||
                        container.querySelector('[role="listitem"]'))
                    )
                  })
                  if (panelNowOpen) {
                    console.log(
                      '✅ Participants panel opened via keyboard navigation'
                    )
                    console.log(
                      `   📊 Retry count reset (was: ${panelOpenRetryCount})`
                    )
                    panelOpenRetryCount = 0
                    triedOpenPanel = true
                  } else {
                    console.warn(
                      `⚠️ Keyboard navigation attempted but panel not verified`
                    )
                    triedOpenPanel = false
                  }
                }, delay)

                break
              } catch (kbError) {
                console.debug(
                  `   ❌ Keyboard navigation failed for ${sel}:`,
                  kbError
                )
              }
            }
          }
        } catch (e) {
          console.debug(`Error with button selector ${sel}:`, e)
        }
      }

      // Enhanced fallback: Search for button by icon content (Nov 2025)
      if (!clicked) {
        console.log('🔍 Trying enhanced icon-based detection...')
        try {
          // Find all buttons with google-symbols icons
          const allButtons = document.querySelectorAll('button')
          for (const btn of allButtons) {
            const icons = btn.querySelectorAll('i.google-symbols')
            for (const icon of icons) {
              // Check if icon textContent contains "people"
              if (icon.textContent.trim().toLowerCase() === 'people') {
                console.log('✨ Found People button via icon content detection')
                console.log('   📍 Button details:', {
                  tag: btn.tagName,
                  classes: btn.className,
                  jsname: btn.getAttribute('jsname'),
                  ariaLabel: btn.getAttribute('aria-label'),
                  iconText: icon.textContent.trim()
                })

                if (btn.offsetParent !== null) {
                  btn.click()
                  clicked = true
                  console.log('   ✅ Click executed via icon detection')

                  const delay = getRetryDelay()
                  setTimeout(() => {
                    const panelNowOpen = panelOpenIndicators.some(indicator => {
                      const container = document.querySelector(indicator)
                      return (
                        container &&
                        (container.offsetParent !== null ||
                          container.querySelector('[role="listitem"]'))
                      )
                    })
                    if (panelNowOpen) {
                      console.log('✅ Panel opened via icon detection')
                      panelOpenRetryCount = 0
                      triedOpenPanel = true
                    } else {
                      triedOpenPanel = false
                    }
                  }, delay)
                  break
                }
              }
            }
            if (clicked) break
          }
        } catch (iconError) {
          console.debug('Icon detection error:', iconError)
        }
      }

      if (!clicked) {
        console.warn(
          `⚠️ Could not find or interact with participants button. Tried ${candidates.length} selectors + icon detection`
        )
        // Don't mark as tried if we couldn't find the button - retry later
      }
    }
  } catch (e) {
    console.error('Error opening participants panel:', e)
  }
}

// Validate user access to the meeting (disabled)
// eslint-disable-next-line no-unused-vars
async function validateUserAccess () {
  return true
}

// Record when user accesses the session
// eslint-disable-next-line no-unused-vars
async function recordSessionAccess (groupId, userId) {
  try {
    console.log(
      '📝 Recording session access for user:',
      userId,
      'group:',
      groupId
    )

    // Use configured backend URL instead of hardcoded value
    const config = await _getConfig()
    const backendUrl = config.backendUrl

    // Use safeFetch to handle Chrome's local network request restrictions
    const safeFetchFn = window.safeFetch || globalThis.safeFetch || fetch
    const response = await safeFetchFn(
      `${backendUrl}/api/groups/${groupId}/session-access`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      }
    )

    const result = await response.json()
    if (result.success) {
      console.log('✅ Session access recorded:', result.data)
    } else {
      console.warn('⚠️ Failed to record session access:', result.message)
    }
  } catch (error) {
    // Enhanced error handling for blocked network requests
    const errorMessage = error.message || String(error)
    if (
      errorMessage.includes('Failed to fetch') ||
      errorMessage.includes('network') ||
      errorMessage.includes('CORS')
    ) {
      console.warn(
        '⚠️ Session access error (possible local network blocking):',
        errorMessage
      )
      console.warn(
        '   💡 Ensure Chrome allows local network requests or use targetAddressSpace option'
      )
    } else {
      console.error('❌ Error recording session access:', error)
    }
  }
}

// Get current user ID from authentication credentials
// eslint-disable-next-line no-unused-vars
async function getCurrentUserId () {
  const credentials = await getAuthCredentials()
  if (credentials && credentials.userId) {
    return credentials.userId
  }

  // Fallback: try to get from localStorage (in case called from webapp context)
  const storedUserId = localStorage.getItem('neattend_user_id')
  if (storedUserId) {
    return storedUserId
  }

  console.warn('⚠️ No user ID available - authentication required')
  return null
}

// Show access denied message and attempt to leave meeting
// eslint-disable-next-line no-unused-vars
function showAccessDeniedMessage (message) {
  // Create a modal to show access denied
  const modal = document.createElement('div')
  modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: Arial, sans-serif;
    `

  const content = document.createElement('div')
  content.style.cssText = `
        background: white;
        padding: 40px;
        border-radius: 12px;
        text-align: center;
        max-width: 400px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `

  content.innerHTML = `
        <div style="color: #dc3545; font-size: 48px; margin-bottom: 20px;">🚫</div>
        <h2 style="color: #dc3545; margin-bottom: 16px;">Access Denied</h2>
        <p style="color: #666; margin-bottom: 24px; line-height: 1.5;">${message}</p>
        <p style="color: #999; font-size: 14px; margin-bottom: 24px;">You will be redirected to the student dashboard.</p>
        <button id="leaveMeetingBtn" style="
            background: #dc3545;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
        ">Leave Meeting</button>
    `

  modal.appendChild(content)
  document.body.appendChild(modal)

  // Handle leave meeting button
  document.getElementById('leaveMeetingBtn').onclick = () => {
    // Try to leave the meeting
    try {
      // Look for leave meeting button in Google Meet
      const leaveButton = document.querySelector(
        '[aria-label*="Leave call"], [aria-label*="Leave meeting"]'
      )
      if (leaveButton) {
        leaveButton.click()
      } else {
        // Fallback: redirect to dashboard
        // Use configured frontend URL for redirect
        _getConfig().then(cfg => {
          window.location.href = `${cfg.frontendUrl}/dashboard`
        })
      }
    } catch {
      // Fallback: redirect to dashboard
      _getConfig().then(cfg => {
        window.location.href = `${cfg.frontendUrl}/dashboard`
      })
    }
  }

  // Auto-redirect after 10 seconds
  setTimeout(async () => {
    const cfg = await _getConfig()
    window.location.href = `${cfg.frontendUrl}/dashboard`
  }, 10000)
}

// Check if a participant is authorized
// eslint-disable-next-line no-unused-vars
function isParticipantAuthorized (participantName) {
  if (!groupValidation || !groupValidation.members) {
    return true // If no validation data, allow all
  }

  // Check if participant is in the approved members list
  const isAuthorized = groupValidation.members.some(
    member =>
      member.status === 'approved' &&
      (member.name === participantName || member.email === participantName)
  )

  return isAuthorized
}

// Remove unauthorized participants
function removeUnauthorizedParticipants () {
  /* disabled */
}

// Show alert for unauthorized participant
// eslint-disable-next-line no-unused-vars
function showUnauthorizedParticipantAlert () {
  /* disabled */
}

// ========================================================================
// SELF-HOST DETECTION: Detect if the current user running the extension is the host
// This works from the moment the meeting starts, regardless of participant count
// ========================================================================

// Cache for current user info to avoid repeated DOM queries
// INCREASED TTL TO PREVENT FLICKERING - once detected, stay cached for 60 seconds
let cachedCurrentUserInfo = null
let cachedCurrentUserIsHost = null
let lastCurrentUserCheck = 0
const CURRENT_USER_CACHE_TTL = 60000 // INCREASED: 60 seconds cache (was 5s) - prevents flickering

/**
 * Get the current user's info (the person running the extension)
 * Google Meet shows the current user with special markers like "You" or "(You)"
 * @returns {Object|null} { name, avatarUrl, isCurrentUser: true } or null
 */
function getCurrentUserInfo () {
  try {
    const now = Date.now()
    if (
      cachedCurrentUserInfo &&
      now - lastCurrentUserCheck < CURRENT_USER_CACHE_TTL
    ) {
      return cachedCurrentUserInfo
    }

    // Method 1: Check for "You" label in participant list
    const participantItems = document.querySelectorAll(
      '[role="listitem"], div.cxdMu.KV1GEc, div[data-participant-id]'
    )

    for (const item of participantItems) {
      const itemText = item.textContent || ''
      const itemTextLower = itemText.toLowerCase()

      // Check for "(You)" suffix which Google Meet adds to current user
      if (
        itemTextLower.includes('(you)') ||
        itemTextLower.includes('you)') ||
        item.querySelector('[data-self-participant]') ||
        item.getAttribute('data-self') === 'true'
      ) {
        // Extract name (remove "(You)" suffix)
        const nameElement = item.querySelector('.zWGUib, .NTy87e, [aria-label]')
        let name =
          nameElement?.textContent?.trim() ||
          item.getAttribute('aria-label') ||
          ''
        name = name
          .replace(/\s*\(you\)\s*/gi, '')
          .replace(/\s*\(host\)\s*/gi, '')
          .trim()

        // Get avatar
        const img = item.querySelector(
          'img[src*="googleusercontent"], img[src*="profile"]'
        )
        const avatarUrl = img?.src || null

        if (name) {
          cachedCurrentUserInfo = { name, avatarUrl, isCurrentUser: true }
          lastCurrentUserCheck = now
          console.log(`👤 Current user detected: "${name}"`)
          return cachedCurrentUserInfo
        }
      }
    }

    // Method 2: Check for self-view video (usually has special styling or position)
    const selfVideo = document.querySelector(
      '[data-self-video], [data-self-name], .p2hjYe.ggHfZ'
    )
    if (selfVideo) {
      const nameEl = selfVideo.querySelector('.zWGUib, .NTy87e, [aria-label]')
      const name =
        nameEl?.textContent?.trim() ||
        selfVideo.getAttribute('aria-label') ||
        ''
      const img = selfVideo.querySelector(
        'img[src*="googleusercontent"], img[src*="profile"]'
      )
      const avatarUrl = img?.src || null

      if (name) {
        cachedCurrentUserInfo = {
          name: name.replace(/\s*\(you\)\s*/gi, '').trim(),
          avatarUrl,
          isCurrentUser: true
        }
        lastCurrentUserCheck = now
        return cachedCurrentUserInfo
      }
    }

    // Method 3: Check meeting controls area for current user name
    const meetingHeader = document.querySelector(
      '[data-meeting-title], .u6vdEc, .r6xAKc'
    )
    if (meetingHeader) {
      // Sometimes the current user's name appears near meeting controls
      const nameElements = meetingHeader.querySelectorAll(
        '[data-self-name], .zWGUib'
      )
      for (const el of nameElements) {
        const name = el.textContent?.trim()
        if (name && name.length > 2) {
          cachedCurrentUserInfo = { name, avatarUrl: null, isCurrentUser: true }
          lastCurrentUserCheck = now
          return cachedCurrentUserInfo
        }
      }
    }
  } catch (e) {
    console.debug('Error getting current user info:', e)
  }

  return null
}

/**
 * Detect if the CURRENT USER (running the extension) is the meeting host
 * This checks for host-only UI controls that only the host can see
 * @returns {boolean} True if current user is the host
 */
function detectCurrentUserAsHost () {
  try {
    const now = Date.now()
    if (
      cachedCurrentUserIsHost !== null &&
      now - lastCurrentUserCheck < CURRENT_USER_CACHE_TTL
    ) {
      return cachedCurrentUserIsHost
    }

    // Method 1: Check for "Host controls" or "Meeting host controls" button/menu
    const allText = document.body.textContent || ''
    const allTextLower = allText.toLowerCase()

    // Host-only text indicators that appear in host controls
    const hostControlIndicators = [
      'host controls',
      'meeting host controls',
      'host settings',
      'end meeting for everyone', // Only host sees this
      'mute all', // Only host can mute all
      'turn off all cameras', // Only host can do this
      'lock meeting', // Only host can lock
      'host management'
    ]

    for (const indicator of hostControlIndicators) {
      if (allTextLower.includes(indicator)) {
        console.log(`👑 Current user is HOST (detected: "${indicator}")`)
        cachedCurrentUserIsHost = true
        lastCurrentUserCheck = now
        return true
      }
    }

    // Method 2: Check for host-only buttons in the UI
    const hostButtons = document.querySelectorAll(
      '[aria-label*="Host controls"], [aria-label*="host control"], ' +
        '[aria-label*="End meeting for everyone"], [aria-label*="Mute all"], ' +
        '[data-tooltip*="Host"], [data-tooltip*="host controls"], ' +
        'button[aria-label*="Lock"], button[aria-label*="Remove all"]'
    )

    if (hostButtons.length > 0) {
      console.log(
        `👑 Current user is HOST (found ${hostButtons.length} host-only buttons)`
      )
      cachedCurrentUserIsHost = true
      lastCurrentUserCheck = now
      return true
    }

    // Method 3: Check the three-dot menu for host-only options
    const menuItems = document.querySelectorAll(
      '[role="menuitem"], [role="option"]'
    )
    for (const item of menuItems) {
      const itemText = (item.textContent || '').toLowerCase()
      if (
        itemText.includes('end meeting for everyone') ||
        itemText.includes('mute all') ||
        itemText.includes('host controls') ||
        itemText.includes('lock meeting')
      ) {
        console.log(`👑 Current user is HOST (menu item: "${itemText}")`)
        cachedCurrentUserIsHost = true
        lastCurrentUserCheck = now
        return true
      }
    }

    // Method 4: Check for meeting info panel showing current user as organizer
    const meetingInfo = document.querySelector(
      '[data-meeting-info], .F3Vo2d, .ZjFb7c'
    )
    if (meetingInfo) {
      const infoText = (meetingInfo.textContent || '').toLowerCase()
      if (
        infoText.includes('you are the host') ||
        infoText.includes("you're the host") ||
        infoText.includes('organizer: you')
      ) {
        console.log(`👑 Current user is HOST (meeting info indicates host)`)
        cachedCurrentUserIsHost = true
        lastCurrentUserCheck = now
        return true
      }
    }

    // Method 5: Check for "You" participant with host badge
    const participantItems = document.querySelectorAll(
      '[role="listitem"], div.cxdMu.KV1GEc'
    )
    for (const item of participantItems) {
      const itemText = (item.textContent || '').toLowerCase()
      // Check if this is the current user AND has host indicator
      if (
        (itemText.includes('(you)') || itemText.includes('you)')) &&
        (itemText.includes('host') || itemText.includes('organizer'))
      ) {
        console.log(`👑 Current user is HOST (You + host indicator found)`)
        cachedCurrentUserIsHost = true
        lastCurrentUserCheck = now
        return true
      }
    }

    cachedCurrentUserIsHost = false
    lastCurrentUserCheck = now
  } catch (e) {
    console.debug('Error detecting current user as host:', e)
  }

  return false
}

/**
 * Check if a participant matches the current user
 * @param {Object} participant - Participant to check
 * @returns {boolean} True if participant is the current user
 */
function isCurrentUserParticipant (participant) {
  const currentUser = getCurrentUserInfo()
  if (!currentUser) return false

  // Avatar match is definitive
  if (
    currentUser.avatarUrl &&
    participant.avatarUrl &&
    currentUser.avatarUrl === participant.avatarUrl
  ) {
    return true
  }

  // Name match
  if (currentUser.name && participant.name) {
    const currentNameLower = currentUser.name.toLowerCase().trim()
    const participantNameLower = participant.name.toLowerCase().trim()

    // Exact match
    if (currentNameLower === participantNameLower) return true

    // Clean match (remove suffixes like "(Host)")
    const cleanCurrent = currentNameLower
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .trim()
    const cleanParticipant = participantNameLower
      .replace(/\s*\([^)]*\)\s*$/g, '')
      .trim()

    if (cleanCurrent === cleanParticipant && cleanCurrent.length > 2)
      return true
  }

  return false
}

// NEW: Helper function to detect host status from DOM structure
function detectHostFromDOM (participantName, avatarUrl) {
  try {
    // Find participant item in DOM by name or avatar
    const participantItems = document.querySelectorAll(
      '[role="listitem"], div.cxdMu.KV1GEc, div[data-participant-id]'
    )

    for (const item of participantItems) {
      // Check if this item matches the participant
      const itemName =
        item.getAttribute('aria-label') ||
        item.querySelector('.zWGUib')?.textContent?.trim() ||
        item.textContent?.trim()
      const itemImg = item.querySelector(
        'img[src*="googleusercontent"], img[src*="profile"]'
      )
      const itemAvatarUrl = itemImg?.src

      const nameMatches =
        itemName &&
        participantName &&
        itemName.toLowerCase().includes(participantName.toLowerCase())
      const avatarMatches =
        itemAvatarUrl && avatarUrl && itemAvatarUrl === avatarUrl

      if (nameMatches || avatarMatches) {
        // Check for host indicator in this item or its children
        const hostIndicator = item.querySelector('div.d93U2d.qrLqp')
        if (hostIndicator) {
          const hostText = hostIndicator.textContent?.trim() || ''
          if (
            hostText.toLowerCase().includes('meeting host') ||
            hostText.toLowerCase().includes('host')
          ) {
            return true
          }
        }

        // Also check parent elements for host indicator
        let parent = item.parentElement
        let depth = 0
        while (parent && depth < 3) {
          const parentHostIndicator = parent.querySelector('div.d93U2d.qrLqp')
          if (parentHostIndicator) {
            const hostText = parentHostIndicator.textContent?.trim() || ''
            if (
              hostText.toLowerCase().includes('meeting host') ||
              hostText.toLowerCase().includes('host')
            ) {
              return true
            }
          }
          parent = parent.parentElement
          depth++
        }
      }
    }
  } catch (e) {
    console.debug('Error detecting host from DOM:', e)
  }

  return false
}

// Detect if participant is the host/instructor
// Uses HOST IDENTITY LOCK pattern - once a host is locked, they stay host until they leave
function isHost (participant, allParticipants = [], meetCode = null) {
  const participantName = participant.name || 'Unknown'

  // ========================================================================
  // PRIORITY 0: HOST IDENTITY LOCK CHECK
  // If a host is locked, check if this participant matches the locked host
  // This OVERRIDES all other detection methods for stability
  // ========================================================================
  if (isHostLocked()) {
    if (matchesLockedHost(participant)) {
      // This participant IS the locked host - they remain host regardless of DOM signals
      lockedHost.missedCount = 0 // Reset missed count since we found them
      return true
    }
    // A different participant - they are NOT the host (locked host takes precedence)
    return false
  }

  // ========================================================================
  // NO LOCKED HOST - Use detection methods to find a host candidate
  // ========================================================================
  let detectedAsHost = false
  let detectionMethod = ''

  // ========================================================================
  // METHOD 6 (PRIORITY): SELF-HOST DETECTION
  // Check if the participant IS the current user AND current user is the host
  // This works from the moment the meeting starts, regardless of participant count
  // ========================================================================
  if (!detectedAsHost) {
    // Check if this participant is the current user (running the extension)
    const isCurrentUser = isCurrentUserParticipant(participant)

    if (isCurrentUser) {
      // Current user - check if they're the host via host controls detection
      const currentUserIsHost = detectCurrentUserAsHost()
      if (currentUserIsHost) {
        detectedAsHost = true
        detectionMethod =
          'Method 6 - SELF-HOST detection (current user is host)'
        console.log(
          `👑 SELF-HOST DETECTED: "${participantName}" is the current user and IS the host`
        )
      }
    }
  }

  // Method 1: Check if participant has isHost flag (already marked)
  if (!detectedAsHost && participant.isHost === true) {
    detectedAsHost = true
    detectionMethod = 'Method 1 - existing isHost flag'
  }

  // Method 2: DOM-based detection for "Meeting host" text
  if (!detectedAsHost && (participant.name || participant.avatarUrl)) {
    const isHostFromDOM = detectHostFromDOM(
      participant.name,
      participant.avatarUrl
    )
    if (isHostFromDOM) {
      detectedAsHost = true
      detectionMethod = 'Method 2 - DOM detection'
    }
  }

  // Method 3: Check if participant name contains explicit host indicators
  // NOTE: Removed generic honorifics (dr., mr., ms., mrs.) as they cause false positives
  // Only use explicit host/instructor role indicators
  if (!detectedAsHost) {
    const nameLower = (participant.name || '').toLowerCase()
    // Only match explicit role indicators, not generic honorifics
    const explicitHostIndicators = [
      '(host)', // Google Meet adds this suffix
      '[host]',
      'meeting host',
      '(organizer)',
      '[organizer]'
    ]
    if (
      explicitHostIndicators.some(indicator => nameLower.includes(indicator))
    ) {
      detectedAsHost = true
      detectionMethod = 'Method 3 - explicit host indicator'
    }
  }

  // Method 4: Check role/presenter properties
  if (!detectedAsHost) {
    if (
      participant.role === 'host' ||
      participant.role === 'instructor' ||
      participant.presenter === true
    ) {
      detectedAsHost = true
      detectionMethod = 'Method 4 - role/presenter'
    }
  }

  // Method 5: First participant check (meeting creator)
  // Only use this as a last resort and with additional validation
  // This method is disabled by default as it's unreliable - DOM detection is preferred
  if (!detectedAsHost && allParticipants.length === 1) {
    // Only consider first participant as host if they're the ONLY participant
    // This indicates they created the meeting and no one else has joined yet
    if (
      allParticipants[0] &&
      allParticipants[0].name === participant.name &&
      allParticipants[0].avatarUrl === participant.avatarUrl
    ) {
      detectedAsHost = true
      detectionMethod = 'Method 5 - sole participant (likely creator)'
    }
  }

  // ========================================================================
  // If detected as host, confirm detection (potentially lock after threshold)
  // ========================================================================
  if (detectedAsHost) {
    const currentMeetCode = meetCode || getCurrentMeetCode()
    const shouldBeLocked = confirmHostDetection(participant, currentMeetCode)

    if (shouldBeLocked) {
      console.log(
        `👑 Host CONFIRMED and LOCKED (${detectionMethod}): "${participantName}"`
      )
    } else {
      console.log(
        `👑 Host candidate (${detectionMethod}): "${participantName}" - awaiting confirmation`
      )
    }
    return true
  }

  return false
}

/**
 * Get current meet code from URL
 * @returns {string|null} Meet code or null
 */
function getCurrentMeetCode () {
  try {
    const url = window.location.href
    const match = url.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i)
    return match ? match[1].toLowerCase() : null
  } catch {
    return null
  }
}

// Determine participant status based on attendance data
function deriveRawStatus (participant) {
  if (
    participant &&
    typeof participant.status === 'string' &&
    participant.status.trim()
  ) {
    return participant.status.trim().toLowerCase()
  }
  if (
    participant &&
    (participant.leaveTime || participant.leaveTimeIso || participant.timeOut)
  ) {
    return 'left'
  }
  if (!participant || !participant.attendedDuration) return 'joined'
  if (participant.attendedDuration < 60) return 'late' // Less than 1 minute
  return 'present'
}

function formatStatusLabel (rawStatus) {
  switch ((rawStatus || '').toLowerCase()) {
    case 'left':
    case 'left meeting':
      return 'Left Meeting'
    case 'late':
      return 'Late'
    case 'joined':
      return 'Just Joined'
    case 'present':
    default:
      return 'Present'
  }
}

// Format duration from seconds to HH:MM:SS
function formatDuration (seconds) {
  if (typeof seconds !== 'number') return '00:00:00'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function normalizeJoinFields (
  record = {},
  participantName = '',
  joinInstant = new Date()
) {
  const instant =
    joinInstant instanceof Date && !isNaN(joinInstant)
      ? joinInstant
      : new Date()
  const joinTimeFormatted = formatTimeHMS(instant)
  record.name = record.name || participantName
  record.joinTime = record.joinTime || joinTimeFormatted
  record.joinTimeRaw = record.joinTimeRaw || joinTimeFormatted
  record.joinTimeIso = record.joinTimeIso || instant.toISOString()
  record.timeIn = record.timeIn || record.joinTime || joinTimeFormatted
  record.lastAttendedTimeStamp = record.lastAttendedTimeStamp || instant
  return record
}

function sendJoinEventIfNeeded (avatarUrl, participantName, joinInstant) {
  if (!attendanceData.has(avatarUrl)) return
  const record = normalizeJoinFields(
    attendanceData.get(avatarUrl) || {},
    participantName,
    joinInstant
  )
  if (record.hasBroadcastJoin) {
    attendanceData.set(avatarUrl, record)
    return
  }

  record.status = record.status || 'present'
  record.statusLabel = record.statusLabel || formatStatusLabel('present')
  record.log = record.log || record.statusLabel
  record.isLive = true
  record.hasBroadcastJoin = true
  attendanceData.set(avatarUrl, record)

  sendImmediateUpdate('join', {
    name: record.name || participantName,
    avatarUrl,
    joinTime: record.joinTime,
    joinTimeIso: record.joinTimeIso,
    timeIn: record.timeIn,
    status: 'joined',
    rawStatus: 'joined',
    statusLabel: formatStatusLabel('joined'),
    attendedDuration: record.attendedDuration || 0,
    durationSeconds: record.attendedDuration || 0
  })
}

function buildLeavePayload (
  record = {},
  participantName = '',
  avatarUrl,
  leaveInstant = new Date()
) {
  const instant =
    leaveInstant instanceof Date && !isNaN(leaveInstant)
      ? leaveInstant
      : new Date()
  const leaveTimeFormatted = formatTimeHMS(instant)
  const statusLabel = formatStatusLabel('left')
  const durationSeconds =
    typeof record.attendedDuration === 'number'
      ? record.attendedDuration
      : typeof record.durationSeconds === 'number'
      ? record.durationSeconds
      : 0

  return {
    name: record.name || participantName,
    avatarUrl,
    joinTime: record.joinTime || record.timeIn || null,
    joinTimeIso: record.joinTimeIso || null,
    joinTimeRaw: record.joinTimeRaw || null,
    timeIn: record.timeIn || record.joinTime || null,
    leaveTime: leaveTimeFormatted,
    leaveTimeIso: instant.toISOString(),
    timeOut: leaveTimeFormatted,
    status: 'left',
    rawStatus: 'left',
    statusLabel,
    log: statusLabel,
    attendedDuration: durationSeconds,
    durationSeconds,
    lastSeen: instant.toISOString(),
    isLive: false
  }
}

// Send immediate update when participants change
async function sendImmediateUpdate (type, participant) {
  try {
    const credentials = await getAuthCredentials()

    // PHASE 1 FIX: Send data even without credentials (mark as unauthenticated)
    const isUnauthenticated = !credentials

    if (isUnauthenticated) {
      const meetCode = extractMeetCode()
      // Use throttled warning to prevent console spam
      const warningKey = `send_update_no_creds_${meetCode || 'unknown'}`
      if (
        warningThrottle.warn(
          warningKey,
          `⚠️ Sending ${type} update without authentication (unauthenticated mode)\n   MeetCode: ${meetCode}\n   💡 Join meeting through NE-Attend dashboard to enable authenticated tracking`,
          30000
        )
      ) {
        // Only show detailed instructions once per throttle period
        console.warn(
          '   📋 Extension will send data in unauthenticated mode - Dashboard will show with warnings'
        )
      }
      // Continue to send data even without credentials (don't return early)
    }

    // Get all current participants and identify host
    const allCurrentParticipants = Array.from(attendanceData.values())

    // Add isHost flag to participant if not already set
    if (participant && !participant.isHost) {
      participant.isHost = isHost(participant, allCurrentParticipants)
    }

    // Ensure all current participants have isHost flag
    const participantsWithHost = allCurrentParticipants.map(p => {
      if (p.isHost === undefined) {
        return { ...p, isHost: isHost(p, allCurrentParticipants) }
      }
      return p
    })

    // PHASE 1 FIX: Build payload with or without credentials
    const meetCode = credentials?.meetCode || extractMeetCode() || 'unknown'
    const updatePayload = {
      meetCode: meetCode,
      timestamp: new Date().toISOString(),
      type: type, // 'join' or 'leave'
      participant: participant,
      currentParticipants: participantsWithHost,
      verificationToken: credentials?.verificationToken || null, // null if unauthenticated
      subjectId: credentials?.subjectId || null, // null if unauthenticated
      subjectName: credentials?.subjectName || credentials?.groupName || null, // Include subject name
      sessionDate: new Date().toISOString(),
      meetingStatus: meetingStatus, // Include current meeting status
      isUnauthenticated: isUnauthenticated, // Flag to indicate unauthenticated update
      authWarning: isUnauthenticated // Backward compatibility flag
    }

    if (isUnauthenticated) {
      console.log(
        `🚀 Sending unauthenticated immediate ${type} update (will show with warnings in Dashboard):`,
        {
          meetCode: updatePayload.meetCode,
          type: type,
          participant: participant?.name || 'unknown',
          isUnauthenticated: true
        }
      )
    } else {
      console.log(
        `🚀 Sending authenticated immediate ${type} update:`,
        updatePayload
      )
    }

    // Update local storage for popup monitoring
    try {
      const snapshotParticipants = updatePayload.currentParticipants.map(p => {
        const rawStatus = deriveRawStatus(p)
        const statusLabel = formatStatusLabel(rawStatus)
        return {
          ...p,
          status: rawStatus,
          statusLabel,
          log: p.log || statusLabel,
          isLive: rawStatus !== 'left',
          lastSeen: updatePayload.timestamp,
          durationFormatted: formatDuration(p.attendedDuration || 0)
        }
      })

      chrome.storage.local.set({
        realtimeMonitoring: {
          meetCode: updatePayload.meetCode,
          updatedAt: updatePayload.timestamp,
          participantCount: updatePayload.currentParticipants.length,
          participants: snapshotParticipants,
          lastEvent: {
            type: type,
            participant: participant,
            timestamp: updatePayload.timestamp
          }
        }
      })
    } catch (e) {
      console.warn('Could not update local storage:', e)
    }

    chrome.runtime.sendMessage(
      { type: 'ATTENDANCE_PROGRESS', payload: updatePayload },
      async response => {
        if (chrome.runtime.lastError) {
          console.log(
            '⚠️ Background failed, trying direct fetch for immediate update:',
            chrome.runtime.lastError
          )
          // Use configured backend URL instead of hardcoded value
          const config = await _getConfig()
          const backendUrl = config.backendUrl
          // Use safeFetch to handle Chrome's local network request restrictions
          const safeFetchFn = window.safeFetch || globalThis.safeFetch || fetch
          safeFetchFn(`${backendUrl}/api/attendance/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          })
            .then(response => {
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
              }
              connectionHealth.lastSuccessfulRequest = Date.now()
              connectionHealth.consecutiveFailures = 0
              return response.json()
            })
            .then(data => {
              console.log(
                `✅ Immediate ${type} update sent via direct fetch:`,
                data
              )
              connectionHealth.isHealthy = true
              connectionHealth.backendReachable = true
            })
            .catch(err => {
              // Enhanced error handling for blocked network requests
              const errorMessage = err.message || String(err)
              if (
                errorMessage.includes('Failed to fetch') ||
                errorMessage.includes('network') ||
                errorMessage.includes('CORS')
              ) {
                console.warn(
                  `⚠️ Direct fetch failed for ${type} update (possible local network blocking):`,
                  errorMessage
                )
                console.warn(
                  '   💡 Ensure Chrome allows local network requests or use targetAddressSpace option'
                )
              } else {
                console.error(`❌ Direct fetch failed for ${type} update:`, err)
              }
              connectionHealth.consecutiveFailures++
              // Add to retry queue
              addToRetryQueue(updatePayload, 'progress', type)
            })
        } else if (response && !response.ok) {
          console.warn(`⚠️ Immediate ${type} update failed:`, response)
          // Add to retry queue if response indicates failure
          addToRetryQueue(updatePayload, 'progress', type)
        } else {
          console.log(
            `✅ Immediate ${type} update sent via background:`,
            response
          )
        }
      }
    )
  } catch (e) {
    console.error(`❌ Error sending immediate ${type} update:`, e)
  }
}

// Detect join/leave events by comparing current vs previous participants
function detectJoinLeaveEvents () {
  const currentKeys = Array.from(participantsList.keys())
  const previousKeys = Array.from(previousParticipants.keys())
  const isInitialSnapshot =
    previousParticipants.size === 0 && currentKeys.length > 0

  // Find new participants (joined)
  const joined = isInitialSnapshot
    ? currentKeys
    : currentKeys.filter(key => !previousKeys.includes(key))
  joined.forEach(avatarUrl => {
    const participant = participantsList.get(avatarUrl)
    const joinInstant = new Date()

    if (attendanceData.has(avatarUrl)) {
      const data = attendanceData.get(avatarUrl)
      data.joinTime = formatTimeHMS(joinInstant)
      data.joinTimeIso = joinInstant.toISOString()
      data.joinTimeRaw = data.joinTime
      data.timeIn = data.timeIn || data.joinTime
      data.status = 'present'
      data.statusLabel = formatStatusLabel('present')
      data.log = data.statusLabel
      data.isLive = true
      data.isNew = true
      attendanceData.set(avatarUrl, data)
      sendJoinEventIfNeeded(avatarUrl, participant, joinInstant)
    } else {
      const data = {
        avatarUrl,
        name: participant,
        joinTime: formatTimeHMS(joinInstant),
        joinTimeRaw: formatTimeHMS(joinInstant),
        joinTimeIso: joinInstant.toISOString(),
        timeIn: formatTimeHMS(joinInstant),
        attendedDuration: 0,
        lastAttendedTimeStamp: joinInstant,
        status: 'present',
        statusLabel: formatStatusLabel('present'),
        log: formatStatusLabel('present'),
        isLive: true,
        isNew: true
      }
      attendanceData.set(avatarUrl, data)
      sendJoinEventIfNeeded(avatarUrl, participant, joinInstant)
    }

    console.log(`👋 Student joined: ${participant}`)
  })

  // Find left participants (left)
  const left = previousKeys.filter(key => !currentKeys.includes(key))
  left.forEach(avatarUrl => {
    const participant = previousParticipants.get(avatarUrl)
    const leaveInstant = new Date()

    let record = attendanceData.get(avatarUrl)
    if (record) {
      record.leaveTime = formatTimeHMS(leaveInstant)
      record.leaveTimeIso = leaveInstant.toISOString()
      record.leaveTimeRaw = record.leaveTime
      record.status = 'left'
      record.statusLabel = formatStatusLabel('left')
      record.log = record.statusLabel
      record.isLive = false
      record.isNew = false
      record.lastAttendedTimeStamp = leaveInstant
      record.timeOut = record.leaveTime
      record.name = record.name || participant
      attendanceData.set(avatarUrl, record)
    } else {
      attendanceData.set(avatarUrl, { avatarUrl, name: participant })
    }

    record = attendanceData.get(avatarUrl) || {}
    const leavePayload = buildLeavePayload(
      record,
      participant,
      avatarUrl,
      leaveInstant
    )
    attendanceData.set(avatarUrl, {
      ...record,
      ...leavePayload,
      status: 'left',
      rawStatus: 'left',
      statusLabel: leavePayload.statusLabel,
      log: leavePayload.statusLabel,
      isLive: false,
      isNew: false,
      lastAttendedTimeStamp: leaveInstant,
      timeOut: leavePayload.timeOut
    })

    console.log(`👋 Student left: ${participant}`)
    sendImmediateUpdate('leave', leavePayload)
  })

  // Update previous participants for next comparison
  previousParticipants.clear()
  participantsList.forEach((name, avatarUrl) => {
    previousParticipants.set(avatarUrl, name)
  })
}

// Extract meetCode from Google Meet URL (matches frontend extraction pattern)
function extractMeetCode () {
  // Expected format: abc-defg-hij (three parts separated by hyphens, lowercase letters)
  const meetCodePattern = /^[a-z]+-[a-z]+-[a-z]+$/i

  // Method 1: Try pathname first (most common: meet.google.com/abc-defg-hij)
  let meetCode = window.location.pathname.substring(1)

  // Remove trailing slash if present
  if (meetCode.endsWith('/')) {
    meetCode = meetCode.slice(0, -1)
  }

  // Remove any query parameters or hash from pathname
  meetCode = meetCode.split('?')[0].split('#')[0]

  // Validate pathname meetCode
  if (meetCode && meetCode.match(meetCodePattern)) {
    const normalized = meetCode.toLowerCase()
    console.log('✅ Extracted meetCode from pathname:', normalized)
    return normalized
  }

  // Method 2: Check URL hash (e.g., meet.google.com/#abc-defg-hij)
  if (window.location.hash) {
    const hashMatch = window.location.hash.match(/([a-z]+-[a-z]+-[a-z]+)/i)
    if (hashMatch && hashMatch[1] && hashMatch[1].match(meetCodePattern)) {
      const normalized = hashMatch[1].toLowerCase()
      console.log('✅ Extracted meetCode from hash:', normalized)
      return normalized
    }
  }

  // Method 3: Check query parameters (e.g., meet.google.com/?meet=abc-defg-hij)
  const urlParams = new URLSearchParams(window.location.search)
  const queryMeetCode =
    urlParams.get('meet') || urlParams.get('meetCode') || urlParams.get('code')
  if (queryMeetCode && queryMeetCode.match(meetCodePattern)) {
    const normalized = queryMeetCode.toLowerCase()
    console.log('✅ Extracted meetCode from query params:', normalized)
    return normalized
  }

  // Method 4: Extract from full URL using regex (handles various formats)
  const urlMatch = window.location.href.match(
    /(?:meet\.google\.com\/|hangouts\.google\.com\/call\/|\/)([a-z]+-[a-z]+-[a-z]+)/i
  )
  if (urlMatch && urlMatch[1] && urlMatch[1].match(meetCodePattern)) {
    const normalized = urlMatch[1].toLowerCase()
    console.log('✅ Extracted meetCode from full URL:', normalized)
    return normalized
  }

  // Method 5: Try to extract from any part of the URL
  const fullUrlMatch = window.location.href.match(/([a-z]+-[a-z]+-[a-z]+)/i)
  if (
    fullUrlMatch &&
    fullUrlMatch[1] &&
    fullUrlMatch[1].match(meetCodePattern)
  ) {
    const normalized = fullUrlMatch[1].toLowerCase()
    console.log('✅ Extracted meetCode from URL pattern:', normalized)
    return normalized
  }

  console.warn('⚠️ Could not extract meetCode from URL:', window.location.href)
  return null
}

// Debug helper function - can be called from console
window.debugTokenLookup = async function () {
  console.log('🔍 === TOKEN DEBUG INFO ===')
  const meetCode = extractMeetCode()
  console.log('Extracted meetCode:', meetCode)
  console.log('Current URL:', window.location.href)

  if (!meetCode) {
    console.error('❌ No meetCode extracted!')
    return
  }

  const storageKey = `neattend_token_${meetCode.toLowerCase()}`
  console.log('Looking for storage key:', storageKey)

  chrome.storage.sync.get([storageKey], result => {
    if (chrome.runtime.lastError) {
      console.error('❌ Error:', chrome.runtime.lastError)
    } else {
      console.log('Storage result:', result)
      if (result[storageKey]) {
        console.log('✅ Token found!', result[storageKey])
      } else {
        console.error('❌ Token not found in storage')

        // List all tokens
        chrome.storage.sync.get(null, allItems => {
          const allTokens = Object.keys(allItems).filter(k =>
            k.startsWith('neattend_token_')
          )
          console.log('All tokens in storage:', allTokens)
          allTokens.forEach(key => {
            console.log(`  ${key}:`, allItems[key])
          })
        })
      }
    }
  })
}

// Debug helper for participant scraping - can be called from console
window.debugParticipantScraping = function () {
  const startTime = performance.now()
  console.log('🔍 === PARTICIPANT SCRAPING DEBUG ===')
  console.log('Current URL:', window.location.href)
  console.log(
    'Is on Meet page:',
    window.location.hostname === 'meet.google.com'
  )

  // Check if participants panel is open
  const panelIndicators = [
    'div[data-panel-id="people"]',
    'div[jsname*="participants"]',
    'div[jsname*="Participants"]',
    'div[jsname*="PeoplePanel"]',
    'div[jsname*="people-panel"]',
    'div[data-panel-type="people"]',
    'aside[aria-label*="People"]',
    'aside[aria-label*="Participants"]',
    '[role="list"][aria-label*="People"]',
    '[role="list"][aria-label*="Participants"]'
  ]

  console.log('\n📋 Panel Status:')
  const panelStatus = []
  panelIndicators.forEach(selector => {
    const el = document.querySelector(selector)
    if (el) {
      const isVisible = el.offsetParent !== null
      const hasContent = el.querySelector(
        '[role="listitem"], div[data-participant-id]'
      )
      const status = isVisible
        ? '✅ Visible'
        : hasContent
        ? '⚠️ Hidden but has content'
        : '❌ Hidden'
      console.log(`  ${selector}: ${status}`, el)
      panelStatus.push({
        selector,
        found: true,
        visible: isVisible,
        hasContent: !!hasContent,
        element: el
      })
    } else {
      console.log(`  ${selector}: ❌ Not found`)
      panelStatus.push({ selector, found: false })
    }
  })

  // Try to find participants using all methods
  console.log('\n👥 Participant Detection Test:')
  const testMap = new Map()
  const detectionStart = performance.now()
  collectParticipantsInto(testMap)
  const detectionTime = performance.now() - detectionStart
  console.log(
    `Found ${testMap.size} participants (took ${detectionTime.toFixed(2)}ms):`
  )

  const participantDetails = []
  testMap.forEach((name, avatarUrl) => {
    console.log(`  - ${name}: ${avatarUrl.substring(0, 50)}...`)
    participantDetails.push({
      name,
      avatarUrl: avatarUrl.substring(0, 50) + '...'
    })

    // Log DOM structure snippet for first participant
    if (participantDetails.length === 1) {
      const participantItems = document.querySelectorAll(
        '[role="listitem"], div[data-participant-id], div[jsname*="participant"]'
      )
      if (participantItems.length > 0) {
        const firstItem = participantItems[0]
        console.log(`  📄 Sample DOM structure:`, {
          tag: firstItem.tagName,
          classes: firstItem.className,
          jsname: firstItem.getAttribute('jsname'),
          dataAttributes: Array.from(firstItem.attributes)
            .filter(attr => attr.name.startsWith('data-'))
            .map(attr => `${attr.name}="${attr.value}"`),
          hasImage: !!firstItem.querySelector('img'),
          hasName: !!firstItem.querySelector(
            '[data-name], [data-self-name], span, div'
          )
        })
      }
    }
  })

  // Check container for observer
  console.log('\n🔍 Observer Container Status:')
  let containerInfo = null
  if (participantsContainer) {
    const containerAttrs = {
      tag: participantsContainer.tagName,
      classes: participantsContainer.className,
      jsname: participantsContainer.getAttribute('jsname'),
      dataPanelId: participantsContainer.getAttribute('data-panel-id'),
      dataPanelType: participantsContainer.getAttribute('data-panel-type'),
      role: participantsContainer.getAttribute('role'),
      ariaLabel: participantsContainer.getAttribute('aria-label'),
      visible: participantsContainer.offsetParent !== null
    }
    console.log('  ✅ Container found:', containerAttrs)
    containerInfo = containerAttrs
  } else {
    console.log('  ❌ No container found')
  }

  // Check observer status
  console.log('\n👁️ Observer Status:')
  const observerInfo = {
    active: participantsObserver !== null,
    container: participantsContainer !== null,
    debounceTimer: observerDebounceTimer !== null,
    setupAttempted: observerSetupAttempted
  }
  if (participantsObserver) {
    console.log('  ✅ Observer is active', observerInfo)
  } else {
    console.log('  ❌ Observer is not active', observerInfo)
  }

  // Check panel button
  console.log('\n🔘 Panel Button Test:')
  const buttonSelectors = [
    'button[data-panel-id="people"]',
    'button[jsname*="people"]',
    'button[jsname*="People"]',
    'button[jsname*="PeopleButton"]',
    'button[jsname*="people-button"]',
    'button[data-tooltip-id*="people"]',
    'button[aria-label*="People"]',
    'button[aria-label*="Show everyone"]',
    'button[aria-label*="Show all"]',
    'button[aria-label*="View all"]',
    'button[aria-label*="See everyone"]',
    'button[aria-label*="Participants"]',
    'button[title*="People"]',
    'button[title*="Participants"]',
    'div[role="button"][aria-label*="People"]',
    'div[role="button"][data-panel-id="people"]',
    'div[role="button"][jsname*="people"]',
    'button[data-tooltip*="People"]',
    'button[data-tooltip*="people"]'
  ]

  const buttonStatus = []
  buttonSelectors.forEach(selector => {
    const btn = document.querySelector(selector)
    if (btn) {
      const isVisible = btn.offsetParent !== null
      const status = isVisible ? '✅ Visible' : '❌ Hidden'
      console.log(`  ${selector}: ${status}`, {
        tag: btn.tagName,
        classes: btn.className,
        jsname: btn.getAttribute('jsname'),
        ariaLabel: btn.getAttribute('aria-label'),
        visible: isVisible
      })
      buttonStatus.push({
        selector,
        found: true,
        visible: isVisible,
        element: btn
      })
    } else {
      console.log(`  ${selector}: ❌ Not found`)
      buttonStatus.push({ selector, found: false })
    }
  })

  const totalTime = performance.now() - startTime
  console.log(`\n⏱️ Total debug time: ${totalTime.toFixed(2)}ms`)

  return {
    participantsFound: testMap.size,
    participantDetails,
    panelOpen: panelStatus.some(p => p.found && p.visible),
    panelStatus,
    observerActive: participantsObserver !== null,
    observerInfo,
    containerFound: participantsContainer !== null,
    containerInfo,
    buttonStatus,
    detectionTime: detectionTime.toFixed(2) + 'ms',
    totalTime: totalTime.toFixed(2) + 'ms'
  }
}

// Debug helper to manually test participant collection
window.testParticipantCollection = function () {
  console.log('🧪 Testing participant collection...')
  const testMap = new Map()
  collectParticipantsInto(testMap)
  console.log(`Result: ${testMap.size} participants found`)
  if (testMap.size > 0) {
    console.log('Participants:')
    testMap.forEach((name, _avatarUrl) => {
      console.log(`  - ${name}`)
    })
  } else {
    console.warn('⚠️ No participants found. Try:')
    console.warn('  1. Open participants panel manually')
    console.warn('  2. Wait a few seconds')
    console.warn('  3. Run debugParticipantScraping() for detailed info')
  }
  return Array.from(testMap.entries())
}

// Debug helper to test selector effectiveness
window.debugSelectorEffectiveness = function () {
  console.log('🔍 === SELECTOR EFFECTIVENESS TEST (Nov 2025) ===')

  // Test Nov 2025 primary selectors first
  console.log('\n🎯 Nov 2025 PRIMARY SELECTORS:')
  console.log('Panel:', {
    'aside#ME4pNd': document.querySelector('aside#ME4pNd')
      ? '✅ Found'
      : '❌ Not found',
    'button[aria-expanded="true"][aria-label*="People"]':
      document.querySelector(
        'button[aria-expanded="true"][aria-label*="People"]'
      )
        ? '✅ Found'
        : '❌ Not found',
    'div[role="list"][aria-label="Participants"]': document.querySelector(
      'div[role="list"][aria-label="Participants"]'
    )
      ? '✅ Found'
      : '❌ Not found'
  })

  console.log('\n👤 Nov 2025 PEOPLE BUTTON:')
  const buttonSelectors = [
    'button[jsname="A5il2e"][aria-label*="People"]',
    'button[data-panel-id="1"][aria-label*="People"]',
    'button[aria-controls="ME4pNd"]',
    'button[aria-label*="People"]'
  ]
  buttonSelectors.forEach(sel => {
    const btn = document.querySelector(sel)
    if (btn) {
      console.log(`  ✅ ${sel}`)
      console.log('     Details:', {
        ariaLabel: btn.getAttribute('aria-label'),
        jsname: btn.getAttribute('jsname'),
        visible: btn.offsetParent !== null
      })
    } else {
      console.log(`  ❌ ${sel}`)
    }
  })

  // Test participant item selectors
  const participantSelectors = [
    // Nov 2025 selectors first
    'div[role="listitem"].cxdMu.KV1GEc',
    'div.cxdMu.KV1GEc[role="listitem"]',
    'div[role="listitem"][aria-label]',
    // Legacy selectors
    'div[data-participant-id]',
    'div[jsname*="participant"]',
    'div[jsname*="Participant"]',
    'div[jsname*="ParticipantItem"]',
    'div[jsname*="participant-item"]',
    '[role="listitem"][data-participant-id]',
    '[role="listitem"][jsname*="participant"]',
    'div[data-participant-id][role="listitem"]',
    'div[aria-label*="profile"][role="listitem"]',
    'div[data-self-name]',
    'div[data-participant]',
    'div[data-entity-id]',
    '[role="listitem"]',
    'div[aria-label][role="button"]'
  ]

  console.log('\n📋 Participant Item Selectors:')
  const selectorResults = []
  participantSelectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector)
      const count = elements.length
      const status = count > 0 ? '✅' : '❌'
      console.log(`  ${status} ${selector}: ${count} elements`)
      selectorResults.push({ selector, count, working: count > 0 })
    } catch (e) {
      console.log(`  ❌ ${selector}: Error - ${e.message}`)
      selectorResults.push({
        selector,
        count: 0,
        working: false,
        error: e.message
      })
    }
  })

  // Test avatar selectors
  console.log('\n🖼️ Avatar Selectors (testing on first participant item):')
  const firstItem = document.querySelector('div[role="listitem"]')
  if (firstItem) {
    console.log(
      '  Testing on item:',
      firstItem.getAttribute('aria-label') || 'no aria-label'
    )
    const avatarSelectors = [
      'img.KjWwNd', // Nov 2025 primary
      'img[data-profile-picture]',
      'img[alt*="profile"]',
      'img[alt*="Profile"]',
      'img[alt*="profile picture"]',
      'img[src*="googleusercontent"]',
      'img[src*="lh3.googleusercontent"]',
      'img[src*="photo"]',
      'img',
      'div[style*="background-image"]',
      'svg[data-profile-picture]'
    ]

    avatarSelectors.forEach(selector => {
      try {
        const found = firstItem.querySelector(selector)
        const status = found ? '✅' : '❌'
        console.log(`  ${status} ${selector}: ${found ? 'Found' : 'Not found'}`)
      } catch (e) {
        console.log(`  ❌ ${selector}: Error - ${e.message}`)
      }
    })
  } else {
    console.log('  ⚠️ No participant items found to test avatar selectors')
  }

  // Test name selectors
  console.log('\n📝 Name Selectors (testing on first participant item):')
  if (firstItem) {
    console.log(
      '  Item aria-label:',
      firstItem.getAttribute('aria-label') || 'none'
    )
    const nameSelectors = [
      'span.zWGUib', // Nov 2025 primary
      '.jKwXVe span.zWGUib', // Nov 2025 with container
      '[data-self-name]',
      '[data-name]',
      '[data-profile-name]',
      '[data-display-name]',
      'div[data-self-name]',
      'div[data-display-name]',
      'span[data-name]',
      'div[jsname*="name"]',
      'span[jsname*="name"]',
      '[aria-label]:not([aria-label=""])'
    ]

    nameSelectors.forEach(selector => {
      try {
        const found = firstItem.querySelector(selector)
        const status = found ? '✅' : '❌'
        if (found) {
          const text =
            found.textContent ||
            found.getAttribute('aria-label') ||
            found.getAttribute('data-name') ||
            ''
          console.log(`  ${status} ${selector}: "${text.substring(0, 30)}"`)
        } else {
          console.log(`  ${status} ${selector}: Not found`)
        }
      } catch (e) {
        console.log(`  ❌ ${selector}: Error - ${e.message}`)
      }
    })
  } else {
    console.log('  ⚠️ No participant items found to test name selectors')
  }

  // Summary
  const workingSelectors = selectorResults.filter(r => r.working).length
  const totalSelectors = selectorResults.length
  console.log(
    `\n📊 Summary: ${workingSelectors}/${totalSelectors} selectors are finding elements`
  )

  if (workingSelectors === 0) {
    console.warn('⚠️ No selectors are working! This suggests:')
    console.warn('  1. Participants panel may not be open')
    console.warn('  2. Google Meet UI has changed significantly')
    console.warn('  3. Page may not be fully loaded')
  }

  return {
    selectorResults,
    workingCount: workingSelectors,
    totalCount: totalSelectors,
    effectiveness: `${((workingSelectors / totalSelectors) * 100).toFixed(1)}%`
  }
}

// Debug helper to test panel opening
window.debugPanelOpening = function () {
  console.log('🔘 === PANEL OPENING DEBUG ===')

  const buttonSelectors = [
    'button[data-panel-id="people"]',
    'button[jsname*="people"]',
    'button[jsname*="People"]',
    'button[jsname*="PeopleButton"]',
    'button[jsname*="people-button"]',
    'button[data-tooltip-id*="people"]',
    'button[aria-label*="People"]',
    'button[aria-label*="Show everyone"]',
    'button[aria-label*="Show all"]',
    'button[aria-label*="View all"]',
    'button[aria-label*="See everyone"]',
    'button[aria-label*="Participants"]',
    'button[title*="People"]',
    'button[title*="Participants"]',
    'div[role="button"][aria-label*="People"]',
    'div[role="button"][data-panel-id="people"]',
    'div[role="button"][jsname*="people"]',
    'button[data-tooltip*="People"]',
    'button[data-tooltip*="people"]'
  ]

  console.log('\n🔍 Testing all button selectors:')
  const foundButtons = []
  buttonSelectors.forEach(selector => {
    const btn = document.querySelector(selector)
    if (btn) {
      const isVisible = btn.offsetParent !== null
      foundButtons.push({
        selector,
        element: btn,
        visible: isVisible,
        tag: btn.tagName,
        classes: btn.className,
        jsname: btn.getAttribute('jsname'),
        ariaLabel: btn.getAttribute('aria-label'),
        title: btn.getAttribute('title')
      })
      console.log(`  ✅ ${selector}: ${isVisible ? 'Visible' : 'Hidden'}`, btn)
    } else {
      console.log(`  ❌ ${selector}: Not found`)
    }
  })

  console.log(
    `\n📊 Found ${foundButtons.length} buttons (${
      foundButtons.filter(b => b.visible).length
    } visible)`
  )

  // Test panel state before
  const panelIndicators = [
    'div[data-panel-id="people"]',
    'div[jsname*="participants"]',
    'div[jsname*="Participants"]',
    'div[jsname*="PeoplePanel"]',
    '[role="list"][aria-label*="People"]',
    '[role="list"][aria-label*="Participants"]'
  ]

  console.log('\n📋 Panel state BEFORE click:')
  const panelBefore = panelIndicators.map(sel => {
    const el = document.querySelector(sel)
    return {
      selector: sel,
      found: !!el,
      visible: el ? el.offsetParent !== null : false
    }
  })
  panelBefore.forEach(p => {
    console.log(
      `  ${p.found ? (p.visible ? '✅' : '⚠️') : '❌'} ${p.selector}: ${
        p.found ? (p.visible ? 'Visible' : 'Hidden') : 'Not found'
      }`
    )
  })

  const panelOpenBefore = panelBefore.some(p => p.found && p.visible)
  console.log(`\nPanel open before: ${panelOpenBefore ? '✅ Yes' : '❌ No'}`)

  // Attempt to open panel
  if (!panelOpenBefore && foundButtons.length > 0) {
    const visibleButton = foundButtons.find(b => b.visible)
    const buttonToClick = visibleButton || foundButtons[0]

    console.log(`\n🔘 Attempting to click button: ${buttonToClick.selector}`)
    try {
      buttonToClick.element.click()
      console.log('✅ Click executed')

      // Wait and check panel state after
      setTimeout(() => {
        console.log('\n📋 Panel state AFTER click (1 second delay):')
        const panelAfter = panelIndicators.map(sel => {
          const el = document.querySelector(sel)
          return {
            selector: sel,
            found: !!el,
            visible: el ? el.offsetParent !== null : false
          }
        })
        panelAfter.forEach(p => {
          console.log(
            `  ${p.found ? (p.visible ? '✅' : '⚠️') : '❌'} ${p.selector}: ${
              p.found ? (p.visible ? 'Visible' : 'Hidden') : 'Not found'
            }`
          )
        })

        const panelOpenAfter = panelAfter.some(p => p.found && p.visible)
        console.log(
          `\nPanel open after: ${
            panelOpenAfter ? '✅ Yes - SUCCESS!' : '❌ No - Failed'
          }`
        )
      }, 1000)
    } catch (e) {
      console.error('❌ Error clicking button:', e)
    }
  } else if (panelOpenBefore) {
    console.log('ℹ️ Panel is already open, no need to click')
  } else {
    console.warn('⚠️ No buttons found to click')
  }

  return {
    buttonsFound: foundButtons.length,
    buttonsVisible: foundButtons.filter(b => b.visible).length,
    panelOpenBefore,
    buttonDetails: foundButtons
  }
}

// Fallback strategy: Dynamically discover participant selectors
function discoverParticipantSelectors () {
  console.log('🔍 Discovering participant selectors dynamically...')
  const discoveredSelectors = []
  const discoveredParticipants = new Map()

  // Strategy 1: Look for elements with images and text that might be participants
  const allElementsWithImages = document.querySelectorAll('div, span, li')
  for (const el of allElementsWithImages) {
    try {
      const img = el.querySelector(
        'img[src*="googleusercontent"], img[src*="profile"], img[src*="photo"]'
      )
      if (img && img.src) {
        // Check if element has text content that looks like a name
        const textContent = Array.from(
          el.querySelectorAll('span, div, p')
        ).find(child => {
          const text = (child.textContent || '').trim()
          return (
            text &&
            text.length > 0 &&
            text.length < 100 &&
            !text.match(/^\d+$/) &&
            !text.includes('@') &&
            !text.match(/^(on|off|mute|unmute|video|camera|microphone)$/i)
          )
        })

        if (textContent) {
          const name = textContent.textContent.trim()
          const avatarUrl = img.src

          // Check if this looks like a participant (has both image and name)
          if (name && avatarUrl && !discoveredParticipants.has(avatarUrl)) {
            // Try to determine the selector pattern
            const tag = el.tagName.toLowerCase()
            const classes = el.className
              ? `.${el.className.split(' ').join('.')}`
              : ''
            const jsname = el.getAttribute('jsname')
              ? `[jsname="${el.getAttribute('jsname')}"]`
              : ''
            const role = el.getAttribute('role')
              ? `[role="${el.getAttribute('role')}"]`
              : ''

            const selectorPattern =
              `${tag}${classes}${jsname}${role}`.substring(0, 100)
            discoveredSelectors.push({
              pattern: selectorPattern,
              element: el,
              foundParticipant: { name, avatarUrl }
            })
            discoveredParticipants.set(avatarUrl, name)
          }
        }
      }
    } catch {
      // Skip errors
    }
  }

  if (discoveredSelectors.length > 0) {
    console.log(
      `✅ Discovered ${discoveredSelectors.length} potential participant selectors`
    )
    discoveredSelectors.forEach((sel, idx) => {
      console.log(`  ${idx + 1}. Pattern: ${sel.pattern.substring(0, 80)}`)
      console.log(`     Found: ${sel.foundParticipant.name}`)
    })
  } else {
    console.log('⚠️ No participant selectors discovered')
  }

  return {
    selectors: discoveredSelectors,
    participants: Array.from(discoveredParticipants.entries()),
    count: discoveredParticipants.size
  }
}

// Fallback strategy: Attempt panel opening with retry logic
function attemptPanelOpeningWithRetry (maxAttempts = 3, baseDelay = 500) {
  console.log(
    `🔘 Attempting to open panel with retry (max ${maxAttempts} attempts, base delay ${baseDelay}ms)`
  )

  const buttonSelectors = [
    'button[data-panel-id="people"]',
    'button[jsname*="people"]',
    'button[jsname*="People"]',
    'button[jsname*="PeopleButton"]',
    'button[jsname*="people-button"]',
    'button[data-tooltip-id*="people"]',
    'button[aria-label*="People"]',
    'button[aria-label*="Show everyone"]',
    'button[aria-label*="Show all"]',
    'button[aria-label*="View all"]',
    'button[aria-label*="See everyone"]',
    'button[aria-label*="Participants"]',
    'button[title*="People"]',
    'button[title*="Participants"]',
    'div[role="button"][aria-label*="People"]',
    'div[role="button"][data-panel-id="people"]',
    'div[role="button"][jsname*="people"]',
    'button[data-tooltip*="People"]',
    'button[data-tooltip*="people"]'
  ]

  const panelOpenIndicators = [
    'div[data-panel-id="people"]',
    'div[jsname*="participants"]',
    'div[jsname*="Participants"]',
    'div[jsname*="PeoplePanel"]',
    'div[jsname*="people-panel"]',
    'div[data-panel-type="people"]',
    'aside[aria-label*="People"]',
    'aside[aria-label*="Participants"]',
    '[role="list"][aria-label*="People"]',
    '[role="list"][aria-label*="Participants"]'
  ]

  function checkPanelOpen () {
    return panelOpenIndicators.some(indicator => {
      const container = document.querySelector(indicator)
      if (container) {
        const isVisible = container.offsetParent !== null
        const hasContent = container.querySelector(
          '[role="listitem"], div[data-participant-id]'
        )
        return isVisible || hasContent
      }
      return false
    })
  }

  function attemptClick (attemptNumber) {
    return new Promise(resolve => {
      // Check if panel is already open
      if (checkPanelOpen()) {
        console.log('✅ Panel is already open')
        resolve({ success: true, reason: 'already_open' })
        return
      }

      // Find a button to click
      let buttonFound = null
      for (const selector of buttonSelectors) {
        try {
          const btn = document.querySelector(selector)
          if (btn) {
            const isVisible = btn.offsetParent !== null
            if (isVisible) {
              buttonFound = { element: btn, selector }
              break
            } else {
              // Try hidden button as fallback
              if (!buttonFound) {
                buttonFound = { element: btn, selector }
              }
            }
          }
        } catch {
          // Continue to next selector
        }
      }

      if (!buttonFound) {
        console.warn(`⚠️ Attempt ${attemptNumber}: No button found`)
        resolve({ success: false, reason: 'no_button_found' })
        return
      }

      // Calculate exponential backoff delay
      const delay = baseDelay * Math.pow(2, attemptNumber - 1)
      console.log(
        `🔘 Attempt ${attemptNumber}/${maxAttempts}: Clicking button (${buttonFound.selector}), delay: ${delay}ms`
      )

      try {
        // Scroll to button if needed
        buttonFound.element.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        })

        // Click the button
        buttonFound.element.click()

        // Wait and verify
        setTimeout(() => {
          if (checkPanelOpen()) {
            console.log(
              `✅ Attempt ${attemptNumber}: Panel opened successfully!`
            )
            resolve({
              success: true,
              reason: 'clicked_and_verified',
              attempt: attemptNumber
            })
          } else {
            console.warn(
              `⚠️ Attempt ${attemptNumber}: Button clicked but panel not verified`
            )
            resolve({
              success: false,
              reason: 'clicked_but_not_verified',
              attempt: attemptNumber
            })
          }
        }, delay)
      } catch (e) {
        console.error(`❌ Attempt ${attemptNumber}: Error clicking button:`, e)
        resolve({
          success: false,
          reason: 'click_error',
          error: e.message,
          attempt: attemptNumber
        })
      }
    })
  }

  // Execute retry attempts sequentially
  let currentAttempt = 1
  const executeAttempts = async () => {
    while (currentAttempt <= maxAttempts) {
      const result = await attemptClick(currentAttempt)

      if (result.success) {
        return result
      }

      currentAttempt++
      if (currentAttempt <= maxAttempts) {
        // Wait before next attempt
        const nextDelay = baseDelay * Math.pow(2, currentAttempt - 1)
        console.log(`⏳ Waiting ${nextDelay}ms before next attempt...`)
        await new Promise(resolve => setTimeout(resolve, nextDelay))
      }
    }

    return {
      success: false,
      reason: 'max_attempts_reached',
      attempts: maxAttempts
    }
  }

  return executeAttempts()
}

// Make fallback functions available globally for debugging
window.discoverParticipantSelectors = discoverParticipantSelectors
window.attemptPanelOpeningWithRetry = attemptPanelOpeningWithRetry

// Helper to check what's in storage
window.checkStorage = function () {
  console.log('🔍 === CHECKING STORAGE ===')
  chrome.storage.local.get(['realtimeMonitoring', 'extEnabled'], result => {
    console.log('Storage result:', result)

    if (result.realtimeMonitoring) {
      const snap = result.realtimeMonitoring
      console.log('✅ Realtime monitoring data found:')
      console.log('   Meet Code:', snap.meetCode)
      console.log('   Updated At:', snap.updatedAt)
      console.log('   Participant Count:', snap.participantCount)
      console.log(
        '   Participants Array Length:',
        snap.participants ? snap.participants.length : 0
      )

      if (snap.participants && snap.participants.length > 0) {
        console.log('   Participants:')
        snap.participants.forEach((p, idx) => {
          console.log(
            `     ${idx + 1}. ${p.name} - ${p.status || 'unknown'} (${
              p.attendedDuration || 0
            }s)`
          )
        })
      } else {
        console.warn('   ⚠️ Participants array is empty or missing')
      }

      if (snap.authWarning) {
        console.warn(
          '   ⚠️ Auth warning: Data is local only (not synced to server)'
        )
      }
    } else {
      console.warn('❌ No realtime monitoring data in storage')
      console.warn('   This means no participants have been collected yet')
      console.warn('   Make sure:')
      console.warn('     1. You are in a Google Meet meeting')
      console.warn('     2. Participants panel is open')
      console.warn('     3. Extension is enabled')
    }

    console.log('Extension enabled:', result.extEnabled !== false)
  })
}

// Real-time diagnostic function to check what's happening
window.diagnoseScraping = function () {
  console.log('🔍 === REAL-TIME SCRAPING DIAGNOSTIC ===')
  console.log('Timestamp:', new Date().toISOString())

  // Check if we're on Meet page
  const isMeetPage = window.location.hostname === 'meet.google.com'
  console.log(`📍 On Meet page: ${isMeetPage ? '✅ Yes' : '❌ No'}`)

  if (!isMeetPage) {
    console.warn(
      '⚠️ Not on Google Meet page - extension only works on meet.google.com'
    )
    return
  }

  // Check panel state
  console.log('\n📋 Panel State:')
  const panelCheck = document.querySelector(
    'div[data-panel-id="people"], div[jsname*="participants"], div[jsname*="PeoplePanel"], [role="list"][aria-label*="People"]'
  )
  if (panelCheck) {
    const isVisible = panelCheck.offsetParent !== null
    const hasItems = panelCheck.querySelectorAll(
      '[role="listitem"], div[data-participant-id]'
    ).length
    console.log(`  Panel found: ${isVisible ? '✅ Visible' : '⚠️ Hidden'}`)
    console.log(`  Items in panel: ${hasItems}`)
    if (!isVisible) {
      console.warn('  ⚠️ Panel exists but is hidden - try opening it manually')
    }
  } else {
    console.warn('  ❌ Panel not found in DOM')
    console.warn('  💡 Try opening participants panel manually')
  }

  // Test participant collection
  console.log('\n👥 Participant Collection Test:')
  const testMap = new Map()
  collectParticipantsInto(testMap)
  console.log(`  Found: ${testMap.size} participants`)

  if (testMap.size > 0) {
    console.log('  ✅ Participants detected:')
    testMap.forEach((name, _avatarUrl) => {
      console.log(`    - ${name}`)
    })
  } else {
    console.warn('  ❌ No participants found')
    console.warn('  💡 Possible reasons:')
    console.warn('     1. Participants panel is not open')
    console.warn('     2. No one is in the meeting')
    console.warn('     3. Google Meet UI has changed')
    console.warn('  💡 Try:')
    console.warn('     1. Open participants panel (click "People" button)')
    console.warn('     2. Wait 5 seconds')
    console.warn('     3. Run this function again')
  }

  // Check current tracking state
  console.log('\n📊 Tracking State:')
  console.log(`  participantsList.size: ${participantsList.size}`)
  console.log(`  attendanceData.size: ${attendanceData.size}`)
  console.log(`  meetDuration: ${meetDuration}`)
  console.log(
    `  panelOpenRetryCount: ${panelOpenRetryCount}/${MAX_PANEL_RETRIES}`
  )
  console.log(`  triedOpenPanel: ${triedOpenPanel}`)
  console.log(
    `  observerActive: ${participantsObserver !== null ? '✅ Yes' : '❌ No'}`
  )
  console.log(
    `  containerFound: ${participantsContainer !== null ? '✅ Yes' : '❌ No'}`
  )

  // Check if tracking is running
  console.log('\n⏱️ Tracking Status:')
  console.log(
    `  tracking interval: ${tracking ? '✅ Active' : '❌ Not running'}`
  )

  // Check storage
  console.log('\n💾 Storage Check:')
  chrome.storage.local.get(['realtimeMonitoring', 'extEnabled'], result => {
    console.log(
      `  Extension enabled: ${result.extEnabled !== false ? '✅ Yes' : '❌ No'}`
    )
    if (result.realtimeMonitoring) {
      console.log(
        `  Realtime data: ✅ Found (${
          result.realtimeMonitoring.participantCount || 0
        } participants)`
      )
      console.log(
        `  Last updated: ${result.realtimeMonitoring.updatedAt || 'unknown'}`
      )
    } else {
      console.log('  Realtime data: ❌ Not found')
    }
  })

  // Recommendations
  console.log('\n💡 Recommendations:')
  if (testMap.size === 0) {
    console.log(
      '  1. Run: attemptPanelOpeningWithRetry() - to try opening panel'
    )
    console.log(
      '  2. Run: debugSelectorEffectiveness() - to test all selectors'
    )
    console.log(
      '  3. Run: discoverParticipantSelectors() - to find new selectors'
    )
  } else if (participantsList.size === 0) {
    console.log('  ⚠️ Participants detected but not in participantsList')
    console.log('  💡 This might be a timing issue - wait a few seconds')
  } else {
    console.log('  ✅ Everything looks good!')
    console.log('  💡 Check popup or dashboard to see the data')
  }

  return {
    isMeetPage,
    panelFound: !!panelCheck,
    panelVisible: panelCheck ? panelCheck.offsetParent !== null : false,
    participantsDetected: testMap.size,
    participantsListSize: participantsList.size,
    attendanceDataSize: attendanceData.size,
    trackingActive: !!tracking,
    observerActive: participantsObserver !== null
  }
}

// Extension diagnostic function - accessible via console: window.debugExtensionStatus()
window.debugExtensionStatus = async function () {
  console.log('🔍 === EXTENSION STATUS DIAGNOSTIC ===')
  console.log('Timestamp:', new Date().toISOString())

  // Check if we're on Meet page
  const isMeetPage = window.location.hostname === 'meet.google.com'
  console.log(`📍 On Meet page: ${isMeetPage ? '✅ Yes' : '❌ No'}`)

  if (!isMeetPage) {
    console.warn(
      '⚠️ Not on Google Meet page - extension only works on meet.google.com'
    )
    return
  }

  // Extract meetCode
  const meetCode = extractMeetCode()
  console.log(`\n📋 Meet Code:`)
  console.log(`   Extracted: ${meetCode || 'NOT FOUND'}`)
  console.log(`   Current URL: ${window.location.href}`)

  // Check extension enabled status
  console.log(`\n⚙️ Extension Status:`)
  chrome.storage.local.get(['extEnabled'], result => {
    const extEnabled = result.extEnabled !== false
    console.log(`   Extension enabled: ${extEnabled ? '✅ Yes' : '❌ No'}`)
  })

  // Check credentials
  console.log(`\n🔐 Credentials Status:`)
  getAuthCredentials().then(credentials => {
    if (credentials) {
      console.log(`   ✅ Credentials found:`)
      console.log(
        `      VerificationToken: ${
          credentials.verificationToken
            ? 'present (' + credentials.verificationToken.length + ' chars)'
            : 'missing'
        }`
      )
      console.log(`      SubjectId: ${credentials.subjectId || 'missing'}`)
      console.log(`      GroupId: ${credentials.groupId || 'missing'}`)
      console.log(`      MeetCode: ${credentials.meetCode || 'missing'}`)
      console.log(
        `      SubjectName: ${
          credentials.subjectName || credentials.groupName || 'missing'
        }`
      )
      console.log(`      UserId: ${credentials.userId || 'missing'}`)

      // Check token expiration
      chrome.storage.sync.get(
        [`neattend_token_${meetCode?.toLowerCase() || ''}`],
        result => {
          const tokenData =
            result[`neattend_token_${meetCode?.toLowerCase() || ''}`]
          if (tokenData && tokenData.expiresAt) {
            const expiresAt = new Date(tokenData.expiresAt)
            const now = new Date()
            const isExpired = now >= expiresAt
            const timeRemaining = Math.floor((expiresAt - now) / 1000 / 60)
            console.log(`      Token expiresAt: ${expiresAt.toLocaleString()}`)
            console.log(
              `      Token expired: ${isExpired ? '❌ Yes' : '✅ No'}`
            )
            if (!isExpired) {
              console.log(`      Time remaining: ${timeRemaining} minutes`)
            }
          }
        }
      )
    } else {
      console.log(`   ❌ No credentials found`)
      console.log(`   💡 Credentials are required to send data to backend`)
      console.log(
        `   💡 Join meeting through NE-Attend dashboard to generate credentials`
      )
    }
  })

  // Check tracking status
  console.log(`\n📊 Tracking Status:`)
  console.log(`   participantsList.size: ${participantsList.size}`)
  console.log(`   attendanceData.size: ${attendanceData.size}`)
  console.log(`   meetDuration: ${meetDuration} seconds`)
  console.log(
    `   tracking interval: ${tracking ? '✅ Active' : '❌ Not running'}`
  )
  console.log(
    `   observerActive: ${participantsObserver !== null ? '✅ Yes' : '❌ No'}`
  )
  console.log(
    `   containerFound: ${participantsContainer !== null ? '✅ Yes' : '❌ No'}`
  )
  console.log(`   meetingStatus: ${meetingStatus}`)

  // Check connection health
  console.log(`\n🌐 Connection Health:`)
  console.log(
    `   Last successful request: ${
      connectionHealth.lastSuccessfulRequest
        ? new Date(connectionHealth.lastSuccessfulRequest).toLocaleString()
        : 'never'
    }`
  )
  console.log(
    `   Consecutive failures: ${connectionHealth.consecutiveFailures}`
  )
  console.log(
    `   Is healthy: ${connectionHealth.isHealthy ? '✅ Yes' : '❌ No'}`
  )
  console.log(
    `   Backend reachable: ${
      connectionHealth.backendReachable ? '✅ Yes' : '❌ No'
    }`
  )

  // Check configuration
  console.log(`\n⚙️ Configuration:`)
  _getConfig().then(config => {
    console.log(`   Backend URL: ${config.backendUrl || 'not set'}`)
    console.log(`   Frontend URL: ${config.frontendUrl || 'not set'}`)
  })

  // Check recent progress updates
  console.log(`\n📡 Recent Activity:`)
  chrome.storage.local.get(['realtimeMonitoring'], result => {
    if (result.realtimeMonitoring) {
      const monitoring = result.realtimeMonitoring
      console.log(
        `   Last update: ${
          monitoring.updatedAt
            ? new Date(monitoring.updatedAt).toLocaleString()
            : 'never'
        }`
      )
      console.log(`   Participant count: ${monitoring.participantCount || 0}`)
      console.log(`   MeetCode: ${monitoring.meetCode || 'unknown'}`)
      if (monitoring.authWarning) {
        console.warn(
          `   ⚠️ Auth warning: Data is local only (not synced to server)`
        )
      }
    } else {
      console.log(`   No recent activity data`)
    }
  })

  // Recommendations
  console.log(`\n💡 Recommendations:`)
  getAuthCredentials().then(credentials => {
    if (!credentials) {
      console.log(
        `   1. Join meeting through NE-Attend dashboard to generate credentials`
      )
      console.log(`   2. Check if token was stored in chrome.storage.sync`)
      console.log(`   3. Verify meetCode matches the meeting URL`)
    } else if (!tracking) {
      console.log(`   1. Extension may need to be restarted`)
      console.log(`   2. Check if participants panel is open`)
      console.log(
        `   3. Run: window.forceParticipantCollection() to force collection`
      )
    } else {
      console.log(`   ✅ Extension appears to be functioning correctly`)
      console.log(`   💡 Check Dashboard to see if data is being received`)
    }
  })

  return {
    isMeetPage,
    meetCode,
    hasCredentials: null, // Will be set async
    trackingActive: !!tracking,
    participantsCount: participantsList.size,
    meetingStatus
  }
}

// Manual trigger function to force participant collection and display results
window.forceParticipantCollection = function () {
  console.log('🔄 === FORCING PARTICIPANT COLLECTION ===')

  // First, try to open panel
  console.log('1️⃣ Attempting to open participants panel...')
  triedOpenPanel = false // Reset flag to allow retry
  panelOpenRetryCount = 0 // Reset retry count
  openParticipantsPanelIfClosed()

  // Wait a bit for panel to open
  setTimeout(() => {
    console.log('2️⃣ Collecting participants...')
    const testMap = new Map()
    collectParticipantsInto(testMap)

    console.log(`3️⃣ Collection complete: ${testMap.size} participants found`)

    if (testMap.size > 0) {
      console.log('✅ Participants found:')
      testMap.forEach((name, avatarUrl) => {
        console.log(`   - ${name} (${avatarUrl.substring(0, 30)}...)`)
      })

      // Manually add to participantsList
      participantsList.clear()
      testMap.forEach((name, avatarUrl) => {
        participantsList.set(avatarUrl, name)
      })

      console.log('4️⃣ Triggering track_attendance()...')
      track_attendance()

      console.log('5️⃣ Checking attendanceData...')
      console.log(`   attendanceData.size: ${attendanceData.size}`)
      if (attendanceData.size > 0) {
        console.log('✅ Attendance data updated:')
        attendanceData.forEach((data, _avatarUrl) => {
          console.log(
            `   - ${data.name}: ${data.status} (${data.attendedDuration}s)`
          )
        })
      }

      // Check storage
      chrome.storage.local.get(['realtimeMonitoring'], result => {
        if (result.realtimeMonitoring) {
          console.log('✅ Realtime monitoring data in storage:')
          console.log(
            `   Participants: ${result.realtimeMonitoring.participantCount}`
          )
          console.log(`   Updated: ${result.realtimeMonitoring.updatedAt}`)
        } else {
          console.warn('⚠️ No realtime monitoring data in storage yet')
        }
      })

      return { success: true, count: testMap.size }
    } else {
      console.error('❌ No participants found after forced collection')
      console.warn('💡 Troubleshooting steps:')
      console.warn('   1. Make sure you are in a Google Meet meeting')
      console.warn(
        '   2. Open the participants panel manually (click "People" button)'
      )
      console.warn('   3. Wait 3 seconds')
      console.warn('   4. Run: diagnoseScraping()')
      console.warn('   5. Run: debugSelectorEffectiveness()')
      return { success: false, count: 0 }
    }
  }, 2000) // Wait 2 seconds for panel to open
}

// DOM Inspector - shows what's actually in the page
window.inspectMeetDOM = function () {
  console.log('🔍 === GOOGLE MEET DOM INSPECTOR ===')

  // Check for common Meet elements
  console.log('\n📋 Looking for Meet UI elements...')

  // Check for participant-related elements
  const participantElements = {
    'div[data-panel-id="people"]': document.querySelectorAll(
      'div[data-panel-id="people"]'
    ).length,
    'div[jsname*="participant"]': document.querySelectorAll(
      'div[jsname*="participant"]'
    ).length,
    'div[jsname*="people"]': document.querySelectorAll('div[jsname*="people"]')
      .length,
    '[role="listitem"]': document.querySelectorAll('[role="listitem"]').length,
    'div[data-participant-id]': document.querySelectorAll(
      'div[data-participant-id]'
    ).length,
    'img[src*="googleusercontent"]': document.querySelectorAll(
      'img[src*="googleusercontent"]'
    ).length
  }

  console.log('Participant-related elements found:')
  Object.entries(participantElements).forEach(([selector, count]) => {
    console.log(`  ${selector}: ${count} element(s)`)
  })

  // Check for buttons
  console.log('\n🔘 Looking for panel buttons...')
  const buttonSelectors = [
    'button[data-panel-id="people"]',
    'button[jsname*="people"]',
    'button[aria-label*="People"]',
    'button[aria-label*="Show everyone"]',
    'div[role="button"][aria-label*="People"]'
  ]

  buttonSelectors.forEach(selector => {
    const buttons = document.querySelectorAll(selector)
    if (buttons.length > 0) {
      console.log(`  ✅ ${selector}: ${buttons.length} button(s) found`)
      buttons.forEach((btn, idx) => {
        console.log(`     Button ${idx + 1}:`, {
          visible: btn.offsetParent !== null,
          ariaLabel: btn.getAttribute('aria-label'),
          jsname: btn.getAttribute('jsname'),
          classes: btn.className
        })
      })
    } else {
      console.log(`  ❌ ${selector}: Not found`)
    }
  })

  // Check for panels
  console.log('\n📋 Looking for panels...')
  const panelSelectors = [
    'div[data-panel-id="people"]',
    'div[jsname*="participants"]',
    'div[jsname*="PeoplePanel"]',
    '[role="list"][aria-label*="People"]'
  ]

  panelSelectors.forEach(selector => {
    const panels = document.querySelectorAll(selector)
    if (panels.length > 0) {
      console.log(`  ✅ ${selector}: ${panels.length} panel(s) found`)
      panels.forEach((panel, idx) => {
        const isVisible = panel.offsetParent !== null
        const items = panel.querySelectorAll(
          '[role="listitem"], div[data-participant-id]'
        ).length
        console.log(`     Panel ${idx + 1}:`, {
          visible: isVisible,
          items: items,
          classes: panel.className,
          jsname: panel.getAttribute('jsname')
        })
      })
    } else {
      console.log(`  ❌ ${selector}: Not found`)
    }
  })

  // Sample DOM structure
  console.log('\n📄 Sample DOM structure (first 5 list items):')
  const listItems = document.querySelectorAll('[role="listitem"]')
  if (listItems.length > 0) {
    Array.from(listItems)
      .slice(0, 5)
      .forEach((item, idx) => {
        console.log(`  Item ${idx + 1}:`, {
          tag: item.tagName,
          classes: item.className.substring(0, 50),
          jsname: item.getAttribute('jsname'),
          dataAttributes: Array.from(item.attributes)
            .filter(attr => attr.name.startsWith('data-'))
            .map(attr => `${attr.name}="${attr.value.substring(0, 30)}"`),
          hasImage: !!item.querySelector('img'),
          textContent: item.textContent
            ? item.textContent.trim().substring(0, 30)
            : 'none'
        })
      })
  } else {
    console.log('  ⚠️ No list items found')
  }

  return {
    participantElements,
    buttonsFound: buttonSelectors.map(s => ({
      selector: s,
      count: document.querySelectorAll(s).length
    })),
    panelsFound: panelSelectors.map(s => ({
      selector: s,
      count: document.querySelectorAll(s).length
    })),
    listItemsCount: listItems.length
  }
}

// Validate token structure
function validateToken (tokenData) {
  if (!tokenData) return false
  if (!tokenData.token || !tokenData.expiresAt) return false
  if (!tokenData.subjectId && !tokenData.groupId) return false // Support both for backward compatibility

  // Check if token is expired
  try {
    const expiresAt = new Date(tokenData.expiresAt)
    if (isNaN(expiresAt.getTime())) return false // Invalid date
    if (new Date() >= expiresAt) return false // Expired
  } catch {
    return false // Error parsing date
  }

  return true
}

// Cleanup expired tokens from chrome.storage.sync
async function cleanupExpiredTokens () {
  return new Promise(resolve => {
    chrome.storage.sync.get(null, allItems => {
      if (chrome.runtime.lastError) {
        console.error(
          '❌ Error reading tokens for cleanup:',
          chrome.runtime.lastError
        )
        resolve(0)
        return
      }

      const tokenKeys = Object.keys(allItems).filter(k =>
        k.startsWith('neattend_token_')
      )
      const expiredKeys = []
      const _now = new Date() // Reserved for future date comparison

      tokenKeys.forEach(key => {
        const tokenData = allItems[key]
        if (!validateToken(tokenData)) {
          expiredKeys.push(key)
        }
      })

      if (expiredKeys.length > 0) {
        console.log(`🧹 Cleaning up ${expiredKeys.length} expired token(s)`)
        chrome.storage.sync.remove(expiredKeys, () => {
          if (chrome.runtime.lastError) {
            console.error(
              '❌ Error removing expired tokens:',
              chrome.runtime.lastError
            )
            resolve(0)
          } else {
            console.log(`✅ Removed ${expiredKeys.length} expired token(s)`)
            resolve(expiredKeys.length)
          }
        })
      } else {
        resolve(0)
      }
    })
  })
}

// Search all tokens for fallback matching
async function searchAllTokens (meetCode = null) {
  return new Promise(resolve => {
    chrome.storage.sync.get(null, allItems => {
      if (chrome.runtime.lastError) {
        console.error('❌ Error reading all tokens:', chrome.runtime.lastError)
        resolve(null)
        return
      }

      // Check pending tokens first (tokens stored without meetCode)
      const pendingTokens = allItems.neattend_pending_tokens || []
      if (pendingTokens.length > 0) {
        console.log(
          `🔍 Found ${pendingTokens.length} pending token(s) - checking for match...`
        )

        // Try to match by meetCode in meetingLink
        for (const pendingToken of pendingTokens) {
          if (pendingToken.meetingLink && meetCode) {
            const linkMatch = pendingToken.meetingLink.match(
              /(?:meet\.google\.com\/|hangouts\.google\.com\/call\/|\/)([a-z]+-[a-z]+-[a-z]+)/i
            )
            if (
              linkMatch &&
              linkMatch[1].toLowerCase() === meetCode.toLowerCase()
            ) {
              console.log('✅ Found matching pending token by meetingLink!')
              // Update token with meetCode and store properly
              const updatedToken = {
                ...pendingToken,
                meetCode: meetCode.toLowerCase()
              }
              const storageKey = `neattend_token_${meetCode.toLowerCase()}`
              chrome.storage.sync.set(
                {
                  [storageKey]: updatedToken
                },
                () => {
                  console.log(
                    '✅ Pending token updated with meetCode:',
                    meetCode
                  )
                }
              )
              resolve(updatedToken)
              return
            }
          }
        }

        // If no match, use most recent pending token
        const sortedPending = pendingTokens
          .filter(t => validateToken(t))
          .sort(
            (a, b) =>
              new Date(b.storedAt || b.expiresAt) -
              new Date(a.storedAt || a.expiresAt)
          )

        if (sortedPending.length > 0) {
          console.log('⚠️ Using most recent pending token (no meetCode match)')
          // Try to extract meetCode from current URL and update
          const currentMeetCode = extractMeetCode()
          if (currentMeetCode && !sortedPending[0].meetCode) {
            const updatedToken = {
              ...sortedPending[0],
              meetCode: currentMeetCode
            }
            const storageKey = `neattend_token_${currentMeetCode}`
            chrome.storage.sync.set({
              [storageKey]: updatedToken
            })
            resolve(updatedToken)
            return
          }
          resolve(sortedPending[0])
          return
        }
      }

      const allTokens = Object.keys(allItems)
        .filter(k => k.startsWith('neattend_token_') && !k.includes('subject_'))
        .map(key => ({
          key,
          meetCode: key.replace('neattend_token_', ''),
          data: allItems[key]
        }))
        .filter(item => {
          if (!validateToken(item.data)) return false
          const expiresAt = new Date(item.data.expiresAt)
          return new Date() < expiresAt // Only non-expired tokens
        })

      if (allTokens.length === 0) {
        resolve(null)
        return
      }

      // If meetCode provided, try exact match first
      if (meetCode) {
        const exactMatch = allTokens.find(
          t => t.meetCode.toLowerCase() === meetCode.toLowerCase()
        )
        if (exactMatch) {
          console.log('✅ Found exact token match for meetCode:', meetCode)
          resolve(exactMatch.data)
          return
        }
      }

      // Return most recent token (by expiration time)
      const sorted = allTokens.sort(
        (a, b) => new Date(b.data.expiresAt) - new Date(a.data.expiresAt)
      )

      if (sorted.length > 0) {
        console.log(
          `⚠️ Using fallback token (${sorted.length} available):`,
          sorted[0].meetCode
        )
        resolve(sorted[0].data)
      } else {
        resolve(null)
      }
    })
  })
}

// Read authentication credentials from chrome.storage.sync based on current meetCode
// Enhanced with retry logic and caching
async function getAuthCredentials (retryCount = 0, maxRetries = 5) {
  const meetCode = extractMeetCode()

  if (!meetCode) {
    // Throttle this error too
    if (warningThrottle.shouldLog('no_meetcode', 60000)) {
      console.error(
        '❌ Could not extract meetCode from URL:',
        window.location.href
      )
      console.error('   Expected format: meet.google.com/abc-defg-hij')
      warningThrottle.warn('no_meetcode', '', 60000)
    }
    return null
  }

  // Check cache first (if recent)
  const now = Date.now()
  if (
    tokenCache &&
    tokenCache.meetCode === meetCode &&
    now - tokenCacheTime < TOKEN_CACHE_TTL
  ) {
    // Update credential state cache
    credentialStateCache.lastCheck = now
    credentialStateCache.lastResult = tokenCache.credentials
    credentialStateCache.consecutiveFailures = 0
    return tokenCache.credentials
  }

  // Check credential state cache - if we recently checked and found nothing, skip lookup
  const normalizedMeetCode = meetCode.toLowerCase()
  if (
    credentialStateCache.lastResult === null &&
    now - credentialStateCache.lastCheck < credentialStateCache.checkInterval &&
    credentialStateCache.consecutiveFailures > 2
  ) {
    // Recently checked, no credentials found, and multiple failures - skip lookup
    return null
  }

  const storageKey = `neattend_token_${normalizedMeetCode}`

  // Only log detailed lookup info if throttling allows
  if (warningThrottle.shouldLog(`token_lookup_${normalizedMeetCode}`, 60000)) {
    console.log('🔍 Looking up token:')
    console.log('   MeetCode extracted:', meetCode)
    console.log('   Normalized meetCode:', normalizedMeetCode)
    console.log('   Storage key:', storageKey)
    warningThrottle.warn(`token_lookup_${normalizedMeetCode}`, '', 60000)
  }

  return new Promise(resolve => {
    chrome.storage.sync.get([storageKey], result => {
      if (chrome.runtime.lastError) {
        console.error(
          '❌ Error reading from chrome.storage.sync:',
          chrome.runtime.lastError
        )
        console.error('   Error message:', chrome.runtime.lastError.message)
        // Retry on error
        if (retryCount < maxRetries) {
          const delay = Math.min(100 * Math.pow(2, retryCount), 1600) // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms
          console.log(
            `🔄 Retrying token retrieval (attempt ${
              retryCount + 1
            }/${maxRetries}) in ${delay}ms...`
          )
          setTimeout(() => {
            getAuthCredentials(retryCount + 1, maxRetries).then(resolve)
          }, delay)
          return
        }
        resolve(null)
        return
      }

      // Only log storage result if throttling allows
      if (
        warningThrottle.shouldLog(`storage_result_${normalizedMeetCode}`, 60000)
      ) {
        console.log('📦 Storage result:', result)
        warningThrottle.warn(`storage_result_${normalizedMeetCode}`, '', 60000)
      }
      const tokenData = result[storageKey]

      if (tokenData && validateToken(tokenData)) {
        const expiresAt = new Date(tokenData.expiresAt)
        const nowDate = new Date()

        if (nowDate < expiresAt) {
          console.log('✅ Valid token found for meetCode:', meetCode)
          console.log('   Token expires at:', expiresAt.toLocaleString())
          console.log(
            '   Time remaining:',
            Math.floor((expiresAt - nowDate) / 1000 / 60),
            'minutes'
          )

          const credentials = {
            verificationToken: tokenData.token,
            subjectId: tokenData.subjectId || tokenData.groupId, // Support both for backward compatibility
            userId: tokenData.userId,
            dashboardPath: tokenData.dashboardPath || '/dashboard',
            meetCode: meetCode,
            subjectName: tokenData.subjectName || tokenData.groupName || '',
            section: tokenData.section || '',
            schoolYear: tokenData.schoolYear || '',
            semester: tokenData.semester || ''
          }

          // Cache the token
          tokenCache = { meetCode: normalizedMeetCode, credentials }
          tokenCacheTime = now

          // Update credential state cache
          credentialStateCache.lastCheck = now
          credentialStateCache.lastResult = credentials
          credentialStateCache.consecutiveFailures = 0
          warningThrottle.clear(`token_not_found_${normalizedMeetCode}`) // Clear warning throttle on success

          resolve(credentials)
          return
        } else {
          console.warn('⚠️ Token expired for meetCode:', meetCode)
          console.warn('   Expired at:', expiresAt.toLocaleString())
          resolve(null)
          return
        }
      } else {
        // Token not found - try fallback search
        if (retryCount === 0) {
          // Throttle logging to avoid spam (only log once per 30 seconds)
          const now = Date.now()
          const lastLogKey = `lastTokenSearchLog_${normalizedMeetCode}`
          const lastLogTime = window[lastLogKey] || 0

          if (now - lastLogTime > 30000) {
            window[lastLogKey] = now
            console.log(
              '🔍 Token not found for exact meetCode, searching all tokens...'
            )
            console.log('   Looking for key:', storageKey)
            console.log('   Available keys in result:', Object.keys(result))

            // Debug: List all tokens in storage (only once)
            chrome.storage.sync.get(null, allItems => {
              const allTokenKeys = Object.keys(allItems).filter(k =>
                k.startsWith('neattend_token_')
              )
              const pendingCount = (allItems.neattend_pending_tokens || [])
                .length
              console.log(
                `📋 Storage status: ${allTokenKeys.length} tokens, ${pendingCount} pending`
              )
              if (allTokenKeys.length > 0 || pendingCount > 0) {
                console.log(
                  '   Token keys:',
                  allTokenKeys.map(k => k.replace('neattend_token_', ''))
                )
              }
            })
          }

          searchAllTokens(normalizedMeetCode).then(fallbackToken => {
            if (fallbackToken) {
              const _expiresAt = new Date(fallbackToken.expiresAt) // For future expiration check
              const credentials = {
                verificationToken: fallbackToken.token,
                subjectId: fallbackToken.subjectId || fallbackToken.groupId,
                userId: fallbackToken.userId,
                dashboardPath: fallbackToken.dashboardPath || '/dashboard',
                meetCode: fallbackToken.meetCode || normalizedMeetCode,
                subjectName:
                  fallbackToken.subjectName || fallbackToken.groupName || '',
                section: fallbackToken.section || '',
                schoolYear: fallbackToken.schoolYear || '',
                semester: fallbackToken.semester || ''
              }

              // Cache the token
              const cacheTime = Date.now()
              tokenCache = { meetCode: normalizedMeetCode, credentials }
              tokenCacheTime = cacheTime

              // Update credential state cache
              credentialStateCache.lastCheck = cacheTime
              credentialStateCache.lastResult = credentials
              credentialStateCache.consecutiveFailures = 0
              warningThrottle.clear(`token_not_found_${normalizedMeetCode}`) // Clear warning throttle on success

              resolve(credentials)
            } else {
              // No token found, retry with exponential backoff
              if (retryCount < maxRetries) {
                const delay = Math.min(100 * Math.pow(2, retryCount), 1600)
                console.log(
                  `🔄 Retrying token retrieval (attempt ${
                    retryCount + 1
                  }/${maxRetries}) in ${delay}ms...`
                )
                setTimeout(() => {
                  getAuthCredentials(retryCount + 1, maxRetries).then(resolve)
                }, delay)
              } else {
                // Final attempt failed - update credential state cache
                credentialStateCache.lastCheck = now
                credentialStateCache.lastResult = null
                credentialStateCache.consecutiveFailures++

                // Use throttled warning system
                const warningKey = `token_not_found_${normalizedMeetCode}`
                if (
                  warningThrottle.warn(
                    warningKey,
                    `⚠️ No token found for meetCode: ${normalizedMeetCode}`,
                    30000
                  )
                ) {
                  console.warn('   Current URL:', window.location.href)
                  console.warn('   Extracted meetCode:', normalizedMeetCode)

                  // Try to find any available tokens for debugging (only once per throttle period)
                  chrome.storage.sync.get(null, allItems => {
                    const allTokens = Object.keys(allItems).filter(
                      k =>
                        k.startsWith('neattend_token_') &&
                        !k.includes('subject_')
                    )
                    const pendingCount = (
                      allItems.neattend_pending_tokens || []
                    ).length
                    if (allTokens.length > 0 || pendingCount > 0) {
                      console.warn(
                        `   Found ${allTokens.length} tokens, ${pendingCount} pending`
                      )
                      console.warn(
                        '   💡 Extension will try to match tokens automatically'
                      )
                    } else {
                      console.warn(
                        '   No tokens found in chrome.storage.sync at all.'
                      )
                      console.warn(
                        '   💡 Tip: Join the meeting through NE-Attend dashboard to generate a token.'
                      )
                    }
                  })
                }

                if (!authenticationFailedNotified) {
                  authenticationFailedNotified = true
                  const helpfulMsg =
                    `🔐 Authentication Required\n\n` +
                    `To enable attendance tracking:\n\n` +
                    `1. Open NE-Attend dashboard\n` +
                    `2. Navigate to your subject\n` +
                    `3. Click "Join Meeting"\n` +
                    `4. Extension will auto-detect token\n\n` +
                    `MeetCode: ${normalizedMeetCode}\n` +
                    `Extension will retry automatically every 15 seconds.`
                  showNotification(helpfulMsg, 'warning')
                }

                resolve(null)
              }
            }
          })
        } else {
          // Retry attempt - try again with backoff
          if (retryCount < maxRetries) {
            const delay = Math.min(100 * Math.pow(2, retryCount), 1600)
            console.log(
              `🔄 Retrying token retrieval (attempt ${
                retryCount + 1
              }/${maxRetries}) in ${delay}ms...`
            )
            setTimeout(() => {
              getAuthCredentials(retryCount + 1, maxRetries).then(resolve)
            }, delay)
          } else {
            resolve(null)
          }
        }
      }
    })
  })
}

// Start periodic token refresh check
function startTokenRefreshInterval () {
  // Clear any existing interval
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval)
  }

  console.log('🔄 Starting periodic token refresh check (every 15s)')

  // Cleanup expired tokens on startup
  cleanupExpiredTokens()

  tokenRefreshInterval = setInterval(async () => {
    const meetCode = extractMeetCode()
    if (!meetCode) {
      return // Not on a meet page
    }

    // Clear cache to force fresh lookup
    tokenCache = null
    tokenCacheTime = 0

    const credentials = await getAuthCredentials(0, 0) // Quick check, no retries

    if (credentials) {
      // Token found!
      if (!lastTokenCheckResult) {
        // Token just became available
        console.log('✅ Token now available! Resuming attendance tracking...')
        lastTokenCheckResult = credentials

        // Clear the failed notification flag so user can see success
        authenticationFailedNotified = false

        // If tracking is not running, start it
        if (!tracking) {
          console.log('🚀 Starting attendance tracking with newly found token')
          start()
        }
      }
      lastTokenCheckResult = credentials
    } else {
      // Token still not found
      if (lastTokenCheckResult) {
        // Token was available but now it's gone (expired?)
        console.warn('⚠️ Token no longer available (may have expired)')
        lastTokenCheckResult = null
      }
    }

    // Periodically cleanup expired tokens (every 5 minutes)
    const now = Date.now()
    if (!window.lastTokenCleanup || now - window.lastTokenCleanup > 300000) {
      window.lastTokenCleanup = now
      cleanupExpiredTokens()
    }
  }, TOKEN_REFRESH_INTERVAL)
}

// Stop periodic token refresh check
function stopTokenRefreshInterval () {
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval)
    tokenRefreshInterval = null
    console.log('🛑 Stopped periodic token refresh check')
  }
}

function track_attendance () {
  // Stop tracking if extension context is invalidated
  if (extensionContextInvalidated) {
    return
  }

  // Set status to scraping when actively collecting participants
  if (meetingStatus === 'active' || meetingStatus === 'idle') {
    meetingStatus = 'scraping'
    meetingStatusTimestamp = Date.now()
  }

  // Collect participants with robust selectors
  // Try to open panel if not already tried multiple times
  if (panelOpenRetryCount < MAX_PANEL_RETRIES) {
    openParticipantsPanelIfClosed()
    // Increment retry count if panel opening was attempted
    if (!triedOpenPanel) {
      panelOpenRetryCount++
    }
  }

  // Clear previous participants list before collecting
  const previousSize = participantsList.size
  collectParticipantsInto(participantsList)
  const currentSize = participantsList.size

  // Check for stuck states (timeout detection)
  const now = Date.now()
  const timeInCurrentState = now - meetingStatusTimestamp
  const timeout = MEETING_STATUS_TIMEOUTS[meetingStatus]

  if (timeout !== Infinity && timeInCurrentState > timeout) {
    console.warn(
      `⚠️ Meeting status stuck in '${meetingStatus}' for ${Math.floor(
        timeInCurrentState / 1000
      )}s (timeout: ${timeout / 1000}s)`
    )

    // Fallback transitions for stuck states
    if (meetingStatus === 'scraping') {
      // If stuck in scraping, fallback to active (participants panel might not be openable)
      meetingStatus = 'active'
      meetingStatusTimestamp = now
      console.log('📊 Meeting status: active (timeout fallback from scraping)')
    } else if (meetingStatus === 'active' && currentSize === 0) {
      // If stuck in active with no participants, might be wrong page or panel closed
      // Keep as active but log warning
      console.warn(
        '⚠️ Meeting status active but no participants detected - panel may be closed or wrong page'
      )
    }
  }

  // Log participant collection status and update meeting status
  if (currentSize > 0) {
    console.log(
      `✅ Collected ${currentSize} participant(s) (was ${previousSize})`
    )
    // Set status to data_received when participants are successfully collected
    if (meetingStatus !== 'data_received') {
      meetingStatus = 'data_received'
      meetingStatusTimestamp = Date.now()
      console.log('📊 Meeting status: data_received (participants found)')
    }
  } else if (previousSize > 0) {
    console.warn(
      `⚠️ Participant count dropped from ${previousSize} to 0 - panel may have closed`
    )
    // Reset to active if participants list becomes empty
    if (meetingStatus === 'data_received') {
      meetingStatus = 'active'
      meetingStatusTimestamp = Date.now()
      console.log('📊 Meeting status: active (participants list empty)')
    }
  } else {
    // Only log occasionally when no participants found to avoid spam
    if (meetDuration % 10 === 0) {
      // Every 10 seconds
      console.warn(`⚠️ No participants detected (attempt ${meetDuration})`)
      console.warn('💡 Debug tips:')
      console.warn(
        '   1. Open participants panel manually (click "People" button)'
      )
      console.warn('   2. Run debugParticipantScraping() in console')
      console.warn('   3. Run debugSelectorEffectiveness() to test selectors')
      console.warn(
        '   4. Check if panel is visible: document.querySelector(\'div[data-panel-id="people"]\')'
      )
    }
  }

  // Check for unauthorized participants
  removeUnauthorizedParticipants()

  // Detect join/leave events immediately
  detectJoinLeaveEvents()

  if (participantsList.size > 0) {
    if (meetDuration == 1) {
      startTime = new Date()
    }

    // Ensure startTime is always defined
    if (!startTime) {
      startTime = new Date()
    }

    let dataChanged = false
    const allParticipantsArray = Array.from(participantsList.entries()).map(
      ([url, name]) => ({
        avatarUrl: url,
        name: name
      })
    )

    // Track host count to ensure only one host per meeting
    let hostCount = 0
    const existingHosts = Array.from(attendanceData.values()).filter(
      p => p.isHost === true
    )
    hostCount = existingHosts.length

    participantsList.forEach(function (name, avatarUrl) {
      // Determine if this participant is the host
      const participantObj = { avatarUrl, name }
      const isHostUser = isHost(participantObj, allParticipantsArray)

      // Enhanced duplicate prevention: Check by avatarUrl (primary) and name (fallback)
      let existingParticipant = null
      let duplicateKey = null

      // Primary check: by avatarUrl
      if (attendanceData.has(avatarUrl)) {
        existingParticipant = attendanceData.get(avatarUrl)
        duplicateKey = avatarUrl
      } else {
        // Fallback check: by name (normalized for comparison)
        const normalizedName = (name || '').trim().toLowerCase()
        for (const [key, data] of attendanceData.entries()) {
          const existingName = (data.name || '').trim().toLowerCase()
          if (existingName === normalizedName && existingName !== '') {
            existingParticipant = data
            duplicateKey = key
            console.log(
              `🔄 Duplicate detected by name: "${name}" (using existing entry with avatarUrl: ${key})`
            )
            break
          }
        }
      }

      if (existingParticipant) {
        // Update existing participant
        let data = existingParticipant

        // If duplicate was found by name but has different avatarUrl, update the key
        if (duplicateKey !== avatarUrl && duplicateKey) {
          // Remove old entry and create new one with correct avatarUrl
          attendanceData.delete(duplicateKey)
          console.log(
            `🔄 Migrating participant "${name}" from key "${duplicateKey}" to "${avatarUrl}"`
          )
        }

        data.attendedDuration += 1
        data.lastAttendedTimeStamp = new Date()
        data.isHost = isHostUser // Update host flag

        // Ensure only one host per meeting
        if (isHostUser && hostCount > 0 && !data.isHost) {
          // This would make a second host, but existing participant is not host
          // Check if we should update host status
          const currentHosts = Array.from(attendanceData.values()).filter(
            p => p.isHost === true
          )
          if (currentHosts.length === 0) {
            // No current host, this can be the host
            data.isHost = true
            hostCount = 1
            console.log(`👑 Designated "${name}" as host (no existing host)`)
          } else {
            // Host already exists, don't make this one a host
            data.isHost = false
            console.log(`⚠️ Host already exists, not marking "${name}" as host`)
          }
        } else if (isHostUser && hostCount === 0) {
          // First host designation
          data.isHost = true
          hostCount = 1
          console.log(`👑 Designated "${name}" as host`)
        } else if (isHostUser && hostCount > 0) {
          // Attempting to add another host - prevent it
          data.isHost = false
          console.log(
            `⚠️ Host already exists, not marking "${name}" as host (duplicate prevention)`
          )
        }

        // FIX: Always update status to 'present' when participant is active
        // If participant was 'left' but is now seen again, they have RETURNED
        if (data.status === 'left') {
          // Participant has RETURNED - clear leave time and resume tracking
          console.log(
            `🔙 Participant returned: "${name}" - clearing leave time, resuming duration from ${data.attendedDuration}s`
          )
          data.leaveTime = null
          data.leaveTimeIso = null
          data.leaveTimeRaw = null
          data.timeOut = null // Clear time out - they're back!
          data.isNew = false // Not new, they're returning
        }
        data.status = 'present'
        data.statusLabel = formatStatusLabel('present')
        data.log = data.statusLabel
        data.isLive = true
        data.isNew = data.isNew === true // Preserve isNew only if it was already true
        attendanceData.set(avatarUrl, data)
      } else {
        // New participant - check for duplicate by name before adding
        const normalizedName = (name || '').trim().toLowerCase()
        let nameDuplicate = false
        for (const [key, data] of attendanceData.entries()) {
          const existingName = (data.name || '').trim().toLowerCase()
          if (existingName === normalizedName && existingName !== '') {
            nameDuplicate = true
            console.log(
              `⚠️ Duplicate participant detected by name: "${name}" - skipping new entry`
            )
            // Update existing entry instead
            data.attendedDuration += 1
            data.lastAttendedTimeStamp = new Date()
            data.isHost = isHostUser
            attendanceData.set(key, data)
            break
          }
        }

        if (!nameDuplicate) {
          // Ensure only one host per meeting
          let shouldBeHost = isHostUser
          if (isHostUser && hostCount > 0) {
            shouldBeHost = false
            console.log(
              `⚠️ Host already exists, not marking new participant "${name}" as host`
            )
          } else if (isHostUser && hostCount === 0) {
            hostCount = 1
            console.log(`👑 Designated new participant "${name}" as host`)
          }

          const joinTime = new Date()
          const data = {
            avatarUrl: avatarUrl,
            name: name,
            isHost: shouldBeHost, // Mark host when creating new entry
            joinTime: formatTimeHMS(joinTime),
            joinTimeRaw: formatTimeHMS(joinTime),
            joinTimeIso: joinTime.toISOString(),
            timeIn: formatTimeHMS(joinTime),
            attendedDuration: 1,
            lastAttendedTimeStamp: joinTime,
            status: 'present',
            statusLabel: formatStatusLabel('present'),
            log: formatStatusLabel('present'),
            isLive: true,
            isNew: true
          }
          attendanceData.set(avatarUrl, data)
          sendJoinEventIfNeeded(avatarUrl, name, joinTime)
          dataChanged = true // New participant added
        }
      }
    })

    // Immediately update storage when new participants are detected (even without auth)
    // This ensures popup can display data right away
    if (dataChanged || meetDuration % 5 === 0) {
      // Update immediately on change, or every 5 seconds
      try {
        const meetCode = extractMeetCode()
        const enhancedParticipants = Array.from(attendanceData.values()).map(
          p => {
            const rawStatus = deriveRawStatus(p)
            const statusLabel = formatStatusLabel(rawStatus)
            return {
              ...p,
              status: rawStatus,
              statusLabel,
              log: p.log || statusLabel,
              isLive: rawStatus !== 'left',
              lastSeen: new Date().toISOString(),
              durationFormatted: formatDuration(p.attendedDuration || 0)
            }
          }
        )

        const storageData = {
          meetCode: meetCode || 'unknown',
          updatedAt: new Date().toISOString(),
          participantCount: attendanceData.size,
          participants: enhancedParticipants,
          sessionStartTime: startTime
            ? startTime.toISOString()
            : new Date().toISOString(),
          currentDuration: meetDuration,
          authWarning: true, // Flag to show auth warning in popup
          message:
            'Data collected locally. Join through NE-Attend dashboard to sync with server.'
        }

        chrome.storage.local.set(
          {
            realtimeMonitoring: storageData
          },
          () => {
            if (chrome.runtime.lastError) {
              console.error(
                '❌ Error saving to storage:',
                chrome.runtime.lastError
              )
            } else {
              if (dataChanged) {
                console.log(
                  `✅ Storage updated immediately: ${attendanceData.size} participant(s) detected`
                )
                console.log(
                  '   Participants:',
                  enhancedParticipants.map(p => p.name).join(', ')
                )
                console.log('💡 Open extension popup to view data')
              }
            }
          }
        )
      } catch (e) {
        console.warn('Could not update storage immediately:', e)
      }
    }

    meetDuration += 1

    // Periodically broadcast progress to backend for realtime dashboard (every 1s for real-time updates)
    const now = Date.now()
    if (now - lastBroadcastAt > 1000) {
      lastBroadcastAt = now

      // Check credential state cache - log if missing but DO NOT block updates
      const meetCode = extractMeetCode()
      if (
        credentialStateCache.lastResult === null &&
        credentialStateCache.consecutiveFailures > 2
      ) {
        // CRITICAL FIX: Do NOT return here - let updates flow through as unauthenticated
        // Previously this return statement blocked ALL progress updates after 3 credential failures
        // This caused real-time status to never display for unauthenticated users
        if (warningThrottle.shouldLog('credential_cache_miss', 60000)) {
          console.log(
            'ℹ️ Credentials not cached - proceeding with unauthenticated progress update'
          )
          console.log(
            '   💡 Join meeting through NE-Attend dashboard to enable authenticated tracking'
          )
        }
        // Continue to send unauthenticated update instead of blocking
      }

      // Phase 2 Task 1: Get credentials asynchronously with enhanced verification
      getAuthCredentials()
        .then(async credentials => {
          // Phase 2 Task 1: Verify credentials are loaded and have required fields
          const hasValidCredentials =
            credentials &&
            credentials.verificationToken &&
            credentials.subjectId
          const isUnauthenticated = !hasValidCredentials

          // Phase 2 Task 1: Enhanced logging for credential state
          if (isUnauthenticated) {
            // Phase 2 Task 1: Try to refresh credentials if missing
            if (
              !credentials ||
              (!credentials.verificationToken && !credentials.subjectId)
            ) {
              console.log('🔄 Credentials missing, attempting to refresh...')
              // Clear cache to force refresh
              tokenCache = null
              tokenCacheTime = 0

              // Try to get fresh credentials
              const freshCredentials = await getAuthCredentials()
              if (
                freshCredentials &&
                freshCredentials.verificationToken &&
                freshCredentials.subjectId
              ) {
                console.log('✅ Fresh credentials obtained after refresh')
                // Use fresh credentials
                Object.assign(credentials || {}, freshCredentials)
                // Update credential state cache
                credentialStateCache.lastCheck = Date.now()
                credentialStateCache.lastResult = freshCredentials
                credentialStateCache.consecutiveFailures = 0
              } else {
                // Still no credentials - update cache and log
                credentialStateCache.lastCheck = now
                credentialStateCache.lastResult = null
                credentialStateCache.consecutiveFailures += 1

                // Phase 2 Task 1: Enhanced logging for missing subjectId
                console.warn(
                  '⚠️ === MISSING CREDENTIALS FOR PROGRESS UPDATE ==='
                )
                console.warn('   MeetCode:', meetCode)
                console.warn('   Has credentials object:', !!credentials)
                console.warn(
                  '   Has verificationToken:',
                  !!credentials?.verificationToken
                )
                console.warn('   Has subjectId:', !!credentials?.subjectId)
                console.warn(
                  '   💡 Progress update will be sent as unauthenticated'
                )
                console.warn(
                  '   💡 Join meeting through NE-Attend dashboard to enable authenticated tracking'
                )

                // Use throttled warning for console
                const warningKey = `progress_no_creds_${meetCode || 'unknown'}`
                if (
                  warningThrottle.warn(
                    warningKey,
                    `⚠️ Sending progress without authentication (unauthenticated mode)\n   MeetCode: ${meetCode}\n   Missing: ${
                      !credentials?.verificationToken ? 'verificationToken' : ''
                    }${
                      !credentials?.verificationToken && !credentials?.subjectId
                        ? ', '
                        : ''
                    }${
                      !credentials?.subjectId ? 'subjectId' : ''
                    }\n   💡 Join meeting through NE-Attend dashboard to enable authenticated tracking`,
                    30000
                  )
                ) {
                  console.warn(
                    '   💡 Extension will send data in unauthenticated mode - Dashboard will show with warnings'
                  )

                  // Show user-visible notification (throttled to avoid spam)
                  const notificationKey = `notification_no_creds_${
                    meetCode || 'unknown'
                  }`
                  if (warningThrottle.shouldLog(notificationKey, 60000)) {
                    // Show notification max once per minute
                    showNotification(
                      'NE-Attend: Sending data without authentication. Join through dashboard for authenticated tracking.',
                      'warning'
                    )
                    warningThrottle.warn(notificationKey, '', 60000)
                  }
                }
              }
            } else {
              // Partial credentials - log what's missing
              console.warn(
                '⚠️ === INCOMPLETE CREDENTIALS FOR PROGRESS UPDATE ==='
              )
              console.warn('   MeetCode:', meetCode)
              console.warn(
                '   Has verificationToken:',
                !!credentials?.verificationToken
              )
              console.warn('   Has subjectId:', !!credentials?.subjectId)
              console.warn(
                '   Missing:',
                [
                  !credentials?.verificationToken ? 'verificationToken' : null,
                  !credentials?.subjectId ? 'subjectId' : null
                ]
                  .filter(Boolean)
                  .join(', ')
              )
              console.warn(
                '   💡 Progress update will be sent as unauthenticated'
              )

              // Update credential state cache
              credentialStateCache.lastCheck = now
              credentialStateCache.lastResult = credentials
              credentialStateCache.consecutiveFailures += 1
            }
          } else {
            // Phase 2 Task 1: Enhanced logging when credentials are valid
            console.log('✅ === VALID CREDENTIALS FOR PROGRESS UPDATE ===')
            console.log('   MeetCode:', meetCode)
            console.log('   SubjectId:', credentials.subjectId)
            console.log(
              '   VerificationToken:',
              credentials.verificationToken
                ? `${credentials.verificationToken.substring(0, 20)}...`
                : 'missing'
            )
            console.log(
              '   SubjectName:',
              credentials.subjectName || credentials.groupName || 'N/A'
            )

            // Credentials found - reset failure counter
            credentialStateCache.lastCheck = now
            credentialStateCache.lastResult = credentials
            credentialStateCache.consecutiveFailures = 0
          }

          try {
            // Ensure all participants have isHost flag
            const allParticipantsArray = Array.from(
              participantsList.entries()
            ).map(([url, name]) => ({
              avatarUrl: url,
              name: name
            }))
            const participantsWithHost = Array.from(
              attendanceData.values()
            ).map(p => {
              if (p.isHost === undefined) {
                const hostStatus = isHost(p, allParticipantsArray)
                if (hostStatus) {
                  console.log(
                    `👑 Marking participant as host: "${p.name || 'Unknown'}"`
                  )
                }
                return { ...p, isHost: hostStatus }
              }
              if (p.isHost === true) {
                console.log(
                  `👑 Participant already marked as host: "${
                    p.name || 'Unknown'
                  }"`
                )
              }
              return p
            })

            // Deduplicate participants before sending to backend
            // Use Set with composite key (avatarUrl + name) to ensure uniqueness
            const seenParticipants = new Set()
            const deduplicatedParticipants = []
            let duplicateCount = 0

            for (const participant of participantsWithHost) {
              // Create composite key for duplicate detection
              const avatarUrl = participant.avatarUrl || ''
              const name = (participant.name || '').trim().toLowerCase()
              const compositeKey = `${avatarUrl}|${name}`

              // Also check individual keys for robustness
              const keyByAvatar = `avatar:${avatarUrl}`
              const keyByName = name ? `name:${name}` : null

              let isDuplicate = false

              // Check composite key
              if (seenParticipants.has(compositeKey)) {
                isDuplicate = true
              }
              // Check by avatarUrl
              else if (avatarUrl && seenParticipants.has(keyByAvatar)) {
                isDuplicate = true
              }
              // Check by name (if name exists and avatarUrl doesn't)
              else if (
                !avatarUrl &&
                keyByName &&
                seenParticipants.has(keyByName)
              ) {
                isDuplicate = true
              }

              if (isDuplicate) {
                duplicateCount++
                console.log(
                  `⚠️ Filtering duplicate participant from progress payload: "${
                    participant.name
                  }" (${avatarUrl || 'no avatar'})`
                )
                continue
              }

              // Mark as seen using all possible keys
              seenParticipants.add(compositeKey)
              if (avatarUrl) {
                seenParticipants.add(keyByAvatar)
              }
              if (keyByName) {
                seenParticipants.add(keyByName)
              }

              deduplicatedParticipants.push(participant)
            }

            if (duplicateCount > 0) {
              console.log(
                `🔄 Filtered ${duplicateCount} duplicate participant(s) from progress payload`
              )
            }

            // Log participant count and host status for synchronization validation
            const hostCount = deduplicatedParticipants.filter(
              p => p.isHost === true
            ).length
            const participantCount = deduplicatedParticipants.length
            console.log(
              `📊 Progress payload stats: ${participantCount} total participants, ${hostCount} host(s)`
            )

            // HOST IDENTITY LOCK: Check if locked host is present
            // If host is locked but not found in current participants, increment missed count
            if (isHostLocked() && hostCount === 0) {
              // Locked host not found in this scrape cycle
              const shouldUnlock = incrementHostMissed()
              if (shouldUnlock) {
                console.log(
                  '🔓 Locked host left meeting - host identity unlocked, will re-detect on next cycle'
                )
              }
            } else if (isHostLocked() && hostCount > 0) {
              // Reset missed count - locked host is present
              lockedHost.missedCount = 0
            }

            // Enhanced logging: List all hosts and participants
            if (hostCount > 0) {
              const hostNames = deduplicatedParticipants
                .filter(p => p.isHost === true)
                .map(h => h.name || 'Unknown')
                .join(', ')
              console.log(`👑 Host(s) in payload: ${hostNames}`)
            }
            const regularParticipants = deduplicatedParticipants.filter(
              p => !p.isHost
            )
            if (regularParticipants.length > 0) {
              const participantNames = regularParticipants
                .map(p => p.name || 'Unknown')
                .slice(0, 5) // Show first 5
                .join(', ')
              const moreCount =
                regularParticipants.length > 5
                  ? ` (+${regularParticipants.length - 5} more)`
                  : ''
              console.log(
                `👥 Regular participants: ${participantNames}${moreCount}`
              )
            }

            // PHASE 1 FIX: Build payload with or without credentials
            // FIX: Include host status for instructor leave/return detection
            const hostParticipants = deduplicatedParticipants.filter(
              p => p.isHost === true
            )
            const hostInMeeting =
              hostParticipants.length > 0 &&
              hostParticipants.some(
                h => h.isLive !== false && h.status !== 'left'
              )
            const hostInfo =
              hostParticipants.length > 0
                ? {
                    name: hostParticipants[0].name,
                    isLive: hostParticipants[0].isLive !== false,
                    status: hostParticipants[0].status
                  }
                : null

            const progressPayload = {
              meetCode:
                credentials?.meetCode ||
                meetCode ||
                extractMeetCode() ||
                'unknown',
              timestamp: new Date().toISOString(),
              participants: deduplicatedParticipants,
              verificationToken: credentials?.verificationToken || null, // null if unauthenticated
              subjectId: credentials?.subjectId || null, // null if unauthenticated
              subjectName:
                credentials?.subjectName || credentials?.groupName || null,
              sessionDate: new Date().toISOString(),
              meetingStatus: meetingStatus, // Include current meeting status
              isUnauthenticated: isUnauthenticated, // Flag to indicate unauthenticated update
              authWarning: isUnauthenticated, // Backward compatibility flag
              hostInMeeting: hostInMeeting, // FIX: Track if host/instructor is in meeting
              hostInfo: hostInfo, // FIX: Include host details for Dashboard
              // HOST IDENTITY LOCK: Include lock status for Dashboard stability
              // PERMANENT LOCK: Host stays locked even after leaving meeting
              hostLocked: isHostLocked(),
              lockedHostInfo: isHostLocked()
                ? {
                    name: lockedHost.name,
                    avatarUrl: lockedHost.avatarUrl,
                    lockedAt: lockedHost.lockedAt,
                    // CRITICAL: Include host left status for Dashboard
                    hasLeft: lockedHost.hasLeft || false,
                    leftAt: lockedHost.leftAt || null,
                    missedCount: lockedHost.missedCount || 0,
                    permanentLock: HOST_PERMANENT_LOCK // Tell Dashboard about permanent lock
                  }
                : null
            }

            if (isUnauthenticated) {
              console.log(
                '📡 Sending unauthenticated progress update (will show with warnings in Dashboard):',
                {
                  meetCode: progressPayload.meetCode,
                  participantCount: progressPayload.participants.length,
                  isUnauthenticated: true
                }
              )
            } else {
              console.log(
                '📡 Sending authenticated progress update:',
                progressPayload
              )
            }

            // Write enhanced realtime snapshot for popup monitoring
            try {
              const enhancedParticipants = progressPayload.participants.map(
                p => {
                  const rawStatus = deriveRawStatus(p)
                  const statusLabel = formatStatusLabel(rawStatus)
                  return {
                    ...p,
                    status: rawStatus,
                    statusLabel,
                    log: p.log || statusLabel,
                    isLive: rawStatus !== 'left',
                    lastSeen: new Date().toISOString(),
                    durationFormatted: formatDuration(p.attendedDuration || 0)
                  }
                }
              )

              chrome.storage.local.set({
                realtimeMonitoring: {
                  meetCode: progressPayload.meetCode,
                  updatedAt: progressPayload.timestamp,
                  participantCount: progressPayload.participants.length,
                  participants: enhancedParticipants,
                  sessionStartTime: startTime
                    ? startTime.toISOString()
                    : new Date().toISOString(),
                  currentDuration: meetDuration,
                  authWarning: isUnauthenticated, // Flag to show auth warning in popup
                  isUnauthenticated: isUnauthenticated // New flag
                }
              })

              // SESSION STATE MACHINE: Update participant count in active session
              updateSessionParticipantCount(progressPayload.participants.length)
            } catch (e) {
              if (isExtensionContextInvalidated(e)) {
                handleExtensionContextInvalidation()
                return
              }
              console.warn('Could not update realtime monitoring storage:', e)
            }

            try {
              chrome.runtime.sendMessage(
                { type: 'ATTENDANCE_PROGRESS', payload: progressPayload },
                async response => {
                  if (chrome.runtime.lastError) {
                    console.log(
                      '⚠️ Background failed, trying direct fetch:',
                      chrome.runtime.lastError
                    )
                    // Use configured backend URL instead of hardcoded value
                    const config = await _getConfig()
                    const backendUrl =
                      config.backendUrl || 'http://localhost:8000'
                    // Fallback to direct fetch if messaging fails
                    // Use safeFetch to handle Chrome's local network request restrictions
                    const safeFetchFn =
                      window.safeFetch || globalThis.safeFetch || fetch
                    safeFetchFn(`${backendUrl}/api/attendance/progress`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(progressPayload)
                    })
                      .then(response => response.json())
                      .then(data =>
                        console.log('✅ Progress sent via direct fetch:', data)
                      )
                      .catch(err => {
                        // Enhanced error handling for blocked network requests
                        const errorMessage = err.message || String(err)
                        if (
                          errorMessage.includes('Failed to fetch') ||
                          errorMessage.includes('network') ||
                          errorMessage.includes('CORS')
                        ) {
                          console.warn(
                            '⚠️ Direct fetch failed (possible local network blocking):',
                            errorMessage
                          )
                          console.warn(
                            '   💡 Ensure Chrome allows local network requests or use targetAddressSpace option'
                          )
                        } else {
                          console.error('❌ Direct fetch failed:', err)
                        }
                      })
                  } else {
                    console.log('✅ Progress sent via background:', response)
                  }
                }
              )
            } catch (e) {
              if (isExtensionContextInvalidated(e)) {
                handleExtensionContextInvalidation()
                return
              }
              console.error('❌ Error sending progress:', e)
            }
          } catch (e) {
            if (isExtensionContextInvalidated(e)) {
              handleExtensionContextInvalidation()
              return
            }
            console.error('❌ Error creating progress payload:', e)
          }
        })
        .catch(err => {
          console.error(
            '❌ Error getting credentials for progress update:',
            err
          )
        })
    } else {
      // Even without credentials, update local storage so popup can display data
      // This allows users to see scraped data even if they haven't joined through dashboard
      try {
        const meetCode = extractMeetCode()
        const enhancedParticipants = Array.from(attendanceData.values()).map(
          p => {
            const rawStatus = deriveRawStatus(p)
            const statusLabel = formatStatusLabel(rawStatus)
            return {
              ...p,
              status: rawStatus,
              statusLabel,
              log: p.log || statusLabel,
              isLive: rawStatus !== 'left',
              lastSeen: new Date().toISOString(),
              durationFormatted: formatDuration(p.attendedDuration || 0)
            }
          }
        )

        chrome.storage.local.set({
          realtimeMonitoring: {
            meetCode: meetCode || 'unknown',
            updatedAt: new Date().toISOString(),
            participantCount: attendanceData.size,
            participants: enhancedParticipants,
            sessionStartTime: startTime
              ? startTime.toISOString()
              : new Date().toISOString(),
            currentDuration: meetDuration,
            authWarning: true, // Flag to show auth warning in popup
            message:
              'Data collected locally. Join through NE-Attend dashboard to sync with server.'
          }
        })

        if (attendanceData.size > 0 && meetDuration % 30 === 0) {
          // Log every 30 seconds
          console.log(
            `📊 Local data updated: ${attendanceData.size} participant(s) (no auth - local only)`
          )
        }
      } catch (e) {
        if (isExtensionContextInvalidated(e)) {
          handleExtensionContextInvalidation()
          return
        }
        console.warn('Could not update local storage (no auth):', e)
      }
    }
  } else {
    // No participants detected - update snapshot with status
    try {
      const meetCode = extractMeetCode()
      chrome.storage.local.set(
        {
          realtimeMonitoring: {
            meetCode: meetCode || 'unknown',
            updatedAt: new Date().toISOString(),
            participantCount: 0,
            participants: [],
            sessionStartTime: startTime
              ? startTime.toISOString()
              : new Date().toISOString(),
            currentDuration: meetDuration,
            status: 'no_participants',
            message:
              'No participants detected. Make sure participants panel is open.'
          }
        },
        () => {
          if (!chrome.runtime.lastError && meetDuration % 30 === 0) {
            // Log every 30 seconds to avoid spam
            console.log('📊 Snapshot updated: No participants detected')
          }
        }
      )
    } catch (e) {
      console.warn('Could not update snapshot (no participants):', e)
    }

    try {
      meetActionButtons[
        participantsButtonIndex % meetActionButtons.length
      ].click()
    } catch {
      stop()
    }
  }
}

// Helper function to initialize snapshot with verification and fallback
function initializeSnapshotWithVerification (context = 'tracking') {
  try {
    const meetCode = extractMeetCode()
    const snapshotData = {
      meetCode: meetCode || 'unknown',
      updatedAt: new Date().toISOString(),
      participantCount: 0,
      participants: [],
      sessionStartTime: new Date().toISOString(),
      currentDuration: 0,
      status: 'waiting',
      message: 'Tracking started. Waiting for participants...'
    }

    chrome.storage.local.set(
      {
        realtimeMonitoring: snapshotData
      },
      () => {
        if (chrome.runtime.lastError) {
          console.warn(
            `⚠️ Could not initialize snapshot (${context}):`,
            chrome.runtime.lastError
          )
          // Fallback: retry once after a short delay
          setTimeout(() => {
            chrome.storage.local.set(
              {
                realtimeMonitoring: snapshotData
              },
              () => {
                if (chrome.runtime.lastError) {
                  console.error(
                    `❌ Snapshot initialization failed after retry (${context}):`,
                    chrome.runtime.lastError
                  )
                } else {
                  console.log(
                    `✅ Snapshot initialized successfully after retry (${context})`
                  )
                }
              }
            )
          }, 500)
        } else {
          // Verify snapshot was written successfully
          chrome.storage.local.get(['realtimeMonitoring'], result => {
            if (chrome.runtime.lastError) {
              console.warn(
                `⚠️ Could not verify snapshot write (${context}):`,
                chrome.runtime.lastError
              )
            } else if (result.realtimeMonitoring) {
              console.log(`✅ Snapshot initialized and verified (${context})`)
            } else {
              console.warn(
                `⚠️ Snapshot write verification failed (${context}) - snapshot not found after write`
              )
              // Retry initialization
              setTimeout(
                () => initializeSnapshotWithVerification(context + '_retry'),
                1000
              )
            }
          })
        }
      }
    )
  } catch (e) {
    console.warn(`⚠️ Error initializing snapshot (${context}):`, e)
    // Fallback: try again after delay
    setTimeout(
      () => initializeSnapshotWithVerification(context + '_fallback'),
      1000
    )
  }
}

function start () {
  // Respect extension enabled/disabled state
  try {
    chrome.storage.local.get(['extEnabled'], res => {
      const enabled = res.extEnabled !== false // default true
      if (!enabled) {
        console.log('NE-Attend: extension disabled, not starting tracker')
        meetingStatus = 'idle'
        meetingStatusTimestamp = Date.now()
        return
      }

      // Start health monitoring now that we're on an actual meeting page
      startHealthMonitoring()

      // PRE-JOIN PAGE CHECK: Don't start tracking until user actually joins
      // This prevents false "No participants found" warnings on the waiting page
      if (isOnPreJoinPage()) {
        console.log(
          '📍 Detected pre-join page - waiting for user to join meeting'
        )
        waitForUserToJoinMeeting(() => {
          // Recursively call start() once user has joined
          start()
        })
        return
      }

      // Reset submission state for new meeting
      submissionInProgress = false
      submissionCompleted = false
      finalizationAttempts = 0
      finalizedOnce = false
      console.log('🔄 Reset submission state for new meeting')

      // Set meeting status to active when tracking begins
      meetingStatus = 'active'
      meetingStatusTimestamp = Date.now()
      console.log('📊 Meeting status: active (tracking started)')

      // PHASE 1 FIX: Setup meeting end detection event listeners
      setupMeetingEndListeners()

      // Start periodic token refresh check
      startTokenRefreshInterval()

      // Try to setup MutationObserver for efficient monitoring
      const observerSetup = setupParticipantsObserver()

      if (observerSetup) {
        console.log('✅ Using MutationObserver for participant tracking')
        // Still run interval but less frequently as backup
        tracking = setInterval(track_attendance, 5000) // Every 5s instead of 1s

        // Initialize empty snapshot when tracking starts with verification
        initializeSnapshotWithVerification('observer')
      } else {
        // Only log this warning once, then throttle
        if (warningThrottle.shouldLog('observer_fallback', 60000)) {
          console.log('⚠️ MutationObserver setup failed, using timer fallback')
          console.log(
            '💡 This usually means the participants panel is not open yet'
          )
          warningThrottle.warn('observer_fallback', '', 60000)
        }
        // Fallback to original 1s interval
        tracking = setInterval(track_attendance, 1000)

        // Initialize empty snapshot when tracking starts (timer fallback path) with verification
        initializeSnapshotWithVerification('timer_fallback')

        // Retry observer setup multiple times with delays
        // Also retry when participants are detected (panel might have opened)
        let retryCount = 0
        const maxRetries = 12 // Try for up to 60 seconds (5s intervals)
        const retryObserver = () => {
          if (retryCount < maxRetries && !participantsObserver) {
            setTimeout(() => {
              // Check if participants are being detected - if so, container should be findable
              const testMap = new Map()
              collectParticipantsInto(testMap)
              if (testMap.size > 0 && !participantsObserver) {
                // Participants found but observer not set up - force retry
                console.log(
                  `🔄 Retrying observer setup (attempt ${
                    retryCount + 1
                  }/${maxRetries}) - ${testMap.size} participants detected`
                )
              }

              if (setupParticipantsObserver()) {
                console.log('✅ MutationObserver setup succeeded on retry')
                // Slow down interval since observer is working
                clearInterval(tracking)
                tracking = setInterval(track_attendance, 5000)
                warningThrottle.clear('observer_fallback') // Clear warning on success
              } else {
                retryCount++
                retryObserver()
              }
            }, 5000)
          } else if (retryCount >= maxRetries && !participantsObserver) {
            console.warn(
              '⚠️ Observer setup failed after all retries, continuing with timer fallback'
            )
          }
        }

        if (!observerSetupAttempted) {
          retryObserver()
        }

        // Also set up a periodic check that retries observer setup when participants are detected
        // This handles the case where panel opens after initial setup attempts
        if (periodicObserverRetryInterval) {
          clearInterval(periodicObserverRetryInterval)
        }
        periodicObserverRetryInterval = setInterval(() => {
          if (!participantsObserver) {
            const testMap = new Map()
            collectParticipantsInto(testMap)
            if (testMap.size > 0) {
              // Participants are being detected, try to set up observer
              console.log(
                '🔄 Periodic retry: Participants detected, attempting observer setup...'
              )
              if (setupParticipantsObserver()) {
                console.log(
                  '✅ MutationObserver setup succeeded on periodic retry'
                )
                if (periodicObserverRetryInterval) {
                  clearInterval(periodicObserverRetryInterval)
                  periodicObserverRetryInterval = null
                }
                // Update tracking interval
                if (tracking) {
                  clearInterval(tracking)
                  tracking = setInterval(track_attendance, 5000)
                }
              }
            }
          } else {
            // Observer is set up, stop periodic retries
            if (periodicObserverRetryInterval) {
              clearInterval(periodicObserverRetryInterval)
              periodicObserverRetryInterval = null
            }
          }
        }, 10000) // Check every 10 seconds
      }
    })
  } catch {
    meetingStatus = 'active'
    meetingStatusTimestamp = Date.now()
    console.log('📊 Meeting status: active (tracking started - fallback path)')
    tracking = setInterval(track_attendance, 1000)

    // PHASE 1 FIX: Setup meeting end detection event listeners (fallback path)
    setupMeetingEndListeners()

    startTokenRefreshInterval()

    // Initialize empty snapshot when tracking starts (fallback path) with verification
    initializeSnapshotWithVerification('error_fallback')
  }
}

// Define STOP as a global reference for the stop function
let STOP
let stop = (STOP = async function () {
  // CRITICAL FIX: Check if submission already completed or in progress
  if (submissionCompleted) {
    console.log('✅ Submission already completed successfully - skipping retry')
    return
  }

  if (submissionInProgress) {
    console.log(
      '⏳ Submission already in progress - skipping concurrent attempt'
    )
    return
  }

  // CRITICAL FIX: Allow retry attempts instead of blocking after first call
  if (finalizedOnce && finalizationAttempts >= MAX_FINALIZATION_ATTEMPTS) {
    console.warn(
      `⚠️ Maximum finalization attempts (${MAX_FINALIZATION_ATTEMPTS}) reached - skipping`
    )
    return
  }

  finalizationAttempts++
  console.log(
    `🔄 Finalization attempt ${finalizationAttempts}/${MAX_FINALIZATION_ATTEMPTS}`
  )

  // Set flag after first attempt but don't block retries
  if (!finalizedOnce) {
    finalizedOnce = true
  }

  // Phase 1 Task 1: Enhanced logging for stop() call
  console.log(`🛑 === STOP() FUNCTION CALLED ===`)
  console.log(`   Timestamp: ${new Date().toISOString()}`)
  console.log(`   Meeting Duration: ${meetDuration}s`)
  console.log(`   Participants Tracked: ${attendanceData.size}`)

  clearInterval(tracking)
  if (periodicObserverRetryInterval) {
    clearInterval(periodicObserverRetryInterval)
    periodicObserverRetryInterval = null
  }
  // Clear pre-join check interval if still running
  if (preJoinCheckInterval) {
    clearInterval(preJoinCheckInterval)
    preJoinCheckInterval = null
    waitingForUserToJoin = false
  }
  // Phase 1 Task 1: Clear periodic meeting end check
  if (periodicMeetingEndCheckInterval) {
    clearInterval(periodicMeetingEndCheckInterval)
    periodicMeetingEndCheckInterval = null
    console.log('✅ Cleared periodic meeting end check interval')
  }
  stopTokenRefreshInterval()
  cleanupParticipantsObserver()
  // PHASE 1 FIX: Cleanup meeting end detection event listeners
  cleanupMeetingEndListeners()
  // Reset meeting status to idle when tracking stops
  meetingStatus = 'idle'
  meetingStatusTimestamp = Date.now()
  console.log('📊 Meeting status: idle (tracking stopped)')
  let meetCode = extractMeetCode() || 'unknown'
  let date = new Date()
  let dd = date.getDate()
  let mm = date.getMonth() + 1
  let yyyy = date.getFullYear()

  let uuid =
    'meet_attendance_report_' +
    meetCode +
    dd +
    mm +
    yyyy +
    date.getHours() +
    date.getMinutes() +
    date.getSeconds() +
    date.getMilliseconds()

  date = dd + '/' + mm + '/' + yyyy

  let stopTime = new Date()

  attendanceData.forEach(function (data, avatarUrl) {
    if (data.lastAttendedTimeStamp) {
      data.leaveTime = formatTimeHMS(data.lastAttendedTimeStamp)
      data.leaveTimeRaw = data.leaveTime
      data.leaveTimeIso = data.lastAttendedTimeStamp.toISOString()
    } else {
      data.leaveTime = '00:00:00'
      data.leaveTimeIso = null
      data.leaveTimeRaw = null
    }
    if (!data.timeOut && data.leaveTime) {
      data.timeOut = data.leaveTime
    }
    if (data.status === 'left') {
      data.statusLabel = formatStatusLabel('left')
      data.log = data.statusLabel
      data.isLive = false
    }
    attendanceData.set(avatarUrl, data)
  })

  var attendanceDetails = {
    meetCode: meetCode,
    date: date,
    startTime: startTime ? formatTimeHMS(startTime) : '00:00:00',
    startTimeIso: startTime ? startTime.toISOString() : null,
    stopTime: formatTimeHMS(stopTime),
    stopTimeIso: stopTime.toISOString(),
    participants: Array.from(attendanceData.values())
  }

  const attendanceReport = {}
  attendanceReport[uuid] = attendanceDetails

  chrome.storage.local.set(attendanceReport, function () {
    console.log('Attendance saved successfully.')
  })

  // Send data to NE-Attend website
  await sendAttendanceDataToNEAttend(attendanceDetails)
})

// PHASE 1 FIX: Setup meeting end detection event listeners
function setupMeetingEndListeners () {
  // CRITICAL FIX: Add beforeunload event listener as primary fallback
  // This is the most reliable way to detect tab close/navigation
  if (!meetingEndEventListeners.beforeunload) {
    const handleBeforeUnload = _event => {
      console.log('🚨 === BEFOREUNLOAD EVENT DETECTED ===')
      console.log('   Timestamp:', new Date().toISOString())
      console.log('   Meeting duration:', meetDuration, 'seconds')
      console.log('   Participants tracked:', attendanceData.size)
      console.log('   Final attendance submission starting...')

      // CRITICAL: Send beacon to ensure attendance is saved before page unloads
      // Using sendBeacon is more reliable than fetch for unload events
      if (attendanceData.size > 0 && !submissionCompleted && !finalizedOnce) {
        try {
          // Build attendance payload synchronously
          const meetCode = extractMeetCode() || 'unknown'
          const date = new Date()
          const dd = date.getDate()
          const mm = date.getMonth() + 1
          const yyyy = date.getFullYear()
          const dateStr = dd + '/' + mm + '/' + yyyy

          const attendanceDetails = {
            meetCode: meetCode,
            date: dateStr,
            startTime: startTime ? formatTimeHMS(startTime) : '00:00:00',
            stopTime: formatTimeHMS(date),
            participants: Array.from(attendanceData.values()),
            isUnauthenticated: true, // Always send as unauthenticated in beforeunload (safer)
            authWarning: true,
            source: 'beforeunload_beacon'
          }

          // Use sendBeacon for reliable delivery during page unload
          // Note: sendBeacon is synchronous so we use cached config from config.js
          // FIX: Use centralized config from window.neattendConfig (loaded by config.js)
          const neattendConfig = window.neattendConfig || {}
          const defaultConfig = neattendConfig.DEFAULT_CONFIG || {
            backendUrl: 'http://localhost:8000'
          }
          const backendUrl = defaultConfig.backendUrl
          const payload = JSON.stringify(attendanceDetails)
          const success = navigator.sendBeacon(
            `${backendUrl}/api/attendance`,
            new Blob([payload], { type: 'application/json' })
          )

          if (success) {
            console.log('✅ Beacon sent successfully for final attendance')
          } else {
            console.warn('⚠️ Beacon failed - will retry via stop()')
          }
        } catch (beaconError) {
          console.error('❌ Error sending beacon:', beaconError)
        }
      }

      // Also call stop() as a backup (may not complete before page unloads)
      if (!finalizedOnce && !submissionInProgress) {
        console.log('🔄 Calling stop() as backup in beforeunload')
        debouncedStop('beforeunload')
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    meetingEndEventListeners.beforeunload = handleBeforeUnload
    console.log(
      '✅ Added beforeunload event listener for meeting end detection (CRITICAL)'
    )
  }

  // Task 1.1: Add pagehide event listener (modern, works with bfcache)
  if (!meetingEndEventListeners.pagehide) {
    const handlePageHide = event => {
      console.log('📄 Pagehide event detected - meeting may be ending')
      console.log('   event.persisted:', event.persisted)

      // If page is persisted (bfcache), don't finalize yet
      // But if page is being unloaded, finalize
      if (!event.persisted) {
        console.log(
          '✅ Page is being unloaded (not persisted) - finalizing attendance'
        )
        debouncedStop('pagehide')
      } else {
        console.log('⏸️ Page persisted to bfcache - not finalizing yet')
      }
    }

    window.addEventListener('pagehide', handlePageHide)
    meetingEndEventListeners.pagehide = handlePageHide
    console.log('✅ Added pagehide event listener for meeting end detection')
  }

  // Task 1.2: Add visibilitychange event listener
  if (!meetingEndEventListeners.visibilitychange) {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page became hidden - start tracking time
        if (!visibilityHiddenStartTime) {
          visibilityHiddenStartTime = Date.now()
          console.log('👁️ Page became hidden - tracking visibility duration')
        }
      } else {
        // Page became visible again - reset timer
        if (visibilityHiddenStartTime) {
          const hiddenDuration = Date.now() - visibilityHiddenStartTime
          console.log(
            `👁️ Page became visible again after ${Math.floor(
              hiddenDuration / 1000
            )}s`
          )
          visibilityHiddenStartTime = null
        }
      }

      // Check if page has been hidden for extended period (>30s)
      if (document.hidden && visibilityHiddenStartTime) {
        const hiddenDuration = Date.now() - visibilityHiddenStartTime
        if (hiddenDuration > VISIBILITY_HIDDEN_THRESHOLD) {
          console.log(
            `⏱️ Page hidden for ${Math.floor(hiddenDuration / 1000)}s (>${
              VISIBILITY_HIDDEN_THRESHOLD / 1000
            }s threshold) - finalizing attendance`
          )
          debouncedStop('visibilitychange')
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    meetingEndEventListeners.visibilitychange = handleVisibilityChange
    console.log(
      '✅ Added visibilitychange event listener for meeting end detection'
    )
  }

  // Task 1.3: Add host leave detection
  if (!meetingEndEventListeners.hostLeaveObserver) {
    const checkHostLeave = () => {
      // Check if host participant is still present
      let hostFound = false
      participantsList.forEach((participant, _avatarUrl) => {
        // Check for host indicators in participant data
        if (
          participant.isHost ||
          participant.name?.toLowerCase().includes('host') ||
          participant.name?.toLowerCase().includes('organizer')
        ) {
          hostFound = true
        }
      })

      // Also check DOM for host indicators
      const hostIndicators = [
        '[data-participant-id*="host"]',
        '[aria-label*="host" i]',
        '[aria-label*="organizer" i]',
        'div[data-self-name*="host" i]',
        'div[data-self-name*="organizer" i]'
      ]

      for (const selector of hostIndicators) {
        try {
          const elements = document.querySelectorAll(selector)
          if (elements.length > 0) {
            hostFound = true
            break
          }
        } catch {
          // Invalid selector, skip
        }
      }

      // Check for "Meeting host" text in participants panel
      const participantsPanel = document.querySelector(
        '[data-panel-id="people"]'
      )
      if (participantsPanel) {
        const panelText = participantsPanel.textContent || ''
        if (
          panelText.toLowerCase().includes('meeting host') ||
          panelText.toLowerCase().includes('organizer')
        ) {
          hostFound = true
        }
      }

      // If host was previously detected but now missing, meeting may have ended
      if (window.hostPreviouslyDetected && !hostFound) {
        console.log('👤 Host participant left - finalizing attendance')
        debouncedStop('host_leave')
        window.hostPreviouslyDetected = false
      } else if (hostFound) {
        window.hostPreviouslyDetected = true
      }
    }

    // Check for host leave every 5 seconds
    meetingEndEventListeners.hostLeaveObserver = setInterval(
      checkHostLeave,
      5000
    )
    console.log('✅ Added host leave detection observer')
  }

  // Task 1.4: Add meeting end UI detection
  if (!meetingEndEventListeners.meetingEndObserver) {
    const checkMeetingEnd = () => {
      // Check for "Call ended" UI elements
      const meetingEndIndicators = [
        'div[data-message*="Call ended" i]',
        'div[data-message*="Meeting ended" i]',
        'div[data-message*="You left the meeting" i]',
        'div[aria-label*="Call ended" i]',
        'div[aria-label*="Meeting ended" i]',
        '[data-call-ended="true"]',
        '.call-ended',
        '.meeting-ended'
      ]

      for (const selector of meetingEndIndicators) {
        try {
          const elements = document.querySelectorAll(selector)
          if (elements.length > 0) {
            console.log(`✅ Meeting end UI detected: ${selector}`)
            debouncedStop('meeting_end_ui')
            return
          }
        } catch {
          // Invalid selector, skip
        }
      }

      // ENHANCED: Check for Google Meet leave/end dialog
      // Dialog container: div.VfPpkd-T0kwCb
      // "End the call for everyone" button: aria-label="End the call for everyone" or data-mdc-dialog-action="rbwiRc"
      const leaveDialog = document.querySelector('div.VfPpkd-T0kwCb')
      if (leaveDialog) {
        const endForEveryoneButton = leaveDialog.querySelector(
          'button[aria-label="End the call for everyone"], ' +
            'button[data-mdc-dialog-action="rbwiRc"], ' +
            'button[aria-label*="End the call for everyone" i]'
        )

        if (endForEveryoneButton) {
          console.log(
            '✅ Google Meet "End the call for everyone" dialog detected'
          )
          console.log(
            '   Dialog container found, "End for everyone" button present'
          )
          debouncedStop('meeting_end_dialog')
          return
        }

        // Also check for "Just leave the call" button (host leaves but meeting continues)
        const justLeaveButton = leaveDialog.querySelector(
          'button[aria-label="Just leave the call"], ' +
            'button[data-mdc-dialog-action="Pd96ce"], ' +
            'button[aria-label*="Just leave the call" i]'
        )

        if (justLeaveButton) {
          console.log('⚠️ Google Meet "Just leave the call" dialog detected')
          console.log(
            '   Host may leave but meeting continues - monitoring for actual meeting end'
          )
          // Don't stop yet - host leaving doesn't mean meeting ends
          // But set a flag to watch more closely
          window.hostLeaveDialogDetected = true
        }
      }

      // Also check for text content containing meeting end messages
      const bodyText = document.body?.textContent || ''
      if (
        bodyText.match(
          /call\s+ended|meeting\s+ended|you\s+left\s+the\s+meeting/i
        )
      ) {
        console.log('✅ Meeting end text detected in page content')
        debouncedStop('meeting_end_text')
      }
    }

    // Check for meeting end UI every 3 seconds
    meetingEndEventListeners.meetingEndObserver = setInterval(
      checkMeetingEnd,
      3000
    )
    console.log('✅ Added meeting end UI detection observer')
  }

  // Task 1.5: Add Google Meet leave/end dialog MutationObserver (REAL-TIME detection)
  if (!meetingEndEventListeners.leaveDialogObserver) {
    const setupLeaveDialogObserver = () => {
      // Watch for dialog container appearance
      const dialogObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
          // Check for added nodes
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if dialog container was added
              if (
                node.classList?.contains('VfPpkd-T0kwCb') ||
                node.querySelector?.('div.VfPpkd-T0kwCb')
              ) {
                const dialog = node.classList?.contains('VfPpkd-T0kwCb')
                  ? node
                  : node.querySelector('div.VfPpkd-T0kwCb')

                if (dialog) {
                  console.log('🔍 Google Meet leave/end dialog appeared')

                  // Check for "End the call for everyone" button
                  const endForEveryoneButton = dialog.querySelector(
                    'button[aria-label="End the call for everyone"], ' +
                      'button[data-mdc-dialog-action="rbwiRc"], ' +
                      'button[aria-label*="End the call for everyone" i]'
                  )

                  if (endForEveryoneButton) {
                    console.log(
                      '✅ "End the call for everyone" button detected in dialog'
                    )

                    // Add click listener to button (if not already added)
                    const buttonId =
                      endForEveryoneButton.getAttribute(
                        'data-mdc-dialog-action'
                      ) ||
                      endForEveryoneButton.getAttribute('aria-label') ||
                      'end-for-everyone'

                    if (!leaveDialogButtonListeners.has(buttonId)) {
                      const handleEndForEveryone = event => {
                        console.log(
                          '🛑 "End the call for everyone" button clicked - meeting ending'
                        )
                        console.log(
                          '   Event:',
                          event.type,
                          'Target:',
                          event.target
                        )
                        debouncedStop('meeting_end_dialog_click')
                        // Remove listener after use
                        endForEveryoneButton.removeEventListener(
                          'click',
                          handleEndForEveryone
                        )
                        leaveDialogButtonListeners.delete(buttonId)
                      }

                      endForEveryoneButton.addEventListener(
                        'click',
                        handleEndForEveryone,
                        { once: true }
                      )
                      leaveDialogButtonListeners.set(
                        buttonId,
                        handleEndForEveryone
                      )
                      console.log(
                        '✅ Added click listener to "End the call for everyone" button'
                      )
                    }

                    // Also trigger stop immediately if button is visible (proactive detection)
                    // This catches cases where button appears but user hasn't clicked yet
                    if (endForEveryoneButton.offsetParent !== null) {
                      console.log(
                        '⚠️ "End the call for everyone" button is visible - meeting may end soon'
                      )
                      // Don't stop immediately - wait for click or actual meeting end
                      // But log for monitoring
                    }
                  }

                  // Also check for "Just leave the call" button (for monitoring)
                  const justLeaveButton = dialog.querySelector(
                    'button[aria-label="Just leave the call"], ' +
                      'button[data-mdc-dialog-action="Pd96ce"], ' +
                      'button[aria-label*="Just leave the call" i]'
                  )

                  if (justLeaveButton) {
                    console.log(
                      '⚠️ "Just leave the call" button detected - host may leave but meeting continues'
                    )
                    // Don't stop - just monitor
                    window.hostLeaveDialogDetected = true
                  }
                }
              }
            }
          }
        }
      })

      // Start observing document body for dialog appearance
      dialogObserver.observe(document.body, {
        childList: true,
        subtree: true
      })

      meetingEndEventListeners.leaveDialogObserver = dialogObserver
      console.log('✅ Added MutationObserver for Google Meet leave/end dialog')
    }

    setupLeaveDialogObserver()
  }

  // Phase 1 Task 1: Add periodic check for meeting end (30s fallback)
  if (!periodicMeetingEndCheckInterval) {
    const performPeriodicCheck = () => {
      if (finalizedOnce) {
        // Already finalized, clear interval
        if (periodicMeetingEndCheckInterval) {
          clearInterval(periodicMeetingEndCheckInterval)
          periodicMeetingEndCheckInterval = null
        }
        return
      }

      // Check if meeting appears to have ended
      const now = Date.now()
      const timeSinceLastUpdate = now - meetingStatusTimestamp
      const participantsCount = attendanceData.size

      // Phase 1 Task 1: Enhanced logging for periodic check
      console.log(`⏰ === PERIODIC MEETING END CHECK ===`)
      console.log(`   Timestamp: ${new Date().toISOString()}`)
      console.log(`   Meeting Status: ${meetingStatus}`)
      console.log(
        `   Time Since Last Update: ${Math.floor(timeSinceLastUpdate / 1000)}s`
      )
      console.log(`   Participants Tracked: ${participantsCount}`)
      console.log(`   Meeting Duration: ${meetDuration}s`)

      // Check for indicators that meeting may have ended:
      // 1. No participants tracked for extended period
      // 2. Meeting status is idle but we were tracking
      // 3. Page is hidden for extended period
      let shouldFinalize = false
      let finalizeReason = ''

      if (participantsCount === 0 && meetDuration > 60) {
        // No participants and meeting has been running for more than 1 minute
        // This might indicate meeting ended
        shouldFinalize = true
        finalizeReason = 'periodic_check_no_participants'
        console.log(
          `⚠️ Periodic check: No participants tracked for ${meetDuration}s - meeting may have ended`
        )
      } else if (meetingStatus === 'idle' && meetDuration > 10) {
        // Status is idle but we were tracking - meeting may have ended
        shouldFinalize = true
        finalizeReason = 'periodic_check_idle_status'
        console.log(
          `⚠️ Periodic check: Meeting status is idle but tracking was active - meeting may have ended`
        )
      } else if (document.hidden && visibilityHiddenStartTime) {
        const hiddenDuration = now - visibilityHiddenStartTime
        if (hiddenDuration > VISIBILITY_HIDDEN_THRESHOLD * 2) {
          // Page has been hidden for more than 60 seconds
          shouldFinalize = true
          finalizeReason = 'periodic_check_extended_hidden'
          console.log(
            `⚠️ Periodic check: Page hidden for ${Math.floor(
              hiddenDuration / 1000
            )}s (>${
              (VISIBILITY_HIDDEN_THRESHOLD * 2) / 1000
            }s) - meeting may have ended`
          )
        }
      }

      if (shouldFinalize) {
        console.log(
          `🛑 Periodic check triggered finalization: ${finalizeReason}`
        )
        debouncedStop(finalizeReason)
      } else {
        console.log(
          `✅ Periodic check: Meeting appears active - continuing monitoring`
        )
      }
    }

    // Start periodic check every 30 seconds
    periodicMeetingEndCheckInterval = setInterval(
      performPeriodicCheck,
      PERIODIC_MEETING_END_CHECK_MS
    )
    console.log(
      `✅ Added periodic meeting end check (every ${
        PERIODIC_MEETING_END_CHECK_MS / 1000
      }s)`
    )

    // Phase 1 Task 1: Add manual finalization trigger (for testing/debugging)
    // Expose global function for manual trigger
    window.manualFinalizeAttendance = function (reason = 'manual_trigger') {
      if (finalizedOnce) {
        console.warn('⚠️ Attendance already finalized - cannot finalize again')
        return false
      }

      console.log(`🔧 === MANUAL FINALIZATION TRIGGERED ===`)
      console.log(`   Reason: ${reason}`)
      console.log(`   Timestamp: ${new Date().toISOString()}`)
      console.log(`   Meeting Duration: ${meetDuration}s`)
      console.log(`   Participants Tracked: ${attendanceData.size}`)

      // Call stop() directly (bypass debounce for manual trigger)
      stop().catch(error => {
        console.error('❌ Error in manual finalization:', error)
      })

      return true
    }

    console.log(
      '✅ Added manual finalization trigger: window.manualFinalizeAttendance()'
    )
  }
}

// PHASE 1 FIX: Cleanup meeting end detection event listeners
function cleanupMeetingEndListeners () {
  // CRITICAL: Remove beforeunload listener
  if (meetingEndEventListeners.beforeunload) {
    window.removeEventListener(
      'beforeunload',
      meetingEndEventListeners.beforeunload
    )
    meetingEndEventListeners.beforeunload = null
    console.log('🧹 Removed beforeunload event listener')
  }

  // Remove pagehide listener
  if (meetingEndEventListeners.pagehide) {
    window.removeEventListener('pagehide', meetingEndEventListeners.pagehide)
    meetingEndEventListeners.pagehide = null
    console.log('🧹 Removed pagehide event listener')
  }

  // Remove visibilitychange listener
  if (meetingEndEventListeners.visibilitychange) {
    document.removeEventListener(
      'visibilitychange',
      meetingEndEventListeners.visibilitychange
    )
    meetingEndEventListeners.visibilitychange = null
    console.log('🧹 Removed visibilitychange event listener')
  }

  // Clear host leave observer
  if (meetingEndEventListeners.hostLeaveObserver) {
    clearInterval(meetingEndEventListeners.hostLeaveObserver)
    meetingEndEventListeners.hostLeaveObserver = null
    console.log('🧹 Removed host leave detection observer')
  }

  // Clear meeting end UI observer
  if (meetingEndEventListeners.meetingEndObserver) {
    clearInterval(meetingEndEventListeners.meetingEndObserver)
    meetingEndEventListeners.meetingEndObserver = null
    console.log('🧹 Removed meeting end UI detection observer')
  }

  // Clear leave dialog MutationObserver
  if (meetingEndEventListeners.leaveDialogObserver) {
    meetingEndEventListeners.leaveDialogObserver.disconnect()
    meetingEndEventListeners.leaveDialogObserver = null
    console.log('🧹 Removed leave dialog MutationObserver')
  }

  // Phase 1 Task 1: Clear periodic meeting end check
  if (periodicMeetingEndCheckInterval) {
    clearInterval(periodicMeetingEndCheckInterval)
    periodicMeetingEndCheckInterval = null
    console.log('🧹 Removed periodic meeting end check interval')
  }

  // Remove all button click listeners
  leaveDialogButtonListeners.forEach((listener, buttonId) => {
    // Listeners are already removed when buttons are clicked (once: true)
    // But clean up any remaining references
    leaveDialogButtonListeners.delete(buttonId)
  })
  leaveDialogButtonListeners.clear()

  // Reset visibility tracking
  visibilityHiddenStartTime = null
  window.hostPreviouslyDetected = false
  window.hostLeaveDialogDetected = false
}

// PHASE 1 FIX: Debounced stop function to prevent duplicate calls
// Phase 1 Task 1: Enhanced debouncedStop with different delays for different event types
function debouncedStop (reason) {
  if (finalizedOnce) {
    console.log(`⚠️ Stop() already called, ignoring ${reason} trigger`)
    return
  }

  // Phase 1 Task 1: Determine debounce delay based on event type
  const criticalEvents = [
    'pagehide',
    'meeting_end_ui',
    'meeting_end_dialog',
    'meeting_end_dialog_click',
    'meeting_end_text'
  ]
  const isCritical = criticalEvents.includes(reason)
  const debounceDelay = isCritical
    ? STOP_DEBOUNCE_MS_CRITICAL
    : STOP_DEBOUNCE_MS_NORMAL

  // Clear existing debounce timer
  if (stopDebounceTimer) {
    clearTimeout(stopDebounceTimer)
  }

  // Phase 1 Task 1: Enhanced logging for each listener trigger
  console.log(`⏱️ === DEBOUNCING STOP() CALL ===`)
  console.log(`   Reason: ${reason}`)
  console.log(`   Event Type: ${isCritical ? 'CRITICAL' : 'NORMAL'}`)
  console.log(`   Debounce Delay: ${debounceDelay}ms`)
  console.log(`   Timestamp: ${new Date().toISOString()}`)

  // Set new debounce timer
  stopDebounceTimer = setTimeout(async () => {
    console.log(`✅ === CALLING STOP() AFTER DEBOUNCE ===`)
    console.log(`   Reason: ${reason}`)
    console.log(`   Debounce Delay: ${debounceDelay}ms`)
    console.log(`   Timestamp: ${new Date().toISOString()}`)
    stopDebounceTimer = null

    // HOST IDENTITY LOCK: Clear locked host when meeting ends
    unlockHostIdentity('meeting_ended_' + reason)

    // FIX: Send meeting:ended notification to backend BEFORE stopping
    // This notifies the Dashboard to stop showing live data
    const hostEndedReasons = [
      'meeting_end_dialog_click',
      'meeting_end_dialog',
      'meeting_end_ui',
      'meeting_end_text',
      'host_leave'
    ]
    const isHostEnded = hostEndedReasons.includes(reason)

    if (isHostEnded) {
      console.log('📡 Sending meeting:ended notification to backend...')
      try {
        const credentials = await getAuthCredentials()
        const config = await _getConfig()
        const meetCode = extractMeetCode()

        // Send meeting ended notification via progress endpoint
        const endPayload = {
          type: 'meeting_ended',
          meetCode: meetCode,
          subjectId: credentials?.subjectId || null,
          verificationToken: credentials?.verificationToken || null,
          reason: reason,
          timestamp: new Date().toISOString(),
          isUnauthenticated: !credentials?.verificationToken
        }

        const safeFetchFn = window.safeFetch || globalThis.safeFetch || fetch
        safeFetchFn(`${config.backendUrl}/api/attendance/meeting-ended`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(endPayload)
        })
          .then(response => {
            if (response.ok) {
              console.log('✅ Meeting:ended notification sent successfully')
            } else {
              console.warn(
                '⚠️ Meeting:ended notification failed:',
                response.status
              )
            }
          })
          .catch(err => {
            console.warn('⚠️ Could not send meeting:ended notification:', err)
          })
      } catch (err) {
        console.warn('⚠️ Error sending meeting:ended notification:', err)
      }
    }

    stop().catch(error => {
      console.error('❌ Error in stop() function:', error)
    })
  }, debounceDelay)
}

// Validate token before submission to catch mismatches early
function validateTokenBeforeSubmission (credentials, attendanceDetails) {
  const validationErrors = []
  const warnings = []

  // Check meetCode match
  const tokenMeetCode = (credentials.meetCode || '').toLowerCase().trim()
  const requestMeetCode = (attendanceDetails.meetCode || '')
    .toLowerCase()
    .trim()

  if (tokenMeetCode && requestMeetCode && tokenMeetCode !== requestMeetCode) {
    validationErrors.push({
      type: 'meetcode_mismatch',
      message: `Token meetCode (${tokenMeetCode}) does not match request meetCode (${requestMeetCode})`,
      userMessage:
        'Token was generated for a different meeting. Please rejoin the meeting through NE-Attend dashboard.'
    })
  }

  // Check if token format is valid
  const tokenType =
    credentials.verificationToken?.includes('.') &&
    credentials.verificationToken.split('.').length === 3
      ? 'JWT'
      : 'Legacy'

  if (
    !credentials.verificationToken ||
    credentials.verificationToken.length < 10
  ) {
    validationErrors.push({
      type: 'invalid_token_format',
      message: 'Token format is invalid or too short',
      userMessage:
        'Token format is invalid. Please rejoin the meeting through NE-Attend dashboard.'
    })
  }

  // Log validation results
  if (validationErrors.length > 0) {
    console.error('❌ Token validation failed:', validationErrors)
  } else {
    console.log('✅ Token validation passed:', {
      meetCodeMatch:
        !tokenMeetCode || !requestMeetCode || tokenMeetCode === requestMeetCode,
      tokenType: tokenType,
      subjectId: credentials.subjectId,
      meetCode: credentials.meetCode
    })
  }

  return {
    valid: validationErrors.length === 0,
    errors: validationErrors,
    warnings: warnings
  }
}

// Phase 1 Task 3: Add failed final attendance submission to retry queue
// Note: This is different from the progress update retry queue (addToRetryQueue at line ~269)
async function addFinalAttendanceToRetryQueue (
  attendanceDetails,
  errorInfo = {}
) {
  try {
    const queueItem = {
      attendanceDetails: attendanceDetails,
      errorInfo: errorInfo,
      attemptCount: 0,
      lastAttemptTime: null,
      createdAt: new Date().toISOString(),
      meetCode: attendanceDetails.meetCode,
      date: attendanceDetails.date
    }

    chrome.storage.local.get([RETRY_QUEUE_KEY], result => {
      const queue = result[RETRY_QUEUE_KEY] || []
      queue.push(queueItem)
      chrome.storage.local.set({ [RETRY_QUEUE_KEY]: queue }, () => {
        console.log('📦 Added failed submission to retry queue:', {
          meetCode: attendanceDetails.meetCode,
          date: attendanceDetails.date,
          participants: attendanceDetails.participants?.length || 0,
          queueSize: queue.length
        })
      })
    })
  } catch (error) {
    console.error('❌ Error adding to retry queue:', error)
  }
}

// Phase 1 Task 3: Process final attendance retry queue with exponential backoff
// Note: This is different from the progress update retry queue (processRetryQueue at line ~314)
// eslint-disable-next-line no-unused-vars
async function processFinalAttendanceRetryQueue () {
  if (retryQueueProcessing) {
    console.log('⏸️ Retry queue processing already in progress, skipping')
    return
  }

  retryQueueProcessing = true
  console.log('🔄 === PROCESSING FINAL ATTENDANCE RETRY QUEUE ===')

  try {
    chrome.storage.local.get([RETRY_QUEUE_KEY], async result => {
      const queue = result[RETRY_QUEUE_KEY] || []

      if (queue.length === 0) {
        console.log('✅ Retry queue is empty')
        retryQueueProcessing = false
        return
      }

      console.log(`📦 Processing ${queue.length} item(s) from retry queue`)

      const updatedQueue = []

      for (const item of queue) {
        const attemptCount = item.attemptCount || 0

        if (attemptCount >= MAX_RETRY_ATTEMPTS) {
          console.log(
            `❌ Max retry attempts reached for item: ${item.meetCode} (${item.date})`
          )
          console.log('   Removing from queue - submission failed permanently')
          // Don't add to updatedQueue - effectively removes it
          continue
        }

        const delay =
          RETRY_DELAYS[attemptCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
        const timeSinceLastAttempt = item.lastAttemptTime
          ? Date.now() - new Date(item.lastAttemptTime).getTime()
          : Infinity

        // Only retry if enough time has passed since last attempt
        if (timeSinceLastAttempt < delay) {
          console.log(
            `⏳ Waiting for retry delay (${delay}ms) for item: ${item.meetCode}`
          )
          updatedQueue.push(item)
          continue
        }

        console.log(
          `🔄 Retrying submission (attempt ${
            attemptCount + 1
          }/${MAX_RETRY_ATTEMPTS}):`,
          {
            meetCode: item.meetCode,
            date: item.date,
            participants: item.attendanceDetails.participants?.length || 0
          }
        )

        // Update attempt count and timestamp
        item.attemptCount = attemptCount + 1
        item.lastAttemptTime = new Date().toISOString()

        // Try to resubmit
        try {
          // Get fresh credentials
          const credentials = await getAuthCredentials()
          const _config = await _getConfig() // Reserved for future use

          const isUnauthenticated =
            !credentials ||
            !credentials.verificationToken ||
            !credentials.subjectId

          const retryPayload = {
            ...item.attendanceDetails,
            verificationToken: credentials?.verificationToken || null,
            subjectId: credentials?.subjectId || null,
            isUnauthenticated: isUnauthenticated,
            authWarning: isUnauthenticated
          }

          chrome.runtime.sendMessage(
            { type: 'ATTENDANCE_FINAL', payload: retryPayload },
            res => {
              if (res && res.ok) {
                console.log(
                  `✅ Retry successful for item: ${item.meetCode} (${item.date})`
                )
                // Remove from queue on success
                // Don't add to updatedQueue
              } else {
                console.warn(
                  `⚠️ Retry failed for item: ${item.meetCode} (${item.date})`
                )
                console.warn('   Response:', res)
                // Keep in queue for next attempt
                updatedQueue.push(item)
              }
            }
          )
        } catch (retryError) {
          console.error(
            `❌ Error during retry for item: ${item.meetCode}`,
            retryError
          )
          // Keep in queue for next attempt
          updatedQueue.push(item)
        }
      }

      // Update queue with remaining items
      chrome.storage.local.set({ [RETRY_QUEUE_KEY]: updatedQueue }, () => {
        console.log(
          `✅ Retry queue updated: ${updatedQueue.length} item(s) remaining`
        )
        if (updatedQueue.length > 0) {
          console.log(
            '   💡 Will retry again on next extension load or after delay'
          )
        }
      })

      retryQueueProcessing = false
    })
  } catch (error) {
    console.error('❌ Error processing retry queue:', error)
    retryQueueProcessing = false
  }
}

// Phase 1 Task 3: Initialize retry queue processing on extension load
function initializeRetryQueue () {
  console.log('🔄 Initializing retry queue processing...')
  // Process queue immediately on load
  processRetryQueue()

  // Also process queue periodically (every 5 minutes)
  setInterval(() => {
    processRetryQueue()
  }, 5 * 60 * 1000) // 5 minutes
}

// Phase 1 Task 3: Call initializeRetryQueue when extension loads
if (typeof window !== 'undefined') {
  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRetryQueue)
  } else {
    initializeRetryQueue()
  }
}

// Function to send attendance data to NE-Attend website
async function sendAttendanceDataToNEAttend (attendanceDetails) {
  try {
    // Mark submission as in progress to prevent concurrent attempts
    submissionInProgress = true
    console.log('🔒 Submission started - marked as in progress')

    // Prevent duplicate submissions: Check if already submitted
    const submissionKey = `attendance_submitted_${attendanceDetails.meetCode}_${attendanceDetails.date}`
    const submissionCheck = await new Promise(resolve => {
      chrome.storage.local.get([submissionKey], result => {
        resolve(result[submissionKey] || false)
      })
    })

    if (submissionCheck) {
      console.log(
        '⚠️ Attendance already submitted for this session, skipping duplicate submission'
      )
      console.log('   MeetCode:', attendanceDetails.meetCode)
      console.log('   Date:', attendanceDetails.date)
      submissionCompleted = true // Mark as completed
      submissionInProgress = false
      return
    }

    const credentials = await getAuthCredentials()
    const config = await _getConfig()

    // Phase 1 Task 2: Determine if this is an unauthenticated submission
    const isUnauthenticated =
      !credentials || !credentials.verificationToken || !credentials.subjectId

    if (isUnauthenticated) {
      // Phase 1 Task 2: Send even if unauthenticated (with warnings)
      console.log('⚠️ === UNAUTHENTICATED FINAL ATTENDANCE SUBMISSION ===')
      console.log('   MeetCode:', attendanceDetails.meetCode)
      console.log(
        '   Participants:',
        attendanceDetails.participants?.length || 0
      )
      console.log('   Date:', attendanceDetails.date)
      console.log('   ⚠️ This submission will be marked as unauthenticated')
      console.log('   💡 Records will be saved with subjectId: null')
      console.log('   💡 History will show warning for unauthenticated records')

      // Use throttled warning (show once per throttle period)
      const warningKey = `final_attendance_unauthenticated_${
        attendanceDetails.meetCode || 'unknown'
      }`
      if (
        warningThrottle.warn(
          warningKey,
          `⚠️ Sending final attendance without authentication\n   Attendance data will be saved but marked as unauthenticated\n   MeetCode: ${
            attendanceDetails.meetCode
          }\n   Participants: ${
            attendanceDetails.participants?.length || 0
          }\n   💡 Join meeting through NE-Attend dashboard for authenticated tracking`,
          60000
        )
      ) {
        // Show user-friendly message
        const dashboardUrl = `${config.frontendUrl}/dashboard`
        const _infoMsg = // Used in showNotification below
          `📋 Attendance Being Submitted (Unauthenticated)\n\n` +
          `Your attendance data (${
            attendanceDetails.participants?.length || 0
          } participants) is being sent to the server.\n\n` +
          `⚠️ This submission is unauthenticated and will be marked accordingly.\n\n` +
          `💡 For authenticated tracking:\n` +
          `1. Open: ${dashboardUrl}\n` +
          `2. Navigate to your subject/group\n` +
          `3. Click "Join Meeting" to generate a token\n\n` +
          `Your attendance data is safe and will be available in History.`

        // Show notification instead of alert (less intrusive)
        showNotification(
          'Attendance submitted (unauthenticated). Join through dashboard for authenticated tracking.',
          'warning'
        )
      }
    } else {
      // Update credential state cache on success
      credentialStateCache.lastCheck = Date.now()
      credentialStateCache.lastResult = credentials
      credentialStateCache.consecutiveFailures = 0
      const meetCode = extractMeetCode()
      if (meetCode) {
        warningThrottle.clear(`final_attendance_no_creds_${meetCode}`)
      }

      // Pre-flight validation: Check token matches request before sending
      const validation = validateTokenBeforeSubmission(
        credentials,
        attendanceDetails
      )
      if (!validation.valid) {
        console.error('❌ Pre-flight validation failed:', validation.errors)

        // Clear token cache to force refresh
        tokenCache = null
        tokenCacheTime = 0

        // Try to get fresh token
        console.log(
          '🔄 Attempting to get fresh token after validation failure...'
        )
        await new Promise(resolve => setTimeout(resolve, 1000))

        const freshCredentials = await getAuthCredentials()
        if (
          freshCredentials &&
          freshCredentials.verificationToken &&
          freshCredentials.subjectId
        ) {
          // Re-validate with fresh credentials
          const freshValidation = validateTokenBeforeSubmission(
            freshCredentials,
            attendanceDetails
          )
          if (freshValidation.valid) {
            console.log(
              '✅ Fresh token passed validation, continuing with submission'
            )
            // Use fresh credentials
            Object.assign(credentials, freshCredentials)
          } else {
            // Still invalid, fall back to unauthenticated submission
            console.warn(
              '⚠️ Token validation failed, falling back to unauthenticated submission'
            )
            const errorMsg = validation.errors
              .map(e => e.userMessage)
              .join('\n\n')
            showNotification(
              `Token validation failed. Submitting as unauthenticated. ${errorMsg}`,
              'warning'
            )
            // Continue with unauthenticated submission
          }
        } else {
          // No fresh token available, fall back to unauthenticated submission
          console.warn(
            '⚠️ No fresh token available, falling back to unauthenticated submission'
          )
          const errorMsg = validation.errors
            .map(e => e.userMessage)
            .join('\n\n')
          showNotification(
            `No valid token found. Submitting as unauthenticated. ${errorMsg}`,
            'warning'
          )
          // Continue with unauthenticated submission
        }
      }

      // Enhanced logging: Log token details before sending (only if authenticated)
      if (credentials && credentials.verificationToken) {
        const tokenType =
          credentials.verificationToken.includes('.') &&
          credentials.verificationToken.split('.').length === 3
            ? 'JWT'
            : 'Legacy'
        console.log('📋 Final attendance submission - Token details:', {
          tokenType: tokenType,
          tokenLength: credentials.verificationToken.length,
          subjectId: credentials.subjectId,
          meetCode: credentials.meetCode || attendanceDetails.meetCode,
          requestMeetCode: attendanceDetails.meetCode,
          meetCodeMatch:
            (credentials.meetCode || '').toLowerCase() ===
            (attendanceDetails.meetCode || '').toLowerCase(),
          participantsCount: attendanceDetails.participants?.length || 0,
          date: attendanceDetails.date,
          startTime: attendanceDetails.startTime,
          stopTime: attendanceDetails.stopTime
        })
      }
    }

    // Phase 1 Task 2: Build payload with or without credentials
    const finalPayload = {
      ...attendanceDetails,
      verificationToken: credentials?.verificationToken || null,
      subjectId: credentials?.subjectId || null, // null if unauthenticated
      isUnauthenticated: isUnauthenticated, // Phase 1 Task 2: Flag for unauthenticated submissions
      authWarning: isUnauthenticated // Backward compatibility flag
    }

    // Phase 1 Task 2: Log payload structure (sanitized) for debugging
    console.log('📦 Final attendance payload structure:', {
      hasVerificationToken: !!finalPayload.verificationToken,
      hasSubjectId: !!finalPayload.subjectId,
      isUnauthenticated: finalPayload.isUnauthenticated,
      hasMeetCode: !!finalPayload.meetCode,
      hasDate: !!finalPayload.date,
      hasParticipants: !!finalPayload.participants,
      participantsCount: finalPayload.participants?.length || 0,
      verificationTokenLength: finalPayload.verificationToken?.length || 0,
      subjectId: finalPayload.subjectId,
      meetCode: finalPayload.meetCode
    })

    const dashboardPath = credentials?.dashboardPath || '/dashboard'
    const frontendUrl = config.frontendUrl

    chrome.runtime.sendMessage(
      { type: 'ATTENDANCE_FINAL', payload: finalPayload },
      async res => {
        console.log('Attendance data sent to NE-Attend:', res)

        if (res && res.ok) {
          // Mark as submitted on success
          chrome.storage.local.set(
            {
              [submissionKey]: {
                submitted: true,
                timestamp: new Date().toISOString(),
                meetCode: attendanceDetails.meetCode,
                date: attendanceDetails.date
              }
            },
            () => {
              console.log('✅ Attendance submission marked as completed')
              submissionCompleted = true // Mark as successfully completed
              submissionInProgress = false
            }
          )
        } else if (res && res.status === 401) {
          // Handle 401 errors with token refresh attempt
          const errorType = res.errorType || 'unknown'
          const errorMessage =
            res.error?.message || res.error?.error || 'Authentication failed'
          const userMessage =
            res.userMessage || res.errorDetails || errorMessage

          console.warn(
            '⚠️ Attendance submission failed with 401, attempting token refresh...'
          )
          console.warn('   Error type:', errorType)
          console.warn('   Error message:', errorMessage)
          console.warn('   User message:', userMessage)

          // Determine if error is retryable (token refresh might help)
          // Note: 'token_consumed' removed from retryable - if token is consumed, submission likely succeeded
          const retryableErrors = ['token_expired', 'unauthorized', 'unknown']
          const mismatchErrors = [
            'token_mismatch_subject',
            'token_mismatch_meeting',
            'token_mismatch_student'
          ]
          const nonRetryableErrors = [
            'token_invalid',
            'jwt_verification_failed',
            'token_validation_failed',
            'token_consumed'
          ]

          const isRetryable =
            retryableErrors.includes(errorType) ||
            mismatchErrors.includes(errorType)
          const isMismatch = mismatchErrors.includes(errorType)

          // Clear token cache to force refresh
          tokenCache = null
          tokenCacheTime = 0

          if (isRetryable) {
            // Wait a bit for token refresh mechanism to work
            await new Promise(resolve => setTimeout(resolve, 2000))

            // Try to get fresh credentials
            const freshCredentials = await getAuthCredentials()
            if (
              freshCredentials &&
              freshCredentials.verificationToken &&
              freshCredentials.subjectId
            ) {
              console.log(
                '✅ Fresh credentials obtained, retrying submission...'
              )

              // Re-validate with fresh credentials
              const freshValidation = validateTokenBeforeSubmission(
                freshCredentials,
                attendanceDetails
              )
              if (!freshValidation.valid && isMismatch) {
                // Still mismatched, show specific error
                const errorMsg =
                  userMessage ||
                  `Token ${errorType.replace(
                    'token_mismatch_',
                    ''
                  )} mismatch. Please rejoin the meeting through NE-Attend dashboard.`
                alert(
                  `⚠️ Attendance Submission Failed\n\n${errorMsg}\n\nYour attendance data has been saved locally.`
                )
                return
              }

              const retryPayload = {
                ...attendanceDetails,
                verificationToken: freshCredentials.verificationToken,
                subjectId: freshCredentials.subjectId
              }

              // Retry submission once
              chrome.runtime.sendMessage(
                { type: 'ATTENDANCE_FINAL', payload: retryPayload },
                retryRes => {
                  if (retryRes && retryRes.ok) {
                    console.log('✅ Attendance submission successful on retry')
                    chrome.storage.local.set(
                      {
                        [submissionKey]: {
                          submitted: true,
                          timestamp: new Date().toISOString(),
                          meetCode: attendanceDetails.meetCode,
                          date: attendanceDetails.date,
                          retried: true
                        }
                      },
                      () => {
                        submissionCompleted = true // Mark as completed after retry
                        submissionInProgress = false
                      }
                    )
                  } else {
                    console.error(
                      '❌ Attendance submission failed on retry:',
                      retryRes
                    )
                    const retryErrorType = retryRes?.errorType || errorType
                    const retryUserMessage =
                      retryRes?.userMessage || userMessage

                    // Show specific error message based on error type
                    if (nonRetryableErrors.includes(retryErrorType)) {
                      alert(
                        `⚠️ Attendance Submission Failed\n\n${retryUserMessage}\n\nYour attendance data has been saved locally.\n\nPlease rejoin the meeting through NE-Attend dashboard to get a new token.`
                      )
                    } else {
                      alert(
                        `⚠️ Attendance Submission Failed\n\n${retryUserMessage}\n\nYour attendance data has been saved locally.\n\nPlease:\n1. Open NE-Attend dashboard\n2. Navigate to your subject\n3. Click "Join Meeting" to get a new token\n4. Your attendance will be submitted automatically`
                      )
                    }
                    // Clear in-progress flag after retry failure
                    submissionInProgress = false
                  }
                }
              )
            } else {
              console.error('❌ Could not obtain fresh credentials for retry')
              alert(
                `⚠️ Attendance Submission Failed\n\n${userMessage}\n\nYour attendance data has been saved locally.\n\nPlease rejoin the meeting through NE-Attend dashboard to get a new token.`
              )
              // Clear in-progress flag when no credentials for retry
              submissionInProgress = false
            }
          } else {
            // Non-retryable error, show message immediately
            console.error('❌ Non-retryable error, showing user message')

            // Special handling for token_consumed - treat as success since backend already processed it
            if (errorType === 'token_consumed') {
              console.log(
                'ℹ️ Token already consumed - attendance was likely already submitted successfully'
              )
              console.log('   Marking as submitted to prevent duplicate alerts')
              chrome.storage.local.set(
                {
                  [submissionKey]: {
                    submitted: true,
                    timestamp: new Date().toISOString(),
                    meetCode: attendanceDetails.meetCode,
                    date: attendanceDetails.date,
                    note: 'Token consumed - submission already processed'
                  }
                },
                () => {
                  submissionCompleted = true // Mark as completed (already processed)
                  submissionInProgress = false
                }
              )
              // Don't show error alert - token consumed means it was already processed
              return
            }

            alert(
              `⚠️ Attendance Submission Failed\n\n${userMessage}\n\nYour attendance data has been saved locally.\n\nPlease rejoin the meeting through NE-Attend dashboard to get a new token.`
            )
            // Clear in-progress flag for non-retryable errors
            submissionInProgress = false
          }
        } else {
          console.error('❌ Attendance submission failed:', res)
          // Phase 1 Task 3: Add to retry queue for failed submissions
          const errorInfo = {
            status: res?.status || 'unknown',
            errorType: res?.errorType || 'unknown',
            errorMessage:
              res?.error?.message || res?.error?.error || 'Unknown error',
            timestamp: new Date().toISOString()
          }
          await addFinalAttendanceToRetryQueue(attendanceDetails, errorInfo)
          console.log('📦 Failed submission added to retry queue')
          // Clear in-progress flag to allow retry
          submissionInProgress = false
        }

        if (!dashboardOpenedOnce) {
          dashboardOpenedOnce = true
          window.open(`${frontendUrl}${dashboardPath}`)
        }
      }
    )
  } catch (error) {
    console.error('Messaging failed, fallback fetch:', error)

    // Use same submission key for fallback path
    const submissionKey = `attendance_submitted_${attendanceDetails.meetCode}_${attendanceDetails.date}`

    Promise.all([getAuthCredentials(), _getConfig()])
      .then(async ([credentials, config]) => {
        // Phase 1 Task 2: Send even if unauthenticated (fallback path)
        const isUnauthenticated =
          !credentials ||
          !credentials.verificationToken ||
          !credentials.subjectId

        if (isUnauthenticated) {
          console.log(
            '⚠️ Fallback path: Sending unauthenticated final attendance'
          )
          // Continue to send unauthenticated submission
        }

        // Phase 1 Task 2: Build payload with or without credentials (fallback path)
        const fallbackPayload = {
          ...attendanceDetails,
          verificationToken: credentials?.verificationToken || null,
          subjectId: credentials?.subjectId || null,
          isUnauthenticated: isUnauthenticated,
          authWarning: isUnauthenticated
        }

        if (isUnauthenticated) {
          // Use throttled warning
          const warningKey = `final_attendance_fallback_unauthenticated_${
            attendanceDetails.meetCode || 'unknown'
          }`
          if (
            warningThrottle.warn(
              warningKey,
              `⚠️ Fallback: Sending unauthenticated final attendance\n   MeetCode: ${attendanceDetails.meetCode}`,
              60000
            )
          ) {
            const dashboardUrl = `${config.frontendUrl}/dashboard`
            const _infoMsg = // Used conceptually for notification
              `📋 Attendance Being Submitted (Unauthenticated - Fallback)\n\n` +
              `Your attendance data (${
                attendanceDetails.participants?.length || 0
              } participants) is being sent to the server.\n\n` +
              `⚠️ This submission is unauthenticated and will be marked accordingly.\n\n` +
              `💡 For authenticated tracking:\n` +
              `1. Open: ${dashboardUrl}\n` +
              `2. Navigate to your subject/group\n` +
              `3. Click "Join Meeting" to generate a token\n\n` +
              `💡 Your attendance data is safe and will be available in the extension popup.`

            showNotification(
              'Attendance submitted (unauthenticated - fallback). Join through dashboard for authenticated tracking.',
              'warning'
            )
          }
          // Phase 1 Task 2: Continue to send unauthenticated submission (don't return)
        } else {
          // Update credential state cache on success
          credentialStateCache.lastCheck = Date.now()
          credentialStateCache.lastResult = credentials
          credentialStateCache.consecutiveFailures = 0
          const meetCode = extractMeetCode()
          if (meetCode) {
            warningThrottle.clear(
              `final_attendance_fallback_no_creds_${meetCode}`
            )
          }

          // Pre-flight validation (fallback path) - only if authenticated
          const validation = validateTokenBeforeSubmission(
            credentials,
            attendanceDetails
          )
          if (!validation.valid) {
            console.warn(
              '⚠️ Pre-flight validation failed (fallback), falling back to unauthenticated submission:',
              validation.errors
            )
            // Fall back to unauthenticated submission
            fallbackPayload.isUnauthenticated = true
            fallbackPayload.verificationToken = null
            fallbackPayload.subjectId = null
            fallbackPayload.authWarning = true

            // Clear token cache to force refresh
            tokenCache = null
            tokenCacheTime = 0

            // Try to get fresh token
            console.log(
              '🔄 Attempting to get fresh token after validation failure (fallback)...'
            )
            await new Promise(resolve => setTimeout(resolve, 1000))

            const freshCredentials = await getAuthCredentials()
            if (
              freshCredentials &&
              freshCredentials.verificationToken &&
              freshCredentials.subjectId
            ) {
              // Re-validate with fresh credentials
              const freshValidation = validateTokenBeforeSubmission(
                freshCredentials,
                attendanceDetails
              )
              if (freshValidation.valid) {
                console.log(
                  '✅ Fresh token passed validation (fallback), continuing with submission'
                )
                // Use fresh credentials
                Object.assign(credentials, freshCredentials)
              } else {
                // Still invalid, fall back to unauthenticated submission
                console.warn(
                  '⚠️ Token validation failed (fallback), falling back to unauthenticated submission'
                )
                fallbackPayload.isUnauthenticated = true
                fallbackPayload.verificationToken = null
                fallbackPayload.subjectId = null
                fallbackPayload.authWarning = true
              }
            } else {
              // No fresh token available, fall back to unauthenticated submission
              console.warn(
                '⚠️ No fresh token available (fallback), falling back to unauthenticated submission'
              )
              fallbackPayload.isUnauthenticated = true
              fallbackPayload.verificationToken = null
              fallbackPayload.subjectId = null
              fallbackPayload.authWarning = true
            }
          }
        }

        // Phase 1 Task 2: Use fallbackPayload (may be authenticated or unauthenticated)
        const dashboardPath = credentials?.dashboardPath || '/dashboard'
        const backendUrl = config.backendUrl
        const frontendUrl = config.frontendUrl

        // Use safeFetch to handle Chrome's local network request restrictions
        const safeFetchFn = window.safeFetch || globalThis.safeFetch || fetch
        safeFetchFn(`${backendUrl}/api/attendance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fallbackPayload)
        })
          .then(async response => {
            if (!response.ok) {
              const errorData = await response
                .json()
                .catch(() => ({ error: 'Unknown error' }))
              const errorMessage =
                errorData.message || errorData.error || 'Unknown error'

              // Handle 401 errors with token refresh
              if (response.status === 401) {
                console.warn(
                  '⚠️ Attendance submission failed with 401 (fallback path), attempting token refresh...'
                )
                console.warn('   Error message:', errorMessage)

                // Parse error type from error message
                let errorType = 'unknown'
                let userMessage = errorMessage

                if (errorMessage.includes('subject_id does not match')) {
                  errorType = 'token_mismatch_subject'
                  userMessage =
                    'Token was generated for a different subject. Please rejoin the meeting through NE-Attend dashboard.'
                } else if (errorMessage.includes('meeting_id does not match')) {
                  errorType = 'token_mismatch_meeting'
                  userMessage =
                    'Token was generated for a different meeting. Please rejoin the meeting through NE-Attend dashboard.'
                } else if (errorMessage.includes('student_id does not match')) {
                  errorType = 'token_mismatch_student'
                  userMessage =
                    'Token was generated for a different student. Please rejoin the meeting through NE-Attend dashboard.'
                } else if (errorMessage.includes('JWT verification failed')) {
                  errorType = 'jwt_verification_failed'
                  userMessage =
                    'Token verification failed. Please generate a new token from NE-Attend dashboard.'
                } else if (errorMessage.includes('Token validation failed')) {
                  errorType = 'token_validation_failed'
                  userMessage =
                    'Token validation failed. Please generate a new token from NE-Attend dashboard.'
                } else if (
                  errorMessage.includes('already been used') ||
                  errorMessage.includes('has been used')
                ) {
                  errorType = 'token_consumed'
                  userMessage =
                    'Token was already used. Please generate a new token from NE-Attend dashboard.'
                } else if (errorMessage.includes('expired')) {
                  errorType = 'token_expired'
                  userMessage =
                    'Token has expired. Please generate a new token from NE-Attend dashboard.'
                } else if (
                  errorMessage.includes('invalid') ||
                  errorMessage.includes('not found')
                ) {
                  errorType = 'token_invalid'
                  userMessage =
                    'Token is invalid or not found. Please join meeting through NE-Attend dashboard to get a valid token.'
                }

                console.warn('   Error type:', errorType)

                // Determine if error is retryable
                const retryableErrors = [
                  'token_expired',
                  'token_consumed',
                  'unauthorized',
                  'unknown'
                ]
                const mismatchErrors = [
                  'token_mismatch_subject',
                  'token_mismatch_meeting',
                  'token_mismatch_student'
                ]
                const isRetryable =
                  retryableErrors.includes(errorType) ||
                  mismatchErrors.includes(errorType)

                // Clear token cache
                tokenCache = null
                tokenCacheTime = 0

                if (isRetryable) {
                  // Wait for token refresh
                  await new Promise(resolve => setTimeout(resolve, 2000))

                  // Get fresh credentials
                  const freshCredentials = await getAuthCredentials()
                  if (
                    freshCredentials &&
                    freshCredentials.verificationToken &&
                    freshCredentials.subjectId
                  ) {
                    console.log(
                      '✅ Fresh credentials obtained (fallback), retrying submission...'
                    )

                    // Re-validate with fresh credentials
                    const freshValidation = validateTokenBeforeSubmission(
                      freshCredentials,
                      attendanceDetails
                    )
                    if (
                      !freshValidation.valid &&
                      mismatchErrors.includes(errorType)
                    ) {
                      // Still mismatched, show specific error
                      alert(
                        `⚠️ Attendance Submission Failed\n\n${userMessage}\n\nYour attendance data has been saved locally.`
                      )
                      throw new Error(`HTTP ${response.status}: ${userMessage}`)
                    }

                    const retryPayload = {
                      ...attendanceDetails,
                      verificationToken: freshCredentials.verificationToken,
                      subjectId: freshCredentials.subjectId
                    }

                    // Retry once - use safeFetch to handle Chrome's local network request restrictions
                    const safeFetchFn =
                      window.safeFetch || globalThis.safeFetch || fetch
                    const retryResponse = await safeFetchFn(
                      `${backendUrl}/api/attendance`,
                      {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(retryPayload)
                      }
                    )

                    if (retryResponse.ok) {
                      const retryData = await retryResponse.json()
                      console.log(
                        '✅ Final attendance sent successfully on retry (fallback):',
                        retryData
                      )
                      chrome.storage.local.set(
                        {
                          [submissionKey]: {
                            submitted: true,
                            timestamp: new Date().toISOString(),
                            meetCode: attendanceDetails.meetCode,
                            date: attendanceDetails.date,
                            retried: true
                          }
                        },
                        () => {}
                      )
                      return retryData
                    } else {
                      const retryErrorData = await retryResponse
                        .json()
                        .catch(() => ({ error: 'Unknown error' }))
                      const retryErrorMessage =
                        retryErrorData.message ||
                        retryErrorData.error ||
                        'Unknown error'
                      throw new Error(
                        `HTTP ${retryResponse.status}: ${retryErrorMessage}`
                      )
                    }
                  } else {
                    throw new Error(`HTTP ${response.status}: ${userMessage}`)
                  }
                } else {
                  throw new Error(`HTTP ${response.status}: ${userMessage}`)
                }
              } else {
                throw new Error(`HTTP ${response.status}: ${errorMessage}`)
              }
            }
            return response.json()
          })
          .then(data => {
            console.log(
              '✅ Final attendance sent successfully (fallback):',
              data
            )
            // Mark as submitted on success
            chrome.storage.local.set(
              {
                [submissionKey]: {
                  submitted: true,
                  timestamp: new Date().toISOString(),
                  meetCode: attendanceDetails.meetCode,
                  date: attendanceDetails.date
                }
              },
              () => {
                console.log(
                  '✅ Attendance submission marked as completed (fallback)'
                )
              }
            )
          })
          .catch(async err => {
            console.error('❌ Failed to send final attendance (fallback):', err)
            const errorMsg = err.message || 'Unknown error occurred'

            // Phase 1 Task 3: Add to retry queue for failed submissions (fallback path)
            const errorInfo = {
              status: err.status || 'unknown',
              errorType: 'network_error',
              errorMessage: errorMsg,
              timestamp: new Date().toISOString(),
              path: 'fallback'
            }
            await addFinalAttendanceToRetryQueue(attendanceDetails, errorInfo)
            console.log(
              '📦 Failed submission added to retry queue (fallback path)'
            )

            // Show user-friendly error message
            if (
              errorMsg.includes('Token was generated for') ||
              errorMsg.includes('Token verification failed') ||
              errorMsg.includes('Token validation failed') ||
              errorMsg.includes('Token was already used') ||
              errorMsg.includes('Token has expired') ||
              errorMsg.includes('Token is invalid')
            ) {
              alert(
                `⚠️ Attendance Submission Failed\n\n${errorMsg}\n\nYour attendance data has been saved locally and will be retried automatically.\n\nPlease rejoin the meeting through NE-Attend dashboard to get a new token.`
              )
            } else {
              alert(
                `⚠️ Failed to send attendance to server\n\n${errorMsg}\n\nYour attendance data has been saved locally and will be retried automatically.`
              )
            }
          })
          .finally(() => {
            if (!dashboardOpenedOnce) {
              dashboardOpenedOnce = true
              window.open(`${frontendUrl}${dashboardPath}`)
            }
          })
      })
      .catch(err => {
        console.error('❌ Error getting credentials:', err)
        // Clear in-progress flag on credential error
        submissionInProgress = false
      })
      .finally(() => {
        // Ensure flag is cleared in fallback path (if not already completed)
        if (!submissionCompleted && submissionInProgress) {
          console.log(
            '🔓 Clearing submission in-progress flag (fallback path finally)'
          )
          submissionInProgress = false
        }
      })
  }
}

/*
---------------------------------------------------
Update ui of google meet to support extra features.
---------------------------------------------------
*/

// Status badge helpers (only visible when extension is enabled)
let statusText = document.createElement('button')
statusText.id = 'status'
statusText.className = 'Jyj1Td CkXZgc'
statusText.innerHTML = '&nbsp;🔴 Running NeAttend'
statusText.style.color = 'red'
statusText.style.fontWeight = 'bold'
statusText.style.padding = 'auto'
statusText.style.border = 'none'
statusText.style.outline = 'none'
statusText.style.background = 'transparent'

// Update status badge with message and color
function updateStatusBadge (message, color = 'red') {
  if (statusText) {
    statusText.innerHTML = `&nbsp;${message}`
    statusText.style.color = color
  }
}

const blinkSpeed = 500
let blinkTimer = null
function startBlink () {
  if (blinkTimer) return
  blinkTimer = setInterval(function () {
    statusText.style.visibility =
      statusText.style.visibility == 'hidden' ? '' : 'hidden'
  }, blinkSpeed)
}
function stopBlink () {
  if (blinkTimer) {
    clearInterval(blinkTimer)
    blinkTimer = null
  }
}

function getStatusContainer () {
  const containers = document.getElementsByClassName('Qp8KI')
  return containers && containers[0] ? containers[0] : null
}
function showStatusBadge () {
  const container = getStatusContainer()
  if (!container) return
  if (!container.contains(statusText)) {
    container.appendChild(statusText)
  }
  startBlink()
}
function hideStatusBadge () {
  stopBlink()
  try {
    if (statusText && statusText.parentElement) {
      statusText.parentElement.removeChild(statusText)
    }
  } catch {
    /* ignore cleanup errors */
  }
}

function isOnMeetPage () {
  try {
    return (
      window.location.hostname === 'meet.google.com' &&
      window.location.pathname.length > 1
    )
  } catch {
    return false
  }
}

/*
-------------------
start the extension
-------------------
*/

// Engine interval - only starts when on actual meeting page (not homepage)
let _engineInterval = null

function initializeEngineIfNeeded () {
  // Skip if already running
  if (_engineInterval) return

  // Only start engine on actual meeting pages, not homepage
  if (!isOnMeetPage()) return

  console.log('🚀 NE-Attend: Starting engine on meeting page')
  _engineInterval = setInterval(startEngine, 1000)
  // Also run immediately
  startEngine()
}

// Helper function to initialize empty snapshot early (with basic error handling)
function initializeEmptySnapshot () {
  try {
    const meetCode = extractMeetCode()
    chrome.storage.local.get(['realtimeMonitoring'], result => {
      if (chrome.runtime.lastError) {
        console.warn(
          '⚠️ Could not check existing snapshot:',
          chrome.runtime.lastError
        )
        return
      }

      // Only initialize if snapshot doesn't exist yet
      if (!result.realtimeMonitoring) {
        chrome.storage.local.set(
          {
            realtimeMonitoring: {
              meetCode: meetCode || 'unknown',
              updatedAt: new Date().toISOString(),
              participantCount: 0,
              participants: [],
              sessionStartTime: new Date().toISOString(),
              currentDuration: 0,
              status: 'waiting',
              message: 'Tracking initialized. Waiting for participants...'
            }
          },
          () => {
            if (chrome.runtime.lastError) {
              console.warn(
                '⚠️ Could not initialize early snapshot:',
                chrome.runtime.lastError
              )
              // Retry once after delay
              setTimeout(() => {
                chrome.storage.local.set(
                  {
                    realtimeMonitoring: {
                      meetCode: meetCode || 'unknown',
                      updatedAt: new Date().toISOString(),
                      participantCount: 0,
                      participants: [],
                      sessionStartTime: new Date().toISOString(),
                      currentDuration: 0,
                      status: 'waiting',
                      message:
                        'Tracking initialized. Waiting for participants...'
                    }
                  },
                  () => {
                    if (!chrome.runtime.lastError) {
                      console.log(
                        '✅ Initialized empty snapshot early for popup (after retry)'
                      )
                    }
                  }
                )
              }, 500)
            } else {
              console.log('✅ Initialized empty snapshot early for popup')
            }
          }
        )
      }
    })
  } catch (e) {
    if (isExtensionContextInvalidated(e)) {
      handleExtensionContextInvalidation()
      return
    }
    console.warn('⚠️ Error initializing early snapshot:', e)
  }
}

async function startEngine () {
  // HOMEPAGE FIX: Early return if on Google Meet homepage
  // This prevents unnecessary DOM queries and chrome.storage access on the landing page
  // isOnMeetPage() returns false for homepage (pathname.length <= 1)
  if (!isOnMeetPage()) {
    return // Do nothing on homepage - no intervals, no DOM queries, no storage access
  }

  // ========================================================================
  // WAITING ROOM HOST DETECTION - Pre-lock host before meeting starts
  // This runs on every engine tick to detect host from waiting room
  // ========================================================================
  try {
    // Try to detect and lock host from waiting room BEFORE meeting starts
    // This ensures the host identity is locked even before tracking begins
    if (!isHostLocked()) {
      const lockedFromWaitingRoom = lockHostFromWaitingRoom()
      if (lockedFromWaitingRoom) {
        console.log(
          '✅ Host pre-locked from waiting room - will remain locked during meeting'
        )
      }
    }
  } catch (e) {
    console.warn('Waiting room host detection error:', e)
  }
  // ========================================================================

  try {
    meetActionButtons = document.getElementsByClassName('NtU4hc')
    // Check toggle state before showing badge or starting
    try {
      chrome.storage.local.get(['extEnabled'], res => {
        const enabled = res.extEnabled !== false // default true
        extEnabledCache = enabled
        if (enabled && isOnMeetPage()) {
          // Initialize empty snapshot early, before calling start()
          initializeEmptySnapshot()
          showStatusBadge()
          start()
        } else {
          hideStatusBadge()
          // Still initialize snapshot if on Meet page (even if disabled)
          // This helps popup show appropriate status
          if (isOnMeetPage()) {
            initializeEmptySnapshot()
          }
        }
      })
    } catch {
      // Fallback: assume enabled
      extEnabledCache = true
      if (isOnMeetPage()) {
        // Initialize empty snapshot early, before calling start()
        initializeEmptySnapshot()
        showStatusBadge()
        start()
      }
    }
    // Keep engine alive; Meet DOM can load late or URL can change
  } catch (error) {
    console.error('Error starting engine:', error)
  }
}

// React to enable/disable changes at runtime
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === 'local' &&
      Object.prototype.hasOwnProperty.call(changes, 'extEnabled')
    ) {
      const enabled = changes.extEnabled.newValue !== false
      extEnabledCache = enabled
      if (enabled && isOnMeetPage()) {
        console.log('NE-Attend: enabled via toggle, starting tracker')
        showStatusBadge()
        start()
      } else {
        console.log('NE-Attend: disabled via toggle, stopping tracker')
        try {
          clearInterval(tracking)
        } catch {
          /* ignore */
        }
        cleanupParticipantsObserver()
        hideStatusBadge()
        tracking = null
      }
    }

    // Also listen for token changes in sync storage
    if (area === 'sync') {
      const tokenKeys = Object.keys(changes).filter(key =>
        key.startsWith('neattend_token_')
      )
      if (tokenKeys.length > 0 && isOnMeetPage()) {
        console.log('🔔 Token updated in storage, refreshing credentials...')
        // CRITICAL FIX: Clear BOTH caches to force fresh lookup
        // Previously only tokenCache was cleared, but credentialStateCache was still blocking lookups
        tokenCache = null
        tokenCacheTime = 0
        // Reset credential state cache to allow immediate lookup
        credentialStateCache.lastCheck = 0
        credentialStateCache.lastResult = null
        credentialStateCache.consecutiveFailures = 0
        // Immediately try to get credentials
        getAuthCredentials(0, 0).then(credentials => {
          if (credentials) {
            console.log('✅ Token now available after storage update!')
            authenticationFailedNotified = false
            // If tracking not running, start it
            if (!tracking) {
              console.log(
                '🚀 Starting attendance tracking with newly available token'
              )
              start()
            }
          }
        })
      }
    }
  })
} catch {
  /* ignore chrome extension errors */
}

// Listen for messages from background script and popup
try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle END_SESSION from popup
    if (message && message.type === 'END_SESSION') {
      console.log('🛑 Received END_SESSION message from popup')

      // End the current session
      endCurrentSession()
        .then(() => {
          // Stop tracking interval
          if (tracking) {
            clearInterval(tracking)
            tracking = null
            console.log('🛑 Tracking interval stopped by END_SESSION')
          }

          // Clear other intervals
          if (periodicObserverRetryInterval) {
            clearInterval(periodicObserverRetryInterval)
            periodicObserverRetryInterval = null
          }
          if (tokenRefreshInterval) {
            clearInterval(tokenRefreshInterval)
            tokenRefreshInterval = null
          }
          if (periodicMeetingEndCheckInterval) {
            clearInterval(periodicMeetingEndCheckInterval)
            periodicMeetingEndCheckInterval = null
          }

          // Cleanup observers
          cleanupParticipantsObserver()
          cleanupMeetingEndListeners()

          // Reset state
          finalizedOnce = false
          finalizationAttempts = 0
          submissionInProgress = false
          submissionCompleted = false

          // Clear realtime monitoring data
          chrome.storage.local.set({
            realtimeMonitoring: {
              status: 'ended',
              message: 'Session ended by user',
              participants: [],
              meetCode: null,
              updatedAt: new Date().toISOString()
            }
          })

          console.log('🛑 Session ended and all tracking stopped')
          sendResponse({ success: true, message: 'Session ended' })
        })
        .catch(error => {
          console.error('Error ending session:', error)
          sendResponse({ success: false, error: error.message })
        })

      return true // Keep channel open for async response
    }

    // Handle TOKEN_UPDATED from background
    if (message && message.type === 'TOKEN_UPDATED') {
      console.log(
        '🔔 Received token update message from background:',
        message.tokenKeys
      )
      if (isOnMeetPage()) {
        // CRITICAL FIX: Clear BOTH caches to force fresh lookup
        // Previously only tokenCache was cleared, but credentialStateCache was still blocking lookups
        tokenCache = null
        tokenCacheTime = 0
        // Reset credential state cache to allow immediate lookup
        credentialStateCache.lastCheck = 0
        credentialStateCache.lastResult = null
        credentialStateCache.consecutiveFailures = 0
        // Immediately try to get credentials
        getAuthCredentials(0, 0).then(credentials => {
          if (credentials) {
            console.log('✅ Token now available after message notification!')
            authenticationFailedNotified = false
            // If tracking not running, start it
            if (!tracking) {
              console.log(
                '🚀 Starting attendance tracking with newly available token'
              )
              start()
            }
          }
        })
      }
      sendResponse({ received: true })
    }
    return true // Keep message channel open for async response
  })
} catch (e) {
  console.error('Error setting up message listener:', e)
}

// Initialize cached toggle state
try {
  chrome.storage.local.get(['extEnabled'], res => {
    extEnabledCache = res.extEnabled !== false // default true
  })
} catch {
  /* ignore chrome extension errors */
}

// Guarded start: prevent duplicate intervals and enforce single session
const originalStart = start
// eslint-disable-next-line no-func-assign
start = async function () {
  if (tracking) return // already running
  if (!extEnabledCache || !isOnMeetPage()) return

  // SINGLE SESSION SAFETY: Check if we can start a new session
  const meetCode = extractMeetCode()
  if (meetCode) {
    const canStart = await canStartNewSession(meetCode)
    if (!canStart) {
      console.warn(
        `⚠️ BLOCKED: Cannot start tracking - active session exists for different meeting`
      )
      console.warn(`   Current session: ${currentSession.meetCode}`)
      console.warn(`   Attempted meeting: ${meetCode}`)
      console.warn(`   End the current session first to record a new meeting`)
      return
    }
  }

  originalStart()
}

// URL monitor: only runs when navigating TO a meeting page from homepage
let lastUrl = location.href
let _urlMonitorInterval = null

function checkUrlChange () {
  const currentUrl = location.href
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl
    // Check if we just navigated to a meeting page
    if (isOnMeetPage()) {
      // Start engine if not running
      initializeEngineIfNeeded()
      if (extEnabledCache) {
        showStatusBadge()
        start()
      }
    } else {
      // Navigated away from meeting - cleanup
      try {
        if (tracking) clearInterval(tracking)
      } catch {
        /* ignore */
      }
      cleanupParticipantsObserver()
      tracking = null
      hideStatusBadge()
      // Stop engine interval
      if (_engineInterval) {
        clearInterval(_engineInterval)
        _engineInterval = null
      }
    }
  }
  // Also recover if DOM becomes ready after delay (only on meeting pages)
  if (isOnMeetPage() && extEnabledCache && !tracking) {
    initializeEngineIfNeeded()
    showStatusBadge()
    start()
  }
}

// STARTUP: Determine what to do based on current page
;(function initOnLoad () {
  // If already on a meeting page (e.g., direct link), start immediately
  if (isOnMeetPage()) {
    console.log('🚀 NE-Attend: Direct meeting page load detected')

    // EARLY WAITING ROOM CHECK: Try to lock host from waiting room immediately
    // This captures the host name as soon as the page loads
    setTimeout(() => {
      if (!isHostLocked()) {
        const lockedFromWaitingRoom = lockHostFromWaitingRoom()
        if (lockedFromWaitingRoom) {
          console.log('✅ Host pre-locked from waiting room on page load')
        }
      }
    }, 500) // Small delay to ensure DOM is ready

    initializeEngineIfNeeded()
  } else {
    // On homepage - just monitor for navigation, no heavy intervals
    console.log(
      '📍 NE-Attend: Homepage detected, waiting for meeting navigation'
    )
  }
  // Light-weight URL monitor (only checks URL changes)
  _urlMonitorInterval = setInterval(checkUrlChange, 1000)
})()
