import React from 'react'
import { brand, status as statusColors, interactive } from '../../utils/colors'

/**
 * Bulk Actions Component
 * Displays bulk action buttons when users are selected
 */
const BulkActions = ({
  selectedCount,
  onActivate,
  onDeactivate,
  onDelete,
  onClearSelection
}) => {
  if (selectedCount === 0) return null

  return (
    <div style={styles.container}>
      <div style={styles.info}>
        <i className='bi bi-check-circle-fill' style={styles.icon}></i>
        <span style={styles.count}>
          {selectedCount} {selectedCount === 1 ? 'user' : 'users'} selected
        </span>
        <button
          onClick={onClearSelection}
          style={styles.clearButton}
          aria-label='Clear selection'
        >
          <i className='bi bi-x'></i>
        </button>
      </div>

      <div style={styles.actions}>
        <button
          onClick={onActivate}
          style={{ ...styles.actionButton, ...styles.activateButton }}
          aria-label='Activate selected users'
        >
          <i className='bi bi-check-circle' style={{ marginRight: 6 }}></i>
          Activate
        </button>

        <button
          onClick={onDeactivate}
          style={{ ...styles.actionButton, ...styles.deactivateButton }}
          aria-label='Deactivate selected users'
        >
          <i className='bi bi-pause-circle' style={{ marginRight: 6 }}></i>
          Deactivate
        </button>

        <button
          onClick={onDelete}
          style={{ ...styles.actionButton, ...styles.deleteButton }}
          aria-label='Delete selected users'
        >
          <i className='bi bi-trash' style={{ marginRight: 6 }}></i>
          Delete
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: statusColors.pending.bg,
    padding: '12px 20px',
    borderRadius: 8,
    marginBottom: 16,
    border: `1px solid ${interactive.primary}`,
    animation: 'slideDown 0.3s ease-out'
  },
  info: {
    display: 'flex',
    alignItems: 'center',
    gap: 12
  },
  icon: {
    color: interactive.primary,
    fontSize: 20
  },
  count: {
    fontSize: 15,
    fontWeight: 600,
    color: brand.secondary
  },
  clearButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 4,
    fontSize: 18,
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.2s'
  },
  actions: {
    display: 'flex',
    gap: 8
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    color: '#fff'
  },
  activateButton: {
    background: statusColors.present.border
  },
  deactivateButton: {
    background: statusColors.late.border,
    color: '#333'
  },
  deleteButton: {
    background: statusColors.absent.border
  }
}

export default BulkActions
