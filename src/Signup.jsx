import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Login.css'
// Phase 4: Common CSS utilities
import './styles/common.css'
import { apiPost } from './utils/api'
import { Alert } from './components/ui'
import { brand } from './utils/colors'
import { AUTH_KEYS } from './utils/constants/storage'

const Signup = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'student',
    studentId: '',
    department: '',
    course: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const onChange = e => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const onSubmit = async e => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.email ||
      !formData.password
    ) {
      setError('Please fill in all required fields')
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const res = await apiPost('auth/register', {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        studentId:
          formData.role === 'student'
            ? formData.studentId || undefined
            : undefined,
        department: formData.department || undefined,
        course: formData.course || undefined
      })
      const result = await res.json()
      if (result.success) {
        localStorage.setItem(AUTH_KEYS.TOKEN, result.data.token)
        localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(result.data.user))
        setSuccess('Account created! Redirecting...')
        setTimeout(() => navigate('/login', { replace: true }), 1200)
      } else {
        setError(result.message || result.error || 'Failed to sign up')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='login-container'>
      <div className='login-panel'>
        <div className='login-content'>
          <h2 style={{ color: brand.secondary, marginBottom: 16 }}>
            Create Account
          </h2>
          {error && (
            <Alert type='error' style={{ marginBottom: 12 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert type='success' style={{ marginBottom: 12 }}>
              {success}
            </Alert>
          )}
          <form onSubmit={onSubmit} className='login-form'>
            <div className='form-group'>
              <label className='form-label'>FIRST NAME *</label>
              <input
                className='form-input'
                name='firstName'
                value={formData.firstName}
                onChange={onChange}
                autoComplete='given-name'
                required
              />
            </div>
            <div className='form-group'>
              <label className='form-label'>LAST NAME *</label>
              <input
                className='form-input'
                name='lastName'
                value={formData.lastName}
                onChange={onChange}
                autoComplete='family-name'
                required
              />
            </div>
            <div className='form-group'>
              <label className='form-label'>EMAIL *</label>
              <input
                type='email'
                className='form-input'
                name='email'
                value={formData.email}
                onChange={onChange}
                autoComplete='email'
                required
              />
            </div>
            <div className='form-group'>
              <label className='form-label'>PASSWORD *</label>
              <input
                type='password'
                className='form-input'
                name='password'
                value={formData.password}
                onChange={onChange}
                autoComplete='new-password'
                required
              />
            </div>
            <div className='form-group'>
              <label className='form-label'>CONFIRM PASSWORD *</label>
              <input
                type='password'
                className='form-input'
                name='confirmPassword'
                value={formData.confirmPassword}
                onChange={onChange}
                autoComplete='new-password'
                required
              />
            </div>
            <div className='form-group'>
              <label className='form-label'>ROLE *</label>
              <select
                className='form-input'
                name='role'
                value={formData.role}
                onChange={onChange}
              >
                <option value='student'>Student</option>
                <option value='instructor'>Instructor</option>
                <option value='admin'>Admin</option>
              </select>
            </div>
            {formData.role === 'student' && (
              <div className='form-group'>
                <label className='form-label'>STUDENT ID</label>
                <input
                  className='form-input'
                  name='studentId'
                  value={formData.studentId}
                  onChange={onChange}
                />
              </div>
            )}
            <div className='form-group'>
              <label className='form-label'>DEPARTMENT</label>
              <input
                className='form-input'
                name='department'
                value={formData.department}
                onChange={onChange}
              />
            </div>
            <div className='form-group'>
              <label className='form-label'>COURSE</label>
              <input
                className='form-input'
                name='course'
                value={formData.course}
                onChange={onChange}
              />
            </div>
            <button
              className='login-button'
              type='submit'
              disabled={loading}
              style={{ opacity: loading ? 0.7 : 1 }}
            >
              {loading ? 'Creating...' : 'CREATE ACCOUNT'}
            </button>
            <div className='create-account'>
              <span className='create-account-text'>
                Already have an account?
              </span>
              <a
                href='#'
                className='create-account-link'
                onClick={e => {
                  e.preventDefault()
                  navigate('/login')
                }}
              >
                Login
              </a>
            </div>
          </form>
        </div>
      </div>
      <div className='right-panel'></div>
    </div>
  )
}

export default Signup
