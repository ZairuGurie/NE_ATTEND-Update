import React from 'react'
import { brand, neutral } from '../../utils/colors'

/**
 * Pagination Component
 * Provides pagination controls for tables
 */
const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
  startRecord,
  endRecord,
  totalRecords,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50]
}) => {
  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = []
    const maxPagesToShow = 5

    if (totalPages <= maxPagesToShow) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Show first, last, and pages around current
      const startPage = Math.max(1, currentPage - 1)
      const endPage = Math.min(totalPages, currentPage + 1)

      if (startPage > 1) {
        pages.push(1)
        if (startPage > 2) pages.push('...')
      }

      for (let i = startPage; i <= endPage; i++) {
        pages.push(i)
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) pages.push('...')
        pages.push(totalPages)
      }
    }

    return pages
  }

  const pageNumbers = getPageNumbers()

  return (
    <div style={styles.container}>
      <div style={styles.info}>
        Showing {startRecord} to {endRecord} of {totalRecords} records
      </div>

      <div style={styles.controls}>
        {/* Page Size Selector */}
        <div style={styles.pageSizeSelector}>
          <label htmlFor='pageSize' style={styles.label}>
            Rows per page:
          </label>
          <select
            id='pageSize'
            value={pageSize}
            onChange={e => onPageSizeChange(Number(e.target.value))}
            style={styles.select}
            aria-label='Select rows per page'
          >
            {pageSizeOptions.map(size => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        {/* Page Navigation */}
        <div style={styles.pageNav}>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            style={styles.navButton}
            aria-label='Previous page'
          >
            <i className='bi bi-chevron-left'></i>
          </button>

          {pageNumbers.map((pageNum, index) =>
            pageNum === '...' ? (
              <span key={`ellipsis-${index}`} style={styles.ellipsis}>
                ...
              </span>
            ) : (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                style={{
                  ...styles.pageButton,
                  ...(currentPage === pageNum ? styles.activePageButton : {})
                }}
                aria-label={`Go to page ${pageNum}`}
                aria-current={currentPage === pageNum ? 'page' : undefined}
              >
                {pageNum}
              </button>
            )
          )}

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            style={styles.navButton}
            aria-label='Next page'
          >
            <i className='bi bi-chevron-right'></i>
          </button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 0',
    borderTop: `1px solid ${neutral.borderLight}`,
    marginTop: 16,
    flexWrap: 'wrap',
    gap: 12
  },
  info: {
    fontSize: 14,
    color: neutral.textSecondary,
    fontWeight: 500
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    flexWrap: 'wrap'
  },
  pageSizeSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  label: {
    fontSize: 14,
    color: neutral.textSecondary,
    fontWeight: 500
  },
  select: {
    padding: '6px 12px',
    borderRadius: 6,
    border: `1px solid ${neutral.border}`,
    fontSize: 14,
    cursor: 'pointer',
    background: neutral.bgSurface
  },
  pageNav: {
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  navButton: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${neutral.border}`,
    borderRadius: 6,
    background: neutral.bgSurface,
    cursor: 'pointer',
    fontSize: 14,
    transition: 'all 0.2s',
    color: brand.secondary
  },
  pageButton: {
    minWidth: 32,
    height: 32,
    padding: '0 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${neutral.border}`,
    borderRadius: 6,
    background: neutral.bgSurface,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    transition: 'all 0.2s',
    color: brand.secondary
  },
  activePageButton: {
    background: brand.secondary,
    color: neutral.bgSurface,
    borderColor: brand.secondary
  },
  ellipsis: {
    padding: '0 4px',
    color: neutral.textMuted,
    fontSize: 14
  }
}

export default Pagination
