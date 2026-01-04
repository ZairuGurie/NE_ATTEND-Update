import React, { useEffect, useState } from 'react'
import { getApiBaseUrlForReference, getSocketIOUrl } from '../utils/api'

function DevInfoBar () {
  const [userInfo, setUserInfo] = useState({ email: null, role: null })

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('user')
      if (!raw) return
      const parsed = JSON.parse(raw)
      setUserInfo({
        email: parsed.email || null,
        role: parsed.role || null
      })
    } catch {
      // Ignore parse errors in dev helper
    }
  }, [])

  // Only render in development
  if (!import.meta.env.DEV) return null

  const apiBase = getApiBaseUrlForReference()
  const socketUrl = getSocketIOUrl()

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        padding: '4px 8px',
        borderRadius: 6,
        background: 'rgba(15,23,42,0.9)',
        color: '#e5e7eb',
        fontSize: 10,
        zIndex: 9999,
        maxWidth: 320,
        lineHeight: 1.4
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>DEV INFO</div>
      <div>API: {apiBase}</div>
      <div>Socket: {socketUrl}</div>
      {userInfo.email && (
        <div>
          User: {userInfo.email} ({userInfo.role || 'unknown'})
        </div>
      )}
    </div>
  )
}

export default DevInfoBar
