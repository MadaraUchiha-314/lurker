import { NetworkRequest, NetworkResponse, NetworkCall } from '@lurker-agent/core/dist/types';

// Store network calls organized by tab ID
const networkCallsByTab: Record<number, NetworkCall[]> = {};

// Flag to control whether recording is enabled
let isRecordingEnabled = true;

// Load saved recording state on startup
chrome.storage.local.get('isRecordingEnabled', (result) => {
  if (result.hasOwnProperty('isRecordingEnabled')) {
    isRecordingEnabled = result.isRecordingEnabled;
    console.log(`Loaded recording state from storage: ${isRecordingEnabled ? 'enabled' : 'disabled'}`);
  }
});

// Resource type filter for XHR and fetch requests
const isXhrOrFetch = (type: string) => {
  return type === 'xmlhttprequest' || type === 'fetch';
};

// Listen for extension icon clicks to open the side panel
chrome.action.onClicked.addListener((tab) => {
  // Open the side panel when the extension icon is clicked
  console.log('Extension icon clicked. Opening side panel...');
  
  // If tab has an ID, open the side panel in that tab
  if (tab && tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  } 
  // If tab has a window ID, open the side panel globally in that window
  else if (tab && tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
  // Fallback - just open with no specific context
  else {
    // We need a context, so get the current window
    chrome.windows.getCurrent(window => {
      if (window && window.id) {
        chrome.sidePanel.open({ windowId: window.id });
      }
    });
  }
});

// Listen for network requests
chrome.webRequest.onBeforeRequest.addListener(
  (details: chrome.webRequest.WebRequestBodyDetails) => {
    // Only process XHR and fetch requests
    if (!isXhrOrFetch(details.type)) {
      return { cancel: false };
    }

    // Skip recording if disabled
    if (!isRecordingEnabled) {
      return { cancel: false };
    }

    // Create a tab entry if it doesn't exist
    if (!networkCallsByTab[details.tabId]) {
      networkCallsByTab[details.tabId] = [];
    }
    
    // Create a request object using the fetch Request constructor
    const request = new Request(details.url, {
      method: details.method,
      body: details.requestBody ? JSON.stringify(details.requestBody) : undefined
    }) as NetworkRequest;
    
    // Add our custom properties
    request.timestamp = Date.now();
    request.requestId = details.requestId;

    // Store the request
    const callData: NetworkCall = {
      request,
      response: null
    };
    networkCallsByTab[details.tabId].push(callData);

    return { cancel: false };
  },
  { urls: ["<all_urls>"] },
  ["requestBody"]
);

// Listen for network responses
chrome.webRequest.onCompleted.addListener(
  async (details: chrome.webRequest.WebResponseDetails) => {
    // Only process XHR and fetch requests
    if (!isXhrOrFetch(details.type)) {
      return;
    }

    // Skip recording if disabled
    if (!isRecordingEnabled) {
      return;
    }

    try {
      // Create a Response object using the fetch Response constructor
      const response = new Response(null, {
        status: details.statusCode,
        statusText: details.statusLine || '',
        headers: new Headers() // We might not have access to response headers due to CORS
      }) as NetworkResponse;
      
      // Add our custom properties
      response.requestId = details.requestId;
      response.timestamp = Date.now();

      // Find and update the corresponding request in the tab's requests
      if (networkCallsByTab[details.tabId]) {
        const callData = networkCallsByTab[details.tabId].find(
          call => call.request.requestId === details.requestId
        );
        if (callData) {
          callData.response = response;
        }
      }
    } catch (error) {
      console.error('Error creating response object:', error);
    }
  },
  { urls: ["<all_urls>"] }
);

// Handle tab closing to prevent memory leaks
chrome.tabs.onRemoved.addListener((tabId: number) => {
  delete networkCallsByTab[tabId];
});

// Clear all network calls when the active tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  console.log('Tab changed. Clearing all network calls.');
  
  // Get the currently active tab ID
  const activeTabId = activeInfo.tabId;
  
  // Clear all network calls for all tabs
  for (const tabId in networkCallsByTab) {
    networkCallsByTab[tabId] = [];
  }
  
  // Log that the data has been cleared
  console.log('Network data cleared for all tabs.');
});

// Message structure for panel communications
interface PanelMessage {
  type: 'GET_NETWORK_CALLS' | 'CLEAR_NETWORK_CALLS' | 'TOGGLE_RECORDING' | 'GET_RECORDING_STATUS' | string;
  enabled?: boolean;
}

