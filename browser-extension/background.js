// Configuration management
const CONFIG_KEY = 'neattend_config'
const DEFAULT_CONFIG = {
  frontendUrl: 'http://localhost:5173',
  backendUrl: 'http://localhost:8000'
}

// Safe fetch helper for Chrome's local network request restrictions
// Inline version for service worker context
// Handles Chrome's Private Network Access (PNA) policy by setting targetAddressSpace

/**
 * Detects the address space of a URL (local, private, or public)
 * @param {string} url - The URL to check
 * @returns {string|null} - 'local' for localhost, 'private' for private IPs, null for public
 */
function detectAddressSpace (url) {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()

    // Localhost detection (127.0.0.1, localhost, [::1])
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]'
    ) {
      return 'local'
    }

    // Private IP ranges:
    // - 10.0.0.0/8 (10.x.x.x)
    // - 192.168.0.0/16 (192.168.x.x)
    // - 172.16.0.0/12 (172.16.x.x - 172.31.x.x)
    if (
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return 'private'
    }

    return null // Public network - no special handling needed
  } catch (error) {
    console.warn(
      '⚠️ Background: Invalid URL in detectAddressSpace:',
      url,
      error
    )
    return null
  }
}

/**
 * Checks if targetAddressSpace is supported in this Chrome version
 * @returns {boolean} - True if targetAddressSpace is supported
 */
function isTargetAddressSpaceSupported () {
  // Feature detection: Try to create a Request with targetAddressSpace
  // This API was added in Chrome 123+ for local network requests
  try {
    // Test if Request constructor accepts targetAddressSpace option
    const testUrl = 'http://localhost:8000'
    const _testRequest = new Request(testUrl, { targetAddressSpace: 'local' })
    return true
  } catch {
    // If Request constructor throws, targetAddressSpace is not supported
    return false
  }
}

// Cache feature detection result (won't change during runtime)
const targetAddressSpaceSupported = isTargetAddressSpaceSupported()

/**
 * Safe fetch wrapper that automatically adds targetAddressSpace for local/private networks
 *
 * This function wraps the native fetch API and automatically detects if the URL
 * points to a local or private network address. If so, it adds the targetAddressSpace
 * option to comply with Chrome's Private Network Access (PNA) policy.
 *
 * Chrome's PNA policy blocks requests from secure contexts (like chrome-extension://)
 * to localhost/private IPs unless targetAddressSpace is explicitly set.
 *
 * @param {string|Request} url - The URL or Request object to fetch
 * @param {RequestInit} options - Standard fetch options (method, headers, body, etc.)
 * @returns {Promise<Response>} - Standard fetch Response promise
 */
async function safeFetch (url, options = {}) {
  // Convert Request object to URL string if needed
  const urlString =
    typeof url === 'string'
      ? url
      : url instanceof Request
      ? url.url
      : String(url)

  // Detect address space
  const addressSpace = detectAddressSpace(urlString)

  // Add targetAddressSpace for local/private networks
  if (addressSpace && targetAddressSpaceSupported) {
    try {
      // Use Request constructor for better compatibility and explicit option setting
      // This ensures targetAddressSpace is properly recognized by Chrome
      const requestOptions = {
        ...options,
        targetAddressSpace: addressSpace
      }

      // Create Request object with targetAddressSpace
      const request = new Request(urlString, requestOptions)

      // Log in development mode for debugging
      if (
        typeof chrome !== 'undefined' &&
        chrome.runtime &&
        chrome.runtime.getManifest
      ) {
        const manifest = chrome.runtime.getManifest()
        if (manifest.version && manifest.version.includes('dev')) {
          console.log(
            `🌐 Background safeFetch: Using targetAddressSpace="${addressSpace}" for ${urlString}`
          )
        }
      }

      return fetch(request)
    } catch (error) {
      // If Request constructor fails, fallback to standard fetch with options
      console.warn(
        `⚠️ Background safeFetch: Failed to create Request with targetAddressSpace, using fallback:`,
        error
      )
      const fallbackOptions = { ...options, targetAddressSpace: addressSpace }
      return fetch(urlString, fallbackOptions)
    }
  } else if (addressSpace && !targetAddressSpaceSupported) {
    // Feature not supported - log warning but continue with standard fetch
    // This will likely fail with CORS error, but we can't do anything about it
    console.warn(
      `⚠️ Background safeFetch: targetAddressSpace not supported in this Chrome version. Local network requests may be blocked.`
    )
    console.warn(`   URL: ${urlString}, Address space: ${addressSpace}`)
    console.warn(
      `   💡 Please update Chrome to version 123+ for local network request support.`
    )
    return fetch(urlString, options)
  }

  // Public network or no address space detected - use standard fetch
  return fetch(urlString, options)
}

