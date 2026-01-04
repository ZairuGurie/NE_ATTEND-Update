import React, { useEffect, useState, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useNavigate, useLocation } from 'react-router-dom'
import logo from '../assets/Logologin.png'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 2: CSS classes for theme-aware styling (replaces inline styles)
import './Dashboard.css'
import { logout } from '../utils/auth'
import { getSocketIOUrl, apiGet, apiDelete, apiPatch } from '../utils/api'
import { ENDPOINTS } from '../utils/constants/api'
// Real-time sync utilities for extension data integration
import {
  getDurationTracker,
  formatDuration as formatDurationRT,
  saveParticipantsToStorage,
  loadParticipantsFromStorage,
  clearRealtimeStorage
} from '../utils/realtimeSync'
// Shared attendance history utilities (used by both Dashboard and History pages)
import {
  loadAttendanceHistory,
  saveSessionToHistory,
  deleteSessionFromHistory,
  clearAllAttendanceHistory,
  getCurrentMeetCode,
  setCurrentMeetCode,
  ATTENDANCE_STORAGE_KEYS
} from '../utils/attendanceHistory'
// Design system colors for consistent, accessible UI
// riskColorMap is now centralized in colors.js for consistency across all pages
import {
  status as statusColors,
  brand,
  neutral,
  interactive,
  riskColorMap
} from '../utils/colors'
// Floating diagnostic panel component
import DiagnosticPanel from './components/DiagnosticPanel'
import StatusBanner from '../components/StatusBanner'
import { MEETING_STATUS } from '../utils/constants'
import UserMenu from '../components/layout/UserMenu'
// Note: Tokenization utilities available in ../utils/tokenization.js and ../utils/participantProcessor.js
// Currently using buildDisplayRow directly for single-pass processing

import {
  DF_CONSECUTIVE_WEEKS_THRESHOLD,
  DF_CONTACT_HOURS_THRESHOLD_PERCENT,
  TARDINESS_TO_ABSENCE_RATIO
} from '../utils/attendancePolicy'

// Import centralized navigation from routes constants
import { getNavItemsByRole } from '../utils/constants/routes'

// Use centralized nav items instead of hardcoded values
const navItems = getNavItemsByRole('instructor')

// Removed hardcoded meetingData to prevent data redundancy

const notificationItems = [
  'New student joined IT Elective class',
  'Attendance report generated',
  'Class schedule updated',
  'Meeting started in Room 301'
]

const HMS_REGEX = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/

// Storage keys for live display rows (attendance history moved to shared utility)
const STORAGE_KEYS = {
  live: 'instructorRealtimeLiveRows',
  historical: 'instructorRealtimeHistoricalRows',
  all: 'instructorRealtimeAllRows'
}

const isBrowser = () => typeof window !== 'undefined'

const loadStoredRows = key => {
  if (!isBrowser()) return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.warn(`Unable to parse stored rows for ${key}:`, error)
    return []
  }
}

const persistRows = (key, rows) => {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(key, JSON.stringify(rows))
  } catch (error) {
    console.warn(`Unable to persist rows for ${key}:`, error)
  }
}

const clearStoredRows = key => {
  if (!isBrowser()) return
  try {
    window.localStorage.removeItem(key)
  } catch (error) {
    console.warn(`Unable to clear stored rows for ${key}:`, error)
  }
}

// Attendance history functions imported from '../utils/attendanceHistory'
// (loadAttendanceHistory, saveSessionToHistory, deleteSessionFromHistory,
//  clearAllAttendanceHistory, getCurrentMeetCode, setCurrentMeetCode)

const parseTimestamp = value => {
  if (!value) return null
  if (value instanceof Date) return value
  const isoCandidate = new Date(value)
  if (!Number.isNaN(isoCandidate.getTime())) return isoCandidate
  if (typeof value === 'string') {
    const match = value.match(HMS_REGEX)
    if (match) {
      const [, hh, mm, ss = '0'] = match
      const date = new Date()
      date.setHours(
        parseInt(hh, 10) || 0,
        parseInt(mm, 10) || 0,
        parseInt(ss, 10) || 0,
        0
      )
      return date
    }
  }
  return null
}

