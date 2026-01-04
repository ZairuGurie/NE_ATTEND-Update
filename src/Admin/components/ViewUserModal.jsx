import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { apiGet, apiPut } from '../../utils/api'
import { brand, neutral, status as statusColors } from '../../utils/colors'
// Phase 4: CSS classes for theme-aware styling
import '../../styles/common.css'
import SubjectScheduleCalendar from './SubjectScheduleCalendar'
import {
  calculateTardinessThreshold,
  TARDINESS_TO_ABSENCE_RATIO
} from '../../utils/attendancePolicy'

const computeDurationMinutes = (startTime, endTime) => {
  if (!startTime || !endTime) return null
  const parse = value => {
    const [hStr, mStr = '0'] = String(value).split(':')
    const h = Number(hStr)
    const m = Number(mStr)
    if (Number.isNaN(h) || Number.isNaN(m)) return null
    return h * 60 + m
  }
  const startMinutes = parse(startTime)
  const endMinutes = parse(endTime)
  if (startMinutes == null || endMinutes == null) return null
  const diff = endMinutes - startMinutes
  if (diff <= 0) return null
  return diff
}

const formatDurationLabel = durationMinutes => {
  if (!durationMinutes || durationMinutes <= 0) return ''
  const hours = Math.floor(durationMinutes / 60)
  const minutes = durationMinutes % 60
  const parts = []
  if (hours > 0) {
    parts.push(`${hours} hr${hours > 1 ? 's' : ''}`)
  }
  if (minutes > 0) {
    parts.push(`${minutes} min`)
  }
  return parts.join(' ')
}

