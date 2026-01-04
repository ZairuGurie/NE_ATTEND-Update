import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import logo from '../assets/logo.png'
import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 4: CSS classes for theme-aware styling
import '../styles/common.css'
import { logout, getCurrentUser } from '../utils/auth'
import { apiGet, apiPost } from '../utils/api'
import { status as statusColors, brand, neutral } from '../utils/colors'
import StatusBanner from '../components/StatusBanner'
import NotificationBell from '../components/NotificationBell'
import UserMenu from '../components/layout/UserMenu'
ChartJS.register(ArcElement, Tooltip, Legend)

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

const readCachedCredentials = () => {
  try {
    const serialized = localStorage.getItem('neattend_auth')
    return serialized ? JSON.parse(serialized) : null
  } catch (err) {
    console.warn('⚠️ Unable to read cached credentials:', err.message)
    return null
  }
}

const hydrateAttendancePayload = payload => {
  if (!payload) return null
  const cached = readCachedCredentials()
  return {
    ...payload,
    verificationToken:
      payload.verificationToken || cached?.verificationToken || null,
    groupId: payload.groupId || cached?.groupId || null,
    roster: payload.roster || cached?.roster || []
  }
}

const isPayloadReady = payload => {
  return Boolean(
    payload &&
      payload.verificationToken &&
      payload.groupId &&
      Array.isArray(payload.participants) &&
      payload.participants.length > 0
  )
}

// Default empty data - will be replaced by API calls
// Using design system colors for consistency
const defaultSummaryData = [
  { label: 'PRESENT', value: 0, color: statusColors.present.border },
  { label: 'ABSENT', value: 0, color: statusColors.absent.border },
  { label: 'LATE', value: 0, color: statusColors.late.border }
]

