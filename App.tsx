
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
import AppSidebar, { ViewType } from './components/AppSidebar';
import ModelConfigManager from './components/ModelConfigManager';
import PromptConfigManager from './components/PromptConfigManager';
import StorageConfigManager from './components/StorageConfigManager';
import LanguageConfigManager from './components/LanguageConfigManager';
import { Menu, ChevronRight, CheckCircle2, Circle, Download, FileText, Printer, Sparkles, Users, FileSearch, BookOpen, Gauge, Database, Loader2, Clock, Layers, ChevronDown, StopCircle, Globe2, GitMerge } from 'lucide-react';

// ... (default settings helpers unchanged)
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
  // Default Style Settings
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

// ... (helpers getWordCount, groupChaptersByVolume unchanged)
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

const App: React.FC = () => {
  // ... (state unchanged)
  const [currentView, setCurrentView] = useState<ViewType>('workspace');
  const [resetKey, setResetKey] = useState(0);

  const [state, setState] = useState<NovelState>({
    settings: getBaseDefaultSettings(), 
    chapters: [],
    characters: [],
    currentChapterId: null,
    status: 'idle',
    consistencyReport: null,
    usage: { inputTokens: 0, outputTokens: 0 }
  });

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

  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [sidebarOpen, setSidebarOpen] = useState(true); 
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showCharacterModal, setShowCharacterModal] = useState(false);
  const [showWorldBuilder, setShowWorldBuilder] = useState(false);
  const [showPlotPlanner, setShowPlotPlanner] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [showConsistencyReport, setShowConsistencyReport] = useState(false);
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);
  
  const [savedNovels, setSavedNovels] = useState<{id: string, title: string, updatedAt: Date}[]>([]);
  
  const [expandedVolumes, setExpandedVolumes] = useState<Record<number, boolean>>({});

  const settingsRef = useRef(state.settings);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    settingsRef.current = state.settings;
  }, [state.settings]);

  // ... (Persistence Logic, Load, Delete, Save unchanged)
  
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
              // Migration for structured world
              if (!loadedSettings.structuredWorld) {
                  loadedSettings.structuredWorld = {
                      geography: '', society: '', culture: '', technology: '', locations: [], timeline: [], encyclopedia: []
                  };
                  if (loadedSettings.worldSetting) loadedSettings.structuredWorld.geography = loadedSettings.worldSetting;
              }
              // Migration for plot data
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

  // ... (handleDeleteNovel, performSave, handleManualSave, etc. same as before) ...
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

  const totalWordCount = state.chapters.reduce((acc, c) => acc + getWordCount(c.content || ''), 0);

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

  const handleImport = (newSettings: NovelSettings, newChapters: Chapter[], newCharacters: Character[]) => {
      setState(prev => ({
          ...prev,
          settings: { ...prev.settings, ...newSettings },
          chapters: newChapters,
          characters: newCharacters,
          status: 'ready',
          currentChapterId: newChapters[0]?.id || null
      }));
      setExpandedVolumes({1: true}); // Default expand
      setTimeout(() => performSave(state, true), 1000);
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

      setState(prev => ({
        ...prev,
        chapters: newChapters,
        characters: characters,
        status: 'ready',
        currentChapterId: newChapters[0]?.id || null
      }));
      
      setTimeout(() => performSave(state, true), 1000);

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
    let previousChapterContent = "";
    if (previousChapters.length > 0) {
        const last = previousChapters[previousChapters.length - 1];
        if (last.id === chapterId - 1) {
             previousChapterContent = (last.content || "").slice(-8000);
        }
    }

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
      setTimeout(() => performSave(state, true), 100);

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
    let previousChapterContent = "";
    if (alreadyDone.length > 0) {
        previousChapterContent = (alreadyDone[alreadyDone.length - 1].content || "").slice(-8000);
    }

    for (let i = 0; i < state.chapters.length; i++) {
        if (controller.signal.aborted) break;

        const chapter = state.chapters[i];
        if (chapter.isDone) {
             if (!cumulativeSummaries.includes(`Chapter ${chapter.id}:`)) cumulativeSummaries += `\nChapter ${chapter.id}: ${chapter.summary}`;
             previousChapterContent = (chapter.content || "").slice(-8000);
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
                previousChapterContent = fullContent.slice(-8000);
                await performSave(state, true);
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
  const handleExportText = () => {};
  const handleExportPDF = () => {};

  const handleConsistencyCheck = async () => {
    if (isCheckingConsistency) return;
    setIsCheckingConsistency(true);
    
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
        const chaptersToCheck = state.chapters.filter(c => c.isDone && c.content);
        if (chaptersToCheck.length === 0) {
            alert("没有已完成的章节可供检查 (No completed chapters to check)");
            setIsCheckingConsistency(false);
            return;
        }

        for (const chapter of chaptersToCheck) {
             if (controller.signal.aborted) break;
             
             const analysis = await GeminiService.checkConsistency(chapter.content, state.characters, state.settings, handleUsageUpdate);
             
             setState(prev => {
                 const newChapters = [...prev.chapters];
                 const idx = newChapters.findIndex(c => c.id === chapter.id);
                 if (idx !== -1) {
                     newChapters[idx] = { ...newChapters[idx], consistencyAnalysis: analysis };
                 }
                 return { ...prev, chapters: newChapters };
             });
        }
        
        if (!controller.signal.aborted) {
            setShowConsistencyReport(true);
        }

    } catch (e: any) {
        if (e.name !== 'AbortError') {
             console.error(e);
             alert("Consistency check failed: " + e.message);
        }
    } finally {
        setIsCheckingConsistency(false);
        abortControllerRef.current = null;
    }
  };

  const handleFixConsistency = async (chapterId: number) => {
      const chapter = state.chapters.find(c => c.id === chapterId);
      if (!chapter || !chapter.content || !chapter.consistencyAnalysis) return;

      setState(prev => {
          const newChapters = [...prev.chapters];
          const idx = newChapters.findIndex(c => c.id === chapterId);
          if (idx !== -1) newChapters[idx] = { ...newChapters[idx], isGenerating: true };
          return { ...prev, chapters: newChapters };
      });

      try {
          const newContent = await GeminiService.fixChapterConsistency(
              chapter.content, 
              state.characters, 
              chapter.consistencyAnalysis, 
              state.settings, 
              handleUsageUpdate
          );

          setState(prev => {
              const newChapters = [...prev.chapters];
              const idx = newChapters.findIndex(c => c.id === chapterId);
              if (idx !== -1) {
                  newChapters[idx] = { 
                      ...newChapters[idx], 
                      content: newContent, 
                      isGenerating: false,
                      consistencyAnalysis: "Fixed (AI Applied)" 
                  };
              }
              return { ...prev, chapters: newChapters };
          });
          
          await performSave(state, true);

      } catch (e: any) {
          console.error(e);
          alert("Fix failed: " + e.message);
          setState(prev => {
              const newChapters = [...prev.chapters];
              const idx = newChapters.findIndex(c => c.id === chapterId);
              if (idx !== -1) newChapters[idx] = { ...newChapters[idx], isGenerating: false };
              return { ...prev, chapters: newChapters };
          });
      }
  };

  const currentChapter = state.chapters.find(c => c.id === state.currentChapterId);
  const volumeGroups = groupChaptersByVolume(state.chapters);

  // ... (Render Logic)

  let mainContent;
  if (currentView === 'settings-model') {
      mainContent = <ModelConfigManager settings={state.settings} onSettingsChange={handleSettingsChange} />;
  } else if (currentView === 'settings-prompt') {
      mainContent = <PromptConfigManager settings={state.settings} onSettingsChange={handleSettingsChange} />;
  } else if (currentView === 'settings-storage') {
      mainContent = <StorageConfigManager settings={state.settings} onSettingsChange={handleSettingsChange} />;
  } else if (currentView === 'settings-language') {
      mainContent = <LanguageConfigManager settings={state.settings} onSettingsChange={handleSettingsChange} />;
  } else if (state.status === 'idle' || state.status === 'generating_outline') {
      mainContent = (
         <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col">
            <header className="bg-white border-b border-gray-200 py-4 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2">
                    <h1 className="text-xl font-serif font-bold text-gray-800">
                        {state.settings.id ? '编辑设定 (Edit Settings)' : '新作品设定 (New Novel)'}
                    </h1>
                </div>
            </header>
            <main className="flex-1">
                <SettingsForm 
                    key={`${state.settings.id || 'new'}-${resetKey}`}
                    settings={state.settings}
                    onSettingsChange={handleSettingsChange}
                    onSubmit={generateOutlineAndCharacters}
                    onStop={handleStopGeneration} 
                    isLoading={state.status === 'generating_outline'}
                />
            </main>
        </div>
      );
  } else {
      mainContent = (
          <div className="flex flex-1 h-full overflow-hidden">
                <div 
                    className={`${
                    sidebarOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full'
                    } bg-white border-r border-gray-200 transition-all duration-300 ease-in-out flex flex-col flex-shrink-0 relative z-20 h-full shadow-sm`}
                >
                    {/* ... (Sidebar Header Content Unchanged) ... */}
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col space-y-2">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-700 font-sans">目录 (Table of Contents)</h3>
                            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-gray-500">
                                <ChevronRight className="rotate-180" />
                            </button>
                        </div>
                         <div className="text-xs text-gray-500 bg-white px-2 py-1 rounded border border-gray-100 flex justify-between">
                            <span>总字数 (Total):</span>
                            <span className="font-mono font-medium">{totalWordCount}</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto py-2">
                        {volumeGroups.map((group) => (
                            <div key={group.volumeId} className="mb-2">
                                {group.volumeTitle !== 'List' && (
                                    <button 
                                        onClick={() => toggleVolume(group.volumeId)}
                                        className="w-full text-left px-4 py-2 flex items-center justify-between text-xs font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors uppercase tracking-wider"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Layers size={12} />
                                            <span className="truncate max-w-[160px]" title={group.volumeTitle}>
                                                {group.volumeId === 0 ? 'Uncategorized' : `Vol ${group.volumeId}: ${group.volumeTitle}`}
                                            </span>
                                        </div>
                                        {expandedVolumes[group.volumeId] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                    </button>
                                )}
                                {(group.volumeTitle === 'List' || expandedVolumes[group.volumeId]) && (
                                    <div className={group.volumeTitle !== 'List' ? 'pl-2' : ''}>
                                        {group.chapters.map((chapter) => (
                                            <button
                                            key={chapter.id}
                                            onClick={() => selectChapter(chapter.id)}
                                            className={`w-full text-left px-5 py-2 border-l-4 transition-all duration-300 relative overflow-hidden ${
                                                state.currentChapterId === chapter.id
                                                ? 'bg-indigo-50 border-indigo-500'
                                                : 'border-transparent hover:bg-gray-50'
                                            }`}
                                            >
                                            {chapter.isGenerating && (
                                                <div className="absolute inset-0 bg-indigo-100/50 animate-pulse pointer-events-none" />
                                            )}
                                            <div className="flex items-start justify-between relative z-10">
                                                <div className="overflow-hidden flex-1 mr-2">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 block ${state.currentChapterId === chapter.id ? 'text-indigo-600' : 'text-gray-400'}`}>
                                                    Chapter {chapter.id}
                                                </span>
                                                <span className={`text-xs font-medium block truncate ${state.currentChapterId === chapter.id ? 'text-gray-900' : 'text-gray-700'}`} title={chapter.title}>
                                                    {chapter.title}
                                                </span>
                                                </div>
                                                <div className="mt-1 flex items-center space-x-1 shrink-0">
                                                {chapter.isGenerating ? (
                                                    <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />
                                                ) : chapter.isDone ? (
                                                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                                                ) : (
                                                    <Circle className="w-3 h-3 text-gray-300" />
                                                )}
                                                </div>
                                            </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-3">
                        {/* Control Buttons Grid */}
                        <div className="grid grid-cols-4 gap-1">
                            <button onClick={() => setShowCharacterModal(true)} className="flex flex-col items-center justify-center text-gray-600 hover:text-indigo-600 text-[10px] font-medium py-2 rounded-lg transition-colors hover:bg-gray-100">
                                <Users size={16} className="mb-1" />
                                <span>人物</span>
                            </button>

                            <button onClick={() => setShowWorldBuilder(true)} className="flex flex-col items-center justify-center text-indigo-600 hover:text-indigo-800 text-[10px] font-medium py-2 rounded-lg transition-colors hover:bg-indigo-50">
                                <Globe2 size={16} className="mb-1" />
                                <span>世界</span>
                            </button>

                            <button onClick={() => setShowPlotPlanner(true)} className="flex flex-col items-center justify-center text-purple-600 hover:text-purple-800 text-[10px] font-medium py-2 rounded-lg transition-colors hover:bg-purple-50">
                                <GitMerge size={16} className="mb-1 rotate-90" />
                                <span>情节</span>
                            </button>

                            <button onClick={handleConsistencyCheck} disabled={isCheckingConsistency} className="flex flex-col items-center justify-center text-orange-600 hover:text-orange-800 text-[10px] font-medium py-2 rounded-lg transition-colors hover:bg-orange-50">
                                <FileSearch size={16} className={`mb-1 ${isCheckingConsistency ? 'animate-pulse' : ''}`} />
                                <span>校验</span>
                            </button>

                            {/* Dynamic Generate/Stop Button */}
                            {state.chapters.some(c => c.isGenerating) ? (
                                <button onClick={handleStopGeneration} className="col-span-4 flex items-center justify-center space-x-2 text-red-600 hover:text-red-800 text-[10px] font-medium py-2 rounded-lg transition-colors hover:bg-red-50 animate-pulse bg-red-50 border border-red-100 mt-2">
                                    <StopCircle size={14} />
                                    <span>停止生成 (Stop)</span>
                                </button>
                            ) : (
                                <button onClick={handleAutoGenerate} className="col-span-4 flex items-center justify-center space-x-2 text-indigo-600 hover:text-indigo-800 text-[10px] font-medium py-2 rounded-lg transition-colors hover:bg-indigo-50 bg-indigo-50 border border-indigo-100 mt-2">
                                    <Sparkles size={14} />
                                    <span>自动生成 (Auto Generate)</span>
                                </button>
                            )}
                        </div>
                        
                         <div className="text-xs pt-2 border-t border-gray-200 flex flex-col space-y-2">
                             <div className="flex justify-between items-center text-gray-400">
                                <p className="truncate font-medium text-gray-500 max-w-[120px]" title={state.settings.title}>{state.settings.title}</p>
                                <button onClick={handleManualSave} disabled={isSaving} className="flex items-center space-x-1 hover:text-emerald-600 transition-colors">
                                {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
                                <span className="text-[10px]">{isSaving ? 'Saving...' : 'Save'}</span>
                                </button>
                             </div>
                        </div>
                    </div>
                </div>

                {!sidebarOpen && (
                <button onClick={() => setSidebarOpen(true)} className="absolute left-4 top-4 z-30 p-2 bg-white rounded-full shadow-md text-gray-600 hover:text-indigo-600 transition-colors">
                    <Menu size={20} />
                </button>
                )}

                <Reader 
                    chapter={currentChapter}
                    settings={state.settings}
                    appearance={appearance}
                    onAppearanceChange={handleAppearanceChange}
                    onGenerate={() => generateChapterContent(false)}
                    onRewrite={() => generateChapterContent(true)}
                    onBack={() => handleCreateNew(true)}
                    onUpdateContent={handleUpdateChapter}
                    characters={state.characters}
                    onStop={handleStopGeneration} // Pass stop handler
                />
          </div>
      );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100">
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
        onImport={() => setShowImporter(true)} // Pass trigger
      />
      <div className="flex-1 flex flex-col h-full relative overflow-hidden">
        {mainContent}
        <CharacterList 
            characters={state.characters} 
            chapters={state.chapters} // Pass chapters for timeline visualization
            isOpen={showCharacterModal} 
            onClose={() => setShowCharacterModal(false)} 
            onUpdateCharacters={handleUpdateCharacters} 
            settings={state.settings} 
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
        />
        <Importer 
            isOpen={showImporter}
            onClose={() => setShowImporter(false)}
            baseSettings={state.settings}
            onImport={handleImport}
        />
        <ConsistencyReport chapters={state.chapters} isOpen={showConsistencyReport} onClose={() => setShowConsistencyReport(false)} onFixConsistency={handleFixConsistency} />
      </div>
    </div>
  );
};

export default App;
