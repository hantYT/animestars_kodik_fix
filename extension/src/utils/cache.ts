// Оптимизированная система кэширования с многоуровневой структурой
// Memory cache + IndexedDB + SessionStorage + LocalStorage

interface CacheOptions {
  ttl?: number;
  priority?: 'low' | 'normal' | 'high';
  compress?: boolean;
  persistent?: boolean;
}

interface CacheEntry {
  key: string;
  data: any;
  timestamp: number;
  expires: number;
  priority: number;
  size: number;
  compressed: boolean;
  accessCount: number;
  lastAccess: number;
}

interface CacheStats {
  memoryEntries: number;
  memorySize: number;
  indexedDBEntries: number;
  sessionEntries: number;
  localEntries: number;
  hitRate: number;
  totalRequests: number;
  totalHits: number;
}

export class OptimizedCache {
  private static instance: OptimizedCache | null = null;
  
  // Memory cache (самый быстрый)
  private memoryCache = new Map<string, CacheEntry>();
  
  // Статистика
  private stats = {
    totalRequests: 0,
    totalHits: 0,
    memoryHits: 0,
    indexedDBHits: 0,
    sessionHits: 0,
    localHits: 0
  };
  
  // Конфигурация
  private config = {
    maxMemorySize: 50 * 1024 * 1024,    // 50MB в памяти
    maxMemoryEntries: 1000,              // Максимум записей в памяти
    maxIndexedDBSize: 200 * 1024 * 1024, // 200MB в IndexedDB
    compressionThreshold: 10 * 1024,     // Сжимать данные больше 10KB
    cleanupInterval: 5 * 60 * 1000,      // Очистка каждые 5 минут
    defaultTTL: 60 * 60 * 1000           // 1 час по умолчанию
  };
  
  // IndexedDB
  private dbName = 'AnimeStarsCache';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;
  
  private constructor() {
    this.initIndexedDB();
    this.startCleanupTimer();
  }

  /**
   * Получает singleton экземпляр кэша
   */
  static getInstance(): OptimizedCache {
    if (!OptimizedCache.instance) {
      OptimizedCache.instance = new OptimizedCache();
    }
    return OptimizedCache.instance;
  }

  /**
   * Инициализирует IndexedDB
   */
  private async initIndexedDB(): Promise<void> {
    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);
        
        request.onerror = () => {
          console.warn('Failed to open IndexedDB:', request.error);
          reject(request.error);
        };
        
