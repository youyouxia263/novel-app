
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
        // Simple regex for Chinese chapters "第X章" or "Chapter X"
        const chapterRegex = /(?:第[0-9一二三四五六七八九十百]+章|Chapter\s+\d+).*?(?=\n|$)/g;
        const matches = [...text.matchAll(chapterRegex)];
        
        const chapters: Chapter[] = [];
        
        if (matches.length === 0) {
            // Treat as short story / single chapter if no headers found
            chapters.push({
                id: 1,
                title: "Imported Content",
                content: text,
                summary: "Imported full text.",
                isGenerating: false,
                isDone: true
            });
            return chapters;
        }

        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index!;
            const end = i < matches.length - 1 ? matches[i+1].index! : text.length;
            const titleLine = matches[i][0];
            const content = text.substring(start + titleLine.length, end).trim();
            
            chapters.push({
                id: i + 1,
                title: titleLine.trim(),
                content: content,
                summary: "", // To be generated later or lazily
                isGenerating: false,
                isDone: true
            });
        }
        return chapters;
    };

    const handleRunImport = async () => {
        if (!fileContent) return;
        setIsAnalyzing(true);
        setStatus("Parsing structure...");

        try {
            const chapters = parseChapters(fileContent);
            setStatus(`Identified ${chapters.length} chapters. Analyzing content with AI...`);

            // Use first 2-3 chapters for analysis to save tokens, or 15k chars
            const analysisContext = chapters.slice(0, 3).map(c => c.content).join('\n\n').slice(0, 15000);
            
            const metadata = await analyzeImportedNovel(analysisContext, baseSettings);
            
            const newSettings: NovelSettings = {
                ...baseSettings,
                title: metadata.title || fileName.replace('.txt', ''),
                premise: metadata.premise,
                mainCategory: metadata.mainCategory,
                worldSetting: metadata.worldSetting,
                mainCharacters: metadata.characters.map(c => `${c.name}: ${c.role}`).join(', '),
                novelType: chapters.length > 5 ? 'long' : 'short',
                chapterCount: chapters.length
            };

            onImport(newSettings, chapters, metadata.characters);
            onClose();

        } catch (e: any) {
            setStatus("Error: " + e.message);
            console.error(e);
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Upload className="text-indigo-600"/> Import Novel
                </h2>
                
                {!fileContent ? (
                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors">
                        <input 
                            type="file" 
                            accept=".txt" 
                            onChange={handleFileUpload}
                            className="hidden" 
                            id="file-upload"
                        />
                        <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                            <FileText size={48} className="text-gray-400 mb-2"/>
                            <span className="text-sm font-medium text-gray-700">Click to upload .txt file</span>
                            <span className="text-xs text-gray-500 mt-1">Supports standard chapter formatting (第X章)</span>
                        </label>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-lg">
                            <Check size={20} className="text-green-600"/>
                            <div className="overflow-hidden">
                                <p className="text-sm font-medium text-green-800 truncate">{fileName}</p>
                                <p className="text-xs text-green-600">{Math.round(fileContent.length / 1024)} KB loaded</p>
                            </div>
                        </div>

                        {status && (
                            <div className="text-sm text-indigo-600 flex items-center gap-2">
                                {isAnalyzing && <Loader2 size={14} className="animate-spin"/>}
                                {status}
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setFileContent(null)} className="flex-1 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
                                Cancel
                            </button>
                            <button 
                                onClick={handleRunImport}
                                disabled={isAnalyzing}
                                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isAnalyzing ? 'Analyzing...' : 'Analyze & Import'}
                            </button>
                        </div>
                    </div>
                )}
                
                <div className="mt-4 p-3 bg-orange-50 border border-orange-100 rounded-lg flex gap-2 items-start">
                    <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5"/>
                    <p className="text-xs text-orange-700">
                        AI will read the first few chapters to reverse-engineer your settings, characters, and world view. This may take a moment.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Importer;
