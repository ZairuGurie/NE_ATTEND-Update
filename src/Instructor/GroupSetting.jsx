import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 4: CSS classes for theme-aware styling
import '../styles/common.css'
import { apiGet, apiPut } from '../utils/api'
import {
  brand,
  neutral,
  status as statusColors,
  interactive
} from '../utils/colors'

const GroupSettings = () => {
  const navigate = useNavigate()
  const { id } = useParams()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    meetingLink: ''
  })
  const [subjectData, setSubjectData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [, setDirty] = useState(false)

  useEffect(() => {
    const abort = new AbortController()
    const fetchSubject = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await apiGet(`subjects/${id}`)
        const data = await res.json()
        if (data.success && data.data) {
          const s = data.data
          setSubjectData(s)
          setFormData({
            meetingLink: s.meetingLink || ''
          })
        } else {
          setError(data.message || data.error || 'Failed to load subject')
        }
      } catch (e) {
        if (e.name === 'AbortError') return
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    if (id) fetchSubject()
    return () => abort.abort()
  }, [id])

  const [saving, setSaving] = useState(false)

  const handleSaveChanges = async () => {
    if (saving) return
    try {
      setSaving(true)
      const body = {
        meetingLink: (formData.meetingLink || '').trim()
      }
      const res = await apiPut(`subjects/${id}`, body)
      const data = await res.json()
      if (!data.success) {
        alert(data.message || data.error || 'Failed to save')
        return
      }
      const s = data.data
      setSubjectData(s)
      setFormData({
        meetingLink: s.meetingLink || ''
      })
      setIsEditing(false)
      setDirty(false)
      alert('Google Meet link updated successfully!')
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = e => {
    if (!isEditing) return
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setDirty(true)
  }

  const handleJoinMeeting = () => {
    if (formData.meetingLink) {
      let linkToOpen = formData.meetingLink.trim()

      // Check if it's just a meeting code (format: abc-defg-hij)
      const meetCodePattern = /^[a-z]+-[a-z]+-[a-z]+$/i
      if (meetCodePattern.test(linkToOpen)) {
        // It's just a meeting code, construct full URL
        linkToOpen = `https://meet.google.com/${linkToOpen}`
      } else if (!/^https?:\/\//i.test(linkToOpen)) {
        // Has some content but no protocol, add https://
        linkToOpen = `https://${linkToOpen}`
      }

      window.open(linkToOpen, '_blank')
    } else {
      alert('No Google Meet link available. Please add a meeting link first.')
    }
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContent}>
        {loading && <div>Loading...</div>}
        {error && !loading && (
          <div style={{ color: statusColors.absent.border }}>
            Error: {error}
          </div>
        )}
        {/* Header */}
        <div style={styles.header}>
          <div
            style={styles.backButton}
            onClick={() => navigate('/instructor-dashboard')}
          >
            <i className='bi bi-arrow-left' style={{ fontSize: 24 }}></i>
          </div>
          <h2 style={styles.title}>SUBJECT SETTINGS</h2>
          <button
            onClick={() =>
              isEditing ? handleSaveChanges() : setIsEditing(true)
            }
            style={{
              ...styles.editButton,
              backgroundColor: isEditing
                ? interactive.success
                : brand.secondary,
              opacity: saving ? 0.7 : 1,
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
            disabled={saving}
          >
            {isEditing ? (saving ? 'Saving...' : 'Save Changes') : 'Edit'}
          </button>
        </div>

        {/* Subject Info */}
        {subjectData && (
          <div
            style={{
              background: neutral.bgMuted,
              padding: '16px 20px',
              borderRadius: 8,
              marginBottom: 24
            }}
          >
            <h3
              style={{
                margin: '0 0 8px 0',
                fontSize: 20,
                fontWeight: 700,
                color: brand.secondary
              }}
            >
              {subjectData.subjectName || 'Untitled Subject'}
            </h3>
            <p style={{ margin: 0, fontSize: 14, color: neutral.textMuted }}>
              {subjectData.subjectCode || ''} • {subjectData.day || 'N/A'} •{' '}
              {subjectData.time || 'N/A'}
            </p>
          </div>
        )}

        {/* Form */}
        <div style={styles.formContainer}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>GOOGLE MEET LINK</label>
            <input
              type='url'
              name='meetingLink'
              value={formData.meetingLink}
              onChange={handleInputChange}
              placeholder='https://meet.google.com/abc-defg-hij or abc-defg-hij'
              style={{
                ...styles.input,
                backgroundColor: isEditing
                  ? neutral.bgSurface
                  : neutral.bgMuted,
                cursor: isEditing ? 'text' : 'default'
              }}
              readOnly={!isEditing}
            />
            {isEditing && (
              <span
                style={{ fontSize: 12, color: neutral.textMuted, marginTop: 4 }}
              >
                Enter full Google Meet URL or just the meeting code (e.g.,
                abc-defg-hij)
              </span>
            )}
            {!isEditing && formData.meetingLink && (
              <button
                type='button'
                onClick={handleJoinMeeting}
                style={{
                  marginTop: 12,
                  padding: '12px 24px',
                  background: interactive.primary,
                  color: neutral.bgSurface,
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: 'fit-content'
                }}
              >
                <i className='bi bi-camera-video-fill'></i>
                Join Google Meet
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  modalOverlay: {
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
  },
  modalContent: {
    backgroundColor: neutral.bgSurface,
    borderRadius: 16,
    width: '90%',
    maxWidth: 800,
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: '32px 40px'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 32
  },
  backButton: {
    cursor: 'pointer',
    marginRight: 24,
    color: 'black' // Changed from brand.secondary
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    color: 'black' // Changed from brand.secondary
  },
  formContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: 'black' // Changed from brand.secondary
  },
  input: {
    padding: '12px 16px',
    borderRadius: 8,
    border: `1px solid ${neutral.border}`,
    fontSize: 16,
    color: neutral.textPrimary
  },
  rowContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 24
  },
  halfWidth: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  select: {
    padding: '12px 16px',
    borderRadius: 8,
    border: `1px solid ${neutral.border}`,
    fontSize: 16,
    backgroundColor: neutral.bgSurface,
    color: neutral.textPrimary
  },
  memberHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  inviteButton: {
    backgroundColor: interactive.success,
    color: neutral.textPrimary,
    border: 'none',
    padding: '8px 24px',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer'
  },
  memberList: {
    border: `1px solid ${neutral.border}`,
    borderRadius: 8,
    maxHeight: 200,
    overflowY: 'auto'
  },
  memberItem: {
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    borderBottom: `1px solid ${neutral.borderLight}`
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    backgroundColor: neutral.bgMuted,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  memberEmail: {
    fontSize: 15,
    color: neutral.textPrimary
  },
  buttonContainer: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 32
  },
  rightButtons: {
    display: 'flex',
    gap: 16
  },
  deleteButton: {
    padding: '12px 24px',
    backgroundColor: statusColors.absent.border,
    color: neutral.bgSurface,
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    width: '200px'
  },
  saveButton: {
    padding: '12px 24px',
    backgroundColor: brand.secondary,
    color: neutral.bgSurface,
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer'
  },
  startButton: {
    padding: '12px 24px',
    backgroundColor: interactive.success,
    color: neutral.textPrimary,
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer'
  },
  editButton: {
    padding: '8px 20px',
    color: neutral.bgSurface,
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    marginLeft: 'auto'
  },
  removeButton: {
    background: 'none',
    border: 'none',
    color: statusColors.absent.border,
    cursor: 'pointer',
    marginLeft: 'auto',
    padding: 4
  },
  inviteModalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000
  },
  inviteModalContent: {
    backgroundColor: neutral.bgSurface,
    borderRadius: 12,
    width: '90%',
    maxWidth: 500,
    padding: 0,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
    animation: 'slideIn 0.3s ease-out'
  },
  inviteModalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: `1px solid ${neutral.borderLight}`
  },
  inviteModalTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: 'black'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: 18,
    cursor: 'pointer',
    color: neutral.textMuted,
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  inviteModalBody: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  inviteInput: {
    padding: '12px 16px',
    borderRadius: 8,
    border: `1px solid ${neutral.border}`,
    fontSize: 16,
    backgroundColor: neutral.bgSurface,
    color: neutral.textPrimary,
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  inviteModalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    padding: '16px 24px',
    borderTop: `1px solid ${neutral.borderLight}`
  },
  cancelButton: {
    padding: '10px 24px',
    backgroundColor: neutral.bgMuted,
    color: neutral.textPrimary,
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  confirmButton: {
    padding: '10px 24px',
    backgroundColor: interactive.success,
    color: neutral.textPrimary,
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  }
}

export default GroupSettings
