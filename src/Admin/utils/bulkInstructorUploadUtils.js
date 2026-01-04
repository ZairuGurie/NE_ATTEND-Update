import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { showError } from './toastUtils'

// Strong password requirements should stay in sync with CreateAccountForm and backend /auth/register
export const generateInstructorPassword = (firstName, userId) => {
  const safeFirst = String(firstName || '').trim() || 'Instructor'
  const safeUserId = String(userId || '').trim() || '0000000000'
  const normalizedFirst =
    safeFirst.charAt(0).toUpperCase() + safeFirst.slice(1).toLowerCase()
  const password = `${normalizedFirst}@${safeUserId}`
  return password
}

// Canonical keys for required fields - header variations are normalized to these
const REQUIRED_FIELDS = [
  'firstname',
  'lastname',
  'emailaddress',
  'userid',
  'phonenumber',
  'schoolyear',
  'semester',
  'department',
  'course',
  'subjectname',
  'subjectcode',
  'section',
  'weeklydays',
  'starttime',
  'endtime'
]

// Normalize a header/field name so that variations like
// "User ID", "user_id", "USERID" all map to "userid"
const normalizeKey = header =>
  String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')

// Get field value from row object trying multiple variations
// This handles cases like "Weekday" vs "WeekDays" vs "weeklydays"
const getFieldValue = (rowObj, possibleKeys) => {
  if (!Array.isArray(possibleKeys)) {
    possibleKeys = [possibleKeys]
  }

  // Try each possible key variation
  for (const key of possibleKeys) {
    const normalizedKey = normalizeKey(key)
    if (
      rowObj[normalizedKey] !== undefined &&
      rowObj[normalizedKey] !== null &&
      rowObj[normalizedKey] !== ''
    ) {
      return rowObj[normalizedKey]
    }
  }

  return ''
}

const buildHeaderMap = headers => {
  const map = {}
  headers.forEach((h, idx) => {
    const key = normalizeKey(h)
    if (!key) return
    map[key] = idx
  })
  return map
}

// Normalize semester to match Subject model enum values
const normalizeSemester = semester => {
  if (!semester) return undefined
  const s = String(semester).trim().toLowerCase()
  if (s.includes('1st') || s === '1' || s === 'first') return '1st Semester'
  if (s.includes('2nd') || s === '2' || s === 'second') return '2nd Semester'
  if (s.includes('summer') || s === '3') return 'Summer'
  // Return trimmed original if no match (will fail validation if invalid)
  return String(semester).trim()
}

// Parse weekdays from string (comma-separated, slash-separated, or space-separated)
const parseWeekdays = weekdaysStr => {
  if (!weekdaysStr) return []
  const str = String(weekdaysStr).trim()
  if (!str) return []

  // Common weekday names
  const weekdayMap = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday',
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday'
  }

  // Split by comma, semicolon, slash, or space
  // Also handle cases like "Monday/" or "Monday, Tuesday"
  const parts = str
    .split(/[,;\s\/]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)

  const normalized = parts
    .map(part => {
      // Remove trailing slashes or special characters
      const cleanPart = part.replace(/[\/\s]+$/, '').toLowerCase()
      return weekdayMap[cleanPart]
    })
    .filter(Boolean)

  // Remove duplicates and maintain order
  return Array.from(new Set(normalized))
}

