export enum Genre {
  Suspense = 'Suspense',
  Romance = 'Romance',
  Thriller = 'Thriller',
  Mystery = 'Mystery',
  Fantasy = 'Fantasy',
  SciFi = 'Sci-Fi'
}

export type Language = 'zh' | 'en';

export interface NovelSettings {
  title: string;
  premise: string;
  genre: Genre;
  targetWordCount: number;
  chapterCount: number;
  language: Language;
}

export interface AppearanceSettings {
  fontFamily: 'font-serif' | 'font-sans' | 'font-lora';
  fontSize: 'text-sm' | 'text-base' | 'text-lg' | 'text-xl';
  lineHeight: 'leading-tight' | 'leading-normal' | 'leading-loose' | 'leading-relaxed';
  textAlign: 'text-left' | 'text-justify';
  theme: 'light' | 'sepia' | 'dark';
}

export interface Chapter {
  id: number;
  title: string;
  summary: string;
  content: string;
  isGenerating: boolean;
  isDone: boolean;
}

export interface NovelState {
  settings: NovelSettings;
  chapters: Chapter[];
  currentChapterId: number | null;
  status: 'idle' | 'generating_outline' | 'ready';
}