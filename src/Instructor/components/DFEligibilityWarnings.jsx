import React, { useState, useEffect, useMemo } from 'react'
import { apiGet } from '../../utils/api'
import { brand, neutral, status as statusColors } from '../../utils/colors'
// Phase 4: CSS classes for theme-aware styling
import '../../styles/common.css'
import {
  DF_CONSECUTIVE_WEEKS_THRESHOLD,
  DF_CONTACT_HOURS_THRESHOLD_PERCENT
} from '../../utils/attendancePolicy'

const DFEligibilityWarnings = ({ subjectId, onClose }) => {
  const [loading, setLoading] = useState(true)
  const [eligibilityData, setEligibilityData] = useState(null)
  const [error, setError] = useState('')

  const dfContactHoursThresholdDisplay = useMemo(() => {
    const value = Number(DF_CONTACT_HOURS_THRESHOLD_PERCENT)
    if (!Number.isFinite(value)) return '17%'
    return `${Math.round(value * 100)}%`
  }, [])

  useEffect(() => {
    fetchEligibilityData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId])

  const fetchEligibilityData = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiGet(`grades/eligibility-summary/${subjectId}`)
      if (!response.ok) {
        throw new Error(
          `Failed to fetch eligibility data: ${response.statusText}`
        )
      }
      const result = await response.json()
      if (result.success) {
        setEligibilityData(result.data)
      } else {
        throw new Error(
          result.error || result.message || 'Failed to fetch eligibility data'
        )
      }
    } catch (err) {
      console.error('Error fetching eligibility data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div
          style={{
            width: 50,
            height: 50,
            border: `5px solid ${neutral.borderLight}`,
            borderTop: `5px solid ${brand.secondary}`,
            borderRadius: '50%',
            margin: '0 auto 20px',
            animation: 'spin 1s linear infinite'
          }}
        ></div>
        <p style={{ fontSize: 16, fontWeight: 600, color: brand.secondary }}>
          Loading eligibility data...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div
          style={{
            color: statusColors.absent.border,
            fontSize: 18,
            marginBottom: 16
          }}
        >
          <i className='bi bi-exclamation-triangle-fill'></i> Error
        </div>
        <p style={{ color: neutral.textMuted }}>{error}</p>
        <button
          onClick={fetchEligibilityData}
          style={{
            marginTop: 16,
            padding: '10px 20px',
            background: brand.secondary,
            color: neutral.bgSurface,
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!eligibilityData) {
    return (
      <div
        style={{ padding: 40, textAlign: 'center', color: neutral.textMuted }}
      >
        No eligibility data available
      </div>
    )
  }

  const { eligible, atRisk, safe: _safe, summary } = eligibilityData

  return (
    <div style={{ padding: 24 }}>
      {onClose && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              color: brand.secondary
            }}
          >
            D/F Eligibility Warnings
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: neutral.textMuted,
              padding: '4px 8px'
            }}
          >
            <i className='bi bi-x-lg'></i>
          </button>
        </div>
      )}

      {/* Policy Basis Section */}
      <div
        style={{
          background: neutral.bgMuted,
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          border: `2px solid ${brand.secondary}`
        }}
      >
        <h3
          style={{
            margin: '0 0 16px 0',
            fontSize: 16,
            fontWeight: 700,
            color: brand.secondary,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <i className='bi bi-info-circle-fill'></i>
          D/F Eligibility Rules (BOR Resolution No. 31, s. 2018)
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 16
          }}
        >
          <div
            style={{
              background: neutral.bgSurface,
              padding: 16,
              borderRadius: 8,
              border: `1px solid ${neutral.border}`
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: statusColors.absent.border,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <i className='bi bi-calendar-x'></i>
              Consecutive Weeks Rule
            </div>
            <div style={{ fontSize: 14, color: neutral.textMuted }}>
              <strong>
                {DF_CONSECUTIVE_WEEKS_THRESHOLD}+ consecutive weeks
              </strong>{' '}
              of unexcused absences triggers automatic D/F eligibility.
            </div>
          </div>
          <div
            style={{
              background: neutral.bgSurface,
              padding: 16,
              borderRadius: 8,
              border: `1px solid ${neutral.border}`
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: statusColors.absent.border,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <i className='bi bi-clock-history'></i>
              Contact Hours Rule
            </div>
            <div style={{ fontSize: 14, color: neutral.textMuted }}>
              Missing more than{' '}
              <strong>
                {dfContactHoursThresholdDisplay} of total contact hours
              </strong>{' '}
              triggers automatic D/F eligibility.
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            color: neutral.textMuted,
            fontStyle: 'italic'
          }}
        >
          <i
            className='bi bi-exclamation-triangle'
            style={{ marginRight: 6 }}
          ></i>
          Note: 3 instances of tardiness = 1 absence equivalent. Absences during
          add/drop period are NOT counted.
        </div>
      </div>

      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 32
        }}
      >
        <div
          style={{
            background: `linear-gradient(135deg, ${statusColors.absent.border}dd 0%, ${statusColors.absent.border} 100%)`,
            borderRadius: 12,
            padding: 20,
            color: neutral.bgSurface,
            boxShadow: '0 4px 12px rgba(255, 65, 54, 0.3)'
          }}
        >
          <div
            style={{
              fontSize: 14,
              opacity: 0.9,
              marginBottom: 8,
              fontWeight: 600
            }}
          >
            <i
              className='bi bi-exclamation-triangle-fill'
              style={{ marginRight: 6 }}
            ></i>
            D/F Eligible
          </div>
          <div style={{ fontSize: 36, fontWeight: 800 }}>
            {summary.eligible}
          </div>
        </div>

        <div
          style={{
            background: `linear-gradient(135deg, ${statusColors.host.border}dd 0%, ${statusColors.host.border} 100%)`,
            borderRadius: 12,
            padding: 20,
            color: neutral.bgSurface,
            boxShadow: '0 4px 12px rgba(255, 183, 0, 0.3)'
          }}
        >
          <div
            style={{
              fontSize: 14,
              opacity: 0.9,
              marginBottom: 8,
              fontWeight: 600
            }}
          >
            <i
              className='bi bi-exclamation-circle-fill'
              style={{ marginRight: 6 }}
            ></i>
            At Risk
          </div>
          <div style={{ fontSize: 36, fontWeight: 800 }}>{summary.atRisk}</div>
        </div>

        <div
          style={{
            background: `linear-gradient(135deg, ${statusColors.present.border}dd 0%, ${statusColors.present.border} 100%)`,
            borderRadius: 12,
            padding: 20,
            color: neutral.bgSurface,
            boxShadow: '0 4px 12px rgba(46, 204, 64, 0.3)'
          }}
        >
          <div
            style={{
              fontSize: 14,
              opacity: 0.9,
              marginBottom: 8,
              fontWeight: 600
            }}
          >
            <i
              className='bi bi-check-circle-fill'
              style={{ marginRight: 6 }}
            ></i>
            Safe
          </div>
          <div style={{ fontSize: 36, fontWeight: 800 }}>{summary.safe}</div>
        </div>
      </div>

      {/* Eligible Students */}
      {eligible.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: statusColors.absent.border,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <i className='bi bi-exclamation-triangle-fill'></i>
            D/F Eligible Students ({eligible.length})
          </h3>
          <div
            style={{
              background: neutral.bgSurface,
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              overflow: 'hidden'
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    background: statusColors.absent.border,
                    color: neutral.bgSurface
                  }}
                >
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 700
                    }}
                  >
                    Student Name
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 700
                    }}
                  >
                    Student ID
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 700
                    }}
                  >
                    Consecutive Weeks
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 700
                    }}
                  >
                    Contact Hours %
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 700
                    }}
                  >
                    Reasons
                  </th>
                </tr>
              </thead>
              <tbody>
                {eligible.map((student, idx) => (
                  <tr
                    key={student.userId}
                    style={{
                      borderBottom: `1px solid ${neutral.borderLight}`,
                      background:
                        idx % 2 === 0
                          ? neutral.bgSurface
                          : statusColors.absent.bg
                    }}
                  >
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: 14,
                        fontWeight: 600,
                        color: brand.primary
                      }}
                    >
                      {student.studentName}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: 14,
                        color: neutral.textMuted
                      }}
                    >
                      {student.studentId || 'N/A'}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: 14,
                        color: statusColors.absent.border,
                        fontWeight: 700
                      }}
                    >
                      {student.consecutiveWeeks} weeks
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: 14,
                        color: statusColors.absent.border,
                        fontWeight: 700
                      }}
                    >
                      {student.contactHoursPercentage.toFixed(2)}%
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: 13,
                        color: neutral.textMuted
                      }}
                    >
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {student.reasons.map((reason, rIdx) => (
                          <li key={rIdx} style={{ marginBottom: 4 }}>
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* At Risk Students */}
      {atRisk.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: statusColors.host.border,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <i className='bi bi-exclamation-circle-fill'></i>
            At Risk Students ({atRisk.length})
          </h3>
          <div
            style={{
              background: neutral.bgSurface,
              borderRadius: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              overflow: 'hidden'
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    background: statusColors.host.border,
                    color: neutral.bgSurface
                  }}
                >
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 700
                    }}
                  >
                    Student Name
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 700
                    }}
                  >
                    Student ID
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 700
                    }}
                  >
                    Consecutive Weeks
                  </th>
                  <th
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: 14,
                      fontWeight: 700
                    }}
                  >
                    Contact Hours %
                  </th>
                </tr>
              </thead>
              <tbody>
                {atRisk.map((student, idx) => (
                  <tr
                    key={student.userId}
                    style={{
                      borderBottom: `1px solid ${neutral.borderLight}`,
                      background:
                        idx % 2 === 0 ? neutral.bgSurface : statusColors.host.bg
                    }}
                  >
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: 14,
                        fontWeight: 600,
                        color: brand.primary
                      }}
                    >
                      {student.studentName}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: 14,
                        color: neutral.textMuted
                      }}
                    >
                      {student.studentId || 'N/A'}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: 14,
                        color: statusColors.host.border,
                        fontWeight: 600
                      }}
                    >
                      {student.consecutiveWeeks} weeks
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontSize: 14,
                        color: statusColors.host.border,
                        fontWeight: 600
                      }}
                    >
                      {student.contactHoursPercentage.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {eligible.length === 0 && atRisk.length === 0 && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            background: statusColors.present.bg,
            borderRadius: 12,
            color: neutral.textMuted
          }}
        >
          <i
            className='bi bi-check-circle-fill'
            style={{
              fontSize: 48,
              color: statusColors.present.border,
              marginBottom: 16,
              display: 'block'
            }}
          ></i>
          <p
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: '#23225c',
              marginBottom: 8
            }}
          >
            No students are currently eligible for D/F grade
          </p>
          <p style={{ fontSize: 14 }}>
            All students are meeting attendance requirements.
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default DFEligibilityWarnings
