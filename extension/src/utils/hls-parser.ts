// Оптимизированный HLS парсер с предзагрузкой и адаптивным битрейтом
// Включает segment prefetching, качество видео, CDN оптимизацию

export interface HLSQuality {
  height: number;
  bandwidth: number;
  url: string;
  codecs?: string;
}

export interface HLSSegment {
  url: string;
  duration: number;
  byteRange?: { start: number; end: number };
}

export interface OptimizedHLSConfig {
  enablePrefetching: boolean;
  prefetchSegments: number;
  adaptiveBitrate: boolean;
  maxQuality: number;
  networkSpeedTest: boolean;
  cdnOptimization: boolean;
}

export class OptimizedHLSParser {
  private config: OptimizedHLSConfig;
  private networkSpeed: number = 0; // Мбит/с
  private segmentCache = new Map<string, ArrayBuffer>();
  private prefetchQueue: string[] = [];
  private isPrefetching = false;
  
  // CDN endpoints для оптимизации
  private static CDN_ENDPOINTS = [
    'cloud.kodik-storage.com',
    'cdn.kodik-storage.com',
    'cache.kodik.info'
  ];

  constructor(config: Partial<OptimizedHLSConfig> = {}) {
    this.config = {
      enablePrefetching: true,
      prefetchSegments: 3,
      adaptiveBitrate: true,
      maxQuality: 720,
      networkSpeedTest: true,
      cdnOptimization: true,
      ...config
    };

    if (this.config.networkSpeedTest) {
      this.measureNetworkSpeed();
    }
  }

  /**
   * Парсит HLS манифест с оптимизацией
   */
  async parseManifest(manifestUrl: string): Promise<{
    qualities: HLSQuality[];
    segments: HLSSegment[];
    bestQuality: HLSQuality;
    duration: number;
  }> {
    console.log('🎬 Parsing HLS manifest with optimizations...');
    
    try {
      // Оптимизируем URL для лучшего CDN
      const optimizedUrl = this.optimizeManifestUrl(manifestUrl);
      
      // Загружаем главный манифест
      const manifestContent = await this.fetchWithRetry(optimizedUrl);
      
      // Парсим качества
      const qualities = this.parseQualities(manifestContent, optimizedUrl);
      
      // Выбираем лучшее качество на основе сети и настроек
      const bestQuality = this.selectBestQuality(qualities);
      
      // Загружаем манифест выбранного качества
      const qualityManifestContent = await this.fetchWithRetry(bestQuality.url);
      
      // Парсим сегменты
      const segments = this.parseSegments(qualityManifestContent, bestQuality.url);
      
      // Вычисляем общую продолжительность
      const duration = segments.reduce((total, segment) => total + segment.duration, 0);
      
      // Запускаем предзагрузку если включена
      if (this.config.enablePrefetching && segments.length > 0) {
        this.startPrefetching(segments);
      }
      
      console.log(`✅ HLS manifest parsed: ${qualities.length} qualities, ${segments.length} segments, ${duration.toFixed(1)}s`);
      
      return {
        qualities,
        segments,
        bestQuality,
        duration
      };
      
    } catch (error) {
      console.error('❌ Failed to parse HLS manifest:', error);
      throw error;
    }
  }

  /**
   * Оптимизирует URL манифеста для лучшего CDN
   */
  private optimizeManifestUrl(url: string): string {
    if (!this.config.cdnOptimization) return url;
    
    try {
      const urlObj = new URL(url);
      const currentHost = urlObj.hostname;
      
      // Если уже используем оптимальный CDN, оставляем как есть
      if (OptimizedHLSParser.CDN_ENDPOINTS.includes(currentHost)) {
        return url;
      }
      
      // Пробуем заменить на более быстрый CDN
      const preferredCDN = OptimizedHLSParser.CDN_ENDPOINTS[0];
      urlObj.hostname = preferredCDN;
      
      console.log(`🚀 CDN optimization: ${currentHost} → ${preferredCDN}`);
      return urlObj.toString();
      
    } catch (error) {
      console.warn('Failed to optimize manifest URL:', error);
      return url;
    }
  }