async function getConfig () {
  return new Promise(resolve => {
    chrome.storage.sync.get([CONFIG_KEY], result => {
      resolve(result[CONFIG_KEY] || DEFAULT_CONFIG)
    })
  })
}

chrome.runtime.onInstalled.addListener(async function () {
  const config = await getConfig()
  chrome.tabs.create({
    url: `${config.frontendUrl}/dashboard`,
    active: true
  })
})

// Proxy network calls from content scripts (avoids mixed-content/CORS from https Meet)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ;(async () => {
    try {
      const config = await getConfig()

      if (message && message.type === 'ATTENDANCE_PROGRESS') {
        console.log('📡 Background: Proxying progress update to backend')
        // Use safeFetch to handle Chrome's local network request restrictions
        let response
        try {
          response = await safeFetch(
            `${config.backendUrl}/api/attendance/progress`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(message.payload || {})
            }
          )
        } catch (fetchError) {
          // Handle fetch errors (CORS, network, etc.)
          const errorMessage = fetchError.message || String(fetchError)
          const isCorsError =
            errorMessage.includes('CORS') ||
            errorMessage.includes('blocked') ||
            errorMessage.includes('target IP address space') ||
            errorMessage.includes('loopback') ||
            errorMessage.includes('Failed to fetch')

          console.error(
            '❌ Background: Fetch error in progress update:',
            fetchError
          )
          if (isCorsError) {
            console.error(
              '   This is a CORS/PNA error. Chrome may be blocking localhost requests.'
            )
            console.error(
              '   💡 Ensure Chrome is version 123+ and targetAddressSpace is properly set.'
            )
          }

          sendResponse({
            ok: false,
            status: 0,
            error: {
              error: 'Network Error',
              message:
                'Failed to connect to backend server. Please ensure the server is running and Chrome is up to date.',
              details: errorMessage
            },
            isCorsError: isCorsError,
            isNetworkError: true
          })
          return
        }

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Unknown error' }))
          console.error(
            '❌ Background: Progress update failed:',
            response.status,
            errorData
          )
          // Enhanced error handling for blocked network requests
          if (response.status === 0 || response.type === 'opaque') {
            console.warn(
              '⚠️ Background: Possible local network request blocking detected'
            )
            console.warn(
              '   💡 Ensure Chrome allows local network requests or use targetAddressSpace option'
            )
            console.warn(
              '   💡 Update Chrome to version 123+ for targetAddressSpace support'
            )
          }
          sendResponse({ ok: false, status: response.status, error: errorData })
          return
        }

        const data = await response.json().catch(() => ({}))
        console.log('✅ Background: Progress update successful')
        sendResponse({ ok: true, status: response.status, data })
        return
      }
      if (message && message.type === 'ATTENDANCE_FINAL') {
        console.log('📡 Background: Proxying final attendance to backend')

        const payload = message.payload || {}

        // Log payload structure (sanitized) with token status
        const tokenStatus = payload.verificationToken
          ? payload.verificationToken.includes('.') &&
            payload.verificationToken.split('.').length === 3
            ? 'JWT'
            : 'Legacy'
          : 'MISSING'
        console.log('📋 Background: Payload received:', {
          hasVerificationToken: !!payload.verificationToken,
          hasSubjectId: !!payload.subjectId,
          verificationTokenLength: payload.verificationToken?.length || 0,
          tokenType: tokenStatus,
          subjectId: payload.subjectId || 'MISSING',
          meetCode: payload.meetCode || 'MISSING',
          participantsCount: payload.participants?.length || 0
        })

        // CRITICAL FIX: Allow unauthenticated submissions instead of rejecting
        // Check if this is an unauthenticated submission
        const isUnauthenticated =
          !payload.verificationToken || !payload.subjectId

        if (isUnauthenticated) {
          const missingFields = []
          if (!payload.verificationToken)
            missingFields.push('verificationToken')
          if (!payload.subjectId) missingFields.push('subjectId')

          console.warn('⚠️ Background: Unauthenticated submission detected')
          console.warn('   Missing fields:', missingFields)
          console.warn('   This submission will be marked as unauthenticated')
          console.warn(
            '   💡 To avoid this, join meetings through NE-Attend dashboard'
          )

          // Mark payload as unauthenticated
          payload.isUnauthenticated = true

          // Set defaults for missing fields
          if (!payload.subjectId) {
            payload.subjectId = null
          }
          if (!payload.verificationToken) {
            payload.verificationToken = null
          }

          // Continue with submission - don't return/reject
          console.log(
            '✅ Background: Proceeding with unauthenticated submission'
          )
        }

        // Use safeFetch to handle Chrome's local network request restrictions
        let res
        try {
          res = await safeFetch(`${config.backendUrl}/api/attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        } catch (fetchError) {
          // Handle fetch errors (CORS, network, etc.)
          const errorMessage = fetchError.message || String(fetchError)
          const isCorsError =
            errorMessage.includes('CORS') ||
            errorMessage.includes('blocked') ||
            errorMessage.includes('target IP address space') ||
            errorMessage.includes('loopback') ||
            errorMessage.includes('Failed to fetch')

          console.error(
            '❌ Background: Fetch error in final attendance submission:',
            fetchError
          )
          if (isCorsError) {
            console.error(
              '   This is a CORS/PNA error. Chrome may be blocking localhost requests.'
            )
            console.error(
              '   💡 Ensure Chrome is version 123+ and targetAddressSpace is properly set.'
            )
          }

          sendResponse({
            ok: false,
            status: 0,
            error: {
              error: 'Network Error',
              message:
                'Failed to connect to backend server. Please ensure the server is running and Chrome is up to date.',
              details: errorMessage
            },
            isCorsError: isCorsError,
            isNetworkError: true
          })
          return
        }

        if (!res.ok) {
          const errorData = await res
            .json()
            .catch(() => ({ error: 'Unknown error' }))
          const errorMessage =
            errorData.message || errorData.error || 'Unknown error'

          // Enhanced error logging with specific 401 causes
          if (res.status === 401) {
            let errorType = 'unknown'
            let errorDetails = ''
            let userMessage = ''

            // Log full error response for debugging
            console.error('📋 Background: Full error response:', {
              status: res.status,
              error: errorData,
              errorMessage: errorMessage,
              meetCode: payload.meetCode || 'MISSING',
              subjectId: payload.subjectId || 'MISSING',
              verificationTokenLength: payload.verificationToken?.length || 0,
              participantsCount: payload.participants?.length || 0
            })

            // JWT validation errors - check these first as they're more specific
            if (errorMessage.includes('subject_id does not match')) {
              errorType = 'token_mismatch_subject'
              errorDetails = 'Token subject_id does not match request subjectId'
              userMessage =
                'Token was generated for a different subject. Please rejoin the meeting through NE-Attend dashboard.'
              console.error(
                '❌ Background: Final attendance failed - Token subject_id mismatch'
              )
              console.error('   Error details:', errorDetails)
              console.error(
                '   Solution: Rejoin meeting through NE-Attend dashboard to get a token for the correct subject'
              )
            } else if (errorMessage.includes('meeting_id does not match')) {
              errorType = 'token_mismatch_meeting'
              errorDetails = 'Token meeting_id does not match request meetCode'
              userMessage =
                'Token was generated for a different meeting. Please rejoin the meeting through NE-Attend dashboard.'
              console.error(
                '❌ Background: Final attendance failed - Token meeting_id mismatch'
              )
              console.error('   Error details:', errorDetails)
              console.error(
                '   Solution: Rejoin meeting through NE-Attend dashboard to get a token for the correct meeting'
              )
            } else if (errorMessage.includes('student_id does not match')) {
              errorType = 'token_mismatch_student'
              errorDetails = 'Token student_id does not match participant data'
              userMessage =
                'Token was generated for a different student. Please rejoin the meeting through NE-Attend dashboard.'
              console.error(
                '❌ Background: Final attendance failed - Token student_id mismatch'
              )
              console.error('   Error details:', errorDetails)
              console.error(
                '   Solution: Rejoin meeting through NE-Attend dashboard to get a token for the correct student'
              )
            } else if (errorMessage.includes('JWT verification failed')) {
              errorType = 'jwt_verification_failed'
              errorDetails = 'JWT token verification failed'
              userMessage =
                'Token verification failed. Please generate a new token from NE-Attend dashboard.'
              console.error(
                '❌ Background: Final attendance failed - JWT verification failed'
              )
              console.error('   Error details:', errorDetails)
              console.error('   Full error:', errorMessage)
              console.error(
                '   Solution: Generate a new token from NE-Attend dashboard'
              )
            } else if (errorMessage.includes('Token validation failed')) {
              errorType = 'token_validation_failed'
              errorDetails = 'Token validation failed'
              userMessage =
                'Token validation failed. Please generate a new token from NE-Attend dashboard.'
              console.error(
                '❌ Background: Final attendance failed - Token validation failed'
              )
              console.error('   Error details:', errorDetails)
              console.error(
                '   Solution: Generate a new token from NE-Attend dashboard'
              )
            } else if (
              errorMessage.includes('already been used') ||
              errorMessage.includes('has been used') ||
              errorMessage.includes('already used')
            ) {
              errorType = 'token_consumed'
              errorDetails =
                'Token was already consumed by a previous submission'
              userMessage =
                'Token was already used. Please generate a new token from NE-Attend dashboard.'
              console.error(
                '❌ Background: Final attendance failed - Token already consumed'
              )
              console.error('   Error details:', errorDetails)
              console.error(
                '   Solution: Token needs to be refreshed from NE-Attend dashboard'
              )
            } else if (errorMessage.includes('expired')) {
              errorType = 'token_expired'
              errorDetails = 'Token has expired'
              userMessage =
                'Token has expired. Please generate a new token from NE-Attend dashboard.'
              console.error(
                '❌ Background: Final attendance failed - Token expired'
              )
              console.error('   Error details:', errorDetails)
              console.error(
                '   Solution: Generate a new token from NE-Attend dashboard'
              )
            } else if (
              errorMessage.includes('invalid') ||
              errorMessage.includes('not found')
            ) {
              errorType = 'token_invalid'
              errorDetails = 'Token is invalid or not found in database'
              userMessage =
                'Token is invalid or not found. Please join meeting through NE-Attend dashboard to get a valid token.'
              console.error(
                '❌ Background: Final attendance failed - Token invalid or not found'
              )
              console.error('   Error details:', errorDetails)
              console.error(
                '   Solution: Join meeting through NE-Attend dashboard to get a valid token'
              )
            } else {
              errorType = 'unauthorized'
              errorDetails = 'Unauthorized - authentication failed'
              userMessage =
                'Authentication failed. Please rejoin the meeting through NE-Attend dashboard.'
              console.error(
                '❌ Background: Final attendance failed - Unauthorized (generic)'
              )
              console.error('   Error details:', errorDetails)
              console.error('   Full error message:', errorMessage)
              console.error(
                '   This may be an unrecognized error type - check backend logs for details'
              )
            }

            console.error('❌ Background: Final attendance failed:', {
              status: res.status,
              errorType: errorType,
              errorMessage: errorMessage,
              errorDetails: errorDetails,
              meetCode: payload.meetCode || 'MISSING',
              subjectId: payload.subjectId || 'MISSING'
            })

            // Include error type in response for better handling by content script
            sendResponse({
              ok: false,
              status: res.status,
              error: errorData,
              errorType: errorType,
              errorDetails: errorDetails,
              userMessage: userMessage || errorDetails
            })
            return
          } else {
            // Non-401 errors
            console.error(
              '❌ Background: Final attendance failed:',
              res.status,
              errorData
            )
            sendResponse({ ok: false, status: res.status, error: errorData })
            return
          }
        }

        const data = await res.json().catch(() => ({}))
        console.log('✅ Background: Final attendance successful')
        sendResponse({ ok: true, status: res.status, data })
        return
      }
      if (message && message.type === 'HEALTH_CHECK_FRONTEND') {
        console.log('🏥 Background: Checking frontend health')
        try {
          // Use GET request with proper CORS handling
          const response = await safeFetch(config.frontendUrl, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            cache: 'no-store'
          })

          // Consider any response (even 404) as "accessible" - means server is running
          const isAccessible = response.status < 500 // Server errors mean not accessible, but client errors mean server is up
          if (isAccessible) {
            console.log('✅ Background: Frontend is accessible')
          } else {
            console.warn(
              '⚠️ Background: Frontend returned server error:',
              response.status
            )
          }
          sendResponse({
            ok: isAccessible,
            status: response.status,
            accessible: isAccessible
          })
          return
        } catch (error) {
          console.error('❌ Background: Frontend health check failed:', error)
          const isNetworkError =
            error.name === 'TypeError' ||
            error.message.includes('fetch') ||
            error.message.includes('Failed to fetch') ||
            error.message.includes('CORS') ||
            error.message.includes('network')
          sendResponse({
            ok: false,
            status: 0,
            accessible: false,
            error: error.message || String(error),
            isNetworkError: isNetworkError
          })
          return
        }
      }
      if (message && message.type === 'HEALTH_CHECK_BACKEND') {
        console.log('🏥 Background: Checking backend health')
        try {
          const response = await safeFetch(`${config.backendUrl}/api/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          })

          if (response.ok) {
            const data = await response.json().catch(() => ({}))
            console.log('✅ Background: Backend is healthy')
            sendResponse({
              ok: true,
              status: response.status,
              accessible: true,
              data
            })
            return
          } else {
            console.warn(
              '⚠️ Background: Backend returned error status:',
              response.status
            )
            sendResponse({
              ok: false,
              status: response.status,
              accessible: false,
              error: `Backend returned status ${response.status}`
            })
            return
          }
        } catch (error) {
          console.error('❌ Background: Backend health check failed:', error)
          // Check if it's a CORS/network error
          const isNetworkError =
            error.name === 'TypeError' ||
            error.message.includes('fetch') ||
            error.message.includes('Failed to fetch')
          sendResponse({
            ok: false,
            status: 0,
            accessible: false,
            error: error.message || String(error),
            isNetworkError: isNetworkError
          })
          return
        }
      }
      if (message && message.type === 'STORE_TOKEN') {
        console.log('💾 Background: Storing token in chrome.storage.sync')
        const { tokenData, meetCode, subjectId } = message.payload || {}

        if (!tokenData || !subjectId) {
          console.error('❌ Background: Missing required token data')
          sendResponse({ success: false, error: 'Missing required token data' })
          return
        }

        try {
          const storagePromises = []
          const storedKeys = []

          // Store token with meetCode if available
          if (meetCode) {
            const normalizedMeetCode = meetCode.toLowerCase()
            const storageKey = `neattend_token_${normalizedMeetCode}`
            storedKeys.push(storageKey)

            storagePromises.push(
              new Promise((resolve, reject) => {
                chrome.storage.sync.set({ [storageKey]: tokenData }, () => {
                  if (chrome.runtime.lastError) {
                    console.error(
                      '❌ Background: Failed to store token by meetCode:',
                      chrome.runtime.lastError
                    )
                    reject(new Error(chrome.runtime.lastError.message))
                  } else {
                    console.log(
                      '✅ Background: Token stored by meetCode:',
                      normalizedMeetCode
                    )
                    resolve(storageKey)
                  }
                })
              })
            )
          }

          // Store token with subjectId as fallback
          const subjectTokenKey = `neattend_token_subject_${subjectId}`
          storedKeys.push(subjectTokenKey)
          storagePromises.push(
            new Promise((resolve, reject) => {
              chrome.storage.sync.set({ [subjectTokenKey]: tokenData }, () => {
                if (chrome.runtime.lastError) {
                  console.error(
                    '❌ Background: Failed to store token by subjectId:',
                    chrome.runtime.lastError
                  )
                  reject(new Error(chrome.runtime.lastError.message))
                } else {
                  console.log(
                    '✅ Background: Token stored by subjectId:',
                    subjectId
                  )
                  resolve(subjectTokenKey)
                }
              })
            })
          )

          // Update pending tokens list
          storagePromises.push(
            new Promise((resolve, reject) => {
              chrome.storage.sync.get(['neattend_pending_tokens'], result => {
                if (chrome.runtime.lastError) {
                  console.error(
                    '❌ Background: Failed to read pending tokens:',
                    chrome.runtime.lastError
                  )
                  reject(new Error(chrome.runtime.lastError.message))
                  return
                }

                const pendingTokens = result.neattend_pending_tokens || []
                const filtered = pendingTokens.filter(
                  t => t.subjectId !== subjectId
                )
                filtered.push({
                  ...tokenData,
                  storedAt: new Date().toISOString()
                })

                chrome.storage.sync.set(
                  { neattend_pending_tokens: filtered },
                  () => {
                    if (chrome.runtime.lastError) {
                      console.error(
                        '❌ Background: Failed to update pending tokens:',
                        chrome.runtime.lastError
                      )
                      reject(new Error(chrome.runtime.lastError.message))
                    } else {
                      console.log(
                        '✅ Background: Token added to pending tokens list'
                      )
                      resolve('pending_tokens')
                    }
                  }
                )
              })
            })
          )

          // Wait for all storage operations to complete
          await Promise.all(storagePromises)

          // Send response immediately after storage completes (don't wait for verification)
          console.log(
            '✅ Background: All token storage operations completed, sending response'
          )
          sendResponse({ success: true, verified: false, keys: storedKeys })

          // Verify storage asynchronously (don't block response)
          // Verification happens after response is sent, so errors are logged but don't affect the response
          const verifyKey = meetCode
            ? `neattend_token_${meetCode.toLowerCase()}`
            : subjectTokenKey
          chrome.storage.sync.get([verifyKey], verifyResult => {
            if (chrome.runtime.lastError) {
              console.warn(
                '⚠️ Background: Could not verify token storage:',
                chrome.runtime.lastError
              )
            } else if (verifyResult[verifyKey]) {
              console.log(
                '✅ Background: Token storage verified successfully (post-response verification)'
              )
            } else {
              console.error(
                '❌ Background: Token storage verification failed - token not found after storing!'
              )
            }
          })

          return
        } catch (error) {
          console.error('❌ Background: Error storing token:', error)
          sendResponse({
            success: false,
            error: error.message || String(error)
          })
          return
        }
      }
    } catch (e) {
      console.error('❌ Background: Error proxying request:', e)

      // Enhanced error handling for CORS/PNA errors
      const errorMessage = e.message || String(e)
      const errorName = e.name || 'UnknownError'

      // Detect CORS/PNA related errors
      const isCorsError =
        errorMessage.includes('CORS') ||
        errorMessage.includes('blocked') ||
        errorMessage.includes('target IP address space') ||
        errorMessage.includes('loopback') ||
        errorMessage.includes('Failed to fetch')

      // Detect network errors
      const isNetworkError =
        errorName === 'TypeError' &&
        (errorMessage.includes('fetch') ||
          errorMessage.includes('network') ||
          errorMessage.includes('Failed to fetch'))

      if (isCorsError || isNetworkError) {
        console.error('❌ Background: CORS/PNA Error Details:')
        console.error('   Error type:', errorName)
        console.error('   Error message:', errorMessage)
        console.error('   Possible causes:')
        console.error(
          '   1. Chrome Private Network Access (PNA) policy blocking localhost requests'
        )
        console.error(
          '   2. targetAddressSpace not supported in this Chrome version (< 123)'
        )
        console.error('   3. Backend server not running or not accessible')
        console.error('   4. Network connectivity issues')
        console.error('   💡 Solutions:')
        console.error(
          '   - Update Chrome to version 123+ for targetAddressSpace support'
        )
        console.error('   - Ensure backend server is running on localhost:8000')
        console.error('   - Check network connectivity and firewall settings')

        sendResponse({
          ok: false,
          error: 'Network/CORS Error',
          message:
            'Failed to connect to backend server. Please ensure the server is running and Chrome is up to date.',
          details: errorMessage,
          isCorsError: true,
          isNetworkError: true
        })
      } else {
        // Other errors
        sendResponse({
          ok: false,
          error: errorName,
          message: errorMessage,
          details: String(e)
        })
      }
    }
  })()
  return true // keep the message channel open for async response
})

