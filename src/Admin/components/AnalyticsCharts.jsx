import React, { useMemo, useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { apiGet } from '../../utils/api'
import { brand, neutral, status as statusColors } from '../../utils/colors'

/**
 * Analytics Charts Component
 * Displays various charts for dashboard analytics
 */
const AnalyticsCharts = ({ instructors = [], students = [] }) => {
  const [attendanceData, setAttendanceData] = useState([])

  // Fetch attendance data for time-series
  useEffect(() => {
    const fetchAttendanceData = async () => {
      try {
        const response = await apiGet('attendance/recent?limit=1000')
        if (response.ok) {
          const result = await response.json()
          setAttendanceData(result.data || [])
        }
      } catch (error) {
        console.error('Error fetching attendance data for analytics:', error)
      }
    }

    fetchAttendanceData()
  }, [])

  // Generate time-series data from real attendance records
  const timeSeriesData = useMemo(() => {
    const last7Days = []
    const today = new Date()

    // Initialize last 7 days with zeros
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      last7Days.push({
        date: date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        }),
        attendance: 0,
        late: 0,
        absent: 0
      })
    }

    // Process attendance records
    attendanceData.forEach(record => {
      if (!record.sessionDate) return

      const recordDate = new Date(record.sessionDate)
      if (isNaN(recordDate.getTime())) return
      recordDate.setHours(0, 0, 0, 0)

      // Find matching day in last7Days by comparing dates
      const dayIndex = last7Days.findIndex((day, idx) => {
        const dayDate = new Date(today)
        dayDate.setDate(today.getDate() - (6 - idx))
        dayDate.setHours(0, 0, 0, 0)
        return dayDate.getTime() === recordDate.getTime()
      })

      if (dayIndex >= 0) {
        const status = record.status || record.rawStatus || 'present'
        if (status.toLowerCase() === 'present') {
          last7Days[dayIndex].attendance += 1
        } else if (status.toLowerCase() === 'late') {
          last7Days[dayIndex].late += 1
        } else if (status.toLowerCase() === 'absent') {
          last7Days[dayIndex].absent += 1
        }
      }
    })

    // Calculate attendance percentage for each day
    last7Days.forEach(day => {
      const total = day.attendance + day.late + day.absent
      day.attendance =
        total > 0 ? Math.round((day.attendance / total) * 100) : 0
    })

    return last7Days
  }, [attendanceData])

  // Calculate department distribution
  const departmentData = useMemo(() => {
    const allUsers = [...instructors, ...students]
    const deptCount = allUsers.reduce((acc, user) => {
      acc[user.department] = (acc[user.department] || 0) + 1
      return acc
    }, {})

    return Object.entries(deptCount).map(([name, value]) => ({ name, value }))
  }, [instructors, students])

  // Calculate active vs inactive
  const statusData = useMemo(() => {
    const allUsers = [...instructors, ...students]
    const activeCount = allUsers.filter(u => u.active === 'Active').length
    const inactiveCount = allUsers.filter(u => u.active === 'Inactive').length

    return [
      { name: 'Active', value: activeCount },
      { name: 'Inactive', value: inactiveCount }
    ]
  }, [instructors, students])

  // Calculate subject enrollment (for instructors)
  const subjectData = useMemo(() => {
    const subjectCount = {}

    instructors.forEach(instructor => {
      instructor.subjects?.forEach(subject => {
        if (!subjectCount[subject.name]) {
          subjectCount[subject.name] = 0
        }
        subject.sections?.forEach(section => {
          subjectCount[subject.name] += section.students?.length || 0
        })
      })
    })

    return Object.entries(subjectCount)
      .map(([name, students]) => ({ name, students }))
      .slice(0, 5) // Top 5 subjects
  }, [instructors])

  const COLORS = [
    brand.secondary,
    statusColors.present.border,
    statusColors.late.border,
    statusColors.absent.border,
    '#9C27B0',
    '#00BCD4'
  ]

  return (
    <>
      <style>
        {`
          .analytics-charts-scrollable::-webkit-scrollbar {
            width: 8px;
          }
          
          .analytics-charts-scrollable::-webkit-scrollbar-track {
            background: ${neutral.bgMuted};
            border-radius: 4px;
          }
          
          .analytics-charts-scrollable::-webkit-scrollbar-thumb {
            background: ${brand.secondary};
            border-radius: 4px;
          }
          
          .analytics-charts-scrollable::-webkit-scrollbar-thumb:hover {
            background: ${brand.primary};
          }

          .analytics-charts-scrollable {
            scroll-behavior: smooth;
          }
        `}
      </style>
      <div
        style={styles.scrollableContainer}
        className='analytics-charts-scrollable'
      >
        <div style={styles.container}>
          {/* Attendance Trend */}
          <div style={styles.chartCard}>
            <h4 style={styles.chartTitle}>Attendance Trend (Last 7 Days)</h4>
            <ResponsiveContainer width='100%' height={250}>
              <LineChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='date' style={{ fontSize: 12 }} />
                <YAxis style={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type='monotone'
                  dataKey='attendance'
                  stroke={brand.secondary}
                  strokeWidth={2}
                  name='Attendance %'
                />
                <Line
                  type='monotone'
                  dataKey='late'
                  stroke={statusColors.late.border}
                  strokeWidth={2}
                  name='Late'
                />
                <Line
                  type='monotone'
                  dataKey='absent'
                  stroke={statusColors.absent.border}
                  strokeWidth={2}
                  name='Absent'
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Department Distribution */}
          <div style={styles.chartCard}>
            <h4 style={styles.chartTitle}>Users by Department</h4>
            <ResponsiveContainer width='100%' height={250}>
              <PieChart>
                <Pie
                  data={departmentData}
                  cx='50%'
                  cy='50%'
                  labelLine={false}
                  label={({ name, percent }) =>
                    `${name}: ${(percent * 100).toFixed(0)}%`
                  }
                  outerRadius={80}
                  fill={brand.secondary}
                  dataKey='value'
                >
                  {departmentData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Active vs Inactive */}
          <div style={styles.chartCard}>
            <h4 style={styles.chartTitle}>User Status</h4>
            <ResponsiveContainer width='100%' height={250}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='name' style={{ fontSize: 12 }} />
                <YAxis style={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey='value' fill={brand.secondary} name='Users' />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Subject Enrollment */}
          {subjectData.length > 0 && (
            <div style={styles.chartCard}>
              <h4 style={styles.chartTitle}>Top Enrolled Subjects</h4>
              <ResponsiveContainer width='100%' height={250}>
                <BarChart data={subjectData} layout='vertical'>
                  <CartesianGrid strokeDasharray='3 3' />
                  <XAxis type='number' style={{ fontSize: 12 }} />
                  <YAxis
                    dataKey='name'
                    type='category'
                    width={150}
                    style={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey='students'
                    fill={statusColors.present.border}
                    name='Students Enrolled'
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const styles = {
  scrollableContainer: {
    maxHeight: '600px',
    overflowY: 'auto',
    overflowX: 'hidden',
    paddingRight: 8,
    marginTop: 20,
    // Custom scrollbar styling
    scrollbarWidth: 'thin',
    scrollbarColor: `${brand.secondary} ${neutral.bgMuted}`
  },
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20
  },
  chartCard: {
    background: '#fff',
    borderRadius: 12,
    padding: 20,
    border: `1px solid ${neutral.borderLight}`,
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: brand.secondary,
    marginBottom: 16,
    marginTop: 0
  }
}

export default AnalyticsCharts
