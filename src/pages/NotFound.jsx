import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

function NotFound () {
  const navigate = useNavigate()
  const location = useLocation()

  const handleGoHome = () => {
    navigate('/login', { replace: true })
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        textAlign: 'center'
      }}
    >
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
        Page not found
      </h1>
      <p style={{ marginBottom: '1rem' }}>
        We couldn&apos;t find a page at <code>{location.pathname}</code>.
      </p>
      <button
        type='button'
        onClick={handleGoHome}
        style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
      >
        Go to login
      </button>
    </div>
  )
}

export default NotFound
