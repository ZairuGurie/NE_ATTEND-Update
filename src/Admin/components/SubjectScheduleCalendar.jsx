import React from 'react'
import { brand, neutral, status as statusColors } from '../../utils/colors'
import {
  calculateTardinessThreshold,
  TARDINESS_TO_ABSENCE_RATIO
} from '../../utils/attendancePolicy'

const WEEKDAY_OPTIONS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
]

const cardStyles = {
  wrapper: {
    border: '2px solid ' + neutral.borderLight,
    borderRadius: 12,
    padding: 16,
    background: neutral.bgMuted,
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  },
  header: {
    fontSize: 14,
    textTransform: 'uppercase',
    fontWeight: 700,
    color: neutral.textSecondary,
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  helper: {
    fontSize: 12,
    color: neutral.textMuted
  },
  weekdayHeader: {
    fontSize: 13,
    fontWeight: 700,
    color: neutral.textPrimary,
    marginBottom: 8
  },
  weekdayGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8
  },
  weekdayChip: active => ({
    padding: '8px 14px',
    borderRadius: 999,
    border: active ? 'none' : `1px solid ${neutral.borderDefault}`,
    background: active ? brand.secondary : neutral.bgSurface,
    color: active ? neutral.textInverse : neutral.textPrimary,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 13,
    transition: 'all 0.2s'
  }),
  timeRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap'
  },
  timeField: {
    flex: 1,
    minWidth: 140,
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  label: {
    fontSize: 11,
    fontWeight: 700,
    color: neutral.textSecondary,
    letterSpacing: '0.4px',
    textTransform: 'uppercase'
  },
  timeInput: {
    padding: '10px 12px',
    borderRadius: 8,
    border: `2px solid ${neutral.borderLight}`,
    fontSize: 14,
    fontWeight: 600,
    color: brand.secondary
  },
  summary: {
    fontSize: 13,
    color: brand.secondary,
    fontWeight: 600
  },
  error: {
    color: statusColors.absent.text,
    fontSize: 12,
    fontWeight: 600
  },
  actionsRow: {
    marginTop: 16,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    flexWrap: 'wrap'
  },
  primaryButton: {
    padding: '10px 18px',
    borderRadius: 10,
    border: 'none',
    background: brand.secondary,
    color: neutral.textInverse,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    fontSize: 14,
    transition: 'all 0.2s'
  },
  secondaryButton: {
    padding: '10px 16px',
    borderRadius: 10,
    border: `2px solid ${neutral.borderDefault}`,
    background: neutral.bgSurface,
    color: neutral.textPrimary,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    fontSize: 14,
    transition: 'all 0.2s'
  }
}

const formatWeekdayPreview = (weekdays = []) => {
  if (!weekdays.length) return ''
  if (weekdays.length === 1) return weekdays[0]
  if (weekdays.length === 2) return `${weekdays[0]} & ${weekdays[1]}`
  return weekdays.join(', ')
}

const formatTimePreview = (startTime, endTime) => {
  if (!startTime || !endTime) return ''
  const formatPart = time => {
    const [hourStr, minuteStr = '00'] = time.split(':')
    let hour = Number(hourStr)
    const suffix = hour >= 12 ? 'PM' : 'AM'
    hour = hour % 12 || 12
    return `${hour}:${minuteStr.padStart(2, '0')} ${suffix}`
  }
  return `${formatPart(startTime)} - ${formatPart(endTime)}`
}

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

const SubjectScheduleCalendar = ({
  schedule = {},
  onChange,
  error,
  onDone,
  onAddAnother,
  isSubmitting
}) => {
  const weekdays = schedule.weekdays ?? []
  const startTime = schedule.startTime ?? ''
  const endTime = schedule.endTime ?? ''

  const durationMinutes = computeDurationMinutes(startTime, endTime)
  const durationLabel = formatDurationLabel(durationMinutes)
  const tardinessThreshold = durationMinutes
    ? calculateTardinessThreshold(durationMinutes)
    : null

  const toggleWeekday = day => {
    const alreadySelected = weekdays.includes(day)
    const nextWeekdays = alreadySelected
      ? weekdays.filter(item => item !== day)
      : [...weekdays, day]
    onChange({
      ...schedule,
      weekdays: nextWeekdays
    })
  }

  const handleTimeChange = (field, value) => {
    onChange({
      ...schedule,
      [field]: value
    })
  }

  const weekdaySummary = formatWeekdayPreview(weekdays)
  const timeSummary = formatTimePreview(startTime, endTime)

  return (
    <div style={cardStyles.wrapper}>
      <div style={cardStyles.header}>
        <i className='bi bi-calendar-week'></i>
        Weekly schedule
      </div>
      <span style={cardStyles.helper}>
        Pick the weekdays and daily time window for this subject.
      </span>
      <div>
        <div style={cardStyles.weekdayHeader}>Weekdays</div>
        <div style={cardStyles.weekdayGrid}>
          {WEEKDAY_OPTIONS.map(day => {
            const active = weekdays.includes(day)
            return (
              <button
                key={day}
                type='button'
                onClick={() => toggleWeekday(day)}
                style={cardStyles.weekdayChip(active)}
              >
                {day.slice(0, 3)}
              </button>
            )
          })}
        </div>
      </div>
      <div style={cardStyles.timeRow}>
        <div style={cardStyles.timeField}>
          <label style={cardStyles.label}>Start Time</label>
          <input
            type='time'
            value={startTime}
            onChange={e => handleTimeChange('startTime', e.target.value)}
            style={cardStyles.timeInput}
          />
        </div>
        <div style={cardStyles.timeField}>
          <label style={cardStyles.label}>End Time</label>
          <input
            type='time'
            value={endTime}
            onChange={e => handleTimeChange('endTime', e.target.value)}
            style={cardStyles.timeInput}
          />
        </div>
      </div>
      {weekdaySummary && timeSummary && (
        <div style={cardStyles.summary}>
          {`${weekdaySummary} • ${timeSummary}`}
          {durationLabel && ` • ${durationLabel}`}
        </div>
      )}
      {durationMinutes && tardinessThreshold && (
        <div style={cardStyles.helper}>
          {`Late after ${tardinessThreshold} min • ${TARDINESS_TO_ABSENCE_RATIO} tardy = 1 absence`}
        </div>
      )}
      {error && (
        <span style={cardStyles.error}>
          <i
            className='bi bi-exclamation-triangle'
            style={{ marginRight: 4 }}
          ></i>
          {error}
        </span>
      )}
      {(onAddAnother || onDone) && (
        <div style={cardStyles.actionsRow}>
          {onAddAnother && (
            <button
              type='button'
              style={cardStyles.secondaryButton}
              onClick={onAddAnother}
              disabled={isSubmitting}
            >
              <i className='bi bi-plus-lg' style={{ marginRight: 8 }}></i>
              Add Another
            </button>
          )}
          {onDone && (
            <button
              type='button'
              style={cardStyles.primaryButton}
              onClick={onDone}
              disabled={isSubmitting}
            >
              <i className='bi bi-check2-circle' style={{ marginRight: 8 }}></i>
              Done
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default SubjectScheduleCalendar