const ViewUserModal = ({ isOpen, onClose, user, userType }) => {
  const [expandedSections, setExpandedSections] = useState({})
  const [subjects, setSubjects] = useState([])
  const [loadingSubjects, setLoadingSubjects] = useState(false)

  // Password state for admin viewing
  const [userPassword, setUserPassword] = useState(null)
  const [loadingPassword, setLoadingPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Filter states for subjects/students table
  const [filterSchoolYear, setFilterSchoolYear] = useState('')
  const [filterSemester, setFilterSemester] = useState('')
  const [filterYearLevel, setFilterYearLevel] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [scheduleModalSubject, setScheduleModalSubject] = useState(null)
  const [scheduleForm, setScheduleForm] = useState({
    weekdays: [],
    startTime: '',
    endTime: ''
  })
  const [scheduleError, setScheduleError] = useState('')
  const [scheduleSaving, setScheduleSaving] = useState(false)

  // Fetch password when modal opens
  useEffect(() => {
    const fetchPassword = async () => {
      if (!isOpen || !user?._id) return

      setLoadingPassword(true)
      try {
        const response = await apiGet(`users/${user._id}/password`)
        const result = await response.json()
        if (result.success) {
          setUserPassword(result.data.password)
        } else {
          setUserPassword('(Unable to load)')
        }
      } catch (error) {
        console.error('Error fetching password:', error)
        setUserPassword('(Unable to load)')
      } finally {
        setLoadingPassword(false)
      }
    }

    fetchPassword()
  }, [isOpen, user?._id])

  // Reset filters and password when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFilterSchoolYear('')
      setFilterSemester('')
      setFilterYearLevel('')
      setSearchQuery('')
      setUserPassword(null)
      setShowPassword(false)
      setScheduleModalOpen(false)
      setScheduleModalSubject(null)
      setScheduleForm({
        weekdays: [],
        startTime: '',
        endTime: ''
      })
      setScheduleError('')
      setScheduleSaving(false)
    }
  }, [isOpen])

  // Get unique values for filter dropdowns from students data (for instructor view)
  const filterOptions = useMemo(() => {
    const schoolYears = new Set()
    const semesters = new Set()
    const yearLevels = new Set()

    if (userType === 'instructor') {
      subjects.forEach(subject => {
        subject.sections?.forEach(section => {
          section.students?.forEach(student => {
            if (student.schoolYear) schoolYears.add(student.schoolYear)
            if (student.semester) semesters.add(student.semester)
            if (student.yearLevel) yearLevels.add(student.yearLevel)
          })
        })
      })
    }

    return {
      schoolYears: Array.from(schoolYears).sort(),
      semesters: Array.from(semesters).sort(),
      yearLevels: Array.from(yearLevels).sort()
    }
  }, [subjects, userType])

  // Filter students in sections (for instructor view)
  const filteredSubjects = useMemo(() => {
    if (userType !== 'instructor') return subjects

    return subjects.map(subject => ({
      ...subject,
      sections:
        subject.sections?.map(section => ({
          ...section,
          students:
            section.students?.filter(student => {
              const matchSchoolYear =
                !filterSchoolYear || student.schoolYear === filterSchoolYear
              const matchSemester =
                !filterSemester || student.semester === filterSemester
              const matchYearLevel =
                !filterYearLevel || student.yearLevel === filterYearLevel
              const matchSearch =
                !searchQuery ||
                student.name
                  ?.toLowerCase()
                  .includes(searchQuery.toLowerCase()) ||
                student.studentId
                  ?.toLowerCase()
                  .includes(searchQuery.toLowerCase()) ||
                student.email?.toLowerCase().includes(searchQuery.toLowerCase())
              return (
                matchSchoolYear &&
                matchSemester &&
                matchYearLevel &&
                matchSearch
              )
            }) || []
        })) || []
    }))
  }, [
    subjects,
    filterSchoolYear,
    filterSemester,
    filterYearLevel,
    searchQuery,
    userType
  ])

  // Calculate total filtered students count
  const totalFilteredStudents = useMemo(() => {
    return filteredSubjects.reduce((total, subject) => {
      return (
        total +
        (subject.sections?.reduce((sectionTotal, section) => {
          return sectionTotal + (section.students?.length || 0)
        }, 0) || 0)
      )
    }, 0)
  }, [filteredSubjects])

  const fetchSubjects = useCallback(async () => {
    if (!user || !user._id) return

    setLoadingSubjects(true)
    try {
      if (userType === 'instructor') {
        // Fetch subjects for instructor
        const response = await apiGet(`subjects/instructor/${user._id}`)
        const result = await response.json()

        if (result.success && Array.isArray(result.data)) {
          // For each subject, fetch students by section
          const subjectsWithStudents = await Promise.all(
            result.data
              .filter(s => s.isActive !== false)
              .map(async subject => {
                const sectionsWithStudents = await Promise.all(
                  (subject.sections || []).map(async sectionName => {
                    try {
                      const studentsResponse = await apiGet(
                        `subjects/${subject._id}/students`
                      )
                      if (studentsResponse.ok) {
                        const studentsResult = await studentsResponse.json()
                        if (
                          studentsResult.success &&
                          studentsResult.data?.studentsBySection
                        ) {
                          const sectionStudents =
                            studentsResult.data.studentsBySection[
                              sectionName
                            ] || []
                          return {
                            name: sectionName,
                            students: sectionStudents.map(s => ({
                              _id: s._id,
                              name: `${s.firstName} ${s.lastName}`,
                              email: s.email,
                              profile: `https://i.pravatar.cc/40?u=${
                                s.email || s._id
                              }`,
                              studentId: s.studentId || '',
                              yearLevel: s.yearLevel || '',
                              schoolYear: s.schoolYear || '',
                              semester: s.semester || '',
                              active: s.active !== false ? 'Active' : 'Inactive'
                            }))
                          }
                        }
                      }
                    } catch (error) {
                      console.error(
                        `Error fetching students for section ${sectionName}:`,
                        error
                      )
                    }
                    return {
                      name: sectionName,
                      students: []
                    }
                  })
                )

                return {
                  _id: subject._id,
                  name: subject.subjectName,
                  code: subject.subjectCode,
                  sections: sectionsWithStudents,
                  day: subject.day || '',
                  time: subject.time || '',
                  schedule: subject.schedule || null,
                  room: subject.room || '',
                  meetingLink: subject.meetingLink || ''
                }
              })
          )

          setSubjects(subjectsWithStudents)
        } else {
          setSubjects([])
        }
      } else if (userType === 'student' && user.section) {
        // Fetch subjects for student based on section
        const response = await apiGet(
          `subjects/student/section/${encodeURIComponent(user.section)}`
        )
        const result = await response.json()

        if (result.success && Array.isArray(result.data)) {
          const transformedSubjects = result.data
            .filter(s => s.isActive !== false)
            .map(subject => ({
              _id: subject._id,
              name: subject.subjectName,
              code: subject.subjectCode,
              sections: (subject.sections || []).map(sectionName => ({
                name: sectionName,
                students: []
              })),
              instructor: subject.instructorId
                ? {
                    name: `${subject.instructorId.firstName} ${subject.instructorId.lastName}`,
                    email: subject.instructorId.email || ''
                  }
                : null,
              day: subject.day || '',
              time: subject.time || '',
              schedule: subject.schedule || null,
              room: subject.room || '',
              meetingLink: subject.meetingLink || ''
            }))

          setSubjects(transformedSubjects)
        } else {
          setSubjects([])
        }
      } else {
        setSubjects([])
      }
    } catch (error) {
      console.error('Error fetching subjects:', error)
      setSubjects([])
    } finally {
      setLoadingSubjects(false)
    }
  }, [user, userType])

  useEffect(() => {
    if (isOpen && user) {
      fetchSubjects()
    }
  }, [isOpen, user, fetchSubjects])

  if (!isOpen || !user) return null

  const handleOverlayClick = e => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const toggleSection = (subjectIdx, sectionIdx) => {
    const key = `${subjectIdx}-${sectionIdx}`
    setExpandedSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }

  const openScheduleModal = subject => {
    if (!subject || !subject._id) return
    const baseSchedule = subject.schedule || {}
    setScheduleModalSubject(subject)
    setScheduleForm({
      weekdays: baseSchedule.weekdays || [],
      startTime: baseSchedule.startTime || '',
      endTime: baseSchedule.endTime || ''
    })
    setScheduleError('')
    setScheduleModalOpen(true)
  }

  const closeScheduleModal = () => {
    setScheduleModalOpen(false)
    setScheduleModalSubject(null)
    setScheduleForm({
      weekdays: [],
      startTime: '',
      endTime: ''
    })
    setScheduleError('')
    setScheduleSaving(false)
  }

  const handleScheduleChange = nextSchedule => {
    setScheduleForm(nextSchedule)
    if (scheduleError) {
      setScheduleError('')
    }
  }

  const handleScheduleSave = async () => {
    if (!scheduleModalSubject || !scheduleModalSubject._id) return

    const trimmedWeekdays = Array.isArray(scheduleForm.weekdays)
      ? scheduleForm.weekdays.filter(Boolean)
      : []

    if (
      trimmedWeekdays.length === 0 ||
      !scheduleForm.startTime ||
      !scheduleForm.endTime
    ) {
      setScheduleError(
        'Please select at least one weekday and a valid start and end time.'
      )
      return
    }

    setScheduleSaving(true)
    setScheduleError('')
    try {
      const payload = {
        schedule: {
          weekdays: trimmedWeekdays,
          startTime: scheduleForm.startTime,
          endTime: scheduleForm.endTime
        }
      }

      const response = await apiPut(
        `subjects/${scheduleModalSubject._id}`,
        payload
      )
      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || result.error || 'Failed to update schedule.'
        )
      }

      const updatedSubject = result.data
      setSubjects(prev =>
        prev.map(s =>
          s._id === updatedSubject._id
            ? {
                ...s,
                schedule: updatedSubject.schedule || null,
                day: updatedSubject.day || s.day,
                time: updatedSubject.time || s.time
              }
            : s
        )
      )

      closeScheduleModal()
    } catch (error) {
      console.error('Error updating subject schedule:', error)
      setScheduleError(error.message || 'Failed to update schedule.')
    } finally {
      setScheduleSaving(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
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
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .view-modal-close:hover {
          background: rgba(255, 255, 255, 0.2) !important;
          transform: rotate(90deg);
        }
        .student-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(40, 167, 69, 0.2);
          border-color: ${statusColors.present.border};
          background: ${statusColors.present.bg} !important;
        }
        .expand-toggle-btn:hover {
          background: rgba(35, 34, 92, 0.1) !important;
          transform: scale(1.1);
        }
        .students-header-hover:hover {
          background: ${neutral.bgMuted} !important;
          box-shadow: 0 2px 8px rgba(40, 167, 69, 0.15);
        }
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
            max-height: 0;
          }
          to {
            opacity: 1;
            transform: translateY(0);
            max-height: 500px;
          }
        }
        .students-grid-animated {
          animation: slideDown 0.3s ease-out forwards;
        }
      `}</style>

      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <img
              src={user.profile}
              alt={user.name}
              style={styles.profileImage}
            />
            <div>
              <h2 style={styles.title}>{user.name}</h2>
              <p style={styles.subtitle}>
                {userType === 'instructor' ? (
                  <>
                    <i
                      className='bi bi-person-badge'
                      style={{ marginRight: 6 }}
                    ></i>
                    Instructor
                  </>
                ) : (
                  <>
                    <i
                      className='bi bi-mortarboard-fill'
                      style={{ marginRight: 6 }}
                    ></i>
                    Student
                  </>
                )}
                <span style={{ margin: '0 8px', opacity: 0.5 }}>•</span>
                <span
                  style={{
                    padding: '4px 12px',
                    borderRadius: 12,
                    background:
                      user.active === 'Active'
                        ? `${statusColors.present.border}50`
                        : `${statusColors.absent.border}50`,
                    color:
                      user.active === 'Active'
                        ? statusColors.present.border
                        : statusColors.absent.border,
                    fontWeight: 700,
                    fontSize: 12
                  }}
                >
                  {user.active}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={styles.closeBtn}
            className='view-modal-close'
            aria-label='Close modal'
          >
            <i className='bi bi-x-lg'></i>
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {/* Basic Information */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              <i
                className='bi bi-person-circle'
                style={{ marginRight: 10 }}
              ></i>
              Basic Information
            </h3>
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <div style={styles.infoLabel}>
                  <i className='bi bi-card-text' style={{ marginRight: 6 }}></i>
                  User ID
                </div>
                <div style={styles.infoValue}>{user.id}</div>
              </div>
              <div style={styles.infoItem}>
                <div style={styles.infoLabel}>
                  <i className='bi bi-envelope' style={{ marginRight: 6 }}></i>
                  Email
                </div>
                <div style={styles.infoValue}>{user.email}</div>
              </div>
              <div style={styles.infoItem}>
                <div style={styles.infoLabel}>
                  <i className='bi bi-telephone' style={{ marginRight: 6 }}></i>
                  Phone
                </div>
                <div style={styles.infoValue}>{user.phone || 'N/A'}</div>
              </div>
              <div style={styles.infoItem}>
                <div style={styles.infoLabel}>
                  <i className='bi bi-key' style={{ marginRight: 6 }}></i>
                  Password
                </div>
                <div
                  style={{
                    ...styles.infoValue,
                    fontFamily: 'monospace',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  {loadingPassword ? (
                    <span style={{ color: neutral.textMuted }}>Loading...</span>
                  ) : (
                    <>
                      <span>{showPassword ? userPassword : '••••••••••'}</span>
                      <button
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <i
                          className={`bi ${
                            showPassword ? 'bi-eye-slash' : 'bi-eye'
                          }`}
                          style={{ color: brand.primary }}
                        ></i>
                      </button>
                    </>
                  )}
                </div>
              </div>
              {userType === 'student' && user.address && (
                <div style={{ ...styles.infoItem, gridColumn: '1 / -1' }}>
                  <div style={styles.infoLabel}>
                    <i className='bi bi-geo-alt' style={{ marginRight: 6 }}></i>
                    Address
                  </div>
                  <div style={styles.infoValue}>{user.address}</div>
                </div>
              )}
            </div>
          </div>

          {/* Academic/Professional Information */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              <i className='bi bi-building' style={{ marginRight: 10 }}></i>
              {userType === 'instructor'
                ? 'Professional Information'
                : 'Academic Information'}
            </h3>
            <div style={styles.infoGrid}>
              <div style={styles.infoItem}>
                <div style={styles.infoLabel}>
                  <i className='bi bi-diagram-3' style={{ marginRight: 6 }}></i>
                  Department
                </div>
                <div style={styles.infoValue}>{user.department}</div>
              </div>
              {user.course && (
                <div style={styles.infoItem}>
                  <div style={styles.infoLabel}>
                    <i className='bi bi-book' style={{ marginRight: 6 }}></i>
                    {userType === 'instructor' ? 'Program' : 'Course'}
                  </div>
                  <div style={styles.infoValue}>{user.course}</div>
                </div>
              )}
              <div style={styles.infoItem}>
                <div style={styles.infoLabel}>
                  <i
                    className='bi bi-calendar-event'
                    style={{ marginRight: 6 }}
                  ></i>
                  School Year
                </div>
                <div style={styles.infoValue}>{user.schoolYear}</div>
              </div>
              <div style={styles.infoItem}>
                <div style={styles.infoLabel}>
                  <i className='bi bi-calendar3' style={{ marginRight: 6 }}></i>
                  Semester
                </div>
                <div style={styles.infoValue}>{user.semester}</div>
              </div>

              {/* Student-Specific Fields */}
              {userType === 'student' && (
                <>
                  <div style={styles.infoItem}>
                    <div style={styles.infoLabel}>
                      <i
                        className='bi bi-layout-text-sidebar'
                        style={{ marginRight: 6 }}
                      ></i>
                      Section
                    </div>
                    <div style={styles.infoValue}>{user.section}</div>
                  </div>
                  <div style={styles.infoItem}>
                    <div style={styles.infoLabel}>
                      <i
                        className='bi bi-bar-chart-steps'
                        style={{ marginRight: 6 }}
                      ></i>
                      Year Level
                    </div>
                    <div style={styles.infoValue}>{user.yearLevel}</div>
                  </div>
                  <div style={styles.infoItem}>
                    <div style={styles.infoLabel}>
                      <i className='bi bi-cake2' style={{ marginRight: 6 }}></i>
                      Date of Birth
                    </div>
                    <div style={styles.infoValue}>
                      {user.dateOfBirth
                        ? new Date(user.dateOfBirth).toLocaleDateString(
                            'en-US',
                            {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            }
                          )
                        : 'N/A'}
                    </div>
                  </div>
                  <div style={styles.infoItem}>
                    <div style={styles.infoLabel}>
                      <i
                        className='bi bi-person-hearts'
                        style={{ marginRight: 6 }}
                      ></i>
                      Guardian Name
                    </div>
                    <div style={styles.infoValue}>
                      {user.guardianName || 'N/A'}
                    </div>
                  </div>
                  <div style={styles.infoItem}>
                    <div style={styles.infoLabel}>
                      <i
                        className='bi bi-telephone-forward'
                        style={{ marginRight: 6 }}
                      ></i>
                      Guardian Phone
                    </div>
                    <div style={styles.infoValue}>
                      {user.guardianPhone || 'N/A'}
                    </div>
                  </div>
                  {user.guardianRelation && (
                    <div style={styles.infoItem}>
                      <div style={styles.infoLabel}>
                        <i
                          className='bi bi-person-lines-fill'
                          style={{ marginRight: 6 }}
                        ></i>
                        Guardian Relation
                      </div>
                      <div style={styles.infoValue}>
                        {user.guardianRelation}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Instructor-Specific Fields */}
              {userType === 'instructor' && (
                <>
                  <div style={styles.infoItem}>
                    <div style={styles.infoLabel}>
                      <i
                        className='bi bi-geo-alt'
                        style={{ marginRight: 6 }}
                      ></i>
                      Office Location
                    </div>
                    <div style={styles.infoValue}>{user.officeLocation}</div>
                  </div>
                  {user.experience && (
                    <div style={styles.infoItem}>
                      <div style={styles.infoLabel}>
                        <i
                          className='bi bi-briefcase'
                          style={{ marginRight: 6 }}
                        ></i>
                        Experience
                      </div>
                      <div style={styles.infoValue}>{user.experience}</div>
                    </div>
                  )}
                  {user.specialization && (
                    <div style={{ ...styles.infoItem, gridColumn: '1 / -1' }}>
                      <div style={styles.infoLabel}>
                        <i
                          className='bi bi-star'
                          style={{ marginRight: 6 }}
                        ></i>
                        Specialization
                      </div>
                      <div style={styles.infoValue}>{user.specialization}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Emergency Contact Section - Student Only */}
          {userType === 'student' &&
            (user.emergencyContact || user.emergencyPhone) && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>
                  <i
                    className='bi bi-exclamation-triangle'
                    style={{ marginRight: 10 }}
                  ></i>
                  Emergency Contact
                </h3>
                <div style={styles.infoGrid}>
                  {user.emergencyContact && (
                    <div style={styles.infoItem}>
                      <div style={styles.infoLabel}>
                        <i
                          className='bi bi-person-fill-exclamation'
                          style={{ marginRight: 6 }}
                        ></i>
                        Contact Name
                      </div>
                      <div style={styles.infoValue}>
                        {user.emergencyContact}
                      </div>
                    </div>
                  )}
                  {user.emergencyPhone && (
                    <div style={styles.infoItem}>
                      <div style={styles.infoLabel}>
                        <i
                          className='bi bi-telephone-plus'
                          style={{ marginRight: 6 }}
                        ></i>
                        Contact Phone
                      </div>
                      <div style={styles.infoValue}>{user.emergencyPhone}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Academic Performance - Student Only */}
          {userType === 'student' && (user.gpa || user.units) && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                <i className='bi bi-graph-up' style={{ marginRight: 10 }}></i>
                Academic Performance
              </h3>
              <div style={styles.infoGrid}>
                {user.gpa && (
                  <div style={styles.infoItem}>
                    <div style={styles.infoLabel}>
                      <i className='bi bi-award' style={{ marginRight: 6 }}></i>
                      GPA
                    </div>
                    <div
                      style={{
                        ...styles.infoValue,
                        color:
                          parseFloat(user.gpa) >= 3.5
                            ? statusColors.present.border
                            : brand.primary,
                        fontWeight: 700
                      }}
                    >
                      {user.gpa}
                    </div>
                  </div>
                )}
                {user.units && (
                  <div style={styles.infoItem}>
                    <div style={styles.infoLabel}>
                      <i
                        className='bi bi-journal-check'
                        style={{ marginRight: 6 }}
                      ></i>
                      Total Units
                    </div>
                    <div style={styles.infoValue}>{user.units} units</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Biography Section - Instructor Only */}
          {userType === 'instructor' && user.bio && (
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>
                <i
                  className='bi bi-person-badge'
                  style={{ marginRight: 10 }}
                ></i>
                Biography
              </h3>
              <div style={styles.bioText}>{user.bio}</div>
            </div>
          )}

          {/* Subjects Section */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              <i className='bi bi-book' style={{ marginRight: 10 }}></i>
              {userType === 'instructor'
                ? 'Subjects & Students'
                : 'Enrolled Subjects'}
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

            {/* Filters for Instructor View */}
            {userType === 'instructor' &&
              subjects.length > 0 &&
              !loadingSubjects && (
                <div style={styles.filterBar}>
                  <div style={styles.filterGroup}>
                    <input
                      type='text'
                      placeholder='Search students...'
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={styles.searchInput}
                    />
                  </div>
                  <div style={styles.filterGroup}>
                    <select
                      value={filterSchoolYear}
                      onChange={e => setFilterSchoolYear(e.target.value)}
                      style={styles.filterSelect}
                    >
                      <option value=''>Select</option>
                      {filterOptions.schoolYears.map(sy => (
                        <option key={sy} value={sy}>
                          {sy}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.filterGroup}>
                    <select
                      value={filterSemester}
                      onChange={e => setFilterSemester(e.target.value)}
                      style={styles.filterSelect}
                    >
                      <option value=''>Select</option>
                      {filterOptions.semesters.map(sem => (
                        <option key={sem} value={sem}>
                          {sem}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.filterGroup}>
                    <select
                      value={filterYearLevel}
                      onChange={e => setFilterYearLevel(e.target.value)}
                      style={styles.filterSelect}
                    >
                      <option value=''>Select</option>
                      {filterOptions.yearLevels.map(yl => (
                        <option key={yl} value={yl}>
                          {yl}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(filterSchoolYear ||
                    filterSemester ||
                    filterYearLevel ||
                    searchQuery) && (
                    <button
                      onClick={() => {
                        setFilterSchoolYear('')
                        setFilterSemester('')
                        setFilterYearLevel('')
                        setSearchQuery('')
                      }}
                      style={styles.clearFiltersBtn}
                    >
                      <i
                        className='bi bi-x-circle'
                        style={{ marginRight: 4 }}
                      ></i>
                      Clear
                    </button>
                  )}
                  <div style={styles.filteredCount}>
                    <i className='bi bi-people' style={{ marginRight: 6 }}></i>
                    {totalFilteredStudents} students
                  </div>
                </div>
              )}

            {loadingSubjects ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px',
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
              </div>
            ) : subjects.length === 0 ? (
              <div style={styles.noData}>
                <i
                  className='bi bi-inbox'
                  style={{
                    fontSize: 48,
                    color: neutral.border,
                    marginBottom: 12
                  }}
                ></i>
                <p>
                  No subjects{' '}
                  {userType === 'instructor' ? 'assigned' : 'enrolled'}
                </p>
              </div>
            ) : userType === 'instructor' ? (
              // Instructor View: Table with Subject Name, Section, and Students
              <div style={styles.subjectsTableContainer}>
                <table style={styles.subjectsTable}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th style={styles.tableHeader}>Subject Name</th>
                      <th style={styles.tableHeader}>Subject Code</th>
                      <th style={styles.tableHeader}>Section</th>
                      <th style={styles.tableHeader}>Schedule</th>
                      <th style={styles.tableHeader}>Students</th>
                      <th style={styles.tableHeader}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubjects.map((subject, subjectIdx) =>
                      subject.sections && subject.sections.length > 0 ? (
                        subject.sections.map((section, sectionIdx) => {
                          const sectionKey = `${subjectIdx}-${sectionIdx}`
                          const isExpanded = expandedSections[sectionKey]
                          const scheduleValue = subject.schedule || {}
                          const durationMinutes =
                            scheduleValue.startTime && scheduleValue.endTime
                              ? computeDurationMinutes(
                                  scheduleValue.startTime,
                                  scheduleValue.endTime
                                )
                              : null
                          const durationLabel =
                            formatDurationLabel(durationMinutes)
                          const tardinessThreshold =
                            durationMinutes != null
                              ? calculateTardinessThreshold(durationMinutes)
                              : null

                          return (
                            <React.Fragment key={sectionKey}>
                              <tr style={styles.tableRow}>
                                <td style={styles.tableCell}>
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      color: brand.primary
                                    }}
                                  >
                                    {subject.name}
                                  </div>
                                </td>
                                <td style={styles.tableCell}>
                                  <span
                                    style={{
                                      background: neutral.bgHover,
                                      padding: '4px 10px',
                                      borderRadius: 6,
                                      fontSize: 13,
                                      fontWeight: 600,
                                      color: brand.primary
                                    }}
                                  >
                                    {subject.code}
                                  </span>
                                </td>
                                <td style={styles.tableCell}>
                                  <span style={styles.sectionBadgeInTable}>
                                    <i
                                      className='bi bi-people'
                                      style={{ marginRight: 6, fontSize: 13 }}
                                    ></i>
                                    {section.name}
                                  </span>
                                </td>
                                <td style={styles.tableCell}>
                                  <div style={{ fontSize: 13 }}>
                                    <div>{subject.day || 'N/A'}</div>
                                    <div
                                      style={{
                                        color: neutral.textSecondary,
                                        fontSize: 12,
                                        marginTop: 2
                                      }}
                                    >
                                      {subject.time || 'N/A'}
                                      {durationLabel && (
                                        <div style={styles.scheduleMetaText}>
                                          {durationLabel}
                                          {tardinessThreshold != null && (
                                            <>
                                              {' - Late after '}
                                              {tardinessThreshold}
                                              {' min - '}
                                              {TARDINESS_TO_ABSENCE_RATIO}
                                              {' tardy = 1 absence'}
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td style={styles.tableCell}>
                                  <span
                                    style={{
                                      background:
                                        section.students.length > 0
                                          ? statusColors.present.bg
                                          : statusColors.absent.bg,
                                      color:
                                        section.students.length > 0
                                          ? statusColors.present.text
                                          : statusColors.absent.text,
                                      padding: '4px 12px',
                                      borderRadius: 12,
                                      fontSize: 13,
                                      fontWeight: 600
                                    }}
                                  >
                                    {section.students.length}{' '}
                                    {section.students.length === 1
                                      ? 'Student'
                                      : 'Students'}
                                  </span>
                                </td>
                                <td style={styles.tableCell}>
                                  <div style={styles.actionsCell}>
                                    <button
                                      type='button'
                                      onClick={() => openScheduleModal(subject)}
                                      style={styles.secondaryActionButton}
                                    >
                                      <i
                                        className='bi bi-calendar-week'
                                        style={{ fontSize: 14 }}
                                      ></i>
                                      <span>Edit Schedule</span>
                                    </button>
                                    {section.students.length > 0 && (
                                      <button
                                        type='button'
                                        onClick={() =>
                                          toggleSection(subjectIdx, sectionIdx)
                                        }
                                        style={styles.expandButtonInTable}
                                        aria-label={
                                          isExpanded
                                            ? 'Collapse students'
                                            : 'Expand students'
                                        }
                                      >
                                        <i
                                          className={`bi bi-chevron-${
                                            isExpanded ? 'up' : 'down'
                                          }`}
                                          style={{ fontSize: 14 }}
                                        ></i>
                                        {isExpanded ? 'Hide' : 'Show'} Students
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && section.students.length > 0 && (
                                <tr>
                                  <td
                                    colSpan={6}
                                    style={{ padding: 0, border: 'none' }}
                                  >
                                    <div
                                      style={styles.studentsTableContainer}
                                      className='students-grid-animated'
                                    >
                                      <table style={styles.studentsTable}>
                                        <thead>
                                          <tr
                                            style={
                                              styles.studentsTableHeaderRow
                                            }
                                          >
                                            <th
                                              style={styles.studentsTableHeader}
                                            >
                                              Student ID
                                            </th>
                                            <th
                                              style={styles.studentsTableHeader}
                                            >
                                              Name
                                            </th>
                                            <th
                                              style={styles.studentsTableHeader}
                                            >
                                              Year Level
                                            </th>
                                            <th
                                              style={styles.studentsTableHeader}
                                            >
                                              School Year
                                            </th>
                                            <th
                                              style={styles.studentsTableHeader}
                                            >
                                              Semester
                                            </th>
                                            <th
                                              style={styles.studentsTableHeader}
                                            >
                                              Status
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {section.students.map(
                                            (student, studentIdx) => (
                                              <tr
                                                key={studentIdx}
                                                style={styles.studentsTableRow}
                                                className='student-item'
                                              >
                                                <td
                                                  style={
                                                    styles.studentsTableCell
                                                  }
                                                >
                                                  <span
                                                    style={{
                                                      fontFamily: 'monospace',
                                                      fontSize: 13,
                                                      fontWeight: 600,
                                                      color:
                                                        neutral.textSecondary
                                                    }}
                                                  >
                                                    {student.studentId || 'N/A'}
                                                  </span>
                                                </td>
                                                <td
                                                  style={
                                                    styles.studentsTableCell
                                                  }
                                                >
                                                  <div
                                                    style={{
                                                      display: 'flex',
                                                      alignItems: 'center',
                                                      gap: 10
                                                    }}
                                                  >
                                                    <img
                                                      src={student.profile}
                                                      alt={student.name}
                                                      style={
                                                        styles.studentAvatarInTable
                                                      }
                                                    />
                                                    <span
                                                      style={{
                                                        fontWeight: 600,
                                                        color: brand.primary
                                                      }}
                                                    >
                                                      {student.name}
                                                    </span>
                                                  </div>
                                                </td>
                                                <td
                                                  style={
                                                    styles.studentsTableCell
                                                  }
                                                >
                                                  <span
                                                    style={{
                                                      background:
                                                        neutral.bgHover,
                                                      padding: '4px 10px',
                                                      borderRadius: 6,
                                                      fontSize: 12,
                                                      fontWeight: 600,
                                                      color: brand.primary
                                                    }}
                                                  >
                                                    {student.yearLevel || 'N/A'}
                                                  </span>
                                                </td>
                                                <td
                                                  style={
                                                    styles.studentsTableCell
                                                  }
                                                >
                                                  <span
                                                    style={{
                                                      background:
                                                        neutral.bgHover,
                                                      padding: '4px 10px',
                                                      borderRadius: 6,
                                                      fontSize: 12,
                                                      fontWeight: 600,
                                                      color: brand.primary
                                                    }}
                                                  >
                                                    {student.schoolYear ||
                                                      'N/A'}
                                                  </span>
                                                </td>
                                                <td
                                                  style={
                                                    styles.studentsTableCell
                                                  }
                                                >
                                                  <span
                                                    style={{
                                                      background:
                                                        neutral.bgHover,
                                                      padding: '4px 10px',
                                                      borderRadius: 6,
                                                      fontSize: 12,
                                                      fontWeight: 600,
                                                      color: brand.primary
                                                    }}
                                                  >
                                                    {student.semester || 'N/A'}
                                                  </span>
                                                </td>
                                                <td
                                                  style={
                                                    styles.studentsTableCell
                                                  }
                                                >
                                                  <span
                                                    style={{
                                                      background:
                                                        student.active ===
                                                        'Active'
                                                          ? statusColors.present
                                                              .bg
                                                          : statusColors.absent
                                                              .bg,
                                                      color:
                                                        student.active ===
                                                        'Active'
                                                          ? statusColors.present
                                                              .text
                                                          : statusColors.absent
                                                              .text,
                                                      padding: '4px 12px',
                                                      borderRadius: 12,
                                                      fontSize: 12,
                                                      fontWeight: 600
                                                    }}
                                                  >
                                                    {student.active || 'N/A'}
                                                  </span>
                                                </td>
                                              </tr>
                                            )
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })
                      ) : (
                        <tr key={subjectIdx} style={styles.tableRow}>
                          <td style={styles.tableCell}>
                            <div
                              style={{ fontWeight: 700, color: brand.primary }}
                            >
                              {subject.name}
                            </div>
                          </td>
                          <td style={styles.tableCell}>
                            <span
                              style={{
                                background: neutral.bgHover,
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: 600,
                                color: brand.primary
                              }}
                            >
                              {subject.code}
                            </span>
                          </td>
                          <td style={styles.tableCell}>
                            <span
                              style={{
                                color: neutral.textSecondary,
                                fontStyle: 'italic'
                              }}
                            >
                              No sections
                            </span>
                          </td>
                          <td style={styles.tableCell}>
                            <div style={{ fontSize: 13 }}>
                              <div>{subject.day || 'N/A'}</div>
                              <div
                                style={{
                                  color: neutral.textSecondary,
                                  fontSize: 12,
                                  marginTop: 2
                                }}
                              >
                                {subject.time || 'N/A'}
                              </div>
                            </div>
                          </td>
                          <td style={styles.tableCell}>
                            <span style={{ color: neutral.textSecondary }}>
                              0 Students
                            </span>
                          </td>
                          <td style={styles.tableCell}>-</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              // Student View: Show subjects with sections
              <div style={styles.subjectsTableContainer}>
                <table style={styles.subjectsTable}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th style={styles.tableHeader}>Subject Name</th>
                      <th style={styles.tableHeader}>Subject Code</th>
                      <th style={styles.tableHeader}>Section</th>
                      <th style={styles.tableHeader}>Year Level</th>
                      <th style={styles.tableHeader}>School Year</th>
                      <th style={styles.tableHeader}>Semester</th>
                      <th style={styles.tableHeader}>Schedule</th>
                      <th style={styles.tableHeader}>Instructor</th>
                      <th style={styles.tableHeader}>Room</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((subject, subjectIdx) =>
                      subject.sections && subject.sections.length > 0 ? (
                        subject.sections.map((section, sectionIdx) => (
                          <tr
                            key={`${subjectIdx}-${sectionIdx}`}
                            style={styles.tableRow}
                          >
                            <td style={styles.tableCell}>
                              <div
                                style={{
                                  fontWeight: 700,
                                  color: brand.primary
                                }}
                              >
                                {subject.name}
                              </div>
                            </td>
                            <td style={styles.tableCell}>
                              <span
                                style={{
                                  background: neutral.bgHover,
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: brand.primary
                                }}
                              >
                                {subject.code}
                              </span>
                            </td>
                            <td style={styles.tableCell}>
                              <span style={styles.sectionBadgeInTable}>
                                <i
                                  className='bi bi-people'
                                  style={{ marginRight: 6, fontSize: 13 }}
                                ></i>
                                {section.name}
                              </span>
                            </td>
                            <td style={styles.tableCell}>
                              <span
                                style={{
                                  background: neutral.bgHover,
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: brand.primary
                                }}
                              >
                                {user.yearLevel || 'N/A'}
                              </span>
                            </td>
                            <td style={styles.tableCell}>
                              <span
                                style={{
                                  background: neutral.bgHover,
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: brand.primary
                                }}
                              >
                                {user.schoolYear || 'N/A'}
                              </span>
                            </td>
                            <td style={styles.tableCell}>
                              <span
                                style={{
                                  background: neutral.bgHover,
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: brand.primary
                                }}
                              >
                                {user.semester || 'N/A'}
                              </span>
                            </td>
                            <td style={styles.tableCell}>
                              <div style={{ fontSize: 13 }}>
                                <div>{subject.day || 'N/A'}</div>
                                <div
                                  style={{
                                    color: neutral.textSecondary,
                                    fontSize: 12,
                                    marginTop: 2
                                  }}
                                >
                                  {subject.time || 'N/A'}
                                </div>
                              </div>
                            </td>
                            <td style={styles.tableCell}>
                              {subject.instructor ? (
                                <div
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: brand.primary
                                  }}
                                >
                                  {subject.instructor.name}
                                  {subject.instructor.email && (
                                    <div
                                      style={{
                                        fontSize: 12,
                                        color: neutral.textSecondary,
                                        fontWeight: 400,
                                        marginTop: 2
                                      }}
                                    >
                                      {subject.instructor.email}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span
                                  style={{
                                    color: neutral.textSecondary,
                                    fontStyle: 'italic'
                                  }}
                                >
                                  N/A
                                </span>
                              )}
                            </td>
                            <td style={styles.tableCell}>
                              <span
                                style={{
                                  fontSize: 13,
                                  color: neutral.textSecondary
                                }}
                              >
                                {subject.room || 'N/A'}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr key={subjectIdx} style={styles.tableRow}>
                          <td style={styles.tableCell}>
                            <div
                              style={{ fontWeight: 700, color: brand.primary }}
                            >
                              {subject.name}
                            </div>
                          </td>
                          <td style={styles.tableCell}>
                            <span
                              style={{
                                background: neutral.bgHover,
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 13,
                                fontWeight: 600,
                                color: brand.primary
                              }}
                            >
                              {subject.code}
                            </span>
                          </td>
                          <td style={styles.tableCell}>
                            <span
                              style={{
                                color: neutral.textSecondary,
                                fontStyle: 'italic'
                              }}
                            >
                              No section
                            </span>
                          </td>
                          <td style={styles.tableCell}>
                            <span
                              style={{
                                background: neutral.bgHover,
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: brand.primary
                              }}
                            >
                              {user.yearLevel || 'N/A'}
                            </span>
                          </td>
                          <td style={styles.tableCell}>
                            <span
                              style={{
                                background: neutral.bgHover,
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: brand.primary
                              }}
                            >
                              {user.schoolYear || 'N/A'}
                            </span>
                          </td>
                          <td style={styles.tableCell}>
                            <span
                              style={{
                                background: neutral.bgHover,
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                color: brand.primary
                              }}
                            >
                              {user.semester || 'N/A'}
                            </span>
                          </td>
                          <td style={styles.tableCell}>
                            <div style={{ fontSize: 13 }}>
                              <div>{subject.day || 'N/A'}</div>
                              <div
                                style={{
                                  color: neutral.textSecondary,
                                  fontSize: 12,
                                  marginTop: 2
                                }}
                              >
                                {subject.time || 'N/A'}
                              </div>
                            </div>
                          </td>
                          <td style={styles.tableCell}>
                            {subject.instructor ? (
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: brand.primary
                                }}
                              >
                                {subject.instructor.name}
                              </div>
                            ) : (
                              <span
                                style={{
                                  color: neutral.textSecondary,
                                  fontStyle: 'italic'
                                }}
                              >
                                N/A
                              </span>
                            )}
                          </td>
                          <td style={styles.tableCell}>
                            <span
                              style={{
                                fontSize: 13,
                                color: neutral.textSecondary
                              }}
                            >
                              {subject.room || 'N/A'}
                            </span>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button onClick={onClose} style={styles.closeButton}>
            <i className='bi bi-x-circle' style={{ marginRight: 8 }}></i>
            Close
          </button>
        </div>
      </div>

      {scheduleModalOpen && scheduleModalSubject && (
        <div
          style={styles.scheduleModalOverlay}
          role='dialog'
          aria-modal='true'
        >
          <div style={styles.scheduleModalContent}>
            <div style={styles.scheduleModalHeader}>
              <div>
                <h3 style={styles.scheduleModalTitle}>
                  <i
                    className='bi bi-calendar-week'
                    style={{ marginRight: 8 }}
                  ></i>
                  Edit Schedule
                </h3>
                <p style={styles.scheduleModalSubtitle}>
                  {scheduleModalSubject.name}{' '}
                  {scheduleModalSubject.code &&
                    `(${scheduleModalSubject.code})`}
                </p>
              </div>
              <button
                type='button'
                onClick={closeScheduleModal}
                style={styles.scheduleModalCloseButton}
                aria-label='Close schedule editor'
              >
                <i className='bi bi-x-lg'></i>
              </button>
            </div>
            <div style={{ padding: '0 24px 24px 24px' }}>
              <SubjectScheduleCalendar
                schedule={scheduleForm}
                onChange={handleScheduleChange}
                error={scheduleError}
                isSubmitting={scheduleSaving}
              />
              <div style={styles.scheduleActionRow}>
                <span style={styles.scheduleHint}>
                  Updates will affect how NE-Attend computes lateness and
                  absences for this subject.
                </span>
                <button
                  type='button'
                  onClick={handleScheduleSave}
                  style={styles.schedulePrimaryButton}
                  disabled={scheduleSaving}
                >
                  {scheduleSaving ? 'Saving…' : 'Save schedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(6px)',
    padding: 20,
    animation: 'fadeIn 0.2s ease-out'
  },
  modal: {
    background: neutral.bgSurface,
    borderRadius: 20,
    width: '90%',
    maxWidth: 1000,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 70px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    animation: 'modalSlideIn 0.3s ease-out'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '32px',
    background: `linear-gradient(135deg, ${brand.secondary} 0%, ${brand.accent} 100%)`,
    color: neutral.bgSurface,
    borderBottom: `3px solid ${brand.light}`
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 20
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    border: `4px solid ${neutral.bgSurface}`,
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    objectFit: 'cover'
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    margin: '0 0 8px 0',
    color: neutral.bgSurface
  },
  subtitle: {
    fontSize: 16,
    color: neutral.borderLight,
    margin: 0,
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center'
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: neutral.bgSurface,
    fontSize: 24,
    cursor: 'pointer',
    padding: 12,
    borderRadius: 10,
    transition: 'all 0.3s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '32px',
    background: neutral.bgMuted
  },
  section: {
    background: neutral.bgSurface,
    borderRadius: 16,
    padding: 28,
    marginBottom: 24,
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    border: `1px solid ${neutral.border}`
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: brand.secondary,
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: `3px solid ${neutral.bgPage}`,
    display: 'flex',
    alignItems: 'center'
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 24
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: neutral.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'flex',
    alignItems: 'center'
  },
  infoValue: {
    fontSize: 16,
    fontWeight: 600,
    color: brand.secondary,
    padding: '12px 16px',
    background: neutral.bgMuted,
    borderRadius: 8,
    border: `1px solid ${neutral.border}`
  },
  subjectsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 20
  },
  subjectCard: {
    background: neutral.bgSurface,
    border: `2px solid ${neutral.border}`,
    borderRadius: 12,
    padding: 20,
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
  },
  subjectHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: `2px solid ${neutral.bgPage}`
  },
  subjectName: {
    fontSize: 17,
    fontWeight: 700,
    color: brand.secondary
  },
  sectionsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16
  },
  sectionItem: {
    background: neutral.bgMuted,
    padding: 12,
    borderRadius: 8,
    border: `1px solid ${neutral.border}`
  },
  sectionBadge: {
    fontSize: 15,
    fontWeight: 600,
    color: neutral.textSecondary,
    marginBottom: 8,
    display: 'flex',
    alignItems: 'center'
  },
  studentsBadge: {
    fontSize: 13,
    color: statusColors.present.text,
    fontWeight: 600,
    background: statusColors.present.bg,
    padding: '4px 10px',
    borderRadius: 6,
    display: 'inline-block'
  },
  studentsList: {
    marginTop: 12,
    background: neutral.bgSurface,
    padding: 12,
    borderRadius: 8,
    border: `1px solid ${neutral.border}`
  },
  studentsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: neutral.bgMuted,
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginBottom: 10
  },
  studentsCount: {
    fontSize: 13,
    color: statusColors.present.text,
    fontWeight: 600
  },
  expandButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: brand.secondary,
    transition: 'all 0.2s ease',
    marginLeft: 8
  },
  studentsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: 10
  },
  studentItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    background: neutral.bgMuted,
    borderRadius: 6,
    border: `1px solid ${neutral.borderLight}`,
    transition: 'all 0.2s ease'
  },
  studentAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: `2px solid ${statusColors.present.border}`,
    objectFit: 'cover'
  },
  studentName: {
    fontSize: 14,
    fontWeight: 600,
    color: brand.secondary,
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  instructorList: {
    marginTop: 8
  },
  instructorItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    background: neutral.bgSurface,
    borderRadius: 6,
    border: `1px solid ${neutral.borderLight}`
  },
  instructorAvatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: `2px solid ${brand.secondary}`
  },
  instructorName: {
    fontSize: 14,
    fontWeight: 600,
    color: brand.secondary
  },
  noData: {
    textAlign: 'center',
    padding: 40,
    color: neutral.textMuted,
    fontSize: 15
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '20px 32px',
    borderTop: `2px solid ${neutral.bgPage}`,
    background: neutral.bgSurface
  },
  closeButton: {
    padding: '12px 28px',
    borderRadius: 10,
    border: `2px solid ${brand.secondary}`,
    background: brand.secondary,
    color: neutral.bgSurface,
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    boxShadow: '0 4px 12px rgba(35, 34, 92, 0.3)'
  },
  bioText: {
    fontSize: 15,
    lineHeight: 1.8,
    color: neutral.textSecondary,
    padding: '16px',
    background: neutral.bgMuted,
    borderRadius: 8,
    border: `1px solid ${neutral.border}`,
    textAlign: 'justify'
  },
  subjectsTableContainer: {
    overflowX: 'auto',
    borderRadius: 12,
    border: `1px solid ${neutral.border}`,
    background: neutral.bgSurface
  },
  subjectsTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14
  },
  tableHeaderRow: {
    background: `linear-gradient(135deg, ${brand.secondary} 0%, ${brand.accent} 100%)`,
    color: neutral.bgSurface
  },
  tableHeader: {
    padding: '14px 16px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: `2px solid ${brand.light}`
  },
  tableRow: {
    borderBottom: `1px solid ${neutral.border}`,
    transition: 'background 0.2s ease'
  },
  tableCell: {
    padding: '14px 16px',
    verticalAlign: 'middle',
    color: brand.secondary
  },
  actionsCell: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center'
  },
  sectionBadgeInTable: {
    background: `linear-gradient(135deg, ${brand.secondary} 0%, ${brand.accent} 100%)`,
    color: neutral.bgSurface,
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6
  },
  expandButtonInTable: {
    background: statusColors.present.border,
    color: neutral.bgSurface,
    border: 'none',
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.2s ease'
  },
  studentsTableContainer: {
    background: neutral.bgMuted,
    padding: '16px',
    borderTop: `2px solid ${neutral.border}`
  },
  studentsTable: {
    width: '100%',
    borderCollapse: 'collapse',
    background: neutral.bgSurface,
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
  },
  studentsTableHeaderRow: {
    background: neutral.bgPage,
    borderBottom: `2px solid ${neutral.borderLight}`
  },
  studentsTableHeader: {
    padding: '10px 14px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: 12,
    color: brand.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  studentsTableRow: {
    borderBottom: `1px solid ${neutral.borderLight}`,
    transition: 'background 0.2s ease'
  },
  studentsTableCell: {
    padding: '12px 14px',
    fontSize: 13,
    color: neutral.textSecondary
  },
  studentAvatarInTable: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    border: `2px solid ${statusColors.present.border}`,
    objectFit: 'cover'
  },
  scheduleMetaText: {
    marginTop: 4,
    fontSize: 11,
    color: neutral.textSecondary
  },
  // Filter Bar Styles
  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    padding: '16px',
    background: neutral.bgMuted,
    borderRadius: 12,
    border: `1px solid ${neutral.border}`
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  searchInput: {
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${neutral.border}`,
    fontSize: 13,
    minWidth: 180,
    background: neutral.bgSurface,
    color: brand.secondary,
    outline: 'none',
    transition: 'border-color 0.2s ease'
  },
  filterSelect: {
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${neutral.border}`,
    fontSize: 13,
    minWidth: 140,
    background: neutral.bgSurface,
    color: brand.secondary,
    cursor: 'pointer',
    outline: 'none'
  },
  clearFiltersBtn: {
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: statusColors.absent.bg,
    color: statusColors.absent.text,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s ease'
  },
  filteredCount: {
    marginLeft: 'auto',
    padding: '10px 16px',
    background: statusColors.present.bg,
    color: statusColors.present.text,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center'
  },
  secondaryActionButton: {
    background: neutral.bgSurface,
    color: brand.secondary,
    border: `1px solid ${neutral.border}`,
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.2s ease'
  },
  scheduleModalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: 20
  },
  scheduleModalContent: {
    background: neutral.bgSurface,
    borderRadius: 16,
    width: '90%',
    maxWidth: 640,
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 16px 40px rgba(0,0,0,0.3)'
  },
  scheduleModalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: `1px solid ${neutral.border}`,
    background: neutral.bgMuted
  },
  scheduleModalTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: brand.secondary,
    margin: 0,
    display: 'flex',
    alignItems: 'center'
  },
  scheduleModalSubtitle: {
    fontSize: 13,
    color: neutral.textSecondary,
    marginTop: 4
  },
  scheduleModalCloseButton: {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 18,
    padding: 8,
    borderRadius: 8,
    color: neutral.textSecondary
  },
  scheduleActionRow: {
    marginTop: 16,
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  scheduleHint: {
    fontSize: 12,
    color: neutral.textMuted
  },
  schedulePrimaryButton: {
    padding: '10px 18px',
    borderRadius: 10,
    border: 'none',
    background: brand.secondary,
    color: neutral.bgSurface,
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8
  }
}

export default ViewUserModal
