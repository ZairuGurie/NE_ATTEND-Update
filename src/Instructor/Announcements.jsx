import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import logo from '../assets/Logologin.png'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 4: CSS classes for theme-aware styling
import '../styles/common.css'
import { logout } from '../utils/auth'
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api'
import {
  brand,
  neutral,
  status as statusColors,
  interactive
} from '../utils/colors'
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

const Announcements = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingAnnouncement, setEditingAnnouncement] = useState(null)
  const [user, setUser] = useState(null)

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    priority: 'medium',
    isPinned: false,
    targetAudience: 'all',
    sections: [],
    schoolYear: '',
    yearLevel: ''
  })
  const [availableSections, setAvailableSections] = useState([])
  const [availableSchoolYears, setAvailableSchoolYears] = useState([])
  const availableYearLevels = ['1st Year', '2nd Year', '3rd Year', '4th Year']

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      fetchAnnouncements(parsedUser._id)
      fetchInstructorData(parsedUser._id)
    }
  }, [])

  const fetchInstructorData = async instructorId => {
    try {
      const response = await apiGet(`subjects/instructor/${instructorId}`)
      const data = await response.json()

      if (data.success && Array.isArray(data.data)) {
        // Extract unique sections and school years
        const sectionsSet = new Set()
        const schoolYearsSet = new Set()

        data.data.forEach(subject => {
          if (subject.sections && Array.isArray(subject.sections)) {
            subject.sections.forEach(section => {
              if (section && section.trim()) {
                sectionsSet.add(section.trim())
              }
            })
          }
          if (subject.schoolYear && subject.schoolYear.trim()) {
            schoolYearsSet.add(subject.schoolYear.trim())
          }
        })

        setAvailableSections(Array.from(sectionsSet).sort())
        setAvailableSchoolYears(Array.from(schoolYearsSet).sort())
      }
    } catch (err) {
      console.error('Error fetching instructor data:', err)
    }
  }

  const fetchAnnouncements = async instructorId => {
    try {
      setLoading(true)
      setError('') // Clear any previous errors

      const response = await apiGet(
        `communications/announcements/instructor/${instructorId}`
      )

      // Check if response is OK before parsing JSON
      if (!response.ok) {
        // Try to extract error message from response body
        let errorMessage = `Failed to fetch announcements (${response.status} ${response.statusText})`
        try {
          const errorData = await response.json()
          errorMessage = errorData.message || errorData.error || errorMessage
        } catch (parseError) {
          // If response is not JSON, use status text
          console.error('Error parsing error response:', parseError)
        }
        setError(errorMessage)
        console.error(
          `Error fetching announcements: ${response.status} ${response.statusText}`,
          errorMessage
        )
        return
      }

      const data = await response.json()

      if (data.success) {
        setAnnouncements(data.data || [])
      } else {
        const errorMsg = data.message || 'Failed to fetch announcements'
        setError(errorMsg)
        console.error('Backend returned unsuccessful response:', data)
      }
    } catch (err) {
      // Handle network errors or other exceptions
      const errorMessage =
        err.message ||
        'Failed to fetch announcements. Please check your connection.'
      console.error('Error fetching announcements:', err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async e => {
    e.preventDefault()

    if (!formData.title || !formData.content || !user) {
      setError('Please fill in all required fields')
      return
    }

    try {
      setLoading(true)
      setError('')
      setSuccess('')

      const payload = {
        ...formData,
        instructorId: user._id
      }

      const response = editingAnnouncement
        ? await apiPut(
            `communications/announcements/${editingAnnouncement._id}`,
            payload
          )
        : await apiPost('communications/announcements', payload)

      const data = await response.json()

      if (data.success) {
        setSuccess(
          editingAnnouncement ? 'Announcement updated!' : 'Announcement posted!'
        )
        setShowForm(false)
        setFormData({
          title: '',
          content: '',
          priority: 'medium',
          isPinned: false,
          targetAudience: 'all',
          sections: [],
          schoolYear: '',
          yearLevel: ''
        })
        setEditingAnnouncement(null)
        fetchAnnouncements(user._id)
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.message || 'Failed to save announcement')
      }
    } catch (err) {
      console.error('Error saving announcement:', err)
      setError('Failed to save announcement')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async id => {
    if (!window.confirm('Delete this announcement?')) return

    try {
      const response = await apiDelete(`communications/announcements/${id}`)
      const data = await response.json()

      if (data.success) {
        setSuccess('Announcement deleted!')
        fetchAnnouncements(user._id)
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError(data.message || 'Failed to delete')
      }
    } catch {
      setError('Failed to delete announcement')
    }
  }

  const handleNavigation = path => {
    if (path === '/logout') {
      logout(navigate)
    } else {
      navigate(path)
    }
  }

  const getPriorityColor = priority => {
    switch (priority) {
      case 'urgent':
        return statusColors.absent.border
      case 'high':
        return statusColors.late.border
      case 'medium':
        return interactive.primary
      default:
        return neutral.textMuted
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        background: neutral.bgMuted,
        fontFamily: 'Segoe UI, sans-serif'
      }}
    >
      <style>{`
        .section-select-dark option {
          background-color: ${brand.primary} !important;
          color: ${neutral.bgSurface} !important;
        }
        .section-select-dark option:checked {
          background-color: ${statusColors.host.border} !important;
          color: ${brand.primary} !important;
        }
        .section-select-dark option:hover {
          background-color: ${brand.accent} !important;
          color: ${neutral.bgSurface} !important;
        }
      `}</style>
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
            ANNOUNCEMENTS
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
                  <div
                    style={{
                      padding: '10px 16px',
                      fontSize: 14,
                      color: brand.secondary,
                      borderBottom: `1px solid ${neutral.borderLight}`
                    }}
                  >
                    New responses received
                  </div>
                </div>
              )}
            </div>
            <UserMenu
              user={user}
              onProfileClick={() => navigate('/I_Profile')}
              onSettingsClick={() => alert('Settings')}
            />
          </div>
        </div>

        {success && (
          <div
            style={{
              background: statusColors.present.bg,
              color: statusColors.present.text,
              padding: 12,
              borderRadius: 8,
              marginBottom: 20,
              border: `1px solid ${statusColors.present.border}`
            }}
          >
            {success}
          </div>
        )}
        {error && (
          <div
            style={{
              background: statusColors.absent.bg,
              color: statusColors.absent.text,
              padding: 12,
              borderRadius: 8,
              marginBottom: 20,
              border: `1px solid ${statusColors.absent.border}`
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => {
              setShowForm(true)
              setEditingAnnouncement(null)
              setFormData({
                title: '',
                content: '',
                priority: 'medium',
                isPinned: false,
                targetAudience: 'all',
                sections: [],
                schoolYear: '',
                yearLevel: ''
              })
            }}
            style={{
              background: interactive.success,
              color: brand.secondary,
              padding: '12px 24px',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 15
            }}
          >
            <i className='bi bi-plus-lg'></i> POST ANNOUNCEMENT
          </button>
        </div>

        {showForm && (
          <div
            style={{
              background: neutral.bgSurface,
              padding: 40,
              borderRadius: 16,
              marginBottom: 30,
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)'
            }}
          >
            <h3
              style={{
                margin: '0 0 20px 0',
                color: brand.secondary,
                fontSize: 24,
                fontWeight: 700
              }}
            >
              {editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor='announcement-title' style={labelStyle}>
                  Title *
                </label>
                <input
                  id='announcement-title'
                  value={formData.title}
                  onChange={e =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  style={inputStyle}
                  required
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor='announcement-content' style={labelStyle}>
                  Content *
                </label>
                <textarea
                  id='announcement-content'
                  value={formData.content}
                  onChange={e =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  rows={6}
                  style={inputStyle}
                  required
                />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 16,
                  marginBottom: 16
                }}
              >
                <div>
                  <label htmlFor='announcement-priority' style={labelStyle}>
                    Priority
                  </label>
                  <select
                    id='announcement-priority'
                    value={formData.priority}
                    onChange={e =>
                      setFormData({ ...formData, priority: e.target.value })
                    }
                    style={inputStyle}
                  >
                    <option value='low'>Low</option>
                    <option value='medium'>Medium</option>
                    <option value='high'>High</option>
                    <option value='urgent'>Urgent</option>
                  </select>
                </div>
                <div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      marginTop: 28
                    }}
                  >
                    <input
                      type='checkbox'
                      checked={formData.isPinned}
                      onChange={e =>
                        setFormData({ ...formData, isPinned: e.target.checked })
                      }
                      style={{ marginRight: 8 }}
                    />
                    <span style={{ color: brand.secondary, fontWeight: 600 }}>
                      Pin this announcement
                    </span>
                  </label>
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 16,
                  marginBottom: 16
                }}
              >
                <div>
                  <label htmlFor='announcement-school-year' style={labelStyle}>
                    School Year
                  </label>
                  <select
                    id='announcement-school-year'
                    value={formData.schoolYear}
                    onChange={e =>
                      setFormData({ ...formData, schoolYear: e.target.value })
                    }
                    style={inputStyle}
                  >
                    <option value=''>All School Years</option>
                    {availableSchoolYears.map(year => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor='announcement-year-level' style={labelStyle}>
                    Year Level
                  </label>
                  <select
                    id='announcement-year-level'
                    value={formData.yearLevel}
                    onChange={e =>
                      setFormData({ ...formData, yearLevel: e.target.value })
                    }
                    style={inputStyle}
                  >
                    <option value=''>All Year Levels</option>
                    {availableYearLevels.map(level => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label htmlFor='announcement-sections' style={labelStyle}>
                  Sections
                </label>
                <select
                  id='announcement-sections'
                  multiple
                  className='section-select-dark'
                  value={formData.sections}
                  onChange={e => {
                    const selected = Array.from(
                      e.target.selectedOptions,
                      option => option.value
                    )
                    setFormData({ ...formData, sections: selected })
                  }}
                  style={{
                    ...inputStyle,
                    minHeight: '100px',
                    padding: '8px',
                    backgroundColor: brand.secondary,
                    color: neutral.bgSurface,
                    border: `1px solid ${brand.secondary}`
                  }}
                  size={Math.min(availableSections.length || 1, 5)}
                >
                  {availableSections.length > 0 ? (
                    availableSections.map(section => (
                      <option key={section} value={section}>
                        {section}
                      </option>
                    ))
                  ) : (
                    <option disabled>No sections available</option>
                  )}
                </select>
                <small
                  style={{
                    color: neutral.textMuted,
                    fontSize: 12,
                    marginTop: 4,
                    display: 'block'
                  }}
                >
                  Hold Ctrl/Cmd to select multiple sections. Leave empty for all
                  sections.
                </small>
              </div>
              <div
                style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}
              >
                <button
                  type='button'
                  onClick={() => {
                    setShowForm(false)
                    setEditingAnnouncement(null)
                  }}
                  style={{
                    ...buttonStyle,
                    background: statusColors.absent.border
                  }}
                >
                  Cancel
                </button>
                <button
                  type='submit'
                  disabled={loading}
                  style={{
                    ...buttonStyle,
                    background: brand.primary,
                    opacity: loading ? 0.7 : 1
                  }}
                >
                  {loading
                    ? 'Posting...'
                    : editingAnnouncement
                    ? 'Update'
                    : 'Post'}
                </button>
              </div>
            </form>
          </div>
        )}

        {loading && !showForm ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px',
              color: brand.secondary
            }}
          >
            Loading announcements...
          </div>
        ) : announcements.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px',
              background: neutral.bgSurface,
              borderRadius: 16
            }}
          >
            <i
              className='bi bi-megaphone'
              style={{ fontSize: 64, color: neutral.border }}
            ></i>
            <h3
              style={{
                color: neutral.textMuted,
                fontSize: 20,
                margin: '16px 0 8px 0'
              }}
            >
              No Announcements
            </h3>
            <p style={{ color: neutral.textSecondary }}>
              Post your first announcement to get started
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 20 }}>
            {announcements.map(announcement => (
              <div
                key={announcement._id}
                style={{
                  background: neutral.bgSurface,
                  borderRadius: 16,
                  padding: 24,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                  borderLeft: `4px solid ${getPriorityColor(
                    announcement.priority
                  )}`
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 12
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 8
                      }}
                    >
                      {announcement.isPinned && (
                        <i
                          className='bi bi-pin-fill'
                          style={{ color: statusColors.late.border }}
                        ></i>
                      )}
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 22,
                          fontWeight: 700,
                          color: brand.secondary
                        }}
                      >
                        {announcement.title}
                      </h3>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: 12,
                          background: interactive.primaryLight,
                          color: getPriorityColor(announcement.priority),
                          fontSize: 12,
                          fontWeight: 600,
                          textTransform: 'uppercase'
                        }}
                      >
                        {announcement.priority}
                      </span>
                    </div>
                    <p
                      style={{
                        color: neutral.textMuted,
                        fontSize: 15,
                        lineHeight: 1.6,
                        margin: '12px 0'
                      }}
                    >
                      {announcement.content}
                    </p>
                    {(announcement.sections &&
                      announcement.sections.length > 0) ||
                    announcement.schoolYear ||
                    announcement.yearLevel ? (
                      <div
                        style={{
                          display: 'flex',
                          gap: 12,
                          marginTop: 12,
                          flexWrap: 'wrap'
                        }}
                      >
                        {announcement.schoolYear && (
                          <span
                            style={{
                              padding: '4px 12px',
                              borderRadius: 12,
                              background: neutral.bgHover,
                              color: brand.secondary,
                              fontSize: 12,
                              fontWeight: 600
                            }}
                          >
                            <i
                              className='bi bi-calendar-event'
                              style={{ marginRight: 4 }}
                            ></i>
                            {announcement.schoolYear}
                          </span>
                        )}
                        {announcement.yearLevel && (
                          <span
                            style={{
                              padding: '4px 12px',
                              borderRadius: 12,
                              background: interactive.primaryLight,
                              color: interactive.primary,
                              fontSize: 12,
                              fontWeight: 600
                            }}
                          >
                            <i
                              className='bi bi-bar-chart-steps'
                              style={{ marginRight: 4 }}
                            ></i>
                            Year Level: {announcement.yearLevel}
                          </span>
                        )}
                        {announcement.sections &&
                          announcement.sections.length > 0 && (
                            <span
                              style={{
                                padding: '4px 12px',
                                borderRadius: 12,
                                background: statusColors.present.bg,
                                color: statusColors.present.text,
                                fontSize: 12,
                                fontWeight: 600
                              }}
                            >
                              <i
                                className='bi bi-people'
                                style={{ marginRight: 4 }}
                              ></i>
                              {announcement.sections.length === 1
                                ? 'Section'
                                : 'Sections'}
                              : {announcement.sections.join(', ')}
                            </span>
                          )}
                      </div>
                    ) : null}
                    <div
                      style={{
                        fontSize: 13,
                        color: neutral.textSecondary,
                        marginTop: 12
                      }}
                    >
                      Posted:{' '}
                      {new Date(announcement.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => {
                        setEditingAnnouncement(announcement)
                        setFormData({
                          title: announcement.title,
                          content: announcement.content,
                          priority: announcement.priority,
                          isPinned: announcement.isPinned,
                          targetAudience: announcement.targetAudience || 'all',
                          sections: announcement.sections || [],
                          schoolYear: announcement.schoolYear || '',
                          yearLevel: announcement.yearLevel || ''
                        })
                        setShowForm(true)
                      }}
                      style={{
                        padding: '8px 12px',
                        background: statusColors.host.border,
                        color: brand.secondary,
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer'
                      }}
                    >
                      <i className='bi bi-pencil'></i>
                    </button>
                    <button
                      onClick={() => handleDelete(announcement._id)}
                      style={{
                        padding: '8px 12px',
                        background: statusColors.absent.border,
                        color: neutral.bgSurface,
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer'
                      }}
                    >
                      <i className='bi bi-trash'></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
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

const labelStyle = {
  display: 'block',
  marginBottom: 8,
  color: brand.secondary,
  fontWeight: 600,
  fontSize: 14
}
const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  border: `1px solid ${neutral.border}`,
  borderRadius: 8,
  fontSize: 15,
  color: neutral.textPrimary,
  backgroundColor: neutral.bgSurface,
  outline: 'none'
}
const buttonStyle = {
  padding: '12px 24px',
  border: 'none',
  borderRadius: 8,
  fontSize: 15,
  fontWeight: 600,
  color: neutral.bgSurface,
  cursor: 'pointer'
}

export default Announcements
