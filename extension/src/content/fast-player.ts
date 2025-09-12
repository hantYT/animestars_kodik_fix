// Быстрый видео плеер для замены Kodik iframe
// Использует HLS.js для оптимизированного воспроизведения

import { AnimeStarsPlayerData } from '../types/kodik';
import { HLSParser, HLSUtils } from '../utils/hls-parser';

export interface FastPlayerConfig {
  container: HTMLElement;
  videoUrl: string;
  maxQuality: number;
  playerData: AnimeStarsPlayerData | null;
  originalUrl: string;
}

export class FastVideoPlayer {
  private config: FastPlayerConfig;
  private videoElement: HTMLVideoElement | null = null;
  private hlsPlayer: any = null; // HLS.js instance
  private controlsContainer: HTMLElement | null = null;
  private isInitialized = false;
  private isPlaying = false;

  constructor(config: FastPlayerConfig) {
    this.config = config;
  }

  /**
   * Инициализирует плеер
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🎮 Initializing fast video player...');

      // Очищаем контейнер
      this.clearContainer();

      // Создаем видео элемент
      this.createVideoElement();

      // Создаем контролы
      this.createControls();

      // Инициализируем HLS
      await this.initializeHLS();

      // Настраиваем обработчики событий
      this.setupEventHandlers();

      this.isInitialized = true;
      console.log('✅ Fast video player initialized');

    } catch (error) {
      console.error('❌ Failed to initialize fast player:', error);
      throw error;
    }
  }

  /**
   * Очищает контейнер от старого содержимого
   */
  private clearContainer(): void {
    // Убираем все iframe и другие элементы
    const existingElements = this.config.container.querySelectorAll('iframe, video, embed, object');
    existingElements.forEach(el => el.remove());

    // Убираем индикаторы загрузки
    const loadingElements = this.config.container.querySelectorAll('.animestars-loading, .animestars-error');
    loadingElements.forEach(el => el.remove());
  }

  /**
   * Создает видео элемент
   */
  private createVideoElement(): void {
    this.videoElement = document.createElement('video');
    this.videoElement.style.cssText = `
      width: 100%;
      height: 100%;
      background: #000;
      object-fit: contain;
    `;
    
    this.videoElement.setAttribute('controls', 'true');
    this.videoElement.setAttribute('preload', 'metadata');
    this.videoElement.setAttribute('crossorigin', 'anonymous');

    this.config.container.appendChild(this.videoElement);
  }

