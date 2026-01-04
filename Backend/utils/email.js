const nodemailer = require('nodemailer')

const MAIL_USER = process.env.MAIL_USER
const MAIL_PASS = process.env.MAIL_PASS
const MAIL_FROM = process.env.MAIL_FROM || 'no-reply@neattend.local'
const MAIL_HOST = process.env.MAIL_HOST
const MAIL_PORT = process.env.MAIL_PORT
  ? Number(process.env.MAIL_PORT)
  : undefined
const MAIL_SECURE = process.env.MAIL_SECURE === 'true' || MAIL_PORT === 465
const MAIL_REQUIRE_TLS = process.env.MAIL_REQUIRE_TLS !== 'false'
const MAIL_POOL = process.env.MAIL_POOL === 'true'
const MAIL_WARMUP = process.env.MAIL_WARMUP === 'true'
const MAIL_CONN_TIMEOUT = process.env.MAIL_CONNECTION_TIMEOUT
  ? Number(process.env.MAIL_CONNECTION_TIMEOUT)
  : 15000
const MAIL_GREETING_TIMEOUT = process.env.MAIL_GREETING_TIMEOUT
  ? Number(process.env.MAIL_GREETING_TIMEOUT)
  : 10000
const MAIL_SOCKET_TIMEOUT = process.env.MAIL_SOCKET_TIMEOUT
  ? Number(process.env.MAIL_SOCKET_TIMEOUT)
  : 15000

const SMTP_ENABLED = Boolean(MAIL_HOST && MAIL_PORT && MAIL_USER && MAIL_PASS)

let smtpTransporter = null

if (SMTP_ENABLED) {
  smtpTransporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port: MAIL_PORT,
    secure: MAIL_SECURE,
    requireTLS: MAIL_REQUIRE_TLS && !MAIL_SECURE,
    auth: { user: MAIL_USER, pass: MAIL_PASS },
    pool: MAIL_POOL,
    maxConnections: Number(process.env.MAIL_MAX_CONNECTIONS || 5),
    maxMessages: Number(process.env.MAIL_MAX_MESSAGES || 200),
    rateLimit: Number(process.env.MAIL_RATE_LIMIT || 20),
    connectionTimeout: MAIL_CONN_TIMEOUT,
    greetingTimeout: MAIL_GREETING_TIMEOUT,
    socketTimeout: MAIL_SOCKET_TIMEOUT,
    disableFileAccess: true,
    disableUrlAccess: true
  })

  if (MAIL_WARMUP) {
    smtpTransporter
      .verify()
      .then(() => {
        console.log(`SMTP pool warmed (host=${MAIL_HOST}, port=${MAIL_PORT}).`)
      })
      .catch(err => {
        console.warn('SMTP warmup skipped:', err.message)
      })
  }
} else {
  console.warn(
    'SMTP email disabled: set MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS to enable email delivery.'
  )
}

async function sendMail (to, subject, text, html) {
  if (!smtpTransporter) {
    console.info(
      `[SMTP disabled] Skipping email to ${to}. Subject: ${subject}. Text: ${text}`
    )
    return {
      accepted: [to],
      rejected: [],
      messageId: 'smtp-disabled',
      pending: [to]
    }
  }

  return smtpTransporter.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    text,
    html,
    priority: 'high',
    headers: {
      'X-Priority': '1',
      'X-MSMail-Priority': 'High',
      Importance: 'high'
    }
  })
}

module.exports = {
  sendMail,
  MAIL_FROM,
  SMTP_ENABLED
}
