// Парсер для извлечения информации об аниме с сайтов animestars.org и asstars.tv
import { AnimeInfo } from '../types/progress';

export class AnimeParser {
  /**
   * Извлекает информацию об аниме с текущей страницы
   */
  static extractAnimeInfo(): AnimeInfo | null {
    try {
      console.log('🔍 Extracting anime info from page:', window.location.href);
      
      // Попытка извлечь ID из URL
      const animeId = this.extractAnimeId(window.location.href);
      
      if (!animeId) {
        console.warn('⚠️ Could not extract anime ID from URL');
        return null;
      }

      // Извлечение названия аниме
      const title = this.extractTitle();
      
      // Извлечение номера текущей серии
      const currentEpisode = this.extractCurrentEpisode();
      
      // Извлечение общего количества серий
      const totalEpisodes = this.extractTotalEpisodes();
      
      // Извлечение ID перевода
      const translationId = this.extractTranslationId();

      const animeInfo: AnimeInfo = {
        id: animeId,
        title: title || 'Unknown Anime',
        currentEpisode: currentEpisode || 1,
        totalEpisodes: totalEpisodes || undefined,
        translationId: translationId || undefined,
        url: window.location.href
      };
      
      console.log('📺 Extracted anime info:', animeInfo);
      return animeInfo;
    } catch (error) {
      console.error('❌ Failed to extract anime info:', error);
      return null;
    }
  }

  /**
   * Извлекает ID аниме из URL или страницы
   */
  private static extractAnimeId(url: string): string | null {
    console.log('🔍 Extracting anime ID from URL:', url);
    
    // Паттерны для разных форматов URL на animestars и asstars
    const patterns = [
      // animestars.org/anime/12345-name
      /\/anime\/(\d+)(?:-[^\/]*)?/,
      // animestars.org/watch/12345
      /\/watch\/(\d+)/,
      // animestars.org/title/12345
      /\/title\/(\d+)/,
      // asstars.tv/anime/12345
      /asstars\.tv\/anime\/(\d+)/,
      // Общие паттерны
      /anime[_-]?(\d+)/i,
      /watch[_-]?(\d+)/i,
      /id[=:](\d+)/i,
      // Паттерн для параметров
      /[\?&]id=(\d+)/,
      /[\?&]anime_id=(\d+)/,
      /[\?&]serial_id=(\d+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        console.log('✅ Found anime ID via pattern:', pattern, '→', match[1]);
        return match[1];
      }
    }

    // Поиск в мета-тегах
    const metaSelectors = [
      'meta[name="anime-id"]',
      'meta[property="anime:id"]',
      'meta[name="id"]',
      'meta[property="og:id"]'
    ];
    
    for (const selector of metaSelectors) {
      const meta = document.querySelector(selector);
      if (meta) {
        const content = meta.getAttribute('content');
        if (content && /^\d+$/.test(content)) {
          console.log('✅ Found anime ID in meta tag:', selector, '→', content);
          return content;
        }
      }
    }

    // Поиск в data атрибутах
    const dataSelectors = [
      '[data-anime-id]',
      '[data-id]',
      '[data-serial-id]',
      '[data-post-id]'
    ];
    
    for (const selector of dataSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const dataValue = element.getAttribute(selector.replace(/[\[\]]/g, '').replace('data-', ''));
        if (dataValue && /^\d+$/.test(dataValue)) {
          console.log('✅ Found anime ID in data attribute:', selector, '→', dataValue);
          return dataValue;
        }
      }
    }

