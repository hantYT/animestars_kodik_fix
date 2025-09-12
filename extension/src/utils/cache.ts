// Модуль для кэширования данных в расширении
// Использует chrome.storage API

import { CacheEntry } from '../types/kodik';

class Cache {
  private static readonly CACHE_PREFIX = 'kodik_cache_';
  private readonly defaultTTL: number; // время жизни в миллисекундах

  constructor(defaultTTL: number = 3600000) { // 1 час по умолчанию
    this.defaultTTL = defaultTTL;
  }

  /**
   * Генерирует ключ для кэша
   */
  private generateKey(key: string): string {
    return Cache.CACHE_PREFIX + key;
  }

  /**
   * Сохраняет данные в кэш
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const cacheKey = this.generateKey(key);
    const expireTTL = ttl || this.defaultTTL;
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expires_at: Date.now() + expireTTL
    };

    await chrome.storage.local.set({ [cacheKey]: entry });
  }

  /**
   * Получает данные из кэша
   */
  async get<T>(key: string): Promise<T | null> {
    const cacheKey = this.generateKey(key);
    
    try {
      const result = await chrome.storage.local.get(cacheKey);
      const entry: CacheEntry<T> = result[cacheKey];
      
      if (!entry) {
        return null;
      }

      // Проверяем срок годности
      if (Date.now() > entry.expires_at) {
        await this.delete(key);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Проверяет есть ли данные в кэше
   */
  async has(key: string): Promise<boolean> {
    const data = await this.get(key);
    return data !== null;
  }

  /**
   * Удаляет данные из кэша
   */
  async delete(key: string): Promise<void> {
    const cacheKey = this.generateKey(key);
    await chrome.storage.local.remove(cacheKey);
  }

  /**
   * Очищает весь кэш
   */
  async clear(): Promise<void> {
    const allData = await chrome.storage.local.get();
    const cacheKeys = Object.keys(allData).filter(key => 
      key.startsWith(Cache.CACHE_PREFIX)
    );
    
    if (cacheKeys.length > 0) {
      await chrome.storage.local.remove(cacheKeys);
    }
  }

  /**
   * Очищает просроченные записи
   */
  async cleanup(): Promise<number> {
    const allData = await chrome.storage.local.get();
    const now = Date.now();
    let removedCount = 0;
    
    const expiredKeys: string[] = [];
    
    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith(Cache.CACHE_PREFIX)) {
        const entry = value as CacheEntry<any>;
        if (entry.expires_at && now > entry.expires_at) {
          expiredKeys.push(key);
          removedCount++;
        }
      }
    }
    
    if (expiredKeys.length > 0) {
      await chrome.storage.local.remove(expiredKeys);
    }
    
    return removedCount;
  }

  /**
   * Получает статистику кэша
   */
  async getStats(): Promise<{
    totalEntries: number;
    expiredEntries: number;
    totalSize: number;
  }> {
    const allData = await chrome.storage.local.get();
    const now = Date.now();
    
    let totalEntries = 0;
    let expiredEntries = 0;
    let totalSize = 0;
    
    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith(Cache.CACHE_PREFIX)) {
        totalEntries++;
        totalSize += JSON.stringify(value).length;
        
        const entry = value as CacheEntry<any>;
        if (entry.expires_at && now > entry.expires_at) {
          expiredEntries++;
        }
      }
    }
    
    return {
      totalEntries,
      expiredEntries,
      totalSize
    };
  }
}

// Создаем глобальный экземпляр кэша
export const cache = new Cache();

// Специализированные функции для кэширования Kodik данных

/**
 * Кэширует информацию о сериале
 */
export async function cacheSerialInfo(
  id: string, 
  idType: string, 
  data: any, 
  ttl: number = 3600000
): Promise<void> {
  const key = `serial_${idType}_${id}`;
  await cache.set(key, data, ttl);
}

/**
 * Получает информацию о сериале из кэша
 */
export async function getSerialInfo(id: string, idType: string): Promise<any | null> {
  const key = `serial_${idType}_${id}`;
  return await cache.get(key);
}

/**
 * Кэширует ссылку на серию
 */
export async function cacheEpisodeLink(
  id: string, 
  idType: string, 
  translationId: string, 
  episode: number, 
  url: string,
  ttl: number = 1800000 // 30 минут для ссылок
): Promise<void> {
  const key = `episode_${idType}_${id}_${translationId}_${episode}`;
  await cache.set(key, url, ttl);
}

/**
 * Получает ссылку на серию из кэша
 */
export async function getEpisodeLink(
  id: string, 
  idType: string, 
  translationId: string, 
  episode: number
): Promise<string | null> {
  const key = `episode_${idType}_${id}_${translationId}_${episode}`;
  return await cache.get(key);
}

/**
 * Кэширует токен Kodik
 */
export async function cacheKodikToken(
  token: string, 
  ttl: number = 86400000 // 24 часа
): Promise<void> {
  await cache.set('kodik_token', token, ttl);
}

/**
 * Получает токен Kodik из кэша
 */
export async function getKodikToken(): Promise<string | null> {
  return await cache.get('kodik_token');
}

/**
 * Кэширует данные пользователя (прогресс просмотра и т.д.)
 */
export async function cacheUserProgress(
  animeId: string, 
  episode: number, 
  time: number, 
  translation: string
): Promise<void> {
  const key = `progress_${animeId}_${translation}`;
  const data = { episode, time, timestamp: Date.now() };
  await cache.set(key, data, 2592000000); // 30 дней
}

/**
 * Получает прогресс пользователя
 */
export async function getUserProgress(
  animeId: string, 
  translation: string
): Promise<{ episode: number; time: number; timestamp: number } | null> {
  const key = `progress_${animeId}_${translation}`;
  return await cache.get(key);
}

// Автоматическая очистка кэша при запуске
cache.cleanup().catch(console.error);
