import { toast } from 'react-toastify';

/**
 * Toast notification utilities
 * Provides consistent toast notifications across the app
 */

const defaultOptions = {
  position: 'top-right',
  autoClose: 3000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

export const showSuccess = (message, options = {}) => {
  toast.success(message, { ...defaultOptions, ...options });
};

export const showError = (message, options = {}) => {
  toast.error(message, { ...defaultOptions, ...options });
};

export const showWarning = (message, options = {}) => {
  toast.warning(message, { ...defaultOptions, ...options });
};

export const showInfo = (message, options = {}) => {
  toast.info(message, { ...defaultOptions, ...options });
};

// Specific toast messages for common actions
export const toastMessages = {
  userActivated: (name) => `${name} has been activated successfully`,
  userDeactivated: (name) => `${name} has been deactivated successfully`,
  userDeleted: (name) => `${name} has been deleted`,
  usersActivated: (count) => `${count} users have been activated`,
  usersDeactivated: (count) => `${count} users have been deactivated`,
  usersDeleted: (count) => `${count} users have been deleted`,
  exportSuccess: (format) => `Data exported successfully as ${format.toUpperCase()}`,
  exportError: () => 'Failed to export data. Please try again.',
  actionError: () => 'An error occurred. Please try again.',
  noSelection: () => 'Please select at least one user',
};

