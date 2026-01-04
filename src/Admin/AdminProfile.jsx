import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 2: CSS classes for theme-aware styling
import '../styles/profiles.css'
import '../styles/common.css'
import { logout, getCurrentUser, dispatchUserUpdateEvent } from '../utils/auth'
import { apiGet, apiPut } from '../utils/api'
import {
  brand,
  neutral,
  status as statusColors,
  interactive
} from '../utils/colors'
import { Alert } from '../components/ui'
import StatusBanner from '../components/StatusBanner'

const defaultAdminNotifications = {
  emailAlerts: true,
  systemAlerts: true,
  userRegistrations: true,
  criticalIssues: true
}

const initialAdminData = {
  adminId: '',
  firstName: '',
  lastName: '',
  fullName: '',
  email: '',
  phone: '',
  role: '',
  department: '',
  officeLocation: '',
  dateHired: '',
  bio: '',
  linkedin: '',
  username: '',
  lastLogin: '',
  profilePicture: null,
  imageScale: 1,
  notifications: { ...defaultAdminNotifications },
  _id: ''
}

const AdminProfile = () => {
  const navigate = useNavigate()
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState('personal')
  const [profilePicture, setProfilePicture] = useState(null)
  const [imageScale, setImageScale] = useState(1)
  const [showImageModal, setShowImageModal] = useState(false)
  const [tempImage, setTempImage] = useState(null)
  const [tempScale, setTempScale] = useState(1)
  const [adminData, setAdminData] = useState(initialAdminData)
  const [activityLog, setActivityLog] = useState([])
  const [systemStats, setSystemStats] = useState({
    totalUsers: 0,
    activeInstructors: 0,
    activeStudents: 0,
    totalGroups: 0,
    activeSessions: 0,
    systemUptime: '—'
  })
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())
  const [profileLoading, setProfileLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [feedbackBanner, setFeedbackBanner] = useState(null)
  const [systemStatsLoading, setSystemStatsLoading] = useState(true)
  const [systemStatsError, setSystemStatsError] = useState('')

  useEffect(() => {
    if (!feedbackBanner) return
    const timeout = setTimeout(() => setFeedbackBanner(null), 5000)
    return () => clearTimeout(timeout)
  }, [feedbackBanner])

  const pushFeedback = (type, message) => {
    if (!message) return
    setFeedbackBanner({ type, message, id: Date.now() })
  }

  const renderStatValue = value => {
    if (systemStatsLoading) return '...'
    if (systemStatsError) return '—'
    // Handle numeric values - ensure they're valid numbers and convert to string
    if (typeof value === 'number') {
      return isNaN(value) || !isFinite(value) ? '0' : String(value)
    }
    // Handle string values (like systemUptime)
    return value != null ? String(value) : '—'
  }

  const canEditProfile = useMemo(() => {
    if (!currentUser || !adminData._id) {
      return false
    }
    return currentUser._id === adminData._id
  }, [currentUser, adminData._id])

  const applyAdminResponse = (user = {}) => {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim()
    setAdminData({
      adminId: user.employeeId || user.studentId || user._id || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      fullName,
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'admin',
      department: user.department || '',
      officeLocation: user.officeLocation || '',
      dateHired:
        user.dateHired ||
        (user.createdAt
          ? new Date(user.createdAt).toISOString().split('T')[0]
          : ''),
      bio: user.bio || '',
      linkedin: user.linkedin || '',
      username: user.username || user.email || '',
      lastLogin: user.lastLogin || user.updatedAt || '',
      profilePicture: user.profilePicture || null,
      imageScale:
        typeof user.imageScale === 'number' &&
        isFinite(user.imageScale) &&
        user.imageScale > 0
          ? user.imageScale
          : 1,
      notifications: {
        ...defaultAdminNotifications,
        ...(user.notifications || {})
      },
      _id: user._id
    })
    setProfilePicture(user.profilePicture || null)
    const validImageScale =
      typeof user.imageScale === 'number' &&
      isFinite(user.imageScale) &&
      user.imageScale > 0
        ? user.imageScale
        : 1
    setImageScale(validImageScale)
  }

  const buildAdminPayload = (overrides = {}) => {
    const source = {
      ...adminData,
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
      officeLocation: source.officeLocation,
      bio: source.bio,
      profilePicture: source.profilePicture,
      imageScale: source.imageScale,
      notifications: source.notifications,
      linkedin: source.linkedin
    }
    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined)
    )
  }

  const saveAdminProfile = async (
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
      const payload = buildAdminPayload(overrides)
      const response = await apiPut(`users/${currentUser._id}`, payload)
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(
          result.error || result.message || 'Failed to update profile'
        )
      }
      applyAdminResponse(result.data)
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
   * Derive activity log from user metadata
   * NOTE: Activity logs are derived from user timestamps (createdAt, updatedAt) only.
   * This is a limited view - it does not include:
   * - System administration actions
   * - User management operations
   * - Group management activities
   * - Other administrative interactions
   * For a complete activity log, a dedicated activity tracking system would be needed.
   */
  const deriveActivityLog = (user = {}) => {
    const logs = []
    if (user.updatedAt) {
      logs.push({
        date: user.updatedAt,
        action: 'Profile updated',
        details: `Department: ${user.department || 'N/A'}`
      })
    }
    if (user.createdAt) {
      logs.push({
        date: user.createdAt,
        action: 'Account created',
        details: `Role: ${user.role || 'admin'}`
      })
    }
    return logs
  }

  const fetchAdminProfile = useCallback(async userId => {
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
      applyAdminResponse(result.data)
      setActivityLog(deriveActivityLog(result.data))
      // Update localStorage and currentUser state to keep all components in sync
      setCurrentUser(result.data)
      dispatchUserUpdateEvent(result.data)
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  const fetchSystemMetrics = async () => {
    setSystemStatsLoading(true)
    setSystemStatsError('')
    try {
      const [usersRes, groupsRes, attendanceRes] = await Promise.all([
        apiGet('users'),
        apiGet('groups'),
        apiGet('attendance/recent?limit=200')
      ])
      const usersJson = await usersRes.json()
      const groupsJson = await groupsRes.json()
      const attendanceJson = await attendanceRes.json()
      if (!usersRes.ok || !usersJson.success) {
        throw new Error(
          usersJson.error || usersJson.message || 'Failed to load users'
        )
      }
      const users = usersJson.data || []
      const groups =
        groupsRes.ok && groupsJson.success ? groupsJson.data || [] : []
      const attendance =
        attendanceRes.ok && attendanceJson.success
          ? attendanceJson.data || []
          : []
      const activeInstructors = users.filter(
        user => user.role === 'instructor' && user.active !== false
      ).length
      const activeStudents = users.filter(
        user => user.role === 'student' && user.active !== false
      ).length
      const uniqueSessions = new Set(
        attendance
          .map(record => record.sessionId || record.meetCode)
          .filter(Boolean)
      )
      setSystemStats({
        totalUsers: users.length,
        activeInstructors,
        activeStudents,
        totalGroups: groups.length,
        activeSessions: uniqueSessions.size,
        systemUptime: '99.9%'
      })
    } catch (error) {
      console.error('Error fetching system stats:', error)
      setSystemStatsError(error.message)
    } finally {
      setSystemStatsLoading(false)
    }
  }

  useEffect(() => {
    const user = getCurrentUser()
    setCurrentUser(user)
    if (!user?._id) {
      setProfileLoading(false)
      setErrorMessage('User not authenticated')
      return
    }
    fetchAdminProfile(user._id)
    fetchSystemMetrics()
  }, [fetchAdminProfile])

  const handleInputChange = e => {
    const { name, value } = e.target
    setAdminData(prevData => {
      const updated = {
        ...prevData,
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
    const previousValue = adminData.notifications[key]
    const updatedNotifications = {
      ...adminData.notifications,
      [key]: !previousValue
    }
    setAdminData(prev => ({
      ...prev,
      notifications: updatedNotifications
    }))
    try {
      await saveAdminProfile(
        { notifications: updatedNotifications },
        { setSavingState: () => {}, successMessage: '' }
      )
    } catch (error) {
      setAdminData(prev => ({
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
        await saveAdminProfile()
        setIsEditing(false)
      } catch {
        // keep editing mode active for corrections
      }
    } else {
      setIsEditing(true)
    }
  }

  // Legacy localStorage hydration removed in favor of API-driven data

  const handleLogout = () => {
    setIsDropdownOpen(false)
    logout(navigate)
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
    setAdminData(prev => ({
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
        {/* Loading Overlay */}
        {profileLoading && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(255,255,255,0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <i
                className='bi bi-arrow-repeat'
                style={{
                  fontSize: 48,
                  color: brand.secondary,
                  animation: 'spin 1s linear infinite'
                }}
              ></i>
              <p
                style={{
                  color: brand.secondary,
                  marginTop: 16,
                  fontWeight: 600
                }}
              >
                Loading profile...
              </p>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && !profileLoading && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 100,
              maxWidth: 480,
              width: '100%'
            }}
          >
            <StatusBanner
              variant='error'
              title='Profile Error'
              message={errorMessage}
              onClose={() => setErrorMessage('')}
            />
          </div>
        )}

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
          onClick={() => navigate('/admin-dashboard')}
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
                ADMIN
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
                    navigate('/admin-dashboard')
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
          style={{
            background: `linear-gradient(135deg, ${brand.secondary} 0%, ${brand.primary} 100%)`,
            padding: '48px 48px 32px 48px',
            color: neutral.bgSurface,
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
                id='admin-profile-pic-upload'
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
                {!profilePicture &&
                  (() => {
                    const firstInitial =
                      adminData.firstName && adminData.firstName.length > 0
                        ? adminData.firstName[0]
                        : ''
                    const lastInitial =
                      adminData.lastName && adminData.lastName.length > 0
                        ? adminData.lastName[0]
                        : ''
                    return firstInitial + lastInitial || ''
                  })()}
              </div>

              {/* Upload/Edit Button */}
              <label
                htmlFor='admin-profile-pic-upload'
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
                  marginBottom: 8,
                  color: neutral.textOnDark
                }}
              >
                {adminData.fullName}
              </h1>
              <div style={{ fontSize: 16, opacity: 0.9, marginBottom: 4 }}>
                {adminData.role} • {adminData.department}
              </div>
              <div style={{ fontSize: 15, opacity: 0.8 }}>
                Admin ID: {adminData.adminId}
              </div>
            </div>
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
                  ? statusColors.present.border
                  : interactive.success,
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
              borderBottom: '2px solid ${neutral.borderLight}',
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
              onClick={() => setActiveTab('office')}
              style={{
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: 600,
                border: 'none',
                background:
                  activeTab === 'office' ? brand.secondary : neutral.bgMuted,
                color:
                  activeTab === 'office' ? neutral.bgSurface : brand.secondary,
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              <i className='bi bi-building-fill' style={{ marginRight: 8 }}></i>
              Office & Contact
            </button>
            <button
              onClick={() => setActiveTab('account')}
              style={{
                padding: '12px 24px',
                fontSize: 15,
                fontWeight: 600,
                border: 'none',
                background:
                  activeTab === 'account' ? brand.secondary : neutral.bgMuted,
                color:
                  activeTab === 'account' ? neutral.bgSurface : brand.secondary,
                cursor: 'pointer',
                borderRadius: '8px 8px 0 0',
                transition: 'all 0.2s'
              }}
            >
              <i className='bi bi-shield-fill' style={{ marginRight: 8 }}></i>
              Account
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
                      <label
                        htmlFor='adminId'
                        style={{
                          fontWeight: 600,
                          fontSize: 16,
                          marginBottom: 8,
                          color: neutral.textPrimary
                        }}
                      >
                        Admin ID
                      </label>
                      <input
                        id='adminId'
                        name='adminId'
                        style={inputStyle}
                        readOnly={true}
                        value={adminData.adminId}
                        autoComplete='off'
                      />
                    </div>

                    <div>
                      <label
                        htmlFor='role'
                        style={{
                          fontWeight: 600,
                          fontSize: 16,
                          marginBottom: 8,
                          color: neutral.textPrimary
                        }}
                      >
                        Role / Title
                      </label>
                      <select
                        id='role'
                        name='role'
                        style={isEditing ? editableInputStyle : inputStyle}
                        disabled={!isEditing}
                        value={adminData.role}
                        onChange={handleInputChange}
                        autoComplete='organization-title'
                      >
                        <option value='System Administrator'>
                          System Administrator
                        </option>
                        <option value='Senior Administrator'>
                          Senior Administrator
                        </option>
                        <option value='Administrator'>Administrator</option>
                        <option value='Assistant Administrator'>
                          Assistant Administrator
                        </option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor='firstName'
                        style={{
                          fontWeight: 600,
                          fontSize: 16,
                          marginBottom: 8,
                          color: neutral.textPrimary
                        }}
                      >
                        First Name
                      </label>
                      <input
                        id='firstName'
                        name='firstName'
                        style={isEditing ? editableInputStyle : inputStyle}
                        readOnly={!isEditing}
                        value={adminData.firstName}
                        onChange={handleInputChange}
                        autoComplete='given-name'
                      />
                    </div>

                    <div>
                      <label
                        htmlFor='lastName'
                        style={{
                          fontWeight: 600,
                          fontSize: 16,
                          marginBottom: 8,
                          color: neutral.textPrimary
                        }}
                      >
                        Last Name
                      </label>
                      <input
                        id='lastName'
                        name='lastName'
                        style={isEditing ? editableInputStyle : inputStyle}
                        readOnly={!isEditing}
                        value={adminData.lastName}
                        onChange={handleInputChange}
                        autoComplete='family-name'
                      />
                    </div>

                    <div>
                      <label
                        htmlFor='email'
                        style={{
                          fontWeight: 600,
                          fontSize: 16,
                          marginBottom: 8,
                          color: neutral.textPrimary
                        }}
                      >
                        Email Address
                      </label>
                      <input
                        id='email'
                        name='email'
                        type='email'
                        style={isEditing ? editableInputStyle : inputStyle}
                        readOnly={!isEditing}
                        value={adminData.email}
                        onChange={handleInputChange}
                        autoComplete='email'
                      />
                    </div>

                    <div>
                      <label
                        htmlFor='phone'
                        style={{
                          fontWeight: 600,
                          fontSize: 16,
                          marginBottom: 8,
                          color: neutral.textPrimary
                        }}
                      >
                        Phone Number
                      </label>
                      <input
                        id='phone'
                        name='phone'
                        type='tel'
                        style={isEditing ? editableInputStyle : inputStyle}
                        readOnly={!isEditing}
                        value={adminData.phone}
                        onChange={handleInputChange}
                        autoComplete='tel'
                      />
                    </div>

                    <div>
                      <label
                        htmlFor='department'
                        style={{
                          fontWeight: 600,
                          fontSize: 16,
                          marginBottom: 8,
                          color: neutral.textPrimary
                        }}
                      >
                        Department
                      </label>
                      <select
                        id='department'
                        name='department'
                        style={isEditing ? editableInputStyle : inputStyle}
                        disabled={!isEditing}
                        value={adminData.department}
                        onChange={handleInputChange}
                        autoComplete='organization'
                      >
                        <option value='IT Administration'>
                          IT Administration
                        </option>
                        <option value='Academic Administration'>
                          Academic Administration
                        </option>
                        <option value='Student Affairs'>Student Affairs</option>
                        <option value='General Administration'>
                          General Administration
                        </option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor='dateHired'
                        style={{
                          fontWeight: 600,
                          fontSize: 16,
                          marginBottom: 8,
                          color: neutral.textPrimary
                        }}
                      >
                        Date Hired
                      </label>
                      <input
                        id='dateHired'
                        name='dateHired'
                        type='date'
                        style={isEditing ? editableInputStyle : inputStyle}
                        readOnly={!isEditing}
                        value={adminData.dateHired}
                        onChange={handleInputChange}
                        autoComplete='off'
                      />
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
                  <h3
                    style={{
                      fontWeight: 700,
                      fontSize: 22,
                      color: brand.secondary,
                      marginBottom: 24
                    }}
                  >
                    Professional Details
                  </h3>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 24
                    }}
                  >
                    <div>
                      <label
                        htmlFor='bio'
                        style={{
                          fontWeight: 600,
                          fontSize: 16,
                          marginBottom: 8,
                          color: neutral.textPrimary
                        }}
                      >
                        Professional Biography
                      </label>
                      <textarea
                        id='bio'
                        name='bio'
                        style={
                          isEditing
                            ? {
                                ...textareaStyle,
                                border: '1px solid ${brand.secondary}'
                              }
                            : textareaStyle
                        }
                        readOnly={!isEditing}
                        value={adminData.bio}
                        onChange={handleInputChange}
                        placeholder='Share your professional background and experience...'
                        autoComplete='off'
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
                          <label
                            htmlFor='linkedin'
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
                          </label>
                          <input
                            id='linkedin'
                            name='linkedin'
                            type='url'
                            style={isEditing ? editableInputStyle : inputStyle}
                            readOnly={!isEditing}
                            value={adminData.linkedin}
                            onChange={handleInputChange}
                            placeholder='https://linkedin.com/in/yourprofile'
                            autoComplete='url'
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Office & Contact Tab */}
              {activeTab === 'office' && (
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
                          <label
                            htmlFor='emailOffice'
                            style={{
                              fontWeight: 600,
                              fontSize: 16,
                              marginBottom: 8,
                              color: neutral.textPrimary
                            }}
                          >
                            <i
                              className='bi bi-envelope-fill'
                              style={{
                                marginRight: 8,
                                color: brand.secondary
                              }}
                            ></i>
                            Email Address
                          </label>
                          <input
                            id='emailOffice'
                            name='email'
                            type='email'
                            style={isEditing ? editableInputStyle : inputStyle}
                            readOnly={!isEditing}
                            value={adminData.email}
                            onChange={handleInputChange}
                            autoComplete='email'
                          />
                        </div>

                        <div>
                          <label
                            htmlFor='phoneOffice'
                            style={{
                              fontWeight: 600,
                              fontSize: 16,
                              marginBottom: 8,
                              color: neutral.textPrimary
                            }}
                          >
                            <i
                              className='bi bi-telephone-fill'
                              style={{
                                marginRight: 8,
                                color: brand.secondary
                              }}
                            ></i>
                            Phone Number
                          </label>
                          <input
                            id='phoneOffice'
                            name='phone'
                            type='tel'
                            style={isEditing ? editableInputStyle : inputStyle}
                            readOnly={!isEditing}
                            value={adminData.phone}
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
                        Office Details
                      </h4>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 20
                        }}
                      >
                        <div>
                          <label
                            htmlFor='officeLocation'
                            style={{
                              fontWeight: 600,
                              fontSize: 16,
                              marginBottom: 8,
                              color: neutral.textPrimary
                            }}
                          >
                            <i
                              className='bi bi-building-fill'
                              style={{
                                marginRight: 8,
                                color: brand.secondary
                              }}
                            ></i>
                            Office Location
                          </label>
                          <input
                            id='officeLocation'
                            name='officeLocation'
                            style={isEditing ? editableInputStyle : inputStyle}
                            readOnly={!isEditing}
                            value={adminData.officeLocation}
                            onChange={handleInputChange}
                            placeholder='Building and room number'
                            autoComplete='organization'
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
                            Contact Availability
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              color: interactive.primary,
                              lineHeight: 1.6
                            }}
                          >
                            Staff and users can see this information to reach
                            out for administrative support and inquiries.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Account Tab */}
              {activeTab === 'account' && (
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
                    Account Information
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
                        <label
                          htmlFor='username'
                          style={{
                            fontWeight: 600,
                            fontSize: 16,
                            marginBottom: 8,
                            color: neutral.textPrimary
                          }}
                        >
                          Username
                        </label>
                        <input
                          id='username'
                          name='username'
                          style={inputStyle}
                          readOnly={true}
                          value={adminData.username}
                          autoComplete='username'
                        />
                      </div>

                      <div>
                        <label
                          htmlFor='lastLogin'
                          style={{
                            fontWeight: 600,
                            fontSize: 16,
                            marginBottom: 8,
                            color: neutral.textPrimary
                          }}
                        >
                          Last Login
                        </label>
                        <input
                          id='lastLogin'
                          name='lastLogin'
                          style={inputStyle}
                          readOnly={true}
                          value={adminData.lastLogin}
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
                        Security Settings
                      </h4>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12
                        }}
                      >
                        <button
                          style={{
                            padding: '12px 20px',
                            background: neutral.bgSurface,
                            border: `1px solid ${neutral.border}`,
                            borderRadius: 8,
                            fontSize: 15,
                            fontWeight: 600,
                            color: brand.secondary,
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
                            color: brand.secondary,
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

                        <button
                          style={{
                            padding: '12px 20px',
                            background: neutral.bgSurface,
                            border: `1px solid ${neutral.border}`,
                            borderRadius: 8,
                            fontSize: 15,
                            fontWeight: 600,
                            color: brand.secondary,
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
                          <i className='bi bi-pc-display'></i>
                          View Active Sessions
                        </button>
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
                    Notification Settings
                  </h3>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 32
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
                            checked={adminData.notifications.emailAlerts}
                            onChange={() =>
                              handleNotificationChange('emailAlerts')
                            }
                            disabled={!isEditing}
                            style={{
                              width: 18,
                              height: 18,
                              cursor: isEditing ? 'pointer' : 'not-allowed'
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
                            background: neutral.bgHover,
                            borderRadius: 8,
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type='checkbox'
                            checked={adminData.notifications.systemAlerts}
                            onChange={() =>
                              handleNotificationChange('systemAlerts')
                            }
                            disabled={!isEditing}
                            style={{
                              width: 18,
                              height: 18,
                              cursor: isEditing ? 'pointer' : 'not-allowed'
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
                              System Alerts
                            </div>
                            <div
                              style={{ fontSize: 13, color: neutral.textMuted }}
                            >
                              Critical system notifications and errors
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
                            checked={adminData.notifications.userRegistrations}
                            onChange={() =>
                              handleNotificationChange('userRegistrations')
                            }
                            disabled={!isEditing}
                            style={{
                              width: 18,
                              height: 18,
                              cursor: isEditing ? 'pointer' : 'not-allowed'
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
                              User Registrations
                            </div>
                            <div
                              style={{ fontSize: 13, color: neutral.textMuted }}
                            >
                              New user account registrations and approvals
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
                            checked={adminData.notifications.criticalIssues}
                            onChange={() =>
                              handleNotificationChange('criticalIssues')
                            }
                            disabled={!isEditing}
                            style={{
                              width: 18,
                              height: 18,
                              cursor: isEditing ? 'pointer' : 'not-allowed'
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
                              Critical Issues
                            </div>
                            <div
                              style={{ fontSize: 13, color: neutral.textMuted }}
                            >
                              Immediate notifications for critical system issues
                            </div>
                          </div>
                        </label>
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
                      color: brand.secondary,
                      marginBottom: 24
                    }}
                  >
                    Recent Administrative Activity
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
                            background: statusColors.host.bg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: interactive.primary,
                            fontSize: 18,
                            flexShrink: 0
                          }}
                        >
                          <i className='bi bi-shield-check'></i>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: neutral.textPrimary,
                              marginBottom: 4
                            }}
                          >
                            {activity.type} {activity.action}
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
                              color: neutral.textSecondary
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

            {/* Right Side - System Stats Card */}
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
                    color: brand.secondary
                  }}
                >
                  System Overview
                </h3>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      background: neutral.bgMuted,
                      borderRadius: 8
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <i
                        className='bi bi-people-fill'
                        style={{ color: brand.secondary, fontSize: 18 }}
                      ></i>
                      <span
                        style={{
                          fontWeight: 600,
                          color: neutral.textPrimary,
                          fontSize: 15
                        }}
                      >
                        Total Users
                      </span>
                    </div>
                    <span
                      style={{
                        color: neutral.textPrimary,
                        fontSize: 18,
                        fontWeight: 700
                      }}
                    >
                      {renderStatValue(systemStats.totalUsers)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      background: neutral.bgMuted,
                      borderRadius: 8
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <i
                        className='bi bi-person-workspace'
                        style={{ color: brand.secondary, fontSize: 18 }}
                      ></i>
                      <span
                        style={{
                          fontWeight: 600,
                          color: neutral.textPrimary,
                          fontSize: 15
                        }}
                      >
                        Instructors
                      </span>
                    </div>
                    <span
                      style={{
                        color: neutral.textPrimary,
                        fontSize: 18,
                        fontWeight: 700
                      }}
                    >
                      {renderStatValue(systemStats.activeInstructors)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      background: neutral.bgMuted,
                      borderRadius: 8
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <i
                        className='bi bi-mortarboard-fill'
                        style={{ color: brand.secondary, fontSize: 18 }}
                      ></i>
                      <span
                        style={{
                          fontWeight: 600,
                          color: neutral.textPrimary,
                          fontSize: 15
                        }}
                      >
                        Students
                      </span>
                    </div>
                    <span
                      style={{
                        color: neutral.textPrimary,
                        fontSize: 18,
                        fontWeight: 700
                      }}
                    >
                      {renderStatValue(systemStats.activeStudents)}
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      background: neutral.bgMuted,
                      borderRadius: 8
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <i
                        className='bi bi-collection-fill'
                        style={{ color: brand.secondary, fontSize: 18 }}
                      ></i>
                      <span
                        style={{
                          fontWeight: 600,
                          color: neutral.textPrimary,
                          fontSize: 15
                        }}
                      >
                        Total Groups
                      </span>
                    </div>
                    <span
                      style={{
                        color: neutral.textPrimary,
                        fontSize: 18,
                        fontWeight: 700
                      }}
                    >
                      {renderStatValue(systemStats.totalGroups)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Profile Picture Resize Modal */}
      {showImageModal && tempImage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={handleCancelProfilePicture}
        >
          <div
            style={{
              background: neutral.bgSurface,
              borderRadius: 20,
              padding: 40,
              maxWidth: 500,
              width: '90%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3
              style={{
                margin: '0 0 24px 0',
                color: brand.secondary,
                fontSize: 22,
                fontWeight: 700,
                textAlign: 'center'
              }}
            >
              Adjust Profile Picture
            </h3>

            {/* Preview */}
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
                  backgroundImage: `url(${tempImage})`,
                  backgroundSize: `${tempScale * 100}%`,
                  backgroundPosition: 'center',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                  border: `4px solid ${neutral.bgMuted}`,
                  overflow: 'hidden'
                }}
              />
            </div>

            {/* Scale Control */}
            <div style={{ marginBottom: 32 }}>
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
                Zoom Level
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
                    border: `2px solid ${neutral.borderLight}`,
                    borderRadius: 8,
                    width: 40,
                    height: 40,
                    fontSize: 18,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: brand.secondary,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = brand.secondary
                    e.currentTarget.style.color = neutral.bgSurface
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = neutral.bgSurface
                    e.currentTarget.style.color = brand.secondary
                  }}
                >
                  <i className='bi bi-dash'></i>
                </button>
                <div
                  style={{
                    flex: 1,
                    background: neutral.borderLight,
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
                      background: `linear-gradient(90deg, ${interactive.success} 0%, ${statusColors.present.border} 100%)`,
                      transition: 'width 0.2s ease',
                      borderRadius: 4
                    }}
                  />
                </div>
                <button
                  onClick={() => setTempScale(Math.min(2, tempScale + 0.1))}
                  style={{
                    background: neutral.bgSurface,
                    border: `2px solid ${neutral.borderLight}`,
                    borderRadius: 8,
                    width: 40,
                    height: 40,
                    fontSize: 18,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: brand.secondary,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = brand.secondary
                    e.currentTarget.style.color = neutral.bgSurface
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = neutral.bgSurface
                    e.currentTarget.style.color = brand.secondary
                  }}
                >
                  <i className='bi bi-plus'></i>
                </button>
                <span
                  style={{
                    color: brand.secondary,
                    minWidth: 60,
                    textAlign: 'center',
                    fontWeight: 600
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
                  border: `2px solid ${neutral.textMuted}`,
                  background: neutral.bgSurface,
                  color: neutral.textMuted,
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = neutral.textMuted
                  e.currentTarget.style.color = neutral.bgSurface
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = neutral.bgSurface
                  e.currentTarget.style.color = neutral.textMuted
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
                  background: `linear-gradient(135deg, ${interactive.success} 0%, ${statusColors.present.border} 100%)`,
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

export default AdminProfile
