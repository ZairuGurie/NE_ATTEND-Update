/**
 * NE-Attend Extension Test Helpers
 *
 * Utility functions for testing the browser extension.
 * Load these in the browser console for manual testing.
 */

// ============================================================================
// Token Management Helpers
// ============================================================================

/**
 * View all stored tokens
 */
function viewTokens () {
  chrome.storage.sync.get(null, items => {
    const tokens = {}
    for (const key in items) {
      if (key.startsWith('neattend_token_')) {
        tokens[key] = items[key]
      }
    }
    console.log('📝 Stored Tokens:', tokens)
    return tokens
  })
}

/**
 * Generate mock token for testing
 */
function generateMockToken (meetCode = 'test-abc-def') {
  const mockToken = {
    token: 'mock_token_' + Date.now(),
    groupId: '507f1f77bcf86cd799439011',
    userId: '507f1f77bcf86cd799439012',
    expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    groupName: 'Test Group',
    dashboardPath: '/Group/507f1f77bcf86cd799439011',
    meetCode: meetCode
  }

  chrome.storage.sync.set(
    {
      [`neattend_token_${meetCode}`]: mockToken
    },
    () => {
      console.log('✅ Mock token created:', mockToken)
    }
  )

  return mockToken
}

/**
 * Clear all tokens
 */
function clearAllTokens () {
  chrome.storage.sync.get(null, items => {
    const tokenKeys = Object.keys(items).filter(k =>
      k.startsWith('neattend_token_')
    )
    if (tokenKeys.length > 0) {
      chrome.storage.sync.remove(tokenKeys, () => {
        console.log('🗑️ Cleared', tokenKeys.length, 'tokens')
      })
    } else {
      console.log('ℹ️ No tokens to clear')
    }
  })
}

/**
 * Validate token format
 */
function validateToken (token) {
  const required = [
    'token',
    'groupId',
    'userId',
    'expiresAt',
    'meetCode',
    'dashboardPath'
  ]
  const missing = required.filter(field => !token[field])

  if (missing.length > 0) {
    console.error('❌ Token invalid. Missing fields:', missing)
    return false
  }

  const expiresAt = new Date(token.expiresAt)
  if (expiresAt < new Date()) {
    console.warn('⚠️ Token expired at:', expiresAt)
    return false
  }

  console.log(
    '✅ Token valid. Expires in:',
    Math.floor((expiresAt - new Date()) / 60000),
    'minutes'
  )
  return true
}

// ============================================================================
// Retry Queue Helpers
// ============================================================================

/**
 * View retry queue
 */
function viewRetryQueue () {
  chrome.storage.local.get(['neattend_retry_queue'], result => {
    const queue = result.neattend_retry_queue || []
    console.log('📋 Retry Queue (' + queue.length + ' items):', queue)
    return queue
  })
}

/**
 * Clear retry queue
 */
function clearRetryQueue () {
  chrome.storage.local.set({ neattend_retry_queue: [] }, () => {
    console.log('🗑️ Retry queue cleared')
  })
}

/**
 * Add test item to retry queue
 */
function addTestRetry () {
  chrome.storage.local.get(['neattend_retry_queue'], result => {
    const queue = result.neattend_retry_queue || []
    queue.push({
      id: 'test_retry_' + Date.now(),
      payload: { test: true, meetCode: 'test-123' },
      endpoint: 'progress',
      type: 'test',
      attempts: 0,
      createdAt: Date.now(),
      nextRetryAt: Date.now() + 2000
    })
    chrome.storage.local.set({ neattend_retry_queue: queue }, () => {
      console.log('✅ Test retry added to queue')
    })
  })
}

// ============================================================================
// Realtime Monitoring Helpers
// ============================================================================

/**
 * View realtime monitoring data
 */
function viewRealtimeData () {
  chrome.storage.local.get(['realtimeMonitoring'], result => {
    console.log('📊 Realtime Monitoring:', result.realtimeMonitoring)
    return result.realtimeMonitoring
  })
}

/**
 * Generate mock realtime data
 */
