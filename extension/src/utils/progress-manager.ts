// Менеджер прогресса просмотра для AnimStars расширения
import { WatchProgress, ProgressStorage, AnimeInfo, ProgressSettings, ResumeOptions } from '../types/progress';

export class ProgressManager {
  private static readonly STORAGE_KEY = 'animeWatchProgress';
  private static readonly SETTINGS_KEY = 'progressSettings';
  private static readonly MIN_WATCH_TIME = 30; // минимум 30 секунд для сохранения
  private static readonly MAX_PROGRESS_ENTRIES = 500; // максимум записей
  
  private static saveTimer: number | null = null;
  private static currentProgress: WatchProgress | null = null;

  /**
   * Получает настройки прогресса
   */
  static async getSettings(): Promise<ProgressSettings> {
    try {
      const result = await chrome.storage.local.get(this.SETTINGS_KEY);
      return result[this.SETTINGS_KEY] || {
        autoSave: true,
        saveInterval: 10, // каждые 10 секунд
        minWatchTime: 30,
        autoResume: true,
        showProgressNotifications: true
      };
    } catch (error) {
      console.error('Failed to get progress settings:', error);
      return {
        autoSave: true,
        saveInterval: 10,
        minWatchTime: 30,
        autoResume: true,
        showProgressNotifications: true
      };
    }
  }

  /**
   * Сохраняет настройки прогресса
   */
  static async saveSettings(settings: ProgressSettings): Promise<void> {
    try {
      await chrome.storage.local.set({ [this.SETTINGS_KEY]: settings });
    } catch (error) {
      console.error('Failed to save progress settings:', error);
    }
  }

  /**
   * Сохраняет прогресс просмотра
   */
  static async saveProgress(animeInfo: AnimeInfo, currentTime: number, duration: number): Promise<void> {
    const settings = await this.getSettings();
    
    if (!settings.autoSave || currentTime < settings.minWatchTime) return;

    try {
      const storage = await this.getProgressStorage();
      
      // Проверяем лимит записей
      if (Object.keys(storage).length >= this.MAX_PROGRESS_ENTRIES) {
        await this.cleanupOldProgress(50); // Удаляем 50 самых старых записей
      }
      
      const progress: WatchProgress = {
        animeId: animeInfo.id,
        episode: animeInfo.currentEpisode,
        currentTime,
        duration,
        lastWatched: Date.now(),
        title: animeInfo.title,
        translationId: animeInfo.translationId,
        url: animeInfo.url
      };

      storage[animeInfo.id] = progress;
      this.currentProgress = progress;

      await chrome.storage.local.set({ [this.STORAGE_KEY]: storage });
      
      if (settings.showProgressNotifications) {
        console.log(`📺 Progress saved: ${animeInfo.title} - Episode ${animeInfo.currentEpisode} at ${this.formatTime(currentTime)}`);
      }
    } catch (error) {
      console.error('Failed to save progress:', error);
    }
  }

  /**
   * Автоматическое сохранение прогресса с интервалом
   */
  static startAutoSave(animeInfo: AnimeInfo, videoElement: HTMLVideoElement): void {
    this.stopAutoSave();
    
    this.getSettings().then(settings => {
      if (!settings.autoSave) return;
      
      this.saveTimer = window.setInterval(() => {
        if (videoElement && !videoElement.paused && videoElement.currentTime > 0) {
          this.saveProgress(animeInfo, videoElement.currentTime, videoElement.duration);
        }
      }, settings.saveInterval * 1000);
    });
  }

  /**
   * Останавливает автосохранение
   */
  static stopAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /**
   * Получает прогресс для конкретного аниме
   */
  static async getProgress(animeId: string): Promise<WatchProgress | null> {
    try {
      const storage = await this.getProgressStorage();
      return storage[animeId] || null;
    } catch (error) {
      console.error('Failed to get progress:', error);
      return null;
    }
  }

