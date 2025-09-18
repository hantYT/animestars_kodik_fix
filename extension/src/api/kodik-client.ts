// Оптимизированный клиент для работы с Kodik API
// Включает кэширование, пулинг соединений, retry logic и батчинг

import { 
  KodikApiResponse, 
  KodikSearchParams, 
  KodikElement,
  IDType
} from '../types/kodik';
import { isValidKodikToken } from '../utils/url-parser';
import { getKodikToken, cacheKodikToken } from '../utils/cache';
import { decryptKodikUrl, getVideoLinks, extractVideoDataFromPage } from '../utils/decryption';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expires: number;
}

interface RequestOptions {
  timeout?: number;
  retries?: number;
  priority?: 'low' | 'normal' | 'high';
}

export class KodikAPIOptimized {
  private token: string | null = null;
  private readonly baseUrl = 'https://kodikapi.com';
  
  // Многоуровневое кэширование
  private static memoryCache = new Map<string, CacheEntry<any>>();
  private static tokenCache: CacheEntry<string> | null = null;
  
  // Конфигурация кэша
  private static readonly CACHE_CONFIG = {
    TOKEN_TTL: 60 * 60 * 1000,      // 1 час
    API_RESPONSE_TTL: 10 * 60 * 1000, // 10 минут
    VIDEO_URL_TTL: 5 * 60 * 1000,    // 5 минут (видео ссылки живут меньше)
    MAX_CACHE_SIZE: 100,              // Максимум записей в кэше
    CLEANUP_INTERVAL: 5 * 60 * 1000   // Очистка кэша каждые 5 минут
  };
  
  // Пул активных запросов для предотвращения дублей
  private static requestPool = new Map<string, Promise<any>>();
  
  // Очередь запросов с приоритетами
  private static requestQueue: Array<{
    key: string;
    priority: number;
    executor: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  
  private static queueProcessor: NodeJS.Timeout | null = null;
  private static isProcessingQueue = false;

  constructor(token?: string) {
    if (token && isValidKodikToken(token)) {
      this.token = token;
    }
    
    // Запускаем периодическую очистку кэша
    this.setupCacheCleanup();
  }

  /**
   * Настраивает периодическую очистку кэша
   */
  private setupCacheCleanup(): void {
    if (!KodikAPIOptimized.queueProcessor) {
      KodikAPIOptimized.queueProcessor = setInterval(() => {
        this.cleanupCache();
      }, KodikAPIOptimized.CACHE_CONFIG.CLEANUP_INTERVAL);
    }
  }

  /**
   * Очищает устаревшие записи кэша
   */
  private cleanupCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of KodikAPIOptimized.memoryCache) {
      if (now >= entry.expires) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => {
      KodikAPIOptimized.memoryCache.delete(key);
    });
    
    // Проверяем размер кэша
    if (KodikAPIOptimized.memoryCache.size > KodikAPIOptimized.CACHE_CONFIG.MAX_CACHE_SIZE) {
      // Удаляем самые старые записи
      const entries = Array.from(KodikAPIOptimized.memoryCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, 20); // Удаляем 20 самых старых
      toRemove.forEach(([key]) => {
        KodikAPIOptimized.memoryCache.delete(key);
      });
    }
    