function generateMockRealtimeData (participantCount = 10) {
  const participants = []
  const names = [
    'Alice',
    'Bob',
    'Charlie',
    'David',
    'Eve',
    'Frank',
    'Grace',
    'Henry',
    'Ivy',
    'Jack'
  ]

  for (let i = 0; i < Math.min(participantCount, names.length); i++) {
    const joinTime = new Date(Date.now() - Math.random() * 3600000)
    participants.push({
      name: names[i] + ' Student',
      joinTime: joinTime.toISOString(),
      timeIn: joinTime.toLocaleTimeString(),
      attendedDuration: Math.floor(Math.random() * 3600),
      status: Math.random() > 0.2 ? 'present' : 'left',
      statusLabel: Math.random() > 0.2 ? 'Present' : 'Left Meeting',
      log: Math.random() > 0.2 ? 'Present' : 'Left Meeting',
      isLive: Math.random() > 0.2,
      durationFormatted:
        '00:' +
        String(Math.floor(Math.random() * 60)).padStart(2, '0') +
        ':' +
        String(Math.floor(Math.random() * 60)).padStart(2, '0')
    })
  }

  const mockData = {
    meetCode: 'test-mock-meet',
    updatedAt: new Date().toISOString(),
    participantCount: participants.length,
    participants: participants,
    sessionStartTime: new Date(Date.now() - 3600000).toISOString(),
    currentDuration: 3600
  }

  chrome.storage.local.set({ realtimeMonitoring: mockData }, () => {
    console.log(
      '✅ Mock realtime data created with',
      participants.length,
      'participants'
    )
  })

  return mockData
}

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * View current configuration
 */
function viewConfig () {
  chrome.storage.sync.get(['neattend_config'], result => {
    console.log(
      '⚙️ Current Config:',
      result.neattend_config || 'Using defaults'
    )
    return result.neattend_config
  })
}

/**
 * Reset configuration to defaults
 */
function resetConfig () {
  const defaultConfig = {
    frontendUrl: 'http://localhost:5173',
    backendUrl: 'http://localhost:8000'
  }

  chrome.storage.sync.set({ neattend_config: defaultConfig }, () => {
    console.log('✅ Config reset to defaults:', defaultConfig)
  })
}

/**
 * Set custom configuration
 */
function setConfig (frontendUrl, backendUrl) {
  const config = { frontendUrl, backendUrl }
  chrome.storage.sync.set({ neattend_config: config }, () => {
    console.log('✅ Config updated:', config)
  })
}

// ============================================================================
// User Identity Helpers
// ============================================================================

/**
 * View current user
 */
function viewCurrentUser () {
  chrome.storage.sync.get(['neattend_current_user'], result => {
    console.log(
      '👤 Current User:',
      result.neattend_current_user || 'No user logged in'
    )
    return result.neattend_current_user
  })
}

/**
 * Set mock user
 */
function setMockUser (role = 'student') {
  const mockUser = {
    userId: '507f1f77bcf86cd799439012',
    email: `${role}@test.edu`,
    firstName: 'Test',
    lastName: role.charAt(0).toUpperCase() + role.slice(1),
    role: role,
    studentId: role === 'student' ? '2025-001' : null
  }

  chrome.storage.sync.set({ neattend_current_user: mockUser }, () => {
    console.log('✅ Mock user set:', mockUser)
  })
}

// ============================================================================
// Storage Management
// ============================================================================

/**
 * View all extension storage
 */
function viewAllStorage () {
  console.log('📦 Chrome Storage Contents:')

  chrome.storage.sync.get(null, syncItems => {
    console.log('🔄 Sync Storage:', syncItems)
  })

  chrome.storage.local.get(null, localItems => {
    console.log('💾 Local Storage:', localItems)
  })
}

/**
 * Clear all extension storage
 */
function clearAllStorage () {
  chrome.storage.sync.clear(() => {
    console.log('🗑️ Sync storage cleared')
  })

  chrome.storage.local.clear(() => {
    console.log('🗑️ Local storage cleared')
  })
}

/**
 * Get storage usage info
 */
function getStorageInfo () {
  chrome.storage.sync.getBytesInUse(null, bytes => {
    console.log(
      '💾 Sync Storage Usage:',
      bytes,
      'bytes /',
      '102,400 bytes limit'
    )
    console.log('   Percentage:', ((bytes / 102400) * 100).toFixed(2) + '%')
  })

  chrome.storage.local.getBytesInUse(null, bytes => {
    console.log(
      '💾 Local Storage Usage:',
      bytes,
      'bytes /',
      '5,242,880 bytes limit'
    )
    console.log('   Percentage:', ((bytes / 5242880) * 100).toFixed(2) + '%')
  })
}

// ============================================================================
// Test Scenarios
// ============================================================================

