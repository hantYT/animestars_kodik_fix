// Правильный content script для AnimStars Kodik optimization
// Парсит переводы, удаляет оригинальный плеер, создает свой HLS плеер

import { kodikAPI } from '../api/kodik-client';

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

  /**
   * Инициализация оптимизатора
   */
  async init() {
    console.log('🚀 AnimeStars Kodik Optimizer starting...');
    
    // Дополнительная проверка готовности элементов
    await this.waitForPageReady();
    
    // Запускаем основную логику
    await this.start();
  }

  /**
   * Ожидание готовности страницы и элементов
   */
  private async waitForPageReady(): Promise<void> {
    console.log('⏳ Checking page readiness...');
    
    // Проверяем наличие ключевых элементов
    const requiredSelectors = [
      '.b-translators__list',
      '#translators-list', 
      '.pmovie__player',
      '.tabs-block__content'
    ];
    
    let retries = 0;
    const maxRetries = 30; // 30 секунд максимум
    
    while (retries < maxRetries) {
      const foundElements = requiredSelectors.filter(selector => document.querySelector(selector));
      
      if (foundElements.length > 0) {
        console.log('✅ Found page elements:', foundElements);
        break;
      }
      
      console.log(`⏳ Waiting for page elements... (attempt ${retries + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries++;
    }
    
    if (retries >= maxRetries) {
      console.log('⚠️ Timeout waiting for page elements, proceeding anyway...');
    }
  }

  /**
   * Основная логика запуска
   */
  private async start() {
    try {
      // 1. Парсим список переводов из DOM
      this.parseTranslations();
      
      if (this.translations.length === 0) {
        console.log('❌ No translations found');
        return;
      }

      // 2. Удаляем оригинальный плеер
      this.removeOriginalPlayer();

      // 3. Создаем свой плеер
      await this.createCustomPlayer();

      console.log('✅ AnimeStars Kodik Optimizer initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize optimizer:', error);
    }
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

    // Загружаем эпизоды для текущего перевода
    await this.loadEpisodes();

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
   * Загружает список эпизодов для текущего перевода
   */
  private async loadEpisodes() {
    if (!this.currentTranslation) return;

    console.log('📺 Loading episodes for:', this.currentTranslation.title);

    try {
      // Получаем реальное количество серий из Kodik
      const response = await this.fetchViaBackground(this.currentTranslation.kodikUrl);
      if (!response.success) {
        throw new Error('Failed to fetch episode data');
      }

      const html = response.data;
      if (!html) {
        throw new Error('Empty HTML response');
      }
      
      this.episodes = [];

      // Ищем в HTML количество серий или селектор серий
      console.log('🔍 Searching for episodes in HTML...');
      
      // Паттерн 1: data-episode="X"
      const episodeMatches = html.match(/data-episode="(\d+)"/g);
      console.log('🔍 data-episode matches:', episodeMatches);
      
      // Паттерн 2: episode=X в URL или параметрах
      const urlEpisodeMatches = html.match(/episode=(\d+)/g);
      console.log('🔍 URL episode matches:', urlEpisodeMatches);
      
      // Паттерн 3: Селекторы серий в select options
      const selectEpisodeMatches = html.match(/<option[^>]*value="(\d+)"[^>]*>(\d+)/g);
      console.log('🔍 Select option matches:', selectEpisodeMatches);
      
      // Паттерн 4: Кнопки серий
      const buttonEpisodeMatches = html.match(/data-season-episode="(\d+)"/g);
      console.log('🔍 Button episode matches:', buttonEpisodeMatches);
      
      let maxEpisode = 0;
      
      if (episodeMatches && episodeMatches.length > 0) {
        const episodeNumbers = episodeMatches.map((match: string) => {
          const numberMatch = match.match(/data-episode="(\d+)"/);
          return numberMatch ? parseInt(numberMatch[1]) : 0;
        });
        maxEpisode = Math.max(...episodeNumbers);
        console.log('📺 Found max episode from data-episode:', maxEpisode);
      } else if (urlEpisodeMatches && urlEpisodeMatches.length > 0) {
        const episodeNumbers = urlEpisodeMatches.map((match: string) => {
          const numberMatch = match.match(/episode=(\d+)/);
          return numberMatch ? parseInt(numberMatch[1]) : 0;
        });
        maxEpisode = Math.max(...episodeNumbers);
        console.log('📺 Found max episode from URL params:', maxEpisode);
      } else if (selectEpisodeMatches && selectEpisodeMatches.length > 0) {
        const episodeNumbers = selectEpisodeMatches.map((match: string) => {
          const numberMatch = match.match(/value="(\d+)"/);
          return numberMatch ? parseInt(numberMatch[1]) : 0;
        });
        maxEpisode = Math.max(...episodeNumbers);
        console.log('📺 Found max episode from select options:', maxEpisode);
      } else if (buttonEpisodeMatches && buttonEpisodeMatches.length > 0) {
        const episodeNumbers = buttonEpisodeMatches.map((match: string) => {
          const numberMatch = match.match(/data-season-episode="(\d+)"/);
          return numberMatch ? parseInt(numberMatch[1]) : 0;
        });
        maxEpisode = Math.max(...episodeNumbers);
        console.log('📺 Found max episode from button episodes:', maxEpisode);
      }
      
      if (maxEpisode > 0) {
        console.log('📺 Using detected episode count:', maxEpisode);
        for (let i = 1; i <= maxEpisode; i++) {
          this.episodes.push({
            number: i,
            title: `Серия ${i}`
          });
        }
      } else {
        // Fallback: пробуем найти другие паттерны для определения количества серий
        const seasonInfoMatch = html.match(/серия[^\d]*(\d+)/i) || html.match(/episode[^\d]*(\d+)/i);
        const episodeCount = seasonInfoMatch ? parseInt(seasonInfoMatch[1]) : 1;
        
        console.log('📺 Using fallback episode count:', episodeCount);
        
        for (let i = 1; i <= episodeCount; i++) {
          this.episodes.push({
            number: i,
            title: `Серия ${i}`
          });
        }
      }

      console.log('📺 Created episodes:', this.episodes.length);
    } catch (error) {
      console.error('❌ Failed to load episodes:', error);
      // Создаем одну серию по умолчанию
      this.episodes = [{ number: 1, title: 'Серия 1' }];
      console.log('📺 Using single default episode');
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
    
    if (this.episodes.length <= 1) {
      console.log('⚠️ Only 1 or 0 episodes, skipping episode selector');
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

      if (button) {
        button.addEventListener('click', () => {
          this.switchEpisode(episode.number);
        });
      }

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
    this.videoElement.poster = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAwIiBoZWlnaHQ9IjQ1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImEiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiMyMzIzMjMiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0eWxlPSJzdG9wLWNvbG9yOiMxMTExMTEiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2EpIi8+PC9zdmc+';

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

    centerButton.addEventListener('click', () => {
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
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
      </svg>
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
    this.setupControlsEvents(playButton, timeInfo, progressContainer, volumeButton, fullscreenButton);
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
    });

    this.videoElement.addEventListener('waiting', () => {
      this.showLoading();
    });

    this.videoElement.addEventListener('playing', () => {
      this.hideLoading();
      this.updatePlayButton(false);
    });

    this.videoElement.addEventListener('pause', () => {
      this.updatePlayButton(true);
      this.showCenterPlayButton();
    });

    this.videoElement.addEventListener('timeupdate', () => {
      this.updateProgress();
    });

    this.videoElement.addEventListener('progress', () => {
      this.updateBuffered();
    });

    this.videoElement.addEventListener('ended', () => {
      this.showCenterPlayButton();
      // Автопереход к следующей серии
      if (this.currentEpisode < this.episodes.length) {
        setTimeout(() => this.switchEpisode(this.currentEpisode + 1), 2000);
      }
    });
  }

  /**
   * Настраивает клавиатурные сокращения
   */
  private setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
      if (!this.videoElement || document.activeElement?.tagName === 'INPUT') return;

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
      }
    });
  }

  /**
   * Настраивает события мыши
   */
  private setupMouseControls(container: HTMLElement) {
    let isMouseMoving = false;

    container.addEventListener('click', (e) => {
      if (e.target === this.videoElement || e.target === container) {
        this.togglePlayPause();
      }
    });

    container.addEventListener('mousemove', () => {
      this.showControls();
      isMouseMoving = true;
      
      if (this.controlsHideTimeout) {
        clearTimeout(this.controlsHideTimeout);
      }
      
      this.controlsHideTimeout = window.setTimeout(() => {
        if (!isMouseMoving) this.hideControls();
        isMouseMoving = false;
      }, 3000);
    });

    container.addEventListener('mouseleave', () => {
      this.hideControls();
    });
  }

  /**
   * Переключает воспроизведение/паузу
   */
  private togglePlayPause() {
    if (!this.videoElement) return;

    if (this.videoElement.paused) {
      this.videoElement.play();
    } else {
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
    fullscreenButton: HTMLElement
  ) {
    // Кнопка воспроизведения
    if (playButton) {
      playButton.addEventListener('click', () => {
        this.togglePlayPause();
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
      console.log('📄 HTML preview:', html.substring(0, 500));
      
      // Попробуем разные варианты поиска urlParams
      let urlParams;
      
      // Вариант 1: urlParams = '{"json":"string"}';
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
    
    this.currentTranslation = translation;
    this.currentEpisode = 1;

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

    // Загружаем новое видео
    await this.loadVideo();
  }

  /**
   * Переключает эпизод
   */
  private async switchEpisode(episodeNumber: number) {
    console.log('🔄 Switching to episode:', episodeNumber);
    
    this.currentEpisode = episodeNumber;

    // Обновляем кнопки эпизодов
    const episodeButtons = this.playerContainer?.querySelectorAll('.episode-btn');
    episodeButtons?.forEach(btn => {
      const btnEpisode = parseInt(btn.textContent || '0');
      (btn as HTMLElement).style.background = 
        btnEpisode === episodeNumber ? '#007bff' : '#444';
    });

    // Загружаем новое видео
    await this.loadVideo();
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
