import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 4: CSS classes for theme-aware styling
import '../styles/common.css'
import { apiGet, apiPost } from '../utils/api'
import {
  brand,
  neutral,
  status as statusColors,
  interactive
} from '../utils/colors'

const CreateGroup = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    groupName: '',
    timeSchedule: '',
    day: '',
    meetingLink: '',
    lateRuleTime: '15',
    section: '',
    description: '',
    date: '',
    time: '',
    // Attendance policy fields
    addDropPeriodStart: '',
    addDropPeriodEnd: '',
    classDurationMinutes: '',
    contactHoursPerWeek: ''
  })
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [searchEmail, setSearchEmail] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showAutoAssignPreview, setShowAutoAssignPreview] = useState(false)
  const [autoAssignPreview, setAutoAssignPreview] = useState([])
  const [loadingPreview, setLoadingPreview] = useState(false)

  const handleInputChange = e => {
    const { name, value } = e.target
    setFormData(prev => {
      const newData = { ...prev, [name]: value }
      if (
        (name === 'date' || name === 'time') &&
        newData.date &&
        newData.time
      ) {
        newData.timeSchedule = `${newData.date}T${newData.time}:00`
      }
      return newData
    })

    // Load preview when section changes
    if (name === 'section' && value.trim()) {
      loadAutoAssignPreview(value.trim())
    }
  }

  const loadAutoAssignPreview = async section => {
    if (!section) {
      setAutoAssignPreview([])
      return
    }

    setLoadingPreview(true)
    try {
      // Find all students and filter by section on client side
      // (since users endpoint doesn't support section filtering)
      const response = await apiGet('users?role=student')
      const result = await response.json()

      if (result.success && Array.isArray(result.data)) {
        const normalizedSection = section.toLowerCase().trim()
        const matchingStudents = result.data.filter(
          student =>
            student.section &&
            student.section.toLowerCase().trim() === normalizedSection
        )
        setAutoAssignPreview(matchingStudents)
      } else {
        setAutoAssignPreview([])
      }
    } catch (error) {
      console.error('Error loading auto-assign preview:', error)
      setAutoAssignPreview([])
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleCreateGroup = async () => {
    setLoading(true)
    setError('')
    setSuccess('')

    if (
      !formData.groupName ||
      !formData.date ||
      !formData.time ||
      !formData.day ||
      !formData.meetingLink ||
      !formData.section
    ) {
      setError('Please fill in all required fields')
      setLoading(false)
      return
    }

    const timeSchedule = `${formData.date}T${formData.time}:00`

    try {
      let instructorId = undefined
      try {
        const userStr = localStorage.getItem('user')
        const user = userStr ? JSON.parse(userStr) : null
        if (user && user._id) instructorId = user._id
      } catch {
        /* ignore parse errors */
      }
      if (!instructorId) {
        setError('Not authenticated. Please login again.')
        setLoading(false)
        return
      }

      const groupData = {
        groupName: formData.groupName,
        description: formData.description,
        instructorId,
        timeSchedule: timeSchedule,
        timeScheduleLocal: new Date(
          `${formData.date}T${formData.time}:00`
        ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        day: formData.day,
        meetingLink: formData.meetingLink,
        section: formData.section,
        lateRuleTime: parseInt(formData.lateRuleTime),
        members: members.map(email => email),
        // Attendance policy fields
        addDropPeriodStart: formData.addDropPeriodStart || null,
        addDropPeriodEnd: formData.addDropPeriodEnd || null,
        classDurationMinutes: formData.classDurationMinutes
          ? parseInt(formData.classDurationMinutes)
          : null,
        contactHoursPerWeek: formData.contactHoursPerWeek
          ? parseFloat(formData.contactHoursPerWeek)
          : null
      }

      const response = await apiPost('groups', groupData)

      const result = await response.json()

      if (result.success) {
        const assignmentMsg = result.assignmentSummary
          ? ` ${result.assignmentSummary.studentsAssigned} student(s) automatically assigned.`
          : ''
        setSuccess(`Subject created successfully!${assignmentMsg}`)
        setTimeout(() => {
          navigate('/instructor-dashboard')
        }, 2000)
      } else {
        setError(result.message || result.error || 'Failed to create subject')
      }
    } catch (error) {
      setError(`Failed to create subject: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // --- INVITE MODAL LOGIC ---
  const handleInvite = () => {
    setShowInviteModal(true)
  }

  const handleSearchUser = async () => {
    if (!searchEmail.trim()) return
    setSearching(true)
    setSearchResults([])
    try {
      const response = await apiGet(
        `users/search?email=${encodeURIComponent(searchEmail)}`
      )
      const data = await response.json()
      if (Array.isArray(data)) {
        setSearchResults(data)
      } else if (data.email) {
        setSearchResults([data])
      } else {
        setSearchResults([])
      }
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleAddMember = email => {
    if (!members.includes(email)) {
      setMembers(prev => [...prev, email])
    }
    setShowInviteModal(false)
    setSearchEmail('')
    setSearchResults([])
  }

  const removeMember = index => {
    setMembers(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContent}>
        {/* Header */}
        <div style={styles.header}>
          <div
            style={styles.backButton}
            onClick={() => navigate('/instructor-dashboard')}
          >
            <i className='bi bi-arrow-left' style={{ fontSize: 24 }}></i>
          </div>
          <h2 style={styles.title}>SUBJECT</h2>
        </div>

        {/* Form */}
        <div style={styles.formContainer}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>SUBJECT NAME</label>
            <input
              type='text'
              name='groupName'
              value={formData.groupName}
              onChange={handleInputChange}
              placeholder='IT ELECTIVE'
              style={styles.input}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>DESCRIPTION</label>
            <textarea
              name='description'
              value={formData.description}
              onChange={handleInputChange}
              placeholder='Enter group description...'
              style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
            />
          </div>

          <div style={styles.rowContainer}>
            <div style={styles.halfWidth}>
              <label style={styles.label}>DATE</label>
              <input
                type='date'
                name='date'
                value={formData.date}
                onChange={handleInputChange}
                style={styles.input}
                required
              />
            </div>
            <div style={styles.halfWidth}>
              <label style={styles.label}>TIME</label>
              <input
                type='time'
                name='time'
                value={formData.time}
                onChange={handleInputChange}
                style={styles.input}
                required
              />
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>DAY</label>
            <select
              name='day'
              value={formData.day}
              onChange={handleInputChange}
              style={styles.input}
            >
              <option value=''>Select Day</option>
              <option value='monday'>Monday</option>
              <option value='tuesday'>Tuesday</option>
              <option value='wednesday'>Wednesday</option>
              <option value='thursday'>Thursday</option>
              <option value='friday'>Friday</option>
            </select>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>MEETING LINK</label>
            <input
              type='url'
              name='meetingLink'
              value={formData.meetingLink}
              onChange={handleInputChange}
              placeholder='https://meet.google.com/abc-defg-hij or abc-defg-hij'
              style={styles.input}
            />
            <span
              style={{ fontSize: 12, color: neutral.textMuted, marginTop: 4 }}
            >
              Enter full Google Meet URL or just the meeting code (e.g.,
              abc-defg-hij)
            </span>
          </div>

          <div style={styles.rowContainer}>
            <div style={styles.halfWidth}>
              <label style={styles.label}>LATE RULE TIME</label>
              <select
                name='lateRuleTime'
                value={formData.lateRuleTime}
                onChange={handleInputChange}
                style={styles.select}
              >
                <option value='15'>15 minutes</option>
                <option value='30'>30 minutes</option>
                <option value='45'>45 minutes</option>
              </select>
            </div>
            <div style={styles.halfWidth}>
              <label style={styles.label}>SECTION</label>
              <div style={{ position: 'relative' }}>
                <input
                  type='text'
                  name='section'
                  value={formData.section}
                  onChange={handleInputChange}
                  placeholder='Section Name'
                  style={styles.input}
                />
                {formData.section && (
                  <button
                    type='button'
                    onClick={() =>
                      setShowAutoAssignPreview(!showAutoAssignPreview)
                    }
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: brand.secondary,
                      cursor: 'pointer',
                      fontSize: 14,
                      fontWeight: 600,
                      padding: '4px 8px'
                    }}
                  >
                    {showAutoAssignPreview ? 'Hide' : 'Preview'} Auto-Assign
                  </button>
                )}
              </div>
              {showAutoAssignPreview && formData.section && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 12,
                    background: neutral.bgMuted,
                    borderRadius: 8,
                    border: `1px solid ${neutral.border}`
                  }}
                >
                  {loadingPreview ? (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '8px',
                        color: neutral.textMuted
                      }}
                    >
                      Loading preview...
                    </div>
                  ) : autoAssignPreview.length > 0 ? (
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: brand.secondary,
                          marginBottom: 8
                        }}
                      >
                        {autoAssignPreview.length} student(s) will be
                        automatically assigned:
                      </div>
                      <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                        {autoAssignPreview.slice(0, 10).map((student, idx) => (
                          <div
                            key={student._id || idx}
                            style={{
                              padding: '4px 8px',
                              fontSize: 12,
                              color: neutral.textMuted,
                              borderBottom: `1px solid ${neutral.borderLight}`
                            }}
                          >
                            {student.firstName} {student.lastName} (
                            {student.email})
                          </div>
                        ))}
                        {autoAssignPreview.length > 10 && (
                          <div
                            style={{
                              padding: '4px 8px',
                              fontSize: 12,
                              color: neutral.textSecondary,
                              fontStyle: 'italic'
                            }}
                          >
                            + {autoAssignPreview.length - 10} more students
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 11,
                          color: neutral.textMuted,
                          fontStyle: 'italic'
                        }}
                      >
                        {autoAssignPreview.length} students will be added from
                        this section
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        textAlign: 'center',
                        padding: '8px',
                        color: neutral.textMuted,
                        fontSize: 13
                      }}
                    >
                      No students found in this section
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Attendance Policy Section */}
          <div
            style={{
              ...styles.inputGroup,
              marginTop: 24,
              paddingTop: 24,
              borderTop: `2px solid ${neutral.border}`
            }}
          >
            <h3
              style={{
                margin: '0 0 20px 0',
                color: brand.secondary,
                fontSize: 20,
                fontWeight: 700
              }}
            >
              Attendance Policy (Optional)
            </h3>

            <div style={styles.rowContainer}>
              <div style={styles.halfWidth}>
                <label style={styles.label}>
                  Add/Drop Period Start
                  <span
                    style={{
                      fontSize: 12,
                      color: neutral.textMuted,
                      marginLeft: 4
                    }}
                  >
                    (Optional)
                  </span>
                </label>
                <input
                  type='date'
                  name='addDropPeriodStart'
                  value={formData.addDropPeriodStart}
                  onChange={handleInputChange}
                  style={styles.input}
                  title='Start date of the adding/dropping period. Absences during this period will not be counted.'
                />
              </div>
              <div style={styles.halfWidth}>
                <label style={styles.label}>
                  Add/Drop Period End
                  <span
                    style={{
                      fontSize: 12,
                      color: neutral.textMuted,
                      marginLeft: 4
                    }}
                  >
                    (Optional)
                  </span>
                </label>
                <input
                  type='date'
                  name='addDropPeriodEnd'
                  value={formData.addDropPeriodEnd}
                  onChange={handleInputChange}
                  style={styles.input}
                  title='End date of the adding/dropping period. Absences during this period will not be counted.'
                />
              </div>
            </div>

            <div style={styles.rowContainer}>
              <div style={styles.halfWidth}>
                <label style={styles.label}>
                  Class Duration (minutes)
                  <span
                    style={{
                      fontSize: 12,
                      color: neutral.textMuted,
                      marginLeft: 4
                    }}
                  >
                    (Optional)
                  </span>
                </label>
                <input
                  type='number'
                  name='classDurationMinutes'
                  value={formData.classDurationMinutes}
                  onChange={handleInputChange}
                  placeholder='e.g., 90 for 1.5 hours, 180 for 3 hours'
                  style={styles.input}
                  min='1'
                  title='Scheduled class period length in minutes. Used for calculating tardiness (25% rule).'
                />
              </div>
              <div style={styles.halfWidth}>
                <label style={styles.label}>
                  Contact Hours Per Week
                  <span
                    style={{
                      fontSize: 12,
                      color: neutral.textMuted,
                      marginLeft: 4
                    }}
                  >
                    (Optional)
                  </span>
                </label>
                <input
                  type='number'
                  name='contactHoursPerWeek'
                  value={formData.contactHoursPerWeek}
                  onChange={handleInputChange}
                  placeholder='e.g., 3 for 3-hour classes/week'
                  style={styles.input}
                  min='0.1'
                  step='0.1'
                  title='Contact hours per week. Used for calculating D/F eligibility (>17% rule).'
                />
              </div>
            </div>
          </div>

          <div style={styles.inputGroup}>
            <div style={styles.memberHeader}>
              <label style={styles.label}>MEMBER</label>
              <button
                type='button'
                onClick={handleInvite}
                style={styles.inviteButton}
              >
                Invite
              </button>
            </div>
            <div style={styles.memberList}>
              {members.length === 0 ? (
                <div style={styles.emptyState}>
                  <i
                    className='bi bi-people'
                    style={{
                      fontSize: 24,
                      color: neutral.border,
                      marginBottom: 8
                    }}
                  ></i>
                  <p style={{ color: neutral.textMuted, margin: 0 }}>
                    No members added yet
                  </p>
                </div>
              ) : (
                members.map((email, idx) => (
                  <div key={idx} style={styles.memberItem}>
                    <div style={styles.memberAvatar}>
                      <i className='bi bi-person-fill'></i>
                    </div>
                    <span style={styles.memberEmail}>{email}</span>
                    <button
                      type='button'
                      onClick={() => removeMember(idx)}
                      style={styles.removeButton}
                    >
                      <i className='bi bi-x'></i>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {error && (
            <div style={styles.errorMessage}>
              <i className='bi bi-exclamation-triangle-fill'></i>
              {error}
            </div>
          )}
          {success && (
            <div style={styles.successMessage}>
              <i className='bi bi-check-circle-fill'></i>
              {success}
            </div>
          )}

          <div style={styles.buttonContainer}>
            <button
              type='button'
              onClick={handleCreateGroup}
              style={styles.saveButton}
              disabled={loading}
            >
              {loading ? (
                <>
                  <i className='bi bi-hourglass-split'></i> Creating...
                </>
              ) : (
                <>
                  <i className='bi bi-plus-circle'></i> Create Subject
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* --- INVITE MEMBER MODAL --- */}
      {showInviteModal && (
        <div style={styles.inviteOverlay}>
          <div style={styles.inviteModal}>
            <div style={styles.inviteHeader}>
              <h3 style={{ margin: 0, color: brand.secondary }}>
                Invite Member
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                style={styles.closeButton}
              >
                <i className='bi bi-x-lg'></i>
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              <input
                type='email'
                placeholder='Search by email...'
                value={searchEmail}
                onChange={e => setSearchEmail(e.target.value)}
                style={styles.input}
              />
              <button
                onClick={handleSearchUser}
                disabled={searching}
                style={{ ...styles.inviteButton, width: '100%', marginTop: 12 }}
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              {searchResults.length > 0
                ? searchResults.map((user, idx) => (
                    <div key={idx} style={styles.searchItem}>
                      <i
                        className='bi bi-person-circle'
                        style={{ color: brand.secondary, fontSize: 20 }}
                      ></i>
                      <span style={{ flex: 1, marginLeft: 10 }}>
                        {user.email}
                      </span>
                      <button
                        style={styles.addBtn}
                        onClick={() => handleAddMember(user.email)}
                      >
                        Add
                      </button>
                    </div>
                  ))
                : !searching && (
                    <p
                      style={{ color: neutral.textMuted, textAlign: 'center' }}
                    >
                      No results
                    </p>
                  )}
            </div>
          </div>
        </div>
      )}
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
    color: brand.secondary
  },
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    color: brand.secondary
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
    color: brand.secondary
  },
  input: {
    padding: '12px 16px',
    borderRadius: 8,
    border: `1px solid ${neutral.border}`,
    fontSize: 16,
    backgroundColor: neutral.bgSurface,
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
    color: brand.secondary,
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
    justifyContent: 'flex-end', // Changed from space-between
    marginTop: 32
  },
  rightButtons: {
    display: 'flex',
    gap: 16
  },
  saveButton: {
    padding: '12px 24px',
    backgroundColor: brand.secondary,
    color: neutral.bgSurface,
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    ':disabled': {
      backgroundColor: neutral.border,
      cursor: 'not-allowed'
    }
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
    color: neutral.textMuted
  },
  removeButton: {
    background: 'transparent',
    border: 'none',
    color: statusColors.absent.border,
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto'
  },
  errorMessage: {
    background: statusColors.absent.bg,
    color: statusColors.absent.text,
    border: `1px solid ${statusColors.absent.border}`,
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  successMessage: {
    background: statusColors.present.bg,
    color: statusColors.present.text,
    border: `1px solid ${statusColors.present.border}`,
    borderRadius: 8,
    padding: '12px 16px',
    marginBottom: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  inviteOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100
  },
  inviteModal: {
    backgroundColor: neutral.bgSurface,
    borderRadius: 12,
    width: '90%',
    maxWidth: 400,
    padding: 24,
    boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
  },
  inviteHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  closeButton: {
    border: 'none',
    background: 'transparent',
    color: brand.secondary,
    cursor: 'pointer',
    fontSize: 18
  },
  searchItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: `1px solid ${neutral.borderLight}`
  },
  addBtn: {
    backgroundColor: brand.secondary,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 12px',
    fontWeight: 600,
    cursor: 'pointer'
  }
}

export default CreateGroup
