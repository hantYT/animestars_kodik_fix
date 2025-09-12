// DOM детектор для поиска и замены Kodik плееров на AnimStars и AsStars
// Анализирует структуру страницы и находит плееры для замены

import { AnimeStarsPlayerData, AnimeStarsTranslation } from '../types/kodik';

export interface KodikPlayerElement {
  iframe: HTMLIFrameElement;
  container: HTMLElement;
  playerData: AnimeStarsPlayerData | null;
  kodikUrl: string;
}

export class AnimeStarsDetector {
  private observers: MutationObserver[] = [];
  private detectedPlayers: Map<string, KodikPlayerElement> = new Map();

  /**
   * Инициализирует детектор и начинает поиск плееров
   */
  init(): void {
    // Проверяем текущие плееры
    this.scanForPlayers();
    
    // Наблюдаем за изменениями DOM
    this.setupMutationObserver();
    
    console.log('AnimeStars Kodik detector initialized');
  }

  /**
   * Останавливает детектор
   */
  destroy(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
    this.detectedPlayers.clear();
    console.log('AnimeStars Kodik detector destroyed');
  }

  /**
   * Сканирует страницу на предмет Kodik плееров
   */
  private scanForPlayers(): void {
    // Ищем iframe с Kodik
    const kodikIframes = document.querySelectorAll('iframe[src*="kodik"]');
    
    kodikIframes.forEach((iframe) => {
      if (iframe instanceof HTMLIFrameElement) {
        this.processKodikIframe(iframe);
      }
    });

    // Ищем плееры AnimStars
    this.scanAnimeStarsPlayers();
  }

  /**
   * Обрабатывает найденный Kodik iframe
   */
  private processKodikIframe(iframe: HTMLIFrameElement): void {
    const kodikUrl = iframe.src;
    const playerId = this.generatePlayerId(kodikUrl);
    
    if (this.detectedPlayers.has(playerId)) {
      return; // Уже обрабатывается
    }

    const container = this.findPlayerContainer(iframe);
    if (!container) {
      console.warn('Could not find container for Kodik iframe:', kodikUrl);
      return;
    }

    const playerData = this.extractPlayerData(container);
    
    const kodikPlayer: KodikPlayerElement = {
      iframe,
      container,
      playerData,
      kodikUrl
    };

    this.detectedPlayers.set(playerId, kodikPlayer);
    
    console.log('Detected Kodik player:', {
      url: kodikUrl,
      container: container.tagName + (container.className ? '.' + container.className : ''),
      playerData: !!playerData
    });

    // Уведомляем о найденном плеере
    this.notifyPlayerDetected(kodikPlayer);
  }

