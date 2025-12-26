import React, { useState } from 'react';
import { NovelSettings, Genre, Language } from '../types';
import { BookOpen, PenTool, Sparkles, Globe, Wand2, Loader2 } from 'lucide-react';
import { generatePremise } from '../services/geminiService';

interface SettingsFormProps {
  settings: NovelSettings;
  onSettingsChange: (settings: NovelSettings) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

const GENRE_LABELS: Record<Genre, string> = {
  [Genre.Suspense]: '悬疑 (Suspense)',
  [Genre.Romance]: '言情 (Romance)',
  [Genre.Thriller]: '惊悚 (Thriller)',
  [Genre.Mystery]: '推理 (Mystery)',
  [Genre.Fantasy]: '玄幻 (Fantasy)',
  [Genre.SciFi]: '科幻 (Sci-Fi)',
};

const SettingsForm: React.FC<SettingsFormProps> = ({ settings, onSettingsChange, onSubmit, isLoading }) => {
  const [isGeneratingPremise, setIsGeneratingPremise] = useState(false);
  
  const handleChange = (field: keyof NovelSettings, value: string | number) => {
    onSettingsChange({ ...settings, [field]: value });
  };

  const handleAiGeneratePremise = async () => {
    if (!settings.title && !settings.premise) {
        // A minimal shake animation or alert could go here, for now just simple alert
        alert("请至少输入标题或一些想法 (Please enter a title or some ideas first)");
        return;
    }

    setIsGeneratingPremise(true);
    try {
        const result = await generatePremise(
            settings.title, 
            settings.premise, 
            settings.genre, 
            settings.language
        );
        handleChange('premise', result);
    } catch (error) {
        console.error(error);
        alert("无法生成概要，请稍后重试。");
    } finally {
        setIsGeneratingPremise(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-xl shadow-sm border border-gray-200 mt-10">
      <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-gray-100">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <BookOpen className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">开始创作 (Start Your Novel)</h2>
          <p className="text-sm text-gray-500">定义基本设定以生成小说大纲</p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">小说标题 (Title)</label>
          <input
            type="text"
            value={settings.title}
            onChange={(e) => handleChange('title', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
            placeholder="例如：沉默的回声"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-medium text-gray-700">故事梗概 / 核心创意 (Premise)</label>
            <button
                onClick={handleAiGeneratePremise}
                disabled={isGeneratingPremise || isLoading}
                className="text-xs flex items-center space-x-1 text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={settings.premise ? "Expand existing idea" : "Generate from title"}
            >
                {isGeneratingPremise ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                <span>{settings.premise ? "AI 润色/扩充 (AI Refine)" : "AI 自动生成 (Auto Generate)"}</span>
            </button>
          </div>
          <textarea
            value={settings.premise}
            onChange={(e) => handleChange('premise', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors min-h-[120px]"
            placeholder="简要描述你的故事内容，或点击上方 AI 按钮自动生成..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">类型 (Genre)</label>
            <div className="relative">
              <select
                value={settings.genre}
                onChange={(e) => handleChange('genre', e.target.value as Genre)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none appearance-none bg-white"
              >
                {Object.values(Genre).map((g) => (
                  <option key={g} value={g}>{GENRE_LABELS[g]}</option>
                ))}
              </select>
              <Sparkles className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">写作语言 (Language)</label>
             <div className="relative">
                <select
                  value={settings.language}
                  onChange={(e) => handleChange('language', e.target.value as Language)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none appearance-none bg-white"
                >
                  <option value="zh">中文 (Chinese)</option>
                  <option value="en">English</option>
                </select>
                <Globe className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
           <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">章节数量 (Chapters)</label>
             <input
              type="number"
              min={3}
              max={50}
              value={settings.chapterCount}
              onChange={(e) => handleChange('chapterCount', parseInt(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
             />
          </div>
          
          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">目标总字数 (Target Words)</label>
             <div className="relative">
               <input
                type="number"
                step={1000}
                value={settings.targetWordCount}
                onChange={(e) => handleChange('targetWordCount', parseInt(e.target.value))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
               />
               <span className="absolute right-4 top-2 text-gray-400 text-sm">字</span>
             </div>
          </div>
        </div>
        <p className="text-xs text-gray-500">默认设置为 3000 字 (短篇小说)</p>

        <div className="pt-4">
          <button
            onClick={onSubmit}
            disabled={isLoading || !settings.title || !settings.premise}
            className={`w-full flex items-center justify-center space-x-2 py-3 rounded-lg text-white font-medium transition-all ${
              isLoading || !settings.title || !settings.premise
                ? 'bg-indigo-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-md hover:shadow-lg'
            }`}
          >
            {isLoading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                正在生成大纲...
              </span>
            ) : (
              <>
                <PenTool className="w-5 h-5" />
                <span>生成大纲</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsForm;