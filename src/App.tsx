
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { NovelState, NovelSettings, AppearanceSettings, Chapter, Character, WorldData, PlotData } from './types';
import * as GeminiService from './services/geminiService';
import { DAOFactory } from './services/dao'; 
import SettingsForm from './components/SettingsForm';
import Reader from './components/Reader';
import CharacterList from './components/CharacterList';
import ConsistencyReport from './components/ConsistencyReport';
import WorldBuilder from './components/WorldBuilder';
import PlotPlanner from './components/PlotPlanner';
import Importer from './components/Importer';
import ExportModal from './components/ExportModal';
import AppSidebar, { ViewType } from './components/AppSidebar';
import ModelConfigManager from './components/ModelConfigManager';
import PromptConfigManager from './components/PromptConfigManager';
import StorageConfigManager from './components/StorageConfigManager';
import LanguageConfigManager from './components/LanguageConfigManager';
import { Users, Globe2, GitMerge, FileSearch, Save, Loader2 } from 'lucide-react';

const getBaseDefaultSettings = (): NovelSettings => ({
  title: '',
  premise: '',
  mainCategory: '',
  themes: [],
  roles: [],
  plots: [],
  novelType: 'long',
  targetWordCount: 60000, 
  targetChapterWordCount: 3000,
  chapterCount: 20,
  language: 'zh', 
  provider: 'gemini',
  apiKey: '',
  modelName: '',
  worldSetting: '', 
  structuredWorld: {
      geography: '',
      society: '',
      culture: '',
      technology: '',
      locations: [],
      timeline: [],
      encyclopedia: []
  },
  plotData: {
      act1: '',
      act2: '',
      act3: '',
      storylines: [
          { id: 'main', name: 'Main Plot', description: 'Primary Narrative Arc', type: 'main' }
      ],
      nodes: []
  },
  writingTone: 'Neutral',
  writingStyle: 'Moderate',
  narrativePerspective: 'Third Person Limited',
  pacing: 'Moderate',
  rhetoricLevel: 'Moderate',
  maxOutputTokens: undefined, 
  storage: { type: 'sqlite' },
  customPrompts: {}
});

const createDefaultSettings = async (): Promise<NovelSettings> => {
    const base = getBaseDefaultSettings();
    try {
        const activeModelId = localStorage.getItem('active_model_config_id');
        if (activeModelId) {
            const dao = DAOFactory.getDAO(base); 
            const modelConfig = await dao.getModelConfig(activeModelId);
            if (modelConfig) {
                return {
                    ...base,
                    provider: modelConfig.provider,
                    apiKey: modelConfig.apiKey,
                    modelName: modelConfig.modelName,
                    baseUrl: modelConfig.baseUrl,
                    maxOutputTokens: modelConfig.maxOutputTokens
                };
            }
        }
    } catch (e) {
        console.warn("Failed to load active model preference", e);
    }
    return base;
};

const DEFAULT_APPEARANCE: AppearanceSettings = {
  fontFamily: 'font-serif',
  fontSize: 'text-base',
  lineHeight: 'leading-loose',
  textAlign: 'text-left',
  theme: 'light',
};

const getWordCount = (text: string) => {
    if (!text) return 0;
    const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
    if (nonAscii > text.length * 0.5) {
        return text.replace(/\s/g, '').length;
    }
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
};

interface VolumeGroup {
    volumeId: number;
    volumeTitle: string;
    chapters: Chapter[];
}

const groupChaptersByVolume = (chapters: Chapter[]): VolumeGroup[] => {
    const groups: Record<number, VolumeGroup> = {};
    const noVolumeChapters: Chapter[] = [];

    chapters.forEach(c => {
        if (c.volumeId !== undefined) {
            if (!groups[c.volumeId]) {
                groups[c.volumeId] = {
                    volumeId: c.volumeId,
                    volumeTitle: c.volumeTitle || `Volume ${c.volumeId}`,
                    chapters: []
                };
            }
            groups[c.volumeId].chapters.push(c);
        } else {
            noVolumeChapters.push(c);
        }
    });

    const result = Object.values(groups).sort((a, b) => a.volumeId - b.volumeId);
    if (noVolumeChapters.length > 0) {
        if (result.length === 0) return [{ volumeId: 0, volumeTitle: 'List', chapters: noVolumeChapters }];
        result.push({ volumeId: 9999, volumeTitle: 'Others', chapters: noVolumeChapters });
    }
    return result;
};

