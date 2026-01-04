/**
 * Export utilities for CSV and PDF generation
 */

/**
 * Convert array of objects to CSV string
 * @param {Array} data - Array of objects to convert
 * @param {Array} columns - Column configuration [{key, label}]
 * @returns {String} CSV string
 */
export const convertToCSV = (data, columns) => {
  if (!data || data.length === 0) return '';

  // Create header row
  const headers = columns.map((col) => col.label).join(',');

  // Create data rows
  const rows = data.map((item) => {
    return columns
      .map((col) => {
        let value = getNestedValue(item, col.key);

        // Handle null/undefined
        if (value == null) value = '';

        // Handle objects/arrays
        if (typeof value === 'object') {
          value = JSON.stringify(value);
        }

        // Escape quotes and wrap in quotes if contains comma
        value = String(value).replace(/"/g, '""');
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = `"${value}"`;
        }

        return value;
      })
      .join(',');
  });

  return [headers, ...rows].join('\n');
};

/**
 * Download CSV file
 * @param {String} csvContent - CSV content string
 * @param {String} filename - Filename for download
 */
export const downloadCSV = (csvContent, filename = 'export.csv') => {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

/**
 * Export users to CSV
 * @param {Array} users - Array of user objects
 * @param {String} userType - 'instructor' or 'student'
 * @param {String} filename - Optional custom filename
 */
export const exportUsersToCSV = (users, userType = 'users', filename = null) => {
  const baseColumns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'department', label: 'Department' },
    { key: 'schoolYear', label: 'School Year' },
    { key: 'semester', label: 'Semester' },
    { key: 'active', label: 'Status' },
  ];

  // Add type-specific columns
  const columns =
    userType === 'student'
      ? [...baseColumns, { key: 'section', label: 'Section' }, { key: 'yearLevel', label: 'Year Level' }]
      : baseColumns;

  const csvContent = convertToCSV(users, columns);
  const defaultFilename = `${userType}_export_${new Date().toISOString().split('T')[0]}.csv`;

  downloadCSV(csvContent, filename || defaultFilename);
};

/**
 * Generate simple PDF report (basic implementation)
 * For production, consider using libraries like jsPDF or pdfmake
 * @param {Object} reportData - Report data
 * @param {String} filename - PDF filename
 */
export const exportToPDF = (reportData, filename = 'report.pdf') => {
  // This is a simplified version. In production, use jsPDF or similar
  // For now, we'll create an HTML page and trigger print
  const printWindow = window.open('', '_blank');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${filename}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #23225c;
            color: white;
          }
          h1 {
            color: #23225c;
          }
          .metadata {
            margin-bottom: 20px;
            font-size: 14px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <h1>Admin Dashboard Report</h1>
        <div class="metadata">
          <p>Generated: ${new Date().toLocaleString()}</p>
          ${reportData.dateRange ? `<p>Date Range: ${reportData.dateRange}</p>` : ''}
        </div>
        ${formatReportContent(reportData)}
        <script>
          window.onload = function() {
            window.print();
            window.onafterprint = function() {
              window.close();
            };
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
};

/**
 * Format report content for PDF
 * @param {Object} reportData - Report data object
 * @returns {String} HTML string
 */
const formatReportContent = (reportData) => {
  if (reportData.users && Array.isArray(reportData.users)) {
    return `
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Email</th>
            <th>Department</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${reportData.users
            .map(
              (user) => `
            <tr>
              <td>${user.id}</td>
              <td>${user.name}</td>
              <td>${user.email}</td>
              <td>${user.department}</td>
              <td>${user.active}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  return '<p>No data available</p>';
};

/**
 * Helper function to get nested object values
 * @param {Object} obj - Object to extract value from
 * @param {String} path - Dot-notated path
 * @returns {*} Value at path
 */
const getNestedValue = (obj, path) => {
  return path.split('.').reduce((value, key) => value?.[key], obj);
};

/**
 * Export analytics data to CSV
 * @param {Array} analyticsData - Analytics data array
 * @param {String} filename - Optional filename
 */
export const exportAnalyticsToCSV = (analyticsData, filename = null) => {
  const columns = [
    { key: 'date', label: 'Date' },
    { key: 'attendance', label: 'Attendance %' },
    { key: 'late', label: 'Late Count' },
    { key: 'absent', label: 'Absent Count' },
  ];

  const csvContent = convertToCSV(analyticsData, columns);
  const defaultFilename = `analytics_export_${new Date().toISOString().split('T')[0]}.csv`;

  downloadCSV(csvContent, filename || defaultFilename);
};

