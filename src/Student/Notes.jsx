import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import logo from '../assets/logo.png'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 4: CSS classes for theme-aware styling
import '../styles/common.css'
import { logout, getCurrentUser } from '../utils/auth'
import { apiGet, apiPost, apiDelete } from '../utils/api'
import { brand, neutral } from '../utils/colors'
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

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  fontSize: 16,
  borderRadius: 8,
  border: '1px solid #ddd',
  outline: 'none',
  color: '#333',
  backgroundColor: '#fff',
  transition: 'border-color 0.2s ease'
}

const buttonStyle = {
  color: '#fff',
  padding: '12px 24px',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: 16,
  cursor: 'pointer',
  transition: 'opacity 0.2s ease'
}

const Notes = () => {
  const navigate = useNavigate()
  const location = useLocation()
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
    const userData = getCurrentUser()
    if (userData) {
      setUser(userData)
    }
    fetchNotes()
  }, [])

  const fetchNotes = async () => {
    try {
      setLoading(true)
      setError('') // Clear previous errors

      const response = await apiGet('notes')

      if (response.ok) {
        const data = await response.json()
        console.log('Notes fetched successfully:', data)
        setNotes(data.data || [])
      } else {
        const errorData = await response.json()
        console.error('Notes API error:', errorData)

        if (response.status === 401) {
          setError('Authentication failed. Please log in again.')
        } else {
          setError(errorData.message || 'Failed to fetch notes')
        }
      }
    } catch (err) {
      console.error('Error fetching notes:', err)
      setError('Network error. Please check your connection and try again.')
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

      if (response.ok) {
        const data = await response.json()
        setNotes([data.data, ...notes])
        setFormData({ topic: '', description: '', subject: '' })
        setShowForm(false)
      } else {
        const errorData = await response.json()
        setError(errorData.message || 'Failed to create note')
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

      if (response.ok) {
        setNotes(notes.filter(note => note._id !== noteId))
      } else {
        setError('Failed to delete note')
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

  const formatDate = rawDate =>
    new Date(rawDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        fontFamily: 'Segoe UI, sans-serif',
        background: '#f4f6fb',
        overflow: 'hidden'
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: 290,
          background: brand.primary,
          color: '#ffffff',
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

      {/* Main */}
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
            GROUP
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
              user={_user}
              onProfileClick={() => navigate('/profile')}
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
              background: '#201B51',
              color: '#fff',
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
              background: '#f8d7da',
              color: '#721c24',
              padding: 12,
              borderRadius: 8,
              marginBottom: 20,
              border: '1px solid #f5c6cb'
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div
            style={{
              background: '#fff',
              padding: 40,
              borderRadius: 16,
              marginBottom: 30,
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
              border: '1px solid #e0e0e0'
            }}
          >
            <h3
              style={{
                margin: '0 0 20px 0',
                color: '#333',
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
                  color: '#333',
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
                  color: '#333',
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
                  color: '#333',
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
                style={{ ...buttonStyle, background: '#ff4444' }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddNote}
                disabled={loading}
                style={{
                  ...buttonStyle,
                  background: '#201B51',
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Notes List */}
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
          <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
            <i
              className='bi bi-journal-text'
              style={{ fontSize: 48, marginBottom: 16, color: '#ccc' }}
            ></i>
            <p style={{ fontSize: 18, margin: 0 }}>No notes yet</p>
            <p style={{ fontSize: 14, margin: '8px 0 0 0', color: '#999' }}>
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
                <div style={{ padding: '20px', color: '#fff' }}>
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
                    background: '#FFD600',
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

export default Notes
