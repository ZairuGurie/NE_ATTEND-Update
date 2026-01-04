import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'react-toastify'
import logo from '../assets/Logologin.png'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 4: CSS classes for theme-aware styling
import '../styles/common.css'
import { logout, getCurrentUser } from '../utils/auth'
import UserMenu from '../components/layout/UserMenu'
import SubjectStudentsModal from './components/SubjectStudentsModal'
import DFEligibilityWarnings from './components/DFEligibilityWarnings'
import { apiGet, apiPost } from '../utils/api'
import { storeTokenInExtensionStorage } from '../utils/extensionStorage'
import {
  brand,
  neutral,
  status as statusColors,
  interactive
} from '../utils/colors'

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

const MEET_CODE_REGEX = /([a-z]{3}-[a-z]{4}-[a-z]{3})/i

const extractMeetCodeFromLink = (link = '') => {
  if (!link) return ''
  const trimmed = link.trim()
  try {
    const url = new URL(trimmed)
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length > 0) {
      return segments[segments.length - 1].toLowerCase()
    }
  } catch {
    // Not a valid URL, fallback to regex
  }

  const match = trimmed.match(MEET_CODE_REGEX)
  if (match && match[1]) {
    return match[1].toLowerCase()
  }

  return trimmed.replace(/\s+/g, '').toLowerCase()
}

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

