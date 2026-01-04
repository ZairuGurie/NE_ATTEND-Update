import React, { useEffect, useState } from 'react'
import { apiGet } from '../utils/api'
import StatusBanner from './StatusBanner'

function BackendHealthBanner () {
  const [state, setState] = useState({ status: 'checking', message: '' })

  useEffect(() => {
    let isMounted = true

    const checkHealth = async () => {
      try {
        const response = await apiGet('health')
        if (!isMounted) return

        if (!response.ok) {
          setState({
            status: 'error',
            message: `Backend health check failed with status ${response.status}.`
          })
          return
        }

        const data = await response.json().catch(() => ({}))
        const cloudOnline = data?.db?.cloudOnline
        const connections = data?.db?.connections

        if (cloudOnline === false) {
          setState({
            status: 'degraded',
            message:
              'Backend is running but cloud database is offline. Some features may be limited.'
          })
        } else if (
          connections &&
          connections.cloud?.status === 'disconnected' &&
          connections.local?.status !== 'connected'
        ) {
          setState({
            status: 'degraded',
            message:
              'Backend is running but no active database connection was detected.'
          })
        } else {
          setState({ status: 'ok', message: '' })
        }
      } catch (error) {
        if (!isMounted) return
        setState({
          status: 'error',
          message:
            error?.message ||
            'Backend health check failed. Server may be offline.'
        })
      }
    }

    checkHealth()

    return () => {
      isMounted = false
    }
  }, [])

  if (state.status === 'ok' || state.status === 'checking' || !state.message) {
    return null
  }

  const variant = state.status === 'error' ? 'error' : 'warning'

  return (
    <StatusBanner
      variant={variant}
      title='Backend status'
      message={state.message}
    />
  )
}

export default BackendHealthBanner
