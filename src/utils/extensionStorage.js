/**
 * Extension Storage Utility
 * Handles storing authentication tokens in Chrome extension storage
 * Supports both direct chrome.storage.sync access and fallback message passing
 */

/**
 * Create a timeout promise that rejects after specified milliseconds
 * @param {number} ms - Milliseconds to wait before timeout
 * @param {string} message - Error message for timeout
 * @returns {Promise} Promise that rejects after timeout
 */
const createTimeout = (ms, message) => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
};

/**
 * Wrap chrome.storage.sync operations with timeout protection
 * @param {Function} operation - Function that returns a promise for storage operation
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000ms)
 * @returns {Promise} Promise that resolves/rejects with timeout protection
 */
const withTimeout = async (operation, timeoutMs = 5000) => {
  return Promise.race([
    operation(),
    createTimeout(timeoutMs, `Storage operation timed out after ${timeoutMs}ms`)
  ]);
};

/**
 * Store token in extension storage for cross-origin access
 * Tries direct chrome.storage.sync access first, falls back to window.postMessage
 * 
 * @param {Object} extensionTokenData - Token data to store
 * @param {string} meetCode - Google Meet code (normalized to lowercase)
 * @param {string} subjectId - Subject/Group ID
 * @returns {Promise<Object>} Result object with success status, method used, and optional error
 */
export const storeTokenInExtensionStorage = async (extensionTokenData, meetCode, subjectId) => {
  // First, try direct chrome.storage.sync access (if available in extension context)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    try {
      const storagePromises = [];
      const DIRECT_STORAGE_TIMEOUT = 5000; // 5 seconds timeout for direct storage operations
      
      // Store token with meetCode if available
      if (meetCode) {
        const normalizedMeetCode = meetCode.toLowerCase();
        const storageKey = `neattend_token_${normalizedMeetCode}`;
        
        console.log('💾 Storing token in chrome.storage.sync (direct):');
        console.log('   Storage key:', storageKey);
        console.log('   MeetCode:', normalizedMeetCode);
        
        storagePromises.push(
          withTimeout(() => {
            return new Promise((resolve, reject) => {
              chrome.storage.sync.set({ [storageKey]: extensionTokenData }, () => {
                if (chrome.runtime.lastError) {
                  console.error('❌ Failed to store token in chrome.storage.sync:', chrome.runtime.lastError);
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  console.log('✅ Token stored successfully in chrome.storage.sync');
                  resolve({ success: true, key: storageKey });
                }
              });
            });
          }, DIRECT_STORAGE_TIMEOUT)
        );
      }
      
      // Store token with subjectId as fallback
      const subjectTokenKey = `neattend_token_subject_${subjectId}`;
      storagePromises.push(
        withTimeout(() => {
          return new Promise((resolve, reject) => {
            chrome.storage.sync.set({ [subjectTokenKey]: extensionTokenData }, () => {
              if (chrome.runtime.lastError) {
                console.warn('⚠️ Failed to store fallback token:', chrome.runtime.lastError);
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                console.log('✅ Fallback token stored by subjectId:', subjectId);
                resolve({ success: true, key: subjectTokenKey });
              }
            });
          });
        }, DIRECT_STORAGE_TIMEOUT)
      );
      
      // Update pending tokens list
      storagePromises.push(
        withTimeout(() => {
          return new Promise((resolve, reject) => {
            chrome.storage.sync.get(['neattend_pending_tokens'], (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              
              const pendingTokens = result.neattend_pending_tokens || [];
              const filtered = pendingTokens.filter(t => t.subjectId !== subjectId);
              filtered.push({
                ...extensionTokenData,
                storedAt: new Date().toISOString()
              });
              chrome.storage.sync.set({ neattend_pending_tokens: filtered }, () => {
                if (chrome.runtime.lastError) {
                  console.warn('⚠️ Failed to update pending tokens:', chrome.runtime.lastError);
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  console.log('✅ Token added to pending tokens list');
                  resolve({ success: true });
                }
              });
            });
          });
        }, DIRECT_STORAGE_TIMEOUT)
      );
      
      // Wait for all storage operations with timeout protection
      await Promise.all(storagePromises);
      console.log('✅ All direct storage operations completed successfully');
      return { success: true, method: 'direct' };
    } catch (error) {
      console.warn('⚠️ Direct chrome.storage access failed or timed out, trying message passing:', error.message);
      // Fall through to message passing
    }
  }
  
  // Fallback: Use window.postMessage to communicate with content script
  // The content script will forward the message to the background script
  try {
    console.log('💾 Storing token via window.postMessage (content script bridge):');
    console.log('   MeetCode:', meetCode);
    console.log('   SubjectId:', subjectId);
    
    // Generate unique message ID for request/response matching
    const messageId = `store_token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((resolve) => {
      let timeoutId = null;
      
      // Set up response listener
      const responseHandler = (event) => {
        // Security: Only accept messages from same origin
        if (event.origin !== window.location.origin) {
          return;
        }
        
        // Check if this is the response we're waiting for
        if (event.data && 
            event.data.type === 'NEATTEND_STORE_TOKEN_RESPONSE' && 
            event.data.messageId === messageId) {
          window.removeEventListener('message', responseHandler);
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          
          if (event.data.success) {
            console.log('✅ Token stored successfully via window.postMessage');
            if (event.data.verified) {
              console.log('✅ Token storage verified by background script');
            }
            resolve({ 
              success: true, 
              method: 'message', 
              verified: event.data.verified,
              keys: event.data.keys
            });
          } else {
            console.error('❌ Token storage failed:', event.data.error || 'Unknown error');
            resolve({ 
              success: false, 
              error: event.data.error || 'Unknown error', 
              method: 'message' 
            });
          }
        }
      };
      
      // Listen for response
      window.addEventListener('message', responseHandler);
      
      // Set timeout to prevent hanging (10 seconds)
      timeoutId = setTimeout(() => {
        window.removeEventListener('message', responseHandler);
        console.warn('⚠️ Timeout waiting for extension response (10s)');
        resolve({ 
          success: false, 
          error: 'Timeout waiting for extension response', 
          method: 'message' 
        });
      }, 10000);
      
      // Send message to content script
      window.postMessage({
        type: 'NEATTEND_STORE_TOKEN',
        messageId: messageId,
        payload: {
          tokenData: extensionTokenData,
          meetCode: meetCode || null,
          subjectId: subjectId
        }
      }, window.location.origin);
    });
  } catch (error) {
    console.error('❌ Error sending message to extension:', error);
    return { success: false, error: error.message, method: 'message' };
  }
};

