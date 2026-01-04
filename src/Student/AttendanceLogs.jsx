import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import logo from '../assets/logo.png'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 4: CSS classes for theme-aware styling
import '../styles/common.css'
import { logout, getCurrentUser } from '../utils/auth'
import { apiGet, apiPost } from '../utils/api'
import { brand, neutral, status as statusColors } from '../utils/colors'
import StatusBanner from '../components/StatusBanner'
import NotificationBell from '../components/NotificationBell'
import UserMenu from '../components/layout/UserMenu'

ChartJS.register(ArcElement, Tooltip, Legend)

const navItems = [
  {
    icon: 'bi-speedometer2',
    label: 'DASHBOARD',
    path: '/dashboard',
    color: brand.primary
  },
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

// Mock data removed - now using API

const AttendanceLogs = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [attendanceData, setAttendanceData] = useState([])

  // Filter states
  const [filterSubject, setFilterSubject] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterDate, setFilterDate] = useState('all')
  const [filterSchoolYear, setFilterSchoolYear] = useState('all')
  const [filterSemester, setFilterSemester] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(true)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [appealReason, setAppealReason] = useState('')
  const [appealNotes, setAppealNotes] = useState('')
  const [appealAttachments, setAppealAttachments] = useState([])
  const [submittingAppeal, setSubmittingAppeal] = useState(false)
  const [appealError, setAppealError] = useState('')
  const [appealSuccess, setAppealSuccess] = useState('')
  const [appeals, setAppeals] = useState([])
  const [loadingAppeals, setLoadingAppeals] = useState(false)
  const [appealsError, setAppealsError] = useState('')
  const [statusFilterState, setStatusFilterState] = useState('all')
  const [showAppealDrawer, setShowAppealDrawer] = useState(false)

  // Sorting state
  const [sortColumn, setSortColumn] = useState('date')
  const [sortDirection, setSortDirection] = useState('desc')
  const [apiError, setApiError] = useState('')

  useEffect(() => {
    fetchAttendanceData()
    fetchAppeals()
  }, [])

  const fetchAppeals = async () => {
    setLoadingAppeals(true)
    setAppealsError('')
    try {
      const response = await apiGet('appeals')
      if (!response.ok) {
        setAppealsError(`Failed to load appeals (status ${response.status}).`)
        return
      }
      const result = await response.json()
      if (!result.success) {
        setAppealsError(result.error || 'Unable to load appeals.')
        return
      }
      setAppeals(result.data || [])
    } catch (error) {
      console.error('Error fetching appeals:', error)
      setAppealsError(
        error?.message
          ? `Failed to load appeals: ${error.message}`
          : 'Failed to load appeals.'
      )
    } finally {
      setLoadingAppeals(false)
    }
  }

  const fetchAttendanceData = async () => {
    setLoading(true)
    setApiError('')
    try {
      // Get current user ID using centralized auth utility
      const user = getCurrentUser()
      const userId = user?._id || user?.id

      // Fetch recent attendance records
      const response = await apiGet('attendance/recent?limit=200')

      if (!response.ok) {
        setApiError(`Failed to fetch attendance (status ${response.status}).`)
        return
      }

      const result = await response.json()

      if (!result.success) {
        setApiError(
          result.error || result.message || 'Failed to fetch attendance.'
        )
        return
      }

      let records = result.data || []

      // Filter by current user if student
      if (userId) {
        records = records.filter(
          r => r.userId === userId || r.userId?._id === userId
        )
      }

      // Transform API response to match component structure (aligned with dashboard)
      const transformedRecords = records.map((record, index) => {
        const sessionDate = record.sessionDate
          ? new Date(record.sessionDate)
          : record.createdAt
          ? new Date(record.createdAt)
          : null

        // Prefer ISO timestamps for proper time formatting
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

        const subjectName =
          record.subjectName || record.groupName || 'Unknown Subject'
        const groupName =
          record.groupName || record.subjectName || 'Unknown Group'

        const dateSource = sessionDate || joinDateTime || leaveDateTime
        const isoDate = (dateSource || new Date()).toISOString()

        const schoolYear = record.user?.schoolYear || null
        const semester = record.user?.semester || null

        return {
          id: record.attendanceId || record._id || index + 1,
          subject: subjectName,
          group: groupName,
          code: record.meetCode || 'N/A',
          start: startTime,
          end: endTime,
          duration: durationSeconds,
          date: isoDate,
          status: record.status || 'Present',
          schoolYear: schoolYear,
          semester: semester,
          isTardy: record.isTardy || false,
          tardinessCount: record.tardinessCount || 0
        }
      })

      setAttendanceData(transformedRecords)
    } catch (error) {
      console.error('Error fetching attendance data:', error)
      setAttendanceData([])
      setApiError(
        error?.message
          ? `Failed to fetch attendance: ${error.message}`
          : 'Failed to fetch attendance. Please try again.'
      )
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

  const handleClearFilters = () => {
    setFilterSubject('all')
    setFilterStatus('all')
    setFilterDate('all')
    setFilterSchoolYear('all')
    setFilterSemester('all')
    setSearchQuery('')
  }

  const handleSort = column => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const handleExportCSV = () => {
    if (filteredAndSortedData.length === 0) {
      alert('No data to export')
      return
    }

    const headers = [
      'Subject / Group',
      'Start Time',
      'End Time',
      'Duration',
      'Date',
      'Status'
    ]

    const csvData = filteredAndSortedData.map(row => [
      row.subject || row.group,
      row.start,
      row.end,
      formatDuration(row.duration),
      new Date(row.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      row.status
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
      `my_attendance_${new Date().toISOString().split('T')[0]}.csv`
    )
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const openAppealDrawer = record => {
    setSelectedRecord(record)
    setAppealReason('')
    setAppealNotes('')
    setAppealAttachments([])
    setAppealError('')
    setAppealSuccess('')
    setShowAppealDrawer(true)
  }

  const closeAppealDrawer = () => {
    setShowAppealDrawer(false)
    setSelectedRecord(null)
  }

  const handleAttachmentChange = event => {
    const files = Array.from(event.target.files || [])
    const sanitized = files.slice(0, 3).map(file => ({
      name: file.name,
      mimeType: file.type,
      url: '',
      raw: file
    }))
    setAppealAttachments(sanitized)
  }

  const uploadAttachmentsIfNeeded = useCallback(async () => {
    const readAsDataUrl = file =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Failed to read attachment'))
        reader.readAsDataURL(file)
      })

    const results = []
    for (const item of appealAttachments) {
      if (item?.url) {
        results.push({
          name: item.name,
          mimeType: item.mimeType,
          url: item.url
        })
        continue
      }

      const rawFile = item?.raw
      if (!rawFile) continue

      const dataUrl = await readAsDataUrl(rawFile)
      results.push({
        name: item.name,
        mimeType: item.mimeType,
        url: dataUrl
      })
    }

    return results
  }, [appealAttachments])

  const submitAppeal = async () => {
    if (!selectedRecord) return
    if (!appealReason.trim()) {
      setAppealError('Please provide a reason for your appeal.')
      return
    }
    setSubmittingAppeal(true)
    setAppealError('')
    setAppealSuccess('')
    try {
      const attachments = await uploadAttachmentsIfNeeded()
      const response = await apiPost('appeals', {
        attendanceId: selectedRecord.attendanceId || selectedRecord.id,
        reason: appealReason,
        notes: appealNotes,
        attachments
      })

      if (!response.ok) {
        const result = await response.json().catch(() => null)
        setAppealError(
          result?.error ||
            `Failed to submit appeal (status ${response.status}).`
        )
        return
      }

      const result = await response.json()
      if (!result.success) {
        setAppealError(result.error || 'Unable to submit appeal.')
        return
      }

      setAppealSuccess('Appeal submitted successfully!')
      fetchAppeals()
      closeAppealDrawer()
    } catch (error) {
      console.error('Error submitting appeal:', error)
      setAppealError(
        error?.message
          ? `Failed to submit appeal: ${error.message}`
          : 'Failed to submit appeal.'
      )
    } finally {
      setSubmittingAppeal(false)
    }
  }

  const appealsByAttendanceId = useMemo(() => {
    return appeals.reduce((acc, appeal) => {
      const key =
        appeal.attendanceId?._id || appeal.attendanceId || appeal.sessionId
      if (!key) return acc
      acc[key.toString()] = appeal
      return acc
    }, {})
  }, [appeals])

  const filteredAppeals = useMemo(() => {
    return (appeals || []).filter(appeal => {
      const matchesStatus =
        statusFilterState === 'all' || appeal.status === statusFilterState
      return matchesStatus
    })
  }, [appeals, statusFilterState])

  const appealStatusColor = status => {
    switch (status) {
      case 'approved':
        return statusColors.present.bg
      case 'denied':
        return statusColors.absent.bg
      case 'under_review':
        return statusColors.late.bg
      default:
        return neutral.bgSubtle
    }
  }

  // Get unique subjects
  const uniqueSubjects = useMemo(() => {
    return [...new Set(attendanceData.map(record => record.group))]
  }, [attendanceData])

  // Get unique school years
  const uniqueSchoolYears = useMemo(() => {
    return [
      ...new Set(
        attendanceData.map(record => record.schoolYear).filter(Boolean)
      )
    ].sort()
  }, [attendanceData])

  // Get unique semesters (available for future filtering)
  const _uniqueSemesters = useMemo(() => {
    return [
      ...new Set(attendanceData.map(record => record.semester).filter(Boolean))
    ].sort()
  }, [attendanceData])

  // Get unique dates when meetings occurred (sorted newest first)
  const availableDates = useMemo(() => {
    const datesSet = new Set()
    attendanceData.forEach(record => {
      const date = new Date(record.date)
      const dateStr = date.toLocaleDateString('en-CA') // Format: YYYY-MM-DD
      datesSet.add(dateStr)
    })

    // Convert to array and sort (newest first)
    return Array.from(datesSet).sort((a, b) => new Date(b) - new Date(a))
  }, [attendanceData])

  // Filter data by specific date
  const filterByDate = record => {
    if (filterDate === 'all') return true

    const recordDate = new Date(record.date)
    const selectedDate = new Date(filterDate)

    // Compare dates (ignore time)
    return (
      recordDate.getFullYear() === selectedDate.getFullYear() &&
      recordDate.getMonth() === selectedDate.getMonth() &&
      recordDate.getDate() === selectedDate.getDate()
    )
  }

  // Filtered and sorted data
  const filteredAndSortedData = useMemo(() => {
    let filtered = attendanceData.filter(record => {
      const matchesSubject =
        filterSubject === 'all' || record.group === filterSubject
      const matchesStatus =
        filterStatus === 'all' ||
        record.status.toLowerCase() === filterStatus.toLowerCase()
      const matchesSearch =
        searchQuery === '' ||
        record.group.toLowerCase().includes(searchQuery.toLowerCase()) ||
        record.code.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesDate = filterByDate(record)
      const matchesSchoolYear =
        filterSchoolYear === 'all' || record.schoolYear === filterSchoolYear
      const matchesSemester =
        filterSemester === 'all' || record.semester === filterSemester
      // Note: Tardy filter can be added to filterStatus if needed

      return (
        matchesSubject &&
        matchesStatus &&
        matchesSearch &&
        matchesDate &&
        matchesSchoolYear &&
        matchesSemester
      )
    })

    // Sort data
    filtered.sort((a, b) => {
      let aVal, bVal

      switch (sortColumn) {
        case 'date':
          aVal = new Date(a.date)
          bVal = new Date(b.date)
          break
        case 'group':
          aVal = a.group
          bVal = b.group
          break
        case 'status':
          aVal = a.status
          bVal = b.status
          break
        case 'duration':
          aVal = a.duration
          bVal = b.duration
          break
        case 'schoolYear':
          aVal = a.schoolYear || ''
          bVal = b.schoolYear || ''
          break
        case 'semester':
          aVal = a.semester || ''
          bVal = b.semester || ''
          break
        case 'isTardy':
          aVal = a.isTardy ? 1 : 0
          bVal = b.isTardy ? 1 : 0
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return filtered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    attendanceData,
    filterSubject,
    filterStatus,
    filterDate, // filterByDate is a function that only depends on filterDate, which is included
    filterSchoolYear,
    filterSemester,
    searchQuery,
    sortColumn,
    sortDirection
  ])

  // Calculate statistics
  const stats = useMemo(() => {
    const verifiedRecords = attendanceData.filter(
      record => record.isVerifiedParticipant !== false
    )
    const total = verifiedRecords.length
    const present = verifiedRecords.filter(r => r.status === 'Present').length
    const late = verifiedRecords.filter(r => r.status === 'Late').length
    const absent = verifiedRecords.filter(r => r.status === 'Absent').length
    const tardy = verifiedRecords.filter(r => r.isTardy === true).length
    const tardinessCount =
      total > 0
        ? Math.max(...verifiedRecords.map(r => r.tardinessCount || 0), 0)
        : 0
    const attendanceRate =
      total > 0 ? Math.round(((present + late) / total) * 100) : 0

    // Calculate streak
    const sortedByDate = [...verifiedRecords].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    )
    let streak = 0
    for (let record of sortedByDate) {
      if (record.status === 'Present') {
        streak++
      } else {
        break
      }
    }

    return {
      total,
      present,
      late,
      absent,
      tardy,
      tardinessCount,
      attendanceRate,
      streak
    }
  }, [attendanceData])

  // Pie chart data
  const pieChartData = {
    labels: ['Present', 'Late', 'Absent'],
    datasets: [
      {
        data: [stats.present, stats.late, stats.absent],
        backgroundColor: [
          statusColors.present.border,
          statusColors.late.border,
          statusColors.absent.border
        ],
        borderColor: neutral.bgSurface,
        borderWidth: 3
      }
    ]
  }

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 15,
          font: { size: 13, weight: '600' },
          color: brand.secondary
        }
      },
      tooltip: {
        callbacks: {
          label: context => {
            const label = context.label || ''
            const value = context.parsed || 0
            const total = stats.total
            const percentage = total > 0 ? Math.round((value / total) * 100) : 0
            return `${label}: ${value} (${percentage}%)`
          }
        }
      }
    }
  }

  const getStatusColor = status => {
    switch (status.toLowerCase()) {
      case 'present':
        return statusColors.present.border
      case 'absent':
        return statusColors.absent.border
      case 'late':
        return statusColors.late.border
      default:
        return neutral.textMuted
    }
  }

  const getStatusBadge = status => {
    return (
      <span
        style={{
          padding: '6px 14px',
          borderRadius: 12,
          background: getStatusColor(status),
          color: neutral.bgSurface,
          fontWeight: 700,
          fontSize: 13,
          display: 'inline-block',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}
      >
        {status}
      </span>
    )
  }

  const getSortIcon = column => {
    if (sortColumn !== column) {
      return (
        <i
          className='bi bi-arrow-down-up'
          style={{ marginLeft: 6, fontSize: 12, opacity: 0.3 }}
        ></i>
      )
    }
    return sortDirection === 'asc' ? (
      <i className='bi bi-arrow-up' style={{ marginLeft: 6, fontSize: 12 }}></i>
    ) : (
      <i
        className='bi bi-arrow-down'
        style={{ marginLeft: 6, fontSize: 12 }}
      ></i>
    )
  }

  const getAttendanceRateColor = rate => {
    if (rate >= 90) return statusColors.present.border
    if (rate >= 75) return statusColors.late.border
    return statusColors.absent.border
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
      {/* Sidebar */}
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

      {/* Main Content */}
      <main
        style={{
          flex: 1,
          padding: '48px 60px',
          height: '100vh',
          overflowY: 'auto'
        }}
      >
        {apiError && (
          <StatusBanner
            variant='error'
            title='Attendance load issue'
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
            MY ATTENDANCE LOGS
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
              user={getCurrentUser()}
              onProfileClick={() => navigate('/profile')}
              onSettingsClick={() => alert('Settings')}
            />
          </div>
        </div>

        {/* Personal Statistics Dashboard */}
        <div
          style={{
            background: neutral.bgSurface,
            borderRadius: 16,
            boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            padding: 32,
            marginBottom: 32
          }}
        >
          <h3
            style={{
              margin: '0 0 24px 0',
              fontWeight: 800,
              fontSize: 24,
              color: brand.secondary,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              borderBottom: `2px solid ${neutral.bgPage}`,
              paddingBottom: 16
            }}
          >
            <i className='bi bi-graph-up-arrow'></i> MY ATTENDANCE OVERVIEW
          </h3>

          <div style={{ display: 'flex', gap: 32, alignItems: 'stretch' }}>
            {/* Statistics Cards */}
            <div
              style={{
                flex: 2,
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 20
              }}
            >
              {/* Total Classes */}
              <div
                className='on-brand'
                style={{
                  background: `linear-gradient(135deg, ${brand.accent} 0%, ${brand.secondary} 100%)`,
                  borderRadius: 12,
                  padding: 24,
                  color: '#ffffff', // Fixed: Always white on brand background
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    opacity: 0.9,
                    marginBottom: 8,
                    fontWeight: 600
                  }}
                >
                  <i
                    className='bi bi-calendar-check'
                    style={{ marginRight: 6 }}
                  ></i>
                  Total Classes
                </div>
                <div style={{ fontSize: 40, fontWeight: 800 }}>
                  {stats.total}
                </div>
              </div>

              {/* Attendance Rate */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${getAttendanceRateColor(
                    stats.attendanceRate
                  )}dd 0%, ${getAttendanceRateColor(
                    stats.attendanceRate
                  )} 100%)`,
                  borderRadius: 12,
                  padding: 24,
                  color: neutral.bgSurface,
                  boxShadow: `0 4px 12px ${getAttendanceRateColor(
                    stats.attendanceRate
                  )}50`
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    opacity: 0.9,
                    marginBottom: 8,
                    fontWeight: 600
                  }}
                >
                  <i className='bi bi-percent' style={{ marginRight: 6 }}></i>
                  Attendance Rate
                </div>
                <div style={{ fontSize: 40, fontWeight: 800 }}>
                  {stats.attendanceRate}%
                </div>
                {stats.attendanceRate < 75 && (
                  <div
                    style={{
                      fontSize: 11,
                      marginTop: 8,
                      background: 'rgba(255,255,255,0.2)',
                      padding: '4px 8px',
                      borderRadius: 6,
                      display: 'inline-block'
                    }}
                  >
                    <i className='bi bi-exclamation-triangle'></i> At Risk
                  </div>
                )}
              </div>

              {/* Present Count */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${statusColors.present.border}dd 0%, ${statusColors.present.border} 100%)`,
                  borderRadius: 12,
                  padding: 20,
                  color: neutral.bgSurface,
                  boxShadow: '0 4px 12px rgba(46, 204, 64, 0.3)'
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.9,
                    marginBottom: 6,
                    fontWeight: 600
                  }}
                >
                  <i
                    className='bi bi-check-circle-fill'
                    style={{ marginRight: 6 }}
                  ></i>
                  Present
                </div>
                <div style={{ fontSize: 32, fontWeight: 800 }}>
                  {stats.present}
                </div>
              </div>

              {/* Late Count */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${statusColors.late.border}dd 0%, ${statusColors.late.border} 100%)`,
                  borderRadius: 12,
                  padding: 20,
                  color: neutral.bgSurface,
                  boxShadow: '0 4px 12px rgba(255, 183, 0, 0.3)'
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.9,
                    marginBottom: 6,
                    fontWeight: 600
                  }}
                >
                  <i
                    className='bi bi-clock-fill'
                    style={{ marginRight: 6 }}
                  ></i>
                  Late
                </div>
                <div style={{ fontSize: 32, fontWeight: 800 }}>
                  {stats.late}
                </div>
              </div>

              {/* Absent Count */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${statusColors.absent.border}dd 0%, ${statusColors.absent.border} 100%)`,
                  borderRadius: 12,
                  padding: 20,
                  color: neutral.bgSurface,
                  boxShadow: '0 4px 12px rgba(255, 65, 54, 0.3)'
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.9,
                    marginBottom: 6,
                    fontWeight: 600
                  }}
                >
                  <i
                    className='bi bi-x-circle-fill'
                    style={{ marginRight: 6 }}
                  ></i>
                  Absent
                </div>
                <div style={{ fontSize: 32, fontWeight: 800 }}>
                  {stats.absent}
                </div>
              </div>

              {/* Tardiness Count */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${statusColors.late.icon}dd 0%, ${statusColors.late.icon} 100%)`,
                  borderRadius: 12,
                  padding: 20,
                  color: neutral.bgSurface,
                  boxShadow: '0 4px 12px rgba(255, 149, 0, 0.3)'
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.9,
                    marginBottom: 6,
                    fontWeight: 600
                  }}
                >
                  <i
                    className='bi bi-hourglass-split'
                    style={{ marginRight: 6 }}
                  ></i>
                  Tardiness
                </div>
                <div style={{ fontSize: 32, fontWeight: 800 }}>
                  {stats.tardy}
                </div>
                {stats.tardinessCount > 0 && (
                  <div style={{ fontSize: 11, marginTop: 4, opacity: 0.9 }}>
                    Total: {stats.tardinessCount} (
                    {Math.floor(stats.tardinessCount / 3)} absence
                    {Math.floor(stats.tardinessCount / 3) !== 1 ? 's' : ''})
                  </div>
                )}
              </div>

              {/* Current Streak */}
              <div
                style={{
                  background: `linear-gradient(135deg, ${statusColors.late.border} 0%, ${statusColors.absent.border} 100%)`,
                  borderRadius: 12,
                  padding: 20,
                  color: neutral.bgSurface,
                  boxShadow: '0 4px 12px rgba(245, 87, 108, 0.3)'
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    opacity: 0.9,
                    marginBottom: 6,
                    fontWeight: 600
                  }}
                >
                  <i className='bi bi-fire' style={{ marginRight: 6 }}></i>
                  Current Streak
                </div>
                <div style={{ fontSize: 32, fontWeight: 800 }}>
                  {stats.streak} days
                </div>
              </div>
            </div>

            {/* Pie Chart */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: neutral.bgMuted,
                borderRadius: 12,
                padding: 20
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: brand.primary,
                  marginBottom: 16
                }}
              >
                Status Breakdown
              </div>
              <div style={{ width: 220, height: 220 }}>
                <Pie data={pieChartData} options={pieChartOptions} />
              </div>
            </div>
          </div>
        </div>

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
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 16,
                  marginBottom: 16
                }}
              >
                {/* Subject Filter */}
                <div>
                  <label htmlFor='filter-subject' style={labelStyle}>
                    Subject / Group
                  </label>
                  <select
                    id='filter-subject'
                    name='filterSubject'
                    value={filterSubject}
                    onChange={e => setFilterSubject(e.target.value)}
                    style={filterInputStyle}
                  >
                    <option value='all'>All Subjects</option>
                    {uniqueSubjects.map(subject => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
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
                    <option value='all'>All Status</option>
                    <option value='Present'>Present</option>
                    <option value='Late'>Late</option>
                    <option value='Absent'>Absent</option>
                  </select>
                </div>

                {/* Specific Date Filter */}
                <div>
                  <label htmlFor='filter-date' style={labelStyle}>
                    Specific Date
                  </label>
                  <select
                    id='filter-date'
                    name='filterDate'
                    value={filterDate}
                    onChange={e => setFilterDate(e.target.value)}
                    style={filterInputStyle}
                  >
                    <option value='all'>All Dates</option>
                    {availableDates.map(dateStr => {
                      const dateObj = new Date(dateStr)
                      const displayDate = dateObj.toLocaleDateString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })
                      return (
                        <option key={dateStr} value={dateStr}>
                          {displayDate}
                        </option>
                      )
                    })}
                  </select>
                </div>

                {/* Search Bar */}
                <div>
                  <label htmlFor='search-query' style={labelStyle}>
                    Search
                  </label>
                  <input
                    id='search-query'
                    name='searchQuery'
                    type='text'
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder='Search group or code...'
                    style={filterInputStyle}
                  />
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
                    <option value='all'>All School Years</option>
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
                    <option value='all'>All Semesters</option>
                    <option value='1st Semester'>1st Semester</option>
                    <option value='2nd Semester'>2nd Semester</option>
                    <option value='Summer'>Summer</option>
                  </select>
                </div>
              </div>

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
                <i className='bi bi-x-circle'></i> Clear All Filters
              </button>
            </>
          )}
        </div>

        {/* Summary Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
            background: neutral.bgSurface,
            padding: '16px 24px',
            borderRadius: 12,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap'
            }}
          >
            <div
              style={{ fontSize: 17, fontWeight: 700, color: brand.primary }}
            >
              Showing:{' '}
              <span style={{ color: brand.primary }}>
                {filteredAndSortedData.length}
              </span>{' '}
              of {stats.total} records
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <span
                style={{
                  fontSize: 15,
                  color: statusColors.present.border,
                  fontWeight: 600
                }}
              >
                <i className='bi bi-check-circle-fill'></i>{' '}
                {
                  filteredAndSortedData.filter(r => r.status === 'Present')
                    .length
                }
              </span>
              <span
                style={{
                  fontSize: 15,
                  color: statusColors.late.border,
                  fontWeight: 600
                }}
              >
                <i className='bi bi-clock-fill'></i>{' '}
                {filteredAndSortedData.filter(r => r.status === 'Late').length}
              </span>
              <span
                style={{
                  fontSize: 15,
                  color: statusColors.absent.border,
                  fontWeight: 600
                }}
              >
                <i className='bi bi-x-circle-fill'></i>{' '}
                {
                  filteredAndSortedData.filter(r => r.status === 'Absent')
                    .length
                }
              </span>
            </div>
          </div>

          <button
            onClick={handleExportCSV}
            style={{
              padding: '12px 24px',
              background: brand.primary,
              color: '#ffffff', // Fixed: Always white on brand background
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 15,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(32, 27, 81, 0.3)'
            }}
          >
            <i className='bi bi-download'></i> Export CSV
          </button>
        </div>

        {/* Appeals Summary */}
        <div
          style={{
            background: neutral.bgSurface,
            borderRadius: 16,
            boxShadow: '0 4px 16px rgba(0,0,0,0.05)',
            padding: 28,
            marginBottom: 24
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
              gap: 16,
              flexWrap: 'wrap'
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 800,
                  color: brand.secondary
                }}
              >
                Attendance Appeals
              </h3>
              <p style={{ margin: 0, color: neutral.textSecondary }}>
                Track your submitted review requests and their status in real
                time.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label
                htmlFor='appeal-status-filter'
                style={{ fontSize: 14, fontWeight: 600, color: brand.primary }}
              >
                Status
              </label>
              <select
                id='appeal-status-filter'
                value={statusFilterState}
                onChange={e => setStatusFilterState(e.target.value)}
                style={{
                  ...filterInputStyle,
                  width: 180,
                  borderColor: neutral.border
                }}
              >
                <option value='all'>All</option>
                <option value='pending'>Pending</option>
                <option value='under_review'>Under Review</option>
                <option value='approved'>Approved</option>
                <option value='denied'>Denied</option>
              </select>
            </div>
          </div>

          {appealsError && (
            <StatusBanner
              variant='error'
              title='Appeals load issue'
              message={appealsError}
              onClose={() => setAppealsError('')}
            />
          )}

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div
              style={{
                flex: '1 1 220px',
                background: neutral.bgMuted,
                borderRadius: 12,
                padding: 20,
                border: `1px solid ${neutral.border}`
              }}
            >
              <div style={{ fontSize: 14, color: neutral.textSecondary }}>
                Total Appeals
              </div>
              <div
                style={{ fontSize: 32, fontWeight: 800, color: brand.primary }}
              >
                {appeals.length}
              </div>
            </div>
            <div
              style={{
                flex: '1 1 220px',
                background: neutral.bgMuted,
                borderRadius: 12,
                padding: 20,
                border: `1px solid ${neutral.border}`
              }}
            >
              <div style={{ fontSize: 14, color: neutral.textSecondary }}>
                Pending / Review
              </div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: statusColors.late.border
                }}
              >
                {
                  appeals.filter(
                    appeal =>
                      appeal.status === 'pending' ||
                      appeal.status === 'under_review'
                  ).length
                }
              </div>
            </div>
            <div
              style={{
                flex: '1 1 220px',
                background: neutral.bgMuted,
                borderRadius: 12,
                padding: 20,
                border: `1px solid ${neutral.border}`
              }}
            >
              <div style={{ fontSize: 14, color: neutral.textSecondary }}>
                Approved
              </div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: statusColors.present.border
                }}
              >
                {appeals.filter(appeal => appeal.status === 'approved').length}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 24, maxHeight: 260, overflowY: 'auto' }}>
            {loadingAppeals ? (
              <p style={{ color: neutral.textMuted }}>Loading appeals…</p>
            ) : filteredAppeals.length === 0 ? (
              <p style={{ color: neutral.textMuted }}>
                No appeals match the selected filter.
              </p>
            ) : (
              filteredAppeals.map(appeal => (
                <div
                  key={appeal._id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '12px 0',
                    borderBottom: `1px solid ${neutral.borderLight}`
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {appeal.subjectId?.subjectName || 'Subject'}
                    </div>
                    <div style={{ fontSize: 13, color: neutral.textSecondary }}>
                      Submitted{' '}
                      {new Date(appeal.createdAt).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      {appeal.reason}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '6px 14px',
                      borderRadius: 999,
                      fontWeight: 700,
                      background: appealStatusColor(appeal.status),
                      color: brand.secondary
                    }}
                  >
                    {appeal.status.replace('_', ' ')}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Attendance Table */}
        <div
          style={{
            background: neutral.bgSurface,
            borderRadius: 16,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
            padding: 36
          }}
        >
          {loading ? (
            <div
              style={{
                textAlign: 'center',
                padding: 60,
                color: neutral.textMuted
              }}
            >
              <div
                style={{
                  width: 50,
                  height: 50,
                  border: `5px solid ${neutral.bgMuted}`,
                  borderTop: `5px solid ${brand.primary}`,
                  borderRadius: '50%',
                  margin: '0 auto 20px',
                  animation: 'spin 1s linear infinite'
                }}
              ></div>
              <p style={{ fontSize: 16, fontWeight: 600 }}>
                Loading your attendance records...
              </p>
            </div>
          ) : filteredAndSortedData.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 60,
                color: neutral.textMuted
              }}
            >
              <i
                className='bi bi-inbox'
                style={{
                  fontSize: 64,
                  color: neutral.border,
                  marginBottom: 16,
                  display: 'block'
                }}
              ></i>
              <p
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: brand.primary,
                  marginBottom: 8
                }}
              >
                No attendance records found
              </p>
              <p style={{ fontSize: 15, color: neutral.textSecondary }}>
                {attendanceData.length === 0
                  ? "You don't have any attendance records yet"
                  : 'Try adjusting your filters to see results'}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 15
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: neutral.bgHover,
                      textAlign: 'left',
                      borderBottom: `2px solid ${neutral.border}`
                    }}
                  >
                    <th style={thStyle} onClick={() => handleSort('group')}>
                      SUBJECT / GROUP {getSortIcon('group')}
                    </th>
                    <th style={thStyle}>START TIME</th>
                    <th style={thStyle}>END TIME</th>
                    <th style={thStyle} onClick={() => handleSort('duration')}>
                      DURATION {getSortIcon('duration')}
                    </th>
                    <th style={thStyle} onClick={() => handleSort('date')}>
                      DATE {getSortIcon('date')}
                    </th>
                    <th
                      style={thStyle}
                      onClick={() => handleSort('schoolYear')}
                    >
                      SCHOOL YEAR {getSortIcon('schoolYear')}
                    </th>
                    <th style={thStyle} onClick={() => handleSort('semester')}>
                      SEMESTER {getSortIcon('semester')}
                    </th>
                    <th style={thStyle} onClick={() => handleSort('status')}>
                      STATUS {getSortIcon('status')}
                    </th>
                    <th
                      style={thStyle}
                      onClick={() => handleSort('isTardy')}
                      title='3 tardiness instances = 1 absence'
                    >
                      TARDY {getSortIcon('isTardy')}
                    </th>
                    <th style={{ ...thStyle, cursor: 'default' }}>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedData.map((row, idx) => (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: `1px solid ${neutral.border}`,
                        background:
                          idx % 2 === 0 ? neutral.bgMuted : neutral.bgSurface,
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e =>
                        (e.currentTarget.style.background = neutral.bgHover)
                      }
                      onMouseLeave={e =>
                        (e.currentTarget.style.background =
                          idx % 2 === 0 ? neutral.bgMuted : neutral.bgSurface)
                      }
                    >
                      <td style={tdStyle}>
                        <span
                          style={{
                            background: neutral.bgHover,
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontSize: 14,
                            fontWeight: 700,
                            color: brand.primary
                          }}
                        >
                          {row.subject || row.group}
                        </span>
                      </td>
                      <td style={tdStyle}>{row.start}</td>
                      <td style={tdStyle}>{row.end}</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>
                        {formatDuration(row.duration)}
                      </td>
                      <td style={tdStyle}>
                        {new Date(row.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
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
                      <td style={tdStyle}>{getStatusBadge(row.status)}</td>
                      <td style={tdStyle}>
                        {row.isTardy ? (
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
                        ) : (
                          <span
                            style={{ color: neutral.textMuted, fontSize: 13 }}
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {(() => {
                          const existingAppeal =
                            appealsByAttendanceId[
                              (row.attendanceId || row.id || '').toString()
                            ]
                          if (existingAppeal) {
                            return (
                              <span
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 999,
                                  fontWeight: 700,
                                  background: appealStatusColor(
                                    existingAppeal.status
                                  ),
                                  color: brand.secondary,
                                  textTransform: 'capitalize'
                                }}
                              >
                                {existingAppeal.status.replace('_', ' ')}
                              </span>
                            )
                          }
                          return (
                            <button
                              onClick={() => openAppealDrawer(row)}
                              style={{
                                padding: '8px 16px',
                                borderRadius: 8,
                                border: 'none',
                                background: brand.primary,
                                color: '#ffffff', // Fixed: Always white on brand background
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              Request Review
                            </button>
                          )
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Appeal Drawer */}
      {showAppealDrawer && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 1000
          }}
          onClick={closeAppealDrawer}
        >
          <div
            style={{
              width: 400,
              height: '100%',
              background: neutral.bgSurface,
              padding: 24,
              boxShadow: '-4px 0 16px rgba(0,0,0,0.15)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16
              }}
            >
              <h3 style={{ margin: 0, color: brand.secondary }}>
                Request Review
              </h3>
              <button
                onClick={closeAppealDrawer}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 20,
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>

            {selectedRecord && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: neutral.bgMuted,
                  marginBottom: 16
                }}
              >
                <div style={{ fontWeight: 700 }}>{selectedRecord.subject}</div>
                <div style={{ fontSize: 13 }}>
                  {selectedRecord.date &&
                    new Date(selectedRecord.date).toLocaleDateString()}
                </div>
                <div style={{ fontSize: 13 }}>
                  Status: {selectedRecord.status}
                </div>
              </div>
            )}

            {appealError && (
              <StatusBanner
                variant='error'
                title='Submission issue'
                message={appealError}
                onClose={() => setAppealError('')}
              />
            )}
            {appealSuccess && (
              <StatusBanner
                variant='success'
                title='Appeal sent'
                message={appealSuccess}
                onClose={() => setAppealSuccess('')}
              />
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label htmlFor='appeal-reason' style={labelStyle}>
                  Reason
                </label>
                <textarea
                  id='appeal-reason'
                  value={appealReason}
                  onChange={e => setAppealReason(e.target.value)}
                  rows={3}
                  placeholder='Explain why this attendance record needs review'
                  style={{
                    ...filterInputStyle,
                    resize: 'vertical',
                    fontSize: 14,
                    height: 90
                  }}
                />
              </div>
              <div>
                <label htmlFor='appeal-notes' style={labelStyle}>
                  Additional Notes (optional)
                </label>
                <textarea
                  id='appeal-notes'
                  value={appealNotes}
                  onChange={e => setAppealNotes(e.target.value)}
                  rows={3}
                  placeholder='Provide context like internet issues, instructor confirmations, etc.'
                  style={{
                    ...filterInputStyle,
                    resize: 'vertical',
                    fontSize: 14,
                    height: 80
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Attachments (optional)</label>
                <input type='file' multiple onChange={handleAttachmentChange} />
                {appealAttachments.length > 0 && (
                  <ul style={{ fontSize: 13, marginTop: 8 }}>
                    {appealAttachments.map(file => (
                      <li key={file.name}>{file.name}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={submitAppeal}
                disabled={submittingAppeal}
                style={{
                  padding: '12px 18px',
                  border: 'none',
                  borderRadius: 8,
                  background: brand.primary,
                  color: '#ffffff', // Fixed: Always white on brand background
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {submittingAppeal ? 'Submitting…' : 'Submit Appeal'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

const formatDuration = seconds => {
  if (!seconds) return '0:00:00'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(
    2,
    '0'
  )}`
}

const SidebarItem = ({ icon, label, isActive, isLast, onClick }) => {
  const [hover, setHover] = useState(false)
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
  fontSize: 15,
  letterSpacing: 0.5,
  background: neutral.bgMuted,
  color: brand.primary,
  borderBottom: `2px solid ${neutral.border}`,
  cursor: 'pointer',
  userSelect: 'none',
  whiteSpace: 'nowrap'
}

const tdStyle = {
  padding: '16px 20px',
  fontWeight: 600,
  color: neutral.textPrimary,
  fontSize: 15,
  verticalAlign: 'middle'
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
  width: '100%',
  transition: 'border 0.2s'
}

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 700,
  color: brand.primary
}

export default AttendanceLogs
