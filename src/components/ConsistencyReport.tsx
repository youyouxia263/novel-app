
import React, { useState } from 'react';
import { Chapter, Character, NovelSettings } from '../types';
import { X, CheckCircle2, AlertTriangle, FileSearch, Wrench, Loader2, GitCommit, Scroll, Activity } from 'lucide-react';
import { analyzeNovelCoherence } from '../services/geminiService';

interface ConsistencyReportProps {
  chapters: Chapter[];
  characters?: Character[];
  settings?: NovelSettings;
  isOpen: boolean;
  onClose: () => void;
  onFixConsistency?: (chapterId: number) => void;
  globalReport?: string | null;
  onUpdateGlobalReport?: (report: string) => void;
}

const ConsistencyReport: React.FC<ConsistencyReportProps> = ({ 
    chapters, characters, settings, isOpen, onClose, onFixConsistency,
    globalReport, onUpdateGlobalReport 
}) => {
  const [activeTab, setActiveTab] = useState<'chapters' | 'global'>('chapters');
  const [isAnalyzingGlobal, setIsAnalyzingGlobal] = useState(false);

  if (!isOpen) return null;

  const chaptersWithIssues = chapters.filter(c => c.consistencyAnalysis && c.consistencyAnalysis !== "Consistent" && !c.consistencyAnalysis.startsWith("Fixed"));
  const consistentChapters = chapters.filter(c => c.consistencyAnalysis === "Consistent" || c.consistencyAnalysis?.startsWith("Fixed"));
  const uncheckedChapters = chapters.filter(c => !c.consistencyAnalysis && c.isDone);

  const hasIssues = chaptersWithIssues.length > 0;

  const handleAnalyzeGlobal = async () => {
      if (!settings || !characters || !onUpdateGlobalReport) return;
      setIsAnalyzingGlobal(true);
      try {
          const report = await analyzeNovelCoherence(chapters, characters, settings);
          onUpdateGlobalReport(report);
      } catch (e: any) {
          onUpdateGlobalReport("Analysis Error: " + e.message);
      } finally {
          setIsAnalyzingGlobal(false);
      }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200 border border-gray-100">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-100 p-2 rounded-lg">
                <FileSearch className="w-5 h-5 text-indigo-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">一致性与连贯性校验</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 border-b border-gray-100">
            <button 
                onClick={() => setActiveTab('chapters')}
                className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 ${activeTab === 'chapters' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                <GitCommit size={16} /> 单章检查 (Chapters)
            </button>
            <button 
                onClick={() => setActiveTab('global')}
                className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 ${activeTab === 'global' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
                <Activity size={16} /> 宏观连贯性 (Global Coherence)
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
           
           {activeTab === 'chapters' && (
               <>
                {/* Summary Status */}
                <div className={`p-4 rounded-lg border flex items-start space-x-3 mb-6 ${hasIssues ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                        {hasIssues ? <AlertTriangle className="text-orange-500 shrink-0 mt-0.5" /> : <CheckCircle2 className="text-green-500 shrink-0 mt-0.5" />}
                        <div>
                            <h4 className={`font-bold text-sm ${hasIssues ? 'text-orange-800' : 'text-green-800'}`}>
                                {hasIssues ? `发现 ${chaptersWithIssues.length} 个章节存在潜在问题` : "未发现明显的单章问题"}
                            </h4>
                            <p className={`text-xs mt-1 ${hasIssues ? 'text-orange-600' : 'text-green-600'}`}>
                                {hasIssues 
                                ? "请检查下列章节的详细报告，或使用 'AI 修复' 功能。" 
                                : "所有已检查的章节在角色行为和关系上似乎保持一致。"}
                            </p>
                        </div>
                </div>

                {/* Issues List */}
                {hasIssues ? (
                    <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">详细问题</h4>
                        {chaptersWithIssues.map(chapter => (
                            <div key={chapter.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                                <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-50">
                                    <span className="font-bold text-gray-800 text-sm">第 {chapter.id} 章: {chapter.title}</span>
                                    
                                    {onFixConsistency && (
                                        <button 
                                            onClick={() => onFixConsistency(chapter.id)}
                                            disabled={chapter.isGenerating}
                                            className="flex items-center space-x-1 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-medium rounded-full transition-colors disabled:opacity-50"
                                        >
                                            {chapter.isGenerating ? <Loader2 size={12} className="animate-spin"/> : <Wrench size={12} />}
                                            <span>{chapter.isGenerating ? "修复中..." : "AI 自动修复"}</span>
                                        </button>
                                    )}
                                </div>
                                <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                                    {chapter.consistencyAnalysis}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 text-gray-400">暂无需要处理的章节问题。</div>
                )}

                {/* Stats Footer */}
                <div className="grid grid-cols-3 gap-4 pt-4 mt-6 border-t border-gray-200">
                    <div className="text-center">
                        <div className="text-lg font-bold text-gray-700">{chaptersWithIssues.length}</div>
                        <div className="text-[10px] text-gray-400 uppercase">问题</div>
                    </div>
                    <div className="text-center">
                        <div className="text-lg font-bold text-gray-700">{consistentChapters.length}</div>
                        <div className="text-[10px] text-gray-400 uppercase">通过/修复</div>
                    </div>
                    <div className="text-center">
                        <div className="text-lg font-bold text-gray-700">{uncheckedChapters.length}</div>
                        <div className="text-[10px] text-gray-400 uppercase">未检查</div>
                    </div>
                </div>
               </>
           )}

           {activeTab === 'global' && (
               <div className="h-full flex flex-col">
                   <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
                       <h4 className="font-bold text-blue-800 text-sm mb-2 flex items-center gap-2"><Scroll size={16}/> 宏观分析范围</h4>
                       <ul className="list-disc list-inside text-xs text-blue-700 space-y-1">
                           <li>情节漏洞与逻辑断层 (Plot Holes)</li>
                           <li>人物性格与能力发展的连贯性 (Character Consistency)</li>
                           <li>卷与卷之间的过渡 (Volume Transitions)</li>
                           <li>时间线合理性 (Timeline Logic)</li>
                       </ul>
                       <button 
                           onClick={handleAnalyzeGlobal}
                           disabled={isAnalyzingGlobal}
                           className="mt-4 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                       >
                           {isAnalyzingGlobal ? <Loader2 size={16} className="animate-spin"/> : <Activity size={16}/>}
                           <span>开始全书分析</span>
                       </button>
                   </div>

                   {globalReport ? (
                       <div className="flex-1 bg-white p-6 rounded-lg border border-gray-200 shadow-sm overflow-y-auto prose prose-sm max-w-none text-gray-700">
                           <div dangerouslySetInnerHTML={{ __html: globalReport.replace(/\n/g, '<br/>') }} />
                       </div>
                   ) : (
                       <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                           <Activity size={48} className="mb-4 opacity-20"/>
                           <p>点击上方按钮开始分析整部小说的连贯性。</p>
                       </div>
                   )}
               </div>
           )}

        </div>
      </div>
    </div>
  );
};

export default ConsistencyReport;
