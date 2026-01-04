/**
 * Animated Components (Phase 5)
 * Reusable animation wrapper components
 *
 * Usage:
 *   <FadeIn>Content</FadeIn>
 *   <SlideUp delay={100}>Content</SlideUp>
 *   <StaggeredList items={items} renderItem={(item) => <div>{item}</div>} />
 */

import React, { useState, useEffect, useRef } from 'react'

// ============================================================================
// FadeIn Component
// ============================================================================

/**
 * Fade in animation wrapper
 */
export const FadeIn = ({
  children,
  duration = 300,
  delay = 0,
  triggerOnce = true,
  style = {}
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          if (triggerOnce) {
            observer.disconnect()
          }
        } else if (!triggerOnce) {
          setIsVisible(false)
        }
      },
      { threshold: 0.1 }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [triggerOnce])

  return (
    <div
      ref={ref}
      style={{
        opacity: isVisible ? 1 : 0,
        transition: `opacity ${duration}ms ease-out ${delay}ms`,
        ...style
      }}
    >
      {children}
    </div>
  )
}

// ============================================================================
// SlideUp Component
// ============================================================================

/**
 * Slide up animation wrapper
 */
export const SlideUp = ({
  children,
  duration = 400,
  delay = 0,
  distance = 20,
  triggerOnce = true,
  style = {}
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          if (triggerOnce) {
            observer.disconnect()
          }
        } else if (!triggerOnce) {
          setIsVisible(false)
        }
      },
      { threshold: 0.1 }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [triggerOnce])

  return (
    <div
      ref={ref}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : `translateY(${distance}px)`,
        transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms`,
        ...style
      }}
    >
      {children}
    </div>
  )
}

// ============================================================================
// ScaleIn Component
// ============================================================================

/**
 * Scale in animation wrapper
 */
export const ScaleIn = ({
  children,
  duration = 300,
  delay = 0,
  startScale = 0.9,
  triggerOnce = true,
  style = {}
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          if (triggerOnce) {
            observer.disconnect()
          }
        } else if (!triggerOnce) {
          setIsVisible(false)
        }
      },
      { threshold: 0.1 }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [triggerOnce])

  return (
    <div
      ref={ref}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'scale(1)' : `scale(${startScale})`,
        transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms`,
        ...style
      }}
    >
      {children}
    </div>
  )
}

// ============================================================================
// StaggeredList Component
// ============================================================================

/**
 * Staggered animation for lists
 */