  /**
   * Получает все сохраненные прогрессы
   */
  static async getAllProgress(): Promise<ProgressStorage> {
    return await this.getProgressStorage();
  }

  /**
   * Удаляет прогресс для конкретного аниме
   */
  static async removeProgress(animeId: string): Promise<void> {
    try {
      const storage = await this.getProgressStorage();
      delete storage[animeId];
      await chrome.storage.local.set({ [this.STORAGE_KEY]: storage });
      console.log(`🗑️ Progress removed for anime ID: ${animeId}`);
    } catch (error) {
      console.error('Failed to remove progress:', error);
    }
  }

  /**
   * Очищает старые записи прогресса
   */
  static async cleanupOldProgress(count?: number): Promise<number> {
    try {
      const storage = await this.getProgressStorage();
      const entries = Object.entries(storage);
      
      if (entries.length === 0) return 0;
      
      // Сортируем по времени последнего просмотра (старые первыми)
      entries.sort((a, b) => a[1].lastWatched - b[1].lastWatched);
      
      const removeCount = count || Math.floor(entries.length * 0.2); // 20% от общего количества
      const toRemove = entries.slice(0, removeCount);
      
      for (const [animeId] of toRemove) {
        delete storage[animeId];
      }
      
      await chrome.storage.local.set({ [this.STORAGE_KEY]: storage });
      console.log(`🧹 Cleaned up ${toRemove.length} old progress entries`);
      
      return toRemove.length;
    } catch (error) {
      console.error('Failed to cleanup old progress:', error);
      return 0;
    }
  }

  /**
   * Очищает записи старше указанного количества дней
   */
  static async clearOldProgress(daysOld: number = 30): Promise<number> {
    try {
      const storage = await this.getProgressStorage();
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      let removedCount = 0;
      
      Object.keys(storage).forEach(animeId => {
        if (storage[animeId].lastWatched < cutoffTime) {
          delete storage[animeId];
          removedCount++;
        }
      });

      await chrome.storage.local.set({ [this.STORAGE_KEY]: storage });
      console.log(`🧹 Removed ${removedCount} progress entries older than ${daysOld} days`);
      
      return removedCount;
    } catch (error) {
      console.error('Failed to clear old progress:', error);
      return 0;
    }
  }

  /**
   * Проверяет нужно ли предложить продолжить просмотр
   */
  static async checkForResume(animeInfo: AnimeInfo): Promise<ResumeOptions | null> {
    const settings = await this.getSettings();
    if (!settings.autoResume) return null;
    
    const progress = await this.getProgress(animeInfo.id);
    if (!progress) return null;
    
    // Проверяем что прогресс актуален (не старше 7 дней)
    const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    if (progress.lastWatched < weekAgo) return null;
    
    // Проверяем что есть значимый прогресс (больше 5% но меньше 90%)
    const progressPercent = (progress.currentTime / progress.duration) * 100;
    if (progressPercent < 5 || progressPercent > 90) return null;
    
    return {
      resumeTime: progress.currentTime,
      episode: progress.episode,
      translation: progress.translationId,
      askBeforeResume: true
    };
  }