    // Поиск в ссылках на странице
    const links = document.querySelectorAll('a[href*="anime/"], a[href*="watch/"], a[href*="title/"]');
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const href = link.getAttribute('href');
      if (href) {
        for (const pattern of patterns) {
          const match = href.match(pattern);
          if (match && match[1]) {
            console.log('✅ Found anime ID in page link:', href, '→', match[1]);
            return match[1];
          }
        }
      }
    }

    // Последняя попытка: поиск числового ID в JSON-LD или скриптах
    const scripts = document.querySelectorAll('script[type="application/ld+json"], script:not([src])');
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const content = script.textContent || '';
      
      // Поиск в JSON-LD
      if (script.getAttribute('type') === 'application/ld+json') {
        try {
          const data = JSON.parse(content);
          if (data.identifier && /^\d+$/.test(data.identifier)) {
            console.log('✅ Found anime ID in JSON-LD:', data.identifier);
            return data.identifier;
          }
        } catch (e) {
          // Игнорируем ошибки парсинга JSON
        }
      }
      
      // Поиск в переменных JavaScript
      const jsPatterns = [
        /anime_id['":\s]*(\d+)/i,
        /animeId['":\s]*(\d+)/i,
        /serial_id['":\s]*(\d+)/i,
        /post_id['":\s]*(\d+)/i,
        /news_id['":\s]*(\d+)/i
      ];
      
      for (const pattern of jsPatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          console.log('✅ Found anime ID in script:', pattern, '→', match[1]);
          return match[1];
        }
      }
    }

    console.log('❌ Could not extract anime ID');
    return null;
  }

  /**
   * Извлекает название аниме
   */
  private static extractTitle(): string | null {
    console.log('🔍 Extracting anime title');
    
    // Селекторы для названия аниме
    const titleSelectors = [
      'h1.anime-title',
      'h1.title',
      '.anime-title h1',
      '.title h1',
      'h1',
      '.anime-name',
      '.series-title',
      '.movie-title',
      '.entry-title',
      '.post-title',
      '[data-title]'
    ];

    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        let title = element.textContent?.trim();
        if (title && title.length > 2) {
          // Очищаем от лишних символов и текста
          title = title
            .replace(/^\d+\.\s*/, '') // Убираем номер в начале
            .replace(/\s*-\s*смотреть.*$/i, '') // Убираем "смотреть онлайн"
            .replace(/\s*-\s*аниме.*$/i, '') // Убираем "аниме онлайн"
            .replace(/\s*\|\s*.*$/i, '') // Убираем все после |
            .replace(/\s*\(\d{4}\).*$/, '') // Убираем год и что после него
            .trim();
          
          if (title.length > 2) {
            console.log('✅ Found anime title via selector:', selector, '→', title);
            return title;
          }
        }
      }
    }

    // Поиск в meta тегах
    const metaSelectors = [
      'meta[property="og:title"]',
      'meta[name="title"]',
      'meta[property="anime:title"]',
      'title'
    ];
    
    for (const selector of metaSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const content = element.getAttribute('content') || element.textContent;
        if (content) {
          let title = content.trim()
            .replace(/^\d+\.\s*/, '')
            .replace(/\s*-\s*смотреть.*$/i, '')
            .replace(/\s*-\s*аниме.*$/i, '')
            .replace(/\s*\|\s*.*$/i, '')
            .replace(/\s*\(\d{4}\).*$/, '')
            .trim();
          
          if (title.length > 2) {
            console.log('✅ Found anime title in meta:', selector, '→', title);
            return title;
          }
        }
      }
    }

    // Поиск в data атрибутах
    const dataElement = document.querySelector('[data-title]');
    if (dataElement) {
      const title = dataElement.getAttribute('data-title');
      if (title && title.length > 2) {
        console.log('✅ Found anime title in data attribute:', title);
        return title;
      }
    }

    console.log('❌ Could not extract anime title');
    return null;
  }

  /**
   * Извлекает номер текущей серии
   */
  private static extractCurrentEpisode(): number | null {
    console.log('🔍 Extracting current episode number');
    
    // Поиск в URL
    const url = window.location.href;
    const urlPatterns = [
      /episode[=\/](\d+)/i,
      /серия[=\/](\d+)/i,
      /ep[=\/](\d+)/i,
      /[\?&]episode=(\d+)/i,
      /[\?&]ep=(\d+)/i
    ];
    
    for (const pattern of urlPatterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        const episode = parseInt(match[1]);
        console.log('✅ Found episode number in URL:', episode);
        return episode;
      }
    }

    // Поиск в активных элементах (кнопки серий)
    const activeSelectors = [
      '.episode-list .active',
      '.episodes .active',
      '.episode.active',
      '.episode-btn.active',
      '[data-episode].active'
    ];
    
    for (const selector of activeSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        // Попробуем извлечь из data атрибута
        const dataEpisode = element.getAttribute('data-episode');
        if (dataEpisode) {
          const episode = parseInt(dataEpisode);
          if (!isNaN(episode)) {
            console.log('✅ Found episode number in active element data:', episode);
            return episode;
          }
        }
        
        // Попробуем извлечь из текста
        const text = element.textContent?.trim();
        if (text) {
          const match = text.match(/(\d+)/);
          if (match) {
            const episode = parseInt(match[1]);
            console.log('✅ Found episode number in active element text:', episode);
            return episode;
          }
        }
      }
    }

    // Поиск в селекторах серий
    const episodeSelectors = [
      'select[name="episode"] option:checked',
      '.episode-selector .selected',
      '.current-episode',
      '[data-current-episode]'
    ];
    
    for (const selector of episodeSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const value = element.getAttribute('value') || 
                     element.getAttribute('data-current-episode') ||
                     element.textContent;
        
        if (value) {
          const match = value.match(/(\d+)/);
          if (match) {
            const episode = parseInt(match[1]);
            console.log('✅ Found episode number in selector:', episode);
            return episode;
          }
        }
      }
    }

    // Поиск в заголовке страницы
    const title = document.title;
    const titlePatterns = [
      /серия\s*(\d+)/i,
      /episode\s*(\d+)/i,
      /ep\s*(\d+)/i,
      /\s(\d+)\s*серия/i,
      /\s(\d+)\s*episode/i
    ];
    
    for (const pattern of titlePatterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        const episode = parseInt(match[1]);
        console.log('✅ Found episode number in page title:', episode);
        return episode;
      }
    }

    console.log('❌ Could not extract current episode, defaulting to 1');
    return 1;
  }

  /**
   * Извлекает общее количество серий
   */
  private static extractTotalEpisodes(): number | null {
    console.log('🔍 Extracting total episodes count');
    
    // Поиск в информации о сериале
    const infoSelectors = [
      '.anime-info .episodes',
      '.series-info .episodes',
      '.episode-count',
      '.total-episodes',
      '[data-total-episodes]'
    ];
    
    for (const selector of infoSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent || element.getAttribute('data-total-episodes');
        if (text) {
          const match = text.match(/(\d+)/);
          if (match) {
            const total = parseInt(match[1]);
            console.log('✅ Found total episodes in info:', total);
            return total;
          }
        }
      }
    }

    // Подсчет элементов в списке серий
    const episodeLists = [
      '.episode-list .episode',
      '.episodes .episode',
      '.episode-btn',
      '[data-episode]',
      'option[value^="episode"]'
    ];
    
    for (const selector of episodeLists) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 1) {
        console.log('✅ Found total episodes by counting elements:', elements.length);
        return elements.length;
      }
    }

    // Поиск максимального номера эпизода
    const allEpisodeElements = document.querySelectorAll('[data-episode], .episode');
    let maxEpisode = 0;
    
    for (let i = 0; i < allEpisodeElements.length; i++) {
      const element = allEpisodeElements[i];
      const episodeNum = element.getAttribute('data-episode') || 
                        element.textContent?.match(/(\d+)/)?.[1];
      
      if (episodeNum) {
        const num = parseInt(episodeNum);
        if (num > maxEpisode) {
          maxEpisode = num;
        }
      }
    }
    
    if (maxEpisode > 0) {
      console.log('✅ Found total episodes by max number:', maxEpisode);
      return maxEpisode;
    }

    console.log('❌ Could not extract total episodes count');
    return null;
  }

  /**
   * Извлекает ID текущего перевода
   */
  private static extractTranslationId(): string | null {
    console.log('🔍 Extracting translation ID');
    
    // Поиск в URL параметрах
    const url = window.location.href;
    const urlParams = new URLSearchParams(url.split('?')[1] || '');
    
    const translationParams = [
      'translation',
      'translation_id',
      'translator',
      'dub',
      'voice'
    ];
    
    for (const param of translationParams) {
      const value = urlParams.get(param);
      if (value) {
        console.log('✅ Found translation ID in URL param:', param, '→', value);
        return value;
      }
    }

    // Поиск в активном переводе
    const activeTranslationSelectors = [
      '.translator-list .active',
      '.translation-list .active',
      '.voice-list .active',
      '.dub-list .active',
      '[data-translation].active'
    ];
    
    for (const selector of activeTranslationSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const translationId = element.getAttribute('data-translation') ||
                             element.getAttribute('data-translator') ||
                             element.getAttribute('data-id') ||
                             element.getAttribute('value');
        
        if (translationId) {
          console.log('✅ Found translation ID in active element:', translationId);
          return translationId;
        }
      }
    }

    // Поиск в data атрибутах Kodik
    const kodikElement = document.querySelector('[data-this_link]');
    if (kodikElement) {
      const link = kodikElement.getAttribute('data-this_link');
      if (link) {
        const linkParams = new URLSearchParams(link.split('?')[1] || '');
        const translationId = linkParams.get('only_translations') ||
                             linkParams.get('translation') ||
                             linkParams.get('translator_id');
        
        if (translationId) {
          console.log('✅ Found translation ID in Kodik link:', translationId);
          return translationId;
        }
      }
    }

    console.log('❌ Could not extract translation ID');
    return null;
  }

  /**
   * Обновляет информацию об аниме при изменении серии или перевода
   */
  static updateAnimeInfo(baseInfo: AnimeInfo, newEpisode?: number, newTranslationId?: string): AnimeInfo {
    return {
      ...baseInfo,
      currentEpisode: newEpisode || baseInfo.currentEpisode,
      translationId: newTranslationId || baseInfo.translationId,
      url: window.location.href
    };
  }

  /**
   * Проверяет изменилась ли страница (для отслеживания навигации)
   */
  static hasPageChanged(lastUrl: string): boolean {
    return window.location.href !== lastUrl;
  }

  /**
   * Генерирует уникальный ключ для кэширования на основе ID аниме и перевода
   */
  static generateCacheKey(animeId: string, translationId?: string, episode?: number): string {
    let key = `anime_${animeId}`;
    if (translationId) {
      key += `_tr_${translationId}`;
    }
    if (episode) {
      key += `_ep_${episode}`;
    }
    return key;
  }
}