const Subject = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [showNotifications, setShowNotifications] = useState(false)
  const [currentUser] = useState(() => getCurrentUser())
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [showEligibilityModal, setShowEligibilityModal] = useState(false)
  const [selectedSubjectId, setSelectedSubjectId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeSubjects: 0,
    classesToday: 0
  })
  const [instructorId, setInstructorId] = useState(null)
  const [credentialModalOpen, setCredentialModalOpen] = useState(false)
  const [credentialSubject, setCredentialSubject] = useState(null)
  const [credentialForm, setCredentialForm] = useState({
    meetCode: '',
    userId: ''
  })
  const [credentialStatus, setCredentialStatus] = useState({
    type: 'info',
    message: ''
  })
  const [credentialLoading, setCredentialLoading] = useState(false)
  const [credentialResult, setCredentialResult] = useState(null)
  const [showSummaryModal, setShowSummaryModal] = useState(false)

  useEffect(() => {
    let derivedInstructorId = null
    try {
      const userStr = localStorage.getItem('user')
      const user = userStr ? JSON.parse(userStr) : null
      derivedInstructorId = user && user._id ? user._id : null
    } catch (e) {
      // Silent parse error - user data not available
      console.debug('User parse error:', e)
    }

    if (!derivedInstructorId) {
      setError('Not authenticated. Please login again.')
      setLoading(false)
      return
    }
    setInstructorId(derivedInstructorId)

    const fetchGroups = async () => {
      setLoading(true)
      setError('')
      try {
        // Fetch subjects
        const res = await apiGet(`subjects/instructor/${derivedInstructorId}`)

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({
            error: 'Network error',
            message: 'Failed to connect to server'
          }))
          throw new Error(
            errorData.message ||
              errorData.error ||
              `HTTP ${res.status}: ${res.statusText}`
          )
        }

        const data = await res.json()

        if (data.success) {
          const mapped = (data.data || []).map(s => ({
            id: s._id,
            section:
              s.sections && s.sections.length > 0
                ? s.sections.join(', ')
                : 'No sections',
            instructor: s.instructorId
              ? `${s.instructorId.firstName} ${s.instructorId.lastName}`
              : 'Instructor',
            instructorEmail: s.instructorId?.email || '',
            title: s.subjectName || 'Untitled',
            subjectCode: s.subjectCode || '',
            time: s.time || '—',
            day: s.day || 'N/A',
            room: s.room || 'N/A',
            department: s.department || '',
            schoolYear: s.schoolYear || '',
            semester: s.semester || '',
            sections: s.sections || [],
            meetingLink: s.meetingLink || '',
            description: s.description || '',
            credits: s.credits || null,
            isActive: s.isActive !== false,
            createdAt: s.createdAt || null,
            updatedAt: s.updatedAt || null,
            schedule: s.schedule || null
          }))
          setGroups(mapped)
        } else {
          setError(data.message || data.error || 'Failed to load subjects')
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    fetchGroups()
  }, [])

  useEffect(() => {
    if (instructorId) {
      setCredentialForm(prev => ({ ...prev, userId: instructorId }))
    }
  }, [instructorId])

  // Derive unique subject names from groups for the filter dropdown
  const uniqueSubjects = useMemo(() => {
    const subjects = groups
      .map(g => g.title)
      .filter(Boolean)
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort()
    return subjects
  }, [groups])

  const subjectSummaryRows = useMemo(() => {
    const rows = []
    groups.forEach((g, index) => {
      const sectionValues =
        Array.isArray(g.sections) && g.sections.length > 0
          ? g.sections
          : [g.section || 'No sections']

      const scheduleLabel =
        g.day && g.time ? `${g.day} ${g.time}` : g.time || '—'

      sectionValues.forEach(sectionValue => {
        rows.push({
          key: `${g.id || index}-${sectionValue || index}`,
          code: g.subjectCode || '',
          description: g.title || '',
          section: sectionValue || 'No section',
          schedule: scheduleLabel,
          teacher: g.instructor || '',
          semester: g.semester || '',
          schoolYear: g.schoolYear || ''
        })
      })
    })
    return rows
  }, [groups])

  const openCredentialModal = subject => {
    if (!instructorId) {
      setCredentialStatus({
        type: 'error',
        message: 'Unable to find your instructor ID. Please re-login.'
      })
      return
    }

    const inferredMeetCode = extractMeetCodeFromLink(subject?.meetingLink || '')
    setCredentialSubject(subject)
    setCredentialForm({
      meetCode: inferredMeetCode,
      userId: instructorId
    })
    setCredentialResult(null)
    setCredentialStatus({
      type: inferredMeetCode ? 'info' : 'warning',
      message: inferredMeetCode
        ? 'Verify the Meet code before issuing credentials.'
        : 'Enter the Google Meet code associated with this class.'
    })
    setCredentialModalOpen(true)
  }

  const closeCredentialModal = () => {
    setCredentialModalOpen(false)
    setCredentialSubject(null)
    setCredentialResult(null)
    setCredentialStatus({ type: 'info', message: '' })
    setCredentialForm({
      meetCode: '',
      userId: instructorId || ''
    })
  }

  const handleCredentialFieldChange = event => {
    const { name, value } = event.target
    setCredentialForm(prev => ({
      ...prev,
      [name]:
        name === 'meetCode' ? value.toLowerCase().replace(/\s+/g, '') : value
    }))
  }

  const persistCredentialPayload = async payload => {
    // Build authPayload for localStorage (backward compatibility)
    const authPayload = {
      verificationToken: payload.verificationToken,
      subjectId: payload.subjectId || payload.groupId, // Support both for backward compatibility
      groupId: payload.groupId, // Legacy support
      subjectName: payload.subjectName || payload.groupName,
      groupName: payload.groupName, // Legacy support
      userId: credentialForm.userId,
      expiresAt: payload.expiresAt,
      roster: payload.roster || [],
      groupValidation: payload.roster ? { members: payload.roster } : null,
      meetCode: credentialForm.meetCode
    }

    // Store in localStorage for backward compatibility
    try {
      localStorage.setItem('neattend_auth', JSON.stringify(authPayload))
    } catch (err) {
      console.warn('⚠️ Unable to cache credentials locally:', err.message)
    }

    // Store in chrome.storage.local for backward compatibility (legacy)
    if (typeof window !== 'undefined' && window.chrome?.storage?.local) {
      try {
        window.chrome.storage.local.set({ neattend_auth: authPayload }, () => {
          if (window.chrome.runtime?.lastError) {
            console.warn(
              '⚠️ Unable to persist credentials to chrome.storage.local:',
              window.chrome.runtime.lastError.message
            )
          }
        })
      } catch (err) {
        console.warn(
          '⚠️ Failed to write credentials to chrome.storage.local:',
          err.message
        )
      }
    }

    // Store token in chrome.storage.sync for extension access (NEW - fixes "No token found" error)
    try {
      // Extract and normalize meetCode
      const meetCode = credentialForm.meetCode
      if (!meetCode) {
        console.warn(
          '⚠️ No meetCode provided, cannot store token for extension'
        )
        return
      }

      const normalizedMeetCode = meetCode.toLowerCase().trim()
      const subjectId = payload.subjectId || payload.groupId

      // Extract section, schoolYear, semester from credentialSubject state
      const section =
        credentialSubject?.section || credentialSubject?.sections?.[0] || ''
      const schoolYear = credentialSubject?.schoolYear || ''
      const semester = credentialSubject?.semester || ''
      const meetingLink = credentialSubject?.meetingLink || ''

      // Build extensionTokenData matching extension's expected format
      const extensionTokenData = {
        token: payload.verificationToken, // Transform verificationToken → token
        subjectId: subjectId,
        userId: credentialForm.userId,
        expiresAt: payload.expiresAt,
        subjectName: payload.subjectName || payload.groupName || '',
        dashboardPath: '/instructor-dashboard', // Instructor dashboard path
        meetCode: normalizedMeetCode,
        section: section,
        schoolYear: schoolYear,
        semester: semester,
        meetingLink: meetingLink
      }

      console.log('💾 Storing token for extension access:')
      console.log('   MeetCode:', normalizedMeetCode)
      console.log('   SubjectId:', subjectId)
      console.log(
        '   Storage key will be: neattend_token_' + normalizedMeetCode
      )

      // Use existing helper function to store token (tries direct access, falls back to message passing)
      const storageResult = await storeTokenInExtensionStorage(
        extensionTokenData,
        normalizedMeetCode,
        subjectId
      )

      if (!storageResult.success) {
        const errorMsg = storageResult.error || 'Unknown error'
        console.warn(
          '⚠️ Token could not be stored in extension storage:',
          errorMsg
        )
        console.warn(
          '   Token is still available in localStorage for manual tracking'
        )

        // Provide user-friendly error message
        if (errorMsg.includes('Timeout') || errorMsg.includes('timeout')) {
          console.warn(
            '   Issue: Extension may not be installed or background script is not responding'
          )
          console.warn(
            '   Solution: Ensure NE-Attend extension is installed and reloaded in your browser'
          )
        } else if (errorMsg.includes('Extension may not be installed')) {
          console.warn('   Issue: Extension is not installed or not enabled')
          console.warn(
            '   Solution: Install the NE-Attend extension from Chrome Web Store'
          )
        } else if (errorMsg.includes('Background script')) {
          console.warn(
            '   Issue: Extension background script encountered an error'
          )
          console.warn(
            '   Solution: Reload the extension or restart your browser'
          )
        }

        // Note: We don't show an error toast here because credentials were still generated successfully
        // Token is available in localStorage, so attendance tracking can still work manually
      } else {
        console.log(
          `✅ Token stored in extension storage via ${storageResult.method} method`
        )
        if (storageResult.verified) {
          console.log('✅ Token storage verified by background script')
        } else {
          console.log('⚠️ Token storage not verified (may still be working)')
        }
      }
    } catch (error) {
      console.error('❌ Error storing token for extension:', error)
      console.error('   Error details:', error.message)
    }

    // Broadcast credentials update (for other components that might be listening)
    try {
      window.postMessage(
        { type: 'NEATTEND_AUTH_UPDATED', payload: authPayload },
        '*'
      )
    } catch (err) {
      console.warn('⚠️ Unable to broadcast credentials update:', err.message)
    }
  }

  const issueCredentials = async event => {
    event.preventDefault()
    if (!credentialForm.meetCode) {
      setCredentialStatus({
        type: 'error',
        message: 'Google Meet code is required.'
      })
      return
    }
    if (!credentialForm.userId) {
      setCredentialStatus({
        type: 'error',
        message: 'Missing instructor identifier. Please re-login.'
      })
      return
    }

    setCredentialLoading(true)
    setCredentialStatus({
      type: 'info',
      message: 'Requesting verification token…'
    })

    try {
      const response = await apiPost(
        'attendance/get-credentials',
        credentialForm
      )
      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.success) {
        const errMessage =
          result.message ||
          result.error ||
          `Request failed (${response.status})`
        throw new Error(errMessage)
      }

      setCredentialResult(result)
      setCredentialStatus({
        type: 'success',
        message: 'Credentials issued and synced with the Trackit extension.'
      })
      await persistCredentialPayload(result)

      // Also store instructor ID for extension registration
      if (typeof window !== 'undefined' && window.chrome?.storage?.local) {
        try {
          const userStr = localStorage.getItem('user')
          const user = userStr ? JSON.parse(userStr) : null
          const instructorId = user?._id || user?.id || null

          if (instructorId) {
            window.chrome.storage.local.set(
              { neattend_user_id: instructorId },
              () => {
                if (window.chrome.runtime?.lastError) {
                  console.warn(
                    '⚠️ Failed to store instructor ID:',
                    window.chrome.runtime.lastError.message
                  )
                } else {
                  console.log('✅ Instructor ID stored for extension')
                }
              }
            )
          }
        } catch (err) {
          console.warn('⚠️ Error storing instructor ID:', err)
        }
      }
    } catch (err) {
      setCredentialStatus({
        type: 'error',
        message: err.message || 'Failed to generate credentials.'
      })
    } finally {
      setCredentialLoading(false)
    }
  }

  const copyToClipboard = async value => {
    if (!value || typeof navigator === 'undefined' || !navigator.clipboard) {
      return
    }
    try {
      await navigator.clipboard.writeText(value)
      setCredentialStatus(prev => ({
        type: prev.type === 'error' ? prev.type : 'info',
        message: 'Copied to clipboard.'
      }))
    } catch (err) {
      console.warn('⚠️ Failed to copy value:', err.message)
    }
  }

  // Fetch statistics
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch actual student count from the database
        let totalStudents = 0
        try {
          const studentsResponse = await apiGet('users?role=student')
          if (studentsResponse.ok) {
            const studentsResult = await studentsResponse.json()
            totalStudents = studentsResult.data?.length || 0
          }
        } catch (e) {
          console.warn('Could not fetch student count:', e)
        }

        // Active subjects is the number of groups
        const activeSubjects = groups.length

        // Calculate classes today
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // Fetch sessions for today
        const sessionsResponse = await apiGet('attendance/sessions')
        if (sessionsResponse.ok) {
          const sessionsResult = await sessionsResponse.json()
          const sessions = sessionsResult.data || []

          const classesToday = sessions.filter(session => {
            if (!session.sessionDate) return false
            const sessionDate = new Date(session.sessionDate)
            sessionDate.setHours(0, 0, 0, 0)
            return sessionDate.getTime() === today.getTime()
          }).length

          setStats({
            totalStudents,
            activeSubjects,
            classesToday
          })
        } else {
          setStats({
            totalStudents,
            activeSubjects,
            classesToday: 0
          })
        }
      } catch (error) {
        console.error('Error fetching stats:', error)
        // Use basic stats from groups
        setStats({
          totalStudents: 0,
          activeSubjects: groups.length,
          classesToday: 0
        })
      }
    }

    if (groups.length > 0) {
      fetchStats()
    }
  }, [groups])

  const handleNavigation = path => {
    if (path === '/logout') {
      logout(navigate)
    } else {
      navigate(path)
    }
  }

  const notificationItems = [
    'New student joined IT Elective class',
    'Section IT3R9 meeting scheduled',
    'Attendance report ready for IT311'
  ]

  const filteredGroups = groups.filter(card => {
    return (
      card.section.toLowerCase().includes(searchTerm.toLowerCase()) &&
      (!filterSubject || card.title === filterSubject)
    )
  })

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

      <main style={{ flex: 1, padding: '48px 60px', overflowY: 'auto' }}>
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
              onSettingsClick={() =>
                toast.info('Settings feature coming soon!')
              }
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 30,
            gap: 20
          }}
        >
          <div style={{ flex: 1, maxWidth: 400 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: neutral.bgSurface,
                borderRadius: 8,
                padding: '8px 16px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
              }}
            >
              <i
                className='bi bi-search'
                style={{ color: brand.secondary, fontSize: 18 }}
              ></i>
              <input
                id='search-sections'
                name='searchTerm'
                type='text'
                placeholder='Search sections...'
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                aria-label='Search sections'
                style={{
                  border: 'none',
                  outline: 'none',
                  padding: '8px 12px',
                  fontSize: 16,
                  width: '100%',
                  color: neutral.textPrimary,
                  background: 'transparent'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type='button'
              onClick={() => setShowSummaryModal(true)}
              style={{
                padding: '10px 18px',
                borderRadius: 8,
                border: 'none',
                background: interactive.primary,
                color: neutral.bgSurface,
                fontSize: 14,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                cursor: 'pointer'
              }}
            >
              <i className='bi bi-table' />
              Subject Summary
            </button>
            <select
              id='filter-subject'
              name='filterSubject'
              value={filterSubject}
              onChange={e => setFilterSubject(e.target.value)}
              aria-label='Filter by subject'
              style={{
                padding: '12px 20px',
                borderRadius: 8,
                border: '1px solid transparent',
                fontSize: 15,
                color: neutral.bgSurface,
                background: brand.secondary,
                cursor: 'pointer',
                minWidth: 180
              }}
            >
              <option value=''>All Subjects</option>
              {uniqueSubjects.map(subject => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 20,
            marginBottom: 40
          }}
        >
          <StatCard
            icon='bi-people-fill'
            label='Total Students'
            value={stats.totalStudents.toString()}
            color={statusColors.present.border}
          />
          <StatCard
            icon='bi-collection'
            label='Active Subjects'
            value={stats.activeSubjects.toString()}
            color={interactive.primary}
          />
          <StatCard
            icon='bi-clock-history'
            label='Classes Today'
            value={stats.classesToday.toString()}
            color={statusColors.late.border}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 40
          }}
        >
          {loading && (
            <div style={{ gridColumn: '1 / -1', color: brand.secondary }}>
              Loading subjects...
            </div>
          )}
          {error && !loading && (
            <div
              style={{ gridColumn: '1 / -1', color: statusColors.absent.text }}
            >
              Error: {error}
            </div>
          )}
          {!loading && !error && filteredGroups.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '60px 20px',
                color: neutral.textSecondary,
                fontSize: '18px'
              }}
            >
              <i
                className='bi bi-book'
                style={{
                  fontSize: '48px',
                  marginBottom: '16px',
                  display: 'block'
                }}
              ></i>
              <p>
                No subjects found. Create your first subject to get started!
              </p>
            </div>
          )}
          {!loading &&
            !error &&
            filteredGroups.map((card, idx) => (
              <SubjectCard
                key={idx}
                {...card}
                onIssueCredentials={() => openCredentialModal(card)}
                onViewDetails={() => {
                  setSelectedGroup(card)
                  setShowDetailsModal(true)
                }}
                onViewEligibility={subjectId => {
                  setSelectedSubjectId(subjectId)
                  setShowEligibilityModal(true)
                }}
              />
            ))}
        </div>

        {showSummaryModal && (
          <SubjectSummaryModal
            rows={subjectSummaryRows}
            onClose={() => setShowSummaryModal(false)}
          />
        )}

        {showDetailsModal && selectedGroup && (
          <SubjectDetailsModal
            group={selectedGroup}
            onClose={() => setShowDetailsModal(false)}
          />
        )}

        {showEligibilityModal && selectedSubjectId && (
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
              zIndex: 1000,
              padding: 20
            }}
          >
            <div
              style={{
                background: neutral.bgSurface,
                borderRadius: 16,
                maxWidth: 1200,
                maxHeight: '90%',
                overflow: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                width: '90%'
              }}
            >
              <DFEligibilityWarnings
                subjectId={selectedSubjectId}
                onClose={() => {
                  setShowEligibilityModal(false)
                  setSelectedSubjectId(null)
                }}
              />
            </div>
          </div>
        )}

        {credentialModalOpen && credentialSubject && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1100,
              padding: 20
            }}
          >
            <div
              style={{
                background: neutral.bgSurface,
                borderRadius: 16,
                width: '90%',
                maxWidth: 600,
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '32px 36px',
                position: 'relative',
                boxShadow: '0 12px 40px rgba(0,0,0,0.25)'
              }}
            >
              <button
                onClick={closeCredentialModal}
                style={{
                  position: 'absolute',
                  top: 20,
                  right: 20,
                  border: 'none',
                  background: 'transparent',
                  fontSize: 26,
                  cursor: 'pointer',
                  color: brand.secondary
                }}
                aria-label='Close credential modal'
              >
                ×
              </button>

              <h2
                style={{
                  margin: 0,
                  color: brand.secondary,
                  fontSize: 26,
                  fontWeight: 800,
                  marginBottom: 10
                }}
              >
                Trackit Authentication
              </h2>
              <p
                style={{
                  margin: 0,
                  color: neutral.textSecondary,
                  marginBottom: 24
                }}
              >
                Issue a verification token for{' '}
                <strong>
                  {credentialSubject.section || credentialSubject.title}
                </strong>
                . Share the Meet code that Trackit should trust for this class.
              </p>

              <form onSubmit={issueCredentials}>
                <label
                  htmlFor='trackit-meet-code'
                  style={{
                    display: 'block',
                    fontWeight: 600,
                    color: brand.secondary,
                    marginBottom: 6
                  }}
                >
                  Google Meet Code
                </label>
                <input
                  id='trackit-meet-code'
                  type='text'
                  name='meetCode'
                  placeholder='abc-defg-hij'
                  value={credentialForm.meetCode}
                  onChange={handleCredentialFieldChange}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1px solid ${neutral.border}`,
                    fontSize: 16,
                    marginBottom: 12
                  }}
                />
                <small style={{ color: neutral.textMuted }}>
                  Copy the last part of your Google Meet link (e.g.,{' '}
                  <code>abc-defg-hij</code>).
                </small>

                {credentialStatus.message && (
                  <div
                    style={{
                      marginTop: 16,
                      marginBottom: 16,
                      padding: 12,
                      borderRadius: 8,
                      background:
                        credentialStatus.type === 'error'
                          ? statusColors.absent.bg
                          : credentialStatus.type === 'success'
                          ? statusColors.present.bg
                          : interactive.primaryLight,
                      color:
                        credentialStatus.type === 'error'
                          ? statusColors.absent.text
                          : credentialStatus.type === 'success'
                          ? statusColors.present.text
                          : brand.primary,
                      border:
                        credentialStatus.type === 'error'
                          ? `1px solid ${statusColors.absent.border}`
                          : credentialStatus.type === 'success'
                          ? `1px solid ${statusColors.present.border}`
                          : `1px solid ${interactive.primary}`
                    }}
                  >
                    {credentialStatus.message}
                  </div>
                )}

                {credentialResult && (
                  <div
                    style={{
                      border: `1px solid ${neutral.border}`,
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 16,
                      background: neutral.bgMuted
                    }}
                  >
                    <div style={{ marginBottom: 12 }}>
                      <div
                        style={{
                          fontSize: 14,
                          color: neutral.textSecondary,
                          marginBottom: 4
                        }}
                      >
                        Verification Token
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          wordBreak: 'break-all',
                          fontFamily: 'monospace',
                          fontSize: 14
                        }}
                      >
                        {credentialResult.verificationToken}
                        <button
                          type='button'
                          onClick={() =>
                            copyToClipboard(credentialResult.verificationToken)
                          }
                          style={{
                            border: 'none',
                            background: interactive.primaryLight,
                            color: interactive.primary,
                            padding: '4px 10px',
                            borderRadius: 999,
                            cursor: 'pointer',
                            fontSize: 12
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8
                      }}
                    >
                      <div>
                        <span
                          style={{ fontSize: 14, color: neutral.textSecondary }}
                        >
                          Group ID
                        </span>
                        <div style={{ fontFamily: 'monospace', fontSize: 14 }}>
                          {credentialResult.subjectId}
                        </div>
                      </div>
                      <div>
                        <span
                          style={{ fontSize: 14, color: neutral.textSecondary }}
                        >
                          Roster Members Synced
                        </span>
                        <div
                          style={{ fontWeight: 600, color: brand.secondary }}
                        >
                          {(credentialResult.roster || []).length} member(s)
                        </div>
                      </div>
                      <div>
                        <span
                          style={{ fontSize: 14, color: neutral.textSecondary }}
                        >
                          Expires
                        </span>
                        <div>
                          {new Date(
                            credentialResult.expiresAt
                          ).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                  <button
                    type='submit'
                    disabled={credentialLoading}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      border: 'none',
                      borderRadius: 10,
                      background: credentialLoading
                        ? neutral.textMuted
                        : interactive.primary,
                      color: neutral.bgSurface,
                      fontSize: 16,
                      fontWeight: 700,
                      cursor: credentialLoading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {credentialLoading ? 'Issuing…' : 'Generate Credentials'}
                  </button>
                  <button
                    type='button'
                    onClick={closeCredentialModal}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 10,
                      border: `1px solid ${neutral.border}`,
                      background: neutral.bgSurface,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

const SubjectSummaryModal = ({ rows, onClose }) => {
  const safeRows = Array.isArray(rows) ? rows : []

  return (
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
        zIndex: 1200,
        padding: 20
      }}
    >
      <div
        style={{
          background: neutral.bgSurface,
          borderRadius: 16,
          width: '96%',
          maxWidth: 1200,
          maxHeight: '90vh',
          overflow: 'hidden',
          boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            border: 'none',
            background: 'transparent',
            fontSize: 22,
            cursor: 'pointer',
            color: brand.secondary
          }}
          aria-label='Close subject summary'
        >
          ×
        </button>

        <div
          style={{
            padding: '24px 28px 16px 28px',
            borderBottom: `1px solid ${neutral.border}`
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 800,
                  color: brand.secondary
                }}
              >
                Subject Summary
              </h2>
              <p
                style={{
                  margin: '6px 0 0 0',
                  fontSize: 14,
                  color: neutral.textSecondary
                }}
              >
                Overview of your subjects and sections. Room and unit details
                are intentionally hidden.
              </p>
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 24px 24px 24px' }}>
          {safeRows.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: neutral.textSecondary
              }}
            >
              No subjects available to summarize.
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                borderRadius: 12,
                border: `1px solid ${neutral.border}`,
                background: neutral.bgSurface,
                overflowX: 'auto'
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: 800
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: neutral.bgMuted
                    }}
                  >
                    {[
                      '#',
                      'Code',
                      'Description',
                      'Section',
                      'Schedule',
                      'Teacher'
                    ].map(header => (
                      <th
                        key={header}
                        style={{
                          padding: '10px 12px',
                          fontSize: 12,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          textAlign:
                            header === 'Description' || header === 'Schedule'
                              ? 'left'
                              : 'center',
                          color: neutral.textSecondary,
                          borderBottom: `1px solid ${neutral.borderLight}`,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {safeRows.map((row, index) => (
                    <tr
                      key={row.key || index}
                      style={{
                        background:
                          index % 2 === 0 ? neutral.bgSurface : neutral.bgMuted
                      }}
                    >
                      <td
                        style={{
                          padding: '8px 10px',
                          fontSize: 13,
                          textAlign: 'center',
                          color: neutral.textPrimary,
                          borderBottom: `1px solid ${neutral.borderLight}`,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {index + 1}
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          fontSize: 13,
                          textAlign: 'center',
                          color: brand.secondary,
                          borderBottom: `1px solid ${neutral.borderLight}`,
                          whiteSpace: 'nowrap',
                          fontWeight: 600
                        }}
                      >
                        {row.code || '—'}
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          fontSize: 13,
                          textAlign: 'left',
                          color: neutral.textPrimary,
                          borderBottom: `1px solid ${neutral.borderLight}`
                        }}
                      >
                        {row.description || '—'}
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          fontSize: 13,
                          textAlign: 'center',
                          color: neutral.textPrimary,
                          borderBottom: `1px solid ${neutral.borderLight}`,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {row.section || '—'}
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          fontSize: 13,
                          textAlign: 'left',
                          color: neutral.textPrimary,
                          borderBottom: `1px solid ${neutral.borderLight}`,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {row.schedule || '—'}
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          fontSize: 13,
                          textAlign: 'left',
                          color: neutral.textPrimary,
                          borderBottom: `1px solid ${neutral.borderLight}`,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {row.teacher || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const StatCard = ({ icon, label, value, color }) => (
  <div
    style={{
      background: neutral.bgSurface,
      borderRadius: 12,
      padding: '20px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flex: 1,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
    }}
  >
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        background: `${color}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <i className={`bi ${icon}`} style={{ fontSize: 24, color: color }}></i>
    </div>
    <div>
      <div style={{ fontSize: 14, color: neutral.textMuted, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: brand.secondary }}>
        {value}
      </div>
    </div>
  </div>
)