const Dashboard = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())
  const hasInitialized = useRef(false)
  const abortControllerRef = useRef(null)

  // Attendance Receiver State
  const [attendanceData, setAttendanceData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [showAttendanceReceiver, setShowAttendanceReceiver] = useState(false)

  // Dashboard data state
  const [summaryData, setSummaryData] = useState(defaultSummaryData)
  const [attendanceRows, setAttendanceRows] = useState([])
  const [_dashboardLoading, setDashboardLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState('')
  const [tardinessData, setTardinessData] = useState({
    tardinessCount: 0,
    consecutiveWeeksAbsent: 0,
    contactHoursAbsentPercentage: 0,
    isDFEligible: false,
    dfEligibilityReasons: []
  })
  const participantsCount = attendanceData?.participants?.length || 0
  const credentialsReady = Boolean(
    attendanceData?.verificationToken && attendanceData?.groupId
  )
  const receiverSaveDisabled =
    loading || !attendanceData || !credentialsReady || participantsCount === 0

  // Fetch attendance summary and recent attendance
  // Note: Removed currentUser from dependencies to prevent infinite loops
  // The function uses getCurrentUser() as fallback, so it doesn't need currentUser in closure
  const fetchDashboardData = useCallback(async (userContext = null) => {
    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new AbortController for this request
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setDashboardLoading(true)
    setDashboardError('')
    try {
      // Try to get userId from provided context or cached user
      const cachedUser = userContext || getCurrentUser()
      let userId = cachedUser?._id || cachedUser?.id

      // Always fetch fresh user data from API if we have a userId
      let freshUser = cachedUser
      if (userId) {
        try {
          // Note: apiGet doesn't support AbortController directly, but we check if aborted
          const userResponse = await apiGet(`users/${userId}`)

          // Check if request was aborted
          if (abortController.signal.aborted) {
            return
          }

          if (userResponse.ok) {
            const userResult = await userResponse.json()
            if (userResult.success && userResult.data) {
              freshUser = userResult.data
              userId = freshUser._id || freshUser.id
              // Update currentUser state with fresh data
              setCurrentUser(freshUser)
            }
          }
        } catch (userError) {
          // Ignore abort errors
          if (abortController.signal.aborted) {
            return
          }
          console.warn(
            'Could not fetch fresh user data, using cached:',
            userError
          )
          // Continue with cached user if API call fails
        }
      }

      if (!userId) {
        setDashboardError('User not authenticated. Please log in again.')
        setSummaryData(defaultSummaryData)
        setAttendanceRows([])
        setTardinessData({
          tardinessCount: 0,
          consecutiveWeeksAbsent: 0,
          contactHoursAbsentPercentage: 0,
          isDFEligible: false,
          dfEligibilityReasons: []
        })
        return
      }

      // Check if request was aborted before continuing
      if (abortController.signal.aborted) {
        return
      }

      // Fetch recent attendance records
      const recentResponse = await apiGet('attendance/recent?limit=50')

      // Check if request was aborted
      if (abortController.signal.aborted) {
        return
      }

      if (recentResponse.ok) {
        const recentResult = await recentResponse.json()
        const recentRecords = recentResult.data || []

        // Filter by current user if student
        const userRecords = userId
          ? recentRecords.filter(
              r => r.userId === userId || r.userId?._id === userId
            )
          : recentRecords

        // Further restrict to validated records when available
        const validatedRecords = userRecords.filter(
          r => !r.isUnauthenticated && !r.authWarning
        )
        const verifiedRecords = userRecords.filter(
          r => r.isVerifiedParticipant !== false
        )
        const effectiveRecords =
          validatedRecords.length > 0
            ? validatedRecords.filter(r => r.isVerifiedParticipant !== false)
            : verifiedRecords.length > 0
            ? verifiedRecords
            : userRecords

        // Calculate summary from effective records
        const present = effectiveRecords.filter(
          r => r.status === 'Present' || r.rawStatus === 'present'
        ).length
        const absent = effectiveRecords.filter(
          r => r.status === 'Absent' || r.rawStatus === 'absent'
        ).length
        const late = effectiveRecords.filter(
          r => r.status === 'Late' || r.rawStatus === 'late'
        ).length

        setSummaryData([
          {
            label: 'PRESENT',
            value: present,
            color: statusColors.present.border
          },
          { label: 'ABSENT', value: absent, color: statusColors.absent.border },
          { label: 'LATE', value: late, color: statusColors.late.border }
        ])

        // Transform recent records to attendance rows format (validated-first)
        const transformedRows = effectiveRecords.slice(0, 10).map(record => {
          const sessionDate = record.sessionDate
            ? new Date(record.sessionDate)
            : record.createdAt
            ? new Date(record.createdAt)
            : null

          // Prefer ISO timestamps for proper time formatting, fall back to plain strings
          const joinDateTime = record.joinTimeIso
            ? new Date(record.joinTimeIso)
            : null
          const leaveDateTime = record.leaveTimeIso
            ? new Date(record.leaveTimeIso)
            : null

          const startTime = joinDateTime
            ? joinDateTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })
            : record.joinTime || 'N/A'

          const endTime = leaveDateTime
            ? leaveDateTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })
            : record.leaveTime || 'N/A'

          const durationSeconds =
            typeof record.durationSeconds === 'number'
              ? record.durationSeconds
              : typeof record.duration === 'number'
              ? record.duration
              : 0
          const hours = Math.floor(durationSeconds / 3600)
          const minutes = Math.floor((durationSeconds % 3600) / 60)
          const seconds = durationSeconds % 60
          const durationStr = `${String(hours).padStart(2, '0')}:${String(
            minutes
          ).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

          const subjectName =
            record.subjectName || record.groupName || 'Unknown Subject'
          const groupName =
            record.groupName || record.subjectName || 'Unknown Group'

          const dateSource = sessionDate || joinDateTime || leaveDateTime
          const displayDate = dateSource
            ? dateSource.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })
            : 'N/A'

          return {
            subject: subjectName,
            group: groupName,
            code: record.meetCode || 'N/A',
            start: startTime,
            end: endTime,
            duration: durationStr,
            date: displayDate,
            schoolYear: record.user?.schoolYear || null,
            semester: record.user?.semester || null,
            isTardy: record.isTardy || false,
            status: record.status || 'Present',
            validated: !record.isUnauthenticated && !record.authWarning
          }
        })

        setAttendanceRows(transformedRows)

        // Calculate tardiness count from effective records
        const tardinessCount = effectiveRecords.filter(
          r => r.isTardy === true
        ).length

        // Check if request was aborted before continuing
        if (abortController.signal.aborted) {
          return
        }

        // Try to get D/F eligibility info if we have a groupId
        // We'll need to check all groups the student is in
        try {
          const groupsResponse = await apiGet('groups')

          // Check if request was aborted
          if (abortController.signal.aborted) {
            return
          }

          if (groupsResponse.ok) {
            const groupsResult = await groupsResponse.json()
            const groups = groupsResult.data || []

            // Find groups where user is a member
            const userGroups = groups.filter(
              g =>
                g.members &&
                g.members.some(
                  m =>
                    (m.userId?._id || m.userId) === userId &&
                    m.status === 'approved'
                )
            )

            // Get eligibility for first group (or aggregate if multiple)
            if (userGroups.length > 0) {
              // Check if request was aborted
              if (abortController.signal.aborted) {
                return
              }

              const firstGroupId = userGroups[0]._id
              const eligibilityResponse = await apiGet(
                `grades/${userId}/${firstGroupId}`
              )

              // Check if request was aborted
              if (abortController.signal.aborted) {
                return
              }

              if (eligibilityResponse.ok) {
                const eligibilityResult = await eligibilityResponse.json()
                if (eligibilityResult.success && eligibilityResult.data) {
                  setTardinessData({
                    tardinessCount,
                    consecutiveWeeksAbsent:
                      eligibilityResult.data.consecutiveWeeks || 0,
                    contactHoursAbsentPercentage:
                      eligibilityResult.data.contactHoursPercentage || 0,
                    isDFEligible: eligibilityResult.data.isEligible || false,
                    dfEligibilityReasons: eligibilityResult.data.reasons || []
                  })
                }
              }
            }
          }
        } catch (eligError) {
          // Ignore abort errors
          if (abortController.signal.aborted) {
            return
          }
          console.error('Error fetching eligibility data:', eligError)
          // Set basic tardiness count
          setTardinessData({
            tardinessCount,
            consecutiveWeeksAbsent: 0,
            contactHoursAbsentPercentage: 0,
            isDFEligible: false,
            dfEligibilityReasons: []
          })
        }
      }
    } catch (error) {
      // Ignore abort errors
      if (abortController.signal.aborted) {
        return
      }
      console.error('Error fetching dashboard data:', error)
      setDashboardError('Unable to load dashboard data right now.')
    } finally {
      // Only update loading state if not aborted
      if (!abortController.signal.aborted) {
        setDashboardLoading(false)
      }
    }
  }, []) // Empty dependency array - function doesn't need any dependencies

  // Cleanup: abort any pending requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  useEffect(() => {
    // Only bootstrap once on mount
    if (hasInitialized.current) return

    const bootstrapDashboard = async () => {
      hasInitialized.current = true
      const cachedUser = getCurrentUser()
      setCurrentUser(cachedUser)

      if (cachedUser?._id) {
        try {
          const response = await apiGet(`users/${cachedUser._id}`)
          if (response.ok) {
            const result = await response.json()
            if (result.success && result.data) {
              setCurrentUser(result.data)
              await fetchDashboardData(result.data)
            } else {
              // If API call fails, use cached user data
              await fetchDashboardData(cachedUser)
            }
          } else {
            // If API call fails, use cached user data
            await fetchDashboardData(cachedUser)
          }
        } catch (error) {
          console.error('Error refreshing user profile:', error)
          // On error, use cached user data
          await fetchDashboardData(cachedUser)
        }
      } else {
        // No cached user, set error state
        setDashboardError('User not authenticated. Please log in again.')
        setDashboardLoading(false)
      }
    }

    bootstrapDashboard()
  }, [fetchDashboardData])

  // Listen for user updates (cross-component/tab synchronization)
  useEffect(() => {
    // Handle custom event for same-tab synchronization
    const handleUserUpdate = e => {
      if (e.detail && e.detail.user) {
        try {
          const updatedUser = e.detail.user
          setCurrentUser(updatedUser)
          // Refresh dashboard data with updated user
          fetchDashboardData(updatedUser)
        } catch (error) {
          console.warn('⚠️ Failed to process user update event:', error)
        }
      }
    }

    // Handle storage event for cross-tab synchronization
    const handleStorageChange = e => {
      if (e.key === 'user' && e.newValue) {
        try {
          const updatedUser = JSON.parse(e.newValue)
          setCurrentUser(updatedUser)
          // Refresh dashboard data with updated user
          fetchDashboardData(updatedUser)
        } catch (error) {
          console.warn(
            '⚠️ Failed to parse updated user data from storage:',
            error
          )
        }
      }
    }

    // Listen for both custom event (same-tab) and storage event (cross-tab)
    window.addEventListener('userUpdated', handleUserUpdate)
    window.addEventListener('storage', handleStorageChange)

    return () => {
      window.removeEventListener('userUpdated', handleUserUpdate)
      window.removeEventListener('storage', handleStorageChange)
    }
  }, [fetchDashboardData])

  // Listen for attendance data from extension
  useEffect(() => {
    const handleMessage = event => {
      if (event.data && event.data.type === 'ATTENDANCE_DATA') {
        const hydrated = hydrateAttendancePayload(event.data.payload)
        if (!isPayloadReady(hydrated)) {
          setMessage(
            '⚠️ Attendance data received but missing verification token or group ID.'
          )
        } else {
          setMessage('Attendance data received from extension!')
        }
        setAttendanceData(hydrated)
        setShowAttendanceReceiver(true)
      }
    }

    window.addEventListener('message', handleMessage)

    // Check localStorage for stored data
    const storedData = localStorage.getItem('neattend_attendance_data')
    if (storedData) {
      const parsed = hydrateAttendancePayload(JSON.parse(storedData))
      setAttendanceData(parsed)
      localStorage.removeItem('neattend_attendance_data')
      setShowAttendanceReceiver(true)
    }

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  // Handle saving attendance data
  const handleSaveAttendance = async () => {
    if (!attendanceData) return
    const payload = hydrateAttendancePayload(attendanceData)
    if (!isPayloadReady(payload)) {
      setMessage(
        '⚠️ Cannot save attendance until verification token and group ID are attached.'
      )
      return
    }

    setLoading(true)
    try {
      const response = await apiPost('attendance', payload)
      const result = await response.json()

      if (result.success) {
        setMessage('Attendance data saved successfully!')
        setAttendanceData(null)
        setShowAttendanceReceiver(false)
        // Refresh dashboard data
        fetchDashboardData()
      } else {
        setMessage(
          'Error saving attendance data: ' +
            (result.error || result.message || 'Unknown error')
        )
      }
    } catch (error) {
      console.error('Error saving attendance data:', error)
      setMessage('Error saving attendance data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

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
        minWidth: '100vw',
        minHeight: '100vh',
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
          overflowY: 'auto'
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
            DASHBOARD
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

        {dashboardError && (
          <StatusBanner
            variant='error'
            title='Dashboard Error'
            message={dashboardError}
            onClose={() => setDashboardError('')}
          />
        )}

        <div style={{ display: 'flex', gap: 40, marginBottom: 40 }}>
          {summaryData.map(item => (
            <div
              key={item.label}
              style={{
                flex: 1,
                background: item.color,
                borderRadius: 18,
                padding: '40px 0',
                textAlign: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                minWidth: 180
              }}
            >
              <div style={{ fontSize: 64, fontWeight: 700 }}>{item.value}</div>
              <div style={{ fontSize: 22, fontWeight: 600, marginTop: 10 }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 40, marginBottom: 40 }}>
          <div
            style={{
              flex: 2,
              background: neutral.bgSurface,
              borderRadius: 16,
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              padding: 36,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Pie
              data={{
                labels: summaryData.map(d => d.label),
                datasets: [
                  {
                    data: summaryData.map(d => d.value),
                    backgroundColor: summaryData.map(d => d.color),
                    borderWidth: 1
                  }
                ]
              }}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    position: 'bottom',
                    labels: { font: { size: 14 }, color: brand.secondary }
                  }
                }
              }}
              style={{ maxWidth: 280, maxHeight: 280 }}
            />
          </div>
          <div
            style={{
              flex: 1,
              background: neutral.bgSurface,
              borderRadius: 16,
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              padding: 36,
              minHeight: 280
            }}
          >
            <h3
              style={{
                fontWeight: 800,
                fontSize: 26,
                margin: 0,
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
                margin: 0,
                marginBottom: 20,
                color: brand.secondary
              }}
            >
              <li>3 Tardiness = 1 Absent</li>
              <li>3 Consecutive Weeks Absent = D/F</li>
              <li>More than 17% Contact Hours Absent = D/F</li>
            </ul>
            <div
              style={{
                fontStyle: 'italic',
                color: neutral.textSecondary,
                fontSize: 16,
                marginBottom: 20
              }}
            >
              Student must have follow the rules, the participation of the
              students will reflect their performance.
            </div>

            {/* Tardiness and Absence Info */}
            <div
              style={{
                marginTop: 20,
                padding: 16,
                background: neutral.bgMuted,
                borderRadius: 8
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 12,
                  color: brand.secondary
                }}
              >
                Your Attendance Status
              </div>
              <div
                style={{
                  fontSize: 14,
                  marginBottom: 8,
                  color: neutral.textSecondary
                }}
              >
                <strong>Tardiness Instances:</strong>{' '}
                {tardinessData.tardinessCount}
                {tardinessData.tardinessCount >= 3 && (
                  <span
                    style={{
                      color: statusColors.absent.border,
                      marginLeft: 8,
                      fontWeight: 700
                    }}
                  >
                    ⚠️ Warning: {Math.floor(tardinessData.tardinessCount / 3)}{' '}
                    absence(s) from tardiness
                  </span>
                )}
              </div>
              {tardinessData.consecutiveWeeksAbsent > 0 && (
                <div
                  style={{
                    fontSize: 14,
                    marginBottom: 8,
                    color: neutral.textSecondary
                  }}
                >
                  <strong>Consecutive Weeks Absent:</strong>{' '}
                  {tardinessData.consecutiveWeeksAbsent}
                </div>
              )}
              {tardinessData.contactHoursAbsentPercentage > 0 && (
                <div
                  style={{
                    fontSize: 14,
                    marginBottom: 8,
                    color: neutral.textSecondary
                  }}
                >
                  <strong>Contact Hours Absent:</strong>{' '}
                  {tardinessData.contactHoursAbsentPercentage.toFixed(2)}%
                </div>
              )}
              {tardinessData.isDFEligible && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: statusColors.absent.border,
                    color: neutral.bgSurface,
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 14
                  }}
                >
                  ⚠️ D/F ELIGIBLE
                  {tardinessData.dfEligibilityReasons.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                      {tardinessData.dfEligibilityReasons.map((reason, idx) => (
                        <div key={idx}>• {reason}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            background: neutral.bgSurface,
            borderRadius: 16,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
            padding: 36
          }}
        >
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 17 }}
          >
            <thead>
              <tr
                style={{
                  background: neutral.bgMuted,
                  textAlign: 'left',
                  borderBottom: `2px solid ${neutral.border}`,
                  color: brand.secondary
                }}
              >
                <th style={thStyle}>SUBJECT / GROUP</th>
                <th style={thStyle}>START TIME</th>
                <th style={thStyle}>END TIME</th>
                <th style={thStyle}>DURATION</th>
                <th style={thStyle}>DATE</th>
                <th style={thStyle}>SCHOOL YEAR</th>
                <th style={thStyle}>SEMESTER</th>
                <th style={thStyle}>STATUS</th>
                <th style={thStyle}>TARDY</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRows.map((row, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: `1px solid ${neutral.border}`,
                    background:
                      idx % 2 === 0 ? neutral.bgMuted : neutral.bgSurface
                  }}
                >
                  <td style={tdStyle}>{row.subject}</td>
                  <td style={tdStyle}>{row.start}</td>
                  <td style={tdStyle}>{row.end}</td>
                  <td style={tdStyle}>{row.duration}</td>
                  <td style={tdStyle}>{row.date}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        background: statusColors.present.bg,
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        color: statusColors.present.border
                      }}
                    >
                      {row.schoolYear || 'N/A'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        background: neutral.bgMuted,
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        color: brand.accent
                      }}
                    >
                      {row.semester || 'N/A'}
                    </span>
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      color: statusColor(row.status),
                      fontWeight: 700
                    }}
                  >
                    <span>{row.status}</span>
                    {row.validated && (
                      <span
                        style={{
                          marginLeft: 8,
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 600,
                          background: statusColors.present.bg,
                          color: statusColors.present.text,
                          border: `1px solid ${statusColors.present.border}`
                        }}
                      >
                        Validated
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {row.isTardy && (
                      <span
                        style={{
                          background: statusColors.late.border,
                          color: neutral.bgSurface,
                          padding: '4px 10px',
                          borderRadius: 4,
                          fontSize: 12,
                          fontWeight: 700
                        }}
                        title='3 tardiness instances = 1 absence'
                      >
                        ⚠️ Tardy
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Attendance Receiver Modal */}
      {showAttendanceReceiver && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
        >
          <div
            style={{
              backgroundColor: neutral.bgSurface,
              borderRadius: '12px',
              padding: '30px',
              maxWidth: '800px',
              maxHeight: '80vh',
              overflowY: 'auto',
              width: '90%',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}
            >
              <h2 style={{ margin: 0, color: brand.secondary }}>
                📊 Attendance Data Received
              </h2>
              <button
                onClick={() => setShowAttendanceReceiver(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: neutral.textMuted
                }}
              >
                ×
              </button>
            </div>

            {message && (
              <Alert
                type={
                  message.toLowerCase().includes('error')
                    ? 'error'
                    : message.includes('⚠️')
                    ? 'warning'
                    : 'success'
                }
                style={{ marginBottom: 20 }}
              >
                {message}
              </Alert>
            )}

            {attendanceData && (
              <>
                <div
                  style={{
                    marginBottom: '20px',
                    padding: '15px',
                    background: neutral.bgMuted,
                    borderRadius: '8px'
                  }}
                >
                  <h3 style={{ margin: '0 0 10px 0', color: brand.secondary }}>
                    Meeting Details
                  </h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '10px'
                    }}
                  >
                    <p style={{ margin: '5px 0' }}>
                      <strong>Meet Code:</strong> {attendanceData.meetCode}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      <strong>Date:</strong> {attendanceData.date}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      <strong>Start Time:</strong> {attendanceData.startTime}
                    </p>
                    <p style={{ margin: '5px 0' }}>
                      <strong>End Time:</strong> {attendanceData.stopTime}
                    </p>
                  </div>
                  {!credentialsReady && (
                    <Alert type='error' style={{ marginTop: 12 }}>
                      Missing verification token or group ID. Issue credentials
                      from Instructor &rarr; Subject before saving.
                    </Alert>
                  )}
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 15px 0', color: brand.secondary }}>
                    Participants ({participantsCount})
                  </h3>
                  <div
                    style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      border: `1px solid ${neutral.border}`,
                      borderRadius: '6px'
                    }}
                  >
                    <table
                      style={{ width: '100%', borderCollapse: 'collapse' }}
                    >
                      <thead>
                        <tr style={{ backgroundColor: neutral.bgMuted }}>
                          <th
                            style={{
                              padding: '12px',
                              textAlign: 'left',
                              borderBottom: `2px solid ${neutral.border}`,
                              fontWeight: 'bold'
                            }}
                          >
                            Name
                          </th>
                          <th
                            style={{
                              padding: '12px',
                              textAlign: 'left',
                              borderBottom: `2px solid ${neutral.border}`,
                              fontWeight: 'bold'
                            }}
                          >
                            Join Time
                          </th>
                          <th
                            style={{
                              padding: '12px',
                              textAlign: 'left',
                              borderBottom: `2px solid ${neutral.border}`,
                              fontWeight: 'bold'
                            }}
                          >
                            Duration (min)
                          </th>
                          <th
                            style={{
                              padding: '12px',
                              textAlign: 'left',
                              borderBottom: '2px solid #ddd',
                              fontWeight: 'bold'
                            }}
                          >
                            Leave Time
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceData.participants.map(
                          (participant, index) => (
                            <tr
                              key={index}
                              style={{
                                borderBottom: `1px solid ${neutral.borderLight}`
                              }}
                            >
                              <td style={{ padding: '12px' }}>
                                {participant.name}
                              </td>
                              <td style={{ padding: '12px' }}>
                                {participant.joinTime}
                              </td>
                              <td style={{ padding: '12px' }}>
                                {participant.attendedDuration}
                              </td>
                              <td style={{ padding: '12px' }}>
                                {participant.leaveTime || 'N/A'}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: '15px',
                    justifyContent: 'center'
                  }}
                >
                  <button
                    onClick={handleSaveAttendance}
                    disabled={receiverSaveDisabled}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: receiverSaveDisabled
                        ? neutral.textSecondary
                        : brand.accent,
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: receiverSaveDisabled ? 'not-allowed' : 'pointer',
                      fontSize: '16px',
                      fontWeight: 'bold'
                    }}
                  >
                    {loading ? 'Saving...' : '💾 Save Attendance Data'}
                  </button>
                  <button
                    onClick={() => setShowAttendanceReceiver(false)}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: neutral.textSecondary,
                      color: neutral.bgSurface,
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      fontWeight: 'bold'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const SidebarItem = ({ icon, label, isActive, isLast, onClick }) => {
  const [hover, setHover] = React.useState(false)
  return (
    <div
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
          letterSpacing: 1
        }}
      >
        {label}
      </span>
    </div>
  )
}

const thStyle = {
  padding: '16px 20px',
  fontWeight: 800,
  fontSize: 18,
  letterSpacing: 0.5,
  background: '#EFEFFB',
  color: brand.secondary,
  borderBottom: `2px solid ${neutral.border}`
}

const tdStyle = {
  padding: '16px 20px',
  fontWeight: 600,
  color: neutral.textPrimary,
  fontSize: 17,
  verticalAlign: 'middle'
}

function statusColor (status) {
  if (status === 'Present') return statusColors.present.text
  if (status === 'Absent') return statusColors.absent.text
  if (status === 'Late') return statusColors.late.text
  return neutral.textMuted
}

export default Dashboard
