// Основные типы для работы с Kodik API
// Портированы из Python anime_parsers_ru

export interface KodikTranslation {
  id: string;
  title: string;
  type: 'voice' | 'subtitles';
  is_voice: boolean;
}

export interface KodikSeason {
  episodes?: { [key: string]: KodikEpisode };
  link?: string;
}

export interface KodikEpisode {
  link: string;
  title?: string;
  screenshots?: string[];
}

export interface KodikMaterialData {
  title?: string;
  anime_title?: string;
  title_en?: string;
  other_titles?: string[];
  other_titles_en?: string[];
  other_titles_jp?: string[];
  anime_kind?: string;
  all_status?: string;
  anime_status?: string;
  description?: string;
  anime_description?: string;
  poster_url?: string;
  anime_poster_url?: string;
  screenshots?: string[];
  duration?: number;
  all_genres?: string[];
  anime_genres?: string[];
  shikimori_rating?: number;
  shikimori_votes?: number;
  kinopoisk_rating?: number;
  kinopoisk_votes?: number;
  imdb_rating?: number;
  imdb_votes?: number;
  aired_at?: string;
  rating_mpaa?: string;
  minimal_age?: number;
  episodes_total?: number;
  episodes_aired?: number;
  year?: number;
  countries?: string[];
  genres?: string[];
  premiere_world?: string;
  actors?: string[];
  directors?: string[];
  writers?: string[];
  producers?: string[];
  composers?: string[];
  editors?: string[];
  designers?: string[];
  operators?: string[];
  licensed_by?: string[];
  anime_studios?: string[];
  released_at?: string;
}

export interface KodikElement {
  id: string;
  type: string;
  link: string;
  title: string;
  title_orig?: string;
  other_title?: string;
  year: number;
  last_season?: number;
  last_episode?: number;
  episodes_count?: number;
  kinopoisk_id?: string;
  shikimori_id?: string;
  imdb_id?: string;
  mdl_id?: string;
  quality: string;
  camrip: boolean;
  lgbt: boolean;
  blocked_countries: string[];
  blocked_seasons?: { [key: string]: any };
  created_at: string;
  updated_at: string;
  screenshots: string[];
  translation: KodikTranslation;
  material_data?: KodikMaterialData;
  seasons?: { [key: string]: KodikSeason };
}

export interface KodikApiResponse {
  total: number;
  time: string;
  results: KodikElement[];
  next_page?: string;
  prev_page?: string;
}

export interface KodikSearchParams {
  token: string;
  title?: string;
  title_orig?: string;
  strict?: boolean;
  full_match?: boolean;
  shikimori_id?: string;
  kinopoisk_id?: string;
  imdb_id?: string;
  id?: string;
  mdl_id?: string;
  worldart_animation_id?: string;
  worldart_cinema_id?: string;
  worldart_link?: string;
  limit?: number;
  types?: string;
  year?: number;
  camrip?: boolean;
  lgbt?: boolean;
  translation_id?: number;
  translation_type?: 'voice' | 'subtitles';
  anime_kind?: string;
  anime_status?: 'released' | 'ongoing' | 'anons';
  mydramalist_tags?: string;
  rating_mpaa?: string;
  minimal_age?: number;
  kinopoisk_rating?: number;
  imdb_rating?: number;
  shikimori_rating?: number;
  anime_studios?: string;
  genres?: string;
  anime_genres?: string;
  duration?: number;
  player_link?: string;
  has_field?: string;
  has_fields?: string;
  has_field_and?: string;
  prioritize_translations?: string;
  unprioritize_translations?: string;
  block_translations?: string;
  prioritize_translation_type?: 'voice' | 'subtitles';
  season?: number;
  episode?: number;
  not_blocked_in?: string;
  not_blocked_for_me?: boolean;
  countries?: string;
  actors?: string;
  directors?: string;
  producers?: string;
  writers?: string;
  composers?: string;
  editors?: string;
  designers?: string;
  operators?: string;
  licensed_by?: string;
  with_material_data?: boolean;
  with_seasons?: boolean;
  with_episodes?: boolean;
  with_episodes_data?: boolean;
  with_page_links?: boolean;
  order?: 'asc' | 'desc';
  sort?: 'year' | 'created_at' | 'updated_at' | 'kinopoisk_rating' | 'imdb_rating' | 'shikimori_rating';
}

// Типы для парсинга страниц Kodik
export interface KodikPageData {
  video_type: string;
  video_hash: string;
  video_id: string;
  urlParams: {
    d: string;
    d_sign: string;
    pd: string;
    pd_sign: string;
    ref_sign: string;
  };
  script_url: string;
}

export interface KodikVideoLinks {
  [quality: string]: Array<{
    src: string;
  }>;
}

export interface KodikVideoResponse {
  links: KodikVideoLinks;
}

// Типы для HLS манифестов
export interface HLSSegment {
  url: string;
  filename?: string;
  duration?: number;
  sequence?: number;
}

export interface HLSManifest {
  segments: HLSSegment[];
  base_url?: string;
  qualities?: string[];
  max_quality?: number;
  targetDuration?: number;
  totalDuration?: number;
  segmentCount?: number;
}

export interface QualityLevel {
  quality: string;
  resolution: string;
  bandwidth: number;
  url: string;
}

// Типы для плеера AnimStars
export interface AnimeStarsPlayerData {
  news_id: string;
  has_cache: string;
  player_cookie: string;
  translations: AnimeStarsTranslation[];
  current_translation?: AnimeStarsTranslation;
}

export interface AnimeStarsTranslation {
  id: string;
  name: string;
  link: string;
  active: boolean;
}

export interface ParsedKodikUrl {
  media_id: string;
  media_hash: string;
  quality: string;
  translation_id?: string;
  season?: number;
  episode?: number;
}

// Утилитарные типы
export type IDType = 'shikimori' | 'kinopoisk' | 'imdb';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expires_at: number;
}

// Конфигурация расширения
export interface ExtensionConfig {
  default_quality: string;
  auto_play: boolean;
  show_controls: boolean;
  cache_duration: number;
  debug_mode: boolean;
}
