import React, { useState, useEffect, useMemo } from 'react'
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
import { apiGet, apiPut, apiPost } from '../utils/api'
// Design system colors for consistent, accessible UI
import {
  status as statusColors,
  brand,
  neutral,
  interactive
} from '../utils/colors'
import { Alert } from '../components/ui'

ChartJS.register(ArcElement, Tooltip, Legend)

// Using accessible colors from design system
const defaultPieData = [
  { label: 'Present', value: 62.5, color: statusColors.present.border },
  { label: 'Absent', value: 25, color: statusColors.absent.border },
  { label: 'Late', value: 12.5, color: statusColors.late.border }
]

const defaultNotifications = {
  emailAlerts: true,
  attendanceReminders: true,
  gradeUpdates: false,
  announcementAlerts: true
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

const StudentProfile = () => {
  const navigate = useNavigate()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState('personal')
  const [isEditingContact, setIsEditingContact] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [profilePicture, setProfilePicture] = useState(null)
  const [imageScale, setImageScale] = useState(1)
  const [showImageModal, setShowImageModal] = useState(false)
  const [tempImage, setTempImage] = useState(null)
  const [tempScale, setTempScale] = useState(1)
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [studentData, setStudentData] = useState({
    studentId: '',
    fullName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    address: '',
    department: '',
    section: '',
    course: '',
    yearLevel: '',
    semester: '',
    enrolledSubjects: [],
    emergencyContact: '',
    emergencyPhone: '',
    guardianName: '',
    guardianRelation: '',
    units: '',
    gpa: '',
    profilePicture: null,
    imageScale: 1,
    notifications: { ...defaultNotifications },
    _id: ''
  })
  const [_profileLoading, setProfileLoading] = useState(true)
  const [_profileError, setProfileError] = useState('')
  const [_isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingContact, setIsSavingContact] = useState(false)
  const [attendanceSummary, setAttendanceSummary] = useState(defaultPieData)
  const [activityLog, setActivityLog] = useState([])
  const [feedbackBanner, setFeedbackBanner] = useState(null)
  const [enrolledSubjects, setEnrolledSubjects] = useState([])

  useEffect(() => {
    if (!feedbackBanner) return
    const timeout = setTimeout(() => setFeedbackBanner(null), 5000)
    return () => clearTimeout(timeout)
  }, [feedbackBanner])

  const pushFeedback = (type, message) => {
    if (!message) return
    setFeedbackBanner({ type, message, id: Date.now() })
  }

  const canEditProfile = useMemo(() => {
    if (isAdmin()) return true
    const userId = currentUser?._id || studentData._id
    if (!currentUser || !userId) return false
    return currentUser._id === userId
  }, [currentUser, studentData._id])

  const applyUserResponse = (user = {}) => {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim()
    const notifications = {
      ...defaultNotifications,
      ...(user.notifications || {})
    }
    setStudentData({
      studentId: user.studentId || user._id || '',
      fullName,
      email: user.email || '',
      phone: user.phone || '',
      dateOfBirth: user.dateOfBirth ? user.dateOfBirth.substring(0, 10) : '',
      address: user.address || '',
      department: user.department || '',
      section: user.section || '',
      course: user.course || '',
      yearLevel: user.yearLevel || '',
      semester: user.semester || '',
      enrolledSubjects: user.enrolledSubjects || [],
      emergencyContact: user.emergencyContact || '',
      emergencyPhone: user.emergencyPhone || '',
      guardianName: user.guardianName || '',
      guardianRelation: user.guardianRelation || '',
      units: user.units || '',
      gpa: user.gpa || '',
      profilePicture: user.profilePicture || null,
      imageScale: user.imageScale || 1,
      notifications,
      _id: user._id
    })
    setProfilePicture(user.profilePicture || null)
    setImageScale(user.imageScale || 1)
  }

  const buildUpdatePayload = (overrides = {}) => {
    const source = {
      ...studentData,
      profilePicture,
      imageScale,
      ...overrides
    }
    const nameParts = (source.fullName || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    const [firstName = ''] = nameParts
    const lastName = nameParts.slice(1).join(' ')
    const payload = {
      firstName,
      lastName,
      email: source.email,
      phone: source.phone,
      dateOfBirth: source.dateOfBirth || '',
      address: source.address,
      department: source.department,
      section: source.section,
      course: source.course,
      yearLevel: source.yearLevel,
      semester: source.semester,
      emergencyContact: source.emergencyContact,
      emergencyPhone: source.emergencyPhone,
      guardianName: source.guardianName,
      guardianRelation: source.guardianRelation,
      profilePicture: source.profilePicture,
      imageScale: source.imageScale,
      notifications: source.notifications,
      units: source.units,
      gpa: source.gpa
    }
    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    )
  }

  const saveStudentProfile = async (
    overrides = {},
    {
      setSavingState = setIsSavingProfile,
      successMessage = 'Profile saved successfully!'
    } = {}
  ) => {
    const userId = currentUser?._id || studentData._id
    if (!userId) {
      throw new Error('User ID is required')
    }
    setProfileError('')
    setSavingState(true)
    try {
      const payload = buildUpdatePayload(overrides)
      const response = await apiPut(`users/${userId}`, payload)
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(
          result.error || result.message || 'Failed to update profile'
        )
      }
      applyUserResponse(result.data)
      // Update localStorage and currentUser state to keep all components in sync
      setCurrentUser(result.data)
      dispatchUserUpdateEvent(result.data)
      if (successMessage) {
        pushFeedback('success', successMessage)
      }
      return result.data
    } catch (error) {
      setProfileError(error.message)
      pushFeedback('error', error.message)
      throw error
    } finally {
      setSavingState(false)
    }
  }

  const fetchStudentData = async userId => {
    setProfileLoading(true)
    setProfileError('')
    try {
      const response = await apiGet(`users/${userId}`)
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(
          result.error || result.message || 'Failed to load profile'
        )
      }
      applyUserResponse(result.data)
      // Update localStorage and currentUser state to keep all components in sync
      setCurrentUser(result.data)
      dispatchUserUpdateEvent(result.data)
    } catch (error) {
      setProfileError(error.message)
    } finally {
      setProfileLoading(false)
    }
  }

  const fetchAttendanceBreakdown = async userId => {
    try {
      const response = await apiGet('attendance/recent?limit=200')
      if (!response.ok) {
        return
      }
      const result = await response.json()
      const records = (result.data || []).filter(record => {
        const recordUser = record.userId?._id || record.userId
        return recordUser && recordUser.toString() === userId
      })
      if (records.length === 0) {
        setAttendanceSummary(defaultPieData)
        return
      }
      const present = records.filter(
        r =>
          r.status === 'Present' ||
          r.status === 'present' ||
          r.rawStatus === 'present'
      ).length
      const late = records.filter(
        r =>
          r.status === 'Late' || r.status === 'late' || r.rawStatus === 'late'
      ).length
      const absent = records.filter(
        r =>
          r.status === 'Absent' ||
          r.status === 'absent' ||
          r.rawStatus === 'absent'
      ).length
      const total = present + late + absent
      if (total === 0) {
        setAttendanceSummary(defaultPieData)
        return
      }
      setAttendanceSummary([
        {
          label: 'PRESENT',
          value: Math.round((present / total) * 100),
          color: statusColors.present.border
        },
        {
          label: 'ABSENT',
          value: Math.round((absent / total) * 100),
          color: statusColors.absent.border
        },
        {
          label: 'LATE',
          value: Math.round((late / total) * 100),
          color: statusColors.late.border
        }
      ])
    } catch (error) {
      console.error('Error fetching attendance summary:', error)
    }
  }

  const fetchEnrolledSubjects = async () => {
    try {
      // Use the same approach as Student/Group.jsx: load subjects by student section
      const user = getCurrentUser()
      const studentSection = user?.section

      if (!studentSection) {
        setEnrolledSubjects([])
        return
      }

      const response = await apiGet(
        `subjects/student/section/${encodeURIComponent(studentSection)}`
      )

      if (!response.ok) {
        throw new Error(`Failed to load enrolled subjects (${response.status})`)
      }

      const result = await response.json()
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error(result.error || 'Unable to load enrolled subjects.')
      }

      const subjects = result.data.map(subject => ({
        id: subject._id,
        name: subject.subjectName || subject.name || 'Untitled Subject',
        code: subject.subjectCode || subject.code || '',
        section: studentSection
      }))

      setEnrolledSubjects(subjects)
    } catch (error) {
      console.error('Error loading enrolled subjects for profile:', error)
      setEnrolledSubjects([])
    }
  }

  /**
   * Fetch activity log entries for the student
   * NOTE: Activity logs are derived from attendance records only.
   * This is a limited view - it does not include all user activities such as:
   * - Profile updates
   * - Note access
   * - Group changes
   * - Other system interactions
   * For a complete activity log, a dedicated activity tracking system would be needed.
   */
  const fetchActivityEntries = async userId => {
    try {
      const response = await apiGet('attendance/recent?limit=100')
      if (!response.ok) {
        return
      }
      const result = await response.json()
      const records = (result.data || []).filter(record => {
        const recordUser = record.userId?._id || record.userId
        return recordUser && recordUser.toString() === userId
      })

      const entries = records.slice(0, 8).map(record => ({
        date: record.sessionDate || record.createdAt,
        action: (record.status || record.rawStatus || 'Attendance')
          .toString()
          .toUpperCase(),
        details: `${record.groupId?.groupName || 'Class'} • ${
          record.meetCode || record.subjectName || 'Session'
        }`
      }))
      setActivityLog(entries)
    } catch (error) {
      console.error('Error fetching activity log:', error)
    }
  }

  useEffect(() => {
    const user = getCurrentUser()
    setCurrentUser(user)
    if (user?._id) {
      fetchStudentData(user._id)
      fetchAttendanceBreakdown(user._id)
      fetchActivityEntries(user._id)
      fetchEnrolledSubjects()
    } else {
      setProfileLoading(false)
      setProfileError('User not authenticated')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleInputChange = e => {
    const { name, value } = e.target
    setStudentData(prevData => ({
      ...prevData,
      [name]: value
    }))
  }

  const handleNotificationChange = async key => {
    if (!canEditProfile) return
    const previousValue = studentData.notifications[key]
    const updatedNotifications = {
      ...studentData.notifications,
      [key]: !previousValue
    }
    setStudentData(prev => ({
      ...prev,
      notifications: updatedNotifications
    }))
    try {
      await saveStudentProfile(
        { notifications: updatedNotifications },
        { setSavingState: () => {}, successMessage: '' }
      )
    } catch (error) {
      setStudentData(prev => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          [key]: previousValue
        }
      }))
      pushFeedback('error', error.message)
    }
  }

  const handleEditToggle = async () => {
    if (!canEditProfile) return
    if (isEditing) {
      try {
        await saveStudentProfile()
        setIsEditing(false)
      } catch {
        // Keep editing mode active so the user can address validation errors
      }
    } else {
      setIsEditing(true)
    }
  }

  const handleContactEditToggle = async () => {
    if (!canEditProfile) return
    if (isEditingContact) {
      try {
        await saveStudentProfile(
          {
            email: studentData.email,
            phone: studentData.phone,
            emergencyContact: studentData.emergencyContact,
            emergencyPhone: studentData.emergencyPhone,
            guardianName: studentData.guardianName,
            guardianRelation: studentData.guardianRelation
          },
          {
            setSavingState: setIsSavingContact,
            successMessage: 'Contact information updated!'
          }
        )
        setIsEditingContact(false)
      } catch {
        // keep editing state to allow corrections
      }
    } else {
      setIsEditingContact(true)
    }
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
    const userId = currentUser?._id || studentData._id
    if (!canEditProfile || !userId) {
      pushFeedback('error', 'You are not allowed to update this password.')
      return
    }

    try {
      const response = await apiPost('auth/change-password', {
        userId: userId,
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

  const handleLogout = () => {
    setIsDropdownOpen(false)
    logout(navigate)
  }

  const handleProfilePictureChange = e => {
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
    // Apply the temp image and scale
    setProfilePicture(tempImage)
    setImageScale(tempScale)
    setStudentData(prev => ({
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
          onClick={() => navigate('/dashboard')}
        >
          <i className='bi bi-arrow-left'></i>
        </div>

        {feedbackBanner && (
          <Alert
            type={feedbackBanner.type === 'error' ? 'error' : 'success'}
            style={{ margin: '120px 48px 24px 48px' }}
          >
            {feedbackBanner.message}
          </Alert>
        )}

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
                Student
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
                    navigate('/dashboard')
                  }}
                >
                  Dashboard
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
                id='profile-pic-upload'
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
                    : neutral.borderLight,
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
                {!profilePicture && 'JD'}
              </div>

              {/* Upload/Edit Button */}
              <label
                htmlFor='profile-pic-upload'
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
                {studentData.fullName}
              </h1>
              <div style={{ fontSize: 16, opacity: 0.9, marginBottom: 4 }}>
                {studentData.course} • {studentData.yearLevel} •{' '}
                {studentData.section}
              </div>
              <div style={{ fontSize: 15, opacity: 0.8 }}>
                Student ID: {studentData.studentId}
              </div>
            </div>
            {isAdmin() && (
              <button
                onClick={handleEditToggle}
                style={{
                  padding: '12px 32px',
                  fontSize: 16,
                  fontWeight: 600,
                  borderRadius: 8,
                  cursor: 'pointer',
                  border: 'none',
                  background: isEditing
                    ? statusColors.present.border
                    : statusColors.present.bg,
                  color: isEditing
                    ? neutral.bgSurface
                    : statusColors.present.text,
                  transition: 'background 0.2s',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}
              >
                {isEditing ? 'Save Changes' : 'Edit Profile'}
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
              borderBottom: `2px solid ${neutral.borderLight}`,
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
              onClick={() => setActiveTab('academic')}
              style={{
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: 600,
                border: 'none',
                background:
                  activeTab === 'academic' ? brand.secondary : neutral.bgMuted,
                color:
                  activeTab === 'academic'
                    ? neutral.bgSurface
                    : brand.secondary,
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              <i className='bi bi-book-fill' style={{ marginRight: 8 }}></i>
              Academic Info
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
              Contact & Emergency
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
                        Student ID
                      </div>
                      <input
                        name='studentId'
                        style={isEditing ? editableInputStyle : inputStyle}
                        readOnly={true}
                        value={studentData.studentId}
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
                        value={studentData.fullName}
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
                        value={studentData.email}
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
                        value={studentData.phone}
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
                        Date of Birth
                      </div>
                      <input
                        name='dateOfBirth'
                        type='date'
                        style={isEditing ? editableInputStyle : inputStyle}
                        readOnly={!isEditing}
                        value={studentData.dateOfBirth}
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
                        Department
                      </div>
                      <select
                        name='department'
                        style={isEditing ? editableInputStyle : inputStyle}
                        disabled={!isEditing}
                        value={studentData.department}
                        onChange={handleInputChange}
                      >
                        <option value='CITC'>CITC</option>
                        <option value='Engineering'>Engineering</option>
                        <option value='Business'>Business</option>
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
                        Home Address
                      </div>
                      <textarea
                        name='address'
                        style={
                          isEditing
                            ? {
                                ...textareaStyle,
                                border: `1px solid ${brand.secondary}`,
                                minHeight: 80
                              }
                            : { ...textareaStyle, minHeight: 80 }
                        }
                        readOnly={!isEditing}
                        value={studentData.address}
                        onChange={handleInputChange}
                        placeholder='Complete home address'
                        autoComplete='street-address'
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Academic Info Tab */}
              {activeTab === 'academic' && (
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
                    Academic Information
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
                            color: neutral.textPrimary
                          }}
                        >
                          Course / Program
                        </div>
                        <select
                          name='course'
                          style={isEditing ? editableInputStyle : inputStyle}
                          disabled={!isEditing}
                          value={studentData.course}
                          onChange={handleInputChange}
                        >
                          <option value='BSIT'>
                            BS Information Technology
                          </option>
                          <option value='BSCS'>BS Computer Science</option>
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
                          Year Level
                        </div>
                        <select
                          name='yearLevel'
                          style={isEditing ? editableInputStyle : inputStyle}
                          disabled={!isEditing}
                          value={studentData.yearLevel}
                          onChange={handleInputChange}
                        >
                          <option value='1st Year'>1st Year</option>
                          <option value='2nd Year'>2nd Year</option>
                          <option value='3rd Year'>3rd Year</option>
                          <option value='4th Year'>4th Year</option>
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
                          Section
                        </div>
                        <input
                          name='section'
                          style={isEditing ? editableInputStyle : inputStyle}
                          readOnly={!isEditing}
                          value={studentData.section}
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
                          Semester
                        </div>
                        <select
                          name='semester'
                          style={isEditing ? editableInputStyle : inputStyle}
                          disabled={!isEditing}
                          value={studentData.semester}
                          onChange={handleInputChange}
                        >
                          <option value='2nd Semester'>2nd Semester</option>
                        </select>
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
                        Enrolled Subjects
                      </h4>
                      <div
                        style={{
                          border: `1px solid ${neutral.borderLight}`,
                          borderRadius: 8,
                          maxHeight: 250,
                          overflow: 'auto',
                          background: neutral.bgMuted
                        }}
                      >
                        {enrolledSubjects.length === 0 && (
                          <div
                            style={{
                              padding: '14px 16px',
                              color: neutral.textMuted,
                              fontStyle: 'italic'
                            }}
                          >
                            No enrolled subjects found.
                          </div>
                        )}
                        {enrolledSubjects.map((subject, index) => (
                          <div
                            key={subject.id || index}
                            style={{
                              padding: '14px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              borderBottom:
                                index < enrolledSubjects.length - 1
                                  ? `1px solid ${neutral.borderLight}`
                                  : 'none',
                              background: neutral.bgSurface
                            }}
                          >
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: statusColors.host.bg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: interactive.primary,
                                fontWeight: 700,
                                fontSize: 14
                              }}
                            >
                              {index + 1}
                            </div>
                            <span
                              style={{
                                color: neutral.textPrimary,
                                flex: 1,
                                fontWeight: 500
                              }}
                            >
                              {subject.code
                                ? `${subject.code} - ${subject.name}`
                                : subject.name}
                              {subject.section ? ` • ${subject.section}` : ''}
                            </span>
                            <span
                              style={{
                                padding: '4px 12px',
                                background: statusColors.present.bg,
                                color: statusColors.present.text,
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: 600
                              }}
                            >
                              Enrolled
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Contact & Emergency Tab */}
              {activeTab === 'contact' && (
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
                      Contact & Emergency Information
                    </h3>
                    <button
                      onClick={handleContactEditToggle}
                      style={{
                        padding: '10px 20px',
                        borderRadius: 8,
                        border: 'none',
                        background: isEditingContact
                          ? statusColors.present.border
                          : brand.secondary,
                        color: neutral.bgSurface,
                        fontWeight: 600,
                        fontSize: 14,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <i
                        className={`bi ${
                          isEditingContact
                            ? 'bi-check-circle'
                            : 'bi-pencil-fill'
                        }`}
                      ></i>
                      {isEditingContact
                        ? isSavingContact
                          ? 'Saving...'
                          : 'Save Changes'
                        : 'Edit Contact Info'}
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
                      <h4
                        style={{
                          fontWeight: 600,
                          fontSize: 18,
                          color: brand.secondary,
                          marginBottom: 16
                        }}
                      >
                        Contact Information
                      </h4>
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
                            <i
                              className='bi bi-envelope-fill'
                              style={{ marginRight: 8, color: brand.secondary }}
                            ></i>
                            Email Address
                          </div>
                          <input
                            name='email'
                            type='email'
                            style={
                              isEditingContact ? editableInputStyle : inputStyle
                            }
                            readOnly={!isEditingContact}
                            value={studentData.email}
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
                            <i
                              className='bi bi-telephone-fill'
                              style={{ marginRight: 8, color: brand.secondary }}
                            ></i>
                            Phone Number
                          </div>
                          <input
                            name='phone'
                            type='tel'
                            style={
                              isEditingContact ? editableInputStyle : inputStyle
                            }
                            readOnly={!isEditingContact}
                            value={studentData.phone}
                            onChange={handleInputChange}
                            autoComplete='tel'
                          />
                        </div>
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
                        Emergency Contact
                      </h4>
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
                            Contact Name
                          </div>
                          <input
                            name='emergencyContact'
                            style={
                              isEditingContact ? editableInputStyle : inputStyle
                            }
                            readOnly={!isEditingContact}
                            value={studentData.emergencyContact}
                            onChange={handleInputChange}
                            placeholder='Emergency contact person'
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
                            Contact Phone
                          </div>
                          <input
                            name='emergencyPhone'
                            type='tel'
                            style={
                              isEditingContact ? editableInputStyle : inputStyle
                            }
                            readOnly={!isEditingContact}
                            value={studentData.emergencyPhone}
                            onChange={handleInputChange}
                            placeholder='Emergency phone number'
                            autoComplete='tel'
                          />
                        </div>
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
                        Parent / Guardian Information
                      </h4>
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
                            Guardian Name
                          </div>
                          <input
                            name='guardianName'
                            style={
                              isEditingContact ? editableInputStyle : inputStyle
                            }
                            readOnly={!isEditingContact}
                            value={studentData.guardianName}
                            onChange={handleInputChange}
                            placeholder='Parent or guardian name'
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
                            Relationship
                          </div>
                          <select
                            name='guardianRelation'
                            style={
                              isEditingContact ? editableInputStyle : inputStyle
                            }
                            disabled={!isEditingContact}
                            value={studentData.guardianRelation}
                            onChange={handleInputChange}
                          >
                            <option value='Mother'>Mother</option>
                            <option value='Father'>Father</option>
                            <option value='Guardian'>Guardian</option>
                            <option value='Other'>Other</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        background: statusColors.late.bg,
                        padding: 20,
                        borderRadius: 12,
                        border: `1px solid ${statusColors.late.border}`
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
                          className='bi bi-exclamation-triangle-fill'
                          style={{
                            color: statusColors.late.text,
                            fontSize: 20,
                            marginTop: 2
                          }}
                        ></i>
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              color: statusColors.late.text,
                              marginBottom: 4
                            }}
                          >
                            Emergency Contact Information
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              color: statusColors.late.text,
                              lineHeight: 1.6
                            }}
                          >
                            This information will be used in case of
                            emergencies. Please ensure all contact details are
                            accurate and up-to-date.
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
                      color: brand.secondary,
                      marginBottom: 24
                    }}
                  >
                    Account Settings
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
                          color: brand.secondary,
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
                            background: neutral.bgMuted,
                            borderRadius: 8,
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type='checkbox'
                            checked={studentData.notifications.emailAlerts}
                            onChange={() =>
                              handleNotificationChange('emailAlerts')
                            }
                            style={{ width: 18, height: 18, cursor: 'pointer' }}
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
                              style={{ fontSize: 13, color: neutral.textMuted }}
                            >
                              Receive email notifications for important updates
                            </div>
                          </div>
                        </label>

                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '14px 16px',
                            background: neutral.bgMuted,
                            borderRadius: 8,
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type='checkbox'
                            checked={
                              studentData.notifications.attendanceReminders
                            }
                            onChange={() =>
                              handleNotificationChange('attendanceReminders')
                            }
                            style={{ width: 18, height: 18, cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                color: neutral.textPrimary,
                                fontSize: 15
                              }}
                            >
                              Attendance Reminders
                            </div>
                            <div
                              style={{ fontSize: 13, color: neutral.textMuted }}
                            >
                              Get notified before class schedules
                            </div>
                          </div>
                        </label>

                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '14px 16px',
                            background: neutral.bgMuted,
                            borderRadius: 8,
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type='checkbox'
                            checked={studentData.notifications.gradeUpdates}
                            onChange={() =>
                              handleNotificationChange('gradeUpdates')
                            }
                            style={{ width: 18, height: 18, cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                color: neutral.textPrimary,
                                fontSize: 15
                              }}
                            >
                              Grade Updates
                            </div>
                            <div
                              style={{ fontSize: 13, color: neutral.textMuted }}
                            >
                              Notifications when grades are posted
                            </div>
                          </div>
                        </label>

                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '14px 16px',
                            background: neutral.bgMuted,
                            borderRadius: 8,
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type='checkbox'
                            checked={
                              studentData.notifications.announcementAlerts
                            }
                            onChange={() =>
                              handleNotificationChange('announcementAlerts')
                            }
                            style={{ width: 18, height: 18, cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 600,
                                color: neutral.textPrimary,
                                fontSize: 15
                              }}
                            >
                              Announcement Alerts
                            </div>
                            <div
                              style={{ fontSize: 13, color: neutral.textMuted }}
                            >
                              Instructor announcements and updates
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
                    style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
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
            </div>

            {/* Right Side - Performance Card */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  background: neutral.bgSurface,
                  borderRadius: 16,
                  boxShadow: '0 4px 24px rgba(44,44,84,0.10)',
                  padding: '32px',
                  position: 'sticky',
                  top: 20
                }}
              >
                <h3
                  style={{
                    fontWeight: 700,
                    fontSize: 20,
                    marginBottom: 20,
                    color: brand.primary
                  }}
                >
                  Your Attendance Performance
                </h3>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 24
                  }}
                >
                  <PieChart data={attendanceSummary} />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      width: '100%'
                    }}
                  >
                    {attendanceSummary.map((item, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 14px',
                          background: neutral.bgMuted,
                          borderRadius: 8
                        }}
                      >
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            background: item.color
                          }}
                        ></span>
                        <span
                          style={{
                            fontWeight: 600,
                            color: neutral.textPrimary,
                            fontSize: 15,
                            flex: 1
                          }}
                        >
                          {item.label}
                        </span>
                        <span
                          style={{
                            color: neutral.textPrimary,
                            fontSize: 16,
                            fontWeight: 700
                          }}
                        >
                          {item.value}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
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

export default StudentProfile
