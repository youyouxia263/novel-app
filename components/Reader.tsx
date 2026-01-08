
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppearanceSettings, Chapter, NovelSettings, GrammarIssue, Character } from '../types';
import { Type, AlignLeft, AlignJustify, Moon, Sun, Monitor, ArrowUpDown, Home, ChevronRight, Edit3, Save, X, Sparkles, Loader2, AlertTriangle, FileText, BookOpen, Copy, Check, SpellCheck, PenLine, FileCode, RefreshCw, Square, Activity, ArrowLeft, List, Folder, FolderOpen, Target } from 'lucide-react';
import { continueWriting, checkGrammar, autoCorrectGrammar, analyzePacing } from '../services/geminiService';
import GrammarReport from './GrammarReport';

interface ReaderProps {
  chapter: Chapter | undefined;
  settings: NovelSettings;
  appearance: AppearanceSettings;
  onAppearanceChange: (newSettings: Partial<AppearanceSettings>) => void;
  onGenerate: () => void;
  onRewrite: () => void;
  onBack: () => void;
  onUpdateContent: (id: number, content: string) => void;
  onUpdateChapter?: (id: number, data: Partial<Chapter>) => void;
  characters?: Character[];
  onStop?: () => void;
  chapters?: Chapter[];
  onChapterSelect?: (id: number) => void;
}

interface VolumeGroup {
    volumeId: number;
    volumeTitle: string;
    chapters: Chapter[];
}

