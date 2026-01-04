import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 4: CSS classes for theme-aware styling
import '../styles/common.css'
import logo from '../assets/logo.png'
import { logout, getCurrentUser } from '../utils/auth'
import { apiPost, apiGet } from '../utils/api'
import { storeTokenInExtensionStorage } from '../utils/extensionStorage'
import { AUTH_KEYS } from '../utils/constants/storage'
import { brand, neutral, status as statusColors } from '../utils/colors'
import { Alert } from '../components/ui'
import NotificationBell from '../components/NotificationBell'
import UserMenu from '../components/layout/UserMenu'

const navItems = [
  { icon: 'bi-speedometer2', label: 'DASHBOARD', path: '/dashboard' },
  {
    icon: 'bi-calendar-check',
    label: 'ATTENDANCE LOGS',
    path: '/attendance-logs'
  },
  {
    icon: 'bi-megaphone',
    label: 'ANNOUNCEMENTS',
    path: '/student-announcements'
  },
  { icon: 'bi-journal-text', label: 'NOTES', path: '/notes' },
  { icon: 'bi-people-fill', label: 'SUBJECT', path: '/group' },
  { icon: 'bi-box-arrow-right', label: 'LOGOUT', path: '/logout' }
]

// No hardcoded demo data - only show real groups from database

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]

const parseTimeToMinutes = value => {
  if (!value) return null
  const [hStr, mStr = '0'] = String(value).split(':')
  const h = Number(hStr)
  const m = Number(mStr)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

const parseDateOnly = value => {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

const getJoinScheduleState = (schedule, dayLabel, timeLabel, isActive) => {
  if (isActive === false) {
    return {
      canJoinNow: false,
      status: 'inactive',
      reason: 'This subject is inactive.'
    }
  }

  if (!schedule || typeof schedule !== 'object') {
    return {
      canJoinNow: false,
      status: 'no_schedule',
      reason:
        'Schedule is not set for this subject. Please coordinate with your administrator.'
    }
  }

  const { weekdays, startTime, endTime, startDate, endDate } = schedule
  if (
    !Array.isArray(weekdays) ||
    weekdays.length === 0 ||
    !startTime ||
    !endTime
  ) {
    return {
      canJoinNow: false,
      status: 'invalid',
      reason:
        'Schedule information is incomplete. Please coordinate with your administrator.'
    }
  }

  const now = new Date()
  const todayName = WEEKDAY_NAMES[now.getDay()]
  const todayDateOnly = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  )

  const scheduleStart = startDate ? parseDateOnly(startDate) : null
  const scheduleEnd = endDate ? parseDateOnly(endDate) : null
  if (scheduleStart && todayDateOnly < scheduleStart) {
    return {
      canJoinNow: false,
      status: 'before_date_range',
      reason: 'Class schedule has not started yet.'
    }
  }
  if (scheduleEnd && todayDateOnly > scheduleEnd) {
    return {
      canJoinNow: false,
      status: 'after_date_range',
      reason: 'Class schedule has already ended.'
    }
  }

  if (!weekdays.includes(todayName)) {
    const dayText =
      dayLabel && dayLabel !== 'N/A' ? dayLabel : weekdays.join(', ')
    return {
      canJoinNow: false,
      status: 'wrong_day',
      reason: `This class is scheduled on ${dayText}.`
    }
  }

  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)
  if (
    startMinutes == null ||
    endMinutes == null ||
    endMinutes <= startMinutes
  ) {
    return {
      canJoinNow: false,
      status: 'invalid_time',
      reason:
        'Schedule time configuration is invalid. Please coordinate with your administrator.'
    }
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const timeWindowLabel =
    timeLabel && timeLabel !== '—' && timeLabel !== 'N/A'
      ? timeLabel
      : `${startTime} - ${endTime}`

  if (nowMinutes < startMinutes) {
    return {
      canJoinNow: false,
      status: 'before_time',
      reason: `You can join only during the scheduled time (${timeWindowLabel}).`
    }
  }

  if (nowMinutes > endMinutes) {
    return {
      canJoinNow: false,
      status: 'after_time',
      reason: `Class time has ended. Scheduled time was ${timeWindowLabel}.`
    }
  }

  return {
    canJoinNow: true,
    status: 'within_time',
    reason: ''
  }
}

const Group = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [currentUser] = useState(() => getCurrentUser())
  const [modalIdx, setModalIdx] = useState(null)
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [liveSubjectIds, setLiveSubjectIds] = useState(() => new Set())

  // Load user's groups (both actual group memberships and subjects by section)
  useEffect(() => {
    const loadUserGroups = async () => {
      try {
        setLoading(true)
        // Get user data from localStorage using constants
        let user = null
        try {
          const u = localStorage.getItem(AUTH_KEYS.USER)
          user = u ? JSON.parse(u) : null
        } catch (e) {
          // Silent parse error - user data not available
          console.debug('User parse error:', e)
        }

        if (!user || !user._id) {
          setError('Not authenticated. Please login again.')
          setLoading(false)
          return
        }

        // Get student section
        const studentSection = user.section
        if (!studentSection) {
          setError('No section assigned to your account.')
          setLoading(false)
          return
        }

        // Fetch subjects filtered by student's section
        let subjects = []
        try {
          const subjectsResponse = await apiGet(
            `subjects/student/section/${encodeURIComponent(studentSection)}`
          )

          if (!subjectsResponse.ok) {
            const errorData = await subjectsResponse.json().catch(() => ({
              error: 'Network error',
              message: 'Failed to connect to server'
            }))
            throw new Error(
              errorData.message ||
                errorData.error ||
                `HTTP ${subjectsResponse.status}: ${subjectsResponse.statusText}`
            )
          }

          const subjectsResult = await subjectsResponse.json()

          if (subjectsResult.success && Array.isArray(subjectsResult.data)) {
            // Map subjects to display format
            subjects = subjectsResult.data.map(subject => ({
              _id: subject._id,
              groupName: subject.subjectName,
              description: subject.subjectCode,
              section: studentSection,
              timeSchedule: subject.time,
              day: subject.day,
              schedule: subject.schedule || null,
              isActive: subject.isActive,
              instructorId: subject.instructorId,
              subjectId: subject._id,
              schoolYear: subject.schoolYear,
              semester: subject.semester,
              room: subject.room,
              meetingLink: subject.meetingLink || '',
              members: [], // Subjects don't have members array
              isActualGroup: false
            }))
          }
        } catch (subjectsError) {
          console.error('Error loading subjects:', subjectsError)
        }

        setGroups(subjects)

        if (subjects.length === 0) {
          setError('No subjects found for your section.')
        }
      } catch (error) {
        console.error('Error loading groups:', error)
        setError('Failed to load groups')
      } finally {
        setLoading(false)
      }
    }

    loadUserGroups()
  }, [])

  useEffect(() => {
    if (!groups || groups.length === 0) {
      setLiveSubjectIds(new Set())
      return
    }

    let isCancelled = false

    const fetchLiveMeetings = async () => {
      try {
        const response = await apiGet('attendance/live-participants')
        if (!response.ok) {
          return
        }
        const result = await response.json()
        if (!result?.success || !Array.isArray(result.meetings)) {
          return
        }

        const next = new Set()
        result.meetings.forEach(meeting => {
          const subjectId = meeting?.subjectId
          if (subjectId) {
            next.add(subjectId.toString())
          }
        })

        if (!isCancelled) {
          setLiveSubjectIds(next)
        }
      } catch {
        // Silent failure - UI will still enforce schedule gating
      }
    }

    fetchLiveMeetings()
    const interval = setInterval(fetchLiveMeetings, 8000)

    return () => {
      isCancelled = true
      clearInterval(interval)
    }
  }, [groups])

  const handleNavigation = path => {
    if (path === '/logout') {
      logout(navigate)
    } else {
      navigate(path)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        fontFamily: 'Segoe UI, sans-serif',
        background: neutral.bgPage,
        overflow: 'hidden'
      }}
    >
      <aside
        style={{
          width: 290,
          background: brand.primary,
          color: '#ffffff', // Fixed: Always white on brand background
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '40px 0',
          boxShadow: '2px 0 16px rgba(44,44,84,0.08)',
          height: '100vh'
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
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            marginBottom: 60
          }}
        />
        <nav style={{ width: '100%', overflowY: 'auto', flex: 1 }}>
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

      <main
        style={{
          flex: 1,
          padding: '48px 60px',
          height: '100vh',
          overflowY: 'auto',
          background: neutral.bgSurface
        }}
      >
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
            SUBJECT
          </h2>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              position: 'relative'
            }}
          >
            <NotificationBell />
            <UserMenu
              user={currentUser}
              onProfileClick={() => navigate('/profile')}
              onSettingsClick={() => alert('Settings')}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <i
              className='bi bi-hourglass-split'
              style={{ fontSize: 48, color: brand.secondary, marginBottom: 16 }}
            ></i>
            <p style={{ color: neutral.textSecondary, fontSize: 18 }}>
              Loading your subjects...
            </p>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Alert type='error'>{error}</Alert>
          </div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <i
              className='bi bi-people'
              style={{
                fontSize: 64,
                color: neutral.textDisabled,
                marginBottom: 20,
                display: 'block'
              }}
            ></i>
            <h3
              style={{
                color: neutral.textSecondary,
                fontSize: 20,
                marginBottom: 8,
                fontWeight: 600
              }}
            >
              No Subjects Found
            </h3>
            <p
              style={{
                color: neutral.textMuted,
                fontSize: 16,
                marginBottom: 24
              }}
            >
              You're not enrolled in any groups yet
            </p>
            <p style={{ color: neutral.textSecondary, fontSize: 14 }}>
              Groups are automatically assigned based on your section. Please
              contact your administrator if you believe this is an error.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 40
            }}
          >
            {groups.map((group, idx) => (
              <GroupCard
                key={group._id}
                group={group}
                onDotsClick={() => setModalIdx(idx)}
                isMeetingLive={liveSubjectIds.has(
                  (group.subjectId || group._id).toString()
                )}
              />
            ))}
          </div>
        )}
        {modalIdx !== null && groups[modalIdx] && (
          <GroupDetailsModal
            card={groups[modalIdx]}
            onClose={() => setModalIdx(null)}
          />
        )}
      </main>
    </div>
  )
}