  /**
   * Загружает контент с retry логикой
   */
  private async fetchWithRetry(url: string, maxRetries = 3): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Cache-Control': 'no-cache'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.text();
        
      } catch (error) {
        console.warn(`Fetch attempt ${attempt}/${maxRetries} failed:`, error);
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 500));
      }
    }
    
    throw new Error('Unexpected error in fetch retry loop');
  }

  /**
   * Парсит качества из главного манифеста
   */
  private parseQualities(manifestContent: string, baseUrl: string): HLSQuality[] {
    const qualities: HLSQuality[] = [];
    const lines = manifestContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const nextLine = lines[i + 1]?.trim();
        if (!nextLine || nextLine.startsWith('#')) continue;
        
        // Парсим атрибуты
        const attributes = this.parseAttributes(line);
        
        const bandwidth = parseInt(attributes.BANDWIDTH) || 0;
        const resolution = attributes.RESOLUTION;
        const codecs = attributes.CODECS?.replace(/"/g, '');
        
        let height = 480; // по умолчанию
        if (resolution) {
          const match = resolution.match(/\d+x(\d+)/);
          if (match) {
            height = parseInt(match[1]);
          }
        }
        
        // Создаем абсолютный URL
        const qualityUrl = nextLine.startsWith('http') 
          ? nextLine 
          : new URL(nextLine, baseUrl).toString();
        
        qualities.push({
          height,
          bandwidth,
          url: qualityUrl,
          codecs
        });
      }
    }
    
    // Сортируем по качеству (высота разрешения)
    qualities.sort((a, b) => b.height - a.height);
    
    console.log(`📊 Found ${qualities.length} qualities:`, qualities.map(q => `${q.height}p (${Math.round(q.bandwidth/1000)}kbps)`));
    
    return qualities;
  }

  /**
   * Парсит атрибуты из строки манифеста
   */
  private parseAttributes(line: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const attrRegex = /([A-Z-]+)=("[^"]*"|[^,]*)/g;
    
    let match;
    while ((match = attrRegex.exec(line)) !== null) {
      attributes[match[1]] = match[2];
    }
    
    return attributes;
  }

  /**
   * Выбирает лучшее качество на основе сети и настроек
   */
  private selectBestQuality(qualities: HLSQuality[]): HLSQuality {
    if (qualities.length === 0) {
      throw new Error('No qualities available');
    }
    
    // Фильтруем по максимальному качеству из настроек
    const filteredQualities = qualities.filter(q => q.height <= this.config.maxQuality);
    const availableQualities = filteredQualities.length > 0 ? filteredQualities : qualities;
    
    if (!this.config.adaptiveBitrate || this.networkSpeed === 0) {
      // Просто берем лучшее доступное качество
      const selected = availableQualities[0];
      console.log(`🎯 Selected quality: ${selected.height}p (${Math.round(selected.bandwidth/1000)}kbps)`);
      return selected;
    }
    
    // Адаптивный выбор на основе скорости сети
    const targetBandwidth = this.networkSpeed * 1000000 * 0.8; // 80% от скорости сети
    
    // Находим лучшее качество, которое не превышает целевую полосу
    let bestQuality = availableQualities[availableQualities.length - 1]; // минимальное как fallback
    
    for (const quality of availableQualities) {
      if (quality.bandwidth <= targetBandwidth) {
        bestQuality = quality;
        break;
      }
    }
    
    console.log(`🎯 Adaptive quality selected: ${bestQuality.height}p (${Math.round(bestQuality.bandwidth/1000)}kbps) for ${this.networkSpeed.toFixed(1)}Mbps network`);
    return bestQuality;
  }

  /**
   * Парсит сегменты из манифеста качества
   */
  private parseSegments(manifestContent: string, baseUrl: string): HLSSegment[] {
    const segments: HLSSegment[] = [];
    const lines = manifestContent.split('\n');
    
    let currentDuration = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXTINF:')) {
        // Парсим продолжительность сегмента
        const durationMatch = line.match(/#EXTINF:([0-9.]+)/);
        if (durationMatch) {
          currentDuration = parseFloat(durationMatch[1]);
        }
      } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
        // TODO: Поддержка byte range если нужно
        continue;
      } else if (line && !line.startsWith('#')) {
        // Это URL сегмента
        const segmentUrl = line.startsWith('http') 
          ? line 
          : new URL(line, baseUrl).toString();
        
        segments.push({
          url: segmentUrl,
          duration: currentDuration
        });
        
        currentDuration = 0;
      }
    }
    
    console.log(`📦 Parsed ${segments.length} segments, avg duration: ${(segments.reduce((sum, s) => sum + s.duration, 0) / segments.length).toFixed(1)}s`);
    
    return segments;
  }

  /**
   * Измеряет скорость сети
   */
  private async measureNetworkSpeed(): Promise<void> {
    try {
      console.log('📊 Measuring network speed...');
      
      // Используем небольшой тестовый файл
      const testUrl = 'https://cloud.kodik-storage.com/test.jpg'; // Предполагаемый тестовый файл
      const testSize = 100 * 1024; // 100KB
      
      const startTime = performance.now();
      
      const response = await fetch(testUrl, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache'
        }
      });
      
      if (response.ok) {
        await response.arrayBuffer();
        const endTime = performance.now();
        const duration = (endTime - startTime) / 1000; // в секундах
        this.networkSpeed = (testSize * 8) / (duration * 1000000); // Мбит/с
        
        console.log(`📡 Network speed: ${this.networkSpeed.toFixed(1)} Mbps`);
      }
    } catch (error) {
      console.warn('Failed to measure network speed:', error);
      this.networkSpeed = 5; // Предполагаем среднюю скорость
    }
  }

  /**
   * Запускает предзагрузку сегментов
   */
  private startPrefetching(segments: HLSSegment[]): void {
    if (this.isPrefetching || segments.length === 0) return;
    
    console.log(`🚀 Starting prefetch for ${this.config.prefetchSegments} segments`);
    
    this.isPrefetching = true;
    this.prefetchQueue = segments.slice(0, this.config.prefetchSegments).map(s => s.url);
    
    // Запускаем предзагрузку в фоне
    this.prefetchNext();
  }

  /**
   * Предзагружает следующий сегмент
   */
  private async prefetchNext(): Promise<void> {
    if (this.prefetchQueue.length === 0) {
      this.isPrefetching = false;
      return;
    }
    
    const url = this.prefetchQueue.shift()!;
    
    try {
      // Проверяем, не загружен ли уже
      if (this.segmentCache.has(url)) {
        this.prefetchNext();
        return;
      }
      
      console.log(`⬇️ Prefetching segment: ${url.split('/').pop()}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'max-age=3600'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.arrayBuffer();
        this.segmentCache.set(url, data);
        console.log(`✅ Prefetched: ${url.split('/').pop()} (${(data.byteLength / 1024).toFixed(1)}KB)`);
      }
      
    } catch (error) {
      console.warn(`❌ Prefetch failed for ${url}:`, error);
    }
    
    // Продолжаем с следующим сегментом
    setTimeout(() => this.prefetchNext(), 100);
  }

  /**
   * Получает сегмент (из кэша или загружает)
   */
  async getSegment(url: string): Promise<ArrayBuffer> {
    // Проверяем кэш
    const cached = this.segmentCache.get(url);
    if (cached) {
      console.log(`💾 Cache hit for segment: ${url.split('/').pop()}`);
      return cached;
    }
    
    // Загружаем сегмент
    console.log(`⬇️ Loading segment: ${url.split('/').pop()}`);
    
    const response = await this.fetchWithRetry(url);
    const buffer = await fetch(url).then(r => r.arrayBuffer());
    
    // Кэшируем для будущего использования
    this.segmentCache.set(url, buffer);
    
    return buffer;
  }

  /**
   * Очищает кэш сегментов
   */
  clearCache(): void {
    this.segmentCache.clear();
    console.log('🗑️ Segment cache cleared');
  }

  /**
   * Получает статистику кэша
   */
  getCacheStats(): {
    cachedSegments: number;
    cacheSize: number;
    isPrefetching: boolean;
    networkSpeed: number;
  } {
    const cacheSize = Array.from(this.segmentCache.values())
      .reduce((total, buffer) => total + buffer.byteLength, 0);
    
    return {
      cachedSegments: this.segmentCache.size,
      cacheSize: Math.round(cacheSize / 1024), // в KB
      isPrefetching: this.isPrefetching,
      networkSpeed: this.networkSpeed
    };
  }

  /**
   * Обновляет конфигурацию
   */
  updateConfig(newConfig: Partial<OptimizedHLSConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('⚙️ HLS config updated:', this.config);
  }
}

// Утилитарные функции для работы с HLS
export class HLSUtils {
  /**
   * Проверяет поддержку HLS в браузере
   */
  static isHLSSupported(): boolean {
    return !!(window as any).Hls?.isSupported();
  }

  /**
   * Проверяет нативную поддержку HLS
   */
  static isNativeHLSSupported(): boolean {
    const video = document.createElement('video');
    return video.canPlayType('application/vnd.apple.mpegurl') !== '';
  }

  /**
   * Получает информацию о качестве из URL
   */
  static getQualityFromUrl(url: string): number {
    const match = url.match(/(\d+)p/);
    return match ? parseInt(match[1]) : 480;
  }

  /**
   * Форматирует размер файла
   */
  static formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  /**
   * Форматирует длительность
   */
  static formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// Экспорт для использования
export { OptimizedHLSParser as HLSParser };
