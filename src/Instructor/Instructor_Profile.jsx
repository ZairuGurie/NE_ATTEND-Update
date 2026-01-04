import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pie } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { toast } from 'react-toastify'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 2: CSS classes for theme-aware styling
import '../styles/profiles.css'
import '../styles/common.css'
import {
  logout,
  isAdmin,
  getCurrentUser,
  dispatchUserUpdateEvent
} from '../utils/auth'
import { apiGet, apiPost, apiPut } from '../utils/api'
import {
  brand,
  neutral,
  status as statusColors,
  interactive
} from '../utils/colors'
import { Alert } from '../components/ui'
import { INSTRUCTOR_ROUTES } from '../utils/constants/routes'

ChartJS.register(ArcElement, Tooltip, Legend)

const defaultPieData = [
  { label: 'Present', value: 62.5, color: statusColors.present.border },
  { label: 'Absent', value: 25, color: statusColors.absent.border },
  { label: 'Late', value: 12.5, color: statusColors.late.border }
]

const defaultInstructorNotifications = {
  emailAlerts: true,
  studentMessages: true,
  attendanceReports: false,
  systemUpdates: true
}

const initialInstructorData = {
  instructorId: '',
  firstName: '',
  lastName: '',
  fullName: '',
  email: '',
  phone: '',
  department: '',
  course: '',
  subjects: [],
  sections: [],
  officeRoom: '',
  bio: '',
  experience: '',
  specialization: '',
  linkedin: '',
  researchGate: '',
  profilePicture: null,
  imageScale: 1,
  notifications: { ...defaultInstructorNotifications },
  _id: ''
}

const REPORT_STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Present', value: 'present' },
  { label: 'Late', value: 'late' },
  { label: 'Absent', value: 'absent' },
  { label: 'Pending', value: 'pending' }
]

const DEFAULT_BREAKDOWN = { bySubject: [], bySection: [] }

const buildReportQuery = filters => {
  const params = new URLSearchParams()
  params.set('includeDetails', 'true')
  params.set('limit', '250')
  params.set('page', '1')

  if (filters.subjectId) params.set('subjectId', filters.subjectId)
  if (filters.section) params.set('section', filters.section)
  if (filters.status) params.set('status', filters.status)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)

  return params.toString()
}

const deriveChartDataFromSummary = (summary = {}) => {
  const present = summary.presentCount || 0
  const late = summary.lateCount || 0
  const absent = summary.absentCount || 0
  const total = present + late + absent

  if (!total) {
    return defaultPieData
  }

  const toPercent = value => Math.round((value / total) * 100)

  return [
    {
      label: 'Present',
      value: toPercent(present),
      color: statusColors.present.border
    },
    {
      label: 'Absent',
      value: toPercent(absent),
      color: statusColors.absent.border
    },
    {
      label: 'Late',
      value: toPercent(late),
      color: statusColors.late.border
    }
  ]
}

const sanitizeCsvValue = value => {
  if (value === null || value === undefined) return ''
  const stringValue = String(value)
  if (stringValue.includes(',') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

const exportReportDetailsToCsv = (details = [], filters = {}) => {
  if (!details.length || typeof window === 'undefined') {
    return false
  }

  const headers = [
    'Student Name',
    'Subject',
    'Status',
    'Session Date',
    'Section',
    'Scheduled Sections',
    'Start Time',
    'End Time',
    'Excused',
    'Tardy'
  ]

  const rows = details.map(detail => {
    const sessionDate = detail.sessionDate
      ? new Date(detail.sessionDate).toLocaleString()
      : ''
    const startTime = detail.startTime
      ? new Date(detail.startTime).toLocaleTimeString()
      : ''
    const endTime = detail.endTime
      ? new Date(detail.endTime).toLocaleTimeString()
      : ''

    return [
      detail.studentName || 'Unknown',
      detail.subjectName || detail.subjectCode || '—',
      (detail.status || 'present').toUpperCase(),
      sessionDate,
      detail.studentSection || '—',
      Array.isArray(detail.sections) ? detail.sections.join(', ') : '—',
      startTime,
      endTime,
      detail.isExcused ? 'Yes' : 'No',
      detail.isTardy ? 'Yes' : 'No'
    ]
  })

  const csvContent = [headers, ...rows]
    .map(row => row.map(sanitizeCsvValue).join(','))
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `attendance-report-${filters.from || 'start'}-${
    filters.to || 'end'
  }.csv`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
  return true
}

const formatDateTime = value => {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return '—'
  }
}

const toDateInputValue = date => date.toISOString().slice(0, 10)

const getDefaultReportFilters = () => {
  const today = new Date()
  const from = new Date(today)
  from.setDate(today.getDate() - 29)

  return {
    subjectId: '',
    section: '',
    status: '',
    from: toDateInputValue(from),
    to: toDateInputValue(today)
  }
}

const PieChart = ({ data }) => {
  const chartData = {
    labels: data.map(d => d.label),
    datasets: [
      {
        data: data.map(d => d.value),
        backgroundColor: data.map(d => d.color),
        borderColor: neutral.bgSurface,
        borderWidth: 2
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            return `${context.label}: ${context.parsed}%`
          }
        }
      }
    }
  }

  return (
    <div style={{ width: 320, height: 320 }}>
      <Pie data={chartData} options={options} />
    </div>
  )
}

