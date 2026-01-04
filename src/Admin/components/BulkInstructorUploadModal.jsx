import React, { useState } from 'react'
import { brand, neutral, status as statusColors } from '../../utils/colors'
import { showError, showSuccess } from '../utils/toastUtils'
import { apiPost } from '../../utils/api'
import { parseInstructorUploadFile } from '../utils/bulkInstructorUploadUtils'

const BulkInstructorUploadModal = ({ isOpen, onClose, onCompleted }) => {
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [summary, setSummary] = useState(null)

  if (!isOpen) return null

  const handleFileChange = e => {
    const selected = e.target.files?.[0]
    setSummary(null)
    if (!selected) {
      setFile(null)
      setFileError('')
      return
    }

    const allowedExtensions = ['.csv', '.xlsx']
    const nameLower = selected.name.toLowerCase()
    const hasValidExt = allowedExtensions.some(ext => nameLower.endsWith(ext))

    if (!hasValidExt) {
      setFile(null)
      setFileError('Please upload a CSV or XLSX file.')
      return
    }

    setFile(selected)
    setFileError('')
  }

  const handleUpload = async () => {
    if (!file) {
      setFileError('Please select a CSV or XLSX file to upload.')
      return
    }

    setIsUploading(true)
    setFileError('')
    setSummary(null)

    try {
      const { validInstructors, rowErrors } = await parseInstructorUploadFile(
        file
      )

      if (!validInstructors.length) {
        showError(
          'No valid rows found in file. Please fix the highlighted issues and try again.'
        )
        setSummary({
          createdCount: 0,
          failedCount: rowErrors.length,
          failures: rowErrors
        })
        return
      }

      const response = await apiPost('users/bulk-instructors', {
        instructors: validInstructors,
        rowErrors
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        const message =
          data?.message || data?.error || 'Failed to process bulk upload.'
        showError(message)
        return
      }

      const result = await response.json()
      if (!result.success) {
        const message =
          result.message || result.error || 'Bulk upload completed with errors.'
        showError(message)
      } else {
        showSuccess(result.message || 'Bulk instructor upload completed.')
      }

      const summaryPayload = {
        createdCount: result.data?.createdCount || 0,
        failedCount: result.data?.failedCount || 0,
        failures: result.data?.failures || [],
        subjectsSummary: result.data?.subjectsSummary || null,
        instructorsWithSubjectFailures:
          result.data?.instructorsWithSubjectFailures || []
      }
      setSummary(summaryPayload)

      if (onCompleted) {
        onCompleted(summaryPayload)
      }
    } catch (error) {
      console.error('Bulk upload error:', error)
      // Ensure error message is user-friendly (not localhost)
      let errorMessage =
        error.message ||
        'An unexpected error occurred while processing the file.'
      if (
        errorMessage.includes('localhost') ||
        errorMessage.includes('127.0.0.1')
      ) {
        errorMessage = 'Invalid file format. Please upload a CSV or XLSX file.'
      }
      showError(errorMessage)
    } finally {
      setIsUploading(false)
    }
  }

  const handleClose = () => {
    if (isUploading) return
    setFile(null)
    setFileError('')
    setSummary(null)
    onClose?.()
  }

  return (
    <div style={styles.backdrop} role='dialog' aria-modal='true'>
      <div style={styles.modal}>
        <h2 style={styles.title}>Bulk Upload Instructors</h2>
        <p style={styles.description}>
          Upload a CSV or XLSX file to create multiple instructor accounts at
          once. The following columns are required:{' '}
          <strong>
            first name, last name, email address, user id, phone number, school
            year, semester, department, course, subject name, subject code,
            section, weekly days, start time, end time
          </strong>
          . Meeting link, credits, description, experience, and specialization
          are optional. Multiple rows with the same instructor data (email/user
          id) but different subject data will create one instructor with
          multiple subjects.
        </p>

        <div style={styles.fieldGroup}>
          <label htmlFor='bulkInstructorUploadFile' style={styles.label}>
            Instructor CSV/XLSX File
          </label>
          <input
            id='bulkInstructorUploadFile'
            type='file'
            accept='.csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel'
            onChange={handleFileChange}
            style={styles.fileInput}
          />
          {file && (
            <div style={styles.fileInfo}>
              <i className='bi bi-file-earmark-spreadsheet' /> {file.name}
            </div>
          )}
          {fileError && <div style={styles.errorText}>{fileError}</div>}
        </div>

        {summary && (
          <div style={styles.summaryBox}>
            <h3 style={styles.summaryTitle}>Upload Summary</h3>
            <p>
              <strong>Instructors Created:</strong> {summary.createdCount}
            </p>
            <p>
              <strong>Instructors Failed:</strong> {summary.failedCount}
            </p>
            {summary.subjectsSummary && (
              <>
                <p>
                  <strong>Subjects Assigned:</strong>{' '}
                  {summary.subjectsSummary.totalCreated}
                </p>
                {summary.subjectsSummary.totalFailed > 0 && (
                  <p style={{ color: '#e74c3c' }}>
                    <strong>Subjects Failed:</strong>{' '}
                    {summary.subjectsSummary.totalFailed}
                  </p>
                )}
              </>
            )}
            {summary.failures?.length > 0 && (
              <div style={styles.failureList}>
                <p style={{ marginBottom: 4 }}>
                  Some instructors could not be created:
                </p>
                <ul style={styles.failureUl}>
                  {summary.failures.slice(0, 10).map((f, index) => (
                    <li key={`${f.rowIndex}-${index}`} style={styles.failureLi}>
                      Row {f.rowIndex + 1}:{' '}
                      {Array.isArray(f.errors)
                        ? f.errors.join('; ')
                        : f.reason || 'Unknown error'}
                    </li>
                  ))}
                  {summary.failures.length > 10 && (
                    <li style={styles.failureLi}>
                      ...and {summary.failures.length - 10} more
                    </li>
                  )}
                </ul>
              </div>
            )}
            {summary.instructorsWithSubjectFailures?.length > 0 && (
              <div
                style={{
                  ...styles.failureList,
                  marginTop: 12,
                  borderTop: '1px solid #e0e0e0',
                  paddingTop: 8
                }}
              >
                <p style={{ marginBottom: 4 }}>
                  Some subjects could not be assigned:
                </p>
                <ul style={styles.failureUl}>
                  {summary.instructorsWithSubjectFailures
                    .slice(0, 5)
                    .map((inst, idx) => (
                      <li
                        key={`subj-${inst.instructorId}-${idx}`}
                        style={styles.failureLi}
                      >
                        {inst.email}: {inst.subjectsFailed} subject(s) failed
                        {inst.errors?.length > 0 && (
                          <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                            {inst.errors.slice(0, 3).map((err, errIdx) => (
                              <li
                                key={`err-${errIdx}`}
                                style={{ fontSize: '0.85em' }}
                              >
                                {err}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div style={styles.actions}>
          <button
            type='button'
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={handleClose}
            disabled={isUploading}
          >
            Cancel
          </button>
          <button
            type='button'
            style={{
              ...styles.button,
              ...styles.primaryButton,
              opacity: isUploading ? 0.8 : 1
            }}
            onClick={handleUpload}
            disabled={isUploading}
          >
            {isUploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 620,
    boxShadow: '0 18px 45px rgba(15, 23, 42, 0.35)'
  },
  title: {
    margin: 0,
    marginBottom: 8,
    fontSize: 22,
    fontWeight: 700,
    color: brand.primary || '#111827'
  },
  description: {
    marginTop: 0,
    marginBottom: 16,
    fontSize: 14,
    color: neutral.textMuted || '#4b5563',
    lineHeight: 1.5
  },
  fieldGroup: {
    marginBottom: 16
  },
  label: {
    display: 'block',
    marginBottom: 6,
    fontSize: 14,
    fontWeight: 600,
    color: neutral.text || '#111827'
  },
  fileInput: {
    width: '100%'
  },
  fileInfo: {
    marginTop: 8,
    fontSize: 13,
    color: neutral.textMuted || '#4b5563',
    display: 'flex',
    alignItems: 'center',
    gap: 6
  },
  errorText: {
    marginTop: 6,
    fontSize: 13,
    color: statusColors.absent?.border || '#b91c1c'
  },
  summaryBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: neutral.surface || '#f9fafb',
    border: `1px solid ${neutral.border || '#e5e7eb'}`
  },
  summaryTitle: {
    margin: 0,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: 600
  },
  failureList: {
    marginTop: 4
  },
  failureUl: {
    paddingLeft: 18,
    margin: 0,
    fontSize: 13
  },
  failureLi: {
    marginBottom: 2
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 20
  },
  button: {
    minWidth: 110,
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer'
  },
  primaryButton: {
    backgroundColor: brand.primary || '#2563eb',
    color: '#fff'
  },
  secondaryButton: {
    backgroundColor: neutral.surface || '#f3f4f6',
    color: neutral.text || '#111827'
  }
}

export default BulkInstructorUploadModal
