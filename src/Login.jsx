import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Login.css'
// Phase 4: Common CSS utilities
import './styles/common.css'
import logoImage from './assets/Logologin.png'
import { apiPost } from './utils/api'
import { AUTH_KEYS, CHROME_STORAGE_KEYS } from './utils/constants/storage'
import { USER_ROLE } from './utils/constants/status'
import {
  Button,
  Input,
  Alert,
  ThemeToggle,
  FadeIn,
  SlideUp,
  Shake
} from './components/ui'
import { neutral, brand } from './utils/colors'

const Login = () => {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load saved credentials on component mount
  useEffect(() => {
    const savedEmail = localStorage.getItem(AUTH_KEYS.REMEMBERED_EMAIL)
    const savedRememberMe =
      localStorage.getItem(AUTH_KEYS.REMEMBER_ME) === 'true'

    if (savedEmail && savedRememberMe) {
      setFormData(prev => ({
        ...prev,
        email: savedEmail,
        rememberMe: savedRememberMe
      }))
    }
  }, [])

  const handleInputChange = e => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validate form data
    if (!formData.email || !formData.password) {
      setError('Please enter both email and password')
      setLoading(false)
      return
    }

    // Normalize email (trim and lowercase)
    const normalizedEmail = formData.email.trim().toLowerCase()

    try {
      console.log('🔐 Login attempt:', {
        email: normalizedEmail,
        hasPassword: !!formData.password
      })

      const response = await apiPost('auth/login', {
        email: normalizedEmail,
        password: formData.password
      })

      console.log(
        '🔐 Login response status:',
        response.status,
        response.statusText
      )

      // Check if response is ok before parsing JSON
      if (!response.ok) {
        // Try to parse error response
        try {
          const errorResult = await response.json()
          console.error('❌ Login failed:', errorResult)

          // Provide more descriptive error messages based on status code
          let errorMessage = errorResult.message || errorResult.error

          if (response.status === 401) {
            errorMessage =
              errorMessage ||
              'Invalid email or password. Please check your credentials and try again.'
          } else if (response.status === 400) {
            errorMessage =
              errorMessage || 'Please enter both email and password.'
          } else if (response.status === 500) {
            errorMessage =
              'Server error occurred. Please try again later or contact support.'
          } else if (response.status === 503) {
            errorMessage =
              'Service temporarily unavailable. Please try again later.'
          } else if (!errorMessage) {
            errorMessage = `Login failed (${response.status}): ${
              response.statusText || 'Unknown error'
            }`
          }

          setError(errorMessage)
          return
        } catch (parseError) {
          // If JSON parsing fails, use status text
          console.error('❌ Failed to parse error response:', parseError)
          let errorMessage = `Login failed: ${
            response.statusText || 'Unknown error'
          }`

          if (response.status === 401) {
            errorMessage =
              'Invalid email or password. Please check your credentials and try again.'
          } else if (response.status === 400) {
            errorMessage =
              'Invalid request. Please check your input and try again.'
          } else if (response.status >= 500) {
            errorMessage = 'Server error occurred. Please try again later.'
          }

          setError(errorMessage)
          return
        }
      }

      const result = await response.json()
      console.log('🔐 Login response:', { success: result.success })

      if (result.success) {
        console.log('✅ Login successful, storing auth data...')

        // Store authentication data using constants
        localStorage.setItem(AUTH_KEYS.TOKEN, result.data.token)
        localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(result.data.user))

        // Store user identity in chrome.storage for extension access
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.sync.set(
            {
              [CHROME_STORAGE_KEYS.CURRENT_USER]: {
                userId: result.data.user._id,
                email: result.data.user.email,
                firstName: result.data.user.firstName || '',
                lastName: result.data.user.lastName || '',
                role: result.data.user.role,
                studentId: result.data.user.studentId || null
              }
            },
            () => {
              if (chrome.runtime.lastError) {
                console.warn(
                  'Failed to store user in chrome.storage:',
                  chrome.runtime.lastError
                )
              } else {
                console.log(
                  '✅ User identity stored in chrome.storage for extension'
                )
              }
            }
          )
        }

        // Handle "Remember Me" functionality
        if (formData.rememberMe) {
          // Save email for future logins
          localStorage.setItem(AUTH_KEYS.REMEMBERED_EMAIL, normalizedEmail)
          localStorage.setItem(AUTH_KEYS.REMEMBER_ME, 'true')
        } else {
          // Clear saved credentials if "Remember Me" is unchecked
          localStorage.removeItem(AUTH_KEYS.REMEMBERED_EMAIL)
          localStorage.removeItem(AUTH_KEYS.REMEMBER_ME)
        }

        console.log(
          '✅ Navigating to dashboard for role:',
          result.data.user.role
        )

        switch (result.data.user.role) {
          case USER_ROLE.STUDENT:
            navigate('/dashboard', { replace: true })
            break
          case USER_ROLE.INSTRUCTOR:
            navigate('/instructor-dashboard', { replace: true })
            break
          case USER_ROLE.ADMIN:
            navigate('/adminD', { replace: true })
            break
          default:
            console.error('❌ Invalid user role:', result.data.user.role)
            setError('Invalid user role. Please contact support.')
        }
      } else {
        // Handle case where success is false but response was ok
        const errorMessage =
          result.message || result.error || 'Login failed. Please try again.'
        console.error('❌ Login failed:', errorMessage)
        setError(errorMessage)
      }
    } catch (err) {
      // Handle network errors, JSON parsing errors, etc.
      console.error('❌ Login error:', err)
      console.error('   Error type:', err.constructor.name)
      console.error('   Error message:', err.message)
      console.error('   Error stack:', err.stack)

      let errorMessage =
        'Network error. Please check your connection and try again.'

      if (err.message) {
        if (
          err.message.includes('Failed to fetch') ||
          err.message.includes('NetworkError')
        ) {
          errorMessage =
            'Cannot connect to server. Please check your internet connection and ensure the server is running.'
        } else if (err.message.includes('JSON')) {
          errorMessage =
            'Invalid response from server. Please try again or contact support.'
        } else {
          errorMessage = err.message
        }
      }

      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    // Google OAuth integration
    // TODO: Replace with real Google OAuth implementation
    // Required steps:
    // 1. Register app in Google Cloud Console
    // 2. Configure OAuth 2.0 credentials
    // 3. Add VITE_GOOGLE_CLIENT_ID to .env
    // 4. Implement OAuth flow with google-auth-library or @react-oauth/google

    setError(
      'Google Sign-In is not yet configured. Please use email/password login, or contact your administrator to set up Google OAuth.'
    )
  }

  // Track error for shake animation
  const [shakeError, setShakeError] = useState(false)

  useEffect(() => {
    if (error) {
      setShakeError(true)
      const timer = setTimeout(() => setShakeError(false), 500)
      return () => clearTimeout(timer)
    }
  }, [error])

  return (
    <div className='login-container'>
      {/* Theme Toggle */}
      <div style={{ position: 'absolute', top: 20, right: 20, zIndex: 100 }}>
        <ThemeToggle />
      </div>

      <div className='login-panel'>
        <FadeIn duration={400}>
          <div className='login-content'>
            {/* Logo with animation */}
            <SlideUp delay={100}>
              <div className='logo-container'>
                <img src={logoImage} alt='NEATTEND Logo' className='logo' />
              </div>
            </SlideUp>

            {/* Error Alert with shake */}
            {error && (
              <Shake trigger={shakeError}>
                <Alert
                  type='error'
                  style={{ marginBottom: 16 }}
                  onClose={() => setError('')}
                >
                  {error}
                </Alert>
              </Shake>
            )}

            <form onSubmit={handleSubmit} className='login-form'>
              {/* Email Input */}
              <SlideUp delay={200}>
                <Input
                  label='EMAIL ADDRESS'
                  type='email'
                  id='email'
                  name='email'
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder='Enter Email'
                  leftIcon='bi-envelope'
                  autoComplete='username'
                  required
                  style={{ marginBottom: 20 }}
                />
              </SlideUp>

              {/* Password Input */}
              <SlideUp delay={300}>
                <Input
                  label='PASSWORD'
                  type='password'
                  id='password'
                  name='password'
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder='Enter Password'
                  leftIcon='bi-lock'
                  autoComplete='current-password'
                  required
                  style={{ marginBottom: 20 }}
                />
              </SlideUp>

              {/* Options Row */}
              <SlideUp delay={400}>
                <div className='form-options'>
                  <label
                    className='checkbox-container'
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      fontSize: 14,
                      color: '#ffffff'
                    }}
                  >
                    <input
                      type='checkbox'
                      id='rememberMe'
                      name='rememberMe'
                      checked={formData.rememberMe}
                      onChange={handleInputChange}
                      style={{
                        width: 18,
                        height: 18,
                        accentColor: brand.secondary
                      }}
                    />
                    <span style={{ color: '#ffffff' }}>Remember me</span>
                  </label>
                  <a
                    href='#'
                    className='forgot-password'
                    onClick={e => {
                      e.preventDefault()
                      navigate('/forgot')
                    }}
                    style={{
                      color: '#ffffff',
                      fontSize: 14,
                      fontWeight: 500,
                      textDecoration: 'none'
                    }}
                  >
                    Forgot Password?
                  </a>
                </div>
              </SlideUp>

              {/* Login Button */}
              <SlideUp delay={500}>
                <Button
                  type='submit'
                  variant='primary'
                  size='lg'
                  loading={loading}
                  style={{
                    width: '100%',
                    marginTop: 24,
                    background: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.secondary} 100%)`,
                    fontWeight: 700,
                    letterSpacing: '0.5px'
                  }}
                >
                  {loading ? 'LOGGING IN...' : 'LOGIN'}
                </Button>
              </SlideUp>

              {/* Divider */}
              <SlideUp delay={600}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    margin: '24px 0',
                    color: `var(--text-muted, ${neutral.textMuted})`
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: `var(--border-default, ${neutral.border})`
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>OR</span>
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: `var(--border-default, ${neutral.border})`
                    }}
                  />
                </div>
              </SlideUp>

              {/* Google Login Button */}
              <SlideUp delay={700}>
                <Button
                  type='button'
                  variant='outline'
                  size='lg'
                  onClick={handleGoogleLogin}
                  leftIcon='bi-google'
                  style={{
                    width: '100%',
                    background: `var(--bg-surface, ${neutral.bgSurface})`,
                    color: `var(--text-primary, ${neutral.textPrimary})`,
                    border: `1px solid var(--border-default, ${neutral.border})`
                  }}
                >
                  Continue with Google
                </Button>
              </SlideUp>
            </form>
          </div>
        </FadeIn>
      </div>
      <div className='right-panel'></div>
    </div>
  )
}

export default Login