const formatTimeDisplay = (value, fallback) => {
  const parsed = value instanceof Date ? value : parseTimestamp(value)
  if (!parsed) return fallback || 'N/A'
  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const deriveRawStatus = participant => {
  if (
    participant &&
    typeof participant.rawStatus === 'string' &&
    participant.rawStatus.trim()
  ) {
    return participant.rawStatus.trim().toLowerCase()
  }
  if (
    participant &&
    typeof participant.status === 'string' &&
    participant.status.trim()
  ) {
    return participant.status.trim().toLowerCase()
  }
  if (participant?.isCurrentlyInMeeting) {
    return 'present'
  }
  if (participant?.isTardy) {
    return 'late'
  }
  if (
    participant &&
    (participant.leaveTime || participant.leaveTimeIso || participant.timeOut)
  ) {
    return 'left'
  }
  return 'joined'
}

const formatStatusLabel = rawStatus => {
  switch ((rawStatus || '').toLowerCase()) {
    case 'left':
    case 'left meeting':
      return 'Left Meeting'
    case 'joined':
      return 'Just Joined'
    case 'late':
      return 'Late'
    case 'present':
    default:
      return 'Present'
  }
}

const formatDurationFromSeconds = seconds => {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// ========================================================================
// PARTICIPANT SORTING: Stable sorting to prevent position jumping
// Categories: 1. Hosts → 2. Verified/Invited → 3. Guests/Uninvited
// Within each category: isLive → joinTime → name (alphabetical)
// ========================================================================

/**
 * Get participant category for sorting priority
 * @param {Object} row - Participant row
 * @returns {number} Category priority (0 = highest, 2 = lowest)
 */
const getParticipantCategory = row => {
  if (row.isHost) return 0 // Hosts always first
  if (row.isVerifiedParticipant) return 1
  // Fall back to legacy signals when flag isn't available yet
  const legacyVerified =
    row.userId || row.studentId || row.email || !row.isUnauthenticated
  return legacyVerified ? 1 : 2
}

/**
 * Get category label for display
 * @param {Object} row - Participant row
 * @returns {string} Category label
 */
const getParticipantCategoryLabel = row => {
  if (row.isHost) return 'Host'
  if (row.isVerifiedParticipant) return 'Verified'
  const legacyVerified =
    row.userId || row.studentId || row.email || !row.isUnauthenticated
  return legacyVerified ? 'Verified' : 'Guest'
}

/**
 * Sort participant rows with stable ordering
 * Priority: Category → isLive → joinTime → name
 * @param {Array} rows - Array of participant rows
 * @returns {Array} Sorted array
 */
const sortParticipantRows = rows => {
  if (!Array.isArray(rows) || rows.length === 0) return rows

  return [...rows].sort((a, b) => {
    // 1. Sort by category (Host > Verified > Guest)
    const categoryA = getParticipantCategory(a)
    const categoryB = getParticipantCategory(b)
    if (categoryA !== categoryB) return categoryA - categoryB

    // 2. Sort by live status (live participants first)
    const liveA = a.isLive && !a.isLeft ? 1 : 0
    const liveB = b.isLive && !b.isLeft ? 1 : 0
    if (liveA !== liveB) return liveB - liveA // Descending (live first)

    // 3. Sort by join time (earlier first)
    const joinA = a.joinTimeIso ? new Date(a.joinTimeIso).getTime() : Infinity
    const joinB = b.joinTimeIso ? new Date(b.joinTimeIso).getTime() : Infinity
    if (joinA !== joinB) return joinA - joinB // Ascending (earlier first)

    // 4. Sort by name (alphabetical, case-insensitive)
    const nameA = (a.name || '').toLowerCase()
    const nameB = (b.name || '').toLowerCase()
    return nameA.localeCompare(nameB)
  })
}

const buildDisplayRow = (participant = {}, options = {}) => {
  const {
    defaultGroup,
    defaultDate,
    isLiveOverride,
    markNew = false,
    markLeft = false,
    subjectName
  } = options

  // Determine status based on participant state and host leave time
  let rawStatus = deriveRawStatus(participant)

  // Apply status logic rules based on host and participant leave times
  // If participant is host, always present (unless explicitly late)
  if (participant.isHost) {
    rawStatus = participant.rawStatus === 'late' ? 'late' : 'present'
  } else {
    // For non-host participants, check leave times
    const participantLeaveTime =
      participant.leaveTimeIso || participant.leaveTime || participant.timeOut
    const hostLeaveTime =
      options.hostLeaveTime ||
      options.instructorLeaveTime ||
      participant.hostLeaveTime ||
      participant.instructorLeaveTime
    const meetingEnded =
      options.meetingEnded || participant.meetingEnded || false
    const isCurrentlyInMeeting =
      participant.isCurrentlyInMeeting !== undefined
        ? participant.isCurrentlyInMeeting
        : participant.isLive && !participantLeaveTime

    // During meeting (host present): show present if in meeting, pending if left
    if (!meetingEnded && !hostLeaveTime) {
      if (isCurrentlyInMeeting) {
        // Currently in meeting - show present (or late if applicable)
        rawStatus =
          participant.rawStatus === 'late' || participant.isTardy
            ? 'late'
            : 'present'
      } else if (participantLeaveTime) {
        // Participant left while host still in meeting - status is pending
        rawStatus = 'pending'
      }
      // If no leave time and not currently in meeting, keep derived status
    }
    // Meeting ended (host left): determine final status
    else if (meetingEnded && hostLeaveTime) {
      // Participant was synchronized (still in meeting when host left) - present
      if (participant.timeoutSynchronized) {
        rawStatus = 'present'
      }
      // Participant left before host - check timing
      else if (participantLeaveTime) {
        try {
          const hostLeave = new Date(hostLeaveTime)
          const participantLeave = new Date(participantLeaveTime)

          if (
            !isNaN(hostLeave.getTime()) &&
            !isNaN(participantLeave.getTime())
          ) {
            const timeDiff = Math.abs(
              participantLeave.getTime() - hostLeave.getTime()
            )
            const fiveMinutes = 5 * 60 * 1000

            // If participant left within 5 minutes of host (together), or after host, mark present
            if (participantLeave >= hostLeave || timeDiff <= fiveMinutes) {
              rawStatus = 'present'
            } else {
              // Participant left before host - absent
              rawStatus = 'absent'
            }
          }
        } catch (dateError) {
          console.warn(
            'Error parsing leave times for status determination:',
            dateError
          )
          // Fallback to derived status
        }
      }
      // Participant never left (still in meeting when host left) - present
      else if (isCurrentlyInMeeting) {
        rawStatus = 'present'
      }
    }
    // If meeting hasn't ended and participant is currently in meeting, show present
    else if (!meetingEnded && isCurrentlyInMeeting) {
      rawStatus =
        participant.rawStatus === 'late' || participant.isTardy
          ? 'late'
          : 'present'
    }
  }

  const statusLabel = participant.status || formatStatusLabel(rawStatus)

  const joinDate = parseTimestamp(
    participant.joinTimeIso || participant.joinTime
  )
  // FIX: When markLeft is true but no leaveTime provided, use current timestamp
  let leaveDate = parseTimestamp(
    participant.leaveTimeIso || participant.leaveTime || participant.timeOut
  )
  if (markLeft && !leaveDate) {
    leaveDate = new Date() // Set leave time to now when participant leaves
  }

  const recordId =
    participant.recordId ||
    participant.entryId ||
    participant.attendanceId ||
    participant._id ||
    participant.id ||
    null

  // FIX (Dec 4, 2025): Prioritize extension's attendedDuration over durationSeconds
  // Extension tracks actual seconds participant was visible in Google Meet
  // This is more accurate than DurationTracker's recalculated value
  const durationSeconds =
    typeof participant.attendedDuration === 'number'
      ? participant.attendedDuration // Extension's authoritative value FIRST
      : typeof participant.durationSeconds === 'number'
      ? participant.durationSeconds
      : typeof participant.duration === 'number'
      ? participant.duration
      : 0

  const sessionDateIso =
    participant.sessionDate ||
    (joinDate
      ? joinDate.toISOString()
      : defaultDate
      ? new Date(defaultDate).toISOString()
      : null)

  // Prioritize subjectName/groupName from options (payload) or participant over meetCode for display
  const groupDisplayName =
    subjectName ||
    participant.subjectName ||
    participant.groupName ||
    participant.group ||
    participant.meetCode ||
    defaultGroup ||
    'Session'
  const meetCode =
    participant.meetCode || participant.group || defaultGroup || 'Session'

  // Prioritize userName from backend (resolved identity) over scraped name
  const name =
    participant.userName ||
    participant.name ||
    participant.displayName ||
    'Unknown'

  // CRITICAL: Use avatarUrl as primary key (matches extension's deduplication)
  // Fallback chain: avatarUrl > participantId > userId > studentId > name-meetCode
  const rawIdentifier =
    participant.avatarUrl || // Primary: avatarUrl from extension
    participant.participantId ||
    participant.userId ||
    participant.studentId ||
    `${name}-${meetCode}`
  const key =
    typeof rawIdentifier === 'string'
      ? rawIdentifier
      : rawIdentifier
      ? String(rawIdentifier)
      : `${name}-${meetCode}`

  const joinIso = joinDate
    ? joinDate.toISOString()
    : participant.joinTimeIso || null
  // FIX: Use leaveDate from above (which may be set from markLeft) for ISO
  const leaveIso = leaveDate
    ? leaveDate.toISOString()
    : participant.leaveTimeIso || null

  const entryTokens = [
    recordId,
    participant.eventId,
    participant.eventUuid,
    participant.changeSeq,
    participant.sequenceNumber,
    joinIso,
    leaveIso,
    sessionDateIso,
    participant.rawStatus
  ].filter(Boolean)

  // Phase 2 Task 3: Extract unauthenticated flag from options or participant
  const isUnauthenticated =
    options.isUnauthenticated ||
    participant.isUnauthenticated ||
    participant.authWarning ||
    false

  const row = {
    key,
    // Preserve avatarUrl for identification and potential avatar display
    avatarUrl: participant.avatarUrl || null,
    meetCode,
    group: groupDisplayName, // Use subject/group name instead of meetCode
    sessionDate: sessionDateIso,
    participantId:
      typeof participant.participantId === 'string'
        ? participant.participantId
        : participant.participantId
        ? String(participant.participantId)
        : participant.userId
        ? String(participant.userId)
        : null,
    studentId:
      typeof participant.studentId === 'string'
        ? participant.studentId
        : participant.studentId
        ? String(participant.studentId)
        : null,
    name,
    durationSeconds,
    attendedDuration: participant.attendedDuration || durationSeconds,
    durationFormatted: participant.durationFormatted || null,
    duration: formatDurationFromSeconds(durationSeconds),
    rawStatus,
    status: statusLabel,
    log: statusLabel,
    recordId,
    isHost: participant.isHost || false, // Include host flag
    isCurrentlyInMeeting:
      participant.isCurrentlyInMeeting || participant.isLive || false,
    timeoutSynchronized: participant.timeoutSynchronized || false,
    isUnauthenticated: isUnauthenticated, // Phase 2 Task 3: Flag for unauthenticated updates
    entryId:
      entryTokens.join('|') ||
      `${key ?? 'anon'}|${joinIso ?? ''}|${leaveIso ?? ''}|${
        sessionDateIso ?? ''
      }|${participant.lastSeen ?? ''}`,
    // FIX: For hosts (instructors), never mark as left unless meeting explicitly ended
    // This prevents incorrect "left" status when extension sends leave events
    // IMPORTANT: Host check comes FIRST before isLiveOverride to prevent false "left" status
    isLive: participant.isHost
      ? true // Hosts are always considered live while in their own meeting view
      : typeof isLiveOverride === 'boolean'
      ? isLiveOverride
      : typeof participant.isLive === 'boolean'
      ? participant.isLive
      : rawStatus !== 'left',
    // FIX: Hosts should not be marked as left - they control the meeting
    isLeft: participant.isHost ? false : markLeft || rawStatus === 'left',
    isNew: markNew || rawStatus === 'joined',
    joinTime: participant.joinTime || null,
    joinTimeIso: joinIso,
    joinTimeDisplay: formatTimeDisplay(joinDate || participant.joinTime, '—'),
    leaveTime: participant.leaveTime || participant.timeOut || null,
    leaveTimeIso: leaveIso,
    leaveTimeDisplay: formatTimeDisplay(
      leaveDate || participant.leaveTime || participant.timeOut,
      '—'
    ),
    timeOut: formatTimeDisplay(
      leaveDate || participant.leaveTime || participant.timeOut,
      '—'
    ),
    lastSeen: participant.lastSeen || new Date().toISOString()
  }

  if (!row.sessionDate) {
    row.sessionDate = row.joinTimeIso || defaultDate || new Date().toISOString()
  }

  row.dateDisplay = row.sessionDate
    ? new Date(row.sessionDate).toISOString().split('T')[0]
    : null

  return row
}

const Dashboard2 = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [showNotifications, setShowNotifications] = useState(false)
  const [liveRowsState, setLiveRowsState] = useState(() =>
    loadStoredRows(STORAGE_KEYS.live)
  ) // Live participants currently in meeting
  const [historicalRowsState, setHistoricalRowsState] = useState(() =>
    loadStoredRows(STORAGE_KEYS.historical)
  ) // Historical participants who left
  const [allRows, setAllRows] = useState(() => loadStoredRows(STORAGE_KEYS.all)) // Combined and deduplicated rows
  const [isConnected, setIsConnected] = useState(false)
  const [extensionConnected, setExtensionConnected] = useState(false)
  const [meetingStatus, setMeetingStatus] = useState(MEETING_STATUS.IDLE) // idle, active, scraping, data_received
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [lastExtensionHeartbeat, setLastExtensionHeartbeat] = useState(null)
  const [extensionActivityFromBackend, setExtensionActivityFromBackend] =
    useState(null) // PHASE 3: Extension activity from backend debug endpoint
  const [debugRealtimeInfo, setDebugRealtimeInfo] = useState(null)
  const [meetingDebugInfo, setMeetingDebugInfo] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all') // all, present, late, absent
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [socketError, setSocketError] = useState(null) // Track Socket.IO errors
  const [allowedGroupIds, setAllowedGroupIds] = useState([])
  const [allowedSubjectIds, setAllowedSubjectIds] = useState([])
  const [subjectOptions, setSubjectOptions] = useState([])
  const [allowedIdsLoaded, setAllowedIdsLoaded] = useState(false) // Track if IDs are loaded
  const [hasUnauthenticatedUpdates, setHasUnauthenticatedUpdates] =
    useState(false) // PHASE 1 FIX: Track unauthenticated updates
  const [showUnauthenticatedUpdates, setShowUnauthenticatedUpdates] =
    useState(true) // Phase 2 Task 3: Filter toggle for unauthenticated updates
  // Note: showDiagnostics state moved to DiagnosticPanel component
  const [lastUpdateReceived, setLastUpdateReceived] = useState(null) // PHASE 1.1: Track last update timestamp
  const [realtimeSource, setRealtimeSource] = useState('unknown') // PHASE 1.1: Track current realtime data source for diagnostics
  const [roomsJoined, setRoomsJoined] = useState([]) // PHASE 1.1: Track joined rooms
  const [durationTick, setDurationTick] = useState(0) // Force re-render every second for live duration updates
  const [sessionSummary, setSessionSummary] = useState(null)
  const [apiError, setApiError] = useState(null)
  const [selectedSubjectId, setSelectedSubjectId] = useState('all')
  const [riskSummary, setRiskSummary] = useState({
    subjectId: null,
    byUserId: {},
    list: []
  })
  const [riskLoading, setRiskLoading] = useState(false)
  const [riskError, setRiskError] = useState('')
  const [scheduleWindow, setScheduleWindow] = useState([])
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [appeals, setAppeals] = useState([])
  const [_appealsLoading, setAppealsLoading] = useState(false)
  const [_appealsError, setAppealsError] = useState('')
  const [appealsFilter, _setAppealsFilter] = useState('pending')
  const [_appealActionLoading, setAppealActionLoading] = useState(null)

  const stickyHostRef = useRef(null)

  const isRowStickyHost = useCallback(row => {
    if (!row || !stickyHostRef.current) {
      return false
    }

    const toKey = value => {
      if (!value) return null
      if (typeof value === 'object') {
        if (value._id) return value._id.toString()
        if (value.id) return value.id.toString()
      }
      return value.toString ? value.toString() : null
    }

    const sticky = stickyHostRef.current
    const rowKey =
      toKey(row.key) ||
      toKey(row.participantId) ||
      toKey(row.userId) ||
      toKey(row.avatarUrl) ||
      (row.name ? row.name.toLowerCase() : null)
    const stickyKey =
      toKey(sticky.key) ||
      toKey(sticky.participantId) ||
      toKey(sticky.userId) ||
      toKey(sticky.avatarUrl) ||
      (sticky.name ? sticky.name.toLowerCase() : null)

    if (rowKey && stickyKey && rowKey === stickyKey) {
      return true
    }

    if (
      row.name &&
      sticky.name &&
      row.name.toLowerCase() === sticky.name.toLowerCase()
    ) {
      return true
    }

    return false
  }, [])

  // ========================================================================
  // MEETING STATUS LOCK - Prevents erratic status changes
  // Only allows specific transitions to prevent UI flicker
  // MOVED TO TOP: Must be defined before useEffects that use it
  // ========================================================================
  const lastStatusChangeRef = useRef(Date.now())
  const STATUS_CHANGE_DEBOUNCE_MS = 2000 // Minimum 2 seconds between status changes

  // Stable meeting status change helper - prevents erratic status changes
  const setStableMeetingStatus = useCallback(newStatus => {
    const now = Date.now()
    const timeSinceLastChange = now - lastStatusChangeRef.current

    // Allow immediate transition from idle to active (meeting started)
    // Also allow immediate transition to idle (meeting ended)
    const isStartTransition =
      newStatus === MEETING_STATUS.ACTIVE ||
      newStatus === MEETING_STATUS.DATA_RECEIVED ||
      newStatus === MEETING_STATUS.SCRAPING
    const isEndTransition = newStatus === MEETING_STATUS.IDLE

    if (
      isEndTransition ||
      timeSinceLastChange >= STATUS_CHANGE_DEBOUNCE_MS ||
      isStartTransition
    ) {
      setMeetingStatus(prev => {
        // Prevent redundant updates
        if (prev === newStatus) return prev

        // Log status transition
        console.log(
          `🔄 Meeting status: ${prev} → ${newStatus} (debounce: ${timeSinceLastChange}ms)`
        )
        lastStatusChangeRef.current = now
        return newStatus
      })
    } else {
      console.log(
        `⏸️ Status change blocked: ${newStatus} (debounce: ${timeSinceLastChange}ms < ${STATUS_CHANGE_DEBOUNCE_MS}ms)`
      )
    }
  }, [])

  const handleSubjectChange = useCallback(event => {
    setSelectedSubjectId(event.target.value)
  }, [])

  useEffect(() => {
    const active =
      selectedSubjectId === 'all' ? allowedSubjectIds[0] : selectedSubjectId
    if (!active) {
      setRiskSummary({ subjectId: null, byUserId: {}, list: [] })
      setRiskError('')
      setRiskLoading(false)
      return
    }

    let cancelled = false
    const load = async () => {
      setRiskLoading(true)
      setRiskError('')
      try {
        const response = await apiGet(ENDPOINTS.ATTENDANCE_RISK.SUBJECT(active))
        if (!response.ok) {
          throw new Error(`Failed to load risk summary (${response.status})`)
        }
        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error || 'Unknown error loading risk summary')
        }
        if (cancelled) return
        const list = Array.isArray(result.data) ? result.data : []
        const byUserId = {}
        list.forEach(entry => {
          if (entry?.userId) {
            byUserId[entry.userId.toString()] = entry
          }
        })
        setRiskSummary({ subjectId: active, byUserId, list })
      } catch (error) {
        if (!cancelled) {
          console.error('Dashboard risk load failed:', error)
          setRiskError(error?.message || 'Failed to load risk summary')
          setRiskSummary(prev => ({ ...prev, byUserId: {}, list: [] }))
        }
      } finally {
        if (!cancelled) {
          setRiskLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [allowedSubjectIds, selectedSubjectId])

  // ========================================================================
  // HOST ABSENCE GRACE PERIOD SYSTEM
  // Prevents flickering "host left" / "data received" messages
  // Only declares host as left after grace period has elapsed
  // ========================================================================
  const hostLastSeenRef = useRef(Date.now()) // When host was last confirmed active
  const HOST_ABSENCE_GRACE_MS = 5000 // 5 seconds grace period before declaring host left

  // Mark host as seen (resets grace period timer)
  const markHostSeen = useCallback(() => {
    hostLastSeenRef.current = Date.now()
  }, [])

  // Handle host absence WITH grace period - prevents flickering
  const handleHostAbsenceWithGrace = useCallback(
    (tracker, logPrefix = '') => {
      const timeSinceLastSeen = Date.now() - hostLastSeenRef.current

      if (timeSinceLastSeen < HOST_ABSENCE_GRACE_MS) {
        // Still within grace period - don't declare host as left yet
        console.log(
          `⏸️ ${logPrefix}Host absence detected but within grace period (${Math.round(
            timeSinceLastSeen / 1000
          )}s < ${HOST_ABSENCE_GRACE_MS / 1000}s) - not pausing yet`
        )
        return false // Did not pause
      }

      // Grace period exceeded - now safe to declare host as left
      console.log(
        `🚪 ${logPrefix}Host absent for ${Math.round(
          timeSinceLastSeen / 1000
        )}s (exceeded ${
          HOST_ABSENCE_GRACE_MS / 1000
        }s grace) - pausing duration tracking`
      )
      tracker.pause()
      setStableMeetingStatus(MEETING_STATUS.PAUSED)
      return true // Did pause
    },
    [setStableMeetingStatus]
  )

  // Handle host presence (resume tracking and reset grace period)
  const handleHostPresence = useCallback(
    (tracker, hostName, logPrefix = '') => {
      markHostSeen() // Reset grace period timer

      if (tracker.isTrackingPaused()) {
        console.log(
          `🚪 ${logPrefix}Host "${hostName}" detected - resuming duration tracking`
        )
        tracker.resume()
        setStableMeetingStatus(MEETING_STATUS.DATA_RECEIVED)
      }
    },
    [markHostSeen, setStableMeetingStatus]
  )

  // Calculate live duration for a participant row
  // CRITICAL: Use extension's durationSeconds/attendedDuration directly - DO NOT recalculate
  // Extension increments attendedDuration every second, we just display it
  const getLiveDuration = useCallback(
    row => {
      // Use durationTick to trigger re-render every second
      void durationTick

      if (!row) return '00:00:00'

      // Priority order for duration source (FIX Dec 4, 2025):
      // 1. attendedDuration (extension's internal tracking - AUTHORITATIVE)
      // 2. durationSeconds (may be from DurationTracker)
      // 3. duration (pre-formatted string)
      // 4. DurationTracker (fallback calculation)

      // Use extension's attendedDuration directly - this is the authoritative source
      const extensionDuration =
        typeof row.attendedDuration === 'number'
          ? row.attendedDuration // Extension's value FIRST
          : typeof row.durationSeconds === 'number'
          ? row.durationSeconds
          : null

      if (extensionDuration !== null && extensionDuration >= 0) {
        return formatDurationRT(extensionDuration)
      }

      // If we have a pre-formatted duration string from extension, use it
      if (row.durationFormatted && row.durationFormatted !== '00:00:00') {
        return row.durationFormatted
      }

      // If we have a duration string, use it
      if (row.duration && row.duration !== '00:00:00') {
        return row.duration
      }

      // Fallback: Use DurationTracker only when extension data is not available
      // This handles the case when extension bridge isn't active
      if (row.isLive && !row.isLeft) {
        const tracker = getDurationTracker()
        const trackerDuration = tracker.getDuration(row.key)
        if (trackerDuration > 0) {
          return formatDurationRT(trackerDuration)
        }
      }

      return '00:00:00'
    },
    [durationTick]
  )

  const markRealtimeDataUpdate = (source, time) => {
    const now = time || new Date()
    setLastUpdateReceived(now)
    setRealtimeSource(source)
  }
  // Phase 2 Task 4: Enhanced update queue with timeout support
  const updateQueueRef = useRef([]) // PHASE 2 FIX: Queue for updates arriving before rooms joined
  const UPDATE_QUEUE_TIMEOUT_MS = 10000 // 10 seconds max wait time (reduced from 30s for faster update display)
  const updateQueueTimeoutRef = useRef(null) // Timeout for processing queued updates
  const allowedGroupsRef = useRef(new Set())
  const allowedSubjectIdsRef = useRef([])
  const allowedGroupIdsRef = useRef([])
  const roomsJoinedRef = useRef([]) // Ref for use in socket handlers (avoids stale closure)

  // REAL-TIME BRIDGE: Refs and state for extension bridge connection
  const lastExtensionBridgeDataRef = useRef(null) // Cache last received data to detect changes
  // Note: _extensionBridgeActive ref used for internal tracking, prefixed with _ to indicate internal use
  const _extensionBridgeActive = useRef(false)

  // ========================================================================
  // ATTENDANCE HISTORY SYSTEM - State and Refs
  // ========================================================================
  const [attendanceHistory, setAttendanceHistory] = useState(() =>
    loadAttendanceHistory()
  )
  const [showHistoryPanel, setShowHistoryPanel] = useState(false) // Toggle history viewer
  const [selectedHistorySession, setSelectedHistorySession] = useState(null) // View specific session
  const [showClearWarning, setShowClearWarning] = useState(false) // Warning modal for clear display
  const currentMeetCodeRef = useRef(getCurrentMeetCode()) // Track current meeting code
  const sessionStartTimeRef = useRef(null) // When current session started

  const updateLiveRows = (updater, options = {}) => {
    setLiveRowsState(prevRows => {
      const resolved =
        typeof updater === 'function' ? updater(prevRows) : updater
      const nextRows = Array.isArray(resolved) ? resolved : []
      if (!options.allowEmpty && nextRows.length === 0) {
        return prevRows
      }
      persistRows(STORAGE_KEYS.live, nextRows)
      return nextRows
    })
  }

  const updateHistoricalRows = (updater, options = {}) => {
    setHistoricalRowsState(prevRows => {
      const resolved =
        typeof updater === 'function' ? updater(prevRows) : updater
      const nextRows = Array.isArray(resolved) ? resolved : []
      if (!options.allowEmpty && nextRows.length === 0) {
        return prevRows
      }
      persistRows(STORAGE_KEYS.historical, nextRows)
      return nextRows
    })
  }

  // FIX: Helper function to normalize names for comparison
  // Extracts the core name parts and normalizes case/whitespace
  const normalizeNameForComparison = name => {
    if (!name || typeof name !== 'string') return ''
    // Remove extra whitespace, convert to lowercase, trim
    return name.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  // FIX: Check if two names are similar enough to be the same person
  // Handles cases where name slightly changes (e.g., "Zairu Gurey Bacor" vs "Zairu Gurey Bacordevices")
  const areNamesSimilar = (name1, name2) => {
    const n1 = normalizeNameForComparison(name1)
    const n2 = normalizeNameForComparison(name2)
    if (!n1 || !n2) return false
    if (n1 === n2) return true
    // Check if one name starts with the other (common with display name changes)
    if (n1.startsWith(n2) || n2.startsWith(n1)) return true
    // Check first 2 words match (first + last name match)
    const words1 = n1.split(' ').slice(0, 2).join(' ')
    const words2 = n2.split(' ').slice(0, 2).join(' ')
    if (words1 === words2 && words1.length > 3) return true
    return false
  }

  // Function to deduplicate and combine rows
  const combineAndDeduplicateRows = useCallback((live, historical) => {
    const combined = [...live, ...historical]
    const uniqueRows = []
    const seen = new Set()
    const nameMap = new Map() // Map normalized name to row index for similarity matching

    combined.forEach(row => {
      // Create a unique key using participantId/userId + subjectId + sessionDate
      // This prevents duplicates from same participant in same session
      const participantIdentifier =
        row.participantId || row.userId || row.studentId || row.name
      const sessionIdentifier =
        row.sessionDate ||
        row.joinTimeIso ||
        new Date().toISOString().split('T')[0]
      const subjectIdentifier =
        row.subjectId || row.group || row.meetCode || 'default'

      // Use entryId if available (most unique), otherwise construct key
      const key =
        row.entryId ||
        row.recordId ||
        `${participantIdentifier}-${subjectIdentifier}-${sessionIdentifier}` ||
        `${row.name}-${subjectIdentifier}-${sessionIdentifier}` ||
        row.key

      // FIX: Also check for similar names to prevent duplicates from name changes
      const normalizedName = normalizeNameForComparison(row.name)
      let foundSimilarIndex = -1

      // Check if a similar name already exists
      for (const [existingName, existingIndex] of nameMap.entries()) {
        if (areNamesSimilar(normalizedName, existingName)) {
          foundSimilarIndex = existingIndex
          break
        }
      }

      if (!seen.has(key) && foundSimilarIndex === -1) {
        seen.add(key)
        nameMap.set(normalizedName, uniqueRows.length)
        uniqueRows.push(row)
      } else {
        // Duplicate found by key or similar name - merge with existing
        const existingIndex =
          foundSimilarIndex !== -1
            ? foundSimilarIndex
            : uniqueRows.findIndex(r => {
                const existingKey =
                  r.entryId ||
                  r.recordId ||
                  `${r.participantId || r.userId || r.studentId || r.name}-${
                    r.subjectId || r.group || r.meetCode || 'default'
                  }-${
                    r.sessionDate ||
                    r.joinTimeIso ||
                    new Date().toISOString().split('T')[0]
                  }` ||
                  `${r.name}-${
                    r.subjectId || r.group || r.meetCode || 'default'
                  }-${
                    r.sessionDate ||
                    r.joinTimeIso ||
                    new Date().toISOString().split('T')[0]
                  }` ||
                  r.key
                return existingKey === key
              })

        if (existingIndex !== -1) {
          // Prioritize: live > historical, then by lastSeen timestamp
          const existingRow = uniqueRows[existingIndex]
          const existingIsLive = existingRow.isLive
          const incomingIsLive = row.isLive

          if (incomingIsLive && !existingIsLive) {
            // Replace historical with live, but keep the original name
            const mergedRow = { ...row, name: existingRow.name }
            uniqueRows[existingIndex] = mergedRow
            console.log(
              `🔄 Merged duplicate: "${row.name}" -> keeping "${existingRow.name}"`
            )
          } else if (incomingIsLive === existingIsLive) {
            // Both same type, prefer more recent (by lastSeen or timestamp)
            const existingTime =
              existingRow.lastSeen || existingRow.joinTimeIso || ''
            const incomingTime = row.lastSeen || row.joinTimeIso || ''
            if (incomingTime > existingTime) {
              // Update with new data but keep original name
              const mergedRow = { ...row, name: existingRow.name }
              uniqueRows[existingIndex] = mergedRow
            }
          }
          // Otherwise keep existing (historical shouldn't replace live)
        }
      }
    })

    return uniqueRows
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isFieldMissing = value =>
    value === undefined || value === null || value === '—' || value === ''

  const mergeRowWithExisting = useCallback((incomingRow, existingRow) => {
    if (!existingRow) return incomingRow
    const merged = { ...existingRow, ...incomingRow }

    // FIX: Removed 'duration' and 'durationSeconds' from fieldsToPreserve
    // These should ALWAYS update from incoming data to show real-time progress
    const fieldsToPreserve = [
      'joinTime',
      'joinTimeIso',
      'joinTimeDisplay',
      'timeIn',
      // 'duration' - REMOVED: should always update
      // 'durationSeconds' - REMOVED: should always update
      'entryId',
      'sessionDate',
      'dateDisplay',
      'isHost' // FIX: Preserve host flag - once identified as host, stay host
    ]

    fieldsToPreserve.forEach(field => {
      if (
        isFieldMissing(incomingRow?.[field]) &&
        !isFieldMissing(existingRow?.[field])
      ) {
        merged[field] = existingRow[field]
      }
    })

    // FIX: Special handling for isHost - once identified as host, ALWAYS keep as host
    // This prevents the instructor from losing host status due to extension data inconsistency
    if (existingRow?.isHost === true) {
      merged.isHost = true
      merged.isLive = true // Hosts are always live
      merged.isLeft = false // Hosts never "left" in their own view
    }

    // CRITICAL FIX (Dec 4, 2025): Always update duration from incoming data
    // Prioritize attendedDuration (extension's authoritative value) over durationSeconds
    // Extension tracks actual seconds participant was visible in Google Meet
    if (typeof incomingRow?.attendedDuration === 'number') {
      merged.durationSeconds = incomingRow.attendedDuration
      merged.attendedDuration = incomingRow.attendedDuration
      merged.duration = formatDurationFromSeconds(incomingRow.attendedDuration)
    } else if (typeof incomingRow?.durationSeconds === 'number') {
      merged.durationSeconds = incomingRow.durationSeconds
      merged.duration = formatDurationFromSeconds(incomingRow.durationSeconds)
    }

    // FIX: Handle participant return - clear timeOut when participant is live again
    // If incoming row is live and existing row had left, the participant has returned
    if (incomingRow?.isLive === true && existingRow?.isLeft === true) {
      console.log(
        `🔙 Participant returned: "${incomingRow.name}" - clearing timeOut`
      )
      merged.leaveTime = null
      merged.leaveTimeIso = null
      merged.timeOut = null
      merged.isLeft = false
      merged.rawStatus = 'present'
      merged.status = 'present'
    }

    // FIX: When participant leaves, preserve the timeOut from incoming data
    // Check for any leave time indicator (timeOut, leaveTime, leaveTimeIso, leaveTimeDisplay)
    if (incomingRow?.isLeft === true || incomingRow?.isLive === false) {
      // Preserve leave time from incoming data if available
      if (incomingRow?.timeOut && incomingRow.timeOut !== '—') {
        merged.timeOut = incomingRow.timeOut
      }
      if (incomingRow?.leaveTime) {
        merged.leaveTime = incomingRow.leaveTime
      }
      if (incomingRow?.leaveTimeIso) {
        merged.leaveTimeIso = incomingRow.leaveTimeIso
      }
      if (
        incomingRow?.leaveTimeDisplay &&
        incomingRow.leaveTimeDisplay !== '—'
      ) {
        merged.leaveTimeDisplay = incomingRow.leaveTimeDisplay
      }
      // Only mark as left if NOT a host
      if (!merged.isHost) {
        merged.isLeft = true
      }
    }

    // FIX: Ensure name is not concatenated - always use incoming name if valid
    if (incomingRow?.name && typeof incomingRow.name === 'string') {
      merged.name = incomingRow.name.trim()
    }

    return merged
  }, [])

  // Join Socket.IO rooms for real-time attendance updates
  // Note: Client sockets don't have join() method - we emit an event to the server
  // which will handle the actual room joining on the server side
  const joinSocketRooms = useCallback((socket, subjectIds, groupIds) => {
    if (!socket || !socket.connected) {
      console.warn('⚠️ Cannot join rooms: socket not connected')
      return
    }

    // Prepare arrays of IDs to send to server
    const subjectIdsArray =
      subjectIds && subjectIds.length > 0
        ? subjectIds.map(id => id.toString())
        : []

    const groupIdsArray =
      groupIds && groupIds.length > 0 ? groupIds.map(id => id.toString()) : []

    // PHASE 2 FIX: Always emit join request even with empty IDs
    // Backend will automatically join catch-all room 'subject:unauthenticated' for unauthenticated updates
    // This ensures we receive updates even when IDs are not loaded yet or when extension sends unauthenticated updates
    if (subjectIdsArray.length === 0 && groupIdsArray.length === 0) {
      console.log(
        'ℹ️ No subject/group IDs available - joining catch-all room for unauthenticated updates'
      )
    }

    // Emit event to server requesting room join
    // Server will handle the actual socket.join() calls, including catch-all room
    socket.emit('instructor:join-rooms', {
      subjectIds: subjectIdsArray,
      groupIds: groupIdsArray
    })

    const totalRooms = subjectIdsArray.length + groupIdsArray.length
    const roomNames = [
      ...subjectIdsArray.map(id => `subject:${id}`),
      ...groupIdsArray.map(id => `group:${id}`)
    ]

    console.log(`📤 === REQUESTING ROOM JOIN ===`)
    console.log(`   Total rooms: ${totalRooms}`)
    console.log(`   Room names:`, roomNames)
    console.log(`   Subject IDs:`, subjectIdsArray)
    console.log(`   Group IDs:`, groupIdsArray)
    console.log(
      `📤 Requested to join ${totalRooms} Socket.IO room(s):`,
      roomNames
    )
    console.log(
      `   💡 Waiting for backend confirmation via 'rooms:joined' event...`
    )

    // Note: Room membership will be confirmed via 'rooms:joined' event from backend
    // Do not rely on client-side socket.rooms check as it's unreliable
    // The roomsJoined state will be updated when backend confirms via the event listener above
  }, [])

  const payloadMatchesAllowedGroups = (payload, isUnauthenticated = false) => {
    const allowed = allowedGroupsRef.current

    // PHASE 2 FIX: Allow unauthenticated updates even when IDs not loaded
    // This ensures updates are displayed even during initialization or when credentials are missing
    if (isUnauthenticated) {
      console.log(
        '✅ Allowing unauthenticated update (bypassing strict filtering)'
      )
      return true // Always allow unauthenticated updates
    }

    // PHASE 2.2 FIX: Queue authenticated updates if IDs not loaded instead of rejecting
    // This prevents data loss during initialization while maintaining security
    if (!allowed || allowed.size === 0) {
      // Don't log here - let caller handle logging
      return 'queue' // Return special value to indicate queueing instead of rejection
    }

    const candidateIds = new Set()
    const pushId = value => {
      if (!value) return
      if (typeof value === 'object' && value._id) {
        candidateIds.add(value._id.toString())
      } else {
        candidateIds.add(value.toString())
      }
    }

    // Check legacy groupId fields (backward compatibility)
    pushId(payload?.groupId)
    pushId(payload?.group?._id)
    pushId(payload?.participant?.groupId)
    pushId(payload?.participant?.group?._id)

    // Check current subjectId fields (current system)
    pushId(payload?.subjectId)
    pushId(payload?.subject?._id)
    pushId(payload?.participant?.subjectId)
    pushId(payload?.participant?.subject?._id)

    if (Array.isArray(payload?.currentParticipants)) {
      payload.currentParticipants.forEach(participant => {
        // Legacy group fields
        pushId(participant.groupId || participant.group?._id)
        // Current subject fields
        pushId(participant.subjectId || participant.subject?._id)
      })
    }

    if (candidateIds.size === 0) {
      return false
    }

    for (const id of candidateIds) {
      if (allowed.has(id)) {
        return true
      }
    }
    return false
  }

  // Update allRows whenever live or historical rows change
  useEffect(() => {
    const combined = combineAndDeduplicateRows(
      liveRowsState,
      historicalRowsState
    )
    setAllRows(combined)
    setLastUpdated(new Date())
    persistRows(STORAGE_KEYS.all, combined)

    // Synchronization validation logging
    const hostCount = combined.filter(row => row.isHost === true).length
    const participantCount = combined.filter(row => !row.isHost).length
    const totalCount = combined.length

    console.log(`📊 === DASHBOARD STATE UPDATE ===`)
    console.log(`   Total rows: ${totalCount}`)
    console.log(`   Host count: ${hostCount}`)
    console.log(`   Participant count: ${participantCount}`)
    if (hostCount > 0) {
      const hostNames = combined
        .filter(row => row.isHost === true)
        .map(h => h.name || 'Unknown')
        .join(', ')
      console.log(`   Host name(s): ${hostNames}`)
    }
    console.log(`   Last updated: ${new Date().toLocaleTimeString()}`)
  }, [liveRowsState, historicalRowsState, combineAndDeduplicateRows])

  // INITIALIZATION: Load stored participants on mount (recovery after page reload)
  // CRITICAL FIX: Check DurationTracker pause state to show correct meeting status
  useEffect(() => {
    const tracker = getDurationTracker()
    const storedData = loadParticipantsFromStorage()

    // Check if tracking was paused (instructor left before page refresh)
    const wasPaused = tracker.isTrackingPaused()
    const instructorHadLeft = tracker.hasInstructorLeft()

    console.log(
      `📂 Page initialization: isPaused=${wasPaused}, instructorLeft=${instructorHadLeft}`
    )

    if (
      storedData &&
      storedData.participants &&
      storedData.participants.length > 0
    ) {
      const ageMs = Date.now() - new Date(storedData.updatedAt).getTime()
      const ageMinutes = Math.floor(ageMs / 60000)

      // Only restore if data is less than 30 minutes old (meeting likely still active)
      if (ageMinutes < 30) {
        console.log(
          `📂 Restoring ${storedData.participants.length} participants from localStorage (${ageMinutes}m old)`
        )

        // Build display rows from stored data
        const restoredRows = storedData.participants.map(p =>
          buildDisplayRow(p, {
            defaultGroup: storedData.meetCode,
            defaultDate: storedData.updatedAt
          })
        )

        // Update liveRows with restored data
        if (restoredRows.length > 0) {
          setLiveRowsState(restoredRows)

          // CRITICAL FIX: Set correct meeting status based on pause state
          if (wasPaused || instructorHadLeft) {
            // Instructor had left - show paused status
            setMeetingStatus(MEETING_STATUS.PAUSED)
            console.log(
              `⏸️ Meeting status set to 'paused' (instructor left before refresh)`
            )
          } else {
            // Need to validate with backend if meeting is still active
            setMeetingStatus(MEETING_STATUS.DATA_RECEIVED)
            console.log(
              `✅ Restored ${restoredRows.length} participant rows - will validate with backend`
            )

            // Async validation with backend to confirm active meeting
            validateMeetingStatusWithBackend(storedData.meetCode)
          }
        }
      } else {
        console.log(
          `📂 Stored data is ${ageMinutes}m old - not restoring (too old)`
        )
        // Clear old data and reset meeting status
        tracker.clear()
        setMeetingStatus(MEETING_STATUS.IDLE)
      }
    } else if (wasPaused || instructorHadLeft) {
      // No stored participants but tracker shows instructor left
      setMeetingStatus(MEETING_STATUS.PAUSED)
      console.log(
        `⏸️ Meeting status set to 'paused' (no participants, instructor had left)`
      )
    }

    // Helper function to validate meeting status with backend
    async function validateMeetingStatusWithBackend (meetCode) {
      try {
        console.log(
          `🔍 Validating meeting status with backend for ${meetCode}...`
        )
        const response = await apiGet('/attendance/live-participants')

        if (response && response.meetings && response.meetings.length > 0) {
          // Check if there's an active meeting with a host
          const activeMeeting = response.meetings.find(
            m => m.meetCode?.toLowerCase() === meetCode?.toLowerCase()
          )

          if (
            activeMeeting &&
            activeMeeting.hosts &&
            activeMeeting.hosts.length > 0
          ) {
            // Meeting is active with host - keep data_received status
            console.log(
              `✅ Backend confirms active meeting with host for ${meetCode}`
            )
            setMeetingStatus(MEETING_STATUS.DATA_RECEIVED)
            // Resume tracking if it was paused
            if (tracker.isTrackingPaused()) {
              tracker.resume()
            }
          } else {
            // No active host on backend - set to paused
            console.log(
              `⏸️ No active host found on backend for ${meetCode} - setting status to paused`
            )
            setMeetingStatus(MEETING_STATUS.PAUSED)
            if (!tracker.isTrackingPaused()) {
              tracker.pause()
            }
          }
        } else {
          // No active meetings on backend
          console.log(
            `ℹ️ No active meetings on backend - checking if data is stale`
          )
          const dataAgeSeconds = Math.floor(
            (Date.now() -
              new Date(storedData?.updatedAt || Date.now()).getTime()) /
              1000
          )

          if (dataAgeSeconds > 40) {
            // Data is older than 40 seconds and no backend activity - instructor likely left
            console.log(
              `⏸️ Data is ${dataAgeSeconds}s old with no backend activity - setting status to paused`
            )
            setMeetingStatus(MEETING_STATUS.PAUSED)
            if (!tracker.isTrackingPaused()) {
              tracker.pause()
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Backend validation failed:`, error.message)
        // Keep current status if backend check fails
      }
    }
  }, []) // Run once on mount

  // REAL-TIME DURATION TRACKING: Auto-increment durations every second
  useEffect(() => {
    const tracker = getDurationTracker()

    // Subscribe to duration updates
    const unsubscribe = tracker.subscribe(durations => {
      if (durations.size === 0) return

      setLiveRowsState(prevRows => {
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
              duration: formatDurationRT(liveDuration)
            }
          }
          return row
        })

        if (hasChanges) {
          // Persist updated rows with new durations
          persistRows(STORAGE_KEYS.live, updated)
        }

        return hasChanges ? updated : prevRows
      })
    })

    console.log('⏱️ Real-time duration tracking started')

    return () => {
      unsubscribe()
      console.log('⏱️ Real-time duration tracking stopped')
    }
  }, []) // Empty deps - run once on mount

  // ========================================================================
  // PROACTIVE STALE DATA CHECK: Pause tracking when no updates received
  // This runs INDEPENDENTLY every 10 seconds to detect when instructor leaves
  // (extension stops sending data = no incoming updates to trigger reactive checks)
  // ========================================================================
  const lastDataTimestampRef = useRef(Date.now())

  useEffect(() => {
    const STALE_THRESHOLD_MS = 30000 // 30 seconds without data = stale
    const CHECK_INTERVAL_MS = 10000 // Check every 10 seconds

    const checkForStaleData = () => {
      const timeSinceLastData = Date.now() - lastDataTimestampRef.current
      const tracker = getDurationTracker()

      if (timeSinceLastData > STALE_THRESHOLD_MS) {
        // No data received for 30+ seconds - pause tracking
        if (!tracker.isTrackingPaused()) {
          console.log(
            `🚪 Stale Data Check: No data for ${Math.floor(
              timeSinceLastData / 1000
            )}s - pausing duration tracking`
          )
          tracker.pause()
          setMeetingStatus(MEETING_STATUS.PAUSED)
        }
      }
    }

    // Start periodic check
    const intervalId = setInterval(checkForStaleData, CHECK_INTERVAL_MS)
    console.log('🔍 Stale data check started (every 10s, threshold 30s)')

    return () => {
      clearInterval(intervalId)
      console.log('🔍 Stale data check stopped')
    }
  }, [])

  // ========================================================================
  // LIVE DURATION TICK: Force re-render every second for smooth duration counting
  // This ensures the duration display updates smoothly during active meetings
  // ========================================================================
  useEffect(() => {
    // Only run duration tick when meeting is active (not idle or paused)
    if (
      meetingStatus === MEETING_STATUS.IDLE ||
      meetingStatus === MEETING_STATUS.PAUSED
    ) {
      return
    }

    const durationInterval = setInterval(() => {
      setDurationTick(prev => prev + 1)
    }, 1000)

    console.log('⏱️ Duration tick started (1s interval)')

    return () => {
      clearInterval(durationInterval)
      console.log('⏱️ Duration tick stopped')
    }
  }, [meetingStatus])

  // ========================================================================
  // ATTENDANCE HISTORY: Auto-save when meeting code changes
  // When a new meeting starts, save current session to history
  // ========================================================================

  // Function to save current session to history
  const saveCurrentSessionToHistory = useCallback(() => {
    const currentMeetCode = currentMeetCodeRef.current
    if (!currentMeetCode || allRows.length === 0) {
      console.log('📝 No session data to save (no meetCode or empty rows)')
      return false
    }

    // Get session start time
    const startTime =
      sessionStartTimeRef.current ||
      window.localStorage.getItem(
        ATTENDANCE_STORAGE_KEYS.currentSessionStart
      ) ||
      new Date().toISOString()

    // Prepare session data
    const sessionData = {
      meetCode: currentMeetCode,
      participants: allRows,
      startTime: startTime,
      sessionDate: new Date().toISOString().split('T')[0],
      subjectName: allRows[0]?.group || currentMeetCode
    }

    // Save to history
    const saved = saveSessionToHistory(sessionData)
    if (saved) {
      // Refresh history state
      setAttendanceHistory(loadAttendanceHistory())
      console.log(`✅ Auto-saved session ${currentMeetCode} to history`)
    }
    return saved
  }, [allRows])

  // Detect meetCode changes and auto-save previous session
  const handleMeetCodeChange = useCallback(
    newMeetCode => {
      const previousMeetCode = currentMeetCodeRef.current

      // If same meetCode, do nothing
      if (newMeetCode === previousMeetCode) {
        return
      }

      // If there was a previous session with data, save it
      if (previousMeetCode && allRows.length > 0) {
        console.log(
          `🔄 Meeting code changed: ${previousMeetCode} → ${newMeetCode}`
        )
        console.log(
          `📝 Auto-saving previous session (${allRows.length} participants)...`
        )
        saveCurrentSessionToHistory()

        // Clear current display for new meeting
        updateLiveRows([], { allowEmpty: true })
        updateHistoricalRows([], { allowEmpty: true })
        clearStoredRows(STORAGE_KEYS.live)
        clearStoredRows(STORAGE_KEYS.historical)
        clearStoredRows(STORAGE_KEYS.all)
        setAllRows([])

        // Clear duration tracker for fresh start
        const tracker = getDurationTracker()
        tracker.clear()

        console.log('🧹 Cleared display for new meeting')
      }

      // Update current meet code
      currentMeetCodeRef.current = newMeetCode
      sessionStartTimeRef.current = new Date().toISOString()
      setCurrentMeetCode(newMeetCode)
      console.log(`📍 Now tracking meeting: ${newMeetCode}`)
    },
    [allRows, saveCurrentSessionToHistory]
  )

  // Ref to hold the latest version of handleMeetCodeChange for use in event handlers
  const handleMeetCodeChangeRef = useRef(handleMeetCodeChange)
  useEffect(() => {
    handleMeetCodeChangeRef.current = handleMeetCodeChange
  }, [handleMeetCodeChange])

  // ========================================================================
  // EXTENSION BRIDGE: Listen for real-time data directly from extension
  // This provides TRUE real-time updates every 1 second from extension's storage
  // ========================================================================
  useEffect(() => {
    const handleExtensionBridgeMessage = event => {
      // Security: Only accept messages from same origin
      if (event.origin !== window.location.origin) {
        return
      }

      // Handle different message types from extension bridge
      if (!event.data || !event.data.type) {
        return
      }

      const { type, data, timestamp, source } = event.data

      // Only process messages from extension bridge
      if (source !== 'extension_bridge') {
        return
      }

      switch (type) {
        case 'NEATTEND_REALTIME_UPDATE': {
          // Received live participant data from extension
          if (!data || !data.participants || data.participants.length === 0) {
            return
          }

          // Check if data has changed (avoid unnecessary re-renders)
          const dataHash = JSON.stringify({
            meetCode: data.meetCode,
            count: data.participantCount,
            updatedAt: data.updatedAt
          })

          if (lastExtensionBridgeDataRef.current === dataHash) {
            return // Data hasn't changed, skip update
          }
          lastExtensionBridgeDataRef.current = dataHash

          console.log(
            `🌉 Extension Bridge: Received ${data.participants.length} participants (${data.dataAgeSeconds}s old)`
          )

          // Log host lock status from extension
          if (data.hostLocked && data.lockedHostInfo) {
            console.log(
              `🔒 Host locked: "${data.lockedHostInfo.name}" (stable identification)`
            )
          }

          // Update connection status
          _extensionBridgeActive.current = true
          setExtensionConnected(true)
          setLastExtensionHeartbeat(new Date())
          setStableMeetingStatus(MEETING_STATUS.DATA_RECEIVED)
          markRealtimeDataUpdate('extension-bridge')

          // FIX: Update data timestamp for stale data detection
          lastDataTimestampRef.current = Date.now()

          // ATTENDANCE HISTORY: Detect meetCode change and auto-save previous session
          if (data.meetCode) {
            handleMeetCodeChangeRef.current(data.meetCode)
          }

          // Track unauthenticated updates
          if (data.isUnauthenticated || data.authWarning) {
            setHasUnauthenticatedUpdates(true)
          }

          // Process participants and build display rows
          const participants = data.participants
          const tracker = getDurationTracker()

          // FIX: Check if host is present and active in incoming data
          // This detects instructor leave IMMEDIATELY from incoming data
          const activeHost = participants.find(
            p => p.isHost === true && p.isLive !== false && p.status !== 'left'
          )
          const wasHostActive = !tracker.isTrackingPaused()

          // FIX: Use grace period system to prevent flickering "host left" messages
          if (!activeHost && participants.length > 0) {
            // No active host in incoming data - use grace period before declaring left
            if (wasHostActive) {
              handleHostAbsenceWithGrace(tracker, 'Extension Bridge: ')
            }
          } else if (activeHost) {
            // Host is present - mark as seen and resume if paused
            handleHostPresence(tracker, activeHost.name, 'Extension Bridge: ')
          }

          // Sync with duration tracker for live duration updates
          tracker.syncWithParticipants(
            participants.map(p => ({
              ...p,
              key:
                p.avatarUrl || p.participantId || `${p.name}-${data.meetCode}`,
              durationSeconds: p.attendedDuration || p.durationSeconds || 0
            }))
          )

          // Save to localStorage for persistence
          saveParticipantsToStorage(participants, data.meetCode)

          // Build display rows
          const baseOptions = {
            defaultGroup: data.meetCode,
            defaultDate: data.updatedAt || timestamp,
            isLiveOverride: true,
            isUnauthenticated: data.isUnauthenticated
          }

          // Separate host from regular participants
          const hostRows = participants
            .filter(p => p.isHost)
            .map(host => buildDisplayRow(host, baseOptions))

          const regularRows = participants
            .filter(p => !p.isHost)
            .map(participant => buildDisplayRow(participant, baseOptions))

          // Update liveRows with bridge data
          updateLiveRows(prevRows => {
            const prevMap = new Map(prevRows.map(row => [row.key, row]))
            const allNewRows = [...hostRows, ...regularRows]

            // Merge with existing rows, preserving join times
            const merged = allNewRows.map(row => {
              const existing = prevMap.get(row.key)
              if (existing) {
                return {
                  ...existing,
                  ...row,
                  joinTime: existing.joinTime || row.joinTime,
                  joinTimeIso: existing.joinTimeIso || row.joinTimeIso,
                  joinTimeDisplay:
                    existing.joinTimeDisplay || row.joinTimeDisplay
                }
              }
              return row
            })

            console.log(
              `🌉 Extension Bridge: Updated liveRows with ${merged.length} participants`
            )
            return merged
          })

          setLastUpdated(new Date())
          break
        }

        case 'NEATTEND_REALTIME_STALE': {
          // Data is stale - meeting may have ended or instructor left
          console.log(
            `🌉 Extension Bridge: Data is stale (${data?.dataAgeSeconds}s old)`
          )

          // FIX: Pause duration tracking when data is stale (>30 seconds)
          // This handles the case where instructor leaves and extension stops sending data
          if (data?.dataAgeSeconds > 30) {
            const tracker = getDurationTracker()
            if (!tracker.isTrackingPaused()) {
              console.log(
                '🚪 Extension Bridge: Stale data detected - pausing duration tracking'
              )
              tracker.pause()
              setMeetingStatus(MEETING_STATUS.PAUSED)
            }
          }

          if (data?.dataAgeSeconds > 120) {
            // Data older than 2 minutes - meeting likely ended
            setMeetingStatus(MEETING_STATUS.IDLE)
          }
          break
        }

        case 'NEATTEND_REALTIME_EMPTY': {
          // No data available from extension
          console.debug('🌉 Extension Bridge: No real-time data available')
          // Don't change connection status - extension might just be idle
          break
        }

        default:
          // Unknown message type
          break
      }
    }

    // Add message listener
    window.addEventListener('message', handleExtensionBridgeMessage)
    console.log('🌉 Extension Bridge: Listener initialized')

    // Request initial data from extension
    setTimeout(() => {
      window.postMessage(
        { type: 'NEATTEND_REQUEST_REFRESH' },
        window.location.origin
      )
      console.log('🌉 Extension Bridge: Requested initial data')
    }, 500)

    // Cleanup
    return () => {
      window.removeEventListener('message', handleExtensionBridgeMessage)
      console.log('🌉 Extension Bridge: Listener removed')
    }
  }, [setStableMeetingStatus, handleHostAbsenceWithGrace, handleHostPresence]) // Include host absence helpers

  useEffect(() => {
    // Combine both group IDs and subject IDs into a single set for filtering
    const allAllowedIds = [
      ...(allowedGroupIds || []).map(id => id.toString()),
      ...(allowedSubjectIds || []).map(id => id.toString())
    ]
    allowedGroupsRef.current = new Set(allAllowedIds)
    // Update refs for use in socket handlers
    allowedSubjectIdsRef.current = allowedSubjectIds
    allowedGroupIdsRef.current = allowedGroupIds
  }, [allowedGroupIds, allowedSubjectIds])

  // NOTE: pollRealtimeStatus was REMOVED to consolidate polling mechanisms
  // Extension status is now derived from pollLiveParticipants response
  // This eliminates redundant network requests and potential race conditions

  // AGGRESSIVE LIVE PARTICIPANTS POLLING: Poll for actual participant data every 1 second
  // This is the guaranteed fallback that ensures data always displays
  // FIXED: Using refs to prevent multiple intervals and proper cleanup
  const liveParticipantsPollIntervalRef = useRef(null)
  const liveParticipantsLastPollRef = useRef(0)
  const liveParticipantsPollActiveRef = useRef(false)

  useEffect(() => {
    // Prevent multiple polling intervals from running simultaneously
    if (liveParticipantsPollActiveRef.current) {
      console.debug('Live participants polling already active, skipping setup')
      return
    }
    liveParticipantsPollActiveRef.current = true

    const pollLiveParticipants = async () => {
      try {
        const now = Date.now()

        // Throttle polling to every 2 seconds minimum (balanced for real-time feel vs performance)
        if (now - liveParticipantsLastPollRef.current < 2000) {
          return
        }
        liveParticipantsLastPollRef.current = now

        const response = await apiGet('attendance/live-participants')
        if (!response.ok) {
          console.debug('Live participants poll failed:', response.status)
          return
        }

        const data = await response.json()

        if (
          data.success &&
          data.hasActiveMeetings &&
          data.meetings.length > 0
        ) {
          console.log('🔴 === LIVE PARTICIPANTS POLL SUCCESS ===')
          console.log(`   Active meetings: ${data.meetingCount}`)
          console.log(`   Total participants: ${data.totalParticipants}`)

          // Process each active meeting
          data.meetings.forEach(meeting => {
            const participants = meeting.participants || []

            if (participants.length > 0) {
              console.log(
                `   📊 Meeting ${meeting.meetCode}: ${participants.length} participants`
              )

              // Update extension status
              setExtensionConnected(true)
              setLastExtensionHeartbeat(new Date())

              // Update meeting status (using stable setter)
              setStableMeetingStatus(MEETING_STATUS.DATA_RECEIVED)

              // Count this as a fresh real-time update for diagnostics
              markRealtimeDataUpdate('live-participants-poll')

              // Update debug info to reflect polling as the data source
              setDebugRealtimeInfo(() => ({
                source: 'live-participants-poll',
                meetingStatus: MEETING_STATUS.DATA_RECEIVED,
                meetCode: meeting.meetCode || null,
                subjectId: meeting.subjectId || null,
                timestamp: meeting.timestamp || new Date().toISOString()
              }))

              // Update data timestamp for stale data detection
              // FIX: Update data timestamp for stale data detection
              lastDataTimestampRef.current = Date.now()

              // Build display rows from polled participants
              const baseOptions = {
                defaultGroup: meeting.subjectName || meeting.meetCode,
                defaultDate: meeting.timestamp,
                isUnauthenticated: meeting.isUnauthenticated
              }

              // Separate host from regular participants
              const hostParticipants = participants.filter(p => p.isHost)
              const regularParticipants = participants.filter(p => !p.isHost)

              // Register with duration tracker for live updates
              const tracker = getDurationTracker()

              // FIX: Check if host is present and active in polled data
              // This detects instructor leave from backend cache data
              const activeHost = participants.find(
                p =>
                  p.isHost === true && p.isLive !== false && p.status !== 'left'
              )
              const wasHostActive = !tracker.isTrackingPaused()

              // FIX: Use grace period system to prevent flickering "host left" messages
              if (!activeHost && participants.length > 0) {
                // No active host in incoming data - use grace period before declaring left
                if (wasHostActive) {
                  handleHostAbsenceWithGrace(tracker, 'Polling: ')
                }
              } else if (activeHost) {
                // Host is present - mark as seen and resume if paused
                handleHostPresence(tracker, activeHost.name, 'Polling: ')
              }

              tracker.syncWithParticipants(
                participants.map(p => ({
                  ...p,
                  key:
                    p.avatarUrl ||
                    p.participantId ||
                    `${p.name}-${meeting.meetCode}`
                }))
              )

              // Save to localStorage for persistence
              saveParticipantsToStorage(participants, meeting.meetCode)

              // Build display rows
              const hostRows = hostParticipants.map(host =>
                buildDisplayRow(host, { ...baseOptions, isLiveOverride: true })
              )

              const regularRows = regularParticipants.map(participant =>
                buildDisplayRow(participant, {
                  ...baseOptions,
                  isLiveOverride: true
                })
              )

              // Update liveRows with polled data
              updateLiveRows(prevRows => {
                const prevMap = new Map(prevRows.map(row => [row.key, row]))
                const allNewRows = [...hostRows, ...regularRows]

                // Merge with existing rows
                const merged = allNewRows.map(row => {
                  const existing = prevMap.get(row.key)
                  if (existing) {
                    // Preserve existing join time but update duration
                    return {
                      ...existing,
                      ...row,
                      joinTime: existing.joinTime || row.joinTime,
                      joinTimeIso: existing.joinTimeIso || row.joinTimeIso,
                      joinTimeDisplay:
                        existing.joinTimeDisplay || row.joinTimeDisplay
                    }
                  }
                  return row
                })

                console.log(
                  `   ✅ Updated liveRows via poll: ${merged.length} rows`
                )
                return merged
              })

              // Set unauthenticated flag if needed
              if (meeting.isUnauthenticated) {
                setHasUnauthenticatedUpdates(true)
              }
            }
          })

          setLastUpdated(new Date())
        } else if (data.success && !data.hasActiveMeetings) {
          // No active meetings - update extension status and meeting status
          const timeSinceLastUpdate = lastUpdateReceived
            ? Date.now() - lastUpdateReceived.getTime()
            : Infinity

          // If no active meetings for 30+ seconds, mark extension as disconnected
          if (timeSinceLastUpdate > 30000) {
            if (extensionConnected) {
              console.log(
                '📡 No active meetings for 30s+ - marking extension disconnected'
              )
              setExtensionConnected(false)
            }
            if (meetingStatus !== MEETING_STATUS.IDLE) {
              console.log('📡 No active meetings detected - resetting to idle')
              setMeetingStatus(MEETING_STATUS.IDLE)
            }
          }
        }
      } catch (error) {
        // Silently ignore polling errors - this is a fallback mechanism
        console.debug(
          'Live participants poll error (non-critical):',
          error.message
        )
      }
    }

    // Clear any existing interval before setting a new one
    if (liveParticipantsPollIntervalRef.current) {
      clearInterval(liveParticipantsPollIntervalRef.current)
    }

    // Start polling every 2 seconds (balanced for real-time feel vs performance)
    liveParticipantsPollIntervalRef.current = setInterval(
      pollLiveParticipants,
      2000
    )

    // Initial poll immediately
    pollLiveParticipants()

    console.log('🔄 Live participants polling started (2s interval)')

    return () => {
      liveParticipantsPollActiveRef.current = false
      if (liveParticipantsPollIntervalRef.current) {
        clearInterval(liveParticipantsPollIntervalRef.current)
        liveParticipantsPollIntervalRef.current = null
      }
      console.log('🔄 Live participants polling stopped')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty deps intentionally - polling should run continuously, refs handle state changes

  // Sync roomsJoinedRef with state (for use in socket handlers - avoids stale closure)
  useEffect(() => {
    roomsJoinedRef.current = roomsJoined
  }, [roomsJoined])

  // Phase 2 Task 4: Function to process queued updates with timeout handling
  const processQueuedUpdates = useCallback(() => {
    if (updateQueueRef.current.length === 0) {
      return
    }

    console.log(`📦 === PROCESSING QUEUED UPDATES ===`)
    console.log(`   Queue size: ${updateQueueRef.current.length}`)

    const now = Date.now()
    const processedUpdates = []
    const expiredUpdates = []

    // Phase 2 Task 4: Separate expired and valid updates
    updateQueueRef.current.forEach((queuedUpdate, index) => {
      const age = now - queuedUpdate.queuedAt
      if (age > UPDATE_QUEUE_TIMEOUT_MS) {
        expiredUpdates.push(queuedUpdate)
        console.warn(
          `   ⏰ Update ${index + 1} expired (age: ${Math.floor(
            age / 1000
          )}s > ${UPDATE_QUEUE_TIMEOUT_MS / 1000}s)`
        )
      } else {
        processedUpdates.push(queuedUpdate)
      }
    })

    if (expiredUpdates.length > 0) {
      console.warn(
        `   ⚠️ ${expiredUpdates.length} update(s) expired and will be discarded`
      )
    }

    // Clear queue
    updateQueueRef.current = []

    // Clear timeout if set
    if (updateQueueTimeoutRef.current) {
      clearTimeout(updateQueueTimeoutRef.current)
      updateQueueTimeoutRef.current = null
    }

    // Process valid updates
    if (processedUpdates.length > 0) {
      console.log(
        `   ✅ Processing ${processedUpdates.length} valid queued update(s)`
      )

      setTimeout(() => {
        processedUpdates.forEach((queuedUpdate, index) => {
          setTimeout(() => {
            // Phase 2 Task 4: Support both old format (just payload) and new format (object with payload and queuedAt)
            const payload = queuedUpdate.payload || queuedUpdate
            const age = queuedUpdate.queuedAt ? now - queuedUpdate.queuedAt : 0
            console.log(
              `📦 Processing queued update ${index + 1}/${
                processedUpdates.length
              }:`,
              payload.meetCode || payload.type
            )
            if (age > 0) {
              console.log(`   Age: ${Math.floor(age / 1000)}s`)
            }

            if (socketRef.current && socketRef.current.connected) {
              // Get the registered handler and call it directly
              const handlers = socketRef.current.listeners('attendance:update')
              if (handlers.length > 0) {
                console.log(
                  '   💡 Calling registered handler for queued update'
                )
                try {
                  handlers[0](payload)
                } catch (error) {
                  console.error('   ❌ Error processing queued update:', error)
                }
              } else {
                console.warn(
                  '   ⚠️ No handler registered for attendance:update - update will be lost'
                )
              }
            } else {
              console.warn(
                '   ⚠️ Socket disconnected, cannot process queued update'
              )
            }
          }, 200 * index) // Stagger processing to avoid overwhelming
        })
      }, 100) // Small delay to ensure state is updated
    }
  }, [])

  // PHASE 2.1 FIX: Join Socket.IO rooms when allowedSubjectIds or allowedGroupIds change AND socket is connected
  // Join immediately when socket connects (even if IDs not loaded), then rejoin when IDs load if different
  // This prevents race condition where updates arrive before rooms joined
  useEffect(() => {
    if (socketRef.current && socketRef.current.connected) {
      // Join rooms immediately if socket is connected, regardless of whether IDs are loaded
      // This ensures we're ready to receive updates even during initialization
      const currentSubjectIds = allowedSubjectIds || []
      const currentGroupIds = allowedGroupIds || []

      // PHASE 2 FIX: Always join rooms (even with empty IDs) to ensure catch-all room is joined
      // This ensures we receive unauthenticated updates even when no subjects are assigned
      if (currentSubjectIds.length > 0 || currentGroupIds.length > 0) {
        console.log(
          `🔄 Rejoining rooms with updated IDs (${currentSubjectIds.length} subjects, ${currentGroupIds.length} groups)`
        )
      } else {
        console.log(
          'ℹ️ No subject/group IDs - joining catch-all room for unauthenticated updates'
        )
      }

      // Always call joinSocketRooms to ensure catch-all room is joined
      joinSocketRooms(socketRef.current, currentSubjectIds, currentGroupIds)

      // Process queued updates after rejoining
      if (updateQueueRef.current.length > 0 && allowedIdsLoaded) {
        console.log(
          `📦 Processing ${updateQueueRef.current.length} queued update(s) now that rooms are rejoined`
        )
        // Phase 2 Task 4: Wait a bit for rooms to actually join, then process queued updates
        setTimeout(() => {
          processQueuedUpdates()
        }, 500) // Wait 500ms for rooms to join
      }
    }
  }, [
    allowedSubjectIds,
    allowedGroupIds,
    allowedIdsLoaded,
    joinSocketRooms,
    processQueuedUpdates
  ])

  // NOTE: Queue timeout handling is now done directly in the socket handler where items are pushed
  // The previous useEffect had incorrect dependency on updateQueueRef.current.length (refs don't trigger re-renders)
  // Timeout is set via updateQueueTimeoutRef when items are queued (see attendance:update handler)

  // PHASE 3.1: Query backend for extension activity
  const queryExtensionActivity = useCallback(async () => {
    try {
      const response = await apiGet('attendance/debug-status')
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          // PHASE 3.1: Check recent progress requests for extension activity
          const recentRequests = data.recentProgressRequests || []
          const recentRequest = recentRequests[recentRequests.length - 1] // Most recent

          if (recentRequest) {
            const lastSeen = new Date(recentRequest.timestamp)
            const timeSinceLastSeen = Date.now() - lastSeen.getTime()
            const isActive = timeSinceLastSeen < 10000 // Active if seen in last 10 seconds

            setExtensionActivityFromBackend({
              lastSeen,
              isActive,
              meetCode: recentRequest.meetCode,
              participantCount: recentRequest.participantCount,
              isUnauthenticated: recentRequest.isUnauthenticated,
              timeSinceLastSeen
            })

            // PHASE 3.2: Update extension status based on backend data
            if (isActive && !extensionConnected) {
              console.log(
                '✅ Extension activity detected from backend - updating status to connected'
              )
              setExtensionConnected(true)
              setLastExtensionHeartbeat(lastSeen)
            } else if (
              !isActive &&
              extensionConnected &&
              timeSinceLastSeen > 30000
            ) {
              // Only mark as disconnected if inactive for more than 30 seconds
              console.log(
                '⚠️ Extension inactive for 30+ seconds - marking as disconnected'
              )
              setExtensionConnected(false)
            }
          }

          // PHASE 3.3: Log data flow verification
          console.log('📊 === EXTENSION ACTIVITY CHECK ===')
          console.log(`   Recent requests: ${recentRequests.length}`)
          console.log(
            `   Socket.IO clients: ${data.socketIO?.totalConnectedClients || 0}`
          )
          if (recentRequest) {
            console.log(
              `   Last request: ${recentRequest.meetCode}, ${recentRequest.participantCount} participants`
            )
            console.log(
              `   Time since last: ${Math.round(
                (Date.now() - new Date(recentRequest.timestamp).getTime()) /
                  1000
              )}s`
            )
          }

          // Dev-only: query per-meeting debug endpoint for detailed backend status
          if (import.meta.env.DEV) {
            const debugMeetCode =
              recentRequest?.meetCode ||
              debugRealtimeInfo?.meetCode ||
              extensionActivityFromBackend?.meetCode ||
              currentMeetCodeRef.current ||
              null

            if (debugMeetCode) {
              try {
                const debugResponse = await apiGet(
                  `attendance/meeting-debug?meetCode=${encodeURIComponent(
                    debugMeetCode
                  )}`
                )
                if (debugResponse.ok) {
                  const debugData = await debugResponse.json()
                  if (debugData && debugData.success) {
                    setMeetingDebugInfo({
                      meetCode: debugData.meetCode,
                      inferredMeetingStatus:
                        debugData.inferredMeetingStatus || null,
                      liveCacheAgeSeconds:
                        debugData.liveCache?.ageSeconds ?? null,
                      liveParticipantCount: Array.isArray(
                        debugData.liveCache?.participants
                      )
                        ? debugData.liveCache.participants.length
                        : debugData.liveCache?.participantCount ?? null,
                      recentRequestCount: Array.isArray(
                        debugData.recentProgressRequests
                      )
                        ? debugData.recentProgressRequests.length
                        : 0,
                      extensionActivityCount:
                        debugData.extensionActivity?.count ?? 0,
                      liveLifecyclePhase: debugData.liveLifecyclePhase || null,
                      inferredLifecyclePhase:
                        debugData.inferredLifecyclePhase || null,
                      lastUpdated: debugData.timestamp
                        ? new Date(debugData.timestamp)
                        : new Date()
                    })
                  }
                }
              } catch (debugError) {
                console.warn('⚠️ Failed to query meeting-debug:', debugError)
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to query extension activity from backend:', error)
    }
  }, [
    extensionConnected,
    debugRealtimeInfo,
    extensionActivityFromBackend,
    currentMeetCodeRef
  ])

  // Query backend for actual room membership status
  const [roomStatusFromBackend, setRoomStatusFromBackend] = useState(null)
  const queryRoomStatus = useCallback(async () => {
    if (!socketRef.current || !socketRef.current.id) {
      console.log(
        '⚠️ Cannot query room status: socket not connected or no socket ID'
      )
      return
    }

    try {
      const socketId = socketRef.current.id
      const response = await apiGet(`socket/rooms?socketId=${socketId}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setRoomStatusFromBackend(data)
          console.log('✅ === ROOM STATUS QUERIED FROM BACKEND ===')
          console.log(`   Total rooms: ${data.totalRooms}`)
          console.log(
            `   Subject rooms: ${data.subjectRooms.length}`,
            data.subjectRooms
          )
          console.log(
            `   Group rooms: ${data.groupRooms.length}`,
            data.groupRooms
          )

          // Sync roomsJoined state with backend data if different
          const backendRooms = [
            ...(data.subjectRooms || []),
            ...(data.groupRooms || [])
          ]
          if (
            backendRooms.length !== roomsJoined.length ||
            !backendRooms.every(room => roomsJoined.includes(room))
          ) {
            console.log('🔄 Syncing roomsJoined state with backend room status')
            setRoomsJoined(backendRooms)
          }
        } else {
          console.warn(
            '⚠️ Backend returned unsuccessful room status query:',
            data.error
          )
        }
      } else {
        console.warn(
          '⚠️ Failed to query room status from backend:',
          response.status
        )
      }
    } catch (error) {
      console.warn('⚠️ Failed to query room status from backend:', error)
    }
  }, [roomsJoined])

  // PHASE 1.3: Real-Time Connection Verification - Sync connection state periodically
  // This ensures isConnected state stays in sync with actual socket.connected property
  useEffect(() => {
    const syncConnectionState = () => {
      if (!socketRef.current) {
        if (isConnected) {
          console.log(
            '🔍 Connection state sync: Socket ref is null but isConnected is true - correcting'
          )
          setIsConnected(false)
        }
        return
      }

      const actualConnected = socketRef.current.connected ?? false
      const stateConnected = isConnected

      if (actualConnected !== stateConnected) {
        console.log(`🔍 Connection state mismatch detected - syncing:`)
        console.log(`   socket.connected: ${actualConnected}`)
        console.log(`   isConnected state: ${stateConnected}`)
        console.log(`   Updating state to match actual socket state`)
        setIsConnected(actualConnected)

        // Update localStorage to match
        if (actualConnected) {
          localStorage.setItem(CONNECTION_STATE_KEY, 'connected')
        } else {
          localStorage.setItem(CONNECTION_STATE_KEY, 'disconnected')
        }
      }

      // Also sync rooms joined state with actual socket.rooms
      if (socketRef.current) {
        const actualRooms = socketRef.current.rooms
          ? Array.from(socketRef.current.rooms).filter(
              room => room.startsWith('subject:') || room.startsWith('group:')
            )
          : []
        const stateRooms = roomsJoined || []

        // Update if different (but only if socket is connected, otherwise clear)
        if (!actualConnected && stateRooms.length > 0) {
          console.log(
            '🔍 Clearing stale rooms joined state - socket disconnected'
          )
          setRoomsJoined([])
        } else if (
          actualConnected &&
          actualRooms.length !== stateRooms.length
        ) {
          // Only update if socket is actually connected
          const roomsEqual =
            actualRooms.length === stateRooms.length &&
            actualRooms.every(room => stateRooms.includes(room))
          if (!roomsEqual) {
            console.log(
              '🔍 Syncing rooms joined state with actual socket.rooms'
            )
            setRoomsJoined(actualRooms)
          }
        }
      }
    }

    // Sync connection state periodically
    syncConnectionState()
    queryExtensionActivity()
    queryRoomStatus()

    // Sync periodically every 5 seconds
    const syncInterval = setInterval(syncConnectionState, 5000)

    // Query room status periodically for the floating diagnostic panel
    const roomStatusInterval = setInterval(queryRoomStatus, 5000)

    return () => {
      clearInterval(syncInterval)
      clearInterval(roomStatusInterval)
    }
  }, [isConnected, roomsJoined, queryExtensionActivity, queryRoomStatus])

  // PHASE 3.2: Periodically query extension activity from backend
  useEffect(() => {
    // Query immediately on mount
    queryExtensionActivity()

    // Query every 10 seconds
    const activityInterval = setInterval(queryExtensionActivity, 10000)

    return () => clearInterval(activityInterval)
  }, [queryExtensionActivity])

  useEffect(() => {
    const loadAllowedGroups = async () => {
      try {
        const rawUser = localStorage.getItem('user')
        const user = rawUser ? JSON.parse(rawUser) : null
        const instructorId = user?._id || user?.id
        if (!instructorId) {
          return
        }

        // Fetch groups (backward compatibility - returns subjects formatted as groups)
        let groupIds = []
        try {
          const groupsResponse = await apiGet('groups')
          if (groupsResponse.ok) {
            const groupsResult = await groupsResponse.json()
            const groups = groupsResult.data || []
            const owned = groups
              .filter(group => {
                const ownerId = group.instructorId?._id || group.instructorId
                return ownerId && ownerId.toString() === instructorId.toString()
              })
              .map(group => (group._id || group.id || '').toString())
              .filter(Boolean)
            groupIds = owned
            setAllowedGroupIds(owned)
          }
        } catch (groupsErr) {
          console.warn(
            '⚠️ Unable to fetch groups for instructor filtering:',
            groupsErr
          )
        }

        // Also fetch subjects directly (current system)
        let subjectIds = []
        try {
          const subjectsResponse = await apiGet(
            `subjects/instructor/${instructorId}`
          )
          if (subjectsResponse.ok) {
            const subjectsResult = await subjectsResponse.json()
            const subjects = subjectsResult.data || []
            const ownedSubjects = subjects.filter(subject => {
              const ownerId = subject.instructorId?._id || subject.instructorId
              return ownerId && ownerId.toString() === instructorId.toString()
            })
            subjectIds = ownedSubjects
              .map(subject => (subject._id || subject.id || '').toString())
              .filter(Boolean)
            setAllowedSubjectIds(subjectIds)
            const subjectOptionData = ownedSubjects
              .map(subject => ({
                id: (subject._id || subject.id || '').toString(),
                name:
                  subject.subjectName ||
                  subject.subjectCode ||
                  subject.sectionName ||
                  subject.sectionCode ||
                  'Untitled Subject'
              }))
              .filter(option => option.id)
            setSubjectOptions(subjectOptionData)
          }
        } catch (subjectsErr) {
          console.warn(
            '⚠️ Unable to fetch subjects for instructor filtering:',
            subjectsErr
          )
          setAllowedSubjectIds([])
          setSubjectOptions([])
        }

        // Log summary with detailed information
        console.log(`📊 === INSTRUCTOR FILTERING LOADED ===`)
        console.log(
          `   Groups: ${groupIds.length}`,
          groupIds.length > 0 ? groupIds : 'none'
        )
        console.log(
          `   Subjects: ${subjectIds.length}`,
          subjectIds.length > 0 ? subjectIds : 'none'
        )
        console.log(
          `   Total allowed IDs: ${groupIds.length + subjectIds.length}`
        )
        if (groupIds.length > 0 || subjectIds.length > 0) {
          console.log(
            `✅ Loaded instructor filtering: ${groupIds.length} groups, ${subjectIds.length} subjects`
          )
        } else {
          console.warn(
            `⚠️ No groups or subjects loaded - instructor may not have any assigned subjects`
          )
        }

        // Mark IDs as loaded (even if empty arrays)
        setAllowedIdsLoaded(true)
        console.log(`✅ allowedIdsLoaded set to true`)
      } catch (err) {
        console.error('Error loading instructor groups/subjects:', err)
        // Mark as loaded even on error to prevent infinite waiting
        setAllowedIdsLoaded(true)
      }
    }

    loadAllowedGroups()
  }, [])

  useEffect(() => {
    const seedHistoricalRows = async () => {
      try {
        const response = await apiGet('attendance/recent?limit=100')
        if (!response.ok) {
          setApiError(
            `Failed to load recent attendance (status ${response.status}).`
          )
          return
        }
        const result = await response.json()
        const allowed = allowedGroupsRef.current
        const rows = (result.data || [])
          .filter(record => {
            // Check both legacy groupId and current subjectId
            const groupId = record.groupId?._id || record.groupId
            const subjectId = record.subjectId?._id || record.subjectId

            // If no filtering IDs are set, allow all records
            if (!allowed || allowed.size === 0) {
              return true
            }

            // If record has neither groupId nor subjectId, exclude it
            if (!groupId && !subjectId) {
              return false
            }

            // Check if either groupId or subjectId matches allowed IDs
            if (groupId && allowed.has(groupId.toString())) {
              return true
            }
            if (subjectId && allowed.has(subjectId.toString())) {
              return true
            }

            return false
          })
          .map(record =>
            buildDisplayRow(
              {
                ...record,
                name:
                  record.userName ||
                  record.fullName ||
                  record.studentName ||
                  'Unknown',
                participantId: record.userId?._id || record.userId,
                studentId: record.user?.studentId,
                durationSeconds: record.durationSeconds,
                rawStatus: record.status || record.rawStatus,
                meetCode: record.meetCode,
                group:
                  record.groupId?.groupName ||
                  record.subjectId?.subjectName ||
                  record.meetCode,
                isLive: false,
                isTardy: record.isTardy,
                isCurrentlyInMeeting: false
              },
              {
                defaultGroup:
                  record.groupId?.groupName ||
                  record.subjectId?.subjectName ||
                  record.meetCode,
                defaultDate: record.sessionDate || record.createdAt,
                isLiveOverride: false
              }
            )
          )
        if (rows.length > 0) {
          updateHistoricalRows(rows, { allowEmpty: true })
        }
      } catch (err) {
        console.error('Error seeding recent attendance:', err)
        setApiError(
          err?.message
            ? `Failed to load recent attendance: ${err.message}`
            : 'Failed to load recent attendance due to an unexpected error.'
        )
      }
    }

    // Seed historical rows when we have either group IDs or subject IDs loaded
    if (
      (allowedGroupIds.length > 0 || allowedSubjectIds.length > 0) &&
      allRows.length === 0
    ) {
      seedHistoricalRows()
    }
  }, [allowedGroupIds, allowedSubjectIds, allRows.length])

  const fetchScheduleWindow = useCallback(async () => {
    if (!activeSubject?.id) {
      setScheduleWindow([])
      return
    }
    setScheduleLoading(true)
    setScheduleError('')
    try {
      const response = await apiGet(
        `attendance/subject/${activeSubject.id}/schedule-window`
      )
      if (!response.ok) {
        setScheduleError(
          `Failed to load schedule window (status ${response.status}).`
        )
        setScheduleWindow([])
        return
      }
      const result = await response.json()
      if (!result.success) {
        setScheduleError(result.error || 'Unable to load schedule window.')
        setScheduleWindow([])
        return
      }
      setScheduleWindow(result.data || [])
    } catch (error) {
      console.error('Error loading schedule window:', error)
      setScheduleError(
        error?.message
          ? `Failed to load schedule window: ${error.message}`
          : 'Failed to load schedule window.'
      )
      setScheduleWindow([])
    } finally {
      setScheduleLoading(false)
    }
  }, [activeSubject?.id])

  useEffect(() => {
    fetchScheduleWindow()
  }, [fetchScheduleWindow])

  const fetchInstructorAppeals = useCallback(async () => {
    setAppealsLoading(true)
    setAppealsError('')
    try {
      const response = await apiGet('appeals')
      if (!response.ok) {
        setAppealsError(`Failed to load appeals (status ${response.status}).`)
        setAppeals([])
        return
      }
      const result = await response.json()
      if (!result.success) {
        setAppealsError(result.error || 'Unable to load appeals.')
        setAppeals([])
        return
      }
      setAppeals(result.data || [])
    } catch (error) {
      console.error('Error loading appeals:', error)
      setAppealsError(
        error?.message
          ? `Failed to load appeals: ${error.message}`
          : 'Failed to load appeals.'
      )
      setAppeals([])
    } finally {
      setAppealsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInstructorAppeals()
  }, [fetchInstructorAppeals])

  const _appealStats = React.useMemo(() => {
    if (!Array.isArray(appeals) || appeals.length === 0) {
      return {
        total: 0,
        pending: 0,
        approved: 0,
        denied: 0
      }
    }
    return appeals.reduce(
      (acc, appeal) => {
        acc.total += 1
        if (appeal.status === 'approved') acc.approved += 1
        else if (appeal.status === 'denied') acc.denied += 1
        else acc.pending += 1
        return acc
      },
      { total: 0, pending: 0, approved: 0, denied: 0 }
    )
  }, [appeals])

  const _filteredAppeals = React.useMemo(() => {
    if (!appealsFilter || appealsFilter === 'all') {
      return appeals
    }
    return appeals.filter(appeal => appeal.status === appealsFilter)
  }, [appeals, appealsFilter])

  const _appealStatusBadge = status => {
    const palette =
      riskColorMap[
        status === 'approved' ? 'low' : status === 'denied' ? 'high' : 'medium'
      ] || riskColorMap.default
    return {
      background: palette.bg,
      color: palette.text,
      border: `1px solid ${palette.border}`
    }
  }

  const _handleAppealAction = useCallback(
    async (appealId, status) => {
      setAppealActionLoading(`${appealId}_${status}`)
      try {
        const response = await apiPatch(`appeals/${appealId}/status`, {
          status
        })
        if (!response.ok) {
          const result = await response.json().catch(() => null)
          setAppealsError(
            result?.error ||
              `Failed to update appeal (status ${response.status}).`
          )
          return
        }
        await response.json()
        fetchInstructorAppeals()
      } catch (error) {
        console.error('Error updating appeal:', error)
        setAppealsError(
          error?.message
            ? `Failed to update appeal: ${error.message}`
            : 'Failed to update appeal.'
        )
      } finally {
        setAppealActionLoading(null)
      }
    },
    [fetchInstructorAppeals]
  )

  const activeSubject = React.useMemo(() => {
    const derivedId =
      selectedSubjectId === 'all' ? allowedSubjectIds?.[0] : selectedSubjectId
    if (!derivedId) return null
    const match = subjectOptions.find(
      option => option.id?.toString() === derivedId.toString()
    )
    if (match) {
      return match
    }
    return { id: derivedId, name: null }
  }, [selectedSubjectId, allowedSubjectIds, subjectOptions])

  const riskCounts = React.useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 }
    Object.values(riskSummary.byUserId).forEach(entry => {
      const band = entry?.risk?.band || 'low'
      if (counts[band] !== undefined) {
        counts[band] += 1
      }
    })
    return counts
  }, [riskSummary.byUserId])

  const topRiskEntries = React.useMemo(() => {
    if (!Array.isArray(riskSummary.list)) return []
    return [...riskSummary.list]
      .sort((a, b) => (b.risk?.score || 0) - (a.risk?.score || 0))
      .slice(0, 4)
  }, [riskSummary.list])

  const statistics = React.useMemo(() => {
    const stats = { total: allRows.length, present: 0, late: 0, absent: 0 }

    allRows.forEach(row => {
      const status = (row.status || row.log || '').toLowerCase()
      if (status.includes('late')) {
        stats.late += 1
      } else if (status.includes('absent') || row.isLeft) {
        stats.absent += 1
      } else {
        stats.present += 1
      }
    })

    return stats
  }, [allRows])

  const scheduleStats = React.useMemo(() => {
    if (!Array.isArray(scheduleWindow) || scheduleWindow.length === 0) {
      return {
        totalSessions: 0,
        tokensIssued: 0,
        tokensConsumed: 0
      }
    }

    return scheduleWindow.reduce(
      (acc, session) => {
        acc.totalSessions += 1
        acc.tokensIssued += session.tokens?.total || 0
        acc.tokensConsumed += session.tokens?.consumed || 0
        return acc
      },
      { totalSessions: 0, tokensIssued: 0, tokensConsumed: 0 }
    )
  }, [scheduleWindow])

  const getRiskEntryForRow = useCallback(
    row => {
      const candidateIds = [
        row.participantId?._id || row.participantId,
        row.userId?._id || row.userId,
        row.user?._id,
        row._id,
        row.id
      ]
      const id = candidateIds.find(Boolean)
      if (!id) return null
      return riskSummary.byUserId[id.toString()] || null
    },
    [riskSummary.byUserId]
  )

  const renderRiskBadge = useCallback(entry => {
    if (!entry?.risk) {
      return (
        <span
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 999,
            background: neutral.bgMuted,
            color: neutral.textSecondary,
            border: `1px solid ${neutral.borderLight}`
          }}
        >
          —
        </span>
      )
    }
    const palette = riskColorMap[entry.risk.band] || riskColorMap.default
    return (
      <span
        style={{
          fontSize: 11,
          padding: '2px 10px',
          borderRadius: 999,
          background: palette.bg,
          color: palette.text,
          border: `1px solid ${palette.border}`,
          fontWeight: 700,
          textTransform: 'uppercase',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4
        }}
        title={entry.risk.explanation || 'Risk score'}
      >
        {entry.risk.band} • {entry.risk.score}
      </span>
    )
  }, [])

  const filteredRows = React.useMemo(() => {
    // Filter out host from participants list (host is displayed in a separate section above)
    // CRITICAL FIX: Also check stickyHostRef to prevent host duplication when isHost flag flickers
    const participantsOnly = allRows.filter(row => {
      // Exclude if explicitly marked as host
      if (row.isHost === true) {
        console.log('👑 Host separated for display (isHost=true):', row.name)
        return false
      }
      // CRITICAL FIX: Also exclude if this matches the sticky host (even if isHost is false)
      // This prevents host duplication when extension temporarily sends isHost: false
      if (isRowStickyHost(row)) {
        console.log('👑 Host separated for display (sticky match):', row.name)
        return false
      }
      return true
    })

    // Phase 2 Task 3: Filter unauthenticated updates based on toggle
    let filtered = participantsOnly
    if (!showUnauthenticatedUpdates) {
      const beforeFilter = filtered.length
      filtered = filtered.filter(row => !row.isUnauthenticated)
      const filteredCount = beforeFilter - filtered.length
      if (filteredCount > 0) {
        console.log(
          `🔍 Filtered out ${filteredCount} unauthenticated update(s)`
        )
      }
    }

    // Validation logging for synchronization
    const hostCountInAllRows = allRows.filter(row => row.isHost === true).length
    if (hostCountInAllRows > 1) {
      console.warn(
        `⚠️ Multiple hosts detected (${hostCountInAllRows}) - only first will be displayed`
      )
    }

    // Apply status filter
    let result = filtered
    if (statusFilter === 'present') {
      result = filtered.filter(row => {
        const status = row.isNew
          ? 'Just Joined'
          : row.isLeft
          ? 'Left Meeting'
          : row.log
        return (
          status === 'Present' ||
          status === '🟢 Present' ||
          (!row.isLeft && row.isLive)
        )
      })
    } else if (statusFilter === 'late') {
      result = filtered.filter(row => row.log === 'Late')
    } else if (statusFilter === 'absent') {
      result = filtered.filter(row => row.log === 'Absent' || row.isLeft)
    }

    // STABLE SORTING: Apply category-based sorting to prevent position jumping
    // Order: Verified participants first, then Guests (alphabetical within each)
    const sorted = sortParticipantRows(result)
    console.log(
      `📊 Sorted ${sorted.length} participants (Verified: ${
        sorted.filter(r => getParticipantCategory(r) === 1).length
      }, Guests: ${sorted.filter(r => getParticipantCategory(r) === 2).length})`
    )
    return sorted
  }, [allRows, statusFilter, showUnauthenticatedUpdates, isRowStickyHost])

  // Separate host rows for separate display (ensure only one host)
  // Uses STICKY HOST logic to prevent flickering (stickyHostRef defined above filteredRows)
  // CRITICAL: Host stays locked until session explicitly ends, even if they leave
  const hostRows = React.useMemo(() => {
    const hosts = allRows.filter(row => row.isHost === true)

    // STICKY HOST LOGIC: If we have a sticky host, find them in allRows using isRowStickyHost helper
    if (stickyHostRef.current) {
      const stickyHost = allRows.find(row => isRowStickyHost(row))

      if (stickyHost) {
        // Found the sticky host - PRESERVE their actual isLive/isLeft status (don't override)
        console.log(
          `👑 STICKY HOST preserved: "${stickyHost.name}" (key: ${stickyHost.key}, isLive: ${stickyHost.isLive}, isLeft: ${stickyHost.isLeft})`
        )
        // Ensure isHost flag is set but preserve actual live/left status
        return [
          {
            ...stickyHost,
            isHost: true
            // DO NOT override isLive/isLeft - preserve actual status from data
          }
        ]
      } else {
        // HOST LEFT THE MEETING - Create placeholder with LEFT status
        // This is the CRITICAL FIX: Host stays as host even after leaving
        console.log(
          `🚪 Sticky host "${stickyHostRef.current.name}" left the meeting - showing as LEFT (not removed)`
        )
        // Create a placeholder row for the host who left
        return [
          {
            key:
              stickyHostRef.current.key || `host-${stickyHostRef.current.name}`,
            name: stickyHostRef.current.name,
            avatarUrl: stickyHostRef.current.avatarUrl,
            isHost: true,
            isLive: false, // NOT currently in meeting
            isLeft: true, // Has LEFT the meeting
            leftAt: stickyHostRef.current.leftAt || new Date().toISOString(),
            joinTime: stickyHostRef.current.joinTime || null,
            joinTimeFormatted: stickyHostRef.current.joinTimeFormatted || '--',
            durationSeconds: stickyHostRef.current.durationSeconds || 0,
            durationFormatted:
              stickyHostRef.current.durationFormatted || '00:00:00',
            status: 'left'
          }
        ]
      }
    }

    // If we found hosts from data, update sticky ref
    if (hosts.length > 0) {
      const primaryHost = hosts[0]
      // Lock this as sticky host if not already locked
      if (
        !stickyHostRef.current ||
        stickyHostRef.current.key !== primaryHost.key
      ) {
        console.log(
          `🔒 LOCKING STICKY HOST: "${primaryHost.name}" (key: ${primaryHost.key})`
        )
        stickyHostRef.current = {
          key: primaryHost.key,
          name: primaryHost.name,
          avatarUrl: primaryHost.avatarUrl,
          // Store additional info for placeholder when host leaves
          joinTime: primaryHost.joinTime || primaryHost.joinTimeIso,
          joinTimeFormatted:
            primaryHost.joinTimeFormatted || primaryHost.joinedAt,
          durationSeconds: primaryHost.durationSeconds || 0,
          durationFormatted: primaryHost.durationFormatted || '00:00:00'
        }
      } else {
        // Update duration/time info for existing sticky host (keeps info fresh)
        stickyHostRef.current = {
          ...stickyHostRef.current,
          durationSeconds:
            primaryHost.durationSeconds ||
            stickyHostRef.current.durationSeconds ||
            0,
          durationFormatted:
            primaryHost.durationFormatted ||
            stickyHostRef.current.durationFormatted ||
            '00:00:00',
          leftAt: primaryHost.isLeft
            ? primaryHost.leftAt ||
              primaryHost.leftTimeIso ||
              new Date().toISOString()
            : null
        }
      }

      // Ensure only one host is displayed (take the first one if multiple exist)
      if (hosts.length > 1) {
        console.warn(
          `⚠️ Multiple hosts found (${hosts.length}) - displaying first host only:`,
          hosts[0].name
        )
        return [hosts[0]]
      }
      console.log(
        `👑 Host row computed: "${hosts[0].name}" (key: ${hosts[0].key}, isHost: ${hosts[0].isHost})`
      )
      return hosts
    }

    // No hosts found and no sticky host - debug logging
    console.log(
      `⚠️ No host rows found in allRows (total rows: ${allRows.length})`
    )
    // Debug: Check if any rows have isHost flag set
    const rowsWithHostFlag = allRows.filter(row =>
      Object.prototype.hasOwnProperty.call(row, 'isHost')
    )
    console.log(
      `   Debug: ${rowsWithHostFlag.length} rows have isHost property`
    )
    if (rowsWithHostFlag.length > 0) {
      console.log(
        `   Debug: isHost values:`,
        rowsWithHostFlag.map(r => ({ name: r.name, isHost: r.isHost }))
      )
    }

    return hosts
  }, [allRows, isRowStickyHost])

  // FIX: Track instructor (host) leave/return and pause/resume duration tracking
  // When instructor leaves, all participant durations should freeze
  // When instructor returns, durations resume
  // UPDATED: Now uses grace period system to prevent flickering
  const previousHostStatusRef = useRef({ isPresent: false, name: null })

  useEffect(() => {
    const tracker = getDurationTracker()
    const host = hostRows[0]

    if (host) {
      const isHostPresent = host.isLive && !host.isLeft
      const wasHostPresent = previousHostStatusRef.current.isPresent

      if (wasHostPresent && !isHostPresent) {
        // Host just left - use grace period before declaring left
        // This prevents flickering when data temporarily shows host as absent
        handleHostAbsenceWithGrace(tracker, 'HostRows: ')
      } else if (!wasHostPresent && isHostPresent) {
        // Host just returned - mark as seen and resume tracking
        handleHostPresence(tracker, host.name, 'HostRows: ')
      } else if (isHostPresent) {
        // Host is still present - just mark as seen (resets grace period)
        markHostSeen()
      }

      // Update previous status
      previousHostStatusRef.current = {
        isPresent: isHostPresent,
        name: host.name
      }
    } else if (previousHostStatusRef.current.isPresent) {
      // Host row disappeared entirely - use grace period before declaring left
      handleHostAbsenceWithGrace(tracker, 'HostRows (disappeared): ')
      previousHostStatusRef.current = { isPresent: false, name: null }
    }
  }, [hostRows, handleHostAbsenceWithGrace, handleHostPresence, markHostSeen])

  // No API fetch: rely solely on locally persisted values.
  const socketRef = useRef(null)
  const isUnmountingRef = useRef(false)
  const connectionIdRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const lastDisconnectReasonRef = useRef(null)

  // Connection state persistence keys
  const CONNECTION_STATE_KEY = 'neattend_socket_connection_state'
  const CONNECTION_ID_KEY = 'neattend_socket_connection_id'

  // Singleton socket instance to survive HMR updates
  // Moved outside useEffect so it can be used by manual reconnect
  const getOrCreateSocket = useCallback(() => {
    // Check if we have a valid existing socket
    if (socketRef.current?.connected || socketRef.current?.active) {
      console.log('✅ Reusing existing socket connection')
      return socketRef.current
    }

    // Check for persisted connection state (HMR recovery)
    const persistedState = localStorage.getItem(CONNECTION_STATE_KEY)
    const persistedConnectionId = localStorage.getItem(CONNECTION_ID_KEY)

    if (
      persistedState === 'connected' &&
      persistedConnectionId &&
      persistedConnectionId === connectionIdRef.current
    ) {
      console.log('🔄 Detected HMR update, preserving connection state')
    }

    const socketUrl = getSocketIOUrl()
    console.log('🔌 Creating new Socket.IO connection to:', socketUrl)

    // Generate unique connection ID
    connectionIdRef.current = `conn_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`
    localStorage.setItem(CONNECTION_ID_KEY, connectionIdRef.current)

    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      timeout: 60000, // Aligned with server pingTimeout (60s)
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10, // Increased from 5
      randomizationFactor: 0.5,
      forceNew: false,
      withCredentials: true,
      autoConnect: true,
      // Match server ping configuration
      pingTimeout: 60000,
      pingInterval: 25000
    })

    socketRef.current = socket
    return socket
  }, [])

  useEffect(() => {
    // Prevent duplicate socket connections in React Strict Mode
    // More robust check: verify socket state, not just connected flag
    if (socketRef.current) {
      const socket = socketRef.current
      const isActive =
        socket.active || socket.connected || socket.io?.readyState === 'open'

      if (isActive && !isUnmountingRef.current) {
        console.log('⚠️ Socket already active, skipping duplicate connection')
        console.log('   Socket ID:', socket.id)
        console.log('   Connection ID:', connectionIdRef.current)
        // Restore connection state from socket
        if (socket.connected) {
          setIsConnected(true)
          localStorage.setItem(CONNECTION_STATE_KEY, 'connected')
        }
        return
      }

      // If socket exists but not connected, clean it up first
      if (!isActive && socket.io) {
        console.log('🧹 Cleaning up inactive socket before creating new one')
        socket.removeAllListeners()
        socket.disconnect()
        socketRef.current = null
      }
    }

    isUnmountingRef.current = false
    const socket = getOrCreateSocket()

    // Connection event handlers
    const handleConnect = () => {
      console.log('✅ Socket.IO connected! ID:', socket.id)
      console.log('   Transport:', socket.io.engine.transport.name)
      console.log('   Connection ID:', connectionIdRef.current)
      setIsConnected(true)
      reconnectAttemptsRef.current = 0
      lastDisconnectReasonRef.current = null
      localStorage.setItem(CONNECTION_STATE_KEY, 'connected')

      // PHASE 2 FIX: Join rooms immediately on connect (even if IDs not loaded yet)
      // This prevents race condition where updates arrive before rooms joined
      // We'll join empty rooms now and update room membership when IDs arrive
      console.log(`🔍 === CHECKING ROOM JOIN ON CONNECT ===`)
      console.log(
        `   allowedSubjectIdsRef.current:`,
        allowedSubjectIdsRef.current
      )
      console.log(`   allowedGroupIdsRef.current:`, allowedGroupIdsRef.current)
      console.log(`   allowedIdsLoaded:`, allowedIdsLoaded)

      // PHASE 3 FIX: Join rooms immediately on connect (even if IDs not loaded)
      // This prevents race condition where updates arrive before rooms joined
      // Join with available IDs, or empty array if IDs not loaded yet
      const currentSubjectIds =
        allowedSubjectIdsRef.current.length > 0
          ? allowedSubjectIdsRef.current
          : []
      const currentGroupIds = allowedGroupIdsRef.current

      // PHASE 2 FIX: Always join rooms immediately on connect (even with empty IDs)
      // This ensures catch-all room is joined for unauthenticated updates
      if (currentSubjectIds.length > 0 || currentGroupIds.length > 0) {
        console.log(
          `✅ IDs available, joining rooms immediately (${currentSubjectIds.length} subjects, ${currentGroupIds.length} groups)`
        )
      } else {
        console.log('⏳ Socket connected but allowedSubjectIds not loaded yet')
        console.log('   💡 Joining catch-all room for unauthenticated updates')
        console.log(
          '   💡 Will join subject rooms automatically when loadAllowedGroups() completes'
        )
        console.log('   💡 Updates arriving before rooms joined will be queued')
      }

      // Always join rooms (even with empty arrays) to ensure catch-all room is joined
      // Backend will automatically join 'subject:unauthenticated' room
      joinSocketRooms(socket, currentSubjectIds, currentGroupIds)

      // Phase 2 Task 3: Catch-all room is automatically joined by backend (no need to emit separately)
      // Backend always joins 'subject:unauthenticated' room for all instructors

      // PHASE 3 FIX: Process any queued updates now that socket is connected
      // Note: Updates may still be queued if rooms not joined yet, they'll be processed when rooms join
      if (updateQueueRef.current.length > 0) {
        console.log(
          `📦 ${updateQueueRef.current.length} update(s) queued - will process when rooms joined`
        )
      }
    }

    const handleConnectError = error => {
      console.error('❌ Socket.IO connection error:', error.message)
      console.error('   Type:', error.type)
      console.error('   Description:', error.description)
      setIsConnected(false)
      setSocketError({
        message: error.message || 'Failed to connect to server',
        type: error.type || 'connection_error',
        timestamp: new Date()
      })
      localStorage.setItem(CONNECTION_STATE_KEY, 'disconnected')

      // Provide actionable error message
      console.error('💡 Troubleshooting steps:')
      console.error(
        '   1. Ensure backend server is running on http://localhost:8000'
      )
      console.error('   2. Check browser console for CORS errors')
      console.error('   3. Verify network connectivity')
      console.error(
        '   4. Try refreshing the page or clicking the Reconnect button'
      )
    }

    const handleDisconnect = reason => {
      lastDisconnectReasonRef.current = reason
      setIsConnected(false)
      localStorage.setItem(CONNECTION_STATE_KEY, 'disconnected')

      // Expected disconnects in development (React Strict Mode, HMR, page refresh)
      const expectedReasons = [
        'transport close',
        'io client disconnect',
        'io server disconnect'
      ]
      const isExpected =
        expectedReasons.includes(reason) || isUnmountingRef.current

      if (isExpected) {
        // Less alarming log for expected disconnects
        console.log(`🔌 Socket disconnected (${reason}) - will auto-reconnect`)
      } else {
        console.warn('⚠️ Socket.IO disconnected. Reason:', reason)
        console.warn('   Connection ID:', connectionIdRef.current)
      }

      // PHASE 2.3: Clear roomsJoined state on disconnect
      setRoomsJoined([])

      // PHASE 2.3: Reset extension status tracking on disconnect
      setExtensionConnected(false)
      setLastExtensionHeartbeat(null)

      // Only count as reconnection attempt if unexpected
      if (!isExpected) {
        reconnectAttemptsRef.current += 1
        if (reconnectAttemptsRef.current > 3) {
          console.error(
            '⚠️ Multiple reconnection attempts, connection may be unstable'
          )
        }
      }
    }

    const handleReconnect = attemptNumber => {
      console.log('🔄 Socket.IO reconnected after', attemptNumber, 'attempts')
      console.log('   Connection ID:', connectionIdRef.current)
      setIsConnected(true)
      setIsReconnecting(false)
      reconnectAttemptsRef.current = 0
      setReconnectAttempts(0)
      setSocketError(null) // Clear error on successful reconnection
      localStorage.setItem(CONNECTION_STATE_KEY, 'connected')

      // Reload allowedSubjectIds/allowedGroupIds on reconnect to ensure we have latest data
      // This handles cases where subject assignments might have changed
      const reloadAndRejoin = async () => {
        try {
          const rawUser = localStorage.getItem('user')
          const user = rawUser ? JSON.parse(rawUser) : null
          const instructorId = user?._id || user?.id
          if (!instructorId) {
            console.warn('⚠️ Cannot reload subjects: no instructor ID')
            return
          }

          // Fetch subjects directly (current system)
          let subjectIds = []
          try {
            const subjectsResponse = await apiGet(
              `subjects/instructor/${instructorId}`
            )
            if (subjectsResponse.ok) {
              const subjectsResult = await subjectsResponse.json()
              const subjects = subjectsResult.data || []
              subjectIds = subjects
                .filter(subject => {
                  const ownerId =
                    subject.instructorId?._id || subject.instructorId
                  return (
                    ownerId && ownerId.toString() === instructorId.toString()
                  )
                })
                .map(subject => (subject._id || subject.id || '').toString())
                .filter(Boolean)
              setAllowedSubjectIds(subjectIds)
            }
          } catch (subjectsErr) {
            console.warn(
              '⚠️ Unable to reload subjects on reconnect:',
              subjectsErr
            )
          }

          // PHASE 4.2: Rejoin Socket.IO rooms after reload with verification
          // Use timeout to ensure state updates have propagated
          setTimeout(() => {
            if (socketRef.current && socketRef.current.connected) {
              const currentSubjectIds =
                allowedSubjectIdsRef.current.length > 0
                  ? allowedSubjectIdsRef.current
                  : subjectIds
              const currentGroupIds = allowedGroupIdsRef.current

              if (currentSubjectIds.length > 0 || currentGroupIds.length > 0) {
                joinSocketRooms(
                  socketRef.current,
                  currentSubjectIds,
                  currentGroupIds
                )
                console.log('✅ Requested to rejoin rooms after reconnect')

                // PHASE 4.2: Verify room membership after rejoin
                setTimeout(() => {
                  if (socketRef.current && socketRef.current.connected) {
                    const actualRooms = socketRef.current.rooms
                      ? Array.from(socketRef.current.rooms).filter(
                          room =>
                            room.startsWith('subject:') ||
                            room.startsWith('group:')
                        )
                      : []
                    console.log(
                      `🔍 Post-reconnect room verification: ${actualRooms.length} rooms joined`
                    )
                    if (actualRooms.length > 0) {
                      setRoomsJoined(actualRooms)
                      console.log(
                        `✅ Successfully rejoined ${actualRooms.length} room(s) after reconnect`
                      )
                    }
                  }
                }, 1000) // Wait 1 second for rooms to join
              } else {
                console.log('⏳ Reconnected but no subjects/groups to join')
                // Clear rooms state if no rooms to join
                setRoomsJoined([])
              }
            }
          }, 100) // Small delay to ensure state updates
        } catch (err) {
          console.error('❌ Error reloading subjects on reconnect:', err)
          // Fallback: try to rejoin with existing refs
          if (
            allowedSubjectIdsRef.current.length > 0 ||
            allowedGroupIdsRef.current.length > 0
          ) {
            joinSocketRooms(
              socket,
              allowedSubjectIdsRef.current,
              allowedGroupIdsRef.current
            )
          }
        }
      }

      reloadAndRejoin()
    }

    const handleReconnectAttempt = attemptNumber => {
      console.log('🔄 Reconnection attempt', attemptNumber)
      setIsReconnecting(true)
      setReconnectAttempts(attemptNumber)
      reconnectAttemptsRef.current = attemptNumber
    }

    const handleReconnectError = error => {
      console.error('❌ Socket.IO reconnection error:', error.message)
      reconnectAttemptsRef.current += 1
      setReconnectAttempts(reconnectAttemptsRef.current)
    }

    const handleReconnectFailed = () => {
      console.error('❌ Socket.IO reconnection failed after all attempts')
      setIsConnected(false)
      setIsReconnecting(false)
      setSocketError({
        message:
          'Failed to reconnect after all attempts. Meeting status updates may not work.',
        type: 'reconnect_failed',
        timestamp: new Date()
      })
      localStorage.setItem(CONNECTION_STATE_KEY, 'failed')

      // Provide option for manual reconnection
      console.warn(
        '💡 Connection failed. Use manual reconnect button or refresh the page.'
      )
      console.warn(
        '   Meeting status will not update until connection is restored.'
      )
    }

    // Register event handlers
    socket.on('connect', handleConnect)
    socket.on('connect_error', handleConnectError)
    socket.on('disconnect', handleDisconnect)
    socket.on('reconnect', handleReconnect)
    socket.on('reconnect_attempt', handleReconnectAttempt)
    socket.on('reconnect_error', handleReconnectError)
    socket.on('reconnect_failed', handleReconnectFailed)

    // Listen for extension connection events
    socket.on('extension:connected', data => {
      console.log('✅ === EXTENSION CONNECTED EVENT RECEIVED ===')
      console.log('   Data:', data)
      console.log('   Source:', data.source || 'socket.io')
      console.log('   MeetCode:', data.meetCode)
      console.log('   SubjectId:', data.subjectId)
      setExtensionConnected(true)
      setLastExtensionHeartbeat(new Date())

      // 🔴 Auto-update meeting status when extension connects
      setMeetingStatus(prev => {
        if (prev === MEETING_STATUS.IDLE) {
          console.log(
            '🎯 Meeting status auto-updated: idle → scraping (extension connected)'
          )
          return MEETING_STATUS.SCRAPING
        }
        return prev
      })
      console.log('   ✅ Extension status updated to: Connected')
    })

    socket.on('extension:disconnected', data => {
      console.log('❌ === EXTENSION DISCONNECTED EVENT RECEIVED ===')
      console.log('   Data:', data)
      console.log('   Source:', data.source || 'socket.io')
      console.log('   Reason:', data.reason || 'unknown')
      if (data.inactiveFor) {
        console.log('   Inactive for:', data.inactiveFor, 'seconds')
      }
      setExtensionConnected(false)

      // 🔴 Reset meeting status when extension disconnects (meeting likely ended)
      setMeetingStatus(prev => {
        if (
          prev === MEETING_STATUS.SCRAPING ||
          prev === MEETING_STATUS.ACTIVE
        ) {
          console.log(
            `🎯 Meeting status auto-updated: ${prev} → idle (extension disconnected)`
          )
          return MEETING_STATUS.IDLE
        }
        return prev
      })
      console.log('   ❌ Extension status updated to: Disconnected')
    })

    socket.on('extension:heartbeat', data => {
      // Throttle heartbeat logging to avoid console spam (log every 10th heartbeat)
      const heartbeatCount = (window.extensionHeartbeatCount || 0) + 1
      window.extensionHeartbeatCount = heartbeatCount

      if (
        heartbeatCount % 10 === 0 ||
        !window.lastHeartbeatLog ||
        Date.now() - window.lastHeartbeatLog > 30000
      ) {
        console.log('💓 === EXTENSION HEARTBEAT RECEIVED ===')
        console.log('   Data:', data)
        console.log('   Source:', data.source || 'socket.io')
        console.log('   MeetCode:', data.meetCode)
        console.log('   Participant Count:', data.participantCount || 'unknown')
        window.lastHeartbeatLog = Date.now()
      }
      setLastExtensionHeartbeat(new Date())

      // 🔴 Auto-update meeting status based on heartbeat data (using stable setter)
      const participantCount = data.participantCount || 0
      if (participantCount > 0) {
        setStableMeetingStatus(MEETING_STATUS.DATA_RECEIVED)
      } else if (
        participantCount === 0 &&
        meetingStatus === MEETING_STATUS.IDLE
      ) {
        setStableMeetingStatus(MEETING_STATUS.SCRAPING)
      }
    })

    // Listen for room join confirmation from backend
    socket.on('rooms:joined', data => {
      if (data.success) {
        console.log('✅ === ROOMS JOINED CONFIRMED BY BACKEND ===')
        console.log('   Rooms:', data.rooms)
        console.log('   SubjectIds:', data.subjectIds)
        console.log('   GroupIds:', data.groupIds)
        console.log('   Timestamp:', data.timestamp)

        // Update roomsJoined state with backend-confirmed rooms
        if (data.rooms && data.rooms.length > 0) {
          setRoomsJoined(data.rooms)
          console.log(
            `   ✅ Updated roomsJoined state: ${data.rooms.length} room(s)`
          )

          // Also update roomStatusFromBackend for diagnostic panel
          const subjectRooms = data.rooms.filter(r => r.startsWith('subject:'))
          const groupRooms = data.rooms.filter(r => r.startsWith('group:'))
          setRoomStatusFromBackend({
            success: true,
            socketId: socketRef.current?.id || null,
            connected: socketRef.current?.connected || false,
            totalRooms: data.rooms.length,
            rooms: data.rooms,
            subjectRooms: subjectRooms,
            groupRooms: groupRooms,
            timestamp: data.timestamp
          })

          // Phase 2 Task 4: Process any queued updates now that rooms are confirmed
          processQueuedUpdates()
        } else {
          // No rooms joined but request was processed
          setRoomsJoined([])
          if (data.message) {
            console.log(`   ℹ️ ${data.message}`)
          }
        }
      } else {
        console.error('❌ === ROOM JOIN FAILED ===')
        console.error('   Error:', data.error)
        console.error('   Timestamp:', data.timestamp)
        setRoomsJoined([])
      }
    })

    // Listen for meeting status updates
    socket.on('meeting:status', data => {
      console.log('📊 Meeting status update:', data)

      // Filter by subjectId to ensure instructors only see their own subjects' status
      if (data.subjectId) {
        const subjectIdStr =
          typeof data.subjectId === 'object' && data.subjectId._id
            ? data.subjectId._id.toString()
            : data.subjectId.toString()

        if (!allowedGroupsRef.current.has(subjectIdStr)) {
          console.log(
            '⏭️ Skipping meeting:status update for unauthorized subject.'
          )
          console.log('   SubjectId:', subjectIdStr)
          console.log(
            '   Allowed subjects:',
            Array.from(allowedGroupsRef.current)
          )
          return
        }
      }

      // Only update if status is provided and subject is authorized
      if (data.status) {
        setMeetingStatus(data.status)
        console.log('   Meeting status updated to:', data.status)
      }
      setLastUpdated(new Date())

      // Track that Socket.IO meeting:status is the current realtime source
      setRealtimeSource('socket-meeting-status')

      setDebugRealtimeInfo(() => ({
        source: 'meeting:status',
        meetingStatus: data.status || null,
        meetCode: data.meetCode || null,
        subjectId: data.subjectId || null,
        timestamp: data.timestamp || new Date().toISOString()
      }))
    })

    // FIX: Listen for meeting:ended event (when host ends meeting or instructor clears)
    socket.on('meeting:ended', data => {
      console.log('🛑 === MEETING ENDED EVENT RECEIVED ===')
      console.log('   SubjectId:', data.subjectId)
      console.log('   GroupId:', data.groupId)
      console.log('   Reason:', data.reason)
      console.log('   Timestamp:', data.timestamp)

      // Filter by subjectId/groupId to ensure we only handle our own meetings
      const subjectIdStr = data.subjectId?.toString()
      const groupIdStr = data.groupId?.toString()

      const isAuthorized =
        (subjectIdStr && allowedGroupsRef.current.has(subjectIdStr)) ||
        (groupIdStr && allowedGroupsRef.current.has(groupIdStr))

      if (!isAuthorized && (subjectIdStr || groupIdStr)) {
        console.log('⏭️ Skipping meeting:ended for unauthorized subject/group')
        return
      }

      // Meeting ended - update status and optionally clear display
      setMeetingStatus(MEETING_STATUS.IDLE)
      setExtensionConnected(false)

      // If reason is host_ended, clear live rows (meeting is over)
      if (data.reason === 'host_ended' || data.reason === 'meeting_finalized') {
        console.log('🧹 Meeting ended by host - clearing live display')
        updateLiveRows([], { allowEmpty: true })
        const tracker = getDurationTracker()
        tracker.clear()
      }

      setLastUpdated(new Date())
      console.log('✅ Meeting ended event processed')
    })

    // Listen for session:ended event (when extension End Session is used)
    // This is emitted by the /api/attendance/end-session endpoint and should
    // immediately reflect that the current session has been finalized.
    socket.on('session:ended', data => {
      console.log('🛑 === SESSION ENDED EVENT RECEIVED ===')
      console.log('   MeetCode:', data.meetCode)
      console.log('   SessionId:', data.sessionId)
      console.log('   Duration (minutes):', data.duration)
      console.log('   TotalParticipants:', data.totalParticipants)

      const endedMeetCode = data.meetCode || null

      // Only react if this matches the current tracked meet code (if any)
      if (
        endedMeetCode &&
        currentMeetCodeRef.current &&
        endedMeetCode !== currentMeetCodeRef.current
      ) {
        console.log(
          '⏭️ Skipping session:ended for different meetCode:',
          endedMeetCode,
          '(current is',
          currentMeetCodeRef.current,
          ')'
        )
        return
      }

      // Mark meeting as idle and extension as disconnected
      setMeetingStatus(MEETING_STATUS.IDLE)
      setExtensionConnected(false)
      setRealtimeSource('session-ended')

      // Clear live display rows and reset duration tracker
      // This mirrors the behavior in meeting:ended so that once the
      // session is finalized via End Session, the live table is cleared.
      updateLiveRows([], { allowEmpty: true })
      const tracker = getDurationTracker()
      tracker.clear()

      // Record debug info and a compact session summary for the UI
      const timestamp = data.endTime || new Date().toISOString()
      const durationMinutes =
        typeof data.duration === 'number' ? data.duration : null
      const totalParticipants =
        typeof data.totalParticipants === 'number'
          ? data.totalParticipants
          : null

      setDebugRealtimeInfo(() => ({
        source: 'session:ended',
        meetingStatus: MEETING_STATUS.IDLE,
        meetCode: endedMeetCode,
        sessionId: data.sessionId || null,
        totalParticipants,
        durationMinutes,
        timestamp
      }))

      setSessionSummary({
        meetCode: endedMeetCode,
        durationMinutes,
        totalParticipants,
        endedAt: timestamp
      })

      setLastUpdated(new Date())
      console.log('✅ Session ended event processed')
    })

    // Listen for error events from backend
    socket.on('attendance:error', errorData => {
      console.error('❌ Attendance error received:', errorData)

      // Filter by subjectId if provided
      if (errorData.subjectId) {
        const subjectIdStr =
          typeof errorData.subjectId === 'object' && errorData.subjectId._id
            ? errorData.subjectId._id.toString()
            : errorData.subjectId.toString()

        if (!allowedGroupsRef.current.has(subjectIdStr)) {
          console.log('⏭️ Skipping error for unauthorized subject.')
          return
        }
      }

      // Update socket error state for user-visible feedback
      setSocketError({
        message:
          errorData.message ||
          'An error occurred while processing attendance update',
        type: errorData.type || 'server_error',
        statusCode: errorData.statusCode || 500,
        timestamp: errorData.timestamp || new Date()
      })

      // Log detailed error information
      console.error('   Error type:', errorData.type)
      console.error('   Status code:', errorData.statusCode)
      console.error('   MeetCode:', errorData.meetCode)
      console.error('   SubjectId:', errorData.subjectId)

      // Provide actionable error messages based on error type
      if (errorData.statusCode === 401 || errorData.statusCode === 403) {
        console.warn(
          '💡 Authentication/authorization error - extension may need to refresh credentials'
        )
      } else if (errorData.statusCode === 400) {
        console.warn('💡 Validation error - check extension payload format')
      } else if (errorData.statusCode >= 500) {
        console.warn('💡 Server error - check backend logs and server status')
      }
    })

    // PHASE 2.2: Connection health monitoring - periodic ping with state sync
    const healthCheckInterval = setInterval(() => {
      if (socket.connected) {
        // Socket.IO handles ping/pong automatically, but we can verify connection
        const latency = socket.io?.engine?.pingInterval || 0
        if (latency > 0) {
          console.log('💓 Connection health check: OK')
        }

        // PHASE 2.2: Sync connection state with actual socket state
        if (!isConnected) {
          console.log(
            '🔍 Health check: Socket is connected but isConnected state is false - correcting'
          )
          setIsConnected(true)
          localStorage.setItem(CONNECTION_STATE_KEY, 'connected')
        }
      } else {
        // PHASE 2.2: Socket is not connected - sync state
        if (isConnected) {
          console.log(
            '🔍 Health check: Socket is disconnected but isConnected state is true - correcting'
          )
          setIsConnected(false)
          localStorage.setItem(CONNECTION_STATE_KEY, 'disconnected')
          // Clear rooms joined state if socket disconnected
          if (roomsJoined.length > 0) {
            console.log(
              '🧹 Health check: Clearing rooms joined state - socket disconnected'
            )
            setRoomsJoined([])
          }
        }
      }
    }, 30000) // Every 30 seconds

    socket.on('attendance:update', payload => {
      // PHASE 3.3: Enhanced data flow verification logging
      console.log('📡 === RECEIVED REALTIME UPDATE ===')
      console.log('   [DATA FLOW STEP 3/3] Dashboard received Socket.IO event')
      console.log('   Type:', payload.type)
      console.log('   MeetCode:', payload.meetCode)
      console.log('   SubjectId:', payload.subjectId)
      console.log('   GroupId:', payload.groupId)
      const participantCount =
        payload.participants?.length || payload.attendance?.length || 0
      const hostCount =
        payload.participants?.filter(p => p.isHost === true).length || 0
      console.log('   Participant count:', participantCount)
      console.log('   Host count:', hostCount)
      setDebugRealtimeInfo(() => ({
        source: 'attendance:update',
        meetingStatus: payload.meetingStatus || null,
        meetCode: payload.meetCode || null,
        subjectId: payload.subjectId || null,
        timestamp: payload.timestamp || new Date().toISOString()
      }))
      if (hostCount > 0) {
        const hostNames =
          payload.participants
            ?.filter(p => p.isHost === true)
            .map(h => h.name || 'Unknown')
            .join(', ') || 'Unknown'
        console.log(`   Host name(s): ${hostNames}`)
        // Debug: Show full host participant objects
        const hosts = payload.participants?.filter(p => p.isHost === true) || []
        hosts.forEach((host, idx) => {
          console.log(`   👑 Host ${idx + 1} details:`, {
            name: host.name,
            isHost: host.isHost,
            avatarUrl: host.avatarUrl
              ? host.avatarUrl.substring(0, 50) + '...'
              : null,
            participantId: host.participantId,
            studentId: host.studentId
          })
        })
      } else {
        console.warn('   ⚠️ No hosts detected in payload participants')
        // Debug: Check if participants have isHost property at all
        if (payload.participants && payload.participants.length > 0) {
          const hasIsHostProperty = payload.participants.some(p =>
            Object.prototype.hasOwnProperty.call(p, 'isHost')
          )
          console.log(
            `   Debug: ${
              hasIsHostProperty ? 'Some' : 'No'
            } participants have isHost property`
          )
          if (hasIsHostProperty) {
            const isHostValues = payload.participants.map(p => ({
              name: p.name,
              isHost: p.isHost
            }))
            console.log('   Debug: isHost values:', isHostValues)
          }
        }
      }
      console.log('   Timestamp:', payload.timestamp)
      console.log('   Payload keys:', Object.keys(payload))

      // PHASE 3.3: Verify socket connection and room membership
      if (socketRef.current) {
        console.log('   ✅ Socket ref exists')
        console.log('   ✅ Socket connected:', socketRef.current.connected)
        const actualRooms = socketRef.current.rooms
          ? Array.from(socketRef.current.rooms).filter(
              room => room.startsWith('subject:') || room.startsWith('group:')
            )
          : []
        console.log(
          `   ✅ Socket in ${actualRooms.length} room(s):`,
          actualRooms
        )

        if (payload.subjectId) {
          const expectedRoom = `subject:${payload.subjectId}`
          const inExpectedRoom = actualRooms.includes(expectedRoom)
          console.log(
            `   ${inExpectedRoom ? '✅' : '⚠️'} Socket ${
              inExpectedRoom ? 'is' : 'is NOT'
            } in expected room: ${expectedRoom}`
          )
        }
      } else {
        console.warn('   ⚠️ Socket ref is null - unexpected!')
      }

      // PHASE 1.1: Track last update received timestamp
      const updateTime = new Date()
      markRealtimeDataUpdate('socket-attendance-update', updateTime)
      console.log(
        '   ✅ Last update timestamp updated:',
        updateTime.toLocaleTimeString()
      )
      console.log(
        '   📊 This is update #',
        (window.attendanceUpdateCount = (window.attendanceUpdateCount || 0) + 1)
      )

      // Extract meetingStatus BEFORE filtering to ensure it's not lost
      // Note: meeting:status event is the primary source of truth, but we extract here
      // as a backup in case the separate event is missed
      if (payload.meetingStatus) {
        setMeetingStatus(payload.meetingStatus)
        console.log(
          '   Meeting status extracted from payload:',
          payload.meetingStatus
        )
      }

      // PHASE 1 FIX: Check if update is unauthenticated
      const isUnauthenticated =
        payload.isUnauthenticated === true || payload.authWarning === true

      if (isUnauthenticated) {
        console.warn('⚠️ === UNAUTHENTICATED UPDATE RECEIVED ===')
        console.warn('   MeetCode:', payload.meetCode)
        console.warn(
          '   💡 This update was sent without authentication credentials'
        )
        console.warn(
          '   💡 Extension user should join meeting through NE-Attend dashboard to enable authenticated tracking'
        )
        // Set flag to show warning banner
        setHasUnauthenticatedUpdates(true)
        // Continue processing unauthenticated updates (don't return early)
      }

      // PHASE 2 FIX: Check if rooms are joined - if not, queue the update
      const allowedIds = Array.from(allowedGroupsRef.current)
      const allowedIdsCount = allowedIds.length
      // FIX: Use ref instead of state to avoid stale closure issues in socket handlers
      // roomsJoinedRef is synced with roomsJoined state via useEffect
      const confirmedRooms = roomsJoinedRef.current || []
      const hasJoinedRooms =
        confirmedRooms.length > 0 &&
        confirmedRooms.some(
          room => room.startsWith('subject:') || room.startsWith('group:')
        )

      console.log(`🔍 === FILTERING CHECK ===`)
      console.log(`   Allowed IDs count: ${allowedIdsCount}`)
      console.log(`   Allowed IDs:`, allowedIdsCount > 0 ? allowedIds : 'none')
      console.log(`   Payload subjectId:`, payload.subjectId)
      console.log(`   Payload groupId:`, payload.groupId)
      console.log(`   IsUnauthenticated:`, isUnauthenticated)
      console.log(
        `   Confirmed rooms:`,
        confirmedRooms.length > 0 ? confirmedRooms : 'none'
      )
      console.log(`   Has joined rooms:`, hasJoinedRooms)

      // CRITICAL FIX: Always accept unauthenticated updates immediately
      // Don't queue them - they should display right away
      if (isUnauthenticated) {
        console.log('✅ === FAST-TRACKING UNAUTHENTICATED UPDATE ===')
        // Skip all filtering - go straight to processing
      } else if (!hasJoinedRooms && allowedIdsCount === 0) {
        console.warn('⏳ === QUEUING UPDATE (ROOMS NOT JOINED YET) ===')
        console.warn(
          '   Reason: Socket connected but rooms not joined and allowed IDs not loaded'
        )
        console.warn(
          '   💡 Update will be processed when rooms are joined or after timeout'
        )

        // Phase 2 Task 4: Add timestamp to queued update
        const queuedUpdate = {
          payload: payload,
          queuedAt: Date.now(),
          timeout: UPDATE_QUEUE_TIMEOUT_MS
        }
        updateQueueRef.current.push(queuedUpdate)

        // Limit queue size to prevent memory issues
        if (updateQueueRef.current.length > 50) {
          console.warn('⚠️ Update queue too large, removing oldest updates')
          updateQueueRef.current = updateQueueRef.current.slice(-50)
        }

        // Phase 2 Task 4: Set timeout to process queued updates if rooms not joined
        if (!updateQueueTimeoutRef.current) {
          updateQueueTimeoutRef.current = setTimeout(() => {
            console.warn('⏰ === UPDATE QUEUE TIMEOUT ===')
            console.warn(
              '   Queued updates have been waiting for 30s - processing now'
            )
            processQueuedUpdates()
            updateQueueTimeoutRef.current = null
          }, UPDATE_QUEUE_TIMEOUT_MS)
        }

        return // Queue the update, don't process yet
      }

      // PHASE 2.2 FIX: Check filtering result - may return 'queue' to indicate update should be queued
      const filterResult = payloadMatchesAllowedGroups(
        payload,
        isUnauthenticated
      )

      if (isUnauthenticated) {
        // Always allow unauthenticated updates (they show with warnings)
        console.log('✅ === UNAUTHENTICATED UPDATE ACCEPTED ===')
        console.log(
          '   💡 Displaying with warnings - user should join through dashboard for authenticated tracking'
        )
      } else if (filterResult === 'queue') {
        // Phase 2 Task 4: Queue authenticated updates if IDs not loaded (with timeout)
        console.warn('⏳ === QUEUING AUTHENTICATED UPDATE (IDS NOT LOADED) ===')
        console.warn(
          '   Reason: Allowed IDs not loaded yet - update will be processed when IDs load or after timeout'
        )
        console.warn('   GroupId:', payload.groupId)
        console.warn('   SubjectId:', payload.subjectId)

        // Phase 2 Task 4: Add timestamp to queued update
        const queuedUpdate = {
          payload: payload,
          queuedAt: Date.now(),
          timeout: UPDATE_QUEUE_TIMEOUT_MS
        }
        updateQueueRef.current.push(queuedUpdate)

        if (updateQueueRef.current.length > 50) {
          console.warn('   ⚠️ Update queue too large, removing oldest updates')
          updateQueueRef.current = updateQueueRef.current.slice(-50)
        }

        // Phase 2 Task 4: Set timeout to process queued updates if IDs not loaded
        if (!updateQueueTimeoutRef.current) {
          updateQueueTimeoutRef.current = setTimeout(() => {
            console.warn('⏰ === UPDATE QUEUE TIMEOUT ===')
            console.warn(
              '   Queued updates have been waiting for 30s - processing now'
            )
            processQueuedUpdates()
            updateQueueTimeoutRef.current = null
          }, UPDATE_QUEUE_TIMEOUT_MS)
        }

        return // Queue the update, don't process yet
      } else if (filterResult === false) {
        // Update rejected - not authorized for this instructor
        console.log('⏭️ === UPDATE REJECTED (UNAUTHORIZED) ===')
        console.log('   Reason: SubjectId/GroupId not in allowed list')
        console.log('   GroupId:', payload.groupId)
        console.log('   SubjectId:', payload.subjectId)
        console.log('   Allowed groups/subjects:', allowedIds)
        const payloadSubjectIdStr = payload.subjectId?.toString()
        const payloadGroupIdStr = payload.groupId?.toString()
        console.warn(
          `   💡 Payload subjectId "${payloadSubjectIdStr}" not in allowed list`
        )
        console.warn(
          `   💡 Payload groupId "${payloadGroupIdStr}" not in allowed list`
        )
        return
      } else {
        // Update accepted - authorized
        console.log('✅ === UPDATE ACCEPTED (AUTHORIZED) ===')
      }

      console.log('✅ === UPDATE ACCEPTED (AUTHORIZED) ===')
      console.log('✅ Processing update for authorized group')

      const baseOptions = {
        defaultGroup:
          payload.subjectName || payload.groupName || payload.meetCode,
        defaultDate: payload.sessionDate,
        hostLeaveTime: payload.instructorLeaveTime || payload.hostLeaveTime,
        meetingEnded: payload.meetingEnded || false
      }

      // Store subjectName/groupName in payload for use in buildDisplayRow
      if (payload.subjectName || payload.groupName) {
        baseOptions.subjectName = payload.subjectName || payload.groupName
      }

      if (payload.type === 'participant_change') {
        // 🔴 Auto-detect meeting status for join/leave events
        setMeetingStatus(prev => {
          if (prev === MEETING_STATUS.IDLE) {
            console.log(
              `🎯 Meeting status auto-updated: idle → active (participant ${payload.eventType})`
            )
            return MEETING_STATUS.ACTIVE
          }
          return prev
        })

        const { eventType, participant, currentParticipants } = payload
        const participantRow = buildDisplayRow(participant || {}, {
          ...baseOptions,
          isLiveOverride: eventType === 'leave' ? false : undefined,
          markNew: eventType === 'join',
          markLeft: eventType === 'leave',
          isUnauthenticated: isUnauthenticated // Phase 2 Task 3: Pass unauthenticated flag
        })

        const mappedCurrent = (currentParticipants || []).map(p =>
          buildDisplayRow(p, {
            ...baseOptions,
            isLiveOverride:
              typeof p.isLive === 'boolean' ? p.isLive : undefined,
            isUnauthenticated: isUnauthenticated, // Phase 2 Task 3: Pass unauthenticated flag
            markNew:
              eventType === 'join' &&
              (p.participantId === participantRow.participantId ||
                p.studentId === participantRow.studentId ||
                p.name === participantRow.name)
          })
        )

        if (eventType === 'leave') {
          updateLiveRows(prevRows => {
            const prevMap = new Map(prevRows.map(row => [row.key, row]))
            const mergedParticipant = mergeRowWithExisting(
              participantRow,
              prevMap.get(participantRow.key)
            )
            const mergedCurrent = mappedCurrent
              .filter(row => row.key !== participantRow.key)
              .map(row => mergeRowWithExisting(row, prevMap.get(row.key)))
            const filteredPrev = prevRows.filter(
              row => row.key !== participantRow.key
            )
            return [mergedParticipant, ...mergedCurrent, ...filteredPrev]
          })
        } else if (mappedCurrent.length > 0) {
          updateLiveRows(prevRows => {
            const prevMap = new Map(prevRows.map(row => [row.key, row]))
            return mappedCurrent.map(row =>
              mergeRowWithExisting(row, prevMap.get(row.key))
            )
          })
        } else {
          updateLiveRows(prevRows => {
            const prevMap = new Map(prevRows.map(row => [row.key, row]))
            const mergedParticipant = mergeRowWithExisting(
              participantRow,
              prevMap.get(participantRow.key)
            )
            const filteredPrev = prevRows.filter(
              row => row.key !== participantRow.key
            )
            return [mergedParticipant, ...filteredPrev]
          })
        }
      } else if (payload.type === 'attendance_progress') {
        // Get raw participants from payload (NOT double-processed)
        const rawParticipants = payload.participants || []

        // 🔴 CRITICAL: Auto-detect meeting status based on received data
        // This ensures the UI updates even if backend doesn't send explicit meetingStatus
        if (rawParticipants.length > 0) {
          const newStatus =
            payload.meetingStatus || MEETING_STATUS.DATA_RECEIVED
          setMeetingStatus(newStatus)

          // FIX: Update data timestamp for stale data detection
          lastDataTimestampRef.current = Date.now()
          console.log(
            `🎯 Meeting status auto-updated to: ${newStatus} (${rawParticipants.length} participants)`
          )
        } else if (payload.meetCode) {
          // Meeting active but no participants yet (just started)
          setMeetingStatus(prev =>
            prev === MEETING_STATUS.IDLE ? MEETING_STATUS.SCRAPING : prev
          )
          console.log(
            `🎯 Meeting status: scraping (meetCode: ${payload.meetCode})`
          )
        }

        // Log incoming data
        console.log(`📥 === RAW PAYLOAD RECEIVED ===`)
        console.log(`   Participant count: ${rawParticipants.length}`)
        console.log(`   MeetCode: ${payload.meetCode}`)
        console.log(`   SessionDate: ${payload.sessionDate}`)

        // Calculate meeting statistics on raw data
        const hostCount = rawParticipants.filter(p => p.isHost).length
        const participantCount = rawParticipants.filter(p => !p.isHost).length
        console.log(`📊 === MEETING STATISTICS ===`)
        console.log(
          `   Total: ${rawParticipants.length}, Hosts: ${hostCount}, Regular: ${participantCount}`
        )

        // REAL-TIME SYNC: Register participants with duration tracker
        const tracker = getDurationTracker()

        // FIX: Check if host is present and active in incoming data
        // This detects instructor leave IMMEDIATELY from Socket.IO data
        const activeHost = rawParticipants.find(
          p => p.isHost === true && p.isLive !== false && p.status !== 'left'
        )
        const wasHostActive = !tracker.isTrackingPaused()

        // FIX: Use grace period system to prevent flickering "host left" messages
        if (!activeHost && rawParticipants.length > 0) {
          // No active host in incoming data - use grace period before declaring left
          if (wasHostActive) {
            handleHostAbsenceWithGrace(tracker, 'Socket.IO: ')
          }
        } else if (activeHost) {
          // Host is present - mark as seen and resume if paused
          handleHostPresence(tracker, activeHost.name, 'Socket.IO: ')
        }

        tracker.syncWithParticipants(
          rawParticipants.map(p => ({
            ...p,
            key:
              p.avatarUrl || p.participantId || `${p.name}-${payload.meetCode}`
          }))
        )

        // Save to localStorage for persistence
        saveParticipantsToStorage(rawParticipants, payload.meetCode)
        console.log(
          `💾 Saved ${rawParticipants.length} participants to localStorage`
        )

        // Separate host from participants for processing
        const hostParticipants = rawParticipants.filter(p => p.isHost)
        const regularParticipants = rawParticipants.filter(p => !p.isHost)

        // Log synchronization data for validation
        console.log(`📊 === DASHBOARD RECEIVED PROGRESS UPDATE ===`)
        console.log(`   Total participants: ${rawParticipants.length}`)
        console.log(`   Host count: ${hostCount}`)
        console.log(`   Regular participants: ${participantCount}`)
        if (hostCount > 0) {
          console.log(
            `   Host name(s): ${hostParticipants
              .map(h => h.name || 'Unknown')
              .join(', ')}`
          )
        }

        // Build display rows directly from raw participants (single processing via buildDisplayRow)
        const rows = regularParticipants.map(participant =>
          buildDisplayRow(participant, {
            ...baseOptions,
            isLiveOverride:
              typeof participant.isLive === 'boolean'
                ? participant.isLive
                : undefined,
            isUnauthenticated: isUnauthenticated
          })
        )

        // Process host separately and add to liveRows (will be filtered out in filteredRows but available for host section)
        if (hostParticipants.length > 0) {
          console.log(
            `👑 Processing ${hostParticipants.length} host participant(s) for display`
          )
          const hostRows = hostParticipants.map(host => {
            const hostRow = buildDisplayRow(host, {
              ...baseOptions,
              isLiveOverride:
                typeof host.isLive === 'boolean' ? host.isLive : undefined,
              isUnauthenticated: isUnauthenticated
            })
            console.log(
              `   👑 Host row created: "${hostRow.name}" (isHost: ${hostRow.isHost}, key: ${hostRow.key})`
            )
            return hostRow
          })
          // Add host rows to liveRows so they can be displayed in host section
          // They will be filtered out from participants table by filteredRows logic
          updateLiveRows(prevRows => {
            const prevMap = new Map(prevRows.map(row => [row.key, row]))
            const mergedHostRows = hostRows.map(row =>
              mergeRowWithExisting(row, prevMap.get(row.key))
            )
            const mergedRegularRows = rows.map(row =>
              mergeRowWithExisting(row, prevMap.get(row.key))
            )
            const combined = [...mergedHostRows, ...mergedRegularRows]
            console.log(
              `   ✅ Updated liveRows: ${combined.length} total rows (${mergedHostRows.length} host, ${mergedRegularRows.length} regular)`
            )
            // Combine host and regular participants (host will be filtered out in filteredRows)
            return combined
          })
        } else {
          console.log(
            `⚠️ No host participants found in payload - host section will not display`
          )
          // No host, just update regular participants
          updateLiveRows(prevRows => {
            const prevMap = new Map(prevRows.map(row => [row.key, row]))
            const updated = rows.map(row =>
              mergeRowWithExisting(row, prevMap.get(row.key))
            )
            console.log(
              `   ✅ Updated liveRows: ${updated.length} regular participant rows`
            )
            return updated
          })
        }
      } else if (payload.type === 'attendance_saved') {
        const attendance = payload.attendance || []
        const rows = attendance.map(record =>
          buildDisplayRow(
            {
              ...record,
              name: record.userName,
              participantId: record.userId
            },
            { ...baseOptions, isLiveOverride: false }
          )
        )
        updateLiveRows(prevRows => {
          const prevMap = new Map(prevRows.map(row => [row.key, row]))
          return rows.map(row =>
            mergeRowWithExisting(row, prevMap.get(row.key))
          )
        })
      }
    })

    // Restore connection state on mount (for HMR recovery)
    const restoreConnectionState = () => {
      const persistedState = localStorage.getItem(CONNECTION_STATE_KEY)
      if (persistedState === 'connected' && socket.connected) {
        console.log('✅ Restored connection state from persistence')
        setIsConnected(true)
      }
    }

    // Small delay to allow socket to establish connection
    const restoreTimeout = setTimeout(() => {
      restoreConnectionState()
    }, 100)

    return () => {
      clearTimeout(restoreTimeout)
      clearInterval(healthCheckInterval)

      // Only disconnect if component is actually unmounting (not just re-rendering)
      // Check if this is a true unmount vs HMR update
      // HMR updates typically happen when the component is still mounted but code changed
      // We detect this by checking if socket is connected and we're not explicitly unmounting
      const isHMRUpdate =
        (socket.connected || socket.active) && !isUnmountingRef.current

      if (isHMRUpdate) {
        console.log('🔄 HMR update detected, preserving socket connection')
        console.log('   Socket ID:', socket.id)
        console.log('   Connection ID:', connectionIdRef.current)
        // Don't disconnect during HMR - preserve the socket
        // Remove event listeners to prevent duplicates, but keep socket alive
        socket.off('connect', handleConnect)
        socket.off('connect_error', handleConnectError)
        socket.off('disconnect', handleDisconnect)
        socket.off('reconnect', handleReconnect)
        socket.off('reconnect_attempt', handleReconnectAttempt)
        socket.off('reconnect_error', handleReconnectError)
        socket.off('reconnect_failed', handleReconnectFailed)
        // Remove attendance-related listeners to prevent duplicates during HMR
        socket.off('attendance:error')
        socket.off('attendance:update')
        socket.off('meeting:status')
        socket.off('extension:connected')
        socket.off('extension:disconnected')
        socket.off('extension:heartbeat')
        // Keep socketRef.current set so it can be reused
        // Preserve connection state in localStorage
        if (socket.connected) {
          localStorage.setItem(CONNECTION_STATE_KEY, 'connected')
        }
        return
      }

      // True unmount - disconnect socket
      console.log('🧹 Cleaning up socket connection (component unmounting)')
      isUnmountingRef.current = true

      if (socket) {
        // Remove all listeners
        socket.removeAllListeners()

        // Disconnect if connected
        if (socket.connected || socket.active) {
          socket.disconnect()
        }
      }

      socketRef.current = null
      connectionIdRef.current = null
      localStorage.removeItem(CONNECTION_STATE_KEY)
      localStorage.removeItem(CONNECTION_ID_KEY)
    }
  }, [
    mergeRowWithExisting,
    getOrCreateSocket,
    joinSocketRooms,
    allowedIdsLoaded,
    isConnected,
    processQueuedUpdates,
    roomsJoined.length,
    meetingStatus,
    setStableMeetingStatus,
    handleHostAbsenceWithGrace,
    handleHostPresence
  ])

  const handleNavigation = path => {
    if (path === '/logout') {
      logout(navigate)
    } else {
      navigate(path)
    }
  }

  // Manual reconnection handler
  const handleManualReconnect = useCallback(() => {
    console.log('🔄 Manual reconnection requested')
    setIsReconnecting(true)
    setReconnectAttempts(0)
    reconnectAttemptsRef.current = 0

    if (socketRef.current) {
      const socket = socketRef.current

      // If socket exists but not connected, try to reconnect
      if (!socket.connected) {
        console.log('🔄 Attempting to reconnect existing socket...')
        socket.connect()
      } else {
        // If already connected, just update state
        console.log('✅ Socket already connected')
        setIsConnected(true)
        setIsReconnecting(false)
        localStorage.setItem(CONNECTION_STATE_KEY, 'connected')
      }
    } else {
      // No socket exists, create new one
      console.log('🔄 Creating new socket connection...')
      const socketUrl = getSocketIOUrl()
      const newSocket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        timeout: 60000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 10,
        randomizationFactor: 0.5,
        forceNew: false,
        withCredentials: true,
        autoConnect: true,
        pingTimeout: 60000,
        pingInterval: 25000
      })
      socketRef.current = newSocket
      connectionIdRef.current = `conn_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`
      localStorage.setItem(CONNECTION_ID_KEY, connectionIdRef.current)
      newSocket.connect()
    }
  }, [])

  // Check if extension is actively updating (session is active)
  const isSessionActive = () => {
    const timeSinceLastData = Date.now() - lastDataTimestampRef.current
    const isActive =
      extensionConnected &&
      (meetingStatus === MEETING_STATUS.DATA_RECEIVED ||
        meetingStatus === MEETING_STATUS.SCRAPING ||
        meetingStatus === MEETING_STATUS.ACTIVE) &&
      timeSinceLastData < 30000 // Active if data received in last 30 seconds
    return isActive
  }

  // Request clear display - shows warning if session is active
  const requestClearDisplay = () => {
    if (isSessionActive() && allRows.length > 0) {
      // Show warning popup
      setShowClearWarning(true)
      console.log(
        '⚠️ Clear display requested during active session - showing warning'
      )
    } else {
      // No active session, clear directly
      handleClearDisplay()
    }
  }

  // Actually perform the clear display
  const handleClearDisplay = async (saveToHistory = true) => {
    console.log('🧹 Clearing all display data...')

    // ATTENDANCE HISTORY: Save current session to history before clearing
    if (saveToHistory && allRows.length > 0 && currentMeetCodeRef.current) {
      console.log('📝 Saving current session to history before clearing...')
      saveCurrentSessionToHistory()
    }

    // LIVE MONITORING FIX: Delete session from database as well
    // This ensures Clear Display also removes any accidentally saved database records
    const meetCodeToDelete = currentMeetCodeRef.current
    if (meetCodeToDelete) {
      try {
        console.log(
          `🗑️ Deleting session from database for meetCode: ${meetCodeToDelete}`
        )
        const response = await apiDelete(
          `attendance/clear-session/${encodeURIComponent(meetCodeToDelete)}`
        )
        if (response.success) {
          console.log(
            `✅ Deleted ${response.deletedSessions || 0} session(s) and ${
              response.deletedAttendance || 0
            } attendance record(s) from database`
          )
        } else {
          console.log(
            `ℹ️ No database records to delete for ${meetCodeToDelete}`
          )
        }
      } catch (error) {
        console.warn(
          '⚠️ Could not delete session from database:',
          error.message
        )
        // Continue with local clear even if database delete fails
      }
    }

    // Clear display rows
    updateLiveRows([], { allowEmpty: true })
    updateHistoricalRows([], { allowEmpty: true })
    clearStoredRows(STORAGE_KEYS.live)
    clearStoredRows(STORAGE_KEYS.historical)
    clearStoredRows(STORAGE_KEYS.all)
    setAllRows([])

    // Reset meeting status to idle
    setMeetingStatus(MEETING_STATUS.IDLE)

    // Clear the DurationTracker to stop duration counting
    const tracker = getDurationTracker()
    tracker.clear()

    // Clear extension bridge cache so it will accept new data
    lastExtensionBridgeDataRef.current = null
    _extensionBridgeActive.current = false

    // Clear sticky host ref - allow new host detection for next meeting
    stickyHostRef.current = null
    console.log('🔓 Cleared sticky host lock')

    // Clear real-time sync storage
    clearRealtimeStorage()

    // Reset current meet code tracking
    currentMeetCodeRef.current = null
    sessionStartTimeRef.current = null
    setCurrentMeetCode(null)

    // Reset other status indicators
    setExtensionConnected(false)
    setLastExtensionHeartbeat(null)
    setHasUnauthenticatedUpdates(false)
    setDebugRealtimeInfo(null)

    // FIX: Notify backend to clear cache for this instructor's meetings
    // This prevents stale data from re-populating the display
    if (socketRef.current && socketRef.current.connected) {
      console.log('📡 Notifying backend to clear meeting cache...')
      socketRef.current.emit('instructor:clear-cache', {
        subjectIds: allowedSubjectIdsRef.current,
        groupIds: allowedGroupIdsRef.current,
        timestamp: new Date().toISOString()
      })
    }

    // FIX: Send message to extension to pause tracking (via postMessage bridge)
    // This prevents extension from re-populating the display
    try {
      window.postMessage(
        {
          type: 'NEATTEND_CLEAR_DISPLAY',
          source: 'dashboard',
          timestamp: new Date().toISOString()
        },
        window.location.origin
      )
      console.log('📡 Sent clear display signal to extension bridge')
    } catch (e) {
      console.warn('Could not send clear signal to extension:', e)
    }

    // Close the warning modal if open
    setShowClearWarning(false)

    setLastUpdated(new Date())
    console.log('✅ Display cleared successfully')
  }

  // Handle warning modal actions
  const handleClearWarningConfirm = () => {
    console.log('✅ User confirmed clear display during active session')
    handleClearDisplay(true) // Save to history and clear
  }

  const handleClearWarningCancel = () => {
    console.log('❌ User cancelled clear display')
    setShowClearWarning(false)
  }

  const handleClearWithoutSave = () => {
    console.log('⚠️ User chose to clear without saving to history')
    handleClearDisplay(false) // Clear without saving
  }

  const scheduleCardStyle = {
    background: neutral.bgMuted,
    borderRadius: 12,
    padding: 20,
    border: `1px solid ${neutral.border}`
  }

  const scheduleCardLabel = {
    fontSize: 13,
    fontWeight: 600,
    color: neutral.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4
  }

  const scheduleCardValue = {
    fontSize: 32,
    fontWeight: 800,
    color: brand.primary,
    marginTop: 6
  }

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        background: neutral.bgPage,
        fontFamily: 'Segoe UI, sans-serif'
      }}
    >
      <style>
        {`
          @keyframes pulse {
            0% { 
              transform: scale(1); 
              opacity: 1;
            }
            50% { 
              transform: scale(1.05); 
              opacity: 0.8;
            }
            100% { 
              transform: scale(1); 
              opacity: 1;
            }
          }
          .status-filter-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          }
          .table-row:hover {
            background: ${statusColors.host.bg} !important;
            transform: scale(1.005);
            box-shadow: 0 2px 8px rgba(35, 34, 92, 0.1);
          }
        `}
      </style>
      {/* Sidebar */}
      <aside
        style={{
          width: 290,
          background: brand.primary,
          color: neutral.bgSurface,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '40px 0',
          boxShadow: '2px 0 16px rgba(44,44,84,0.08)',
          height: '100vh'
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: 60
          }}
        >
          <img
            src={logo}
            alt='Logo'
            style={{
              width: 300,
              height: 200,
              objectFit: 'contain',
              borderRadius: 18,
              boxShadow: '0 2px 8px rgba(0,0,0,0.10)'
            }}
          />
        </div>
        <nav style={{ width: '100%' }}>
          {navItems.map((item, idx) => (
            <SidebarItem
              key={item.label}
              icon={item.icon}
              label={item.label}
              path={item.path}
              isActive={location.pathname === item.path}
              isLast={idx === navItems.length - 1}
              onClick={() => handleNavigation(item.path)}
            />
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, padding: '48px 60px', overflowY: 'auto' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24
          }}
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap'
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontWeight: 800,
                  fontSize: 36,
                  color: brand.secondary
                }}
              >
                REAL-TIME STATUS
              </h2>

              {/* PHASE 1 FIX: Unauthenticated Updates Warning Banner */}
              {hasUnauthenticatedUpdates && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: statusColors.late.bg,
                    border: `2px solid ${statusColors.late.border}`,
                    fontSize: 13,
                    fontWeight: 600,
                    color: statusColors.late.text,
                    marginLeft: 12
                  }}
                >
                  <i
                    className='bi bi-exclamation-triangle-fill'
                    style={{ fontSize: 16 }}
                  ></i>
                  <span>
                    Unauthenticated updates detected - Join through dashboard
                    for authenticated tracking
                  </span>
                  <button
                    onClick={() => {
                      setHasUnauthenticatedUpdates(false)
                      // PHASE 4 FIX: Navigate to subjects page to generate credentials
                      navigate('/instructor-subjects')
                    }}
                    style={{
                      marginLeft: 8,
                      padding: '4px 12px',
                      background: statusColors.late.border,
                      border: 'none',
                      borderRadius: 4,
                      color: statusColors.late.text,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600
                    }}
                    title='Go to Subjects page to generate credentials'
                  >
                    Generate Credentials
                  </button>
                  <button
                    onClick={() => setHasUnauthenticatedUpdates(false)}
                    style={{
                      marginLeft: 4,
                      background: 'transparent',
                      border: 'none',
                      color: statusColors.late.text,
                      cursor: 'pointer',
                      fontSize: 16,
                      padding: '0 4px'
                    }}
                    title='Dismiss warning'
                  >
                    ×
                  </button>
                </div>
              )}

              {/* PHASE 4 FIX: Credential Status Indicator */}
              {!hasUnauthenticatedUpdates && isConnected && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 8,
                    background: statusColors.present.bg,
                    border: `2px solid ${statusColors.present.border}`,
                    fontSize: 12,
                    fontWeight: 600,
                    color: statusColors.present.text,
                    marginLeft: 12
                  }}
                >
                  <i
                    className='bi bi-check-circle-fill'
                    style={{ fontSize: 14 }}
                  ></i>
                  <span>Authenticated tracking active</span>
                </div>
              )}

              {/* Last Session Summary - Phase 2: CSS classes */}
              {sessionSummary && (
                <div
                  className='session-summary'
                  title={
                    sessionSummary.endedAt
                      ? `Session ended at ${new Date(
                          sessionSummary.endedAt
                        ).toLocaleTimeString()}`
                      : 'Session summary'
                  }
                >
                  <i className='bi bi-clipboard-check session-summary__icon' />
                  <span className='session-summary__label'>Last session:</span>
                  <span>
                    {sessionSummary.meetCode || 'Unknown meet'} ·{' '}
                    {sessionSummary.totalParticipants ?? '0'} participant
                    {sessionSummary.totalParticipants === 1 ? '' : 's'} ·{' '}
                    {sessionSummary.durationMinutes ?? '0'} min
                  </span>
                </div>
              )}

              {/* Socket.IO Connection Status - Phase 2: CSS classes */}
              <div className='status-row'>
                <div
                  className={`status-badge ${
                    isConnected
                      ? 'status-badge--connected'
                      : isReconnecting
                      ? 'status-badge--reconnecting'
                      : 'status-badge--disconnected'
                  }`}
                >
                  <div
                    className={`status-dot ${
                      isConnected
                        ? 'status-dot--connected'
                        : isReconnecting
                        ? 'status-dot--reconnecting'
                        : 'status-dot--disconnected'
                    }`}
                  />
                  {isConnected
                    ? 'Socket.IO Connected'
                    : isReconnecting
                    ? `Reconnecting... (${reconnectAttempts})`
                    : 'Socket.IO Offline'}
                </div>
                {!isConnected && !isReconnecting && (
                  <button
                    onClick={handleManualReconnect}
                    className='btn-reconnect'
                  >
                    🔄 Reconnect
                  </button>
                )}
              </div>

              {apiError && (
                <StatusBanner
                  variant='error'
                  title='Data load issue'
                  message={apiError}
                  onClose={() => setApiError(null)}
                />
              )}

              {/* Socket.IO Error Message */}
              {socketError && (
                <StatusBanner
                  variant='warning'
                  title='Connection Error'
                  message={`${socketError.message} Meeting status updates may not work until connection is restored.`}
                />
              )}

              {/* Extension Connection Status - Phase 2: CSS classes */}
              <div
                className={`status-badge ${
                  extensionConnected
                    ? 'status-badge--active'
                    : 'status-badge--idle'
                }`}
              >
                <div
                  className={`status-dot ${
                    extensionConnected
                      ? 'status-dot--active'
                      : 'status-dot--idle'
                  }`}
                  style={
                    extensionConnected ? { animation: 'pulse 2s infinite' } : {}
                  }
                />
                {extensionConnected
                  ? 'Extension Connected'
                  : 'Extension Disconnected'}
              </div>

              {/* Meeting Status - Phase 2: CSS classes */}
              <div
                className={`status-badge ${
                  meetingStatus === MEETING_STATUS.DATA_RECEIVED
                    ? 'status-badge--data-received'
                    : meetingStatus === MEETING_STATUS.SCRAPING
                    ? 'status-badge--scraping'
                    : meetingStatus === MEETING_STATUS.ACTIVE
                    ? 'status-badge--active'
                    : meetingStatus === MEETING_STATUS.PAUSED
                    ? 'status-badge--paused'
                    : 'status-badge--idle'
                }`}
                style={{ textTransform: 'capitalize' }}
              >
                <div
                  className={`status-dot ${
                    meetingStatus === MEETING_STATUS.DATA_RECEIVED
                      ? 'status-dot--connected'
                      : meetingStatus === MEETING_STATUS.SCRAPING
                      ? 'status-dot--scraping'
                      : meetingStatus === MEETING_STATUS.ACTIVE
                      ? 'status-dot--active'
                      : meetingStatus === MEETING_STATUS.PAUSED
                      ? 'status-dot--paused'
                      : 'status-dot--idle'
                  }`}
                />
                Meeting:{' '}
                {meetingStatus === MEETING_STATUS.DATA_RECEIVED
                  ? 'Data Received'
                  : meetingStatus === MEETING_STATUS.SCRAPING
                  ? 'Scraping...'
                  : meetingStatus === MEETING_STATUS.ACTIVE
                  ? 'Active'
                  : meetingStatus === MEETING_STATUS.PAUSED
                  ? '⏸️ Instructor Left'
                  : 'Idle'}
              </div>
            </div>
            {/* Last Updated Info - Phase 2: CSS classes */}
            <div className='last-updated-info'>
              Last updated: {lastUpdated.toLocaleTimeString()}
              {lastExtensionHeartbeat && extensionConnected && (
                <span className='last-updated-info__extension'>
                  • Extension heartbeat:{' '}
                  {lastExtensionHeartbeat.toLocaleTimeString()}
                </span>
              )}
              {lastUpdateReceived && (
                <span className='last-updated-info__update'>
                  • Last update received:{' '}
                  {lastUpdateReceived.toLocaleTimeString()}
                </span>
              )}
            </div>
            {debugRealtimeInfo && (
              <div className='debug-info'>
                Debug: status={debugRealtimeInfo.meetingStatus || 'n/a'} ·
                meetCode={debugRealtimeInfo.meetCode || 'n/a'} · subjectId=
                {debugRealtimeInfo.subjectId || 'n/a'} · source=
                {debugRealtimeInfo.source || 'n/a'}
              </div>
            )}
          </div>

          {/* PHASE 1.1: Floating Diagnostic Panel */}
          <DiagnosticPanel
            socketRef={socketRef}
            roomsJoined={roomsJoined}
            roomStatusFromBackend={roomStatusFromBackend}
            allowedIdsLoaded={allowedIdsLoaded}
            allowedSubjectIds={allowedSubjectIds}
            allowedGroupIds={allowedGroupIds}
            extensionConnected={extensionConnected}
            extensionActivityFromBackend={extensionActivityFromBackend}
            lastUpdateReceived={lastUpdateReceived}
            meetingStatus={meetingStatus}
            meetingDebugInfo={meetingDebugInfo}
            realtimeSource={realtimeSource}
            updateQueueRef={updateQueueRef}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              position: 'relative'
            }}
          >
            <div style={{ position: 'relative' }}>
              <i
                className='bi bi-bell-fill'
                style={{
                  fontSize: 22,
                  color: brand.secondary,
                  cursor: 'pointer'
                }}
                onClick={() => setShowNotifications(!showNotifications)}
              />
              {showNotifications && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '130%',
                    background: neutral.bgSurface,
                    border: `1px solid ${neutral.borderLight}`,
                    borderRadius: 10,
                    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                    zIndex: 100,
                    minWidth: 250
                  }}
                >
                  {notificationItems.map((note, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 16px',
                        fontSize: 14,
                        color: brand.secondary,
                        borderBottom: `1px solid ${neutral.borderLight}`
                      }}
                    >
                      {note}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <UserMenu
              user={(() => {
                try {
                  const raw = localStorage.getItem('user')
                  return raw ? JSON.parse(raw) : null
                } catch {
                  return null
                }
              })()}
              onProfileClick={() => navigate('/I_Profile')}
              onSettingsClick={() => alert('Settings')}
            />
          </div>
        </div>

        {/* Risk Overview */}
        <div
          style={{
            background: neutral.bgSurface,
            borderRadius: 16,
            padding: 28,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            border: `1px solid ${neutral.borderLight}`,
            marginBottom: 32
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: 16
            }}
          >
            <div style={{ flex: 1, minWidth: 260 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 800,
                  color: brand.secondary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <i className='bi bi-activity'></i>
                Risk &amp; Intervention Signals
              </h3>
              <p
                style={{
                  margin: '6px 0 0',
                  color: neutral.textSecondary,
                  fontSize: 13
                }}
              >
                {activeSubject?.name
                  ? `Subject: ${activeSubject.name}`
                  : 'Select a subject to view risk insights'}
              </p>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                minWidth: 220
              }}
            >
              <label
                htmlFor='risk-subject-select'
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: neutral.textSecondary,
                  textTransform: 'uppercase'
                }}
              >
                Subject selector
              </label>
              <select
                id='risk-subject-select'
                value={selectedSubjectId || 'all'}
                onChange={handleSubjectChange}
                disabled={!subjectOptions.length && !allowedSubjectIds.length}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: `1px solid ${neutral.borderLight}`,
                  fontWeight: 600,
                  color: brand.secondary,
                  background: neutral.bgMuted,
                  minWidth: 200
                }}
              >
                <option value='all'>Auto-detect active subject</option>
                {subjectOptions.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              {riskLoading ? (
                <span
                  style={{
                    fontSize: 12,
                    color: neutral.textSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <i className='bi bi-arrow-repeat spin'></i> Fetching risk
                  summary…
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    color: neutral.textSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <i className='bi bi-info-circle'></i>
                  {activeSubject?.id
                    ? 'Showing latest verified attendance risk'
                    : 'Waiting for subject selection'}
                </span>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 20
            }}
          >
            {['high', 'medium', 'low'].map(level => {
              const palette = riskColorMap[level] || riskColorMap.default
              const label =
                level === 'high'
                  ? 'High Risk'
                  : level === 'medium'
                  ? 'Medium Risk'
                  : 'Low Risk'
              return (
                <div
                  key={level}
                  style={{
                    flex: '1 1 180px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 16px',
                    borderRadius: 12,
                    background: palette.bg,
                    color: palette.text,
                    border: `1px solid ${palette.border}`,
                    fontWeight: 700,
                    minWidth: 160
                  }}
                >
                  <span>{label}</span>
                  <span style={{ fontSize: 24 }}>{riskCounts[level] || 0}</span>
                </div>
              )
            })}
          </div>

          {!riskLoading && !riskError && riskCounts.high > 0 && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                borderRadius: 12,
                background: riskColorMap.high.bg,
                border: `1px solid ${riskColorMap.high.border}`,
                color: riskColorMap.high.text,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}
            >
              <i className='bi bi-exclamation-triangle-fill'></i>
              {riskCounts.high} student
              {riskCounts.high === 1 ? ' is' : 's are'} in high-risk status.
              Consider immediate outreach.
            </div>
          )}

          {riskLoading && (
            <div style={{ marginTop: 16, color: neutral.textSecondary }}>
              <i className='bi bi-hourglass-split'></i> Loading subject risk
              summary…
            </div>
          )}

          {!riskLoading && riskError && (
            <div
              style={{
                marginTop: 16,
                color: riskColorMap.high.border,
                fontWeight: 600
              }}
            >
              <i className='bi bi-exclamation-triangle'></i> {riskError}
            </div>
          )}

          {!riskLoading && !riskError && topRiskEntries.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4
                style={{
                  fontSize: 13,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: neutral.textSecondary,
                  marginBottom: 10
                }}
              >
                Highest Risk Students
              </h4>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                {topRiskEntries.map(entry => {
                  const palette =
                    riskColorMap[entry?.risk?.band] || riskColorMap.default
                  const fullName = [entry.user?.firstName, entry.user?.lastName]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <div
                      key={entry.userId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderRadius: 12,
                        padding: '10px 14px',
                        border: `1px solid ${palette.border}`,
                        background: palette.bg,
                        color: palette.text
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {fullName ||
                            entry.user?.studentId ||
                            'Unknown Student'}
                        </div>
                        <div
                          style={{ fontSize: 12, color: neutral.textSecondary }}
                        >
                          {entry.user?.studentId || '—'} · Absent:{' '}
                          {entry.stats?.absentCount || 0} · Late:{' '}
                          {entry.stats?.lateCount || 0} · Tardy:{' '}
                          {entry.stats?.tardinessCount || 0}
                        </div>
                      </div>
                      {renderRiskBadge(entry)}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!riskLoading && !riskError && topRiskEntries.length === 0 && (
            <div style={{ marginTop: 16, color: neutral.textSecondary }}>
              No verified participants found for this subject yet.
            </div>
          )}
        </div>

        {/* Statistics Summary */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 20,
            marginBottom: 30
          }}
        >
          <div
            style={{
              background: neutral.bgSurface,
              padding: 24,
              borderRadius: 12,
              boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
              border: `2px solid ${neutral.borderLight}`,
              textAlign: 'center'
            }}
          >
            <div
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: brand.secondary,
                marginBottom: 8
              }}
            >
              {statistics.total}
            </div>
            <div
              style={{
                fontSize: 14,
                color: neutral.textSecondary,
                fontWeight: 600
              }}
            >
              Total Participants
            </div>
          </div>
          <div
            style={{
              background: statusColors.present.bg,
              padding: 24,
              borderRadius: 12,
              boxShadow: '0 2px 12px rgba(40, 167, 69, 0.2)',
              border: `2px solid ${statusColors.present.border}`,
              textAlign: 'center'
            }}
          >
            <div
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: statusColors.present.border,
                marginBottom: 8
              }}
            >
              {statistics.present}
            </div>
            <div
              style={{
                fontSize: 14,
                color: statusColors.present.text,
                fontWeight: 600
              }}
            >
              Present
            </div>
          </div>
          <div
            style={{
              background: statusColors.late.bg,
              padding: 24,
              borderRadius: 12,
              boxShadow: '0 2px 12px rgba(255, 183, 0, 0.2)',
              border: `2px solid ${statusColors.late.border}`,
              textAlign: 'center'
            }}
          >
            <div
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: statusColors.late.text,
                marginBottom: 8
              }}
            >
              {statistics.late}
            </div>
            <div
              style={{
                fontSize: 14,
                color: statusColors.late.text,
                fontWeight: 600
              }}
            >
              Late
            </div>
          </div>
          <div
            style={{
              background: statusColors.absent.bg,
              padding: 24,
              borderRadius: 12,
              boxShadow: '0 2px 12px rgba(220, 53, 69, 0.2)',
              border: `2px solid ${statusColors.absent.border}`,
              textAlign: 'center'
            }}
          >
            <div
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: statusColors.absent.border,
                marginBottom: 8
              }}
            >
              {statistics.absent}
            </div>
            <div
              style={{
                fontSize: 14,
                color: statusColors.absent.text,
                fontWeight: 600
              }}
            >
              Absent
            </div>
          </div>
        </div>

        {/* Schedule Summary */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
            marginBottom: 20
          }}
        >
          <div style={scheduleCardStyle}>
            <div style={scheduleCardLabel}>Upcoming Sessions</div>
            <div style={scheduleCardValue}>{scheduleStats.totalSessions}</div>
          </div>
          <div style={scheduleCardStyle}>
            <div style={scheduleCardLabel}>Tokens Issued</div>
            <div style={scheduleCardValue}>{scheduleStats.tokensIssued}</div>
          </div>
          <div style={scheduleCardStyle}>
            <div style={scheduleCardLabel}>Tokens Consumed</div>
            <div style={scheduleCardValue}>{scheduleStats.tokensConsumed}</div>
          </div>
        </div>

        {/* Appeals Inbox Summary */}
        <div
          style={{
            background: neutral.bgSurface,
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            border: `1px solid ${neutral.borderLight}`,
            marginBottom: 30,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 16
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 800,
                color: brand.secondary
              }}
            >
              Appeals Inbox
            </h3>
            <p style={{ margin: '4px 0 0', color: neutral.textSecondary }}>
              Track pending attendance appeals across your subjects.
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center'
            }}
          >
            <div
              style={{
                minWidth: 120,
                textAlign: 'center',
                padding: '8px 12px',
                borderRadius: 12,
                background: neutral.bgMuted,
                border: `1px solid ${neutral.borderLight}`
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: brand.secondary
                }}
              >
                {_appealStats.pending}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: neutral.textSecondary,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6
                }}
              >
                Pending
              </div>
            </div>
            <div
              style={{
                minWidth: 120,
                textAlign: 'center',
                padding: '8px 12px',
                borderRadius: 12,
                background: neutral.bgMuted,
                border: `1px solid ${neutral.borderLight}`
              }}
            >
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: brand.secondary
                }}
              >
                {_appealStats.total}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: neutral.textSecondary,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6
                }}
              >
                Total
              </div>
            </div>
            <button
              onClick={() => navigate('/history')}
              style={{
                padding: '10px 18px',
                borderRadius: 999,
                border: 'none',
                background: brand.primary,
                color: neutral.bgSurface,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Open Appeals View
            </button>
          </div>
        </div>

        {/* Host Display Section - Uses design system colors for accessibility */}
        {/* FIXED LAYOUT: Always reserve space to prevent position jumping */}
        <div
          style={{
            background:
              hostRows.length > 0
                ? `linear-gradient(135deg, ${statusColors.host.bg} 0%, ${statusColors.late.bg} 100%)`
                : neutral.bgMuted,
            borderRadius: 16,
            boxShadow:
              hostRows.length > 0
                ? '0 4px 16px rgba(234, 179, 8, 0.25)'
                : 'none',
            padding: 24,
            marginBottom: 30,
            border: `3px solid ${
              hostRows.length > 0
                ? statusColors.host.border
                : neutral.borderLight
            }`,
            minHeight: 100,
            transition: 'background 0.3s ease, border-color 0.3s ease'
          }}
        >
          {hostRows.length > 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 24
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: 280,
                  flexShrink: 0
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: neutral.bgSurface,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 28,
                    fontWeight: 800,
                    color: statusColors.host.icon,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    flexShrink: 0
                  }}
                >
                  👑
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: statusColors.host.text,
                      marginBottom: 4,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    Meeting Host
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: brand.secondary,
                      wordBreak: 'break-word',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {hostRows[0].name || 'Unknown Host'}
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 20,
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  flexShrink: 0
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    width: 100,
                    flexShrink: 0
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: statusColors.host.text,
                      textTransform: 'uppercase'
                    }}
                  >
                    Status
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 14px',
                      borderRadius: 20,
                      background:
                        hostRows[0].isLive && !hostRows[0].isLeft
                          ? statusColors.present.bg
                          : statusColors.left.bg,
                      color:
                        hostRows[0].isLive && !hostRows[0].isLeft
                          ? statusColors.present.text
                          : statusColors.left.text,
                      border: `2px solid ${
                        hostRows[0].isLive && !hostRows[0].isLeft
                          ? statusColors.present.border
                          : statusColors.left.border
                      }`,
                      fontWeight: 700,
                      fontSize: 13,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background:
                          hostRows[0].isLive && !hostRows[0].isLeft
                            ? statusColors.present.border
                            : statusColors.left.border,
                        animation:
                          hostRows[0].isLive && !hostRows[0].isLeft
                            ? 'pulse 2s infinite'
                            : 'none',
                        flexShrink: 0
                      }}
                    ></div>
                    {hostRows[0].isLive && !hostRows[0].isLeft
                      ? 'Present'
                      : 'Left Meeting'}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    width: 80,
                    flexShrink: 0
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: statusColors.host.text,
                      textTransform: 'uppercase'
                    }}
                  >
                    Joined
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: brand.secondary,
                      whiteSpace: 'nowrap',
                      fontFamily: 'monospace'
                    }}
                  >
                    {hostRows[0].joinTimeDisplay ||
                      formatTimeDisplay(hostRows[0].joinTime, '—')}
                  </div>
                </div>
                {/* Left time - only shows when host has left */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    width: 80,
                    flexShrink: 0,
                    visibility:
                      hostRows[0].isLeft &&
                      (hostRows[0].leaveTimeDisplay || hostRows[0].leaveTime)
                        ? 'visible'
                        : 'hidden'
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: statusColors.late.text,
                      textTransform: 'uppercase'
                    }}
                  >
                    Left
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: brand.secondary,
                      whiteSpace: 'nowrap',
                      fontFamily: 'monospace'
                    }}
                  >
                    {hostRows[0].isLeft &&
                    (hostRows[0].leaveTimeDisplay || hostRows[0].leaveTime)
                      ? hostRows[0].leaveTimeDisplay ||
                        formatTimeDisplay(hostRows[0].leaveTime, '—')
                      : '—'}
                  </div>
                </div>
                {/* Duration - always visible with fixed width */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    width: 90,
                    flexShrink: 0
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: statusColors.late.text,
                      textTransform: 'uppercase'
                    }}
                  >
                    Duration
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: brand.secondary,
                      whiteSpace: 'nowrap',
                      fontFamily: 'monospace'
                    }}
                  >
                    {getLiveDuration(hostRows[0])}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* No host detected - show placeholder */
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 52,
                color: neutral.textMuted,
                fontSize: 14,
                fontStyle: 'italic'
              }}
            >
              <span style={{ marginRight: 8 }}>👑</span>
              Waiting for host to join...
            </div>
          )}
        </div>

        {/* PARTICIPANTS TABLE - Always visible like the Extension */}
        <div style={{ display: 'flex', gap: 40, marginBottom: 40 }}>
          {/* Table */}
          <div
            style={{
              flex: 2,
              background: neutral.bgSurface,
              borderRadius: 16,
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              padding: 36
            }}
          >
            {/* Participants Label - matches Extension design */}
            <div
              style={{
                background: neutral.bgMuted,
                padding: '12px 20px',
                marginBottom: 20,
                borderRadius: 8,
                borderBottom: `2px solid ${neutral.borderLight}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span style={{ fontSize: 18 }}>👥</span>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 14,
                  color: brand.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}
              >
                PARTICIPANTS
              </span>
              <span
                style={{
                  background: statusColors.present.bg,
                  color: statusColors.present.text,
                  padding: '4px 12px',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  marginLeft: 8,
                  border: `1px solid ${statusColors.present.border}`
                }}
              >
                {filteredRows.length}
              </span>
              {meetingStatus !== MEETING_STATUS.IDLE &&
                meetingStatus !== MEETING_STATUS.PAUSED &&
                !(hostRows.length > 0 && hostRows[0]?.isLeft) && (
                  <span
                    style={{
                      background: statusColors.present.bg,
                      color: statusColors.present.text,
                      padding: '4px 12px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      marginLeft: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      border: `1px solid ${statusColors.present.border}`
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: statusColors.present.border,
                        animation: 'pulse 2s infinite'
                      }}
                    />
                    LIVE
                  </span>
                )}
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 20
              }}
            >
              <h3
                style={{
                  fontWeight: 800,
                  fontSize: 22,
                  margin: 0,
                  color: brand.secondary
                }}
              >
                {meetingStatus === MEETING_STATUS.PAUSED ||
                (hostRows.length > 0 && hostRows[0]?.isLeft)
                  ? '📋 FINAL ATTENDANCE RECORD'
                  : '📋 REAL-TIME ATTENDANCE'}
                {hostRows.length > 0 && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: neutral.textSecondary,
                      marginLeft: 12,
                      fontStyle: 'italic'
                    }}
                  >
                    (Host displayed separately above)
                  </span>
                )}
              </h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => setStatusFilter('all')}
                  className='status-filter-btn'
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border:
                      statusFilter === 'all'
                        ? `2px solid ${brand.secondary}`
                        : `2px solid ${neutral.borderLight}`,
                    background:
                      statusFilter === 'all'
                        ? brand.secondary
                        : neutral.bgSurface,
                    color:
                      statusFilter === 'all'
                        ? neutral.bgSurface
                        : brand.secondary,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  All ({statistics.total})
                </button>
                <button
                  onClick={() => setStatusFilter('present')}
                  className='status-filter-btn'
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border:
                      statusFilter === 'present'
                        ? `2px solid ${statusColors.present.border}`
                        : `2px solid ${neutral.borderLight}`,
                    background:
                      statusFilter === 'present'
                        ? statusColors.present.border
                        : neutral.bgSurface,
                    color:
                      statusFilter === 'present'
                        ? neutral.bgSurface
                        : statusColors.present.border,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Present ({statistics.present})
                </button>
                <button
                  onClick={() => setStatusFilter('late')}
                  className='status-filter-btn'
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border:
                      statusFilter === 'late'
                        ? `2px solid ${statusColors.late.border}`
                        : `2px solid ${neutral.borderLight}`,
                    background:
                      statusFilter === 'late'
                        ? statusColors.late.border
                        : neutral.bgSurface,
                    color:
                      statusFilter === 'late'
                        ? neutral.bgSurface
                        : statusColors.late.text,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Late ({statistics.late})
                </button>
                <button
                  onClick={() => setStatusFilter('absent')}
                  className='status-filter-btn'
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border:
                      statusFilter === 'absent'
                        ? `2px solid ${statusColors.absent.border}`
                        : `2px solid ${neutral.borderLight}`,
                    background:
                      statusFilter === 'absent'
                        ? statusColors.absent.border
                        : neutral.bgSurface,
                    color:
                      statusFilter === 'absent'
                        ? neutral.bgSurface
                        : statusColors.absent.border,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Absent ({statistics.absent})
                </button>
                <button
                  onClick={requestClearDisplay}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    border: `2px solid ${interactive.danger}`,
                    background: interactive.danger,
                    color: neutral.bgSurface,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Clear Display
                </button>
                <button
                  onClick={() => setShowHistoryPanel(!showHistoryPanel)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    border: showHistoryPanel
                      ? `2px solid ${brand.accent}`
                      : `2px solid ${neutral.textMuted}`,
                    background: showHistoryPanel
                      ? brand.accent
                      : neutral.textMuted,
                    color: neutral.bgSurface,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  📜 History ({attendanceHistory.length})
                </button>
                {/* Phase 2 Task 3: Filter toggle for unauthenticated updates */}
                {hasUnauthenticatedUpdates && (
                  <button
                    onClick={() =>
                      setShowUnauthenticatedUpdates(!showUnauthenticatedUpdates)
                    }
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: showUnauthenticatedUpdates
                        ? `2px solid ${statusColors.late.border}`
                        : `2px solid ${neutral.borderLight}`,
                      background: showUnauthenticatedUpdates
                        ? statusColors.late.bg
                        : neutral.bgSurface,
                      color: showUnauthenticatedUpdates
                        ? statusColors.late.text
                        : neutral.textSecondary,
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                    title={
                      showUnauthenticatedUpdates
                        ? 'Hide unauthenticated updates'
                        : 'Show unauthenticated updates'
                    }
                  >
                    <i
                      className={`bi bi-${
                        showUnauthenticatedUpdates
                          ? 'eye-fill'
                          : 'eye-slash-fill'
                      }`}
                    ></i>
                    {showUnauthenticatedUpdates ? 'Show' : 'Hide'}{' '}
                    Unauthenticated
                  </button>
                )}
              </div>
            </div>
            {(() => {
              const sections = [
                {
                  key: 'verified',
                  title: 'Verified Students',
                  accent: statusColors.present,
                  rows: filteredRows.filter(
                    row => getParticipantCategoryLabel(row) === 'Verified'
                  ),
                  emptyText: 'No verified students yet'
                },
                {
                  key: 'guest',
                  title: 'Guest Participants',
                  accent: statusColors.absent,
                  rows: filteredRows.filter(
                    row => getParticipantCategoryLabel(row) === 'Guest'
                  ),
                  emptyText: 'No guest participants'
                }
              ]

              return sections.map(section => (
                <div key={section.key} style={{ marginBottom: 32 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      marginBottom: 16,
                      borderBottom: `2px solid ${section.accent.border}`,
                      paddingBottom: 8
                    }}
                  >
                    <div
                      style={{
                        background: section.accent.bg,
                        border: `1px solid ${section.accent.border}`,
                        color: section.accent.text,
                        padding: '6px 14px',
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <i className='bi bi-people-fill' /> {section.title}
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: section.accent.border,
                        background: neutral.bgMuted,
                        borderRadius: 12,
                        padding: '4px 10px'
                      }}
                    >
                      {section.rows.length} participant
                      {section.rows.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      tableLayout: 'fixed',
                      fontSize: 14
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: neutral.bgMuted,
                          textAlign: 'left',
                          borderBottom: `2px solid ${neutral.borderLight}`
                        }}
                      >
                        <th style={{ ...thStyle, ...columnWidths.group }}>
                          GROUP
                        </th>
                        <th style={{ ...thStyle, ...columnWidths.date }}>
                          DATE
                        </th>
                        <th
                          style={{ ...thStyle, ...columnWidths.participantId }}
                        >
                          PARTICIPANT ID
                        </th>
                        <th
                          style={{
                            ...thStyle,
                            ...columnWidths.participantName
                          }}
                        >
                          PARTICIPANT NAME
                        </th>
                        <th style={{ ...thStyle, ...columnWidths.timeIn }}>
                          TIME IN
                        </th>
                        <th style={{ ...thStyle, ...columnWidths.timeOut }}>
                          TIME OUT
                        </th>
                        <th style={{ ...thStyle, ...columnWidths.duration }}>
                          DURATION
                        </th>
                        <th style={{ ...thStyle, ...columnWidths.risk }}>
                          RISK
                        </th>
                        <th style={{ ...thStyle, ...columnWidths.log }}>LOG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={9}
                            style={{ padding: 24, textAlign: 'center' }}
                          >
                            <span style={{ color: neutral.textMuted }}>
                              {section.emptyText}
                            </span>
                          </td>
                        </tr>
                      ) : (
                        section.rows.map((row, idx) => (
                          <tr
                            key={`${section.key}-${idx}`}
                            className='table-row'
                            style={{
                              background: row.isLive
                                ? row.isNew
                                  ? statusColors.late.bg
                                  : row.isLeft
                                  ? statusColors.absent.bg
                                  : statusColors.present.bg
                                : idx % 2 === 0
                                ? neutral.bgMuted
                                : neutral.bgSurface,
                              borderLeft: row.isLive
                                ? row.isNew
                                  ? `4px solid ${statusColors.late.border}`
                                  : row.isLeft
                                  ? `4px solid ${statusColors.absent.border}`
                                  : `4px solid ${statusColors.present.border}`
                                : 'none',
                              animation: row.isNew
                                ? 'pulse 2s ease-in-out'
                                : 'none',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <td style={{ ...tdStyle, ...columnWidths.group }}>
                              {row.isLive
                                ? row.isNew
                                  ? '🟡 JOINING'
                                  : row.isLeft
                                  ? '🔴 LEFT'
                                  : '🔴 LIVE'
                                : row.group || row.meetCode || 'Session'}
                            </td>
                            <td style={{ ...tdStyle, ...columnWidths.date }}>
                              {row.dateDisplay ||
                                new Date().toISOString().split('T')[0]}
                            </td>
                            <td
                              style={{
                                ...tdStyle,
                                ...columnWidths.participantId
                              }}
                            >
                              {row.studentId ||
                                row.participantId ||
                                generateStudentId(row.name)}
                            </td>
                            <td
                              style={{
                                ...tdStyle,
                                ...columnWidths.participantName
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8
                                }}
                              >
                                <span>
                                  {row.isLive
                                    ? row.isNew
                                      ? `🆕 ${row.name}`
                                      : row.isLeft
                                      ? `👋 ${row.name}`
                                      : `👤 ${row.name}`
                                    : row.name}
                                </span>
                                {(() => {
                                  const category =
                                    getParticipantCategoryLabel(row)
                                  if (category === 'Guest') {
                                    return (
                                      <span
                                        style={{
                                          background: statusColors.absent.bg,
                                          padding: '2px 6px',
                                          borderRadius: 4,
                                          fontSize: 10,
                                          fontWeight: 600,
                                          color: statusColors.absent.text,
                                          border: `1px solid ${statusColors.absent.border}`,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 3,
                                          whiteSpace: 'nowrap'
                                        }}
                                        title='Guest/Uninvited participant - not verified'
                                      >
                                        <i
                                          className='bi bi-person-dash'
                                          style={{ fontSize: 10 }}
                                        ></i>
                                        Guest
                                      </span>
                                    )
                                  }
                                  return (
                                    <span
                                      style={{
                                        background: statusColors.present.bg,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        fontSize: 10,
                                        fontWeight: 600,
                                        color: statusColors.present.text,
                                        border: `1px solid ${statusColors.present.border}`,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 3,
                                        whiteSpace: 'nowrap'
                                      }}
                                      title='Verified/Invited participant'
                                    >
                                      <i
                                        className='bi bi-person-check'
                                        style={{ fontSize: 10 }}
                                      ></i>
                                      Verified
                                    </span>
                                  )
                                })()}
                                {row.isUnauthenticated && (
                                  <span
                                    style={{
                                      background: statusColors.late.bg,
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 600,
                                      color: statusColors.late.text,
                                      border: `1px solid ${statusColors.late.border}`,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      whiteSpace: 'nowrap'
                                    }}
                                    title='This update was sent without authentication. Join meeting through dashboard for authenticated tracking.'
                                  >
                                    <i
                                      className='bi bi-exclamation-triangle-fill'
                                      style={{ fontSize: 10 }}
                                    ></i>
                                    Unauthenticated
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ ...tdStyle, ...columnWidths.timeIn }}>
                              {row.joinTimeDisplay ||
                                formatTimeDisplay(row.joinTime, '—')}
                            </td>
                            <td
                              style={{
                                ...tdStyle,
                                ...columnWidths.timeOut,
                                fontFamily: 'monospace'
                              }}
                            >
                              {row.isLive
                                ? row.isLeft
                                  ? row.leaveTimeDisplay ||
                                    formatTimeDisplay(row.leaveTime, '—')
                                  : '—'
                                : row.leaveTimeDisplay ||
                                  formatTimeDisplay(row.leaveTime, '—')}
                            </td>
                            <td
                              style={{
                                ...tdStyle,
                                ...columnWidths.duration,
                                fontFamily: 'monospace'
                              }}
                            >
                              {getLiveDuration(row)}
                            </td>
                            <td style={{ ...tdStyle, ...columnWidths.risk }}>
                              {renderRiskBadge(getRiskEntryForRow(row))}
                            </td>
                            <td style={{ ...tdStyle, ...columnWidths.log }}>
                              {(() => {
                                let status,
                                  bgColor,
                                  textColor,
                                  icon,
                                  borderColor

                                if (
                                  row.log === 'Pending' ||
                                  row.rawStatus === 'pending'
                                ) {
                                  status = 'Pending'
                                  bgColor = statusColors.pending.bg
                                  textColor = statusColors.pending.text
                                  borderColor = statusColors.pending.border
                                  icon = 'bi-hourglass-split'
                                } else if (row.isLive) {
                                  if (row.isNew) {
                                    status = 'Just Joined'
                                    bgColor = statusColors.late.bg
                                    textColor = statusColors.late.text
                                    borderColor = statusColors.late.border
                                    icon = 'bi-door-open'
                                  } else if (row.isLeft) {
                                    status = 'Left Meeting'
                                    bgColor = statusColors.absent.bg
                                    textColor = statusColors.absent.text
                                    borderColor = statusColors.absent.border
                                    icon = 'bi-box-arrow-left'
                                  } else if (
                                    row.log === 'Late' ||
                                    row.rawStatus === 'late'
                                  ) {
                                    status = 'Late'
                                    bgColor = statusColors.late.bg
                                    textColor = statusColors.late.text
                                    borderColor = statusColors.late.border
                                    icon = 'bi-clock-fill'
                                  } else {
                                    status = 'Present'
                                    bgColor = statusColors.present.bg
                                    textColor = statusColors.present.text
                                    borderColor = statusColors.present.border
                                    icon = 'bi-check-circle-fill'
                                  }
                                } else if (row.log === 'Present') {
                                  status = 'Present'
                                  bgColor = statusColors.present.bg
                                  textColor = statusColors.present.text
                                  borderColor = statusColors.present.border
                                  icon = 'bi-check-circle-fill'
                                } else if (row.log === 'Late') {
                                  status = 'Late'
                                  bgColor = statusColors.late.bg
                                  textColor = statusColors.late.text
                                  borderColor = statusColors.late.border
                                  icon = 'bi-clock-fill'
                                } else if (row.log === 'Absent') {
                                  status = 'Absent'
                                  bgColor = statusColors.absent.bg
                                  textColor = statusColors.absent.text
                                  borderColor = statusColors.absent.border
                                  icon = 'bi-x-circle-fill'
                                } else {
                                  status = row.log
                                  bgColor = neutral.bgMuted
                                  textColor = neutral.text
                                  borderColor = neutral.textMuted
                                  icon = 'bi-info-circle'
                                }

                                return (
                                  <div
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                      padding: '6px 14px',
                                      borderRadius: 20,
                                      background: bgColor,
                                      color: textColor,
                                      border: `2px solid ${borderColor}`,
                                      fontWeight: 700,
                                      fontSize: 14
                                    }}
                                  >
                                    <i
                                      className={`bi ${icon}`}
                                      style={{ fontSize: 13 }}
                                    ></i>
                                    {status}
                                  </div>
                                )
                              })()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ))
            })()}
            {filteredRows.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  color: neutral.textMuted
                }}
              >
                <i
                  className='bi bi-inbox'
                  style={{ fontSize: 48, marginBottom: 12, display: 'block' }}
                ></i>
                <div style={{ fontSize: 16, fontWeight: 600 }}>
                  {statusFilter === 'all'
                    ? 'No attendance data yet'
                    : `No ${statusFilter} participants`}
                </div>
                <div style={{ fontSize: 14, marginTop: 8 }}>
                  {statusFilter !== 'all' && 'Try selecting a different filter'}
                </div>
              </div>
            )}
          </div>

          {/* Policy */}
          <div
            style={{
              flex: 1,
              background: neutral.bgSurface,
              borderRadius: 16,
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              padding: 36
            }}
          >
            <h3
              style={{
                fontWeight: 800,
                fontSize: 26,
                marginBottom: 20,
                color: brand.secondary
              }}
            >
              POLICY
            </h3>
            <ul
              style={{
                paddingLeft: 22,
                fontSize: 18,
                marginBottom: 20,
                color: brand.secondary
              }}
            >
              <li>{TARDINESS_TO_ABSENCE_RATIO} Lates = 1 Absent</li>
              <li>
                D/F Eligible if {DF_CONSECUTIVE_WEEKS_THRESHOLD}+ consecutive
                weeks of unexcused absences
              </li>
              <li>
                D/F Eligible if more than{' '}
                {Math.round(DF_CONTACT_HOURS_THRESHOLD_PERCENT * 100)}% of total
                contact hours are missed
              </li>
            </ul>
            <div
              style={{
                fontStyle: 'italic',
                color: neutral.text,
                fontSize: 16
              }}
            >
              Student must follow the rules. Participation will reflect their
              performance.
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}
        >
          <button
            onClick={fetchScheduleWindow}
            disabled={scheduleLoading}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: scheduleLoading ? neutral.border : brand.primary,
              color: neutral.bgSurface,
              border: 'none',
              fontWeight: 600,
              cursor: scheduleLoading ? 'default' : 'pointer'
            }}
          >
            {scheduleLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {scheduleError && (
          <StatusBanner
            variant='error'
            style={{
              marginTop: 16,
              padding: '12px 16px',
              borderRadius: 12,
              background: statusColors.absent.bg,
              border: `1px solid ${statusColors.absent.border}`,
              color: statusColors.absent.text,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}
          >
            <i className='bi bi-exclamation-triangle-fill'></i>
            {scheduleError}
          </StatusBanner>
        )}
      </main>

      {/* Clear Display Warning Modal */}
      {showClearWarning && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={handleClearWarningCancel}
        >
          <div
            style={{
              background: neutral.bgSurface,
              borderRadius: 16,
              padding: 32,
              maxWidth: 500,
              width: '90%',
              boxShadow: '0 10px 50px rgba(0,0,0,0.3)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
              <h2
                style={{
                  margin: 0,
                  color: statusColors.absent.border,
                  fontSize: 24
                }}
              >
                Active Session Detected
              </h2>
            </div>
            <p
              style={{
                fontSize: 16,
                color: neutral.textSecondary,
                textAlign: 'center',
                marginBottom: 24
              }}
            >
              The extension is currently tracking attendance data. Are you sure
              you want to clear the display?
            </p>
            <p
              style={{
                fontSize: 14,
                color: statusColors.present.border,
                textAlign: 'center',
                marginBottom: 8
              }}
            >
              📝 Current session with <strong>{allRows.length}</strong>{' '}
              participants will be saved to history.
            </p>
            <p
              style={{
                fontSize: 12,
                color: neutral.textMuted,
                textAlign: 'center',
                marginBottom: 24
              }}
            >
              Meeting: {currentMeetCodeRef.current || 'Unknown'}
            </p>
            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'center',
                flexWrap: 'wrap'
              }}
            >
              <button
                onClick={handleClearWarningConfirm}
                style={{
                  padding: '12px 24px',
                  background: statusColors.present.border,
                  color: neutral.bgSurface,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                ✅ Save & Clear
              </button>
              <button
                onClick={handleClearWithoutSave}
                style={{
                  padding: '12px 24px',
                  background: statusColors.absent.border,
                  color: neutral.textSecondary,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Clear Without Save
              </button>
              <button
                onClick={handleClearWarningCancel}
                style={{
                  padding: '12px 24px',
                  background: neutral.bgMuted,
                  color: neutral.textSecondary,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance History Panel */}
      {showHistoryPanel && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: 500,
            height: '100vh',
            background: neutral.bgSurface,
            boxShadow: '-5px 0 20px rgba(0,0,0,0.2)',
            zIndex: 9999,
            overflow: 'auto',
            padding: 24
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 24
            }}
          >
            <h2 style={{ margin: 0, color: brand.secondary }}>
              📜 Attendance History
            </h2>
            <button
              onClick={() => setShowHistoryPanel(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 28,
                cursor: 'pointer',
                color: neutral.textSecondary
              }}
            >
              ×
            </button>
          </div>

          {/* View Full History Button */}
          <div style={{ marginBottom: 16 }}>
            <button
              onClick={() => {
                setShowHistoryPanel(false)
                navigate('/history')
              }}
              style={{
                width: '100%',
                padding: '12px 20px',
                background: `linear-gradient(135deg, ${brand.secondary} 0%, ${brand.primary} 100%)`,
                color: neutral.bgSurface,
                border: 'none',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                boxShadow: '0 4px 12px rgba(32, 27, 81, 0.3)',
                transition: 'all 0.2s'
              }}
            >
              <i className='bi bi-clock-history'></i>
              View Full History Page
              <i className='bi bi-arrow-right'></i>
            </button>
            <p
              style={{
                fontSize: 11,
                color: neutral.textMuted,
                textAlign: 'center',
                marginTop: 6,
                marginBottom: 0
              }}
            >
              See all database records + sync local sessions
            </p>
          </div>

          {attendanceHistory.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 48,
                color: neutral.textMuted
              }}
            >
              <div style={{ fontSize: 64, marginBottom: 16 }}>📭</div>
              <p>No attendance history saved yet.</p>
              <p style={{ fontSize: 12 }}>
                Sessions will be automatically saved when you switch meetings or
                clear the display.
              </p>
            </div>
          ) : (
            <div>
              <div
                style={{
                  marginBottom: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: 14, color: neutral.textSecondary }}>
                  {attendanceHistory.length} local sessions
                </span>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        'Are you sure you want to clear ALL attendance history? This cannot be undone.'
                      )
                    ) {
                      clearAllAttendanceHistory()
                      setAttendanceHistory([])
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    background: statusColors.absent.border,
                    color: neutral.bgSurface,
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    cursor: 'pointer'
                  }}
                >
                  Clear All History
                </button>
              </div>

              {attendanceHistory.map((session, index) => (
                <div
                  key={session.id || index}
                  style={{
                    background:
                      selectedHistorySession?.id === session.id
                        ? statusColors.host.bg
                        : neutral.bgMuted,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    border:
                      selectedHistorySession?.id === session.id
                        ? `2px solid ${brand.primary}`
                        : `1px solid ${neutral.border}`,
                    cursor: 'pointer'
                  }}
                  onClick={() =>
                    setSelectedHistorySession(
                      selectedHistorySession?.id === session.id ? null : session
                    )
                  }
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start'
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          color: brand.secondary,
                          fontSize: 16
                        }}
                      >
                        {session.subjectName || session.meetCode}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: neutral.textSecondary,
                          marginTop: 4
                        }}
                      >
                        📅 {session.sessionDate} • 👥 {session.participantCount}{' '}
                        participants
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: neutral.textMuted,
                          marginTop: 2
                        }}
                      >
                        Saved: {new Date(session.savedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        if (
                          window.confirm(`Delete this session from history?`)
                        ) {
                          const updated = deleteSessionFromHistory(session.id)
                          setAttendanceHistory(updated)
                        }
                      }}
                      style={{
                        background: statusColors.absent.border,
                        color: neutral.bgSurface,
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 8px',
                        fontSize: 11,
                        cursor: 'pointer'
                      }}
                    >
                      🗑️
                    </button>
                  </div>

                  {/* Expanded session details */}
                  {selectedHistorySession?.id === session.id && (
                    <div
                      style={{
                        marginTop: 16,
                        paddingTop: 16,
                        borderTop: `1px solid ${neutral.border}`
                      }}
                    >
                      <h4
                        style={{ margin: '0 0 12px 0', color: brand.secondary }}
                      >
                        Participants
                      </h4>
                      <div style={{ maxHeight: 300, overflow: 'auto' }}>
                        {session.participants.map((p, pIndex) => (
                          <div
                            key={pIndex}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '8px 0',
                              borderBottom: `1px solid ${neutral.borderLight}`,
                              fontSize: 13
                            }}
                          >
                            <div>
                              <span
                                style={{ fontWeight: p.isHost ? 700 : 500 }}
                              >
                                {p.isHost && '👑 '}
                                {p.name}
                              </span>
                              {p.studentId && (
                                <span
                                  style={{
                                    color: neutral.textMuted,
                                    marginLeft: 8,
                                    fontSize: 11
                                  }}
                                >
                                  ({p.studentId})
                                </span>
                              )}
                            </div>
                            <div style={{ color: neutral.textSecondary }}>
                              {Math.floor(p.durationSeconds / 60)}:
                              {String(p.durationSeconds % 60).padStart(2, '0')}{' '}
                              min
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const SidebarItem = ({ icon, label, isActive, isLast, onClick }) => {
  const [hover, setHover] = useState(false)
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '18px 38px',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: 20,
        background: isActive
          ? brand.primary
          : hover
          ? brand.primary
          : 'transparent',
        marginBottom: isLast ? 0 : 12,
        borderTopLeftRadius: 30,
        borderBottomLeftRadius: 30,
        transition: 'background 0.2s'
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      <i
        className={`bi ${icon}`}
        style={{ fontSize: 26, color: neutral.bgSurface, marginRight: 22 }}
      ></i>
      <span
        style={{
          fontStyle: 'italic',
          color: neutral.bgSurface,
          textAlign: 'left'
        }}
      >
        {label}
      </span>
    </div>
  )
}

// Fixed-width table styles to prevent layout shifting when Duration updates
const thStyle = {
  padding: '14px 16px',
  fontWeight: 800,
  fontSize: 14,
  background: neutral.bgMuted,
  color: brand.secondary,
  borderBottom: `2px solid ${neutral.borderLight}`,
  textAlign: 'left',
  whiteSpace: 'nowrap'
}

const tdStyle = {
  padding: '14px 16px',
  fontWeight: 600,
  color: neutral.text,
  fontSize: 14,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
}

// Column width definitions to prevent layout shift
const columnWidths = {
  group: { width: 100, minWidth: 100 },
  date: { width: 110, minWidth: 110 },
  participantId: { width: 140, minWidth: 140 },
  participantName: { width: 200, minWidth: 180 },
  timeIn: { width: 100, minWidth: 100 },
  timeOut: { width: 100, minWidth: 100 },
  duration: { width: 100, minWidth: 100 },
  log: { width: 120, minWidth: 120 }
}

// Generate student ID based on name
function generateStudentId (name) {
  const hash = name.split('').reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0)
    return a & a
  }, 0)
  return `2025-${Math.abs(hash).toString().padStart(3, '0')}`
}

export default Dashboard2
