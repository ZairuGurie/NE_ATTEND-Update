/**
 * UI Components Index (Phase 4 Enhanced)
 * Export all reusable UI components from a single entry point
 *
 * Usage:
 * import { Button, Card, Input, PageHeader, Breadcrumbs, StatCard } from '../components/ui'
 */

// Core Components
export { default as LoadingSpinner } from './LoadingSpinner'
export { default as EmptyState } from './EmptyState'
export { default as Button } from './Button'
export { default as Input } from './Input'
export { default as Card } from './Card'
export { default as Modal } from './Modal'
export { default as Select } from './Select'
export { default as Table } from './Table'

// Phase 2 Components
export {
  default as LiveIndicator,
  LiveBadge,
  OfflineBadge,
  RecordingBadge,
  ConnectingBadge,
  SyncingBadge
} from './LiveIndicator'

export {
  default as ProgressBar,
  SuccessProgress,
  WarningProgress,
  DangerProgress
} from './ProgressBar'

// Phase 3 Components
export {
  default as Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonTable,
  SkeletonTableRow,
  SkeletonStatCard
} from './Skeleton'

export {
  default as StatCard,
  PrimaryStatCard,
  SuccessStatCard,
  WarningStatCard,
  DangerStatCard,
  TrendIndicator,
  AnimatedNumber
} from './StatCard'

export { default as Tooltip, InfoTooltip, HelpTooltip } from './Tooltip'

// Phase 4 Components - Page Integration
export { default as Breadcrumbs, BreadcrumbItem } from './Breadcrumbs'

export {
  default as PageHeader,
  PageHeaderStats,
  PageHeaderStat,
  PageHeaderTabs
} from './PageHeader'

export {
  default as DashboardLayout,
  DashboardSection,
  DashboardGrid,
  DashboardRow,
  DashboardColumn
} from './DashboardLayout'

export { default as MobileNav } from './MobileNav'

export { default as ThemeToggle, ThemeSwitch } from './ThemeToggle'

// Phase 5 - Animation Components
export {
  FadeIn,
  SlideUp,
  ScaleIn,
  StaggeredList,
  AnimatedCounter,
  Pulse,
  Shake,
  Ripple,
  TypeWriter
} from './AnimatedComponents'

// Alert Components
export {
  default as Alert,
  SuccessAlert,
  ErrorAlert,
  WarningAlert,
  InfoAlert
} from './Alert'

// Status Badge Components
export {
  default as StatusBadge,
  PresentBadge,
  AbsentBadge,
  LateBadge,
  PendingBadge,
  HostBadge,
  VerifiedBadge,
  GuestBadge
} from './StatusBadge'

// Table Renderers (separate file for Fast Refresh compatibility)
export { columnRenderers } from './tableRenderers'

// Policy Components
export {
  default as PolicyInfoPanel,
  DFWarningBadge,
  AttendanceSummaryCard
} from './PolicyInfoPanel'