// Handle messages from the panel
chrome.runtime.onMessage.addListener(
  (message: PanelMessage, 
   sender: chrome.runtime.MessageSender, 
   sendResponse: (response?: any) => void) => {
    
  if (message.type === 'GET_NETWORK_CALLS') {
    // Instead of getting just the current tab's data, collect all tabs' data
    try {
      // Collect network calls from all tabs into a single array
      const allNetworkCalls: NetworkCall[] = [];
      
      // Loop through all tabs that have network calls
      Object.values(networkCallsByTab).forEach(tabCalls => {
        allNetworkCalls.push(...tabCalls);
      });
      
      console.log(`Sending network calls from all tabs. Total: ${allNetworkCalls.length}`);
      
      // Properly serialize the network calls
      const serializedCalls = JSON.stringify(allNetworkCalls, serializeNetworkCalls);
      sendResponse(JSON.parse(serializedCalls));
    } catch (error) {
      console.error('Error serializing network calls:', error);
      sendResponse([]);
    }
    
    // Return true to indicate we'll call sendResponse asynchronously
    return true;
  }
  
  // Handle clear network calls request
  if (message.type === 'CLEAR_NETWORK_CALLS') {
    console.log('Received request to clear network calls.');
    
    // Clear all network calls for all tabs
    for (const tabId in networkCallsByTab) {
      networkCallsByTab[tabId] = [];
    }
    
    console.log('Network data cleared for all tabs.');
    sendResponse({ success: true });
    return true;
  }

  // Handle toggle recording request
  if (message.type === 'TOGGLE_RECORDING') {
    console.log(`Received request to ${message.enabled ? 'enable' : 'disable'} network recording.`);
    
    // Update recording status if the enabled flag is provided
    if (message.hasOwnProperty('enabled')) {
      isRecordingEnabled = !!message.enabled;
      console.log(`Network recording is now ${isRecordingEnabled ? 'enabled' : 'disabled'}.`);
      
      // Save the recording state to chrome storage
      chrome.storage.local.set({ isRecordingEnabled }, () => {
        console.log(`Recording state saved to storage: ${isRecordingEnabled ? 'enabled' : 'disabled'}`);
      });
    }
    
    sendResponse({ success: true, enabled: isRecordingEnabled });
    return true;
  }

  // Handle get recording status request
  if (message.type === 'GET_RECORDING_STATUS') {
    console.log(`Received request to get recording status. Current status: ${isRecordingEnabled ? 'enabled' : 'disabled'}.`);
    sendResponse({ success: true, enabled: isRecordingEnabled });
    return true;
  }
});

/**
 * Custom replacer function for JSON.stringify to properly serialize Request and Response objects
 */
function serializeNetworkCalls(key: string, value: any): any {
  // If this is a Request object
  if (value instanceof Request) {
    // Cast to NetworkRequest to access custom properties
    const req = value as NetworkRequest;
    
    // Create a serializable version of the Request
    return {
      _type: 'Request',
      url: req.url,
      method: req.method,
      // Include headers if available
      headers: serializeHeaders(req.headers),
      // Include timestamp and requestId if they exist
      timestamp: req.timestamp,
      requestId: req.requestId,
      // Try to include body info if possible
      bodyInfo: req.body === null ? { type: 'empty' } :
                typeof req.body === 'string' ? { type: 'string', preview: (req.body as string).substring(0, 1000) } :
                { type: 'stream', note: 'Body content is a stream and cannot be fully serialized' }
    };
  }
  
  // If this is a Response object
  if (value instanceof Response) {
    // Cast to NetworkResponse to access custom properties
    const res = value as NetworkResponse;
    
    // Create a serializable version of the Response
    return {
      _type: 'Response',
      status: res.status,
      statusText: res.statusText,
      // Include headers if available
      headers: serializeHeaders(res.headers),
      // Include timestamp and requestId if they exist
      timestamp: res.timestamp,
      requestId: res.requestId,
      // Note about body
      bodyInfo: { type: 'stream', note: 'Response body is a stream and cannot be fully serialized' }
    };
  }
  
  // For everything else, return as is
  return value;
}

/**
 * Helper function to serialize Headers objects
 */
function serializeHeaders(headers?: Headers): Record<string, string> | undefined {
  if (!headers) return undefined;
  
  const result: Record<string, string> = {};
  
  // Convert Headers object to a plain object
  try {
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  } catch (e) {
    // In case of any error, return an empty object
    console.error('Error serializing headers:', e);
    return {};
  }
} 