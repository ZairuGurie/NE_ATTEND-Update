/**
 * PageLayout Component
 * Complete page layout with Sidebar, Header, and Content area
 * Provides consistent structure for all authenticated pages
 *
 * Usage:
 * <PageLayout
 *   title="Dashboard"
 *   role="instructor"
 *   user={currentUser}
 * >
 *   Page content goes here
 * </PageLayout>
 */

import React from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { neutral } from '../../utils/colors'

/**
 * PageLayout Component
 * @param {Object} props
 * @param {string} props.title - Page title for header
 * @param {string} props.role - User role (student, instructor, admin)
 * @param {Object} props.user - Current user object
 * @param {string} props.logo - Logo image source
 * @param {boolean} props.showHeader - Show header (default: true)
 * @param {boolean} props.showSidebar - Show sidebar (default: true)
 * @param {boolean} props.showNotifications - Show notification bell
 * @param {number} props.notificationCount - Unread notification count
 * @param {Array} props.notifications - Notification items
 * @param {React.ReactNode} props.headerActions - Additional header actions
 * @param {Function} props.onProfileClick - Profile click handler
 * @param {React.ReactNode} props.children - Page content
 * @param {Object} props.contentStyle - Additional content area styles
 */
const PageLayout = ({
  title = 'Dashboard',
  role = 'student',
  user,
  logo,
  showHeader = true,
  showSidebar = true,
  showNotifications = true,
  notificationCount = 0,
  notifications = [],
  headerActions,
  onProfileClick,
  children,
  contentStyle = {}
}) => {
  const location = useLocation()

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        background: neutral.bgPage,
        overflow: 'hidden'
      }}
    >
      {/* Sidebar */}
      {showSidebar && (
        <Sidebar role={role} currentPath={location.pathname} logo={logo} />
      )}

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        {showHeader && (
          <Header
            title={title}
            user={user}
            showNotifications={showNotifications}
            notificationCount={notificationCount}
            notifications={notifications}
            actions={headerActions}
            onProfileClick={onProfileClick}
          />
        )}

        {/* Content */}
        <main
          style={{
            flex: 1,
            padding: '32px 40px',
            overflowY: 'auto',
            background: neutral.bgPage,
            ...contentStyle
          }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

export default PageLayout