const SubjectCard = ({
  id,
  section,
  instructor,
  instructorEmail,
  title,
  subjectCode,
  day,
  time,
  room,
  department,
  schoolYear,
  semester,
  sections,
  meetingLink,
  description,
  credits,
  isActive,
  createdAt,
  updatedAt,
  schedule,
  onViewEligibility,
  onIssueCredentials
}) => {
  const [showDetails, setShowDetails] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const navigate = useNavigate()

  const joinScheduleState = useMemo(
    () => getJoinScheduleState(schedule, day, time, isActive),
    [schedule, day, time, isActive]
  )
  const joinDisabled = !joinScheduleState.canJoinNow

  const joinButtonStyle = {
    ...actionButtonStyle,
    background: joinDisabled ? neutral.bgMuted : actionButtonStyle.background,
    color: joinDisabled ? neutral.textMuted : actionButtonStyle.color,
    cursor: joinDisabled ? 'not-allowed' : actionButtonStyle.cursor,
    opacity: joinDisabled ? 0.8 : 1
  }

  // Auto-generate credentials helper function
  // Can be called when extension detects missing credentials
  // Reserved for future extension integration
  // eslint-disable-next-line no-unused-vars
  const autoGenerateCredentials = async (meetCode, userId) => {
    if (!meetCode || !userId || !id) {
      console.warn(
        '⚠️ Cannot auto-generate credentials: missing meetCode, userId, or subjectId'
      )
      return { success: false, error: 'Missing required parameters' }
    }

    try {
      console.log('🔄 Auto-generating credentials for meetCode:', meetCode)
      const response = await apiPost(`subjects/${id}/generate-token`, {
        userId: userId
      })

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Network error' }))
        throw new Error(
          errorData.message || errorData.error || `HTTP ${response.status}`
        )
      }

      const result = await response.json()
      if (result.success && result.data) {
        const normalizedMeetCode = meetCode.toLowerCase()
        const extensionTokenData = {
          token: result.data.token,
          subjectId: result.data.subjectId || id,
          userId: userId,
          expiresAt: result.data.expiresAt,
          subjectName: title || '',
          dashboardPath: '/instructor-dashboard',
          meetCode: normalizedMeetCode,
          section: section || '',
          schoolYear: schoolYear || '',
          semester: semester || '',
          meetingLink: meetingLink
        }

        const storageResult = await storeTokenInExtensionStorage(
          extensionTokenData,
          normalizedMeetCode,
          id
        )
        if (storageResult.success) {
          console.log('✅ Auto-generated credentials stored successfully')
          toast.success('Credentials auto-generated and stored for extension')
          return { success: true, data: result.data }
        } else {
          console.warn(
            '⚠️ Auto-generated credentials but storage failed:',
            storageResult.error
          )
          return { success: false, error: storageResult.error }
        }
      }
      return { success: false, error: 'Token generation failed' }
    } catch (error) {
      console.error('❌ Error auto-generating credentials:', error)
      return { success: false, error: error.message }
    }
  }

  const handleJoinMeeting = async () => {
    if (!joinScheduleState.canJoinNow) {
      if (joinScheduleState.reason) {
        toast.warning(joinScheduleState.reason)
      }
      return
    }
    if (!meetingLink) {
      alert(
        'No Google Meet link available for this subject. Please add a meeting link in Subject Settings.'
      )
      return
    }

    // Extract meetCode from meeting link
    const meetCode = extractMeetCodeFromLink(meetingLink)
    if (!meetCode) {
      alert(
        'Unable to extract meeting code from the link. Please check the meeting link format.'
      )
      return
    }

    // Get current user (instructor)
    let instructorId = null
    let user = null
    try {
      const userStr = localStorage.getItem('user')
      user = userStr ? JSON.parse(userStr) : null
      instructorId = user?._id || user?.id || null
    } catch (error) {
      console.error('Error parsing user data:', error)
    }

    if (!instructorId || !id) {
      alert('Unable to identify instructor or subject. Please login again.')
      return
    }

    // Try to generate token before opening meeting, but open link even if it fails
    try {
      const response = await apiPost(`subjects/${id}/generate-token`, {
        userId: instructorId
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
        const normalizedMeetCode = meetCode.toLowerCase()

        console.log(
          '🔑 Token generation - meetCode:',
          normalizedMeetCode,
          'from link:',
          meetingLink
        )

        // Store token in localStorage with all necessary data for attendance tracking
        const tokenKey = `attendance_token_${id}`
        const tokenData = {
          token: result.data.token,
          subjectId: result.data.subjectId || id,
          userId: instructorId,
          expiresAt: result.data.expiresAt,
          subjectName: title || '',
          dashboardPath: `/instructor-dashboard`, // Instructor dashboard path
          meetCode: normalizedMeetCode,
          section: section || '',
          schoolYear: schoolYear || '',
          semester: semester || '',
          meetingLink: meetingLink,
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
          dashboardPath: `/instructor-dashboard`, // Instructor dashboard path
          meetCode: normalizedMeetCode,
          section: tokenData.section,
          schoolYear: tokenData.schoolYear,
          semester: tokenData.semester,
          meetingLink: meetingLink // Store link for later meetCode extraction
        }

        // Use helper function to store token (tries direct access, falls back to message passing)
        const storageResult = await storeTokenInExtensionStorage(
          extensionTokenData,
          normalizedMeetCode,
          id
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
        if (normalizedMeetCode) {
          const meetCodeKey = `attendance_token_meetCode_${normalizedMeetCode}`
          localStorage.setItem(meetCodeKey, JSON.stringify(tokenData))
          console.log('✅ Token stored by meetCode:', normalizedMeetCode)
        }

        // Store in a global array of active tokens for extension access
        try {
          const activeTokens = JSON.parse(
            localStorage.getItem('neattend_active_tokens') || '[]'
          )
          // Remove existing token for this subject/meetCode
          const filtered = activeTokens.filter(
            t =>
              t.subjectId !== tokenData.subjectId &&
              t.meetCode !== normalizedMeetCode
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
          meetCode: normalizedMeetCode,
          expiresAt: tokenData.expiresAt,
          algorithm: result.data.algorithm || 'unknown'
        })
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
      }
    } catch (error) {
      console.error('Error generating token:', error)
      const errorMessage =
        error.message || 'Network error or server unavailable'
      alert(
        `Error generating verification token: ${errorMessage}. Opening meeting link without attendance tracking.`
      )
    }

    // Store meeting context for extension access (keep for backward compatibility)
    const meetingContext = {
      meetCode: meetCode.toLowerCase(),
      subjectId: id,
      instructorId: instructorId,
      meetingLink: meetingLink,
      timestamp: new Date().toISOString()
    }

    // Store in localStorage (accessible by content script)
    try {
      localStorage.setItem(
        `neattend_meeting_${meetCode.toLowerCase()}`,
        JSON.stringify(meetingContext)
      )
      localStorage.setItem(
        'neattend_current_meeting',
        JSON.stringify(meetingContext)
      )

      // Also store in chrome.storage if available (for background script)
      if (typeof window !== 'undefined' && window.chrome?.storage?.local) {
        window.chrome.storage.local.set(
          {
            neattend_current_meeting: meetingContext,
            neattend_user_id: instructorId
          },
          () => {
            if (window.chrome.runtime?.lastError) {
              console.warn(
                '⚠️ Failed to store in chrome.storage:',
                window.chrome.runtime.lastError.message
              )
            } else {
              console.log('✅ Meeting context stored for extension')
            }
          }
        )
      }
    } catch (error) {
      console.warn('⚠️ Error storing meeting context:', error)
    }

    // Notify extension background script to update registration
    if (typeof window !== 'undefined' && window.chrome?.runtime) {
      try {
        window.chrome.runtime.sendMessage(
          {
            type: 'UPDATE_REGISTRATION',
            payload: {
              meetCode: meetCode.toLowerCase(),
              subjectId: id,
              instructorId: instructorId
            }
          },
          () => {
            if (window.chrome.runtime.lastError) {
              console.warn(
                '⚠️ Extension not available:',
                window.chrome.runtime.lastError.message
              )
            } else {
              console.log('✅ Extension registration updated')
            }
          }
        )
      } catch (error) {
        console.warn('⚠️ Could not notify extension:', error)
      }
    }

    // Normalize meeting link before opening
    let linkToOpen = meetingLink.trim()

    // Check if it's just a meeting code (format: abc-defg-hij)
    const meetCodePattern = /^[a-z]+-[a-z]+-[a-z]+$/i
    if (meetCodePattern.test(linkToOpen)) {
      // It's just a meeting code, construct full URL
      linkToOpen = `https://meet.google.com/${linkToOpen}`
    } else if (!/^https?:\/\//i.test(linkToOpen)) {
      // Has some content but no protocol, add https://
      linkToOpen = `https://${linkToOpen}`
    }

    // Open meeting in new tab
    window.open(linkToOpen, '_blank')

    console.log(
      '✅ Meeting opened. Extension should start automatically when page loads.'
    )
  }

  return (
    <>
      <div
        style={{
          background: neutral.bgSurface,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
          transition: 'transform 0.2s'
        }}
      >
        <div
          onClick={() => {
            if (id) {
              navigate(`/group-settings/${id}`)
            } else {
              console.warn('No valid subject ID available for navigation')
            }
          }}
          style={{
            background: brand.secondary,
            padding: '20px',
            color: neutral.bgSurface,
            cursor: id ? 'pointer' : 'default',
            transition: 'background 0.2s',
            opacity: id ? 1 : 0.7
          }}
        >
          <h3 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
            {section}
          </h3>
          <p style={{ margin: '8px 0 0 0', fontSize: 15 }}>{instructor}</p>
        </div>

        <div
          style={{
            background: statusColors.host.border,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i
                className='bi bi-camera-video-fill'
                style={{ fontSize: 24, color: brand.secondary }}
              ></i>
              <span
                style={{
                  fontWeight: 700,
                  color: brand.secondary,
                  fontSize: 18
                }}
              >
                {title}
              </span>
            </div>
            <div style={{ marginTop: 4, color: brand.secondary, fontSize: 14 }}>
              {time}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                style={joinButtonStyle}
                onClick={handleJoinMeeting}
                disabled={joinDisabled}
                title={
                  joinScheduleState.canJoinNow
                    ? 'Start the scheduled session for this class'
                    : joinScheduleState.reason
                }
              >
                <i className='bi bi-camera-video-fill'></i>
                Join
              </button>
              <button
                style={actionButtonStyle}
                onClick={() => setShowDetails(true)}
              >
                <i className='bi bi-people-fill'></i>
                Info
              </button>
              <button
                style={actionButtonStyle}
                onClick={() => setShowMembers(true)}
              >
                <i className='bi bi-people'></i>
                Members
              </button>
              {id && onViewEligibility && (
                <button
                  style={{
                    ...actionButtonStyle,
                    background: statusColors.absent.border,
                    color: neutral.bgSurface
                  }}
                  onClick={e => {
                    e.stopPropagation()
                    onViewEligibility(id)
                  }}
                  title='View D/F Eligibility Warnings'
                >
                  <i className='bi bi-exclamation-triangle-fill'></i>
                  D/F
                </button>
              )}
              {onIssueCredentials && (
                <button
                  style={{
                    ...actionButtonStyle,
                    background: brand.primary,
                    color: neutral.bgSurface
                  }}
                  onClick={e => {
                    e.stopPropagation()
                    onIssueCredentials()
                  }}
                  title='Generate verification token for Trackit'
                >
                  <i className='bi bi-link-45deg'></i>
                  Token
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <i
                className='bi bi-people-fill'
                style={{ fontSize: 20, color: brand.secondary }}
              ></i>
              <span style={{ fontWeight: 700, color: brand.secondary }}>
                Section: {section}
              </span>
            </div>
          </div>
        </div>
      </div>

      {showDetails && (
        <SubjectDetailsModal
          group={{
            id,
            section,
            instructor,
            instructorEmail,
            title,
            subjectCode,
            day,
            time,
            room,
            department,
            schoolYear,
            semester,
            sections,
            meetingLink,
            description,
            credits,
            isActive,
            createdAt,
            updatedAt
          }}
          onClose={() => setShowDetails(false)}
        />
      )}

      {showMembers && (
        <SubjectStudentsModal
          isOpen={showMembers}
          subjectId={id}
          subjectName={title}
          onClose={() => setShowMembers(false)}
        />
      )}
    </>
  )
}

const actionButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 6,
  border: 'none',
  background: 'rgba(35, 34, 92, 0.1)',
  color: brand.secondary,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.2s'
}

const SubjectDetailsModal = ({ group, onClose }) => (
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
      zIndex: 1000
    }}
  >
    <div
      style={{
        background: neutral.bgSurface,
        padding: 40,
        borderRadius: 16,
        width: '90%',
        maxWidth: 700,
        maxHeight: '90vh',
        overflowY: 'auto',
        position: 'relative'
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'transparent',
          border: 'none',
          fontSize: 24,
          color: brand.secondary,
          cursor: 'pointer'
        }}
      >
        ×
      </button>

      <h2
        style={{
          margin: '0 0 32px 0',
          color: brand.secondary,
          fontSize: 32,
          fontWeight: 800,
          borderBottom: `2px solid ${brand.secondary}`,
          paddingBottom: 8
        }}
      >
        DETAILS
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '16px 24px'
        }}
      >
        <DetailRow label='Subject Name:' value={group.title || 'N/A'} />
        <DetailRow label='Subject Code:' value={group.subjectCode || 'N/A'} />
        <DetailRow
          label='Subject ID:'
          value={group.id || group.subjectId || 'N/A'}
        />
        <DetailRow label='Department:' value={group.department || 'N/A'} />
        {group.description && (
          <DetailRow
            label='Description:'
            value={group.description}
            style={{ gridColumn: '1 / -1' }}
          />
        )}
        <DetailRow
          label='Credits:'
          value={
            group.credits
              ? `${group.credits} ${group.credits === 1 ? 'credit' : 'credits'}`
              : 'N/A'
          }
        />
        <DetailRow
          label='Status:'
          value={
            <span
              style={{
                padding: '4px 12px',
                borderRadius: 12,
                background:
                  group.isActive !== false
                    ? statusColors.present.bg
                    : statusColors.absent.bg,
                color:
                  group.isActive !== false
                    ? statusColors.present.text
                    : statusColors.absent.text,
                fontSize: 13,
                fontWeight: 600
              }}
            >
              {group.isActive !== false ? 'Active' : 'Inactive'}
            </span>
          }
        />
        <DetailRow label='Day:' value={group.day || 'N/A'} />
        <DetailRow label='Time:' value={group.time || 'N/A'} />
        <DetailRow
          label='Schedule:'
          value={
            group.timeScheduleLocal ||
            `${group.day || 'TBD'} at ${group.time || 'TBD'}`
          }
        />
        <DetailRow label='Room:' value={group.room || 'N/A'} />
        <DetailRow label='Section:' value={group.section || 'N/A'} />
        <DetailRow
          label='Sections:'
          value={
            Array.isArray(group.sections) && group.sections.length > 0
              ? group.sections.join(', ')
              : 'N/A'
          }
        />
        <DetailRow label='Instructor:' value={group.instructor || 'N/A'} />
        {group.instructorEmail && (
          <DetailRow
            label='Instructor Email:'
            value={
              <a
                href={`mailto:${group.instructorEmail}`}
                style={{ color: brand.secondary, textDecoration: 'underline' }}
              >
                {group.instructorEmail}
              </a>
            }
          />
        )}
        <DetailRow label='School Year:' value={group.schoolYear || 'N/A'} />
        <DetailRow label='Semester:' value={group.semester || 'N/A'} />
        <DetailRow
          label='Meeting Link:'
          value={
            group.meetingLink ? (
              <a
                href={group.meetingLink}
                target='_blank'
                rel='noopener noreferrer'
                style={{
                  color: brand.secondary,
                  textDecoration: 'underline',
                  wordBreak: 'break-all'
                }}
              >
                {group.meetingLink}
              </a>
            ) : (
              'N/A'
            )
          }
        />
        <DetailRow
          label='Total Students:'
          value={
            <span
              style={{
                padding: '4px 12px',
                borderRadius: 12,
                background: neutral.bgHover,
                color: brand.secondary,
                fontSize: 13,
                fontWeight: 600
              }}
            >
              Section: {group.section || 'N/A'}
            </span>
          }
        />
        <DetailRow
          label='Date Created:'
          value={
            group.createdAt
              ? new Date(group.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : 'N/A'
          }
        />
        {group.updatedAt && group.updatedAt !== group.createdAt && (
          <DetailRow
            label='Last Updated:'
            value={new Date(group.updatedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          />
        )}
      </div>

      <div
        style={{
          marginTop: 32,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: '10px 24px',
            borderRadius: 8,
            border: 'none',
            background: brand.secondary,
            color: neutral.bgSurface,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Close
        </button>
      </div>
    </div>
  </div>
)

const DetailRow = ({ label, value, style: customStyle }) => (
  <>
    <div
      style={{
        color: brand.secondary,
        fontSize: 16,
        fontWeight: 600
      }}
    >
      {label}
    </div>
    <div
      style={{
        color: brand.secondary,
        fontSize: 16,
        ...(customStyle || {})
      }}
    >
      {value}
    </div>
  </>
)

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

// eslint-disable-next-line no-unused-vars
const SubjectMembersModal = ({ subjectId, sections, onClose }) => {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchStudents = async () => {
    setLoading(true)
    try {
      if (!subjectId) {
        setStudents([])
        return
      }

      // Fetch students enrolled in this subject (by section matching)
      const res = await apiGet(`subjects/${subjectId}/students`)
      const data = await res.json()
      if (data.success && data.data && data.data.students) {
        setStudents(data.data.students)
      } else {
        setStudents([])
      }
    } catch {
      setStudents([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!subjectId) return
    fetchStudents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId])

  // NOTE: Credential auto-generation is handled at the Subject component level,
  // not in SubjectMembersModal since this component doesn't have access to the
  // required meeting link and credential generation functions.

  return (
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
        zIndex: 1000
      }}
    >
      <div
        style={{
          background: neutral.bgSurface,
          padding: 28,
          borderRadius: 12,
          width: '92%',
          maxWidth: 760,
          position: 'relative',
          maxHeight: '86vh',
          overflowY: 'auto'
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'transparent',
            border: 'none',
            fontSize: 22,
            color: brand.secondary,
            cursor: 'pointer'
          }}
        >
          ×
        </button>

        <h3
          style={{
            margin: '4px 0 18px 0',
            fontSize: 22,
            fontWeight: 800,
            color: brand.secondary,
            borderBottom: `2px solid ${brand.secondary}`,
            paddingBottom: 8
          }}
        >
          Subject Members
        </h3>

        {loading ? (
          <div style={{ color: brand.secondary }}>Loading students...</div>
        ) : students.length === 0 ? (
          <div style={{ color: neutral.textMuted }}>No students found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {students.map(s => {
              const studentId = s._id || s.id
              return (
                <div
                  key={studentId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    background: neutral.bgMuted,
                    borderRadius: 10,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      flex: 1
                    }}
                  >
                    <img
                      src={
                        s.profilePicture ||
                        'https://cdn-icons-png.flaticon.com/512/149/149071.png'
                      }
                      alt='profile'
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: `2px solid ${brand.secondary}`
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: brand.secondary
                        }}
                      >
                        {s.firstName || 'Unknown'} {s.lastName || ''}
                      </div>
                      <div
                        style={{ fontSize: 13, color: neutral.textSecondary }}
                      >
                        {s.studentId || s._id || 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <div
                      style={{
                        padding: '6px 16px',
                        borderRadius: 20,
                        fontWeight: 700,
                        fontSize: 14,
                        background:
                          s.active !== false
                            ? statusColors.present.bg
                            : statusColors.absent.bg,
                        color:
                          s.active !== false
                            ? statusColors.present.border
                            : statusColors.absent.border,
                        border: `2px solid ${
                          s.active !== false
                            ? statusColors.present.border
                            : statusColors.absent.border
                        }`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <i
                        className={`bi ${
                          s.active !== false
                            ? 'bi-check-circle-fill'
                            : 'bi-x-circle-fill'
                        }`}
                      ></i>
                      {s.active !== false ? 'Active' : 'Inactive'}
                    </div>
                    <div
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 13,
                        color: neutral.textMuted,
                        fontWeight: 600
                      }}
                    >
                      Section: {s.section || 'N/A'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const INPUT_STYLE = {
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${neutral.border}`,
  borderRadius: 8,
  fontSize: 14,
  color: brand.secondary
}

const BUTTON_STYLE = {
  padding: '8px 16px',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 700,
  color: brand.secondary,
  cursor: 'pointer'
}

export default Subject
