// HLS манифест парсер для работы с видео сегментами
// Портирован из Python fast_download.py

import { HLSManifest, HLSSegment, QualityLevel } from '../types/kodik';

export class HLSParser {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  }

  /**
   * Парсит master playlist и возвращает доступные качества
   * Портирован из fast_download.parse_m3u8_string
   */
  async parseMasterPlaylist(manifestUrl: string): Promise<QualityLevel[]> {
    try {
      const response = await fetch(manifestUrl);
      const content = await response.text();
      
      const lines = content.split('\n');
      const qualities: QualityLevel[] = [];
      let currentResolution: string | null = null;
      let currentBandwidth: number | null = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          // Извлекаем разрешение
          const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
          if (resolutionMatch) {
            currentResolution = resolutionMatch[1];
          }
          
          // Извлекаем битрейт
          const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
          if (bandwidthMatch) {
            currentBandwidth = parseInt(bandwidthMatch[1]);
          }
          
          // Следующая строка должна содержать URL плейлиста
          if (i + 1 < lines.length) {
            const playlistUrl = lines[i + 1].trim();
            if (playlistUrl && !playlistUrl.startsWith('#')) {
              const fullUrl = this.resolveUrl(playlistUrl);
              const qualityName = this.extractQualityFromResolution(currentResolution);
              
              qualities.push({
                quality: qualityName,
                resolution: currentResolution || 'unknown',
                bandwidth: currentBandwidth || 0,
                url: fullUrl
              });
              
              currentResolution = null;
              currentBandwidth = null;
            }
          }
        }
      }
      
      // Сортируем по качеству (по убыванию)
      qualities.sort((a, b) => {
        const aHeight = parseInt(a.resolution.split('x')[1] || '0');
        const bHeight = parseInt(b.resolution.split('x')[1] || '0');
        return bHeight - aHeight;
      });
      
      return qualities;
    } catch (error) {
      console.error('Error parsing master playlist:', error);
      throw new Error('Failed to parse master playlist');
    }
  }

  /**
   * Парсит playlist для конкретного качества и возвращает сегменты
   */
  async parseQualityPlaylist(playlistUrl: string): Promise<HLSManifest> {
    try {
      const response = await fetch(playlistUrl);
      const content = await response.text();
      
      const lines = content.split('\n');
      const segments: HLSSegment[] = [];
      let targetDuration = 0;
      let sequence = 0;
      let currentDuration: number | null = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('#EXT-X-TARGETDURATION:')) {
          targetDuration = parseInt(line.split(':')[1]);
        } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
          sequence = parseInt(line.split(':')[1]);
        } else if (line.startsWith('#EXTINF:')) {
          // Извлекаем длительность сегмента
          const durationMatch = line.match(/#EXTINF:([\d.]+)/);
          if (durationMatch) {
            currentDuration = parseFloat(durationMatch[1]);
          }
          
          // Следующая строка должна содержать URL сегмента
          if (i + 1 < lines.length) {
            const segmentUrl = lines[i + 1].trim();
            if (segmentUrl && !segmentUrl.startsWith('#')) {
              const fullUrl = this.resolveUrl(segmentUrl);
              
              segments.push({
                url: fullUrl,
                duration: currentDuration || 0,
                sequence: sequence + segments.length
              });
              
              currentDuration = null;
            }
          }
        }
      }
      
      return {
        segments,
        targetDuration,
        totalDuration: segments.reduce((sum, seg) => sum + (seg.duration || 0), 0),
        segmentCount: segments.length
      };
    } catch (error) {
      console.error('Error parsing quality playlist:', error);
      throw new Error('Failed to parse quality playlist');
    }
  }

  /**
   * Разрешает относительные URL относительно базового URL
   */
  private resolveUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    
    if (url.startsWith('/')) {
      // Абсолютный путь
      const baseUrlParts = this.baseUrl.split('/');
      const origin = baseUrlParts.slice(0, 3).join('/');
      return origin + url;
    }
    
    // Относительный путь
    return this.baseUrl + url;
  }

  /**
   * Извлекает название качества из разрешения
   */
  private extractQualityFromResolution(resolution: string | null): string {
    if (!resolution) return 'unknown';
    
    const height = parseInt(resolution.split('x')[1] || '0');
    
    if (height >= 2160) return '4K';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    if (height >= 240) return '240p';
    
    return `${height}p`;
  }

  /**
   * Получает URL для скачивания конкретного сегмента
   */
  getSegmentUrl(segmentIndex: number, manifest: HLSManifest): string | null {
    if (segmentIndex < 0 || segmentIndex >= manifest.segments.length) {
      return null;
    }
    
    return manifest.segments[segmentIndex].url;
  }

  /**
   * Получает информацию о сегменте по индексу
   */
  getSegmentInfo(segmentIndex: number, manifest: HLSManifest): HLSSegment | null {
    if (segmentIndex < 0 || segmentIndex >= manifest.segments.length) {
      return null;
    }
    
    return manifest.segments[segmentIndex];
  }

  /**
   * Проверяет является ли плейлист live-стримом
   */
  isLiveStream(content: string): boolean {
    return !content.includes('#EXT-X-ENDLIST');
  }

  /**
   * Получает лучшее доступное качество
   */
  getBestQuality(qualities: QualityLevel[]): QualityLevel | null {
    if (qualities.length === 0) return null;
    
    // Качества уже отсортированы по убыванию в parseMasterPlaylist
    return qualities[0];
  }

  /**
   * Находит качество по названию
   */
  findQualityByName(qualities: QualityLevel[], qualityName: string): QualityLevel | null {
    return qualities.find(q => q.quality === qualityName) || null;
  }
}

/**
 * Утилитарные функции для работы с HLS
 */
export class HLSUtils {
  /**
   * Скачивает сегмент видео
   */
  static async downloadSegment(url: string): Promise<ArrayBuffer> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.arrayBuffer();
    } catch (error) {
      console.error('Error downloading segment:', error);
      throw error;
    }
  }

  /**
   * Получает размер сегмента без скачивания
   */
  static async getSegmentSize(url: string): Promise<number> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentLength = response.headers.get('content-length');
      return contentLength ? parseInt(contentLength) : 0;
    } catch (error) {
      console.error('Error getting segment size:', error);
      return 0;
    }
  }

  /**
   * Проверяет доступность сегмента
   */
  static async isSegmentAvailable(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Извлекает базовый URL из URL плейлиста
   */
  static extractBaseUrl(playlistUrl: string): string {
    const lastSlashIndex = playlistUrl.lastIndexOf('/');
    if (lastSlashIndex === -1) return playlistUrl;
    return playlistUrl.substring(0, lastSlashIndex + 1);
  }
}
