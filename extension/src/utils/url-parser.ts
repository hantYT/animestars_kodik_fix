// Утилитарные функции для работы с Kodik URLs и данными
// Портированы из Python parser_kodik.py

import { ParsedKodikUrl } from '../types/kodik';

/**
 * Парсит Kodik URL и извлекает данные
 * Пример: //kodik.info/serial/49249/af36468bfed522cd79e623c185b1dc8a/720p?translations=false&only_translations=609&geoblock=RU
 */
export function parseKodikUrl(url: string): ParsedKodikUrl | null {
  try {
    // Убираем протокол если есть
    const cleanUrl = url.replace(/^https?:/, '');
    
    // Парсим основную часть URL
    const urlPattern = /\/\/([\w.-]+)\/(?:serial|video)\/(\d+)\/([a-f0-9]+)\/(\d+p)/;
    const match = cleanUrl.match(urlPattern);
    
    if (!match) {
      return null;
    }
    
    const [, , media_id, media_hash, quality] = match;
    
    // Парсим параметры URL
    const urlObj = new URL('https:' + cleanUrl);
    const params = new URLSearchParams(urlObj.search);
    
    const result: ParsedKodikUrl = {
      media_id,
      media_hash,
      quality: quality.replace('p', ''), // убираем 'p' из '720p'
    };
    
    // Извлекаем translation_id из only_translations
    const translationId = params.get('only_translations');
    if (translationId) {
      result.translation_id = translationId;
    }
    
    return result;
  } catch (error) {
    console.error('Error parsing Kodik URL:', error);
    return null;
  }
}

/**
 * Проверяет является ли URL ссылкой на сериал или фильм
 */
export function isSerial(url: string): boolean {
  return url.includes('/serial/');
}

export function isVideo(url: string): boolean {
  return url.includes('/video/');
}

/**
 * Генерирует URL для embed страницы Kodik
 */
export function generateKodikEmbedUrl(
  mediaId: string, 
  mediaHash: string, 
  quality: string = '720',
  translationId?: string,
  season: number = 1,
  episode: number = 1
): string {
  const type = isSerial(`/serial/${mediaId}/`) ? 'serial' : 'video';
  let url = `https://kodik.info/${type}/${mediaId}/${mediaHash}/${quality}p`;
  
  const params = new URLSearchParams({
    min_age: '16',
    first_url: 'false',
    season: season.toString(),
    episode: episode.toString()
  });
  
  if (translationId) {
    params.set('translations', 'false');
    params.set('only_translations', translationId);
    params.set('geoblock', 'RU');
  }
  
  return `${url}?${params.toString()}`;
}

/**
 * Проверяет качество изображения (есть ли preview в URL)
 */
export function isGoodQualityImage(src: string): boolean {
  return !src.includes('preview');
}

/**
 * Генерирует хэш для кэширования
 */
export function generateCacheKey(
  id: string, 
  idType: string, 
  translationId: string, 
  seriaNum: number, 
  quality: string
): string {
  const data = `${id}${idType}${translationId}${seriaNum}${quality}`;
  return btoa(data).replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Проверяет валидность токена Kodik
 */
export function isValidKodikToken(token: string): boolean {
  return Boolean(token) && token.length > 10 && /^[a-zA-Z0-9]+$/.test(token);
}

/**
 * Извлекает ID из различных типов URLs (shikimori, kinopoisk, etc.)
 */
export function extractIdFromUrl(url: string, idType: 'shikimori' | 'kinopoisk' | 'imdb'): string | null {
  try {
    switch (idType) {
      case 'shikimori':
        // https://shikimori.one/animes/52991-sousou-no-frieren
        const shikiMatch = url.match(/\/animes\/(\d+)(?:-|$)/);
        return shikiMatch ? shikiMatch[1] : null;
        
      case 'kinopoisk':
        // https://www.kinopoisk.ru/film/258687/
        const kpMatch = url.match(/\/film\/(\d+)\//);
        return kpMatch ? kpMatch[1] : null;
        
      case 'imdb':
        // https://www.imdb.com/title/tt0816692/
        const imdbMatch = url.match(/\/title\/(tt\d+)\//);
        return imdbMatch ? imdbMatch[1] : null;
        
      default:
        return null;
    }
  } catch (error) {
    console.error(`Error extracting ${idType} ID from URL:`, error);
    return null;
  }
}

/**
 * Форматирует название файла, убирая запрещенные символы
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200); // Ограничиваем длину
}

/**
 * Проверяет поддержку HLS в браузере
 */
export function supportsHLS(): boolean {
  const video = document.createElement('video');
  return video.canPlayType('application/vnd.apple.mpegurl') !== '';
}

/**
 * Проверяет поддержку MSE (Media Source Extensions)
 */
export function supportsMSE(): boolean {
  return 'MediaSource' in window;
}

/**
 * Дебаунс функцию
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait) as unknown as number;
  };
}

/**
 * Троттлинг функции
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function executedFunction(this: any, ...args: Parameters<T>) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Ожидание определенного времени
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry функция с экспоненциальной задержкой
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i === maxRetries - 1) break;
      
      const delay = baseDelay * Math.pow(2, i);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}
