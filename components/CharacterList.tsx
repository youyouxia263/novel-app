
import React from 'react';
import { Character, NovelSettings, Chapter, PersonalityTraits } from '../types';
import { Users, X, Copy, Download, Check, Edit2, Save, Plus, Trash2, Sparkles, Loader2, Network, Clock, Image as ImageIcon, Brain, TrendingUp, UserCog, Book, GitBranch } from 'lucide-react';
import { useState, useEffect } from 'react';
import { generateSingleCharacter, generateCharacterImage, analyzeCharacterDepth } from '../services/geminiService';

interface CharacterListProps {
  characters: Character[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateCharacters?: (characters: Character[]) => void;
  settings?: NovelSettings;
  chapters?: Chapter[];
}

// Sub-component: Personality Radar (Simple Bars for now to avoid external charts libs)
const PersonalityBars: React.FC<{ traits?: PersonalityTraits }> = ({ traits }) => {
    if (!traits) return null;
    const items = [
        { label: '开放性 (Openness)', val: traits.openness, color: 'bg-blue-500' },
        { label: '尽责性 (Conscientiousness)', val: traits.conscientiousness, color: 'bg-green-500' },
        { label: '外向性 (Extraversion)', val: traits.extraversion, color: 'bg-yellow-500' },
        { label: '宜人性 (Agreeableness)', val: traits.agreeableness, color: 'bg-pink-500' },
        { label: '神经质 (Neuroticism)', val: traits.neuroticism, color: 'bg-red-500' },
    ];

    return (
        <div className="space-y-1 mt-2 bg-slate-50 p-2 rounded border border-slate-100">
            {items.map(item => (
                <div key={item.label} className="flex items-center text-[10px] gap-2">
                    <span className="w-28 text-gray-500 truncate">{item.label}</span>
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color}`} style={{ width: `${item.val}%` }}></div>
                    </div>
                    <span className="w-6 text-right text-gray-600">{item.val}</span>
                </div>
            ))}
        </div>
    );
};

// Sub-component: Relationship Graph (Simple Visualization)
const CharacterNetwork: React.FC<{ characters: Character[] }> = ({ characters }) => {
    const radius = 120;
    const centerX = 200;
    const centerY = 160;
    
    const nodes = characters.map((char, i) => {
        const angle = (i / characters.length) * 2 * Math.PI;
        return {
            ...char,
            x: centerX + radius * Math.cos(angle),
            y: centerY + radius * Math.sin(angle)
        };
    });

    const lines: React.ReactElement[] = [];
    nodes.forEach((node, i) => {
        nodes.forEach((target, j) => {
            if (i >= j) return;
            if (node.relationships.includes(target.name) || target.relationships.includes(node.name)) {
                lines.push(
                    <line 
                        key={`${i}-${j}`} 
                        x1={node.x} y1={node.y} 
                        x2={target.x} y2={target.y} 
                        stroke="#e2e8f0" 
                        strokeWidth="1" 
                    />
                );
            }
        });
    });

    return (
        <div className="flex items-center justify-center h-full w-full overflow-auto p-4">
            <svg width="400" height="320" viewBox="0 0 400 320" className="w-full h-full max-w-[500px]">
                {lines}
                {nodes.map((node, i) => (
                    <g key={i} className="group cursor-pointer">
                        <circle cx={node.x} cy={node.y} r="20" fill="white" stroke="#6366f1" strokeWidth="2" className="group-hover:fill-indigo-50 transition-colors"/>
                        {node.imageUrl && (
                             <image href={node.imageUrl} x={node.x - 15} y={node.y - 15} height="30" width="30" clipPath="circle(15px at 15px 15px)" />
                        )}
                        <text x={node.x} y={node.y + 35} textAnchor="middle" fontSize="10" className="fill-gray-600 font-bold select-none">{node.name}</text>
                        <title>{node.role}: {node.relationships}</title>
                    </g>
                ))}
            </svg>
        </div>
    );
};

// Sub-component: Timeline (Mentions in Chapters)
const CharacterTimeline: React.FC<{ characters: Character[], chapters: Chapter[] }> = ({ characters, chapters }) => {
    return (
        <div className="space-y-6">
            {characters.map(char => {
                const mentions = chapters.filter(c => 
                    (c.summary && c.summary.includes(char.name)) || 
                    (c.content && c.content.includes(char.name))
                );
                
                if (mentions.length === 0) return null;

                return (
                    <div key={char.name} className="relative pl-4 border-l border-gray-200">
                        <div className="flex items-center gap-2 mb-2">
                            {char.imageUrl && <img src={char.imageUrl} className="w-6 h-6 rounded-full object-cover border border-gray-200" alt={char.name}/>}
                            <h4 className="font-bold text-sm text-gray-800">{char.name}</h4>
                        </div>
                        <div className="space-y-2">
                            {mentions.map(c => (
                                <div key={c.id} className="text-xs bg-gray-50 p-2 rounded border border-gray-100">
                                    <span className="font-semibold text-indigo-600">第 {c.id} 章: </span>
                                    <span className="text-gray-600 line-clamp-2">{c.summary || "提及于正文中。"}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
            {characters.every(char => !chapters.some(c => c.summary?.includes(char.name) || c.content?.includes(char.name))) && (
                <div className="text-center text-gray-400 py-10">暂未在已生成的内容中发现角色具体事件。</div>
            )}
        </div>
    );
}

const CharacterList: React.FC<CharacterListProps> = ({ characters, isOpen, onClose, onUpdateCharacters, settings, chapters = [] }) => {
  const [copied, setCopied] = useState(false);
  const [localCharacters, setLocalCharacters] = useState<Character[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Character>({ name: '', role: '', description: '', relationships: '', voiceGuide: '', arc: '', psychology: '', goals: '', backgroundStory: '', skills: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [analyzingIndex, setAnalyzingIndex] = useState<number | null>(null);
  const [generatingImageFor, setGeneratingImageFor] = useState<number | null>(null);
  
  const [viewMode, setViewMode] = useState<'profiles' | 'network' | 'timeline' | 'depth'>('profiles');

  useEffect(() => {
    setLocalCharacters(characters);
  }, [characters, isOpen]);

  if (!isOpen) return null;

  const handleCopyAll = async () => {
      const text = localCharacters.map(c => 
        `姓名: ${c.name}\n角色: ${c.role}\n描述: ${c.description}\n关系: ${c.relationships}\n`
      ).join('\n---\n\n');
      
      try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      } catch (err) {
          console.error("Failed to copy", err);
      }
  };

  const handleExportTxt = () => {
      const text = localCharacters.map(c => 
        `姓名: ${c.name}\n角色: ${c.role}\n描述: ${c.description}\n关系: ${c.relationships}\n`
      ).join('\n---\n\n');
      
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `角色档案.txt`;
      a.click();
      URL.revokeObjectURL(url);
  };

  const startEditing = (index: number) => {
      setEditingIndex(index);
      setEditForm({ ...localCharacters[index] });
  };

  const saveEditing = () => {
      if (editingIndex === null) return;
      const updated = [...localCharacters];
      updated[editingIndex] = editForm;
      setLocalCharacters(updated);
      if (onUpdateCharacters) onUpdateCharacters(updated);
      setEditingIndex(null);
  };

  const updateTrait = (trait: keyof PersonalityTraits, val: string) => {
      const num = parseInt(val);
      setEditForm(prev => ({
          ...prev,
          personalityTags: {
              ...(prev.personalityTags || { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 }),
              [trait]: num
          }
      }));
  };

  const addNewCharacter = () => {
      const newChar = { name: '新角色', role: '配角', description: '待补充...', relationships: '...' };
      const updated = [newChar, ...localCharacters];
      setLocalCharacters(updated);
      if (onUpdateCharacters) onUpdateCharacters(updated);
      setEditingIndex(0); 
      setEditForm(newChar);
      setViewMode('profiles');
  };

  const handleAiAddCharacter = async () => {
      if (!settings) return;
      setIsGenerating(true);
      try {
          const newChar = await generateSingleCharacter(settings, localCharacters);
          const updated = [newChar, ...localCharacters];
          setLocalCharacters(updated);
          if (onUpdateCharacters) onUpdateCharacters(updated);
          setViewMode('profiles');
      } catch (e) {
          console.error(e);
          alert("无法生成角色。");
      } finally {
          setIsGenerating(false);
      }
  };

  const handleGenerateImage = async (index: number) => {
      if (!settings) return;
      setGeneratingImageFor(index);
      try {
          const imageUrl = await generateCharacterImage(localCharacters[index], settings);
          const updated = [...localCharacters];
          updated[index] = { ...updated[index], imageUrl };
          setLocalCharacters(updated);
          if (onUpdateCharacters) onUpdateCharacters(updated);
      } catch (e: any) {
          console.error(e);
          alert("图像生成失败: " + e.message);
      } finally {
          setGeneratingImageFor(null);
      }
  };

  const handleAnalyzeDepth = async (index: number) => {
      if (!settings) return;
      setAnalyzingIndex(index);
      try {
          const analysis = await analyzeCharacterDepth(localCharacters[index], settings);
          const updated = [...localCharacters];
          updated[index] = { ...updated[index], psychology: analysis };
          setLocalCharacters(updated);
          if (onUpdateCharacters) onUpdateCharacters(updated);
      } catch (e: any) {
          console.error(e);
          alert("分析失败。");
      } finally {
          setAnalyzingIndex(null);
      }
  };

  const deleteCharacter = (index: number) => {
      if (!window.confirm("确定要删除这个角色吗？")) return;
      const updated = localCharacters.filter((_, i) => i !== index);
      setLocalCharacters(updated);
      if (onUpdateCharacters) onUpdateCharacters(updated);
      if (editingIndex === index) setEditingIndex(null);
  };

  const safeRender = (content: any) => {
      if (typeof content === 'string') return content;
      if (typeof content === 'object' && content !== null) {
          try {
              return Object.entries(content).map(([k, v]) => `${k}: ${v}`).join('; ');
          } catch (e) {
              return JSON.stringify(content);
          }
      }
      return String(content || '');
  };

  const getStorylineName = (id?: string) => {
      if (!id || !settings?.plotData?.storylines) return null;
      return settings.plotData.storylines.find(s => s.id === id)?.name;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-200 border border-gray-200">
        
        {/* Header */}
        <div className="flex flex-col border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
            <div className="flex items-center justify-between p-4 pb-2">
                <div className="flex items-center space-x-2 text-indigo-700">
                    <UserCog className="w-5 h-5" />
                    <h3 className="text-lg font-bold">人物设定与分析</h3>
                </div>
                <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-full text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            
            {/* Tabs */}
            <div className="flex items-center justify-between px-4 pb-0">
                <div className="flex space-x-1">
                    <button onClick={() => setViewMode('profiles')} className={`px-3 py-2 text-xs font-medium border-b-2 ${viewMode === 'profiles' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}><Users size={14} className="inline mr-1"/> 档案</button>
                    <button onClick={() => setViewMode('network')} className={`px-3 py-2 text-xs font-medium border-b-2 ${viewMode === 'network' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}><Network size={14} className="inline mr-1"/> 关系图</button>
                    <button onClick={() => setViewMode('timeline')} className={`px-3 py-2 text-xs font-medium border-b-2 ${viewMode === 'timeline' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}><Clock size={14} className="inline mr-1"/> 时间线</button>
                    <button onClick={() => setViewMode('depth')} className={`px-3 py-2 text-xs font-medium border-b-2 ${viewMode === 'depth' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}><Brain size={14} className="inline mr-1"/> 深度分析</button>
                </div>

                <div className="flex items-center space-x-2 pb-2">
                    {settings && (
                        <button onClick={handleAiAddCharacter} disabled={isGenerating} title="AI 生成角色" className="p-1.5 hover:bg-purple-50 rounded-lg text-purple-600 border border-purple-100">
                            {isGenerating ? <Loader2 size={16} className="animate-spin"/> : <Sparkles size={16} />}
                        </button>
                    )}
                    <button onClick={addNewCharacter} title="新建角色" className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-600 border border-indigo-100"><Plus size={16} /></button>
                    <div className="h-4 w-px bg-gray-200 mx-1"></div>
                    <button onClick={handleCopyAll} title="复制所有" className="p-1.5 hover:bg-gray-100 rounded text-gray-500">{copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}</button>
                    <button onClick={handleExportTxt} title="导出 TXT" className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><Download size={16} /></button>
                </div>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
          
          {localCharacters.length === 0 && (
            <div className="text-center py-10 text-gray-400">暂无人物数据</div>
          )}

          {/* PROFILES & DEPTH */}
          {(viewMode === 'profiles' || viewMode === 'depth') && localCharacters.map((char, index) => (
              <div key={index} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm mb-4 relative group">
                {editingIndex === index ? (
                    <div className="space-y-3">
                        <div className="flex gap-4">
                            <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center shrink-0 border border-dashed border-gray-300">
                                {char.imageUrl ? <img src={char.imageUrl} className="w-full h-full object-cover rounded-lg" /> : <ImageIcon className="text-gray-300" />}
                            </div>
                            <div className="flex-1 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">姓名 (Name)</label>
                                    <input value={safeRender(editForm.name)} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full text-sm border p-1 rounded" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">角色定位 (Role)</label>
                                    <input value={safeRender(editForm.role)} onChange={e => setEditForm({...editForm, role: e.target.value})} className="w-full text-sm border p-1 rounded" />
                                </div>
                            </div>
                        </div>
                        
                        <div><label className="block text-xs font-medium text-gray-500 mb-1">描述 (Description)</label><textarea value={safeRender(editForm.description)} onChange={e => setEditForm({...editForm, description: e.target.value})} className="w-full text-sm border p-1 rounded h-16" /></div>
                        
                        {/* Storyline Selector */}
                        {settings?.plotData?.storylines && (
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><GitBranch size={12}/> 关联故事线 (Storyline)</label>
                                <select 
                                    value={editForm.storylineId || ''} 
                                    onChange={e => setEditForm({...editForm, storylineId: e.target.value})}
                                    className="w-full text-sm border p-1 rounded bg-white"
                                >
                                    <option value="">-- 无特定故事线 --</option>
                                    {settings.plotData.storylines.map(sl => (
                                        <option key={sl.id} value={sl.id}>{sl.name} ({sl.type})</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                             <div><label className="block text-xs font-medium text-gray-500 mb-1">背景故事 (Background)</label><textarea value={safeRender(editForm.backgroundStory || '')} onChange={e => setEditForm({...editForm, backgroundStory: e.target.value})} className="w-full text-sm border p-1 rounded h-20" placeholder="童年、创伤、关键经历..." /></div>
                             <div><label className="block text-xs font-medium text-gray-500 mb-1">技能与能力 (Skills)</label><textarea value={safeRender(editForm.skills || '')} onChange={e => setEditForm({...editForm, skills: e.target.value})} className="w-full text-sm border p-1 rounded h-20" placeholder="魔法、战斗、智力..." /></div>
                        </div>

                        {/* Personality Sliders */}
                        <div className="bg-slate-50 p-2 rounded border border-slate-100">
                            <label className="block text-xs font-bold text-gray-600 mb-2">五维性格模型 (Big 5 Personality) - 0-100</label>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                {(['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism'] as const).map(trait => {
                                    const labels = {
                                        openness: '开放性',
                                        conscientiousness: '尽责性',
                                        extraversion: '外向性',
                                        agreeableness: '宜人性',
                                        neuroticism: '神经质'
                                    };
                                    return (
                                        <div key={trait} className="flex items-center gap-2">
                                            <span className="text-[10px] w-20 text-gray-500">{labels[trait]}</span>
                                            <input 
                                                type="range" min="0" max="100" 
                                                value={editForm.personalityTags?.[trait] || 50} 
                                                onChange={(e) => updateTrait(trait, e.target.value)}
                                                className="flex-1 h-1 bg-gray-300 rounded-lg appearance-none cursor-pointer"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                             <div><label className="block text-xs font-medium text-gray-500 mb-1">人际关系 (Relationships)</label><textarea value={safeRender(editForm.relationships)} onChange={e => setEditForm({...editForm, relationships: e.target.value})} className="w-full text-sm border p-1 rounded h-16" /></div>
                             <div><label className="block text-xs font-medium text-gray-500 mb-1">弧光/目标 (Arc/Goals)</label><textarea value={safeRender(editForm.arc || editForm.goals || '')} onChange={e => setEditForm({...editForm, arc: e.target.value})} className="w-full text-sm border p-1 rounded h-16" /></div>
                        </div>
                        {viewMode === 'depth' && (
                            <div><label className="block text-xs font-medium text-purple-600 mb-1">心理与内在冲突 (Psychology & Conflict)</label><textarea value={safeRender(editForm.psychology || '')} onChange={e => setEditForm({...editForm, psychology: e.target.value})} className="w-full text-sm border border-purple-200 p-1 rounded h-24 bg-purple-50" /></div>
                        )}
                        <div className="flex justify-end space-x-2 pt-2">
                             <button onClick={() => deleteCharacter(index)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                             <div className="flex-1"></div>
                             <button onClick={() => setEditingIndex(null)} className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">取消</button>
                             <button onClick={saveEditing} className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center space-x-1"><Save size={14}/> <span>保存</span></button>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-4">
                        <div className="shrink-0 flex flex-col items-center space-y-2">
                            <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 relative group/img">
                                {char.imageUrl ? <img src={char.imageUrl} alt={char.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><Users size={32} /></div>}
                                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                                     {generatingImageFor === index ? <Loader2 className="animate-spin text-white" /> : <button onClick={() => handleGenerateImage(index)} title="生成插画" className="bg-white/90 p-1.5 rounded-full text-indigo-600 shadow-sm"><Sparkles size={14} /></button>}
                                </div>
                            </div>
                            <PersonalityBars traits={char.personalityTags} />
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                    {safeRender(char.name)}
                                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-normal">{safeRender(char.role)}</span>
                                    {char.storylineId && (
                                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-normal flex items-center gap-1" title="关联故事线">
                                            <GitBranch size={10}/> {getStorylineName(char.storylineId) || 'Storyline'}
                                        </span>
                                    )}
                                </h4>
                                <div className="flex gap-1">
                                    {viewMode === 'depth' && <button onClick={() => handleAnalyzeDepth(index)} disabled={analyzingIndex === index} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200 flex items-center gap-1">{analyzingIndex === index ? <Loader2 size={10} className="animate-spin"/> : <Brain size={12}/>} 深度分析</button>}
                                    {onUpdateCharacters && <button onClick={() => startEditing(index)} className="text-gray-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100"><Edit2 size={16} /></button>}
                                </div>
                            </div>
                            <div className="space-y-2 text-sm text-gray-600">
                                <p className="line-clamp-2">{safeRender(char.description)}</p>
                                
                                {(char.backgroundStory || char.skills) && (
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="bg-orange-50 p-1.5 rounded text-orange-800">
                                            <span className="font-bold">背景: </span>{char.backgroundStory ? char.backgroundStory.slice(0, 50) + '...' : '-'}
                                        </div>
                                        <div className="bg-blue-50 p-1.5 rounded text-blue-800">
                                            <span className="font-bold">技能: </span>{char.skills ? char.skills.slice(0, 50) + '...' : '-'}
                                        </div>
                                    </div>
                                )}

                                {viewMode === 'depth' && char.psychology ? (
                                    <div className="bg-purple-50 p-2 rounded text-xs border border-purple-100 text-purple-900 whitespace-pre-wrap">
                                        <strong>心理分析:</strong> {safeRender(char.psychology)}
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <div className="flex-1 bg-gray-50 p-2 rounded text-xs border border-gray-100"><span className="font-semibold text-gray-700 block mb-0.5">关系:</span> {safeRender(char.relationships)}</div>
                                        {(char.arc || char.goals) && <div className="flex-1 bg-orange-50 p-2 rounded text-xs border border-orange-100"><span className="font-semibold text-orange-700 block mb-0.5">目标/弧光:</span> {safeRender(char.arc || char.goals)}</div>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
              </div>
          ))}

          {viewMode === 'network' && (
              <div className="bg-white rounded-xl border border-gray-200 h-[400px] flex items-center justify-center">
                  {localCharacters.length < 2 ? <div className="text-gray-400 text-sm">至少需要 2 个角色才能显示关系图。</div> : <CharacterNetwork characters={localCharacters} />}
              </div>
          )}

          {viewMode === 'timeline' && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 min-h-[300px]">
                  <CharacterTimeline characters={localCharacters} chapters={chapters} />
              </div>
          )}

        </div>
        <div className="p-4 border-t border-gray-100 bg-white text-center text-xs text-gray-400 rounded-b-xl">共 {localCharacters.length} 个角色</div>
      </div>
    </div>
  );
};

export default CharacterList;
