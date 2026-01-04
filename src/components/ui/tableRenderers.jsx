/**
 * Table Column Renderers
 * Pre-built column renderers for the Table component
 * Separated from Table.jsx to fix React Fast Refresh warning
 */

import React from 'react'
import { status as statusColors } from '../../utils/colors'

// Pre-built column renderers
export const columnRenderers = {
  // Status badge renderer
  status: value => {
    const colors = {
      Present: { bg: statusColors.present.bg, text: statusColors.present.text },
      Absent: { bg: statusColors.absent.bg, text: statusColors.absent.text },
      Late: { bg: statusColors.late.bg, text: statusColors.late.text },
      Pending: { bg: statusColors.pending.bg, text: statusColors.pending.text }
    }
    const style = colors[value] || colors.Pending
    return (
      <span
        style={{
          padding: '4px 10px',
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          background: style.bg,
          color: style.text
        }}
      >
        {value}
      </span>
    )
  },

  // Date renderer
  date: value => {
    if (!value) return '-'
    const date = new Date(value)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  },

  // Time renderer
  time: value => {
    if (!value) return '-'
    const date = new Date(value)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })
  },

  // Duration renderer (seconds to HH:MM:SS)
  duration: seconds => {
    if (!seconds && seconds !== 0) return '-'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    return `${m}:${String(s).padStart(2, '0')}`
  },

  // Boolean renderer
  boolean: value => (
    <i
      className={value ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}
      style={{
        color: value ? statusColors.present.border : statusColors.absent.border,
        fontSize: 16
      }}
    />
  ),

  // Avatar renderer
  avatar: (src, row) => {
    const name = row?.name || row?.firstName || 'User'
    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      name
    )}&background=23225c&color=fff&size=32`
    return (
      <img
        src={src || fallback}
        alt={name}
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          objectFit: 'cover'
        }}
      />
    )
  }
}
