/**
 * Component Demo Page
 * Showcases all UI components from the design system
 * Access at: /component-demo
 */

import React, { useState } from 'react'
import { neutral, brand, status as statusColors } from '../utils/colors'
import { shadows } from '../utils/shadows'

// Import all UI components
import {
  Button,
  Card,
  Input,
  StatCard,
  StatusBadge,
  PresentBadge,
  AbsentBadge,
  LateBadge,
  Skeleton,
  Tooltip,
  InfoTooltip,
  ProgressBar,
  LiveIndicator,
  LiveBadge,
  RecordingBadge,
  Alert,
  SuccessAlert,
  WarningAlert,
  PageHeader,
  Breadcrumbs,
  DashboardGrid,
  DashboardSection
} from '../components/ui'

// Demo section wrapper
const DemoSection = ({ title, children }) => (
  <section style={{ marginBottom: 48 }}>
    <h2
      style={{
        fontSize: 24,
        fontWeight: 700,
        color: brand.secondary,
        marginBottom: 24,
        paddingBottom: 12,
        borderBottom: `2px solid ${neutral.border}`
      }}
    >
      {title}
    </h2>
    {children}
  </section>
)

// Demo row for displaying component variants
const DemoRow = ({ label, children }) => (
  <div style={{ marginBottom: 24 }}>
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: neutral.textSecondary,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}
    >
      {label}
    </div>
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'center'
      }}
    >
      {children}
    </div>
  </div>
)

