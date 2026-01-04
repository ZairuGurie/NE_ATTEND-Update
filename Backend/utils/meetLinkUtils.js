const MEET_CODE_REGEX = /([a-z]{3}-[a-z]{4}-[a-z]{3})/i

/**
 * Extract a normalized Google Meet code from a URL or free-form string.
 * Falls back to returning the trimmed string (without spaces) if regex does not match.
 * @param {string} link
 * @returns {string|null}
 */
function extractMeetCodeFromLink (link = '') {
  if (!link || typeof link !== 'string') {
    return null
  }

  const trimmed = link.trim()
  if (!trimmed) {
    return null
  }

  // Try URL parsing first
  try {
    const url = new URL(
      trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
    )
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1]
      if (MEET_CODE_REGEX.test(lastSegment)) {
        return lastSegment.toLowerCase()
      }
    }
  } catch {
    // Not a valid URL, fall back to regex below
  }

  const regexMatch = trimmed.match(MEET_CODE_REGEX)
  if (regexMatch && regexMatch[1]) {
    return regexMatch[1].toLowerCase()
  }

  // Fallback: treat plain meet code without dashes or with spaces
  const normalized = trimmed.replace(/[^a-z]/gi, '').toLowerCase()
  if (normalized.length >= 9) {
    // Attempt to insert dashes if format resembles abcdefghi
    return normalized
  }

  return null
}

module.exports = {
  extractMeetCodeFromLink
}