export const StaggeredList = ({
  items,
  renderItem,
  baseDelay = 50,
  maxDelay = 500,
  duration = 400,
  animation = 'slideUp', // 'fadeIn' | 'slideUp' | 'scaleIn'
  keyExtractor,
  style = {},
  itemStyle = {}
}) => {
  const [visibleItems, setVisibleItems] = useState(new Set())
  const ref = useRef(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Stagger the appearance of items
          items.forEach((_, index) => {
            const delay = Math.min(index * baseDelay, maxDelay)
            setTimeout(() => {
              setVisibleItems(prev => new Set([...prev, index]))
            }, delay)
          })
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [items, baseDelay, maxDelay])

  const getAnimationStyle = index => {
    const isVisible = visibleItems.has(index)
    const delay = Math.min(index * baseDelay, maxDelay)

    const baseStyle = {
      transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
      transitionDelay: `${delay}ms`
    }

    switch (animation) {
      case 'fadeIn':
        return {
          ...baseStyle,
          opacity: isVisible ? 1 : 0
        }
      case 'scaleIn':
        return {
          ...baseStyle,
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'scale(1)' : 'scale(0.9)'
        }
      case 'slideUp':
      default:
        return {
          ...baseStyle,
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateY(0)' : 'translateY(20px)'
        }
    }
  }

  return (
    <div ref={ref} style={style}>
      {items.map((item, index) => (
        <div
          key={keyExtractor ? keyExtractor(item, index) : index}
          style={{ ...getAnimationStyle(index), ...itemStyle }}
        >
          {renderItem(item, index)}
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// AnimatedCounter Component
// ============================================================================

/**
 * Animated number counter
 */
export const AnimatedCounter = ({
  value,
  duration = 1000,
  formatValue,
  style = {}
}) => {
  const [displayValue, setDisplayValue] = useState(0)
  const previousValue = useRef(0)

  useEffect(() => {
    const startValue = previousValue.current
    const endValue = typeof value === 'number' ? value : 0
    const startTime = performance.now()

    const animate = currentTime => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease-out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3)
      const current = startValue + (endValue - startValue) * easeOut

      setDisplayValue(Math.round(current))

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        previousValue.current = endValue
      }
    }

    requestAnimationFrame(animate)
  }, [value, duration])

  const formatted = formatValue
    ? formatValue(displayValue)
    : displayValue.toLocaleString()

  return <span style={style}>{formatted}</span>
}

// ============================================================================
// Pulse Component
// ============================================================================

/**
 * Pulsing animation wrapper
 */
export const Pulse = ({
  children,
  duration = 2000,
  scale = 1.05,
  enabled = true,
  style = {}
}) => (
  <div
    style={{
      animation: enabled ? `pulse ${duration}ms ease-in-out infinite` : 'none',
      ...style
    }}
  >
    {children}
    <style>{`
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(${scale}); opacity: 0.85; }
      }
    `}</style>
  </div>
)

// ============================================================================
// Shake Component
// ============================================================================

/**
 * Shake animation (for errors)
 */
export const Shake = ({
  children,
  trigger,
  duration = 500,
  intensity = 8,
  style = {}
}) => {
  const [shaking, setShaking] = useState(false)

  useEffect(() => {
    if (trigger) {
      setShaking(true)
      const timer = setTimeout(() => setShaking(false), duration)
      return () => clearTimeout(timer)
    }
  }, [trigger, duration])

  return (
    <div
      style={{
        animation: shaking ? `shake ${duration}ms ease-in-out` : 'none',
        ...style
      }}
    >
      {children}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-${intensity}px); }
          40%, 80% { transform: translateX(${intensity}px); }
        }
      `}</style>
    </div>
  )
}

// ============================================================================
// Ripple Effect Component
// ============================================================================

/**
 * Material-style ripple effect
 */
export const Ripple = ({
  children,
  color = 'rgba(255, 255, 255, 0.3)',
  duration = 600,
  style = {}
}) => {
  const [ripples, setRipples] = useState([])
  const containerRef = useRef(null)
  const timeoutRefs = useRef([])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(clearTimeout)
    }
  }, [])

  const handleClick = e => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const size = Math.max(rect.width, rect.height) * 2

    const newRipple = {
      x,
      y,
      size,
      id: Date.now()
    }

    setRipples(prev => [...prev, newRipple])

    const timeoutId = setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== newRipple.id))
      // Remove this timeout from refs
      timeoutRefs.current = timeoutRefs.current.filter(id => id !== timeoutId)
    }, duration)

    // Track timeout for cleanup
    timeoutRefs.current.push(timeoutId)
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...style
      }}
    >
      {children}
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          style={{
            position: 'absolute',
            left: ripple.x - ripple.size / 2,
            top: ripple.y - ripple.size / 2,
            width: ripple.size,
            height: ripple.size,
            borderRadius: '50%',
            background: color,
            transform: 'scale(0)',
            animation: `ripple ${duration}ms ease-out`,
            pointerEvents: 'none'
          }}
        />
      ))}
      <style>{`
        @keyframes ripple {
          to { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ============================================================================
// TypeWriter Component
// ============================================================================

/**
 * Typewriter text effect
 */
export const TypeWriter = ({
  text,
  speed = 50,
  delay = 0,
  cursor = true,
  onComplete,
  style = {}
}) => {
  const [displayText, setDisplayText] = useState('')
  const [showCursor, setShowCursor] = useState(true)

  useEffect(() => {
    let index = 0
    let intervalId = null

    const timer = setTimeout(() => {
      intervalId = setInterval(() => {
        if (index < text.length) {
          setDisplayText(text.slice(0, index + 1))
          index++
        } else {
          clearInterval(intervalId)
          if (onComplete) onComplete()
        }
      }, speed)
    }, delay)

    // Cleanup both timeout and interval
    return () => {
      clearTimeout(timer)
      if (intervalId) clearInterval(intervalId)
    }
  }, [text, speed, delay, onComplete])

  // Blinking cursor
  useEffect(() => {
    if (!cursor) return
    const interval = setInterval(() => {
      setShowCursor(prev => !prev)
    }, 500)
    return () => clearInterval(interval)
  }, [cursor])

  return (
    <span style={style}>
      {displayText}
      {cursor && <span style={{ opacity: showCursor ? 1 : 0 }}>|</span>}
    </span>
  )
}

// Export all
export default {
  FadeIn,
  SlideUp,
  ScaleIn,
  StaggeredList,
  AnimatedCounter,
  Pulse,
  Shake,
  Ripple,
  TypeWriter
}
