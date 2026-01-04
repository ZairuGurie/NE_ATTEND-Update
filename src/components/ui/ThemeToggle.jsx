/**
 * ThemeToggle Component (Phase 5)
 * Toggle button for switching between light and dark mode
 *
 * Usage:
 *   <ThemeToggle />
 *   <ThemeToggle showLabel />
 *   <ThemeToggle size="lg" />
 */

import React from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { neutral } from '../../utils/colors'
import { shadows } from '../../utils/shadows'

/**
 * ThemeToggle Component
 * @param {Object} props
 * @param {boolean} props.showLabel - Show "Light"/"Dark" label
 * @param {'sm'|'md'|'lg'} props.size - Button size
 * @param {Object} props.style - Additional styles
 */
const ThemeToggle = ({ showLabel = false, size = 'md', style = {} }) => {
  const { isDark, toggleTheme } = useTheme()

  const sizes = {
    sm: { button: 32, icon: 16, padding: 8 },
    md: { button: 40, icon: 20, padding: 10 },
    lg: { button: 48, icon: 24, padding: 12 }
  }

  const sizeConfig = sizes[size] || sizes.md

  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: showLabel
          ? `${sizeConfig.padding}px ${sizeConfig.padding + 8}px`
          : sizeConfig.padding,
        height: sizeConfig.button,
        minWidth: sizeConfig.button,
        borderRadius: 999,
        border: `1px solid var(--theme-border, ${neutral.border})`,
        background: `var(--theme-bg-surface, ${neutral.bgSurface})`,
        color: `var(--theme-text-primary, ${neutral.textPrimary})`,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: shadows.sm,
        ...style
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = `var(--theme-bg-hover, ${neutral.bgHover})`
        e.currentTarget.style.transform = 'scale(1.05)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = `var(--theme-bg-surface, ${neutral.bgSurface})`
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {/* Sun/Moon Icon with rotation animation */}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: sizeConfig.icon,
          height: sizeConfig.icon,
          transition: 'transform 0.3s ease'
        }}
      >
        {isDark ? (
          <i
            className='bi-moon-stars-fill'
            style={{
              fontSize: sizeConfig.icon,
              color: '#fbbf24',
              animation: 'fadeIn 0.3s ease'
            }}
          />
        ) : (
          <i
            className='bi-sun-fill'
            style={{
              fontSize: sizeConfig.icon,
              color: '#f59e0b',
              animation: 'fadeIn 0.3s ease'
            }}
          />
        )}
      </span>

      {/* Label */}
      {showLabel && (
        <span
          style={{
            fontSize: size === 'sm' ? 12 : size === 'lg' ? 16 : 14,
            fontWeight: 500
          }}
        >
          {isDark ? 'Dark' : 'Light'}
        </span>
      )}
    </button>
  )
}

/**
 * ThemeSwitch - Alternative switch-style toggle
 */
export const ThemeSwitch = ({ style = {} }) => {
  const { isDark, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      role='switch'
      aria-checked={isDark}
      aria-label='Toggle dark mode'
      style={{
        position: 'relative',
        width: 56,
        height: 28,
        borderRadius: 999,
        border: 'none',
        background: isDark
          ? `linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)`
          : `linear-gradient(135deg, #93c5fd 0%, #60a5fa 100%)`,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        padding: 0,
        ...style
      }}
    >
      {/* Track decorations */}
      {isDark ? (
        // Stars in dark mode
        <>
          <span
            style={{
              position: 'absolute',
              top: 6,
              left: 8,
              width: 3,
              height: 3,
              borderRadius: '50%',
              background: '#fff',
              opacity: 0.8
            }}
          />
          <span
            style={{
              position: 'absolute',
              top: 12,
              left: 14,
              width: 2,
              height: 2,
              borderRadius: '50%',
              background: '#fff',
              opacity: 0.6
            }}
          />
          <span
            style={{
              position: 'absolute',
              bottom: 8,
              left: 10,
              width: 2,
              height: 2,
              borderRadius: '50%',
              background: '#fff',
              opacity: 0.5
            }}
          />
        </>
      ) : (
        // Clouds in light mode
        <span
          style={{
            position: 'absolute',
            top: 8,
            left: 10,
            width: 12,
            height: 8,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.5)'
          }}
        />
      )}

      {/* Thumb with icon */}
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: isDark ? 30 : 2,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: isDark ? '#1e293b' : '#fef3c7',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'left 0.3s ease'
        }}
      >
        {isDark ? (
          <i
            className='bi-moon-fill'
            style={{ fontSize: 12, color: '#fbbf24' }}
          />
        ) : (
          <i
            className='bi-sun-fill'
            style={{ fontSize: 12, color: '#f59e0b' }}
          />
        )}
      </span>
    </button>
  )
}

export default ThemeToggle
