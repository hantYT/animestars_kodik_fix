// Модуль для дешифровки ссылок Kodik
// Портирован из Python parser_kodik.py

/**
 * Применяет ROT cipher к символу
 * Портирован из _convert_char в Python
 */
function convertChar(char: string, num: number): string {
  const isLower = char === char.toLowerCase();
  const alph = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  
  if (alph.includes(char.toUpperCase())) {
    const index = alph.indexOf(char.toUpperCase());
    const newChar = alph[(index + num) % alph.length];
    return isLower ? newChar.toLowerCase() : newChar;
  }
  
  return char;
}

/**
 * Дешифрует строку используя ROT cipher + Base64
 * Портирован из _convert в Python
 */
export function decryptKodikUrl(encodedString: string): string | null {
  // Попробуем все возможные ROT сдвиги
  for (let rot = 0; rot < 26; rot++) {
    try {
      // Применяем ROT cipher
      const rotatedString = encodedString
        .split('')
        .map(char => convertChar(char, rot))
        .join('');
      
      // Добавляем padding для Base64 если нужно
      const padding = (4 - (rotatedString.length % 4)) % 4;
      const paddedString = rotatedString + '='.repeat(padding);
      
      // Пробуем декодировать Base64
      const decoded = atob(paddedString);
      
      // Проверяем что результат содержит HLS манифест
      if (decoded.includes('mp4:hls:manifest')) {
        return decoded;
      }
    } catch (error) {
      // Продолжаем с следующим ROT значением
      continue;
    }
  }
  
  // Если ничего не получилось
  return null;
}

/**
 * Извлекает POST URL из Kodik скрипта
 * Портирован из _get_post_link в Python
 */
export async function getPostLink(scriptUrl: string): Promise<string> {
  try {
    const response = await fetch('https://kodik.info' + scriptUrl);
    const scriptText = await response.text();
    
    // Ищем нужную часть в скрипте
    const ajaxIndex = scriptText.indexOf('$.ajax');
    if (ajaxIndex === -1) {
      throw new Error('Ajax call not found in script');
    }
    
    const cacheIndex = scriptText.indexOf('cache:!1', ajaxIndex);
    if (cacheIndex === -1) {
      throw new Error('Cache marker not found in script');
    }
    
    // Извлекаем закодированный URL
    const startIndex = ajaxIndex + 30;
    const endIndex = cacheIndex - 3;
    const encodedUrl = scriptText.substring(startIndex, endIndex);
    
    // Декодируем Base64
    return atob(encodedUrl);
  } catch (error) {
    console.error('Error getting post link:', error);
    throw error;
  }
}

/**
 * Получает ссылки на видео с различными качествами
 * Портирован из _get_link_with_data в Python
 */
export async function getVideoLinks(
  videoType: string,
  videoHash: string,
  videoId: string,
  urlParams: any,
  scriptUrl: string
): Promise<{ url: string; maxQuality: number }> {
  try {
    // Подготавливаем параметры для POST запроса
    const params = new URLSearchParams({
      hash: videoHash,
      id: videoId,
      type: videoType,
      d: urlParams.d,
      d_sign: urlParams.d_sign,
      pd: urlParams.pd,
      pd_sign: urlParams.pd_sign,
      ref: '',
      ref_sign: urlParams.ref_sign,
      bad_user: 'true',
      cdn_is_working: 'true'
    });

    // Получаем POST URL
    const postLink = await getPostLink(scriptUrl);
    
    // Выполняем POST запрос
    const response = await fetch(`https://kodik.info${postLink}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Получаем ссылку на 360p (базовое качество)
    const dataUrl = data.links['360'][0].src;
    
    // Пробуем дешифровать если нужно
    let finalUrl: string;
    if (dataUrl.includes('mp4:hls:manifest')) {
      finalUrl = dataUrl;
    } else {
      const decrypted = decryptKodikUrl(dataUrl);
      if (!decrypted) {
        throw new Error('Failed to decrypt video URL');
      }
      finalUrl = decrypted;
    }
    
    // Находим максимальное качество
    const qualities = Object.keys(data.links).map(q => parseInt(q));
    const maxQuality = Math.max(...qualities);
    
    return {
      url: finalUrl,
      maxQuality
    };
  } catch (error) {
    console.error('Error getting video links:', error);
    throw error;
  }
}

/**
 * Извлекает данные видео из HTML страницы Kodik
 */
export function extractVideoDataFromPage(html: string): {
  videoType: string;
  videoHash: string;
  videoId: string;
  urlParams: any;
  scriptUrl: string;
} | null {
  try {
    // Создаем временный DOM элемент для парсинга
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Ищем скрипт с urlParams
    const scripts = Array.from(doc.querySelectorAll('script'));
    let urlParams: any = null;
    
    for (const script of scripts) {
      const content = script.textContent || '';
      if (content.includes('urlParams')) {
        // Извлекаем urlParams из JavaScript
        const startIndex = content.indexOf('urlParams') + 13;
        const endIndex = content.indexOf(';', startIndex) - 1;
        const urlParamsStr = content.substring(startIndex, endIndex);
        urlParams = JSON.parse(urlParamsStr);
        break;
      }
    }
    
    if (!urlParams) {
      throw new Error('urlParams not found');
    }
    
    // Получаем script URL из второго script тега
    const scriptWithSrc = scripts.find(s => s.src);
    if (!scriptWithSrc) {
      throw new Error('Script URL not found');
    }
    const scriptUrl = new URL(scriptWithSrc.src).pathname;
    
    // Ищем хэш контейнер в пятом скрипте
    const hashScript = scripts[4];
    if (!hashScript) {
      throw new Error('Hash script not found');
    }
    
    const hashContent = hashScript.textContent || '';
    
    // Извлекаем video_type
    const typeMatch = hashContent.match(/\.type = '([^']+)'/);
    if (!typeMatch) throw new Error('Video type not found');
    const videoType = typeMatch[1];
    
    // Извлекаем video_hash
    const hashMatch = hashContent.match(/\.hash = '([^']+)'/);
    if (!hashMatch) throw new Error('Video hash not found');
    const videoHash = hashMatch[1];
    
    // Извлекаем video_id
    const idMatch = hashContent.match(/\.id = '([^']+)'/);
    if (!idMatch) throw new Error('Video ID not found');
    const videoId = idMatch[1];
    
    return {
      videoType,
      videoHash,
      videoId,
      urlParams,
      scriptUrl
    };
  } catch (error) {
    console.error('Error extracting video data:', error);
    return null;
  }
}
