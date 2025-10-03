// Правильный content script для AnimStars Kodik optimization
// Парсит переводы, удаляет оригинальный плеер, создает свой HLS плеер

import { kodikAPI } from '../api/kodik-client';
import { ProgressManager } from '../utils/progress-manager';
import { AnimeParser } from '../utils/anime-parser';
import { AnimeInfo } from '../types/progress';

// Declare HLS.js types
declare global {
  interface Window {
    Hls: any;
  }
}

interface Translation {
  title: string;
  kodikUrl: string;
  translationId: string;
  mediaId: string;
  mediaHash: string;
}

interface Episode {
  number: number;
  title?: string;
  url?: string;
}

class AnimeStarsKodikOptimizer {
  private translations: Translation[] = [];
  private episodes: Episode[] = [];
  private currentTranslation: Translation | null = null;
  private currentEpisode: number = 1;
  private videoElement: HTMLVideoElement | null = null;
  private hlsPlayer: any = null;
  private playerContainer: HTMLElement | null = null;
  private loadingOverlay: HTMLElement | null = null;
  private centerPlayButton: HTMLElement | null = null;
  private customControls: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private volumeSlider: HTMLInputElement | null = null;
  private bufferedBar: HTMLElement | null = null;
  private isControlsVisible: boolean = true;
  private controlsHideTimeout: number | null = null;
  private fullscreenClickHandler: ((e: MouseEvent) => void) | null = null;
  private fullscreenMouseMoveHandler: (() => void) | null = null;
  
  // Новые поля для работы с прогрессом
  private currentAnimeInfo: AnimeInfo | null = null;
  private isProgressSystemActive: boolean = false;
  private isFirstLoad: boolean = true; // Флаг первой загрузки
  
  // Кэш для оптимизации
  private domCache = new Map<string, Element | null>();
  private preloadedResources = new Set<string>();

  /**
   * Инициализация оптимизатора с мгновенной заменой
   */
  async init() {
    console.log('🚀 AnimeStars Kodik Optimizer starting...');
    
    // Мгновенно показываем плейсхолдер для улучшения perceived performance
    this.showInstantPlaceholder();
    
    // Предзагружаем критические ресурсы параллельно
    const preloadPromise = this.preloadCriticalResources();
    
    // Ожидаем готовность страницы с таймаутом
    const readyPromise = this.waitForPageReady();
    
    // Выполняем операции параллельно
    await Promise.allSettled([preloadPromise, readyPromise]);
    
    // Запускаем основную логику
    await this.start();
  }

  /**
   * Мгновенно показывает плейсхолдер для улучшения perceived performance
   */
  private showInstantPlaceholder() {
    const playerSelectors = [
      '.pmovie__player iframe[src*="kodik"]',
      'iframe[src*="kodik.info"]',
      'iframe[src*="kodikapi.com"]',
      '.tabs-block__content iframe'
    ];

    for (const selector of playerSelectors) {
      const iframe = this.getCachedElement(selector) as HTMLIFrameElement;
      if (iframe) {
        const container = iframe.parentElement;
        if (container) {
          // Создаем мгновенный плейсхолдер
          const placeholder = document.createElement('div');
          placeholder.className = 'kodik-instant-placeholder';
          placeholder.style.cssText = `
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 8px;
            position: relative;
            min-height: 400px;
          `;
          
          // Добавляем анимированный индикатор загрузки
          placeholder.innerHTML = `
            <div style="text-align: center; color: #fff;">
              <div style="
                width: 50px;
                height: 50px;
                border: 3px solid rgba(255, 107, 53, 0.3);
                border-top: 3px solid #ff6b35;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 15px;
              "></div>
              <div style="font-size: 16px; opacity: 0.9;">Загружаем быстрый плеер...</div>
            </div>
            <style>
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
          `;

          // Скрываем оригинальный iframe без удаления
          iframe.style.display = 'none';
          
          // Вставляем плейсхолдер
          container.insertBefore(placeholder, iframe);
          
          console.log('✨ Instant placeholder shown');
          break;
        }
      }
    }
  }

  /**
   * Предзагружает критические ресурсы
   */
  private async preloadCriticalResources(): Promise<void> {
    const resources = [
      { url: '/hls.min.js', type: 'script' },
      { url: '/player.css', type: 'style' },
      { url: 'https://kodik-add.com/add-players.min.js?v=2', type: 'script' }
    ];

    const preloadPromises = resources.map(async (resource) => {
      if (this.preloadedResources.has(resource.url)) return;

      try {
        if (resource.type === 'script') {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'script';
          link.href = resource.url;
          document.head.appendChild(link);
        } else if (resource.type === 'style') {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'style';
          link.href = resource.url;
          document.head.appendChild(link);
        }
        
        this.preloadedResources.add(resource.url);
        console.log(`⚡ Preloaded: ${resource.url}`);
      } catch (error) {
        console.warn(`Failed to preload ${resource.url}:`, error);
      }
    });

    await Promise.allSettled(preloadPromises);
  }

  /**
   * Получает элемент из кэша или находит его в DOM
   */
  private getCachedElement(selector: string): Element | null {
    if (this.domCache.has(selector)) {
      const cached = this.domCache.get(selector);
      // Проверяем что элемент все еще в DOM
      if (cached && cached.isConnected) {
        return cached;
      }
      this.domCache.delete(selector);
    }

    const element = document.querySelector(selector);
    if (element) {
      this.domCache.set(selector, element);
    }
    return element;
  }

  /**
   * Ожидание готовности страницы с оптимизацией
   */
  private async waitForPageReady(): Promise<void> {
    console.log('⏳ Checking page readiness...');
    
    const requiredSelectors = [
      '.b-translators__list',
      '#translators-list', 
      '.pmovie__player',
      '.tabs-block__content'
    ];
    
    // Используем IntersectionObserver для эффективного ожидания
    return new Promise((resolve) => {
      let foundCount = 0;
      let resolved = false;
      
      const checkElements = () => {
        if (resolved) return;
        
        const foundElements = requiredSelectors.filter(selector => {
          const element = this.getCachedElement(selector);
          return element !== null;
        });
        
        if (foundElements.length > foundCount) {
          foundCount = foundElements.length;
          console.log(`✅ Found ${foundCount}/${requiredSelectors.length} elements:`, foundElements);
          
          if (foundCount > 0) {
            resolved = true;
            resolve();
            return;
          }
        }
      };
      
      // Проверяем сразу
      checkElements();
      
      if (!resolved) {
        // Используем MutationObserver для эффективного отслеживания
        const observer = new MutationObserver((mutations) => {
          // Batching: проверяем только если были изменения в childList
          const hasChildListChanges = mutations.some(m => m.type === 'childList' && m.addedNodes.length > 0);
          if (hasChildListChanges) {
            requestAnimationFrame(checkElements);
          }
        });
        
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        
        // Таймаут с очисткой
        setTimeout(() => {
          if (!resolved) {
            observer.disconnect();
            console.log('⚠️ Timeout waiting for page elements, proceeding anyway...');
            resolved = true;
            resolve();
          }
        }, 15000); // Уменьшили с 30 до 15 секунд
        
        // Очистка наблюдателя при разрешении
        const originalResolve = resolve;
        resolve = () => {
          observer.disconnect();
          originalResolve();
        };
      }
    });
  }

  /**
   * Основная логика запуска с оптимизациями
   */
  private async start() {
    try {
      console.log('🎬 Starting optimized player initialization...');
      
      // ЭТАП 1: АНАЛИЗ И СБОР ДАННЫХ (НЕ УДАЛЯЕМ НИЧЕГО!)
      console.log('📊 Phase 1: Analyzing existing player data...');
      
      // Сначала парсим переводы
      await this.parseTranslationsAsync();
      
      if (this.translations.length === 0) {
        console.log('❌ No translations found');
        return;
      }

      // Затем анализируем данные об эпизодах ИЗ СУЩЕСТВУЮЩЕГО iframe
      await this.analyzeEpisodesFromExistingPlayer();
      
      // Извлекаем информацию об аниме
      await this.extractAnimeInfoAsync();

      // ЭТАП 2: СОЗДАНИЕ НОВОГО ПЛЕЕРА
      console.log('🎮 Phase 2: Creating custom player...');
      await this.createCustomPlayer();

      // ЭТАП 3: ЗАМЕНА СТАРОГО ПЛЕЕРА (ТОЛЬКО ПОСЛЕ СОЗДАНИЯ НОВОГО!)
      console.log('🔄 Phase 3: Replacing original player...');
      await this.removeOriginalPlayerAsync();

      console.log('✅ AnimeStars Kodik Optimizer initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize optimizer:', error);
      // Показываем ошибку пользователю
      this.showErrorState(error as Error);
    }
  }

  /**
   * Извлекает информацию об аниме из существующих данных на странице
   */
  private extractAnimeInfo() {
    console.log('🔍 Extracting anime info from page data...');
    
    if (!this.currentTranslation) {
      console.warn('⚠️ No current translation available');
      return;
    }

    // Используем mediaId как ID аниме (это уникальный идентификатор от Kodik)
    const animeId = this.currentTranslation.mediaId;
    
    // Извлекаем название из заголовка страницы или мета-данных
    let title = document.title;
    
    // Очищаем название от лишнего
    title = title
      .replace(/\s*-\s*смотреть.*$/i, '')
      .replace(/\s*-\s*аниме.*$/i, '')
      .replace(/\s*\|\s*.*$/i, '')
      .replace(/\s*\(\d{4}\).*$/, '')
      .trim();

    // Альтернативные источники названия
    if (!title || title.length < 3) {
      const titleElement = document.querySelector('h1, .anime-title, .title');
      if (titleElement) {
        title = titleElement.textContent?.trim() || 'Unknown Anime';
      }
    }

    this.currentAnimeInfo = {
      id: animeId,
      title: title || 'Unknown Anime',
      currentEpisode: this.currentEpisode,
      totalEpisodes: this.episodes.length > 0 ? this.episodes.length : undefined,
      translationId: this.currentTranslation.translationId,
      url: window.location.href
    };

    console.log('📺 Extracted anime info:', this.currentAnimeInfo);
    this.isProgressSystemActive = true;
  }

  /**
   * Парсит список переводов из DOM страницы
   */
  private parseTranslations() {
    console.log('🔍 Parsing translations from page...');

    const translatorsList = document.querySelector('#translators-list, .b-translators__list');
    if (!translatorsList) {
      console.warn('⚠️ Translators list not found');
      return;
    }

    const translatorItems = translatorsList.querySelectorAll('.b-translator__item, li[data-this_link]');
    
    for (let i = 0; i < translatorItems.length; i++) {
      const item = translatorItems[i];
      const link = item.getAttribute('data-this_link');
      const title = item.textContent?.trim() || 'Unknown';
      
      if (link) {
        // Парсим Kodik URL
        const urlMatch = link.match(/\/serial\/(\d+)\/([a-f0-9]+)\/720p/);
        if (urlMatch) {
          const mediaId = urlMatch[1];
          const mediaHash = urlMatch[2];
          
          // Извлекаем translation ID из параметров
          const urlParams = new URLSearchParams(link.split('?')[1] || '');
          const translationId = urlParams.get('only_translations') || '0';
          
          const translation: Translation = {
            title,
            kodikUrl: link.startsWith('//') ? 'https:' + link : link,
            translationId,
            mediaId,
            mediaHash
          };
          
          this.translations.push(translation);
          console.log('🎭 Found translation:', title, translation);
        }
      }
    }

    // Выбираем первый активный перевод или первый доступный
    const activeItem = translatorsList.querySelector('.active, .b-translator__item.active');
    if (activeItem) {
      const activeLink = activeItem.getAttribute('data-this_link');
      this.currentTranslation = this.translations.find(t => t.kodikUrl.includes(activeLink || '')) || this.translations[0];
    } else {
      this.currentTranslation = this.translations[0];
    }

    console.log('📋 Parsed translations:', this.translations.length);
    console.log('🎯 Current translation:', this.currentTranslation?.title);
  }

