/**
 * NE-Attend Browser Extension - Centralized Configuration Module
 *
 * This module provides a single source of truth for all configuration values.
 * All URLs and settings should be retrieved via getConfig() to support:
 * - Dynamic configuration via extension options page
 * - Easy switching between development and production environments
 * - Consistent behavior across all extension scripts
 *
 * USAGE:
 * 1. Import this module in your script
 * 2. Use getConfig() to get current configuration
 * 3. Use specific getters like getBackendUrl(), getFrontendUrl() for convenience
 */

// Configuration storage key - used across all extension scripts
const CONFIG_KEY = 'neattend_config'

// Default configuration values
// These are used when no custom configuration is saved
const DEFAULT_CONFIG = {
  // Frontend URL where the NE-Attend web dashboard is running
  // Development: http://localhost:5173
  // Production: Set via extension options page
  frontendUrl: 'http://localhost:5173',

  // Backend API URL where the NE-Attend server is running
  // Development: http://localhost:8000
  // Production: Set via extension options page
  backendUrl: 'http://localhost:8000',

  // Feature flags (can be extended)
  enableDebugLogging: false,
  enableRealTimeSync: true
}

// Cache for configuration to reduce chrome.storage calls
let configCache = null
let configCacheTimestamp = 0
const CONFIG_CACHE_TTL = 5000 // 5 seconds cache TTL

/**
 * Get the current configuration
 * Uses caching to minimize chrome.storage.sync calls
 * @param {boolean} forceRefresh - Force refresh from storage
 * @returns {Promise<Object>} Current configuration object
 */
async function getConfig (forceRefresh = false) {
  const now = Date.now()

  // Return cached config if still valid and not forcing refresh
  if (
    !forceRefresh &&
    configCache &&
    now - configCacheTimestamp < CONFIG_CACHE_TTL
  ) {
    return configCache
  }

  return new Promise(resolve => {
    // Check if chrome.storage is available (content scripts vs service worker)
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.get([CONFIG_KEY], result => {
        configCache = { ...DEFAULT_CONFIG, ...(result[CONFIG_KEY] || {}) }
        configCacheTimestamp = now
        resolve(configCache)
      })
    } else {
      // Fallback for contexts where chrome.storage is not available
      console.warn('⚠️ chrome.storage not available, using default config')
      configCache = { ...DEFAULT_CONFIG }
      configCacheTimestamp = now
      resolve(configCache)
    }
  })
}

/**
 * Save configuration to chrome.storage.sync
 * @param {Object} config - Configuration object to save
 * @returns {Promise<void>}
 */
async function saveConfig (config) {
  return new Promise((resolve, reject) => {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.set({ [CONFIG_KEY]: config }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError)
        } else {
          // Invalidate cache so next getConfig() fetches fresh data
          configCache = null
          configCacheTimestamp = 0
          resolve()
        }
      })
    } else {
      reject(new Error('chrome.storage not available'))
    }
  })
}

/**
 * Reset configuration to defaults
 * @returns {Promise<void>}
 */
async function resetConfig () {
  return saveConfig(DEFAULT_CONFIG)
}

/**
 * Get the backend API URL
 * Convenience method for common use case
 * @returns {Promise<string>} Backend URL
 */
async function getBackendUrl () {
  const config = await getConfig()
  return config.backendUrl || DEFAULT_CONFIG.backendUrl
}

/**
 * Get the frontend dashboard URL
 * Convenience method for common use case
 * @returns {Promise<string>} Frontend URL
 */
async function getFrontendUrl () {
  const config = await getConfig()
  return config.frontendUrl || DEFAULT_CONFIG.frontendUrl
}

/**
 * Get the dashboard URL (frontend + /dashboard path)
 * @returns {Promise<string>} Dashboard URL
 */
async function getDashboardUrl () {
  const frontendUrl = await getFrontendUrl()
  return `${frontendUrl}/dashboard`
}

/**
 * Get the health check endpoint URL
 * @returns {Promise<string>} Health check URL
 */
async function getHealthCheckUrl () {
  const backendUrl = await getBackendUrl()
  return `${backendUrl}/api/health`
}

/**
 * Get the attendance API endpoint URL
 * @returns {Promise<string>} Attendance API URL
 */
async function getAttendanceApiUrl () {
  const backendUrl = await getBackendUrl()
  return `${backendUrl}/api/attendance`
}

/**
 * Get the attendance progress endpoint URL
 * @returns {Promise<string>} Progress API URL
 */
async function getProgressApiUrl () {
  const backendUrl = await getBackendUrl()
  return `${backendUrl}/api/attendance/progress`
}

// Expose constants for scripts that need them
// This allows other scripts to reference the same keys
const CONFIG = {
  KEY: CONFIG_KEY,
  DEFAULTS: DEFAULT_CONFIG
}

// Export for ES6 modules (used by bundlers)
// Also attach to global scope for content scripts and service workers
if (typeof globalThis !== 'undefined') {
  globalThis.neattendConfig = {
    getConfig,
    saveConfig,
    resetConfig,
    getBackendUrl,
    getFrontendUrl,
    getDashboardUrl,
    getHealthCheckUrl,
    getAttendanceApiUrl,
    getProgressApiUrl,
    CONFIG_KEY,
    DEFAULT_CONFIG,
    CONFIG
  }
}

// For service worker context (background.js)
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.neattendConfig = globalThis.neattendConfig
}

// For content script context (attendance.js)
if (typeof window !== 'undefined') {
  window.neattendConfig = globalThis.neattendConfig
}
