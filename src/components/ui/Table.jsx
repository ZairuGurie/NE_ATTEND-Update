/**
 * Table Component (Phase 3 Enhanced)
 * Reusable table with sticky header, improved hover, and visual hierarchy
 *
 * Usage:
 *   <Table
 *     columns={[
 *       { key: 'name', label: 'Name' },
 *       { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> }
 *     ]}
 *     data={rows}
 *     striped
 *     hoverable
 *     stickyHeader
 *   />
 */

import React from 'react'
import {
  brand,
  neutral,
  status as statusColors,
  interactive
} from '../../utils/colors'
import { shadows } from '../../utils/shadows'

const tableStyles = {
  container: {
    width: '100%',
    borderRadius: 12,
    border: `1px solid ${neutral.border}`,
    background: neutral.bgSurface,
    boxShadow: shadows.sm,
    overflow: 'hidden'
  },
  scrollContainer: {
    overflowX: 'auto',
    overflowY: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14
  },
  th: {
    padding: '14px 16px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: 13,
    color: brand.secondary,
    background: statusColors.host.bg,
    borderBottom: `2px solid ${neutral.border}`,
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    position: 'relative'
  },
  thSticky: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
  },
  td: {
    padding: '14px 16px',
    color: neutral.textPrimary,
    borderBottom: `1px solid ${neutral.borderLight}`,
    verticalAlign: 'middle',
    transition: 'background 0.15s ease'
  },
  trHover: {
    background: `rgba(59, 130, 246, 0.06)`
  },
  trStriped: {
    background: neutral.bgMuted
  },
  trSelected: {
    background: `rgba(59, 130, 246, 0.1)`,
    borderLeft: `3px solid ${interactive.primary}`
  },
  empty: {
    padding: '48px 24px',
    textAlign: 'center',
    color: neutral.textMuted
  }
}

/**
 * Table Component
 * @param {Object} props
 * @param {Array} props.columns - Column definitions
 * @param {Array} props.data - Table data
 * @param {boolean} props.striped - Alternate row colors
 * @param {boolean} props.hoverable - Enable row hover effect
 * @param {boolean} props.compact - Reduce padding
 * @param {boolean} props.stickyHeader - Sticky header on scroll
 * @param {number} props.maxHeight - Max height for scroll container
 * @param {string} props.emptyMessage - Message when no data
 * @param {string} props.emptyIcon - Icon for empty state
 * @param {Function} props.onRowClick - Row click handler
 * @param {string} props.rowKey - Unique key field for rows
 * @param {Array} props.selectedRows - Array of selected row keys
 * @param {boolean} props.loading - Show loading state
 */
const Table = ({
  columns = [],
  data = [],
  striped = false,
  hoverable = true,
  compact = false,
  stickyHeader = false,
  maxHeight,
  emptyMessage = 'No data available',
  emptyIcon = 'bi-inbox',
  onRowClick,
  rowKey = '_id',
  selectedRows = [],
  loading = false,
  className = '',
  style = {}
}) => {
  const [hoveredRow, setHoveredRow] = React.useState(null)

  const cellPadding = compact ? '10px 12px' : '14px 16px'

  // Check if a row is selected
  const isRowSelected = (row, idx) => {
    const key = row[rowKey] || idx
    return selectedRows.includes(key)
  }

  // Loading state
  if (loading) {
    return (
      <div style={{ ...tableStyles.container, ...style }} className={className}>
        <div style={tableStyles.scrollContainer}>
          <table style={tableStyles.table}>
            <thead>
              <tr>
                {columns.map((col, idx) => (
                  <th
                    key={col.key || idx}
                    style={{
                      ...tableStyles.th,
                      padding: cellPadding
                    }}
                  >
                    <div
                      style={{
                        width: '60%',
                        height: 12,
                        background: neutral.bgHover,
                        borderRadius: 4,
                        animation: 'shimmer 1.5s ease-in-out infinite'
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, rowIdx) => (
                <tr key={rowIdx}>
                  {columns.map((col, colIdx) => (
                    <td
                      key={col.key || colIdx}
                      style={{
                        ...tableStyles.td,
                        padding: cellPadding
                      }}
                    >
                      <div
                        style={{
                          width: colIdx === 0 ? '80%' : '50%',
                          height: 16,
                          background: `linear-gradient(90deg, ${neutral.bgMuted} 0%, ${neutral.bgHover} 50%, ${neutral.bgMuted} 100%)`,
                          backgroundSize: '200% 100%',
                          borderRadius: 4,
                          animation: 'shimmer 1.5s ease-in-out infinite'
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Empty state
  if (data.length === 0) {
    return (
      <div style={{ ...tableStyles.container, ...style }} className={className}>
        <div style={tableStyles.empty}>
          <i
            className={emptyIcon}
            style={{
              fontSize: 48,
              marginBottom: 16,
              display: 'block',
              opacity: 0.5,
              color: neutral.textMuted
            }}
          />
          <p style={{ margin: 0, fontSize: 16, color: neutral.textSecondary }}>
            {emptyMessage}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...tableStyles.container, ...style }} className={className}>
      <div
        style={{
          ...tableStyles.scrollContainer,
          maxHeight: maxHeight || 'none'
        }}
      >
        <table style={tableStyles.table}>
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={col.key || idx}
                  style={{
                    ...tableStyles.th,
                    ...(stickyHeader ? tableStyles.thSticky : {}),
                    padding: cellPadding,
                    width: col.width,
                    minWidth: col.minWidth,
                    textAlign: col.align || 'left'
                  }}
                >
                  <span
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    {col.icon && (
                      <i className={col.icon} style={{ fontSize: 14 }} />
                    )}
                    {col.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIdx) => {
              const key = row[rowKey] || rowIdx
              const isHovered = hoverable && hoveredRow === key
              const isStriped = striped && rowIdx % 2 === 1
              const isSelected = isRowSelected(row, rowIdx)

              return (
                <tr
                  key={key}
                  onClick={() => onRowClick?.(row, rowIdx)}
                  onMouseEnter={() => hoverable && setHoveredRow(key)}
                  onMouseLeave={() => hoverable && setHoveredRow(null)}
                  style={{
                    cursor: onRowClick ? 'pointer' : 'default',
                    background: isSelected
                      ? tableStyles.trSelected.background
                      : isHovered
                      ? tableStyles.trHover.background
                      : isStriped
                      ? tableStyles.trStriped.background
                      : 'transparent',
                    borderLeft: isSelected
                      ? tableStyles.trSelected.borderLeft
                      : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {columns.map((col, colIdx) => {
                    const value = row[col.key]
                    const content = col.render
                      ? col.render(value, row, rowIdx)
                      : value ?? '-'

                    return (
                      <td
                        key={col.key || colIdx}
                        style={{
                          ...tableStyles.td,
                          padding: cellPadding,
                          textAlign: col.align || 'left',
                          fontWeight: col.bold ? 600 : 'normal',
                          maxWidth: col.maxWidth,
                          overflow: col.truncate ? 'hidden' : 'visible',
                          textOverflow: col.truncate ? 'ellipsis' : 'clip',
                          whiteSpace: col.truncate ? 'nowrap' : 'normal'
                        }}
                        title={
                          col.truncate && typeof content === 'string'
                            ? content
                            : undefined
                        }
                      >
                        {content}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Column renderers moved to ./tableRenderers.jsx for Fast Refresh compatibility
// Import from: import { columnRenderers } from './tableRenderers'

export default Table