        request.onsuccess = () => {
          this.db = request.result;
          console.log('📦 IndexedDB cache initialized');
          resolve();
        };
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          
          // Создаем object store для кэша
          if (!db.objectStoreNames.contains('cache')) {
            const store = db.createObjectStore('cache', { keyPath: 'key' });
            store.createIndex('expires', 'expires', { unique: false });
            store.createIndex('priority', 'priority', { unique: false });
          }
        };
      });
    } catch (error) {
      console.warn('IndexedDB not available, using fallback caching');
    }
  }

  /**
   * Запускает таймер очистки кэша
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Получает данные из кэша
   */
  async get<T = any>(key: string): Promise<T | null> {
    this.stats.totalRequests++;
    const now = Date.now();
    
    try {
      // 1. Проверяем memory cache
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && now < memoryEntry.expires) {
        memoryEntry.accessCount++;
        memoryEntry.lastAccess = now;
        this.stats.totalHits++;
        this.stats.memoryHits++;
        
        const data = memoryEntry.compressed 
          ? this.decompress(memoryEntry.data)
          : memoryEntry.data;
        
        console.log(`💾 Memory cache hit: ${key}`);
        return data;
      }
      
      // Удаляем устаревшую запись из памяти
      if (memoryEntry) {
        this.memoryCache.delete(key);
      }
      
      // 2. Проверяем IndexedDB
      const indexedDBEntry = await this.getFromIndexedDB(key);
      if (indexedDBEntry && now < indexedDBEntry.expires) {
        // Перемещаем в memory cache для быстрого доступа
        this.setMemoryCache(key, indexedDBEntry);
        
        this.stats.totalHits++;
        this.stats.indexedDBHits++;
        
        const data = indexedDBEntry.compressed
          ? this.decompress(indexedDBEntry.data)
          : indexedDBEntry.data;
        
        console.log(`🗄️ IndexedDB cache hit: ${key}`);
        return data;
      }
      
      // 3. Проверяем sessionStorage
      const sessionEntry = this.getFromSessionStorage(key);
      if (sessionEntry && now < sessionEntry.expires) {
        // Перемещаем в memory cache
        this.setMemoryCache(key, sessionEntry);
        
        this.stats.totalHits++;
        this.stats.sessionHits++;
        
        const data = sessionEntry.compressed
          ? this.decompress(sessionEntry.data)
          : sessionEntry.data;
        
        console.log(`📋 Session cache hit: ${key}`);
        return data;
      }
      
      // 4. Проверяем localStorage
      const localEntry = this.getFromLocalStorage(key);
      if (localEntry && now < localEntry.expires) {
        // Перемещаем в memory cache
        this.setMemoryCache(key, localEntry);
        
        this.stats.totalHits++;
        this.stats.localHits++;
        
        const data = localEntry.compressed
          ? this.decompress(localEntry.data)
          : localEntry.data;
        
        console.log(`💿 Local cache hit: ${key}`);
        return data;
      }
      
    } catch (error) {
      console.warn(`Cache get error for ${key}:`, error);
    }
    
    return null;
  }

  /**
   * Сохраняет данные в кэш
   */
  async set<T = any>(
    key: string, 
    data: T, 
    options: CacheOptions = {}
  ): Promise<void> {
    const now = Date.now();
    const ttl = options.ttl ?? this.config.defaultTTL;
    const expires = now + ttl;
    const priority = this.getPriorityValue(options.priority ?? 'normal');
    
    try {
      // Вычисляем размер данных
      const serializedData = JSON.stringify(data);
      const size = new Blob([serializedData]).size;
      
      // Определяем нужно ли сжимать
      const shouldCompress = options.compress !== false && size > this.config.compressionThreshold;
      const finalData = shouldCompress ? this.compress(data) : data;
      
      const entry: CacheEntry = {
        key,
        data: finalData,
        timestamp: now,
        expires,
        priority,
        size,
        compressed: shouldCompress,
        accessCount: 1,
        lastAccess: now
      };
      
      // Всегда сохраняем в memory cache
      this.setMemoryCache(key, entry);
      
      // Сохраняем в постоянное хранилище если нужно
      if (options.persistent !== false) {
        await this.setPersistentCache(key, entry, options);
      }
      
      console.log(`💾 Cached: ${key} (${this.formatSize(size)}, TTL: ${this.formatDuration(ttl)})`);
      
    } catch (error) {
      console.warn(`Cache set error for ${key}:`, error);
    }
  }

  /**
   * Сохраняет в memory cache с управлением размером
   */
  private setMemoryCache(key: string, entry: CacheEntry): void {
    this.memoryCache.set(key, entry);
    
    // Проверяем лимиты памяти
    this.enforceMemoryLimits();
  }

  /**
   * Контролирует лимиты memory cache
   */
  private enforceMemoryLimits(): void {
    // Проверяем количество записей
    if (this.memoryCache.size > this.config.maxMemoryEntries) {
      this.evictMemoryEntries(this.memoryCache.size - this.config.maxMemoryEntries);
    }
    
    // Проверяем размер
    const totalSize = Array.from(this.memoryCache.values())
      .reduce((sum, entry) => sum + entry.size, 0);
    
    if (totalSize > this.config.maxMemorySize) {
      const targetSize = this.config.maxMemorySize * 0.8; // Освобождаем до 80%
      this.evictMemoryEntriesSize(totalSize - targetSize);
    }
  }

  /**
   * Удаляет записи из памяти по количеству
   */
  private evictMemoryEntries(count: number): void {
    // Сортируем по приоритету и времени доступа (LRU с приоритетами)
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => {
      // Сначала по приоритету (меньше = ниже приоритет)
      if (a[1].priority !== b[1].priority) {
        return a[1].priority - b[1].priority;
      }
      // Потом по времени последнего доступа (LRU)
      return a[1].lastAccess - b[1].lastAccess;
    });
    
    // Удаляем самые низкоприоритетные и старые
    for (let i = 0; i < count && i < entries.length; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
    
    console.log(`🗑️ Evicted ${count} entries from memory cache`);
  }

  /**
   * Удаляет записи из памяти по размеру
   */
  private evictMemoryEntriesSize(sizeToFree: number): void {
    const entries = Array.from(this.memoryCache.entries());
    entries.sort((a, b) => {
      if (a[1].priority !== b[1].priority) {
        return a[1].priority - b[1].priority;
      }
      return a[1].lastAccess - b[1].lastAccess;
    });
    
    let freedSize = 0;
    let evictedCount = 0;
    
    for (const [key, entry] of entries) {
      if (freedSize >= sizeToFree) break;
      
      this.memoryCache.delete(key);
      freedSize += entry.size;
      evictedCount++;
    }
    
    console.log(`🗑️ Evicted ${evictedCount} entries (${this.formatSize(freedSize)}) from memory`);
  }

  /**
   * Сохраняет в постоянный кэш
   */
  private async setPersistentCache(
    key: string, 
    entry: CacheEntry, 
    options: CacheOptions
  ): Promise<void> {
    const size = entry.size;
    
    // Большие данные в IndexedDB
    if (size > 100 * 1024 && this.db) { // > 100KB
      await this.setIndexedDB(key, entry);
    }
    // Средние данные в sessionStorage
    else if (size > 10 * 1024) { // > 10KB
      this.setSessionStorage(key, entry);
    }
    // Маленькие данные в localStorage
    else {
      this.setLocalStorage(key, entry);
    }
  }

  /**
   * Получает данные из IndexedDB
   */
  private async getFromIndexedDB(key: string): Promise<CacheEntry | null> {
    if (!this.db) return null;
    
    try {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['cache'], 'readonly');
        const store = transaction.objectStore('cache');
        const request = store.get(key);
        
        request.onsuccess = () => {
          resolve(request.result || null);
        };
        
        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.warn('IndexedDB get error:', error);
      return null;
    }
  }

  /**
   * Сохраняет данные в IndexedDB
   */
  private async setIndexedDB(key: string, entry: CacheEntry): Promise<void> {
    if (!this.db) return;
    
    try {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        const request = store.put(entry);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('IndexedDB set error:', error);
    }
  }

  /**
   * Получает данные из sessionStorage
   */
  private getFromSessionStorage(key: string): CacheEntry | null {
    try {
      const stored = sessionStorage.getItem(`cache_${key}`);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Сохраняет данные в sessionStorage
   */
  private setSessionStorage(key: string, entry: CacheEntry): void {
    try {
      sessionStorage.setItem(`cache_${key}`, JSON.stringify(entry));
    } catch (error) {
      // Session storage full, очищаем старые записи
      this.cleanupSessionStorage();
      try {
        sessionStorage.setItem(`cache_${key}`, JSON.stringify(entry));
      } catch (e) {
        console.warn('Session storage still full after cleanup');
      }
    }
  }

  /**
   * Получает данные из localStorage
   */
  private getFromLocalStorage(key: string): CacheEntry | null {
    try {
      const stored = localStorage.getItem(`cache_${key}`);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Сохраняет данные в localStorage
   */
  private setLocalStorage(key: string, entry: CacheEntry): void {
    try {
      localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
    } catch (error) {
      // Local storage full, очищаем старые записи
      this.cleanupLocalStorage();
      try {
        localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
      } catch (e) {
        console.warn('Local storage still full after cleanup');
      }
    }
  }

  /**
   * Удаляет запись из всех кэшей
   */
  async delete(key: string): Promise<void> {
    // Memory cache
    this.memoryCache.delete(key);
    
    // IndexedDB
    if (this.db) {
      try {
        const transaction = this.db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        store.delete(key);
      } catch (error) {
        console.warn('IndexedDB delete error:', error);
      }
    }
    
    // Session storage
    try {
      sessionStorage.removeItem(`cache_${key}`);
    } catch (error) {
      // Ignore
    }
    
    // Local storage
    try {
      localStorage.removeItem(`cache_${key}`);
    } catch (error) {
      // Ignore
    }
  }

  /**
   * Очищает весь кэш
   */
  async clear(): Promise<void> {
    // Memory cache
    this.memoryCache.clear();
    
    // IndexedDB
    if (this.db) {
      try {
        const transaction = this.db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        store.clear();
      } catch (error) {
        console.warn('IndexedDB clear error:', error);
      }
    }
    
    // Session storage
    this.cleanupSessionStorage(true);
    
    // Local storage
    this.cleanupLocalStorage(true);
    
    console.log('🗑️ All caches cleared');
  }

  /**
   * Очищает устаревшие записи
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    let cleanedCount = 0;
    
    // Memory cache cleanup
    for (const [key, entry] of this.memoryCache) {
      if (now >= entry.expires) {
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }
    
    // IndexedDB cleanup
    if (this.db) {
      try {
        const transaction = this.db.transaction(['cache'], 'readwrite');
        const store = transaction.objectStore('cache');
        const index = store.index('expires');
        const range = IDBKeyRange.upperBound(now);
        const deleteRequest = index.openCursor(range);
        
        deleteRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cleanedCount++;
            cursor.continue();
          }
        };
      } catch (error) {
        console.warn('IndexedDB cleanup error:', error);
      }
    }
    
    // Storage cleanup
    this.cleanupSessionStorage();
    this.cleanupLocalStorage();
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleanup completed: ${cleanedCount} expired entries removed`);
    }
  }

  /**
   * Очищает sessionStorage
   */
  private cleanupSessionStorage(clearAll = false): void {
    const now = Date.now();
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('cache_')) {
        if (clearAll) {
          keysToRemove.push(key);
        } else {
          try {
            const entry = JSON.parse(sessionStorage.getItem(key)!);
            if (entry && now >= entry.expires) {
              keysToRemove.push(key);
            }
          } catch (error) {
            keysToRemove.push(key); // Удаляем поврежденные записи
          }
        }
      }
    }
    
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
  }

  /**
   * Очищает localStorage
   */
  private cleanupLocalStorage(clearAll = false): void {
    const now = Date.now();
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cache_')) {
        if (clearAll) {
          keysToRemove.push(key);
        } else {
          try {
            const entry = JSON.parse(localStorage.getItem(key)!);
            if (entry && now >= entry.expires) {
              keysToRemove.push(key);
            }
          } catch (error) {
            keysToRemove.push(key);
          }
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  /**
   * Сжимает данные (простая JSON минификация)
   */
  private compress(data: any): string {
    return JSON.stringify(data);
  }

  /**
   * Распаковывает данные
   */
  private decompress(data: string): any {
    return JSON.parse(data);
  }

  /**
   * Конвертирует приоритет в число
   */
  private getPriorityValue(priority: 'low' | 'normal' | 'high'): number {
    switch (priority) {
      case 'low': return 1;
      case 'normal': return 2;
      case 'high': return 3;
      default: return 2;
    }
  }

  /**
   * Форматирует размер файла
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  /**
   * Форматирует длительность
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  /**
   * Получает статистику кэша
   */
  getStats(): CacheStats {
    const memorySize = Array.from(this.memoryCache.values())
      .reduce((sum, entry) => sum + entry.size, 0);
    
    const hitRate = this.stats.totalRequests > 0 
      ? (this.stats.totalHits / this.stats.totalRequests) * 100 
      : 0;
    
    return {
      memoryEntries: this.memoryCache.size,
      memorySize: Math.round(memorySize / 1024), // в KB
      indexedDBEntries: 0, // TODO: подсчитать асинхронно
      sessionEntries: this.countStorageEntries(sessionStorage),
      localEntries: this.countStorageEntries(localStorage),
      hitRate: Math.round(hitRate * 100) / 100,
      totalRequests: this.stats.totalRequests,
      totalHits: this.stats.totalHits
    };
  }

  /**
   * Подсчитывает записи в storage
   */
  private countStorageEntries(storage: Storage): number {
    let count = 0;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith('cache_')) {
        count++;
      }
    }
    return count;
  }
}

// Создаем глобальный экземпляр кэша
export const globalCache = OptimizedCache.getInstance();

// Утилитарные функции для удобства
export const cache = {
  get: <T = any>(key: string) => globalCache.get<T>(key),
  set: <T = any>(key: string, data: T, options?: CacheOptions) => globalCache.set(key, data, options),
  delete: (key: string) => globalCache.delete(key),
  clear: () => globalCache.clear(),
  stats: () => globalCache.getStats()
};

// Специальные функции для Kodik токена (для совместимости)
export async function getKodikToken(): Promise<string | null> {
  return await globalCache.get<string>('kodik_token');
}

export async function cacheKodikToken(token: string): Promise<void> {
  await globalCache.set('kodik_token', token, {
    ttl: 60 * 60 * 1000, // 1 час
    persistent: true,
    priority: 'high'
  });
}
