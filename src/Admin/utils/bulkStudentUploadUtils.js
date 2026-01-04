import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { showError } from './toastUtils'

// Strong password requirements should stay in sync with CreateAccountForm and backend /auth/register
export const generateStudentPassword = (firstName, userId) => {
  const safeFirst = String(firstName || '').trim() || 'Student'
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
  'section',
  'yearlevel',
  'dateofbirth'
]

// Normalize a header/field name so that variations like
// "User ID", "user_id", "USERID" all map to "userid"
const normalizeKey = header =>
  String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')

// Legacy helper (kept for clarity where we work with display names)
const normalizeHeader = header => normalizeKey(header)

const buildHeaderMap = headers => {
  const map = {}
  headers.forEach((h, idx) => {
    const key = normalizeKey(h)
    if (!key) return
    map[key] = idx
  })
  return map
}

const validateRow = (rowObj, rowIndex) => {
  const errors = []

  REQUIRED_FIELDS.forEach(fieldKey => {
    if (!rowObj[fieldKey] || String(rowObj[fieldKey]).trim() === '') {
      errors.push(`Missing required field: ${fieldKey}`)
    }
  })

  const email = String(rowObj.emailaddress || '').trim()
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format')
    }
  }

  const phoneDigits = String(rowObj.phonenumber || '')
    .replace(/\D/g, '')
    .trim()
  if (phoneDigits && phoneDigits.length !== 11) {
    errors.push('Phone number must be exactly 11 digits')
  }

  const dob = rowObj.dateofbirth
  if (dob) {
    const parsed = new Date(dob)
    if (Number.isNaN(parsed.getTime())) {
      errors.push('Invalid date of birth format')
    }
  }

  return errors
}

const normalizeStudentFromRow = rowObj => {
  const firstName = String(rowObj.firstname || '').trim()
  const lastName = String(rowObj.lastname || '').trim()
  const email = String(rowObj.emailaddress || '').trim()
  const userId = String(rowObj.userid || '').trim()
  const phoneDigits = String(rowObj.phonenumber || '')
    .replace(/\D/g, '')
    .trim()

  const schoolYear = String(rowObj.schoolyear || '').trim()
  const semester = String(rowObj.semester || '').trim()
  const department = String(rowObj.department || '').trim()
  const course = String(rowObj.course || '').trim()
  const section = String(rowObj.section || '').trim()
  const yearLevel = String(rowObj.yearlevel || '').trim()
  const dateOfBirth = rowObj.dateofbirth

  const guardianName = String(rowObj.guardianname || '').trim()
  const guardianPhone = String(rowObj.guardianphone || '').trim()
  const guardianRelation = String(rowObj.guardianrelation || '').trim()
  const emergencyContact = String(rowObj.emergencycontactname || '').trim()
  const emergencyPhone = String(rowObj.emergencycontactphone || '').trim()
  const address = String(rowObj.address || '').trim()

  const password = generateStudentPassword(firstName, userId)

  return {
    firstName,
    lastName,
    email,
    role: 'student',
    studentId: userId,
    phone: phoneDigits,
    schoolYear,
    semester,
    department,
    course,
    section,
    yearLevel,
    dateOfBirth,
    address,
    guardianName: guardianName || undefined,
    guardianPhone: guardianPhone || undefined,
    guardianRelation: guardianRelation || undefined,
    emergencyContact: emergencyContact || undefined,
    emergencyPhone: emergencyPhone || undefined,
    password
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

const parseXlsx = file =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[firstSheetName]
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })
        resolve(json)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = err => reject(err)
    reader.readAsArrayBuffer(file)
  })

export const parseStudentUploadFile = async file => {
  if (!file) {
    throw new Error('No file provided.')
  }

  const nameLower = file.name.toLowerCase()
  let rows = []

  try {
    if (nameLower.endsWith('.csv')) {
      rows = await parseCsv(file)
    } else {
      rows = await parseXlsx(file)
    }
  } catch (error) {
    console.error('File parse error:', error)
    showError(
      error.message || 'Failed to read file. Please check the format and try again.'
    )
    throw error
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { validStudents: [], rowErrors: [] }
  }

  const headerRow = Object.keys(rows[0] || {})
  const headerMap = buildHeaderMap(headerRow)

  const missingRequired = REQUIRED_FIELDS.filter(
    f => headerMap[f] === undefined
  )
  if (missingRequired.length) {
    throw new Error(
      `Missing required columns: ${missingRequired.join(
        ', '
      )}. Please update your file and try again.`
    )
  }

  const validStudents = []
  const rowErrors = []

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

    const student = normalizeStudentFromRow(rowObj)
    validStudents.push(student)
  })

  return { validStudents, rowErrors }
}


