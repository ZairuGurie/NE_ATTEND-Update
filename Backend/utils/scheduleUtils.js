const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeWeekdays = (weekdays = []) => {
  const mapped = weekdays
    .map(day => {
      if (!day) return null;
      const index = WEEKDAY_ORDER.findIndex(option => option.toLowerCase() === day.toLowerCase());
      return index >= 0 ? WEEKDAY_ORDER[index] : null;
    })
    .filter(Boolean);
  return Array.from(new Set(mapped)).sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
};

const formatWeekdayLabel = (weekdays = []) => {
  const ordered = normalizeWeekdays(weekdays);
  if (!ordered.length) return '';
  if (ordered.length === 1) return ordered[0];
  if (ordered.length === 2) return `${ordered[0]} & ${ordered[1]}`;
  return ordered.join(', ');
};

const parseTimeToMinutes = (time) => {
  if (!time) return NaN;
  const [hourStr, minuteStr = '00'] = time.split(':');
  const hours = Number(hourStr);
  const minutes = Number(minuteStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return NaN;
  }
  return hours * 60 + minutes;
};

const formatTimeLabel = (startTime, endTime) => {
  if (!startTime || !endTime) return '';
  const formatPart = (time) => {
    const [hourStr, minuteStr = '00'] = time.split(':');
    let hour = Number(hourStr);
    if (Number.isNaN(hour)) return '';
    const suffix = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${minuteStr.padStart(2, '0')} ${suffix}`;
  };
  return `${formatPart(startTime)} - ${formatPart(endTime)}`;
};

const normalizeWeeklySchedule = (schedulePayload) => {
  if (!schedulePayload || typeof schedulePayload !== 'object' || Object.keys(schedulePayload).length === 0) {
    return { value: null };
  }

  const { startDate, endDate, weekdays, startTime, endTime } = schedulePayload;

  const hasStartDate = Boolean(startDate);
  const hasEndDate = Boolean(endDate);
  if (hasStartDate !== hasEndDate) {
    return { error: 'Provide both start and end dates or omit them entirely' };
  }

  let normalizedStart = null;
  let normalizedEnd = null;
  if (hasStartDate && hasEndDate) {
    normalizedStart = toDate(startDate);
    normalizedEnd = toDate(endDate);
    if (!normalizedStart || !normalizedEnd) {
      return { error: 'Schedule dates are invalid' };
    }
    if (normalizedEnd < normalizedStart) {
      return { error: 'Schedule end date must be after the start date' };
    }
  }

  const normalizedWeekdays = normalizeWeekdays(weekdays);
  if (!normalizedWeekdays.length) {
    return { error: 'At least one weekday must be selected' };
  }

  if (!startTime || !endTime) {
    return { error: 'Schedule requires start and end times' };
  }

  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) {
    return { error: 'Schedule times are invalid' };
  }

  if (endMinutes <= startMinutes) {
    return { error: 'Schedule end time must be later than the start time' };
  }

  const scheduleValue = {
    weekdays: normalizedWeekdays,
    startTime,
    endTime
  };
  if (normalizedStart) {
    scheduleValue.startDate = normalizedStart;
  }
  if (normalizedEnd) {
    scheduleValue.endDate = normalizedEnd;
  }

  return {
    value: scheduleValue,
    dayLabel: formatWeekdayLabel(normalizedWeekdays),
    timeLabel: formatTimeLabel(startTime, endTime)
  };
};

module.exports = {
  WEEKDAY_ORDER,
  normalizeWeeklySchedule,
  formatWeekdayLabel,
  formatTimeLabel
};