/**
 * Setup complete test environment
 */
function setupTestEnvironment () {
  console.log('🔧 Setting up test environment...')

  // Clear existing data
  clearAllStorage()

  // Wait for clear to complete, then setup
  setTimeout(() => {
    // Create mock token
    generateMockToken('test-abc-def')

    // Create mock user
    setMockUser('student')

    // Create mock realtime data
    generateMockRealtimeData(5)

    // Set default config
    resetConfig()

    console.log('✅ Test environment ready!')
    console.log('📝 Run viewAllStorage() to verify')
  }, 500)
}

/**
 * Simulate successful attendance collection
 */
function simulateSuccessfulAttendance () {
  console.log('🎬 Simulating successful attendance collection...')

  const meetCode = 'sim-abc-def'

  // Step 1: Create token
  generateMockToken(meetCode)

  // Step 2: Create attendance data
  setTimeout(() => {
    generateMockRealtimeData(8)
    console.log('✅ Simulation complete. Check popup to view data.')
  }, 1000)
}

/**
 * Simulate token expiration
 */
function simulateExpiredToken (meetCode = 'exp-abc-def') {
  const expiredToken = {
    token: 'expired_token_' + Date.now(),
    groupId: '507f1f77bcf86cd799439011',
    userId: '507f1f77bcf86cd799439012',
    expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    groupName: 'Test Group',
    dashboardPath: '/Group/507f1f77bcf86cd799439011',
    meetCode: meetCode
  }

  chrome.storage.sync.set(
    {
      [`neattend_token_${meetCode}`]: expiredToken
    },
    () => {
      console.log('⏰ Expired token created:', expiredToken)
      console.log('⚠️ Extension should detect and warn about expiration')
    }
  )
}

// ============================================================================
// Console Helper Menu
// ============================================================================

/**
 * Display help menu
 */
function testHelp () {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           NE-Attend Extension Test Helpers                    ║
╠═══════════════════════════════════════════════════════════════╣
║ Token Management:                                             ║
║   viewTokens()              - View all stored tokens          ║
║   generateMockToken(code)   - Create test token               ║
║   clearAllTokens()          - Remove all tokens               ║
║   validateToken(token)      - Check token validity            ║
║                                                               ║
║ Retry Queue:                                                  ║
║   viewRetryQueue()          - View retry queue                ║
║   clearRetryQueue()         - Clear retry queue               ║
║   addTestRetry()            - Add test item to queue          ║
║                                                               ║
║ Realtime Data:                                                ║
║   viewRealtimeData()        - View monitoring data            ║
║   generateMockRealtimeData(n) - Create mock data             ║
║                                                               ║
║ Configuration:                                                ║
║   viewConfig()              - View current config             ║
║   resetConfig()             - Reset to defaults               ║
║   setConfig(fe, be)         - Set custom URLs                 ║
║                                                               ║
║ User Identity:                                                ║
║   viewCurrentUser()         - View logged in user             ║
║   setMockUser(role)         - Create test user                ║
║                                                               ║
║ Storage:                                                      ║
║   viewAllStorage()          - View all storage                ║
║   clearAllStorage()         - Clear all storage               ║
║   getStorageInfo()          - Get usage statistics            ║
║                                                               ║
║ Test Scenarios:                                               ║
║   setupTestEnvironment()    - Setup complete test env         ║
║   simulateSuccessfulAttendance() - Run success scenario       ║
║   simulateExpiredToken(code) - Test expiration handling       ║
╚═══════════════════════════════════════════════════════════════╝

Run testHelp() anytime to see this menu again.
    `)
}

// ============================================================================
// Auto-load message
// ============================================================================

console.log('✅ NE-Attend Test Helpers Loaded!')
console.log('📖 Run testHelp() to see available commands')

// Export for use in tests
/* eslint-disable no-undef */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    viewTokens,
    generateMockToken,
    clearAllTokens,
    validateToken,
    viewRetryQueue,
    clearRetryQueue,
    addTestRetry,
    viewRealtimeData,
    generateMockRealtimeData,
    viewConfig,
    resetConfig,
    setConfig,
    viewCurrentUser,
    setMockUser,
    viewAllStorage,
    clearAllStorage,
    getStorageInfo,
    setupTestEnvironment,
    simulateSuccessfulAttendance,
    simulateExpiredToken,
    testHelp
  }
}
/* eslint-enable no-undef */
