import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import logo from '../assets/Logologin.png'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 4: CSS classes for theme-aware styling
import '../styles/common.css'
import { logout } from '../utils/auth'
import { apiGet, apiPost, apiDelete } from '../utils/api'
import { brand, neutral, status as statusColors } from '../utils/colors'
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

const Notes = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [showNotifications, setShowNotifications] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [expandedNoteIndex, setExpandedNoteIndex] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [notes, setNotes] = useState([])
  const [formData, setFormData] = useState({
    topic: '',
    description: '',
    subject: ''
  })

  // Get user info from localStorage
  const [_user, setUser] = useState(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
    fetchNotes()
  }, [])

  const fetchNotes = async () => {
    try {
      setLoading(true)
      setError('') // Clear previous errors

      const response = await apiGet('notes')
      const result = await response.json()

      if (response.ok && result.success) {
        console.log('Notes fetched successfully:', result)
        setNotes(result.data || [])
      } else {
        console.error('Notes API error:', result)
        setError(result.message || result.error || 'Failed to fetch notes')
      }
    } catch (err) {
      console.error('Error fetching notes:', err)
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = e => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
  }

  const handleAddNote = async () => {
    const { topic, description, subject } = formData
    if (!topic || !description || !subject) {
      setError('Please fill in Topic, Description, and Subject.')
      return
    }

    try {
      setLoading(true)
      setError('')
      const response = await apiPost('notes', formData)
      const result = await response.json()

      if (response.ok && result.success) {
        setNotes([result.data, ...notes])
        setFormData({ topic: '', description: '', subject: '' })
        setShowForm(false)
      } else {
        setError(result.message || result.error || 'Failed to create note')
      }
    } catch (err) {
      setError('Error creating note')
      console.error('Error creating note:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteNote = async noteId => {
    try {
      setLoading(true)
      const response = await apiDelete(`notes/${noteId}`)
      const result = await response.json()

      if (response.ok && result.success) {
        setNotes(notes.filter(note => note._id !== noteId))
      } else {
        setError(result.message || result.error || 'Failed to delete note')
      }
    } catch (err) {
      setError('Error deleting note')
      console.error('Error deleting note:', err)
    } finally {
      setLoading(false)
    }
  }

  const toggleNoteExpansion = index => {
    setExpandedNoteIndex(expandedNoteIndex === index ? null : index)
  }

  const notificationItems = [
    'New assignment added in IT Elective.',
    'Attendance marked successfully.',
    'Reminder: Meeting today at 3PM.'
  ]

  const formatDate = rawDate =>
    new Date(rawDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

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
        background: neutral.bgMuted,
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
            NOTES
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
                    <div key={idx} style={notificationItemStyle}>
                      {note}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <UserMenu
              user={_user}
              onProfileClick={() => navigate('/I_Profile')}
              onSettingsClick={() => alert('Settings')}
            />
          </div>
        </div>

        {/* Add Note Button */}
        <div
          style={{
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'flex-end'
          }}
        >
          <button
            onClick={() => setShowForm(true)}
            style={{
              background: brand.primary,
              color: neutral.bgSurface,
              padding: '12px 24px',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 15,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(32,27,81,0.3)'
            }}
          >
            ADD NOTE <i className='bi bi-plus-lg'></i>
          </button>
        </div>

        {/* Error Display */}
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

        {/* Form */}
        {showForm && (
          <div
            style={{
              background: neutral.bgSurface,
              padding: 40,
              borderRadius: 16,
              marginBottom: 30,
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
            }}
          >
            <h3
              style={{
                margin: '0 0 20px 0',
                color: neutral.textPrimary,
                fontSize: 20,
                fontWeight: 700
              }}
            >
              Add New Note
            </h3>
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor='note-topic'
                style={{
                  display: 'block',
                  marginBottom: 8,
                  color: neutral.textPrimary,
                  fontWeight: 600,
                  fontSize: 14
                }}
              >
                Topic
              </label>
              <input
                id='note-topic'
                name='topic'
                value={formData.topic}
                onChange={handleInputChange}
                placeholder='Enter topic'
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor='note-description'
                style={{
                  display: 'block',
                  marginBottom: 8,
                  color: neutral.textPrimary,
                  fontWeight: 600,
                  fontSize: 14
                }}
              >
                Description
              </label>
              <textarea
                id='note-description'
                name='description'
                value={formData.description}
                onChange={handleInputChange}
                placeholder='Enter description'
                rows={3}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label
                htmlFor='note-subject'
                style={{
                  display: 'block',
                  marginBottom: 8,
                  color: neutral.textPrimary,
                  fontWeight: 600,
                  fontSize: 14
                }}
              >
                Subject
              </label>
              <input
                id='note-subject'
                name='subject'
                value={formData.subject}
                onChange={handleInputChange}
                placeholder='Enter subject'
                style={inputStyle}
              />
            </div>
            <div
              style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}
            >
              <button
                onClick={() => setShowForm(false)}
                style={{
                  ...buttonStyle,
                  background: statusColors.absent.border
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddNote}
                disabled={loading}
                style={{
                  ...buttonStyle,
                  background: brand.primary,
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Notes Grid */}
        {loading ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px',
              color: brand.secondary
            }}
          >
            <i
              className='bi bi-hourglass-split'
              style={{ fontSize: 24, marginRight: 8 }}
            ></i>
            Loading notes...
          </div>
        ) : notes.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px',
              color: neutral.textMuted
            }}
          >
            <i
              className='bi bi-journal-text'
              style={{ fontSize: 48, marginBottom: 16, color: neutral.border }}
            ></i>
            <p style={{ fontSize: 18, margin: 0 }}>No notes yet</p>
            <p
              style={{
                fontSize: 14,
                margin: '8px 0 0 0',
                color: neutral.textSecondary
              }}
            >
              Click "ADD NOTE" to create your first note
            </p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 40
            }}
          >
            {notes.map((note, idx) => (
              <div
                key={note._id || idx}
                onClick={() => toggleNoteExpansion(idx)}
                style={{
                  background: brand.secondary,
                  borderRadius: 16,
                  overflow: 'hidden',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                  ':hover': { transform: 'translateY(-4px)' }
                }}
              >
                <div style={{ padding: '20px', color: neutral.bgSurface }}>
                  <h3 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>
                    {note.topic}
                  </h3>
                  {expandedNoteIndex === idx && (
                    <p
                      style={{
                        margin: '12px 0 0 0',
                        fontSize: 15,
                        lineHeight: 1.5
                      }}
                    >
                      {note.description}
                    </p>
                  )}
                </div>
                <div
                  style={{
                    background: statusColors.host.border,
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {note.subject}
                  </span>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: brand.secondary,
                        fontWeight: 600
                      }}
                    >
                      {formatDate(note.date)}
                    </span>
                    <i
                      className='bi bi-trash'
                      onClick={e => {
                        e.stopPropagation()
                        handleDeleteNote(note._id)
                      }}
                      style={{
                        cursor: 'pointer',
                        color: brand.secondary,
                        fontSize: 18
                      }}
                    />
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

// Styles
const _notificationDropdownStyle = {
  position: 'absolute',
  right: 0,
  top: '130%',
  background: neutral.bgSurface,
  border: `1px solid ${neutral.border}`,
  borderRadius: 10,
  boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
  zIndex: 100,
  minWidth: 250
}

const notificationItemStyle = {
  padding: '10px 16px',
  fontSize: 14,
  color: brand.secondary,
  borderBottom: `1px solid ${neutral.borderLight}`
}

const _profileImageStyle = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  objectFit: 'cover'
}

const _profileButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 16px',
  border: `1px solid ${neutral.border}`,
  borderRadius: 20,
  background: brand.primary,
  cursor: 'pointer',
  fontWeight: 700,
  fontSize: 16,
  minWidth: 100,
  color: neutral.bgSurface
}

const _dropdownContainerStyle = {
  position: 'absolute',
  top: '100%',
  right: 0,
  background: neutral.bgSurface,
  border: `1px solid ${neutral.border}`,
  borderRadius: 10,
  boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
  zIndex: 99,
  minWidth: 180
}

const _formContainerStyle = {
  background: neutral.bgSurface,
  padding: 40,
  borderRadius: 16,
  marginBottom: 30,
  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
  border: `1px solid ${neutral.border}`
}

const _labelStyle = {
  display: 'block',
  marginBottom: 8,
  color: neutral.textPrimary,
  fontWeight: 600,
  fontSize: 14
}

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  border: `1px solid ${neutral.border}`,
  borderRadius: 8,
  fontSize: 16,
  color: neutral.textPrimary,
  backgroundColor: neutral.bgSurface,
  outline: 'none',
  transition: 'border-color 0.2s ease'
}

const buttonStyle = {
  padding: '12px 24px',
  border: 'none',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 600,
  color: neutral.bgSurface,
  cursor: 'pointer',
  transition: 'opacity 0.2s ease'
}

const _noteCardStyle = {
  background: brand.secondary,
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
  cursor: 'pointer',
  transition: 'transform 0.2s',
  ':hover': {
    transform: 'translateY(-4px)'
  }
}

const _noteFooterStyle = {
  background: statusColors.host.border,
  padding: '16px 20px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
}

const SidebarItem = ({ icon, label, isActive, isLast, onClick }) => {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
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
    >
      <i
        className={`bi ${icon}`}
        style={{ fontSize: 26, color: neutral.bgSurface, marginRight: 22 }}
      ></i>
      <span
        style={{
          fontStyle: 'italic',
          color: neutral.bgSurface,
          letterSpacing: 1,
          textAlign: 'left'
        }}
      >
        {label}
      </span>
    </div>
  )
}

export default Notes
