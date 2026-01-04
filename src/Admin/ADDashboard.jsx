import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import logo from '../assets/Logologin.png'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 4: CSS classes for theme-aware styling
import '../styles/common.css'
import { logout } from '../utils/auth'
import {
  brand,
  neutral,
  status as statusColors,
  interactive
} from '../utils/colors'
import { useTablePagination } from './hooks/useTablePagination'
import { useTableSort } from './hooks/useTableSort'
import { useDebounce } from './hooks/useDebounce'
import ConfirmDialog from './components/ConfirmDialog'
import BulkActions from './components/BulkActions'
import Pagination from './components/Pagination'
import TableSkeleton from './components/TableSkeleton'
import AnalyticsCharts from './components/AnalyticsCharts'
import EditUserModal from './components/EditUserModal'
import ViewUserModal from './components/ViewUserModal'
import BulkStudentUploadModal from './components/BulkStudentUploadModal'
import BulkInstructorUploadModal from './components/BulkInstructorUploadModal'
import {
  exportUsersToCSV,
  exportToPDF,
  exportAnalyticsToCSV
} from './utils/exportUtils'
import {
  showSuccess,
  showError,
  showWarning,
  toastMessages
} from './utils/toastUtils'
const DASHBOARD_ALERT_KEY = 'adminAccountStatus'
import { generateAnalyticsData } from './constants/adminConfig' // Used as fallback in buildAnalyticsData
import { apiGet, apiPut, apiDelete } from '../utils/api'
import StatusBanner from '../components/StatusBanner'

