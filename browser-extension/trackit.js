// Safe fetch helper for Chrome's local network request restrictions
// Inline version for popup context
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
    console.warn('⚠️ Trackit: Invalid URL in detectAddressSpace:', url, error)
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
 * @param {string|Request} url - The URL or Request object to fetch
 * @param {RequestInit} options - Standard fetch options (method, headers, body, etc.)
 * @returns {Promise<Response>} - Standard fetch Response promise
 */
async function _safeFetch (url, options = {}) {
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

      return fetch(request)
    } catch (error) {
      // If Request constructor fails, fallback to standard fetch with options
      console.warn(
        `⚠️ Trackit safeFetch: Failed to create Request with targetAddressSpace, using fallback:`,
        error
      )
      const fallbackOptions = { ...options, targetAddressSpace: addressSpace }
      return fetch(urlString, fallbackOptions)
    }
  } else if (addressSpace && !targetAddressSpaceSupported) {
    // Feature not supported - log warning but continue with standard fetch
    // This will likely fail with CORS error, but we can't do anything about it
    console.warn(
      `⚠️ Trackit safeFetch: targetAddressSpace not supported in this Chrome version. Local network requests may be blocked.`
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

// Configuration management
const CONFIG_KEY = 'neattend_config'
const DEFAULT_CONFIG = {
  frontendUrl: 'http://localhost:5173',
  backendUrl: 'http://localhost:8000'
}

// Get configuration from chrome.storage
async function getConfig () {
  return new Promise(resolve => {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.get([CONFIG_KEY], result => {
        resolve({ ...DEFAULT_CONFIG, ...(result[CONFIG_KEY] || {}) })
      })
    } else {
      resolve(DEFAULT_CONFIG)
    }
  })
}

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function () {
  const openDashboardBtn = document.getElementById('openDashboard')
  const openReceiverBtn = document.getElementById('openReceiver')
  const testConnectionBtn = document.getElementById('testConnection')
  const loading = document.getElementById('loading')
  const status = document.getElementById('status')

  // Function to show loading state
  function showLoading () {
    loading.style.display = 'block'
    status.textContent = 'Checking connection...'
  }

  // Function to hide loading state
  function hideLoading () {
    loading.style.display = 'none'
  }

  // Function to update status
  function updateStatus (message, isError = false) {
    status.textContent = message
    status.style.color = isError ? '#ff6b6b' : '#4ecdc4'
  }

  // Function to check if React app is running (via background script proxy)
  async function checkReactApp () {
    try {
      return new Promise(resolve => {
        chrome.runtime.sendMessage(
          { type: 'HEALTH_CHECK_FRONTEND' },
          response => {
            if (chrome.runtime.lastError) {
              console.error(
                '❌ Popup: Error checking frontend:',
                chrome.runtime.lastError.message
              )
              resolve(false)
              return
            }
            // Resolve with accessible status
            resolve(response && response.accessible === true)
          }
        )
      })
    } catch (error) {
      console.error('❌ Popup: Error in checkReactApp:', error)
      return false
    }
  }

  // Function to check if Express API is running (via background script proxy)
  async function checkExpressAPI () {
    try {
      return new Promise(resolve => {
        chrome.runtime.sendMessage(
          { type: 'HEALTH_CHECK_BACKEND' },
          response => {
            if (chrome.runtime.lastError) {
              console.error(
                '❌ Popup: Error checking backend:',
                chrome.runtime.lastError.message
              )
              resolve(false)
              return
            }
            // Resolve with accessible status
            resolve(response && response.accessible === true)
          }
        )
      })
    } catch (error) {
      console.error('❌ Popup: Error in checkExpressAPI:', error)
      return false
    }
  }

  // Open Dashboard button
  openDashboardBtn.addEventListener('click', async function () {
    showLoading()

    const config = await getConfig()
    const dashboardUrl = `${config.frontendUrl}/dashboard`
    const isReactRunning = await checkReactApp()
    hideLoading()

    if (isReactRunning) {
      chrome.tabs.create({
        url: dashboardUrl,
        active: true
      })
      updateStatus('✅ Dashboard opened successfully!')
    } else {
      chrome.tabs.create({
        url: dashboardUrl,
        active: true
      })
      updateStatus(
        '⚠️ Dashboard opened, but React app may not be running',
        true
      )
    }
  })

  // Open Attendance Receiver button
  openReceiverBtn.addEventListener('click', async function () {
    showLoading()

    const config = await getConfig()
    const dashboardUrl = `${config.frontendUrl}/dashboard`
    const isReactRunning = await checkReactApp()
    hideLoading()

    if (isReactRunning) {
      chrome.tabs.create({
        url: dashboardUrl,
        active: true
      })
      updateStatus('✅ Dashboard opened successfully!')
    } else {
      chrome.tabs.create({
        url: dashboardUrl,
        active: true
      })
      updateStatus(
        '⚠️ Dashboard opened, but React app may not be running',
        true
      )
    }
  })

  // Test Connection button
  testConnectionBtn.addEventListener('click', async function () {
    showLoading()

    const [isReactRunning, isExpressRunning] = await Promise.all([
      checkReactApp(),
      checkExpressAPI()
    ])

    hideLoading()

    if (isReactRunning && isExpressRunning) {
      updateStatus('✅ All services are running!')
      const config = await getConfig()
      chrome.tabs.create({
        url: `${config.frontendUrl}/dashboard`,
        active: true
      })
    } else if (isReactRunning && !isExpressRunning) {
      updateStatus('⚠️ React app running, but Express API is not running', true)
    } else if (!isReactRunning && isExpressRunning) {
      updateStatus('⚠️ Express API running, but React app is not running', true)
    } else {
      updateStatus('❌ Neither React app nor Express API is running', true)
      chrome.tabs.create({
        url: chrome.runtime.getURL('test_connection.html'),
        active: true
      })
    }
  })

  // Initialize status on popup open (no auto-check to avoid CORS errors)
  updateStatus('Click a button to get started')
})
