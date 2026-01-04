import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import logo from '../assets/Logologin.png'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 2: CSS classes for theme-aware styling
import './History.css'
import '../styles/common.css'
import { logout } from '../utils/auth'
import { apiGet, apiPut, apiPost, apiPatch } from '../utils/api'
// Shared attendance history utilities (localStorage sessions from Dashboard)
import {
  loadAttendanceHistory,
  deleteSessionFromHistory,
  clearAllAttendanceHistory,
  markSessionAsSynced,
  formatDurationFromSeconds
} from '../utils/attendanceHistory'
// Design system colors for consistent, accessible UI
// riskColorMap is now centralized in colors.js for consistency across all pages
import {
  status as statusColors,
  brand,
  neutral,
  riskColorMap
} from '../utils/colors'
import StatusBanner from '../components/StatusBanner'
import AttendanceSummaryModal from './components/AttendanceSummaryModal'
import { HARD_CODED_ATTENDANCE_RECORDS_IT4R10 } from '../utils/hardcodedSessionHistory'
import UserMenu from '../components/layout/UserMenu'

const navItems = [
  {
    icon: 'bi-speedometer2',
    label: 'DASHBOARD',
    path: '/instructor-dashboard'
  },
  {
    icon: 'bi-megaphone',
    label: 'ANNOUNCEMENTS',
    path: '/instructor-announcements'
  },
  { icon: 'bi-clock-history', label: 'HISTORY', path: '/history' },
  { icon: 'bi-journal-text', label: 'NOTES', path: '/Note2' },
  { icon: 'bi-box-arrow-right', label: 'LOGOUT', path: '/logout' }
]

// riskColorMap is now imported from '../utils/colors' - removed local duplicate

const getHistoryParticipantCategory = participant => {
  if (participant?.isHost) return 'Verified'
  if (participant?.isVerifiedParticipant === true) return 'Verified'
  if (participant?.isVerifiedParticipant === false) return 'Guest'

  const legacyVerified =
    participant?.user?.studentId ||
    participant?.studentId ||
    participant?.userId

  if (legacyVerified) return 'Verified'
  if (participant?.isUnauthenticated) return 'Guest'
  return 'Guest'
}

/**
 * Format time display for Time In/Time Out columns
 * Handles string format (HH:MM:SS), Date objects, and missing data
 * @param {string|Date|null|undefined} timeValue - Time value to format
 * @returns {string} Formatted time string or "—" if not available
 */
const formatTimeDisplay = timeValue => {
  if (!timeValue) return '—'

  // If it's already a string (HH:MM:SS format), parse and format nicely
  if (typeof timeValue === 'string') {
    const trimmed = timeValue.trim()
    if (trimmed === '' || trimmed === 'N/A' || trimmed === 'null') return '—'
    // If it's in HH:MM:SS format, parse it and convert to 12-hour format
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(trimmed)) {
      const [hours, minutes, seconds] = trimmed.split(':').map(Number)
      const date = new Date()
      date.setHours(hours, minutes, seconds || 0, 0)
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      })
    }
    // Try to parse as Date string
    const date = new Date(trimmed)
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      })
    }
    return trimmed
  }

  // If it's a Date object, format it
  if (timeValue instanceof Date) {
    if (isNaN(timeValue.getTime())) return '—'
    return timeValue.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  }

  return '—'
}

const isRecordWithinLastSevenDays = record => {
  if (!record?.createdAt) return false
  const recordDate = new Date(record.createdAt)
  if (Number.isNaN(recordDate.getTime())) return false
  const windowStart = new Date()
  windowStart.setHours(0, 0, 0, 0)
  windowStart.setDate(windowStart.getDate() - 6)
  return recordDate >= windowStart
}

