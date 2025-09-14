// Типы для системы отслеживания прогресса просмотра

export interface WatchProgress {
  animeId: string;
  episode: number;
  currentTime: number;
  duration: number;
  lastWatched: number; // timestamp
  title?: string;
  translationId?: string;
  url?: string;
}

export interface ProgressStorage {
  [animeId: string]: WatchProgress;
}

export interface AnimeInfo {
  id: string;
  title: string;
  currentEpisode: number;
  totalEpisodes?: number;
  translationId?: string;
  url?: string;
}

export interface ProgressSettings {
  autoSave: boolean;
  saveInterval: number; // seconds
  minWatchTime: number; // seconds
  autoResume: boolean;
  showProgressNotifications: boolean;
}

export interface ResumeOptions {
  resumeTime: number;
  episode: number;
  translation?: string;
  askBeforeResume: boolean;
}
