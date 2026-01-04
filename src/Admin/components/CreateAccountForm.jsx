import React, { useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { showSuccess, showError } from '../utils/toastUtils'
import SubjectScheduleCalendar from './SubjectScheduleCalendar'
import {
  brand,
  neutral,
  interactive,
  status as statusColors
} from '../../utils/colors'
// Phase 4: CSS classes for theme-aware styling
import '../../styles/common.css'

const DASHBOARD_ALERT_KEY = 'adminAccountStatus'

const departmentCourseOptions = {
  'College of Information Technology and Computing': [
    'Information Technology',
    'Computer Science'
  ],
  'College of Engineering and Architecture': [
    'Civil Engineering',
    'Electrical Engineering'
  ]
}

const defaultDepartment = Object.keys(departmentCourseOptions)[0] || ''
const defaultCourse = defaultDepartment
  ? departmentCourseOptions[defaultDepartment][0] || ''
  : ''

const WEEKDAY_OPTIONS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
]

const orderWeekdays = (weekdays = []) => {
  const normalized = weekdays
    .map(day => {
      if (!day) return null
      const matchIndex = WEEKDAY_OPTIONS.findIndex(
        option => option.toLowerCase() === day.toLowerCase()
      )
      return matchIndex >= 0 ? WEEKDAY_OPTIONS[matchIndex] : null
    })
    .filter(Boolean)
  const unique = Array.from(new Set(normalized))
  return unique.sort(
    (a, b) => WEEKDAY_OPTIONS.indexOf(a) - WEEKDAY_OPTIONS.indexOf(b)
  )
}

const formatWeekdaySummary = (weekdays = []) => {
  const ordered = orderWeekdays(weekdays)
  if (ordered.length === 0) return ''
  if (ordered.length === 1) return ordered[0]
  if (ordered.length === 2) return `${ordered[0]} & ${ordered[1]}`
  return ordered.join(', ')
}

const formatTimePart = time => {
  if (!time) return ''
  const [hourStr, minuteStr = '00'] = time.split(':')
  let hour = Number(hourStr)
  const minute = minuteStr.padStart(2, '0')
  if (Number.isNaN(hour)) return ''
  const suffix = hour >= 12 ? 'PM' : 'AM'
  hour = hour % 12 || 12
  return `${hour}:${minute} ${suffix}`
}

const formatTimeWindow = (startTime, endTime) => {
  if (!startTime || !endTime) return ''
  return `${formatTimePart(startTime)} - ${formatTimePart(endTime)}`
}

const timeToMinutes = time => {
  if (!time) return NaN
  const [hourStr, minuteStr = '00'] = time.split(':')
  const hours = Number(hourStr)
  const minutes = Number(minuteStr)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return NaN
  }
  return hours * 60 + minutes
}

const getDayLabelFromSchedule = schedule =>
  formatWeekdaySummary(schedule?.weekdays)
const getTimeLabelFromSchedule = schedule =>
  formatTimeWindow(schedule?.startTime, schedule?.endTime)

const createEmptySchedule = () => ({
  weekdays: [],
  startTime: '',
  endTime: ''
})

const createEmptySubjectForm = () => ({
  id: Date.now(),
  subjectName: '',
  subjectCode: '',
  section: '',
  room: '',
  meetingLink: '',
  description: '',
  credits: '',
  schedule: createEmptySchedule(),
  weeklySchedules: []
})

const sanitizeSchedule = schedule => {
  if (!schedule) return null
  const sanitizedWeekdays = orderWeekdays(schedule.weekdays || [])
  if (sanitizedWeekdays.length === 0) return null
  const startTime = schedule.startTime || ''
  const endTime = schedule.endTime || ''
  if (!startTime || !endTime) return null
  return {
    weekdays: sanitizedWeekdays,
    startTime,
    endTime
  }
}

const validateScheduleFields = schedule => {
  const sanitizedWeekdays = orderWeekdays(schedule?.weekdays || [])
  if (sanitizedWeekdays.length === 0) {
    return 'Select at least one weekday'
  }
  const startMinutes = timeToMinutes(schedule?.startTime)
  const endMinutes = timeToMinutes(schedule?.endTime)
  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) {
    return 'Enter valid start and end times'
  }
  if (endMinutes <= startMinutes) {
    return 'End time must be later than start time'
  }
  return null
}

