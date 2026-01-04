/**
 * AttendanceSummaryModal Component
 *
 * Professional attendance monitoring sheet modal that displays student attendance
 * across multiple dates in a pivot table format.
 *
 * Features:
 * - Filter by School Year, Semester, Subject, and Individual Student
 * - Pivot table showing dates as columns
 * - Status indicators: ✓ (Present), ✗ (Absent), ⏱ (Late)
 * - Export to CSV functionality
 * - Responsive design with sticky columns
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { apiGet } from '../../utils/api'
import { brand, neutral, status as statusColors } from '../../utils/colors'
import { HARD_CODED_ATTENDANCE_RECORDS_IT4R10 } from '../../utils/hardcodedSessionHistory'
import ustpLogo from '../../assets/USTP_LOGO.png'

const AttendanceSummaryModal = ({
  isOpen,
  onClose
  // instructorSubjects can be passed for future filtering enhancements
}) => {
  // Filter states
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedSchoolYear, setSelectedSchoolYear] = useState('')
  const [selectedSemester, setSelectedSemester] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [dateFilterMode, setDateFilterMode] = useState('all') // all, week, month, range
  const [dateRangeStart, setDateRangeStart] = useState('') // YYYY-MM-DD
  const [dateRangeEnd, setDateRangeEnd] = useState('') // YYYY-MM-DD

  // Data states
  const [attendanceData, setAttendanceData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [instructorSubjects, setInstructorSubjects] = useState([])

  // Available filter options (derived from data)
  const [schoolYears, setSchoolYears] = useState([])
  const [semesters, setSemesters] = useState([])
  const [sections, setSections] = useState([])

  // Fetch attendance data when modal opens or filters change
  useEffect(() => {
    if (isOpen) {
      fetchAttendanceData()
      fetchInstructorSubjects()
    }
  }, [isOpen, selectedSubject])

  const fetchInstructorSubjects = async () => {
    try {
      let instructorId = null
      try {
        const userStr = localStorage.getItem('user')
        const user = userStr ? JSON.parse(userStr) : null
        instructorId = user && user._id ? user._id : null
      } catch (parseError) {
        console.error('Error parsing user data:', parseError)
      }

      if (!instructorId) {
        setInstructorSubjects([])
        return
      }

      const response = await apiGet(`subjects/instructor/${instructorId}`)
      const result = await response.json()
      if (result.success && Array.isArray(result.data)) {
        setInstructorSubjects(result.data)
      } else {
        setInstructorSubjects([])
      }
    } catch (fetchError) {
      console.error('Error fetching instructor subjects:', fetchError)
      setInstructorSubjects([])
    }
  }

  const fetchAttendanceData = async () => {
    setLoading(true)
    setError('')

    try {
      // Build query params
      let url = 'attendance/recent?limit=1000'

      const response = await apiGet(url)
      const result = await response.json()

      if (result.success && result.data) {
        const merged = [...result.data, ...HARD_CODED_ATTENDANCE_RECORDS_IT4R10]
        setAttendanceData(merged)

        // Extract unique school years, semesters, and sections
        const years = new Set()
        const sems = new Set()
        const secs = new Set()
        const addIfValue = (set, value) => {
          if (!value) return
          const normalized = `${value}`.trim()
          if (normalized) set.add(normalized)
        }

        merged.forEach(record => {
          addIfValue(years, record.schoolYear)
          addIfValue(years, record.user?.schoolYear)
          addIfValue(sems, record.semester)
          addIfValue(sems, record.user?.semester)
          const resolvedSection =
            record.user?.section || record.section || record.group || ''
          addIfValue(secs, resolvedSection)
        })

        setSchoolYears(Array.from(years).sort().reverse())
        setSemesters(Array.from(sems).sort())
        setSections(Array.from(secs).sort())
      } else {
        setError(result.message || 'Failed to fetch attendance data')
      }
    } catch (err) {
      console.error('Error fetching attendance:', err)
      setError('Failed to load attendance data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Filter and transform data into pivot format
  const pivotData = useMemo(() => {
    if (!attendanceData.length) return { students: [], dates: [], matrix: {} }

    // Pre-compute date boundaries for weekly / monthly / range filters
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    let weekStart = null
    let monthStart = null
    let monthEnd = null
    let rangeStartDate = null
    let rangeEndDate = null

    if (dateFilterMode === 'week') {
      weekStart = new Date(today)
      // Last 7 days window (including today)
      weekStart.setDate(weekStart.getDate() - 6)
    } else if (dateFilterMode === 'month') {
      monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    } else if (dateFilterMode === 'range') {
      if (dateRangeStart) {
        const start = new Date(dateRangeStart)
        if (!Number.isNaN(start.getTime())) {
          rangeStartDate = new Date(
            start.getFullYear(),
            start.getMonth(),
            start.getDate()
          )
        }
      }
      if (dateRangeEnd) {
        const end = new Date(dateRangeEnd)
        if (!Number.isNaN(end.getTime())) {
          // Include the full end day by setting time to end of day
          rangeEndDate = new Date(
            end.getFullYear(),
            end.getMonth(),
            end.getDate(),
            23,
            59,
            59,
            999
          )
        }
      }
    }

    // Apply filters - exclude instructors/hosts, only show students
    let filtered = attendanceData.filter(record => {
      // Exclude instructors/hosts - only include students
      // Instructors don't have studentId, so if studentId is missing, it's likely an instructor/host
      const studentId = record.studentId || record.user?.studentId || ''
      if (!studentId) return false

      // Also check role if available
      const userRole = record.user?.role || record.role || ''
      if (userRole === 'instructor' || userRole === 'admin') return false

      // Subject filter
      if (selectedSubject && selectedSubject !== 'all') {
        const recordSubject = record.groupName || record.subjectName || ''
        if (recordSubject !== selectedSubject) return false
      }

      // School year filter
      if (selectedSchoolYear && selectedSchoolYear !== 'all') {
        const recordSchoolYear =
          record.schoolYear || record.user?.schoolYear || ''
        if (recordSchoolYear !== selectedSchoolYear) return false
      }

      // Semester filter
      if (selectedSemester && selectedSemester !== 'all') {
        const recordSemester = record.semester || record.user?.semester || ''
        if (recordSemester !== selectedSemester) return false
      }

      // Section filter
      if (selectedSection && selectedSection !== 'all') {
        const resolvedSection =
          record.user?.section || record.section || record.group || ''
        if (resolvedSection !== selectedSection) return false
      }

      // Student name search
      if (studentSearch.trim()) {
        const searchLower = studentSearch.toLowerCase()
        const name = (record.fullName || '').toLowerCase()
        const studentId = (record.studentId || '').toLowerCase()
        if (!name.includes(searchLower) && !studentId.includes(searchLower)) {
          return false
        }
      }

      // Date range filter (weekly, monthly, or custom)
      if (dateFilterMode !== 'all') {
        if (!record.createdAt) return false
        const recordDate = new Date(record.createdAt)
        if (Number.isNaN(recordDate.getTime())) return false

        if (dateFilterMode === 'week' && weekStart) {
          // Include records from weekStart through today
          if (recordDate < weekStart || recordDate > today) return false
        } else if (dateFilterMode === 'month' && monthStart && monthEnd) {
          if (recordDate < monthStart || recordDate > monthEnd) return false
        } else if (dateFilterMode === 'range') {
          if (rangeStartDate && recordDate < rangeStartDate) return false
          if (rangeEndDate && recordDate > rangeEndDate) return false
        }
      }

      return true
    })

    // Get unique dates (sorted chronologically)
    const datesSet = new Set()
    filtered.forEach(record => {
      if (record.createdAt) {
        const date = new Date(record.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        })
        datesSet.add(date)
      }
    })
    const dates = Array.from(datesSet).sort((a, b) => {
      const dateA = new Date(a + ', 2025')
      const dateB = new Date(b + ', 2025')
      return dateA - dateB
    })

    // Get unique students
    const studentsMap = new Map()
    filtered.forEach(record => {
      const key = record.userId || record.fullName || 'unknown'
      if (!studentsMap.has(key)) {
        const resolvedSection =
          record.user?.section || record.section || record.group || 'N/A'

        studentsMap.set(key, {
          id: key,
          name: record.fullName || 'Unknown',
          studentId: record.studentId || '',
          section: resolvedSection
        })
      }
    })
    const students = Array.from(studentsMap.values()).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    )

    // Build attendance matrix: { [studentId]: { [date]: status } }
    const matrix = {}
    filtered.forEach(record => {
      const studentKey = record.userId || record.fullName || 'unknown'
      const date = record.createdAt
        ? new Date(record.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
          })
        : null

      if (date) {
        if (!matrix[studentKey]) matrix[studentKey] = {}
        matrix[studentKey][date] = (record.status || 'absent').toLowerCase()
      }
    })

    return { students, dates, matrix }
  }, [
    attendanceData,
    selectedSubject,
    selectedSchoolYear,
    selectedSemester,
    selectedSection,
    studentSearch,
    dateFilterMode,
    dateRangeStart,
    dateRangeEnd
  ])

  // Get unique subjects from data
  const subjects = useMemo(() => {
    const subjectsSet = new Set()
    attendanceData.forEach(record => {
      const subject = record.groupName || record.subjectName
      if (subject) subjectsSet.add(subject)
    })
    return Array.from(subjectsSet).sort()
  }, [attendanceData])

  // Auto-select defaults when options become available
  useEffect(() => {
    if (subjects.length > 0 && !selectedSubject) {
      setSelectedSubject(subjects[0])
    }
  }, [subjects, selectedSubject])

  useEffect(() => {
    if (schoolYears.length > 0 && !selectedSchoolYear) {
      setSelectedSchoolYear(schoolYears[0])
    }
  }, [schoolYears, selectedSchoolYear])

  useEffect(() => {
    if (semesters.length > 0 && !selectedSemester) {
      setSelectedSemester(semesters[0])
    }
  }, [semesters, selectedSemester])

  useEffect(() => {
    if (sections.length > 0 && !selectedSection) {
      setSelectedSection('all')
    }
  }, [sections, selectedSection])

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const { students, dates, matrix } = pivotData
    let totalPresent = 0
    let totalLate = 0
    let totalAbsent = 0
    let totalRecords = 0

    students.forEach(student => {
      dates.forEach(date => {
        const status = matrix[student.id]?.[date]
        if (status) {
          totalRecords++
          if (status === 'present') totalPresent++
          else if (status === 'late') totalLate++
          else if (status === 'absent') totalAbsent++
        }
      })
    })

    return {
      totalStudents: students.length,
      totalDates: dates.length,
      totalRecords,
      present: totalPresent,
      late: totalLate,
      absent: totalAbsent,
      attendanceRate:
        totalRecords > 0
          ? Math.round(((totalPresent + totalLate) / totalRecords) * 100)
          : 0
    }
  }, [pivotData])

  // Export to CSV
  const handleExportCSV = useCallback(() => {
    const { students, dates, matrix } = pivotData

    // Build CSV content
    const generatedAt = new Date().toLocaleString()
    const headers = [
      'No.',
      'Name of Student',
      'Student ID',
      'Section',
      'Date & Time',
      ...dates
    ]
    const rows = students.map((student, idx) => {
      const safeStudentId = student.studentId
        ? `\u200b${student.studentId}`
        : ''
      const row = [
        idx + 1,
        student.name,
        safeStudentId,
        student.section,
        generatedAt,
        ...dates.map(date => {
          const status = matrix[student.id]?.[date]
          if (status === 'present') return '✓'
          if (status === 'late') return 'L'
          if (status === 'absent') return '✗'
          return '-'
        })
      ]
      return row.map(cell => `"${cell}"`).join(',')
    })

    const csvContent = [headers.join(','), ...rows].join('\n')

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `attendance_summary_${
      new Date().toISOString().split('T')[0]
    }.csv`
    link.click()
  }, [pivotData])

  const handleExportISOSheet = useCallback(() => {
    const { students, dates, matrix } = pivotData
    if (!students.length || !dates.length) return

    const periodLabel =
      dateFilterMode === 'all'
        ? 'All Dates'
        : dateFilterMode === 'week'
        ? 'Last 7 Days'
        : dateFilterMode === 'month'
        ? 'This Month'
        : dateFilterMode === 'range'
        ? `${dateRangeStart || '—'} to ${dateRangeEnd || '—'}`
        : 'All Dates'

    const escapeHtml = value => {
      if (value === null || value === undefined) return ''
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
    }

    const isoTitle = 'ATTENDANCE AND PUNCTUALITY MONITORING SHEET'

    const derivedSections = new Set(
      students.map(s => (s.section || '').trim()).filter(Boolean)
    )
    const derivedSectionLabel =
      selectedSection && selectedSection !== 'all'
        ? selectedSection
        : derivedSections.size === 1
        ? Array.from(derivedSections)[0]
        : derivedSections.size > 1
        ? 'All Sections'
        : '—'

    const activeSubject =
      instructorSubjects.find(s => s.subjectName === selectedSubject) || null

    const formatClassSchedule = subject => {
      const schedule = subject?.schedule

      const normalizeWeekday = value => {
        const raw = `${value || ''}`.trim().toLowerCase()
        if (!raw) return null
        if (raw.startsWith('mon')) return 1
        if (raw.startsWith('tue')) return 2
        if (raw.startsWith('wed')) return 3
        if (raw.startsWith('thu')) return 4
        if (raw.startsWith('fri')) return 5
        if (raw.startsWith('sat')) return 6
        if (raw.startsWith('sun')) return 0
        return null
      }

      const weekdayLabel = index => {
        const map = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        return map[index] || ''
      }

      const formatWeekdays = weekdaysInput => {
        const indices = Array.isArray(weekdaysInput)
          ? weekdaysInput.map(normalizeWeekday).filter(v => v !== null)
          : []

        const unique = Array.from(new Set(indices)).sort((a, b) => a - b)
        if (unique.length === 0) return ''

        const isMonToFri = [1, 2, 3, 4, 5].every(d => unique.includes(d))
        if (isMonToFri && unique.length === 5) return 'Mon-Fri'

        const isDaily = unique.length === 7
        if (isDaily) return 'Daily'

        return unique.map(weekdayLabel).join(' / ')
      }

      const formatTime = rawTime => {
        const value = `${rawTime || ''}`.trim()
        if (!value) return ''

        const alreadyHasAmPm = /\b(am|pm)\b/i.test(value)
        if (alreadyHasAmPm) return value.replace(/\s+/g, ' ').trim()

        const match = value.match(/^(\d{1,2})(?::(\d{2}))?$/)
        if (!match) return value
        const hours = Number(match[1])
        const minutes = Number(match[2] || '0')
        if (
          Number.isNaN(hours) ||
          Number.isNaN(minutes) ||
          hours < 0 ||
          hours > 23 ||
          minutes < 0 ||
          minutes > 59
        ) {
          return value
        }

        const date = new Date(2000, 0, 1, hours, minutes, 0, 0)
        return new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }).format(date)
      }

      const weekdaysRaw = Array.isArray(schedule?.weekdays)
        ? schedule.weekdays
        : []

      const startTime = formatTime(schedule?.startTime)
      const endTime = formatTime(schedule?.endTime)
      const dayLabel = `${subject?.day || ''}`.trim()
      const timeLabel = `${subject?.time || ''}`.trim()

      const dayPart = formatWeekdays(weekdaysRaw) || dayLabel
      let timePart = ''
      if (startTime && endTime) timePart = `${startTime} - ${endTime}`
      else if (startTime || endTime) timePart = `${startTime || endTime}`
      else timePart = timeLabel

      const combined = [dayPart, timePart].filter(Boolean).join(' ')
      return combined || '—'
    }

    const sheetMeta = {
      officeUnit: 'CITC - IT Department',
      subject: selectedSubject || '—',
      courseCode: activeSubject?.subjectCode
        ? `${activeSubject.subjectCode}`
        : '—',
      classSchedule: formatClassSchedule(activeSubject),
      section: derivedSectionLabel,
      schoolYear:
        selectedSchoolYear && selectedSchoolYear !== 'all'
          ? selectedSchoolYear
          : '—',
      semester:
        selectedSemester && selectedSemester !== 'all' ? selectedSemester : '—',
      period: periodLabel
    }

    const effectiveDateSource = activeSubject?.schedule?.startDate
      ? new Date(activeSubject.schedule.startDate)
      : new Date()
    const effectiveDate = Number.isNaN(effectiveDateSource.getTime())
      ? new Date()
      : effectiveDateSource

    const effectiveDateLabel = new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit'
    })
      .format(effectiveDate)
      .replaceAll('/', '.')

    const statusCell = status => {
      const normalized = (status || '').toLowerCase()
      if (normalized === 'present') return '✓'
      if (normalized === 'late') return 'L'
      if (normalized === 'absent') return 'X'
      return ''
    }

    const dateHeaderCells = dates
      .map(d => `<th class="date-col">${escapeHtml(d)}</th>`)
      .join('')

    const rowsHtml = students
      .map((student, idx) => {
        const name = escapeHtml(student.name)
        const studentId = escapeHtml(student.studentId || '')
        const section = escapeHtml(student.section || '')
        const marks = dates
          .map(date => {
            const mark = statusCell(matrix[student.id]?.[date])
            return `<td class="mark">${escapeHtml(mark)}</td>`
          })
          .join('')
        return `
          <tr>
            <td class="narrow">${idx + 1}</td>
            <td class="name">
              <div class="name-main">${name}</div>
              <div class="name-sub">${studentId}</div>
            </td>
            <td class="course">${section}</td>
            ${marks}
          </tr>
        `
      })
      .join('')

    const logoUrl = new URL(ustpLogo, window.location.origin).href
    const generatedAt = new Date().toLocaleString()

    const instructorName = (() => {
      try {
        const userStr = localStorage.getItem('user')
        const user = userStr ? JSON.parse(userStr) : null
        if (!user) return '—'
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim()
        return fullName || user.email || '—'
      } catch (error) {
        console.error('Error parsing instructor user data:', error)
        return '—'
      }
    })()

    const dateSubmittedLabel = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: '2-digit',
      year: 'numeric'
    }).format(new Date())

    const html = `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(isoTitle)}</title>
          <style>
            @page { size: landscape; margin: 12mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; color: #111; }
            .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
            .brand { display: flex; gap: 14px; align-items: center; }
            .brand img { width: 86px; max-height: 86px; height: auto; object-fit: contain; }
            .brand-text { line-height: 1.2; }
            .brand-text .uni { font-size: 14px; font-weight: 700; letter-spacing: 0.4px; }
            .brand-text .campus { font-size: 10px; color: #333; }
            .docbox { border: 2px solid #1f2f6e; min-width: 220px; }
            .docbox table { width: 100%; border-collapse: collapse; }
            .docbox th { background: #1f2f6e; color: #fff; font-size: 11px; padding: 6px; text-align: center; }
            .docbox td { border-top: 1px solid #1f2f6e; border-right: 1px solid #1f2f6e; padding: 6px; font-size: 10px; text-align: center; }
            .docbox td:last-child { border-right: none; }
            .title { text-align: center; margin: 14px 0 10px; font-size: 16px; font-weight: 800; letter-spacing: 0.6px; }
            .meta { width: 100%; border: 1px solid #222; border-collapse: collapse; margin-bottom: 10px; }
            .meta td { border: 1px solid #222; padding: 6px 8px; font-size: 11px; }
            .meta .label { width: 140px; font-weight: 700; }
            .sheet { width: 100%; border-collapse: collapse; }
            .sheet th, .sheet td { border: 1px solid #222; }
            .sheet thead th { background: #f3f4f6; font-size: 11px; padding: 6px; text-align: center; }
            .sheet .narrow { width: 44px; text-align: center; padding: 6px; font-size: 11px; }
            .sheet .name { width: 260px; padding: 6px 8px; font-size: 11px; }
            .sheet .name-main { font-weight: 700; }
            .sheet .name-sub { font-size: 10px; color: #444; margin-top: 2px; }
            .sheet .course { width: 140px; padding: 6px 8px; font-size: 11px; }
            .sheet .date-col { min-width: 46px; }
            .sheet td.mark { text-align: center; font-size: 14px; font-weight: 800; padding: 4px; }
            .hint { font-size: 10px; color: #333; margin: 6px 0 10px; }
            .footer { display: flex; flex-direction: column; gap: 12px; margin-top: 10px; font-size: 10px; color: #333; }
            .legend span { margin-right: 10px; }
            .signatures { display: flex; justify-content: space-between; gap: 28px; }
            .sign-block { flex: 1; }
            .sign-field { display: flex; gap: 6px; align-items: baseline; }
            .sign-block .sign-field + .sign-field { margin-top: 4px; }
            .sign-label { white-space: nowrap; font-weight: 700; }
            .sign-value { flex: 1; min-width: 220px; border-bottom: 1px solid #111; padding: 0 4px 2px; }
            .sign-caption { margin-top: 4px; text-align: center; }
            .sign-caption span { display: inline-block; min-width: 220px; border-bottom: 1px solid #111; padding-bottom: 2px; }
          </style>
        </head>
        <body>
          <div class="topbar">
            <div class="brand">
              <img src="${logoUrl}" alt="USTP Logo" onerror="this.style.display='none'" />
              <div class="brand-text">
                <div class="uni">UNIVERSITY OF SCIENCE AND TECHNOLOGY</div>
                <div class="uni">OF SOUTHERN PHILIPPINES</div>
                <div class="campus">Generated on ${escapeHtml(
                  generatedAt
                )}</div>
              </div>
            </div>
            <div class="docbox">
              <table>
                <tr><th colspan="3">Document Code No.</th></tr>
                <tr><td colspan="3"><strong>FM-USTP-ACAD-06</strong></td></tr>
                <tr>
                  <td><strong>Rev. No.</strong><br/>00</td>
                  <td><strong>Effective Date</strong><br/>${escapeHtml(
                    effectiveDateLabel
                  )}</td>
                  <td><strong>Page No.</strong><br/>1 of 1</td>
                </tr>
              </table>
            </div>
          </div>

          <div class="title">${escapeHtml(isoTitle)}</div>

          <table class="meta">
            <tr>
              <td class="label">Office / Unit</td>
              <td>${escapeHtml(sheetMeta.officeUnit)}</td>
              <td class="label">School Year</td>
              <td>${escapeHtml(sheetMeta.schoolYear)}</td>
            </tr>
            <tr>
              <td class="label">Subject</td>
              <td>${escapeHtml(sheetMeta.subject)}</td>
              <td class="label">Class Schedule</td>
              <td>${escapeHtml(sheetMeta.classSchedule)}</td>
            </tr>
            <tr>
              <td class="label">Course Code</td>
              <td>${escapeHtml(sheetMeta.courseCode)}</td>
              <td class="label">Semester</td>
              <td>${escapeHtml(sheetMeta.semester)}</td>
            </tr>
            <tr>
              <td class="label">Section</td>
              <td>${escapeHtml(sheetMeta.section)}</td>
              <td class="label">Period</td>
              <td>${escapeHtml(sheetMeta.period)}</td>
            </tr>
          </table>

          <div class="hint"><strong>Instruction:</strong> Indicate the date and put a checkmark (✓) if student is present. Use (L) for late and (X) for absent.</div>

          <table class="sheet">
            <thead>
              <tr>
                <th class="narrow">No.</th>
                <th>Name of Student</th>
                <th>Section</th>
                ${dateHeaderCells}
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer">
            <div class="legend">
              <span><strong>Legend:</strong></span>
              <span>✓ Present</span>
              <span>L Late</span>
              <span>X Absent</span>
              <span>Blank No Record</span>
            </div>
            <div class="signatures">
              <div class="sign-block">
                <div class="sign-field">
                  <span class="sign-label">Checked by:</span>
                  <span class="sign-value">${escapeHtml(instructorName)}</span>
                </div>
                <div class="sign-caption"><span>Subject Instructor/Professor</span></div>
              </div>
              <div class="sign-block">
                <div class="sign-field">
                  <span class="sign-label">Submitted to:</span>
                  <span class="sign-value">&nbsp;</span>
                </div>
                <div class="sign-field">
                  <span class="sign-label">Date Submitted:</span>
                  <span class="sign-value">${escapeHtml(
                    dateSubmittedLabel
                  )}</span>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>`

    let printWindow = null
    try {
      printWindow = window.open('about:blank', '_blank')
    } catch (error) {
      console.error('Failed to open export window:', error)
    }

    if (!printWindow) {
      alert('Popup blocked. Please allow popups to export the sheet.')
      return
    }

    try {
      printWindow.document.open()
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.focus()

      let attempts = 0
      const doPrint = () => {
        try {
          const images = Array.from(printWindow.document.images || [])
          const allImagesLoaded = images.every(img => img.complete)
          if (!allImagesLoaded && attempts < 12) {
            attempts += 1
            setTimeout(doPrint, 250)
            return
          }
          printWindow.focus()
          printWindow.print()
        } catch (error) {
          console.error('Unable to auto-print export window:', error)
        }
      }

      if (typeof printWindow.onload === 'function') {
        const previousOnload = printWindow.onload
        printWindow.onload = () => {
          previousOnload()
          doPrint()
        }
      } else {
        printWindow.onload = doPrint
      }

      setTimeout(doPrint, 400)
    } catch (error) {
      console.error('Failed to render export window, falling back:', error)
      try {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
        const blobUrl = URL.createObjectURL(blob)
        printWindow.location.href = blobUrl
        printWindow.onload = () => {
          try {
            printWindow.focus()
            printWindow.print()
          } catch (innerError) {
            console.error('Unable to print blob export window:', innerError)
          }
        }
      } catch (innerError) {
        console.error('Blob export fallback failed:', innerError)
        alert(
          'Unable to export ISO sheet. Please check the console for errors.'
        )
      }
    }
  }, [
    pivotData,
    instructorSubjects,
    dateFilterMode,
    dateRangeStart,
    dateRangeEnd,
    selectedSubject,
    selectedSection,
    selectedSchoolYear,
    selectedSemester
  ])

  // Reset filters
  const handleResetFilters = () => {
    setSelectedSubject('')
    setSelectedSchoolYear('')
    setSelectedSemester('')
    setSelectedSection('')
    setStudentSearch('')
    setDateFilterMode('all')
    setDateRangeStart('')
    setDateRangeEnd('')
  }

  // Render status indicator
  const renderStatusCell = status => {
    if (!status) {
      return (
        <span style={{ color: neutral.textDisabled, fontSize: 16 }}>—</span>
      )
    }

    if (status === 'present') {
      return (
        <span
          style={{
            color: statusColors.present.border,
            fontSize: 18,
            fontWeight: 700
          }}
        >
          ✓
        </span>
      )
    }

    if (status === 'late') {
      return (
        <span
          style={{
            color: statusColors.late.border,
            fontSize: 14,
            fontWeight: 700
          }}
        >
          ⏱
        </span>
      )
    }

    if (status === 'absent') {
      return (
        <span
          style={{
            color: statusColors.absent.border,
            fontSize: 16,
            fontWeight: 700
          }}
        >
          ✗
        </span>
      )
    }

    return <span style={{ color: neutral.textDisabled }}>—</span>
  }

  if (!isOpen) return null

  const handleOverlayClick = e => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  // Filter input style
  const filterInputStyle = {
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${neutral.border}`,
    fontSize: 14,
    background: neutral.bgSurface,
    color: neutral.textPrimary,
    minWidth: 140
  }

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 8,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)'
      }}
    >
      <div
        style={{
          background: neutral.bgSurface,
          borderRadius: 16,
          width: '100vw',
          maxWidth: '100vw',
          maxHeight: '96vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          animation: 'slideUp 0.25s ease-out'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 28px',
            borderBottom: `1px solid ${neutral.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: brand.primary,
            borderRadius: '16px 16px 0 0'
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 22,
                fontWeight: 700,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: 12
              }}
            >
              <i className='bi bi-table'></i>
              Attendance and Punctuality Monitoring Sheet
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 14,
                color: 'rgba(255,255,255,0.8)'
              }}
            >
              View detailed attendance records across all dates
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              border: 'none',
              background: 'rgba(255,255,255,0.2)',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              transition: 'all 0.2s'
            }}
            onMouseEnter={e =>
              (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')
            }
            onMouseLeave={e =>
              (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')
            }
          >
            <i className='bi bi-x-lg'></i>
          </button>
        </div>

        {/* Filters Section */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: `1px solid ${neutral.borderLight}`,
            background: neutral.bgMuted,
            maxHeight: '260px',
            overflowY: 'auto'
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              alignItems: 'stretch'
            }}
          >
            {/* Subject Filter */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: neutral.textSecondary,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                Subject
              </label>
              <select
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                style={{ ...filterInputStyle, minWidth: 200 }}
              >
                <option value='all'>All Subjects</option>
                {subjects.map(subject => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </div>

            {/* Section Filter */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: neutral.textSecondary,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                Section
              </label>
              <select
                value={selectedSection}
                onChange={e => setSelectedSection(e.target.value)}
                style={filterInputStyle}
                disabled={sections.length === 0}
              >
                <option value='all'>All Sections</option>
                {sections.length === 0 ? (
                  <option value=''>No sections</option>
                ) : (
                  sections.map(section => (
                    <option key={section} value={section}>
                      {section}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* School Year Filter */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: neutral.textSecondary,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                School Year
              </label>
              <select
                value={selectedSchoolYear}
                onChange={e => setSelectedSchoolYear(e.target.value)}
                style={filterInputStyle}
                disabled={schoolYears.length === 0}
              >
                <option value='all'>All Years</option>
                {schoolYears.length === 0 ? (
                  <option value=''>No school years</option>
                ) : (
                  schoolYears.map(year => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Semester Filter */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: neutral.textSecondary,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                Semester
              </label>
              <select
                value={selectedSemester}
                onChange={e => setSelectedSemester(e.target.value)}
                style={filterInputStyle}
                disabled={semesters.length === 0}
              >
                <option value='all'>All Semesters</option>
                {semesters.length === 0 ? (
                  <option value=''>No semesters</option>
                ) : (
                  semesters.map(sem => (
                    <option key={sem} value={sem}>
                      {sem}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Student Search */}
            <div style={{ flex: 1, minWidth: 200 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: neutral.textSecondary,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                Search Student
              </label>
              <div style={{ position: 'relative' }}>
                <i
                  className='bi bi-search'
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: neutral.textSecondary
                  }}
                ></i>
                <input
                  type='text'
                  placeholder='Search by name or ID...'
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  style={{
                    ...filterInputStyle,
                    width: '100%',
                    paddingLeft: 36
                  }}
                />
              </div>
            </div>

            {/* Date Range Filter */}
            <div
              style={{
                flex: 1,
                minWidth: 260
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 600,
                  color: neutral.textSecondary,
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5
                }}
              >
                Date Filters
              </label>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                {/* Period filter (All / Weekly / Monthly) */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: neutral.textSecondary,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4
                    }}
                  >
                    Period
                  </span>
                  <select
                    value={
                      dateFilterMode === 'week'
                        ? 'week'
                        : dateFilterMode === 'month'
                        ? 'month'
                        : 'all'
                    }
                    onChange={e => {
                      const value = e.target.value
                      if (
                        value === 'week' ||
                        value === 'month' ||
                        value === 'all'
                      ) {
                        setDateFilterMode(value)
                      }
                    }}
                    style={{
                      ...filterInputStyle,
                      width: '100%'
                    }}
                  >
                    <option value='all'>All Dates</option>
                    <option value='week'>Last 7 Days</option>
                    <option value='month'>This Month</option>
                  </select>
                </div>

                {/* Custom range filter */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: neutral.textSecondary,
                      textTransform: 'uppercase',
                      letterSpacing: 0.4
                    }}
                  >
                    Custom Range
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      width: '100%'
                    }}
                  >
                    <input
                      type='date'
                      value={dateRangeStart}
                      onChange={e => {
                        const value = e.target.value
                        setDateRangeStart(value)
                        if (value || dateRangeEnd) {
                          setDateFilterMode('range')
                        }
                      }}
                      style={{
                        ...filterInputStyle,
                        flex: 1,
                        minWidth: 140
                      }}
                    />
                    <input
                      type='date'
                      value={dateRangeEnd}
                      onChange={e => {
                        const value = e.target.value
                        setDateRangeEnd(value)
                        if (value || dateRangeStart) {
                          setDateFilterMode('range')
                        }
                      }}
                      style={{
                        ...filterInputStyle,
                        flex: 1,
                        minWidth: 140
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleResetFilters}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: `1px solid ${neutral.border}`,
                  background: neutral.bgSurface,
                  color: neutral.textSecondary,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <i className='bi bi-arrow-counterclockwise'></i>
                Reset
              </button>
              <button
                onClick={handleExportCSV}
                disabled={pivotData.students.length === 0}
                style={{
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: statusColors.present.border,
                  color: '#ffffff',
                  cursor:
                    pivotData.students.length === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: pivotData.students.length === 0 ? 0.5 : 1
                }}
              >
                <i className='bi bi-download'></i>
                Export CSV
              </button>
              <button
                onClick={handleExportISOSheet}
                disabled={pivotData.students.length === 0}
                style={{
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: brand.primary,
                  color: '#ffffff',
                  cursor:
                    pivotData.students.length === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: pivotData.students.length === 0 ? 0.5 : 1
                }}
              >
                <i className='bi bi-printer'></i>
                Export ISO Sheet
              </button>
            </div>
          </div>

          {/* Summary Stats */}
          <div
            style={{
              display: 'flex',
              gap: 20,
              marginTop: 16,
              flexWrap: 'wrap'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                background: neutral.bgSurface,
                borderRadius: 8,
                border: `1px solid ${neutral.borderLight}`
              }}
            >
              <i className='bi bi-people' style={{ color: brand.primary }}></i>
              <span style={{ fontWeight: 600, color: neutral.textPrimary }}>
                {summaryStats.totalStudents}
              </span>
              <span style={{ color: neutral.textSecondary, fontSize: 13 }}>
                Students
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                background: neutral.bgSurface,
                borderRadius: 8,
                border: `1px solid ${neutral.borderLight}`
              }}
            >
              <i
                className='bi bi-calendar3'
                style={{ color: brand.secondary }}
              ></i>
              <span style={{ fontWeight: 600, color: neutral.textPrimary }}>
                {summaryStats.totalDates}
              </span>
              <span style={{ color: neutral.textSecondary, fontSize: 13 }}>
                Dates
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                background: statusColors.present.bg,
                borderRadius: 8,
                border: `1px solid ${statusColors.present.border}`
              }}
            >
              <span
                style={{ fontWeight: 700, color: statusColors.present.border }}
              >
                ✓ {summaryStats.present}
              </span>
              <span style={{ color: statusColors.present.text, fontSize: 13 }}>
                Present
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                background: statusColors.late.bg,
                borderRadius: 8,
                border: `1px solid ${statusColors.late.border}`
              }}
            >
              <span
                style={{ fontWeight: 700, color: statusColors.late.border }}
              >
                ⏱ {summaryStats.late}
              </span>
              <span style={{ color: statusColors.late.text, fontSize: 13 }}>
                Late
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                background: statusColors.absent.bg,
                borderRadius: 8,
                border: `1px solid ${statusColors.absent.border}`
              }}
            >
              <span
                style={{ fontWeight: 700, color: statusColors.absent.border }}
              >
                ✗ {summaryStats.absent}
              </span>
              <span style={{ color: statusColors.absent.text, fontSize: 13 }}>
                Absent
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                background: brand.primary,
                borderRadius: 8
              }}
            >
              <span style={{ fontWeight: 700, color: '#ffffff' }}>
                {summaryStats.attendanceRate}%
              </span>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
                Attendance Rate
              </span>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '0 0 20px'
          }}
        >
          {loading ? (
            <div
              style={{
                padding: 60,
                textAlign: 'center',
                color: neutral.textSecondary
              }}
            >
              <i
                className='bi bi-arrow-repeat'
                style={{
                  fontSize: 32,
                  animation: 'spin 1s linear infinite',
                  display: 'block',
                  marginBottom: 12
                }}
              ></i>
              Loading attendance data...
            </div>
          ) : error ? (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                color: statusColors.absent.border
              }}
            >
              <i
                className='bi bi-exclamation-triangle'
                style={{
                  fontSize: 32,
                  marginBottom: 12,
                  display: 'block'
                }}
              ></i>
              {error}
              <button
                onClick={fetchAttendanceData}
                style={{
                  marginTop: 16,
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: brand.primary,
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Retry
              </button>
            </div>
          ) : pivotData.students.length === 0 ? (
            <div
              style={{
                padding: 60,
                textAlign: 'center',
                color: neutral.textSecondary
              }}
            >
              <i
                className='bi bi-inbox'
                style={{
                  fontSize: 48,
                  marginBottom: 16,
                  display: 'block',
                  opacity: 0.5
                }}
              ></i>
              <p style={{ margin: 0, fontSize: 16 }}>
                No attendance records found for the selected filters.
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 14 }}>
                Try adjusting your filters or selecting a different subject.
              </p>
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontSize: 13
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      position: 'sticky',
                      left: 0,
                      top: 0,
                      zIndex: 3,
                      background: brand.primary,
                      color: '#ffffff',
                      padding: '14px 12px',
                      textAlign: 'center',
                      fontWeight: 700,
                      borderBottom: `2px solid ${brand.secondary}`,
                      width: 50
                    }}
                  >
                    No.
                  </th>
                  <th
                    style={{
                      position: 'sticky',
                      left: 50,
                      top: 0,
                      zIndex: 3,
                      background: brand.primary,
                      color: '#ffffff',
                      padding: '14px 16px',
                      textAlign: 'left',
                      fontWeight: 700,
                      borderBottom: `2px solid ${brand.secondary}`,
                      minWidth: 200
                    }}
                  >
                    Name of Student
                  </th>
                  <th
                    style={{
                      position: 'sticky',
                      left: 250,
                      top: 0,
                      zIndex: 3,
                      background: brand.primary,
                      color: '#ffffff',
                      padding: '14px 12px',
                      textAlign: 'center',
                      fontWeight: 700,
                      borderBottom: `2px solid ${brand.secondary}`,
                      minWidth: 120
                    }}
                  >
                    Section
                  </th>
                  {pivotData.dates.map(date => (
                    <th
                      key={date}
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        background: brand.primary,
                        color: '#ffffff',
                        padding: '14px 10px',
                        textAlign: 'center',
                        fontWeight: 600,
                        borderBottom: `2px solid ${brand.secondary}`,
                        whiteSpace: 'nowrap',
                        minWidth: 70
                      }}
                    >
                      {date}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pivotData.students.map((student, idx) => (
                  <tr
                    key={student.id}
                    style={{
                      background:
                        idx % 2 === 0 ? neutral.bgSurface : neutral.bgMuted
                    }}
                  >
                    <td
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        background:
                          idx % 2 === 0 ? neutral.bgSurface : neutral.bgMuted,
                        padding: '12px',
                        textAlign: 'center',
                        fontWeight: 600,
                        borderBottom: `1px solid ${neutral.borderLight}`,
                        color: neutral.textSecondary
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      style={{
                        position: 'sticky',
                        left: 50,
                        zIndex: 1,
                        background:
                          idx % 2 === 0 ? neutral.bgSurface : neutral.bgMuted,
                        padding: '12px 16px',
                        borderBottom: `1px solid ${neutral.borderLight}`,
                        fontWeight: 600,
                        color: neutral.textPrimary
                      }}
                    >
                      <div>{student.name}</div>
                      {student.studentId && (
                        <div
                          style={{
                            fontSize: 11,
                            color: neutral.textSecondary,
                            marginTop: 2
                          }}
                        >
                          {student.studentId}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        position: 'sticky',
                        left: 250,
                        zIndex: 1,
                        background:
                          idx % 2 === 0 ? neutral.bgSurface : neutral.bgMuted,
                        padding: '12px',
                        textAlign: 'center',
                        borderBottom: `1px solid ${neutral.borderLight}`,
                        color: neutral.textSecondary,
                        fontSize: 12
                      }}
                    >
                      {student.section}
                    </td>
                    {pivotData.dates.map(date => (
                      <td
                        key={date}
                        style={{
                          padding: '12px 10px',
                          textAlign: 'center',
                          borderBottom: `1px solid ${neutral.borderLight}`
                        }}
                      >
                        {renderStatusCell(pivotData.matrix[student.id]?.[date])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 28px',
            borderTop: `1px solid ${neutral.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: neutral.bgMuted,
            borderRadius: '0 0 16px 16px'
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: neutral.textSecondary,
              display: 'flex',
              alignItems: 'center',
              gap: 16
            }}
          >
            <span>
              <span
                style={{ color: statusColors.present.border, fontWeight: 700 }}
              >
                ✓
              </span>{' '}
              = Present
            </span>
            <span>
              <span
                style={{ color: statusColors.late.border, fontWeight: 700 }}
              >
                ⏱
              </span>{' '}
              = Late
            </span>
            <span>
              <span
                style={{ color: statusColors.absent.border, fontWeight: 700 }}
              >
                ✗
              </span>{' '}
              = Absent
            </span>
            <span>
              <span style={{ color: neutral.textDisabled }}>—</span> = No Record
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              borderRadius: 8,
              border: 'none',
              background: neutral.textSecondary,
              color: '#ffffff',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 14
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* CSS Animations */}
      <style>
        {`
          @keyframes slideUp {
            from { 
              opacity: 0;
              transform: translateY(30px) scale(0.96);
            }
            to { 
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  )
}

export default AttendanceSummaryModal
