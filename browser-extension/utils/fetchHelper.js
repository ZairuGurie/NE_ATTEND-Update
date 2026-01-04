/**
 * NE-Attend Fetch Helper Utility
 *
 * Handles Chrome's local network request restrictions by automatically
 * adding targetAddressSpace option for localhost and private IP addresses.
 *
 * Chrome requires explicit permission or targetAddressSpace option for
 * local network requests (localhost, 127.0.0.1, private IPs) when making
 * requests from secure contexts (like https://meet.google.com).
 */

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
    // Invalid URL - return null to use standard fetch
    console.warn('⚠️ Invalid URL in detectAddressSpace:', url, error)
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

// Lazy-initialized feature detection (only check when first needed)
// This prevents potential page blocking during initial script load
let _targetAddressSpaceSupported = null
function getTargetAddressSpaceSupported () {
  if (_targetAddressSpaceSupported === null) {
    _targetAddressSpaceSupported = isTargetAddressSpaceSupported()
  }
  return _targetAddressSpaceSupported
}

/**
 * Safe fetch wrapper that automatically adds targetAddressSpace for local/private networks
 *
 * This function wraps the native fetch API and automatically detects if the URL
 * points to a local or private network address. If so, it adds the targetAddressSpace
 * option to comply with Chrome's Private Network Access (PNA) policy.
 *
 * Chrome's PNA policy blocks requests from secure contexts (like chrome-extension://
 * or https://meet.google.com) to localhost/private IPs unless targetAddressSpace is
 * explicitly set.
 *
 * @param {string|Request} url - The URL or Request object to fetch
 * @param {RequestInit} options - Standard fetch options (method, headers, body, etc.)
 * @returns {Promise<Response>} - Standard fetch Response promise
 *
 * @example
 * // Automatically handles localhost
 * await safeFetch('http://localhost:8000/api/health');
 *
 * // Automatically handles private IPs
 * await safeFetch('http://192.168.1.100:8000/api/data');
 *
 * // Public URLs work normally
 * await safeFetch('https://api.example.com/data');
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
  if (addressSpace && getTargetAddressSpaceSupported()) {
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
            `🌐 FetchHelper safeFetch: Using targetAddressSpace="${addressSpace}" for ${urlString}`
          )
        }
      }

      return fetch(request)
    } catch (error) {
      // If Request constructor fails, fallback to standard fetch with options
      console.warn(
        `⚠️ FetchHelper safeFetch: Failed to create Request with targetAddressSpace, using fallback:`,
        error
      )
      const fallbackOptions = { ...options, targetAddressSpace: addressSpace }
      return fetch(urlString, fallbackOptions)
    }
  } else if (addressSpace && !getTargetAddressSpaceSupported()) {
    // Feature not supported - log warning but continue with standard fetch
    // This will likely fail with CORS error, but we can't do anything about it
    console.warn(
      `⚠️ FetchHelper safeFetch: targetAddressSpace not supported in this Chrome version. Local network requests may be blocked.`
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

// Export for use in other extension files
/* eslint-disable no-undef */
if (typeof module !== 'undefined' && module.exports) {
  // Node.js/CommonJS
  module.exports = { safeFetch, detectAddressSpace }
} else if (typeof window !== 'undefined') {
  // Browser/Extension context - attach to window for global access
  window.safeFetch = safeFetch
  window.detectAddressSpace = detectAddressSpace
}
/* eslint-enable no-undef */

// Also make available as global for content scripts
if (typeof globalThis !== 'undefined') {
  globalThis.safeFetch = safeFetch
  globalThis.detectAddressSpace = detectAddressSpace
}
