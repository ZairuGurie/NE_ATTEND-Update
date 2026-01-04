import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import logo from '../assets/logo.png'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 4: CSS classes for theme-aware styling
import '../styles/common.css'
import { logout } from '../utils/auth'
import { apiGet, apiPut } from '../utils/api'
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

const StudentAnnouncements = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      const parsedUser = JSON.parse(userData)
      setUser(parsedUser)
      fetchAnnouncements(parsedUser._id)
    }
  }, [])

  const fetchAnnouncements = async studentId => {
    try {
      setLoading(true)
      const response = await apiGet(
        `communications/announcements/student/${studentId}`
      )
      const data = await response.json()

      if (data.success) {
        setAnnouncements(data.data || [])
      } else {
        console.error('Error fetching announcements:', data.message)
      }
    } catch (err) {
      console.error('Error fetching announcements:', err)
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async announcementId => {
    try {
      await apiPut(`communications/announcements/${announcementId}/read`, {
        userId: user._id
      })

      // Update local state
      setAnnouncements(
        announcements.map(a =>
          a._id === announcementId ? { ...a, isRead: true } : a
        )
      )
    } catch (err) {
      console.error('Error marking as read:', err)
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
        return '#F44336'
      case 'high':
        return '#FF9800'
      case 'medium':
        return '#2196F3'
      default:
        return '#9E9E9E'
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        background: '#f4f6fb',
        fontFamily: 'Segoe UI, sans-serif'
      }}
    >
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
            <NotificationBell />
            <UserMenu
              user={user}
              onProfileClick={() => navigate('/profile')}
              onSettingsClick={() => alert('Settings')}
            />
          </div>
        </div>

        {loading ? (
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
              background: '#fff',
              borderRadius: 16
            }}
          >
            <i
              className='bi bi-megaphone'
              style={{ fontSize: 64, color: '#ccc' }}
            ></i>
            <h3 style={{ color: '#666', fontSize: 20, margin: '16px 0 8px 0' }}>
              No Announcements
            </h3>
            <p style={{ color: '#999' }}>
              No announcements have been posted yet
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 20 }}>
            {announcements.map(announcement => (
              <div
                key={announcement._id}
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  padding: 24,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
                  borderLeft: `4px solid ${getPriorityColor(
                    announcement.priority
                  )}`,
                  opacity: announcement.isRead ? 0.7 : 1,
                  cursor: 'pointer'
                }}
                onClick={() =>
                  !announcement.isRead && markAsRead(announcement._id)
                }
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
                          style={{ color: '#FF9800' }}
                        ></i>
                      )}
                      {!announcement.isRead && (
                        <span
                          style={{
                            background: '#F44336',
                            color: '#fff',
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700
                          }}
                        >
                          NEW
                        </span>
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
                          background: '#e3f2fd',
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
                        color: '#666',
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
                              background: '#EFEFFB',
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
                              background: '#E3F2FD',
                              color: '#1976D2',
                              fontSize: 12,
                              fontWeight: 600
                            }}
                          >
                            <i
                              className='bi bi-bar-chart-steps'
                              style={{ marginRight: 4 }}
                            ></i>
                            {announcement.yearLevel}
                          </span>
                        )}
                        {announcement.sections &&
                          announcement.sections.length > 0 && (
                            <span
                              style={{
                                padding: '4px 12px',
                                borderRadius: 12,
                                background: '#d4edda',
                                color: '#155724',
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
                        display: 'flex',
                        gap: 20,
                        fontSize: 13,
                        color: '#999',
                        marginTop: 12
                      }}
                    >
                      <div>
                        <i className='bi bi-person'></i>{' '}
                        {announcement.instructorId?.firstName}{' '}
                        {announcement.instructorId?.lastName}
                      </div>
                      <div>
                        <i className='bi bi-clock'></i>{' '}
                        {new Date(announcement.createdAt).toLocaleString()}
                      </div>
                    </div>
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

export default StudentAnnouncements