  /**
   * Удаляет оригинальный блок плеера
   */
  private removeOriginalPlayer() {
    console.log('🗑️ Removing original player...');

    // Ищем и удаляем различные контейнеры плеера
    const playerSelectors = [
      '.room__player',
      '.player-container',
      '.video-player',
      '#player',
      '.kodik-player',
      'iframe[src*="kodik"]'
    ];

    for (const selector of playerSelectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        console.log('🗑️ Removing element:', selector);
        element.remove();
      });
    }

    // Также удаляем скрипты и стили Kodik
    const kodikScripts = document.querySelectorAll('script[src*="kodik"]');
    kodikScripts.forEach(script => script.remove());
  }

  /**
   * Создает пользовательский плеер
   */
  private async createCustomPlayer() {
    console.log('🎮 Creating custom player...');

    if (!this.currentTranslation) {
      throw new Error('No translation selected');
    }

    // Создаем контейнер плеера
    this.createPlayerContainer();

    // Создаем селектор переводов
    this.createTranslationSelector();

    // Эпизоды уже должны быть загружены в analyzeEpisodesFromExistingPlayer()
    if (this.episodes.length === 0) {
      console.warn('⚠️ No episodes loaded, loading them now as fallback...');
      await this.loadEpisodes();
    }

    // Создаем селектор эпизодов
    this.createEpisodeSelector();

    // Создаем видео плеер
    await this.createVideoPlayer();
  }

  /**
   * Создает основной контейнер плеера
   */
  private createPlayerContainer() {
    // Находим правильное место для плеера - контейнер #player или #kodik-tab-player
    let targetContainer = document.querySelector('#player, #kodik-tab-player, .video-inside');
    
    if (!targetContainer) {
      // Пробуем найти родительский контейнер плеера
      targetContainer = document.querySelector('.tabs-block__content, .pmovie__player');
    }
    
    if (!targetContainer) {
      // Последняя попытка - создаем контейнер в основном контенте
      const content = document.querySelector('.content, .main-content, body');
      if (content) {
        targetContainer = document.createElement('div');
        targetContainer.className = 'animestars-player-container';
        content.insertBefore(targetContainer, content.firstChild);
      }
    }

    if (!targetContainer) {
      throw new Error('Could not find place for player');
    }

    console.log('🎯 Found target container:', targetContainer);

    // Очищаем контейнер и создаем наш плеер
    targetContainer.innerHTML = '';
    targetContainer.className = targetContainer.className + ' animestars-custom-player';
    
    // Добавляем базовые стили
    (targetContainer as HTMLElement).style.cssText = `
      width: 100%;
      max-width: 1000px;
      margin: 0 auto;
      background: #000;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;

    this.playerContainer = targetContainer as HTMLElement;
  }

  /**
   * Создает селектор переводов
   */
  private createTranslationSelector() {
    if (!this.playerContainer) return;

    const translationBar = document.createElement('div');
    translationBar.className = 'translation-selector';
    translationBar.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px;
      background: #1a1a1a;
      border-bottom: 1px solid #333;
    `;

    this.translations.forEach((translation, index) => {
      const button = document.createElement('button');
      button.textContent = translation.title;
      button.className = 'translation-btn';
      button.style.cssText = `
        padding: 8px 12px;
        background: ${this.currentTranslation === translation ? '#007bff' : '#333'};
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: background 0.2s;
      `;

      if (button) {
        button.addEventListener('click', () => {
          this.switchTranslation(translation);
        });
      }

      translationBar.appendChild(button);
    });

    this.playerContainer.appendChild(translationBar);
  }

  /**
   * Анализирует данные об эпизодах из существующего iframe плеера
   */
  private async analyzeEpisodesFromExistingPlayer(): Promise<void> {
    console.log('🔍 Analyzing episodes from existing player iframe...');
    
    if (!this.currentTranslation) {
      console.warn('⚠️ No current translation selected');
      return;
    }

    this.episodes = [];
    let maxEpisode = 0;

    try {
      // Ищем существующий iframe Kodik
      const kodikIframes = document.querySelectorAll('iframe[src*="kodik"]');
      console.log('🔍 Found Kodik iframes:', kodikIframes.length);

      // Пытаемся получить данные из iframe
      for (let i = 0; i < kodikIframes.length; i++) {
        const iframe = kodikIframes[i] as HTMLIFrameElement;
        try {
          console.log('🔍 Trying to access iframe content:', iframe.src);
          
          // Пытаемся получить доступ к содержимому iframe
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            const html = iframeDoc.documentElement.outerHTML;
            console.log('✅ Successfully accessed iframe content, length:', html.length);
            
            maxEpisode = await this.parseEpisodesFromHTML(html);
            if (maxEpisode > 0) {
              console.log('✅ Found episodes from iframe:', maxEpisode);
              break;
            }
          }
        } catch (e) {
          console.log('⚠️ Cannot access iframe content due to CORS, trying alternative methods');
        }
      }

      // Если не удалось получить из iframe, пытаемся через background script
      if (maxEpisode === 0) {
        console.log('🔄 Trying to fetch episode data via background script...');
        try {
          const response = await this.fetchViaBackground(this.currentTranslation.kodikUrl);
          if (response.success && response.data) {
            console.log('✅ Fetched data via background script, length:', response.data.length);
            maxEpisode = await this.parseEpisodesFromHTML(response.data);
          }
        } catch (error) {
          console.warn('⚠️ Background fetch failed:', error);
        }
      }

      // Альтернативный поиск на текущей странице
      if (maxEpisode === 0) {
        console.log('🔍 Trying to detect episodes from page context...');
        
        // Паттерн 1: Информация о сериях в блоке .pcoln__series-count
        const seriesCountElement = document.querySelector('.page__ser, .pcoln__series-count .page__ser');
        if (seriesCountElement) {
          const seriesText = seriesCountElement.textContent || '';
          console.log('🔍 Found series count text:', seriesText);
          
          // Ищем паттерны типа "Серий: 1-44 из ?" или "Episodes: 1-44"
          const seriesPatterns = [
            /Серий:\s*\d+-(\d+)/i,
            /Episodes:\s*\d+-(\d+)/i,
            /Серий:\s*(\d+)/i,
            /Episodes:\s*(\d+)/i,
            /1-(\d+)\s*из/i,
            /(\d+)\s*серий/i
          ];
          
          for (const pattern of seriesPatterns) {
            const match = seriesText.match(pattern);
            if (match) {
              const foundEpisodes = parseInt(match[1]);
              if (foundEpisodes > 0) {
                maxEpisode = foundEpisodes;
                console.log('📺 Found episodes from series count text:', maxEpisode, 'pattern:', pattern.source);
                break;
              }
            }
          }
        }
        
        // Паттерн 2: Селекторы эпизодов
        if (maxEpisode === 0) {
          const episodeSelectors = [
            '.series-options select option',
            '.episode-list .episode',
            '[data-episode]',
            '.episode-selector option',
            'select[name="episode"] option',
            '.season-1 option'
          ];
          
          for (const selector of episodeSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 1) {
              const episodeNumbers = Array.from(elements).map(el => {
                const value = el.getAttribute('value') || 
                             el.getAttribute('data-episode') || 
                             el.textContent?.match(/\d+/)?.[0];
                return value ? parseInt(value) : 0;
              }).filter(n => n > 0);
              
              if (episodeNumbers.length > 0) {
                maxEpisode = Math.max(...episodeNumbers);
                console.log('📺 Found episodes from page selectors:', episodeNumbers.length, 'episodes, max:', maxEpisode);
                break;
              }
            }
          }
        }
        
        // Паттерн 3: Поиск в мета-информации страницы
        if (maxEpisode === 0) {
          const metaSelectors = [
            'meta[name="episodes"]',
            'meta[property="episodes"]',
            'meta[name="anime:episodes"]',
            '[data-episodes]'
          ];
          
          for (const selector of metaSelectors) {
            const element = document.querySelector(selector);
            if (element) {
              const episodes = element.getAttribute('content') || 
                             element.getAttribute('data-episodes') || 
                             element.getAttribute('value');
              if (episodes) {
                const parsedEpisodes = parseInt(episodes);
                if (parsedEpisodes > 0) {
                  maxEpisode = parsedEpisodes;
                  console.log('📺 Found episodes from meta data:', maxEpisode);
                  break;
                }
              }
            }
          }
        }
      }

      // Создаем массив эпизодов
      if (maxEpisode > 0) {
        console.log('📺 Creating episode list with', maxEpisode, 'episodes');
        for (let i = 1; i <= maxEpisode; i++) {
          this.episodes.push({
            number: i,
            title: `Серия ${i}`
          });
        }
      } else {
        console.log('📺 No episodes detected, creating single episode');
        this.episodes.push({
          number: 1,
          title: 'Серия 1'
        });
      }

      console.log('📺 Final episodes analysis result:', this.episodes.length, 'episodes');

    } catch (error) {
      console.error('❌ Error analyzing episodes:', error);
      // Fallback: создаем хотя бы один эпизод
      this.episodes = [{
        number: 1,
        title: 'Серия 1'
      }];
    }
  }

  /**
   * Парсит количество эпизодов из HTML
   */
  private async parseEpisodesFromHTML(html: string): Promise<number> {
    let maxEpisode = 0;

    // Паттерн 1: Ищем option элементы с data-id и data-hash (точный формат Kodik)
    const kodikOptionPattern = /<option[^>]*value="(\d+)"[^>]*data-id="[^"]*"[^>]*data-hash="[^"]*"[^>]*data-title="(\d+)\s*серия"[^>]*>/gi;
    const kodikOptionMatches = [...html.matchAll(kodikOptionPattern)];
    if (kodikOptionMatches.length > 0) {
      const episodeNumbers = kodikOptionMatches.map(match => parseInt(match[1]));
      maxEpisode = Math.max(...episodeNumbers);
      console.log('📺 Found episodes from Kodik option tags:', episodeNumbers.length, 'episodes, max:', maxEpisode);
      return maxEpisode;
    }

    // Паттерн 2: Альтернативный поиск option элементов с любым форматом серии
    const optionPattern = /<option[^>]*value="(\d+)"[^>]*>[\s\S]*?(\d+)\s*серия[\s\S]*?<\/option>/gi;
    const optionMatches = [...html.matchAll(optionPattern)];
    if (optionMatches.length > 0) {
      const episodeNumbers = optionMatches.map(match => parseInt(match[1]));
      maxEpisode = Math.max(...episodeNumbers);
      console.log('📺 Found episodes from generic option tags:', episodeNumbers.length, 'episodes, max:', maxEpisode);
      return maxEpisode;
    }

    // Паттерн 3: Ищем любые option элементы с числовыми значениями
    const allOptionPattern = /<option[^>]*value="(\d+)"[^>]*>/gi;
    const allOptionMatches = [...html.matchAll(allOptionPattern)];
    if (allOptionMatches.length > 1) { // больше 1, чтобы исключить единичные селекторы
      const episodeNumbers = allOptionMatches.map(match => parseInt(match[1]));
      maxEpisode = Math.max(...episodeNumbers);
      console.log('📺 Found episodes from all option tags:', episodeNumbers.length, 'episodes, max:', maxEpisode);
      return maxEpisode;
    }

    // Паттерн 4: Ищем в переменных JavaScript
    const jsPatterns = [
      /episodes?\s*[=:]\s*(\d+)/i,
      /episodeCount\s*[=:]\s*(\d+)/i,
      /totalEpisodes?\s*[=:]\s*(\d+)/i,
      /var\s+episodes\s*=\s*(\d+)/i
    ];
    
    for (const pattern of jsPatterns) {
      const match = html.match(pattern);
      if (match) {
        maxEpisode = parseInt(match[1]);
        console.log('📺 Found episodes from JS variables:', maxEpisode);
        return maxEpisode;
      }
    }

    // Паттерн 5: Ищем кнопки переключения эпизодов
    const buttonPattern = /data-episode[^=]*=["'](\d+)["']/gi;
    const buttonMatches = [...html.matchAll(buttonPattern)];
    if (buttonMatches.length > 0) {
      const episodeNumbers = buttonMatches.map(match => parseInt(match[1]));
      maxEpisode = Math.max(...episodeNumbers);
      console.log('📺 Found episodes from button data attributes:', episodeNumbers.length, 'episodes, max:', maxEpisode);
      return maxEpisode;
    }

    // Паттерн 6: Ищем информацию о сериях в DOM (для случаев когда HTML содержит полную страницу)
    const seriesInfoPatterns = [
      /Серий:\s*\d+-(\d+)/i,
      /Episodes:\s*\d+-(\d+)/i,
      /Серий:\s*(\d+)/i,
      /Episodes:\s*(\d+)/i,
      /1-(\d+)\s*из/i,
      /(\d+)\s*серий/i,
      /class="page__ser"[^>]*>[\s\S]*?(\d+)[\s\S]*?серий/i
    ];
    
    for (const pattern of seriesInfoPatterns) {
      const match = html.match(pattern);
      if (match) {
        const foundEpisodes = parseInt(match[1]);
        if (foundEpisodes > 0) {
          maxEpisode = foundEpisodes;
          console.log('📺 Found episodes from series info pattern:', maxEpisode);
          return maxEpisode;
        }
      }
    }

    return 0;
  }

  /**
   * Загружает список эпизодов для текущего перевода (старый метод - теперь не используется в начальной фазе)
   */
  private async loadEpisodes() {
    if (!this.currentTranslation) return;

    console.log('📺 Loading episodes for:', this.currentTranslation.title);

    try {
      // Сначала попытаемся получить данные из Kodik
      let html: string | null = null;
      
      try {
        const response = await this.fetchViaBackground(this.currentTranslation.kodikUrl);
        if (response.success && response.data) {
          html = response.data;
          console.log('✅ Fetched episodes data via background script');
        }
      } catch (error) {
        console.log('⚠️ Background fetch failed, will try alternative methods:', error);
      }

      // Fallback: используем данные которые уже есть при загрузке видео
      if (!html) {
        console.log('🔄 Trying to extract episode data from current video loading...');
        // Ждем немного, чтобы дать видео загрузиться и получить HTML
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Попробуем найти iframe с данными Kodik
        const kodikIframes = document.querySelectorAll('iframe[src*="kodik"]');
        for (let i = 0; i < kodikIframes.length; i++) {
          const iframe = kodikIframes[i] as HTMLIFrameElement;
          try {
            const iframeDoc = iframe.contentDocument;
            if (iframeDoc) {
              html = iframeDoc.documentElement.outerHTML;
              console.log('✅ Extracted HTML from iframe');
              break;
            }
          } catch (e) {
            // CORS блокирует доступ к iframe - это нормально
            console.log('⚠️ Cannot access iframe content due to CORS');
          }
        }
      }

      // Инициализируем массив эпизодов
      this.episodes = [];
      let maxEpisode = 0;

      if (html) {
        console.log('🔍 Searching for episodes in HTML...');
        
        // Паттерн 1: Ищем option элементы с data-id и data-hash (точный формат Kodik)
        const kodikOptionPattern = /<option[^>]*value="(\d+)"[^>]*data-id="[^"]*"[^>]*data-hash="[^"]*"[^>]*data-title="(\d+)\s*серия"[^>]*>/gi;
        const kodikOptionMatches = [...html.matchAll(kodikOptionPattern)];
        if (kodikOptionMatches.length > 0) {
          const episodeNumbers = kodikOptionMatches.map(match => parseInt(match[1]));
          maxEpisode = Math.max(...episodeNumbers);
          console.log('📺 Found episodes from Kodik option tags:', episodeNumbers.length, 'episodes, max:', maxEpisode);
        }

        // Паттерн 2: Альтернативный поиск option элементов с любым форматом серии
        if (!maxEpisode) {
          const optionPattern = /<option[^>]*value="(\d+)"[^>]*>[\s\S]*?(\d+)\s*серия[\s\S]*?<\/option>/gi;
          const optionMatches = [...html.matchAll(optionPattern)];
          if (optionMatches.length > 0) {
            const episodeNumbers = optionMatches.map(match => parseInt(match[1]));
            maxEpisode = Math.max(...episodeNumbers);
            console.log('📺 Found episodes from generic option tags:', episodeNumbers.length, 'episodes, max:', maxEpisode);
          }
        }

        // Паттерн 3: Ищем любые option элементы с числовыми значениями
        if (!maxEpisode) {
          const allOptionPattern = /<option[^>]*value="(\d+)"[^>]*>/gi;
          const allOptionMatches = [...html.matchAll(allOptionPattern)];
          if (allOptionMatches.length > 1) { // больше 1, чтобы исключить единичные селекторы
            const episodeNumbers = allOptionMatches.map(match => parseInt(match[1]));
            maxEpisode = Math.max(...episodeNumbers);
            console.log('📺 Found episodes from all option tags:', episodeNumbers.length, 'episodes, max:', maxEpisode);
          }
        }

        // Паттерн 4: Ищем в переменных JavaScript
        if (!maxEpisode) {
          const jsPatterns = [
            /episodes?\s*[=:]\s*(\d+)/i,
            /episodeCount\s*[=:]\s*(\d+)/i,
            /totalEpisodes?\s*[=:]\s*(\d+)/i,
            /var\s+episodes\s*=\s*(\d+)/i
          ];
          
          for (const pattern of jsPatterns) {
            const match = html.match(pattern);
            if (match) {
              maxEpisode = parseInt(match[1]);
              console.log('📺 Found episodes from JS variables:', maxEpisode);
              break;
            }
          }
        }

        // Паттерн 5: Ищем кнопки переключения эпизодов
        if (!maxEpisode) {
          const buttonPattern = /data-episode[^=]*=["'](\d+)["']/gi;
          const buttonMatches = [...html.matchAll(buttonPattern)];
          if (buttonMatches.length > 0) {
            const episodeNumbers = buttonMatches.map(match => parseInt(match[1]));
            maxEpisode = Math.max(...episodeNumbers);
            console.log('📺 Found episodes from button data attributes:', episodeNumbers.length, 'episodes, max:', maxEpisode);
          }
        }
      }

      // Fallback: попытка получить количество эпизодов из URL или других источников
      if (!maxEpisode) {
        console.log('🔍 Trying to detect episodes from page context...');
        
        // Паттерн 1: Информация о сериях в блоке .pcoln__series-count
        const seriesCountElement = document.querySelector('.page__ser, .pcoln__series-count .page__ser');
        if (seriesCountElement) {
          const seriesText = seriesCountElement.textContent || '';
          console.log('🔍 Found series count text:', seriesText);
          
          // Ищем паттерны типа "Серий: 1-44 из ?" или "Episodes: 1-44"
          const seriesPatterns = [
            /Серий:\s*\d+-(\d+)/i,
            /Episodes:\s*\d+-(\d+)/i,
            /Серий:\s*(\d+)/i,
            /Episodes:\s*(\d+)/i,
            /1-(\d+)\s*из/i,
            /(\d+)\s*серий/i
          ];
          
          for (const pattern of seriesPatterns) {
            const match = seriesText.match(pattern);
            if (match) {
              const foundEpisodes = parseInt(match[1]);
              if (foundEpisodes > 0) {
                maxEpisode = foundEpisodes;
                console.log('📺 Found episodes from series count text:', maxEpisode, 'pattern:', pattern.source);
                break;
              }
            }
          }
        }
        
        // Паттерн 2: Попробуем найти информацию на странице аниме
        if (!maxEpisode) {
          const episodeSelectors = [
            '.series-options select option',
            '.episode-list .episode',
            '[data-episode]',
            '.episode-selector option'
          ];
          
          for (const selector of episodeSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 1) {
              const episodeNumbers = Array.from(elements).map(el => {
                const value = el.getAttribute('value') || el.getAttribute('data-episode') || el.textContent?.match(/\d+/)?.[0];
                return value ? parseInt(value) : 0;
              }).filter(n => n > 0);
              
              if (episodeNumbers.length > 0) {
                maxEpisode = Math.max(...episodeNumbers);
                console.log('📺 Found episodes from page selectors:', episodeNumbers.length, 'episodes, max:', maxEpisode);
                break;
              }
            }
          }
        }
      }
      
      // Создаем массив эпизодов
      if (maxEpisode > 0) {
        console.log('📺 Using detected episode count:', maxEpisode);
        for (let i = 1; i <= maxEpisode; i++) {
          this.episodes.push({
            number: i,
            title: `Серия ${i}`
          });
        }
      } else {
        // Fallback: создаем хотя бы один эпизод для навигации
        console.log('📺 No episodes detected, creating single episode');
        this.episodes.push({
          number: 1,
          title: 'Серия 1'
        });
      }

      console.log('📺 Final episodes array:', this.episodes);

    } catch (error) {
      console.error('❌ Failed to load episodes:', error);
      console.log('📺 Using single default episode');
      this.episodes = [{
        number: 1,
        title: 'Серия 1'
      }];
    }

    console.log('📺 Final episodes array:', this.episodes);
  }

  /**
   * Создает селектор эпизодов
   */
  private createEpisodeSelector() {
    console.log('🎬 Creating episode selector. Episodes count:', this.episodes.length);
    console.log('🎬 Episodes:', this.episodes);
    
    if (!this.playerContainer) {
      console.log('❌ No player container for episode selector');
      return;
    }
    
    // Показываем селектор эпизодов даже если эпизод один, для лучшего UX
    if (this.episodes.length === 0) {
      console.log('⚠️ No episodes data, skipping episode selector');
      return;
    }

    const episodeBar = document.createElement('div');
    episodeBar.className = 'episode-selector';
    episodeBar.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 8px 12px;
      background: #2a2a2a;
      border-bottom: 1px solid #333;
      max-height: 150px;
      overflow-y: auto;
    `;

    this.episodes.forEach(episode => {
      const button = document.createElement('button');
      button.textContent = episode.number.toString();
      button.title = episode.title || `Эпизод ${episode.number}`;
      button.className = 'episode-btn';
      button.style.cssText = `
        width: 40px;
        height: 40px;
        background: ${this.currentEpisode === episode.number ? '#007bff' : '#444'};
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: bold;
        transition: background 0.2s;
      `;

      // Безопасно добавляем обработчик события
      button.addEventListener('click', () => {
        this.switchEpisode(episode.number);
      });

      button.addEventListener('mouseenter', () => {
        if (this.currentEpisode !== episode.number) {
          button.style.background = '#555';
        }
      });

      button.addEventListener('mouseleave', () => {
        button.style.background = this.currentEpisode === episode.number ? '#007bff' : '#444';
      });

      episodeBar.appendChild(button);
    });

    this.playerContainer.appendChild(episodeBar);
  }

  /**
   * Создает видео плеер
   */
  private async createVideoPlayer() {
    if (!this.playerContainer || !this.currentTranslation) return;

    console.log('🎬 Creating video player...');

    // Создаем главный контейнер плеера
    const playerWrapper = document.createElement('div');
    playerWrapper.className = 'animestars-player-wrapper';
    playerWrapper.style.cssText = `
      position: relative;
      background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%);
      aspect-ratio: 16/9;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 25px rgba(0,0,0,0.4);
      cursor: pointer;
    `;

    // Создаем видео элемент
    this.videoElement = document.createElement('video');
    this.videoElement.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 12px;
    `;
    this.videoElement.controls = false;
    this.videoElement.preload = 'metadata';
    
    // Создаем красивый poster с информацией об аниме
    await this.createVideoPoster();

    // Создаем индикатор загрузки
    this.createLoadingIndicator(playerWrapper);

    // Создаем кастомные контролы
    this.createCustomControls(playerWrapper);

    // Создаем центральную кнопку воспроизведения
    this.createCenterPlayButton(playerWrapper);

    // Добавляем видео в контейнер
    playerWrapper.appendChild(this.videoElement);

    // Добавляем обработчики событий
    this.setupVideoEvents();
    this.setupKeyboardControls();
    this.setupMouseControls(playerWrapper);

    this.playerContainer.appendChild(playerWrapper);

    // Загружаем видео для текущего эпизода
    await this.loadVideo();
  }

  /**
   * Создает красивый poster для видео с информацией об аниме
   */
  private async createVideoPoster() {
    if (!this.videoElement || !this.currentAnimeInfo) {
      // Используем базовый градиентный poster
      this.videoElement!.poster = this.createDefaultPoster();
      return;
    }

    try {
      // Пробуем получить реальное превью от Kodik
      const kodikPoster = await this.tryGetKodikPoster();
      
      if (kodikPoster) {
        this.videoElement.poster = kodikPoster;
        console.log('✅ Using Kodik poster');
        return;
      }
    } catch (error) {
      console.log('⚠️ Could not get Kodik poster, using custom poster');
    }

    // Создаем кастомный poster с информацией об аниме
    const customPoster = await this.createCustomPoster();
    this.videoElement.poster = customPoster;
  }

  /**
   * Пытается получить реальное превью от Kodik
   */
  private async tryGetKodikPoster(): Promise<string | null> {
    if (!this.currentTranslation) return null;

    try {
      // Пробуем найти превью в данных Kodik
      const episodeUrl = `https://kodik.info/serial/${this.currentTranslation.mediaId}/${this.currentTranslation.mediaHash}/720p?min_age=16&first_url=false&season=1&episode=${this.currentEpisode}`;
      
      const response = await this.fetchViaBackground(episodeUrl);
      if (!response.success || !response.data) return null;

      const html = response.data;
      
      // Ищем poster в HTML
      const posterPatterns = [
        /poster['"]\s*:\s*['"]([^'"]+)['"]/i,
        /data-poster['"]\s*=\s*['"]([^'"]+)['"]/i,
        /<video[^>]+poster\s*=\s*['"]([^'"]+)['"]/i,
        /preview['"]\s*:\s*['"]([^'"]+)['"]/i,
        /thumbnail['"]\s*:\s*['"]([^'"]+)['"]/i
      ];

      for (const pattern of posterPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          let posterUrl = match[1];
          
          // Проверяем что URL валидный
          if (posterUrl.startsWith('http')) {
            return posterUrl;
          } else if (posterUrl.startsWith('/')) {
            return `https://kodik.info${posterUrl}`;
          }
        }
      }

      return null;
    } catch (error) {
      console.log('❌ Error getting Kodik poster:', error);
      return null;
    }
  }

  /**
   * Создает кастомный poster с информацией об аниме
   */
  private async createCustomPoster(): Promise<string> {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 450;
    const ctx = canvas.getContext('2d')!;

    // Создаем градиентный фон
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Добавляем паттерн
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = Math.random() * 3 + 1;
      ctx.fillRect(x, y, size, size);
    }

    // Центральная иконка воспроизведения
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const iconSize = 80;

    // Тень для иконки
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(centerX + 3, centerY + 3, iconSize / 2, 0, 2 * Math.PI);
    ctx.fill();

    // Фон иконки
    ctx.fillStyle = 'rgba(0, 212, 255, 0.2)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, iconSize / 2, 0, 2 * Math.PI);
    ctx.fill();

    // Обводка иконки
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, iconSize / 2, 0, 2 * Math.PI);
    ctx.stroke();

    // Треугольник воспроизведения
    ctx.fillStyle = '#00d4ff';
    ctx.beginPath();
    ctx.moveTo(centerX - 15, centerY - 20);
    ctx.lineTo(centerX - 15, centerY + 20);
    ctx.lineTo(centerX + 20, centerY);
    ctx.closePath();
    ctx.fill();

    // Название аниме
    if (this.currentAnimeInfo?.title) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Тень для текста
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillText(this.currentAnimeInfo.title, centerX + 2, centerY - 82);
      
      // Основной текст
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.currentAnimeInfo.title, centerX, centerY - 80);
    }

    // Информация о серии и переводе
    const episodeText = `Серия ${this.currentEpisode}`;
    const translationText = this.currentTranslation?.title || 'Озвучка';
    
    ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
    
    // Тень
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillText(episodeText, centerX + 1, centerY + 101);
    ctx.fillText(translationText, centerX + 1, centerY + 131);
    
    // Основной текст
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(episodeText, centerX, centerY + 100);
    
    ctx.fillStyle = 'rgba(0, 212, 255, 0.9)';
    ctx.fillText(translationText, centerX, centerY + 130);

    // Декоративные элементы по углам
    this.drawCornerDecorations(ctx, canvas.width, canvas.height);

    return canvas.toDataURL('image/png', 0.9);
  }

  /**
   * Рисует декоративные элементы по углам poster'а
   */
  private drawCornerDecorations(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const cornerSize = 40;
    const lineWidth = 3;
    
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)';
    ctx.lineWidth = lineWidth;
    
    // Верхний левый угол
    ctx.beginPath();
    ctx.moveTo(20, 20 + cornerSize);
    ctx.lineTo(20, 20);
    ctx.lineTo(20 + cornerSize, 20);
    ctx.stroke();
    
    // Верхний правый угол
    ctx.beginPath();
    ctx.moveTo(width - 20 - cornerSize, 20);
    ctx.lineTo(width - 20, 20);
    ctx.lineTo(width - 20, 20 + cornerSize);
    ctx.stroke();
    
    // Нижний левый угол
    ctx.beginPath();
    ctx.moveTo(20, height - 20 - cornerSize);
    ctx.lineTo(20, height - 20);
    ctx.lineTo(20 + cornerSize, height - 20);
    ctx.stroke();
    
    // Нижний правый угол
    ctx.beginPath();
    ctx.moveTo(width - 20 - cornerSize, height - 20);
    ctx.lineTo(width - 20, height - 20);
    ctx.lineTo(width - 20, height - 20 - cornerSize);
    ctx.stroke();
  }

  /**
   * Создает базовый градиентный poster
   */
  private createDefaultPoster(): string {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 450;
    const ctx = canvas.getContext('2d')!;

    // Градиентный фон
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#232323');
    gradient.addColorStop(1, '#111111');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Центральная иконка
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 50, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.moveTo(centerX - 15, centerY - 20);
    ctx.lineTo(centerX - 15, centerY + 20);
    ctx.lineTo(centerX + 20, centerY);
    ctx.closePath();
    ctx.fill();

    return canvas.toDataURL('image/png', 0.8);
  }

  /**
   * Создает индикатор загрузки
   */
  private createLoadingIndicator(container: HTMLElement) {
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'loading-overlay';
    loadingOverlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      z-index: 100;
      transition: opacity 0.4s ease;
      backdrop-filter: blur(10px);
    `;

    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 60px;
      height: 60px;
      border: 4px solid rgba(255,255,255,0.2);
      border-top: 4px solid #00d4ff;
      border-radius: 50%;
      animation: spin 1.2s linear infinite;
      margin-bottom: 20px;
      box-shadow: 0 0 20px rgba(0,212,255,0.3);
    `;

    const loadingText = document.createElement('div');
    loadingText.textContent = 'Загрузка видео...';
    loadingText.style.cssText = `
      color: white;
      font-size: 16px;
      font-weight: 600;
      text-shadow: 0 2px 4px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    `;

    // Добавляем CSS анимацию
    if (!document.querySelector('#animestars-animations')) {
      const style = document.createElement('style');
      style.id = 'animestars-animations';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideUp {
          from { transform: translateY(10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    loadingOverlay.appendChild(spinner);
    loadingOverlay.appendChild(loadingText);
    container.appendChild(loadingOverlay);

    this.loadingOverlay = loadingOverlay;
  }

  /**
   * Создает центральную кнопку воспроизведения
   */
  private createCenterPlayButton(container: HTMLElement) {
    const centerButton = document.createElement('div');
    centerButton.className = 'center-play-button';
    centerButton.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90px;
      height: 90px;
      background: rgba(0,0,0,0.8);
      border: 3px solid rgba(255,255,255,0.9);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 50;
      transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    `;

    centerButton.innerHTML = `
      <svg width="36" height="36" viewBox="0 0 24 24" fill="white">
        <path d="M8 5v14l11-7z"/>
      </svg>
    `;

    centerButton.addEventListener('mouseenter', () => {
      centerButton.style.transform = 'translate(-50%, -50%) scale(1.1)';
      centerButton.style.background = 'rgba(0,123,255,0.9)';
      centerButton.style.borderColor = 'rgba(0,123,255,1)';
      centerButton.style.boxShadow = '0 12px 40px rgba(0,123,255,0.4)';
    });

    centerButton.addEventListener('mouseleave', () => {
      centerButton.style.transform = 'translate(-50%, -50%) scale(1)';
      centerButton.style.background = 'rgba(0,0,0,0.8)';
      centerButton.style.borderColor = 'rgba(255,255,255,0.9)';
      centerButton.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
    });

    centerButton.addEventListener('mousedown', () => {
      centerButton.style.transform = 'translate(-50%, -50%) scale(0.95)';
    });

    centerButton.addEventListener('mouseup', () => {
      centerButton.style.transform = 'translate(-50%, -50%) scale(1.1)';
    });

    centerButton.addEventListener('click', (e) => {
      console.log('🎬 Center play button clicked - event target:', e.target);
      console.log('🎬 Video element paused state:', this.videoElement?.paused);
      e.stopPropagation(); // Предотвращаем всплытие события
      e.preventDefault(); // Предотвращаем действие по умолчанию
      this.togglePlayPause();
    });

    container.appendChild(centerButton);
    this.centerPlayButton = centerButton;
  }

  /**
   * Создает кастомные контролы плеера
   */
  private createCustomControls(container: HTMLElement) {
    const controlsBar = document.createElement('div');
    controlsBar.className = 'custom-controls';
    controlsBar.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(transparent, rgba(0,0,0,0.9));
      padding: 30px 20px 20px;
      transform: translateY(0);
      transition: all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      z-index: 60;
      backdrop-filter: blur(10px);
    `;

    // Полоса прогресса
    const progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
      width: 100%;
      height: 8px;
      background: rgba(255,255,255,0.2);
      border-radius: 4px;
      margin-bottom: 16px;
      cursor: pointer;
      position: relative;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.3);
    `;

    const progressBar = document.createElement('div');
    progressBar.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, #00d4ff, #007bff);
      border-radius: 4px;
      width: 0%;
      transition: width 0.2s ease;
      box-shadow: 0 2px 8px rgba(0,123,255,0.3);
    `;

    const bufferedBar = document.createElement('div');
    bufferedBar.className = 'buffered-bar';
    bufferedBar.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: rgba(255,255,255,0.3);
      border-radius: 4px;
      width: 0%;
    `;

    progressContainer.appendChild(bufferedBar);
    progressContainer.appendChild(progressBar);

    // Контролы
    const controlsRow = document.createElement('div');
    controlsRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 16px;
      color: white;
    `;

    // Кнопка воспроизведения
    const playButton = this.createControlButton('play', `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
    `);

    // Кнопка предыдущего эпизода
    const prevEpisodeButton = this.createControlButton('prev-episode', `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
      </svg>
    `);
    prevEpisodeButton.title = 'Предыдущий эпизод';

    // Кнопка следующего эпизода
    const nextEpisodeButton = this.createControlButton('next-episode', `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
      </svg>
    `);
    nextEpisodeButton.title = 'Следующий эпизод';

    // Обновляем видимость кнопок навигации
    this.updateNavigationButtons(prevEpisodeButton, nextEpisodeButton);

    // Информация о времени
    const timeInfo = document.createElement('span');
    timeInfo.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      min-width: 110px;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    `;
    timeInfo.textContent = '00:00 / 00:00';

    // Spacer для выравнивания
    const spacer = document.createElement('div');
    spacer.style.cssText = `flex: 1;`;

    // Громкость
    const volumeContainer = document.createElement('div');
    volumeContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
    `;

    const volumeButton = this.createControlButton('volume', `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
    `);

    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.value = '100';
    volumeSlider.style.cssText = `
      width: 90px;
      height: 6px;
      background: rgba(255,255,255,0.3);
      border-radius: 3px;
      outline: none;
      cursor: pointer;
      -webkit-appearance: none;
      appearance: none;
    `;

    // Добавляем стили для ползунка через CSS
    const style = document.createElement('style');
    style.textContent = `
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #00d4ff;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,212,255,0.4);
        transition: all 0.2s ease;
      }
      
      input[type="range"]::-webkit-slider-thumb:hover {
        transform: scale(1.2);
        box-shadow: 0 4px 12px rgba(0,212,255,0.6);
      }
      
      input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #00d4ff;
        cursor: pointer;
        border: none;
        box-shadow: 0 2px 8px rgba(0,212,255,0.4);
      }
    `;
    document.head.appendChild(style);

    // Полноэкранная кнопка
    const fullscreenButton = this.createControlButton('fullscreen', `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
      </svg>
    `);

    volumeContainer.appendChild(volumeButton);
    volumeContainer.appendChild(volumeSlider);

    controlsRow.appendChild(playButton);
    controlsRow.appendChild(prevEpisodeButton);
    controlsRow.appendChild(nextEpisodeButton);
    controlsRow.appendChild(timeInfo);
    controlsRow.appendChild(spacer);
    controlsRow.appendChild(volumeContainer);
    controlsRow.appendChild(fullscreenButton);

    controlsBar.appendChild(progressContainer);
    controlsBar.appendChild(controlsRow);
    container.appendChild(controlsBar);

    this.customControls = controlsBar;
    this.progressBar = progressBar;
    this.volumeSlider = volumeSlider;
    this.bufferedBar = bufferedBar;

    // Добавляем обработчики
    this.setupControlsEvents(playButton, timeInfo, progressContainer, volumeButton, fullscreenButton, prevEpisodeButton, nextEpisodeButton);
  }

  /**
   * Создает кнопку для контролов
   */
  private createControlButton(type: string, icon: string): HTMLElement {
    const button = document.createElement('button');
    button.className = `control-btn control-btn-${type}`;
    button.style.cssText = `
      background: rgba(255,255,255,0.1);
      border: none;
      color: white;
      cursor: pointer;
      padding: 12px;
      border-radius: 8px;
      transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(5px);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    button.innerHTML = icon;

    button.addEventListener('mouseenter', () => {
      button.style.background = 'rgba(255,255,255,0.2)';
      button.style.transform = 'scale(1.05)';
      button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
    });

    button.addEventListener('mouseleave', () => {
      button.style.background = 'rgba(255,255,255,0.1)';
      button.style.transform = 'scale(1)';
      button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    });

    button.addEventListener('mousedown', () => {
      button.style.transform = 'scale(0.95)';
    });

    button.addEventListener('mouseup', () => {
      button.style.transform = 'scale(1.05)';
    });

    return button;
  }

  /**
   * Настраивает события видео элемента
   */
  private setupVideoEvents() {
    if (!this.videoElement) return;

    this.videoElement.addEventListener('loadstart', () => {
      console.log('📺 Video loading started');
      this.showLoading();
    });

    this.videoElement.addEventListener('canplay', () => {
      console.log('📺 Video can start playing');
      this.hideLoading();
      this.hideCenterPlayButton();
      
      // Запускаем автосохранение прогресса
      this.startProgressTracking();
    });

    this.videoElement.addEventListener('waiting', () => {
      this.showLoading();
    });

    this.videoElement.addEventListener('playing', () => {
      this.hideLoading();
      this.hideCenterPlayButton();
      this.updatePlayButton(false);
    });

    this.videoElement.addEventListener('pause', () => {
      this.updatePlayButton(true);
      this.showCenterPlayButton();
      
      // Сохраняем прогресс при паузе
      this.saveCurrentProgress();
    });

    this.videoElement.addEventListener('timeupdate', () => {
      this.updateProgress();
    });

    this.videoElement.addEventListener('progress', () => {
      this.updateBuffered();
    });

    this.videoElement.addEventListener('ended', () => {
      this.showCenterPlayButton();
      
      // Сохраняем финальный прогресс
      this.saveCurrentProgress();
      
      // Автопереход к следующей серии
      if (this.currentEpisode < this.episodes.length) {
        setTimeout(() => this.switchEpisode(this.currentEpisode + 1), 2000);
      }
    });

    // Сохраняем прогресс при закрытии страницы
    window.addEventListener('beforeunload', () => {
      this.saveCurrentProgress();
    });
  }

  /**
   * Запускает отслеживание прогресса просмотра
   */
  private startProgressTracking() {
    if (!this.isProgressSystemActive || !this.currentAnimeInfo || !this.videoElement) {
      console.log('⚠️ Progress tracking not available');
      return;
    }

    console.log('📊 Starting progress tracking for:', this.currentAnimeInfo.title);
    
    // Запускаем автосохранение прогресса
    ProgressManager.startAutoSave(this.currentAnimeInfo, this.videoElement);
  }

  /**
   * Сохраняет текущий прогресс просмотра
   */
  private async saveCurrentProgress() {
    if (!this.isProgressSystemActive || !this.currentAnimeInfo || !this.videoElement) {
      return;
    }

    try {
      await ProgressManager.saveProgress(
        this.currentAnimeInfo,
        this.videoElement.currentTime,
        this.videoElement.duration
      );
    } catch (error) {
      console.error('❌ Failed to save progress:', error);
    }
  }

  /**
   * Останавливает отслеживание прогресса
   */
  private stopProgressTracking() {
    ProgressManager.stopAutoSave();
  }

  /**
   * Обновляет информацию об аниме для текущего эпизода
   */
  private updateAnimeInfoForCurrentEpisode() {
    if (!this.currentAnimeInfo || !this.currentTranslation) return;

    this.currentAnimeInfo = {
      ...this.currentAnimeInfo,
      currentEpisode: this.currentEpisode,
      totalEpisodes: this.episodes.length > 0 ? this.episodes.length : undefined,
      translationId: this.currentTranslation.translationId,
      url: window.location.href
    };

    console.log('📺 Updated anime info for episode:', this.currentEpisode, this.currentAnimeInfo);
  }

  /**
   * Проверяет сохраненный прогресс и автоматически восстанавливает его (только при первой загрузке)
   */
  private async checkAndOfferProgressResume() {
    if (!this.isProgressSystemActive || !this.currentAnimeInfo) return;

    // Восстанавливаем прогресс только при первой загрузке страницы
    if (!this.isFirstLoad) {
      console.log('📺 Skipping progress restore - not first load');
      return;
    }

    try {
      const resumeOptions = await ProgressManager.checkForResume(this.currentAnimeInfo);
      
      if (resumeOptions) {
        console.log('📺 Found saved progress, restoring automatically:', resumeOptions);
        
        // Проверяем, нужно ли переключить озвучку
        if (resumeOptions.translation && this.currentTranslation?.translationId !== resumeOptions.translation) {
          console.log(`📺 Switching to saved translation: ${resumeOptions.translation}`);
          
          // Ищем нужную озвучку в списке
          const targetTranslation = this.translations.find(t => t.translationId === resumeOptions.translation);
          
          if (targetTranslation) {
            console.log(`📺 Found target translation: ${targetTranslation.title}`);
            this.currentTranslation = targetTranslation;
            
            // Обновляем UI селектора озвучек
            const translationButtons = this.playerContainer?.querySelectorAll('.translation-btn');
            translationButtons?.forEach((btn, index) => {
              (btn as HTMLElement).style.background = 
                this.translations[index] === targetTranslation ? '#007bff' : '#333';
            });
            
            // Перезагружаем эпизоды для новой озвучки
            await this.loadEpisodes();
            
            // Пересоздаем селектор эпизодов если нужно
            const oldEpisodeSelector = this.playerContainer?.querySelector('.episode-selector');
            if (oldEpisodeSelector) {
              oldEpisodeSelector.remove();
              this.createEpisodeSelector();
            }
          } else {
            console.warn(`⚠️ Translation ${resumeOptions.translation} not found in current list`);
          }
        }
        
        // Проверяем, нужно ли переключить эпизод
        if (resumeOptions.episode !== this.currentEpisode) {
          console.log(`📺 Switching to saved episode: ${resumeOptions.episode}`);
          this.currentEpisode = resumeOptions.episode;
          this.updateAnimeInfoForCurrentEpisode();
          
          // Обновляем UI селектора эпизодов
          const episodeButtons = this.playerContainer?.querySelectorAll('.episode-btn');
          episodeButtons?.forEach(btn => {
            const btnEpisode = parseInt(btn.textContent || '0');
            (btn as HTMLElement).style.background = 
              btnEpisode === this.currentEpisode ? '#007bff' : '#444';
          });
        }
        
        // Показываем информационное уведомление
        ProgressManager.showResumeNotification(this.currentAnimeInfo, resumeOptions);
        
        // Устанавливаем время воспроизведения после загрузки видео
        if (this.videoElement) {
          const setResumeTime = () => {
            if (this.videoElement && resumeOptions.resumeTime > 0) {
              this.videoElement.currentTime = resumeOptions.resumeTime;
              console.log(`📺 Resumed playback at: ${ProgressManager.formatTime(resumeOptions.resumeTime)}`);
            }
          };
          
          if (this.videoElement.readyState >= 1) {
            // Метаданные уже загружены
            setResumeTime();
          } else {
            // Ждем загрузку метаданных
            this.videoElement.addEventListener('loadedmetadata', setResumeTime, { once: true });
          }
        }
        
        // Отмечаем что первая загрузка завершена
        this.isFirstLoad = false;
      } else {
        // Даже если нет прогресса для восстановления, отмечаем первую загрузку как завершенную
        this.isFirstLoad = false;
      }
    } catch (error) {
      console.error('❌ Failed to check progress resume:', error);
      // В случае ошибки тоже отмечаем первую загрузку как завершенную
      this.isFirstLoad = false;
    }
  }

  /**
   * Настраивает клавиатурные сокращения
   */
  private setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
      // Проверяем что видео элемент существует и активен
      if (!this.videoElement) return;
      
      // Игнорируем события если фокус на input элементах (кроме полноэкранного режима)
      if (document.activeElement?.tagName === 'INPUT' && !document.fullscreenElement) return;
      
      // Проверяем что плеер активен (видимый контейнер или полноэкранный режим)
      const isPlayerActive = document.fullscreenElement || 
                           this.playerContainer?.offsetParent !== null;
      
      if (!isPlayerActive) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.seekBy(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.seekBy(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.adjustVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.adjustVolume(-0.1);
          break;
        case 'KeyF':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'KeyM':
          e.preventDefault();
          this.toggleMute();
          break;
        case 'KeyN':
          e.preventDefault();
          this.goToNextEpisode();
          break;
        case 'KeyP':
          e.preventDefault();
          this.goToPreviousEpisode();
          break;
        case 'PageUp':
          e.preventDefault();
          this.goToPreviousEpisode();
          break;
        case 'PageDown':
          e.preventDefault();
          this.goToNextEpisode();
          break;
        case 'Escape':
          // Выход из полноэкранного режима
          if (document.fullscreenElement) {
            e.preventDefault();
            document.exitFullscreen();
          }
          break;
      }
    });
  }

  /**
   * Настраивает события мыши
   */
  private setupMouseControls(container: HTMLElement) {
    let isMouseMoving = false;

    // Обработчик кликов для обычного и полноэкранного режима
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Не обрабатываем клики по кнопкам, input и контролам
      if (target.closest('button') || 
          target.closest('input') || 
          target.closest('.custom-controls')) {
        return;
      }
      
      // Обрабатываем клики по видео или контейнеру
      if (target === this.videoElement || target === container || 
          target.closest('.video-container') === container) {
        this.togglePlayPause();
      }
    };

    // Обработчик движения мыши
    const handleMouseMove = () => {
      this.showControls();
      isMouseMoving = true;
      
      if (this.controlsHideTimeout) {
        clearTimeout(this.controlsHideTimeout);
      }
      
      this.controlsHideTimeout = window.setTimeout(() => {
        if (!isMouseMoving) this.hideControls();
        isMouseMoving = false;
      }, 3000);
    };

    // Привязываем к контейнеру
    container.addEventListener('click', handleClick);
    container.addEventListener('mousemove', handleMouseMove);

    container.addEventListener('mouseleave', () => {
      this.hideControls();
    });

    // Сохраняем ссылки на обработчики для правильного удаления
    this.fullscreenClickHandler = handleClick;
    this.fullscreenMouseMoveHandler = handleMouseMove;

    // Дополнительно привязываем к document для полноэкранного режима
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) {
        // Вошли в полноэкранный режим
        if (this.fullscreenClickHandler) {
          document.addEventListener('click', this.fullscreenClickHandler);
        }
        if (this.fullscreenMouseMoveHandler) {
          document.addEventListener('mousemove', this.fullscreenMouseMoveHandler);
        }
        console.log('🔍 Fullscreen mode enabled - global controls active');
      } else {
        // Вышли из полноэкранного режима
        if (this.fullscreenClickHandler) {
          document.removeEventListener('click', this.fullscreenClickHandler);
        }
        if (this.fullscreenMouseMoveHandler) {
          document.removeEventListener('mousemove', this.fullscreenMouseMoveHandler);
        }
        this.showControls(); // Показываем контролы при выходе из полноэкранного режима
        console.log('🔍 Fullscreen mode disabled - local controls only');
      }
    });
  }

  /**
   * Переключает воспроизведение/паузу
   */
  private togglePlayPause() {
    console.log('🎵 togglePlayPause called, video element:', !!this.videoElement);
    if (!this.videoElement) {
      console.log('❌ No video element found');
      return;
    }

    console.log('🎵 Current paused state:', this.videoElement.paused);
    if (this.videoElement.paused) {
      console.log('▶️ Playing video');
      this.videoElement.play();
    } else {
      console.log('⏸️ Pausing video');
      this.videoElement.pause();
    }
  }

  /**
   * Настраивает события контролов
   */
  private setupControlsEvents(
    playButton: HTMLElement, 
    timeInfo: HTMLElement, 
    progressContainer: HTMLElement, 
    volumeButton: HTMLElement, 
    fullscreenButton: HTMLElement,
    prevEpisodeButton: HTMLElement,
    nextEpisodeButton: HTMLElement
  ) {
    // Кнопка воспроизведения
    if (playButton) {
      playButton.addEventListener('click', () => {
        this.togglePlayPause();
      });
    }

    // Кнопки навигации по эпизодам
    if (prevEpisodeButton) {
      prevEpisodeButton.addEventListener('click', () => {
        this.goToPreviousEpisode();
      });
    }

    if (nextEpisodeButton) {
      nextEpisodeButton.addEventListener('click', () => {
        this.goToNextEpisode();
      });
    }

    // Полоса прогресса
    if (progressContainer) {
      progressContainer.addEventListener('click', (e) => {
        if (!this.videoElement) return;
        const rect = progressContainer.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        this.videoElement.currentTime = percent * this.videoElement.duration;
      });
    }

    // Громкость
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener('input', (e) => {
        if (!this.videoElement) return;
        const target = e.target as HTMLInputElement;
        this.videoElement.volume = parseInt(target.value) / 100;
      });
    }

    if (volumeButton) {
      volumeButton.addEventListener('click', () => {
        this.toggleMute();
      });
    }

    // Полный экран
    if (fullscreenButton) {
      fullscreenButton.addEventListener('click', () => {
        this.toggleFullscreen();
      });
    }

    // Обновляем видимость кнопок навигации
    this.updateNavigationButtons(prevEpisodeButton, nextEpisodeButton);
  }

  /**
   * Показывает индикатор загрузки
   */
  private showLoading() {
    if (this.loadingOverlay) {
      this.loadingOverlay.style.display = 'flex';
    }
  }

  /**
   * Скрывает индикатор загрузки
   */
  private hideLoading() {
    if (this.loadingOverlay) {
      this.loadingOverlay.style.display = 'none';
    }
  }

  /**
   * Показывает центральную кнопку воспроизведения
   */
  private showCenterPlayButton() {
    if (this.centerPlayButton) {
      this.centerPlayButton.style.display = 'flex';
    }
  }

  /**
   * Скрывает центральную кнопку воспроизведения
   */
  private hideCenterPlayButton() {
    if (this.centerPlayButton) {
      this.centerPlayButton.style.display = 'none';
    }
  }

  /**
   * Обновляет состояние кнопки воспроизведения
   */
  private updatePlayButton(isPaused: boolean) {
    const playButtons = document.querySelectorAll('.control-btn-play');
    playButtons.forEach(button => {
      button.innerHTML = isPaused ? `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>
      ` : `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>
      `;
    });
  }

  /**
   * Обновляет полосу прогресса
   */
  private updateProgress() {
    if (!this.videoElement || !this.progressBar) return;
    
    const percent = (this.videoElement.currentTime / this.videoElement.duration) * 100;
    this.progressBar.style.width = `${percent}%`;

    // Обновляем время
    const timeInfo = document.querySelector('.custom-controls span') as HTMLElement;
    if (timeInfo) {
      const current = this.formatTime(this.videoElement.currentTime);
      const duration = this.formatTime(this.videoElement.duration);
      timeInfo.textContent = `${current} / ${duration}`;
    }
  }

  /**
   * Обновляет полосу буферизации
   */
  private updateBuffered() {
    if (!this.videoElement || !this.bufferedBar) return;
    
    if (this.videoElement.buffered.length > 0) {
      const bufferedEnd = this.videoElement.buffered.end(this.videoElement.buffered.length - 1);
      const percent = (bufferedEnd / this.videoElement.duration) * 100;
      this.bufferedBar.style.width = `${percent}%`;
    }
  }

  /**
   * Перематывает видео на указанное количество секунд
   */
  private seekBy(seconds: number) {
    if (!this.videoElement) return;
    this.videoElement.currentTime = Math.max(0, Math.min(
      this.videoElement.duration, 
      this.videoElement.currentTime + seconds
    ));
  }

  /**
   * Регулирует громкость
   */
  private adjustVolume(delta: number) {
    if (!this.videoElement) return;
    this.videoElement.volume = Math.max(0, Math.min(1, this.videoElement.volume + delta));
    
    if (this.volumeSlider) {
      this.volumeSlider.value = (this.videoElement.volume * 100).toString();
    }
  }

  /**
   * Переключает полноэкранный режим
   */
  private toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.videoElement?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  /**
   * Переключает звук
   */
  private toggleMute() {
    if (!this.videoElement) return;
    this.videoElement.muted = !this.videoElement.muted;
    
    const volumeButton = document.querySelector('.control-btn-volume');
    if (volumeButton) {
      volumeButton.innerHTML = this.videoElement.muted ? `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
        </svg>
      ` : `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
        </svg>
      `;
    }
  }

  /**
   * Показывает контролы
   */
  private showControls() {
    if (this.customControls) {
      this.customControls.style.transform = 'translateY(0)';
      this.customControls.style.opacity = '1';
      this.customControls.style.pointerEvents = 'auto';
    }
  }

  /**
   * Скрывает контролы
   */
  private hideControls() {
    if (this.customControls && !this.videoElement?.paused) {
      this.customControls.style.transform = 'translateY(100%)';
      this.customControls.style.opacity = '0';
      this.customControls.style.pointerEvents = 'none';
    }
  }

  /**
   * Форматирует время в формат mm:ss
   */
  private formatTime(seconds: number): string {
    if (isNaN(seconds)) return '00:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Загружает видео для текущего эпизода
   */
  private async loadVideo() {
    if (!this.videoElement || !this.currentTranslation) return;

    console.log('🔄 Loading video for episode:', this.currentEpisode);

    try {
      // Обновляем информацию об аниме для текущего эпизода
      this.updateAnimeInfoForCurrentEpisode();

      // Обновляем poster для нового эпизода
      await this.createVideoPoster();

      // Проверяем есть ли сохраненный прогресс
      await this.checkAndOfferProgressResume();

      console.log('🔍 Getting real video URL from Kodik...');
      
      // Строим URL для конкретного эпизода
      const episodeUrl = `https://kodik.info/serial/${this.currentTranslation.mediaId}/${this.currentTranslation.mediaHash}/720p?min_age=16&first_url=false&season=1&episode=${this.currentEpisode}`;
      console.log('📺 Episode URL:', episodeUrl);
      
      // Используем background script для обхода CORS
      const response = await this.fetchViaBackground(episodeUrl);
      if (!response.success) {
        throw new Error(`Failed to fetch episode page: ${response.error}`);
      }
      
      const html = response.data;
      if (!html) {
        throw new Error('Empty response from episode page');
      }
      
      console.log('📄 HTML response length:', html.length);
      console.log('📄 HTML preview:', html.substring(0,  500));
      
      // Попробуем разные варианты поиска urlParams
      let urlParams;
      
      // Вариант 1: urlParams = '([^']+)';
      let urlParamsMatch = html.match(/urlParams = '([^']+)';/);
      if (urlParamsMatch) {
        console.log('✅ Found urlParams variant 1 (string)');
        urlParams = JSON.parse(urlParamsMatch[1]);
      } else {
        // Вариант 2: urlParams = {...};
        urlParamsMatch = html.match(/urlParams = ({[^;]+});/);
        if (urlParamsMatch) {
          console.log('✅ Found urlParams variant 2 (object)');
          urlParams = JSON.parse(urlParamsMatch[1]);
        } else {
          // Вариант 3: urlParams='{"json":"string"}';
          urlParamsMatch = html.match(/urlParams='([^']+)';/);
          if (urlParamsMatch) {
            console.log('✅ Found urlParams variant 3 (string no space)');
            urlParams = JSON.parse(urlParamsMatch[1]);
          } else {
            // Вариант 4: var urlParams = {...}
            urlParamsMatch = html.match(/var urlParams = ({[^;]+});/);
            if (urlParamsMatch) {
              console.log('✅ Found urlParams variant 4 (var object)');
              urlParams = JSON.parse(urlParamsMatch[1]);
            } else {
              // Поищем все что содержит urlParams
              const allMatches = html.match(/urlParams[^{'"]*[{'"'][^}'"]+[}'"]/g);
              console.log('🔍 All urlParams matches:', allMatches);
              
              throw new Error('Could not find urlParams in page');
            }
          }
        }
      }
      
      if (!urlParams) {
        throw new Error('Could not parse urlParams');
      }
      
      console.log('🔧 URL Params:', urlParams);
      
      // Извлекаем video параметры из скриптов
      const videoTypeMatch = html.match(/\.type = '([^']+)'/);
      const videoHashMatch = html.match(/\.hash = '([^']+)'/);
      const videoIdMatch = html.match(/\.id = '([^']+)'/);
      
      console.log('🔍 Video type match:', videoTypeMatch);
      console.log('🔍 Video hash match:', videoHashMatch);
      console.log('🔍 Video id match:', videoIdMatch);
      
      if (!videoTypeMatch || !videoHashMatch || !videoIdMatch) {
        // Попробуем альтернативные паттерны
        const altTypeMatch = html.match(/type:\s*'([^']+)'/);
        const altHashMatch = html.match(/hash:\s*'([^']+)'/);
        const altIdMatch = html.match(/id:\s*'([^']+)'/);
        
        console.log('🔍 Alt type match:', altTypeMatch);
        console.log('🔍 Alt hash match:', altHashMatch);
        console.log('🔍 Alt id match:', altIdMatch);
        
        if (!altTypeMatch || !altHashMatch || !altIdMatch) {
          // Выведем часть HTML где должны быть эти параметры
          const scriptTags = html.match(/<script[^>]*>[\s\S]*?<\/script>/g);
          console.log('📜 All script tags count:', scriptTags?.length);
          if (scriptTags && scriptTags.length > 0) {
            scriptTags.forEach((script, index) => {
              if (script.includes('type') || script.includes('hash') || script.includes('id')) {
                console.log(`📜 Script ${index} with params:`, script.substring(0, 300));
              }
            });
          }
          
          throw new Error('Could not extract video parameters');
        }
        
        var videoType = altTypeMatch[1];
        var videoHash = altHashMatch[1];
        var videoId = altIdMatch[1];
      } else {
        var videoType = videoTypeMatch[1];
        var videoHash = videoHashMatch[1];
        var videoId = videoIdMatch[1];
      }
      
      console.log('🎬 Video params:', { videoType, videoHash, videoId });
      
      // Находим script URL для POST запроса (реплицируем Python логику)
      // Получаем все скрипты и берем правильный для script URL
      const allScriptMatches = html.match(/<script[^>]*>/g);
      if (!allScriptMatches || allScriptMatches.length < 1) {
        console.log('🔍 All script tags found:', allScriptMatches);
        throw new Error('Could not find script tags');
      }
      
      console.log('🔍 All script tags found:', allScriptMatches);
      
      // Ищем первый скрипт с src (это главный app.js)
      let scriptUrl = null;
      for (let i = 0; i < allScriptMatches.length; i++) {
        const script = allScriptMatches[i];
        const scriptSrcMatch = script.match(/src=['"]([^'"]+)['"]/);
        if (scriptSrcMatch && !scriptSrcMatch[1].includes('adsbygoogle')) {
          scriptUrl = scriptSrcMatch[1];
          console.log(`� Found script URL at index ${i}:`, scriptUrl);
          break;
        }
      }
      
      if (!scriptUrl) {
        throw new Error('Could not find main script URL');
      }
      
      // Получаем post link из скрипта
      const scriptResponse = await this.fetchViaBackground('https://kodik.info' + scriptUrl);
      if (!scriptResponse.success) {
        throw new Error(`Failed to fetch script: ${scriptResponse.error}`);
      }
      
      const scriptContent = scriptResponse.data;
      if (!scriptContent) {
        throw new Error('Empty response from script');
      }
      
      // Ищем POST endpoint в скрипте (реплицируем Python логику)
      // Python: url = data[data.find("$.ajax") + 30 : data.find("cache:!1") - 3]
      const ajaxIndex = scriptContent.indexOf("$.ajax");
      if (ajaxIndex === -1) {
        console.log('🔍 Script content preview:', scriptContent.substring(0, 500));
        throw new Error('Could not find $.ajax in script');
      }
      
      const cacheIndex = scriptContent.indexOf("cache:!1");
      if (cacheIndex === -1) {
        console.log('🔍 Script content preview:', scriptContent.substring(0, 500));
        throw new Error('Could not find cache:!1 in script');
      }
      
      const base64Url = scriptContent.substring(ajaxIndex + 30, cacheIndex - 3);
      console.log('🔍 Base64 URL extracted:', base64Url);
      
      // Декодируем base64 для получения реального POST URL
      let postLink;
      try {
        postLink = atob(base64Url);
        console.log('🔗 Decoded post link:', postLink);
      } catch (error) {
        console.log('❌ Failed to decode base64:', base64Url);
        throw new Error('Could not decode base64 post link');
      }
      
      // Подготавливаем данные для POST запроса
      const postData = {
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
      };
      
      // Делаем POST запрос через background script
      const postResponse = await this.postViaBackground(`https://kodik.info${postLink}`, postData);
      if (!postResponse.success) {
        throw new Error(`Failed to get video data: ${postResponse.error}`);
      }
      
      const videoData = postResponse.data;
      console.log('🎯 Video data:', videoData);
      
      if (!videoData.links || Object.keys(videoData.links).length === 0) {
        throw new Error('No video links found in response');
      }
      
      const maxQuality = Math.max(...Object.keys(videoData.links).map(Number));
      
      if (!videoData.links[maxQuality] || !videoData.links[maxQuality][0]) {
        throw new Error('No video URL found for max quality: ' + maxQuality);
      }
      
      const videoUrl = videoData.links[maxQuality][0].src;
      
      console.log('✅ Got video URL:', videoUrl);
      console.log('📊 Max quality:', maxQuality);

      // Проверяем нужно ли декодировать URL (реплицируем Python логику)
      let finalVideoUrl = videoUrl;
      if (!videoUrl.includes('mp4:hls:manifest')) {
        console.log('🔓 Decrypting video URL...');
        finalVideoUrl = this.convertKodikUrl(videoUrl);
        console.log('🔓 Decrypted URL:', finalVideoUrl);
      } else {
        console.log('✅ URL already contains mp4:hls:manifest, no decryption needed');
      }

      // Проверяем доступность HLS.js
      if (typeof window.Hls !== 'undefined' && window.Hls.isSupported()) {
        // Используем HLS.js
        if (this.hlsPlayer) {
          this.hlsPlayer.destroy();
        }

        this.hlsPlayer = new window.Hls({
          debug: false,
          enableWorker: true,
          lowLatencyMode: false,
          maxMaxBufferLength: 30
        });

        this.hlsPlayer.loadSource(finalVideoUrl);
        this.hlsPlayer.attachMedia(this.videoElement);

        this.hlsPlayer.on(window.Hls.Events.MANIFEST_PARSED, () => {
          console.log('✅ HLS manifest loaded');
        });

        this.hlsPlayer.on(window.Hls.Events.ERROR, (event: any, data: any) => {
          console.error('❌ HLS error:', data);
          
          // Пробуем fallback - прямая загрузка
          if (data.fatal) {
            console.log('🔄 Trying direct video loading...');
            this.videoElement!.src = finalVideoUrl;
          }
        });

      } else if (this.videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        // Прямая поддержка HLS (Safari)
        this.videoElement.src = finalVideoUrl;
      } else {
        console.warn('⚠️ HLS not supported, trying direct loading');
        this.videoElement.src = finalVideoUrl;
      }

    } catch (error) {
      console.error('❌ Failed to load video:', error);
    }
  }

  /**
   * Переключает перевод
   */
  private async switchTranslation(translation: Translation) {
    console.log('🔄 Switching translation to:', translation.title);
    
    // Останавливаем отслеживание прогресса
    this.stopProgressTracking();
    
    // Сохраняем текущий прогресс
    await this.saveCurrentProgress();
    
    // Отмечаем что это уже не первая загрузка (пользователь переключил вручную)
    this.isFirstLoad = false;
    
    this.currentTranslation = translation;
    // НЕ сбрасываем эпизод на 1 - пусть прогресс восстановится автоматически

    // Обновляем информацию об аниме
    this.updateAnimeInfoForCurrentEpisode();

    // Обновляем кнопки переводов
    const translationButtons = this.playerContainer?.querySelectorAll('.translation-btn');
    translationButtons?.forEach((btn, index) => {
      (btn as HTMLElement).style.background = 
        this.translations[index] === translation ? '#007bff' : '#333';
    });

    // Загружаем эпизоды для нового перевода
    await this.loadEpisodes();
    
    // Пересоздаем селектор эпизодов
    const oldEpisodeSelector = this.playerContainer?.querySelector('.episode-selector');
    if (oldEpisodeSelector) {
      oldEpisodeSelector.remove();
      this.createEpisodeSelector();
    }

    // Загружаем новое видео (прогресс НЕ восстановится, так как isFirstLoad = false)
    await this.loadVideo();

    // Обновляем кнопки навигации
    this.updateNavigationButtonsVisibility();
  }

  /**
   * Переключает эпизод
   */
  private async switchEpisode(episodeNumber: number) {
    console.log('🔄 Switching to episode:', episodeNumber);
    
    // Останавливаем отслеживание прогресса
    this.stopProgressTracking();
    
    // Сохраняем текущий прогресс
    await this.saveCurrentProgress();
    
    // Отмечаем что это уже не первая загрузка (пользователь переключил вручную)
    this.isFirstLoad = false;
    
    this.currentEpisode = episodeNumber;

    // Обновляем информацию об аниме
    this.updateAnimeInfoForCurrentEpisode();

    // Обновляем кнопки эпизодов
    const episodeButtons = this.playerContainer?.querySelectorAll('.episode-btn');
    episodeButtons?.forEach(btn => {
      const btnEpisode = parseInt(btn.textContent || '0');
      (btn as HTMLElement).style.background = 
        btnEpisode === episodeNumber ? '#007bff' : '#444';
    });

    // Загружаем новое видео (прогресс НЕ восстановится, так как isFirstLoad = false)
    await this.loadVideo();

    // Обновляем кнопки навигации
    this.updateNavigationButtonsVisibility();
  }

  /**
   * Переходит к предыдущему эпизоду
   */
  private goToPreviousEpisode() {
    if (this.currentEpisode > 1) {
      this.switchEpisode(this.currentEpisode - 1);
    }
  }

  /**
   * Переходит к следующему эпизоду
   */
  private goToNextEpisode() {
    if (this.currentEpisode < this.episodes.length) {
      this.switchEpisode(this.currentEpisode + 1);
    }
  }

  /**
   * Обновляет видимость кнопок навигации по эпизодам
   */
  private updateNavigationButtons(prevButton: HTMLElement, nextButton: HTMLElement) {
    if (prevButton) {
      const hasPrevious = this.currentEpisode > 1;
      prevButton.style.display = hasPrevious ? 'flex' : 'none';
      prevButton.style.opacity = hasPrevious ? '1' : '0.5';
    }

    if (nextButton) {
      const hasNext = this.currentEpisode < this.episodes.length;
      nextButton.style.display = hasNext ? 'flex' : 'none';
      nextButton.style.opacity = hasNext ? '1' : '0.5';
    }
  }

  /**
   * Обновляет видимость кнопок навигации (общий метод)
   */
  private updateNavigationButtonsVisibility() {
    const prevButton = this.playerContainer?.querySelector('.control-btn-prev-episode') as HTMLElement;
    const nextButton = this.playerContainer?.querySelector('.control-btn-next-episode') as HTMLElement;
    
    if (prevButton && nextButton) {
      this.updateNavigationButtons(prevButton, nextButton);
    }
  }

  /**
   * Форматирует время в MM:SS
   */

  /**
   * GET запрос через background script для обхода CORS
   */
  private async fetchViaBackground(url: string, timeout: number = 30000): Promise<{ success: boolean; data?: string; error?: string }> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({ success: false, error: 'Request timeout' });
      }, timeout);

      chrome.runtime.sendMessage({
        type: 'FETCH_KODIK_PAGE',
        url: url
      }, (response) => {
        clearTimeout(timeoutId);
        resolve(response);
      });
    });
  }

  /**
   * POST запрос через background script для обхода CORS
   */
  private async postViaBackground(url: string, data: any, timeout: number = 30000): Promise<{ success: boolean; data?: any; error?: string }> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({ success: false, error: 'Request timeout' });
      }, timeout);

      chrome.runtime.sendMessage({
        type: 'FETCH_KODIK_POST',
        url: url,
        data: data
      }, (response) => {
        clearTimeout(timeoutId);
        resolve(response);
      });
    });
  }

  // Методы декодирования URL (реплицируют Python логику)
  private convertChar(char: string, num: number): string {
    const isLower = char === char.toLowerCase();
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const upperChar = char.toUpperCase();
    
    if (alphabet.includes(upperChar)) {
      const index = alphabet.indexOf(upperChar);
      const newIndex = (index + num) % alphabet.length;
      const newChar = alphabet[newIndex];
      return isLower ? newChar.toLowerCase() : newChar;
    } else {
      return char;
    }
  }

  convertKodikUrl(encryptedUrl: string): string {
    console.log('🔓 Starting URL decryption for:', encryptedUrl.substring(0, 50) + '...');
    
    // Попробуем все возможные сдвиги ROT (0-25)
    for (let rot = 0; rot < 26; rot++) {
      try {
        // Применяем Caesar cipher с текущим сдвигом
        const decryptedChars = encryptedUrl.split('').map(char => this.convertChar(char, rot));
        let decryptedUrl = decryptedChars.join('');
        
        // Добавляем padding для base64 если нужно
        const padding = (4 - (decryptedUrl.length % 4)) % 4;
        decryptedUrl += '='.repeat(padding);
        
        // Пробуем декодировать из base64
        const decodedUrl = atob(decryptedUrl);
        
        // Проверяем что результат содержит ожидаемую строку
        if (decodedUrl.includes('mp4:hls:manifest')) {
          console.log(`🔓 Successfully decrypted with ROT${rot}: ${decodedUrl.substring(0, 100)}...`);
          return decodedUrl;
        }
      } catch (error) {
        // Игнорируем ошибки декодирования и пробуем следующий сдвиг
        continue;
      }
    }
    
    console.log('❌ Could not decrypt URL, returning original');
    throw new Error('Decryption failed - could not find valid mp4:hls:manifest URL');
  }

  // Асинхронные оптимизированные методы
  /**
   * Асинхронный парсинг переводов с батчингом
   */
  async parseTranslationsAsync(): Promise<void> {
    return new Promise((resolve) => {
      // Используем requestIdleCallback для выполнения в свободное время
      const idleCallback = (deadline: IdleDeadline) => {
        console.log('🔍 Parsing translations asynchronously...');
        
        const translatorsList = this.getCachedElement('#translators-list, .b-translators__list');
        if (!translatorsList) {
          console.warn('⚠️ Translators list not found');
          resolve();
          return;
        }

        const translatorItems = translatorsList.querySelectorAll('.b-translator__item, li[data-this_link]');
        const batchSize = 3; // Обрабатываем по 3 элемента за раз
        let currentIndex = 0;
        
        const processBatch = () => {
          const endIndex = Math.min(currentIndex + batchSize, translatorItems.length);
          
          for (let i = currentIndex; i < endIndex; i++) {
            const item = translatorItems[i];
            const link = item.getAttribute('data-this_link');
            const title = item.textContent?.trim() || 'Unknown';
            
            if (link) {
              const urlMatch = link.match(/\/serial\/(\d+)\/([a-f0-9]+)\/720p/);
              if (urlMatch) {
                const mediaId = urlMatch[1];
                const mediaHash = urlMatch[2];
                
                const translation: Translation = {
                  title,
                  kodikUrl: link,
                  translationId: `${mediaId}_${mediaHash}`,
                  mediaId,
                  mediaHash
                };
                
                this.translations.push(translation);
              }
            }
          }
          
          currentIndex = endIndex;
          
          // Если еще есть элементы и есть время
          if (currentIndex < translatorItems.length && deadline.timeRemaining() > 1) {
            processBatch();
          } else if (currentIndex < translatorItems.length) {
            // Планируем следующий батч
            requestIdleCallback(idleCallback);
          } else {
            // Готово
            this.currentTranslation = this.translations[0] || null;
            console.log(`✅ Parsed ${this.translations.length} translations asynchronously`);
            resolve();
          }
        };
        
        processBatch();
      };
      
      if ('requestIdleCallback' in window) {
        requestIdleCallback(idleCallback);
      } else {
        // Fallback для браузеров без requestIdleCallback
        setTimeout(() => idleCallback({ timeRemaining: () => 50, didTimeout: false }), 0);
      }
    });
  }

  /**
   * Асинхронное удаление оригинального плеера
   */
  async removeOriginalPlayerAsync(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        const playerSelectors = [
          '.pmovie__player iframe[src*="kodik"]',
          'iframe[src*="kodik.info"]',
          'iframe[src*="kodikapi.com"]',
          '.tabs-block__content iframe'
        ];

        // Batch DOM operations
        const elementsToHide: HTMLElement[] = [];
        
        for (const selector of playerSelectors) {
          const iframe = this.getCachedElement(selector) as HTMLElement;
          if (iframe) {
            elementsToHide.push(iframe);
            
            // Скрываем все связанные контейнеры
            let parent = iframe.parentElement;
            while (parent && parent !== document.body) {
              if (parent.querySelector('iframe[src*="kodik"]')) {
                elementsToHide.push(parent);
                break;
              }
              parent = parent.parentElement;
            }
          }
        }
        
        // Применяем изменения одним батчом
        if (elementsToHide.length > 0) {
          elementsToHide.forEach(el => {
            el.style.display = 'none';
          });
          console.log(`🗑️ Hidden ${elementsToHide.length} original player elements asynchronously`);
        }
        
        resolve();
      });
    });
  }

  /**
   * Асинхронное извлечение информации об аниме
   */
  async extractAnimeInfoAsync(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        console.log('🔍 Extracting anime info asynchronously...');
        
        if (!this.currentTranslation) {
          console.warn('⚠️ No current translation available');
          resolve();
          return;
        }

        const animeId = this.currentTranslation.mediaId;
        let title = document.title;
        
        // Оптимизированная очистка названия
        title = title
          .replace(/\s*[-|]\s*(смотреть|аниме|онлайн).*$/i, '')
          .replace(/\s*\(\d{4}\).*$/, '')
          .trim();

        if (!title || title.length < 3) {
          const titleSelectors = ['h1', '.anime-title', '.title', '.pmovie__title'];
          for (const selector of titleSelectors) {
            const element = this.getCachedElement(selector);
            if (element?.textContent?.trim()) {
              title = element.textContent.trim();
              break;
            }
          }
        }

        this.currentAnimeInfo = {
          id: animeId,
          title: title || 'Unknown Anime',
          currentEpisode: this.currentEpisode,
          totalEpisodes: this.episodes.length > 0 ? this.episodes.length : undefined,
          translationId: this.currentTranslation.translationId,
          url: window.location.href
        };

        console.log('📺 Extracted anime info asynchronously:', this.currentAnimeInfo);
        this.isProgressSystemActive = true;
        resolve();
      });
    });
  }

  /**
   * Показывает состояние ошибки пользователю
   */
  showErrorState(error: Error): void {
    const placeholder = document.querySelector('.kodik-instant-placeholder');
    if (placeholder) {
      placeholder.innerHTML = `
        <div style="text-align: center; color: #ff4444;">
          <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
          <div style="font-size: 18px; margin-bottom: 10px;">Ошибка загрузки плеера</div>
          <div style="font-size: 14px; opacity: 0.7;">${error.message}</div>
          <button onclick="location.reload()" style="
            background: #ff6b35;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            margin-top: 15px;
            cursor: pointer;
          ">Перезагрузить</button>
        </div>
      `;
    }
  }
}

