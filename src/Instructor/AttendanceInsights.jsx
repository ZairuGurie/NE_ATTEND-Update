/**
 * Attendance Insights Page for Instructors
 * Provides comprehensive attendance analytics, reporting, and export functionality
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react'
// useNavigate available for future navigation features
// import { useNavigate } from 'react-router-dom'
import { Pie } from 'react-chartjs-2'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend as ChartLegend
} from 'chart.js'
import { toast } from 'react-toastify'
import 'bootstrap-icons/font/bootstrap-icons.css'
// Phase 4: CSS classes for theme-aware styling
import '../styles/common.css'
import { getCurrentUser } from '../utils/auth'
import { apiGet } from '../utils/api'
import {
  brand,
  neutral,
  status as statusColors,
  interactive,
  riskColorMap
} from '../utils/colors'
import Sidebar from '../components/layout/Sidebar'
import RiskSummaryCard, {
  RiskSummaryRow
} from '../components/ui/RiskSummaryCard'
import logo from '../assets/Logologin.png'

ChartJS.register(ArcElement, ChartTooltip, ChartLegend)

const REPORT_STATUS_OPTIONS = [
  { label: 'All Statuses', value: '' },
  { label: 'Present', value: 'present' },
  { label: 'Late', value: 'late' },
  { label: 'Absent', value: 'absent' },
  { label: 'Pending', value: 'pending' }
]

const DEFAULT_BREAKDOWN = { bySubject: [], bySection: [] }

const buildReportQuery = filters => {
  const params = new URLSearchParams()
  params.set('includeDetails', 'true')
  params.set('limit', '250')
  params.set('page', '1')

  if (filters.subjectId) params.set('subjectId', filters.subjectId)
  if (filters.section) params.set('section', filters.section)
  if (filters.status) params.set('status', filters.status)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)

  return params.toString()
}

const deriveChartDataFromSummary = (summary = {}) => {
  const present = summary.presentCount || 0
  const late = summary.lateCount || 0
  const absent = summary.absentCount || 0
  const total = present + late + absent

  if (!total) {
    return [
      { label: 'Present', value: 0, color: statusColors.present.border },
      { label: 'Absent', value: 0, color: statusColors.absent.border },
      { label: 'Late', value: 0, color: statusColors.late.border }
    ]
  }

  const toPercent = value => Math.round((value / total) * 100)

  return [
    {
      label: 'Present',
      value: toPercent(present),
      color: statusColors.present.border
    },
    {
      label: 'Absent',
      value: toPercent(absent),
      color: statusColors.absent.border
    },
    {
      label: 'Late',
      value: toPercent(late),
      color: statusColors.late.border
    }
  ]
}

const sanitizeCsvValue = value => {
  if (value === null || value === undefined) return ''
  const stringValue = String(value)
  if (stringValue.includes(',') || stringValue.includes('"')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

const exportReportDetailsToCsv = (details = [], filters = {}) => {
  if (!details.length || typeof window === 'undefined') {
    return false
  }

  const headers = [
    'Student Name',
    'Subject',
    'Status',
    'Session Date',
    'Section',
    'Scheduled Sections',
    'Start Time',
    'End Time',
    'Excused',
    'Tardy'
  ]

  const rows = details.map(detail => {
    const sessionDate = detail.sessionDate
      ? new Date(detail.sessionDate).toLocaleString()
      : ''
    const startTime = detail.startTime
      ? new Date(detail.startTime).toLocaleTimeString()
      : ''
    const endTime = detail.endTime
      ? new Date(detail.endTime).toLocaleTimeString()
      : ''

    return [
      detail.studentName || 'Unknown',
      detail.subjectName || detail.subjectCode || '—',
      (detail.status || 'present').toUpperCase(),
      sessionDate,
      detail.studentSection || '—',
      Array.isArray(detail.sections) ? detail.sections.join(', ') : '—',
      startTime,
      endTime,
      detail.isExcused ? 'Yes' : 'No',
      detail.isTardy ? 'Yes' : 'No'
    ]
  })

  const csvContent = [headers, ...rows]
    .map(row => row.map(sanitizeCsvValue).join(','))
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `attendance-report-${filters.from || 'start'}-${
    filters.to || 'end'
  }.csv`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
  return true
}

const toDateInputValue = date => date.toISOString().slice(0, 10)

const getDefaultReportFilters = () => {
  const today = new Date()
  const from = new Date(today)
  from.setDate(today.getDate() - 29)

  return {
    subjectId: '',
    section: '',
    status: '',
    from: toDateInputValue(from),
    to: toDateInputValue(today)
  }
}

const PieChartComponent = ({ data }) => {
  const chartData = {
    labels: data.map(d => d.label),
    datasets: [
      {
        data: data.map(d => d.value),
        backgroundColor: data.map(d => d.color),
        borderColor: neutral.bgSurface,
        borderWidth: 2
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom'
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            return `${context.label}: ${context.parsed}%`
          }
        }
      }
    }
  }

  return (
    <div style={{ width: '100%', height: 300 }}>
      <Pie data={chartData} options={options} />
    </div>
  )
}

const AttendanceInsights = () => {
  // Navigation hook available for future features
  // const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(() => getCurrentUser())
  const [availableSections, setAvailableSections] = useState([])
  const [subjectFilterOptions, setSubjectFilterOptions] = useState([])
  const [attendanceSummary, setAttendanceSummary] = useState([])
  const [reportFilters, setReportFilters] = useState(() =>
    getDefaultReportFilters()
  )
  const [reportSummary, setReportSummary] = useState(null)
  const [reportBreakdown, setReportBreakdown] = useState(DEFAULT_BREAKDOWN)
  const [reportDetails, setReportDetails] = useState([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [trendData, setTrendData] = useState([])
  // View switching reserved for future tabs feature
  // eslint-disable-next-line no-unused-vars
  const [activeView, setActiveView] = useState('overview') // overview, details, trends

  // Risk & Intervention Signals state
  const [riskSummary, setRiskSummary] = useState({ byUserId: {}, list: [] })
  const [riskLoading, setRiskLoading] = useState(false)
  const [riskError, setRiskError] = useState('')
  const [selectedRiskSubjectId, setSelectedRiskSubjectId] = useState('')

  // Derived risk counts from summary
  const riskCounts = useMemo(() => {
    const list = riskSummary?.list || []
    return {
      high: list.filter(e => e?.risk?.band === 'high').length,
      medium: list.filter(e => e?.risk?.band === 'medium').length,
      low: list.filter(e => e?.risk?.band === 'low').length
    }
  }, [riskSummary])

  // Top risk entries for display
  const topRiskEntries = useMemo(() => {
    const list = riskSummary?.list || []
    return list
      .filter(e => e?.risk?.band === 'high' || e?.risk?.band === 'medium')
      .slice(0, 5)
  }, [riskSummary])

  const filteredSectionOptions = useMemo(() => {
    if (reportFilters.subjectId) {
      const target = subjectFilterOptions.find(
        option => option.value === reportFilters.subjectId
      )
      return target?.sections || []
    }
    return availableSections
  }, [reportFilters.subjectId, subjectFilterOptions, availableSections])

  const summaryStats = useMemo(() => {
    const summary = reportSummary || {}
    return [
      {
        label: 'Total Records',
        value: summary.totalRecords ?? 0,
        icon: 'bi-clipboard-data'
      },
      {
        label: 'Attendance Rate',
        value: `${summary.attendanceRate ?? 0}%`,
        icon: 'bi-percent'
      },
      {
        label: 'Present',
        value: summary.presentCount ?? 0,
        icon: 'bi-check-circle',
        color: statusColors.present.border
      },
      {
        label: 'Late',
        value: summary.lateCount ?? 0,
        icon: 'bi-clock',
        color: statusColors.late.border
      },
      {
        label: 'Absent',
        value: summary.absentCount ?? 0,
        icon: 'bi-x-circle',
        color: statusColors.absent.border
      },
      {
        label: 'Excused',
        value: summary.excusedCount ?? 0,
        icon: 'bi-shield-check'
      }
    ]
  }, [reportSummary])

  const handleReportFilterChange = (field, value) => {
    setReportFilters(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubjectFilterChange = value => {
    setReportFilters(prev => ({
      ...prev,
      subjectId: value,
      section: value ? '' : prev.section
    }))
  }

  const handleResetReportFilters = () => {
    setReportFilters(getDefaultReportFilters())
  }

  const handleExportReport = () => {
    const exported = exportReportDetailsToCsv(reportDetails, reportFilters)
    if (!exported) {
      toast.info('No data available to export yet')
    } else {
      toast.success('Report exported successfully!')
    }
  }

  const fetchInstructorSubjects = useCallback(async userId => {
    try {
      const response = await apiGet(`subjects/instructor/${userId}`)
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(
          result.error || result.message || 'Failed to load subjects'
        )
      }
      const rawSubjects = Array.isArray(result.data) ? result.data : []
      const sections = [
        ...new Set(rawSubjects.flatMap(subject => subject.sections || []))
      ]
      const filterOptions = rawSubjects.map(subject => ({
        value: subject._id,
        label: subject.subjectName || subject.subjectCode || 'Untitled Subject',
        sections: subject.sections || []
      }))
      setAvailableSections(sections)
      setSubjectFilterOptions(filterOptions)
    } catch (error) {
      console.error('Error fetching instructor subjects:', error)
    }
  }, [])

  const fetchReportData = useCallback(
    async instructorId => {
      if (!instructorId) return
      setReportLoading(true)
      setReportError('')
      try {
        const query = buildReportQuery(reportFilters)
        const response = await apiGet(
          `instructor/reports/attendance-summary?${query}`
        )
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(
            result.error || result.message || 'Failed to load report'
          )
        }
        const summary = result.data?.summary || null
        const breakdown = result.data?.breakdown || DEFAULT_BREAKDOWN
        const details = result.data?.details || []
        setReportSummary(summary)
        setReportBreakdown(breakdown)
        setReportDetails(details)
        setAttendanceSummary(deriveChartDataFromSummary(summary))

        // Generate trend data from details
        generateTrendData(details)
      } catch (error) {
        console.error('Error fetching instructor report:', error)
        setReportError(error.message || 'Failed to load report')
        setReportSummary(null)
        setReportBreakdown(DEFAULT_BREAKDOWN)
        setReportDetails([])
        setAttendanceSummary([])
      } finally {
        setReportLoading(false)
      }
    },
    [reportFilters]
  )

  const generateTrendData = details => {
    // Group by date and calculate daily stats
    const dailyStats = {}
    details.forEach(detail => {
      if (!detail.sessionDate) return
      const date = new Date(detail.sessionDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
      if (!dailyStats[date]) {
        dailyStats[date] = { date, present: 0, late: 0, absent: 0, total: 0 }
      }
      dailyStats[date].total++
      const status = (detail.status || 'present').toLowerCase()
      if (status === 'present') dailyStats[date].present++
      else if (status === 'late') dailyStats[date].late++
      else if (status === 'absent') dailyStats[date].absent++
    })

    setTrendData(Object.values(dailyStats).slice(-14)) // Last 14 days
  }

  // Fetch risk summary for selected subject
  const fetchRiskSummary = useCallback(
    async subjectId => {
      if (!subjectId || !currentUser?._id) {
        setRiskSummary({ byUserId: {}, list: [] })
        return
      }
      setRiskLoading(true)
      setRiskError('')
      try {
        const response = await apiGet(
          `attendance/subject/${subjectId}/risk-summary`
        )
        if (!response.ok) {
          throw new Error('Failed to load risk summary')
        }
        const result = await response.json()
        if (!result.success) {
          throw new Error(result.error || 'Failed to load risk summary')
        }
        setRiskSummary({
          subjectId,
          byUserId: result.data?.byUserId || {},
          list: result.data?.list || []
        })
      } catch (error) {
        console.error('Error fetching risk summary:', error)
        setRiskError(error.message || 'Failed to load risk data')
        setRiskSummary({ byUserId: {}, list: [] })
      } finally {
        setRiskLoading(false)
      }
    },
    [currentUser?._id]
  )

  // Handle risk subject change
  const handleRiskSubjectChange = useCallback(
    e => {
      const value = e.target.value
      setSelectedRiskSubjectId(value)
      if (value) {
        fetchRiskSummary(value)
      } else {
        setRiskSummary({ byUserId: {}, list: [] })
      }
    },
    [fetchRiskSummary]
  )

  useEffect(() => {
    const user = getCurrentUser()
    setCurrentUser(user)
    if (!user?._id) {
      return
    }
    fetchInstructorSubjects(user._id)
  }, [fetchInstructorSubjects])

  useEffect(() => {
    if (!currentUser?._id) return
    fetchReportData(currentUser._id)
  }, [currentUser?._id, fetchReportData])

  return (
    <div
      style={{ display: 'flex', height: '100vh', background: neutral.bgPage }}
    >
      <Sidebar role='instructor' logo={logo} />

      <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: brand.secondary,
              marginBottom: 8
            }}
          >
            <i className='bi bi-graph-up-arrow' style={{ marginRight: 12 }}></i>
            Attendance Insights
          </h1>
          <p style={{ color: neutral.textSecondary, fontSize: 15 }}>
            Analyze attendance patterns, track trends, and export detailed
            reports
          </p>
        </div>

        {/* Filters Card */}
        <div
          style={{
            background: neutral.bgSurface,
            borderRadius: 16,
            padding: 24,
            marginBottom: 24,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20
            }}
          >
            <h3
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: brand.secondary,
                margin: 0
              }}
            >
              <i className='bi bi-funnel' style={{ marginRight: 8 }}></i>
              Report Filters
            </h3>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleResetReportFilters}
                disabled={reportLoading}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: `1px solid ${neutral.border}`,
                  background: neutral.bgSurface,
                  color: neutral.textPrimary,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                <i
                  className='bi bi-arrow-counterclockwise'
                  style={{ marginRight: 6 }}
                ></i>
                Reset
              </button>
              <button
                onClick={handleExportReport}
                disabled={reportLoading || !reportDetails.length}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: interactive.success,
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: reportDetails.length ? 'pointer' : 'not-allowed',
                  opacity: reportDetails.length ? 1 : 0.6
                }}
              >
                <i className='bi bi-download' style={{ marginRight: 6 }}></i>
                Export CSV
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 16
            }}
          >
            {/* Subject Filter */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: neutral.textSecondary
                }}
              >
                Subject
              </label>
              <select
                value={reportFilters.subjectId}
                onChange={e => handleSubjectFilterChange(e.target.value)}
                disabled={reportLoading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${neutral.border}`,
                  fontSize: 14,
                  background: neutral.bgSurface
                }}
              >
                <option value=''>All Subjects</option>
                {subjectFilterOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Section Filter */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: neutral.textSecondary
                }}
              >
                Section
              </label>
              <select
                value={reportFilters.section}
                onChange={e =>
                  handleReportFilterChange('section', e.target.value)
                }
                disabled={reportLoading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${neutral.border}`,
                  fontSize: 14,
                  background: neutral.bgSurface
                }}
              >
                <option value=''>All Sections</option>
                {filteredSectionOptions.map(section => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: neutral.textSecondary
                }}
              >
                Status
              </label>
              <select
                value={reportFilters.status}
                onChange={e =>
                  handleReportFilterChange('status', e.target.value)
                }
                disabled={reportLoading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${neutral.border}`,
                  fontSize: 14,
                  background: neutral.bgSurface
                }}
              >
                {REPORT_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date From */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: neutral.textSecondary
                }}
              >
                From
              </label>
              <input
                type='date'
                value={reportFilters.from}
                onChange={e => handleReportFilterChange('from', e.target.value)}
                disabled={reportLoading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${neutral.border}`,
                  fontSize: 14,
                  background: neutral.bgSurface
                }}
              />
            </div>

            {/* Date To */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: neutral.textSecondary
                }}
              >
                To
              </label>
              <input
                type='date'
                value={reportFilters.to}
                onChange={e => handleReportFilterChange('to', e.target.value)}
                disabled={reportLoading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${neutral.border}`,
                  fontSize: 14,
                  background: neutral.bgSurface
                }}
              />
            </div>
          </div>
        </div>

        {/* Loading State */}
        {reportLoading && (
          <div
            style={{
              textAlign: 'center',
              padding: 48,
              color: neutral.textSecondary
            }}
          >
            <i
              className='bi bi-arrow-repeat'
              style={{
                fontSize: 32,
                animation: 'spin 1s linear infinite'
              }}
            ></i>
            <p style={{ marginTop: 16 }}>Loading insights...</p>
          </div>
        )}

        {/* Error State */}
        {reportError && (
          <div
            style={{
              background: statusColors.absent.bg,
              border: `1px solid ${statusColors.absent.border}`,
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
              color: statusColors.absent.border
            }}
          >
            <i
              className='bi bi-exclamation-triangle'
              style={{ marginRight: 8 }}
            ></i>
            {reportError}
          </div>
        )}

        {/* Summary Stats */}
        {!reportLoading && !reportError && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 16,
                marginBottom: 24
              }}
            >
              {summaryStats.map((stat, idx) => (
                <div
                  key={idx}
                  style={{
                    background: neutral.bgSurface,
                    borderRadius: 12,
                    padding: 20,
                    textAlign: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    borderLeft: stat.color ? `4px solid ${stat.color}` : 'none'
                  }}
                >
                  <i
                    className={`bi ${stat.icon}`}
                    style={{
                      fontSize: 24,
                      color: stat.color || brand.secondary,
                      marginBottom: 8,
                      display: 'block'
                    }}
                  ></i>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      color: stat.color || brand.secondary
                    }}
                  >
                    {stat.value}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: neutral.textSecondary,
                      marginTop: 4
                    }}
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Charts Row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                gap: 24,
                marginBottom: 24
              }}
            >
              {/* Pie Chart */}
              <div
                style={{
                  background: neutral.bgSurface,
                  borderRadius: 16,
                  padding: 24,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
                }}
              >
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: brand.secondary,
                    marginBottom: 16
                  }}
                >
                  Attendance Distribution
                </h3>
                {attendanceSummary.length > 0 ? (
                  <PieChartComponent data={attendanceSummary} />
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: 48,
                      color: neutral.textMuted
                    }}
                  >
                    No data available
                  </div>
                )}
              </div>

              {/* Trend Chart */}
              <div
                style={{
                  background: neutral.bgSurface,
                  borderRadius: 16,
                  padding: 24,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
                }}
              >
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: brand.secondary,
                    marginBottom: 16
                  }}
                >
                  Attendance Trend
                </h3>
                {trendData.length > 0 ? (
                  <ResponsiveContainer width='100%' height={280}>
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray='3 3' />
                      <XAxis dataKey='date' style={{ fontSize: 11 }} />
                      <YAxis style={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar
                        dataKey='present'
                        fill={statusColors.present.border}
                        name='Present'
                      />
                      <Bar
                        dataKey='late'
                        fill={statusColors.late.border}
                        name='Late'
                      />
                      <Bar
                        dataKey='absent'
                        fill={statusColors.absent.border}
                        name='Absent'
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: 48,
                      color: neutral.textMuted
                    }}
                  >
                    No trend data available
                  </div>
                )}
              </div>
            </div>

            {/* Risk & Intervention Signals Section */}
            <div
              style={{
                background: neutral.bgSurface,
                borderRadius: 16,
                padding: 24,
                marginBottom: 24,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: 16,
                  marginBottom: 20
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: brand.secondary,
                      margin: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <i className='bi bi-activity'></i>
                    Risk &amp; Intervention Signals
                  </h3>
                  <p
                    style={{
                      margin: '6px 0 0',
                      color: neutral.textSecondary,
                      fontSize: 13
                    }}
                  >
                    {selectedRiskSubjectId
                      ? `Showing risk analysis for selected subject`
                      : 'Select a subject to view risk insights'}
                  </p>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    minWidth: 220
                  }}
                >
                  <label
                    htmlFor='insights-risk-subject-select'
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: neutral.textSecondary,
                      textTransform: 'uppercase'
                    }}
                  >
                    Subject for Risk Analysis
                  </label>
                  <select
                    id='insights-risk-subject-select'
                    value={selectedRiskSubjectId}
                    onChange={handleRiskSubjectChange}
                    disabled={!subjectFilterOptions.length}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: `1px solid ${neutral.borderLight}`,
                      fontWeight: 600,
                      color: brand.secondary,
                      background: neutral.bgMuted,
                      minWidth: 200
                    }}
                  >
                    <option value=''>Select a subject</option>
                    {subjectFilterOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Risk Summary Cards */}
              <RiskSummaryRow
                counts={riskCounts}
                variant='full'
                gap={12}
                style={{ marginBottom: 20 }}
              />

              {/* Loading State */}
              {riskLoading && (
                <div style={{ color: neutral.textSecondary, fontSize: 13 }}>
                  <i className='bi bi-arrow-repeat spin'></i> Loading risk
                  summary...
                </div>
              )}

              {/* Error State */}
              {!riskLoading && riskError && (
                <div
                  style={{
                    color: statusColors.absent.border,
                    fontSize: 13,
                    fontWeight: 600
                  }}
                >
                  <i className='bi bi-exclamation-triangle'></i> {riskError}
                </div>
              )}

              {/* Top Risk Entries */}
              {!riskLoading && !riskError && topRiskEntries.length > 0 && (
                <div>
                  <h4
                    style={{
                      margin: '16px 0 8px',
                      fontSize: 14,
                      color: neutral.textSecondary,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5
                    }}
                  >
                    Highest Risk Participants
                  </h4>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}
                  >
                    {topRiskEntries.map(entry => {
                      const palette =
                        riskColorMap[entry?.risk?.band] || riskColorMap.default
                      return (
                        <div
                          key={entry.userId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: `1px solid ${palette.border}`,
                            background: palette.bg
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontWeight: 700,
                                color: palette.text,
                                fontSize: 14
                              }}
                            >
                              {entry.user?.firstName || entry.user?.lastName
                                ? `${entry.user?.firstName || ''} ${
                                    entry.user?.lastName || ''
                                  }`.trim()
                                : entry.user?.studentId || 'Unknown Student'}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: neutral.textSecondary
                              }}
                            >
                              {entry.user?.studentId || '—'} · Absent:{' '}
                              {entry.stats?.absentCount || 0} · Late:{' '}
                              {entry.stats?.lateCount || 0} · Tardy:{' '}
                              {entry.stats?.tardinessCount || 0}
                            </div>
                          </div>
                          <span
                            style={{
                              padding: '4px 12px',
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 700,
                              background: palette.bg,
                              color: palette.text,
                              border: `1px solid ${palette.border}`
                            }}
                          >
                            {entry.risk?.band?.toUpperCase() || 'UNKNOWN'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {!riskLoading &&
                !riskError &&
                selectedRiskSubjectId &&
                topRiskEntries.length === 0 && (
                  <div style={{ color: neutral.textSecondary, fontSize: 13 }}>
                    No at-risk participants found for this subject.
                  </div>
                )}

              {!selectedRiskSubjectId && !riskLoading && (
                <div
                  style={{
                    color: neutral.textMuted,
                    fontSize: 13,
                    textAlign: 'center',
                    padding: 20
                  }}
                >
                  <i
                    className='bi bi-info-circle'
                    style={{ marginRight: 6 }}
                  ></i>
                  Select a subject above to view risk insights
                </div>
              )}
            </div>

            {/* Subject Breakdown */}
            {reportBreakdown.bySubject.length > 0 && (
              <div
                style={{
                  background: neutral.bgSurface,
                  borderRadius: 16,
                  padding: 24,
                  marginBottom: 24,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
                }}
              >
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: brand.secondary,
                    marginBottom: 16
                  }}
                >
                  <i className='bi bi-book' style={{ marginRight: 8 }}></i>
                  Breakdown by Subject
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr
                        style={{ borderBottom: `2px solid ${neutral.border}` }}
                      >
                        <th
                          style={{
                            padding: 12,
                            textAlign: 'left',
                            color: neutral.textSecondary,
                            fontWeight: 600
                          }}
                        >
                          Subject
                        </th>
                        <th
                          style={{
                            padding: 12,
                            textAlign: 'center',
                            color: neutral.textSecondary,
                            fontWeight: 600
                          }}
                        >
                          Total
                        </th>
                        <th
                          style={{
                            padding: 12,
                            textAlign: 'center',
                            color: statusColors.present.border,
                            fontWeight: 600
                          }}
                        >
                          Present
                        </th>
                        <th
                          style={{
                            padding: 12,
                            textAlign: 'center',
                            color: statusColors.late.border,
                            fontWeight: 600
                          }}
                        >
                          Late
                        </th>
                        <th
                          style={{
                            padding: 12,
                            textAlign: 'center',
                            color: statusColors.absent.border,
                            fontWeight: 600
                          }}
                        >
                          Absent
                        </th>
                        <th
                          style={{
                            padding: 12,
                            textAlign: 'center',
                            color: neutral.textSecondary,
                            fontWeight: 600
                          }}
                        >
                          Rate
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportBreakdown.bySubject.map((subj, idx) => {
                        const total = subj.totalRecords || 0
                        const attended =
                          (subj.presentCount || 0) + (subj.lateCount || 0)
                        const rate =
                          total > 0 ? Math.round((attended / total) * 100) : 0
                        return (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: `1px solid ${neutral.borderLight}`
                            }}
                          >
                            <td style={{ padding: 12, fontWeight: 500 }}>
                              {subj.subjectName ||
                                subj.subjectCode ||
                                'Unknown'}
                            </td>
                            <td style={{ padding: 12, textAlign: 'center' }}>
                              {total}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                textAlign: 'center',
                                color: statusColors.present.border
                              }}
                            >
                              {subj.presentCount || 0}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                textAlign: 'center',
                                color: statusColors.late.border
                              }}
                            >
                              {subj.lateCount || 0}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                textAlign: 'center',
                                color: statusColors.absent.border
                              }}
                            >
                              {subj.absentCount || 0}
                            </td>
                            <td
                              style={{
                                padding: 12,
                                textAlign: 'center',
                                fontWeight: 600
                              }}
                            >
                              {rate}%
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Detailed Records */}
            {reportDetails.length > 0 && (
              <div
                style={{
                  background: neutral.bgSurface,
                  borderRadius: 16,
                  padding: 24,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16
                  }}
                >
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: brand.secondary,
                      margin: 0
                    }}
                  >
                    <i className='bi bi-list-ul' style={{ marginRight: 8 }}></i>
                    Detailed Records ({reportDetails.length})
                  </h3>
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead
                      style={{
                        position: 'sticky',
                        top: 0,
                        background: neutral.bgSurface
                      }}
                    >
                      <tr
                        style={{ borderBottom: `2px solid ${neutral.border}` }}
                      >
                        <th
                          style={{
                            padding: 10,
                            textAlign: 'left',
                            color: neutral.textSecondary,
                            fontSize: 13
                          }}
                        >
                          Student
                        </th>
                        <th
                          style={{
                            padding: 10,
                            textAlign: 'left',
                            color: neutral.textSecondary,
                            fontSize: 13
                          }}
                        >
                          Subject
                        </th>
                        <th
                          style={{
                            padding: 10,
                            textAlign: 'center',
                            color: neutral.textSecondary,
                            fontSize: 13
                          }}
                        >
                          Status
                        </th>
                        <th
                          style={{
                            padding: 10,
                            textAlign: 'left',
                            color: neutral.textSecondary,
                            fontSize: 13
                          }}
                        >
                          Date
                        </th>
                        <th
                          style={{
                            padding: 10,
                            textAlign: 'left',
                            color: neutral.textSecondary,
                            fontSize: 13
                          }}
                        >
                          Section
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportDetails.slice(0, 100).map((detail, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: `1px solid ${neutral.borderLight}`
                          }}
                        >
                          <td style={{ padding: 10, fontSize: 14 }}>
                            {detail.studentName || 'Unknown'}
                          </td>
                          <td style={{ padding: 10, fontSize: 14 }}>
                            {detail.subjectName || detail.subjectCode || '—'}
                          </td>
                          <td style={{ padding: 10, textAlign: 'center' }}>
                            <span
                              style={{
                                padding: '4px 12px',
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 600,
                                background:
                                  statusColors[
                                    (detail.status || 'present').toLowerCase()
                                  ]?.bg || neutral.bgMuted,
                                color:
                                  statusColors[
                                    (detail.status || 'present').toLowerCase()
                                  ]?.border || neutral.textPrimary
                              }}
                            >
                              {(detail.status || 'present').toUpperCase()}
                            </span>
                          </td>
                          <td style={{ padding: 10, fontSize: 14 }}>
                            {detail.sessionDate
                              ? new Date(
                                  detail.sessionDate
                                ).toLocaleDateString()
                              : '—'}
                          </td>
                          <td style={{ padding: 10, fontSize: 14 }}>
                            {detail.studentSection || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {reportDetails.length > 100 && (
                    <div
                      style={{
                        padding: 16,
                        textAlign: 'center',
                        color: neutral.textMuted,
                        borderTop: `1px solid ${neutral.borderLight}`
                      }}
                    >
                      Showing first 100 of {reportDetails.length} records.
                      Export to CSV for full data.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  )
}

export default AttendanceInsights
