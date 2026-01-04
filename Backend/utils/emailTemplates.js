/**
 * Email Templates for NE-Attend System
 * Professional HTML templates for various email notifications
 */

/**
 * Generate a professional HTML email template for sending account credentials
 * @param {Object} params - Email parameters
 * @param {string} params.firstName - User's first name
 * @param {string} params.lastName - User's last name
 * @param {string} params.email - User's email address
 * @param {string} params.password - User's password
 * @param {string} params.role - User's role (student, instructor, admin)
 * @returns {Object} { subject: string, text: string, html: string }
 */
function getCredentialsEmailTemplate ({
  firstName,
  lastName,
  email,
  password,
  role
}) {
  const roleName = role.charAt(0).toUpperCase() + role.slice(1)
  const fullName = `${firstName} ${lastName}`
  const loginUrl = 'http://localhost:5173/login' // Update this to production URL when deploying

  const subject = `Welcome to NE-Attend - Your Account Credentials`

  // Plain text version (fallback)
  const text = `
Welcome to NE-Attend, ${fullName}!

Your account has been successfully created with the following credentials:

Role: ${roleName}
Email: ${email}
Password: ${password}

You can now log in to the NE-Attend system at: ${loginUrl}

For your security, we recommend changing your password after your first login.

If you have any questions or need assistance, please contact your system administrator.

Best regards,
The NE-Attend Team
  `.trim()

  // Professional HTML version
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to NE-Attend</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8f9fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8f9fa;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <!-- Main Container -->
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden;">
          
          <!-- Header with Gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #23225c 0%, #35348a 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">
                <span style="display: inline-block; margin-bottom: 8px;">🎓</span><br>
                Welcome to NE-Attend
              </h1>
              <p style="margin: 12px 0 0 0; color: #d7d8ff; font-size: 16px; font-weight: 500;">
                Your Account is Ready
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <!-- Greeting -->
              <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #23225c;">
                Hello <strong>${fullName}</strong>,
              </p>
              
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #495057;">
                Your account has been successfully created in the NE-Attend system. You can now access the platform using the credentials below:
              </p>

              <!-- Credentials Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 24px 0; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-radius: 12px; border: 2px solid #23225c; overflow: hidden;">
                <tr>
                  <td style="padding: 24px;">
                    <!-- Role Badge -->
                    <div style="margin-bottom: 20px;">
                      <span style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; padding: 8px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                        ${roleName} Account
                      </span>
                    </div>

                    <!-- Email Credential -->
                    <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                      <tr>
                        <td style="padding: 0;">
                          <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #6c757d; text-transform: uppercase; letter-spacing: 0.5px;">
                            Email Address
                          </p>
                          <p style="margin: 0; font-size: 16px; font-weight: 600; color: #23225c; word-break: break-all;">
                            ${email}
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- Password Credential -->
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 0;">
                          <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #6c757d; text-transform: uppercase; letter-spacing: 0.5px;">
                            Password
                          </p>
                          <p style="margin: 0; font-size: 16px; font-weight: 600; color: #23225c; word-break: break-all; font-family: 'Courier New', monospace; background: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #dee2e6;">
                            ${password}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Login Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-size: 16px; font-weight: 700; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
                      Log In to NE-Attend
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 24px 0; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 8px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #856404;">
                      <strong style="display: block; margin-bottom: 4px;">🔒 Security Reminder</strong>
                      For your security, we recommend changing your password after your first login. Keep your credentials confidential and do not share them with anyone.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Additional Info -->
              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #6c757d;">
                If you have any questions or need assistance, please contact your system administrator.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f8f9fa; padding: 24px 30px; border-top: 2px solid #e9ecef;">
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #6c757d; text-align: center;">
                <strong>NE-Attend</strong> - Attendance Management System
              </p>
              <p style="margin: 0; font-size: 12px; color: #adb5bd; text-align: center;">
                This is an automated message. Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  return { subject, text, html }
}

module.exports = {
  getCredentialsEmailTemplate
}