// Cleanup expired tokens periodically
function cleanupExpiredTokens () {
  chrome.storage.sync.get(null, allItems => {
    if (chrome.runtime.lastError) {
      console.error(
        '❌ Error reading tokens for cleanup:',
        chrome.runtime.lastError
      )
      return
    }

    const tokenKeys = Object.keys(allItems).filter(k =>
      k.startsWith('neattend_token_')
    )
    const expiredKeys = []
    const now = new Date()

    tokenKeys.forEach(key => {
      const tokenData = allItems[key]
      if (!tokenData || !tokenData.expiresAt) {
        expiredKeys.push(key)
        return
      }

      try {
        const expiresAt = new Date(tokenData.expiresAt)
        if (isNaN(expiresAt.getTime()) || now >= expiresAt) {
          expiredKeys.push(key)
        }
      } catch {
        expiredKeys.push(key)
      }
    })

    if (expiredKeys.length > 0) {
      console.log(
        `🧹 Background: Cleaning up ${expiredKeys.length} expired token(s)`
      )
      chrome.storage.sync.remove(expiredKeys, () => {
        if (chrome.runtime.lastError) {
          console.error(
            '❌ Error removing expired tokens:',
            chrome.runtime.lastError
          )
        } else {
          console.log(
            `✅ Background: Removed ${expiredKeys.length} expired token(s)`
          )
        }
      })
    }
  })
}

// Cleanup expired tokens on startup and every 10 minutes
cleanupExpiredTokens()
setInterval(cleanupExpiredTokens, 600000) // Every 10 minutes

// Listen for storage changes (token additions/updates)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    // Check if any token-related keys changed
    const tokenKeys = Object.keys(changes).filter(key =>
      key.startsWith('neattend_token_')
    )

    if (tokenKeys.length > 0) {
      console.log('📦 Token storage changed:', tokenKeys)

      // Notify all tabs on meet.google.com about the token change
      chrome.tabs.query({ url: '*://meet.google.com/*' }, tabs => {
        tabs.forEach(tab => {
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'TOKEN_UPDATED',
              tokenKeys: tokenKeys
            })
            .catch(err => {
              // Ignore errors (tab might not have content script loaded yet)
              console.log('Could not notify tab:', tab.id, err.message)
            })
        })
      })
    }
  }
})
