import React, { useState, useEffect } from 'react'
import { apiGet, apiPost, apiPut, apiDelete } from '../../utils/api'
import {
  brand,
  neutral,
  interactive,
  status as statusColors
} from '../../utils/colors'
// Phase 4: CSS classes for theme-aware styling
import '../../styles/common.css'

// Helper function to parse day string into array of day names
const parseDayString = dayString => {
  if (!dayString) return []
  const dayNames = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ]
  const selectedDays = []
  const upperDayString = dayString.toUpperCase()

  // First check for full day names
  dayNames.forEach(day => {
    if (dayString.includes(day)) {
      selectedDays.push(day)
    }
  })

  // If full names found, return them (they take precedence)
  if (selectedDays.length > 0) {
    return [...new Set(selectedDays)]
  }

  // Otherwise, parse abbreviations
  // Handle Thursday first (Th) to avoid conflicts with Tuesday (T)
  if (upperDayString.includes('TH')) {
    selectedDays.push('Thursday')
  }
  // Handle Sunday (Su) before Saturday (S)
  if (upperDayString.includes('SU')) {
    selectedDays.push('Sunday')
  }
  // Handle Monday (M) - but not if it's part of Monday, Tuesday, etc.
  if (
    upperDayString.includes('M') &&
    !upperDayString.includes('MONDAY') &&
    !upperDayString.includes('TUESDAY') &&
    !upperDayString.includes('WEDNESDAY') &&
    !upperDayString.includes('THURSDAY') &&
    !upperDayString.includes('FRIDAY') &&
    !upperDayString.includes('SATURDAY') &&
    !upperDayString.includes('SUNDAY')
  ) {
    selectedDays.push('Monday')
  }
  // Handle Tuesday (T) - but not if it's Thursday
  if (
    upperDayString.includes('T') &&
    !upperDayString.includes('TH') &&
    !upperDayString.includes('TUESDAY') &&
    !upperDayString.includes('THURSDAY')
  ) {
    selectedDays.push('Tuesday')
  }
  // Handle Wednesday (W)
  if (upperDayString.includes('W') && !upperDayString.includes('WEDNESDAY')) {
    selectedDays.push('Wednesday')
  }
  // Handle Friday (F)
  if (upperDayString.includes('F') && !upperDayString.includes('FRIDAY')) {
    selectedDays.push('Friday')
  }
  // Handle Saturday (S) - but not if it's Sunday
  if (
    upperDayString.includes('S') &&
    !upperDayString.includes('SU') &&
    !upperDayString.includes('SATURDAY') &&
    !upperDayString.includes('SUNDAY')
  ) {
    selectedDays.push('Saturday')
  }

  return [...new Set(selectedDays)] // Remove duplicates
}

// Helper function to format days array into readable string
const formatDays = selectedDays => {
  if (selectedDays.length === 0) return ''
  if (selectedDays.length === 1) return selectedDays[0]

  const dayNames = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ]
  const dayIndices = selectedDays
    .map(d => dayNames.indexOf(d))
    .sort((a, b) => a - b)
  let formatted = ''

  // Group consecutive days
  let i = 0
  while (i < dayIndices.length) {
    let start = i
    while (
      i < dayIndices.length - 1 &&
      dayIndices[i + 1] === dayIndices[i] + 1
    ) {
      i++
    }

    if (start === i) {
      // Single day
      formatted += (formatted ? ', ' : '') + dayNames[dayIndices[start]]
    } else {
      // Consecutive days
      formatted +=
        (formatted ? ', ' : '') +
        dayNames[dayIndices[start]] +
        '-' +
        dayNames[dayIndices[i]]
    }
    i++
  }

  return formatted
}

// Format a single HH:MM string as 12-hour time with AM/PM
const formatTimePart = time => {
  if (!time) return ''
  const [hourStr, minuteStr = '00'] = time.split(':')
  let hour = Number(hourStr)
  if (Number.isNaN(hour)) return ''
  const minute = minuteStr.padStart(2, '0')
  const suffix = hour >= 12 ? 'PM' : 'AM'
  hour = hour % 12 || 12
  return `${hour}:${minute} ${suffix}`
}

// Format a time window from HH:MM start/end values
const formatTimeWindow = (startTime, endTime) => {
  if (!startTime || !endTime) return ''
  return `${formatTimePart(startTime)} - ${formatTimePart(endTime)}`
}