// Normalize time format to HH:MM (24-hour format) - same approach as CreateAccountForm
// Handles formats like: "7:00 AM", "7:00 PM", "07:00", "7:00", "19:00", etc.
// Also handles Excel time decimals as fallback (though they should be converted in parseXlsx)
// Standard format used in system: "HH:MM" (24-hour format, e.g., "07:00", "19:00")
const normalizeTime = time => {
  if (!time) return null

  // Handle Excel time decimal as fallback (in case it wasn't converted during parsing)
  if (typeof time === 'number') {
    const numValue = Number(time)
    if (!Number.isNaN(numValue) && numValue >= 0 && numValue < 1) {
      const totalSeconds = Math.round(numValue * 24 * 60 * 60)
      const hours = Math.floor(totalSeconds / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
        2,
        '0'
      )}`
    }
  }

  const timeStr = String(time).trim()
  if (!timeStr) return null

  // Remove extra spaces and convert to uppercase for AM/PM detection
  const cleaned = timeStr.replace(/\s+/g, ' ').trim().toUpperCase()

  // Check if it's in 12-hour format with AM/PM (e.g., "7:00 AM", "7:00 PM", "7:00:00 AM")
  const time12Regex = /^([0-9]|1[0-2]):([0-5][0-9])(:([0-5][0-9]))?\s*(AM|PM)$/
  const match12 = cleaned.match(time12Regex)
  if (match12) {
    let hours = Number(match12[1])
    const minutes = match12[2]
    const period = match12[5] // AM or PM

    // Convert to 24-hour format (same logic as standard time format)
    if (period === 'PM' && hours !== 12) {
      hours += 12
    } else if (period === 'AM' && hours === 12) {
      hours = 0
    }

    return `${String(hours).padStart(2, '0')}:${minutes}`
  }

  // Check if it's already in 24-hour format (HH:MM or HH:MM:SS)
  // This is the standard format used in the system
  const time24Regex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])(:([0-5][0-9]))?$/
  if (time24Regex.test(cleaned)) {
    const [hours, minutes] = cleaned.split(':')
    // Ensure hours are zero-padded (e.g., "7:00" -> "07:00")
    return `${hours.padStart(2, '0')}:${minutes}`
  }

  // If no format matches, return null
  return null
}

// Validate time format (accepts various formats, normalizes internally)
const isValidTime = time => {
  if (!time) return false
  const normalized = normalizeTime(time)
  return normalized !== null
}

// Convert time to minutes for comparison (handles various formats)
const timeToMinutes = time => {
  if (!time) return NaN
  const normalized = normalizeTime(time)
  if (!normalized) return NaN

  const [hourStr, minuteStr = '00'] = normalized.split(':')
  const hours = Number(hourStr)
  const minutes = Number(minuteStr)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return NaN
  }
  return hours * 60 + minutes
}

const validateRow = (rowObj, rowIndex) => {
  const errors = []

  // Field mapping with multiple possible variations
  const fieldVariations = {
    firstname: ['firstname', 'first name', 'firstname'],
    lastname: ['lastname', 'last name', 'lastname'],
    emailaddress: ['emailaddress', 'email address', 'email'],
    userid: ['userid', 'user id', 'userid'],
    phonenumber: ['phonenumber', 'phone number', 'phone'],
    schoolyear: ['schoolyear', 'school year'],
    semester: ['semester'],
    department: ['department', 'dept'],
    course: ['course'],
    subjectname: ['subjectname', 'subject name'],
    subjectcode: ['subjectcode', 'subject code'],
    section: ['section'],
    weeklydays: [
      'weeklydays',
      'weekdays',
      'weekday',
      'weekly days',
      'weeklyday'
    ],
    starttime: ['starttime', 'start time', 'starttime'],
    endtime: ['endtime', 'end time', 'endtime']
  }

  // Check required fields with variations
  Object.keys(fieldVariations).forEach(fieldKey => {
    if (REQUIRED_FIELDS.includes(fieldKey)) {
      const value = getFieldValue(rowObj, fieldVariations[fieldKey])
      if (!value || String(value).trim() === '') {
        errors.push(`Missing required field: ${fieldKey}`)
      }
    }
  })

  const email = String(
    getFieldValue(rowObj, fieldVariations.emailaddress) || ''
  ).trim()
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format')
    }
  }

  const phoneDigits = String(
    getFieldValue(rowObj, fieldVariations.phonenumber) || ''
  )
    .replace(/\D/g, '')
    .trim()
  // Philippine mobile numbers can be 10-12 digits (with/without country code)
  if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 12)) {
    errors.push('Phone number must be 10-12 digits')
  }

  // Validate weekdays
  const weekdaysStr = String(
    getFieldValue(rowObj, fieldVariations.weeklydays) || ''
  ).trim()
  const weekdays = parseWeekdays(weekdaysStr)
  if (weekdays.length === 0) {
    errors.push('At least one weekday must be specified')
  }

  // Validate start and end times (accepts various formats)
  const startTimeRaw = String(
    getFieldValue(rowObj, fieldVariations.starttime) || ''
  ).trim()
  const endTimeRaw = String(
    getFieldValue(rowObj, fieldVariations.endtime) || ''
  ).trim()

  if (!startTimeRaw) {
    errors.push('Start time is required')
  } else if (!isValidTime(startTimeRaw)) {
    errors.push(
      `Invalid start time format: "${startTimeRaw}". Use formats like "7:00 AM", "7:00 PM", "07:00", or "19:00"`
    )
  }

  if (!endTimeRaw) {
    errors.push('End time is required')
  } else if (!isValidTime(endTimeRaw)) {
    errors.push(
      `Invalid end time format: "${endTimeRaw}". Use formats like "7:00 AM", "7:00 PM", "07:00", or "19:00"`
    )
  }

  if (isValidTime(startTimeRaw) && isValidTime(endTimeRaw)) {
    const startMinutes = timeToMinutes(startTimeRaw)
    const endMinutes = timeToMinutes(endTimeRaw)
    if (endMinutes <= startMinutes) {
      errors.push('End time must be later than start time')
    }
  }

  return errors
}

const normalizeInstructorFromRow = rowObj => {
  // Field mapping with multiple possible variations
  const fieldVariations = {
    firstname: ['firstname', 'first name', 'firstname'],
    lastname: ['lastname', 'last name', 'lastname'],
    emailaddress: ['emailaddress', 'email address', 'email'],
    userid: ['userid', 'user id', 'userid'],
    phonenumber: ['phonenumber', 'phone number', 'phone'],
    schoolyear: ['schoolyear', 'school year'],
    semester: ['semester'],
    department: ['department', 'dept'],
    course: ['course'],
    subjectname: ['subjectname', 'subject name'],
    subjectcode: ['subjectcode', 'subject code'],
    section: ['section'],
    weeklydays: [
      'weeklydays',
      'weekdays',
      'weekday',
      'weekly days',
      'weeklyday'
    ],
    starttime: ['starttime', 'start time', 'starttime'],
    endtime: ['endtime', 'end time', 'endtime'],
    meetinglink: ['meetinglink', 'meeting link', 'meetinglink'],
    credits: ['credits', 'credit'],
    description: ['description', 'desc'],
    experience: ['experience', 'exp'],
    specialization: ['specialization', 'specialisation', 'specialty'],
    password: ['password', 'pass', 'pwd']
  }

  const firstName = String(
    getFieldValue(rowObj, fieldVariations.firstname) || ''
  ).trim()
  const lastName = String(
    getFieldValue(rowObj, fieldVariations.lastname) || ''
  ).trim()
  const email = String(
    getFieldValue(rowObj, fieldVariations.emailaddress) || ''
  ).trim()
  const userId = String(
    getFieldValue(rowObj, fieldVariations.userid) || ''
  ).trim()
  const phoneDigits = String(
    getFieldValue(rowObj, fieldVariations.phonenumber) || ''
  )
    .replace(/\D/g, '')
    .trim()

  const schoolYear = String(
    getFieldValue(rowObj, fieldVariations.schoolyear) || ''
  ).trim()
  const semester = String(
    getFieldValue(rowObj, fieldVariations.semester) || ''
  ).trim()
  const department = String(
    getFieldValue(rowObj, fieldVariations.department) || ''
  ).trim()
  const course = String(
    getFieldValue(rowObj, fieldVariations.course) || ''
  ).trim()

  // Subject data
  const subjectName = String(
    getFieldValue(rowObj, fieldVariations.subjectname) || ''
  ).trim()
  const subjectCode = String(
    getFieldValue(rowObj, fieldVariations.subjectcode) || ''
  ).trim()
  const section = String(
    getFieldValue(rowObj, fieldVariations.section) || ''
  ).trim()
  const weekdaysStr = String(
    getFieldValue(rowObj, fieldVariations.weeklydays) || ''
  ).trim()
  const weekdays = parseWeekdays(weekdaysStr)

  // Normalize times to HH:MM format (24-hour) - handles "7:00 AM", "7:00 PM", "07:00", etc.
  const startTimeRaw = String(
    getFieldValue(rowObj, fieldVariations.starttime) || ''
  ).trim()
  const endTimeRaw = String(
    getFieldValue(rowObj, fieldVariations.endtime) || ''
  ).trim()
  const startTime = normalizeTime(startTimeRaw) || startTimeRaw
  const endTime = normalizeTime(endTimeRaw) || endTimeRaw

  // Optional fields
  const meetingLink = String(
    getFieldValue(rowObj, fieldVariations.meetinglink) || ''
  ).trim()
  const creditsValue = getFieldValue(rowObj, fieldVariations.credits)
  const credits = creditsValue ? Number(creditsValue) : undefined
  const description = String(
    getFieldValue(rowObj, fieldVariations.description) || ''
  ).trim()
  const experience = String(
    getFieldValue(rowObj, fieldVariations.experience) || ''
  ).trim()
  const specialization = String(
    getFieldValue(rowObj, fieldVariations.specialization) || ''
  ).trim()

  // Use password from Excel if provided, otherwise auto-generate
  const excelPassword = String(
    getFieldValue(rowObj, fieldVariations.password) || ''
  ).trim()
  const password =
    excelPassword || generateInstructorPassword(firstName, userId)

  // Normalize semester to match enum values
  const normalizedSemester = normalizeSemester(semester)

  return {
    // Instructor data
    firstName,
    lastName,
    email,
    userId,
    phone: phoneDigits,
    password,
    schoolYear,
    semester: normalizedSemester,
    department,
    course,
    experience: experience || undefined,
    specialization: specialization || undefined,
    // Subject data (one per row)
    // Structure must match CreateAccountForm: sections (array), schedule (object with weekdays, startTime, endTime)
    subject: {
      subjectName,
      subjectCode,
      sections: section ? [String(section).trim()] : [], // Convert to array like CreateAccountForm
      department: department || undefined,
      schoolYear: schoolYear || undefined,
      semester: normalizedSemester || undefined,
      room: undefined, // Optional, not in CSV
      meetingLink: meetingLink || undefined,
      description: description || undefined,
      credits: Number.isNaN(credits) ? undefined : credits,
      // Schedule structure must match CreateAccountForm format
      schedule:
        weekdays &&
        Array.isArray(weekdays) &&
        weekdays.length > 0 &&
        startTime &&
        endTime
          ? {
              weekdays: weekdays,
              startTime: startTime,
              endTime: endTime
            }
          : undefined
    }
  }
}

const parseCsv = file =>
  new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => {
        if (results.errors && results.errors.length) {
          return reject(
            new Error(
              `CSV parse error on row ${results.errors[0].row}: ${results.errors[0].message}`
            )
          )
        }
        resolve(results.data || [])
      },
      error: err => reject(err)
    })
  })

// Convert Excel time decimal (fraction of a day) to HH:MM format
const convertExcelTimeToHHMM = decimalValue => {
  if (typeof decimalValue !== 'number' || Number.isNaN(decimalValue)) {
    return null
  }

  // Excel stores time as decimal fraction of a day (0 = midnight, 0.5 = noon, 1 = next midnight)
  // Only convert if it's between 0 and 1 (valid time range)
  if (decimalValue >= 0 && decimalValue < 1) {
    const totalSeconds = Math.round(decimalValue * 24 * 60 * 60)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
      2,
      '0'
    )}`
  }

  return null
}

