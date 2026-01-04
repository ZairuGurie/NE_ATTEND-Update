// Sync data from chrome.storage.local to localStorage (legacy functionality)
chrome.storage.local.get(null, function (item) {
  for (let key in item) {
    if (
      item[key] != null &&
      item[key] != undefined &&
      item[key] != 'undefined'
    ) {
      localStorage.setItem(key, JSON.stringify(item[key]))
      chrome.storage.local.remove(key)
    }
  }
})

// Message bridge: Listen for messages from page and forward to background script
// This enables the web app (localhost:5173) to communicate with the extension
window.addEventListener('message', function (event) {
  // Security: Only accept messages from same origin
  if (event.origin !== window.location.origin) {
    return
  }

  // Only handle NEATTEND extension messages
  if (
    !event.data ||
    !event.data.type ||
    !event.data.type.startsWith('NEATTEND_')
  ) {
    return
  }

  const messageType = event.data.type
  const messageId = event.data.messageId

  // Handle STORE_TOKEN request from page
  if (messageType === 'NEATTEND_STORE_TOKEN') {
    const { tokenData, meetCode, subjectId } = event.data.payload || {}

    if (!tokenData || !subjectId) {
      // Send error response back to page
      window.postMessage(
        {
          type: 'NEATTEND_STORE_TOKEN_RESPONSE',
          messageId: messageId,
          success: false,
          error: 'Missing required token data'
        },
        window.location.origin
      )
      return
    }

    console.log(
      '🌉 Content Script: Forwarding STORE_TOKEN to background script'
    )
    console.log('   MeetCode:', meetCode)
    console.log('   SubjectId:', subjectId)

    // Set up timeout to ensure we always respond to the page, even if background script hangs
    const MESSAGE_TIMEOUT = 8000 // 8 seconds (slightly less than page timeout of 10s)
    let responseSent = false
    let timeoutId = null

    const sendResponseToPage = (success, error, verified, keys) => {
      if (responseSent) {
        console.warn(
          '⚠️ Content Script: Response already sent, ignoring duplicate response'
        )
        return
      }
      responseSent = true

      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }

      window.postMessage(
        {
          type: 'NEATTEND_STORE_TOKEN_RESPONSE',
          messageId: messageId,
          success: success,
          error: error,
          verified: verified,
          keys: keys,
          method: 'message'
        },
        window.location.origin
      )
    }

    // Set up timeout fallback
    timeoutId = setTimeout(() => {
      if (!responseSent) {
        console.error(
          '❌ Content Script: Timeout waiting for background script response (8s)'
        )
        sendResponseToPage(
          false,
          'Timeout: Background script did not respond. Extension may not be installed or background script may be unresponsive.',
          false,
          null
        )
      }
    }, MESSAGE_TIMEOUT)

    // Forward message to background script
    chrome.runtime.sendMessage(
      {
        type: 'STORE_TOKEN',
        payload: {
          tokenData: tokenData,
          meetCode: meetCode || null,
          subjectId: subjectId
        }
      },
      response => {
        // Relay response back to page
        if (chrome.runtime.lastError) {
          console.error(
            '❌ Content Script: Failed to forward message to background:',
            chrome.runtime.lastError
          )
          console.error('   Error details:', chrome.runtime.lastError.message)
          sendResponseToPage(
            false,
            `Background script error: ${chrome.runtime.lastError.message}. Extension may not be installed.`,
            false,
            null
          )
        } else if (response && response.success) {
          console.log(
            '✅ Content Script: Token stored successfully, relaying response to page'
          )
          sendResponseToPage(
            true,
            null,
            response.verified || false,
            response.keys || null
          )
        } else {
          console.error(
            '❌ Content Script: Token storage failed:',
            response?.error || 'Unknown error'
          )
          sendResponseToPage(
            false,
            response?.error || 'Unknown error from background script',
            false,
            null
          )
        }
      }
    )
  }
})

console.log('🌉 NE-Attend message bridge initialized in content script')

// ========================================================================
// REAL-TIME DASHBOARD BRIDGE: Broadcast extension data to a dashboard every 1 second
// This enables the web dashboard to receive live meeting status directly
// from the extension's chrome.storage.local without going through the backend
// ========================================================================

// Constants for real-time bridge
const REALTIME_BROADCAST_INTERVAL = 1000 // Broadcast every 1 second
const REALTIME_STORAGE_KEY = 'realtimeMonitoring' // Key used by attendance.js

// Track if we're on a page that needs real-time data
const isRealtimeDashboard = () => {
  return false
}