const getContextFromChapters = (chapters: Chapter[], currentId: number, maxChars: number = 12000): string => {
    let context = "";
    const idx = chapters.findIndex(c => c.id === currentId);
    if (idx <= 0) return ""; 

    for (let i = idx - 1; i >= 0; i--) {
        const ch = chapters[i];
        if (ch.isDone && ch.content) {
            const text = ch.content;
            if (context.length + text.length > maxChars) {
                const needed = maxChars - context.length;
                context = text.slice(-needed) + "\n\n" + context;
                break;
            } else {
                context = text + "\n\n" + context;
            }
        }
    }
    return context;
};

export const App: React.FC = () => {
  const [state, setState] = useState<NovelState>({
    settings: getBaseDefaultSettings(), 
    chapters: [],
    characters: [],
    currentChapterId: null,
    status: 'idle',
    consistencyReport: null,
    globalConsistencyReport: null,
    usage: { inputTokens: 0, outputTokens: 0 }
  });

  const [appearance, setAppearance] = useState<AppearanceSettings>(() => {
    try {
        const saved = localStorage.getItem('novel_reader_appearance');
        if (saved) {
            return { ...DEFAULT_APPEARANCE, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.warn('Failed to load appearance settings:', e);
    }
    return DEFAULT_APPEARANCE;
  });

  const [sidebarOpen, setSidebarOpen] = useState(true); 
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [showWorldBuilder, setShowWorldBuilder] = useState(false);
  const [showPlotPlanner, setShowPlotPlanner] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [showConsistencyReport, setShowConsistencyReport] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);
  
  const [savedNovels, setSavedNovels] = useState<{id: string, title: string, updatedAt: Date}[]>([]);
  const [currentView, setCurrentView] = useState<ViewType>('workspace');
  const [resetKey, setResetKey] = useState(0);
  const [expandedVolumes, setExpandedVolumes] = useState<Record<number, boolean>>({});

  const settingsRef = useRef(state.settings);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
     const init = async () => {
         if (!state.settings.id) {
             const defaults = await createDefaultSettings();
             setState(prev => ({
                 ...prev,
                 settings: {
                     ...prev.settings,
                     provider: defaults.provider,
                     apiKey: defaults.apiKey,
                     modelName: defaults.modelName,
                     baseUrl: defaults.baseUrl,
                     maxOutputTokens: defaults.maxOutputTokens
                 }
             }));
         }
     };
     init();
  }, []);

  useEffect(() => {
    settingsRef.current = state.settings;
  }, [state.settings]);

  // Save appearance whenever it changes
  useEffect(() => {
    localStorage.setItem('novel_reader_appearance', JSON.stringify(appearance));
  }, [appearance]);

  const refreshLibrary = async () => {
      const dao = DAOFactory.getDAO(state.settings.storage.type === 'mysql' ? state.settings : getBaseDefaultSettings());
      try {
          const novels = await dao.listNovels();
          setSavedNovels(novels.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()));
      } catch (e) {
          console.error("Failed to list novels", e);
      }
  };

  useEffect(() => {
      refreshLibrary();
  }, [state.settings.storage.type]); 

  const handleLoadNovel = async (id: string) => {
      if (state.status === 'generating_outline') return;
      
      const dao = DAOFactory.getDAO(state.settings); 
      try {
          const loaded = await dao.loadNovel(id);
          if (loaded) {
              if (loaded.chapters && loaded.chapters.length > 0 && loaded.status === 'idle') {
                  loaded.status = 'ready';
              }
              const loadedSettings = loaded.settings as any;
              if (!loadedSettings.structuredWorld) {
                  loadedSettings.structuredWorld = {
                      geography: '', society: '', culture: '', technology: '', locations: [], timeline: [], encyclopedia: []
                  };
                  if (loadedSettings.worldSetting) loadedSettings.structuredWorld.geography = loadedSettings.worldSetting;
              }
              if (!loadedSettings.plotData) {
                  loadedSettings.plotData = {
                      act1: '', act2: '', act3: '', storylines: [{id:'main', name:'Main', type:'main', description:''}], nodes: []
                  };
              }

              if (loadedSettings.genre && Array.isArray(loadedSettings.genre) && !loadedSettings.mainCategory) {
                 loaded.settings.mainCategory = loadedSettings.genre[0] || '玄幻';
                 loaded.settings.themes = [];
                 loaded.settings.roles = [];
                 loaded.settings.plots = [];
              }
              if (!loaded.settings.pacing) loaded.settings.pacing = 'Moderate';
              if (!loaded.settings.rhetoricLevel) loaded.settings.rhetoricLevel = 'Moderate';

              if (loaded.characters && Array.isArray(loaded.characters)) {
                  loaded.characters = loaded.characters.map(GeminiService.sanitizeCharacter);
              }
              setState(loaded);
              setLastAutoSaveTime(new Date());
              setSidebarOpen(true);
              setCurrentView('workspace'); 
              const groups = groupChaptersByVolume(loaded.chapters);
              const initialExpanded: Record<number, boolean> = {};
              groups.forEach(g => initialExpanded[g.volumeId] = true);
              setExpandedVolumes(initialExpanded);
          }
      } catch (e) {
          console.error("Failed to load novel", e);
          alert("Failed to load novel.");
      }
  };

  const handleDeleteNovel = async (id: string) => {
      if (!window.confirm("Are you sure you want to delete this novel?")) return;
      try {
          const dao = DAOFactory.getDAO(state.settings);
          await dao.deleteNovel(id);
          await refreshLibrary();
          if (state.settings.id === id) {
              handleCreateNew(true); 
          }
      } catch (e: any) {
          console.error("Delete failed", e);
          alert("Failed to delete novel: " + e.message);
      }
  };

  const handleDeleteChapter = (chapterId: number) => {
      setState(prev => ({
          ...prev,
          chapters: prev.chapters.filter(c => c.id !== chapterId)
      }));
  };

  const performSave = async (currentState: NovelState, isAuto: boolean = false) => {
      if (!currentState.settings.title) return; 
      if (!isAuto) setIsSaving(true);
      try {
          const dao = DAOFactory.getDAO(currentState.settings);
          const id = await dao.saveNovel(currentState);
          if (currentState.settings.id !== id) {
              setState(prev => ({ ...prev, settings: { ...prev.settings, id } }));
          }
          setLastAutoSaveTime(new Date());
          await refreshLibrary();
      } catch (e) {
          console.error("Save failed", e);
          if (!isAuto) alert("保存失败 (Save Failed): " + (e as Error).message);
      } finally {
          if (!isAuto) setIsSaving(false);
      }
  };

  const handleManualSave = () => performSave(state, false);

  useEffect(() => {
      if (!state.settings.title) return;
      if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
      }
      // Auto-save debounce
      autoSaveTimerRef.current = setTimeout(() => {
          performSave(state, true);
      }, 3000);
      return () => {
          if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      };
  }, [state]);

  const handleCreateNew = async (force: boolean = false) => {
      if (!force && state.status === 'ready' && state.chapters.some(c => c.isDone || c.content)) {
        if (!window.confirm("Creating new novel will close current one. Unsaved progress might be lost (Auto-save is on). Continue?")) {
            return;
        }
      }
      
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
      }

      const defaults = await createDefaultSettings();
      setState({
        settings: defaults,
        chapters: [],
        characters: [],
        currentChapterId: null,
        status: 'idle',
        consistencyReport: null,
        usage: { inputTokens: 0, outputTokens: 0 }
      });
      setResetKey(prev => prev + 1); 
      setExpandedVolumes({});
      setLastAutoSaveTime(null);
      setSidebarOpen(true);
      setCurrentView('workspace');
  };

  const handleCloseNovel = async () => {
      if (state.settings.title) {
          await performSave(state, true);
      }
      await handleCreateNew(true);
  };

  const handleUsageUpdate = (usage: { input: number; output: number }) => {
    setState(prev => ({
        ...prev,
        usage: {
            inputTokens: prev.usage.inputTokens + usage.input,
            outputTokens: prev.usage.outputTokens + usage.output
        }
    }));
  };

  const handleSettingsChange = (newSettings: NovelSettings) => {
    setState(prev => ({ ...prev, settings: newSettings }));
  };

  const handleAppearanceChange = (newAppearance: Partial<AppearanceSettings>) => {
    setAppearance(prev => ({ ...prev, ...newAppearance }));
  };

  const handleUpdateChapter = (chapterId: number, newContent: string) => {
    setState(prev => {
        const nextChapters = prev.chapters.map(c => 
            c.id === chapterId ? { ...c, content: newContent, isDone: true } : c
        );
        return { ...prev, chapters: nextChapters };
    });
  };

  const handleUpdateChapterData = (chapterId: number, data: Partial<Chapter>) => {
    setState(prev => ({
        ...prev,
        chapters: prev.chapters.map(c => c.id === chapterId ? { ...c, ...data } : c)
    }));
  };

  const handleUpdateCharacters = (newCharacters: Character[]) => {
      setState(prev => ({ ...prev, characters: newCharacters }));
  };

  const handleUpdateWorld = (newWorld: WorldData) => {
      const summary = `
Geography: ${newWorld.geography}
Society: ${newWorld.society}
Culture: ${newWorld.culture}
Technology: ${newWorld.technology}
      `.trim();

      setState(prev => ({
          ...prev,
          settings: {
              ...prev.settings,
              structuredWorld: newWorld,
              worldSetting: summary 
          }
      }));
  };

  const handleUpdatePlot = (newPlot: PlotData) => {
      setState(prev => ({
          ...prev,
          settings: {
              ...prev.settings,
              plotData: newPlot
          }
      }));
  };

  const handleUpdateGlobalReport = (report: string) => {
      setState(prev => ({ ...prev, globalConsistencyReport: report }));
  };

  const handleImport = async (newSettings: NovelSettings, newChapters: Chapter[], newCharacters: Character[]) => {
      const newState: NovelState = {
          ...state,
          settings: { ...state.settings, ...newSettings },
          chapters: newChapters,
          characters: newCharacters,
          status: 'ready',
          currentChapterId: newChapters[0]?.id || null,
          usage: state.usage
      };
      
      // Save immediately to generate an ID and avoid race conditions with auto-save
      try {
          const dao = DAOFactory.getDAO(newState.settings);
          const id = await dao.saveNovel(newState);
          newState.settings.id = id;
          
          setState(newState);
          setExpandedVolumes({1: true}); 
          setLastAutoSaveTime(new Date());
          await refreshLibrary();
      } catch (e) {
          console.error("Import save failed", e);
          // Fallback if save fails
          setState(newState);
      }
  };

  const generateOutlineAndCharacters = async () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState(prev => ({ ...prev, status: 'generating_outline' }));
    
    try {
      const [outline, characters] = await Promise.all([
         GeminiService.generateOutline(settingsRef.current, controller.signal, handleUsageUpdate),
         GeminiService.generateCharacters(settingsRef.current, controller.signal, handleUsageUpdate)
      ]);
      
      const newChapters: Chapter[] = outline.map(c => ({
        ...c,
        content: '',
        isGenerating: false,
        isDone: false
      }));

      const groups = groupChaptersByVolume(newChapters);
      const initialExpanded: Record<number, boolean> = {};
      groups.forEach(g => initialExpanded[g.volumeId] = true);
      setExpandedVolumes(initialExpanded);

      // We rely on useEffect for auto-save here to avoid stale state issues
      setState(prev => ({
        ...prev,
        chapters: newChapters,
        characters: characters,
        status: 'ready',
        currentChapterId: newChapters[0]?.id || null
      }));
      
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('Aborted')) {
          console.log("Generation stopped by user.");
          setState(prev => ({ ...prev, status: 'idle' }));
      } else {
          console.error("Generation failed", error);
          alert(`Failed to generate outline or characters: ${error.message || "Unknown Error"}`);
          setState(prev => ({ ...prev, status: 'idle' }));
      }
    } finally {
        abortControllerRef.current = null;
    }
  };

  const handleStopGeneration = () => {
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
      }
      setState(prev => ({
          ...prev,
          status: prev.status === 'generating_outline' ? 'idle' : prev.status,
          chapters: prev.chapters.map(c => ({...c, isGenerating: false}))
      }));
  };

  const selectChapter = (id: number) => {
    setState(prev => ({ ...prev, currentChapterId: id }));
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const toggleVolume = (volumeId: number) => {
      setExpandedVolumes(prev => ({ ...prev, [volumeId]: !prev[volumeId] }));
  };

  const generateChapterContent = async (force: boolean = false) => {
    const chapterId = state.currentChapterId;
    if (!chapterId) return;

    if (abortControllerRef.current) {
         abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const chapterIndex = state.chapters.findIndex(c => c.id === chapterId);
    if (chapterIndex === -1) return;

    const chapter = state.chapters[chapterIndex];
    if (!force && (chapter.isDone || chapter.isGenerating)) return;

    if (force) {
        if (!window.confirm("确定要重写本章吗？现有内容将被覆盖。\nAre you sure you want to rewrite this chapter? Current content will be lost.")) {
            return;
        }
    }

    const previousChapters = state.chapters.filter(c => c.isDone && c.id < chapterId);
    const storySummaries = previousChapters.map(c => `Chapter ${c.id}: ${c.summary}`).join("\n");
    
    const previousChapterContent = getContextFromChapters(state.chapters, chapterId, 12000);

    setState(prev => {
      const newChapters = [...prev.chapters];
      newChapters[chapterIndex] = { ...chapter, isGenerating: true, content: force ? '' : (chapter.content || ''), isDone: false };
      return { ...prev, chapters: newChapters };
    });

    try {
      let stream = GeminiService.generateChapterStream(
          settingsRef.current, 
          chapter, 
          storySummaries, 
          previousChapterContent,
          state.characters, 
          controller.signal,
          handleUsageUpdate
      );
      
      let fullContent = '';
      
      for await (const chunk of stream) {
        fullContent += chunk;
        setState(prev => {
          const nextChapters = [...prev.chapters];
          const idx = nextChapters.findIndex(c => c.id === chapterId);
          if (idx !== -1) {
            nextChapters[idx] = { ...nextChapters[idx], content: fullContent };
          }
          return { ...prev, chapters: nextChapters };
        });
      }

      let TARGET_WORD_COUNT = state.settings.targetChapterWordCount || 3000;
      if (!state.settings.targetChapterWordCount) {
          if (state.settings.novelType === 'short') {
              TARGET_WORD_COUNT = state.settings.targetWordCount || 5000;
          } else if (state.settings.targetWordCount && state.settings.chapterCount) {
              TARGET_WORD_COUNT = Math.max(1500, Math.floor(state.settings.targetWordCount / state.settings.chapterCount));
          }
      }

      let currentWordCount = getWordCount(fullContent);
      let loops = 0;
      while (currentWordCount < TARGET_WORD_COUNT && loops < 5) {
          if (controller.signal.aborted) break;
          loops++;
          stream = GeminiService.extendChapter(
              fullContent,
              settingsRef.current,
              chapter.title,
              state.characters,
              TARGET_WORD_COUNT,
              currentWordCount,
              controller.signal,
              handleUsageUpdate
          );

          fullContent += "\n\n"; 
          for await (const chunk of stream) {
            fullContent += chunk;
            setState(prev => {
                const nextChapters = [...prev.chapters];
                const idx = nextChapters.findIndex(c => c.id === chapterId);
                if (idx !== -1) nextChapters[idx] = { ...nextChapters[idx], content: fullContent };
                return { ...prev, chapters: nextChapters };
            });
          }
          currentWordCount = getWordCount(fullContent);
      }

      let finalSummary = chapter.summary;
      if (!controller.signal.aborted) {
          try {
            const generatedSummary = await GeminiService.summarizeChapter(fullContent, settingsRef.current, handleUsageUpdate);
            if (generatedSummary) finalSummary = generatedSummary;
          } catch (err) { console.error("Summary failed", err); }
      }

      setState(prev => {
        const nextChapters = [...prev.chapters];
        const idx = nextChapters.findIndex(c => c.id === chapterId);
        if (idx !== -1) {
          nextChapters[idx] = { ...nextChapters[idx], content: fullContent, summary: finalSummary, isGenerating: false, isDone: true };
        }
        return { ...prev, chapters: nextChapters };
      });
      // Removed manual performSave to rely on useEffect and avoid race conditions

    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('Aborted')) {
           console.log("Chapter generation aborted");
      } else {
           console.error("Chapter generation error", error);
           alert(`Error: ${error.message || "Unknown"}`);
      }
      setState(prev => {
        const newChapters = [...prev.chapters];
        const idx = newChapters.findIndex(c => c.id === chapterId);
        if (idx !== -1) newChapters[idx] = { ...newChapters[idx], isGenerating: false };
        return { ...prev, chapters: newChapters };
      });
    } finally {
        abortControllerRef.current = null;
    }
  };

  const handleAutoGenerate = async () => {
    if (state.chapters.every(c => c.isDone)) {
        if (window.confirm("All chapters done. Rewrite all?")) {
           handleRewriteAll();
        }
        return;
    }

    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let cumulativeSummaries = "";
    const alreadyDone = state.chapters.filter(c => c.isDone);
    cumulativeSummaries = alreadyDone.map(c => `Chapter ${c.id}: ${c.summary}`).join("\n");
    
    const lastDoneId = alreadyDone.length > 0 ? alreadyDone[alreadyDone.length - 1].id : 0;
    let previousChapterContent = getContextFromChapters(state.chapters, lastDoneId + 1, 12000); 

    for (let i = 0; i < state.chapters.length; i++) {
        if (controller.signal.aborted) break;

        const chapter = state.chapters[i];
        if (chapter.isDone) {
             if (!cumulativeSummaries.includes(`Chapter ${chapter.id}:`)) cumulativeSummaries += `\nChapter ${chapter.id}: ${chapter.summary}`;
             if (chapter.content) {
                 previousChapterContent = (previousChapterContent + "\n\n" + chapter.content).slice(-12000);
             }
             continue;
        }

        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 5000)); 
        }
        if (controller.signal.aborted) break;

        setState(prev => ({ 
            ...prev, 
            currentChapterId: chapter.id,
            chapters: prev.chapters.map((c, idx) => idx === i ? { ...c, isGenerating: true } : c)
        }));

        let retries = 0;
        const MAX_RETRIES = 1;
        let success = false;

        while (!success && retries <= MAX_RETRIES) {
            if (controller.signal.aborted) break;
            try {
                let fullContent = "";
                let stream = GeminiService.generateChapterStream(
                    settingsRef.current, chapter, cumulativeSummaries, previousChapterContent, state.characters, 
                    controller.signal, handleUsageUpdate
                );
                
                for await (const chunk of stream) {
                    fullContent += chunk;
                    setState(prev => {
                        const nextChapters = [...prev.chapters];
                        nextChapters[i] = { ...nextChapters[i], content: fullContent };
                        return { ...prev, chapters: nextChapters };
                    });
                }
                
                let summary = chapter.summary;
                if (!controller.signal.aborted) {
                    try {
                        const genSummary = await GeminiService.summarizeChapter(fullContent, settingsRef.current, handleUsageUpdate); 
                        if (genSummary) summary = genSummary;
                    } catch (e) {}
                }

                setState(prev => {
                    const nextChapters = [...prev.chapters];
                    nextChapters[i] = { ...nextChapters[i], content: fullContent, summary: summary, isGenerating: false, isDone: true };
                    return { ...prev, chapters: nextChapters };
                });

                cumulativeSummaries += `\nChapter ${chapter.id}: ${summary}`;
                previousChapterContent = (previousChapterContent + "\n\n" + fullContent).slice(-12000);
                
                // Rely on auto-save
                success = true;

            } catch (error: any) {
                if (error.name === 'AbortError' || error.message?.includes('Aborted')) break;
                
                const errorMsg = error.message || "";
                if (errorMsg.includes("Content Safety") || errorMsg.includes("inappropriate content")) {
                    console.warn(`Chapter ${chapter.id} skipped due to Content Safety.`);
                    setState(prev => {
                        const nextChapters = [...prev.chapters];
                        nextChapters[i] = { ...nextChapters[i], isGenerating: false, content: (nextChapters[i].content || "") + "\n\n[Skipped Safety]", isDone: true };
                        return { ...prev, chapters: nextChapters };
                    });
                    success = true;
                    continue;
                }

                const isRateLimit = errorMsg.includes('429') || errorMsg.includes('quota');
                if (isRateLimit && retries < MAX_RETRIES) {
                    retries++;
                    await new Promise(resolve => setTimeout(resolve, 60000));
                    continue; 
                }

                setState(prev => {
                    const nextChapters = [...prev.chapters];
                    nextChapters[i] = { ...nextChapters[i], isGenerating: false };
                    return { ...prev, chapters: nextChapters };
                });
                alert(`Auto-generation paused at Chapter ${chapter.id}: ${errorMsg}`);
                return; 
            }
        }
    }
    abortControllerRef.current = null;
  };

  const handleRewriteAll = async () => {
     alert("Feature under maintenance.");
  };

  const handleExportText = () => {
    const text = state.chapters.map(c => 
        `第 ${c.id} 章 ${c.title}\n\n${c.content}\n`
    ).join('\n--------------------------------------------------\n\n');
    const fullText = `Title: ${state.settings.title}\n\n${text}`;
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.settings.title || 'novel'}.txt`;
    link.click();
    setShowExportMenu(false);
  };

  const handleExportPDF = () => {
    const content = state.chapters.map(c => `
        <div class="chapter">
            <h2>第 ${c.id} 章：${c.title}</h2>
            <div class="content">${c.content.replace(/\n/g, '<br/>')}</div>
        </div>
    `).join('');
    
    const html = `
        <html>
        <head>
            <title>${state.settings.title}</title>
            <style>
                body { font-family: 'Times New Roman', Serif, 'Songti SC', 'SimSun'; padding: 40px; max-width: 800px; margin: 0 auto; }
                h1 { text-align: center; margin-bottom: 50px; }
                .chapter { page-break-before: always; margin-top: 50px; }
                .chapter:first-child { page-break-before: auto; }
                .content { line-height: 1.8; text-align: justify; white-space: pre-wrap; font-size: 16px; }
                @media print {
                    body { padding: 0; }
                }
            </style>
        </head>
        <body>
            <h1>${state.settings.title}</h1>
            <p style="text-align:center; color: #666;">Generated by DreamWeaver</p>
            ${content}
            <script>window.onload = () => window.print();</script>
        </body>
        </html>
    `;
    const win = window.open('', '_blank');
    if (win) {
        win.document.write(html);
        win.document.close();
    }
    setShowExportMenu(false);
  };

  return (
    <div className={`flex h-screen w-full overflow-hidden ${appearance.theme === 'dark' ? 'bg-gray-900 text-gray-300' : 'bg-gray-50 text-gray-900'} ${appearance.fontFamily}`}>
      <div className={`${sidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 overflow-hidden flex-shrink-0 border-r border-gray-200 dark:border-gray-800 relative`}>
        <AppSidebar
          novels={savedNovels}
          currentNovelId={state.settings.id}
          onSelect={handleLoadNovel}
          onCreate={() => handleCreateNew(false)}
          onDelete={handleDeleteNovel}
          settings={state.settings}
          onSettingsChange={handleSettingsChange}
          currentView={currentView}
          onNavigate={setCurrentView}
          onImport={() => setShowImporter(true)}
          onExport={() => setShowExportMenu(true)}
          chapters={state.chapters}
          currentChapterId={state.currentChapterId}
          onChapterSelect={selectChapter}
          onAutoGenerate={handleAutoGenerate}
          onDeleteChapter={handleDeleteChapter}
        />
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {currentView === 'workspace' && (
          <>
            {state.status !== 'ready' ? (
              <div className="flex-1 overflow-y-auto p-4 md:p-8">
                 <SettingsForm 
                    settings={state.settings}
                    onSettingsChange={handleSettingsChange}
                    onSubmit={generateOutlineAndCharacters}
                    onStop={handleStopGeneration}
                    isLoading={state.status === 'generating_outline'}
                 />
              </div>
            ) : (
              <Reader
                chapter={state.chapters.find(c => c.id === state.currentChapterId)}
                settings={state.settings}
                appearance={appearance}
                onAppearanceChange={handleAppearanceChange}
                onGenerate={() => generateChapterContent()}
                onRewrite={() => generateChapterContent(true)}
                onBack={() => setSidebarOpen(true)}
                onUpdateContent={handleUpdateChapter}
                onUpdateChapter={handleUpdateChapterData}
                characters={state.characters}
                onStop={handleStopGeneration}
                chapters={state.chapters}
                onChapterSelect={selectChapter}
              />
            )}
          </>
        )}

        {currentView === 'settings-model' && (
            <ModelConfigManager settings={state.settings} onSettingsChange={handleSettingsChange} />
        )}
        
        {currentView === 'settings-prompt' && (
            <PromptConfigManager settings={state.settings} onSettingsChange={handleSettingsChange} />
        )}

        {currentView === 'settings-storage' && (
            <StorageConfigManager settings={state.settings} onSettingsChange={handleSettingsChange} />
        )}

        {currentView === 'settings-language' && (
            <LanguageConfigManager settings={state.settings} onSettingsChange={handleSettingsChange} />
        )}

        {state.status === 'ready' && currentView === 'workspace' && (
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-10 pointer-events-none">
                 <div className="pointer-events-auto flex flex-col gap-2">
                    <button onClick={() => setShowCharacterModal(true)} className="p-3 bg-white rounded-full shadow-lg border border-gray-200 text-gray-600 hover:text-indigo-600 transition-colors" title="角色管理">
                        <Users size={20} />
                    </button>
                    <button onClick={() => setShowWorldBuilder(true)} className="p-3 bg-white rounded-full shadow-lg border border-gray-200 text-gray-600 hover:text-indigo-600 transition-colors" title="世界观">
                        <Globe2 size={20} />
                    </button>
                    <button onClick={() => setShowPlotPlanner(true)} className="p-3 bg-white rounded-full shadow-lg border border-gray-200 text-gray-600 hover:text-indigo-600 transition-colors" title="情节规划">
                        <GitMerge size={20} />
                    </button>
                    <button onClick={() => setShowConsistencyReport(true)} className="p-3 bg-white rounded-full shadow-lg border border-gray-200 text-gray-600 hover:text-indigo-600 transition-colors" title="一致性检查">
                        <FileSearch size={20} />
                    </button>
                    <button onClick={handleManualSave} disabled={isSaving} className={`p-3 bg-white rounded-full shadow-lg border border-gray-200 text-gray-600 hover:text-green-600 transition-colors ${isSaving ? 'animate-pulse' : ''}`} title="保存">
                        {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                    </button>
                 </div>
            </div>
        )}

        {lastAutoSaveTime && (
            <div className="absolute bottom-4 right-4 text-xs text-gray-400 pointer-events-none opacity-50">
                已保存 {lastAutoSaveTime.toLocaleTimeString()}
            </div>
        )}
      </div>

      <CharacterList 
        isOpen={showCharacterModal} 
        onClose={() => setShowCharacterModal(false)}
        characters={state.characters}
        onUpdateCharacters={handleUpdateCharacters}
        settings={state.settings}
        chapters={state.chapters}
      />
      
      <WorldBuilder 
        isOpen={showWorldBuilder}
        onClose={() => setShowWorldBuilder(false)}
        settings={state.settings}
        onUpdateWorld={handleUpdateWorld}
      />

      <PlotPlanner 
        isOpen={showPlotPlanner}
        onClose={() => setShowPlotPlanner(false)}
        settings={state.settings}
        onUpdatePlot={handleUpdatePlot}
        characters={state.characters}
      />

      <ConsistencyReport 
        isOpen={showConsistencyReport}
        onClose={() => setShowConsistencyReport(false)}
        chapters={state.chapters}
        onFixConsistency={(id) => generateChapterContent(true)}
        globalReport={state.globalConsistencyReport}
        onUpdateGlobalReport={handleUpdateGlobalReport}
        characters={state.characters}
        settings={state.settings}
      />

      <Importer
        isOpen={showImporter}
        onClose={() => setShowImporter(false)}
        onImport={handleImport}
        baseSettings={state.settings}
      />

      <ExportModal 
        isOpen={showExportMenu}
        onClose={() => setShowExportMenu(false)}
        title={state.settings.title}
        onExportText={handleExportText}
        onExportPDF={handleExportPDF}
      />
    </div>
  );
};

export default App;