const SidebarItem = ({ icon, label, isActive, isLast, onClick }) => {
  const [hover, setHover] = React.useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '18px 38px',
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: 20,
        letterSpacing: 0.5,
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
    >
      <i
        className={`bi ${icon}`}
        style={{ fontSize: 26, color: neutral.bgSurface, marginRight: 22 }}
      ></i>
      <span
        style={{
          fontStyle: 'italic',
          color: neutral.bgSurface,
          letterSpacing: 1
        }}
      >
        {label}
      </span>
    </div>
  )
}

const GroupCard = ({ group, onDotsClick, isMeetingLive }) => {
  // Use subjectId if available, otherwise use group._id (for backward compatibility during migration)
  const subjectId = group.subjectId || group._id

  const instructorName = group.instructorId
    ? `${group.instructorId.firstName} ${group.instructorId.lastName}`
    : 'Unknown Instructor'

  // Show total invited members (same behavior as instructor cards)
  const totalMembers = Array.isArray(group.members) ? group.members.length : 0

  const scheduleTime = group.timeSchedule || 'TBD'

  // Check if current user is restricted
  let currentUserId = null
  let user = null
  try {
    const u = localStorage.getItem('user')
    const parsed = u ? JSON.parse(u) : null
    currentUserId = parsed && parsed._id ? parsed._id : null
    user = parsed
  } catch (e) {
    // Silent parse error
    console.debug('User parse error in GroupCard:', e)
  }
  const currentUserMember = group.members
    ? group.members.find(m => m.userId.toString() === currentUserId)
    : null

  const isRestricted = currentUserMember
    ? currentUserMember.isRestricted
    : false
  const restrictionReason = currentUserMember
    ? currentUserMember.restrictionReason
    : null

  const joinScheduleState = useMemo(
    () =>
      getJoinScheduleState(
        group.schedule,
        group.day,
        group.timeSchedule,
        group.isActive
      ),
    [group.schedule, group.day, group.timeSchedule, group.isActive]
  )
  const canJoinMeeting = Boolean(isMeetingLive || joinScheduleState.canJoinNow)

  // Attendance tracking state
  const [isTracking, setIsTracking] = useState(false)
  const [trackingStartTime, setTrackingStartTime] = useState(null)
  const [trackingDuration, setTrackingDuration] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [trackingMessage, setTrackingMessage] = useState('')
  const [joiningMeeting, setJoiningMeeting] = useState(false) // Loading state for joining

  // Format duration as HH:mm:ss
  const formatDuration = seconds => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(
        secs
      ).padStart(2, '0')}`
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`
  }

  // Format time as HH:mm:ss
  const formatTime = date => {
    if (!date) return ''
    const d = date instanceof Date ? date : new Date(date)
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const seconds = String(d.getSeconds()).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  }

  // Format date as dd/mm/yyyy
  const formatDate = date => {
    if (!date) return ''
    const d = date instanceof Date ? date : new Date(date)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  }

  // Stop attendance tracking - wrapped in useCallback for useEffect dependency
  const stopAttendanceTracking = useCallback(() => {
    const activeSessionKey = `attendance_session_${subjectId}`
    localStorage.removeItem(activeSessionKey)
    setIsTracking(false)
    setTrackingStartTime(null)
    setTrackingDuration(0)
    setTrackingMessage('')
  }, [subjectId])

  // Calculate class end time from schedule + duration - wrapped in useCallback for useEffect dependency
  const calculateClassEndTime = useCallback(() => {
    if (!group.timeSchedule) {
      return null
    }

    const classStartTime = new Date(group.timeSchedule)
    const classEndTime = new Date(classStartTime)

    // Add duration from group.classDurationMinutes or default to 120 minutes (2 hours)
    const durationMinutes = group.classDurationMinutes || 120
    classEndTime.setMinutes(classEndTime.getMinutes() + durationMinutes)

    return classEndTime
  }, [group.timeSchedule, group.classDurationMinutes])

  // Send real-time progress update to backend
  const sendProgressUpdate = useCallback(
    async (eventType = 'progress') => {
      console.log(`🚀 sendProgressUpdate called with eventType: ${eventType}`)
      console.log('   isTracking:', isTracking)
      console.log('   trackingStartTime:', trackingStartTime)

      try {
        const activeSessionKey = `attendance_session_${subjectId}`
        const tokenKey = `attendance_token_${subjectId}`

        const sessionData = JSON.parse(
          localStorage.getItem(activeSessionKey) || '{}'
        )
        const tokenData = JSON.parse(localStorage.getItem(tokenKey) || '{}')

        console.log('📦 Retrieved from localStorage:')
        console.log('   sessionData:', sessionData)
        console.log('   tokenData:', tokenData)

        if (!tokenData.token || !tokenData.subjectId) {
          console.error('❌ Missing token data for progress update!')
          console.error('   token:', tokenData.token)
          console.error('   subjectId:', tokenData.subjectId)
          return
        }

        // For join events, get start time from sessionData if trackingStartTime not yet set
        const startTime =
          trackingStartTime ||
          (sessionData.startTime ? new Date(sessionData.startTime) : new Date())

        const now = new Date()
        const durationSeconds = Math.floor((now - startTime) / 1000)

        // Format data for progress endpoint
        const progressPayload = {
          type: eventType, // 'join', 'leave', or 'progress'
          meetCode: sessionData.meetCode || tokenData.meetCode,
          timestamp: now.toISOString(),
          sessionDate: startTime.toISOString(),
          verificationToken: tokenData.token,
          subjectId: tokenData.subjectId,
          participant: {
            name:
              `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
              'Unknown',
            participantId: user._id,
            joinTimeIso: startTime.toISOString(),
            leaveTimeIso: now.toISOString(),
            durationSeconds: durationSeconds,
            isCurrentlyInMeeting: eventType !== 'leave'
          },
          currentParticipants: [] // Extension would send full list, manual tracking sends just self
        }

        console.log(
          `📡 Sending ${eventType} progress update to /api/attendance/progress`
        )
        console.log('📦 Payload:', JSON.stringify(progressPayload, null, 2))

        const response = await apiPost('attendance/progress', progressPayload)
        console.log('📥 Response status:', response.status, response.statusText)

        const result = await response.json()
        console.log('📥 Response data:', result)

        if (!result.success) {
          console.warn('⚠️ Progress update failed:', result.message)
        } else {
          console.log('✅ Progress update successful!')
        }
      } catch (error) {
        console.error('❌ Error sending progress update:', error)
        console.error('   Error details:', error.message)
        console.error('   Stack:', error.stack)
        // Don't fail tracking on progress update errors
      }
    },
    [isTracking, trackingStartTime, user, subjectId]
  )

  // Submit attendance data to backend - wrapped in useCallback for useEffect dependency
  const submitAttendanceData = useCallback(
    async (manual = false) => {
      if (!user || !user._id) {
        if (manual) {
          alert('Please login to record attendance')
        }
        return
      }

      const tokenKey = `attendance_token_${subjectId}`
      const activeSessionKey = `attendance_session_${subjectId}`

      try {
        const tokenDataStr = localStorage.getItem(tokenKey)
        const sessionDataStr = localStorage.getItem(activeSessionKey)

        if (!tokenDataStr || !sessionDataStr) {
          if (manual) {
            alert(
              'No active attendance session found. Please join the meeting first.'
            )
          }
          return
        }

        const tokenData = JSON.parse(tokenDataStr)
        const sessionData = JSON.parse(sessionDataStr)

        // Check if token is expired
        if (new Date() >= new Date(tokenData.expiresAt)) {
          if (manual) {
            alert(
              'Attendance token has expired. Please join the meeting again.'
            )
          }
          stopAttendanceTracking()
          return
        }

        setIsSubmitting(true)
        setTrackingMessage(
          manual
            ? 'Recording your attendance...'
            : 'Auto-submitting attendance...'
        )

        const sessionDate = new Date(sessionData.startTime)

        // Use scraped time out from session data (real-time scraped value)
        let endTime = new Date()
        const classEndTime = calculateClassEndTime()

        // Check if session data has a scraped leaveTime (real-time scraped value)
        if (sessionData.leaveTime) {
          const scrapedLeaveTime = new Date(sessionData.leaveTime)
          // Ensure scraped time is valid and not earlier than start time
          if (
            scrapedLeaveTime &&
            !isNaN(scrapedLeaveTime.getTime()) &&
            scrapedLeaveTime >= sessionDate
          ) {
            endTime = scrapedLeaveTime
            console.log(
              '✅ Using scraped time out from session data:',
              formatTime(endTime)
            )
          }
        }

        // If auto-submit and class has ended, capture current time as final time out
        if (!manual && classEndTime && new Date() >= classEndTime) {
          const currentTime = new Date()
          // Use current time as final time out (real-time capture at class end)
          endTime = currentTime
          console.log(
            '✅ Class ended - captured current time as final time out:',
            formatTime(endTime)
          )

          // Update session data with final time out
          sessionData.leaveTime = currentTime.toISOString()
          sessionData.finalTimeOut = currentTime.toISOString()
          localStorage.setItem(activeSessionKey, JSON.stringify(sessionData))
        } else if (manual) {
          // For manual submission, use current time
          endTime = new Date()
          // Update session data with current time out
          sessionData.leaveTime = endTime.toISOString()
          localStorage.setItem(activeSessionKey, JSON.stringify(sessionData))
        }

        // Calculate duration from start time to end time
        const durationSeconds = Math.floor((endTime - sessionDate) / 1000)
        const durationMinutes = Math.floor(durationSeconds / 60)

        // Extract meetCode from meeting link or session data
        let meetCode = sessionData.meetCode || tokenData.meetCode
        if (!meetCode && group.meetingLink) {
          const meetCodeMatch = group.meetingLink.match(
            /(?:meet\.google\.com\/|hangouts\.google\.com\/call\/|\/)([a-z]+-[a-z]+-[a-z]+)/i
          )
          if (meetCodeMatch) {
            meetCode = meetCodeMatch[1]
          }
        }

        if (!meetCode) {
          throw new Error('Unable to extract meet code from meeting link')
        }

        // Prepare attendance data according to backend format
        const attendancePayload = {
          meetCode: meetCode,
          date: formatDate(sessionDate),
          startTime: formatTime(sessionDate),
          stopTime: formatTime(endTime),
          participants: [
            {
              name:
                `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
                'Unknown',
              joinTime: formatTime(sessionDate),
              joinTimeIso: sessionDate.toISOString(),
              leaveTime: formatTime(endTime),
              leaveTimeIso: endTime.toISOString(),
              attendedDuration: durationMinutes
            }
          ],
          subjectId: tokenData.subjectId || subjectId,
          verificationToken: tokenData.token
        }

        // Send leave event before final submission
        await sendProgressUpdate('leave')

        console.log('Submitting attendance data:', attendancePayload)

        const response = await apiPost('attendance', attendancePayload)
        const result = await response.json()

        if (result.success) {
          setTrackingMessage('Attendance recorded successfully!')
          stopAttendanceTracking()

          // Show success message
          setTimeout(() => {
            setTrackingMessage('')
          }, 3000)

          console.log('✅ Attendance submitted successfully:', result)
        } else {
          throw new Error(
            result.message || result.error || 'Failed to record attendance'
          )
        }
      } catch (error) {
        console.error('Error submitting attendance:', error)
        setTrackingMessage(
          `Error: ${error.message || 'Failed to record attendance'}`
        )
        setTimeout(() => {
          setTrackingMessage('')
        }, 5000)
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      user,
      subjectId,
      group.meetingLink,
      calculateClassEndTime,
      stopAttendanceTracking,
      sendProgressUpdate
    ]
  )

  // Check if there's an active tracking session on mount
  useEffect(() => {
    const activeSessionKey = `attendance_session_${subjectId}`

    try {
      const sessionData = localStorage.getItem(activeSessionKey)
      if (sessionData) {
        const session = JSON.parse(sessionData)
        const startTime = new Date(session.startTime)
        const currentTime = Date.now()
        const elapsed = Math.floor((currentTime - startTime.getTime()) / 1000) // Duration in seconds

        if (elapsed > 0 && elapsed < 7200) {
          // Less than 2 hours
          setIsTracking(true)
          setTrackingStartTime(startTime)
          setTrackingDuration(elapsed)
        } else {
          // Session expired, clean up
          localStorage.removeItem(activeSessionKey)
        }
      }
    } catch (error) {
      console.error('Error checking active session:', error)
    }
  }, [subjectId])

  // Update duration timer when tracking is active
  useEffect(() => {
    let durationInterval = null
    let heartbeatInterval = null

    if (isTracking && trackingStartTime) {
      // Update duration every second
      durationInterval = setInterval(() => {
        const elapsed = Math.floor((new Date() - trackingStartTime) / 1000)
        setTrackingDuration(elapsed)
      }, 1000)

      // Send heartbeat progress update every 15 seconds
      heartbeatInterval = setInterval(() => {
        sendProgressUpdate('progress')
      }, 15000)
    }

    return () => {
      if (durationInterval) clearInterval(durationInterval)
      if (heartbeatInterval) clearInterval(heartbeatInterval)
    }
  }, [isTracking, trackingStartTime, sendProgressUpdate])

  // Real-time time out monitoring - continuously update leaveTime every 5-10 seconds
  useEffect(() => {
    if (!isTracking || !trackingStartTime) {
      return
    }

    const activeSessionKey = `attendance_session_${subjectId}`

    // Update time out every 5 seconds (real-time scraping)
    const timeOutUpdateInterval = setInterval(() => {
      try {
        const sessionDataStr = localStorage.getItem(activeSessionKey)
        if (sessionDataStr) {
          const sessionData = JSON.parse(sessionDataStr)
          const currentTime = new Date()

          // Ensure time out is never earlier than time in
          const startTime = new Date(sessionData.startTime)
          if (currentTime >= startTime) {
            // Update leaveTime in session data (real-time scraping)
            sessionData.leaveTime = currentTime.toISOString()
            sessionData.lastUpdated = currentTime.toISOString()
            localStorage.setItem(activeSessionKey, JSON.stringify(sessionData))

            console.log(
              '🔄 Real-time time out updated:',
              formatTime(currentTime)
            )
          }
        }
      } catch (error) {
        console.error('Error updating real-time time out:', error)
      }
    }, 5000) // Update every 5 seconds

    return () => {
      clearInterval(timeOutUpdateInterval)
    }
  }, [isTracking, trackingStartTime, subjectId])

  // Auto-submit attendance when class ends - with real-time time out capture
  useEffect(() => {
    if (!isTracking || !trackingStartTime || isSubmitting) {
      return
    }

    const classEndTime = calculateClassEndTime()
    if (!classEndTime) {
      console.warn(
        'Cannot calculate class end time, skipping auto-submit check'
      )
      return
    }

    const activeSessionKey = `attendance_session_${subjectId}`

    // Check every 10 seconds if class has ended (more frequent for real-time capture)
    const autoSubmitInterval = setInterval(() => {
      const now = new Date()

      // Check if class end time has been reached
      if (now >= classEndTime) {
        console.log(
          '✅ Class end time reached, capturing final time out and auto-submitting attendance...'
        )
        clearInterval(autoSubmitInterval)

        // Immediately capture current timestamp as final time out (real-time scraping)
        try {
          const sessionDataStr = localStorage.getItem(activeSessionKey)
          if (sessionDataStr) {
            const sessionData = JSON.parse(sessionDataStr)
            const finalTimeOut = new Date()

            // Ensure final time out is not earlier than start time
            const startTime = new Date(sessionData.startTime)
            if (finalTimeOut >= startTime) {
              // Update session data with final scraped time out
              sessionData.leaveTime = finalTimeOut.toISOString()
              sessionData.finalTimeOut = finalTimeOut.toISOString()
              sessionData.classEndedAt = finalTimeOut.toISOString()
              localStorage.setItem(
                activeSessionKey,
                JSON.stringify(sessionData)
              )

              console.log(
                '✅ Final time out captured (real-time scraped):',
                formatTime(finalTimeOut)
              )
            }
          }
        } catch (error) {
          console.error('Error capturing final time out:', error)
        }

        // Automatically submit attendance with scraped time out
        submitAttendanceData(false)
      } else {
        // Log time remaining until class ends (for debugging)
        const timeRemaining = Math.floor((classEndTime - now) / 1000)
        if (timeRemaining % 300 === 0) {
          // Log every 5 minutes
          console.log(`⏰ Class ends in ${formatDuration(timeRemaining)}`)
        }
      }
    }, 10000) // Check every 10 seconds for more responsive real-time capture

    return () => {
      clearInterval(autoSubmitInterval)
    }
  }, [
    isTracking,
    trackingStartTime,
    isSubmitting,
    subjectId,
    group.timeSchedule,
    group.classDurationMinutes,
    submitAttendanceData,
    calculateClassEndTime
  ])

  // Track tab visibility for more accurate presence detection
  useEffect(() => {
    if (!isTracking) return

    let hiddenTimeout = null

    // Enhanced visibilitychange handler - also save data when page becomes hidden
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page hidden - start timeout
        hiddenTimeout = setTimeout(() => {
          // If hidden for more than 30 seconds, send leave event
          console.log('⚠️ Tab hidden for 30+ seconds, sending leave event')
          sendProgressUpdate('leave')
        }, 30000)

        // Also save pending submission when page becomes hidden
        if (isTracking && trackingStartTime && !isSubmitting) {
          const elapsed = Math.floor((new Date() - trackingStartTime) / 1000)
          if (elapsed >= 60) {
            const activeSessionKey = `attendance_session_${subjectId}`
            const pendingSubmissionKey = `pending_attendance_${subjectId}`

            try {
              const sessionDataStr = localStorage.getItem(activeSessionKey)
              if (sessionDataStr) {
                const sessionData = JSON.parse(sessionDataStr)
                sessionData.endTime = new Date().toISOString()
                sessionData.duration = elapsed
                sessionData.shouldSubmit = true
                sessionData.pageHiddenAt = new Date().toISOString()
                sessionData.triggeredBy = 'visibilitychange'
                localStorage.setItem(
                  pendingSubmissionKey,
                  JSON.stringify(sessionData)
                )
              }
            } catch (error) {
              console.error(
                'Error preparing pending submission on visibility change:',
                error
              )
            }
          }
        }
      } else {
        // Tab visible again - cancel timeout and send return event if needed
        if (hiddenTimeout) {
          clearTimeout(hiddenTimeout)
          hiddenTimeout = null
        }
        // User returned to the app tab
        if (isTracking && trackingStartTime) {
          const elapsed = Math.floor((new Date() - trackingStartTime) / 1000)
          if (elapsed >= 30) {
            console.log('✅ User returned to app, sending join event')
            sendProgressUpdate('join') // Re-join event
            setTrackingDuration(elapsed)
          }
        }
      }
    }

    // Handle pagehide - attempt to submit attendance when leaving/closing tab
    // Works with bfcache (unlike deprecated beforeunload)
    const handlePageHide = e => {
      // event.persisted = true means page is being cached (bfcache)
      // event.persisted = false means page is being unloaded
      // We want to save data in both cases
      if (isTracking && trackingStartTime && !isSubmitting) {
        const elapsed = Math.floor((new Date() - trackingStartTime) / 1000)
        if (elapsed >= 60) {
          // Only if tracked for at least 1 minute
          const activeSessionKey = `attendance_session_${subjectId}`
          const pendingSubmissionKey = `pending_attendance_${subjectId}`

          try {
            const sessionDataStr = localStorage.getItem(activeSessionKey)
            if (sessionDataStr) {
              const sessionData = JSON.parse(sessionDataStr)
              sessionData.endTime = new Date().toISOString()
              sessionData.duration = elapsed
              sessionData.shouldSubmit = true
              sessionData.pageHiddenAt = new Date().toISOString()
              sessionData.wasPersisted = e.persisted // Track if page was cached
              localStorage.setItem(
                pendingSubmissionKey,
                JSON.stringify(sessionData)
              )
            }
          } catch (error) {
            console.error('Error preparing pending submission:', error)
          }
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      if (hiddenTimeout) clearTimeout(hiddenTimeout)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [
    isTracking,
    trackingStartTime,
    isSubmitting,
    subjectId,
    sendProgressUpdate
  ])

  // Check for pending submissions on mount
  useEffect(() => {
    if (!user || !user._id) return

    const pendingSubmissionKey = `pending_attendance_${group._id}`
    try {
      const pendingStr = localStorage.getItem(pendingSubmissionKey)
      if (pendingStr) {
        const pending = JSON.parse(pendingStr)
        if (pending.shouldSubmit) {
          // Restore tracking state and auto-submit pending attendance
          setIsTracking(true)
          setTrackingStartTime(new Date(pending.startTime))
          const elapsed = Math.floor(
            (new Date() - new Date(pending.startTime)) / 1000
          )
          setTrackingDuration(elapsed)

          // Auto-submit after a short delay
          setTimeout(() => {
            submitAttendanceData(false)
            localStorage.removeItem(pendingSubmissionKey)
          }, 1500) // Small delay to ensure component is fully mounted
        }
      }
    } catch (error) {
      console.error('Error checking pending submissions:', error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]) // Only run on mount or when subject changes

  // Start attendance tracking
  const startAttendanceTracking = (tokenData, meetCode) => {
    const activeSessionKey = `attendance_session_${subjectId}`
    const startTime = new Date()
    const sessionData = {
      startTime: startTime.toISOString(),
      leaveTime: startTime.toISOString(), // Initialize with start time, will be updated in real-time
      subjectId: tokenData.subjectId,
      meetCode: meetCode,
      token: tokenData.token,
      subjectName: tokenData.subjectName,
      lastUpdated: startTime.toISOString()
    }

    localStorage.setItem(activeSessionKey, JSON.stringify(sessionData))
    setIsTracking(true)
    setTrackingStartTime(startTime)
    setTrackingDuration(0)
    setTrackingMessage('Tracking started. Your attendance is being recorded.')

    console.log('✅ Attendance tracking started for subject:', subjectId)
    console.log(
      '✅ Time in captured (real-time scraped):',
      formatTime(startTime)
    )
    console.log('🔍 Token data:', tokenData)
    console.log('🔍 Meet code:', meetCode)
    console.log('🔍 Session data stored:', sessionData)

    // Send initial join event to real-time system
    setTimeout(() => {
      console.log(
        '⏰ Triggering sendProgressUpdate(join) after 1 second delay...'
      )
      sendProgressUpdate('join')
    }, 1000) // Small delay to ensure localStorage is set
  }

  // Handle click to open Google Meet link
  const handleCardClick = async e => {
    // Prevent click if dots button was clicked
    if (e.target.closest('.three-dots-button')) {
      return
    }

    // Prevent double-clicks while joining
    if (joiningMeeting) {
      return
    }

    if (!canJoinMeeting) {
      alert(
        joinScheduleState.reason ||
          'You can only join during the scheduled time.'
      )
      return
    }

    let linkToOpen = group.meetingLink
    if (!linkToOpen) {
      alert('No meeting link available for this group')
      return
    }

    // Ensure the link starts with http:// or https://
    if (!/^https?:\/\//i.test(linkToOpen)) {
      linkToOpen = `https://${linkToOpen}`
    }

    // Get current user from localStorage
    let user = null
    try {
      const u = localStorage.getItem('user')
      user = u ? JSON.parse(u) : null
    } catch (error) {
      console.error('Error parsing user data:', error)
    }

    if (!user || !user._id) {
      alert('Please login to join the meeting')
      return
    }

    // Show loading state
    setJoiningMeeting(true)

    // Try to generate token before opening meeting, but open link even if it fails
    try {
      const response = await apiPost(`subjects/${subjectId}/generate-token`, {
        userId: user._id
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: 'Network error',
          message: 'Failed to connect to server'
        }))
        throw new Error(
          errorData.message ||
            errorData.error ||
            `HTTP ${response.status}: ${response.statusText}`
        )
      }

      const result = await response.json()

      if (result.success && result.data) {
        // Extract meetCode from meeting link (Google Meet format: abc-defg-hij)
        let meetCode = null
        if (linkToOpen) {
          const meetCodeMatch = linkToOpen.match(
            /(?:meet\.google\.com\/|hangouts\.google\.com\/call\/|\/)([a-z]+-[a-z]+-[a-z]+)/i
          )
          if (meetCodeMatch) {
            meetCode = meetCodeMatch[1].toLowerCase() // Normalize to lowercase
          }
        }

        // If meetCode not found in link, try to extract from current window if on meet page
        if (!meetCode && typeof window !== 'undefined') {
          const currentUrl = window.location.href
          const urlMatch = currentUrl.match(
            /(?:meet\.google\.com\/|hangouts\.google\.com\/call\/|\/)([a-z]+-[a-z]+-[a-z]+)/i
          )
          if (urlMatch) {
            meetCode = urlMatch[1].toLowerCase()
            console.log('📝 Extracted meetCode from current URL:', meetCode)
          }
        }

        console.log(
          '🔑 Token generation - meetCode:',
          meetCode,
          'from link:',
          linkToOpen
        )

        // Store token in localStorage with all necessary data for attendance tracking
        const tokenKey = `attendance_token_${subjectId}`
        const tokenData = {
          token: result.data.token,
          subjectId: result.data.subjectId || subjectId,
          userId: user._id,
          expiresAt: result.data.expiresAt,
          subjectName: group.groupName || '',
          meetingLink: linkToOpen,
          meetCode: meetCode,
          section: group.section || '',
          schoolYear: group.schoolYear || '',
          semester: group.semester || '',
          createdAt: new Date().toISOString()
        }

        localStorage.setItem(tokenKey, JSON.stringify(tokenData))

        // Store token in chrome.storage.sync for extension access (cross-origin accessible)
        // This enables the browser extension on meet.google.com to access the token
        const extensionTokenData = {
          token: tokenData.token,
          subjectId: tokenData.subjectId,
          userId: tokenData.userId,
          expiresAt: tokenData.expiresAt,
          subjectName: tokenData.subjectName,
          dashboardPath: `/Subject/${subjectId}`,
          meetCode: meetCode || null, // Can be null initially
          section: tokenData.section,
          schoolYear: tokenData.schoolYear,
          semester: tokenData.semester,
          meetingLink: linkToOpen // Store link for later meetCode extraction
        }

        // Use helper function to store token (tries direct access, falls back to message passing)
        const storageResult = await storeTokenInExtensionStorage(
          extensionTokenData,
          meetCode,
          subjectId
        )

        if (!storageResult.success) {
          console.warn(
            '⚠️ Token could not be stored in extension storage:',
            storageResult.error || 'Unknown error'
          )
          console.warn(
            '   Token is still available in localStorage for manual tracking'
          )
        } else {
          console.log(
            `✅ Token stored in extension storage via ${storageResult.method} method`
          )
        }

        // Also store by meetCode for easy lookup by extension
        // The browser extension running on Google Meet page can access this
        if (meetCode) {
          const meetCodeKey = `attendance_token_meetCode_${meetCode}`
          localStorage.setItem(meetCodeKey, JSON.stringify(tokenData))
          console.log('✅ Token stored by meetCode:', meetCode)
        }

        // Store in a global array of active tokens for extension access
        try {
          const activeTokens = JSON.parse(
            localStorage.getItem('neattend_active_tokens') || '[]'
          )
          // Remove existing token for this subject/meetCode
          const filtered = activeTokens.filter(
            t => t.subjectId !== tokenData.subjectId && t.meetCode !== meetCode
          )
          filtered.push(tokenData)
          localStorage.setItem(
            'neattend_active_tokens',
            JSON.stringify(filtered)
          )
        } catch (err) {
          console.warn('Failed to store active tokens list:', err)
        }

        console.log('✅ Token generated successfully and stored:', {
          tokenKey,
          subjectId: tokenData.subjectId,
          meetCode: meetCode,
          expiresAt: tokenData.expiresAt,
          algorithm: result.data.algorithm || 'unknown'
        })

        // Show token to student if it's a JWT
        if (
          result.data.algorithm &&
          (result.data.algorithm === 'RS256' ||
            result.data.algorithm === 'HS256')
        ) {
          const expiresAtDate = new Date(result.data.expiresAt)
          const isExpired = expiresAtDate < new Date()

          // Show token in a modal or alert with copy functionality
          const tokenDisplay = `
Verification Token (JWT - ${result.data.algorithm}):

${result.data.token}

Expires: ${expiresAtDate.toLocaleString()}
Status: ${isExpired ? '❌ Expired' : '✅ Valid'}

Click OK to copy token to clipboard and open meeting.
          `

          const shouldCopy = window.confirm(tokenDisplay)
          if (shouldCopy) {
            try {
              await navigator.clipboard.writeText(result.data.token)
              alert('✅ Token copied to clipboard! Opening meeting...')
            } catch (clipboardError) {
              console.warn('Failed to copy to clipboard:', clipboardError)
              // Fallback: select text for manual copy
              const textArea = document.createElement('textarea')
              textArea.value = result.data.token
              textArea.style.position = 'fixed'
              textArea.style.opacity = '0'
              document.body.appendChild(textArea)
              textArea.select()
              try {
                document.execCommand('copy')
                alert(
                  '✅ Token selected! Press Ctrl+C to copy. Opening meeting...'
                )
              } catch (fallbackError) {
                console.warn('Fallback copy failed:', fallbackError)
              }
              document.body.removeChild(textArea)
            }
          }
        }

        // Start attendance tracking
        startAttendanceTracking(tokenData, meetCode)

        window.open(linkToOpen, '_blank')
        setJoiningMeeting(false) // Clear loading state
      } else {
        const errorMsg =
          result.error || result.message || 'Unknown error occurred'
        console.warn(
          'Failed to generate token, but opening meeting link anyway:',
          errorMsg
        )
        alert(
          `Failed to generate verification token: ${errorMsg}. Opening meeting link without attendance tracking.`
        )
        window.open(linkToOpen, '_blank') // Open link even if token generation fails
        setJoiningMeeting(false) // Clear loading state
      }
    } catch (error) {
      console.error('Error generating token:', error)
      const errorMessage =
        error.message || 'Network error or server unavailable'
      alert(
        `Error generating verification token: ${errorMessage}. Opening meeting link without attendance tracking.`
      )
      window.open(linkToOpen, '_blank') // Open link even if token generation fails
      setJoiningMeeting(false) // Clear loading state
    }
  }

  return (
    <div
      style={{
        position: 'relative', // For loading overlay positioning
        background: neutral.bgSurface,
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(44,44,84,0.08)',
        minHeight: 260,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        width: '100%',
        border: isRestricted
          ? `3px solid ${statusColors.absent.border}`
          : 'none',
        opacity: isRestricted ? 0.7 : 1,
        cursor: joiningMeeting ? 'wait' : 'pointer',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease'
      }}
      onClick={handleCardClick}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(44,44,84,0.15)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(44,44,84,0.08)'
      }}
    >
      {/* Loading Overlay when joining meeting */}
      {joiningMeeting && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(255, 255, 255, 0.9)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            borderRadius: 16
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              border: `4px solid ${neutral.borderLight}`,
              borderTop: `4px solid ${brand.primary}`,
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}
          />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <div
            style={{
              marginTop: 12,
              color: brand.primary,
              fontWeight: 600,
              fontSize: 14
            }}
          >
            Joining meeting...
          </div>
          <div style={{ marginTop: 4, color: neutral.textMuted, fontSize: 12 }}>
            Generating attendance token
          </div>
        </div>
      )}

      {/* Restriction Banner */}
      {isRestricted && (
        <div
          style={{
            background: statusColors.absent.border,
            color: neutral.bgSurface,
            padding: '8px 16px',
            textAlign: 'center',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          🚫 RESTRICTED: {restrictionReason}
        </div>
      )}

      <div
        style={{
          background: brand.secondary,
          padding: '20px 18px 10px 18px',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16
        }}
      >
        <div
          style={{
            color: neutral.bgSurface,
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: 1,
            lineHeight: 1
          }}
        >
          {group.groupName}
        </div>
        <div
          style={{
            fontWeight: 400,
            fontSize: 15,
            color: neutral.bgSurface,
            marginTop: 6
          }}
        >
          {instructorName}
        </div>
        <div
          style={{
            fontSize: 12,
            color: neutral.bgSurface,
            marginTop: 8,
            opacity: 0.8
          }}
        >
          <i className='bi bi-cursor' style={{ marginRight: 4 }}></i>
          {isTracking ? 'Attendance tracking active' : 'Click to join meeting'}
        </div>
        {trackingMessage && (
          <div
            style={{
              fontSize: 11,
              color: trackingMessage.includes('Error')
                ? statusColors.absent.bg
                : statusColors.present.bg,
              marginTop: 6,
              padding: '4px 8px',
              borderRadius: 4,
              background: trackingMessage.includes('Error')
                ? 'rgba(220, 53, 69, 0.2)'
                : 'rgba(40, 167, 69, 0.2)'
            }}
          >
            {trackingMessage}
          </div>
        )}
      </div>
      <div
        style={{
          padding: '18px',
          borderBottomLeftRadius: 16,
          borderBottomRightRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          height: 120,
          justifyContent: 'space-between',
          position: 'relative',
          background: neutral.accent
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <i
            className='bi bi-camera-video-fill'
            style={{ fontSize: 28, color: brand.secondary, marginTop: 2 }}
          ></i>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}
          >
            <span
              style={{
                fontWeight: 700,
                fontSize: 16,
                color: brand.secondary,
                lineHeight: 1
              }}
            >
              {group.section}
            </span>
            <span
              style={{
                fontWeight: 500,
                fontSize: 13,
                color: brand.secondary,
                marginTop: 2
              }}
            >
              {group.day} at {scheduleTime}
            </span>
            {isMeetingLive && (
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 12,
                  color: statusColors.present.border,
                  marginTop: 2,
                  background: statusColors.present.bg,
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}
              >
                🔴 LIVE SESSION
              </span>
            )}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            width: '100%'
          }}
        >
          <i
            className='bi bi-three-dots three-dots-button'
            style={{
              fontSize: 24,
              color: brand.secondary,
              opacity: 0.8,
              cursor: 'pointer'
            }}
            onClick={onDotsClick}
          ></i>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isTracking && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 4
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: brand.secondary,
                    fontWeight: 600,
                    opacity: 0.8
                  }}
                >
                  Duration: {formatDuration(trackingDuration)}
                </span>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    submitAttendanceData(true)
                  }}
                  disabled={isSubmitting}
                  style={{
                    padding: '4px 12px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: neutral.bgSurface,
                    background: isSubmitting
                      ? neutral.textSecondary
                      : statusColors.present.border,
                    border: 'none',
                    borderRadius: 6,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                  title='Record Attendance'
                >
                  <i
                    className={`bi ${
                      isSubmitting ? 'bi-hourglass-split' : 'bi-check-circle'
                    }`}
                    style={{ fontSize: 12 }}
                  ></i>
                  {isSubmitting ? 'Recording...' : 'Record'}
                </button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <i
                className='bi bi-people-fill'
                style={{ fontSize: 28, color: brand.secondary }}
              ></i>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 20,
                  color: brand.secondary
                }}
              >
                {totalMembers}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const GroupDetailsModal = ({ card, onClose }) => (
  <div
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0,0,0,0.25)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}
  >
    <div
      style={{
        background: neutral.bgSurface,
        border: `1px solid ${brand.primary}`,
        borderRadius: 6,
        padding: 36,
        minWidth: 420,
        maxWidth: 600,
        width: '90vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        position: 'relative'
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 18,
          right: 18,
          background: 'transparent',
          border: 'none',
          fontSize: 28,
          color: brand.primary,
          cursor: 'pointer',
          fontWeight: 700
        }}
      >
        &times;
      </button>
      <div
        style={{
          fontStyle: 'italic',
          fontWeight: 700,
          fontSize: 32,
          marginBottom: 18,
          color: 'black'
        }}
      >
        DETAILS
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '180px 1fr',
          rowGap: 14,
          columnGap: 18,
          fontSize: 20,
          marginBottom: 36,
          color: 'Black'
        }}
      >
        <div>Group Name:</div>
        <div>{card.groupName || card.section || 'N/A'}</div>
        <div>Schedule:</div>
        <div>{card.timeScheduleLocal || card.day || 'N/A'}</div>
        <div>Section:</div>
        <div>{card.section || 'N/A'}</div>
        <div>Instructor:</div>
        <div>
          {card.instructorId?.firstName && card.instructorId?.lastName
            ? `${card.instructorId.firstName} ${card.instructorId.lastName}`
            : 'N/A'}
        </div>
        <div>Meeting Link:</div>
        <div>{card.meetingLink ? 'Available' : 'Not set'}</div>
        <div>Members:</div>
        <div>{card.members?.length || 0}</div>
      </div>
      <div
        style={{
          fontStyle: 'italic',
          fontWeight: 700,
          fontSize: 24,
          marginBottom: 10,
          color: 'black'
        }}
      >
        Group Information
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          rowGap: 10,
          fontSize: 19,
          color: 'black'
        }}
      >
        <div>Status:</div>
        <div>
          {card.members?.find(m => {
            try {
              const user = JSON.parse(localStorage.getItem('user'))
              return m.userId === user?._id
            } catch {
              return false
            }
          })?.status || 'Not enrolled'}
        </div>
        <div>Joined:</div>
        <div>
          {card.members?.find(m => {
            try {
              const user = JSON.parse(localStorage.getItem('user'))
              return m.userId === user?._id
            } catch {
              return false
            }
          })?.joinedAt
            ? new Date(
                card.members.find(m => {
                  try {
                    const user = JSON.parse(localStorage.getItem('user'))
                    return m.userId === user?._id
                  } catch {
                    return false
                  }
                }).joinedAt
              ).toLocaleDateString()
            : 'N/A'}
        </div>
      </div>
    </div>
  </div>
)

export default Group
