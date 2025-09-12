// Background script для AnimStars Kodik Extension

console.log('🚀 AnimeStars Kodik Optimizer background script started');

// Обработка установки расширения
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    console.log('First time installation');
  } else if (details.reason === 'update') {
    console.log('Extension updated');
  }
});

// Обработка сообщений от content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  switch (request.type) {
    case 'GET_EXTENSION_INFO':
      sendResponse({
        version: chrome.runtime.getManifest().version,
        name: chrome.runtime.getManifest().name
      });
      break;
      
    case 'FETCH_KODIK_PAGE':
      // Обходим CORS через background script
      handleKodikFetch(request.url, sendResponse);
      return true; // Важно для async response
      
    case 'FETCH_KODIK_POST':
      // POST запрос к Kodik
      handleKodikPost(request.url, request.data, sendResponse);
      return true;
      
    case 'LOG_ERROR':
      console.error('Content script error:', request.error);
      break;
      
    default:
      console.warn('Unknown message type:', request.type);
  }
});

/**
 * Обходим CORS для GET запросов к Kodik
 */
async function handleKodikFetch(url: string, sendResponse: (response: any) => void) {
  try {
    console.log('🔄 Background fetching:', url);
    const response = await fetch(url);
    const text = await response.text();
    
    sendResponse({
      success: true,
      data: text,
      status: response.status
    });
  } catch (error) {
    console.error('❌ Background fetch error:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Обходим CORS для POST запросов к Kodik
 */
async function handleKodikPost(url: string, postData: any, sendResponse: (response: any) => void) {
  try {
    console.log('🔄 Background POST to:', url);
    
    // Создаем FormData из объекта
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(postData)) {
      formData.append(key, value as string);
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData
    });
    
    const json = await response.json();
    
    sendResponse({
      success: true,
      data: json,
      status: response.status
    });
  } catch (error) {
    console.error('❌ Background POST error:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Обработка кликов по иконке расширения (если добавим popup)
chrome.action?.onClicked?.addListener((tab) => {
  console.log('Extension icon clicked for tab:', tab.url);
});

export {};
