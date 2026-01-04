/**
 * Skeleton Component (Phase 3)
 * Loading placeholder with shimmer animation for content loading states
 *
 * Usage:
 *   <Skeleton />                           // Default line
 *   <Skeleton variant="circle" size={40} /> // Avatar placeholder
 *   <Skeleton variant="rect" height={200} /> // Card placeholder
 *   <Skeleton.Text lines={3} />            // Multiple text lines
 */

import React from 'react'
import { neutral } from '../../utils/colors'

// Base skeleton styles
const baseStyles = {
  background: `linear-gradient(
    90deg,
    ${neutral.bgMuted} 0%,
    ${neutral.bgHover} 50%,
    ${neutral.bgMuted} 100%
  )`,
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease-in-out infinite',
  borderRadius: 4
}

/**
 * Main Skeleton Component
 * @param {Object} props
 * @param {'text'|'circle'|'rect'|'button'} props.variant - Shape variant
 * @param {number|string} props.width - Width (number for px, string for other units)
 * @param {number|string} props.height - Height (number for px, string for other units)
 * @param {number} props.size - Size for circle variant (width and height)
 * @param {number} props.borderRadius - Custom border radius
 * @param {boolean} props.animate - Enable shimmer animation (default: true)
 * @param {Object} props.style - Additional styles
 */
const Skeleton = ({
  variant = 'text',
  width,
  height,
  size,
  borderRadius,
  animate = true,
  style = {}
}) => {
  // Get dimensions based on variant
  const getDimensions = () => {
    switch (variant) {
      case 'circle': {
        const circleSize = size || 40
        return {
          width: circleSize,
          height: circleSize,
          borderRadius: '50%'
        }
      }
      case 'rect':
        return {
          width: width || '100%',
          height: height || 120,
          borderRadius: borderRadius || 8
        }
      case 'button':
        return {
          width: width || 100,
          height: height || 36,
          borderRadius: borderRadius || 8
        }
      case 'text':
      default:
        return {
          width: width || '100%',
          height: height || 16,
          borderRadius: borderRadius || 4
        }
    }
  }

  const dimensions = getDimensions()

  return (
    <div
      style={{
        ...baseStyles,
        ...dimensions,
        animation: animate ? baseStyles.animation : 'none',
        ...style
      }}
      aria-hidden='true'
      role='presentation'
    />
  )
}

/**
 * Skeleton Text - Multiple lines of text placeholders
 */
const SkeletonText = ({
  lines = 3,
  spacing = 8,
  lastLineWidth = '70%',
  animate = true,
  style = {}
}) => (
  <div
    style={{ display: 'flex', flexDirection: 'column', gap: spacing, ...style }}
  >
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton
        key={index}
        variant='text'
        width={index === lines - 1 ? lastLineWidth : '100%'}
        animate={animate}
      />
    ))}
  </div>
)

/**
 * Skeleton Avatar - Circle with optional text lines
 */
const SkeletonAvatar = ({
  size = 40,
  withText = false,
  textLines = 2,
  animate = true,
  style = {}
}) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...style }}>
    <Skeleton variant='circle' size={size} animate={animate} />
    {withText && (
      <div style={{ flex: 1 }}>
        <SkeletonText lines={textLines} animate={animate} />
      </div>
    )}
  </div>
)

/**
 * Skeleton Card - Full card placeholder
 */
const SkeletonCard = ({
  hasImage = true,
  imageHeight = 160,
  hasAvatar = false,
  textLines = 3,
  animate = true,
  style = {}
}) => (
  <div
    style={{
      background: neutral.bgSurface,
      borderRadius: 12,
      overflow: 'hidden',
      border: `1px solid ${neutral.borderLight}`,
      ...style
    }}
  >
    {hasImage && (
      <Skeleton
        variant='rect'
        height={imageHeight}
        borderRadius={0}
        animate={animate}
      />
    )}
    <div style={{ padding: 16 }}>
      {hasAvatar && (
        <div style={{ marginBottom: 12 }}>
          <SkeletonAvatar withText textLines={1} animate={animate} />
        </div>
      )}
      <SkeletonText lines={textLines} animate={animate} />
    </div>
  </div>
)

/**
 * Skeleton Table Row
 */
const SkeletonTableRow = ({ columns = 4, animate = true, style = {} }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 16,
      padding: '12px 16px',
      borderBottom: `1px solid ${neutral.borderLight}`,
      ...style
    }}
  >
    {Array.from({ length: columns }).map((_, index) => (
      <Skeleton
        key={index}
        variant='text'
        width={index === 0 ? '80%' : '60%'}
        animate={animate}
      />
    ))}
  </div>
)

/**
 * Skeleton Table - Multiple rows
 */
const SkeletonTable = ({
  rows = 5,
  columns = 4,
  hasHeader = true,
  animate = true,
  style = {}
}) => (
  <div
    style={{
      background: neutral.bgSurface,
      borderRadius: 8,
      border: `1px solid ${neutral.borderLight}`,
      overflow: 'hidden',
      ...style
    }}
  >
    {hasHeader && (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 16,
          padding: '14px 16px',
          background: neutral.bgMuted,
          borderBottom: `1px solid ${neutral.borderLight}`
        }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton
            key={index}
            variant='text'
            width='50%'
            height={12}
            animate={animate}
          />
        ))}
      </div>
    )}
    {Array.from({ length: rows }).map((_, index) => (
      <SkeletonTableRow key={index} columns={columns} animate={animate} />
    ))}
  </div>
)

/**
 * Skeleton Stat Card - Dashboard stat placeholder
 */
const SkeletonStatCard = ({ animate = true, style = {} }) => (
  <div
    style={{
      background: neutral.bgSurface,
      borderRadius: 12,
      padding: 24,
      border: `1px solid ${neutral.borderLight}`,
      ...style
    }}
  >
    <Skeleton variant='text' width={80} height={12} animate={animate} />
    <div style={{ marginTop: 12 }}>
      <Skeleton variant='text' width={100} height={32} animate={animate} />
    </div>
    <div style={{ marginTop: 8 }}>
      <Skeleton variant='text' width={60} height={14} animate={animate} />
    </div>
  </div>
)

// Add shimmer keyframes to document
if (typeof document !== 'undefined') {
  const styleId = 'skeleton-animations'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `
    document.head.appendChild(style)
  }
}

// Attach sub-components
Skeleton.Text = SkeletonText
Skeleton.Avatar = SkeletonAvatar
Skeleton.Card = SkeletonCard
Skeleton.Table = SkeletonTable
Skeleton.TableRow = SkeletonTableRow
Skeleton.StatCard = SkeletonStatCard

export {
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonTable,
  SkeletonTableRow,
  SkeletonStatCard
}

export default Skeleton
