import React, { useState, useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { apiPost } from '../../utils/api'
import { AUTH_KEYS } from '../../utils/constants/storage'
import { USER_ROLE } from '../../utils/constants/status'
import {
  getStoredUser,
  getCachedValidation,
  setCachedValidation,
  clearCachedValidation
} from './authUtils'
import { brand } from '../../utils/colors'

const RequireAuth = ({ children, roles }) => {
  const location = useLocation()
  const user = getStoredUser()
  const token = localStorage.getItem(AUTH_KEYS.TOKEN)

  // Check cache first to avoid unnecessary loading state
  const cachedValidation = user && token ? getCachedValidation() : null
  const [isValidating, setIsValidating] = useState(cachedValidation === null)
  const [isValid, setIsValid] = useState(cachedValidation === true)

  // Track if validation is in progress to prevent multiple simultaneous requests
  const isValidatingRef = useRef(false)

  useEffect(() => {
    const validateToken = async () => {
      // Prevent multiple simultaneous validation requests
      if (isValidatingRef.current) {
        console.log(
          '⚠️ Token validation already in progress, skipping duplicate request'
        )
        return
      }

      if (!user || !token) {
        console.log(
          '🔒 RequireAuth: No user or token found, redirecting to login'
        )
        setIsValid(false)
        setIsValidating(false)
        clearCachedValidation()
        return
      }

      // Check cache first - if recent successful validation exists, use it
      const cachedValidation = getCachedValidation()
      if (cachedValidation === true) {
        console.log('✅ RequireAuth: Using cached validation result')
        setIsValid(true)
        setIsValidating(false)
        return
      }

      // If previous validation failed (cachedValidation === false), still try to re-validate
      // but only if it wasn't a recent explicit failure
      if (cachedValidation === false) {
        console.log(
          '⚠️ RequireAuth: Previous validation failed, re-validating...'
        )
      }

      isValidatingRef.current = true
      console.log('🔒 RequireAuth: Validating token...')

      try {
        // Validate token with backend
        const response = await apiPost('auth/verify', { token })

        // Check if response is ok before parsing
        if (!response.ok) {
          // Handle different error statuses
          if (response.status === 401) {
            console.warn('🔒 RequireAuth: Token invalid or expired (401)')
          } else if (response.status === 0) {
            console.error(
              '🔒 RequireAuth: Network error during token validation'
            )
            setIsValid(false)
            setIsValidating(false)
            isValidatingRef.current = false
            return
          } else {
            console.error(
              `🔒 RequireAuth: Token validation failed with status ${response.status}`
            )
          }

          // Try to parse error response
          let errorResult
          try {
            errorResult = await response.json()
            console.error('🔒 RequireAuth: Error response:', errorResult)
          } catch (parseError) {
            console.error(
              '🔒 RequireAuth: Failed to parse error response:',
              parseError
            )
          }

          setIsValid(false)
          // Cache failed validation
          setCachedValidation(false, token)
          // Clear invalid auth data
          localStorage.removeItem(AUTH_KEYS.TOKEN)
          localStorage.removeItem(AUTH_KEYS.USER)
          clearCachedValidation()
          isValidatingRef.current = false
          return
        }

        const result = await response.json()

        if (result.success) {
          console.log('✅ RequireAuth: Token validated successfully')
          setIsValid(true)
          // Cache successful validation
          setCachedValidation(true, token)
          // Update user data if it changed
          if (result.data && result.data.user) {
            localStorage.setItem(
              AUTH_KEYS.USER,
              JSON.stringify(result.data.user)
            )
            console.log('✅ RequireAuth: User data updated')
          }
        } else {
          console.warn(
            '🔒 RequireAuth: Token validation returned success=false'
          )
          setIsValid(false)
          // Cache failed validation (will force re-check after cache expires)
          setCachedValidation(false, token)
          // Clear invalid auth data
          localStorage.removeItem(AUTH_KEYS.TOKEN)
          localStorage.removeItem(AUTH_KEYS.USER)
          clearCachedValidation()
        }
      } catch (error) {
        console.error('❌ RequireAuth: Token validation error:', error)
        console.error('   Error type:', error.constructor.name)
        console.error('   Error message:', error.message)

        setIsValid(false)
        setCachedValidation(false, token)
        localStorage.removeItem(AUTH_KEYS.TOKEN)
        localStorage.removeItem(AUTH_KEYS.USER)
        clearCachedValidation()
      } finally {
        setIsValidating(false)
        isValidatingRef.current = false
      }
    }

    validateToken()

    // Set up periodic token validation (every 5 minutes)
    const validationInterval = setInterval(() => {
      if (!isValidatingRef.current) {
        validateToken()
      }
    }, 5 * 60 * 1000)

    return () => {
      clearInterval(validationInterval)
      isValidatingRef.current = false
    }
  }, [user, token])

  // Show loading state while validating
  if (isValidating) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontSize: '18px',
          color: brand.secondary
        }}
      >
        Validating authentication...
      </div>
    )
  }

  if (!user || !token || !isValid) {
    return <Navigate to='/login' state={{ from: location }} replace />
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    // Redirect to role default page
    const roleToPath = {
      [USER_ROLE.STUDENT]: '/dashboard',
      [USER_ROLE.INSTRUCTOR]: '/instructor-dashboard',
      [USER_ROLE.ADMIN]: '/adminD'
    }
    return <Navigate to={roleToPath[user.role] || '/login'} replace />
  }

  return children
}

export default RequireAuth
