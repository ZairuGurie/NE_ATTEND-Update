import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Login.css'
// Phase 4: Common CSS utilities
import './styles/common.css'
import logoImage from './assets/Logologin.png'
import { apiPost } from './utils/api'
import { Alert } from './components/ui'

const ForgotPassword = () => {
  const navigate = useNavigate()
  const [step, setStep] = useState(1) // 1: email, 2: code, 3: reset
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const requestCode = async e => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const res = await apiPost('auth/forgot/request', { email })
      const data = await res.json()
      if (!res.ok || data.error)
        throw new Error(data.error || data.message || 'Failed')
      setMessage('If the email exists, a code has been sent.')
      setStep(2)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const verifyCode = async e => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const res = await apiPost('auth/forgot/verify', { email, code })
      const data = await res.json()
      if (!res.ok || data.error)
        throw new Error(data.error || data.message || 'Invalid code')
      setMessage('Code verified. You can now set a new password.')
      setStep(3)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async e => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      if (password.length < 6)
        throw new Error('Password must be at least 6 characters')
      const res = await apiPost('auth/forgot/reset', {
        email,
        code,
        newPassword: password
      })
      const data = await res.json()
      if (!res.ok || data.error)
        throw new Error(data.error || data.message || 'Failed to reset')
      setMessage('Password reset successful. You can now log in.')
      setTimeout(() => navigate('/'), 1200)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='login-container'>
      <div className='login-panel'>
        <div className='login-content'>
          <div className='logo-container'>
            <img src={logoImage} alt='NEATTEND Logo' className='logo' />
          </div>
          {error && (
            <Alert type='error' style={{ marginBottom: 12 }}>
              {error}
            </Alert>
          )}
          {message && (
            <Alert type='success' style={{ marginBottom: 12 }}>
              {message}
            </Alert>
          )}

          {step === 1 && (
            <form onSubmit={requestCode} className='login-form'>
              <div className='form-group'>
                <label htmlFor='email' className='form-label'>
                  EMAIL ADDRESS
                </label>
                <input
                  type='email'
                  id='email'
                  name='email'
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder='Enter Email'
                  className='form-input'
                  autoComplete='email'
                  required
                />
              </div>
              <div
                className='form-options'
                style={{ justifyContent: 'flex-end' }}
              >
                <a
                  href='#'
                  onClick={e => {
                    e.preventDefault()
                    navigate('/')
                  }}
                  className='forgot-password'
                >
                  Back to Login
                </a>
              </div>
              <button
                type='submit'
                className='login-button'
                disabled={loading}
                style={{ opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Sending...' : 'SEND CODE'}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={verifyCode} className='login-form'>
              <div className='form-group'>
                <label htmlFor='code' className='form-label'>
                  CONFIRMATION CODE
                </label>
                <input
                  type='text'
                  id='code'
                  name='code'
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder='Enter Code'
                  className='form-input'
                  autoComplete='one-time-code'
                  required
                />
              </div>
              <div className='form-options'>
                <a
                  href='#'
                  onClick={e => {
                    e.preventDefault()
                    setStep(1)
                  }}
                  className='forgot-password'
                >
                  Change Email
                </a>
                <a
                  href='#'
                  onClick={e => {
                    e.preventDefault()
                    requestCode(e)
                  }}
                  className='forgot-password'
                >
                  Resend
                </a>
              </div>
              <button
                type='submit'
                className='login-button'
                disabled={loading}
                style={{ opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Verifying...' : 'VERIFY'}
              </button>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={resetPassword} className='login-form'>
              <div className='form-group'>
                <label htmlFor='password' className='form-label'>
                  NEW PASSWORD
                </label>
                <input
                  type='password'
                  id='password'
                  name='password'
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder='Enter New Password'
                  className='form-input'
                  autoComplete='new-password'
                  required
                />
              </div>
              <div
                className='form-options'
                style={{ justifyContent: 'flex-end' }}
              >
                <a
                  href='#'
                  onClick={e => {
                    e.preventDefault()
                    setStep(2)
                  }}
                  className='forgot-password'
                >
                  Back
                </a>
              </div>
              <button
                type='submit'
                className='login-button'
                disabled={loading}
                style={{ opacity: loading ? 0.7 : 1 }}
              >
                {loading ? 'Saving...' : 'RESET PASSWORD'}
              </button>
            </form>
          )}
        </div>
      </div>
      <div className='right-panel'></div>
    </div>
  )
}

export default ForgotPassword