  /**
   * Сканирует специфичные для AnimStars плееры
   */
  private scanAnimeStarsPlayers(): void {
    // Ищем контейнеры плееров AnimStars
    const playerContainers = [
      '.player-container',
      '.video-player',
      '.anime-player',
      '[data-player]',
      '.player-wrap',
      '.kodik-player'
    ];

    playerContainers.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (element instanceof HTMLElement) {
          this.checkAnimeStarsPlayer(element);
        }
      });
    });
  }

  /**
   * Проверяет элемент на предмет того, что он содержит AnimStars плеер
   */
  private checkAnimeStarsPlayer(element: HTMLElement): void {
    // Ищем iframe внутри контейнера
    const iframe = element.querySelector('iframe[src*="kodik"]') as HTMLIFrameElement;
    if (iframe) {
      this.processKodikIframe(iframe);
      return;
    }

    // Проверяем data-атрибуты
    const dataPlayer = element.dataset.player;
    if (dataPlayer && dataPlayer.includes('kodik')) {
      // Это плеер с отложенной загрузкой
      this.processLazyPlayer(element);
    }

    // Ищем скрипты с конфигурацией плеера
    const scripts = element.querySelectorAll('script');
    scripts.forEach(script => {
      if (script.textContent && script.textContent.includes('kodik')) {
        this.processPlayerScript(element, script);
      }
    });
  }

  /**
   * Обрабатывает плеер с отложенной загрузкой
   */
  private processLazyPlayer(element: HTMLElement): void {
    const kodikUrl = element.dataset.src || element.dataset.player || '';
    if (!kodikUrl.includes('kodik')) return;

    const playerId = this.generatePlayerId(kodikUrl);
    
    if (this.detectedPlayers.has(playerId)) {
      return;
    }

    const playerData = this.extractPlayerData(element);
    
    const kodikPlayer: KodikPlayerElement = {
      iframe: null as any, // Будет создан позже
      container: element,
      playerData,
      kodikUrl
    };

    this.detectedPlayers.set(playerId, kodikPlayer);
    console.log('Detected lazy Kodik player:', kodikUrl);
    this.notifyPlayerDetected(kodikPlayer);
  }

  /**
   * Обрабатывает скрипт с конфигурацией плеера
   */
  private processPlayerScript(container: HTMLElement, script: HTMLScriptElement): void {
    const scriptContent = script.textContent || '';
    
    // Ищем URL Kodik в скрипте
    const kodikUrlMatch = scriptContent.match(/kodik[^"']*["']([^"']+)["']/);
    if (!kodikUrlMatch) return;

    const kodikUrl = kodikUrlMatch[1];
    const playerId = this.generatePlayerId(kodikUrl);
    
    if (this.detectedPlayers.has(playerId)) {
      return;
    }

    const playerData = this.extractPlayerData(container);
    
    const kodikPlayer: KodikPlayerElement = {
      iframe: null as any,
      container,
      playerData,
      kodikUrl
    };

    this.detectedPlayers.set(playerId, kodikPlayer);
    console.log('Detected script-based Kodik player:', kodikUrl);
    this.notifyPlayerDetected(kodikPlayer);
  }

  /**
   * Находит контейнер для iframe плеера
   */
  private findPlayerContainer(iframe: HTMLIFrameElement): HTMLElement | null {
    let current = iframe.parentElement;
    
    // Поднимаемся по DOM до контейнера плеера
    while (current) {
      const className = current.className.toLowerCase();
      const id = current.id.toLowerCase();
      
      if (
        className.includes('player') ||
        className.includes('video') ||
        className.includes('kodik') ||
        id.includes('player') ||
        id.includes('video') ||
        current.hasAttribute('data-player')
      ) {
        return current;
      }
      
      current = current.parentElement;
    }
    
    // Если не нашли специфичный контейнер, возвращаем прямого родителя
    return iframe.parentElement;
  }

  /**
   * Извлекает данные плеера из контейнера
   */
  private extractPlayerData(container: HTMLElement): AnimeStarsPlayerData | null {
    try {
      // Ищем data-атрибуты
      const newsId = container.dataset.newsId || 
                   container.dataset.news || 
                   this.findNearbyText(container, /news[_-]?id[:\s]*(\d+)/i);
      
      const hasCache = container.dataset.hasCache || 
                      container.dataset.cache || '0';
      
      const playerCookie = container.dataset.playerCookie || 
                          container.dataset.cookie || '';

      // Ищем переводы
      const translations = this.extractTranslations(container);

      if (!newsId && translations.length === 0) {
        return null;
      }

      return {
        news_id: newsId || '',
        has_cache: hasCache,
        player_cookie: playerCookie,
        translations,
        current_translation: translations.find(t => t.active) || translations[0]
      };
    } catch (error) {
      console.error('Error extracting player data:', error);
      return null;
    }
  }

  /**
   * Извлекает список переводов
   */
  private extractTranslations(container: HTMLElement): AnimeStarsTranslation[] {
    const translations: AnimeStarsTranslation[] = [];

    // Ищем селекторы переводов
    const translationSelectors = [
      '.translation-select option',
      '.voice-select option',
      '.dub-select option',
      '[data-translation]'
    ];

    translationSelectors.forEach(selector => {
      const elements = container.querySelectorAll(selector);
      elements.forEach((element, index) => {
        if (element instanceof HTMLElement) {
          const id = element.dataset.translationId || 
                    element.dataset.id || 
                    (element as HTMLOptionElement).value || 
                    index.toString();
          
          const name = element.textContent?.trim() || 
                      element.dataset.name || 
                      `Перевод ${index + 1}`;
          
          const link = element.dataset.link || '';
          const active = element.hasAttribute('selected') || 
                        element.classList.contains('active');

          translations.push({ id, name, link, active });
        }
      });
    });

    // Если переводы не найдены, создаем дефолтный
    if (translations.length === 0) {
      translations.push({
        id: '0',
        name: 'Оригинал',
        link: '',
        active: true
      });
    }

    return translations;
  }

  /**
   * Ищет текст рядом с элементом по регексу
   */
  private findNearbyText(element: HTMLElement, regex: RegExp): string {
    const searchInElement = (el: Element): string => {
      const text = el.textContent || '';
      const match = text.match(regex);
      return match ? match[1] : '';
    };

    // Ищем в самом элементе
    let result = searchInElement(element);
    if (result) return result;

    // Ищем в родителях
    let parent = element.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      result = searchInElement(parent);
      if (result) return result;
      parent = parent.parentElement;
      depth++;
    }

    // Ищем в соседних элементах
    const siblings = element.parentElement?.children || [];
    for (const sibling of Array.from(siblings)) {
      result = searchInElement(sibling);
      if (result) return result;
    }

    return '';
  }

  /**
   * Настраивает наблюдение за изменениями DOM
   */
  private setupMutationObserver(): void {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              
              // Проверяем добавленный элемент
              if (element.tagName === 'IFRAME' && element instanceof HTMLIFrameElement) {
                if (element.src.includes('kodik')) {
                  this.processKodikIframe(element);
                }
              }
              
              // Проверяем содержимое добавленного элемента
              if (element instanceof HTMLElement) {
                const iframes = element.querySelectorAll('iframe[src*="kodik"]');
                iframes.forEach(iframe => {
                  if (iframe instanceof HTMLIFrameElement) {
                    this.processKodikIframe(iframe);
                  }
                });
              }
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.observers.push(observer);
  }

  /**
   * Генерирует уникальный ID для плеера
   */
  private generatePlayerId(kodikUrl: string): string {
    // Используем URL как основу для ID
    return btoa(kodikUrl).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }

  /**
   * Уведомляет о найденном плеере
   */
  private notifyPlayerDetected(player: KodikPlayerElement): void {
    // Отправляем custom event для обработки другими частями расширения
    const event = new CustomEvent('kodikPlayerDetected', {
      detail: player
    });
    document.dispatchEvent(event);
  }

  /**
   * Получает все обнаруженные плееры
   */
  getDetectedPlayers(): Map<string, KodikPlayerElement> {
    return new Map(this.detectedPlayers);
  }

  /**
   * Получает плеер по ID
   */
  getPlayer(playerId: string): KodikPlayerElement | undefined {
    return this.detectedPlayers.get(playerId);
  }

  /**
   * Удаляет плеер из списка обнаруженных
   */
  removePlayer(playerId: string): boolean {
    return this.detectedPlayers.delete(playerId);
  }
}

// Глобальный экземпляр детектора
export const animeStarsDetector = new AnimeStarsDetector();