// Broadcast real-time data to the page
const broadcastRealtimeData = () => {
  if (!isRealtimeDashboard()) {
    return // Only broadcast on relevant pages
  }

  try {
    chrome.storage.local.get([REALTIME_STORAGE_KEY], result => {
      if (chrome.runtime.lastError) {
        console.debug(
          'Real-time bridge: Storage access error:',
          chrome.runtime.lastError
        )
        return
      }

      const realtimeData = result[REALTIME_STORAGE_KEY]

      if (
        realtimeData &&
        realtimeData.participants &&
        realtimeData.participants.length > 0
      ) {
        // Calculate age of data
        const dataAge =
          Date.now() - new Date(realtimeData.updatedAt || Date.now()).getTime()
        const ageSeconds = Math.floor(dataAge / 1000)

        // Only broadcast if data is fresh (less than 60 seconds old)
        if (ageSeconds < 60) {
          // Post message to the page with real-time data
          window.postMessage(
            {
              type: 'NEATTEND_REALTIME_UPDATE',
              timestamp: new Date().toISOString(),
              source: 'extension_bridge',
              data: {
                meetCode: realtimeData.meetCode || 'unknown',
                participantCount:
                  realtimeData.participantCount ||
                  realtimeData.participants.length,
                participants: realtimeData.participants,
                sessionStartTime: realtimeData.sessionStartTime,
                currentDuration: realtimeData.currentDuration,
                updatedAt: realtimeData.updatedAt,
                isUnauthenticated: realtimeData.isUnauthenticated || false,
                authWarning: realtimeData.authWarning || false,
                dataAgeSeconds: ageSeconds
              }
            },
            window.location.origin
          )

          // Log periodically (every 10 seconds) to avoid console spam
          if (Date.now() % 10000 < REALTIME_BROADCAST_INTERVAL) {
            console.log(
              `📡 Real-time bridge: Broadcasting ${realtimeData.participants.length} participants (${ageSeconds}s old)`
            )
          }
        } else {
          // Data is stale - notify page that meeting may have ended
          window.postMessage(
            {
              type: 'NEATTEND_REALTIME_STALE',
              timestamp: new Date().toISOString(),
              source: 'extension_bridge',
              data: {
                meetCode: realtimeData.meetCode || 'unknown',
                dataAgeSeconds: ageSeconds,
                lastUpdate: realtimeData.updatedAt
              }
            },
            window.location.origin
          )
        }
      } else {
        // No real-time data available
        window.postMessage(
          {
            type: 'NEATTEND_REALTIME_EMPTY',
            timestamp: new Date().toISOString(),
            source: 'extension_bridge'
          },
          window.location.origin
        )
      }
    })
  } catch (error) {
    console.debug('Real-time bridge: Error reading storage:', error)
  }
}

// Start real-time broadcasting interval
let realtimeBroadcastInterval = null

const startRealtimeBroadcasting = () => {
  if (realtimeBroadcastInterval) {
    clearInterval(realtimeBroadcastInterval)
  }

  // Initial broadcast
  broadcastRealtimeData()

  // Set up interval for continuous broadcasting
  realtimeBroadcastInterval = setInterval(
    broadcastRealtimeData,
    REALTIME_BROADCAST_INTERVAL
  )

  console.log('⏱️ Real-time bridge: Started broadcasting every 1 second')
}

// Handle visibility changes - stop broadcasting when tab is hidden, resume when visible
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (realtimeBroadcastInterval) {
      clearInterval(realtimeBroadcastInterval)
      realtimeBroadcastInterval = null
      console.log('⏸️ Real-time bridge: Paused (tab hidden)')
    }
  } else {
    startRealtimeBroadcasting()
    console.log('▶️ Real-time bridge: Resumed (tab visible)')
  }
})

// Handle page requests for data refresh and clear display
window.addEventListener('message', event => {
  if (event.origin !== window.location.origin) {
    return
  }

  if (event.data && event.data.type === 'NEATTEND_REQUEST_REFRESH') {
    console.log('🔄 Real-time bridge: Manual refresh requested')
    broadcastRealtimeData()
  }

  // FIX: Handle clear display request from Dashboard
  if (event.data && event.data.type === 'NEATTEND_CLEAR_DISPLAY') {
    console.log('🧹 Real-time bridge: Clear display requested')

    // Stop broadcasting temporarily
    if (realtimeBroadcastInterval) {
      clearInterval(realtimeBroadcastInterval)
      realtimeBroadcastInterval = null
      console.log('⏸️ Real-time bridge: Broadcasting paused (clear display)')
    }

    // Clear the real-time monitoring data in storage
    try {
      chrome.storage.local.remove([REALTIME_STORAGE_KEY], () => {
        if (chrome.runtime.lastError) {
          console.warn(
            'Could not clear real-time storage:',
            chrome.runtime.lastError
          )
        } else {
          console.log('✅ Real-time bridge: Cleared local storage')
        }
      })
    } catch (e) {
      console.warn('Error clearing storage:', e)
    }

    // Notify page that display was cleared
    window.postMessage(
      {
        type: 'NEATTEND_DISPLAY_CLEARED',
        timestamp: new Date().toISOString(),
        source: 'extension_bridge'
      },
      window.location.origin
    )

    // Resume broadcasting after 5 seconds (to allow new meeting data to come in)
    setTimeout(() => {
      if (isRealtimeDashboard()) {
        startRealtimeBroadcasting()
        console.log('▶️ Real-time bridge: Resumed after clear (5s delay)')
      }
    }, 5000)
  }
})

// Start broadcasting when script loads (if on relevant page)
if (isRealtimeDashboard()) {
  startRealtimeBroadcasting()
  console.log('✅ Real-time bridge: Active on Dashboard page')
} else {
  console.log('ℹ️ Real-time bridge: Standby (not on Dashboard page)')
}
