import React, { useState, useCallback, useRef, useEffect } from 'react';
import { NovelState, NovelSettings, Genre, AppearanceSettings, Chapter } from './types';
import * as GeminiService from './services/geminiService';
import SettingsForm from './components/SettingsForm';
import Reader from './components/Reader';
import { Layout, Menu, ChevronRight, CheckCircle2, Circle, Save, Download, FileText, Printer } from 'lucide-react';

// Initial default settings
const DEFAULT_SETTINGS: NovelSettings = {
  title: '',
  premise: '',
  genre: Genre.Suspense, // Default requirement
  targetWordCount: 3000, // Default requirement
  chapterCount: 5,
  language: 'zh', // Default to Chinese
};

const DEFAULT_APPEARANCE: AppearanceSettings = {
  fontFamily: 'font-serif',
  fontSize: 'text-base',
  lineHeight: 'leading-loose',
  textAlign: 'text-left',
  theme: 'light',
};

const App: React.FC = () => {
  // --- State ---
  const [state, setState] = useState<NovelState>({
    settings: DEFAULT_SETTINGS,
    chapters: [],
    currentChapterId: null,
    status: 'idle',
  });

  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Refs for tracking generation context
  const abortControllerRef = useRef<AbortController | null>(null);

  // --- Handlers ---

  const handleSettingsChange = (newSettings: NovelSettings) => {
    setState(prev => ({ ...prev, settings: newSettings }));
  };

  const handleAppearanceChange = (newAppearance: Partial<AppearanceSettings>) => {
    setAppearance(prev => ({ ...prev, ...newAppearance }));
  };

  const handleBackToHome = () => {
    if (state.status === 'ready' && state.chapters.some(c => c.isDone || c.content)) {
      if (!window.confirm("返回首页将丢失当前生成的内容，确定要返回吗？\nReturning to home will lose current progress. Continue?")) {
        return;
      }
    }
    
    setState({
      settings: DEFAULT_SETTINGS,
      chapters: [],
      currentChapterId: null,
      status: 'idle',
    });
    setSidebarOpen(true);
  };

  const generateOutline = async () => {
    setState(prev => ({ ...prev, status: 'generating_outline' }));
    try {
      const outline = await GeminiService.generateOutline(state.settings);
      
      const newChapters: Chapter[] = outline.map(c => ({
        ...c,
        content: '',
        isGenerating: false,
        isDone: false
      }));

      setState(prev => ({
        ...prev,
        chapters: newChapters,
        status: 'ready',
        currentChapterId: newChapters[0]?.id || null
      }));
    } catch (error) {
      console.error("Outline generation failed", error);
      alert("Failed to generate outline. Please check your API key and try again.");
      setState(prev => ({ ...prev, status: 'idle' }));
    }
  };

  const selectChapter = (id: number) => {
    setState(prev => ({ ...prev, currentChapterId: id }));
    // Mobile responsiveness: close sidebar on selection on small screens
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const generateChapterContent = async () => {
    const chapterId = state.currentChapterId;
    if (!chapterId) return;

    const chapterIndex = state.chapters.findIndex(c => c.id === chapterId);
    if (chapterIndex === -1) return;

    const chapter = state.chapters[chapterIndex];
    if (chapter.isDone || chapter.isGenerating) return;

    // Build context from previous completed chapters
    const previousContent = state.chapters
      .filter(c => c.isDone && c.id < chapterId)
      .map(c => c.content)
      .join("\n\n");

    // Update state to generating
    setState(prev => {
      const newChapters = [...prev.chapters];
      newChapters[chapterIndex] = { ...chapter, isGenerating: true, content: '' };
      return { ...prev, chapters: newChapters };
    });

    try {
      const stream = GeminiService.generateChapterStream(state.settings, chapter, previousContent);
      
      let fullContent = '';
      
      for await (const chunk of stream) {
        fullContent += chunk;
        setState(prev => {
          const newChapters = [...prev.chapters];
          // Determine index again in case state changed elsewhere (unlikely but safe)
          const idx = newChapters.findIndex(c => c.id === chapterId);
          if (idx !== -1) {
            newChapters[idx] = { 
              ...newChapters[idx], 
              content: fullContent 
            };
          }
          return { ...prev, chapters: newChapters };
        });
      }

      // Generation complete, now generate summary
      let finalSummary = chapter.summary;
      try {
        const generatedSummary = await GeminiService.summarizeChapter(
          fullContent, 
          state.settings.genre, 
          state.settings.language
        );
        if (generatedSummary) {
          finalSummary = generatedSummary;
        }
      } catch (err) {
        console.error("Failed to generate summary", err);
      }

      // Mark as done and update summary
      setState(prev => {
        const newChapters = [...prev.chapters];
        const idx = newChapters.findIndex(c => c.id === chapterId);
        if (idx !== -1) {
          newChapters[idx] = { 
            ...newChapters[idx], 
            content: fullContent,
            summary: finalSummary,
            isGenerating: false, 
            isDone: true 
          };
        }
        return { ...prev, chapters: newChapters };
      });

    } catch (error) {
      console.error("Chapter generation error", error);
      alert("Error generating chapter content.");
       setState(prev => {
        const newChapters = [...prev.chapters];
        const idx = newChapters.findIndex(c => c.id === chapterId);
        if (idx !== -1) {
          newChapters[idx] = { ...newChapters[idx], isGenerating: false };
        }
        return { ...prev, chapters: newChapters };
      });
    }
  };

  // --- Export Handlers ---

  const handleExportText = () => {
    const lines = [];
    lines.push(state.settings.title);
    lines.push("=".repeat(state.settings.title.length * 2));
    lines.push(`\nPremise/Intro:\n${state.settings.premise}\n`);
    
    state.chapters.forEach(chapter => {
      lines.push("\n\n" + "#".repeat(20));
      lines.push(`Chapter ${chapter.id}: ${chapter.title}`);
      lines.push("#".repeat(20) + "\n");
      lines.push(chapter.content || "(Content not generated yet)");
    });

    const text = lines.join("\n");
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.settings.title.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to export PDF.");
      return;
    }

    const title = state.settings.title || "Novel";
    
    const contentHtml = state.chapters.map(c => `
      <div class="chapter">
        <h2>Chapter ${c.id}: ${c.title}</h2>
        <div class="content">${(c.content || '(Content not generated yet)').replace(/\n/g, '<br/>')}</div>
      </div>
      <div class="page-break"></div>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          body { 
            font-family: 'Times New Roman', "SimSun", "Songti SC", serif; 
            padding: 40px; 
            max-width: 800px; 
            margin: 0 auto; 
            color: #000;
          }
          h1 { text-align: center; margin-bottom: 20px; font-size: 2em; }
          .premise { font-style: italic; margin-bottom: 40px; color: #444; border-left: 3px solid #ddd; padding-left: 15px; }
          .chapter { margin-bottom: 40px; }
          h2 { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-top: 30px; }
          .content { line-height: 1.8; text-align: justify; white-space: pre-wrap; font-size: 1.1em; }
          .page-break { page-break-after: always; }
          @media print {
             body { padding: 0; }
            .page-break { page-break-after: always; }
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="premise">${state.settings.premise}</div>
        <hr style="margin: 30px 0; border: 0; border-top: 1px solid #ccc;" />
        ${contentHtml}
        <script>
          window.onload = () => { setTimeout(() => window.print(), 500); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setShowExportMenu(false);
  };


  // --- Render Helpers ---

  const currentChapter = state.chapters.find(c => c.id === state.currentChapterId);

  // --- Main Render ---

  // 1. Initial Setup View
  if (state.status === 'idle' || state.status === 'generating_outline') {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 py-4 px-6 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layout className="text-indigo-600 w-6 h-6" />
            <h1 className="text-xl font-serif font-bold text-gray-800">DreamWeaver Novelist</h1>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <SettingsForm 
            settings={state.settings}
            onSettingsChange={handleSettingsChange}
            onSubmit={generateOutline}
            isLoading={state.status === 'generating_outline'}
          />
        </main>
      </div>
    );
  }

  // 2. Editor / Reader View
  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      
      {/* Sidebar - Chapter Outline */}
      <div 
        className={`${
          sidebarOpen ? 'w-80 translate-x-0' : 'w-0 -translate-x-full'
        } bg-white border-r border-gray-200 transition-all duration-300 ease-in-out flex flex-col absolute md:relative z-20 h-full shadow-xl md:shadow-none`}
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <h3 className="font-semibold text-gray-700 font-sans">目录 (Table of Contents)</h3>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-gray-500">
             <ChevronRight className="rotate-180" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto py-2">
          {state.chapters.map((chapter) => (
            <button
              key={chapter.id}
              onClick={() => selectChapter(chapter.id)}
              className={`w-full text-left px-5 py-3 border-l-4 transition-colors ${
                state.currentChapterId === chapter.id
                  ? 'bg-indigo-50 border-indigo-500'
                  : 'border-transparent hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                   <span className={`text-xs font-bold uppercase tracking-wider mb-0.5 block ${state.currentChapterId === chapter.id ? 'text-indigo-600' : 'text-gray-400'}`}>
                    第 {chapter.id} 章
                  </span>
                  <span className={`text-sm font-medium block truncate w-48 ${state.currentChapterId === chapter.id ? 'text-gray-900' : 'text-gray-700'}`}>
                    {chapter.title}
                  </span>
                </div>
                <div className="mt-1">
                   {chapter.isGenerating ? (
                      <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                   ) : chapter.isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                   ) : (
                      <Circle className="w-4 h-4 text-gray-300" />
                   )}
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-3">
          <div className="flex justify-between items-center relative">
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-800 text-sm font-medium w-full p-2 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <Download size={16} />
              <span>导出小说 (Export)</span>
            </button>
            
            {showExportMenu && (
              <div className="absolute bottom-full left-0 w-full mb-2 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden z-50">
                <button onClick={handleExportText} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center space-x-2 text-sm text-gray-700">
                  <FileText size={16} />
                  <span>导出文本 (.txt)</span>
                </button>
                <button onClick={handleExportPDF} className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center space-x-2 text-sm text-gray-700 border-t border-gray-100">
                  <Printer size={16} />
                  <span>打印 / PDF (.pdf)</span>
                </button>
              </div>
            )}
          </div>
          
          <div className="text-xs text-gray-400 pt-2 border-t border-gray-200">
            <p className="truncate font-medium text-gray-500">{state.settings.title}</p>
            <p>{state.settings.targetWordCount} 字 (目标)</p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* Toggle Sidebar Button (when closed) */}
        {!sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)}
            className="absolute left-4 top-4 z-30 p-2 bg-white rounded-full shadow-md text-gray-600 hover:text-indigo-600 transition-colors"
          >
            <Menu size={20} />
          </button>
        )}

        {/* Reader Component */}
        <Reader 
          chapter={currentChapter}
          appearance={appearance}
          onAppearanceChange={handleAppearanceChange}
          onGenerate={generateChapterContent}
          onBack={handleBackToHome}
          novelTitle={state.settings.title}
        />
      </div>

    </div>
  );
};

export default App;