// Check if a column name is likely a time field
const isTimeField = columnName => {
  if (!columnName) return false
  const normalized = normalizeKey(columnName)
  return (
    normalized.includes('starttime') ||
    normalized.includes('endtime') ||
    normalized.includes('time')
  )
}

const parseXlsx = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[firstSheetName]
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })

        // Process each row to convert Excel time decimals to time strings
        // Excel stores times as decimal fractions of a day (0 = midnight, 0.5 = noon)
        const processedJson = json.map(row => {
          const processedRow = { ...row }

          // Check each field in the row
          Object.keys(processedRow).forEach(key => {
            const value = processedRow[key]

            // Check if this is a time field by column name
            if (isTimeField(key)) {
              // If value is a number between 0 and 1, it's likely an Excel time decimal
              if (typeof value === 'number' && value >= 0 && value < 1) {
                const convertedTime = convertExcelTimeToHHMM(value)
                if (convertedTime) {
                  processedRow[key] = convertedTime
                }
              }
              // If value is already a string but looks like a decimal, try converting
              else if (typeof value === 'string') {
                const numValue = Number(value)
                if (!Number.isNaN(numValue) && numValue >= 0 && numValue < 1) {
                  const convertedTime = convertExcelTimeToHHMM(numValue)
                  if (convertedTime) {
                    processedRow[key] = convertedTime
                  }
                }
              }
            }
            // Fallback: Check if any numeric value between 0-1 might be a time
            // (in case column name doesn't clearly indicate it's a time field)
            else if (
              typeof value === 'number' &&
              value >= 0 &&
              value < 1 &&
              value > 0
            ) {
              // Only convert if it's a reasonable time value (not too small, like 0.0001)
              // Valid Excel times are typically between 0.0 and 0.9999...
              const convertedTime = convertExcelTimeToHHMM(value)
              if (convertedTime) {
                // Double-check: if the converted time makes sense (hours < 24)
                const [hours] = convertedTime.split(':')
                if (Number(hours) < 24) {
                  processedRow[key] = convertedTime
                }
              }
            }
          })

          return processedRow
        })

        resolve(processedJson)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = err => reject(err)
    reader.readAsArrayBuffer(file)
  })

