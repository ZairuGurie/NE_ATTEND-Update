import React, { useEffect } from 'react'
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate
} from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import Login from './Login'
import ForgotPassword from './ForgotPassword'
import RequireAuth from './components/auth/RequireAuth'
import Dashboard from './Student/Dashboard'
import AttendanceLogs from './Student/AttendanceLogs'
import Notes from './Student/Notes'
import Group from './Student/Group'
import StudentProfile from './Student/StudentProfile'
import './App.css'
import History from './Instructor/History'
import Group2 from './Instructor/Subject'
import Note2 from './Instructor/Notes'
import CreateGroup from './Instructor/CreateGroup'
import GroupSettings from './Instructor/GroupSetting'
import Intructor_Profile from './Instructor/Instructor_Profile'
import ADDashboard from './Admin/ADDashboard'
import AdminProfile from './Admin/AdminProfile'
import CreateAccountForm from './Admin/components/CreateAccountForm'
import AttendanceReceiver from './components/AttendanceReceiver'

// New Instructor Pages
import InstructorAnnouncements from './Instructor/Announcements'
// AttendanceInsights removed - now integrated into Dashboard

// New Student Pages
import StudentAnnouncements from './Student/Announcements'

// Design System Demo
import ComponentDemo from './pages/ComponentDemo'
import NotFound from './pages/NotFound'

// Theme Provider for dark mode support
import { ThemeProvider } from './contexts/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import BackendHealthBanner from './components/BackendHealthBanner'
import DevInfoBar from './components/DevInfoBar'

// Navigation handler component (must be inside Router to use useNavigate)
const NavigationHandler = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const handleAuthLogout = event => {
      // Use React Router navigate for better state preservation
      navigate('/login', { replace: true, state: { from: event.detail?.from } })
    }

    window.addEventListener('auth:logout', handleAuthLogout)

    return () => {
      window.removeEventListener('auth:logout', handleAuthLogout)
    }
  }, [navigate])

  return null // This component doesn't render anything
}

function App () {
  return (
    <ThemeProvider>
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}
      >
        <div className='App'>
          <NavigationHandler />
          <ToastContainer />
          <BackendHealthBanner />
          <ErrorBoundary>
            <Routes>
              {/* Default route: Login page */}
              <Route path='/' element={<Login />} />
              <Route path='/forgot' element={<ForgotPassword />} />
              <Route path='/login' element={<Login />} />
              {/* Design System Demo - No auth required for development */}
              <Route path='/component-demo' element={<ComponentDemo />} />
              {/* Removed /signup route to avoid alternate form UI */}
              <Route
                path='/instructor-dashboard'
                element={
                  <RequireAuth roles={['instructor']}>
                    <Group2 />
                  </RequireAuth>
                }
              />
              <Route
                path='/Note2'
                element={
                  <RequireAuth roles={['instructor']}>
                    <Note2 />
                  </RequireAuth>
                }
              />
              <Route
                path='/history'
                element={
                  <RequireAuth roles={['instructor']}>
                    <History />
                  </RequireAuth>
                }
              />
              <Route
                path='/admin/create-account'
                element={
                  <RequireAuth roles={['admin']}>
                    <CreateAccountForm />
                  </RequireAuth>
                }
              />
              <Route
                path='/create-account'
                element={<Navigate to='/admin/create-account' replace />}
              />
              <Route
                path='/dashboard'
                element={
                  <RequireAuth roles={['student']}>
                    <Dashboard />
                  </RequireAuth>
                }
              />
              <Route
                path='/attendance-logs'
                element={
                  <RequireAuth roles={['student']}>
                    <AttendanceLogs />
                  </RequireAuth>
                }
              />
              <Route
                path='/notes'
                element={
                  <RequireAuth roles={['student']}>
                    <Notes />
                  </RequireAuth>
                }
              />
              <Route
                path='/group'
                element={
                  <RequireAuth roles={['student']}>
                    <Group />
                  </RequireAuth>
                }
              />
              <Route
                path='/profile'
                element={
                  <RequireAuth roles={['student']}>
                    <StudentProfile />
                  </RequireAuth>
                }
              />

              <Route
                path='/create-group'
                element={
                  <RequireAuth roles={['instructor']}>
                    <CreateGroup />
                  </RequireAuth>
                }
              />
              <Route
                path='/group-settings/:id'
                element={
                  <RequireAuth roles={['instructor']}>
                    <GroupSettings />
                  </RequireAuth>
                }
              />
              <Route path='*' element={<NotFound />} />
              <Route
                path='/instructor-profile'
                element={
                  <RequireAuth roles={['instructor']}>
                    <Intructor_Profile />
                  </RequireAuth>
                }
              />
              <Route
                path='/I_Profile'
                element={
                  <RequireAuth roles={['instructor']}>
                    <Intructor_Profile />
                  </RequireAuth>
                }
              />
              <Route
                path='/adminD'
                element={
                  <RequireAuth roles={['admin']}>
                    <ADDashboard />
                  </RequireAuth>
                }
              />
              <Route
                path='/admin-profile'
                element={
                  <RequireAuth roles={['admin']}>
                    <AdminProfile />
                  </RequireAuth>
                }
              />
              <Route
                path='/attendance-receiver'
                element={
                  <RequireAuth roles={['instructor', 'admin']}>
                    <AttendanceReceiver />
                  </RequireAuth>
                }
              />

              {/* New Instructor Routes */}
              <Route
                path='/instructor-announcements'
                element={
                  <RequireAuth roles={['instructor']}>
                    <InstructorAnnouncements />
                  </RequireAuth>
                }
              />
              {/* Redirect old insights route to Dashboard (insights now integrated) */}
              <Route
                path='/instructor-insights'
                element={<Navigate to='/instructor-dashboard' replace />}
              />

              {/* New Student Routes */}
              <Route
                path='/student-announcements'
                element={
                  <RequireAuth roles={['student']}>
                    <StudentAnnouncements />
                  </RequireAuth>
                }
              />
            </Routes>
          </ErrorBoundary>
          <DevInfoBar />
        </div>
      </Router>
    </ThemeProvider>
  )
}

export default App