  /**
   * Показывает уведомление о продолжении просмотра (теперь только информационное)
   */
  static async showResumeNotification(animeInfo: AnimeInfo, resumeOptions: ResumeOptions): Promise<boolean> {
    const settings = await this.getSettings();
    if (!settings.showProgressNotifications) return true;
    
    // Показываем только информационное уведомление
    const notification = this.createInfoNotification(animeInfo, resumeOptions);
    
    // Автоматически скрыть через 3 секунды
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOutToBottom 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
      }
    }, 3000);
    
    return true; // Всегда продолжаем автоматически
  }

  /**
   * Создает информационное уведомление о восстановлении прогресса
   */
  private static createInfoNotification(animeInfo: AnimeInfo, resumeOptions: ResumeOptions): HTMLElement {
    const notification = document.createElement('div');
    notification.className = 'progress-info-notification';
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 280px;
      background: rgba(26, 26, 26, 0.9);
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      z-index: 10000;
      border: 1px solid rgba(0,212,255,0.2);
      backdrop-filter: blur(15px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      animation: slideInFromBottom 0.3s ease-out;
      opacity: 0.95;
      transition: opacity 0.2s ease;
    `;
    
    // Добавляем CSS анимации если их еще нет
    if (!document.querySelector('#progress-info-animations')) {
      const style = document.createElement('style');
      style.id = 'progress-info-animations';
      style.textContent = `
        @keyframes slideInFromBottom {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 0.95; }
        }
        @keyframes slideOutToBottom {
          from { transform: translateY(0); opacity: 0.95; }
          to { transform: translateY(100%); opacity: 0; }
        }
        .progress-info-notification:hover {
          opacity: 1;
          transition: opacity 0.2s ease;
        }
      `;
      document.head.appendChild(style);
    }
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 6px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#00d4ff" style="margin-right: 8px; flex-shrink: 0;">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <div style="font-weight: 600; font-size: 13px; color: #00d4ff; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
          Прогресс восстановлен
        </div>
      </div>
      
      <div style="font-size: 12px; opacity: 0.85; margin-bottom: 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
        ${animeInfo.title}
      </div>
      
      <div style="font-size: 11px; opacity: 0.7;">
        Серия ${resumeOptions.episode} • ${this.formatTime(resumeOptions.resumeTime)}
      </div>
    `;
    
    // Добавляем hover эффект
    notification.addEventListener('mouseenter', () => {
      notification.style.opacity = '1';
      notification.style.transform = 'scale(1.02)';
    });
    
    notification.addEventListener('mouseleave', () => {
      notification.style.opacity = '0.95';
      notification.style.transform = 'scale(1)';
    });
    
    document.body.appendChild(notification);
    return notification;
  }

  /**
   * Создает элемент уведомления о продолжении просмотра
   */
  private static createResumeNotification(animeInfo: AnimeInfo, resumeOptions: ResumeOptions): HTMLElement {
    const notification = document.createElement('div');
    notification.className = 'progress-resume-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 350px;
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      color: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      z-index: 10000;
      border: 1px solid rgba(255,255,255,0.1);
      backdrop-filter: blur(10px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      animation: slideInFromRight 0.4s ease-out;
    `;
    
    // Добавляем CSS анимации если их еще нет
    if (!document.querySelector('#progress-animations')) {
      const style = document.createElement('style');
      style.id = 'progress-animations';
      style.textContent = `
        @keyframes slideInFromRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .progress-resume-notification:hover {
          transform: scale(1.02);
          transition: transform 0.2s ease;
        }
      `;
      document.head.appendChild(style);
    }
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 12px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#00d4ff" style="margin-right: 12px;">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <div>
          <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">Продолжить просмотр?</div>
          <div style="font-size: 14px; opacity: 0.8;">${animeInfo.title}</div>
        </div>
      </div>
      
      <div style="margin-bottom: 16px;">
        <div style="font-size: 14px; margin-bottom: 8px;">
          Серия ${resumeOptions.episode} • ${this.formatTime(resumeOptions.resumeTime)}
        </div>
        <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.2); border-radius: 2px; overflow: hidden;">
          <div style="width: ${(resumeOptions.resumeTime / (animeInfo.totalEpisodes || 1500)) * 100}%; height: 100%; background: linear-gradient(90deg, #00d4ff, #007bff);"></div>
        </div>
      </div>
      
      <div style="display: flex; gap: 12px;">
        <button class="resume-btn" style="
          flex: 1;
          background: linear-gradient(135deg, #00d4ff, #007bff);
          color: white;
          border: none;
          padding: 12px;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        ">Продолжить</button>
        <button class="dismiss-btn" style="
          background: rgba(255,255,255,0.1);
          color: white;
          border: none;
          padding: 12px 16px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
        ">Отмена</button>
      </div>
    `;
    
    // Добавляем hover эффекты
    const resumeBtn = notification.querySelector('.resume-btn') as HTMLButtonElement;
    const dismissBtn = notification.querySelector('.dismiss-btn') as HTMLButtonElement;
    
    resumeBtn?.addEventListener('mouseenter', () => {
      resumeBtn.style.transform = 'scale(1.05)';
      resumeBtn.style.boxShadow = '0 4px 16px rgba(0,123,255,0.4)';
    });
    
    resumeBtn?.addEventListener('mouseleave', () => {
      resumeBtn.style.transform = 'scale(1)';
      resumeBtn.style.boxShadow = 'none';
    });
    
    dismissBtn?.addEventListener('mouseenter', () => {
      dismissBtn.style.background = 'rgba(255,255,255,0.2)';
    });
    
    dismissBtn?.addEventListener('mouseleave', () => {
      dismissBtn.style.background = 'rgba(255,255,255,0.1)';
    });
    
    document.body.appendChild(notification);
    return notification;
  }

  /**
   * Получает статистику просмотра
   */
  static async getViewingStats(): Promise<{
    totalAnimes: number;
    totalWatchTime: number;
    recentlyWatched: WatchProgress[];
    averageProgress: number;
  }> {
    try {
      const storage = await this.getProgressStorage();
      const entries = Object.values(storage);
      
      const totalAnimes = entries.length;
      const totalWatchTime = entries.reduce((sum, entry) => sum + entry.currentTime, 0);
      
      // Последние 10 просмотренных
      const recentlyWatched = entries
        .sort((a, b) => b.lastWatched - a.lastWatched)
        .slice(0, 10);
      
      // Средний прогресс в процентах
      const progressPercentages = entries
        .filter(entry => entry.duration > 0)
        .map(entry => (entry.currentTime / entry.duration) * 100);
      
      const averageProgress = progressPercentages.length > 0 
        ? progressPercentages.reduce((sum, p) => sum + p, 0) / progressPercentages.length
        : 0;
      
      return {
        totalAnimes,
        totalWatchTime,
        recentlyWatched,
        averageProgress
      };
    } catch (error) {
      console.error('Failed to get viewing stats:', error);
      return {
        totalAnimes: 0,
        totalWatchTime: 0,
        recentlyWatched: [],
        averageProgress: 0
      };
    }
  }

  /**
   * Экспортирует данные прогресса
   */
  static async exportProgress(): Promise<string> {
    try {
      const storage = await this.getProgressStorage();
      const settings = await this.getSettings();
      
      const exportData = {
        version: '1.0',
        timestamp: Date.now(),
        settings,
        progress: storage
      };
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Failed to export progress:', error);
      return '{}';
    }
  }

  /**
   * Импортирует данные прогресса
   */
  static async importProgress(jsonData: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonData);
      
      if (data.progress) {
        await chrome.storage.local.set({ [this.STORAGE_KEY]: data.progress });
      }
      
      if (data.settings) {
        await chrome.storage.local.set({ [this.SETTINGS_KEY]: data.settings });
      }
      
      console.log('✅ Progress data imported successfully');
      return true;
    } catch (error) {
      console.error('Failed to import progress:', error);
      return false;
    }
  }

  /**
   * Получает хранилище прогресса
   */
  private static async getProgressStorage(): Promise<ProgressStorage> {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      return result[this.STORAGE_KEY] || {};
    } catch (error) {
      console.error('Failed to get progress storage:', error);
      return {};
    }
  }

  /**
   * Форматирует время в читаемый формат
   */
  static formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Форматирует продолжительность в человекочитаемый формат
   */
  static formatDuration(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '0 сек';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours} ч ${minutes} мин`;
    } else if (minutes > 0) {
      return `${minutes} мин`;
    } else {
      return `${Math.floor(seconds)} сек`;
    }
  }
}