  /**
   * Создает дополнительные контролы
   */
  private createControls(): void {
    this.controlsContainer = document.createElement('div');
    this.controlsContainer.className = 'fast-player-controls';
    this.controlsContainer.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      gap: 5px;
      z-index: 1000;
    `;

    // Кнопка качества
    const qualityButton = this.createControlButton(
      `${this.config.maxQuality}p`,
      'Текущее качество'
    );
    qualityButton.onclick = () => this.showQualityMenu();

    // Кнопка PiP
    const pipButton = this.createControlButton('⧉', 'Картинка в картинке');
    pipButton.onclick = () => this.togglePictureInPicture();

    // Кнопка полного экрана
    const fullscreenButton = this.createControlButton('⛶', 'Полный экран');
    fullscreenButton.onclick = () => this.toggleFullscreen();

    this.controlsContainer.appendChild(qualityButton);
    this.controlsContainer.appendChild(pipButton);
    this.controlsContainer.appendChild(fullscreenButton);

    this.config.container.style.position = 'relative';
    this.config.container.appendChild(this.controlsContainer);
  }

  /**
   * Создает кнопку контрола
   */
  private createControlButton(text: string, title: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.title = title;
    button.style.cssText = `
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-family: monospace;
      transition: background 0.2s;
    `;

    button.onmouseenter = () => {
      button.style.background = 'rgba(0, 0, 0, 0.9)';
    };

    button.onmouseleave = () => {
      button.style.background = 'rgba(0, 0, 0, 0.7)';
    };

    return button;
  }

  /**
   * Инициализирует HLS плеер
   */
  private async initializeHLS(): Promise<void> {
    if (!this.videoElement) {
      throw new Error('Video element not created');
    }

    try {
      console.log('🎬 Initializing video with URL:', this.config.videoUrl);
      
      // Определяем тип URL
      const isHLS = this.config.videoUrl.includes('.m3u8');
      const isKodikIframe = this.config.videoUrl.includes('kodik.info');
      
      if (isKodikIframe) {
        console.log('🖼️ URL is Kodik iframe, creating fallback player');
        await this.createKodikFallbackPlayer();
        return;
      }
      
      if (isHLS) {
        console.log('📺 URL is HLS stream');
        // Проверяем поддержку HLS браузером
        if (this.videoElement.canPlayType('application/vnd.apple.mpegurl')) {
          // Нативная поддержка HLS (Safari)
          this.videoElement.src = this.config.videoUrl;
          console.log('✅ Using native HLS support');
        } else {
          // Используем HLS.js для других браузеров
          await this.loadHLSjs();
        }
      } else {
        console.log('🎥 URL is regular video');
        // Обычное видео
        this.videoElement.src = this.config.videoUrl;
      }

    } catch (error) {
      console.error('❌ Error initializing video:', error);
      // Последний fallback - iframe
      await this.createKodikFallbackPlayer();
    }
  }

  /**
   * Создает fallback плеер с iframe для случаев когда не удается получить прямую ссылку
   */
  private async createKodikFallbackPlayer(): Promise<void> {
    if (!this.videoElement) return;
    
    console.log('🔄 Creating Kodik fallback player');
    
    // Убираем video элемент
    this.videoElement.remove();
    this.videoElement = null;
    
    // Создаем улучшенный iframe
    const iframe = document.createElement('iframe');
    iframe.src = this.config.originalUrl;
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: #000;
    `;
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('webkitallowfullscreen', 'true');
    iframe.setAttribute('mozallowfullscreen', 'true');
    
    // Добавляем индикатор что это fallback
    const indicator = document.createElement('div');
    indicator.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(255, 107, 53, 0.9);
      color: white;
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 1001;
      font-family: Arial, sans-serif;
    `;
    indicator.textContent = 'Режим совместимости';
    
    this.config.container.appendChild(iframe);
    this.config.container.appendChild(indicator);
    
    console.log('✅ Fallback player created');
  }

  /**
   * Загружает и инициализирует HLS.js
   */
  private async loadHLSjs(): Promise<void> {
    if (!this.videoElement) return;

    try {
      // Проверяем, доступен ли HLS.js глобально
      if (typeof (window as any).Hls !== 'undefined') {
        this.initHLSjsPlayer((window as any).Hls);
        return;
      }

      // Загружаем HLS.js динамически
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
      
      await new Promise<void>((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load HLS.js'));
        document.head.appendChild(script);
      });

      this.initHLSjsPlayer((window as any).Hls);

    } catch (error) {
      console.error('Failed to load HLS.js:', error);
      throw error;
    }
  }

  /**
   * Инициализирует HLS.js плеер
   */
  private initHLSjsPlayer(Hls: any): void {
    if (!this.videoElement) return;

    if (Hls.isSupported()) {
      this.hlsPlayer = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30
      });

      this.hlsPlayer.loadSource(this.config.videoUrl);
      this.hlsPlayer.attachMedia(this.videoElement);

      this.hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest parsed successfully');
      });

      this.hlsPlayer.on(Hls.Events.ERROR, (event: any, data: any) => {
        console.error('HLS error:', data);
        if (data.fatal) {
          this.handleHLSError(data);
        }
      });

      console.log('HLS.js player initialized');
    } else {
      throw new Error('HLS.js not supported');
    }
  }

  /**
   * Обрабатывает ошибки HLS
   */
  private handleHLSError(data: any): void {
    if (!this.hlsPlayer || !this.videoElement) return;

    switch (data.type) {
      case 'networkError':
        console.log('Network error, trying to recover...');
        this.hlsPlayer.startLoad();
        break;
      case 'mediaError':
        console.log('Media error, trying to recover...');
        this.hlsPlayer.recoverMediaError();
        break;
      default:
        console.error('Fatal HLS error, cannot recover');
        this.destroy();
        break;
    }
  }

  /**
   * Настраивает обработчики событий
   */
  private setupEventHandlers(): void {
    if (!this.videoElement) return;

    this.videoElement.addEventListener('play', () => {
      this.isPlaying = true;
    });

    this.videoElement.addEventListener('pause', () => {
      this.isPlaying = false;
    });

    this.videoElement.addEventListener('loadstart', () => {
      console.log('Video loading started');
    });

    this.videoElement.addEventListener('canplay', () => {
      console.log('Video can start playing');
    });

    this.videoElement.addEventListener('error', (e) => {
      console.error('Video error:', e);
    });
  }

  /**
   * Показывает меню выбора качества
   */
  private showQualityMenu(): void {
    // TODO: Реализовать меню качества
    console.log('Quality menu not implemented yet');
  }

  /**
   * Переключает режим "картинка в картинке"
   */
  private async togglePictureInPicture(): Promise<void> {
    if (!this.videoElement) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await this.videoElement.requestPictureInPicture();
      }
    } catch (error) {
      console.error('PiP error:', error);
    }
  }

  /**
   * Переключает полноэкранный режим
   */
  private toggleFullscreen(): void {
    if (!this.videoElement) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.videoElement.requestFullscreen();
    }
  }

  /**
   * Воспроизводит/останавливает видео
   */
  toggle(): void {
    if (!this.videoElement) return;

    if (this.isPlaying) {
      this.videoElement.pause();
    } else {
      this.videoElement.play();
    }
  }

  /**
   * Воспроизводит видео
   */
  play(): void {
    if (this.videoElement) {
      this.videoElement.play();
    }
  }

  /**
   * Останавливает видео
   */
  pause(): void {
    if (this.videoElement) {
      this.videoElement.pause();
    }
  }

  /**
   * Устанавливает время воспроизведения
   */
  seekTo(time: number): void {
    if (this.videoElement) {
      this.videoElement.currentTime = time;
    }
  }

  /**
   * Получает текущее время воспроизведения
   */
  getCurrentTime(): number {
    return this.videoElement?.currentTime || 0;
  }

  /**
   * Получает общую длительность видео
   */
  getDuration(): number {
    return this.videoElement?.duration || 0;
  }

  /**
   * Проверяет, инициализирован ли плеер
   */
  isReady(): boolean {
    return this.isInitialized && !!this.videoElement;
  }

  /**
   * Уничтожает плеер и освобождает ресурсы
   */
  destroy(): void {
    console.log('🗑️ Destroying fast video player...');

    // Останавливаем HLS плеер
    if (this.hlsPlayer) {
      this.hlsPlayer.destroy();
      this.hlsPlayer = null;
    }

    // Останавливаем видео
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = '';
      this.videoElement.load();
      this.videoElement.remove();
      this.videoElement = null;
    }

    // Убираем контролы
    if (this.controlsContainer) {
      this.controlsContainer.remove();
      this.controlsContainer = null;
    }

    this.isInitialized = false;
    this.isPlaying = false;

    console.log('✅ Fast video player destroyed');
  }
}
