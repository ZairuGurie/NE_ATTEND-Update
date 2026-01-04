/**
 * PolicyInfoPanel Component
 *
 * Displays attendance policy information in a clear, readable format
 * Based on BOR Resolution No. 31, s. 2018
 */

import React, { useState } from 'react'
import {
  brand,
  neutral,
  status as statusColors,
  interactive
} from '../../utils/colors'
import {
  getPolicyInfo,
  TARDINESS_THRESHOLD_PERCENT,
  TARDINESS_TO_ABSENCE_RATIO,
  DF_CONSECUTIVE_WEEKS_THRESHOLD,
  DF_CONTACT_HOURS_THRESHOLD_PERCENT
} from '../../utils/attendancePolicy'

/**
 * PolicyInfoPanel - Displays attendance policy rules
 * @param {number} classDurationMinutes - Class duration for examples (default: 90)
 * @param {function} onClose - Optional close handler
 * @param {boolean} compact - Show compact version
 */
export const PolicyInfoPanel = ({
  classDurationMinutes = 90,
  onClose,
  compact = false
}) => {
  const [expandedSection, setExpandedSection] = useState(null)
  const policy = getPolicyInfo(classDurationMinutes)

  const toggleSection = section => {
    setExpandedSection(expandedSection === section ? null : section)
  }

  const styles = {
    container: {
      background: neutral.bgSurface,
      borderRadius: 16,
      boxShadow: '0 4px 24px rgba(44,44,84,0.12)',
      overflow: 'hidden'
    },
    header: {
      background: `linear-gradient(135deg, ${brand.secondary} 0%, ${brand.primary} 100%)`,
      color: '#fff',
      padding: compact ? '16px 20px' : '24px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    headerTitle: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    },
    headerIcon: {
      fontSize: compact ? 24 : 28,
      opacity: 0.9
    },
    title: {
      margin: 0,
      fontSize: compact ? 18 : 22,
      fontWeight: 700
    },
    subtitle: {
      margin: '4px 0 0 0',
      fontSize: 13,
      opacity: 0.85,
      fontWeight: 500
    },
    closeBtn: {
      background: 'rgba(255,255,255,0.15)',
      border: 'none',
      color: '#fff',
      width: 36,
      height: 36,
      borderRadius: '50%',
      cursor: 'pointer',
      fontSize: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s'
    },
    body: {
      padding: compact ? '16px' : '24px'
    },
    section: {
      marginBottom: compact ? 12 : 16,
      border: `1px solid ${neutral.borderLight}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'all 0.2s'
    },
    sectionHeader: {
      padding: compact ? '12px 16px' : '16px 20px',
      background: neutral.bgMuted,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      transition: 'background 0.2s'
    },
    sectionHeaderActive: {
      background: statusColors.host.bg
    },
    sectionTitle: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontWeight: 700,
      fontSize: compact ? 14 : 16,
      color: brand.secondary
    },
    sectionIcon: {
      fontSize: compact ? 18 : 20
    },
    expandIcon: {
      fontSize: 16,
      color: neutral.textMuted,
      transition: 'transform 0.2s'
    },
    expandIconRotated: {
      transform: 'rotate(180deg)'
    },
    sectionContent: {
      padding: compact ? '12px 16px' : '16px 20px',
      borderTop: `1px solid ${neutral.borderLight}`,
      background: '#fff'
    },
    description: {
      fontSize: compact ? 13 : 14,
      color: neutral.textSecondary,
      lineHeight: 1.6,
      marginBottom: 12
    },
    highlight: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: statusColors.host.bg,
      padding: '6px 12px',
      borderRadius: 8,
      fontWeight: 600,
      fontSize: compact ? 13 : 14,
      color: brand.secondary,
      marginRight: 8,
      marginBottom: 8
    },
    example: {
      background: neutral.bgMuted,
      padding: compact ? '10px 14px' : '12px 16px',
      borderRadius: 8,
      fontSize: compact ? 12 : 13,
      color: neutral.textSecondary,
      marginTop: 10,
      borderLeft: `3px solid ${interactive.primary}`
    },
    conditionList: {
      margin: '12px 0 0 0',
      padding: '0 0 0 20px',
      listStyle: 'none'
    },
    conditionItem: {
      position: 'relative',
      paddingLeft: 20,
      marginBottom: 10,
      fontSize: compact ? 13 : 14,
      color: neutral.textPrimary,
      lineHeight: 1.5
    },
    conditionBullet: {
      position: 'absolute',
      left: 0,
      top: 2,
      width: 14,
      height: 14,
      borderRadius: '50%',
      background: statusColors.absent.bg,
      border: `2px solid ${statusColors.absent.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    warningBox: {
      background: statusColors.late.bg,
      border: `1px solid ${statusColors.late.border}`,
      borderRadius: 10,
      padding: compact ? '12px 14px' : '14px 18px',
      marginTop: 16,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12
    },
    warningIcon: {
      fontSize: compact ? 18 : 20,
      color: statusColors.late.text,
      marginTop: 2
    },
    warningText: {
      fontSize: compact ? 12 : 13,
      color: statusColors.late.text,
      fontWeight: 500,
      lineHeight: 1.5
    },
    footer: {
      padding: compact ? '12px 16px' : '16px 24px',
      background: neutral.bgMuted,
      borderTop: `1px solid ${neutral.borderLight}`,
      fontSize: 12,
      color: neutral.textMuted,
      textAlign: 'center'
    }
  }

  const sections = [
    {
      id: 'tardiness',
      icon: 'bi-clock-fill',
      title: policy.tardiness.title,
      color: statusColors.late.border,
      content: (
        <>
          <p style={styles.description}>{policy.tardiness.description}</p>
          <div>
            <span style={styles.highlight}>
              <i className='bi bi-stopwatch'></i>
              {TARDINESS_THRESHOLD_PERCENT * 100}% Threshold
            </span>
            <span style={styles.highlight}>
              <i className='bi bi-arrow-repeat'></i>
              {TARDINESS_TO_ABSENCE_RATIO} Tardy = 1 Absent
            </span>
          </div>
          <div style={styles.example}>
            <strong>Example:</strong> {policy.tardiness.example}
          </div>
        </>
      )
    },
    {
      id: 'instructor',
      icon: 'bi-person-workspace',
      title: policy.instructorWait.title,
      color: interactive.primary,
      content: (
        <>
          <p style={styles.description}>{policy.instructorWait.description}</p>
          <span style={styles.highlight}>
            <i className='bi bi-hourglass-split'></i>
            Wait 1/3 of class time
          </span>
          <div style={styles.example}>
            <strong>Example:</strong> {policy.instructorWait.example}
          </div>
        </>
      )
    },
    {
      id: 'df',
      icon: 'bi-exclamation-triangle-fill',
      title: policy.dfEligibility.title,
      color: statusColors.absent.border,
      content: (
        <>
          <p style={styles.description}>{policy.dfEligibility.description}</p>
          <ul style={styles.conditionList}>
            {policy.dfEligibility.conditions.map((condition, idx) => (
              <li key={idx} style={styles.conditionItem}>
                <span style={styles.conditionBullet}></span>
                {condition}
              </li>
            ))}
          </ul>
          <div style={styles.example}>
            <strong>Example:</strong> {policy.dfEligibility.example}
          </div>
          <div style={styles.warningBox}>
            <i
              className='bi bi-info-circle-fill'
              style={styles.warningIcon}
            ></i>
            <span style={styles.warningText}>
              Students meeting these criteria will be automatically flagged for
              D/F grade by the instructor. Absences during the add/drop period
              are excluded from this count.
            </span>
          </div>
        </>
      )
    },
    {
      id: 'adddrop',
      icon: 'bi-calendar-check',
      title: policy.addDropPeriod.title,
      color: statusColors.present.border,
      content: (
        <>
          <p style={styles.description}>{policy.addDropPeriod.description}</p>
          <span
            style={{
              ...styles.highlight,
              background: statusColors.present.bg,
              color: statusColors.present.text
            }}
          >
            <i className='bi bi-shield-check'></i>
            Absences NOT counted during add/drop
          </span>
        </>
      )
    }
  ]

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <i className='bi bi-journal-text' style={styles.headerIcon}></i>
          <div>
            <h3 style={styles.title}>Attendance Policy</h3>
            {!compact && (
              <p style={styles.subtitle}>
                Based on BOR Resolution No. 31, s. 2018
              </p>
            )}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={styles.closeBtn}
            onMouseOver={e =>
              (e.target.style.background = 'rgba(255,255,255,0.25)')
            }
            onMouseOut={e =>
              (e.target.style.background = 'rgba(255,255,255,0.15)')
            }
          >
            <i className='bi bi-x-lg'></i>
          </button>
        )}
      </div>

      {/* Body */}
      <div style={styles.body}>
        {sections.map(section => (
          <div key={section.id} style={styles.section}>
            <div
              style={{
                ...styles.sectionHeader,
                ...(expandedSection === section.id
                  ? styles.sectionHeaderActive
                  : {})
              }}
              onClick={() => toggleSection(section.id)}
            >
              <div style={styles.sectionTitle}>
                <i
                  className={section.icon}
                  style={{ ...styles.sectionIcon, color: section.color }}
                ></i>
                {section.title}
              </div>
              <i
                className='bi bi-chevron-down'
                style={{
                  ...styles.expandIcon,
                  ...(expandedSection === section.id
                    ? styles.expandIconRotated
                    : {})
                }}
              ></i>
            </div>
            {expandedSection === section.id && (
              <div style={styles.sectionContent}>{section.content}</div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      {!compact && (
        <div style={styles.footer}>
          <i className='bi bi-info-circle' style={{ marginRight: 6 }}></i>
          For questions about attendance policy, please contact your instructor
          or the registrar's office.
        </div>
      )}
    </div>
  )
}

/**
 * DFWarningBadge - Shows D/F eligibility status
 */
export const DFWarningBadge = ({
  status,
  size = 'medium',
  showTooltip = true
}) => {
  const [isHovered, setIsHovered] = useState(false)

  const statusConfig = {
    df_eligible: {
      label: 'D/F Eligible',
      bg: statusColors.absent.bg,
      border: statusColors.absent.border,
      text: statusColors.absent.text,
      icon: 'bi-exclamation-triangle-fill'
    },
    at_risk: {
      label: 'At Risk',
      bg: statusColors.late.bg,
      border: statusColors.late.border,
      text: statusColors.late.text,
      icon: 'bi-exclamation-circle-fill'
    },
    safe: {
      label: 'Good Standing',
      bg: statusColors.present.bg,
      border: statusColors.present.border,
      text: statusColors.present.text,
      icon: 'bi-check-circle-fill'
    }
  }

  const config = statusConfig[status] || statusConfig.safe
  const sizeConfig = {
    small: { padding: '4px 8px', fontSize: 11, iconSize: 12 },
    medium: { padding: '6px 12px', fontSize: 13, iconSize: 14 },
    large: { padding: '8px 16px', fontSize: 15, iconSize: 16 }
  }
  const sizing = sizeConfig[size] || sizeConfig.medium

  const styles = {
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: sizing.padding,
      background: config.bg,
      border: `1px solid ${config.border}`,
      borderRadius: 20,
      fontSize: sizing.fontSize,
      fontWeight: 600,
      color: config.text,
      cursor: showTooltip ? 'help' : 'default',
      position: 'relative'
    },
    icon: {
      fontSize: sizing.iconSize
    },
    tooltip: {
      position: 'absolute',
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      background: brand.secondary,
      color: '#fff',
      padding: '8px 12px',
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 500,
      whiteSpace: 'nowrap',
      marginBottom: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      opacity: isHovered ? 1 : 0,
      visibility: isHovered ? 'visible' : 'hidden',
      transition: 'all 0.2s',
      zIndex: 100
    }
  }

  const tooltipText = {
    df_eligible: 'Student meets criteria for automatic D/F grade',
    at_risk: 'Student is approaching D/F eligibility threshold',
    safe: 'Student attendance is within acceptable limits'
  }

  return (
    <span
      style={styles.badge}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <i className={config.icon} style={styles.icon}></i>
      {config.label}
      {showTooltip && (
        <span style={styles.tooltip}>
          {tooltipText[status] || tooltipText.safe}
        </span>
      )}
    </span>
  )
}

/**
 * AttendanceSummaryCard - Displays student attendance summary
 */
export const AttendanceSummaryCard = ({
  data,
  showDFStatus = true,
  compact = false
}) => {
  const {
    attendanceRate = 0,
    present = 0,
    tardy = 0,
    absent = 0,
    totalSessions = 0,
    dfStatus = 'safe'
  } = data

  const styles = {
    card: {
      background: neutral.bgSurface,
      borderRadius: 12,
      padding: compact ? 16 : 20,
      border: `1px solid ${neutral.borderLight}`,
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: compact ? 12 : 16
    },
    title: {
      fontSize: compact ? 14 : 16,
      fontWeight: 700,
      color: brand.secondary,
      margin: 0
    },
    rate: {
      fontSize: compact ? 24 : 32,
      fontWeight: 800,
      color:
        attendanceRate >= 80
          ? statusColors.present.border
          : attendanceRate >= 60
          ? statusColors.late.border
          : statusColors.absent.border,
      lineHeight: 1
    },
    stats: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: compact ? 8 : 12
    },
    stat: {
      textAlign: 'center',
      padding: compact ? '8px 4px' : '12px 8px',
      borderRadius: 8
    },
    statValue: {
      fontSize: compact ? 18 : 22,
      fontWeight: 700,
      lineHeight: 1.2
    },
    statLabel: {
      fontSize: compact ? 10 : 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginTop: 4
    },
    footer: {
      marginTop: compact ? 12 : 16,
      paddingTop: compact ? 12 : 16,
      borderTop: `1px solid ${neutral.borderLight}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    },
    sessions: {
      fontSize: compact ? 12 : 13,
      color: neutral.textMuted
    }
  }

  const statItems = [
    {
      value: present,
      label: 'Present',
      bg: statusColors.present.bg,
      color: statusColors.present.text
    },
    {
      value: tardy,
      label: 'Tardy',
      bg: statusColors.late.bg,
      color: statusColors.late.text
    },
    {
      value: absent,
      label: 'Absent',
      bg: statusColors.absent.bg,
      color: statusColors.absent.text
    }
  ]

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h4 style={styles.title}>Attendance Summary</h4>
        <span style={styles.rate}>{attendanceRate}%</span>
      </div>

      <div style={styles.stats}>
        {statItems.map((stat, idx) => (
          <div key={idx} style={{ ...styles.stat, background: stat.bg }}>
            <div style={{ ...styles.statValue, color: stat.color }}>
              {stat.value}
            </div>
            <div style={{ ...styles.statLabel, color: stat.color }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.footer}>
        <span style={styles.sessions}>
          <i className='bi bi-calendar3' style={{ marginRight: 6 }}></i>
          {present + tardy + absent} / {totalSessions} sessions
        </span>
        {showDFStatus && <DFWarningBadge status={dfStatus} size='small' />}
      </div>
    </div>
  )
}

export default PolicyInfoPanel