const EditUserModal = ({ isOpen, onClose, user, userType, onSave }) => {
  const [formData, setFormData] = useState({})
  const [subjects, setSubjects] = useState([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingSubjects, setIsLoadingSubjects] = useState(false)
  const [originalSubjects, setOriginalSubjects] = useState([])

  useEffect(() => {
    if (user) {
      setFormData({ ...user })

      // Fetch subjects if user is an instructor
      // Handle both _id (MongoDB) and id (local state) properties
      const instructorId = user._id || user.id
      console.log('EditUserModal - User data:', {
        user,
        instructorId,
        userType
      })

      if (userType === 'instructor' && instructorId) {
        fetchInstructorSubjects(instructorId)
      } else {
        setSubjects([])
        setOriginalSubjects([])
      }
    }
  }, [user, userType])

  const fetchInstructorSubjects = async instructorId => {
    setIsLoadingSubjects(true)
    console.log('Fetching subjects for instructor:', instructorId)

    try {
      const response = await apiGet(`subjects/instructor/${instructorId}`)
      const result = await response.json()

      console.log('Subject fetch result:', result)

      if (result.success && result.data) {
        // Transform API data to form structure
        const transformedSubjects = result.data.map(s => ({
          _id: s._id, // Keep MongoDB ID for updates
          id: s._id, // Use as key
          subjectName: s.subjectName || '',
          subjectCode: s.subjectCode || '',
          day: s.day || 'Monday',
          time: s.time || '',
          meetingLink: s.meetingLink || '',
          section: s.sections && s.sections.length > 0 ? s.sections[0] : '',
          schedule: s.schedule || null,
          startTime: s.schedule?.startTime || '',
          endTime: s.schedule?.endTime || ''
        }))

        console.log('Transformed subjects:', transformedSubjects)
        setSubjects(transformedSubjects)
        setOriginalSubjects(JSON.parse(JSON.stringify(transformedSubjects))) // Deep copy for comparison
      } else {
        console.warn('No subjects found or fetch failed:', result)
        setSubjects([])
        setOriginalSubjects([])
      }
    } catch (error) {
      console.error('Error fetching subjects:', error)
      alert('Failed to load subjects. Please try again.')
      setSubjects([])
      setOriginalSubjects([])
    } finally {
      setIsLoadingSubjects(false)
    }
  }

  if (!isOpen || !user) return null

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  // Subject handlers
  const addSubject = () => {
    setSubjects([
      ...subjects,
      {
        id: Date.now(), // Temporary ID for new subjects
        subjectName: '',
        subjectCode: '',
        day: '',
        time: '',
        section: '',
        schedule: null,
        startTime: '',
        endTime: ''
      }
    ])
  }

  const removeSubject = index => {
    const updated = subjects.filter((_, i) => i !== index)
    setSubjects(updated)
  }

  const updateSubject = (index, field, value) => {
    const updated = [...subjects]
    const target = { ...(updated[index] || {}) }
    target[field] = value

    // Keep derived time label in sync with start/end time
    if (field === 'startTime' || field === 'endTime') {
      const start = field === 'startTime' ? value : target.startTime || ''
      const end = field === 'endTime' ? value : target.endTime || ''
      if (start && end) {
        target.time = formatTimeWindow(start, end)
      } else {
        target.time = ''
      }
    }

    updated[index] = target
    setSubjects(updated)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Validate subjects for instructor
      if (userType === 'instructor') {
        console.log('Validating subjects:', subjects)

        for (let i = 0; i < subjects.length; i++) {
          const subject = subjects[i]
          if (!subject.subjectName?.trim()) {
            alert(`⚠️ Subject ${i + 1}: Subject Name is required`)
            setIsSaving(false)
            return
          }
          if (!subject.subjectCode?.trim()) {
            alert(`⚠️ Subject ${i + 1}: Subject Code is required`)
            setIsSaving(false)
            return
          }
          if (!subject.day?.trim()) {
            alert(`⚠️ Subject ${i + 1}: Day is required`)
            setIsSaving(false)
            return
          }
          if (!subject.time?.trim()) {
            alert(`⚠️ Subject ${i + 1}: Time is required`)
            setIsSaving(false)
            return
          }
          if (!subject.section?.trim()) {
            alert(`⚠️ Subject ${i + 1}: Section is required`)
            setIsSaving(false)
            return
          }
          if (!formData.department?.trim()) {
            alert(
              `⚠️ Subject ${
                i + 1
              }: Department is required. Please set it in the user's profile first.`
            )
            setIsSaving(false)
            return
          }
        }

        // Handle subject updates for instructor
        console.log('Processing subject updates...')
        await handleSubjectUpdates()
        console.log('Subject updates completed successfully')
      }

      // Save user data
      console.log('Saving user data:', formData)
      onSave(formData)

      // Show success message
      if (userType === 'instructor' && subjects.length > 0) {
        alert(
          `✅ Successfully updated instructor information and ${subjects.length} subject(s)!`
        )
      } else {
        alert('✅ Successfully updated user information!')
      }

      onClose()
    } catch (error) {
      console.error('Error saving:', error)
      alert(
        `❌ Error saving user information: ${
          error.message || 'Unknown error'
        }. Please try again.`
      )
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubjectUpdates = async () => {
    // Track created subjects to update local state with their new _ids
    const createdSubjectsMap = new Map() // Maps temporary id to new _id

    try {
      // Identify subjects to delete (in original but not in current)
      const originalIds = originalSubjects.map(s => s._id).filter(Boolean)
      const currentIds = subjects.map(s => s._id).filter(Boolean)
      const toDelete = originalIds.filter(id => !currentIds.includes(id))

      // Identify subjects to update (existing with _id) and create (new without _id)
      const toUpdate = subjects.filter(s => s._id)
      const toCreate = subjects.filter(s => !s._id)

      console.log('Subject updates:', {
        toDelete: toDelete.length,
        toUpdate: toUpdate.length,
        toCreate: toCreate.length
      })

      // Delete removed subjects
      for (const id of toDelete) {
        console.log('Deleting subject:', id)
        const response = await apiDelete(`subjects/${id}`)
        const deleteResult = await response.json()

        if (!response.ok) {
          console.error('Failed to delete subject:', deleteResult)
          throw new Error(
            `Failed to delete subject: ${
              deleteResult.message || deleteResult.error || 'Unknown error'
            }`
          )
        }

        console.log('Subject deleted successfully:', deleteResult)
      }

      // Update existing subjects
      for (const subject of toUpdate) {
        console.log('Updating subject:', subject._id)

        const payload = {
          subjectName: subject.subjectName?.trim() || '',
          subjectCode: subject.subjectCode?.trim().toUpperCase() || '',
          day: subject.day?.trim() || '',
          time: subject.time?.trim() || '',
          sections: subject.section?.trim() ? [subject.section.trim()] : [],
          department: formData.department?.trim() || '',
          schoolYear: formData.schoolYear || '2025-2026',
          semester: formData.semester || '1st Semester',
          room: subject.room?.trim() || '',
          meetingLink: subject.meetingLink?.trim() || '',
          description: subject.description?.trim() || '',
          credits: subject.credits || undefined
        }

        console.log('Updating subject with payload:', payload)
        const response = await apiPut(`subjects/${subject._id}`, payload)

        if (!response.ok) {
          const errorData = await response.json()
          console.error('Failed to update subject:', errorData)
          throw new Error(
            `Failed to update subject: ${
              errorData.message || errorData.error || 'Unknown error'
            }`
          )
        }

        const updatedSubject = await response.json()
        console.log('Subject updated successfully:', updatedSubject)
      }

      // Create new subjects
      for (const subject of toCreate) {
        // Handle both _id and id for instructor ID
        const instructorId = user._id || user.id

        // Validate required fields
        if (!subject.subjectName?.trim()) {
          throw new Error(
            `Subject ${subjects.indexOf(subject) + 1}: Subject Name is required`
          )
        }
        if (!subject.subjectCode?.trim()) {
          throw new Error(
            `Subject ${subjects.indexOf(subject) + 1}: Subject Code is required`
          )
        }
        if (!subject.section?.trim()) {
          throw new Error(
            `Subject ${subjects.indexOf(subject) + 1}: Section is required`
          )
        }
        if (!subject.day?.trim()) {
          throw new Error(
            `Subject ${subjects.indexOf(subject) + 1}: Day is required`
          )
        }
        if (!subject.time?.trim()) {
          throw new Error(
            `Subject ${subjects.indexOf(subject) + 1}: Time is required`
          )
        }
        if (!formData.department?.trim()) {
          throw new Error(
            `Subject ${
              subjects.indexOf(subject) + 1
            }: Department is required (set in user profile)`
          )
        }

        // Convert section (string) to sections (array) - handle both formats
        const sectionsArray = subject.sections
          ? Array.isArray(subject.sections)
            ? subject.sections
            : [subject.sections]
          : subject.section?.trim()
          ? [subject.section.trim()]
          : []

        const payload = {
          subjectName: subject.subjectName.trim(),
          subjectCode: subject.subjectCode.trim().toUpperCase(),
          instructorId: instructorId,
          day: subject.day.trim(),
          time: subject.time.trim(),
          sections: sectionsArray.filter(s => s && s.trim()).map(s => s.trim()),
          department: formData.department.trim(),
          schoolYear: formData.schoolYear || '2025-2026',
          semester: formData.semester || '1st Semester',
          room: subject.room?.trim() || '',
          meetingLink: subject.meetingLink?.trim() || '',
          description: subject.description?.trim() || '',
          credits: subject.credits || undefined
        }

        console.log('Creating subject with payload:', payload)
        const response = await apiPost('subjects', payload)

        if (!response.ok) {
          const errorData = await response.json()
          console.error('Failed to create subject:', errorData)
          throw new Error(
            `Failed to create subject: ${
              errorData.message || errorData.error || 'Unknown error'
            }`
          )
        }

        const createdSubject = await response.json()
        console.log('Subject created successfully:', createdSubject)

        // Track the mapping from temporary id to new MongoDB _id
        if (createdSubject.data && createdSubject.data._id) {
          createdSubjectsMap.set(subject.id, createdSubject.data._id)
        }
      }

      // Update local subjects state with new _ids for created subjects
      if (createdSubjectsMap.size > 0) {
        const updatedSubjects = subjects.map(s => {
          if (!s._id && createdSubjectsMap.has(s.id)) {
            return { ...s, _id: createdSubjectsMap.get(s.id) }
          }
          return s
        })
        setSubjects(updatedSubjects)
        // Also update originalSubjects to reflect the new state
        setOriginalSubjects(JSON.parse(JSON.stringify(updatedSubjects)))
      } else {
        // Update originalSubjects to match current subjects after successful save
        setOriginalSubjects(JSON.parse(JSON.stringify(subjects)))
      }
    } catch (error) {
      console.error('Error updating subjects:', error)
      throw error // Re-throw original error to preserve message
    }
  }

  const handleOverlayClick = e => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes modalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .edit-modal-close {
          transition: all 0.3s ease;
        }
        .edit-modal-close:hover {
          background: rgba(255, 255, 255, 0.2) !important;
          transform: rotate(90deg);
        }
        .edit-modal-input {
          transition: all 0.2s ease;
        }
        .edit-modal-input:focus {
          border-color: ${brand.primary} !important;
          box-shadow: 0 0 0 3px rgba(35, 34, 92, 0.1) !important;
        }
        .edit-modal-cancel {
          transition: all 0.2s ease;
        }
        .edit-modal-cancel:hover {
          background: ${neutral.textSecondary} !important;
          color: ${neutral.bgSurface} !important;
        }
        .edit-modal-save {
          transition: all 0.2s ease;
        }
        .edit-modal-save:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4) !important;
        }
        .edit-modal-save:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>
              <i
                className={`bi ${
                  userType === 'instructor'
                    ? 'bi-person-badge'
                    : 'bi-person-fill'
                }`}
                style={{ marginRight: 10 }}
              ></i>
              Edit {userType === 'instructor' ? 'Instructor' : 'Student'}{' '}
              Information
            </h2>
            <p style={styles.subtitle}>
              Update user details and profile information
            </p>
          </div>
          <button
            onClick={onClose}
            style={styles.closeBtn}
            className='edit-modal-close'
            aria-label='Close modal'
          >
            <i className='bi bi-x-lg'></i>
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Basic Information Section */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              <i className='bi bi-person-circle' style={{ marginRight: 8 }}></i>
              Basic Information
            </h3>
            <div style={styles.grid}>
              <div style={styles.fieldGroup}>
                <label htmlFor='editFirstName' style={styles.label}>
                  First Name
                </label>
                <input
                  id='editFirstName'
                  name='firstName'
                  type='text'
                  value={formData.name?.split(' ')[0] || ''}
                  onChange={e => {
                    const lastName =
                      formData.name?.split(' ').slice(1).join(' ') || ''
                    handleChange('name', `${e.target.value} ${lastName}`.trim())
                  }}
                  style={styles.input}
                  className='edit-modal-input'
                />
              </div>
              <div style={styles.fieldGroup}>
                <label htmlFor='editLastName' style={styles.label}>
                  Last Name
                </label>
                <input
                  id='editLastName'
                  name='lastName'
                  type='text'
                  value={formData.name?.split(' ').slice(1).join(' ') || ''}
                  onChange={e => {
                    const firstName = formData.name?.split(' ')[0] || ''
                    handleChange(
                      'name',
                      `${firstName} ${e.target.value}`.trim()
                    )
                  }}
                  style={styles.input}
                  className='edit-modal-input'
                />
              </div>
              <div style={styles.fieldGroup}>
                <label htmlFor='editEmail' style={styles.label}>
                  Email
                </label>
                <input
                  id='editEmail'
                  name='email'
                  type='email'
                  value={formData.email || ''}
                  onChange={e => handleChange('email', e.target.value)}
                  style={styles.input}
                  className='edit-modal-input'
                />
              </div>
              <div style={styles.fieldGroup}>
                <label htmlFor='editPhone' style={styles.label}>
                  Phone Number
                </label>
                <input
                  id='editPhone'
                  name='phone'
                  type='tel'
                  value={formData.phone || ''}
                  onChange={e => handleChange('phone', e.target.value)}
                  style={styles.input}
                  className='edit-modal-input'
                  placeholder='+63 912 345 6789'
                />
              </div>
              <div style={styles.fieldGroup}>
                <label htmlFor='editPassword' style={styles.label}>
                  Password
                </label>
                <input
                  id='editPassword'
                  name='password'
                  type='text'
                  value={formData.password || ''}
                  onChange={e => handleChange('password', e.target.value)}
                  style={styles.input}
                  className='edit-modal-input'
                />
              </div>
              <div style={styles.fieldGroup}>
                <label htmlFor='editStatus' style={styles.label}>
                  Status
                </label>
                <select
                  id='editStatus'
                  name='active'
                  value={formData.active || 'Active'}
                  onChange={e => handleChange('active', e.target.value)}
                  style={styles.input}
                  className='edit-modal-input'
                >
                  <option value='Active'>Active</option>
                  <option value='Inactive'>Inactive</option>
                </select>
              </div>
              {userType === 'student' && (
                <div style={{ ...styles.fieldGroup, gridColumn: '1 / -1' }}>
                  <label htmlFor='editAddress' style={styles.label}>
                    Address
                  </label>
                  <input
                    id='editAddress'
                    name='address'
                    type='text'
                    value={formData.address || ''}
                    onChange={e => handleChange('address', e.target.value)}
                    placeholder='Complete residential address'
                    style={styles.input}
                    className='edit-modal-input'
                  />
                </div>
              )}
            </div>
          </div>

          {/* Academic/Professional Information */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              <i className='bi bi-building' style={{ marginRight: 8 }}></i>
              {userType === 'instructor'
                ? 'Professional Information'
                : 'Academic Information'}
            </h3>
            <div style={styles.grid}>
              <div style={styles.fieldGroup}>
                <label htmlFor='editDepartment' style={styles.label}>
                  Department
                </label>
                <select
                  id='editDepartment'
                  name='department'
                  value={formData.department || ''}
                  onChange={e => handleChange('department', e.target.value)}
                  style={styles.input}
                  className='edit-modal-input'
                >
                  <option value=''>Select Department</option>
                  <option value='IT'>IT</option>
                </select>
              </div>
              <div style={styles.fieldGroup}>
                <label htmlFor='editCourse' style={styles.label}>
                  {userType === 'instructor' ? 'Program' : 'Course'}
                </label>
                <select
                  id='editCourse'
                  name='course'
                  value={formData.course || ''}
                  onChange={e => handleChange('course', e.target.value)}
                  style={styles.input}
                  className='edit-modal-input'
                >
                  <option value=''>Select Course</option>
                  <option value='BSIT'>BSIT</option>
                </select>
              </div>
              <div style={styles.fieldGroup}>
                <label htmlFor='editSchoolYear' style={styles.label}>
                  School Year
                </label>
                <select
                  id='editSchoolYear'
                  name='schoolYear'
                  value={formData.schoolYear || ''}
                  onChange={e => handleChange('schoolYear', e.target.value)}
                  style={styles.input}
                  className='edit-modal-input'
                >
                  <option value=''>Select School Year</option>
                  <option value='2025-2026'>2025-2026</option>
                </select>
              </div>
              <div style={styles.fieldGroup}>
                <label htmlFor='editSemester' style={styles.label}>
                  Semester
                </label>
                <select
                  id='editSemester'
                  name='semester'
                  value={formData.semester || ''}
                  onChange={e => handleChange('semester', e.target.value)}
                  style={styles.input}
                  className='edit-modal-input'
                >
                  <option value=''>Select Semester</option>
                  <option value='1st Semester'>1st Semester</option>
                  <option value='2nd Semester'>2nd Semester</option>
                  <option value='Summer'>Summer</option>
                </select>
              </div>
              {/* Student-Specific Fields */}
              {userType === 'student' && (
                <>
                  <div style={styles.fieldGroup}>
                    <label htmlFor='editSection' style={styles.label}>
                      Section
                    </label>
                    <input
                      id='editSection'
                      name='section'
                      type='text'
                      value={formData.section || ''}
                      onChange={e => handleChange('section', e.target.value)}
                      placeholder='e.g., BSIT 3A'
                      style={styles.input}
                      className='edit-modal-input'
                    />
                  </div>
                  <div style={styles.fieldGroup}>
                    <label htmlFor='editYearLevel' style={styles.label}>
                      Year Level
                    </label>
                    <input
                      id='editYearLevel'
                      name='yearLevel'
                      type='text'
                      value={formData.yearLevel || ''}
                      onChange={e => handleChange('yearLevel', e.target.value)}
                      placeholder='e.g., 3rd Year - BSIT 3A'
                      style={styles.input}
                      className='edit-modal-input'
                    />
                  </div>
                  <div style={styles.fieldGroup}>
                    <label htmlFor='editDateOfBirth' style={styles.label}>
                      Date of Birth
                    </label>
                    <input
                      id='editDateOfBirth'
                      name='dateOfBirth'
                      type='date'
                      value={formData.dateOfBirth || ''}
                      onChange={e =>
                        handleChange('dateOfBirth', e.target.value)
                      }
                      style={styles.input}
                      className='edit-modal-input'
                    />
                  </div>
                  <div style={styles.fieldGroup}>
                    <label htmlFor='editGuardianName' style={styles.label}>
                      Guardian Name
                    </label>
                    <input
                      id='editGuardianName'
                      name='guardianName'
                      type='text'
                      value={formData.guardianName || ''}
                      onChange={e =>
                        handleChange('guardianName', e.target.value)
                      }
                      style={styles.input}
                      className='edit-modal-input'
                      placeholder='Parent or Guardian Full Name'
                    />
                  </div>
                  <div style={styles.fieldGroup}>
                    <label htmlFor='editGuardianPhone' style={styles.label}>
                      Guardian Phone
                    </label>
                    <input
                      id='editGuardianPhone'
                      name='guardianPhone'
                      type='tel'
                      value={formData.guardianPhone || ''}
                      onChange={e =>
                        handleChange('guardianPhone', e.target.value)
                      }
                      style={styles.input}
                      className='edit-modal-input'
                      placeholder='+63 912 345 6789'
                    />
                  </div>
                  <div style={styles.fieldGroup}>
                    <label htmlFor='editGuardianRelation' style={styles.label}>
                      Guardian Relation
                    </label>
                    <select
                      id='editGuardianRelation'
                      name='guardianRelation'
                      value={formData.guardianRelation || ''}
                      onChange={e =>
                        handleChange('guardianRelation', e.target.value)
                      }
                      style={styles.input}
                      className='edit-modal-input'
                    >
                      <option value=''>Select Relation</option>
                      <option value='Mother'>Mother</option>
                      <option value='Father'>Father</option>
                      <option value='Guardian'>Guardian</option>
                      <option value='Other'>Other</option>
                    </select>
                  </div>
                </>
              )}

              {/* Instructor-Specific Fields */}
              {userType === 'instructor' && (
                <>
                  <div style={styles.fieldGroup}>
                    <label htmlFor='editOfficeLocation' style={styles.label}>
                      Office Location
                    </label>
                    <input
                      id='editOfficeLocation'
                      name='officeLocation'
                      type='text'
                      value={formData.officeLocation || ''}
                      onChange={e =>
                        handleChange('officeLocation', e.target.value)
                      }
                      placeholder='e.g., Room 301, IT Building'
                      style={styles.input}
                      className='edit-modal-input'
                    />
                  </div>
                  <div style={styles.fieldGroup}>
                    <label htmlFor='editExperience' style={styles.label}>
                      Experience
                    </label>
                    <input
                      id='editExperience'
                      name='experience'
                      type='text'
                      value={formData.experience || ''}
                      onChange={e => handleChange('experience', e.target.value)}
                      placeholder='e.g., 10 years'
                      style={styles.input}
                      className='edit-modal-input'
                    />
                  </div>
                  <div style={{ ...styles.fieldGroup, gridColumn: '1 / -1' }}>
                    <label htmlFor='editSpecialization' style={styles.label}>
                      Specialization
                    </label>
                    <input
                      id='editSpecialization'
                      name='specialization'
                      type='text'
                      value={formData.specialization || ''}
                      onChange={e =>
                        handleChange('specialization', e.target.value)
                      }
                      placeholder='e.g., Web Development, Database Management'
                      style={styles.input}
                      className='edit-modal-input'
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Emergency Contact Section - Student Only */}
          {userType === 'student' && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                <i
                  className='bi bi-exclamation-triangle'
                  style={{ marginRight: 10 }}
                ></i>
                Emergency Contact
              </h3>
              <div style={styles.grid}>
                <div style={styles.fieldGroup}>
                  <label htmlFor='editEmergencyContact' style={styles.label}>
                    Emergency Contact Name
                  </label>
                  <input
                    id='editEmergencyContact'
                    name='emergencyContact'
                    type='text'
                    value={formData.emergencyContact || ''}
                    onChange={e =>
                      handleChange('emergencyContact', e.target.value)
                    }
                    placeholder='Emergency contact person'
                    style={styles.input}
                    className='edit-modal-input'
                  />
                </div>
                <div style={styles.fieldGroup}>
                  <label htmlFor='editEmergencyPhone' style={styles.label}>
                    Emergency Contact Phone
                  </label>
                  <input
                    id='editEmergencyPhone'
                    name='emergencyPhone'
                    type='tel'
                    value={formData.emergencyPhone || ''}
                    onChange={e =>
                      handleChange('emergencyPhone', e.target.value)
                    }
                    placeholder='+63 912 345 6789'
                    style={styles.input}
                    className='edit-modal-input'
                  />
                </div>
              </div>
            </div>
          )}

          {/* Biography Section - Instructor Only */}
          {userType === 'instructor' && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                <i
                  className='bi bi-person-badge'
                  style={{ marginRight: 10 }}
                ></i>
                Professional Biography
              </h3>
              <div style={styles.fieldGroup}>
                <label htmlFor='editBio' style={styles.label}>
                  Biography
                </label>
                <textarea
                  id='editBio'
                  name='bio'
                  value={formData.bio || ''}
                  onChange={e => handleChange('bio', e.target.value)}
                  placeholder='Enter professional biography...'
                  style={styles.textarea}
                  className='edit-modal-input'
                  rows={4}
                />
              </div>
            </div>
          )}

          {/* Subjects Section - Instructor Only */}
          {userType === 'instructor' && (
            <div style={styles.section}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 24
                }}
              >
                <h3 style={styles.sectionTitle}>
                  <i className='bi bi-book' style={{ marginRight: 10 }}></i>
                  Subjects
                  {subjects.length > 0 && (
                    <span
                      style={{
                        marginLeft: 12,
                        background: statusColors.present.border,
                        color: neutral.bgSurface,
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: 14,
                        fontWeight: 600
                      }}
                    >
                      {subjects.length}
                    </span>
                  )}
                </h3>
                <button
                  type='button'
                  onClick={addSubject}
                  style={{
                    padding: '10px 20px',
                    background: `linear-gradient(135deg, ${statusColors.present.border} 0%, ${interactive.success} 100%)`,
                    color: neutral.bgSurface,
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e =>
                    (e.currentTarget.style.transform = 'translateY(-2px)')
                  }
                  onMouseLeave={e =>
                    (e.currentTarget.style.transform = 'translateY(0)')
                  }
                >
                  <i className='bi bi-plus-circle' style={{ fontSize: 16 }}></i>
                  Add Subject
                </button>
              </div>

              {isLoadingSubjects && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: neutral.textSecondary
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      border: `4px solid ${neutral.border}`,
                      borderTop: `4px solid ${brand.primary}`,
                      borderRadius: '50%',
                      margin: '0 auto 12px',
                      animation: 'spin 1s linear infinite'
                    }}
                  ></div>
                  <p style={{ margin: 0, fontWeight: 600 }}>
                    Loading subjects...
                  </p>
                  <p
                    style={{
                      margin: '8px 0 0',
                      fontSize: 13,
                      color: neutral.textSecondary
                    }}
                  >
                    Please wait while we fetch the instructor's subjects
                  </p>
                </div>
              )}

              {!isLoadingSubjects && subjects.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    background: neutral.bgMuted,
                    borderRadius: 12,
                    border: `2px dashed ${neutral.border}`
                  }}
                >
                  <i
                    className='bi bi-book'
                    style={{
                      fontSize: 48,
                      color: neutral.border,
                      marginBottom: 12,
                      display: 'block'
                    }}
                  ></i>
                  <p
                    style={{
                      margin: 0,
                      color: neutral.textSecondary,
                      fontSize: 15,
                      fontWeight: 600
                    }}
                  >
                    No subjects found for this instructor
                  </p>
                  <p
                    style={{
                      margin: '8px 0 0',
                      color: neutral.textSecondary,
                      fontSize: 13
                    }}
                  >
                    Click "Add Subject" above to create subjects for this
                    instructor
                  </p>
                </div>
              )}

              {!isLoadingSubjects &&
                subjects.map((subject, subjectIndex) => (
                  <div
                    key={subject.id}
                    style={{
                      marginBottom: 24,
                      padding: 24,
                      background: neutral.bgMuted,
                      borderRadius: 12,
                      border: `2px solid ${neutral.border}`,
                      position: 'relative'
                    }}
                  >
                    {/* Subject Header */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 20,
                        paddingBottom: 12,
                        borderBottom: `2px solid ${neutral.border}`
                      }}
                    >
                      <div
                        style={{
                          background: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.accent} 100%)`,
                          color: neutral.bgSurface,
                          padding: '6px 16px',
                          borderRadius: 8,
                          fontWeight: 700,
                          fontSize: 14,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8
                        }}
                      >
                        <i
                          className='bi bi-book-fill'
                          style={{ fontSize: 16 }}
                        ></i>
                        Subject {subjectIndex + 1}
                      </div>
                      <button
                        type='button'
                        onClick={() => removeSubject(subjectIndex)}
                        style={{
                          padding: '8px 16px',
                          background: statusColors.absent.border,
                          color: neutral.bgSurface,
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e =>
                          (e.currentTarget.style.opacity = '0.85')
                        }
                        onMouseLeave={e =>
                          (e.currentTarget.style.opacity = '1')
                        }
                      >
                        <i className='bi bi-trash' style={{ fontSize: 14 }}></i>
                        Remove
                      </button>
                    </div>

                    {/* Subject Fields Grid */}
                    <div style={styles.grid}>
                      {/* Subject Name */}
                      <div style={styles.fieldGroup}>
                        <label
                          htmlFor={`editSubjectName-${subjectIndex}`}
                          style={styles.label}
                        >
                          Subject Name{' '}
                          <span style={{ color: statusColors.absent.border }}>
                            *
                          </span>
                        </label>
                        <input
                          id={`editSubjectName-${subjectIndex}`}
                          name={`subjectName-${subjectIndex}`}
                          type='text'
                          value={subject.subjectName}
                          onChange={e =>
                            updateSubject(
                              subjectIndex,
                              'subjectName',
                              e.target.value
                            )
                          }
                          style={styles.input}
                          className='edit-modal-input'
                          placeholder='e.g., Mathematics'
                        />
                      </div>

                      {/* Subject Code */}
                      <div style={styles.fieldGroup}>
                        <label
                          htmlFor={`editSubjectCode-${subjectIndex}`}
                          style={styles.label}
                        >
                          Subject Code{' '}
                          <span style={{ color: statusColors.absent.border }}>
                            *
                          </span>
                        </label>
                        <input
                          id={`editSubjectCode-${subjectIndex}`}
                          name={`subjectCode-${subjectIndex}`}
                          type='text'
                          value={subject.subjectCode}
                          onChange={e =>
                            updateSubject(
                              subjectIndex,
                              'subjectCode',
                              e.target.value.toUpperCase()
                            )
                          }
                          style={styles.input}
                          className='edit-modal-input'
                          placeholder='e.g., MATH101'
                        />
                      </div>

                      {/* Day - Flexible Selection */}
                      <div style={styles.fieldGroup}>
                        <label
                          htmlFor={`editSubjectDay-${subjectIndex}`}
                          style={styles.label}
                        >
                          Day{' '}
                          <span style={{ color: statusColors.absent.border }}>
                            *
                          </span>
                        </label>

                        {/* Day Checkboxes */}
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 12,
                            marginBottom: 12,
                            padding: 12,
                            background: neutral.bgMuted,
                            borderRadius: 8,
                            border: `1px solid ${neutral.border}`
                          }}
                        >
                          {[
                            'Monday',
                            'Tuesday',
                            'Wednesday',
                            'Thursday',
                            'Friday',
                            'Saturday',
                            'Sunday'
                          ].map(dayName => {
                            const selectedDays = parseDayString(
                              subject.day || ''
                            )
                            const isChecked = selectedDays.includes(dayName)

                            return (
                              <label
                                key={dayName}
                                htmlFor={`editSubjectDayCheckbox-${subjectIndex}-${dayName}`}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  cursor: 'pointer',
                                  fontSize: 14,
                                  fontWeight: 500,
                                  color: brand.primary
                                }}
                              >
                                <input
                                  id={`editSubjectDayCheckbox-${subjectIndex}-${dayName}`}
                                  type='checkbox'
                                  checked={isChecked}
                                  onChange={e => {
                                    const currentSelectedDays = parseDayString(
                                      subject.day || ''
                                    )

                                    // Toggle the day
                                    let newSelectedDays
                                    if (e.target.checked) {
                                      newSelectedDays = [
                                        ...currentSelectedDays,
                                        dayName
                                      ]
                                    } else {
                                      newSelectedDays =
                                        currentSelectedDays.filter(
                                          d => d !== dayName
                                        )
                                    }

                                    // Format the days
                                    const formatted =
                                      formatDays(newSelectedDays)
                                    updateSubject(
                                      subjectIndex,
                                      'day',
                                      formatted
                                    )
                                  }}
                                  style={{
                                    width: 18,
                                    height: 18,
                                    cursor: 'pointer',
                                    accentColor: brand.primary
                                  }}
                                />
                                <span>{dayName}</span>
                              </label>
                            )
                          })}
                        </div>

                        {/* Text Input for Free-form Entry */}
                        <input
                          id={`editSubjectDay-${subjectIndex}`}
                          name={`subjectDay-${subjectIndex}`}
                          type='text'
                          value={subject.day || ''}
                          onChange={e =>
                            updateSubject(subjectIndex, 'day', e.target.value)
                          }
                          style={styles.input}
                          className='edit-modal-input'
                          placeholder='e.g., MTh, MWF, S, Monday-Thursday, Monday, Wednesday, Friday'
                        />

                        {/* Helper Text */}
                        <p
                          style={{
                            margin: '8px 0 0 0',
                            fontSize: 12,
                            color: '#6c757d',
                            fontStyle: 'italic'
                          }}
                        >
                          Examples: MTh, MWF, S, Monday-Thursday, Monday,
                          Wednesday, Friday
                        </p>
                      </div>

                      {/* Time */}
                      <div style={styles.fieldGroup}>
                        <label
                          htmlFor={`editSubjectTime-${subjectIndex}`}
                          style={styles.label}
                        >
                          Time{' '}
                          <span style={{ color: statusColors.absent.border }}>
                            *
                          </span>
                        </label>
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            flexWrap: 'wrap'
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 140 }}>
                            <div
                              style={{
                                fontSize: 12,
                                color: neutral.textSecondary,
                                marginBottom: 4
                              }}
                            >
                              Start
                            </div>
                            <input
                              id={`editSubjectStartTime-${subjectIndex}`}
                              type='time'
                              value={subject.startTime || ''}
                              onChange={e =>
                                updateSubject(
                                  subjectIndex,
                                  'startTime',
                                  e.target.value
                                )
                              }
                              style={styles.input}
                              className='edit-modal-input'
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 140 }}>
                            <div
                              style={{
                                fontSize: 12,
                                color: neutral.textSecondary,
                                marginBottom: 4
                              }}
                            >
                              End
                            </div>
                            <input
                              id={`editSubjectEndTime-${subjectIndex}`}
                              type='time'
                              value={subject.endTime || ''}
                              onChange={e =>
                                updateSubject(
                                  subjectIndex,
                                  'endTime',
                                  e.target.value
                                )
                              }
                              style={styles.input}
                              className='edit-modal-input'
                            />
                          </div>
                        </div>
                        <div
                          style={{
                            marginTop: 6,
                            fontSize: 13,
                            color: neutral.textSecondary
                          }}
                        >
                          {subject.time
                            ? `Current: ${subject.time}`
                            : subject.startTime && subject.endTime
                            ? formatTimeWindow(
                                subject.startTime,
                                subject.endTime
                              )
                            : 'Select start and end time for this subject.'}
                        </div>
                      </div>
                    </div>

                    {/* Section */}
                    <div
                      style={{
                        marginTop: 20,
                        paddingTop: 20,
                        borderTop: '2px solid #dee2e6'
                      }}
                    >
                      <label
                        htmlFor={`editSubjectSection-${subjectIndex}`}
                        style={{
                          ...styles.label,
                          marginBottom: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8
                        }}
                      >
                        <i
                          className='bi bi-people'
                          style={{ fontSize: 16 }}
                        ></i>
                        Section{' '}
                        <span style={{ color: statusColors.absent.border }}>
                          *
                        </span>
                      </label>
                      <select
                        id={`editSubjectSection-${subjectIndex}`}
                        name={`subjectSection-${subjectIndex}`}
                        value={subject.section || ''}
                        onChange={e =>
                          updateSubject(subjectIndex, 'section', e.target.value)
                        }
                        style={styles.input}
                        className='edit-modal-input'
                      >
                        <option value=''>Select Section</option>
                        <option value='IT4R1'>IT4R1</option>
                        <option value='IT4R2'>IT4R2</option>
                        <option value='IT4R3'>IT4R3</option>
                        <option value='IT4R4'>IT4R4</option>
                        <option value='IT4R5'>IT4R5</option>
                        <option value='IT4R6'>IT4R6</option>
                        <option value='IT4R7'>IT4R7</option>
                        <option value='IT4R8'>IT4R8</option>
                        <option value='IT4R9'>IT4R9</option>
                        <option value='IT4R10'>IT4R10</option>
                      </select>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button
            onClick={onClose}
            style={styles.cancelBtn}
            className='edit-modal-cancel'
            disabled={isSaving}
          >
            <i className='bi bi-x-circle' style={{ marginRight: 8 }}></i>
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={styles.saveBtn}
            className='edit-modal-save'
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <div style={styles.spinner}></div>
                <span style={{ marginLeft: 8 }}>Saving...</span>
              </>
            ) : (
              <>
                <i
                  className='bi bi-check-circle'
                  style={{ marginRight: 8 }}
                ></i>
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  overlay: {
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
    backdropFilter: 'blur(4px)',
    padding: 20,
    animation: 'fadeIn 0.2s ease-out'
  },
  modal: {
    background: neutral.bgSurface,
    borderRadius: 20,
    width: '90%',
    maxWidth: 900,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    overflow: 'hidden',
    animation: 'modalFadeIn 0.3s ease-out'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '28px 32px',
    borderBottom: `2px solid ${neutral.bgPage}`,
    background: `linear-gradient(135deg, ${brand.secondary} 0%, ${brand.accent} 100%)`,
    color: neutral.bgSurface
  },
  title: {
    fontSize: 24,
    fontWeight: 800,
    margin: 0,
    color: neutral.bgSurface,
    display: 'flex',
    alignItems: 'center'
  },
  subtitle: {
    fontSize: 14,
    color: neutral.borderLight,
    margin: '6px 0 0 0',
    fontWeight: 500
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: neutral.bgSurface,
    fontSize: 24,
    cursor: 'pointer',
    padding: 8,
    borderRadius: 8,
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '32px',
    background: neutral.bgMuted
  },
  section: {
    background: neutral.bgSurface,
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    border: `1px solid ${neutral.border}`
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: brand.secondary,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottom: `2px solid ${neutral.bgPage}`,
    display: 'flex',
    alignItems: 'center'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: 20
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column'
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: neutral.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  input: {
    padding: '12px 16px',
    borderRadius: 8,
    border: `2px solid ${neutral.border}`,
    fontSize: 15,
    color: brand.secondary,
    outline: 'none',
    transition: 'all 0.2s',
    fontWeight: 500,
    background: neutral.bgSurface
  },
  textarea: {
    padding: '12px 16px',
    borderRadius: 8,
    border: `2px solid ${neutral.border}`,
    fontSize: 15,
    color: brand.secondary,
    outline: 'none',
    transition: 'all 0.2s',
    fontWeight: 500,
    background: neutral.bgSurface,
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: 100,
    lineHeight: 1.6
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    padding: '20px 32px',
    borderTop: `2px solid ${neutral.bgPage}`,
    background: neutral.bgSurface
  },
  cancelBtn: {
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
    alignItems: 'center'
  },
  saveBtn: {
    padding: '12px 24px',
    borderRadius: 10,
    border: 'none',
    background: `linear-gradient(135deg, ${interactive.success} 0%, #059669 100%)`,
    color: neutral.bgSurface,
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
    display: 'flex',
    alignItems: 'center'
  },
  spinner: {
    width: 16,
    height: 16,
    border: `2px solid rgba(255,255,255,0.4)`,
    borderTop: `2px solid ${neutral.bgSurface}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
}

export default EditUserModal