const ADDashboard = () => {
  const navigate = useNavigate()
  const [filterRole, setFilterRole] = useState('Instructor')
  const [searchInstructor, setSearchInstructor] = useState('')
  const [searchStudent, setSearchStudent] = useState('')
  const [filterSchoolYear, setFilterSchoolYear] = useState('')
  const [filterSemester, setFilterSemester] = useState('')
  const [filterYearLevel, setFilterYearLevel] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterInstructorDepartment, setFilterInstructorDepartment] =
    useState('')
  const [filterInstructorStatus, setFilterInstructorStatus] = useState('')
  const [filterSubjectCount, setFilterSubjectCount] = useState('')
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showActivityLog, setShowActivityLog] = useState(false)
  const [showSystemMgmt, setShowSystemMgmt] = useState(false)

  // New states for enhanced features
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState('')
  const [selectedInstructors, setSelectedInstructors] = useState([])
  const [selectedStudents, setSelectedStudents] = useState([])
  const [instructors, setInstructors] = useState([])
  const [students, setStudents] = useState([])
  const [attendanceStats, setAttendanceStats] = useState({
    totalUsers: 0,
    activeSessions: 0,
    attendanceRate: 0,
    lateToday: 0
  })
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'danger'
  })

  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false)
  const [isBulkInstructorUploadOpen, setIsBulkInstructorUploadOpen] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem(DASHBOARD_ALERT_KEY)
    if (!stored) return
    sessionStorage.removeItem(DASHBOARD_ALERT_KEY)
    try {
      const payload = JSON.parse(stored)
      if (!payload?.message) return
      if (payload.type === 'success') {
        showSuccess(payload.message, { autoClose: 4000 })
      } else {
        showError(payload.message, { autoClose: 4000 })
      }
    } catch (error) {
      console.warn('Failed to parse dashboard alert payload', error)
    }
  }, [])

  // Edit modal states
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [editingUserType, setEditingUserType] = useState(null)

  // View modal states
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [viewingUser, setViewingUser] = useState(null)
  const [viewingUserType, setViewingUserType] = useState(null)

  // Fetch users from backend
  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    setApiError('')
    try {
      const response = await apiGet('users')

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(
          result.error || result.message || 'Failed to fetch users'
        )
      }

      const users = result.data || []

      // Fetch subjects for all instructors
      const instructorIds = users
        .filter(u => u.role === 'instructor')
        .map(u => u._id)
      const subjectsMap = {} // Map instructorId to subjects array
      const studentCountsMap = {} // Map instructorId to total student count
      const studentSubjectsMap = {} // Map studentId to subjects array (based on section matching)

      // Fetch subjects for students based on their sections
      const students = users.filter(u => u.role === 'student')

      // Group students by section for efficient fetching
      const studentsBySection = {}
      students.forEach(student => {
        if (student.section) {
          const section = student.section.trim()
          if (!studentsBySection[section]) {
            studentsBySection[section] = []
          }
          studentsBySection[section].push(student)
        }
      })

      // Fetch subjects for each unique section in parallel
      const uniqueSections = Object.keys(studentsBySection)
      if (uniqueSections.length > 0) {
        try {
          const sectionSubjectPromises = uniqueSections.map(async section => {
            try {
              const response = await apiGet(
                `subjects/student/section/${encodeURIComponent(section)}`
              )
              if (response.ok) {
                const result = await response.json()
                if (result.success && Array.isArray(result.data)) {
                  return { section, subjects: result.data }
                }
              }
            } catch (error) {
              console.error(
                `Error fetching subjects for section ${section}:`,
                error
              )
            }
            return { section, subjects: [] }
          })

          const sectionSubjectResults = await Promise.all(
            sectionSubjectPromises
          )

          // Map subjects to each student by section
          sectionSubjectResults.forEach(({ section, subjects }) => {
            const studentsInSection = studentsBySection[section] || []
            studentsInSection.forEach(student => {
              studentSubjectsMap[student._id.toString()] = subjects
            })
          })

          // Handle students without sections
          students.forEach(student => {
            if (!student.section || !student.section.trim()) {
              studentSubjectsMap[student._id.toString()] = []
            }
          })
        } catch (error) {
          console.error('Error fetching subjects for students:', error)
          // Initialize all students with empty subjects array on error
          students.forEach(student => {
            studentSubjectsMap[student._id.toString()] = []
          })
        }
      }

      if (instructorIds.length > 0) {
        try {
          // Fetch all groups to calculate student counts
          const groupsResponse = await apiGet('groups')
          let allGroups = []
          if (groupsResponse.ok) {
            const groupsResult = await groupsResponse.json()
            allGroups = groupsResult.data || []
          }

          // Fetch subjects for each instructor in parallel
          const subjectPromises = instructorIds.map(async instructorId => {
            try {
              const subjectsResponse = await apiGet(
                `subjects/instructor/${instructorId}`
              )
              if (subjectsResponse.ok) {
                const subjectsResult = await subjectsResponse.json()
                if (
                  subjectsResult.success &&
                  Array.isArray(subjectsResult.data)
                ) {
                  // Filter only active subjects
                  const activeSubjects = subjectsResult.data.filter(
                    s => s.isActive !== false
                  )

                  // Calculate total students from groups
                  const enrolledStudentIds = new Set()

                  // Get groups for this instructor
                  const instructorGroups = allGroups.filter(
                    g =>
                      g.instructorId &&
                      (g.instructorId._id?.toString() ===
                        instructorId.toString() ||
                        g.instructorId.toString() === instructorId.toString())
                  )

                  // Count unique approved members across all groups
                  instructorGroups.forEach(group => {
                    if (Array.isArray(group.members)) {
                      group.members.forEach(member => {
                        const memberId =
                          member.userId?._id?.toString() ||
                          member.userId?.toString()
                        if (memberId && member.status === 'approved') {
                          enrolledStudentIds.add(memberId)
                        }
                      })
                    }
                  })

                  // Also count students by section from subjects (for subjects without groups)
                  // This ensures we count students even if they haven't been assigned to groups yet
                  const subjectIds = activeSubjects
                    .map(s => s._id?.toString())
                    .filter(Boolean)
                  const subjectStudentPromises = subjectIds.map(
                    async subjectId => {
                      try {
                        const studentsResponse = await apiGet(
                          `subjects/${subjectId}/students`
                        )
                        if (studentsResponse.ok) {
                          const studentsResult = await studentsResponse.json()
                          if (
                            studentsResult.success &&
                            Array.isArray(studentsResult.data?.students)
                          ) {
                            return studentsResult.data.students.map(s =>
                              s._id?.toString()
                            )
                          }
                        }
                      } catch {
                        // Continue if fetching students for one subject fails
                      }
                      return []
                    }
                  )

                  const subjectStudentsArrays = await Promise.all(
                    subjectStudentPromises
                  )
                  subjectStudentsArrays.forEach(studentIds => {
                    studentIds.forEach(studentId => {
                      if (studentId) enrolledStudentIds.add(studentId)
                    })
                  })

                  const totalStudents = enrolledStudentIds.size

                  return {
                    instructorId,
                    subjects: activeSubjects,
                    totalStudents
                  }
                }
              }
            } catch (error) {
              console.error(
                `Error fetching subjects for instructor ${instructorId}:`,
                error
              )
            }
            return { instructorId, subjects: [], totalStudents: 0 }
          })

          const subjectResults = await Promise.all(subjectPromises)
          subjectResults.forEach(
            ({ instructorId, subjects, totalStudents }) => {
              subjectsMap[instructorId.toString()] = subjects || []
              studentCountsMap[instructorId.toString()] = totalStudents || 0
            }
          )
        } catch (error) {
          console.error('Error fetching subjects:', error)
          // Continue even if subject fetch fails
        }
      }

      // Transform API response to match component structure
      const transformedUsers = users.map(user => {
        const userId = user._id?.toString()
        const userSubjects =
          user.role === 'instructor'
            ? subjectsMap[userId] || []
            : user.role === 'student'
            ? studentSubjectsMap[userId] || []
            : []
        const userTotalStudents =
          user.role === 'instructor' ? studentCountsMap[userId] || 0 : 0

        return {
          id: user.studentId || user._id || user.id,
          name:
            `${user.firstName || ''} ${user.lastName || ''}`.trim() ||
            'Unknown',
          email: user.email || '',
          phone: user.phone || '',
          department: user.department || '',
          course: user.course || '',
          officeLocation: user.officeLocation || '',
          officeHours: user.officeHours || '',
          schoolYear: user.schoolYear || '',
          semester: user.semester || '',
          education: user.education || '',
          experience: user.experience || '',
          specialization: user.specialization || '',
          bio: user.bio || '',
          profile:
            user.profilePicture ||
            `https://i.pravatar.cc/40?u=${user.email || user._id}`,
          active: user.active === false ? 'Inactive' : 'Active',
          section: user.section || '',
          yearLevel: user.yearLevel || '',
          dateOfBirth: user.dateOfBirth || '',
          address: user.address || '',
          guardianName: user.guardianName || '',
          guardianPhone: user.guardianPhone || '',
          guardianRelation: user.guardianRelation || '',
          emergencyContact: user.emergencyContact || '',
          emergencyPhone: user.emergencyPhone || '',
          gpa: user.gpa || '',
          units: user.units || '',
          subjects: userSubjects, // Populated from subjects API (based on role: instructor gets their subjects, student gets subjects matching their section)
          totalStudents: userTotalStudents, // Total students count for instructor
          _id: user._id, // Keep MongoDB ID for API calls
          role: user.role || 'student' // Keep role for filtering
        }
      })

      // Filter by role
      const instructorUsers = transformedUsers.filter(
        u => u.role === 'instructor'
      )
      const studentUsers = transformedUsers.filter(u => u.role === 'student')

      setInstructors(instructorUsers)
      setStudents(studentUsers)
    } catch (error) {
      console.error('Error fetching users:', error)
      showError(`Failed to load users: ${error.message}`)
      setApiError(
        error?.message
          ? `Failed to load users and subjects: ${error.message}`
          : 'Failed to load users and subjects. Please try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch attendance stats
  const fetchAttendanceStats = useCallback(async () => {
    try {
      // Fetch recent attendance to calculate stats
      const response = await apiGet('attendance/recent?limit=1000')
      if (response.ok) {
        const result = await response.json()
        const attendanceRecords = result.data || []

        // Calculate stats
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const todayRecords = attendanceRecords.filter(record => {
          if (!record.sessionDate) return false
          const recordDate = new Date(record.sessionDate)
          recordDate.setHours(0, 0, 0, 0)
          return recordDate.getTime() === today.getTime()
        })

        const lateToday = todayRecords.filter(
          r => r.status === 'Late' || r.rawStatus === 'late'
        ).length
        const presentToday = todayRecords.filter(
          r => r.status === 'Present' || r.rawStatus === 'present'
        ).length
        const totalToday = todayRecords.length
        const attendanceRate =
          totalToday > 0 ? Math.round((presentToday / totalToday) * 100) : 0

        // Get unique session IDs for active sessions
        const uniqueSessions = new Set(
          attendanceRecords.map(r => r.meetCode || r.sessionId).filter(Boolean)
        )

        setAttendanceStats({
          totalUsers: instructors.length + students.length,
          activeSessions: uniqueSessions.size,
          attendanceRate,
          lateToday
        })
      }
    } catch (error) {
      console.error('Error fetching attendance stats:', error)
      // Don't show error to user, just use defaults
    }
  }, [instructors.length, students.length])

  // Fetch all users on component mount
  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Update attendance stats when users change
  useEffect(() => {
    if (instructors.length > 0 || students.length > 0) {
      fetchAttendanceStats()
    }
  }, [instructors.length, students.length, fetchAttendanceStats])

  const handleBulkUploadCompleted = summary => {
    // Refresh users list so newly created students appear
    fetchUsers()
  }

  // Build real analytics data from attendance records
  const buildAnalyticsData = useCallback(async () => {
    try {
      const response = await apiGet('attendance/recent?limit=5000')
      if (!response.ok) {
        return generateAnalyticsData() // Fallback to mock data if fetch fails
      }

      const result = await response.json()
      const attendanceRecords = result.data || []

      // Group records by date for last 7 days
      const last7Days = []
      const today = new Date()

      for (let i = 6; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        date.setHours(0, 0, 0, 0)

        const dayRecords = attendanceRecords.filter(record => {
          if (!record.sessionDate) return false
          const recordDate = new Date(record.sessionDate)
          recordDate.setHours(0, 0, 0, 0)
          return recordDate.getTime() === date.getTime()
        })

        const present = dayRecords.filter(
          r =>
            r.status === 'Present' ||
            r.status === 'present' ||
            r.rawStatus === 'present'
        ).length
        const late = dayRecords.filter(
          r =>
            r.status === 'Late' || r.status === 'late' || r.rawStatus === 'late'
        ).length
        const absent = dayRecords.filter(
          r =>
            r.status === 'Absent' ||
            r.status === 'absent' ||
            r.rawStatus === 'absent'
        ).length
        const total = present + late + absent
        const attendance = total > 0 ? Math.round((present / total) * 100) : 0

        last7Days.push({
          date: date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
          }),
          attendance,
          late,
          absent
        })
      }

      return last7Days
    } catch (error) {
      console.error('Error building analytics data:', error)
      return generateAnalyticsData() // Fallback to mock data on error
    }
  }, [])

  const handleLogout = () => logout(navigate)

  // Debounced search values
  const debouncedInstructorSearch = useDebounce(searchInstructor, 300)
  const debouncedStudentSearch = useDebounce(searchStudent, 300)

  // Memoized filtered data
  const filteredInstructors = useMemo(
    () =>
      instructors.filter(inst => {
        const nameMatch = inst.name
          .toLowerCase()
          .includes(debouncedInstructorSearch.toLowerCase())
        const schoolYearMatch =
          !filterSchoolYear || inst.schoolYear === filterSchoolYear
        const semesterMatch =
          !filterSemester || inst.semester === filterSemester
        const departmentMatch =
          !filterInstructorDepartment ||
          inst.department === filterInstructorDepartment
        const statusMatch =
          !filterInstructorStatus || inst.active === filterInstructorStatus

        // Calculate total subjects count
        const totalSubjects = inst.subjects.length
        let subjectCountMatch = true
        if (filterSubjectCount) {
          switch (filterSubjectCount) {
            case '1-2':
              subjectCountMatch = totalSubjects >= 1 && totalSubjects <= 2
              break
            case '3-4':
              subjectCountMatch = totalSubjects >= 3 && totalSubjects <= 4
              break
            case '5+':
              subjectCountMatch = totalSubjects >= 5
              break
            default:
              subjectCountMatch = true
          }
        }

        return (
          nameMatch &&
          schoolYearMatch &&
          semesterMatch &&
          departmentMatch &&
          statusMatch &&
          subjectCountMatch
        )
      }),
    [
      instructors,
      debouncedInstructorSearch,
      filterSchoolYear,
      filterSemester,
      filterInstructorDepartment,
      filterInstructorStatus,
      filterSubjectCount
    ]
  )

  const filteredStudents = useMemo(
    () =>
      students.filter(stud => {
        const nameMatch = stud.name
          .toLowerCase()
          .includes(debouncedStudentSearch.toLowerCase())
        const schoolYearMatch =
          !filterSchoolYear || stud.schoolYear === filterSchoolYear
        const semesterMatch =
          !filterSemester || stud.semester === filterSemester
        const yearLevelMatch =
          !filterYearLevel || stud.yearLevel === filterYearLevel
        const departmentMatch =
          !filterDepartment || stud.department === filterDepartment
        const statusMatch = !filterStatus || stud.active === filterStatus
        return (
          nameMatch &&
          schoolYearMatch &&
          semesterMatch &&
          yearLevelMatch &&
          departmentMatch &&
          statusMatch
        )
      }),
    [
      students,
      debouncedStudentSearch,
      filterSchoolYear,
      filterSemester,
      filterYearLevel,
      filterDepartment,
      filterStatus
    ]
  )

  // Sorting hooks
  const {
    sortedData: sortedInstructors,
    handleSort: handleInstructorSort,
    sortKey: instructorSortKey,
    sortDirection: instructorSortDirection
  } = useTableSort(filteredInstructors)
  const {
    sortedData: sortedStudents,
    handleSort: handleStudentSort,
    sortKey: studentSortKey,
    sortDirection: studentSortDirection
  } = useTableSort(filteredStudents)

  // Pagination hooks
  const instructorPagination = useTablePagination(sortedInstructors, 10)
  const studentPagination = useTablePagination(sortedStudents, 10)

  // Reset pagination when filters change
  useEffect(() => {
    instructorPagination.resetPagination()
  }, [
    filterSchoolYear,
    filterSemester,
    filterInstructorDepartment,
    filterInstructorStatus,
    filterSubjectCount,
    debouncedInstructorSearch,
    instructorPagination
  ])

  useEffect(() => {
    studentPagination.resetPagination()
  }, [
    filterSchoolYear,
    filterSemester,
    filterYearLevel,
    filterDepartment,
    filterStatus,
    debouncedStudentSearch,
    studentPagination
  ])

  // Bulk selection handlers
  const handleSelectInstructor = useCallback(instructorId => {
    setSelectedInstructors(prev =>
      prev.includes(instructorId)
        ? prev.filter(id => id !== instructorId)
        : [...prev, instructorId]
    )
  }, [])

  const handleSelectAllInstructors = useCallback(
    checked => {
      if (checked) {
        setSelectedInstructors(
          instructorPagination.paginatedData.map(inst => inst.id)
        )
      } else {
        setSelectedInstructors([])
      }
    },
    [instructorPagination.paginatedData]
  )

  const handleSelectStudent = useCallback(studentId => {
    setSelectedStudents(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    )
  }, [])

  const handleSelectAllStudents = useCallback(
    checked => {
      if (checked) {
        setSelectedStudents(
          studentPagination.paginatedData.map(stud => stud.id)
        )
      } else {
        setSelectedStudents([])
      }
    },
    [studentPagination.paginatedData]
  )

  // Action handlers
  const handleActivateUser = useCallback(
    async user => {
      setConfirmDialog({
        isOpen: true,
        title: 'Activate User',
        message: `Are you sure you want to activate ${user.name}?`,
        variant: 'info',
        onConfirm: async () => {
          try {
            const userId = user._id || user.id
            const response = await apiPut(`users/${userId}`, { active: true })

            if (!response.ok) {
              const errorData = await response.json()
              throw new Error(
                errorData.error ||
                  errorData.message ||
                  'Failed to activate user'
              )
            }

            const result = await response.json()
            if (result.success) {
              showSuccess(toastMessages.userActivated(user.name))
              // Refresh user list
              await fetchUsers()
            } else {
              throw new Error(
                result.error || result.message || 'Failed to activate user'
              )
            }
          } catch (error) {
            console.error('Error activating user:', error)
            showError(`Failed to activate user: ${error.message}`)
          }
        }
      })
    },
    [fetchUsers]
  )

  const handleDeactivateUser = useCallback(
    async user => {
      setConfirmDialog({
        isOpen: true,
        title: 'Deactivate User',
        message: `Are you sure you want to deactivate ${user.name}?`,
        variant: 'warning',
        onConfirm: async () => {
          try {
            const userId = user._id || user.id
            const response = await apiPut(`users/${userId}`, { active: false })

            if (!response.ok) {
              const errorData = await response.json()
              throw new Error(
                errorData.error ||
                  errorData.message ||
                  'Failed to deactivate user'
              )
            }

            const result = await response.json()
            if (result.success) {
              showSuccess(toastMessages.userDeactivated(user.name))
              // Refresh user list
              await fetchUsers()
            } else {
              throw new Error(
                result.error || result.message || 'Failed to deactivate user'
              )
            }
          } catch (error) {
            console.error('Error deactivating user:', error)
            showError(`Failed to deactivate user: ${error.message}`)
          }
        }
      })
    },
    [fetchUsers]
  )

  const handleBulkActivate = useCallback(
    async userType => {
      const selected =
        userType === 'instructor' ? selectedInstructors : selectedStudents
      if (selected.length === 0) {
        showWarning(toastMessages.noSelection())
        return
      }
      setConfirmDialog({
        isOpen: true,
        title: 'Activate Users',
        message: `Are you sure you want to activate ${selected.length} user(s)?`,
        variant: 'info',
        onConfirm: async () => {
          try {
            const users = userType === 'instructor' ? instructors : students
            const selectedUsers = users.filter(u =>
              selected.includes(u.id || u._id)
            )

            const updatePromises = selectedUsers.map(user => {
              const userId = user._id || user.id
              return apiPut(`users/${userId}`, { active: true })
            })

            const responses = await Promise.all(updatePromises)
            const errors = []

            responses.forEach((response, index) => {
              if (!response.ok) {
                errors.push(selectedUsers[index].name)
              }
            })

            if (errors.length > 0) {
              showError(
                `Failed to activate ${errors.length} user(s): ${errors.join(
                  ', '
                )}`
              )
            } else {
              showSuccess(toastMessages.usersActivated(selected.length))
            }

            // Refresh user list
            await fetchUsers()

            if (userType === 'instructor') {
              setSelectedInstructors([])
            } else {
              setSelectedStudents([])
            }
          } catch (error) {
            console.error('Error in bulk activate:', error)
            showError(`Failed to activate users: ${error.message}`)
          }
        }
      })
    },
    [selectedInstructors, selectedStudents, instructors, students, fetchUsers]
  )

  const handleBulkDeactivate = useCallback(
    async userType => {
      const selected =
        userType === 'instructor' ? selectedInstructors : selectedStudents
      if (selected.length === 0) {
        showWarning(toastMessages.noSelection())
        return
      }
      setConfirmDialog({
        isOpen: true,
        title: 'Deactivate Users',
        message: `Are you sure you want to deactivate ${selected.length} user(s)?`,
        variant: 'warning',
        onConfirm: async () => {
          try {
            const users = userType === 'instructor' ? instructors : students
            const selectedUsers = users.filter(u =>
              selected.includes(u.id || u._id)
            )

            const updatePromises = selectedUsers.map(user => {
              const userId = user._id || user.id
              return apiPut(`users/${userId}`, { active: false })
            })

            const responses = await Promise.all(updatePromises)
            const errors = []

            responses.forEach((response, index) => {
              if (!response.ok) {
                errors.push(selectedUsers[index].name)
              }
            })

            if (errors.length > 0) {
              showError(
                `Failed to deactivate ${errors.length} user(s): ${errors.join(
                  ', '
                )}`
              )
            } else {
              showSuccess(toastMessages.usersDeactivated(selected.length))
            }

            // Refresh user list
            await fetchUsers()

            if (userType === 'instructor') {
              setSelectedInstructors([])
            } else {
              setSelectedStudents([])
            }
          } catch (error) {
            console.error('Error in bulk deactivate:', error)
            showError(`Failed to deactivate users: ${error.message}`)
          }
        }
      })
    },
    [selectedInstructors, selectedStudents, instructors, students, fetchUsers]
  )

  const handleBulkDelete = useCallback(
    async userType => {
      const selected =
        userType === 'instructor' ? selectedInstructors : selectedStudents
      if (selected.length === 0) {
        showWarning(toastMessages.noSelection())
        return
      }
      setConfirmDialog({
        isOpen: true,
        title: 'Delete Users',
        message: `Are you sure you want to delete ${selected.length} user(s)? This action cannot be undone.`,
        variant: 'danger',
        onConfirm: async () => {
          try {
            const users = userType === 'instructor' ? instructors : students
            const selectedUsers = users.filter(u =>
              selected.includes(u.id || u._id)
            )

            const deletePromises = selectedUsers.map(user => {
              const userId = user._id || user.id
              return apiDelete(`users/${userId}`)
            })

            const responses = await Promise.all(deletePromises)
            const errors = []

            responses.forEach((response, index) => {
              if (!response.ok) {
                errors.push(selectedUsers[index].name)
              }
            })

            if (errors.length > 0) {
              showError(
                `Failed to delete ${errors.length} user(s): ${errors.join(
                  ', '
                )}`
              )
            } else {
              showSuccess(toastMessages.usersDeleted(selected.length))
            }

            // Refresh user list
            await fetchUsers()

            if (userType === 'instructor') {
              setSelectedInstructors([])
            } else {
              setSelectedStudents([])
            }
          } catch (error) {
            console.error('Error in bulk delete:', error)
            showError(`Failed to delete users: ${error.message}`)
          }
        }
      })
    },
    [selectedInstructors, selectedStudents, instructors, students, fetchUsers]
  )

  // Export handlers
  const handleExportCSV = useCallback(() => {
    const data =
      filterRole === 'Instructor' ? sortedInstructors : sortedStudents
    const userType = filterRole.toLowerCase()
    exportUsersToCSV(data, userType)
    showSuccess(toastMessages.exportSuccess('csv'))
  }, [filterRole, sortedInstructors, sortedStudents])

  const handleExportPDF = useCallback(() => {
    const data =
      filterRole === 'Instructor' ? sortedInstructors : sortedStudents
    exportToPDF({
      users: data,
      dateRange: `${filterSchoolYear} - ${filterSemester}`
    })
    showSuccess(toastMessages.exportSuccess('pdf'))
  }, [
    filterRole,
    sortedInstructors,
    sortedStudents,
    filterSchoolYear,
    filterSemester
  ])

  const handleExportAnalytics = useCallback(async () => {
    try {
      const analyticsData = await buildAnalyticsData()
      exportAnalyticsToCSV(analyticsData)
      showSuccess(toastMessages.exportSuccess('csv'))
    } catch (error) {
      console.error('Error exporting analytics:', error)
      showError('Failed to export analytics data')
    }
  }, [buildAnalyticsData])

  // Edit user handlers
  const handleEditUser = useCallback((user, userType) => {
    setEditingUser(user)
    setEditingUserType(userType)
    setEditModalOpen(true)
  }, [])

  const handleCloseEditModal = useCallback(() => {
    setEditModalOpen(false)
    setEditingUser(null)
    setEditingUserType(null)
  }, [])

  const handleSaveUserChanges = useCallback(
    async updatedUser => {
      try {
        const userId = updatedUser._id || updatedUser.id
        if (!userId) {
          throw new Error('User ID is required')
        }

        // Prepare update data (exclude fields that shouldn't be updated)
        const updateData = {
          firstName:
            updatedUser.firstName || updatedUser.name?.split(' ')[0] || '',
          lastName:
            updatedUser.lastName ||
            updatedUser.name?.split(' ').slice(1).join(' ') ||
            '',
          email: updatedUser.email,
          phone: updatedUser.phone,
          department: updatedUser.department,
          course: updatedUser.course,
          officeLocation: updatedUser.officeLocation,
          officeHours: updatedUser.officeHours,
          schoolYear: updatedUser.schoolYear,
          semester: updatedUser.semester,
          education: updatedUser.education,
          experience: updatedUser.experience,
          specialization: updatedUser.specialization,
          bio: updatedUser.bio,
          section: updatedUser.section,
          yearLevel: updatedUser.yearLevel,
          dateOfBirth: updatedUser.dateOfBirth,
          address: updatedUser.address,
          guardianName: updatedUser.guardianName,
          guardianPhone: updatedUser.guardianPhone,
          guardianRelation: updatedUser.guardianRelation,
          emergencyContact: updatedUser.emergencyContact,
          emergencyPhone: updatedUser.emergencyPhone,
          gpa: updatedUser.gpa,
          units: updatedUser.units
        }

        const response = await apiPut(`users/${userId}`, updateData)

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(
            errorData.error || errorData.message || 'Failed to update user'
          )
        }

        const result = await response.json()
        if (result.success) {
          showSuccess(`User ${updatedUser.name} updated successfully!`)
          // Refresh user list
          await fetchUsers()
        } else {
          throw new Error(
            result.error || result.message || 'Failed to update user'
          )
        }
      } catch (error) {
        console.error('Error updating user:', error)
        showError(`Failed to update user: ${error.message}`)
      }
    },
    [fetchUsers]
  )

  // View user handlers
  const handleViewUser = useCallback((user, userType) => {
    setViewingUser(user)
    setViewingUserType(userType)
    setViewModalOpen(true)
  }, [])

  const handleCloseViewModal = useCallback(() => {
    setViewModalOpen(false)
    setViewingUser(null)
    setViewingUserType(null)
  }, [])

  // Sort icon helper
  const getSortIcon = (columnKey, currentSortKey, currentSortDirection) => {
    if (columnKey !== currentSortKey) {
      return (
        <i
          className='bi bi-arrow-down-up'
          style={{ marginLeft: 4, fontSize: 12, opacity: 0.3 }}
        ></i>
      )
    }
    return currentSortDirection === 'asc' ? (
      <i className='bi bi-arrow-up' style={{ marginLeft: 4, fontSize: 12 }}></i>
    ) : (
      <i
        className='bi bi-arrow-down'
        style={{ marginLeft: 4, fontSize: 12 }}
      ></i>
    )
  }

  return (
    <>
      {/* Toast Notifications */}
      <ToastContainer />

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
      />

      {/* Edit User Modal */}
      <EditUserModal
        isOpen={editModalOpen}
        onClose={handleCloseEditModal}
        user={editingUser}
        userType={editingUserType}
        onSave={handleSaveUserChanges}
      />

      {/* View User Modal */}
      <ViewUserModal
        isOpen={viewModalOpen}
        onClose={handleCloseViewModal}
        user={viewingUser}
        userType={viewingUserType}
      />

      <style>
        {`
          .action-toggle-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(0,0,0,0.25) !important;
          }
          .action-edit-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(35, 34, 92, 0.4) !important;
            background: ${brand.accent} !important;
          }
          .action-toggle-btn:active {
            transform: scale(0.95);
          }
          .action-edit-btn:active {
            transform: scale(0.95);
          }
          .view-details-btn:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(23, 162, 184, 0.5) !important;
            background: ${interactive.primaryHover} !important;
          }
          .view-details-btn:active {
            transform: scale(0.95);
          }
          @media (max-width: 1200px) {
            .admin-dashboard-container {
              flex-direction: column !important;
              gap: 20px !important;
              padding: 20px !important;
            }
            .admin-dashboard-left {
              flex: 1 1 100% !important;
              width: 100% !important;
            }
            .admin-dashboard-right {
              flex: 1 1 100% !important;
              width: 100% !important;
              min-width: auto !important;
              align-self: stretch !important;
            }
          }
          @media (max-width: 768px) {
            .admin-dashboard-table {
              padding: 16px !important;
              border-radius: 12px !important;
            }
            .admin-dashboard-table table {
              min-width: 800px !important;
            }
            .admin-dashboard-table th,
            .admin-dashboard-table td {
              padding: 8px 12px !important;
              font-size: 13px !important;
            }
            .admin-dashboard-filters {
              flex-direction: column !important;
              gap: 10px !important;
            }
            .admin-dashboard-filter-group {
              min-width: auto !important;
              flex: 1 1 100% !important;
            }
            .admin-dashboard-tabs {
              flex-direction: column !important;
              gap: 4px !important;
            }
            .admin-dashboard-analytics {
              grid-template-columns: 1fr !important;
              gap: 12px !important;
            }
            .admin-dashboard-reports {
              flex-direction: column !important;
              align-items: stretch !important;
              gap: 8px !important;
            }
            .admin-dashboard-subjects-grid {
              grid-template-columns: 1fr !important;
              gap: 12px !important;
            }
          }
        `}
      </style>
      <div style={styles.mainContainer}>
        {/* Header */}
        <div style={styles.header}>
          <img src={logo} alt='Logo' style={styles.logo} />
          <div style={styles.adminControls}>
            <span
              style={{ ...styles.adminText, cursor: 'pointer' }}
              onClick={() => navigate('/admin-profile')}
            >
              ADMIN
            </span>
            <button onClick={handleLogout} style={styles.logoutButton}>
              <i
                className='bi bi-box-arrow-right'
                style={{ marginRight: 8 }}
              ></i>
              LOGOUT
            </button>
          </div>
        </div>

        <div
          style={styles.contentContainer}
          className='admin-dashboard-container'
        >
          {apiError && (
            <StatusBanner
              variant='error'
              title='Data load issue'
              message={apiError}
              onClose={() => setApiError('')}
            />
          )}

          <div style={styles.leftSection} className='admin-dashboard-left'>
            <div style={styles.sectionHeader}>
              <h2 style={styles.sectionTitle}>User Management</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => navigate('/admin/create-account')}
                  style={styles.createAccountButton}
                >
                  <i
                    className='bi bi-person-plus-fill'
                    style={{ marginRight: 8 }}
                  ></i>
                  CREATE ACCOUNT
                </button>
                <button
                  onClick={() => setIsBulkUploadOpen(true)}
                  style={{
                    ...styles.createAccountButton,
                    backgroundColor: 'transparent',
                    color: brand.secondary,
                    border: `1px solid ${brand.secondary}`
                  }}
                >
                  <i
                    className='bi bi-upload'
                    style={{ marginRight: 8 }}
                  ></i>
                  BULK UPLOAD STUDENTS
                </button>
                <button
                  onClick={() => setIsBulkInstructorUploadOpen(true)}
                  style={{
                    ...styles.createAccountButton,
                    backgroundColor: 'transparent',
                    color: brand.secondary,
                    border: `1px solid ${brand.secondary}`
                  }}
                >
                  <i
                    className='bi bi-upload'
                    style={{ marginRight: 8 }}
                  ></i>
                  BULK UPLOAD INSTRUCTORS
                </button>
              </div>
            </div>

            {/* Toggle Buttons */}
            <div style={styles.toggleWrapper}>
              <button
                onClick={() => setFilterRole('Instructor')}
                style={{
                  ...styles.toggleButton,
                  background:
                    filterRole === 'Instructor'
                      ? brand.secondary
                      : neutral.bgMuted,
                  color:
                    filterRole === 'Instructor'
                      ? neutral.bgSurface
                      : brand.secondary
                }}
              >
                Instructors
              </button>
              <button
                onClick={() => setFilterRole('Student')}
                style={{
                  ...styles.toggleButton,
                  background:
                    filterRole === 'Student'
                      ? brand.secondary
                      : neutral.bgMuted,
                  color:
                    filterRole === 'Student'
                      ? neutral.bgSurface
                      : brand.secondary
                }}
              >
                Students
              </button>
            </div>

            {/* Filters */}
            <div
              style={styles.filtersWrapper}
              className='admin-dashboard-filters'
            >
              <div
                style={styles.filterGroup}
                className='admin-dashboard-filter-group'
              >
                <label htmlFor='filterSchoolYear' style={styles.filterLabel}>
                  School Year
                </label>
                <select
                  id='filterSchoolYear'
                  name='filterSchoolYear'
                  value={filterSchoolYear}
                  onChange={e => setFilterSchoolYear(e.target.value)}
                  style={styles.filterSelect}
                >
                  <option value=''>Select</option>
                  <option value='2025-2026'>2025-2026</option>
                </select>
              </div>
              <div style={styles.filterGroup}>
                <label htmlFor='filterSemester' style={styles.filterLabel}>
                  Semester
                </label>
                <select
                  id='filterSemester'
                  name='filterSemester'
                  value={filterSemester}
                  onChange={e => setFilterSemester(e.target.value)}
                  style={styles.filterSelect}
                >
                  <option value=''>Select</option>
                  <option value='1st Semester'>1st Semester</option>
                  <option value='2nd Semester'>2nd Semester</option>
                  <option value='Summer'>Summer</option>
                </select>
              </div>
              {filterRole === 'Student' && (
                <>
                  <div
                    style={styles.filterGroup}
                    className='admin-dashboard-filter-group'
                  >
                    <label htmlFor='filterYearLevel' style={styles.filterLabel}>
                      Year Level
                    </label>
                    <select
                      id='filterYearLevel'
                      name='filterYearLevel'
                      value={filterYearLevel}
                      onChange={e => setFilterYearLevel(e.target.value)}
                      style={styles.filterSelect}
                    >
                      <option value=''>Select</option>
                      <option value='1st Year - BSIT 1A'>
                        1st Year - BSIT 1A
                      </option>
                      <option value='2nd Year - BSIT 2A'>
                        2nd Year - BSIT 2A
                      </option>
                      <option value='3rd Year - BSIT 3A'>
                        3rd Year - BSIT 3A
                      </option>
                      <option value='4th Year - BSIT 4A'>
                        4th Year - BSIT 4A
                      </option>
                    </select>
                  </div>
                  <div style={styles.filterGroup}>
                    <label
                      htmlFor='filterDepartment'
                      style={styles.filterLabel}
                    >
                      Department
                    </label>
                    <select
                      id='filterDepartment'
                      name='filterDepartment'
                      value={filterDepartment}
                      onChange={e => setFilterDepartment(e.target.value)}
                      style={styles.filterSelect}
                    >
                      <option value=''>Select</option>
                      <option value='IT'>IT</option>
                    </select>
                  </div>
                  <div style={styles.filterGroup}>
                    <label htmlFor='filterStatus' style={styles.filterLabel}>
                      Status
                    </label>
                    <select
                      id='filterStatus'
                      name='filterStatus'
                      value={filterStatus}
                      onChange={e => setFilterStatus(e.target.value)}
                      style={styles.filterSelect}
                    >
                      <option value=''>Select</option>
                      <option value='Active'>Active</option>
                      <option value='Inactive'>Inactive</option>
                    </select>
                  </div>
                </>
              )}
              {filterRole === 'Instructor' && (
                <>
                  <div
                    style={styles.filterGroup}
                    className='admin-dashboard-filter-group'
                  >
                    <label
                      htmlFor='filterInstructorDepartment'
                      style={styles.filterLabel}
                    >
                      Department
                    </label>
                    <select
                      id='filterInstructorDepartment'
                      name='filterInstructorDepartment'
                      value={filterInstructorDepartment}
                      onChange={e =>
                        setFilterInstructorDepartment(e.target.value)
                      }
                      style={styles.filterSelect}
                    >
                      <option value=''>Select</option>
                      <option value='IT'>IT</option>
                    </select>
                  </div>
                  <div
                    style={styles.filterGroup}
                    className='admin-dashboard-filter-group'
                  >
                    <label
                      htmlFor='filterInstructorStatus'
                      style={styles.filterLabel}
                    >
                      Status
                    </label>
                    <select
                      id='filterInstructorStatus'
                      name='filterInstructorStatus'
                      value={filterInstructorStatus}
                      onChange={e => setFilterInstructorStatus(e.target.value)}
                      style={styles.filterSelect}
                    >
                      <option value=''>Select</option>
                      <option value='Active'>Active</option>
                      <option value='Inactive'>Inactive</option>
                    </select>
                  </div>
                  <div
                    style={styles.filterGroup}
                    className='admin-dashboard-filter-group'
                  >
                    <label
                      htmlFor='filterSubjectCount'
                      style={styles.filterLabel}
                    >
                      Subject Count
                    </label>
                    <select
                      id='filterSubjectCount'
                      name='filterSubjectCount'
                      value={filterSubjectCount}
                      onChange={e => setFilterSubjectCount(e.target.value)}
                      style={styles.filterSelect}
                    >
                      <option value=''>Select</option>
                      <option value='1-2'>1-2 Subjects</option>
                      <option value='3-4'>3-4 Subjects</option>
                      <option value='5+'>5+ Subjects</option>
                    </select>
                  </div>
                </>
              )}
              <div style={styles.filterGroup}>
                <button
                  onClick={() => {
                    setFilterSchoolYear('')
                    setFilterSemester('')
                    setFilterYearLevel('')
                    setFilterDepartment('')
                    setFilterStatus('')
                    setFilterInstructorDepartment('')
                    setFilterInstructorStatus('')
                    setFilterSubjectCount('')
                  }}
                  style={styles.clearFiltersButton}
                >
                  <i className='bi bi-x-circle' style={{ marginRight: 6 }}></i>
                  Clear All Filters
                </button>
              </div>
            </div>

            {/* Search */}
            <div style={styles.searchWrapper}>
              <label htmlFor='searchInput' style={styles.filterLabel}>
                Search {filterRole}
              </label>
              <input
                id='searchInput'
                name='searchInput'
                type='text'
                placeholder={`Search ${filterRole} name...`}
                value={
                  filterRole === 'Instructor' ? searchInstructor : searchStudent
                }
                onChange={e =>
                  filterRole === 'Instructor'
                    ? setSearchInstructor(e.target.value)
                    : setSearchStudent(e.target.value)
                }
                style={styles.searchInput}
              />
            </div>

            {/* Instructor Table */}
            {filterRole === 'Instructor' && (
              <div
                style={styles.tableWrapper}
                className='admin-dashboard-table'
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16
                  }}
                >
                  <h3 style={styles.tableTitle}>Instructors</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleExportCSV}
                      style={styles.exportSmallButton}
                      aria-label='Export to CSV'
                    >
                      <i
                        className='bi bi-file-earmark-spreadsheet'
                        style={{ marginRight: 4 }}
                      ></i>
                      CSV
                    </button>
                    <button
                      onClick={handleExportPDF}
                      style={styles.exportSmallButton}
                      aria-label='Export to PDF'
                    >
                      <i
                        className='bi bi-file-earmark-pdf'
                        style={{ marginRight: 4 }}
                      ></i>
                      PDF
                    </button>
                  </div>
                </div>

                {/* Bulk Actions */}
                <BulkActions
                  selectedCount={selectedInstructors.length}
                  onActivate={() => handleBulkActivate('instructor')}
                  onDeactivate={() => handleBulkDeactivate('instructor')}
                  onDelete={() => handleBulkDelete('instructor')}
                  onClearSelection={() => setSelectedInstructors([])}
                />

                {isLoading ? (
                  <TableSkeleton rows={5} columns={13} />
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>
                          <input
                            type='checkbox'
                            onChange={e =>
                              handleSelectAllInstructors(e.target.checked)
                            }
                            checked={
                              selectedInstructors.length ===
                                instructorPagination.paginatedData.length &&
                              instructorPagination.paginatedData.length > 0
                            }
                            aria-label='Select all instructors'
                          />
                        </th>
                        <th style={{ ...styles.th, textAlign: 'center' }}>
                          View
                        </th>
                        <th style={styles.th}>Profile</th>
                        <th
                          style={{ ...styles.th, cursor: 'pointer' }}
                          onClick={() => handleInstructorSort('id')}
                        >
                          ID{' '}
                          {getSortIcon(
                            'id',
                            instructorSortKey,
                            instructorSortDirection
                          )}
                        </th>
                        <th
                          style={{ ...styles.th, cursor: 'pointer' }}
                          onClick={() => handleInstructorSort('name')}
                        >
                          Name{' '}
                          {getSortIcon(
                            'name',
                            instructorSortKey,
                            instructorSortDirection
                          )}
                        </th>
                        <th
                          style={{ ...styles.th, cursor: 'pointer' }}
                          onClick={() => handleInstructorSort('email')}
                        >
                          Email{' '}
                          {getSortIcon(
                            'email',
                            instructorSortKey,
                            instructorSortDirection
                          )}
                        </th>
                        <th
                          style={{ ...styles.th, cursor: 'pointer' }}
                          onClick={() => handleInstructorSort('department')}
                        >
                          Department{' '}
                          {getSortIcon(
                            'department',
                            instructorSortKey,
                            instructorSortDirection
                          )}
                        </th>
                        <th style={styles.th}>S.Y.</th>
                        <th style={styles.th}>Semester</th>
                        <th
                          style={{ ...styles.th, cursor: 'pointer' }}
                          onClick={() => handleInstructorSort('active')}
                        >
                          Active{' '}
                          {getSortIcon(
                            'active',
                            instructorSortKey,
                            instructorSortDirection
                          )}
                        </th>
                        <th style={styles.th}>Subjects</th>
                        <th style={styles.th}>Students</th>
                        <th style={{ ...styles.th, textAlign: 'center' }}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {instructorPagination.paginatedData.map((inst, i) => {
                        // Use pre-calculated total students count
                        const totalStudents = inst.totalStudents || 0

                        return (
                          <React.Fragment key={i}>
                            <tr style={styles.tr}>
                              <td style={styles.td}>
                                <input
                                  type='checkbox'
                                  checked={selectedInstructors.includes(
                                    inst.id
                                  )}
                                  onChange={() =>
                                    handleSelectInstructor(inst.id)
                                  }
                                  aria-label={`Select ${inst.name}`}
                                />
                              </td>
                              <td style={{ ...styles.td, textAlign: 'center' }}>
                                <button
                                  onClick={() =>
                                    handleViewUser(inst, 'instructor')
                                  }
                                  style={styles.viewButton}
                                  className='view-details-btn'
                                  title='View Details'
                                >
                                  <i className='bi bi-eye-fill'></i>
                                </button>
                              </td>
                              <td style={styles.td}>
                                <img
                                  src={inst.profile}
                                  alt=''
                                  style={styles.avatar}
                                />
                              </td>
                              <td style={styles.td}>{inst.id}</td>
                              <td style={styles.td}>{inst.name}</td>
                              <td style={styles.td}>{inst.email}</td>
                              <td style={styles.td}>{inst.department}</td>
                              <td style={styles.td}>{inst.schoolYear}</td>
                              <td style={styles.td}>{inst.semester}</td>
                              <td
                                style={{
                                  ...styles.td,
                                  color:
                                    inst.active === 'Active'
                                      ? statusColors.present.border
                                      : statusColors.absent.border,
                                  fontWeight: 600
                                }}
                              >
                                {inst.active}
                              </td>

                              {/* Subjects Count Column */}
                              <td style={styles.td}>
                                <span style={styles.subjectCount}>
                                  {inst.subjects.length} subjects
                                </span>
                              </td>

                              {/* Total Students Column */}
                              <td style={styles.td}>
                                <span style={styles.studentCount}>
                                  {totalStudents} students
                                </span>
                              </td>

                              <td
                                style={{ ...styles.td, whiteSpace: 'nowrap' }}
                              >
                                <div style={styles.actionButtonsContainer}>
                                  <button
                                    className='action-toggle-btn'
                                    style={{
                                      ...styles.actionToggleButton,
                                      background:
                                        inst.active === 'Active'
                                          ? statusColors.absent.border
                                          : statusColors.present.border,
                                      color: neutral.bgSurface
                                    }}
                                    onClick={() =>
                                      inst.active === 'Active'
                                        ? handleDeactivateUser(
                                            inst,
                                            'instructor'
                                          )
                                        : handleActivateUser(inst, 'instructor')
                                    }
                                    aria-label={
                                      inst.active === 'Active'
                                        ? `Deactivate ${inst.name}`
                                        : `Activate ${inst.name}`
                                    }
                                    title={
                                      inst.active === 'Active'
                                        ? 'Deactivate User'
                                        : 'Activate User'
                                    }
                                  >
                                    <i
                                      className={`bi ${
                                        inst.active === 'Active'
                                          ? 'bi-pause-fill'
                                          : 'bi-play-fill'
                                      }`}
                                    ></i>
                                  </button>
                                  <button
                                    className='action-edit-btn'
                                    style={styles.actionEditButton}
                                    aria-label={`Edit ${inst.name}`}
                                    onClick={() =>
                                      handleEditUser(inst, 'instructor')
                                    }
                                    title='Edit User Information'
                                  >
                                    <i className='bi bi-pencil-fill'></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                )}

                {/* Pagination */}
                {!isLoading && instructorPagination.totalRecords > 0 && (
                  <Pagination
                    currentPage={instructorPagination.currentPage}
                    totalPages={instructorPagination.totalPages}
                    onPageChange={instructorPagination.goToPage}
                    startRecord={instructorPagination.startRecord}
                    endRecord={instructorPagination.endRecord}
                    totalRecords={instructorPagination.totalRecords}
                    pageSize={instructorPagination.pageSize}
                    onPageSizeChange={instructorPagination.changePageSize}
                  />
                )}
              </div>
            )}

            {/* Student Table */}
            {filterRole === 'Student' && (
              <div
                style={styles.tableWrapper}
                className='admin-dashboard-table'
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16
                  }}
                >
                  <h3 style={styles.tableTitle}>Students</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleExportCSV}
                      style={styles.exportSmallButton}
                      aria-label='Export to CSV'
                    >
                      <i
                        className='bi bi-file-earmark-spreadsheet'
                        style={{ marginRight: 4 }}
                      ></i>
                      CSV
                    </button>
                    <button
                      onClick={handleExportPDF}
                      style={styles.exportSmallButton}
                      aria-label='Export to PDF'
                    >
                      <i
                        className='bi bi-file-earmark-pdf'
                        style={{ marginRight: 4 }}
                      ></i>
                      PDF
                    </button>
                  </div>
                </div>

                {/* Bulk Actions */}
                <BulkActions
                  selectedCount={selectedStudents.length}
                  onActivate={() => handleBulkActivate('student')}
                  onDeactivate={() => handleBulkDeactivate('student')}
                  onDelete={() => handleBulkDelete('student')}
                  onClearSelection={() => setSelectedStudents([])}
                />

                {isLoading ? (
                  <TableSkeleton rows={5} columns={14} />
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>
                          <input
                            type='checkbox'
                            onChange={e =>
                              handleSelectAllStudents(e.target.checked)
                            }
                            checked={
                              selectedStudents.length ===
                                studentPagination.paginatedData.length &&
                              studentPagination.paginatedData.length > 0
                            }
                            aria-label='Select all students'
                          />
                        </th>
                        <th style={{ ...styles.th, textAlign: 'center' }}>
                          View
                        </th>
                        <th style={styles.th}>Profile</th>
                        <th
                          style={{ ...styles.th, cursor: 'pointer' }}
                          onClick={() => handleStudentSort('id')}
                        >
                          ID{' '}
                          {getSortIcon(
                            'id',
                            studentSortKey,
                            studentSortDirection
                          )}
                        </th>
                        <th
                          style={{ ...styles.th, cursor: 'pointer' }}
                          onClick={() => handleStudentSort('name')}
                        >
                          Name{' '}
                          {getSortIcon(
                            'name',
                            studentSortKey,
                            studentSortDirection
                          )}
                        </th>
                        <th
                          style={{ ...styles.th, cursor: 'pointer' }}
                          onClick={() => handleStudentSort('email')}
                        >
                          Email{' '}
                          {getSortIcon(
                            'email',
                            studentSortKey,
                            studentSortDirection
                          )}
                        </th>
                        <th
                          style={{ ...styles.th, cursor: 'pointer' }}
                          onClick={() => handleStudentSort('department')}
                        >
                          Course{' '}
                          {getSortIcon(
                            'department',
                            studentSortKey,
                            studentSortDirection
                          )}
                        </th>
                        <th style={styles.th}>Section</th>
                        <th style={styles.th}>Year Level</th>
                        <th style={styles.th}>S.Y.</th>
                        <th style={styles.th}>Semester</th>
                        <th
                          style={{ ...styles.th, cursor: 'pointer' }}
                          onClick={() => handleStudentSort('active')}
                        >
                          Active{' '}
                          {getSortIcon(
                            'active',
                            studentSortKey,
                            studentSortDirection
                          )}
                        </th>
                        <th style={styles.th}>Subjects</th>
                        <th style={{ ...styles.th, textAlign: 'center' }}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentPagination.paginatedData.map((stud, i) => (
                        <React.Fragment key={i}>
                          <tr style={styles.tr}>
                            <td style={styles.td}>
                              <input
                                type='checkbox'
                                checked={selectedStudents.includes(stud.id)}
                                onChange={() => handleSelectStudent(stud.id)}
                                aria-label={`Select ${stud.name}`}
                              />
                            </td>
                            <td style={{ ...styles.td, textAlign: 'center' }}>
                              <button
                                onClick={() => handleViewUser(stud, 'student')}
                                style={styles.viewButton}
                                className='view-details-btn'
                                title='View Details'
                              >
                                <i className='bi bi-eye-fill'></i>
                              </button>
                            </td>
                            <td style={styles.td}>
                              <img
                                src={stud.profile}
                                alt=''
                                style={styles.avatar}
                              />
                            </td>
                            <td style={styles.td}>{stud.id}</td>
                            <td style={styles.td}>{stud.name}</td>
                            <td style={styles.td}>{stud.email}</td>
                            <td style={styles.td}>{stud.department}</td>
                            <td style={styles.td}>{stud.section}</td>
                            <td style={styles.td}>
                              <span style={styles.yearLevelBadge}>
                                {stud.yearLevel}
                              </span>
                            </td>
                            <td style={styles.td}>
                              {stud.schoolYear || 'N/A'}
                            </td>
                            <td style={styles.td}>{stud.semester || 'N/A'}</td>
                            <td
                              style={{
                                ...styles.td,
                                color:
                                  stud.active === 'Active'
                                    ? statusColors.present.border
                                    : statusColors.absent.border,
                                fontWeight: 600
                              }}
                            >
                              {stud.active}
                            </td>
                            <td style={styles.td}>
                              <span style={styles.subjectCount}>
                                {stud.subjects.length} subjects
                              </span>
                            </td>
                            <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                              <div style={styles.actionButtonsContainer}>
                                <button
                                  className='action-toggle-btn'
                                  style={{
                                    ...styles.actionToggleButton,
                                    background:
                                      stud.active === 'Active'
                                        ? statusColors.absent.border
                                        : statusColors.present.border,
                                    color: neutral.bgSurface
                                  }}
                                  onClick={() =>
                                    stud.active === 'Active'
                                      ? handleDeactivateUser(stud, 'student')
                                      : handleActivateUser(stud, 'student')
                                  }
                                  aria-label={
                                    stud.active === 'Active'
                                      ? `Deactivate ${stud.name}`
                                      : `Activate ${stud.name}`
                                  }
                                  title={
                                    stud.active === 'Active'
                                      ? 'Deactivate User'
                                      : 'Activate User'
                                  }
                                >
                                  <i
                                    className={`bi ${
                                      stud.active === 'Active'
                                        ? 'bi-pause-fill'
                                        : 'bi-play-fill'
                                    }`}
                                  ></i>
                                </button>
                                <button
                                  className='action-edit-btn'
                                  style={styles.actionEditButton}
                                  aria-label={`Edit ${stud.name}`}
                                  onClick={() =>
                                    handleEditUser(stud, 'student')
                                  }
                                  title='Edit User Information'
                                >
                                  <i className='bi bi-pencil-fill'></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Pagination */}
                {!isLoading && studentPagination.totalRecords > 0 && (
                  <Pagination
                    currentPage={studentPagination.currentPage}
                    totalPages={studentPagination.totalPages}
                    onPageChange={studentPagination.goToPage}
                    startRecord={studentPagination.startRecord}
                    endRecord={studentPagination.endRecord}
                    totalRecords={studentPagination.totalRecords}
                    pageSize={studentPagination.pageSize}
                    onPageSizeChange={studentPagination.changePageSize}
                  />
                )}
              </div>
            )}
          </div>

          {/* Enhanced Admin Panel */}
          <div style={styles.rulesSection} className='admin-dashboard-right'>
            <div style={styles.adminPanelTabs} className='admin-dashboard-tabs'>
              <button
                onClick={() => {
                  setShowAnalytics(false)
                  setShowNotifications(false)
                  setShowActivityLog(false)
                  setShowSystemMgmt(false)
                }}
                style={{
                  ...styles.tabButton,
                  background:
                    !showAnalytics &&
                    !showNotifications &&
                    !showActivityLog &&
                    !showSystemMgmt
                      ? brand.secondary
                      : neutral.bgMuted,
                  color:
                    !showAnalytics &&
                    !showNotifications &&
                    !showActivityLog &&
                    !showSystemMgmt
                      ? neutral.bgSurface
                      : brand.secondary
                }}
              >
                <i className='bi bi-gear-fill' style={{ marginRight: 8 }}></i>
                Rules
              </button>
              <button
                onClick={() => {
                  setShowAnalytics(true)
                  setShowNotifications(false)
                  setShowActivityLog(false)
                  setShowSystemMgmt(false)
                }}
                style={{
                  ...styles.tabButton,
                  background: showAnalytics ? brand.secondary : neutral.bgMuted,
                  color: showAnalytics ? neutral.bgSurface : brand.secondary
                }}
              >
                <i className='bi bi-graph-up' style={{ marginRight: 8 }}></i>
                Analytics
              </button>
              <button
                onClick={() => {
                  setShowAnalytics(false)
                  setShowNotifications(true)
                  setShowActivityLog(false)
                  setShowSystemMgmt(false)
                }}
                style={{
                  ...styles.tabButton,
                  background: showNotifications
                    ? brand.secondary
                    : neutral.bgMuted,
                  color: showNotifications ? neutral.bgSurface : brand.secondary
                }}
              >
                <i className='bi bi-bell-fill' style={{ marginRight: 8 }}></i>
                Notifications
              </button>
              <button
                onClick={() => {
                  setShowAnalytics(false)
                  setShowNotifications(false)
                  setShowActivityLog(true)
                  setShowSystemMgmt(false)
                }}
                style={{
                  ...styles.tabButton,
                  background: showActivityLog
                    ? brand.secondary
                    : neutral.bgMuted,
                  color: showActivityLog ? neutral.bgSurface : brand.secondary
                }}
              >
                <i
                  className='bi bi-clock-history'
                  style={{ marginRight: 8 }}
                ></i>
                Activity Log
              </button>
              <button
                onClick={() => {
                  setShowAnalytics(false)
                  setShowNotifications(false)
                  setShowActivityLog(false)
                  setShowSystemMgmt(true)
                }}
                style={{
                  ...styles.tabButton,
                  background: showSystemMgmt
                    ? brand.secondary
                    : neutral.bgMuted,
                  color: showSystemMgmt ? neutral.bgSurface : brand.secondary
                }}
              >
                <i
                  className='bi bi-shield-check'
                  style={{ marginRight: 8 }}
                ></i>
                System
              </button>
            </div>

            {/* Rules Panel */}
            {!showAnalytics &&
              !showNotifications &&
              !showActivityLog &&
              !showSystemMgmt && (
                <div style={styles.panelContent}>
                  <h3 style={styles.ruleTitle}>Set Rule</h3>
                  <div style={styles.ruleForm}>
                    <div style={styles.formGroup}>
                      <label htmlFor='absentRule' style={styles.label}>
                        Absent Rule
                      </label>
                      <select
                        id='absentRule'
                        name='absentRule'
                        style={styles.select}
                      >
                        <option>3 consecutive absent = D/F</option>
                      </select>
                    </div>
                    <div style={styles.formGroup}>
                      <label htmlFor='lateRule' style={styles.label}>
                        Late Rule
                      </label>
                      <select
                        id='lateRule'
                        name='lateRule'
                        style={styles.select}
                      >
                        <option>3 consecutive Late = 1 Absent</option>
                      </select>
                    </div>
                    <div style={styles.formGroup}>
                      <div style={styles.label}>Notify Students</div>
                      <div style={styles.notifyCheckbox}>
                        <input type='checkbox' id='notifyStudent' />
                        <label htmlFor='notifyStudent'>
                          Send notifications to students
                        </label>
                      </div>
                    </div>
                    <div style={styles.policyNote}>
                      <h4 style={styles.policyTitle}>Policy Note</h4>
                      <p style={styles.policyText}>• 3 Lates = 1 Absent</p>
                      <p style={styles.policyText}>
                        • 3 Consecutive Absents = D/F
                      </p>
                    </div>
                    <button style={styles.postButton}>Post</button>
                  </div>
                </div>
              )}

            {/* Analytics Panel */}
            {showAnalytics && (
              <div style={styles.panelContent}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16
                  }}
                >
                  <h3 style={styles.ruleTitle}>Analytics Dashboard</h3>
                  <button
                    onClick={handleExportAnalytics}
                    style={styles.exportSmallButton}
                    aria-label='Export Analytics'
                  >
                    <i
                      className='bi bi-download'
                      style={{ marginRight: 4 }}
                    ></i>
                    Export CSV
                  </button>
                </div>
                <div
                  style={styles.analyticsGrid}
                  className='admin-dashboard-analytics'
                >
                  <div style={styles.statCard}>
                    <div style={styles.statNumber}>
                      {attendanceStats.totalUsers ||
                        instructors.length + students.length}
                    </div>
                    <div style={styles.statLabel}>Total Users</div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={styles.statNumber}>
                      {attendanceStats.activeSessions}
                    </div>
                    <div style={styles.statLabel}>Active Sessions</div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={styles.statNumber}>
                      {attendanceStats.attendanceRate}%
                    </div>
                    <div style={styles.statLabel}>Attendance Rate</div>
                  </div>
                  <div style={styles.statCard}>
                    <div style={styles.statNumber}>
                      {attendanceStats.lateToday}
                    </div>
                    <div style={styles.statLabel}>Late Today</div>
                  </div>
                </div>

                {/* Analytics Charts */}
                <AnalyticsCharts
                  instructors={instructors}
                  students={students}
                />

                <div style={styles.reportSection}>
                  <h4 style={styles.subSectionTitle}>Generate Report</h4>
                  <div
                    style={styles.reportControls}
                    className='admin-dashboard-reports'
                  >
                    <label htmlFor='reportStartDate' style={styles.filterLabel}>
                      Start Date
                    </label>
                    <input
                      id='reportStartDate'
                      name='reportStartDate'
                      type='date'
                      style={styles.dateInput}
                    />
                    <span style={styles.dateSeparator}>to</span>
                    <label htmlFor='reportEndDate' style={styles.filterLabel}>
                      End Date
                    </label>
                    <input
                      id='reportEndDate'
                      name='reportEndDate'
                      type='date'
                      style={styles.dateInput}
                    />
                    <button
                      onClick={handleExportPDF}
                      style={styles.exportButton}
                      aria-label='Export Report as PDF'
                    >
                      <i
                        className='bi bi-download'
                        style={{ marginRight: 6 }}
                      ></i>
                      Export PDF
                    </button>
                    <button
                      onClick={handleExportCSV}
                      style={styles.exportButton}
                      aria-label='Export Report as CSV'
                    >
                      <i
                        className='bi bi-file-earmark-spreadsheet'
                        style={{ marginRight: 6 }}
                      ></i>
                      Export CSV
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Notifications Panel */}
            {showNotifications && (
              <div style={styles.panelContent}>
                <h3 style={styles.ruleTitle}>Email Notifications</h3>
                <div style={styles.notificationSettings}>
                  <div style={styles.formGroup}>
                    <div style={styles.label}>Late Alert</div>
                    <div style={styles.toggleSwitch}>
                      <input type='checkbox' id='lateAlert' defaultChecked />
                      <label htmlFor='lateAlert'>
                        Send alerts for late arrivals
                      </label>
                    </div>
                  </div>
                  <div style={styles.formGroup}>
                    <div style={styles.label}>Absence Warning</div>
                    <div style={styles.toggleSwitch}>
                      <input
                        type='checkbox'
                        id='absenceWarning'
                        defaultChecked
                      />
                      <label htmlFor='absenceWarning'>
                        Send warnings for absences
                      </label>
                    </div>
                  </div>
                  <div style={styles.formGroup}>
                    <div style={styles.label}>Account Creation</div>
                    <div style={styles.toggleSwitch}>
                      <input
                        type='checkbox'
                        id='accountCreation'
                        defaultChecked
                      />
                      <label htmlFor='accountCreation'>
                        Notify on new account creation
                      </label>
                    </div>
                  </div>
                  <div style={styles.emailTemplate}>
                    <h4 style={styles.subSectionTitle}>Email Template</h4>
                    <label htmlFor='emailTemplate' style={styles.label}>
                      Email Template Content
                    </label>
                    <textarea
                      id='emailTemplate'
                      name='emailTemplate'
                      style={styles.templateTextarea}
                      placeholder='Enter email template...'
                      defaultValue='Dear {student_name},\n\nYour attendance for {subject} on {date} has been recorded as {status}.\n\nBest regards,\nAdmin'
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Activity Log Panel */}
            {showActivityLog && (
              <div style={styles.panelContent}>
                <h3 style={styles.ruleTitle}>Activity Log</h3>
                <div style={styles.logControls}>
                  <label htmlFor='logSearch' style={styles.filterLabel}>
                    Search Logs
                  </label>
                  <input
                    id='logSearch'
                    name='logSearch'
                    type='text'
                    placeholder='Search logs...'
                    style={styles.logSearch}
                  />
                  <label htmlFor='logFilter' style={styles.filterLabel}>
                    Filter
                  </label>
                  <select
                    id='logFilter'
                    name='logFilter'
                    style={styles.logFilter}
                  >
                    <option>All Actions</option>
                    <option>User Management</option>
                    <option>Attendance</option>
                    <option>System</option>
                  </select>
                </div>
                <div style={styles.logList}>
                  <div style={styles.logItem}>
                    <div style={styles.logTime}>2024-01-15 14:30:25</div>
                    <div style={styles.logAction}>
                      Admin activated user "Peter Chan"
                    </div>
                    <div style={styles.logUser}>admin@system.com</div>
                  </div>
                  <div style={styles.logItem}>
                    <div style={styles.logTime}>2024-01-15 14:25:10</div>
                    <div style={styles.logAction}>
                      Attendance report generated for IT Elective
                    </div>
                    <div style={styles.logUser}>admin@system.com</div>
                  </div>
                  <div style={styles.logItem}>
                    <div style={styles.logTime}>2024-01-15 14:20:05</div>
                    <div style={styles.logAction}>
                      New student "Sarah Lim" registered
                    </div>
                    <div style={styles.logUser}>admin@system.com</div>
                  </div>
                </div>
              </div>
            )}

            {/* System Management Panel */}
            {showSystemMgmt && (
              <div style={styles.panelContent}>
                <h3 style={styles.ruleTitle}>System Management</h3>
                <div style={styles.backupSection}>
                  <h4 style={styles.subSectionTitle}>Data Backup</h4>
                  <div style={styles.backupInfo}>
                    <div style={styles.backupStatus}>
                      <i
                        className='bi bi-check-circle-fill'
                        style={{
                          color: statusColors.present.border,
                          marginRight: 8
                        }}
                      ></i>
                      Last backup: 2024-01-15 12:00:00
                    </div>
                    <button style={styles.backupButton}>
                      <i
                        className='bi bi-download'
                        style={{ marginRight: 6 }}
                      ></i>
                      Create Backup
                    </button>
                  </div>
                  <div style={styles.restoreSection}>
                    <h4 style={styles.subSectionTitle}>Restore Data</h4>
                    <label htmlFor='backupSelect' style={styles.label}>
                      Select Backup
                    </label>
                    <select
                      id='backupSelect'
                      name='backupSelect'
                      style={styles.backupSelect}
                    >
                      <option>Select backup to restore...</option>
                      <option>Backup_2024-01-15_12-00-00</option>
                      <option>Backup_2024-01-14_12-00-00</option>
                      <option>Backup_2024-01-13_12-00-00</option>
                    </select>
                    <button style={styles.restoreButton}>
                      <i
                        className='bi bi-arrow-clockwise'
                        style={{ marginRight: 6 }}
                      ></i>
                      Restore
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <BulkStudentUploadModal
          isOpen={isBulkUploadOpen}
          onClose={() => setIsBulkUploadOpen(false)}
          onCompleted={handleBulkUploadCompleted}
        />
        <BulkInstructorUploadModal
          isOpen={isBulkInstructorUploadOpen}
          onClose={() => setIsBulkInstructorUploadOpen(false)}
          onCompleted={handleBulkUploadCompleted}
        />
      </div>
    </>
  )
}

// === Styles ===
const styles = {
  mainContainer: {
    minHeight: '100vh',
    background: neutral.bgPage,
    fontFamily: 'Segoe UI, sans-serif',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    background: brand.secondary,
    padding: '20px 40px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  logo: { height: 60 },
  adminControls: { display: 'flex', alignItems: 'center', gap: 24 },
  adminText: { color: neutral.bgSurface, fontSize: 24, fontWeight: 700 },
  logoutButton: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 20px',
    background: 'transparent',
    border: `2px solid ${neutral.bgSurface}`,
    borderRadius: 8,
    color: neutral.bgSurface,
    fontWeight: 600,
    cursor: 'pointer'
  },
  contentContainer: {
    display: 'flex',
    gap: 40,
    padding: 40,
    flexWrap: 'wrap'
  },
  leftSection: {
    flex: 3,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    minWidth: 0
  },
  rulesSection: {
    flex: 0.8,
    background: neutral.bgSurface,
    borderRadius: 16,
    padding: 28,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    alignSelf: 'flex-start',
    height: 'fit-content',
    minWidth: 350
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  createAccountButton: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 20px',
    background: brand.secondary,
    border: 'none',
    borderRadius: 8,
    color: neutral.bgSurface,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 14
  },
  sectionTitle: { fontSize: 24, fontWeight: 700, color: brand.secondary },
  toggleWrapper: { display: 'flex', gap: 10, marginTop: 10 },
  toggleButton: {
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600
  },
  filtersWrapper: {
    display: 'flex',
    gap: 15,
    marginTop: 15,
    flexWrap: 'wrap'
  },
  filterGroup: {
    flex: 1,
    minWidth: 180
  },
  filterSelect: {
    width: '100%',
    padding: '10px 16px',
    borderRadius: 8,
    border: `1px solid ${neutral.border}`,
    fontSize: 15,
    background: neutral.bgMuted,
    color: neutral.textPrimary
  },
  searchWrapper: { marginTop: 15 },
  searchInput: {
    width: '100%',
    padding: '10px 16px',
    borderRadius: 8,
    border: `1px solid ${neutral.border}`,
    fontSize: 15,
    background: neutral.bgMuted,
    color: neutral.textPrimary
  },
  tableWrapper: {
    background: neutral.bgSurface,
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    overflow: 'auto'
  },
  tableTitle: { color: brand.secondary, marginBottom: 10 },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: 900
  },
  th: {
    padding: '12px 20px',
    background: neutral.bgMuted,
    color: brand.secondary,
    fontWeight: 700,
    borderBottom: `2px solid ${neutral.borderLight}`,
    textAlign: 'left',
    whiteSpace: 'nowrap'
  },
  tr: { borderBottom: `1px solid ${neutral.borderLight}` },
  td: {
    padding: '12px 20px',
    color: neutral.textPrimary,
    fontSize: 15,
    verticalAlign: 'top',
    whiteSpace: 'nowrap'
  },
  avatar: { width: 40, height: 40, borderRadius: '50%' },
  passwordText: { fontFamily: 'monospace', color: neutral.textSecondary },
  phoneText: { color: neutral.textSecondary, fontSize: 14 },
  officeText: { color: neutral.textSecondary, fontSize: 13 },
  officeHoursText: {
    color: neutral.textSecondary,
    fontSize: 13,
    fontStyle: 'italic'
  },
  dateText: { color: neutral.textSecondary, fontSize: 14 },
  guardianText: { color: neutral.textSecondary, fontSize: 14, fontWeight: 500 },
  subjectContainer: {
    background: neutral.bgMuted,
    borderRadius: 8,
    marginBottom: 8,
    padding: 8
  },
  subjectHeader: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    gap: 8
  },
  icon: { marginRight: 6, color: brand.secondary },
  subjectName: { fontWeight: 600, color: brand.secondary },
  studentCount: { marginLeft: 6, color: neutral.textSecondary, fontSize: 13 },
  sectionList: { marginTop: 6, marginLeft: 16 },
  studentList: { listStyle: 'none', padding: 0, marginTop: 6 },
  studentItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4
  },
  studentAvatar: { width: 28, height: 28, borderRadius: '50%' },
  sectionContainer: { marginBottom: 6 },
  editButton: {
    background: brand.secondary,
    color: neutral.bgSurface,
    border: 'none',
    padding: 8,
    borderRadius: 6,
    cursor: 'pointer'
  },
  ruleTitle: { color: brand.secondary, fontWeight: 700, marginBottom: 12 },
  ruleForm: { display: 'flex', flexDirection: 'column', gap: 16 },
  formGroup: { display: 'flex', flexDirection: 'column' },
  label: { color: brand.secondary, fontWeight: 600, marginBottom: 6 },
  filterLabel: {
    color: brand.secondary,
    fontWeight: 600,
    marginBottom: 6,
    fontSize: 13,
    display: 'block'
  },
  select: {
    padding: 10,
    borderRadius: 8,
    border: `1px solid ${neutral.border}`,
    fontSize: 15
  },
  notifyCheckbox: { display: 'flex', alignItems: 'center', gap: 8 },
  policyNote: {
    background: neutral.bgPage,
    borderRadius: 8,
    padding: 10,
    fontSize: 14
  },
  policyTitle: { color: brand.secondary, fontWeight: 600, marginBottom: 4 },
  policyText: { color: neutral.textSecondary, margin: 0 },
  postButton: {
    background: brand.secondary,
    color: neutral.bgSurface,
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 10
  },
  // New styles for enhanced features
  adminPanelTabs: {
    display: 'flex',
    gap: 8,
    marginBottom: 20,
    borderBottom: `2px solid ${neutral.borderLight}`,
    paddingBottom: 10,
    flexWrap: 'wrap'
  },
  tabButton: {
    padding: '10px 16px',
    borderRadius: 8,
    border: `1px solid ${neutral.border}`,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s'
  },
  panelContent: {
    minHeight: 400
  },
  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 16,
    marginBottom: 24
  },
  statCard: {
    background: neutral.bgMuted,
    padding: 20,
    borderRadius: 12,
    textAlign: 'center',
    border: `1px solid ${neutral.border}`
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 700,
    color: brand.secondary,
    marginBottom: 8
  },
  statLabel: {
    fontSize: 14,
    color: neutral.textSecondary,
    fontWeight: 600
  },
  reportSection: {
    background: neutral.bgMuted,
    padding: 20,
    borderRadius: 12,
    border: `1px solid ${neutral.border}`
  },
  subSectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: brand.secondary,
    marginBottom: 16
  },
  reportControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap'
  },
  dateInput: {
    padding: '8px 12px',
    borderRadius: 6,
    border: `1px solid ${neutral.border}`,
    fontSize: 14
  },
  dateSeparator: {
    color: neutral.textMuted,
    fontWeight: 600
  },
  exportButton: {
    background: statusColors.present.border,
    color: neutral.bgSurface,
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center'
  },
  notificationSettings: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20
  },
  toggleSwitch: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  emailTemplate: {
    background: neutral.bgMuted,
    padding: 16,
    borderRadius: 8,
    border: `1px solid ${neutral.border}`
  },
  templateTextarea: {
    width: '100%',
    minHeight: 120,
    padding: 12,
    borderRadius: 6,
    border: `1px solid ${neutral.border}`,
    fontSize: 14,
    fontFamily: 'monospace',
    resize: 'vertical'
  },
  logControls: {
    display: 'flex',
    gap: 12,
    marginBottom: 16
  },
  logSearch: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: 6,
    border: `1px solid ${neutral.border}`,
    fontSize: 14
  },
  logFilter: {
    padding: '8px 12px',
    borderRadius: 6,
    border: `1px solid ${neutral.border}`,
    fontSize: 14,
    minWidth: 150
  },
  logList: {
    maxHeight: 300,
    overflowY: 'auto',
    border: `1px solid ${neutral.borderLight}`,
    borderRadius: 8
  },
  logItem: {
    padding: 12,
    borderBottom: `1px solid ${neutral.bgMuted}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  logTime: {
    fontSize: 12,
    color: neutral.textMuted,
    fontWeight: 600
  },
  logAction: {
    fontSize: 14,
    color: neutral.textPrimary,
    fontWeight: 500
  },
  logUser: {
    fontSize: 12,
    color: neutral.textSecondary
  },
  backupSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20
  },
  backupInfo: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: neutral.bgMuted,
    padding: 16,
    borderRadius: 8,
    border: `1px solid ${neutral.borderLight}`
  },
  backupStatus: {
    display: 'flex',
    alignItems: 'center',
    fontSize: 14,
    color: statusColors.present.border,
    fontWeight: 600
  },
  backupButton: {
    background: brand.secondary,
    color: neutral.bgSurface,
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center'
  },
  restoreSection: {
    background: neutral.bgMuted,
    padding: 16,
    borderRadius: 8,
    border: `1px solid ${neutral.borderLight}`
  },
  backupSelect: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 6,
    border: `1px solid ${neutral.border}`,
    fontSize: 14,
    marginBottom: 12
  },
  restoreButton: {
    background: statusColors.absent.border,
    color: neutral.bgSurface,
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center'
  },
  yearLevelBadge: {
    background: statusColors.present.bg,
    color: brand.accent,
    padding: '4px 8px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600
  },
  actionButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  actionButtonsContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '4px 0'
  },
  actionToggleButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 12px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 16,
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
    minWidth: 40,
    height: 40
  },
  actionEditButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: brand.secondary,
    color: neutral.bgSurface,
    border: 'none',
    padding: '8px 12px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 16,
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 6px rgba(35, 34, 92, 0.3)',
    minWidth: 40,
    height: 40
  },
  clearFiltersButton: {
    background: neutral.textMuted,
    color: neutral.bgSurface,
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center'
  },
  // Expandable rows styles
  expandButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    color: brand.secondary,
    transition: 'all 0.2s',
    '&:hover': {
      background: neutral.bgMuted
    }
  },
  viewButton: {
    background: interactive.primary,
    color: neutral.bgSurface,
    border: 'none',
    cursor: 'pointer',
    padding: '8px 12px',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 6px rgba(23, 162, 184, 0.3)',
    minWidth: 40,
    height: 40
  },
  expandedCell: {
    padding: 0,
    background: neutral.bgMuted,
    borderLeft: `4px solid ${brand.secondary}`
  },
  subjectsContainer: {
    padding: 20
  },
  subjectsTitle: {
    color: brand.secondary,
    fontSize: 18,
    fontWeight: 700,
    marginBottom: 16,
    textAlign: 'center'
  },
  subjectsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 16,
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr'
    }
  },
  subjectCard: {
    background: neutral.bgSurface,
    border: `1px solid ${neutral.border}`,
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'transform 0.2s, box-shadow 0.2s',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
    }
  },
  subjectCardTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: brand.secondary,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottom: `2px solid ${neutral.border}`
  },
  subjectDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  sectionInfo: {
    background: neutral.bgMuted,
    padding: 12,
    borderRadius: 8,
    border: `1px solid ${neutral.borderLight}`
  },
  sectionName: {
    fontSize: 14,
    fontWeight: 600,
    color: neutral.textSecondary,
    marginBottom: 8
  },
  instructorInfo: {
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
    border: `2px solid ${brand.secondary}` // instructorAvatar uses same pattern
  },
  instructorName: {
    fontSize: 14,
    fontWeight: 600,
    color: brand.secondary
  },
  subjectCount: {
    background: statusColors.present.bg,
    color: brand.accent,
    padding: '4px 8px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600
  },
  subjectStudentCount: {
    background: statusColors.present.bg,
    color: statusColors.present.border,
    padding: '4px 8px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600
  },
  studentsList: {
    marginTop: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  exportSmallButton: {
    background: brand.secondary,
    color: neutral.bgSurface,
    padding: '6px 12px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.2s'
  },
  // Expanded info section styles
  expandedInfoSection: {
    background: neutral.bgSurface,
    border: `2px solid ${brand.secondary}`, // instructorAvatar uses same pattern,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24
  },
  expandedInfoTitle: {
    color: brand.secondary,
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 16,
    paddingBottom: 8,
    borderBottom: `2px solid ${neutral.border}`
  },
  expandedInfoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: 16
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: neutral.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  infoValue: {
    fontSize: 15,
    fontWeight: 600,
    color: brand.secondary
  }
}

export default ADDashboard
