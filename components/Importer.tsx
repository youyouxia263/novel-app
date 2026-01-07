
import React, { useState } from 'react';
import { Upload, FileText, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { NovelSettings, Chapter, Character } from '../types';
import { analyzeImportedNovel } from '../services/geminiService';

interface ImporterProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (settings: NovelSettings, chapters: Chapter[], characters: Character[]) => void;
    baseSettings: NovelSettings;
}

const Importer: React.FC<ImporterProps> = ({ isOpen, onClose, onImport, baseSettings }) => {
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [fileName, setFileName] = useState<string>("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [status, setStatus] = useState<string>("");

    if (!isOpen) return null;

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            setFileContent(text);
        };
        reader.readAsText(file);
    };

    const parseChapters = (text: string): Chapter[] => {
        // Robust Regex for various formats:
        // 1. 第X章 (Chinese Standard)
        // 2. Chapter X (English Standard)
        // 3. X. (Numeric list)
        // 4. 卷X (Volume - though we treat as chapter for now or need volume logic)
        // 5. 序章/前言 (Prologue)
        const chapterRegex = /(?:^\s*第[0-9一二三四五六七八九十百千]+[章卷].*|^Chapter\s+\d+.*|^\d+\.\s+.*|^[Pp]rologue.*|^序[章言].*)/gm;
        
        const matches = [...text.matchAll(chapterRegex)];
        const chapters: Chapter[] = [];
        
        if (matches.length === 0) {
            // No chapters found, treat as short story
            chapters.push({
                id: 1,
                title: "正文",
                content: text.trim(),
                summary: "导入的全文内容。",
                isGenerating: false,
                isDone: true,
                volumeId: 1
            });
            return chapters;
        }

        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const start = match.index! + match[0].length;
            const end = i < matches.length - 1 ? matches[i+1].index! : text.length;
            
            const title = match[0].trim();
            const content = text.substring(start, end).trim();
            
            // Basic validation to avoid empty chapters if regex matched noise
            if (!content && i < matches.length - 1) continue;

            chapters.push({
                id: chapters.length + 1,
                title: title,
                content: content,
                summary: "", // To be generated later
                isGenerating: false,
                isDone: true,
                volumeId: 1 // Default to volume 1 for imported content
            });
        }
        
        // If content exists before the first chapter (Prologue?), add it
        if (matches[0].index! > 0) {
            const preContent = text.substring(0, matches[0].index!).trim();
            if (preContent.length > 50) { // Filter out random header noise
                chapters.unshift({
                    id: 0,
                    title: "前言/序",
                    content: preContent,
                    summary: "前言内容",
                    isGenerating: false,
                    isDone: true,
                    volumeId: 1
                });
                // Re-index
                chapters.forEach((c, idx) => c.id = idx + 1);
            }
        }

        return chapters;
    };

    const handleRunImport = async () => {
        if (!fileContent) return;
        setIsAnalyzing(true);
        setStatus("正在解析章节结构...");

        try {
            const chapters = parseChapters(fileContent);
            
            if (chapters.length === 0) {
                throw new Error("无法解析章节，请检查文本格式。");
            }

            setStatus(`识别到 ${chapters.length} 个章节。正在分析内容概要...`);

            // Use first 3 chapters (max 10k chars) for context
            const analysisContext = chapters.slice(0, 3).map(c => c.content).join('\n\n').slice(0, 10000);
            
            let metadata;
            try {
                metadata = await analyzeImportedNovel(analysisContext, baseSettings);
            } catch (err) {
                console.warn("AI Analysis failed, falling back to defaults", err);
                metadata = {
                    title: fileName.replace(/\.txt$/i, ''),
                    premise: "导入的小说。",
                    mainCategory: "其他",
                    worldSetting: "",
                    characters: []
                };
            }
            
            const newSettings: NovelSettings = {
                ...baseSettings,
                title: metadata.title || fileName.replace(/\.txt$/i, ''),
                premise: metadata.premise || "导入的小说",
                mainCategory: metadata.mainCategory || "其他",
                worldSetting: metadata.worldSetting,
                mainCharacters: metadata.characters.map(c => `${c.name} (${c.role})`).join(', '),
                novelType: chapters.length > 10 ? 'long' : 'short',
                chapterCount: chapters.length,
                // Preserve existing provider config
                provider: baseSettings.provider,
                apiKey: baseSettings.apiKey,
                modelName: baseSettings.modelName
            };

            onImport(newSettings, chapters, metadata.characters);
            onClose();

        } catch (e: any) {
            setStatus("错误: " + e.message);
            console.error(e);
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Upload className="text-indigo-600"/> 导入小说
                </h2>
                
                {!fileContent ? (
                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors relative">
                        <input 
                            type="file" 
                            accept=".txt" 
                            onChange={handleFileUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                            id="file-upload"
                        />
                        <div className="pointer-events-none">
                            <FileText size={48} className="text-gray-400 mb-2 mx-auto"/>
                            <span className="text-sm font-medium text-gray-700 block">点击上传 .txt 文件</span>
                            <span className="text-xs text-gray-500 mt-1 block">支持 "第X章", "Chapter X" 等格式</span>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-lg">
                            <Check size={20} className="text-green-600"/>
                            <div className="overflow-hidden flex-1">
                                <p className="text-sm font-medium text-green-800 truncate">{fileName}</p>
                                <p className="text-xs text-green-600">已加载 {Math.round(fileContent.length / 1024)} KB</p>
                            </div>
                            <button onClick={() => setFileContent(null)} className="text-xs text-gray-500 underline hover:text-gray-800">重选</button>
                        </div>

                        {status && (
                            <div className="text-sm text-indigo-600 flex items-center gap-2 bg-indigo-50 p-2 rounded">
                                {isAnalyzing && <Loader2 size={14} className="animate-spin"/>}
                                {status}
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button onClick={onClose} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
                                取消
                            </button>
                            <button 
                                onClick={handleRunImport}
                                disabled={isAnalyzing}
                                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isAnalyzing ? '处理中...' : '开始导入'}
                            </button>
                        </div>
                    </div>
                )}
                
                <div className="mt-4 p-3 bg-orange-50 border border-orange-100 rounded-lg flex gap-2 items-start">
                    <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5"/>
                    <p className="text-xs text-orange-700 leading-relaxed">
                        系统将尝试自动识别章节结构。如果无法识别，将作为单章导入。
                        导入后，AI 会自动分析内容以提取角色和世界观。
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Importer;