const ComponentDemo = () => {
  const [inputValue, setInputValue] = useState('')
  const [activeTab, setActiveTab] = useState('buttons')

  const tabs = [
    { id: 'buttons', label: 'Buttons', icon: 'bi-hand-index' },
    { id: 'inputs', label: 'Inputs', icon: 'bi-input-cursor-text' },
    { id: 'cards', label: 'Cards', icon: 'bi-card-heading' },
    { id: 'status', label: 'Status', icon: 'bi-check-circle' },
    { id: 'data', label: 'Data Display', icon: 'bi-bar-chart' },
    { id: 'feedback', label: 'Feedback', icon: 'bi-bell' },
    { id: 'navigation', label: 'Navigation', icon: 'bi-signpost-2' }
  ]

  return (
    <div style={{ minHeight: '100vh', background: neutral.bgPage }}>
      {/* Header */}
      <PageHeader
        title='Design System'
        subtitle='NE-ATTEND UI Component Library v1.0'
        icon='bi-palette'
        variant='hero'
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Component Demo' }
        ]}
        style={{ background: neutral.bgSurface, padding: '40px 60px' }}
      />

      {/* Tab Navigation */}
      <div
        style={{
          background: neutral.bgSurface,
          borderBottom: `1px solid ${neutral.border}`,
          padding: '0 60px',
          display: 'flex',
          gap: 4,
          overflowX: 'auto'
        }}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '16px 24px',
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 600 : 500,
              color:
                activeTab === tab.id ? brand.secondary : neutral.textSecondary,
              background: 'transparent',
              border: 'none',
              borderBottom: `3px solid ${
                activeTab === tab.id ? brand.secondary : 'transparent'
              }`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap'
            }}
          >
            <i className={tab.icon} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main style={{ padding: '48px 60px', maxWidth: 1400, margin: '0 auto' }}>
        {/* Buttons Section */}
        {activeTab === 'buttons' && (
          <DemoSection title='Buttons'>
            <DemoRow label='Variants'>
              <Button variant='primary'>Primary</Button>
              <Button variant='secondary'>Secondary</Button>
              <Button variant='success'>Success</Button>
              <Button variant='danger'>Danger</Button>
              <Button variant='warning'>Warning</Button>
              <Button variant='ghost'>Ghost</Button>
              <Button variant='outline'>Outline</Button>
            </DemoRow>

            <DemoRow label='Sizes'>
              <Button size='sm'>Small</Button>
              <Button size='md'>Medium</Button>
              <Button size='lg'>Large</Button>
            </DemoRow>

            <DemoRow label='States'>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
            </DemoRow>

            <DemoRow label='With Icons'>
              <Button leftIcon='bi-plus-lg'>Add New</Button>
              <Button rightIcon='bi-arrow-right'>Continue</Button>
              <Button leftIcon='bi-download' variant='outline'>
                Download
              </Button>
              <Button leftIcon='bi-trash' variant='danger'>
                Delete
              </Button>
            </DemoRow>
          </DemoSection>
        )}

        {/* Inputs Section */}
        {activeTab === 'inputs' && (
          <DemoSection title='Form Inputs'>
            <div style={{ maxWidth: 400 }}>
              <DemoRow label='Basic Input'>
                <Input
                  label='Email Address'
                  placeholder='Enter your email'
                  hint="We'll never share your email"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  style={{ width: '100%' }}
                />
              </DemoRow>

              <DemoRow label='With Icons'>
                <Input
                  label='Search'
                  placeholder='Search...'
                  leftIcon='bi-search'
                  style={{ width: '100%' }}
                />
              </DemoRow>

              <DemoRow label='Success State'>
                <Input
                  label='Username'
                  value='johndoe'
                  success
                  style={{ width: '100%' }}
                />
              </DemoRow>

              <DemoRow label='Error State'>
                <Input
                  label='Password'
                  type='password'
                  error='Password must be at least 8 characters'
                  style={{ width: '100%' }}
                />
              </DemoRow>

              <DemoRow label='Loading State'>
                <Input
                  label='Checking availability...'
                  loading
                  style={{ width: '100%' }}
                />
              </DemoRow>

              <DemoRow label='Character Counter'>
                <Input
                  label='Bio'
                  placeholder='Tell us about yourself'
                  maxLength={100}
                  style={{ width: '100%' }}
                />
              </DemoRow>

              <DemoRow label='Sizes'>
                <Input
                  size='sm'
                  placeholder='Small'
                  style={{ width: '100%' }}
                />
                <Input
                  size='md'
                  placeholder='Medium'
                  style={{ width: '100%', marginTop: 8 }}
                />
                <Input
                  size='lg'
                  placeholder='Large'
                  style={{ width: '100%', marginTop: 8 }}
                />
              </DemoRow>
            </div>
          </DemoSection>
        )}

        {/* Cards Section */}
        {activeTab === 'cards' && (
          <DemoSection title='Cards'>
            <DemoRow label='Basic Card'>
              <Card style={{ width: 300 }}>
                <Card.Header>Card Title</Card.Header>
                <Card.Body>
                  <p style={{ margin: 0, color: neutral.textSecondary }}>
                    This is a basic card with header, body, and footer sections.
                  </p>
                </Card.Body>
                <Card.Footer>
                  <Button size='sm'>Action</Button>
                </Card.Footer>
              </Card>
            </DemoRow>

            <DemoRow label='Category Borders'>
              <Card category='primary' style={{ width: 200, padding: 16 }}>
                <strong>Primary</strong>
              </Card>
              <Card category='success' style={{ width: 200, padding: 16 }}>
                <strong>Success</strong>
              </Card>
              <Card category='warning' style={{ width: 200, padding: 16 }}>
                <strong>Warning</strong>
              </Card>
              <Card category='danger' style={{ width: 200, padding: 16 }}>
                <strong>Danger</strong>
              </Card>
            </DemoRow>

            <DemoRow label='Elevation Levels'>
              <Card
                elevation='flat'
                style={{ width: 150, padding: 16, textAlign: 'center' }}
              >
                Flat
              </Card>
              <Card
                elevation='low'
                style={{ width: 150, padding: 16, textAlign: 'center' }}
              >
                Low
              </Card>
              <Card
                elevation='medium'
                style={{ width: 150, padding: 16, textAlign: 'center' }}
              >
                Medium
              </Card>
              <Card
                elevation='high'
                style={{ width: 150, padding: 16, textAlign: 'center' }}
              >
                High
              </Card>
            </DemoRow>
          </DemoSection>
        )}

        {/* Status Section */}
        {activeTab === 'status' && (
          <DemoSection title='Status Indicators'>
            <DemoRow label='Status Badges'>
              <StatusBadge status='present' />
              <StatusBadge status='absent' />
              <StatusBadge status='late' />
              <StatusBadge status='pending' />
              <StatusBadge status='host' />
              <StatusBadge status='verified' />
              <StatusBadge status='guest' />
            </DemoRow>

            <DemoRow label='Convenience Components'>
              <PresentBadge />
              <AbsentBadge />
              <LateBadge />
            </DemoRow>

            <DemoRow label='With Pulse Animation'>
              <StatusBadge status='present' pulse />
              <StatusBadge status='late' pulse />
            </DemoRow>

            <DemoRow label='Outlined Variant'>
              <StatusBadge status='present' outlined />
              <StatusBadge status='absent' outlined />
              <StatusBadge status='late' outlined />
            </DemoRow>

            <DemoRow label='Icon Only'>
              <StatusBadge status='present' iconOnly />
              <StatusBadge status='absent' iconOnly />
              <StatusBadge status='late' iconOnly />
              <StatusBadge status='pending' iconOnly />
            </DemoRow>

            <DemoRow label='Live Indicators'>
              <LiveIndicator isLive />
              <LiveIndicator isLive={false} />
              <LiveBadge />
              <RecordingBadge />
            </DemoRow>
          </DemoSection>
        )}

        {/* Data Display Section */}
        {activeTab === 'data' && (
          <DemoSection title='Data Display'>
            <DemoRow label='Stat Cards'>
              <DashboardGrid columns={4} style={{ width: '100%' }}>
                <StatCard
                  title='Total Students'
                  value={150}
                  icon='bi-people-fill'
                  variant='primary'
                />
                <StatCard
                  title='Present'
                  value={120}
                  icon='bi-check-circle-fill'
                  variant='success'
                  trend={{ value: 5, direction: 'up' }}
                />
                <StatCard
                  title='Absent'
                  value={15}
                  icon='bi-x-circle-fill'
                  variant='danger'
                  trend={{ value: 2, direction: 'down' }}
                />
                <StatCard
                  title='Late'
                  value={15}
                  icon='bi-clock-fill'
                  variant='warning'
                />
              </DashboardGrid>
            </DemoRow>

            <DemoRow label='Progress Bars'>
              <div style={{ width: '100%', maxWidth: 400 }}>
                <div style={{ marginBottom: 16 }}>
                  <ProgressBar value={75} showLabel />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <ProgressBar value={85} variant='success' showLabel />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <ProgressBar value={45} variant='warning' showLabel striped />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <ProgressBar value={25} variant='danger' showLabel />
                </div>
                <div>
                  <ProgressBar indeterminate />
                </div>
              </div>
            </DemoRow>

            <DemoRow label='Skeleton Loading'>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ width: 200 }}>
                  <Skeleton.Avatar withText />
                </div>
                <div style={{ width: 300 }}>
                  <Skeleton.Card hasImage={false} textLines={3} />
                </div>
                <div style={{ width: 150 }}>
                  <Skeleton.StatCard />
                </div>
              </div>
            </DemoRow>

            <DemoRow label='Tooltips'>
              <Tooltip content='This is a tooltip'>
                <Button variant='outline'>Hover me</Button>
              </Tooltip>
              <Tooltip content='Bottom tooltip' position='bottom'>
                <Button variant='outline'>Bottom</Button>
              </Tooltip>
              <Tooltip content='Light variant' variant='light'>
                <Button variant='outline'>Light</Button>
              </Tooltip>
              <InfoTooltip content='This is an info tooltip' />
            </DemoRow>
          </DemoSection>
        )}

        {/* Feedback Section */}
        {activeTab === 'feedback' && (
          <DemoSection title='Feedback & Alerts'>
            <DemoRow label='Alert Types'>
              <div style={{ width: '100%', maxWidth: 500 }}>
                <Alert type='info' style={{ marginBottom: 12 }}>
                  This is an informational message.
                </Alert>
                <SuccessAlert style={{ marginBottom: 12 }}>
                  Operation completed successfully!
                </SuccessAlert>
                <WarningAlert style={{ marginBottom: 12 }}>
                  Please review your input before proceeding.
                </WarningAlert>
                <Alert type='error'>An error occurred. Please try again.</Alert>
              </div>
            </DemoRow>

            <DemoRow label='Loading States'>
              <Button loading>Saving...</Button>
              <Input loading placeholder='Checking...' style={{ width: 200 }} />
              <StatCard loading style={{ width: 150 }} />
            </DemoRow>
          </DemoSection>
        )}

        {/* Navigation Section */}
        {activeTab === 'navigation' && (
          <DemoSection title='Navigation'>
            <DemoRow label='Breadcrumbs'>
              <Breadcrumbs
                items={[
                  { label: 'Home', href: '/' },
                  { label: 'Dashboard', href: '/dashboard' },
                  { label: 'Attendance', href: '/attendance' },
                  { label: 'Session Details', active: true }
                ]}
              />
            </DemoRow>

            <DemoRow label='Separator Styles'>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <Breadcrumbs
                  items={[{ label: 'Home' }, { label: 'Page' }]}
                  separator='chevron'
                  showHome={false}
                />
                <Breadcrumbs
                  items={[{ label: 'Home' }, { label: 'Page' }]}
                  separator='slash'
                  showHome={false}
                />
                <Breadcrumbs
                  items={[{ label: 'Home' }, { label: 'Page' }]}
                  separator='arrow'
                  showHome={false}
                />
              </div>
            </DemoRow>

            <DemoRow label='Sizes'>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              >
                <Breadcrumbs
                  items={[{ label: 'Small' }, { label: 'Breadcrumbs' }]}
                  size='sm'
                  showHome={false}
                />
                <Breadcrumbs
                  items={[{ label: 'Medium' }, { label: 'Breadcrumbs' }]}
                  size='md'
                  showHome={false}
                />
                <Breadcrumbs
                  items={[{ label: 'Large' }, { label: 'Breadcrumbs' }]}
                  size='lg'
                  showHome={false}
                />
              </div>
            </DemoRow>
          </DemoSection>
        )}

        {/* Color Palette */}
        <DemoSection title='Color Palette'>
          <DemoRow label='Status Colors'>
            <div
              style={{
                width: 100,
                height: 60,
                background: statusColors.present.bg,
                border: `2px solid ${statusColors.present.border}`,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: statusColors.present.text,
                fontWeight: 600
              }}
            >
              Present
            </div>
            <div
              style={{
                width: 100,
                height: 60,
                background: statusColors.absent.bg,
                border: `2px solid ${statusColors.absent.border}`,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: statusColors.absent.text,
                fontWeight: 600
              }}
            >
              Absent
            </div>
            <div
              style={{
                width: 100,
                height: 60,
                background: statusColors.late.bg,
                border: `2px solid ${statusColors.late.border}`,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: statusColors.late.text,
                fontWeight: 600
              }}
            >
              Late
            </div>
            <div
              style={{
                width: 100,
                height: 60,
                background: statusColors.pending.bg,
                border: `2px solid ${statusColors.pending.border}`,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: statusColors.pending.text,
                fontWeight: 600
              }}
            >
              Pending
            </div>
          </DemoRow>

          <DemoRow label='Brand Colors'>
            <div
              style={{
                width: 100,
                height: 60,
                background: brand.primary,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 600
              }}
            >
              Primary
            </div>
            <div
              style={{
                width: 100,
                height: 60,
                background: brand.secondary,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 600
              }}
            >
              Secondary
            </div>
          </DemoRow>

          <DemoRow label='Shadow Scale'>
            {['xs', 'sm', 'md', 'lg', 'xl'].map(size => (
              <div
                key={size}
                style={{
                  width: 80,
                  height: 80,
                  background: neutral.bgSurface,
                  borderRadius: 8,
                  boxShadow: shadows[size],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  color: neutral.textSecondary
                }}
              >
                {size}
              </div>
            ))}
          </DemoRow>
        </DemoSection>
      </main>
    </div>
  )
}

export default ComponentDemo