export const parseInstructorUploadFile = async file => {
  if (!file) {
    throw new Error('No file provided.')
  }

  const nameLower = file.name.toLowerCase()
  let rows = []

  try {
    if (nameLower.endsWith('.csv')) {
      rows = await parseCsv(file)
    } else if (nameLower.endsWith('.xlsx')) {
      rows = await parseXlsx(file)
    } else {
      throw new Error('Please upload a CSV or XLSX file.')
    }
  } catch (error) {
    console.error('File parse error:', error)
    // Show user-friendly error (not localhost error)
    const errorMessage =
      error.message ||
      'Failed to read file. Please check the format and try again.'
    if (
      errorMessage.includes('localhost') ||
      errorMessage.includes('127.0.0.1')
    ) {
      showError('Invalid file format. Please upload a CSV or XLSX file.')
    } else {
      showError(errorMessage)
    }
    throw error
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { validInstructors: [], rowErrors: [] }
  }

  const headerRow = Object.keys(rows[0] || {})
  const headerMap = buildHeaderMap(headerRow)

  // Field mapping with multiple possible variations for checking
  const fieldVariations = {
    firstname: ['firstname', 'first name', 'firstname'],
    lastname: ['lastname', 'last name', 'lastname'],
    emailaddress: ['emailaddress', 'email address', 'email'],
    userid: ['userid', 'user id', 'userid'],
    phonenumber: ['phonenumber', 'phone number', 'phone'],
    schoolyear: ['schoolyear', 'school year'],
    semester: ['semester'],
    department: ['department', 'dept'],
    course: ['course'],
    subjectname: ['subjectname', 'subject name'],
    subjectcode: ['subjectcode', 'subject code'],
    section: ['section'],
    weeklydays: [
      'weeklydays',
      'weekdays',
      'weekday',
      'weekly days',
      'weeklyday'
    ],
    starttime: ['starttime', 'start time', 'starttime'],
    endtime: ['endtime', 'end time', 'endtime']
  }

  // Check for required fields using variations
  const missingRequired = []
  REQUIRED_FIELDS.forEach(fieldKey => {
    const variations = fieldVariations[fieldKey] || [fieldKey]
    const found = variations.some(variation => {
      const normalized = normalizeKey(variation)
      return headerMap[normalized] !== undefined
    })
    if (!found) {
      missingRequired.push(fieldKey)
    }
  })

  if (missingRequired.length) {
    throw new Error(
      `Missing required columns: ${missingRequired.join(
        ', '
      )}. Please update your file and try again.`
    )
  }

  const rowErrors = []
  const rowData = []

  // First pass: validate and normalize each row
  rows.forEach((rawRow, index) => {
    const rowObj = {}
    Object.keys(rawRow).forEach(key => {
      const norm = normalizeKey(key)
      rowObj[norm] = rawRow[key]
    })

    const errors = validateRow(rowObj, index)
    if (errors.length) {
      rowErrors.push({ rowIndex: index, errors })
      return
    }

    const instructorData = normalizeInstructorFromRow(rowObj)
    rowData.push({ rowIndex: index, data: instructorData })
  })

  // Second pass: group rows by instructor (email or userId)
  const instructorMap = new Map()

  rowData.forEach(({ rowIndex, data }) => {
    // Use email as primary key, fallback to userId if email is missing
    const key = (data.email || data.userId || '').toLowerCase()

    if (!instructorMap.has(key)) {
      instructorMap.set(key, {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        userId: data.userId,
        phone: data.phone,
        password: data.password,
        schoolYear: data.schoolYear,
        semester: data.semester,
        department: data.department,
        course: data.course,
        experience: data.experience,
        specialization: data.specialization,
        subjects: []
      })
    }

    // Add subject to instructor
    instructorMap.get(key).subjects.push(data.subject)
  })

  const validInstructors = Array.from(instructorMap.values())

  return { validInstructors, rowErrors }
}