const InstructorProfile = () => {
  const navigate = useNavigate()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState('personal')
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [profilePicture, setProfilePicture] = useState(null)
  const [imageScale, setImageScale] = useState(1)
  const [showImageModal, setShowImageModal] = useState(false)
  const [tempImage, setTempImage] = useState(null)
  const [tempScale, setTempScale] = useState(1)
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [isEditingProfessional, setIsEditingProfessional] = useState(false)
  const [instructorData, setInstructorData] = useState(initialInstructorData)
  const [activityLog, setActivityLog] = useState([])
  const [availableSubjects, setAvailableSubjects] = useState([])
  const [availableSections, setAvailableSections] = useState([])
  const [subjectFilterOptions, setSubjectFilterOptions] = useState([])
  const [attendanceSummary, setAttendanceSummary] = useState(defaultPieData)
  const [reportFilters, setReportFilters] = useState(() =>
    getDefaultReportFilters()
  )
  const [reportSummary, setReportSummary] = useState(null)
  const [reportBreakdown, setReportBreakdown] = useState(DEFAULT_BREAKDOWN)
  const [reportDetails, setReportDetails] = useState([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())
  const [profileLoading, setProfileLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingProfessional, setIsSavingProfessional] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [feedbackBanner, setFeedbackBanner] = useState(null)

  useEffect(() => {
    if (!feedbackBanner) return
    const timeout = setTimeout(() => setFeedbackBanner(null), 5000)
    return () => clearTimeout(timeout)
  }, [feedbackBanner])

  const pushFeedback = (type, message) => {
    if (!message) return
    setFeedbackBanner({ type, message, id: Date.now() })
  }

  const filteredSectionOptions = useMemo(() => {
    if (reportFilters.subjectId) {
      const target = subjectFilterOptions.find(
        option => option.value === reportFilters.subjectId
      )
      return target?.sections || []
    }
    return availableSections
  }, [reportFilters.subjectId, subjectFilterOptions, availableSections])

  const summaryStats = useMemo(() => {
    const summary = reportSummary || {}
    return [
      { label: 'Total Records', value: summary.totalRecords ?? 0 },
      {
        label: 'Attendance Rate',
        value: `${summary.attendanceRate ?? 0}%`
      },
      { label: 'Effective Absences', value: summary.effectiveAbsences ?? 0 },
      { label: 'Excused', value: summary.excusedCount ?? 0 },
      { label: 'Late', value: summary.lateCount ?? 0 },
      { label: 'Tardy Events', value: summary.tardyCount ?? 0 }
    ]
  }, [reportSummary])

  const handleReportFilterChange = (field, value) => {
    setReportFilters(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubjectFilterChange = value => {
    setReportFilters(prev => ({
      ...prev,
      subjectId: value,
      section: value ? '' : prev.section
    }))
  }

  const handleResetReportFilters = () => {
    setReportFilters(getDefaultReportFilters())
  }

  const handleExportReport = () => {
    const exported = exportReportDetailsToCsv(reportDetails, reportFilters)
    if (!exported) {
      toast.info('No data available to export yet')
    }
  }

  const canEditProfile = useMemo(() => {
    if (isAdmin()) return true
    if (!currentUser || !instructorData._id) return false
    return currentUser._id === instructorData._id
  }, [currentUser, instructorData._id])

  const applyInstructorResponse = (user = {}) => {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim()
    setInstructorData({
      instructorId: user.employeeId || user._id || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      fullName,
      email: user.email || '',
      phone: user.phone || '',
      department: user.department || '',
      course: user.course || '',
      subjects: user.subjects || [],
      sections: user.sections || [],
      officeRoom: user.officeLocation || '',
      bio: user.bio || '',
      experience: user.experience || '',
      specialization: user.specialization || '',
      linkedin: user.linkedin || '',
      researchGate: user.researchGate || '',
      profilePicture: user.profilePicture || null,
      imageScale: user.imageScale || 1,
      notifications: {
        ...defaultInstructorNotifications,
        ...(user.notifications || {})
      },
      _id: user._id
    })
    setProfilePicture(user.profilePicture || null)
    setImageScale(user.imageScale || 1)
  }

  const buildInstructorPayload = (overrides = {}) => {
    const source = {
      ...instructorData,
      profilePicture,
      imageScale,
      ...overrides
    }
    const payload = {
      firstName: source.firstName,
      lastName: source.lastName,
      email: source.email,
      phone: source.phone,
      department: source.department,
      course: source.course,
      officeLocation: source.officeRoom,
      experience: source.experience,
      specialization: source.specialization,
      bio: source.bio,
      linkedin: source.linkedin,
      researchGate: source.researchGate,
      profilePicture: source.profilePicture,
      imageScale: source.imageScale,
      notifications: source.notifications,
      subjects: source.subjects,
      sections: source.sections
    }
    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    )
  }

  const saveInstructorProfile = async (
    overrides = {},
    {
      setSavingState = setIsSavingProfile,
      successMessage = 'Profile saved successfully!'
    } = {}
  ) => {
    if (!currentUser?._id) {
      throw new Error('User ID is required')
    }
    setErrorMessage('')
    setSavingState(true)
    try {
      const payload = buildInstructorPayload(overrides)
      const response = await apiPut(`users/${currentUser._id}`, payload)
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(
          result.error || result.message || 'Failed to update profile'
        )
      }
      applyInstructorResponse(result.data)
      // Update localStorage and currentUser state to keep all components in sync
      setCurrentUser(result.data)
      dispatchUserUpdateEvent(result.data)
      if (successMessage) {
        pushFeedback('success', successMessage)
      }
      return result.data
    } catch (error) {
      setErrorMessage(error.message)
      pushFeedback('error', error.message)
      throw error
    } finally {
      setSavingState(false)
    }
  }

  /**
   * Derive activity log from assigned subjects
   * NOTE: Activity logs are derived from subject assignments only.
   * This is a limited view - it does not include:
   * - Attendance session activities
   * - Student interactions
   * - Note creation/updates
   * - Group management actions
   * - Other instructor activities
   * For a complete activity log, a dedicated activity tracking system would be needed.
   */
  const deriveActivityLog = (subjects = []) => {
    if (!subjects.length) {
      return []
    }
    return subjects.slice(0, 5).map(subject => ({
      date: new Date().toISOString(),
      action: 'Subject assigned',
      details: subject
    }))
  }

  const fetchInstructorProfile = useCallback(async userId => {
    setProfileLoading(true)
    setErrorMessage('')
    try {
      const response = await apiGet(`users/${userId}`)
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(
          result.error || result.message || 'Failed to load profile'
        )
      }
      applyInstructorResponse(result.data)
      // Update localStorage and currentUser state to keep all components in sync
      setCurrentUser(result.data)
      dispatchUserUpdateEvent(result.data)
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  const fetchInstructorSubjects = useCallback(async userId => {
    try {
      const response = await apiGet(`subjects/instructor/${userId}`)
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(
          result.error || result.message || 'Failed to load subjects'
        )
      }
      const rawSubjects = Array.isArray(result.data) ? result.data : []
      const subjects = rawSubjects.map(
        subject =>
          subject.subjectName || subject.subjectCode || 'Untitled Subject'
      )
      const sections = [
        ...new Set(rawSubjects.flatMap(subject => subject.sections || []))
      ]
      const filterOptions = rawSubjects.map(subject => ({
        value: subject._id,
        label: subject.subjectName || subject.subjectCode || 'Untitled Subject',
        sections: subject.sections || []
      }))
      setAvailableSubjects(subjects)
      setAvailableSections(sections)
      setSubjectFilterOptions(filterOptions)
      setActivityLog(deriveActivityLog(subjects))
    } catch (error) {
      console.error('Error fetching instructor subjects:', error)
    }
  }, [])

  const fetchReportData = useCallback(
    async instructorId => {
      if (!instructorId) return
      setReportLoading(true)
      setReportError('')
      try {
        const query = buildReportQuery(reportFilters)
        const response = await apiGet(
          `instructor/reports/attendance-summary?${query}`
        )
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(
            result.error || result.message || 'Failed to load report'
          )
        }
        const summary = result.data?.summary || null
        const breakdown = result.data?.breakdown || DEFAULT_BREAKDOWN
        const details = result.data?.details || []
        setReportSummary(summary)
        setReportBreakdown(breakdown)
        setReportDetails(details)
        setAttendanceSummary(deriveChartDataFromSummary(summary))
      } catch (error) {
        console.error('Error fetching instructor report:', error)
        setReportError(error.message || 'Failed to load report')
        setReportSummary(null)
        setReportBreakdown(DEFAULT_BREAKDOWN)
        setReportDetails([])
        setAttendanceSummary(defaultPieData)
      } finally {
        setReportLoading(false)
      }
    },
    [reportFilters]
  )

  useEffect(() => {
    const user = getCurrentUser()
    setCurrentUser(user)
    if (!user?._id) {
      setProfileLoading(false)
      setErrorMessage('User not authenticated')
      return
    }
    fetchInstructorProfile(user._id)
    fetchInstructorSubjects(user._id)
  }, [fetchInstructorProfile, fetchInstructorSubjects])

  useEffect(() => {
    if (!currentUser?._id) return
    fetchReportData(currentUser._id)
  }, [currentUser?._id, fetchReportData])

  const handleInputChange = e => {
    const { name, value } = e.target
    setInstructorData(prev => {
      const updated = {
        ...prev,
        [name]: value
      }
      if (name === 'firstName' || name === 'lastName') {
        const firstName = name === 'firstName' ? value : updated.firstName
        const lastName = name === 'lastName' ? value : updated.lastName
        updated.fullName = `${firstName || ''} ${lastName || ''}`.trim()
      }
      return updated
    })
  }

  const handleNotificationChange = async key => {
    if (!canEditProfile) return
    const previousValue = instructorData.notifications[key]
    const updatedNotifications = {
      ...instructorData.notifications,
      [key]: !previousValue
    }
    setInstructorData(prev => ({
      ...prev,
      notifications: updatedNotifications
    }))
    try {
      await saveInstructorProfile(
        { notifications: updatedNotifications },
        { setSavingState: () => {}, successMessage: '' }
      )
    } catch (error) {
      pushFeedback(
        'error',
        `Failed to update notification setting: ${
          error.message || 'Unknown error'
        }`
      )
      setInstructorData(prev => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          [key]: previousValue
        }
      }))
    }
  }

  const handleEditToggle = async () => {
    if (!canEditProfile) return
    if (isEditing) {
      try {
        await saveInstructorProfile()
        setIsEditing(false)
      } catch (error) {
        // remain in edit mode for corrections
        pushFeedback(
          'error',
          `Failed to save profile: ${error.message || 'Unknown error'}`
        )
      }
    } else {
      setIsEditing(true)
    }
  }

  const handleProfessionalEditToggle = async () => {
    if (!canEditProfile) return
    if (isEditingProfessional) {
      try {
        await saveInstructorProfile(
          {
            bio: instructorData.bio,
            experience: instructorData.experience,
            specialization: instructorData.specialization,
            linkedin: instructorData.linkedin,
            researchGate: instructorData.researchGate
          },
          {
            setSavingState: setIsSavingProfessional,
            successMessage: 'Professional details updated!'
          }
        )
        setIsEditingProfessional(false)
      } catch (error) {
        // stay in edit mode for corrections
        pushFeedback(
          'error',
          `Failed to save professional details: ${
            error.message || 'Unknown error'
          }`
        )
      }
    } else {
      setIsEditingProfessional(true)
    }
  }

  const handleLogout = () => {
    logout(navigate)
  }

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      pushFeedback('error', 'New passwords do not match!')
      return
    }
    if (passwordData.newPassword.length < 8) {
      pushFeedback('error', 'Password must be at least 8 characters long!')
      return
    }
    if (!canEditProfile || !instructorData._id) {
      pushFeedback('error', 'You are not allowed to update this password.')
      return
    }

    try {
      const response = await apiPost('auth/change-password', {
        userId: instructorData._id,
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(
          result.error || result.message || 'Failed to change password'
        )
      }

      pushFeedback('success', 'Password changed successfully!')
      setShowPasswordModal(false)
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
    } catch (error) {
      pushFeedback('error', error.message)
    }
  }

  const handleProfilePictureChange = e => {
    if (!canEditProfile) return
    const file = e.target.files[0]
    if (file) {
      // Validate file type
      const validTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp'
      ]
      if (!validTypes.includes(file.type)) {
        toast.error('Please select a valid image file (JPG, PNG, GIF, or WEBP)')
        return
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB')
        return
      }

      // Read and show in modal for resizing
      const reader = new FileReader()
      reader.onloadend = () => {
        setTempImage(reader.result)
        setTempScale(1) // Start at 100%
        setShowImageModal(true) // Open resize modal
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSaveProfilePicture = () => {
    if (!canEditProfile) return
    // Apply the temp image and scale
    setProfilePicture(tempImage)
    setImageScale(tempScale)
    setInstructorData(prev => ({
      ...prev,
      profilePicture: tempImage,
      imageScale: tempScale
    }))
    setShowImageModal(false)
  }

  const handleCancelProfilePicture = () => {
    // Discard changes
    setTempImage(null)
    setTempScale(1)
    setShowImageModal(false)
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    fontSize: 16,
    border: `1px solid ${neutral.border}`,
    borderRadius: 8,
    marginBottom: 18,
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    background: isEditing ? neutral.bgSurface : neutral.bgMuted,
    color: neutral.textPrimary,
    transition: 'border 0.2s, background 0.2s'
  }

  const editableInputStyle = {
    ...inputStyle,
    background: neutral.bgSurface,
    border: `1px solid ${brand.secondary}`
  }

  const textareaStyle = {
    ...inputStyle,
    minHeight: 100,
    resize: 'vertical',
    fontFamily: 'inherit'
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        background: neutral.bgPage
      }}
    >
      {/* Main Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          position: 'relative'
        }}
      >
        {/* Back Button */}
        <div
          style={{
            position: 'absolute',
            top: 32,
            left: 48,
            cursor: 'pointer',
            fontSize: 28,
            color: neutral.textPrimary,
            zIndex: 10
          }}
          onClick={() => navigate(INSTRUCTOR_ROUTES.DASHBOARD)}
        >
          <i className='bi bi-arrow-left'></i>
        </div>

        {/* Profile Dropdown */}
        <div
          style={{
            position: 'absolute',
            top: 32,
            right: 48,
            zIndex: 10
          }}
        >
          <div style={{ position: 'relative' }}>
            <div
              style={{
                borderRadius: 50,
                padding: '10px 20px',
                display: 'flex',
                alignItems: 'center',
                background: brand.secondary,
                color: neutral.bgSurface,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <span
                style={{
                  fontWeight: 'bold',
                  fontSize: '16px',
                  letterSpacing: '0.5px'
                }}
              >
                Instructor
              </span>
              <i
                className='bi bi-caret-down-fill'
                style={{ marginLeft: 12, fontSize: 14 }}
              ></i>
            </div>

            {isDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 12,
                  background: neutral.bgSurface,
                  borderRadius: 12,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                  minWidth: 200
                }}
              >
                <div
                  style={{
                    padding: '12px 20px',
                    cursor: 'pointer',
                    fontSize: 16,
                    color: neutral.textPrimary,
                    borderBottom: `1px solid ${neutral.borderLight}`
                  }}
                  onClick={() => {
                    setIsDropdownOpen(false)
                    navigate(INSTRUCTOR_ROUTES.DASHBOARD)
                  }}
                >
                  Dashboard
                </div>
                <div
                  style={{
                    padding: '12px 20px',
                    cursor: 'pointer',
                    fontSize: 16,
                    color: neutral.textPrimary,
                    borderBottom: `1px solid ${neutral.borderLight}`
                  }}
                  onClick={() => {
                    setIsDropdownOpen(false)
                    navigate(INSTRUCTOR_ROUTES.INSIGHTS)
                  }}
                >
                  <i
                    className='bi bi-graph-up-arrow'
                    style={{ marginRight: 8 }}
                  ></i>
                  Attendance Insights
                </div>
                <div
                  style={{
                    padding: '12px 20px',
                    cursor: 'pointer',
                    fontSize: 16,
                    color: neutral.textPrimary
                  }}
                  onClick={handleLogout}
                >
                  Logout
                </div>
              </div>
            )}
          </div>
        </div>

        {feedbackBanner && (
          <Alert
            type={feedbackBanner.type === 'error' ? 'error' : 'success'}
            style={{ margin: '120px 48px 24px 48px' }}
          >
            {feedbackBanner.message}
          </Alert>
        )}

        {/* Header Section */}
        <div
          className='on-brand'
          style={{
            background: `linear-gradient(135deg, ${brand.secondary} 0%, ${brand.primary} 100%)`,
            padding: '48px 48px 32px 48px',
            color: '#ffffff', // Fixed: Always white on brand gradient background
            marginBottom: 32
          }}
        >
          <div
            style={{
              maxWidth: 1400,
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 32,
              marginTop: 40
            }}
          >
            {/* Editable Profile Picture */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12
              }}
            >
              <input
                type='file'
                id='instructor-profile-pic-upload'
                accept='image/*'
                style={{ display: 'none' }}
                onChange={handleProfilePictureChange}
              />
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  background: profilePicture
                    ? `url(${profilePicture})`
                    : neutral.textDisabled,
                  backgroundSize: `${imageScale * 100}%`,
                  backgroundPosition: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 36,
                  color: neutral.textMuted,
                  fontWeight: 700,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                  overflow: 'hidden',
                  transition: 'all 0.3s ease'
                }}
              >
                {!profilePicture &&
                  instructorData.fullName
                    .split(' ')
                    .map(n => n[0])
                    .join('')}
              </div>

              {/* Upload/Edit Button */}
              <label
                htmlFor='instructor-profile-pic-upload'
                style={{
                  background: interactive.success,
                  color: neutral.bgSurface,
                  padding: '8px 16px',
                  borderRadius: 20,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow =
                    '0 4px 12px rgba(16, 185, 129, 0.4)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow =
                    '0 2px 8px rgba(16, 185, 129, 0.3)'
                }}
              >
                <i className='bi bi-camera-fill'></i>
                {profilePicture ? 'Change Photo' : 'Upload Photo'}
              </label>
            </div>
            <div style={{ flex: 1 }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: 32,
                  fontWeight: 800,
                  marginBottom: 8
                }}
              >
                {instructorData.fullName}
              </h1>
              <div style={{ fontSize: 16, opacity: 0.9, marginBottom: 4 }}>
                {instructorData.department} • {instructorData.course}
              </div>
              <div style={{ fontSize: 15, opacity: 0.8 }}>
                ID: {instructorData.instructorId}
              </div>
            </div>
            {isAdmin() && (
              <button
                onClick={handleEditToggle}
                disabled={!canEditProfile || (isEditing && isSavingProfile)}
                style={{
                  padding: '12px 32px',
                  fontSize: 16,
                  fontWeight: 600,
                  borderRadius: 8,
                  cursor: !canEditProfile ? 'not-allowed' : 'pointer',
                  border: 'none',
                  background: isEditing
                    ? interactive.success
                    : statusColors.present.border,
                  color: neutral.textPrimary,
                  transition: 'background 0.2s',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  opacity: !canEditProfile ? 0.6 : 1
                }}
              >
                {isEditing
                  ? isSavingProfile
                    ? 'Saving...'
                    : 'Save Changes'
                  : 'Edit Profile'}
              </button>
            )}
          </div>
        </div>

        {/* Tabs and Content */}
        <div
          style={{
            maxWidth: 1400,
            margin: '0 auto',
            padding: '0 48px 48px 48px'
          }}
        >
          {/* Tab Buttons */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              marginBottom: 24,
              borderBottom: `2px solid ${neutral.border}`,
              paddingBottom: 0
            }}
          >
            <button
              onClick={() => setActiveTab('personal')}
              style={{
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: 600,
                border: 'none',
                background:
                  activeTab === 'personal' ? brand.secondary : neutral.bgMuted,
                color:
                  activeTab === 'personal'
                    ? neutral.bgSurface
                    : brand.secondary,
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              <i className='bi bi-person-fill' style={{ marginRight: 8 }}></i>
              Personal Info
            </button>
            <button
              onClick={() => setActiveTab('professional')}
              style={{
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: 600,
                border: 'none',
                background:
                  activeTab === 'professional'
                    ? brand.secondary
                    : neutral.bgMuted,
                color:
                  activeTab === 'professional'
                    ? neutral.bgSurface
                    : brand.secondary,
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              <i
                className='bi bi-briefcase-fill'
                style={{ marginRight: 8 }}
              ></i>
              Professional
            </button>
            <button
              onClick={() => setActiveTab('contact')}
              style={{
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: 600,
                border: 'none',
                background:
                  activeTab === 'contact' ? brand.secondary : neutral.bgMuted,
                color:
                  activeTab === 'contact' ? neutral.bgSurface : brand.secondary,
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              <i
                className='bi bi-telephone-fill'
                style={{ marginRight: 8 }}
              ></i>
              Contact & Office
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              style={{
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: 600,
                border: 'none',
                background:
                  activeTab === 'settings' ? brand.secondary : neutral.bgMuted,
                color:
                  activeTab === 'settings'
                    ? neutral.bgSurface
                    : brand.secondary,
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              <i className='bi bi-gear-fill' style={{ marginRight: 8 }}></i>
              Settings
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              style={{
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: 600,
                border: 'none',
                background:
                  activeTab === 'activity' ? brand.secondary : neutral.bgMuted,
                color:
                  activeTab === 'activity'
                    ? neutral.bgSurface
                    : brand.secondary,
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              <i className='bi bi-clock-history' style={{ marginRight: 8 }}></i>
              Activity Log
            </button>
          </div>

          {/* Tab Content */}
          <div style={{ display: 'flex', gap: 32 }}>
            {/* Left Side - Main Content */}
            <div style={{ flex: 2 }}>
              <>
                {/* Personal Info Tab */}
                {activeTab === 'personal' && (
                  <div
                    style={{
                      background: neutral.bgSurface,
                      borderRadius: 16,
                      boxShadow: '0 4px 24px rgba(44,44,84,0.10)',
                      padding: '32px'
                    }}
                  >
                    <h3
                      style={{
                        fontWeight: 700,
                        fontSize: 22,
                        color: brand.secondary,
                        marginBottom: 24
                      }}
                    >
                      Personal Information
                    </h3>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 24
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 16,
                            marginBottom: 8,
                            color: neutral.textPrimary
                          }}
                        >
                          Instructor ID
                        </div>
                        <input
                          name='instructorId'
                          style={isEditing ? editableInputStyle : inputStyle}
                          readOnly={!isEditing}
                          value={instructorData.instructorId}
                          onChange={handleInputChange}
                        />
                      </div>

                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 16,
                            marginBottom: 8,
                            color: neutral.textPrimary
                          }}
                        >
                          Full Name
                        </div>
                        <input
                          name='fullName'
                          style={isEditing ? editableInputStyle : inputStyle}
                          readOnly={!isEditing}
                          value={instructorData.fullName}
                          onChange={handleInputChange}
                          autoComplete='off'
                        />
                      </div>

                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 16,
                            marginBottom: 8,
                            color: neutral.textPrimary
                          }}
                        >
                          Email Address
                        </div>
                        <input
                          name='email'
                          type='email'
                          style={isEditing ? editableInputStyle : inputStyle}
                          readOnly={!isEditing}
                          value={instructorData.email}
                          onChange={handleInputChange}
                          autoComplete='email'
                        />
                      </div>

                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 16,
                            marginBottom: 8,
                            color: neutral.textPrimary
                          }}
                        >
                          Phone Number
                        </div>
                        <input
                          name='phone'
                          type='tel'
                          style={isEditing ? editableInputStyle : inputStyle}
                          readOnly={!isEditing}
                          value={instructorData.phone}
                          onChange={handleInputChange}
                          autoComplete='tel'
                        />
                      </div>

                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 16,
                            marginBottom: 8,
                            color: neutral.textPrimary
                          }}
                        >
                          Department
                        </div>
                        <select
                          name='department'
                          style={isEditing ? editableInputStyle : inputStyle}
                          disabled={!isEditing}
                          value={instructorData.department}
                          onChange={handleInputChange}
                        >
                          <option value='CITC'>CITC</option>
                          <option value='Engineering'>Engineering</option>
                          <option value='Business'>Business</option>
                        </select>
                      </div>

                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 16,
                            marginBottom: 8,
                            color: neutral.textPrimary
                          }}
                        >
                          Course
                        </div>
                        <select
                          name='course'
                          style={isEditing ? editableInputStyle : inputStyle}
                          disabled={!isEditing}
                          value={instructorData.course}
                          onChange={handleInputChange}
                        >
                          <option value='BSIT'>
                            BS Information Technology
                          </option>
                          <option value='BSCS'>BS Computer Science</option>
                        </select>
                      </div>

                      <div style={{ gridColumn: '1 / -1' }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 16,
                            marginBottom: 8,
                            color: neutral.textPrimary
                          }}
                        >
                          Subjects
                        </div>
                        <div
                          style={{
                            border: `1px solid ${neutral.borderLight}`,
                            borderRadius: 8,
                            maxHeight: 200,
                            overflow: 'auto',
                            background: neutral.bgMuted
                          }}
                        >
                          {availableSubjects.length === 0 ? (
                            <div
                              style={{
                                padding: '12px 16px',
                                color: neutral.textMuted
                              }}
                            >
                              No subjects assigned yet.
                            </div>
                          ) : (
                            availableSubjects.map((subject, index) => (
                              <div
                                key={`${subject}-${index}`}
                                style={{
                                  padding: '10px 16px',
                                  borderBottom: `1px solid ${neutral.borderLight}`,
                                  background: instructorData.subjects.includes(
                                    subject
                                  )
                                    ? statusColors.host.bg
                                    : neutral.bgSurface,
                                  fontWeight: 500,
                                  color: neutral.textPrimary
                                }}
                              >
                                {subject}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ gridColumn: '1 / -1' }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: 16,
                          marginBottom: 8,
                          color: neutral.textPrimary
                        }}
                      >
                        Sections
                      </div>
                      <div
                        style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}
                      >
                        {availableSections.length === 0 ? (
                          <span style={{ color: neutral.textMuted }}>
                            No sections detected.
                          </span>
                        ) : (
                          availableSections.map(section => (
                            <span
                              key={section}
                              style={{
                                padding: '8px 14px',
                                borderRadius: 20,
                                background: instructorData.sections.includes(
                                  section
                                )
                                  ? brand.secondary
                                  : statusColors.host.bg,
                                color: instructorData.sections.includes(section)
                                  ? neutral.bgSurface
                                  : brand.secondary,
                                fontWeight: 600,
                                fontSize: 13
                              }}
                            >
                              {section}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Professional Tab */}
                {activeTab === 'professional' && (
                  <div
                    style={{
                      background: neutral.bgSurface,
                      borderRadius: 16,
                      boxShadow: '0 4px 24px rgba(44,44,84,0.10)',
                      padding: '32px'
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
                      <h3
                        style={{
                          fontWeight: 700,
                          fontSize: 22,
                          color: brand.secondary,
                          margin: 0
                        }}
                      >
                        Professional Details
                      </h3>
                      <button
                        onClick={handleProfessionalEditToggle}
                        disabled={
                          !canEditProfile ||
                          (isEditingProfessional && isSavingProfessional)
                        }
                        style={{
                          padding: '10px 20px',
                          borderRadius: 8,
                          border: 'none',
                          background: isEditingProfessional
                            ? statusColors.present.border
                            : brand.secondary,
                          color: neutral.bgSurface,
                          fontWeight: 600,
                          fontSize: 14,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          opacity: !canEditProfile ? 0.6 : 1
                        }}
                      >
                        <i
                          className={`bi ${
                            isEditingProfessional
                              ? 'bi-check-circle'
                              : 'bi-pencil-fill'
                          }`}
                        ></i>
                        {isEditingProfessional
                          ? isSavingProfessional
                            ? 'Saving...'
                            : 'Save Changes'
                          : 'Edit Professional Info'}
                      </button>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 24
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 16,
                            marginBottom: 8,
                            color: neutral.textPrimary
                          }}
                        >
                          About Me / Teaching Philosophy
                        </div>
                        <textarea
                          name='bio'
                          style={
                            isEditingProfessional
                              ? {
                                  ...textareaStyle,
                                  border: `1px solid ${brand.secondary}`
                                }
                              : textareaStyle
                          }
                          readOnly={!isEditingProfessional}
                          value={instructorData.bio}
                          onChange={handleInputChange}
                          placeholder='Share your teaching philosophy and experience...'
                        />
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 24
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 16,
                              marginBottom: 8,
                              color: neutral.textPrimary
                            }}
                          >
                            Years of Experience
                          </div>
                          <input
                            name='experience'
                            style={
                              isEditingProfessional
                                ? editableInputStyle
                                : inputStyle
                            }
                            readOnly={!isEditingProfessional}
                            value={instructorData.experience}
                            onChange={handleInputChange}
                            placeholder='e.g., 8 years'
                          />
                        </div>
                      </div>

                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 16,
                            marginBottom: 8,
                            color: neutral.textPrimary
                          }}
                        >
                          Specialization / Expertise Areas
                        </div>
                        <input
                          name='specialization'
                          style={
                            isEditingProfessional
                              ? editableInputStyle
                              : inputStyle
                          }
                          readOnly={!isEditingProfessional}
                          value={instructorData.specialization}
                          onChange={handleInputChange}
                          placeholder='List your areas of expertise'
                        />
                      </div>

                      <div
                        style={{
                          borderTop: `1px solid ${neutral.borderLight}`,
                          paddingTop: 24,
                          marginTop: 8
                        }}
                      >
                        <h4
                          style={{
                            fontWeight: 600,
                            fontSize: 18,
                            color: brand.secondary,
                            marginBottom: 16
                          }}
                        >
                          Professional Links
                        </h4>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 16,
                                marginBottom: 8,
                                color: neutral.textPrimary
                              }}
                            >
                              <i
                                className='bi bi-linkedin'
                                style={{
                                  marginRight: 8,
                                  color: interactive.primary
                                }}
                              ></i>
                              LinkedIn Profile
                            </div>
                            <input
                              name='linkedin'
                              type='url'
                              style={
                                isEditingProfessional
                                  ? editableInputStyle
                                  : inputStyle
                              }
                              readOnly={!isEditingProfessional}
                              value={instructorData.linkedin}
                              onChange={handleInputChange}
                              placeholder='https://linkedin.com/in/yourprofile'
                            />
                          </div>

                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 16,
                                marginBottom: 8,
                                color: neutral.textPrimary
                              }}
                            >
                              <i
                                className='bi bi-book'
                                style={{
                                  marginRight: 8,
                                  color: interactive.success
                                }}
                              ></i>
                              ResearchGate Profile
                            </div>
                            <input
                              name='researchGate'
                              type='url'
                              style={
                                isEditingProfessional
                                  ? editableInputStyle
                                  : inputStyle
                              }
                              readOnly={!isEditingProfessional}
                              value={instructorData.researchGate}
                              onChange={handleInputChange}
                              placeholder='https://researchgate.net/profile/yourprofile'
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Contact & Office Tab */}
                {activeTab === 'contact' && (
                  <div
                    style={{
                      background: neutral.bgSurface,
                      borderRadius: 16,
                      boxShadow: '0 4px 24px rgba(44,44,84,0.10)',
                      padding: '32px'
                    }}
                  >
                    <h3
                      style={{
                        fontWeight: 700,
                        fontSize: 22,
                        color: brand.secondary,
                        marginBottom: 24
                      }}
                    >
                      Office & Contact Information
                    </h3>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 24
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 24
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 16,
                              marginBottom: 8,
                              color: brand.secondary
                            }}
                          >
                            <i
                              className='bi bi-envelope-fill'
                              style={{ marginRight: 8, color: brand.secondary }}
                            ></i>
                            Email Address
                          </div>
                          <input
                            name='email'
                            type='email'
                            style={isEditing ? editableInputStyle : inputStyle}
                            readOnly={!isEditing}
                            value={instructorData.email}
                            onChange={handleInputChange}
                            autoComplete='email'
                          />
                        </div>

                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 16,
                              marginBottom: 8,
                              color: brand.secondary
                            }}
                          >
                            <i
                              className='bi bi-telephone-fill'
                              style={{ marginRight: 8, color: brand.secondary }}
                            ></i>
                            Phone Number
                          </div>
                          <input
                            name='phone'
                            type='tel'
                            style={isEditing ? editableInputStyle : inputStyle}
                            readOnly={!isEditing}
                            value={instructorData.phone}
                            onChange={handleInputChange}
                            autoComplete='tel'
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          borderTop: `1px solid ${neutral.borderLight}`,
                          paddingTop: 24
                        }}
                      >
                        <h4
                          style={{
                            fontWeight: 600,
                            fontSize: 18,
                            color: brand.secondary,
                            marginBottom: 16
                          }}
                        >
                          Office Location
                        </h4>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 20
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: 16,
                                marginBottom: 8,
                                color: brand.secondary
                              }}
                            >
                              <i
                                className='bi bi-geo-alt-fill'
                                style={{
                                  marginRight: 8,
                                  color: brand.secondary
                                }}
                              ></i>
                              Office Room / Location
                            </div>
                            <input
                              name='officeRoom'
                              style={
                                isEditing ? editableInputStyle : inputStyle
                              }
                              readOnly={!isEditing}
                              value={instructorData.officeRoom}
                              onChange={handleInputChange}
                              placeholder='Room number and building'
                            />
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          background: statusColors.host.bg,
                          padding: 20,
                          borderRadius: 12,
                          border: `1px solid ${statusColors.host.border}`
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'start',
                            gap: 12
                          }}
                        >
                          <i
                            className='bi bi-info-circle-fill'
                            style={{
                              color: interactive.primary,
                              fontSize: 20,
                              marginTop: 2
                            }}
                          ></i>
                          <div>
                            <div
                              style={{
                                fontWeight: 600,
                                color: interactive.primary,
                                marginBottom: 4
                              }}
                            >
                              Contact Information
                            </div>
                            <div
                              style={{
                                fontSize: 14,
                                color: interactive.primary,
                                lineHeight: 1.6
                              }}
                            >
                              Students can see this information to schedule
                              consultations or reach out for academic guidance.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                  <div
                    style={{
                      background: neutral.bgSurface,
                      borderRadius: 16,
                      boxShadow: '0 4px 24px rgba(44,44,84,0.10)',
                      padding: '32px'
                    }}
                  >
                    <h3
                      style={{
                        fontWeight: 700,
                        fontSize: 22,
                        color: brand.primary,
                        marginBottom: 24
                      }}
                    >
                      Settings
                    </h3>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 32
                      }}
                    >
                      {/* Notification Preferences */}
                      <div>
                        <h4
                          style={{
                            fontWeight: 600,
                            fontSize: 18,
                            color: brand.primary,
                            marginBottom: 16
                          }}
                        >
                          Notification Preferences
                        </h4>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16
                          }}
                        >
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '14px 16px',
                              background: neutral.bgHover,
                              borderRadius: 8,
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type='checkbox'
                              checked={instructorData.notifications.emailAlerts}
                              onChange={() =>
                                handleNotificationChange('emailAlerts')
                              }
                              style={{
                                width: 18,
                                height: 18,
                                cursor: 'pointer'
                              }}
                            />
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: neutral.textPrimary,
                                  fontSize: 15
                                }}
                              >
                                Email Alerts
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: neutral.textMuted
                                }}
                              >
                                Receive email notifications for important
                                updates
                              </div>
                            </div>
                          </label>

                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '14px 16px',
                              background: neutral.bgHover,
                              borderRadius: 8,
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type='checkbox'
                              checked={
                                instructorData.notifications.studentMessages
                              }
                              onChange={() =>
                                handleNotificationChange('studentMessages')
                              }
                              style={{
                                width: 18,
                                height: 18,
                                cursor: 'pointer'
                              }}
                            />
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: neutral.textPrimary,
                                  fontSize: 15
                                }}
                              >
                                Student Messages
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: neutral.textMuted
                                }}
                              >
                                Get notified when students send messages
                              </div>
                            </div>
                          </label>

                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '14px 16px',
                              background: neutral.bgHover,
                              borderRadius: 8,
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type='checkbox'
                              checked={
                                instructorData.notifications.attendanceReports
                              }
                              onChange={() =>
                                handleNotificationChange('attendanceReports')
                              }
                              style={{
                                width: 18,
                                height: 18,
                                cursor: 'pointer'
                              }}
                            />
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: neutral.textPrimary,
                                  fontSize: 15
                                }}
                              >
                                Attendance Reports
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: neutral.textMuted
                                }}
                              >
                                Weekly attendance summary reports
                              </div>
                            </div>
                          </label>

                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '14px 16px',
                              background: neutral.bgHover,
                              borderRadius: 8,
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type='checkbox'
                              checked={
                                instructorData.notifications.systemUpdates
                              }
                              onChange={() =>
                                handleNotificationChange('systemUpdates')
                              }
                              style={{
                                width: 18,
                                height: 18,
                                cursor: 'pointer'
                              }}
                            />
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: neutral.textPrimary,
                                  fontSize: 15
                                }}
                              >
                                System Updates
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: neutral.textMuted
                                }}
                              >
                                Platform updates and maintenance notifications
                              </div>
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* Appearance Settings */}
                      <div
                        style={{
                          borderTop: `1px solid ${neutral.borderLight}`,
                          paddingTop: 24
                        }}
                      >
                        <h4
                          style={{
                            fontWeight: 600,
                            fontSize: 18,
                            color: brand.primary,
                            marginBottom: 16
                          }}
                        >
                          Appearance
                        </h4>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16
                          }}
                        >
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '14px 16px',
                              background: neutral.bgHover,
                              borderRadius: 8,
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type='checkbox'
                              checked={localStorage.getItem('theme') === 'dark'}
                              onChange={() => {
                                const newTheme =
                                  localStorage.getItem('theme') === 'dark'
                                    ? 'light'
                                    : 'dark'
                                localStorage.setItem('theme', newTheme)
                                document.documentElement.setAttribute(
                                  'data-theme',
                                  newTheme
                                )
                                // Force re-render by updating state
                                setInstructorData(prev => ({ ...prev }))
                              }}
                              style={{
                                width: 18,
                                height: 18,
                                cursor: 'pointer'
                              }}
                            />
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: neutral.textPrimary,
                                  fontSize: 15,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8
                                }}
                              >
                                <i className='bi bi-moon-stars-fill'></i>
                                Dark Mode
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: neutral.textMuted
                                }}
                              >
                                Switch between light and dark color themes
                              </div>
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* Security Settings */}
                      <div
                        style={{
                          borderTop: `1px solid ${neutral.borderLight}`,
                          paddingTop: 24
                        }}
                      >
                        <h4
                          style={{
                            fontWeight: 600,
                            fontSize: 18,
                            color: brand.primary,
                            marginBottom: 16
                          }}
                        >
                          Security
                        </h4>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12
                          }}
                        >
                          <button
                            onClick={() => setShowPasswordModal(true)}
                            style={{
                              padding: '12px 20px',
                              background: neutral.bgSurface,
                              border: `1px solid ${neutral.border}`,
                              borderRadius: 8,
                              fontSize: 15,
                              fontWeight: 600,
                              color: brand.primary,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e =>
                              (e.target.style.background = neutral.bgHover)
                            }
                            onMouseLeave={e =>
                              (e.target.style.background = neutral.bgSurface)
                            }
                          >
                            <i className='bi bi-key-fill'></i>
                            Change Password
                          </button>

                          <button
                            style={{
                              padding: '12px 20px',
                              background: neutral.bgSurface,
                              border: `1px solid ${neutral.border}`,
                              borderRadius: 8,
                              fontSize: 15,
                              fontWeight: 600,
                              color: brand.primary,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={e =>
                              (e.target.style.background = neutral.bgHover)
                            }
                            onMouseLeave={e =>
                              (e.target.style.background = neutral.bgSurface)
                            }
                          >
                            <i className='bi bi-shield-lock-fill'></i>
                            Enable Two-Factor Authentication
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Activity Log Tab */}
                {activeTab === 'activity' && (
                  <div
                    style={{
                      background: neutral.bgSurface,
                      borderRadius: 16,
                      boxShadow: '0 4px 24px rgba(44,44,84,0.10)',
                      padding: '32px'
                    }}
                  >
                    <h3
                      style={{
                        fontWeight: 700,
                        fontSize: 22,
                        color: brand.primary,
                        marginBottom: 24
                      }}
                    >
                      Recent Activity
                    </h3>

                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0
                      }}
                    >
                      {activityLog.map((activity, index) => (
                        <div
                          key={index}
                          style={{
                            padding: '16px 0',
                            borderBottom:
                              index < activityLog.length - 1
                                ? `1px solid ${neutral.borderLight}`
                                : 'none',
                            display: 'flex',
                            gap: 16
                          }}
                        >
                          <div
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: '50%',
                              background: statusColors.pending.bg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: statusColors.pending.text,
                              fontSize: 18,
                              flexShrink: 0
                            }}
                          >
                            <i className='bi bi-clock-history'></i>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                color: neutral.textPrimary,
                                marginBottom: 4
                              }}
                            >
                              {activity.action}
                            </div>
                            <div
                              style={{
                                fontSize: 14,
                                color: neutral.textMuted,
                                marginBottom: 4
                              }}
                            >
                              {activity.details}
                            </div>
                            <div
                              style={{
                                fontSize: 13,
                                color: neutral.textDisabled
                              }}
                            >
                              {new Date(activity.date).toLocaleDateString(
                                'en-US',
                                {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                }
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            </div>

            {/* Right Side - Quick Actions Panel */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  background: neutral.bgSurface,
                  borderRadius: 16,
                  boxShadow: '0 4px 24px rgba(44,44,84,0.10)',
                  padding: '32px',
                  position: 'sticky',
                  top: 20,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 20
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 4
                  }}
                >
                  <h3
                    style={{
                      fontWeight: 700,
                      fontSize: 20,
                      color: brand.primary,
                      margin: 0
                    }}
                  >
                    Quick Actions
                  </h3>
                </div>

                {/* Dashboard Link for Insights */}
                <div
                  style={{
                    textAlign: 'center',
                    padding: '24px',
                    background: neutral.bgMuted,
                    borderRadius: 12,
                    border: `1px dashed ${neutral.borderLight}`
                  }}
                >
                  <i
                    className='bi bi-graph-up-arrow'
                    style={{
                      fontSize: 32,
                      color: brand.primary,
                      marginBottom: 12,
                      display: 'block'
                    }}
                  ></i>
                  <p
                    style={{
                      color: neutral.textSecondary,
                      marginBottom: 16,
                      fontSize: 14
                    }}
                  >
                    Attendance analytics, charts, and export features are now
                    available in the Dashboard.
                  </p>
                  <button
                    type='button'
                    onClick={() => navigate('/instructor-dashboard')}
                    style={{
                      padding: '10px 24px',
                      borderRadius: 8,
                      border: 'none',
                      background: brand.primary,
                      color: '#ffffff',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <i
                      className='bi bi-speedometer2'
                      style={{ marginRight: 8 }}
                    ></i>
                    Go to Dashboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {profileLoading && !errorMessage && (
          <div
            style={{
              position: 'absolute',
              top: 110,
              left: 48,
              right: 48,
              zIndex: 9
            }}
          >
            <div
              style={{
                background: statusColors.pending.bg,
                border: `1px solid ${statusColors.pending.border}`,
                color: neutral.textPrimary,
                padding: '12px 16px',
                borderRadius: 12,
                boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
              }}
            >
              Loading profile information...
            </div>
          </div>
        )}

        {errorMessage && (
          <div
            style={{
              position: 'absolute',
              top: 110,
              left: 48,
              right: 48,
              zIndex: 9
            }}
          >
            <div
              style={{
                background: statusColors.late.bg,
                border: `1px solid ${statusColors.late.border}`,
                color: statusColors.late.text,
                padding: '12px 16px',
                borderRadius: 12,
                boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
              }}
            >
              {errorMessage}
            </div>
          </div>
        )}
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)'
          }}
        >
          <div
            style={{
              background: neutral.bgSurface,
              borderRadius: 16,
              width: '90%',
              maxWidth: 500,
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                background: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.accent} 100%)`,
                padding: '24px 28px',
                borderBottom: `3px solid ${statusColors.host.border}`
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    color: neutral.bgSurface,
                    fontSize: 22,
                    fontWeight: 700
                  }}
                >
                  <i className='bi bi-key-fill' style={{ marginRight: 10 }}></i>
                  Change Password
                </h3>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: neutral.bgSurface,
                    fontSize: 24,
                    cursor: 'pointer',
                    padding: 8,
                    borderRadius: 8
                  }}
                >
                  <i className='bi bi-x-lg'></i>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '28px' }}>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontWeight: 600,
                      fontSize: 14,
                      color: neutral.textSecondary,
                      marginBottom: 8,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    Current Password
                  </label>
                  <input
                    type='password'
                    value={passwordData.currentPassword}
                    onChange={e =>
                      setPasswordData({
                        ...passwordData,
                        currentPassword: e.target.value
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: `2px solid ${neutral.border}`,
                      fontSize: 15,
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box'
                    }}
                    placeholder='Enter current password'
                    autoComplete='current-password'
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontWeight: 600,
                      fontSize: 14,
                      color: neutral.textSecondary,
                      marginBottom: 8,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    New Password
                  </label>
                  <input
                    type='password'
                    value={passwordData.newPassword}
                    onChange={e =>
                      setPasswordData({
                        ...passwordData,
                        newPassword: e.target.value
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: `2px solid ${neutral.border}`,
                      fontSize: 15,
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box'
                    }}
                    placeholder='Enter new password (min 6 characters)'
                    autoComplete='new-password'
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: 'block',
                      fontWeight: 600,
                      fontSize: 14,
                      color: neutral.textSecondary,
                      marginBottom: 8,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    Confirm New Password
                  </label>
                  <input
                    type='password'
                    value={passwordData.confirmPassword}
                    onChange={e =>
                      setPasswordData({
                        ...passwordData,
                        confirmPassword: e.target.value
                      })
                    }
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: `2px solid ${neutral.border}`,
                      fontSize: 15,
                      outline: 'none',
                      transition: 'border-color 0.2s',
                      boxSizing: 'border-box'
                    }}
                    placeholder='Confirm new password'
                    autoComplete='new-password'
                  />
                </div>

                {passwordData.newPassword &&
                  passwordData.confirmPassword &&
                  passwordData.newPassword !== passwordData.confirmPassword && (
                    <div
                      style={{
                        padding: '10px 14px',
                        background: statusColors.absent.bg,
                        border: `1px solid ${statusColors.absent.border}`,
                        borderRadius: 6,
                        color: statusColors.absent.text,
                        fontSize: 14
                      }}
                    >
                      <i
                        className='bi bi-exclamation-triangle-fill'
                        style={{ marginRight: 8 }}
                      ></i>
                      Passwords do not match!
                    </div>
                  )}
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
                padding: '20px 28px',
                borderTop: `2px solid ${neutral.borderLight}`,
                background: neutral.bgMuted
              }}
            >
              <button
                onClick={() => {
                  setShowPasswordModal(false)
                  setPasswordData({
                    currentPassword: '',
                    newPassword: '',
                    confirmPassword: ''
                  })
                }}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: `2px solid ${neutral.textSecondary}`,
                  background: neutral.bgSurface,
                  color: neutral.textSecondary,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordChange}
                disabled={
                  !passwordData.currentPassword ||
                  !passwordData.newPassword ||
                  !passwordData.confirmPassword
                }
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background:
                    passwordData.currentPassword &&
                    passwordData.newPassword &&
                    passwordData.confirmPassword
                      ? interactive.success
                      : neutral.textDisabled,
                  color: neutral.bgSurface,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor:
                    passwordData.currentPassword &&
                    passwordData.newPassword &&
                    passwordData.confirmPassword
                      ? 'pointer'
                      : 'not-allowed',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(40, 167, 69, 0.3)'
                }}
              >
                <i
                  className='bi bi-check-circle'
                  style={{ marginRight: 8 }}
                ></i>
                Change Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Resize Modal */}
      {showImageModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            backdropFilter: 'blur(4px)'
          }}
          onClick={e => {
            if (e.target === e.currentTarget) handleCancelProfilePicture()
          }}
        >
          <div
            style={{
              background: neutral.bgSurface,
              borderRadius: 20,
              padding: 40,
              maxWidth: 500,
              width: '90%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              animation: 'modalSlideIn 0.3s ease-out'
            }}
          >
            <style>{`
              @keyframes modalSlideIn {
                from {
                  opacity: 0;
                  transform: translateY(-30px);
                }
                to {
                  opacity: 1;
                  transform: translateY(0);
                }
              }
            `}</style>

            <h2
              style={{
                margin: '0 0 24px 0',
                fontSize: 24,
                fontWeight: 700,
                color: brand.primary,
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}
            >
              <i className='bi bi-image'></i>
              Resize Profile Picture
            </h2>

            {/* Image Preview */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: 24
              }}
            >
              <div
                style={{
                  width: 200,
                  height: 200,
                  borderRadius: '50%',
                  background: `url(${tempImage})`,
                  backgroundSize: `${tempScale * 100}%`,
                  backgroundPosition: 'center',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  border: `4px solid ${neutral.borderLight}`,
                  overflow: 'hidden'
                }}
              />
            </div>

            {/* Zoom Controls */}
            <div
              style={{
                background: neutral.bgMuted,
                padding: 20,
                borderRadius: 12,
                marginBottom: 24
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: 14,
                  fontWeight: 600,
                  color: neutral.textSecondary,
                  marginBottom: 12,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}
              >
                Adjust Image Size
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16
                }}
              >
                <button
                  onClick={() => setTempScale(Math.max(0.5, tempScale - 0.1))}
                  style={{
                    background: neutral.bgSurface,
                    border: `2px solid ${neutral.border}`,
                    borderRadius: 8,
                    width: 40,
                    height: 40,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    color: brand.primary,
                    fontWeight: 700,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = brand.primary
                    e.currentTarget.style.color = '#ffffff' // Always white on brand background
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = neutral.bgSurface
                    e.currentTarget.style.color = brand.primary
                  }}
                >
                  <i className='bi bi-dash-lg'></i>
                </button>

                <div
                  style={{
                    flex: 1,
                    background: neutral.border,
                    height: 8,
                    borderRadius: 4,
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '100%',
                      width: `${((tempScale - 0.5) / 1.5) * 100}%`,
                      background: `linear-gradient(90deg, ${statusColors.verified.border} 0%, ${statusColors.verified.icon} 100%)`,
                      transition: 'width 0.2s ease',
                      borderRadius: 4
                    }}
                  />
                </div>

                <button
                  onClick={() => setTempScale(Math.min(2, tempScale + 0.1))}
                  style={{
                    background: neutral.bgSurface,
                    border: `2px solid ${neutral.border}`,
                    borderRadius: 8,
                    width: 40,
                    height: 40,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    color: brand.primary,
                    fontWeight: 700,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = brand.primary
                    e.currentTarget.style.color = '#ffffff' // Always white on brand background
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = neutral.bgSurface
                    e.currentTarget.style.color = brand.primary
                  }}
                >
                  <i className='bi bi-plus-lg'></i>
                </button>

                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: brand.primary,
                    minWidth: 60,
                    textAlign: 'center'
                  }}
                >
                  {Math.round(tempScale * 100)}%
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end'
              }}
            >
              <button
                onClick={handleCancelProfilePicture}
                style={{
                  padding: '12px 24px',
                  borderRadius: 10,
                  border: `2px solid ${neutral.textSecondary}`,
                  background: neutral.bgSurface,
                  color: neutral.textSecondary,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = neutral.textSecondary
                  e.currentTarget.style.color = neutral.bgSurface
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = neutral.bgSurface
                  e.currentTarget.style.color = neutral.textSecondary
                }}
              >
                <i className='bi bi-x-circle'></i>
                Cancel
              </button>
              <button
                onClick={handleSaveProfilePicture}
                style={{
                  padding: '12px 24px',
                  borderRadius: 10,
                  border: 'none',
                  background: `linear-gradient(135deg, ${statusColors.verified.border} 0%, ${statusColors.verified.icon} 100%)`,
                  color: neutral.bgSurface,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow =
                    '0 6px 16px rgba(16, 185, 129, 0.4)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow =
                    '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
              >
                <i className='bi bi-check-circle'></i>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default InstructorProfile
