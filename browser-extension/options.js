// Default configuration
const DEFAULT_CONFIG = {
  frontendUrl: 'http://localhost:5173',
  backendUrl: 'http://localhost:8000'
}

// Configuration storage key
const CONFIG_KEY = 'neattend_config'

// Load saved configuration or defaults
async function loadConfig () {
  return new Promise(resolve => {
    chrome.storage.sync.get([CONFIG_KEY], result => {
      const config = result[CONFIG_KEY] || DEFAULT_CONFIG
      resolve(config)
    })
  })
}

// Save configuration
async function saveConfig (config) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [CONFIG_KEY]: config }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
      } else {
        resolve()
      }
    })
  })
}

// Show status message
function showStatus (message, isError = false) {
  const statusEl = document.getElementById('status')
  statusEl.textContent = message
  statusEl.className = isError ? 'status error' : 'status success'
  statusEl.style.display = 'block'

  // Hide after 3 seconds
  setTimeout(() => {
    statusEl.style.display = 'none'
  }, 3000)
}

// Validate URL format
function isValidUrl (string) {
  try {
    const url = new URL(string)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// Load and populate form
async function populateForm () {
  const config = await loadConfig()
  document.getElementById('frontendUrl').value =
    config.frontendUrl || DEFAULT_CONFIG.frontendUrl
  document.getElementById('backendUrl').value =
    config.backendUrl || DEFAULT_CONFIG.backendUrl
}

// Save button handler
document.getElementById('saveBtn').addEventListener('click', async () => {
  const frontendUrl = document.getElementById('frontendUrl').value.trim()
  const backendUrl = document.getElementById('backendUrl').value.trim()

  // Validate URLs
  if (!isValidUrl(frontendUrl)) {
    showStatus('❌ Invalid frontend URL. Must be http:// or https://', true)
    return
  }

  if (!isValidUrl(backendUrl)) {
    showStatus('❌ Invalid backend URL. Must be http:// or https://', true)
    return
  }

  // Remove trailing slashes
  const config = {
    frontendUrl: frontendUrl.replace(/\/$/, ''),
    backendUrl: backendUrl.replace(/\/$/, '')
  }

  try {
    await saveConfig(config)
    showStatus('✅ Settings saved successfully!')
    console.log('Configuration saved:', config)
  } catch (error) {
    showStatus('❌ Failed to save settings: ' + error.message, true)
    console.error('Failed to save config:', error)
  }
})

// Reset button handler
document.getElementById('resetBtn').addEventListener('click', async () => {
  try {
    await saveConfig(DEFAULT_CONFIG)
    await populateForm()
    showStatus('✅ Settings reset to default values!')
    console.log('Configuration reset to defaults')
  } catch (error) {
    showStatus('❌ Failed to reset settings: ' + error.message, true)
    console.error('Failed to reset config:', error)
  }
})

// Initialize form on page load
document.addEventListener('DOMContentLoaded', populateForm)
