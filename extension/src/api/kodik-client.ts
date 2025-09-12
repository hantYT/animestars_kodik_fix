// Главный клиент для работы с Kodik API
// Портирован из Python KodikParser

import { 
  KodikApiResponse, 
  KodikSearchParams, 
  KodikElement,
  IDType
} from '../types/kodik';
import { isValidKodikToken } from '../utils/url-parser';
import { getKodikToken, cacheKodikToken } from '../utils/cache';
import { decryptKodikUrl, getVideoLinks, extractVideoDataFromPage } from '../utils/decryption';

export class KodikAPI {
  private token: string | null = null;
  private readonly baseUrl = 'https://kodikapi.com';

  constructor(token?: string) {
    if (token && isValidKodikToken(token)) {
      this.token = token;
    }
  }

  /**
   * Получает токен Kodik автоматически
   * Портирован из get_token в Python
   */
  async getToken(): Promise<string> {
    try {
      // Сначала проверяем кэш
      const cachedToken = await getKodikToken();
      if (cachedToken && isValidKodikToken(cachedToken)) {
        this.token = cachedToken;
        return cachedToken;
      }

      // Получаем токен с сервера
      const scriptUrl = 'https://kodik-add.com/add-players.min.js?v=2';
      const response = await fetch(scriptUrl);
      const scriptText = await response.text();
      
      const tokenStart = scriptText.indexOf('token=') + 7;
      const tokenEnd = scriptText.indexOf('"', tokenStart);
      const token = scriptText.substring(tokenStart, tokenEnd);
      
      if (!isValidKodikToken(token)) {
        throw new Error('Invalid token received');
      }

      // Кэшируем токен
      await cacheKodikToken(token);
      this.token = token;
      
      return token;
    } catch (error) {
      console.error('Error getting Kodik token:', error);
      throw new Error('Failed to get Kodik token');
    }
  }

  /**
   * Выполняет запрос к Kodik API
   */
  private async apiRequest(
    endpoint: 'search' | 'list' | 'translations',
    params: Partial<KodikSearchParams> = {}
  ): Promise<KodikApiResponse> {
    if (!this.token) {
      await this.getToken();
    }

    const url = `${this.baseUrl}/${endpoint}`;
    const formData = new FormData();
    
    // Добавляем токен
    formData.append('token', this.token!);
    
    // Добавляем параметры
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        formData.append(key, value.toString());
      }
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        if (data.error === 'Отсутствует или неверный токен') {
          // Токен истек, получаем новый
          this.token = null;
          return this.apiRequest(endpoint, params);
        }
        throw new Error(data.error);
      }

      if (data.total === 0) {
        throw new Error('No results found');
      }

      return data;
    } catch (error) {
      console.error(`Kodik API ${endpoint} error:`, error);
      throw error;
    }
  }

  /**
   * Поиск по названию
   */
  async search(
    title: string, 
    options: Partial<KodikSearchParams> = {}
  ): Promise<KodikApiResponse> {
    const params: Partial<KodikSearchParams> = {
      title: title + ' ', // Добавляем пробел как в Python версии
      limit: 50,
      with_material_data: true,
      strict: false,
      ...options
    };
    
    return this.apiRequest('search', params);
  }

  /**
   * Поиск по ID
   */
  async searchById(
    id: string, 
    idType: IDType, 
    options: Partial<KodikSearchParams> = {}
  ): Promise<KodikApiResponse> {
    const params: Partial<KodikSearchParams> = {
      [`${idType}_id`]: id,
      limit: 50,
      with_material_data: true,
      ...options
    };
    
    return this.apiRequest('search', params);
  }

  /**
   * Получает список переводов для медиа
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

  /**
   * Получает информацию о медиа (переводы и количество серий)
   * Портирован из get_info в Python
   */
  async getInfo(id: string, idType: IDType): Promise<{
    series_count: number;
    translations: Array<{
      id: string;
      type: string;
      name: string;
    }>;
  }> {
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
      
      return {
        series_count: seriesCount,
        translations
      };
    } catch (error) {
      console.error('Error getting info:', error);
      throw error;
    }
  }

  /**
   * Получает ссылку на embed страницу
   */
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

  /**
   * Проверяет является ли ссылка сериалом
   */
  private isSerial(url: string): boolean {
    const infoIndex = url.indexOf('.info/');
    return infoIndex !== -1 && url[infoIndex + 6] === 's';
  }

  /**
   * Проверяет является ли ссылка видео
   */
  private isVideo(url: string): boolean {
    const infoIndex = url.indexOf('.info/');
    return infoIndex !== -1 && url[infoIndex + 6] === 'v';
  }

  /**
   * Генерирует словарь переводов из DOM элемента
   */
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
   * Получает прямую ссылку на видео
   * Портирован из get_link в Python
   */
  async getVideoUrl(
    id: string, 
    idType: IDType, 
    episode: number, 
    translationId: string
  ): Promise<{ url: string; maxQuality: number }> {
    try {
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
      
      // Убираем протокол из URL
      const cleanUrl = result.url.replace('https:', '');
      const baseUrl = cleanUrl.substring(0, cleanUrl.lastIndexOf('/') + 1);
      
      return {
        url: baseUrl,
        maxQuality: result.maxQuality
      };
    } catch (error) {
      console.error('Error getting video URL:', error);
      throw error;
    }
  }
}

// Создаем глобальный экземпляр API клиента
export const kodikAPI = new KodikAPI();