const Reader: React.FC<ReaderProps> = ({ 
  chapter, 
  settings,
  appearance, 
  onAppearanceChange, 
  onGenerate, 
  onRewrite,
  onBack,
  onUpdateContent,
  onUpdateChapter,
  characters = [],
  onStop,
  chapters = [],
  onChapterSelect
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isAiWriting, setIsAiWriting] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [mdCopySuccess, setMdCopySuccess] = useState(false);
  const [summaryCopySuccess, setSummaryCopySuccess] = useState(false);
  
  const [isCheckingGrammar, setIsCheckingGrammar] = useState(false);
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>([]);
  const [showGrammarReport, setShowGrammarReport] = useState(false);
  const [isFixingGrammar, setIsFixingGrammar] = useState(false);

  // Pacing
  const [isAnalyzingPacing, setIsAnalyzingPacing] = useState(false);
  const [pacingReport, setPacingReport] = useState<string | null>(null);
  const [showPacingModal, setShowPacingModal] = useState(false);

  // Directory
  const [isDirectoryOpen, setIsDirectoryOpen] = useState(false);
  const [expandedVolumes, setExpandedVolumes] = useState<Record<number, boolean>>({});
  const directoryScrollRef = useRef<HTMLDivElement>(null);

  // Target Word Count Popover
  const [showTargetInput, setShowTargetInput] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chapter) {
        setEditContent(chapter.content || '');
        setIsEditing(false);
        setStreamingContent('');
    }
  }, [chapter?.id, chapter?.content]);

  useEffect(() => {
    if (isAiWriting || (chapter && chapter.isGenerating)) {
        requestAnimationFrame(() => {
             if (contentEndRef.current) {
                 contentEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
             }
            if (textareaRef.current) {
                textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
            }
        });
    }
  }, [streamingContent, editContent, isAiWriting, chapter?.isGenerating]);

  // Organize chapters into volumes
  const volumeGroups = useMemo(() => {
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
        if (result.length === 0) {
            return [{ volumeId: 0, volumeTitle: '目录', chapters: noVolumeChapters }];
        }
        result.push({ volumeId: 9999, volumeTitle: '其他章节', chapters: noVolumeChapters });
    }
    return result;
  }, [chapters]);

  // Auto-expand active volume and scroll to chapter when directory opens
  useEffect(() => {
    if (isDirectoryOpen && chapter) {
        const group = volumeGroups.find(g => g.chapters.some(c => c.id === chapter.id));
        if (group) {
            setExpandedVolumes(prev => ({...prev, [group.volumeId]: true}));
        }
        // Small delay to ensure render before scroll
        setTimeout(() => {
            const el = document.getElementById(`reader-chapter-${chapter.id}`);
            if (el) el.scrollIntoView({ block: 'center' });
        }, 100);
    }
  }, [isDirectoryOpen, chapter, volumeGroups]);

  const toggleVolume = (vid: number) => {
      setExpandedVolumes(prev => ({...prev, [vid]: !prev[vid]}));
  };

  const handleStartEdit = () => {
    if (!chapter) return;
    setEditContent(chapter.content || '');
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (!chapter) return;
    onUpdateContent(chapter.id, editContent);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(chapter?.content || '');
  };

  const handleAiContinue = async () => {
    if (!chapter) return;
    let baseContent = isEditing ? editContent : (chapter.content || '');
    if (baseContent && !baseContent.endsWith('\n')) {
        baseContent += '\n';
    }
    if (isEditing) {
        onUpdateContent(chapter.id, baseContent);
    }
    setIsEditing(false);
    setIsAiWriting(true);
    setStreamingContent(''); 

    try {
        const stream = continueWriting(baseContent, settings, chapter.title, characters);
        let accumulated = '';
        for await (const chunk of stream) {
            accumulated += chunk;
            setStreamingContent(accumulated);
        }
        const finalContent = baseContent + accumulated;
        setEditContent(finalContent);
        onUpdateContent(chapter.id, finalContent);
    } catch (e: any) {
        console.error("AI writing failed", e);
        alert(`AI assistant encountered an error: ${e.message}`);
    } finally {
        setStreamingContent('');
        setIsAiWriting(false);
    }
  };

  const handleCopy = async () => {
    if (!chapter?.content && !editContent) return;
    const textToCopy = isEditing ? editContent : chapter?.content || '';
    try {
        await navigator.clipboard.writeText(textToCopy);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
        console.error('Failed to copy', err);
    }
  };

  const handleCopyMarkdown = async () => {
    if (!chapter?.content && !editContent) return;
    const content = isEditing ? editContent : chapter?.content || '';
    const markdown = `# ${chapter?.title}\n\n${content}`;
    try {
        await navigator.clipboard.writeText(markdown);
        setMdCopySuccess(true);
        setTimeout(() => setMdCopySuccess(false), 2000);
    } catch (err) {
        console.error('Failed to copy markdown', err);
    }
  };

  const handleCopySummary = async () => {
    if (!chapter?.summary) return;
    try {
        await navigator.clipboard.writeText(chapter.summary);
        setSummaryCopySuccess(true);
        setTimeout(() => setSummaryCopySuccess(false), 2000);
    } catch (err) {
        console.error('Failed to copy summary', err);
    }
  };

  const handleGrammarCheck = async () => {
      const textToCheck = isEditing ? editContent : chapter?.content;
      if (!textToCheck) return;
      setIsCheckingGrammar(true);
      try {
          const issues = await checkGrammar(textToCheck, settings);
          setGrammarIssues(issues);
          setShowGrammarReport(true);
      } catch (e) {
          console.error("Grammar check failed", e);
          alert("语法检查失败，请检查网络连接。");
      } finally {
          setIsCheckingGrammar(false);
      }
  };

  const handleAutoFixGrammar = async () => {
      const textToFix = isEditing ? editContent : chapter?.content;
      if (!chapter || !textToFix) return;
      setIsFixingGrammar(true);
      try {
          const fixed = await autoCorrectGrammar(textToFix, settings);
          if (isEditing) {
              setEditContent(fixed);
          } else {
              onUpdateContent(chapter.id, fixed);
          }
          setShowGrammarReport(false);
      } catch (e) {
          console.error("Auto fix failed", e);
          alert("一键修复失败。");
      } finally {
          setIsFixingGrammar(false);
      }
  };

  const handlePacingAnalysis = async () => {
      const text = isEditing ? editContent : chapter?.content;
      if(!text) return;
      setIsAnalyzingPacing(true);
      setShowPacingModal(true);
      try {
          const report = await analyzePacing(text, settings);
          setPacingReport(report);
      } catch (e: any) {
          setPacingReport("Analysis failed: " + e.message);
      } finally {
          setIsAnalyzingPacing(false);
      }
  };

  const handleTargetChange = (val: number) => {
      if (!chapter || !onUpdateChapter) return;
      onUpdateChapter(chapter.id, { targetWordCount: val });
  };

  const getWordCount = (text: string) => {
    if (!text) return 0;
    const nonAscii = (text.match(/[^\x00-\x7F]/g) || []).length;
    if (nonAscii > text.length * 0.5) {
        return text.replace(/\s/g, '').length;
    }
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  };

  const getThemeClasses = () => {
    // Safety check in case appearance is undefined
    const theme = appearance?.theme || 'light';
    switch (theme) {
      case 'dark': return 'bg-gray-900 text-gray-300';
      case 'sepia': return 'bg-[#f4ecd8] text-[#5b4636]';
      default: return 'bg-white text-gray-800'; // light
    }
  };

  const getContainerThemeClasses = () => {
    const theme = appearance?.theme || 'light';
    switch (theme) {
      case 'dark': return 'bg-gray-950 border-gray-800';
      case 'sepia': return 'bg-[#eaddcf] border-[#d3c4b1]';
      default: return 'bg-gray-100 border-gray-200'; // light
    }
  }

  const safeAppearance = appearance || {
      fontFamily: 'font-serif',
      fontSize: 'text-base',
      lineHeight: 'leading-loose',
      textAlign: 'text-left',
      theme: 'light'
  };

  if (!chapter) {
    return (
      <div className={`flex-1 flex items-center justify-center ${getContainerThemeClasses()} h-full`}>
        <div className="text-center p-8 max-w-md">
           <Type className="w-12 h-12 mx-auto mb-4 opacity-20" />
           <p className="text-lg opacity-50">请从左侧选择一个章节以查看或生成内容。</p>
        </div>
      </div>
    );
  }

  const currentText = isEditing ? editContent : (chapter.content || '');
  const displayWordCount = getWordCount(currentText + streamingContent);
  const targetWords = chapter.targetWordCount || settings.targetChapterWordCount || 3000;
  const progressPercent = Math.min(100, Math.round((displayWordCount / targetWords) * 100));
  const isBusy = isAiWriting || chapter.isGenerating;

  return (
    <div className={`flex-1 flex flex-col h-full overflow-hidden transition-colors duration-300 ${getContainerThemeClasses()}`}>
      
      {/* Progress Bar (Visible when writing) */}
      <div className="h-1 bg-transparent w-full relative">
          {isBusy && (
              <div 
                className="absolute inset-0 bg-indigo-600 transition-all duration-300 ease-out animate-pulse" 
                style={{ width: `${progressPercent}%` }}
              >
                <div className="absolute inset-0 bg-white/30 animate-[shimmer_2s_infinite] w-full" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)' }}></div>
              </div>
          )}
      </div>

      {/* Floating Status Indicator (When writing) */}
      {isBusy && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur border border-indigo-200 shadow-xl px-5 py-2.5 rounded-full flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ring-2 ring-indigo-500/10">
              <div className="relative">
                  <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                  <span className="absolute inset-0 bg-indigo-400 rounded-full blur-sm opacity-30 animate-pulse"></span>
              </div>
              <span className="text-xs font-bold text-indigo-700 tracking-wide">
                  AI 正在创作中... <span className="font-mono ml-1">{progressPercent}%</span>
              </span>
              {onStop && (
                  <>
                    <div className="h-4 w-px bg-indigo-200 mx-1"></div>
                    <button 
                        onClick={onStop} 
                        className="p-1 hover:bg-red-50 text-red-500 rounded-full transition-colors group"
                        title="Stop Generation"
                    >
                        <Square size={12} className="fill-current group-hover:scale-110 transition-transform" />
                    </button>
                  </>
              )}
          </div>
      )}

      {/* Toolbar */}
      <div className={`h-14 flex items-center justify-between px-4 md:px-6 border-b shrink-0 transition-colors duration-300 ${
        safeAppearance.theme === 'dark' ? 'bg-gray-900 border-gray-800' : 
        safeAppearance.theme === 'sepia' ? 'bg-[#f4ecd8] border-[#d3c4b1]' : 
        'bg-white border-gray-200'
      }`}>
        <div className="flex items-center overflow-hidden mr-4">
           {/* Navigation */}
           <button 
              onClick={onBack}
              className={`flex items-center space-x-1 hover:bg-black/5 px-2 py-1.5 rounded-lg transition-colors group mr-1 ${
                safeAppearance.theme === 'light' ? 'text-gray-600 hover:text-indigo-600' : 'text-gray-400 hover:text-white'
              }`}
              title="返回书架"
           >
              <ArrowLeft size={18} />
              <span className="text-sm font-bold hidden sm:inline">返回</span>
           </button>

           <button 
              onClick={() => setIsDirectoryOpen(true)}
              className={`flex items-center space-x-1 hover:bg-black/5 px-2 py-1.5 rounded-lg transition-colors group mr-2 ${
                safeAppearance.theme === 'light' ? 'text-gray-600 hover:text-indigo-600' : 'text-gray-400 hover:text-white'
              }`}
              title="打开目录"
           >
              <List size={18} />
              <span className="text-sm font-bold hidden sm:inline">目录</span>
           </button>
           
           <div className="h-4 w-px bg-current opacity-10 mx-2 hidden sm:block"></div>
           
           <span className="text-sm font-medium opacity-70 truncate max-w-[120px] md:max-w-[200px]" title={settings.title}>
              {settings.title || "未命名"}
           </span>
           
           <ChevronRight size={14} className="mx-2 opacity-30 flex-shrink-0" />
           
           <span className="font-semibold text-sm opacity-90 flex-shrink-0 whitespace-nowrap">
              第 {chapter.id} 章
           </span>
        </div>

        <div className="flex items-center space-x-2">
            {!isEditing ? (
                <>
                <div className="hidden lg:flex items-center border-l border-r border-opacity-20 px-2 space-x-1 border-current">
                   <button onClick={() => onAppearanceChange({ fontSize: 'text-sm' })} className={`p-1 hover:bg-black/5 rounded ${safeAppearance.fontSize === 'text-sm' ? 'font-bold' : ''}`}>A</button>
                   <button onClick={() => onAppearanceChange({ fontSize: 'text-base' })} className={`p-1 hover:bg-black/5 rounded text-lg ${safeAppearance.fontSize === 'text-base' ? 'font-bold' : ''}`}>A</button>
                   <button onClick={() => onAppearanceChange({ fontSize: 'text-lg' })} className={`p-1 hover:bg-black/5 rounded text-xl ${safeAppearance.fontSize === 'text-lg' ? 'font-bold' : ''}`}>A</button>
                </div>

                <div className="hidden lg:flex items-center space-x-1 px-2">
                   <button onClick={() => onAppearanceChange({ textAlign: 'text-left' })} className={`p-1 rounded hover:bg-black/5 ${safeAppearance.textAlign === 'text-left' ? 'bg-black/10' : ''}`}><AlignLeft size={16}/></button>
                   <button onClick={() => onAppearanceChange({ textAlign: 'text-justify' })} className={`p-1 rounded hover:bg-black/5 ${safeAppearance.textAlign === 'text-justify' ? 'bg-black/10' : ''}`}><AlignJustify size={16}/></button>
                </div>

                <div className="flex items-center bg-black/5 rounded-lg p-0.5 ml-2">
                   <button onClick={() => onAppearanceChange({ theme: 'light' })} className={`p-1.5 rounded-md ${safeAppearance.theme === 'light' ? 'bg-white shadow-sm text-yellow-600' : 'text-gray-400'}`}><Sun size={14} /></button>
                   <button onClick={() => onAppearanceChange({ theme: 'sepia' })} className={`p-1.5 rounded-md ${safeAppearance.theme === 'sepia' ? 'bg-[#eaddcf] shadow-sm text-[#5b4636]' : 'text-gray-400'}`}><Monitor size={14} /></button>
                   <button onClick={() => onAppearanceChange({ theme: 'dark' })} className={`p-1.5 rounded-md ${safeAppearance.theme === 'dark' ? 'bg-gray-800 shadow-sm text-indigo-400' : 'text-gray-400'}`}><Moon size={14} /></button>
                </div>
                
                {/* Target Word Count Control - Toolbar */}
                <div className="relative ml-2">
                    <button 
                        onClick={() => setShowTargetInput(!showTargetInput)}
                        className={`p-1.5 rounded-md hover:bg-black/5 transition-colors text-gray-500 hover:text-indigo-600 flex items-center gap-1`}
                        title={`本章目标字数: ${chapter.targetWordCount || settings.targetChapterWordCount || 3000}`}
                    >
                        <Target size={16} />
                        <span className="text-xs font-mono hidden xl:inline">{chapter.targetWordCount || settings.targetChapterWordCount || 3000}</span>
                    </button>
                    
                    {showTargetInput && (
                        <div className="absolute top-full right-0 mt-2 p-3 bg-white rounded-lg shadow-xl border border-gray-200 z-50 w-48 animate-in fade-in zoom-in-95">
                            <label className="block text-xs font-bold text-gray-700 mb-2">本章目标字数</label>
                            <div className="flex gap-2">
                                <input 
                                    type="number" 
                                    min="100" 
                                    step="100"
                                    autoFocus
                                    className="w-full px-2 py-1 text-sm border rounded"
                                    value={chapter.targetWordCount || settings.targetChapterWordCount || 3000}
                                    onChange={(e) => handleTargetChange(parseInt(e.target.value))}
                                />
                                <button onClick={() => setShowTargetInput(false)} className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 text-xs">OK</button>
                            </div>
                        </div>
                    )}
                </div>

                {(chapter.content || isBusy) && (
                    <>
                    <div className="h-4 w-px bg-current opacity-20 mx-2"></div>
                    
                    <div className="hidden sm:flex gap-1">
                        <button onClick={handleCopyMarkdown} className="p-1.5 rounded-md hover:bg-black/5 text-gray-500 hover:text-indigo-600 transition-colors" title="复制 Markdown">{mdCopySuccess ? <Check size={16} className="text-green-600" /> : <FileCode size={16} />}</button>
                        <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-black/5 text-gray-500 hover:text-indigo-600 transition-colors" title="复制文本">{copySuccess ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}</button>
                        {chapter.summary && (
                            <button onClick={handleCopySummary} className="p-1.5 rounded-md hover:bg-black/5 text-gray-500 hover:text-indigo-600 transition-colors" title="复制章节摘要">
                                {summaryCopySuccess ? <Check size={16} className="text-green-600" /> : <FileText size={16} />}
                            </button>
                        )}
                        <button onClick={handleGrammarCheck} disabled={isCheckingGrammar || isBusy} className={`p-1.5 rounded-md hover:bg-black/5 transition-colors ${isCheckingGrammar ? 'text-indigo-400 animate-pulse' : 'text-gray-500 hover:text-indigo-600'}`} title="语法检查"><SpellCheck size={16} /></button>
                    </div>

                    <button 
                        onClick={onRewrite}
                        disabled={isBusy}
                        className="p-1.5 rounded-md hover:bg-black/5 text-gray-500 hover:text-red-600 transition-colors relative group hidden sm:block"
                        title="重写本章"
                    >
                        <RefreshCw size={16} />
                    </button>

                    <button 
                        onClick={handleAiContinue}
                        disabled={isBusy}
                        className="ml-2 flex items-center space-x-1 bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-purple-100 transition-colors shadow-sm disabled:opacity-50"
                        title="AI 续写"
                    >
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        <span className="hidden sm:inline">AI 续写</span>
                    </button>

                    <button 
                        onClick={handleStartEdit}
                        disabled={isBusy}
                        className="ml-2 flex items-center space-x-1 bg-indigo-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                    >
                        <Edit3 size={14} />
                        <span>编辑</span>
                    </button>
                    </>
                )}
                </>
            ) : (
                <div className="flex items-center space-x-2 w-full justify-end">
                    <button 
                        onClick={handleAiContinue}
                        disabled={isAiWriting}
                        className="flex items-center space-x-1 bg-purple-100 text-purple-700 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-purple-200 transition-colors mr-auto"
                        title="让 AI 继续写作"
                    >
                         {isAiWriting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                         <span>AI 续写</span>
                    </button>

                    <button 
                        onClick={handleCancelEdit}
                        className="flex items-center space-x-1 bg-gray-200 text-gray-700 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-gray-300 transition-colors"
                    >
                        <X size={14} />
                        <span>取消</span>
                    </button>
                    <button 
                        onClick={handleSaveEdit}
                        className="flex items-center space-x-1 bg-green-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-green-700 transition-colors shadow-sm"
                    >
                        <Save size={14} />
                        <span>保存</span>
                    </button>
                </div>
            )}
        </div>
      </div>

      <div className="flex-1 relative w-full h-full min-h-0">
        {isEditing ? (
           <textarea
             ref={textareaRef}
             value={editContent}
             onChange={(e) => setEditContent(e.target.value)}
             className={`absolute inset-0 w-full h-full p-8 resize-none outline-none leading-loose ${getThemeClasses()} ${safeAppearance.fontFamily} ${safeAppearance.fontSize}`}
             placeholder="开始写作..."
           />
        ) : (
           <div 
             className={`absolute inset-0 w-full h-full overflow-y-auto p-8 prose max-w-none ${getThemeClasses()} ${safeAppearance.fontFamily} ${safeAppearance.fontSize} ${safeAppearance.textAlign} ${safeAppearance.lineHeight}`}
           >
             {chapter.content || chapter.isGenerating || streamingContent ? (
                <div className="whitespace-pre-wrap max-w-3xl mx-auto pb-20">
                   <h1 className="text-3xl font-bold mb-8 text-center">{chapter.title}</h1>
                   <span>{chapter.content}</span>
                   
                   {streamingContent && (
                        <span className={`inline relative font-serif px-1 py-0.5 rounded mx-0.5 ${
                            safeAppearance.theme === 'dark' ? 'text-indigo-200 bg-indigo-900/40' : 'text-indigo-800 bg-indigo-50'
                        } transition-colors duration-200`}>
                            {streamingContent}
                            <span className="inline-block w-2 h-5 ml-1 align-middle bg-indigo-500 animate-pulse rounded-sm"></span>
                        </span>
                   )}
                   
                   {(chapter.isGenerating || isAiWriting) && !streamingContent && (
                      <div className="flex flex-col items-center justify-center py-12 space-y-4 opacity-70">
                          <div className="relative">
                             <div className="w-12 h-12 rounded-full border-4 border-indigo-100 animate-pulse"></div>
                             <Loader2 className="w-6 h-6 animate-spin text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                          </div>
                          <p className="text-sm font-medium text-indigo-400 animate-pulse">
                              AI 正在构思中...
                          </p>
                      </div>
                   )}
                   <div ref={contentEndRef} />
                </div>
             ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-6">
                   <div className="p-6 rounded-full bg-gray-100/50">
                      <Sparkles size={48} className="opacity-40" />
                   </div>
                   <div className="text-center">
                       <h3 className="text-lg font-bold text-gray-600 mb-1">本章暂无内容</h3>
                       <p className="text-sm opacity-70">配置生成参数并开始创作</p>
                   </div>
                   
                   {/* Target Word Count Setting - Empty State */}
                   <div className="bg-gray-50 border border-gray-200 p-3 rounded-lg flex items-center gap-3">
                       <Target size={18} className="text-indigo-500"/>
                       <span className="text-sm font-medium text-gray-600">目标字数:</span>
                       <input 
                           type="number"
                           min="500"
                           step="100"
                           value={chapter.targetWordCount || settings.targetChapterWordCount || 3000}
                           onChange={(e) => handleTargetChange(parseInt(e.target.value))}
                           className="w-24 p-1.5 border border-gray-300 rounded text-center text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                       />
                       <span className="text-xs text-gray-400">字</span>
                   </div>

                   <button 
                      onClick={onGenerate}
                      className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-500/25 font-medium flex items-center gap-2"
                   >
                      <Sparkles size={16} />
                      <span>生成章节内容</span>
                   </button>
                </div>
             )}
           </div>
        )}
      </div>

      {isDirectoryOpen && (
          <div className="absolute inset-0 z-50 flex animate-in fade-in duration-200">
              <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsDirectoryOpen(false)}></div>
              
              <div className="relative w-80 bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-200 border-r border-gray-100">
                   <div className="p-4 border-b flex justify-between items-center bg-gray-50/50">
                       <h3 className="font-bold text-gray-800 flex items-center gap-2"><BookOpen size={18} className="text-indigo-600"/> 目录</h3>
                       <button onClick={() => setIsDirectoryOpen(false)} className="p-1.5 hover:bg-gray-200 rounded-full text-gray-500"><X size={18}/></button>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto p-2" ref={directoryScrollRef}>
                       {volumeGroups.map(group => (
                           <div key={group.volumeId} className="mb-2">
                               {volumeGroups.length > 1 && (
                                   <div 
                                       className="px-3 py-2 text-xs font-bold text-gray-500 flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded"
                                       onClick={() => toggleVolume(group.volumeId)}
                                   >
                                       {expandedVolumes[group.volumeId] ? <FolderOpen size={14}/> : <Folder size={14}/>}
                                       <span className="truncate">{group.volumeTitle}</span>
                                   </div>
                               )}
                               
                               {(volumeGroups.length === 1 || expandedVolumes[group.volumeId]) && (
                                   <div className="space-y-0.5 mt-1 ml-1">
                                       {group.chapters.map(c => (
                                           <div
                                               id={`reader-chapter-${c.id}`}
                                               key={c.id}
                                               onClick={() => {
                                                   onChapterSelect && onChapterSelect(c.id);
                                                   setIsDirectoryOpen(false);
                                               }}
                                               className={`px-4 py-2.5 rounded-lg text-sm cursor-pointer truncate transition-colors flex items-center gap-3 ${
                                                   chapter.id === c.id 
                                                   ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100' 
                                                   : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent'
                                               }`}
                                           >
                                               <span className={`w-2 h-2 rounded-full shrink-0 ${c.isDone ? 'bg-green-400' : 'bg-gray-300'}`}></span>
                                               <span className="opacity-50 text-xs w-6 text-right shrink-0">{c.id}.</span>
                                               <span className="truncate flex-1">{c.title}</span>
                                           </div>
                                       ))}
                                   </div>
                               )}
                           </div>
                       ))}
                   </div>
              </div>
          </div>
      )}

      <GrammarReport 
        isOpen={showGrammarReport}
        onClose={() => setShowGrammarReport(false)}
        issues={grammarIssues}
        onAutoFix={handleAutoFixGrammar}
        isFixing={isFixingGrammar}
      />

      {/* Simple Pacing Analysis Modal */}
      {showPacingModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold flex items-center gap-2 text-indigo-600"><Activity size={18}/> 节奏与张力分析 (Pacing & Tension)</h3>
                      <button onClick={() => setShowPacingModal(false)}><X size={18} className="text-gray-400 hover:text-gray-600"/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto bg-gray-50 p-4 rounded text-sm text-gray-700 whitespace-pre-wrap">
                      {isAnalyzingPacing ? (
                          <div className="flex items-center justify-center h-40">
                              <Loader2 className="animate-spin text-indigo-500 w-8 h-8"/>
                          </div>
                      ) : (
                          pacingReport || "暂无分析结果。"
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default Reader;