    console.log(`🧹 Cache cleanup: ${keysToDelete.length} expired, ${KodikAPIOptimized.memoryCache.size} total`);
  }

  /**
   * Получает данные из кэша
   */
  private getCached<T>(key: string): T | null {
    const entry = KodikAPIOptimized.memoryCache.get(key);
    if (entry && Date.now() < entry.expires) {
      console.log(`💾 Cache hit: ${key}`);
      return entry.data;
    }
    
    if (entry) {
      KodikAPIOptimized.memoryCache.delete(key);
    }
    
    return null;
  }

  /**
   * Сохраняет данные в кэш
   */
  private setCached<T>(key: string, data: T, ttl: number): void {
    const now = Date.now();
    KodikAPIOptimized.memoryCache.set(key, {
      data,
      timestamp: now,
      expires: now + ttl
    });
  }

  /**
   * Получает токен с многоуровневым кэшированием
   */
  async getToken(options: RequestOptions = {}): Promise<string> {
    const now = Date.now();
    
    // 1. Проверяем memory cache
    if (KodikAPIOptimized.tokenCache && now < KodikAPIOptimized.tokenCache.expires) {
      this.token = KodikAPIOptimized.tokenCache.data;
      return this.token;
    }

    // 2. Проверяем localStorage
    try {
      const cachedToken = await getKodikToken();
      if (cachedToken && isValidKodikToken(cachedToken)) {
        // Обновляем memory cache
        KodikAPIOptimized.tokenCache = {
          data: cachedToken,
          timestamp: now,
          expires: now + KodikAPIOptimized.CACHE_CONFIG.TOKEN_TTL
        };
        this.token = cachedToken;
        return cachedToken;
      }
    } catch (error) {
      console.warn('Failed to get cached token:', error);
    }

    // 3. Получаем новый токен с пулингом
    const tokenKey = 'kodik_token_request';
    
    return this.executeWithPool(tokenKey, async () => {
      const token = await this.fetchNewTokenWithRetry(options);
      
      // Кэшируем на всех уровнях
      KodikAPIOptimized.tokenCache = {
        data: token,
        timestamp: now,
        expires: now + KodikAPIOptimized.CACHE_CONFIG.TOKEN_TTL
      };
      
      try {
        await cacheKodikToken(token);
      } catch (error) {
        console.warn('Failed to cache token to localStorage:', error);
      }
      
      this.token = token;
      return token;
    });
  }

  /**
   * Получает новый токен с retry логикой
   */
  private async fetchNewTokenWithRetry(options: RequestOptions): Promise<string> {
    const maxRetries = options.retries ?? 3;
    const timeout = options.timeout ?? 10000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔑 Fetching new token (attempt ${attempt}/${maxRetries})`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch('https://kodik-add.com/add-players.min.js?v=2', {
            signal: controller.signal,
            headers: {
              'Cache-Control': 'no-cache',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/javascript, */*;q=0.1',
              'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
              'Sec-Fetch-Dest': 'script',
              'Sec-Fetch-Mode': 'no-cors',
              'Sec-Fetch-Site': 'cross-site'
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const scriptText = await response.text();
          
          // Улучшенный парсинг токена
          const tokenMatches = scriptText.match(/token["\s]*[:=]["\s]*([a-f0-9]{32})/i);
          if (!tokenMatches) {
            throw new Error('Token pattern not found in script');
          }
          
          const token = tokenMatches[1];
          
          if (!isValidKodikToken(token)) {
            throw new Error(`Invalid token format: ${token}`);
          }

          console.log('✅ New token fetched successfully');
          return token;
          
        } finally {
          clearTimeout(timeoutId);
        }
        
      } catch (error) {
        console.warn(`❌ Token fetch attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to fetch token after ${maxRetries} attempts: ${error}`);
        }
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('Unexpected error in token fetch retry loop');
  }

  /**
   * Выполняет запрос с пулингом соединений
   */
  private async executeWithPool<T>(key: string, executor: () => Promise<T>): Promise<T> {
    // Проверяем активные запросы
    if (KodikAPIOptimized.requestPool.has(key)) {
      console.log(`♻️ Reusing active request: ${key}`);
      return await KodikAPIOptimized.requestPool.get(key)!;
    }

    // Создаем новый запрос
    const promise = executor();
    KodikAPIOptimized.requestPool.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      KodikAPIOptimized.requestPool.delete(key);
    }
  }

  /**
   * Выполняет API запрос с кэшированием и оптимизацией
   */
  private async apiRequest(
    endpoint: 'search' | 'list' | 'translations',
    params: Partial<KodikSearchParams> = {},
    options: RequestOptions = {}
  ): Promise<KodikApiResponse> {
    // Создаем ключ кэша на основе запроса
    const cacheKey = `api_${endpoint}_${this.hashParams(params)}`;
    
    // Проверяем кэш
    const cached = this.getCached<KodikApiResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    // Выполняем запрос с пулингом
    return this.executeWithPool(cacheKey, async () => {
      if (!this.token) {
        await this.getToken(options);
      }

      const result = await this.performApiRequestWithRetry(endpoint, params, options);
      
      // Кэшируем успешный ответ
      if (!(result as any).error) {
        this.setCached(cacheKey, result, KodikAPIOptimized.CACHE_CONFIG.API_RESPONSE_TTL);
      }

      return result;
    });
  }

  /**
   * Выполняет API запрос с retry логикой
   */
  private async performApiRequestWithRetry(
    endpoint: string,
    params: Partial<KodikSearchParams>,
    options: RequestOptions
  ): Promise<KodikApiResponse> {
    const maxRetries = options.retries ?? 2;
    const timeout = options.timeout ?? 15000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📡 API request to ${endpoint} (attempt ${attempt}/${maxRetries})`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const formData = new FormData();
        formData.append('token', this.token!);
        
        // Добавляем параметры
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== null) {
            formData.append(key, value.toString());
          }
        }

        try {
          const response = await fetch(`${this.baseUrl}/${endpoint}`, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Origin': 'https://kodik.info',
              'Referer': 'https://kodik.info/',
              'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8'
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const data = await response.json();
          
          if (data.error) {
            if (data.error === 'Отсутствует или неверный токен') {
              // Сбрасываем токен и повторяем
              this.token = null;
              KodikAPIOptimized.tokenCache = null;
              
              if (attempt < maxRetries) {
                await this.getToken(options);
                continue;
              }
            }
            throw new Error(`API error: ${data.error}`);
          }

          console.log(`✅ API request to ${endpoint} successful`);
          return data;
          
        } finally {
          clearTimeout(timeoutId);
        }
        
      } catch (error) {
        console.warn(`❌ API request attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const delay = Math.min(500 * Math.pow(2, attempt - 1), 3000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('Unexpected error in API request retry loop');
  }

  /**
   * Создает хэш параметров для кэширования
   */
  private hashParams(params: any): string {
    const sorted = Object.keys(params)
      .sort()
      .reduce((result: any, key: string) => {
        result[key] = params[key];
        return result;
      }, {});
    
    return btoa(JSON.stringify(sorted)).slice(0, 16);
  }

  /**
   * Поиск с оптимизацией
   */
  async search(
    title: string, 
    options: Partial<KodikSearchParams> = {},
    requestOptions: RequestOptions = {}
  ): Promise<KodikApiResponse> {
    const params: Partial<KodikSearchParams> = {
      title: title.trim() + ' ', // Добавляем пробел как в Python версии
      limit: options.limit ?? 50,
      with_material_data: true,
      strict: false,
      ...options
    };
    
    return this.apiRequest('search', params, requestOptions);
  }

  /**
   * Поиск по ID с оптимизацией
   */
  async searchById(
    id: string, 
    idType: IDType, 
    options: Partial<KodikSearchParams> = {},
    requestOptions: RequestOptions = {}
  ): Promise<KodikApiResponse> {
    const params: Partial<KodikSearchParams> = {
      [`${idType}_id`]: id,
      limit: options.limit ?? 50,
      with_material_data: true,
      ...options
    };
    
    return this.apiRequest('search', params, requestOptions);
  }

  /**
   * Батчевый поиск по нескольким ID
   */
  async searchByIdsBatch(
    searches: Array<{ id: string, idType: IDType }>,
    options: Partial<KodikSearchParams> = {},
    requestOptions: RequestOptions = {}
  ): Promise<Array<{ search: { id: string, idType: IDType }, result: KodikApiResponse | Error }>> {
    console.log(`🔄 Batch search for ${searches.length} items`);
    
    // Выполняем поиски параллельно с ограничением
    const batchSize = 5; // Максимум 5 параллельных запросов
    const results: Array<{ search: { id: string, idType: IDType }, result: KodikApiResponse | Error }> = [];
    
    for (let i = 0; i < searches.length; i += batchSize) {
      const batch = searches.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (search) => {
        try {
          const result = await this.searchById(search.id, search.idType, options, requestOptions);
          return { search, result };
        } catch (error) {
          return { search, result: error as Error };
        }
      });
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Не должно происходить, так как мы ловим ошибки внутри
          results.push({ 
            search: { id: 'unknown', idType: 'shikimori' }, 
            result: new Error(result.reason) 
          });
        }
      });
      
      // Задержка между батчами для предотвращения rate limiting
      if (i + batchSize < searches.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`✅ Batch search completed: ${results.length} results`);
    return results;
  }

  /**
   * Получает URL видео с кэшированием
   */
  async getVideoUrl(
    id: string, 
    idType: IDType, 
    episode: number, 
    translationId: string,
    options: RequestOptions = {}
  ): Promise<{ url: string; maxQuality: number }> {
    const cacheKey = `video_${id}_${idType}_${episode}_${translationId}`;
    
    // Проверяем кэш (короткий TTL для видео URL)
    const cached = this.getCached<{ url: string; maxQuality: number }>(cacheKey);
    if (cached) {
      return cached;
    }

    return this.executeWithPool(cacheKey, async () => {
      try {
        console.log(`🎥 Getting video URL: ${id} ep${episode} trans${translationId}`);
        
        const link = await this.getLinkToInfo(id, idType);
        let embedUrl: string;
        
        if (episode > 0 && translationId !== '0') {
          // Для сериала с известной озвучкой
          const response = await fetch(link);
          const html = await response.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          
          const container = doc.querySelector('.serial-translations-box select');
          if (!container) throw new Error('Translations container not found');
          
          let mediaHash: string | null = null;
          let mediaId: string | null = null;
          
          const options = container.querySelectorAll('option');
          for (let i = 0; i < options.length; i++) {
            const option = options[i];
            if (option.getAttribute('data-id') === translationId) {
              mediaHash = option.getAttribute('data-media-hash');
              mediaId = option.getAttribute('data-media-id');
              break;
            }
          }
          
          if (!mediaHash || !mediaId) {
            throw new Error('Media hash/id not found for translation');
          }
          
          embedUrl = `https://kodik.info/serial/${mediaId}/${mediaHash}/720p?min_age=16&first_url=false&season=1&episode=${episode}`;
        } else if (translationId !== '0' && episode === 0) {
          // Для фильма с переводом
          const response = await fetch(link);
          const html = await response.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          
          const container = doc.querySelector('.movie-translations-box select');
          if (!container) throw new Error('Translations container not found');
          
          let mediaHash: string | null = null;
          let mediaId: string | null = null;
          
          const options = container.querySelectorAll('option');
          for (let i = 0; i < options.length; i++) {
            const option = options[i];
            if (option.getAttribute('data-id') === translationId) {
              mediaHash = option.getAttribute('data-media-hash');
              mediaId = option.getAttribute('data-media-id');
              break;
            }
          }
          
          if (!mediaHash || !mediaId) {
            throw new Error('Media hash/id not found for translation');
          }
          
          embedUrl = `https://kodik.info/video/${mediaId}/${mediaHash}/720p?min_age=16&first_url=false&season=1&episode=0`;
        } else {
          embedUrl = link;
        }
        
        // Получаем HTML страницы плеера
        const playerResponse = await fetch(embedUrl);
        const playerHtml = await playerResponse.text();
        
        // Извлекаем данные из страницы
        const videoData = extractVideoDataFromPage(playerHtml);
        if (!videoData) {
          throw new Error('Failed to extract video data');
        }
        
        // Получаем ссылки на видео
        const result = await getVideoLinks(
          videoData.videoType,
          videoData.videoHash,
          videoData.videoId,
          videoData.urlParams,
          videoData.scriptUrl
        );
        
        // Очищаем URL
        const cleanUrl = result.url.replace('https:', '');
        const baseUrl = cleanUrl.substring(0, cleanUrl.lastIndexOf('/') + 1);
        
        const finalResult = {
          url: baseUrl,
          maxQuality: result.maxQuality
        };
        
        // Кэшируем с коротким TTL
        this.setCached(cacheKey, finalResult, KodikAPIOptimized.CACHE_CONFIG.VIDEO_URL_TTL);
        
        console.log(`✅ Video URL obtained for ${id} ep${episode}`);
        return finalResult;
        
      } catch (error) {
        console.error(`❌ Failed to get video URL for ${id} ep${episode}:`, error);
        throw error;
      }
    });
  }

  /**
   * Получает информацию о медиа с кэшированием
   */
  async getInfo(id: string, idType: IDType): Promise<{
    series_count: number;
    translations: Array<{ id: string; type: string; name: string; }>;
  }> {
    const cacheKey = `info_${id}_${idType}`;
    
    const cached = this.getCached<any>(cacheKey);
    if (cached) {
      return cached;
    }

    return this.executeWithPool(cacheKey, async () => {
      try {
        const link = await this.getLinkToInfo(id, idType);
        const response = await fetch(link);
        const html = await response.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        let seriesCount = 0;
        let translations: any[] = [];
        
        if (this.isSerial(link)) {
          // Для сериалов
          const seriesBox = doc.querySelector('.serial-series-box select');
          if (seriesBox) {
            seriesCount = seriesBox.querySelectorAll('option').length;
          }
          
          const translationsBox = doc.querySelector('.serial-translations-box select');
          translations = this.generateTranslationsDict(translationsBox);
        } else if (this.isVideo(link)) {
          // Для фильмов
          seriesCount = 0;
          
          const translationsBox = doc.querySelector('.movie-translations-box select');
          translations = this.generateTranslationsDict(translationsBox);
        }
        
        const result = {
          series_count: seriesCount,
          translations
        };
        
        // Кэшируем результат
        this.setCached(cacheKey, result, KodikAPIOptimized.CACHE_CONFIG.API_RESPONSE_TTL);
        
        return result;
      } catch (error) {
        console.error('Error getting info:', error);
        throw error;
      }
    });
  }

  /**
   * Получает список переводов
   */
  async getTranslations(id: string, idType: IDType): Promise<any[]> {
    const infoData = await this.getInfo(id, idType);
    return infoData.translations;
  }

  /**
   * Получает количество серий
   */
  async getSeriesCount(id: string, idType: IDType): Promise<number> {
    const infoData = await this.getInfo(id, idType);
    return infoData.series_count;
  }

  // Остальные методы остаются без изменений для совместимости
  private async getLinkToInfo(id: string, idType: IDType): Promise<string> {
    if (!this.token) {
      await this.getToken();
    }

    let url: string;
    if (idType === 'shikimori') {
      url = `https://kodikapi.com/get-player?title=Player&hasPlayer=false&url=https%3A%2F%2Fkodikdb.com%2Ffind-player%3FshikimoriID%3D${id}&token=${this.token}&shikimoriID=${id}`;
    } else if (idType === 'kinopoisk') {
      url = `https://kodikapi.com/get-player?title=Player&hasPlayer=false&url=https%3A%2F%2Fkodikdb.com%2Ffind-player%3FkinopoiskID%3D${id}&token=${this.token}&kinopoiskID=${id}`;
    } else if (idType === 'imdb') {
      url = `https://kodikapi.com/get-player?title=Player&hasPlayer=false&url=https%3A%2F%2Fkodikdb.com%2Ffind-player%3FimdbID%3D${id}&token=${this.token}&imdbID=${id}`;
    } else {
      throw new Error('Unknown ID type');
    }

    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    if (!data.found) {
      throw new Error(`No data found for ${idType} ID: ${id}`);
    }

    return 'https:' + data.link;
  }

  private isSerial(url: string): boolean {
    const infoIndex = url.indexOf('.info/');
    return infoIndex !== -1 && url[infoIndex + 6] === 's';
  }

  private isVideo(url: string): boolean {
    const infoIndex = url.indexOf('.info/');
    return infoIndex !== -1 && url[infoIndex + 6] === 'v';
  }

  private generateTranslationsDict(translationsElement: Element | null): any[] {
    if (!translationsElement) {
      return [{ id: '0', type: 'Неизвестно', name: 'Неизвестно' }];
    }

    const translations: any[] = [];
    const options = translationsElement.querySelectorAll('option');
    
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const id = option.getAttribute('value') || '0';
      const rawType = option.getAttribute('data-translation-type') || 'unknown';
      const name = option.textContent || 'Неизвестно';
      
      let type: string;
      if (rawType === 'voice') {
        type = 'Озвучка';
      } else if (rawType === 'subtitles') {
        type = 'Субтитры';
      } else {
        type = 'Неизвестно';
      }
      
      translations.push({ id, type, name });
    }
    
    return translations;
  }

  /**
   * Очищает все кэши (для отладки)
   */
  clearCache(): void {
    KodikAPIOptimized.memoryCache.clear();
    KodikAPIOptimized.tokenCache = null;
    KodikAPIOptimized.requestPool.clear();
    console.log('🗑️ All caches cleared');
  }

  /**
   * Получает статистику кэша
   */
  getCacheStats(): {
    memoryEntries: number;
    tokenCached: boolean;
    activeRequests: number;
  } {
    return {
      memoryEntries: KodikAPIOptimized.memoryCache.size,
      tokenCached: KodikAPIOptimized.tokenCache !== null,
      activeRequests: KodikAPIOptimized.requestPool.size
    };
  }
}

// Создаем глобальный экземпляр оптимизированного API клиента
export const kodikAPIOptimized = new KodikAPIOptimized();

// Экспортируем для обратной совместимости
export { KodikAPIOptimized as KodikAPI };
export const kodikAPI = kodikAPIOptimized; // Алиас для старого кода