const CreateAccountForm = () => {
  const navigate = useNavigate()
  const abortControllerRef = useRef(null)

  // Form state
  const [formData, setFormData] = useState({
    // Basic Information
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    userId: '',
    phone: '',

    // Role & Academic Info
    role: 'student',
    schoolYear: '2025-2026',
    semester: '1st Semester',
    department: defaultDepartment,
    course: defaultCourse,

    // Student-specific
    section: '',
    yearLevel: '',
    dateOfBirth: '',
    address: '',
    guardianName: '',
    guardianPhone: '',
    guardianRelation: '',
    emergencyContact: '',
    emergencyPhone: '',

    // Instructor/Admin-specific
    officeLocation: '',
    experience: '',
    specialization: '',
    bio: ''
  })

  // Subjects state for instructor
  const [subjects, setSubjects] = useState([])
  const [subjectForm, setSubjectForm] = useState(() => createEmptySubjectForm())
  const [editingSubjectId, setEditingSubjectId] = useState(null)
  const [subjectErrors, setSubjectErrors] = useState({})
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [editingScheduleIndex, setEditingScheduleIndex] = useState(null)

  // Profile picture state
  const [profilePicture, setProfilePicture] = useState(null)
  const [profilePictureError, setProfilePictureError] = useState('')

  // Validation & UI state
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isValidatingEmail, setIsValidatingEmail] = useState(false)
  const [isValidatingUserId, setIsValidatingUserId] = useState(false)
  const [emailAvailability, setEmailAvailability] = useState({
    status: 'idle',
    message: ''
  })
  const [emailExists, setEmailExists] = useState(false)

  // Password strength calculator
  const calculatePasswordStrength = useCallback(password => {
    let strength = 0
    if (password.length >= 6) strength++
    if (password.length >= 8) strength++
    if (password.length >= 10) strength++
    if (/[a-z]/.test(password)) strength++
    if (/[A-Z]/.test(password)) strength++
    if (/[0-9]/.test(password)) strength++
    if (/[^a-zA-Z0-9]/.test(password)) strength++
    return Math.min(strength, 6)
  }, [])

  const passwordMeetsRequirements = useMemo(() => {
    const password = formData.password || ''
    return (
      password.length >= 10 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^a-zA-Z0-9]/.test(password)
    )
  }, [formData.password])

  // Field validators
  const validators = {
    firstName: value => {
      if (!value.trim()) return 'First name is required'
      if (value.trim().length < 2)
        return 'First name must be at least 2 characters'
      if (value.trim().length > 50)
        return 'First name must be less than 50 characters'
      if (!/^[a-zA-Z\s'-]+$/.test(value))
        return 'First name can only contain letters'
      return null
    },

    lastName: value => {
      if (!value.trim()) return 'Last name is required'
      if (value.trim().length < 2)
        return 'Last name must be at least 2 characters'
      if (value.trim().length > 50)
        return 'Last name must be less than 50 characters'
      if (!/^[a-zA-Z\s'-]+$/.test(value))
        return 'Last name can only contain letters'
      return null
    },

    email: value => {
      if (!value.trim()) return 'Email is required'
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(value.trim()))
        return 'Please enter a valid email address'
      return null
    },

    password: value => {
      if (!value) return 'Password is required'
      if (value.length < 10) return 'Password must be at least 10 characters'
      if (!/[A-Z]/.test(value))
        return 'Password must contain at least one uppercase letter'
      if (!/[0-9]/.test(value))
        return 'Password must contain at least one number'
      if (!/[^a-zA-Z0-9]/.test(value))
        return 'Password must contain at least one special character'
      if (!/[a-z]/.test(value))
        return 'Password must contain at least one lowercase letter'
      return null
    },

    confirmPassword: (value, formData) => {
      if (!value) return 'Please confirm your password'
      if (value !== formData.password) return 'Passwords do not match'
      return null
    },

    userId: value => {
      if (!value.trim()) return 'User ID is required'
      if (value.trim().length < 3)
        return 'User ID must be at least 3 characters'
      if (value.trim().length > 50)
        return 'User ID must be less than 50 characters'
      if (!/^[\w-]+$/.test(value.trim()))
        return 'User ID can only contain letters, numbers, hyphens, and underscores'
      return null
    },

    phone: value => {
      const digitsOnly = value.replace(/\D/g, '')
      if (!digitsOnly) return 'Phone number is required'
      if (!/^\d+$/.test(digitsOnly))
        return 'Phone number must contain digits only'
      if (digitsOnly.length !== 11)
        return 'Phone number must be exactly 11 digits'
      return null
    },

    section: (value, formData) => {
      if (formData.role === 'student' && !value.trim())
        return 'Section is required for students'
      return null
    },

    yearLevel: (value, formData) => {
      if (formData.role === 'student' && !value)
        return 'Year level is required for students'
      return null
    },

    dateOfBirth: (value, formData) => {
      if (formData.role === 'student' && !value)
        return 'Date of birth is required for students'
      if (formData.role === 'student' && value) {
        const age =
          (new Date() - new Date(value)) / (365.25 * 24 * 60 * 60 * 1000)
        if (age < 15) return 'Student must be at least 15 years old'
      }
      return null
    },

    guardianName: (value, formData) => {
      // Optional for students when creating accounts in admin.
      // Keep field valid if empty; could add format checks here if needed.
      if (!value) return null
      const trimmed = value.trim()
      if (!trimmed) return null
      if (!/^[a-zA-Z\s'-]+$/.test(trimmed))
        return 'Guardian name can only contain letters'
      return null
    },

    guardianPhone: (value, formData) => {
      // Optional for students when creating accounts in admin.
      // If provided, enforce basic digit/length validation similar to phone.
      if (!value) return null
      const digitsOnly = value.replace(/\D/g, '')
      if (!digitsOnly) return null
      if (!/^\d+$/.test(digitsOnly))
        return 'Guardian phone must contain digits only'
      if (digitsOnly.length !== 11)
        return 'Guardian phone must be exactly 11 digits'
      return null
    },

    officeLocation: (value, formData) => {
      // Office location is optional for instructors and admins
      return null
    }
  }

  // Handle field change
  const handleChange = (field, value) => {
    setFormData(prev => {
      if (field === 'department') {
        const availableCourses = departmentCourseOptions[value] || []
        const nextCourse = availableCourses.includes(prev.course)
          ? prev.course
          : availableCourses[0] || ''
        return { ...prev, department: value, course: nextCourse }
      }
      if (field === 'phone') {
        const digitsOnly = value.replace(/\D/g, '').slice(0, 11)
        return { ...prev, phone: digitsOnly }
      }

      return { ...prev, [field]: value }
    })

    // Update password strength
    if (field === 'password') {
      setPasswordStrength(calculatePasswordStrength(value))
    }

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }))
    }

    if (field === 'department' && errors.course) {
      setErrors(prev => ({ ...prev, course: null }))
    }

    if (field === 'email') {
      setEmailAvailability({ status: 'idle', message: '' })
      setEmailExists(false)
    }
  }

  // Handle field blur
  const handleBlur = field => {
    setTouched(prev => ({ ...prev, [field]: true }))

    // Validate field
    if (validators[field]) {
      const error = validators[field](formData[field], formData)
      setErrors(prev => ({ ...prev, [field]: error }))
    }
  }

  const handleSubjectFieldChange = (field, value) => {
    setSubjectForm(prev => ({
      ...prev,
      [field]: field === 'subjectCode' ? value.toUpperCase() : value
    }))
    if (subjectErrors[field]) {
      setSubjectErrors(prev => ({ ...prev, [field]: null }))
    }
  }

  const handleSubjectSectionChange = value => {
    setSubjectForm(prev => ({ ...prev, section: value }))
    if (subjectErrors.section) {
      setSubjectErrors(prev => ({ ...prev, section: null }))
    }
  }

  const handleSubjectScheduleChange = schedule => {
    const nextSchedule = schedule ? { ...schedule } : createEmptySchedule()
    setSubjectForm(prev => ({ ...prev, schedule: nextSchedule }))
    if (subjectErrors.schedule) {
      setSubjectErrors(prev => ({ ...prev, schedule: null }))
    }
  }

  const openScheduleModal = (index = null) => {
    setEditingScheduleIndex(index)
    setSubjectErrors(prev => ({ ...prev, schedule: null }))
    setSubjectForm(prev => ({
      ...prev,
      schedule:
        index !== null && prev.weeklySchedules[index]
          ? { ...prev.weeklySchedules[index] }
          : createEmptySchedule()
    }))
    setIsScheduleModalOpen(true)
  }

  const closeScheduleModal = () => {
    setIsScheduleModalOpen(false)
    setEditingScheduleIndex(null)
  }

  const persistScheduleFromModal = ({ reopen } = {}) => {
    const validationError = validateScheduleFields(subjectForm.schedule)
    if (validationError) {
      setSubjectErrors(prev => ({ ...prev, schedule: validationError }))
      return
    }
    const sanitized = sanitizeSchedule(subjectForm.schedule)
    if (!sanitized) {
      setSubjectErrors(prev => ({
        ...prev,
        schedule: 'Complete the weekly schedule details'
      }))
      return
    }
    const scheduleId =
      editingScheduleIndex !== null &&
      subjectForm.weeklySchedules[editingScheduleIndex] &&
      subjectForm.weeklySchedules[editingScheduleIndex].id
        ? subjectForm.weeklySchedules[editingScheduleIndex].id
        : `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    setSubjectForm(prev => {
      const nextSchedules = [...prev.weeklySchedules]
      if (
        editingScheduleIndex !== null &&
        nextSchedules[editingScheduleIndex]
      ) {
        nextSchedules[editingScheduleIndex] = { ...sanitized, id: scheduleId }
      } else {
        nextSchedules.push({ ...sanitized, id: scheduleId })
      }
      const primarySchedule = nextSchedules[0] || createEmptySchedule()
      return {
        ...prev,
        weeklySchedules: nextSchedules,
        schedule: reopen ? createEmptySchedule() : primarySchedule
      }
    })
    setSubjectErrors(prev => ({ ...prev, schedule: null }))
    if (reopen) {
      setEditingScheduleIndex(null)
      return
    }
    closeScheduleModal()
  }

  const handleRemoveSavedSchedule = index => {
    setSubjectForm(prev => {
      const nextSchedules = prev.weeklySchedules.filter((_, i) => i !== index)
      const nextPrimary = nextSchedules[0] || createEmptySchedule()
      return {
        ...prev,
        weeklySchedules: nextSchedules,
        schedule: nextPrimary
      }
    })
  }

  const resetSubjectForm = () => {
    setSubjectForm(createEmptySubjectForm())
    setSubjectErrors({})
    setEditingSubjectId(null)
    closeScheduleModal()
  }

  const validateSubjectFormFields = subject => {
    const subjectValidationErrors = {}
    if (!subject.subjectName?.trim()) {
      subjectValidationErrors.subjectName = 'Subject name is required'
    }
    if (!subject.subjectCode?.trim()) {
      subjectValidationErrors.subjectCode = 'Subject code is required'
    }
    const sectionValue = subject.section?.trim()
    if (!sectionValue) {
      subjectValidationErrors.section = 'Select a section'
    }
    const savedSchedules = subject.weeklySchedules || []
    if (savedSchedules.length === 0) {
      const scheduleError = validateScheduleFields(subject.schedule)
      subjectValidationErrors.schedule =
        scheduleError || 'Save at least one weekly schedule'
    }
    return subjectValidationErrors
  }

  const handleSaveSubject = () => {
    const validation = validateSubjectFormFields(subjectForm)
    if (Object.keys(validation).length > 0) {
      setSubjectErrors(validation)
      return
    }
    const sectionValue = subjectForm.section?.trim()
    const normalizedSections = sectionValue ? [sectionValue] : []
    const normalizedWeeklySchedules = (subjectForm.weeklySchedules || [])
      .map(entry => {
        const sanitized = sanitizeSchedule(entry)
        if (!sanitized) return null
        return {
          ...sanitized,
          id:
            entry.id ||
            `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        }
      })
      .filter(Boolean)
    const primarySchedule =
      normalizedWeeklySchedules[0] ||
      sanitizeSchedule(subjectForm.schedule) ||
      createEmptySchedule()
    const derivedDay = formatWeekdaySummary(primarySchedule.weekdays || [])
    const derivedTime = formatTimeWindow(
      primarySchedule.startTime,
      primarySchedule.endTime
    )
    const baseSubject = {
      ...subjectForm,
      id: editingSubjectId || subjectForm.id || Date.now(),
      section: sectionValue || '',
      sections: normalizedSections,
      schedule: primarySchedule,
      weeklySchedules: normalizedWeeklySchedules,
      day: derivedDay,
      time: derivedTime
    }
    setSubjects(prev => {
      if (editingSubjectId) {
        return prev.map(subject =>
          subject.id === editingSubjectId ? baseSubject : subject
        )
      }
      return [...prev, baseSubject]
    })
    resetSubjectForm()
  }

  const handleEditSubject = subjectId => {
    const target = subjects.find(subject => subject.id === subjectId)
    if (!target) return
    setEditingSubjectId(subjectId)
    setSubjectErrors({})
    const restoredSchedules =
      target.weeklySchedules && target.weeklySchedules.length
        ? target.weeklySchedules.map(schedule => ({
            ...schedule,
            weekdays: orderWeekdays(schedule.weekdays || []),
            id:
              schedule.id ||
              `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          }))
        : target.schedule
        ? [
            {
              ...target.schedule,
              weekdays: orderWeekdays(target.schedule.weekdays || []),
              id:
                target.schedule.id ||
                `schedule-${Date.now()}-${Math.random()
                  .toString(36)
                  .slice(2, 7)}`
            }
          ]
        : []
    const { sections: legacySections, ...restSubject } = target
    const sectionValue = target.section || legacySections?.[0] || ''
    setSubjectForm({
      ...restSubject,
      section: sectionValue,
      weeklySchedules: restoredSchedules,
      schedule: restoredSchedules[0] || createEmptySchedule()
    })
  }

  const handleRemoveSubject = subjectId => {
    setSubjects(prev => prev.filter(subject => subject.id !== subjectId))
    if (editingSubjectId === subjectId) {
      resetSubjectForm()
    }
  }

  // Fast API call helper
  const makeFastApiCall = useCallback(async (url, options, timeout = 5000) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: 'no-cache'
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.')
      }
      throw error
    }
  }, [])

  // Validate email uniqueness
  const validateEmailUniqueness = useCallback(async () => {
    if (!formData.email.trim() || errors.email) return

    setIsValidatingEmail(true)
    setEmailAvailability({
      status: 'checking',
      message: 'Checking email availability...'
    })
    try {
      const response = await makeFastApiCall(
        '/api/auth/check-email',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({ email: formData.email.trim() })
        },
        3000
      )

      if (response.ok) {
        const data = await response.json()
        if (data.exists) {
          setErrors(prev => ({
            ...prev,
            email: 'This email already exists. Please use a different email.'
          }))
          setEmailExists(true)
          setEmailAvailability({
            status: 'taken',
            message: 'Email already exists.'
          })
        } else {
          setEmailExists(false)
          setEmailAvailability({
            status: 'available',
            message: 'Email is available.'
          })
        }
      }
    } catch (err) {
      console.error('Email validation error:', err)
      setEmailAvailability({
        status: 'error',
        message: 'Unable to verify email right now.'
      })
    } finally {
      setIsValidatingEmail(false)
    }
  }, [formData.email, errors.email, makeFastApiCall])

  // Validate User ID uniqueness
  const validateUserIdUniqueness = useCallback(async () => {
    if (!formData.userId.trim() || errors.userId) return

    setIsValidatingUserId(true)
    try {
      const response = await makeFastApiCall(
        '/api/auth/check-user-id',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify({ userId: formData.userId.trim() })
        },
        3000
      )

      if (response.ok) {
        const data = await response.json()
        if (data.exists) {
          setErrors(prev => ({
            ...prev,
            userId: 'This User ID already exists. Please use a different ID.'
          }))
        }
      }
    } catch (err) {
      console.error('User ID validation error:', err)
    } finally {
      setIsValidatingUserId(false)
    }
  }, [formData.userId, errors.userId, makeFastApiCall])

  // Handle profile picture selection
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
        setProfilePictureError(
          'Please select a valid image file (JPG, PNG, GIF, or WEBP)'
        )
        return
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setProfilePictureError('File size must be less than 5MB')
        return
      }

      // Read and convert to base64
      const reader = new FileReader()
      reader.onloadend = () => {
        setProfilePicture(reader.result)
        setProfilePictureError('')
      }
      reader.onerror = () => {
        setProfilePictureError('Error reading file. Please try again.')
      }
      reader.readAsDataURL(file)
    }
  }

  // Remove profile picture
  const handleRemoveProfilePicture = () => {
    setProfilePicture(null)
    setProfilePictureError('')
    // Reset file input
    const fileInput = document.getElementById('profile-pic-upload')
    if (fileInput) {
      fileInput.value = ''
    }
  }

  // Form submission
  const handleSubmit = async e => {
    e.preventDefault()

    if (isSubmitting) return

    // Validate all fields
    const newErrors = {}
    Object.keys(validators).forEach(field => {
      const error = validators[field](formData[field], formData)
      if (error) newErrors[field] = error
    })

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      setTouched(
        Object.keys(validators).reduce(
          (acc, key) => ({ ...acc, [key]: true }),
          {}
        )
      )
      return
    }

    if (emailExists) {
      setErrors(prev => ({
        ...prev,
        email: 'This email already exists. Please use a different email.'
      }))
      setTouched(prev => ({ ...prev, email: true }))
      return
    }

    const phoneDigits = formData.phone.replace(/\D/g, '')
    if (phoneDigits.length !== 11) {
      setErrors(prev => ({
        ...prev,
        phone: 'Phone number must be exactly 11 digits'
      }))
      setTouched(prev => ({ ...prev, phone: true }))
      return
    }

    setIsSubmitting(true)

    try {
      // Prepare payload
      const payload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
        studentId: formData.userId.trim(),
        phone: phoneDigits,
        department: formData.department,
        course: formData.course,
        schoolYear: formData.schoolYear,
        semester: formData.semester,
        profilePhotoUrl: profilePicture || undefined
      }

      // Add role-specific fields
      if (formData.role === 'student') {
        Object.assign(payload, {
          section: formData.section.trim(),
          yearLevel: formData.yearLevel,
          dateOfBirth: formData.dateOfBirth,
          address: formData.address.trim(),
          guardianName: formData.guardianName.trim(),
          guardianPhone: formData.guardianPhone.trim(),
          guardianRelation: formData.guardianRelation.trim(),
          emergencyContact: formData.emergencyContact.trim(),
          emergencyPhone: formData.emergencyPhone.trim()
        })
      } else if (formData.role === 'instructor' || formData.role === 'admin') {
        Object.assign(payload, {
          officeLocation: formData.officeLocation.trim(),
          experience: formData.experience.trim(),
          specialization: formData.specialization.trim(),
          bio: formData.bio.trim()
        })

        // Add subjects for instructor
        if (formData.role === 'instructor' && subjects.length > 0) {
          payload.subjects = subjects.map(subject => {
            const sectionValue = subject.section || subject.sections?.[0] || ''
            const sanitizedSections = sectionValue
              ? [sectionValue.trim()].filter(Boolean)
              : []
            const schedulePayload =
              subject.schedule && subject.schedule.weekdays?.length
                ? {
                    weekdays: orderWeekdays(subject.schedule.weekdays || []),
                    startTime: subject.schedule.startTime,
                    endTime: subject.schedule.endTime
                  }
                : undefined
            const weeklySchedulesPayload = subject.weeklySchedules?.length
              ? subject.weeklySchedules.map(sanitizeSchedule).filter(Boolean)
              : undefined
            const creditValue =
              subject.credits !== undefined &&
              subject.credits !== null &&
              subject.credits !== ''
                ? Number(subject.credits)
                : undefined
            return {
              subjectName: subject.subjectName?.trim(),
              subjectCode: subject.subjectCode?.trim(),
              sections: sanitizedSections,
              department: subject.department || formData.department,
              schoolYear: subject.schoolYear || formData.schoolYear,
              semester: subject.semester || formData.semester,
              room: subject.room?.trim(),
              meetingLink: subject.meetingLink?.trim(),
              description: subject.description?.trim(),
              credits: Number.isNaN(creditValue) ? undefined : creditValue,
              schedule: schedulePayload,
              weeklySchedules: weeklySchedulesPayload
            }
          })
        }
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      let result
      try {
        result = await response.json()
      } catch {
        throw new Error('Failed to process server response.')
      }

      if (!response.ok || !result?.success) {
        const message =
          result?.message ||
          result?.error ||
          'Account creation failed. Please try again.'
        showError(message)
        sessionStorage.setItem(
          DASHBOARD_ALERT_KEY,
          JSON.stringify({ type: 'error', message })
        )
        return
      }

      const successMessage = `Account created successfully for ${formData.firstName} ${formData.lastName}!`
      showSuccess(successMessage, { autoClose: 4000 })
      sessionStorage.setItem(
        DASHBOARD_ALERT_KEY,
        JSON.stringify({ type: 'success', message: successMessage })
      )
      await new Promise(resolve => setTimeout(resolve, 600))
      navigate('/adminD')
    } catch (error) {
      console.error('Submission error:', error)
      const fallbackMessage =
        error.message || 'An unexpected error occurred. Please try again.'
      showError(fallbackMessage)
      sessionStorage.setItem(
        DASHBOARD_ALERT_KEY,
        JSON.stringify({ type: 'error', message: fallbackMessage })
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Get password strength label and color
  const getPasswordStrengthInfo = () => {
    if (!formData.password) return { label: '', color: neutral.border }
    if (passwordMeetsRequirements)
      return {
        label: 'Strong • Meets requirements',
        color: statusColors.present.border
      }
    return {
      label: 'Incomplete requirements',
      color: statusColors.absent.border
    }
  }

  const strengthInfo = getPasswordStrengthInfo()
  const strengthPercent = (Math.min(passwordStrength, 5) / 5) * 100

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .create-account-input:focus {
          border-color: ${brand.secondary} !important;
          box-shadow: 0 0 0 3px rgba(35, 34, 92, 0.1) !important;
        }
        
        .create-account-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4) !important;
        }
        
        .create-account-cancel:hover {
          background: ${neutral.textMuted} !important;
          color: ${neutral.bgSurface} !important;
        }
      `}</style>

      {/* Header */}
      <div style={styles.header} className='on-brand'>
        <button onClick={() => navigate('/adminD')} style={styles.backButton}>
          <i className='bi bi-arrow-left' style={{ marginRight: 8 }}></i>
          Back to Dashboard
        </button>
        <h1 style={styles.title}>
          <i className='bi bi-person-plus-fill' style={{ marginRight: 12 }}></i>
          Create New Account
        </h1>
        <p style={styles.subtitle}>
          Fill in all required information to create a new user account
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Role Selection */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            <i className='bi bi-person-badge' style={{ marginRight: 8 }}></i>
            User Role
          </h2>
          <div style={styles.roleSelection}>
            {['student', 'instructor', 'admin'].map(role => (
              <label key={role} style={styles.roleOption}>
                <input
                  type='radio'
                  name='role'
                  value={role}
                  checked={formData.role === role}
                  onChange={e => handleChange('role', e.target.value)}
                  style={styles.radio}
                />
                <span style={styles.roleLabel}>
                  <i
                    className={`bi ${
                      role === 'student'
                        ? 'bi-person-fill'
                        : role === 'instructor'
                        ? 'bi-person-badge'
                        : 'bi-shield-fill-check'
                    }`}
                    style={{ marginRight: 8 }}
                  ></i>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Basic Information */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            <i className='bi bi-person-circle' style={{ marginRight: 8 }}></i>
            Basic Information
          </h2>

          {/* Profile Picture Selection */}
          <div
            style={{
              marginBottom: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12
            }}
          >
            <label htmlFor='profile-pic-upload' style={styles.label}>
              Profile Picture{' '}
              <span
                style={{ color: neutral.textSecondary, fontWeight: 'normal' }}
              >
                (Optional)
              </span>
            </label>
            <input
              type='file'
              id='profile-pic-upload'
              accept='image/*'
              style={{ display: 'none' }}
              onChange={handleProfilePictureChange}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  background: profilePicture
                    ? `url(${profilePicture})`
                    : neutral.borderLight,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 36,
                  color: neutral.textMuted,
                  fontWeight: 700,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                  overflow: 'hidden',
                  border: `3px solid ${brand.secondary}`
                }}
              >
                {!profilePicture && (
                  <span>
                    {formData.firstName && formData.lastName
                      ? `${formData.firstName[0] || ''}${
                          formData.lastName[0] || ''
                        }`.toUpperCase()
                      : '?'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label
                  htmlFor='profile-pic-upload'
                  style={{
                    padding: '10px 20px',
                    borderRadius: 8,
                    background: brand.secondary,
                    color: neutral.bgSurface,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-block',
                    textAlign: 'center',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={e => (e.target.style.background = brand.primary)}
                  onMouseOut={e =>
                    (e.target.style.background = brand.secondary)
                  }
                >
                  <i
                    className='bi bi-camera-fill'
                    style={{ marginRight: 6 }}
                  ></i>
                  {profilePicture ? 'Change Picture' : 'Choose Picture'}
                </label>
                {profilePicture && (
                  <button
                    type='button'
                    onClick={handleRemoveProfilePicture}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      background: statusColors.absent.border,
                      color: neutral.bgSurface,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      gap: 6
                    }}
                    onMouseOver={e =>
                      (e.target.style.background = statusColors.absent.text)
                    }
                    onMouseOut={e =>
                      (e.target.style.background = statusColors.absent.border)
                    }
                  >
                    <i
                      className='bi bi-trash-fill'
                      style={{ marginRight: 6 }}
                    ></i>
                    Remove
                  </button>
                )}
              </div>
            </div>
            {profilePictureError && (
              <span style={styles.errorText}>
                <i
                  className='bi bi-exclamation-circle'
                  style={{ marginRight: 4 }}
                ></i>
                {profilePictureError}
              </span>
            )}
            <small
              style={{
                color: neutral.textSecondary,
                fontSize: 12,
                textAlign: 'center',
                maxWidth: 400
              }}
            >
              Supported formats: JPG, PNG, GIF, WEBP. Maximum file size: 5MB
            </small>
          </div>

          <div style={styles.grid}>
            {/* First Name */}
            <div style={styles.fieldGroup}>
              <label htmlFor='firstName' style={styles.label}>
                First Name <span style={styles.required}>*</span>
              </label>
              <input
                id='firstName'
                name='firstName'
                type='text'
                value={formData.firstName}
                onChange={e => handleChange('firstName', e.target.value)}
                onBlur={() => handleBlur('firstName')}
                style={{
                  ...styles.input,
                  borderColor:
                    touched.firstName && errors.firstName
                      ? statusColors.absent.border
                      : neutral.border
                }}
                className='create-account-input'
                placeholder='Enter first name'
                autoComplete='given-name'
              />
              {touched.firstName && errors.firstName && (
                <span style={styles.errorText}>
                  <i
                    className='bi bi-exclamation-circle'
                    style={{ marginRight: 4 }}
                  ></i>
                  {errors.firstName}
                </span>
              )}
            </div>

            {/* Last Name */}
            <div style={styles.fieldGroup}>
              <label htmlFor='lastName' style={styles.label}>
                Last Name <span style={styles.required}>*</span>
              </label>
              <input
                id='lastName'
                name='lastName'
                type='text'
                value={formData.lastName}
                onChange={e => handleChange('lastName', e.target.value)}
                onBlur={() => handleBlur('lastName')}
                style={{
                  ...styles.input,
                  borderColor:
                    touched.lastName && errors.lastName
                      ? statusColors.absent.border
                      : neutral.border
                }}
                className='create-account-input'
                placeholder='Enter last name'
                autoComplete='family-name'
              />
              {touched.lastName && errors.lastName && (
                <span style={styles.errorText}>
                  <i
                    className='bi bi-exclamation-circle'
                    style={{ marginRight: 4 }}
                  ></i>
                  {errors.lastName}
                </span>
              )}
            </div>

            {/* Email */}
            <div style={styles.fieldGroup}>
              <label htmlFor='email' style={styles.label}>
                Email Address <span style={styles.required}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id='email'
                  name='email'
                  type='email'
                  value={formData.email}
                  onChange={e => handleChange('email', e.target.value)}
                  onBlur={() => {
                    handleBlur('email')
                    validateEmailUniqueness()
                  }}
                  style={{
                    ...styles.input,
                    borderColor:
                      touched.email && errors.email
                        ? statusColors.absent.border
                        : neutral.border,
                    paddingRight: isValidatingEmail ? 40 : 16
                  }}
                  className='create-account-input'
                  placeholder='user@example.com'
                  autoComplete='email'
                />
                {isValidatingEmail && <div style={styles.inputSpinner}></div>}
              </div>
              {touched.email && errors.email && (
                <span style={styles.errorText}>
                  <i
                    className='bi bi-exclamation-circle'
                    style={{ marginRight: 4 }}
                  ></i>
                  {errors.email}
                </span>
              )}
              {!errors.email && emailAvailability.status === 'available' && (
                <span style={styles.successText}>
                  <i
                    className='bi bi-check-circle'
                    style={{ marginRight: 4 }}
                  ></i>
                  {emailAvailability.message}
                </span>
              )}
              {!errors.email && emailAvailability.status === 'taken' && (
                <span style={styles.errorText}>
                  <i
                    className='bi bi-exclamation-circle'
                    style={{ marginRight: 4 }}
                  ></i>
                  {emailAvailability.message}
                </span>
              )}
              {!errors.email && emailAvailability.status === 'checking' && (
                <span style={styles.helperText}>
                  <i
                    className='bi bi-arrow-repeat'
                    style={{ marginRight: 4 }}
                  ></i>
                  {emailAvailability.message}
                </span>
              )}
              {!errors.email && emailAvailability.status === 'error' && (
                <span style={styles.errorText}>
                  <i
                    className='bi bi-exclamation-triangle'
                    style={{ marginRight: 4 }}
                  ></i>
                  {emailAvailability.message}
                </span>
              )}
            </div>

            {/* User ID */}
            <div style={styles.fieldGroup}>
              <label htmlFor='userId' style={styles.label}>
                User ID <span style={styles.required}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id='userId'
                  name='userId'
                  type='text'
                  value={formData.userId}
                  onChange={e => handleChange('userId', e.target.value)}
                  onBlur={() => {
                    handleBlur('userId')
                    validateUserIdUniqueness()
                  }}
                  style={{
                    ...styles.input,
                    borderColor:
                      touched.userId && errors.userId
                        ? statusColors.absent.border
                        : neutral.border,
                    paddingRight: isValidatingUserId ? 40 : 16
                  }}
                  className='create-account-input'
                  placeholder='Enter unique user ID'
                  autoComplete='username'
                />
                {isValidatingUserId && <div style={styles.inputSpinner}></div>}
              </div>
              {touched.userId && errors.userId && (
                <span style={styles.errorText}>
                  <i
                    className='bi bi-exclamation-circle'
                    style={{ marginRight: 4 }}
                  ></i>
                  {errors.userId}
                </span>
              )}
            </div>

            {/* Phone */}
            <div style={styles.fieldGroup}>
              <label htmlFor='phone' style={styles.label}>
                Phone Number <span style={styles.required}>*</span>
              </label>
              <input
                id='phone'
                name='phone'
                type='tel'
                value={formData.phone}
                onChange={e => handleChange('phone', e.target.value)}
                onBlur={() => handleBlur('phone')}
                style={{
                  ...styles.input,
                  borderColor:
                    touched.phone && errors.phone
                      ? statusColors.absent.border
                      : neutral.border
                }}
                className='create-account-input'
                placeholder='+63 912 345 6789'
                autoComplete='tel'
              />
              {touched.phone && errors.phone && (
                <span style={styles.errorText}>
                  <i
                    className='bi bi-exclamation-circle'
                    style={{ marginRight: 4 }}
                  ></i>
                  {errors.phone}
                </span>
              )}
            </div>

            {/* Password */}
            <div style={styles.fieldGroup}>
              <label htmlFor='password' style={styles.label}>
                Password <span style={styles.required}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id='password'
                  name='password'
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={e => handleChange('password', e.target.value)}
                  onBlur={() => handleBlur('password')}
                  style={{
                    ...styles.input,
                    borderColor:
                      touched.password && errors.password
                        ? statusColors.absent.border
                        : neutral.border,
                    paddingRight: 40
                  }}
                  className='create-account-input'
                  placeholder='Minimum 8 characters strong password'
                  autoComplete='new-password'
                />
                <button
                  type='button'
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                  aria-label='Toggle password visibility'
                >
                  <i
                    className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}
                  ></i>
                </button>
              </div>
              {formData.password && (
                <div style={styles.strengthMeter}>
                  <div style={styles.strengthBar}>
                    <div
                      style={{
                        ...styles.strengthFill,
                        width: `${strengthPercent}%`,
                        background: strengthInfo.color
                      }}
                    ></div>
                  </div>
                  <span
                    style={{
                      ...styles.strengthLabel,
                      color: strengthInfo.color
                    }}
                  >
                    {strengthInfo.label}
                  </span>
                </div>
              )}
              {touched.password && errors.password && (
                <span style={styles.errorText}>
                  <i
                    className='bi bi-exclamation-circle'
                    style={{ marginRight: 4 }}
                  ></i>
                  {errors.password}
                </span>
              )}
            </div>

            {/* Confirm Password */}
            <div style={styles.fieldGroup}>
              <label htmlFor='confirmPassword' style={styles.label}>
                Confirm Password <span style={styles.required}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id='confirmPassword'
                  name='confirmPassword'
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={e =>
                    handleChange('confirmPassword', e.target.value)
                  }
                  onBlur={() => handleBlur('confirmPassword')}
                  style={{
                    ...styles.input,
                    borderColor:
                      touched.confirmPassword && errors.confirmPassword
                        ? statusColors.absent.border
                        : neutral.border,
                    paddingRight: 40
                  }}
                  className='create-account-input'
                  placeholder='Re-enter password'
                  autoComplete='new-password'
                />
                <button
                  type='button'
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeButton}
                  aria-label='Toggle confirm password visibility'
                >
                  <i
                    className={`bi ${
                      showConfirmPassword ? 'bi-eye-slash' : 'bi-eye'
                    }`}
                  ></i>
                </button>
              </div>
              {touched.confirmPassword && errors.confirmPassword && (
                <span style={styles.errorText}>
                  <i
                    className='bi bi-exclamation-circle'
                    style={{ marginRight: 4 }}
                  ></i>
                  {errors.confirmPassword}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Academic/Professional Information */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            <i className='bi bi-building' style={{ marginRight: 8 }}></i>
            {formData.role === 'student'
              ? 'Academic Information'
              : 'Professional Information'}
          </h2>
          <div style={styles.grid}>
            {/* School Year */}
            <div style={styles.fieldGroup}>
              <label htmlFor='schoolYear' style={styles.label}>
                School Year
              </label>
              <select
                id='schoolYear'
                name='schoolYear'
                value={formData.schoolYear}
                onChange={e => handleChange('schoolYear', e.target.value)}
                style={styles.input}
                className='create-account-input'
                autoComplete='off'
              >
                <option value='2025-2026'>2025-2026</option>
                <option value='2026-2027'>2026-2027</option>
              </select>
            </div>

            {/* Semester */}
            <div style={styles.fieldGroup}>
              <label htmlFor='semester' style={styles.label}>
                Semester
              </label>
              <select
                id='semester'
                name='semester'
                value={formData.semester}
                onChange={e => handleChange('semester', e.target.value)}
                style={styles.input}
                className='create-account-input'
                autoComplete='off'
              >
                <option value='1st Semester'>1st Semester</option>
                <option value='2nd Semester'>2nd Semester</option>
                <option value='Summer'>Summer</option>
              </select>
            </div>

            {/* Department */}
            <div style={styles.fieldGroup}>
              <label htmlFor='department' style={styles.label}>
                Department
              </label>
              <select
                id='department'
                name='department'
                value={formData.department}
                onChange={e => handleChange('department', e.target.value)}
                style={styles.input}
                className='create-account-input'
                autoComplete='off'
              >
                {Object.keys(departmentCourseOptions).map(dept => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Course */}
            <div style={styles.fieldGroup}>
              <label htmlFor='course' style={styles.label}>
                Course
              </label>
              <select
                id='course'
                name='course'
                value={formData.course || ''}
                onChange={e => handleChange('course', e.target.value)}
                style={styles.input}
                className='create-account-input'
                autoComplete='off'
              >
                {(departmentCourseOptions[formData.department] || []).map(
                  course => (
                    <option key={course} value={course}>
                      {course}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Student-Specific Fields */}
        {formData.role === 'student' && (
          <>
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>
                <i className='bi bi-book' style={{ marginRight: 8 }}></i>
                Student Details
              </h2>
              <div style={styles.grid}>
                {/* Section */}
                <div style={styles.fieldGroup}>
                  <label htmlFor='createSection' style={styles.label}>
                    Section <span style={styles.required}>*</span>
                  </label>
                  <input
                    id='createSection'
                    name='section'
                    type='text'
                    value={formData.section}
                    onChange={e => handleChange('section', e.target.value)}
                    onBlur={() => handleBlur('section')}
                    style={{
                      ...styles.input,
                      borderColor:
                        touched.section && errors.section
                          ? statusColors.absent.border
                          : neutral.border
                    }}
                    className='create-account-input'
                    placeholder='e.g., BSIT 3A'
                    autoComplete='off'
                  />
                  {touched.section && errors.section && (
                    <span style={styles.errorText}>
                      <i
                        className='bi bi-exclamation-circle'
                        style={{ marginRight: 4 }}
                      ></i>
                      {errors.section}
                    </span>
                  )}
                </div>

                {/* Year Level */}
                <div style={styles.fieldGroup}>
                  <label htmlFor='createYearLevel' style={styles.label}>
                    Year Level <span style={styles.required}>*</span>
                  </label>
                  <select
                    id='createYearLevel'
                    name='yearLevel'
                    value={formData.yearLevel}
                    onChange={e => handleChange('yearLevel', e.target.value)}
                    onBlur={() => handleBlur('yearLevel')}
                    style={{
                      ...styles.input,
                      borderColor:
                        touched.yearLevel && errors.yearLevel
                          ? statusColors.absent.border
                          : neutral.border
                    }}
                    className='create-account-input'
                    autoComplete='off'
                  >
                    <option value=''>Select Year Level</option>
                    <option value='1st Year'>1st Year</option>
                    <option value='2nd Year'>2nd Year</option>
                    <option value='3rd Year'>3rd Year</option>
                    <option value='4th Year'>4th Year</option>
                  </select>
                  {touched.yearLevel && errors.yearLevel && (
                    <span style={styles.errorText}>
                      <i
                        className='bi bi-exclamation-circle'
                        style={{ marginRight: 4 }}
                      ></i>
                      {errors.yearLevel}
                    </span>
                  )}
                </div>

                {/* Date of Birth */}
                <div style={styles.fieldGroup}>
                  <label htmlFor='createDateOfBirth' style={styles.label}>
                    Date of Birth <span style={styles.required}>*</span>
                  </label>
                  <input
                    id='createDateOfBirth'
                    name='dateOfBirth'
                    type='date'
                    value={formData.dateOfBirth}
                    onChange={e => handleChange('dateOfBirth', e.target.value)}
                    onBlur={() => handleBlur('dateOfBirth')}
                    style={{
                      ...styles.input,
                      borderColor:
                        touched.dateOfBirth && errors.dateOfBirth
                          ? statusColors.absent.border
                          : neutral.border
                    }}
                    className='create-account-input'
                  />
                  {touched.dateOfBirth && errors.dateOfBirth && (
                    <span style={styles.errorText}>
                      <i
                        className='bi bi-exclamation-circle'
                        style={{ marginRight: 4 }}
                      ></i>
                      {errors.dateOfBirth}
                    </span>
                  )}
                </div>

                {/* Address */}
                <div style={{ ...styles.fieldGroup, gridColumn: '1 / -1' }}>
                  <label htmlFor='createAddress' style={styles.label}>
                    Address
                  </label>
                  <input
                    id='createAddress'
                    name='address'
                    type='text'
                    value={formData.address}
                    onChange={e => handleChange('address', e.target.value)}
                    style={styles.input}
                    className='create-account-input'
                    placeholder='Complete residential address'
                    autoComplete='street-address'
                  />
                </div>
              </div>
            </div>

            {/* Guardian Information */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>
                <i className='bi bi-people' style={{ marginRight: 8 }}></i>
                Guardian Information
              </h2>
              <div style={styles.grid}>
                {/* Guardian Name (optional in admin create account) */}
                <div style={styles.fieldGroup}>
                  <label htmlFor='createGuardianName' style={styles.label}>
                    Guardian Name
                  </label>
                  <input
                    id='createGuardianName'
                    name='guardianName'
                    type='text'
                    value={formData.guardianName}
                    onChange={e => handleChange('guardianName', e.target.value)}
                    onBlur={() => handleBlur('guardianName')}
                    style={{
                      ...styles.input,
                      borderColor:
                        touched.guardianName && errors.guardianName
                          ? statusColors.absent.border
                          : neutral.border
                    }}
                    className='create-account-input'
                    placeholder='Parent or Guardian Full Name'
                    autoComplete='name'
                  />
                  {touched.guardianName && errors.guardianName && (
                    <span style={styles.errorText}>
                      <i
                        className='bi bi-exclamation-circle'
                        style={{ marginRight: 4 }}
                      ></i>
                      {errors.guardianName}
                    </span>
                  )}
                </div>

                {/* Guardian Phone (optional in admin create account) */}
                <div style={styles.fieldGroup}>
                  <label htmlFor='createGuardianPhone' style={styles.label}>
                    Guardian Phone
                  </label>
                  <input
                    id='createGuardianPhone'
                    name='guardianPhone'
                    type='tel'
                    value={formData.guardianPhone}
                    onChange={e =>
                      handleChange('guardianPhone', e.target.value)
                    }
                    onBlur={() => handleBlur('guardianPhone')}
                    style={{
                      ...styles.input,
                      borderColor:
                        touched.guardianPhone && errors.guardianPhone
                          ? statusColors.absent.border
                          : neutral.border
                    }}
                    className='create-account-input'
                    placeholder='+63 912 345 6789'
                    autoComplete='tel'
                  />
                  {touched.guardianPhone && errors.guardianPhone && (
                    <span style={styles.errorText}>
                      <i
                        className='bi bi-exclamation-circle'
                        style={{ marginRight: 4 }}
                      ></i>
                      {errors.guardianPhone}
                    </span>
                  )}
                </div>

                {/* Guardian Relation */}
                <div style={styles.fieldGroup}>
                  <label htmlFor='createGuardianRelation' style={styles.label}>
                    Guardian Relation
                  </label>
                  <select
                    id='createGuardianRelation'
                    name='guardianRelation'
                    value={formData.guardianRelation}
                    onChange={e =>
                      handleChange('guardianRelation', e.target.value)
                    }
                    style={styles.input}
                    className='create-account-input'
                    autoComplete='off'
                  >
                    <option value=''>-- Select Relation --</option>
                    <option value='Mother'>Mother</option>
                    <option value='Father'>Father</option>
                    <option value='Guardian'>Guardian</option>
                    <option value='Other'>Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>
                <i
                  className='bi bi-exclamation-triangle'
                  style={{ marginRight: 8 }}
                ></i>
                Emergency Contact
              </h2>
              <div style={styles.grid}>
                {/* Emergency Contact Name */}
                <div style={styles.fieldGroup}>
                  <label htmlFor='createEmergencyContact' style={styles.label}>
                    Emergency Contact Name
                  </label>
                  <input
                    id='createEmergencyContact'
                    name='emergencyContact'
                    type='text'
                    value={formData.emergencyContact}
                    onChange={e =>
                      handleChange('emergencyContact', e.target.value)
                    }
                    style={styles.input}
                    className='create-account-input'
                    placeholder='Emergency contact person'
                    autoComplete='name'
                  />
                </div>

                {/* Emergency Contact Phone */}
                <div style={styles.fieldGroup}>
                  <label htmlFor='createEmergencyPhone' style={styles.label}>
                    Emergency Contact Phone
                  </label>
                  <input
                    id='createEmergencyPhone'
                    name='emergencyPhone'
                    type='tel'
                    value={formData.emergencyPhone}
                    onChange={e =>
                      handleChange('emergencyPhone', e.target.value)
                    }
                    style={styles.input}
                    className='create-account-input'
                    placeholder='+63 912 345 6789'
                    autoComplete='tel'
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Instructor/Admin-Specific Fields */}
        {(formData.role === 'instructor' || formData.role === 'admin') && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>
              <i className='bi bi-briefcase' style={{ marginRight: 8 }}></i>
              Professional Details
            </h2>
            <div style={styles.grid}>
              {/* Office Location */}
              <div style={styles.fieldGroup}>
                <label htmlFor='createOfficeLocation' style={styles.label}>
                  Office Location
                </label>
                <input
                  id='createOfficeLocation'
                  name='officeLocation'
                  type='text'
                  value={formData.officeLocation}
                  onChange={e => handleChange('officeLocation', e.target.value)}
                  onBlur={() => handleBlur('officeLocation')}
                  style={{
                    ...styles.input,
                    borderColor:
                      touched.officeLocation && errors.officeLocation
                        ? statusColors.absent.border
                        : neutral.border
                  }}
                  className='create-account-input'
                  placeholder='e.g., Room 301, IT Building'
                  autoComplete='off'
                />
                {touched.officeLocation && errors.officeLocation && (
                  <span style={styles.errorText}>
                    <i
                      className='bi bi-exclamation-circle'
                      style={{ marginRight: 4 }}
                    ></i>
                    {errors.officeLocation}
                  </span>
                )}
              </div>

              {/* Experience */}
              <div style={styles.fieldGroup}>
                <label htmlFor='createExperience' style={styles.label}>
                  Experience
                </label>
                <input
                  id='createExperience'
                  name='experience'
                  type='text'
                  value={formData.experience}
                  onChange={e => handleChange('experience', e.target.value)}
                  style={styles.input}
                  className='create-account-input'
                  placeholder='e.g., 10 years'
                  autoComplete='off'
                />
              </div>

              {/* Specialization */}
              <div style={{ ...styles.fieldGroup, gridColumn: '1 / -1' }}>
                <label htmlFor='createSpecialization' style={styles.label}>
                  Specialization
                </label>
                <input
                  id='createSpecialization'
                  name='specialization'
                  type='text'
                  value={formData.specialization}
                  onChange={e => handleChange('specialization', e.target.value)}
                  style={styles.input}
                  className='create-account-input'
                  placeholder='e.g., Web Development, Database Management'
                  autoComplete='off'
                />
              </div>

              {/* Bio */}
              {formData.role === 'instructor' && (
                <div style={{ ...styles.fieldGroup, gridColumn: '1 / -1' }}>
                  <label htmlFor='createBio' style={styles.label}>
                    Professional Biography
                  </label>
                  <textarea
                    id='createBio'
                    name='bio'
                    value={formData.bio}
                    onChange={e => handleChange('bio', e.target.value)}
                    style={styles.textarea}
                    className='create-account-input'
                    placeholder='Enter professional biography...'
                    rows={4}
                    autoComplete='off'
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Subjects Section for Instructor */}
        {formData.role === 'instructor' && (
          <div style={styles.section}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginBottom: 24
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h2
                  style={styles.sectionTitle}
                  className='subject-section-title'
                >
                  <i className='bi bi-book' style={{ marginRight: 8 }}></i>
                  Subjects
                </h2>
                {subjects.length > 0 && (
                  <span style={styles.subjectCounterBadge}>
                    {subjects.length}
                  </span>
                )}
              </div>
              <span style={styles.helperText}>
                Add subjects one at a time, assign sections, and lock the
                schedule with the calendar picker.
              </span>
            </div>
            <div style={styles.subjectLayout}>
              <div style={styles.subjectColumn}>
                <div style={styles.subjectColumnHeader}>
                  <h3 style={styles.subjectColumnTitle}>
                    <i
                      className='bi bi-journal-text'
                      style={{ marginRight: 8 }}
                    ></i>
                    {editingSubjectId ? 'Editing subject' : 'Subject builder'}
                  </h3>
                  {editingSubjectId && (
                    <span style={styles.subjectEditingBadge}>Editing mode</span>
                  )}
                </div>
                <div style={styles.grid}>
                  <div style={styles.fieldGroup}>
                    <label htmlFor='createSubjectName' style={styles.label}>
                      Subject Name <span style={styles.required}>*</span>
                    </label>
                    <input
                      id='createSubjectName'
                      name='subjectName'
                      type='text'
                      value={subjectForm.subjectName}
                      onChange={e =>
                        handleSubjectFieldChange('subjectName', e.target.value)
                      }
                      style={{
                        ...styles.input,
                        borderColor: subjectErrors.subjectName
                          ? statusColors.absent.border
                          : neutral.border
                      }}
                      className='create-account-input'
                      placeholder='e.g., Data Structures'
                      autoComplete='off'
                    />
                    {subjectErrors.subjectName && (
                      <span style={styles.errorText}>
                        <i
                          className='bi bi-exclamation-circle'
                          style={{ marginRight: 4 }}
                        ></i>
                        {subjectErrors.subjectName}
                      </span>
                    )}
                  </div>
                  <div style={styles.fieldGroup}>
                    <label htmlFor='createSubjectCode' style={styles.label}>
                      Subject Code <span style={styles.required}>*</span>
                    </label>
                    <input
                      id='createSubjectCode'
                      name='subjectCode'
                      type='text'
                      value={subjectForm.subjectCode}
                      onChange={e =>
                        handleSubjectFieldChange('subjectCode', e.target.value)
                      }
                      style={{
                        ...styles.input,
                        borderColor: subjectErrors.subjectCode
                          ? statusColors.absent.border
                          : neutral.borderLight
                      }}
                      className='create-account-input'
                      placeholder='e.g., IT321'
                      autoComplete='off'
                    />
                    {subjectErrors.subjectCode && (
                      <span style={styles.errorText}>
                        <i
                          className='bi bi-exclamation-circle'
                          style={{ marginRight: 4 }}
                        ></i>
                        {subjectErrors.subjectCode}
                      </span>
                    )}
                  </div>
                  <div style={styles.fieldGroup}>
                    <label htmlFor='createSubjectRoom' style={styles.label}>
                      Room / Location
                    </label>
                    <input
                      id='createSubjectRoom'
                      name='room'
                      type='text'
                      value={subjectForm.room}
                      onChange={e =>
                        handleSubjectFieldChange('room', e.target.value)
                      }
                      style={styles.input}
                      className='create-account-input'
                      placeholder='e.g., Room 204'
                      autoComplete='off'
                    />
                  </div>
                  <div style={styles.fieldGroup}>
                    <label
                      htmlFor='createSubjectMeetingLink'
                      style={styles.label}
                    >
                      Meeting Link
                    </label>
                    <input
                      id='createSubjectMeetingLink'
                      name='meetingLink'
                      type='text'
                      value={subjectForm.meetingLink}
                      onChange={e =>
                        handleSubjectFieldChange('meetingLink', e.target.value)
                      }
                      style={styles.input}
                      className='create-account-input'
                      placeholder='https://meet.google.com/...'
                      autoComplete='url'
                    />
                  </div>
                  <div style={{ ...styles.fieldGroup, gridColumn: '1 / -1' }}>
                    <label
                      htmlFor='createSubjectDescription'
                      style={styles.label}
                    >
                      Description
                    </label>
                    <textarea
                      id='createSubjectDescription'
                      name='description'
                      value={subjectForm.description}
                      onChange={e =>
                        handleSubjectFieldChange('description', e.target.value)
                      }
                      style={styles.textarea}
                      className='create-account-input'
                      placeholder='Short summary or objectives'
                      rows={3}
                      autoComplete='off'
                    />
                  </div>
                  <div style={styles.fieldGroup}>
                    <label htmlFor='createSubjectCredits' style={styles.label}>
                      Credits
                    </label>
                    <input
                      id='createSubjectCredits'
                      name='credits'
                      type='number'
                      min='1'
                      max='6'
                      value={subjectForm.credits}
                      onChange={e =>
                        handleSubjectFieldChange('credits', e.target.value)
                      }
                      style={styles.input}
                      className='create-account-input'
                      placeholder='e.g., 3'
                      autoComplete='off'
                    />
                  </div>
                </div>

                <div style={{ marginTop: 24 }}>
                  <label
                    htmlFor='createSubjectSection'
                    style={{ ...styles.label, marginBottom: 8 }}
                  >
                    <i className='bi bi-people' style={{ marginRight: 8 }}></i>
                    Section <span style={styles.required}>*</span>
                  </label>
                  <select
                    id='createSubjectSection'
                    name='subjectSection'
                    value={subjectForm.section}
                    onChange={e => handleSubjectSectionChange(e.target.value)}
                    style={styles.input}
                    className='create-account-input'
                    autoComplete='off'
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
                  {subjectErrors.section && (
                    <span style={{ ...styles.errorText, marginTop: 8 }}>
                      <i
                        className='bi bi-exclamation-circle'
                        style={{ marginRight: 4 }}
                      ></i>
                      {subjectErrors.section}
                    </span>
                  )}
                </div>

                <div style={styles.scheduleManager}>
                  <div style={styles.scheduleHeaderRow}>
                    <div style={{ ...styles.label, marginBottom: 0 }}>
                      <i
                        className='bi bi-calendar-week'
                        style={{ marginRight: 8 }}
                      ></i>
                      Weekly Schedule
                    </div>
                    <button
                      type='button'
                      onClick={() =>
                        openScheduleModal(
                          subjectForm.weeklySchedules.length ? 0 : null
                        )
                      }
                      style={styles.schedulePrimaryButton}
                    >
                      <i
                        className='bi bi-calendar-plus'
                        style={{ marginRight: 8 }}
                      ></i>
                      {subjectForm.weeklySchedules.length
                        ? 'Manage Schedule'
                        : 'Set Schedule'}
                    </button>
                  </div>
                  <span style={styles.helperText}>
                    Pick the weekdays and daily time window for this subject.
                    Use Done to save, or the + button inside the modal to add
                    more slots.
                  </span>
                  {subjectForm.weeklySchedules.length === 0 ? (
                    <div style={styles.savedScheduleEmpty}>
                      <i
                        className='bi bi-calendar4-event'
                        style={{ fontSize: 40, color: neutral.borderLight }}
                      ></i>
                      <p>No weekly schedules saved yet.</p>
                    </div>
                  ) : (
                    <div style={styles.savedScheduleList}>
                      {subjectForm.weeklySchedules.map((schedule, index) => (
                        <div
                          key={schedule.id || `schedule-${index}`}
                          style={styles.savedScheduleCard}
                        >
                          <div>
                            <div style={styles.savedScheduleDay}>
                              {formatWeekdaySummary(schedule.weekdays || []) ||
                                'No days selected'}
                            </div>
                            <div style={styles.savedScheduleTime}>
                              {schedule.startTime && schedule.endTime
                                ? formatTimeWindow(
                                    schedule.startTime,
                                    schedule.endTime
                                  )
                                : 'No time selected'}
                            </div>
                          </div>
                          <div style={styles.scheduleCardActions}>
                            <button
                              type='button'
                              style={styles.scheduleCardButton}
                              onClick={() => openScheduleModal(index)}
                            >
                              <i
                                className='bi bi-pencil-square'
                                style={{ marginRight: 6 }}
                              ></i>
                              Edit
                            </button>
                            <button
                              type='button'
                              style={{
                                ...styles.scheduleCardButton,
                                color: statusColors.absent.border,
                                borderColor: statusColors.absent.bg
                              }}
                              onClick={() => handleRemoveSavedSchedule(index)}
                            >
                              <i
                                className='bi bi-trash'
                                style={{ marginRight: 6 }}
                              ></i>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {subjectErrors.schedule && (
                    <span style={{ ...styles.errorText, marginTop: 8 }}>
                      <i
                        className='bi bi-exclamation-circle'
                        style={{ marginRight: 4 }}
                      ></i>
                      {subjectErrors.schedule}
                    </span>
                  )}
                  <button
                    type='button'
                    style={styles.scheduleAddButton}
                    onClick={() => openScheduleModal(null)}
                  >
                    <i
                      className='bi bi-plus-circle'
                      style={{ marginRight: 8 }}
                    ></i>
                    {subjectForm.weeklySchedules.length
                      ? 'Add Another Weekly Schedule'
                      : 'Add Weekly Schedule'}
                  </button>
                </div>

                <div style={styles.subjectFormActions}>
                  {editingSubjectId && (
                    <button
                      type='button'
                      onClick={resetSubjectForm}
                      style={styles.secondaryButton}
                    >
                      Cancel edit
                    </button>
                  )}
                  <button
                    type='button'
                    onClick={handleSaveSubject}
                    style={styles.primaryButton}
                  >
                    <i
                      className={`bi ${
                        editingSubjectId ? 'bi-arrow-repeat' : 'bi-plus-circle'
                      }`}
                      style={{ marginRight: 8 }}
                    ></i>
                    {editingSubjectId ? 'Update subject' : 'Add subject'}
                  </button>
                </div>
                <span style={styles.helperText}>
                  Subjects appear in the summary list once you save them.
                </span>
              </div>

              <div style={styles.subjectListColumn}>
                <div style={styles.subjectListHeader}>
                  <h3 style={styles.subjectColumnTitle}>
                    <i
                      className='bi bi-list-check'
                      style={{ marginRight: 8 }}
                    ></i>
                    Added subjects
                  </h3>
                </div>
                {subjects.length === 0 && (
                  <div style={styles.subjectListEmpty}>
                    <i
                      className='bi bi-journal'
                      style={{ fontSize: 48, color: neutral.borderLight }}
                    ></i>
                    <p style={{ marginTop: 12, color: neutral.textMuted }}>
                      No subjects yet. Use the builder on the left to add the
                      first subject.
                    </p>
                  </div>
                )}
                {subjects.map(subject => (
                  <div key={subject.id} style={styles.subjectCard}>
                    <div style={styles.subjectCardHeader}>
                      <div>
                        <div style={styles.subjectTitleRow}>
                          <span style={styles.subjectName}>
                            {subject.subjectName || 'Untitled subject'}
                          </span>
                          {subject.credits && (
                            <span style={styles.subjectCreditTag}>
                              {subject.credits} units
                            </span>
                          )}
                        </div>
                        <span style={styles.subjectCode}>
                          {subject.subjectCode}
                        </span>
                      </div>
                      <div style={styles.subjectCardActions}>
                        <button
                          type='button'
                          onClick={() => handleEditSubject(subject.id)}
                          style={styles.iconButton}
                          aria-label='Edit subject'
                        >
                          <i className='bi bi-pencil-square'></i>
                        </button>
                        <button
                          type='button'
                          onClick={() => handleRemoveSubject(subject.id)}
                          style={{
                            ...styles.iconButton,
                            color: statusColors.absent.border
                          }}
                          aria-label='Remove subject'
                        >
                          <i className='bi bi-trash-fill'></i>
                        </button>
                      </div>
                    </div>
                    <div style={styles.subjectSchedule}>
                      <i
                        className='bi bi-calendar-week'
                        style={{ marginRight: 6 }}
                      ></i>
                      {subject.weeklySchedules?.length ? (
                        <div style={styles.subjectScheduleList}>
                          {subject.weeklySchedules.map((schedule, idx) => (
                            <div
                              key={`${subject.id}-schedule-${
                                schedule.id || idx
                              }`}
                              style={styles.subjectScheduleEntry}
                            >
                              <span style={styles.subjectScheduleDay}>
                                {formatWeekdaySummary(
                                  schedule.weekdays || []
                                ) || 'No days selected'}
                              </span>
                              {schedule.startTime && schedule.endTime && (
                                <span style={styles.subjectScheduleTime}>
                                  {formatTimeWindow(
                                    schedule.startTime,
                                    schedule.endTime
                                  )}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : subject.schedule ? (
                        `${
                          formatWeekdaySummary(
                            subject.schedule.weekdays || []
                          ) || 'No days selected'
                        }${
                          subject.schedule?.startTime &&
                          subject.schedule?.endTime
                            ? ` • ${formatTimeWindow(
                                subject.schedule.startTime,
                                subject.schedule.endTime
                              )}`
                            : ''
                        }`
                      ) : (
                        'Schedule not set'
                      )}
                    </div>
                    <div style={styles.subjectMeta}>
                      <div>
                        <strong>Day:</strong>{' '}
                        {subject.day ||
                          getDayLabelFromSchedule(subject.schedule) ||
                          '—'}
                      </div>
                      <div>
                        <strong>Time:</strong>{' '}
                        {subject.time ||
                          getTimeLabelFromSchedule(subject.schedule) ||
                          '—'}
                      </div>
                      {subject.room && (
                        <div>
                          <strong>Room:</strong> {subject.room}
                        </div>
                      )}
                    </div>
                    {(subject.section || subject.sections?.[0]) && (
                      <div style={styles.subjectSections}>
                        <span style={styles.sectionChip}>
                          {subject.section || subject.sections?.[0]}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={styles.actions}>
          <button
            type='button'
            onClick={() => navigate('/adminD')}
            style={styles.cancelButton}
            className='create-account-cancel'
            disabled={isSubmitting}
          >
            <i className='bi bi-x-circle' style={{ marginRight: 8 }}></i>
            Cancel
          </button>
          <button
            type='submit'
            style={styles.submitButton}
            className='create-account-btn'
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <div style={styles.spinner}></div>
                <span style={{ marginLeft: 8 }}>Creating Account...</span>
              </>
            ) : (
              <>
                <i
                  className='bi bi-check-circle'
                  style={{ marginRight: 8 }}
                ></i>
                Create Account
              </>
            )}
          </button>
        </div>
      </form>
      {isScheduleModalOpen && (
        <div style={styles.modalOverlay} role='dialog' aria-modal='true'>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div>
                <h3 style={styles.modalTitle}>
                  <i
                    className='bi bi-calendar-week'
                    style={{ marginRight: 8 }}
                  ></i>
                  Weekly Schedule
                </h3>
                <p style={styles.modalSubtitle}>
                  Pick the weekdays and daily time window, then press Done to
                  save or + to add another schedule.
                </p>
              </div>
              <button
                type='button'
                onClick={closeScheduleModal}
                style={styles.modalCloseButton}
                aria-label='Close schedule modal'
              >
                <i className='bi bi-x-lg'></i>
              </button>
            </div>
            <SubjectScheduleCalendar
              schedule={subjectForm.schedule}
              onChange={handleSubjectScheduleChange}
              error={subjectErrors.schedule}
              onDone={() => persistScheduleFromModal()}
              onAddAnother={() => persistScheduleFromModal({ reopen: true })}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: neutral.bgPage,
    padding: '40px 20px',
    fontFamily: 'Segoe UI, Arial, sans-serif'
  },
  header: {
    maxWidth: 1200,
    margin: '0 auto 32px',
    background: `linear-gradient(135deg, ${brand.secondary} 0%, ${brand.accent} 100%)`,
    borderRadius: 16,
    padding: 32,
    color: '#ffffff', // Always white on brand background (not neutral.bgSurface which is theme-aware)
    position: 'relative'
  },
  backButton: {
    position: 'absolute',
    top: 24,
    right: 24,
    background: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    color: '#ffffff', // Always white on brand background
    padding: '10px 20px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center'
  },
  title: {
    fontSize: 32,
    fontWeight: 800,
    margin: '0 0 8px 0',
    display: 'flex',
    alignItems: 'center',
    color: '#ffffff' // Explicit white for brand background
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.85)', // White with slight transparency on brand background
    margin: 0,
    fontWeight: 500
  },
  form: {
    maxWidth: 1200,
    margin: '0 auto',
    background: neutral.bgSurface,
    borderRadius: 16,
    padding: 40,
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
  },
  section: {
    marginBottom: 40,
    paddingBottom: 40,
    borderBottom: `2px solid ${neutral.borderLight}`
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: brand.secondary,
    marginBottom: 24,
    display: 'flex',
    alignItems: 'center'
  },
  roleSelection: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap'
  },
  roleOption: {
    flex: 1,
    minWidth: 200,
    display: 'flex',
    alignItems: 'center',
    padding: 16,
    border: `2px solid ${neutral.border}`,
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.2s',
    background: neutral.bgSurface
  },
  radio: {
    width: 20,
    height: 20,
    marginRight: 12,
    cursor: 'pointer',
    accentColor: brand.secondary
  },
  roleLabel: {
    fontSize: 16,
    fontWeight: 600,
    color: brand.secondary,
    display: 'flex',
    alignItems: 'center'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 24
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column'
  },
  label: {
    fontSize: 14,
    fontWeight: 700,
    color: neutral.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  required: {
    color: statusColors.absent.border,
    marginLeft: 4
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
  eyeButton: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    color: neutral.textMuted,
    cursor: 'pointer',
    fontSize: 18,
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  strengthMeter: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 8
  },
  strengthBar: {
    flex: 1,
    height: 6,
    background: neutral.border,
    borderRadius: 3,
    overflow: 'hidden'
  },
  strengthFill: {
    height: '100%',
    transition: 'all 0.3s ease',
    borderRadius: 3
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  helperText: {
    color: neutral.textMuted,
    fontSize: 12,
    marginTop: 6,
    display: 'flex',
    alignItems: 'center',
    fontWeight: 500
  },
  successText: {
    color: interactive.success,
    fontSize: 12,
    marginTop: 6,
    display: 'flex',
    alignItems: 'center',
    fontWeight: 600
  },
  errorText: {
    color: statusColors.absent.border,
    fontSize: 13,
    marginTop: 6,
    display: 'flex',
    alignItems: 'center',
    fontWeight: 500
  },
  inputSpinner: {
    position: 'absolute',
    right: 12,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 20,
    height: 20,
    border: `2px solid ${neutral.border}`,
    borderTop: `2px solid ${brand.secondary}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 40,
    paddingTop: 32,
    borderTop: `2px solid ${neutral.borderLight}`
  },
  cancelButton: {
    padding: '14px 28px',
    borderRadius: 10,
    border: `2px solid ${neutral.textMuted}`,
    background: neutral.bgSurface,
    color: neutral.textMuted,
    fontWeight: 700,
    fontSize: 16,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center'
  },
  submitButton: {
    padding: '14px 28px',
    borderRadius: 10,
    border: 'none',
    background: `linear-gradient(135deg, ${interactive.success} 0%, ${statusColors.present.border} 100%)`,
    color: neutral.bgSurface,
    fontWeight: 700,
    fontSize: 16,
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
    display: 'flex',
    alignItems: 'center'
  },
  spinner: {
    width: 20,
    height: 20,
    border: `2px solid ${neutral.bgMuted}`,
    borderTop: `2px solid ${neutral.bgSurface}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  subjectCounterBadge: {
    background: interactive.success,
    color: neutral.bgSurface,
    padding: '4px 12px',
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 14
  },
  subjectLayout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
    gap: 24,
    alignItems: 'start'
  },
  subjectColumn: {
    background: neutral.bgMuted,
    border: `2px solid ${neutral.border}`,
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 8px 25px rgba(35, 34, 92, 0.05)'
  },
  subjectColumnHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  subjectColumnTitle: {
    margin: 0,
    color: brand.secondary,
    fontSize: 18,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center'
  },
  subjectEditingBadge: {
    background: statusColors.late.bg,
    color: statusColors.late.text,
    padding: '4px 12px',
    borderRadius: 999,
    fontWeight: 600,
    fontSize: 12
  },
  sectionsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionAddButton: {
    padding: '8px 14px',
    borderRadius: 8,
    border: 'none',
    background: brand.secondary,
    color: neutral.bgSurface,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center'
  },
  sectionRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    marginBottom: 12
  },
  sectionRemoveButton: {
    padding: '12px 14px',
    borderRadius: 8,
    border: 'none',
    background: statusColors.absent.border,
    color: neutral.bgSurface,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center'
  },
  subjectFormActions: {
    marginTop: 24,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12
  },
  secondaryButton: {
    padding: '12px 20px',
    borderRadius: 10,
    border: `2px solid ${neutral.border}`,
    background: neutral.bgSurface,
    color: neutral.textSecondary,
    fontWeight: 600,
    cursor: 'pointer'
  },
  primaryButton: {
    padding: '12px 24px',
    borderRadius: 10,
    border: 'none',
    background: `linear-gradient(135deg, ${interactive.success} 0%, ${statusColors.present.border} 100%)`,
    color: neutral.bgSurface,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    boxShadow: '0 6px 16px rgba(16, 185, 129, 0.4)'
  },
  subjectListColumn: {
    background: neutral.bgSurface,
    borderRadius: 16,
    border: `2px dashed ${neutral.borderLight}`,
    padding: 24,
    minHeight: 300
  },
  subjectListHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  subjectListEmpty: {
    border: `2px dashed ${neutral.border}`,
    borderRadius: 16,
    padding: 40,
    textAlign: 'center',
    background: neutral.bgMuted
  },
  subjectCard: {
    border: `2px solid ${neutral.border}`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    background: neutral.bgSurface
  },
  subjectCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12
  },
  subjectCardActions: {
    display: 'flex',
    gap: 8
  },
  subjectTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
  },
  subjectName: {
    fontSize: 16,
    fontWeight: 700,
    color: brand.primary
  },
  subjectCreditTag: {
    background: statusColors.present.bg,
    color: statusColors.present.border,
    padding: '2px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700
  },
  subjectCode: {
    fontSize: 13,
    fontWeight: 600,
    color: neutral.textMuted
  },
  subjectSchedule: {
    marginTop: 12,
    fontSize: 13,
    color: neutral.textPrimary,
    display: 'flex',
    alignItems: 'center'
  },
  subjectMeta: {
    marginTop: 12,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    fontSize: 13,
    color: neutral.textSecondary
  },
  subjectSections: {
    marginTop: 12,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8
  },
  sectionChip: {
    background: brand.primary,
    color: neutral.bgSurface,
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600
  },
  iconButton: {
    background: brand.primary,
    color: neutral.bgSurface,
    border: 'none',
    borderRadius: 8,
    padding: '8px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  subjectScheduleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  subjectScheduleEntry: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6
  },
  subjectScheduleDay: {
    fontWeight: 700
  },
  subjectScheduleTime: {
    color: neutral.textSecondary,
    fontWeight: 500
  },
  scheduleManager: {
    marginTop: 32,
    padding: 20,
    border: `2px solid ${neutral.border}`,
    borderRadius: 16,
    background: neutral.bgMuted,
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  scheduleHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12
  },
  schedulePrimaryButton: {
    padding: '10px 16px',
    borderRadius: 10,
    border: 'none',
    background: brand.primary,
    color: neutral.bgSurface,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center'
  },
  savedScheduleEmpty: {
    border: `2px dashed ${neutral.borderLight}`,
    borderRadius: 12,
    padding: 20,
    textAlign: 'center',
    background: neutral.bgSurface,
    color: neutral.textMuted
  },
  savedScheduleList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  savedScheduleCard: {
    border: `2px solid ${neutral.border}`,
    borderRadius: 12,
    padding: 16,
    background: neutral.bgSurface,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap'
  },
  savedScheduleDay: {
    fontWeight: 700,
    color: neutral.textPrimary,
    fontSize: 15
  },
  savedScheduleTime: {
    color: neutral.textSecondary,
    fontWeight: 500,
    fontSize: 14
  },
  scheduleCardActions: {
    display: 'flex',
    gap: 10
  },
  scheduleCardButton: {
    border: '2px solid #e5e7eb',
    borderRadius: 10,
    padding: '8px 14px',
    background: '#fff',
    color: '#374151',
    cursor: 'pointer',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center'
  },
  scheduleAddButton: {
    alignSelf: 'flex-start',
    padding: '10px 18px',
    borderRadius: 10,
    border: '2px dashed #23225c',
    background: '#fff',
    color: '#23225c',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    marginTop: 4
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 2000
  },
  modalContent: {
    background: '#fff',
    borderRadius: 16,
    width: 'min(640px, 95vw)',
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: 24,
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16
  },
  modalTitle: {
    margin: 0,
    fontSize: 20,
    color: '#23225c'
  },
  modalSubtitle: {
    margin: '6px 0 0',
    color: '#6c757d',
    fontSize: 13
  },
  modalCloseButton: {
    border: 'none',
    background: 'transparent',
    color: '#6c757d',
    cursor: 'pointer',
    fontSize: 18
  }
}

export default CreateAccountForm
