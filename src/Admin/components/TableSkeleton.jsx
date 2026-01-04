import React from 'react'
import { neutral } from '../../utils/colors'
import Skeleton from 'react-loading-skeleton'
import 'react-loading-skeleton/dist/skeleton.css'

/**
 * Table Skeleton Loading Component
 * Displays skeleton placeholders while table data is loading
 */
const TableSkeleton = ({ rows = 5, columns = 8 }) => {
  return (
    <div style={styles.container}>
      {/* Table Header */}
      <div style={styles.headerRow}>
        {Array.from({ length: columns }).map((_, index) => (
          <div key={`header-${index}`} style={styles.headerCell}>
            <Skeleton height={20} />
          </div>
        ))}
      </div>

      {/* Table Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`row-${rowIndex}`} style={styles.row}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div key={`cell-${rowIndex}-${colIndex}`} style={styles.cell}>
              {colIndex === 1 ? (
                // Avatar column
                <Skeleton circle width={40} height={40} />
              ) : (
                <Skeleton height={16} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const styles = {
  container: {
    width: '100%'
  },
  headerRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
    gap: 12,
    padding: '12px 20px',
    background: neutral.bgMuted,
    borderRadius: '8px 8px 0 0'
  },
  headerCell: {
    minWidth: 80
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
    gap: 12,
    padding: '12px 20px',
    borderBottom: '1px solid #eee'
  },
  cell: {
    minWidth: 80,
    display: 'flex',
    alignItems: 'center'
  }
}

export default TableSkeleton
