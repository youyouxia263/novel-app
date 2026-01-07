
import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Book, Trash2, FileText, Layout, Settings, Cpu, MessageSquareQuote, ChevronDown, ChevronRight, Database, Globe, Upload, Download, Folder, FolderOpen, Copy, Check } from 'lucide-react';
import { NovelSettings, Chapter } from '../types';

interface SavedNovel {
  id: string;
  title: string;
  updatedAt: Date;
}

export type ViewType = 'workspace' | 'settings-model' | 'settings-prompt' | 'settings-storage' | 'settings-language';

interface AppSidebarProps {
  novels: SavedNovel[];
  currentNovelId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  settings: NovelSettings;
  onSettingsChange: (settings: NovelSettings) => void;
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  onImport?: () => void;
  onExport?: () => void;
  chapters?: Chapter[];
  currentChapterId?: number | null;
  onChapterSelect?: (id: number) => void;
}

interface VolumeGroup {
    volumeId: number;
    volumeTitle: string;
    chapters: Chapter[];
}

const AppSidebar: React.FC<AppSidebarProps> = ({ 
    novels, currentNovelId, onSelect, onCreate, onDelete, 
    settings, onSettingsChange, currentView, onNavigate, onImport, onExport,
    chapters = [], currentChapterId, onChapterSelect
}) => {
  const [isLibraryExpanded, setIsLibraryExpanded] = useState(true);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [expandedVolumes, setExpandedVolumes] = useState<Record<number, boolean>>({});
  const [copiedSummaryId, setCopiedSummaryId] = useState<number | null>(null);

  // Auto-expand library if not open, to show the active book
  useEffect(() => {
      if (currentNovelId && !isLibraryExpanded) {
          setIsLibraryExpanded(true);
      }
  }, [currentNovelId]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(date);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      onDelete(id);
  };

  const handleCopySummary = (e: React.MouseEvent, chapter: Chapter) => {
      e.stopPropagation();
      if (!chapter.summary) return;
      navigator.clipboard.writeText(chapter.summary);
      setCopiedSummaryId(chapter.id);
      setTimeout(() => setCopiedSummaryId(null), 2000);
  };

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

  // Auto-expand the volume containing the current chapter
  useEffect(() => {
      if (currentChapterId) {
          const group = volumeGroups.find(g => g.chapters.some(c => c.id === currentChapterId));
          if (group) {
              setExpandedVolumes(prev => ({...prev, [group.volumeId]: true}));
          }
      } else if (volumeGroups.length > 0 && Object.keys(expandedVolumes).length === 0) {
          // Default expand first volume if nothing expanded
          setExpandedVolumes(prev => ({...prev, [volumeGroups[0].volumeId]: true}));
      }
  }, [currentChapterId, volumeGroups.length]);

  const toggleVolume = (vid: number, e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedVolumes(prev => ({...prev, [vid]: !prev[vid]}));
  };

  const renderChapterList = () => (
      <div className="mt-1 ml-3 pl-2 border-l border-gray-700 animate-in slide-in-from-top-1">
        {volumeGroups.map(group => (
            <div key={group.volumeId} className="mb-1">
                {volumeGroups.length > 1 && (
                    <div 
                        className="px-2 py-1 text-[10px] font-bold text-gray-500 flex items-center gap-1 cursor-pointer hover:text-gray-300 uppercase tracking-wide select-none"
                        onClick={(e) => toggleVolume(group.volumeId, e)}
                    >
                        {expandedVolumes[group.volumeId] ? <FolderOpen size={10}/> : <Folder size={10}/>}
                        <span className="truncate">{group.volumeTitle}</span>
                    </div>
                )}
                
                {(volumeGroups.length === 1 || expandedVolumes[group.volumeId]) && (
                    <div className="space-y-0.5 ml-1">
                        {group.chapters.map(chapter => (
                            <div
                                key={chapter.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChapterSelect && onChapterSelect(chapter.id);
                                }}
                                className={`group px-3 py-1.5 rounded-md text-xs cursor-pointer truncate transition-colors flex items-center gap-2 relative pr-7 ${
                                    currentChapterId === chapter.id 
                                    ? 'bg-indigo-900/30 text-indigo-200 font-medium' 
                                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                                }`}
                                title={chapter.title}
                            >
                                <span className="opacity-50 w-4 text-right shrink-0">{chapter.id}.</span>
                                <span className="truncate flex-1">{chapter.title}</span>
                                
                                {chapter.summary && (
                                    <button
                                        onClick={(e) => handleCopySummary(e, chapter)}
                                        className={`absolute right-1 p-1 rounded transition-all hover:bg-gray-700 hover:text-white ${
                                            copiedSummaryId === chapter.id ? 'opacity-100 text-green-400' : 'opacity-0 group-hover:opacity-100 text-gray-500'
                                        }`}
                                        title="复制摘要"
                                    >
                                        {copiedSummaryId === chapter.id ? <Check size={10} /> : <Copy size={10} />}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        ))}
    </div>
  );

  // Check if current novel is in the list (might not be if unsaved/newly imported and list not refreshed)
  const isCurrentNovelInList = novels.some(n => n.id === currentNovelId);

  return (
    <div className="w-64 bg-gray-900 text-gray-300 flex flex-col h-full border-r border-gray-800 shrink-0 transition-all duration-300 font-sans">
      {/* Branding */}
      <div className="p-4 flex items-center space-x-2 text-white border-b border-gray-800">
        <Layout className="w-6 h-6 text-indigo-500" />
        <span className="font-serif font-bold text-lg tracking-wide">DreamWeaver</span>
      </div>

      {/* Primary Actions */}
      <div className="p-4 space-y-2">
        <button
          onClick={() => {
              onNavigate('workspace');
              onCreate();
          }}
          className="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg transition-all shadow-lg hover:shadow-indigo-500/25 font-medium text-sm group"
        >
          <Plus size={18} className="group-hover:rotate-90 transition-transform duration-200" />
          <span>新建作品</span>
        </button>
        <div className="grid grid-cols-2 gap-2">
            {onImport && (
                <button
                onClick={onImport}
                className="flex items-center justify-center space-x-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg transition-all border border-gray-700 font-medium text-xs group"
                title="导入小说"
                >
                <Upload size={14} />
                <span>导入</span>
                </button>
            )}
            {currentNovelId && onExport && (
                <button
                onClick={onExport}
                className="flex items-center justify-center space-x-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg transition-all border border-gray-700 font-medium text-xs group"
                title="导出小说"
                >
                <Download size={14} />
                <span>导出</span>
                </button>
            )}
        </div>
      </div>

      {/* Library Section */}
      <div 
        className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-gray-300 transition-colors select-none"
        onClick={() => setIsLibraryExpanded(!isLibraryExpanded)}
      >
        <div className="flex items-center space-x-2">
            <Book size={12} />
            <span>书架 (Library)</span>
        </div>
        {isLibraryExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </div>

      {isLibraryExpanded && (
        <div className="flex-1 overflow-y-auto px-2 space-y-1 pb-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent min-h-[100px]">
            {/* If current novel is not in saved list (e.g. just imported but list stale), show it at top temporarily */}
            {!isCurrentNovelInList && currentNovelId && chapters.length > 0 && (
                 <div className="flex flex-col mb-1">
                    <div className="group flex items-center justify-between p-2.5 rounded-lg cursor-pointer bg-gray-800 text-white shadow-sm ring-1 ring-gray-700">
                        <div className="flex items-center space-x-3 overflow-hidden">
                            <FileText size={16} className="shrink-0 text-indigo-400" />
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium truncate">{settings.title || "未命名 (当前)"}</span>
                                <span className="text-[10px] text-gray-500 truncate">Just Now</span>
                            </div>
                        </div>
                    </div>
                    {renderChapterList()}
                 </div>
            )}

            {novels.length === 0 && !currentNovelId ? (
                <div className="text-center py-8 px-4 text-gray-600 text-xs">
                    <p>暂无作品</p>
                    <p>点击上方按钮开始创作</p>
                </div>
            ) : (
            novels.map((novel) => {
                const isActive = currentView === 'workspace' && currentNovelId === novel.id;
                
                return (
                    <div key={novel.id} className="flex flex-col">
                        <div
                            className={`group flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all duration-200 relative ${
                                isActive
                                ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700'
                                : 'hover:bg-gray-800/50 hover:text-gray-100'
                            }`}
                            onClick={() => {
                                onNavigate('workspace');
                                onSelect(novel.id);
                            }}
                        >
                            <div className="flex items-center space-x-3 overflow-hidden">
                                <FileText size={16} className={`shrink-0 ${isActive ? 'text-indigo-400' : 'text-gray-600 group-hover:text-gray-400'}`} />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-medium truncate">{novel.title || "未命名"}</span>
                                    <span className="text-[10px] text-gray-500 truncate">{formatDate(novel.updatedAt)}</span>
                                </div>
                            </div>
                            
                            <button
                                onClick={(e) => handleDeleteClick(e, novel.id)}
                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded transition-all z-10 relative"
                                title="删除"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>

                        {/* Inline Chapter List - Only show for active novel if chapters exist */}
                        {isActive && chapters.length > 0 && renderChapterList()}
                    </div>
                );
            })
            )}
        </div>
      )}
      
      {!isLibraryExpanded && <div className="flex-1"></div>}

      <div className="my-2 border-t border-gray-800 mx-4"></div>

      {/* Settings Section */}
      <div 
        className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between cursor-pointer hover:text-gray-300 transition-colors select-none"
        onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
      >
        <div className="flex items-center space-x-2">
            <Settings size={12} />
            <span>设置</span>
        </div>
        {isSettingsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </div>

      {isSettingsExpanded && (
          <div className="px-2 space-y-1 pb-4 animate-in slide-in-from-top-2 duration-200">
             <button
                onClick={() => onNavigate('settings-model')}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentView === 'settings-model'
                    ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700' 
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                }`}
             >
                 <Cpu size={16} />
                 <span>模型配置</span>
             </button>

             <button
                onClick={() => onNavigate('settings-prompt')}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentView === 'settings-prompt'
                    ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700' 
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                }`}
             >
                 <MessageSquareQuote size={16} />
                 <span>提示词配置</span>
             </button>

             <button
                onClick={() => onNavigate('settings-storage')}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentView === 'settings-storage'
                    ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700' 
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                }`}
             >
                 <Database size={16} />
                 <span>持久化存储</span>
             </button>

             <button
                onClick={() => onNavigate('settings-language')}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    currentView === 'settings-language'
                    ? 'bg-gray-800 text-white shadow-sm ring-1 ring-gray-700' 
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                }`}
             >
                 <Globe size={16} />
                 <span>中英文配置</span>
             </button>
          </div>
      )}
      
      {/* Footer Info */}
      <div className="p-4 border-t border-gray-800 text-[10px] text-gray-600 text-center flex justify-between items-center">
         <span>v1.5.4</span>
         <span className="flex items-center gap-1 opacity-50">Fix Navigation</span>
      </div>
    </div>
  );
};

export default AppSidebar;
