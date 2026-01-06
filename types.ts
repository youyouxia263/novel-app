
export type Language = 'zh' | 'en';
export type NovelType = 'long' | 'short';

export type ModelProvider = 'gemini' | 'alibaba' | 'volcano' | 'custom';

export type WritingTone = 
  | 'Neutral' | 'Dark' | 'Humorous' | 'Melancholic' | 'Fast-paced' | 'Romantic' | 'Cynical' 
  | 'Suspenseful' | 'Whimsical' | 'Inspirational' | 'Serious' | 'Witty' | 'Dramatic';

export type WritingStyle = 
  | 'Simple' | 'Moderate' | 'Complex' | 'Poetic' 
  | 'Minimalist' | 'Descriptive' | 'Colloquial' | 'Academic';

export type NarrativePerspective = 
  | 'First Person' | 'Third Person Limited' | 'Third Person Omniscient' | 'Second Person';

export type NarrativePacing = 'Fast' | 'Moderate' | 'Slow';

export type RhetoricLevel = 'Plain' | 'Moderate' | 'Rich';

export type StorageType = 'sqlite' | 'mysql';

export interface StorageConfig {
  type: StorageType;
  // MySQL specific config
  mysqlHost?: string;
  mysqlPort?: string;
  mysqlUser?: string;
  mysqlPassword?: string;
  mysqlDatabase?: string;
}

export interface ModelConfig {
  id: string;
  name: string; // User defined name (e.g. "My Paid GPT")
  provider: ModelProvider;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  maxOutputTokens?: number;
  createdAt: Date;
}

// Tomato Novel Classification Types
export interface TagOption {
    id: string;
    label: string;
}

export interface WorldLocation {
    id: string;
    name: string;
    description: string;
    x: number;
    y: number;
    type: 'city' | 'landmark' | 'region';
}

export interface WorldEvent {
    id: string;
    year: string;
    description: string;
}

export interface WorldTerm {
    id: string;
    term: string;
    definition: string;
    category: string;
}

export interface WorldData {
    geography: string;
    society: string;
    culture: string;
    technology: string;
    locations: WorldLocation[];
    timeline: WorldEvent[];
    encyclopedia: WorldTerm[];
}

// Plot Planning Types
export interface PlotNode {
    id: string;
    title: string;
    description: string;
    chapterRange?: string; 
    type: 'inciting_incident' | 'turning_point' | 'midpoint' | 'climax' | 'resolution' | 'foreshadowing' | 'callback';
    storylineId: string;
    
    // Advanced Plot Features
    tension: number; // 1-10 scale
    causalLink?: string; // ID of the node that caused this event
    foreshadowLink?: string; // ID of the node this foreshadows or calls back to
}

export interface Storyline {
    id: string;
    name: string; // e.g., "Main Plot", "Romance Subplot"
    description: string;
    type: 'main' | 'sub';
}

export interface PlotData {
    act1: string; // Setup
    act2: string; // Confrontation
    act3: string; // Resolution
    storylines: Storyline[];
    nodes: PlotNode[];
}

export interface NovelSettings {
  id?: string; // UUID for persistence
  title: string;
  premise: string;
  
  // New Classification System
  mainCategory: string; // Subject (Genre) - Single Select
  themes: string[];     // World/Core - Select 1-3
  roles: string[];      // Character Attributes - Select 1-2
  plots: string[];      // Plot/Vibe - Select 1-3

  novelType: NovelType;
  targetWordCount: number; // Kept for backward compatibility/Total estimation
  targetChapterWordCount?: number; // Target words per chapter
  chapterCount: number;
  language: Language;
  
  worldSetting?: string; // Summary string for prompting
  structuredWorld?: WorldData; // Detailed world building data
  
  plotData?: PlotData; // Narrative structure data

  mainCharacters?: string; 
  
  // Model Configuration (Active Session)
  provider: ModelProvider;
  baseUrl?: string; 
  apiKey?: string; 
  modelName?: string; 
  maxOutputTokens?: number; 
  
  // Prompt Configuration
  customPrompts?: Record<string, string>; // Key: template_id, Value: user modified template

  // Style Configuration
  writingTone: WritingTone;
  writingStyle: WritingStyle;
  narrativePerspective: NarrativePerspective;
  pacing: NarrativePacing;
  rhetoricLevel: RhetoricLevel;

  // Storage Configuration
  storage: StorageConfig;
}

export interface AppearanceSettings {
  fontFamily: 'font-serif' | 'font-sans' | 'font-lora';
  fontSize: 'text-sm' | 'text-base' | 'text-lg' | 'text-xl';
  lineHeight: 'leading-tight' | 'leading-normal' | 'leading-loose' | 'leading-relaxed';
  textAlign: 'text-left' | 'text-justify';
  theme: 'light' | 'sepia' | 'dark';
}

// Big 5 Personality Traits
export interface PersonalityTraits {
    openness: number; // 0-100
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
}

export interface Character {
  name: string;
  role: string;
  description: string;
  relationships: string;
  // New Fields for Consistency & Visualization
  imageUrl?: string;
  voiceGuide?: string; // Dialogue style instructions
  arc?: string; // Development trajectory
  // Advanced Analysis
  psychology?: string;
  goals?: string;
  
  // Detailed Fields
  personalityTags?: PersonalityTraits;
  backgroundStory?: string;
  skills?: string;
}

export interface Chapter {
  id: number;
  title: string;
  summary: string;
  content: string;
  // Volume Support
  volumeId?: number;
  volumeTitle?: string;
  
  isGenerating: boolean;
  isDone: boolean;
  consistencyAnalysis?: string;
}

export interface GrammarIssue {
  original: string;
  suggestion: string;
  explanation: string;
}

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
}

export interface NovelState {
  settings: NovelSettings;
  chapters: Chapter[];
  characters: Character[];
  currentChapterId: number | null;
  status: 'idle' | 'generating_outline' | 'ready';
  consistencyReport?: string | null;
  usage: UsageStats; 
  lastSaved?: Date; // Track save time
}