// Функция ожидания загрузки DOM
function waitForDOM(): Promise<void> {
  return new Promise((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => resolve());
    } else {
      resolve();
    }
  });
}

// Функция ожидания элементов на странице
function waitForElements(selectors: string[], timeout: number = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    function checkElements() {
      const allFound = selectors.every(selector => document.querySelector(selector));
      
      if (allFound) {
        console.log('✅ All required elements found:', selectors);
        resolve();
      } else if (Date.now() - startTime > timeout) {
        console.log('⚠️ Timeout waiting for elements:', selectors);
        resolve(); // Продолжаем даже если не все элементы найдены
      } else {
        setTimeout(checkElements, 100);
      }
    }
    
    checkElements();
  });
}

// Асинхронная инициализация с ожиданием
async function initializeExtension() {
  try {
    console.log('⏳ Waiting for DOM to be ready...');
    await waitForDOM();
    
    console.log('⏳ Waiting for page elements to load...');
    await waitForElements([
      '.b-translators__list, #translators-list',
      '.pmovie__player, .tabs-block__content, #kodik-tab-player'
    ], 15000);
    
    // Дополнительная задержка для загрузки динамического контента
    console.log('⏳ Additional wait for dynamic content...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('🚀 Starting extension initialization...');
    const optimizer = new AnimeStarsKodikOptimizer();
    await optimizer.init();
    
    // Экспорт для отладки
    (window as any).animeStarsOptimizer = optimizer;
    
  } catch (error) {
    console.error('❌ Extension initialization failed:', error);
  }
}

// Запуск инициализации
initializeExtension();