const History = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [showNotifications, setShowNotifications] = useState(false)
  const [currentUser] = useState(() => {
    try {
      const raw = localStorage.getItem('user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [attendanceData, setAttendanceData] = useState([])
  const [instructorSubjects, setInstructorSubjects] = useState([])
  const [instructorSubjectIds, setInstructorSubjectIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState('')
  const [appeals, setAppeals] = useState([])
  const [appealsLoading, setAppealsLoading] = useState(false)
  const [appealsError, setAppealsError] = useState('')
  const [appealsFilter, setAppealsFilter] = useState('pending')
  const [appealActionLoading, setAppealActionLoading] = useState(null)

  // Local sessions from Dashboard (localStorage)
  const [localSessions, setLocalSessions] = useState([])
  const [showLocalSessions, setShowLocalSessions] = useState(true)
  const [expandedLocalSession, setExpandedLocalSession] = useState(null)
  const [syncingSessionId, setSyncingSessionId] = useState(null)
  const [showSessionGroups, setShowSessionGroups] = useState(true)
  const [expandedSessionId, setExpandedSessionId] = useState(null)
  const [editingAttendanceId, setEditingAttendanceId] = useState(null)
  const [editingStatus, setEditingStatus] = useState('Present')

  // Enrolled students state - for showing ALL enrolled students per session
  const [enrolledStudentsData, setEnrolledStudentsData] = useState({})
  const [enrolledLoading, setEnrolledLoading] = useState(null)

  // Filter states
  const [filterGroupName, setFilterGroupName] = useState('')
  const [filterStudentName, setFilterStudentName] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [dateFilterMode, setDateFilterMode] = useState('all')
  const [filterDate, setFilterDate] = useState('all')
  const [filterDateStart, setFilterDateStart] = useState('')
  const [filterDateEnd, setFilterDateEnd] = useState('')
  const [filterSection, setFilterSection] = useState('all')
  const [filterSchoolYear, setFilterSchoolYear] = useState('')
  const [filterSemester, setFilterSemester] = useState('')
  const [showFilters, setShowFilters] = useState(true)

  // Attendance Summary Modal state
  const [showSummaryModal, setShowSummaryModal] = useState(false)

  const fetchAppeals = useCallback(async () => {
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
    fetchAppeals()
  }, [fetchAppeals])

  const handleAppealAction = useCallback(
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
        fetchAppeals()
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
    [fetchAppeals]
  )

  const filteredAppeals = useMemo(() => {
    if (!appealsFilter || appealsFilter === 'all') {
      return appeals
    }
    return appeals.filter(appeal => appeal.status === appealsFilter)
  }, [appeals, appealsFilter])

  const appealStatusBadgeStyle = status => {
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

  // Default subject selection so risk summaries can load automatically
  useEffect(() => {
    if (
      filterGroupName === 'all' &&
      instructorSubjects.length > 0 &&
      instructorSubjects[0]?.name
    ) {
      setFilterGroupName(instructorSubjects[0].name)
    }
  }, [filterGroupName, instructorSubjects])

  // Fetch instructor's subjects
  const fetchInstructorSubjects = async () => {
    try {
      // Get instructor ID from localStorage
      let instructorId = null
      try {
        const userStr = localStorage.getItem('user')
        const user = userStr ? JSON.parse(userStr) : null
        instructorId = user && user._id ? user._id : null
      } catch (error) {
        console.error('Error parsing user data:', error)
      }

      if (!instructorId) {
        console.warn('No instructor ID found')
        setInstructorSubjects([])
        setInstructorSubjectIds([])
        setApiError('Instructor not authenticated. Please log in again.')
        return
      }

      // Fetch instructor's subjects
      const response = await apiGet(`subjects/instructor/${instructorId}`)
      const result = await response.json()

      if (result.success && Array.isArray(result.data)) {
        const subjects = result.data.filter(s => s.isActive !== false)
        const subjectIds = subjects.map(s => s._id.toString())
        const subjectNames = subjects.map(s => ({
          id: s._id,
          name: s.subjectName,
          code: s.subjectCode
        }))

        setInstructorSubjects(subjectNames)
        setInstructorSubjectIds(subjectIds)
        console.log(
          '✅ Instructor subjects loaded:',
          subjects.length,
          'subjects'
        )

        // Fetch attendance history after subjects are loaded
        fetchAttendanceHistory(subjectNames, subjectIds)
      } else {
        setInstructorSubjects([])
        setInstructorSubjectIds([])
        // Still fetch attendance even if no subjects (will show empty)
        fetchAttendanceHistory([], [])
      }
    } catch (error) {
      console.error('Error fetching instructor subjects:', error)
      setInstructorSubjects([])
      setInstructorSubjectIds([])
      // Still fetch attendance even if error
      setApiError(
        error?.message
          ? `Failed to load instructor subjects: ${error.message}`
          : 'Failed to load instructor subjects. Please try again.'
      )
      fetchAttendanceHistory([], [])
    }
  }

  // Fetch attendance history filtered by instructor's subjects
  const fetchAttendanceHistory = async (
    subjects = instructorSubjects,
    subjectIds = instructorSubjectIds
  ) => {
    try {
      setLoading(true)
      console.log('📥 === FETCHING ATTENDANCE HISTORY ===')
      console.log(`   Instructor subjects: ${subjects.length}`)
      console.log(`   Instructor subject IDs: ${subjectIds.length}`)

      const response = await apiGet('attendance/recent')
      const data = await response.json()

      if (data.success) {
        console.log(
          `✅ Received ${data.data?.length || 0} attendance records from API`
        )

        // Filter out instructors/hosts, only keep students
        let studentRecords = (data.data || []).filter(record => {
          const userRole = record.user?.role
          return !userRole || userRole === 'student'
        })

        console.log(
          `📊 After filtering students: ${studentRecords.length} records`
        )

        // PHASE 3 FIX: Enhanced filtering with improved normalization and fallback
        if (subjects && subjects.length > 0) {
          // Enhanced normalization function - handles more edge cases
          const normalizeName = name => {
            if (!name) return ''
            // Convert to string, trim, lowercase, remove extra spaces, remove special chars for comparison
            return name
              .toString()
              .trim()
              .toLowerCase()
              .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
              .replace(/[^\w\s]/g, '') // Remove special characters for comparison
              .trim()
          }

          // Also try matching by subjectId if available in records
          const instructorSubjectIdsSet = new Set(
            subjectIds.map(id => id.toString())
          )

          const instructorSubjectNames = new Set(
            subjects.map(s => normalizeName(s.name))
          )

          // Also create a map of normalized names to original names for better matching
          const nameVariations = new Map()
          subjects.forEach(s => {
            const normalized = normalizeName(s.name)
            if (!nameVariations.has(normalized)) {
              nameVariations.set(normalized, [])
            }
            nameVariations.get(normalized).push(s.name)
          })

          const beforeFilter = studentRecords.length
          let filteredCount = 0
          let matchedById = 0
          let matchedByName = 0
          let unmatchedCount = 0
          let recordsWithoutSubjectId = 0

          // PHASE 3.3: Log subjectId values for debugging
          const subjectIdValues = studentRecords
            .map(r => r.subjectId)
            .filter(Boolean)
          console.log(
            `📊 Records with subjectId: ${subjectIdValues.length}/${studentRecords.length}`
          )
          if (subjectIdValues.length < studentRecords.length) {
            const withoutId = studentRecords.filter(r => !r.subjectId)
            console.warn(
              `⚠️ ${withoutId.length} records missing subjectId:`,
              withoutId.map(r => ({
                id: r.attendanceId || r._id,
                groupName: r.groupName || r.subjectName,
                meetCode: r.meetCode
              }))
            )
          }

          studentRecords = studentRecords.filter(record => {
            // Phase 3 Task 2: Enhanced filtering with unauthenticated record handling
            const isUnauthenticated =
              record.isUnauthenticated ||
              record.authWarning ||
              !record.subjectId

            // Phase 3 Task 2: For unauthenticated records, try to match by meetCode to instructor's subject meetingLinks
            if (isUnauthenticated) {
              console.log(
                `⚠️ Unauthenticated record detected: ${
                  record.groupName || record.subjectName || 'N/A'
                }`
              )
              console.log(
                `   Record ID: ${record._id || record.attendanceId || 'N/A'}`
              )
              console.log(`   MeetCode: ${record.meetCode || 'N/A'}`)

              // Try to match by meetCode to instructor's subjects' meetingLinks
              if (record.meetCode && instructorSubjects.length > 0) {
                const meetCodeLower = record.meetCode.toLowerCase()
                const matchedSubject = instructorSubjects.find(subject => {
                  // Assume subjects have a meetingLink field containing the Google Meet link
                  // Extract meetCode from meetingLink and compare
                  const subjectMeetingLink = subject.meetingLink || ''
                  return subjectMeetingLink
                    .toLowerCase()
                    .includes(meetCodeLower)
                })

                if (matchedSubject) {
                  console.log(
                    `✅ Unauthenticated record matched by meetCode to subject: ${matchedSubject.name}`
                  )
                  return true
                }
              }

              // If no meetCode match, still include unauthenticated records with warning
              console.log(
                `⚠️ Including unauthenticated record (no meetCode match) - will show with warning badge`
              )
              return true
            }

            // PHASE 3 FIX: Try multiple matching strategies for authenticated records
            // 1. Match by subjectId (most reliable)
            if (record.subjectId) {
              const recordSubjectId = record.subjectId.toString()
              if (instructorSubjectIdsSet.has(recordSubjectId)) {
                matchedById++
                console.log(
                  `✅ Matched by ID: ${recordSubjectId} - ${
                    record.groupName || record.subjectName
                  }`
                )
                return true
              }
            } else {
              recordsWithoutSubjectId++
            }

            // 2. Match by normalized subject name
            const recordSubjectName =
              record.groupName || record.subjectName || ''
            const normalizedRecordName = normalizeName(recordSubjectName)

            if (instructorSubjectNames.has(normalizedRecordName)) {
              matchedByName++
              return true
            }

            // 3. Try fuzzy matching (partial match)
            let fuzzyMatch = false
            for (const normalizedInstructorName of instructorSubjectNames) {
              if (
                normalizedRecordName.includes(normalizedInstructorName) ||
                normalizedInstructorName.includes(normalizedRecordName)
              ) {
                fuzzyMatch = true
                console.log(
                  `🔍 Fuzzy match found: "${recordSubjectName}" ≈ "${
                    Array.from(
                      nameVariations.get(normalizedInstructorName) || [
                        normalizedInstructorName
                      ]
                    )[0]
                  }"`
                )
                break
              }
            }

            if (fuzzyMatch) {
              matchedByName++
              return true
            }

            // No match found
            unmatchedCount++
            if (recordsWithoutSubjectId > 0 && !record.subjectId) {
              console.warn(
                `⚠️ Filtering out record without subjectId: "${recordSubjectName}" (meetCode: ${
                  record.meetCode || 'N/A'
                })`
              )
              console.warn(
                `   💡 This record may not have Session.subjectId set - check backend logs`
              )
            } else {
              console.log(
                '⚠️ Filtering out record:',
                recordSubjectName,
                '- not in instructor subjects'
              )
            }
            return false
          })

          filteredCount = studentRecords.length
          const unauthenticatedCount = studentRecords.filter(
            r => r.isUnauthenticated || r.authWarning || !r.subjectId
          ).length

          console.log(
            `✅ Filtered attendance records: ${beforeFilter} -> ${filteredCount} (instructor's subjects only)`
          )
          console.log(
            `   Matched by ID: ${matchedById}, Matched by name: ${matchedByName}, Unmatched: ${unmatchedCount}`
          )

          // Phase 3 Task 2: Log summary of filtering results
          if (unauthenticatedCount > 0) {
            console.log(
              `⚠️ ${unauthenticatedCount} unauthenticated record(s) included (will show with warning badges)`
            )
          }
          if (recordsWithoutSubjectId > 0) {
            console.warn(
              `⚠️ ${recordsWithoutSubjectId} record(s) missing subjectId`
            )
            console.warn(
              '   💡 These may be unauthenticated submissions or records from before subjectId was added'
            )
          }

          // PHASE 3 FIX: Show warning if filtering removed many records
          if (unmatchedCount > 0 && unmatchedCount > beforeFilter * 0.5) {
            console.warn(
              `⚠️ Filtering removed ${unmatchedCount} records (${Math.round(
                (unmatchedCount / beforeFilter) * 100
              )}%)`
            )
            console.warn(
              '   💡 This may indicate a normalization mismatch - check subject names'
            )
          }
        }

        // Apply filtered or raw records based on instructor subjects
        // and append hardcoded IT4R10 / IT ELECTIVE 4 records for demo history
        const mergedRecords = [
          ...studentRecords,
          ...HARD_CODED_ATTENDANCE_RECORDS_IT4R10
        ]
        setAttendanceData(mergedRecords)
      } else {
        // API did not succeed - clear data
        setAttendanceData([])
      }
    } catch (error) {
      console.error('Error fetching attendance history:', error)
      setAttendanceData([])
      setApiError(
        error?.message
          ? `Failed to load attendance history: ${error.message}`
          : 'Failed to load attendance history. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInstructorSubjects()

    // AUTO-REFRESH: Refresh attendance history every 15 seconds for near real-time updates
    const refreshInterval = setInterval(() => {
      console.log('🔄 Auto-refreshing attendance history...')
      fetchInstructorSubjects()
    }, 15000) // 15 seconds - more frequent for better real-time experience

    return () => {
      clearInterval(refreshInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // fetchInstructorSubjects is intentionally not in deps - it's defined in component scope

  // Load local sessions from localStorage (Dashboard real-time sessions)
  useEffect(() => {
    const sessions = loadAttendanceHistory()
    setLocalSessions(sessions)
    console.log(`📂 Loaded ${sessions.length} local sessions from Dashboard`)
  }, [])

  // Refresh local sessions periodically
  useEffect(() => {
    const refreshLocal = setInterval(() => {
      const sessions = loadAttendanceHistory()
      setLocalSessions(sessions)
    }, 5000) // Every 5 seconds
    return () => clearInterval(refreshLocal)
  }, [])

  // Handle deleting a local session
  const handleDeleteLocalSession = sessionId => {
    if (window.confirm('Delete this local session? This cannot be undone.')) {
      const updated = deleteSessionFromHistory(sessionId)
      setLocalSessions(updated)
    }
  }

  // Handle clearing all local sessions
  const handleClearAllLocalSessions = () => {
    if (
      window.confirm(
        'Clear ALL local sessions? This will delete all unsaved attendance data from Dashboard.'
      )
    ) {
      clearAllAttendanceHistory()
      setLocalSessions([])
    }
  }

  // Handle syncing a local session to database
  const handleSyncSession = async session => {
    if (
      !session ||
      !session.participants ||
      session.participants.length === 0
    ) {
      alert('No valid participants to sync')
      return
    }

    setSyncingSessionId(session.id)
    try {
      // Convert local session format to database format
      const attendanceRecords = session.participants
        .filter(p => !p.isHost) // Exclude host from attendance records
        .map(participant => ({
          meetCode: session.meetCode,
          fullName: participant.name,
          studentId: participant.studentId,
          email: participant.email,
          userId: participant.userId,
          duration: participant.durationSeconds || 0,
          status: participant.status || 'Absent', // Default to Absent (student didn't appear)
          joinTime: participant.joinTime,
          leaveTime: participant.leaveTime,
          groupName: session.subjectName || session.meetCode,
          subjectId: session.subjectId,
          isUnauthenticated: participant.isUnauthenticated || false
        }))

      // POST to attendance batch endpoint
      const response = await apiPost('attendance/batch', {
        records: attendanceRecords,
        sessionDate: session.sessionDate,
        meetCode: session.meetCode
      })

      const data = await response.json()

      if (data.success) {
        // Mark session as synced
        const updated = markSessionAsSynced(session.id)
        setLocalSessions(updated)
        alert(
          `✅ Synced ${attendanceRecords.length} attendance records to database`
        )
        // Refresh database records
        fetchInstructorSubjects()
      } else {
        alert(data.message || 'Failed to sync session')
      }
    } catch (error) {
      console.error('Error syncing session:', error)
      alert('Error syncing session to database')
    } finally {
      setSyncingSessionId(null)
    }
  }

  const handleEditParticipantStatus = participant => {
    if (!participant) return
    const currentStatus = participant.status || 'Absent'
    const normalized =
      currentStatus.charAt(0).toUpperCase() +
      currentStatus.slice(1).toLowerCase()
    setEditingAttendanceId(participant.attendanceId)
    setEditingStatus(normalized)
  }

  const handleCancelParticipantEdit = () => {
    setEditingAttendanceId(null)
    setEditingStatus('Present')
  }

  const handleSaveParticipantStatus = async participant => {
    if (!participant || !participant.attendanceId) return
    try {
      const response = await apiPut(
        `attendance/${participant.attendanceId}/status`,
        {
          status: editingStatus
        }
      )
      const data = await response.json()

      if (data.success) {
        setAttendanceData(prev =>
          prev.map(record =>
            record.attendanceId === participant.attendanceId
              ? { ...record, status: editingStatus.toLowerCase() }
              : record
          )
        )
        setEditingAttendanceId(null)
        alert('Status updated successfully!')
      } else {
        alert(data.message || 'Failed to update status')
      }
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Error updating status')
    }
  }

  // Manual refresh handler
  const handleManualRefresh = () => {
    console.log('🔄 Manual refresh triggered...')
    setLoading(true)
    fetchInstructorSubjects()
  }

  // Fetch enrolled students for a specific session (shows ALL students including absent)
  const fetchEnrolledStudentsForSession = async sessionId => {
    if (!sessionId) return

    // Check if we already have data for this session
    if (enrolledStudentsData[sessionId]) {
      console.log(`📋 Using cached enrolled data for session ${sessionId}`)
      return
    }

    setEnrolledLoading(sessionId)
    try {
      console.log(`📋 Fetching enrolled students for session ${sessionId}`)
      const response = await apiGet(`attendance/session/${sessionId}/enrolled`)
      const data = await response.json()

      if (data.success) {
        console.log(
          `✅ Fetched ${data.data.students?.length || 0} enrolled students`
        )
        setEnrolledStudentsData(prev => ({
          ...prev,
          [sessionId]: data.data
        }))
      } else {
        console.error('Failed to fetch enrolled students:', data.error)
      }
    } catch (error) {
      console.error('Error fetching enrolled students:', error)
    } finally {
      setEnrolledLoading(null)
    }
  }

  // Handle session expansion - fetch enrolled students when expanded
  const handleSessionExpand = sessionId => {
    if (expandedSessionId === sessionId) {
      // Collapse
      setExpandedSessionId(null)
    } else {
      // Expand and fetch enrolled students
      setExpandedSessionId(sessionId)
      // Extract actual session ID from the session group if needed
      // Session groups use format: `${groupName}__${sessionDate}`
      // We need to find the actual MongoDB session ID from the participants
      const sessionGroup = sessionGroups.find(s => s.id === sessionId)
      if (sessionGroup && sessionGroup.participants.length > 0) {
        // Get sessionId from first participant's record
        const firstParticipant = sessionGroup.participants[0]
        const actualSessionId =
          firstParticipant.sessionId?._id || firstParticipant.sessionId
        if (actualSessionId) {
          fetchEnrolledStudentsForSession(actualSessionId)
        }
      }
    }
  }

  const handleNavigation = path => {
    if (path === '/logout') {
      logout(navigate)
    } else {
      navigate(path)
    }
  }

  const handleClearFilters = () => {
    setFilterGroupName('all')
    setFilterStudentName('')
    setFilterStatus('all')
    setDateFilterMode('all')
    setFilterDate('all')
    setFilterDateStart('')
    setFilterDateEnd('')
    setFilterSection('all')
    setFilterSchoolYear('all')
    setFilterSemester('all')
  }

  const handleExportCSV = () => {
    if (filteredData.length === 0) {
      alert('No data to export')
      return
    }

    const headers = [
      'Student Name',
      'Student ID',
      'Subject Name',
      'Duration',
      'Date',
      'Status'
    ]
    const csvData = filteredData.map(record => [
      record.fullName || 'Unknown',
      record.user?.studentId || 'N/A',
      record.groupName || 'N/A',
      formatDurationFromSeconds(record.duration),
      new Date(record.createdAt).toLocaleString(),
      record.status
    ])

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `attendance_history_${new Date().toISOString().split('T')[0]}.csv`
    )
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const notificationItems = [
    'New student joined IT Elective class',
    'Attendance report generated',
    'Class schedule updated',
    'Meeting started in Room 301'
  ]

  // Get unique group names for filter dropdown (only instructor's subjects)
  const uniqueGroupNames = React.useMemo(() => {
    // Only include subjects that belong to the instructor
    if (instructorSubjects && instructorSubjects.length > 0) {
      // Always show ALL instructor's subjects in the filter dropdown
      // This allows filtering even if there are no attendance records yet
      const allInstructorSubjectNames = instructorSubjects
        .map(s => s.name)
        .sort()
      console.log(
        '📚 Instructor subjects for filter:',
        allInstructorSubjectNames
      )
      return allInstructorSubjectNames
    }

    // If no instructor subjects loaded yet, show group names from attendance data as fallback
    // Use groupName (backward compatibility) or subjectName (current system)
    const fallbackNames = [
      ...new Set(
        attendanceData
          .map(record => record.groupName || record.subjectName)
          .filter(Boolean)
      )
    ].sort()
    console.log(
      '⚠️ No instructor subjects loaded, using fallback:',
      fallbackNames.length,
      'subjects'
    )
    return fallbackNames
  }, [attendanceData, instructorSubjects])

  // Get unique sections for filter dropdown
  const uniqueSections = [
    ...new Set(
      attendanceData.map(record => record.user?.section).filter(Boolean)
    )
  ].sort()

  // Get unique school years for filter dropdown
  const uniqueSchoolYears = [
    ...new Set(
      attendanceData.map(record => record.user?.schoolYear).filter(Boolean)
    )
  ].sort()

  // Get unique semesters for filter dropdown
  const _uniqueSemesters = [
    ...new Set(
      attendanceData.map(record => record.user?.semester).filter(Boolean)
    )
  ].sort()

  // Get available dates based on selected group
  const availableDates = React.useMemo(() => {
    // Filter attendance data by selected group - use groupName (backward compatibility) or subjectName (current system)
    const relevantData =
      filterGroupName === 'all'
        ? attendanceData
        : attendanceData.filter(record => {
            const recordSubjectName =
              record.groupName || record.subjectName || ''
            return recordSubjectName === filterGroupName
          })

    // Extract unique dates from relevant data
    const datesSet = new Set()
    relevantData.forEach(record => {
      const date = new Date(record.createdAt)
      const dateStr = date.toLocaleDateString('en-CA') // Format: YYYY-MM-DD
      datesSet.add(dateStr)
    })

    // Convert to array and sort (newest first)
    return Array.from(datesSet).sort((a, b) => new Date(b) - new Date(a))
  }, [attendanceData, filterGroupName])

  // Reset date filter if selected date is not available for current group
  React.useEffect(() => {
    if (
      dateFilterMode === 'specific' &&
      filterDate !== 'all' &&
      !availableDates.includes(filterDate)
    ) {
      setFilterDate('all')
    }
  }, [filterGroupName, availableDates, filterDate, dateFilterMode])

  React.useEffect(() => {
    if (dateFilterMode !== 'specific' && filterDate !== 'all') {
      setFilterDate('all')
    }
    if (dateFilterMode !== 'range' && (filterDateStart || filterDateEnd)) {
      setFilterDateStart('')
      setFilterDateEnd('')
    }
  }, [dateFilterMode, filterDate, filterDateStart, filterDateEnd])

  // Advanced filtering logic with stable sorting
  const filteredData = React.useMemo(() => {
    // Filter records
    const filtered = attendanceData.filter(record => {
      // Group name filter - use groupName (backward compatibility) or subjectName (current system)
      const recordSubjectName = record.groupName || record.subjectName || ''
      const matchesGroupName =
        filterGroupName === 'all' || recordSubjectName === filterGroupName

      // Student name filter
      const matchesStudentName =
        filterStudentName === '' ||
        (record.fullName &&
          record.fullName
            .toLowerCase()
            .includes(filterStudentName.toLowerCase()))

      // Status filter (case-insensitive)
      const matchesStatus =
        filterStatus === 'all' ||
        (record.status || '').toLowerCase() === filterStatus.toLowerCase()

      // Date filter
      let matchesDate = true
      if (dateFilterMode === 'specific') {
        if (filterDate !== 'all' && filterDate !== '') {
          const recordDate = new Date(record.createdAt)
          const recordDateStr = recordDate.toLocaleDateString('en-CA')
          matchesDate = recordDateStr === filterDate
        }
      } else if (dateFilterMode === 'range') {
        const recordDate = new Date(record.createdAt)
        if (Number.isNaN(recordDate.getTime())) {
          matchesDate = false
        } else {
          const recordDateStr = recordDate.toLocaleDateString('en-CA')
          const effectiveStart =
            filterDateStart && filterDateEnd && filterDateStart > filterDateEnd
              ? filterDateEnd
              : filterDateStart
          const effectiveEnd =
            filterDateStart && filterDateEnd && filterDateStart > filterDateEnd
              ? filterDateStart
              : filterDateEnd

          if (effectiveStart) {
            matchesDate = matchesDate && recordDateStr >= effectiveStart
          }
          if (effectiveEnd) {
            matchesDate = matchesDate && recordDateStr <= effectiveEnd
          }
        }
      }

      // Section filter
      const matchesSection =
        filterSection === 'all' || record.user?.section === filterSection

      // School Year filter
      const matchesSchoolYear =
        filterSchoolYear === 'all' ||
        record.user?.schoolYear === filterSchoolYear

      // Semester filter
      const matchesSemester =
        filterSemester === 'all' || record.user?.semester === filterSemester

      const isVerifiedParticipant =
        getHistoryParticipantCategory(record) === 'Verified'

      return (
        matchesGroupName &&
        matchesStudentName &&
        matchesStatus &&
        matchesDate &&
        matchesSection &&
        matchesSchoolYear &&
        matchesSemester &&
        isVerifiedParticipant
      )
    })

    // STABLE SORTING: Sort by date (newest first), then subject, then student name
    return filtered.sort((a, b) => {
      // 1. Sort by date (newest first)
      const dateA = new Date(a.createdAt).getTime()
      const dateB = new Date(b.createdAt).getTime()
      if (dateA !== dateB) return dateB - dateA // Descending (newest first)

      // 2. Sort by subject/group name (alphabetical)
      const groupA = (a.groupName || a.subjectName || '').toLowerCase()
      const groupB = (b.groupName || b.subjectName || '').toLowerCase()
      if (groupA !== groupB) return groupA.localeCompare(groupB)

      // 3. Sort by student name (alphabetical)
      const nameA = (a.fullName || '').toLowerCase()
      const nameB = (b.fullName || '').toLowerCase()
      return nameA.localeCompare(nameB)
    })
  }, [
    attendanceData,
    filterGroupName,
    filterStudentName,
    filterStatus,
    dateFilterMode,
    filterDate,
    filterDateStart,
    filterDateEnd,
    filterSection,
    filterSchoolYear,
    filterSemester
  ])

  // Group filtered records into sessions (subject + date) for per-meeting participant view
  const sessionGroups = React.useMemo(() => {
    if (!filteredData || filteredData.length === 0) return []

    const groups = new Map()

    filteredData.forEach(record => {
      const groupName =
        record.groupName || record.subjectName || 'Unknown Group'
      const createdAt = record.createdAt ? new Date(record.createdAt) : null
      const sessionDate =
        createdAt && !Number.isNaN(createdAt.getTime())
          ? createdAt.toLocaleDateString('en-CA')
          : 'Unknown Date'
      const key = `${groupName}__${sessionDate}`

      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          groupName,
          sessionDate,
          meetCode: record.meetCode || 'N/A',
          participants: []
        })
      }

      groups.get(key).participants.push(record)
    })

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.sessionDate) - new Date(a.sessionDate)
    )
  }, [filteredData])

  const participantCategoryStats = React.useMemo(() => {
    const baseStats = () => ({ total: 0, present: 0, late: 0, absent: 0 })

    const accumulate = (stats, record) => {
      stats.total += 1
      const status = (record.status || '').toLowerCase()
      if (status === 'present') stats.present += 1
      else if (status === 'late') stats.late += 1
      else if (status === 'absent') stats.absent += 1
      return stats
    }

    const withPercentages = stats => {
      const { total, present, late, absent } = stats
      const toPercent = value =>
        total > 0 ? Math.round((value / total) * 100) : 0
      return {
        ...stats,
        percentPresent: toPercent(present),
        percentLate: toPercent(late),
        percentAbsent: toPercent(absent)
      }
    }

    const aggregateStats = records => {
      if (!records || records.length === 0) {
        return withPercentages(baseStats())
      }
      return withPercentages(records.reduce(accumulate, baseStats()))
    }

    const buildCategoryStats = categoryRecords => {
      const overall = aggregateStats(categoryRecords)
      const lastSevenRecords = categoryRecords.filter(
        isRecordWithinLastSevenDays
      )
      const lastSeven = aggregateStats(lastSevenRecords)
      return {
        overall,
        lastSeven,
        presentDelta: lastSeven.percentPresent - overall.percentPresent,
        lastSevenSample: lastSevenRecords.length
      }
    }

    const verifiedRecords = filteredData.filter(
      r => getHistoryParticipantCategory(r) === 'Verified'
    )
    return {
      verified: buildCategoryStats(verifiedRecords)
    }
  }, [filteredData])

  // Calculate group statistics based on filtered data (reflects selected Group and Date)
  const groupStats = React.useMemo(() => {
    // Use filtered data but only apply Group and Date filters for statistics
    const statsData = attendanceData.filter(record => {
      const recordSubjectName = record.groupName || record.subjectName || ''
      const matchesGroupName =
        filterGroupName === 'all' || recordSubjectName === filterGroupName
      let matchesDate = true
      if (filterDate !== 'all' && filterDate !== '') {
        const recordDate = new Date(record.createdAt)
        const recordDateStr = recordDate.toLocaleDateString('en-CA')
        matchesDate = recordDateStr === filterDate
      }
      return matchesGroupName && matchesDate
    })

    const stats = {}

    statsData.forEach(record => {
      const groupName =
        record.groupName || record.subjectName || 'Unknown Group'
      if (!stats[groupName]) {
        stats[groupName] = {
          groupName,
          totalRecords: 0,
          present: 0,
          absent: 0,
          late: 0,
          totalStudents: new Set(),
          dates: new Set()
        }
      }

      stats[groupName].totalRecords++
      stats[groupName].totalStudents.add(record.userId)

      // Track unique dates
      const recordDate = new Date(record.createdAt)
      const recordDateStr = recordDate.toLocaleDateString('en-CA')
      stats[groupName].dates.add(recordDateStr)

      // Handle both capitalized and lowercase status values
      const statusLower = (record.status || '').toLowerCase()
      if (statusLower === 'present') stats[groupName].present++
      else if (statusLower === 'absent') stats[groupName].absent++
      else if (statusLower === 'late') stats[groupName].late++
    })

    // Calculate attendance rate and format data
    return Object.values(stats)
      .map(group => ({
        ...group,
        uniqueStudents: group.totalStudents.size,
        uniqueDates: group.dates.size,
        attendanceRate:
          group.totalRecords > 0
            ? Math.round(
                ((group.present + group.late) / group.totalRecords) * 100
              )
            : 0
      }))
      .sort((a, b) => b.attendanceRate - a.attendanceRate)
  }, [attendanceData, filterGroupName, filterDate])

  const getStatusColor = status => {
    const statusLower = (status || '').toLowerCase()
    switch (statusLower) {
      case 'present':
        return statusColors.present.text
      case 'absent':
        return statusColors.absent.text
      case 'late':
        return statusColors.late.text
      default:
        return neutral.textMuted
    }
  }

  const getStatusBadge = status => {
    // Ensure status is capitalized for display
    const displayStatus = status
      ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
      : 'Unknown'

    return (
      <span
        style={{
          padding: '6px 12px',
          borderRadius: 12,
          background: getStatusColor(status),
          color: neutral.bgSurface,
          fontWeight: 700,
          fontSize: 14,
          display: 'inline-block',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        {displayStatus}
      </span>
    )
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

      {/* Main Content */}
      <main style={{ flex: 1, padding: '48px 60px', overflowY: 'auto' }}>
        {apiError && (
          <StatusBanner
            variant='error'
            title='History load issue'
            message={apiError}
            onClose={() => setApiError('')}
          />
        )}
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 36
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
            ATTENDANCE HISTORY
          </h2>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              position: 'relative'
            }}
          >
            {/* Notifications */}
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
                    border: `1px solid ${neutral.border}`,
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
              user={currentUser}
              onProfileClick={() => navigate('/I_Profile')}
              onSettingsClick={() => alert('Settings')}
            />
          </div>
        </div>

        {/* Appeals Management */}
        <div
          style={{
            background: neutral.bgSurface,
            borderRadius: 16,
            padding: 32,
            marginBottom: 30,
            boxShadow: '0 4px 16px rgba(0,0,0,0.05)'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              marginBottom: 20
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 800,
                  color: brand.secondary
                }}
              >
                Appeals Inbox
              </h3>
              <p style={{ margin: 0, color: neutral.textSecondary }}>
                Review recent attendance appeals from your subjects.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <select
                value={appealsFilter}
                onChange={e => setAppealsFilter(e.target.value)}
                style={{ ...filterInputStyle, width: 160 }}
              >
                <option value='all'>All</option>
                <option value='pending'>Pending</option>
                <option value='under_review'>Under Review</option>
                <option value='approved'>Approved</option>
                <option value='denied'>Denied</option>
              </select>
              <button
                onClick={fetchAppeals}
                disabled={appealsLoading}
                style={{
                  padding: '8px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: appealsLoading ? neutral.border : brand.primary,
                  color: neutral.bgSurface,
                  fontWeight: 600,
                  cursor: appealsLoading ? 'default' : 'pointer'
                }}
              >
                {appealsLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>

          {appealsError && (
            <StatusBanner
              variant='error'
              title='Appeals issue'
              message={appealsError}
              onClose={() => setAppealsError('')}
            />
          )}

          {filteredAppeals.length === 0 ? (
            <p style={{ color: neutral.textMuted }}>No appeals found.</p>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {filteredAppeals.map(appeal => (
                <div
                  key={appeal._id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: `1px solid ${neutral.borderLight}`
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {appeal.studentId?.firstName} {appeal.studentId?.lastName}
                    </div>
                    <div style={{ fontSize: 13, color: neutral.textSecondary }}>
                      {appeal.reason?.substring(0, 60)}
                      {appeal.reason?.length > 60 ? '…' : ''}
                    </div>
                    {appeal.studentNotes ? (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 12,
                          color: neutral.textMuted,
                          maxWidth: 520
                        }}
                      >
                        Notes: {appeal.studentNotes}
                      </div>
                    ) : null}
                    {Array.isArray(appeal.attachments) &&
                      appeal.attachments.length > 0 && (
                        <div
                          style={{
                            marginTop: 10,
                            display: 'flex',
                            gap: 10,
                            flexWrap: 'wrap'
                          }}
                        >
                          {appeal.attachments.slice(0, 3).map((att, idx) => {
                            const url = att?.url
                            const mimeType = att?.mimeType || ''
                            const name = att?.name || `Attachment ${idx + 1}`
                            const isImage =
                              mimeType.startsWith('image/') ||
                              (typeof url === 'string' &&
                                url.startsWith('data:image/'))

                            return (
                              <a
                                key={`${appeal._id}_att_${idx}`}
                                href={url || '#'}
                                download={name}
                                target='_blank'
                                rel='noreferrer'
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  padding: 8,
                                  borderRadius: 10,
                                  border: `1px solid ${neutral.borderLight}`,
                                  background: neutral.bgMuted,
                                  color: brand.primary,
                                  textDecoration: 'none',
                                  cursor: url ? 'pointer' : 'default'
                                }}
                                onClick={e => {
                                  if (!url) e.preventDefault()
                                }}
                                title={name}
                              >
                                {isImage ? (
                                  <img
                                    src={url}
                                    alt={name}
                                    style={{
                                      width: 44,
                                      height: 44,
                                      objectFit: 'cover',
                                      borderRadius: 8,
                                      border: `1px solid ${neutral.borderLight}`
                                    }}
                                  />
                                ) : (
                                  <i
                                    className='bi bi-paperclip'
                                    style={{
                                      fontSize: 18,
                                      color: brand.primary
                                    }}
                                  ></i>
                                )}
                                <span
                                  style={{
                                    maxWidth: 180,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    fontSize: 12,
                                    fontWeight: 600
                                  }}
                                >
                                  {name}
                                </span>
                              </a>
                            )
                          })}
                        </div>
                      )}
                  </div>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <span
                      style={{
                        padding: '4px 12px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        ...appealStatusBadgeStyle(appeal.status)
                      }}
                    >
                      {appeal.status}
                    </span>
                    {appeal.status === 'pending' && (
                      <>
                        <button
                          onClick={() =>
                            handleAppealAction(appeal._id, 'approved')
                          }
                          disabled={
                            appealActionLoading === `${appeal._id}_approved`
                          }
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: 'none',
                            background: statusColors.present.border,
                            color: neutral.bgSurface,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            handleAppealAction(appeal._id, 'denied')
                          }
                          disabled={
                            appealActionLoading === `${appeal._id}_denied`
                          }
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            border: 'none',
                            background: statusColors.absent.border,
                            color: neutral.bgSurface,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Deny
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Group Attendance Performance Statistics */}
        {groupStats.length > 0 && (
          <div
            style={{
              background: neutral.bgSurface,
              borderRadius: 16,
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              padding: 32,
              marginBottom: 36
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 28,
                paddingBottom: 16,
                borderBottom: `2px solid ${neutral.borderLight}`
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontWeight: 800,
                    fontSize: 24,
                    color: brand.secondary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <i
                    className='bi bi-bar-chart-fill'
                    style={{ fontSize: 26 }}
                  ></i>
                  SUBJECT ATTENDANCE PERFORMANCE
                </h3>
                <p style={{ margin: 0, fontSize: 14, color: brand.secondary }}>
                  {filterGroupName === 'all' && filterDate === 'all' ? (
                    'Comprehensive attendance statistics across all subjects and dates'
                  ) : (
                    <>
                      {filterGroupName !== 'all' && (
                        <span
                          style={{ fontWeight: 600, color: brand.secondary }}
                        >
                          <i className='bi bi-funnel-fill'></i> Subject:{' '}
                          {filterGroupName}
                        </span>
                      )}
                      {filterGroupName !== 'all' &&
                        filterDate !== 'all' &&
                        ' • '}
                      {filterDate !== 'all' && (
                        <span
                          style={{ fontWeight: 600, color: brand.secondary }}
                        >
                          <i className='bi bi-calendar-check'></i> Date:{' '}
                          {new Date(filterDate).toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </span>
                      )}
                      {filterGroupName === 'all' &&
                        filterDate === 'all' &&
                        'All subjects and dates'}
                    </>
                  )}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {(filterGroupName !== 'all' || filterDate !== 'all') && (
                  <div
                    style={{
                      background: statusColors.late.border,
                      padding: '8px 16px',
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 2px 6px rgba(255, 214, 0, 0.3)'
                    }}
                  >
                    <i
                      className='bi bi-filter-circle-fill'
                      style={{ fontSize: 16, color: brand.secondary }}
                    ></i>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: brand.secondary
                      }}
                    >
                      Filtered View
                    </span>
                  </div>
                )}
                <div
                  style={{
                    background: neutral.bgMuted,
                    padding: '10px 20px',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <i
                    className='bi bi-collection'
                    style={{ fontSize: 18, color: brand.secondary }}
                  ></i>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: brand.secondary
                    }}
                  >
                    {groupStats.length}{' '}
                    {groupStats.length === 1 ? 'Group' : 'Groups'}
                  </span>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 32,
                marginBottom: 24,
                padding: '12px 0',
                borderBottom: `1px solid ${neutral.borderLight}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: statusColors.present.border
                  }}
                ></div>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: neutral.textPrimary
                  }}
                >
                  Present
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: statusColors.late.border
                  }}
                ></div>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: neutral.textPrimary
                  }}
                >
                  Late
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: statusColors.absent.border
                  }}
                ></div>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: neutral.textPrimary
                  }}
                >
                  Absent
                </span>
              </div>
            </div>

            {/* Scrollable Graph Container */}
            <div
              style={{
                overflowX: 'auto',
                overflowY: 'hidden',
                maxHeight: 600
              }}
            >
              <div
                style={{
                  minWidth:
                    groupStats.length > 4
                      ? `${groupStats.length * 200}px`
                      : '100%',
                  padding: '20px 10px'
                }}
              >
                {/* Chart */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 40,
                    height: 400,
                    borderBottom: `3px solid ${brand.secondary}`,
                    paddingBottom: 20
                  }}
                >
                  {groupStats.map((group, idx) => {
                    const maxValue = Math.max(
                      ...groupStats.map(g => g.totalRecords)
                    )
                    const presentHeight = (group.present / maxValue) * 100
                    const lateHeight = (group.late / maxValue) * 100
                    const absentHeight = (group.absent / maxValue) * 100
                    const totalHeight =
                      presentHeight + lateHeight + absentHeight
                    const performanceColor =
                      group.attendanceRate >= 80
                        ? statusColors.verified.border
                        : group.attendanceRate >= 60
                        ? statusColors.late.border
                        : statusColors.absent.border

                    return (
                      <div
                        key={group.groupName || `group-${idx}`}
                        style={{
                          flex: '0 0 auto',
                          minWidth: 160,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 12
                        }}
                      >
                        {/* Attendance Rate Badge */}
                        <div
                          style={{
                            background: performanceColor,
                            color: neutral.bgSurface,
                            padding: '8px 16px',
                            borderRadius: 8,
                            fontWeight: 800,
                            fontSize: 18,
                            boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
                            minWidth: 70,
                            textAlign: 'center'
                          }}
                        >
                          {group.attendanceRate}%
                        </div>

                        {/* Bar Chart */}
                        <div
                          style={{
                            position: 'relative',
                            width: 140,
                            height: 360,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-end',
                            alignItems: 'center'
                          }}
                        >
                          {/* Total Records Label */}
                          <div
                            style={{
                              position: 'absolute',
                              top: -30,
                              fontSize: 14,
                              fontWeight: 700,
                              color: brand.primary
                            }}
                          >
                            {group.totalRecords}
                          </div>

                          {/* Stacked Bars */}
                          <div
                            style={{
                              width: '100%',
                              height: `${Math.max(totalHeight, 5)}%`,
                              minHeight: 40,
                              display: 'flex',
                              flexDirection: 'column-reverse',
                              borderRadius: '12px 12px 0 0',
                              overflow: 'hidden',
                              boxShadow: '0 -4px 16px rgba(0,0,0,0.1)',
                              transition: 'transform 0.3s ease',
                              cursor: 'pointer'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.transform = 'scaleY(1.05)'
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.transform = 'scaleY(1)'
                            }}
                          >
                            {/* Present Bar */}
                            {group.present > 0 && (
                              <div
                                style={{
                                  height: `${
                                    (group.present / group.totalRecords) * 100
                                  }%`,
                                  background: `linear-gradient(180deg, ${statusColors.present.border} 0%, ${statusColors.verified.border} 100%)`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: neutral.bgSurface,
                                  fontWeight: 700,
                                  fontSize: 16,
                                  minHeight: group.present > 0 ? 30 : 0
                                }}
                              >
                                {group.present}
                              </div>
                            )}

                            {/* Late Bar */}
                            {group.late > 0 && (
                              <div
                                style={{
                                  height: `${
                                    (group.late / group.totalRecords) * 100
                                  }%`,
                                  background: `linear-gradient(180deg, ${statusColors.late.border} 0%, ${statusColors.late.icon} 100%)`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: neutral.bgSurface,
                                  fontWeight: 700,
                                  fontSize: 16,
                                  minHeight: group.late > 0 ? 30 : 0
                                }}
                              >
                                {group.late}
                              </div>
                            )}

                            {/* Absent Bar */}
                            {group.absent > 0 && (
                              <div
                                style={{
                                  height: `${
                                    (group.absent / group.totalRecords) * 100
                                  }%`,
                                  background: `linear-gradient(180deg, ${statusColors.absent.border} 0%, ${statusColors.absent.icon} 100%)`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: neutral.bgSurface,
                                  fontWeight: 700,
                                  fontSize: 16,
                                  minHeight: group.absent > 0 ? 30 : 0
                                }}
                              >
                                {group.absent}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Group Info */}
                        <div
                          style={{
                            textAlign: 'center',
                            marginTop: 16,
                            width: '100%'
                          }}
                        >
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 700,
                              color: brand.primary,
                              marginBottom: 6,
                              lineHeight: 1.3,
                              wordWrap: 'break-word'
                            }}
                          >
                            {group.groupName}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              color: neutral.textMuted,
                              fontWeight: 500
                            }}
                          >
                            Total Records: {group.uniqueStudents}{' '}
                            {group.uniqueStudents === 1
                              ? 'Student'
                              : 'Students'}
                          </div>
                          {filterDate !== 'all' && (
                            <div
                              style={{
                                fontSize: 12,
                                color: neutral.textMuted,
                                fontWeight: 500,
                                marginTop: 4
                              }}
                            >
                              Created: {group.uniqueDates}{' '}
                              {group.uniqueDates === 1 ? 'Session' : 'Sessions'}
                            </div>
                          )}
                          {filterDate === 'all' && group.uniqueDates > 1 && (
                            <div
                              style={{
                                fontSize: 12,
                                color: neutral.textMuted,
                                fontWeight: 500,
                                marginTop: 4
                              }}
                            >
                              {group.uniqueDates}{' '}
                              {group.uniqueDates === 1 ? 'Session' : 'Sessions'}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Summary Footer */}
            <div
              style={{
                marginTop: 24,
                paddingTop: 20,
                borderTop: `2px solid ${neutral.borderLight}`,
                display: 'flex',
                justifyContent: 'space-around',
                flexWrap: 'wrap',
                gap: 16
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: statusColors.present.border,
                    marginBottom: 4
                  }}
                >
                  {groupStats.reduce((sum, g) => sum + g.present, 0)}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: neutral.textMuted,
                    fontWeight: 600
                  }}
                >
                  Total Present
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: statusColors.late.border,
                    marginBottom: 4
                  }}
                >
                  {groupStats.reduce((sum, g) => sum + g.late, 0)}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: neutral.textMuted,
                    fontWeight: 600
                  }}
                >
                  Total Late
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: statusColors.absent.border,
                    marginBottom: 4
                  }}
                >
                  {groupStats.reduce((sum, g) => sum + g.absent, 0)}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: neutral.textMuted,
                    fontWeight: 600
                  }}
                >
                  Total Absent
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: brand.primary,
                    marginBottom: 4
                  }}
                >
                  {Math.round(
                    groupStats.reduce((sum, g) => sum + g.attendanceRate, 0) /
                      groupStats.length
                  )}
                  %
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: neutral.textMuted,
                    fontWeight: 600
                  }}
                >
                  Average Rate
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter Section */}
        <div
          style={{
            background: neutral.bgSurface,
            borderRadius: 16,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            padding: 24,
            marginBottom: 24
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: showFilters ? 20 : 0
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 20,
                fontWeight: 700,
                color: brand.primary,
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}
            >
              <i className='bi bi-funnel-fill'></i> Filter Records
            </h3>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                background: 'transparent',
                border: 'none',
                color: brand.primary,
                cursor: 'pointer',
                fontSize: 16,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {showFilters ? (
                <>
                  <i className='bi bi-chevron-up'></i> Hide Filters
                </>
              ) : (
                <>
                  <i className='bi bi-chevron-down'></i> Show Filters
                </>
              )}
            </button>
          </div>

          {showFilters && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 16,
                  marginBottom: 16
                }}
              >
                {/* Group Name Filter */}
                <div>
                  <label htmlFor='filter-subject-name' style={labelStyle}>
                    Subject Name
                  </label>
                  <select
                    id='filter-subject-name'
                    name='filterGroupName'
                    value={filterGroupName}
                    onChange={e => setFilterGroupName(e.target.value)}
                    style={filterInputStyle}
                  >
                    <option value='all'>Select Subject</option>
                    {uniqueGroupNames.map(name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Student Name Filter */}
                <div>
                  <label htmlFor='filter-student-name' style={labelStyle}>
                    Student Name
                  </label>
                  <input
                    id='filter-student-name'
                    name='filterStudentName'
                    type='text'
                    value={filterStudentName}
                    onChange={e => setFilterStudentName(e.target.value)}
                    placeholder='Search by name...'
                    style={filterInputStyle}
                  />
                </div>

                {/* Status Filter */}
                <div>
                  <label htmlFor='filter-status' style={labelStyle}>
                    Status
                  </label>
                  <select
                    id='filter-status'
                    name='filterStatus'
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    style={filterInputStyle}
                  >
                    <option value='all'>Select Status</option>
                    <option value='Present'>Present</option>
                    <option value='Absent'>Absent</option>
                    <option value='Late'>Late</option>
                  </select>
                </div>

                {/* Date Filter Mode */}
                <div>
                  <label htmlFor='filter-date-mode' style={labelStyle}>
                    Date Filter
                  </label>
                  <select
                    id='filter-date-mode'
                    name='filterDateMode'
                    value={dateFilterMode}
                    onChange={e => setDateFilterMode(e.target.value)}
                    style={filterInputStyle}
                  >
                    <option value='all'>All Dates</option>
                    <option value='specific'>Specific Date</option>
                    <option value='range'>Date Range</option>
                  </select>
                </div>

                {dateFilterMode === 'specific' && (
                  <div>
                    <label htmlFor='filter-date' style={labelStyle}>
                      Date
                    </label>
                    <select
                      id='filter-date'
                      name='filterDate'
                      value={filterDate}
                      onChange={e => setFilterDate(e.target.value)}
                      style={filterInputStyle}
                    >
                      <option value='all'>Select Date</option>
                      {availableDates.map(dateStr => {
                        const dateObj = new Date(dateStr)
                        const displayDate = dateObj.toLocaleDateString(
                          'en-US',
                          {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          }
                        )
                        return (
                          <option key={dateStr} value={dateStr}>
                            {displayDate}
                          </option>
                        )
                      })}
                    </select>
                  </div>
                )}

                {dateFilterMode === 'range' && (
                  <>
                    <div>
                      <label htmlFor='filter-date-start' style={labelStyle}>
                        Start Date
                      </label>
                      <input
                        id='filter-date-start'
                        name='filterDateStart'
                        type='date'
                        value={filterDateStart}
                        onChange={e => setFilterDateStart(e.target.value)}
                        style={filterInputStyle}
                      />
                    </div>
                    <div>
                      <label htmlFor='filter-date-end' style={labelStyle}>
                        End Date
                      </label>
                      <input
                        id='filter-date-end'
                        name='filterDateEnd'
                        type='date'
                        value={filterDateEnd}
                        onChange={e => setFilterDateEnd(e.target.value)}
                        style={filterInputStyle}
                      />
                    </div>
                  </>
                )}

                {/* Section Filter */}
                <div>
                  <label htmlFor='filter-section' style={labelStyle}>
                    Section
                  </label>
                  <select
                    id='filter-section'
                    name='filterSection'
                    value={filterSection}
                    onChange={e => setFilterSection(e.target.value)}
                    style={filterInputStyle}
                  >
                    <option value='all'>Select Section</option>
                    {uniqueSections.map(section => (
                      <option key={section} value={section}>
                        {section}
                      </option>
                    ))}
                  </select>
                </div>

                {/* School Year Filter */}
                <div>
                  <label htmlFor='filter-school-year' style={labelStyle}>
                    School Year
                  </label>
                  <select
                    id='filter-school-year'
                    name='filterSchoolYear'
                    value={filterSchoolYear}
                    onChange={e => setFilterSchoolYear(e.target.value)}
                    style={filterInputStyle}
                  >
                    <option value='all'>Select School Year</option>
                    {uniqueSchoolYears.map(year => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Semester Filter */}
                <div>
                  <label htmlFor='filter-semester' style={labelStyle}>
                    Semester
                  </label>
                  <select
                    id='filter-semester'
                    name='filterSemester'
                    value={filterSemester}
                    onChange={e => setFilterSemester(e.target.value)}
                    style={filterInputStyle}
                  >
                    <option value='all'>Select Semester</option>
                    <option value='1st Semester'>1st Semester</option>
                    <option value='2nd Semester'>2nd Semester</option>
                    <option value='Summer'>Summer</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={handleClearFilters}
                  style={{
                    padding: '10px 20px',
                    background: neutral.textMuted,
                    color: neutral.bgSurface,
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <i className='bi bi-x-circle'></i> Clear Filters
                </button>
              </div>
            </>
          )}
        </div>

        {/* Summary and Export */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24
          }}
        >
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: neutral.textSecondary
                }}
              >
                Total Records:{' '}
                <strong style={{ color: brand.primary }}>
                  {filteredData.length}
                </strong>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <span
                style={{
                  fontSize: 16,
                  color: statusColors.present.border,
                  fontWeight: 700
                }}
              >
                <i className='bi bi-check-circle-fill'></i> Present:{' '}
                {
                  filteredData.filter(
                    r => (r.status || '').toLowerCase() === 'present'
                  ).length
                }
              </span>
              <span
                style={{
                  fontSize: 16,
                  color: statusColors.absent.border,
                  fontWeight: 700
                }}
              >
                <i className='bi bi-x-circle-fill'></i> Absent:{' '}
                {
                  filteredData.filter(
                    r => (r.status || '').toLowerCase() === 'absent'
                  ).length
                }
              </span>
              <span
                style={{
                  fontSize: 16,
                  color: statusColors.late.border,
                  fontWeight: 700
                }}
              >
                <i className='bi bi-clock-fill'></i> Late:{' '}
                {
                  filteredData.filter(
                    r => (r.status || '').toLowerCase() === 'late'
                  ).length
                }
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleManualRefresh}
              disabled={loading}
              style={{
                padding: '12px 24px',
                background: loading
                  ? neutral.textDisabled
                  : statusColors.present.border,
                color: neutral.bgSurface,
                border: 'none',
                borderRadius: 8,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: 15,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 2px 8px rgba(40, 167, 69, 0.3)'
              }}
            >
              <i
                className={`bi bi-arrow-clockwise ${loading ? 'spin' : ''}`}
              ></i>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={handleExportCSV}
              style={{
                padding: '12px 24px',
                background: brand.primary,
                color: neutral.bgSurface,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 15,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 2px 8px rgba(32, 27, 81, 0.3)'
              }}
            >
              <i className='bi bi-download'></i> Export to CSV
            </button>
            <button
              onClick={() => setShowSummaryModal(true)}
              style={{
                padding: '12px 24px',
                background: `linear-gradient(135deg, ${brand.secondary} 0%, ${brand.primary} 100%)`,
                color: neutral.bgSurface,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 15,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)'
              }}
            >
              <i className='bi bi-table'></i> Attendance Summary
            </button>
          </div>
        </div>

        {filteredData.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
              marginBottom: 24
            }}
          >
            {[
              {
                key: 'verified',
                label: 'Verified Participants',
                accent: statusColors.present,
                stats: participantCategoryStats.verified,
                description:
                  'Roster-matched participants included in absence rules'
              }
            ].map(section => {
              const { overall, presentDelta, lastSevenSample } = section.stats
              const deltaPositive = presentDelta >= 0
              return (
                <div
                  key={section.key}
                  style={{
                    background: neutral.bgSurface,
                    borderRadius: 16,
                    padding: 20,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                    border: `2px solid ${section.accent.border}`
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 12
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10
                      }}
                    >
                      <div
                        style={{
                          background: section.accent.bg,
                          color: section.accent.text,
                          padding: '6px 12px',
                          borderRadius: 10,
                          fontWeight: 700,
                          fontSize: 13,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <i className='bi bi-people-fill'></i>
                        {section.label}
                      </div>
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                        color: section.accent.border,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      {overall.total} total
                      <span
                        style={{
                          background: section.accent.bg,
                          color: section.accent.text,
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 700,
                          border: `1px solid ${section.accent.border}`
                        }}
                      >
                        {overall.percentPresent}% present
                      </span>
                      <span
                        style={{
                          background: deltaPositive
                            ? statusColors.present.bg
                            : statusColors.absent.bg,
                          color: deltaPositive
                            ? statusColors.present.text
                            : statusColors.absent.text,
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 700,
                          border: `1px solid ${
                            deltaPositive
                              ? statusColors.present.border
                              : statusColors.absent.border
                          }`
                        }}
                      >
                        {deltaPositive ? '+' : ''}
                        {presentDelta}% (7d · {lastSevenSample || 0})
                      </span>
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10
                    }}
                  >
                    <div
                      style={{
                        fontSize: 34,
                        fontWeight: 800,
                        color: section.accent.border
                      }}
                    >
                      {overall.present}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12 }}>
                      <div style={{ color: statusColors.present.border }}>
                        Present: {overall.present}
                      </div>
                      <div style={{ color: statusColors.late.border }}>
                        Late: {overall.late}
                      </div>
                      <div style={{ color: statusColors.absent.border }}>
                        Absent: {overall.absent}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      height: 12,
                      borderRadius: 999,
                      overflow: 'hidden',
                      background: neutral.bgMuted,
                      border: `1px solid ${neutral.borderLight}`,
                      marginBottom: 12
                    }}
                    aria-label={`Trend: ${section.stats.percentPresent}% present, ${section.stats.percentLate}% late, ${section.stats.percentAbsent}% absent`}
                  >
                    <div
                      style={{
                        width: `${overall.percentPresent}%`,
                        background: statusColors.present.border,
                        transition: 'width 0.3s ease'
                      }}
                    ></div>
                    <div
                      style={{
                        width: `${overall.percentLate}%`,
                        background: statusColors.late.border,
                        transition: 'width 0.3s ease'
                      }}
                    ></div>
                    <div
                      style={{
                        width: `${overall.percentAbsent}%`,
                        background: statusColors.absent.border,
                        transition: 'width 0.3s ease'
                      }}
                    ></div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: neutral.textSecondary,
                      lineHeight: 1.4
                    }}
                  >
                    {section.description}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* LOCAL SESSIONS SECTION - Sessions from Dashboard (localStorage) */}
        {localSessions.length > 0 && (
          <div
            style={{
              background: neutral.bgSurface,
              borderRadius: 16,
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              padding: 24,
              marginBottom: 24,
              border: `2px solid ${statusColors.host.border}`
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 18,
                    color: brand.primary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <i
                    className='bi bi-laptop'
                    style={{ color: statusColors.host.border }}
                  ></i>
                  Local Sessions (From Dashboard)
                </h3>
                <span
                  style={{
                    background: statusColors.late.bg,
                    color: statusColors.late.text,
                    padding: '4px 10px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  {localSessions.length} session
                  {localSessions.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowLocalSessions(!showLocalSessions)}
                  style={{
                    padding: '6px 12px',
                    background: neutral.bgMuted,
                    border: `1px solid ${neutral.border}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  <i
                    className={`bi bi-chevron-${
                      showLocalSessions ? 'up' : 'down'
                    }`}
                  ></i>{' '}
                  {showLocalSessions ? 'Hide' : 'Show'}
                </button>
                <button
                  onClick={handleClearAllLocalSessions}
                  style={{
                    padding: '6px 12px',
                    background: statusColors.absent.border,
                    color: neutral.bgSurface,
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                  title='Clear all local sessions'
                >
                  <i className='bi bi-trash'></i> Clear All
                </button>
              </div>
            </div>

            {showLocalSessions && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                {localSessions.map(session => (
                  <div
                    key={session.id}
                    style={{
                      border: session.isSyncedToDatabase
                        ? `1px solid ${statusColors.present.border}`
                        : `1px solid ${statusColors.host.border}`,
                      borderRadius: 12,
                      padding: 16,
                      background: session.isSyncedToDatabase
                        ? statusColors.present.bg
                        : statusColors.host.bg
                    }}
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
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 8
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: 16,
                              color: brand.primary
                            }}
                          >
                            {session.subjectName || session.meetCode}
                          </span>
                          <span
                            style={{
                              background: session.isSyncedToDatabase
                                ? statusColors.present.border
                                : statusColors.host.border,
                              color: session.isSyncedToDatabase
                                ? neutral.bgSurface
                                : statusColors.late.text,
                              padding: '2px 8px',
                              borderRadius: 10,
                              fontSize: 11,
                              fontWeight: 600
                            }}
                          >
                            {session.isSyncedToDatabase ? '✓ Synced' : 'Local'}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: neutral.textMuted,
                            display: 'flex',
                            gap: 16,
                            flexWrap: 'wrap'
                          }}
                        >
                          <span>
                            <i className='bi bi-calendar'></i>{' '}
                            {session.sessionDate}
                          </span>
                          <span>
                            <i className='bi bi-people'></i>{' '}
                            {session.participantCount} participants
                          </span>
                          <span>
                            <i className='bi bi-clock'></i>{' '}
                            {new Date(session.startTime).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: true
                            })}{' '}
                            -{' '}
                            {new Date(session.endTime).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: true
                            })}
                          </span>
                          <span
                            style={{
                              color: neutral.textMuted,
                              fontStyle: 'italic'
                            }}
                          >
                            Meet: {session.meetCode}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() =>
                            setExpandedLocalSession(
                              expandedLocalSession === session.id
                                ? null
                                : session.id
                            )
                          }
                          style={{
                            padding: '6px 12px',
                            background: neutral.bgMuted,
                            border: `1px solid ${neutral.border}`,
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          <i
                            className={`bi bi-${
                              expandedLocalSession === session.id
                                ? 'chevron-up'
                                : 'chevron-down'
                            }`}
                          ></i>{' '}
                          Details
                        </button>
                        {!session.isSyncedToDatabase && (
                          <button
                            onClick={() => handleSyncSession(session)}
                            disabled={syncingSessionId === session.id}
                            style={{
                              padding: '6px 12px',
                              background:
                                syncingSessionId === session.id
                                  ? neutral.textSecondary
                                  : statusColors.present.border,
                              color: neutral.bgSurface,
                              border: 'none',
                              borderRadius: 6,
                              cursor:
                                syncingSessionId === session.id
                                  ? 'not-allowed'
                                  : 'pointer',
                              fontSize: 12
                            }}
                          >
                            <i className='bi bi-cloud-upload'></i>{' '}
                            {syncingSessionId === session.id
                              ? 'Syncing...'
                              : 'Sync to DB'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteLocalSession(session.id)}
                          style={{
                            padding: '6px 12px',
                            background: neutral.bgSurface,
                            color: statusColors.absent.border,
                            border: `1px solid ${statusColors.absent.border}`,
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          <i className='bi bi-trash'></i>
                        </button>
                      </div>
                    </div>

                    {/* Expanded participant details */}
                    {expandedLocalSession === session.id && (
                      <div
                        style={{
                          marginTop: 16,
                          background: neutral.bgSurface,
                          borderRadius: 8,
                          padding: 12,
                          maxHeight: 300,
                          overflowY: 'auto'
                        }}
                      >
                        <table style={{ width: '100%', fontSize: 13 }}>
                          <thead>
                            <tr
                              style={{
                                background: neutral.bgMuted,
                                textAlign: 'left'
                              }}
                            >
                              <th style={{ padding: 8 }}>Name</th>
                              <th style={{ padding: 8 }}>Duration</th>
                              <th style={{ padding: 8 }}>Status</th>
                              <th style={{ padding: 8 }}>Type</th>
                            </tr>
                          </thead>
                          <tbody>
                            {session.participants
                              .filter(
                                p =>
                                  p.isHost ||
                                  getHistoryParticipantCategory(p) ===
                                    'Verified'
                              )
                              .map((p, idx) => (
                                <tr
                                  key={idx}
                                  style={{
                                    borderBottom: `1px solid ${neutral.borderLight}`,
                                    background: p.isHost
                                      ? statusColors.host.bg
                                      : neutral.bgSurface
                                  }}
                                >
                                  <td style={{ padding: 8 }}>
                                    {p.isHost && (
                                      <span style={{ marginRight: 6 }}>👑</span>
                                    )}
                                    {p.name}
                                    {(() => {
                                      const category =
                                        getHistoryParticipantCategory(p)
                                      const isVerified = category === 'Verified'
                                      return (
                                        <span
                                          style={{
                                            marginLeft: 8,
                                            padding: '2px 6px',
                                            borderRadius: 6,
                                            fontSize: 10,
                                            fontWeight: 700,
                                            color: isVerified
                                              ? statusColors.present.text
                                              : statusColors.absent.text,
                                            background: isVerified
                                              ? statusColors.present.bg
                                              : statusColors.absent.bg,
                                            border: `1px solid ${
                                              isVerified
                                                ? statusColors.present.border
                                                : statusColors.absent.border
                                            }`
                                          }}
                                        >
                                          {category}
                                        </span>
                                      )
                                    })()}
                                  </td>
                                  <td style={{ padding: 8 }}>
                                    {formatDurationFromSeconds(
                                      p.durationSeconds
                                    )}
                                  </td>
                                  <td style={{ padding: 8 }}>
                                    <span
                                      style={{
                                        padding: '2px 8px',
                                        borderRadius: 10,
                                        fontSize: 11,
                                        background:
                                          p.status === 'present'
                                            ? statusColors.present.bg
                                            : p.status === 'late'
                                            ? statusColors.late.bg
                                            : statusColors.absent.bg,
                                        color:
                                          p.status === 'present'
                                            ? statusColors.present.text
                                            : p.status === 'late'
                                            ? statusColors.late.text
                                            : statusColors.absent.text
                                      }}
                                    >
                                      {p.status || 'Absent'}
                                    </span>
                                  </td>
                                  <td style={{ padding: 8 }}>
                                    {p.isHost ? (
                                      <span
                                        style={{
                                          color: statusColors.host.border,
                                          fontWeight: 600
                                        }}
                                      >
                                        Host
                                      </span>
                                    ) : (
                                      <span
                                        style={{
                                          color: statusColors.present.border
                                        }}
                                      >
                                        Verified
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Session-based view from database attendance records */}
        {sessionGroups.length > 0 && (
          <div
            style={{
              background: neutral.bgSurface,
              borderRadius: 16,
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              padding: 24,
              marginBottom: 24,
              border: `2px solid ${neutral.borderLight}`
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 18,
                    color: brand.secondary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <i className='bi bi-collection'></i>
                  Session History (By Meeting)
                </h3>
                <span
                  style={{
                    background: neutral.bgMuted,
                    color: neutral.textSecondary,
                    padding: '4px 10px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  {sessionGroups.length} session
                  {sessionGroups.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => setShowSessionGroups(!showSessionGroups)}
                style={{
                  padding: '6px 12px',
                  background: neutral.bgMuted,
                  border: `1px solid ${neutral.border}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                <i
                  className={`bi bi-chevron-${
                    showSessionGroups ? 'up' : 'down'
                  }`}
                ></i>{' '}
                {showSessionGroups ? 'Hide' : 'Show'}
              </button>
            </div>

            {showSessionGroups && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                {sessionGroups.map(session => (
                  <div
                    key={session.id}
                    style={{
                      border: `1px solid ${neutral.borderLight}`,
                      borderRadius: 12,
                      padding: 16,
                      background: neutral.bgSurface
                    }}
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
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            marginBottom: 8
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: 16,
                              color: brand.secondary
                            }}
                          >
                            {session.groupName}
                          </span>
                          <span
                            style={{
                              background: neutral.bgMuted,
                              color: neutral.textSecondary,
                              padding: '2px 8px',
                              borderRadius: 10,
                              fontSize: 11,
                              fontWeight: 600
                            }}
                          >
                            {session.participants.length} participant
                            {session.participants.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: neutral.textMuted,
                            display: 'flex',
                            gap: 16,
                            flexWrap: 'wrap'
                          }}
                        >
                          <span>
                            <i className='bi bi-calendar'></i>{' '}
                            {new Date(session.sessionDate).toLocaleDateString(
                              'en-US',
                              {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              }
                            )}
                          </span>
                          <span>
                            <i className='bi bi-hash'></i> Meet:{' '}
                            {session.meetCode}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSessionExpand(session.id)}
                        disabled={enrolledLoading === session.id}
                        style={{
                          padding: '6px 12px',
                          background: neutral.bgMuted,
                          border: `1px solid ${neutral.border}`,
                          borderRadius: 6,
                          cursor:
                            enrolledLoading === session.id ? 'wait' : 'pointer',
                          fontSize: 12,
                          opacity: enrolledLoading === session.id ? 0.7 : 1
                        }}
                      >
                        {enrolledLoading === session.id ? (
                          <>
                            <i className='bi bi-arrow-clockwise spin'></i>{' '}
                            Loading...
                          </>
                        ) : (
                          <>
                            <i
                              className={`bi bi-${
                                expandedSessionId === session.id
                                  ? 'chevron-up'
                                  : 'chevron-down'
                              }`}
                            ></i>{' '}
                            Details
                          </>
                        )}
                      </button>
                    </div>

                    {expandedSessionId === session.id && (
                      <div
                        style={{
                          marginTop: 16,
                          background: neutral.bgSurface,
                          borderRadius: 8,
                          padding: 12,
                          maxHeight: 400,
                          overflowY: 'auto'
                        }}
                      >
                        {/* Get enrolled students data if available */}
                        {(() => {
                          // Find actual session ID from participants
                          const firstP = session.participants?.[0]
                          const actualSessionId =
                            firstP?.sessionId?._id || firstP?.sessionId
                          const enrolledData = actualSessionId
                            ? enrolledStudentsData[actualSessionId]
                            : null

                          // If we have enrolled data, show ALL enrolled students grouped by status
                          if (enrolledData?.students?.length > 0) {
                            const students = enrolledData.students
                            const stats = enrolledData.stats || {}

                            return (
                              <>
                                {/* Summary Stats */}
                                <div
                                  style={{
                                    display: 'flex',
                                    gap: 12,
                                    marginBottom: 16,
                                    flexWrap: 'wrap'
                                  }}
                                >
                                  <span
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: 8,
                                      background: neutral.bgMuted,
                                      fontWeight: 600,
                                      fontSize: 12
                                    }}
                                  >
                                    <i className='bi bi-people'></i> Total
                                    Enrolled: {stats.totalEnrolled || 0}
                                  </span>
                                  <span
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: 8,
                                      background: statusColors.present.bg,
                                      color: statusColors.present.text,
                                      fontWeight: 600,
                                      fontSize: 12
                                    }}
                                  >
                                    <i className='bi bi-check-circle'></i>{' '}
                                    Present: {stats.present || 0}
                                  </span>
                                  <span
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: 8,
                                      background: statusColors.late.bg,
                                      color: statusColors.late.text,
                                      fontWeight: 600,
                                      fontSize: 12
                                    }}
                                  >
                                    <i className='bi bi-clock'></i> Late:{' '}
                                    {stats.late || 0}
                                  </span>
                                  <span
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: 8,
                                      background: statusColors.absent.bg,
                                      color: statusColors.absent.text,
                                      fontWeight: 600,
                                      fontSize: 12
                                    }}
                                  >
                                    <i className='bi bi-x-circle'></i> Absent:{' '}
                                    {stats.absent || 0}
                                  </span>
                                </div>

                                {/* Enrolled Students Table */}
                                <div style={{ marginBottom: 24 }}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 10,
                                      marginBottom: 12,
                                      borderBottom: `2px solid ${brand.primary}`,
                                      paddingBottom: 6
                                    }}
                                  >
                                    <div
                                      style={{
                                        background: brand.primary,
                                        color: '#ffffff',
                                        padding: '4px 10px',
                                        borderRadius: 8,
                                        fontWeight: 700,
                                        fontSize: 12,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6
                                      }}
                                    >
                                      <i className='bi bi-mortarboard-fill'></i>{' '}
                                      Enrolled Students
                                    </div>
                                    <span
                                      style={{
                                        fontWeight: 700,
                                        fontSize: 12,
                                        color: brand.primary
                                      }}
                                    >
                                      {students.length} student
                                      {students.length === 1 ? '' : 's'}
                                    </span>
                                  </div>
                                  <table
                                    style={{ width: '100%', fontSize: 13 }}
                                  >
                                    <thead>
                                      <tr
                                        style={{
                                          background: neutral.bgMuted,
                                          textAlign: 'left'
                                        }}
                                      >
                                        <th style={{ padding: 8 }}>
                                          Student Name
                                        </th>
                                        <th style={{ padding: 8 }}>
                                          Student ID
                                        </th>
                                        <th style={{ padding: 8 }}>Section</th>
                                        <th style={{ padding: 8 }}>Time In</th>
                                        <th style={{ padding: 8 }}>Time Out</th>
                                        <th style={{ padding: 8 }}>Duration</th>
                                        <th style={{ padding: 8 }}>Status</th>
                                        <th style={{ padding: 8 }}>Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {students
                                        .filter(s => !s.isUnauthenticated)
                                        .map((student, idx) => (
                                          <tr
                                            key={
                                              student.attendanceId ||
                                              student.userId ||
                                              idx
                                            }
                                            style={{
                                              borderBottom: `1px solid ${neutral.borderLight}`,
                                              background:
                                                student.status === 'absent'
                                                  ? statusColors.absent.bg
                                                  : neutral.bgSurface
                                            }}
                                          >
                                            <td style={{ padding: 8 }}>
                                              {student.fullName}
                                            </td>
                                            <td style={{ padding: 8 }}>
                                              {student.studentId || 'N/A'}
                                            </td>
                                            <td style={{ padding: 8 }}>
                                              {student.section || 'N/A'}
                                            </td>
                                            <td style={{ padding: 8 }}>
                                              {formatTimeDisplay(
                                                student.firstJoinTime ||
                                                  student.joinTimeIso ||
                                                  student.joinTime
                                              )}
                                            </td>
                                            <td style={{ padding: 8 }}>
                                              {formatTimeDisplay(
                                                student.leaveTimeIso ||
                                                  student.leaveTime
                                              )}
                                            </td>
                                            <td style={{ padding: 8 }}>
                                              {formatDurationFromSeconds(
                                                student.duration || 0
                                              )}
                                            </td>
                                            <td style={{ padding: 8 }}>
                                              {getStatusBadge(student.status)}
                                            </td>
                                            <td style={{ padding: 8 }}>
                                              {student.attendanceId ? (
                                                editingAttendanceId ===
                                                student.attendanceId ? (
                                                  <div
                                                    style={{
                                                      display: 'flex',
                                                      gap: 8,
                                                      alignItems: 'center',
                                                      flexWrap: 'wrap'
                                                    }}
                                                  >
                                                    <select
                                                      value={editingStatus}
                                                      onChange={e =>
                                                        setEditingStatus(
                                                          e.target.value
                                                        )
                                                      }
                                                      style={{
                                                        padding: '4px 8px',
                                                        borderRadius: 4
                                                      }}
                                                    >
                                                      <option value='Present'>
                                                        Present
                                                      </option>
                                                      <option value='Late'>
                                                        Late
                                                      </option>
                                                      <option value='Absent'>
                                                        Absent
                                                      </option>
                                                    </select>
                                                    <button
                                                      onClick={() =>
                                                        handleSaveParticipantStatus(
                                                          {
                                                            ...student,
                                                            attendanceId:
                                                              student.attendanceId
                                                          }
                                                        )
                                                      }
                                                      style={{
                                                        padding: '4px 8px',
                                                        background:
                                                          statusColors.present
                                                            .bg,
                                                        border: 'none',
                                                        borderRadius: 4,
                                                        cursor: 'pointer'
                                                      }}
                                                    >
                                                      Save
                                                    </button>
                                                    <button
                                                      onClick={
                                                        handleCancelParticipantEdit
                                                      }
                                                      style={{
                                                        padding: '4px 8px',
                                                        background:
                                                          neutral.bgMuted,
                                                        border: 'none',
                                                        borderRadius: 4,
                                                        cursor: 'pointer'
                                                      }}
                                                    >
                                                      Cancel
                                                    </button>
                                                  </div>
                                                ) : (
                                                  <button
                                                    onClick={() =>
                                                      handleEditParticipantStatus(
                                                        {
                                                          ...student,
                                                          attendanceId:
                                                            student.attendanceId
                                                        }
                                                      )
                                                    }
                                                    style={{
                                                      padding: '4px 8px',
                                                      background:
                                                        neutral.bgMuted,
                                                      border: `1px solid ${neutral.border}`,
                                                      borderRadius: 4,
                                                      cursor: 'pointer',
                                                      fontSize: 11
                                                    }}
                                                  >
                                                    <i className='bi bi-pencil'></i>{' '}
                                                    Edit
                                                  </button>
                                                )
                                              ) : (
                                                <span
                                                  style={{
                                                    color: neutral.textMuted,
                                                    fontSize: 11
                                                  }}
                                                >
                                                  —
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            )
                          }

                          // Fallback to original display if no enrolled data
                          return null
                        })()}

                        {/* Fallback: Original display when no enrolled data available */}
                        {(() => {
                          const firstP = session.participants?.[0]
                          const actualSessionId =
                            firstP?.sessionId?._id || firstP?.sessionId
                          const enrolledData = actualSessionId
                            ? enrolledStudentsData[actualSessionId]
                            : null
                          if (enrolledData?.students?.length > 0) return null

                          return [
                            {
                              key: 'verified',
                              title: 'Verified Participants',
                              accent: statusColors.present,
                              rows: (session.participants || []).filter(
                                p =>
                                  getHistoryParticipantCategory(p) ===
                                  'Verified'
                              ),
                              emptyText: 'No verified participants recorded'
                            }
                          ].map(section => (
                            <div key={section.key} style={{ marginBottom: 24 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  marginBottom: 12,
                                  borderBottom: `2px solid ${section.accent.border}`,
                                  paddingBottom: 6
                                }}
                              >
                                <div
                                  style={{
                                    background: section.accent.bg,
                                    border: `1px solid ${section.accent.border}`,
                                    color: section.accent.text,
                                    padding: '4px 10px',
                                    borderRadius: 8,
                                    fontWeight: 700,
                                    fontSize: 12,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6
                                  }}
                                >
                                  <i className='bi bi-people-fill'></i>{' '}
                                  {section.title}
                                </div>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    fontSize: 12,
                                    color: section.accent.border
                                  }}
                                >
                                  {section.rows.length} participant
                                  {section.rows.length === 1 ? '' : 's'}
                                </span>
                              </div>
                              <table style={{ width: '100%', fontSize: 13 }}>
                                <thead>
                                  <tr
                                    style={{
                                      background: neutral.bgMuted,
                                      textAlign: 'left'
                                    }}
                                  >
                                    <th style={{ padding: 8 }}>
                                      Participant Name
                                    </th>
                                    <th style={{ padding: 8 }}>
                                      Participant ID
                                    </th>
                                    <th style={{ padding: 8 }}>Group Name</th>
                                    <th style={{ padding: 8 }}>Time In</th>
                                    <th style={{ padding: 8 }}>Time Out</th>
                                    <th style={{ padding: 8 }}>Duration</th>
                                    <th style={{ padding: 8 }}>Date</th>
                                    <th style={{ padding: 8 }}>Status</th>
                                    <th style={{ padding: 8 }}>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {section.rows.length === 0 ? (
                                    <tr>
                                      <td
                                        colSpan={10}
                                        style={{
                                          padding: 16,
                                          textAlign: 'center'
                                        }}
                                      >
                                        <span
                                          style={{ color: neutral.textMuted }}
                                        >
                                          {section.emptyText}
                                        </span>
                                      </td>
                                    </tr>
                                  ) : (
                                    section.rows.map((p, idx) => (
                                      <tr
                                        key={`${section.key}-${idx}`}
                                        style={{
                                          borderBottom: `1px solid ${neutral.borderLight}`,
                                          background:
                                            idx % 2 === 0
                                              ? neutral.bgSurface
                                              : neutral.bgMuted
                                        }}
                                      >
                                        <td style={{ padding: 8 }}>
                                          {p.isHost && (
                                            <span style={{ marginRight: 6 }}>
                                              👑
                                            </span>
                                          )}
                                          {p.fullName ||
                                            p.participantName ||
                                            'Unknown'}
                                          {(() => {
                                            const category =
                                              getHistoryParticipantCategory(p)
                                            const isVerified =
                                              category === 'Verified'
                                            return (
                                              <span
                                                style={{
                                                  marginLeft: 8,
                                                  padding: '2px 6px',
                                                  borderRadius: 6,
                                                  fontSize: 10,
                                                  fontWeight: 700,
                                                  color: isVerified
                                                    ? statusColors.present.text
                                                    : statusColors.absent.text,
                                                  background: isVerified
                                                    ? statusColors.present.bg
                                                    : statusColors.absent.bg,
                                                  border: `1px solid ${
                                                    isVerified
                                                      ? statusColors.present
                                                          .border
                                                      : statusColors.absent
                                                          .border
                                                  }`
                                                }}
                                              >
                                                {category}
                                              </span>
                                            )
                                          })()}
                                        </td>
                                        <td style={{ padding: 8 }}>
                                          {p.user?.studentId ||
                                            p.studentId ||
                                            'N/A'}
                                        </td>
                                        <td style={{ padding: 8 }}>
                                          {p.groupName || session.groupName}
                                        </td>
                                        <td style={{ padding: 8 }}>
                                          {formatTimeDisplay(
                                            p.firstJoinTime ||
                                              p.joinTimeIso ||
                                              p.joinTime
                                          )}
                                        </td>
                                        <td style={{ padding: 8 }}>
                                          {formatTimeDisplay(
                                            p.leaveTimeIso || p.leaveTime
                                          )}
                                        </td>
                                        <td style={{ padding: 8 }}>
                                          {formatDurationFromSeconds(
                                            p.durationSeconds ?? p.duration ?? 0
                                          )}
                                        </td>
                                        <td style={{ padding: 8 }}>
                                          {p.createdAt
                                            ? new Date(
                                                p.createdAt
                                              ).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                              })
                                            : 'N/A'}
                                        </td>
                                        <td style={{ padding: 8 }}>
                                          {getStatusBadge(p.status)}
                                        </td>
                                        <td style={{ padding: 8 }}>
                                          {editingAttendanceId ===
                                          p.attendanceId ? (
                                            <div
                                              style={{
                                                display: 'flex',
                                                gap: 8,
                                                alignItems: 'center',
                                                flexWrap: 'wrap'
                                              }}
                                            >
                                              <select
                                                value={editingStatus}
                                                onChange={e =>
                                                  setEditingStatus(
                                                    e.target.value
                                                  )
                                                }
                                                style={{
                                                  padding: '6px 10px',
                                                  borderRadius: 6,
                                                  border: `1px solid ${brand.primary}`,
                                                  fontSize: 12,
                                                  fontWeight: 600,
                                                  cursor: 'pointer',
                                                  outline: 'none'
                                                }}
                                              >
                                                <option value='Present'>
                                                  Present
                                                </option>
                                                <option value='Late'>
                                                  Late
                                                </option>
                                                <option value='Absent'>
                                                  Absent
                                                </option>
                                              </select>
                                              <button
                                                onClick={() =>
                                                  handleSaveParticipantStatus(p)
                                                }
                                                style={{
                                                  background:
                                                    statusColors.present.border,
                                                  color: neutral.bgSurface,
                                                  border: 'none',
                                                  padding: '6px 10px',
                                                  borderRadius: 6,
                                                  cursor: 'pointer',
                                                  fontWeight: 600,
                                                  fontSize: 12
                                                }}
                                              >
                                                Save
                                              </button>
                                              <button
                                                onClick={
                                                  handleCancelParticipantEdit
                                                }
                                                style={{
                                                  background: neutral.textMuted,
                                                  color: neutral.bgSurface,
                                                  border: 'none',
                                                  padding: '6px 10px',
                                                  borderRadius: 6,
                                                  cursor: 'pointer',
                                                  fontWeight: 600,
                                                  fontSize: 12
                                                }}
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          ) : (
                                            <button
                                              onClick={() =>
                                                handleEditParticipantStatus(p)
                                              }
                                              style={{
                                                background:
                                                  statusColors.late.border,
                                                color: brand.primary,
                                                border: 'none',
                                                padding: '6px 10px',
                                                borderRadius: 6,
                                                cursor: 'pointer',
                                                fontWeight: 600,
                                                fontSize: 12
                                              }}
                                            >
                                              Adjust Status
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          ))
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Attendance Summary Modal */}
      <AttendanceSummaryModal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
      />

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
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
          ? brand.accent
          : hover
          ? brand.accent
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

const filterInputStyle = {
  padding: '10px 14px',
  borderRadius: 8,
  border: `1px solid ${neutral.border}`,
  fontSize: 15,
  color: brand.primary,
  background: neutral.bgSurface,
  cursor: 'pointer',
  fontWeight: 500,
  outline: 'none',
  width: '100%'
}

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 14,
  fontWeight: 600,
  color: brand.primary
}

export default History
