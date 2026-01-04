import React, { useState, useEffect } from 'react'
import { apiPost } from '../utils/api'
import { neutral, status as statusColors, interactive } from '../utils/colors'

const readCachedCredentials = () => {
  try {
    const serialized = localStorage.getItem('neattend_auth')
    return serialized ? JSON.parse(serialized) : null
  } catch (err) {
    console.warn('⚠️ Unable to read cached credentials:', err.message)
    return null
  }
}

const hydrateAttendancePayload = payload => {
  if (!payload) return null
  const cached = readCachedCredentials()
  return {
    ...payload,
    verificationToken:
      payload.verificationToken || cached?.verificationToken || null,
    groupId: payload.groupId || cached?.groupId || null,
    roster: payload.roster || cached?.roster || []
  }
}

const isPayloadReady = payload => {
  return Boolean(
    payload &&
      payload.verificationToken &&
      payload.groupId &&
      Array.isArray(payload.participants) &&
      payload.participants.length > 0
  )
}

const AttendanceReceiver = () => {
  const [attendanceData, setAttendanceData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Listen for messages from the extension
    const handleMessage = event => {
      if (event.data && event.data.type === 'ATTENDANCE_DATA') {
        const hydrated = hydrateAttendancePayload(event.data.payload)
        if (!isPayloadReady(hydrated)) {
          setMessage(
            '⚠️ Attendance data received but missing verification token or group binding.'
          )
        } else {
          setMessage('Attendance data received from extension!')
        }
        setAttendanceData(hydrated)
      }
    }

    window.addEventListener('message', handleMessage)

    // Check if we're on the dashboard and should show attendance data
    if (window.location.pathname === '/dashboard') {
      // Try to get attendance data from localStorage (set by extension)
      const storedData = localStorage.getItem('neattend_attendance_data')
      if (storedData) {
        const parsed = hydrateAttendancePayload(JSON.parse(storedData))
        setAttendanceData(parsed)
        localStorage.removeItem('neattend_attendance_data')
      }
    }

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  const handleSaveAttendance = async () => {
    if (!attendanceData) return
    const payload = hydrateAttendancePayload(attendanceData)
    if (!isPayloadReady(payload)) {
      setMessage(
        '⚠️ Cannot save attendance until verification token and group ID are attached.'
      )
      return
    }

    setLoading(true)
    try {
      const response = await apiPost('attendance', payload)
      const result = await response.json()

      if (result.success) {
        setMessage('Attendance data saved successfully!')
        setAttendanceData(null)
      } else {
        setMessage(
          'Error saving attendance data: ' +
            (result.error || result.message || 'Unknown error')
        )
      }
    } catch (error) {
      console.error('Error saving attendance data:', error)
      setMessage('Error saving attendance data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const hasAttendance = Boolean(attendanceData)
  const credentialsReady = Boolean(
    attendanceData?.verificationToken && attendanceData?.groupId
  )
  const participantsCount = attendanceData?.participants?.length || 0
  const saveDisabled =
    loading || !hasAttendance || !credentialsReady || participantsCount === 0

  if (!attendanceData) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h3>Waiting for attendance data from extension...</h3>
        <p>
          Please use the Trackit extension in a Google Meet session to send
          attendance data.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Attendance Data Received</h2>
      {message &&
        (() => {
          const lower = message.toLowerCase()
          const tone = lower.includes('error')
            ? 'error'
            : message.includes('⚠️')
            ? 'warning'
            : 'success'
          const backgroundColor =
            tone === 'error'
              ? statusColors.absent.bg
              : tone === 'warning'
              ? statusColors.late.bg
              : statusColors.present.bg
          const color =
            tone === 'error'
              ? statusColors.absent.text
              : tone === 'warning'
              ? statusColors.late.text
              : statusColors.present.text
          return (
            <div
              style={{
                padding: '10px',
                marginBottom: '20px',
                backgroundColor,
                color,
                borderRadius: '4px'
              }}
            >
              {message}
            </div>
          )
        })()}

      <div style={{ marginBottom: '20px' }}>
        <h3>Meeting Details</h3>
        <p>
          <strong>Meet Code:</strong> {attendanceData.meetCode}
        </p>
        <p>
          <strong>Date:</strong> {attendanceData.date}
        </p>
        <p>
          <strong>Start Time:</strong> {attendanceData.startTime}
        </p>
        <p>
          <strong>End Time:</strong> {attendanceData.stopTime}
        </p>
        {!credentialsReady && (
          <p
            style={{
              color: statusColors.absent.text,
              background: statusColors.absent.bg,
              padding: '8px 12px',
              borderRadius: 6
            }}
          >
            Missing verification token or group ID. Issue credentials from the
            Instructor Subjects page before saving.
          </p>
        )}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Participants ({participantsCount})</h3>
        <div
          style={{
            maxHeight: '300px',
            overflowY: 'auto',
            border: '1px solid #ddd',
            padding: '10px'
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: neutral.bgMuted }}>
                <th
                  style={{
                    padding: '8px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd'
                  }}
                >
                  Name
                </th>
                <th
                  style={{
                    padding: '8px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd'
                  }}
                >
                  Join Time
                </th>
                <th
                  style={{
                    padding: '8px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd'
                  }}
                >
                  Duration (min)
                </th>
                <th
                  style={{
                    padding: '8px',
                    textAlign: 'left',
                    borderBottom: '1px solid #ddd'
                  }}
                >
                  Leave Time
                </th>
              </tr>
            </thead>
            <tbody>
              {attendanceData.participants.map((participant, index) => (
                <tr key={index}>
                  <td
                    style={{ padding: '8px', borderBottom: '1px solid #ddd' }}
                  >
                    {participant.name}
                  </td>
                  <td
                    style={{ padding: '8px', borderBottom: '1px solid #ddd' }}
                  >
                    {participant.joinTime}
                  </td>
                  <td
                    style={{ padding: '8px', borderBottom: '1px solid #ddd' }}
                  >
                    {participant.attendedDuration}
                  </td>
                  <td
                    style={{ padding: '8px', borderBottom: '1px solid #ddd' }}
                  >
                    {participant.leaveTime || 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button
          onClick={handleSaveAttendance}
          disabled={saveDisabled}
          style={{
            padding: '10px 20px',
            backgroundColor: saveDisabled
              ? neutral.textMuted
              : interactive.primary,
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: saveDisabled ? 'not-allowed' : 'pointer',
            fontSize: '16px'
          }}
        >
          {loading ? 'Saving...' : 'Save Attendance Data'}
        </button>
      </div>
    </div>
  )
}

export default AttendanceReceiver
