import React, { useState, useEffect } from 'react'
import { apiGet, apiPost } from '../../utils/api'
import { brand, neutral, status as statusColors } from '../../utils/colors'

const SubjectStudentsModal = ({ isOpen, onClose, subjectId, subjectName }) => {
  const [students, setStudents] = useState([])
  const [studentsBySection, setStudentsBySection] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [totalStudents, setTotalStudents] = useState(0)
  const [refreshingAssignment, setRefreshingAssignment] = useState(false)
  const [scheduleMetrics, setScheduleMetrics] = useState(null)
  const [studentsPolicyStatus, setStudentsPolicyStatus] = useState({})
  const [loadingPolicy, setLoadingPolicy] = useState(false)

  useEffect(() => {
    if (isOpen && subjectId) {
      fetchStudents()
      fetchScheduleMetrics()
      fetchStudentsPolicyStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, subjectId])

  const fetchStudents = async () => {
    setLoading(true)
    setError('')

    try {
      const response = await apiGet(`subjects/${subjectId}/students`)
      const result = await response.json()

      if (result.success && result.data) {
        setStudents(result.data.students || [])
        setStudentsBySection(result.data.studentsBySection || {})
        setTotalStudents(result.data.totalStudents || 0)
      } else {
        setError(result.message || 'Failed to fetch students')
      }
    } catch (err) {
      console.error('Error fetching students:', err)
      setError('Failed to load students. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fetchScheduleMetrics = async () => {
    if (!subjectId) return

    setLoadingPolicy(true)
    try {
      const response = await apiGet(`subjects/${subjectId}/schedule-metrics`)
      const result = await response.json()

      if (result.success && result.data) {
        setScheduleMetrics(result.data)
      }
    } catch (err) {
      console.error('Error fetching schedule metrics:', err)
    } finally {
      setLoadingPolicy(false)
    }
  }

  const fetchStudentsPolicyStatus = async () => {
    if (!subjectId) return

    try {
      const response = await apiGet(`subjects/${subjectId}/students-policy-status`)
      const result = await response.json()

      if (result.success && result.data) {
        // Convert array to object keyed by student ID for easy lookup
        const statusMap = {}
        result.data.studentsPolicyStatus.forEach(item => {
          if (item.policyStatus) {
            statusMap[item.student._id] = item.policyStatus
          }
        })
        setStudentsPolicyStatus(statusMap)
      }
    } catch (err) {
      console.error('Error fetching students policy status:', err)
    }
  }

  const handleRefreshAssignment = async () => {
    setRefreshingAssignment(true)
    setError('')

    try {
      const response = await apiPost(`subjects/${subjectId}/auto-assign`, {})

      const result = await response.json()

      if (result.success) {
        // Reload students after assignment
        await fetchStudents()
        // Reload policy status
        await fetchStudentsPolicyStatus()
        // Show success message (could use a toast here)
        alert(
          `Assignment refreshed! ${
            result.data.assignmentSummary?.groupsAssigned || 0
          } student-group assignment(s) made.`
        )
      } else {
        setError(result.message || 'Failed to refresh assignment')
      }
    } catch (err) {
      console.error('Error refreshing assignment:', err)
      setError('Failed to refresh assignment. Please try again.')
    } finally {
      setRefreshingAssignment(false)
    }
  }

  if (!isOpen) return null

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
      `}</style>

      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>
              <i className='bi bi-people-fill' style={{ marginRight: 10 }}></i>
              Enrolled Students
            </h2>
            <p style={styles.subtitle}>
              {subjectName} • {totalStudents}{' '}
              {totalStudents === 1 ? 'Student' : 'Students'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={handleRefreshAssignment}
              disabled={refreshingAssignment}
              style={{
                padding: '8px 16px',
                background: refreshingAssignment
                  ? neutral.lightGray
                  : brand.secondary,
                color: neutral.bgSurface,
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: refreshingAssignment ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {refreshingAssignment ? (
                <>
                  <i className='bi bi-hourglass-split'></i>
                  Refreshing...
                </>
              ) : (
                <>
                  <i className='bi bi-arrow-clockwise'></i>
                  Refresh Assignment
                </>
              )}
            </button>
            <button
              onClick={onClose}
              style={styles.closeBtn}
              aria-label='Close modal'
            >
              <i className='bi bi-x-lg'></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {loading && (
            <div style={styles.loadingContainer}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Loading students...</p>
            </div>
          )}

          {error && !loading && (
            <div style={styles.errorContainer}>
              <i
                className='bi bi-exclamation-triangle'
                style={{
                  fontSize: 48,
                  color: statusColors.absent.border,
                  marginBottom: 12
                }}
              ></i>
              <p style={styles.errorText}>{error}</p>
              <button onClick={fetchStudents} style={styles.retryBtn}>
                <i
                  className='bi bi-arrow-clockwise'
                  style={{ marginRight: 6 }}
                ></i>
                Retry
              </button>
            </div>
          )}

          {!loading && !error && students.length === 0 && (
            <div style={styles.emptyContainer}>
              <i
                className='bi bi-people'
                style={{
                  fontSize: 64,
                  color: neutral.border,
                  marginBottom: 16
                }}
              ></i>
              <h3 style={styles.emptyTitle}>No Students Enrolled</h3>
              <p style={styles.emptyText}>
                No students are currently enrolled in this subject. Students are
                automatically enrolled based on their section assignment.
              </p>
            </div>
          )}

          {!loading && !error && students.length > 0 && (
            <div>
              {/* Summary */}
              <div style={styles.summary}>
                <div style={styles.summaryCard}>
                  <i
                    className='bi bi-people-fill'
                    style={styles.summaryIcon}
                  ></i>
                  <div>
                    <div style={styles.summaryValue}>{totalStudents}</div>
                    <div style={styles.summaryLabel}>Total Students</div>
                  </div>
                </div>
                <div style={styles.summaryCard}>
                  <i className='bi bi-grid-3x3' style={styles.summaryIcon}></i>
                  <div>
                    <div style={styles.summaryValue}>
                      {Object.keys(studentsBySection).length}
                    </div>
                    <div style={styles.summaryLabel}>Sections</div>
                  </div>
                </div>
              </div>

              {/* Policy Summary */}
              {scheduleMetrics && scheduleMetrics.policy && (
                <div style={styles.policySummary}>
                  <div style={styles.policyHeader}>
                    <i className='bi bi-shield-check' style={{ marginRight: 8 }}></i>
                    <h3 style={styles.policyTitle}>Attendance Policy</h3>
                  </div>
                  <div style={styles.policyGrid}>
                    <div style={styles.policyCard}>
                      <div style={styles.policyLabel}>Weeks in Semester</div>
                      <div style={styles.policyValue}>
                        {scheduleMetrics.weeks?.weeksInSemester || 18} weeks
                      </div>
                    </div>
                    <div style={styles.policyCard}>
                      <div style={styles.policyLabel}>Semester Hours (4 months)</div>
                      <div style={styles.policyValue}>
                        {scheduleMetrics.hours?.totalSemesterHours || 0} hrs
                      </div>
                    </div>
                    <div style={styles.policyCard}>
                      <div style={styles.policyLabel}>Total Sessions</div>
                      <div style={styles.policyValue}>
                        {scheduleMetrics.sessions?.totalSessions || 0}
                      </div>
                    </div>
                    <div style={styles.policyCard}>
                      <div style={styles.policyLabel}>Max Allowed Absences (17%)</div>
                      <div style={styles.policyValue}>
                        {scheduleMetrics.policy?.absence?.maxAllowedAbsences || 0}
                      </div>
                    </div>
                    <div style={styles.policyCard}>
                      <div style={styles.policyLabel}>Max Allowed Tardiness</div>
                      <div style={styles.policyValue}>
                        {scheduleMetrics.policy?.absence?.maxAllowedTardiness || 0}
                      </div>
                    </div>
                    <div style={styles.policyCard}>
                      <div style={styles.policyLabel}>Tardiness Threshold (25%)</div>
                      <div style={styles.policyValue}>
                        {scheduleMetrics.policy?.tardiness?.thresholdMinutes || 0} min
                      </div>
                    </div>
                    <div style={styles.policyCard}>
                      <div style={styles.policyLabel}>Conversion Rate</div>
                      <div style={styles.policyValue}>
                        {scheduleMetrics.policy?.conversion?.tardinessToAbsence || 3} tardy = 1 absence
                      </div>
                    </div>
                  </div>
                  <div style={styles.policyDescription}>
                    <div style={styles.policyDescItem}>
                      <i className='bi bi-info-circle' style={{ marginRight: 6 }}></i>
                      {scheduleMetrics.policy?.tardiness?.description}
                    </div>
                    <div style={styles.policyDescItem}>
                      <i className='bi bi-info-circle' style={{ marginRight: 6 }}></i>
                      {scheduleMetrics.policy?.absence?.description}
                    </div>
                  </div>
                </div>
              )}

              {/* Students by Section */}
              {Object.keys(studentsBySection)
                .sort()
                .map(section => (
                  <div key={section} style={styles.sectionGroup}>
                    <div style={styles.sectionHeader}>
                      <div style={styles.sectionBadge}>
                        <i
                          className='bi bi-collection'
                          style={{ marginRight: 6 }}
                        ></i>
                        {section}
                      </div>
                      <span style={styles.sectionCount}>
                        {studentsBySection[section].length}{' '}
                        {studentsBySection[section].length === 1
                          ? 'student'
                          : 'students'}
                      </span>
                    </div>

                    <div style={styles.studentList}>
                      {studentsBySection[section].map((student, index) => {
                        const policyStatus = studentsPolicyStatus[student._id]
                        return (
                          <div key={student._id} style={styles.studentCard}>
                            <div style={styles.studentNumber}>{index + 1}</div>
                            <div style={styles.studentInfo}>
                              <div style={styles.studentName}>
                                {student.firstName} {student.lastName}
                                {student.active === 'Inactive' && (
                                  <span style={styles.inactiveBadge}>
                                    Inactive
                                  </span>
                                )}
                              </div>
                              <div style={styles.studentDetails}>
                                <span style={styles.studentDetail}>
                                  <i
                                    className='bi bi-envelope'
                                    style={{ marginRight: 4 }}
                                  ></i>
                                  {student.email}
                                </span>
                                {student.phone && (
                                  <span style={styles.studentDetail}>
                                    <i
                                      className='bi bi-telephone'
                                      style={{ marginRight: 4 }}
                                    ></i>
                                    {student.phone}
                                  </span>
                                )}
                                {student.yearLevel && (
                                  <span style={styles.studentDetail}>
                                    <i
                                      className='bi bi-mortarboard'
                                      style={{ marginRight: 4 }}
                                    ></i>
                                    {student.yearLevel}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Policy Status */}
                            {policyStatus && (
                              <div style={styles.policyStatusColumn}>
                                <div
                                  style={{
                                    ...styles.policyStatusBadge,
                                    background:
                                      policyStatus.policyStatus === 'safe'
                                        ? statusColors.present.bg
                                        : policyStatus.policyStatus === 'at_risk'
                                        ? statusColors.late.bg
                                        : statusColors.absent.bg,
                                    color:
                                      policyStatus.policyStatus === 'safe'
                                        ? statusColors.present.text
                                        : policyStatus.policyStatus === 'at_risk'
                                        ? statusColors.late.text
                                        : statusColors.absent.text,
                                    border: `1px solid ${
                                      policyStatus.policyStatus === 'safe'
                                        ? statusColors.present.border
                                        : policyStatus.policyStatus === 'at_risk'
                                        ? statusColors.late.border
                                        : statusColors.absent.border
                                    }`
                                  }}
                                >
                                  {policyStatus.policyStatus === 'safe' && (
                                    <i className='bi bi-check-circle' style={{ marginRight: 4 }}></i>
                                  )}
                                  {policyStatus.policyStatus === 'at_risk' && (
                                    <i className='bi bi-exclamation-triangle' style={{ marginRight: 4 }}></i>
                                  )}
                                  {policyStatus.policyStatus === 'over_limit' && (
                                    <i className='bi bi-x-circle' style={{ marginRight: 4 }}></i>
                                  )}
                                  {policyStatus.policyStatus === 'safe' && 'Safe'}
                                  {policyStatus.policyStatus === 'at_risk' && 'At Risk'}
                                  {policyStatus.policyStatus === 'over_limit' && 'Over Limit'}
                                </div>
                                <div style={styles.policyStats}>
                                  <div style={styles.policyStatItem}>
                                    <span style={styles.policyStatLabel}>Tardy:</span>
                                    <span style={styles.policyStatValue}>
                                      {policyStatus.tardinessCount} / {policyStatus.maxAllowedTardiness}
                                    </span>
                                  </div>
                                  <div style={styles.policyStatItem}>
                                    <span style={styles.policyStatLabel}>Absent:</span>
                                    <span style={styles.policyStatValue}>
                                      {policyStatus.absenceCount} / {policyStatus.maxAllowedAbsences}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <button onClick={onClose} style={styles.closeButton}>
            <i className='bi bi-x-circle' style={{ marginRight: 8 }}></i>
            Close
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
    borderBottom: `2px solid ${neutral.bgMuted}`,
    background: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.accent} 100%)`,
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
    color: neutral.bgMuted,
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
  loadingContainer: {
    textAlign: 'center',
    padding: '60px 20px',
    color: neutral.textSecondary
  },
  spinner: {
    width: 48,
    height: 48,
    border: `4px solid ${neutral.border}`,
    borderTop: `4px solid ${brand.primary}`,
    borderRadius: '50%',
    margin: '0 auto 16px',
    animation: 'spin 1s linear infinite'
  },
  loadingText: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600
  },
  errorContainer: {
    textAlign: 'center',
    padding: '60px 20px'
  },
  errorText: {
    color: statusColors.absent.border,
    fontSize: 16,
    marginBottom: 20
  },
  retryBtn: {
    padding: '10px 20px',
    background: brand.secondary,
    color: neutral.bgSurface,
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center'
  },
  emptyContainer: {
    textAlign: 'center',
    padding: '60px 20px'
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: brand.secondary,
    marginBottom: 8
  },
  emptyText: {
    fontSize: 14,
    color: neutral.textSecondary,
    maxWidth: 400,
    margin: '0 auto'
  },
  summary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 16,
    marginBottom: 24
  },
  summaryCard: {
    background: neutral.bgSurface,
    padding: 20,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    border: `1px solid ${neutral.border}`
  },
  summaryIcon: {
    fontSize: 32,
    color: brand.secondary,
    opacity: 0.7
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: 800,
    color: brand.secondary,
    lineHeight: 1
  },
  summaryLabel: {
    fontSize: 13,
    color: neutral.textSecondary,
    fontWeight: 600,
    marginTop: 4
  },
  sectionGroup: {
    marginBottom: 24
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionBadge: {
    background: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.accent} 100%)`,
    color: neutral.bgSurface,
    padding: '8px 16px',
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 15,
    display: 'flex',
    alignItems: 'center'
  },
  sectionCount: {
    fontSize: 13,
    color: neutral.textSecondary,
    fontWeight: 600
  },
  studentList: {
    display: 'grid',
    gap: 12
  },
  studentCard: {
    background: neutral.bgSurface,
    padding: 16,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    border: `1px solid ${neutral.border}`,
    transition: 'all 0.2s'
  },
  studentNumber: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: neutral.bgMuted,
    color: brand.secondary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0
  },
  studentInfo: {
    flex: 1,
    minWidth: 0
  },
  studentName: {
    fontSize: 16,
    fontWeight: 700,
    color: brand.secondary,
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  inactiveBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: statusColors.absent.border,
    background: statusColors.absent.bg,
    padding: '2px 8px',
    borderRadius: 4
  },
  studentDetails: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: 13,
    color: neutral.textSecondary
  },
  studentDetail: {
    display: 'flex',
    alignItems: 'center'
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    padding: '20px 32px',
    borderTop: `2px solid ${neutral.bgMuted}`,
    background: neutral.bgSurface
  },
  closeButton: {
    padding: '12px 24px',
    borderRadius: 10,
    border: `2px solid ${neutral.textSecondary}`,
    background: neutral.bgSurface,
    color: neutral.textSecondary,
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center'
  },
  policySummary: {
    background: neutral.bgSurface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    border: `2px solid ${brand.secondary}`,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
  },
  policyHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 16,
    color: brand.secondary,
    fontSize: 18,
    fontWeight: 700
  },
  policyTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: brand.secondary
  },
  policyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    marginBottom: 16
  },
  policyCard: {
    background: neutral.bgMuted,
    padding: 12,
    borderRadius: 8,
    border: `1px solid ${neutral.border}`
  },
  policyLabel: {
    fontSize: 11,
    color: neutral.textSecondary,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6
  },
  policyValue: {
    fontSize: 16,
    fontWeight: 700,
    color: brand.secondary
  },
  policyDescription: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingTop: 12,
    borderTop: `1px solid ${neutral.border}`
  },
  policyDescItem: {
    fontSize: 12,
    color: neutral.textSecondary,
    display: 'flex',
    alignItems: 'center'
  },
  policyStatusColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
    minWidth: 140
  },
  policyStatusBadge: {
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center'
  },
  policyStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 11
  },
  policyStatItem: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8
  },
  policyStatLabel: {
    color: neutral.textSecondary,
    fontWeight: 600
  },
  policyStatValue: {
    color: brand.secondary,
    fontWeight: 700
  }
}

export default SubjectStudentsModal
