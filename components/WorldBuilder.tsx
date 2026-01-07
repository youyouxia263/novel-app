
import React, { useState } from 'react';
import { NovelSettings, WorldData, WorldLocation, WorldEvent, WorldTerm } from '../types';
import { X, Globe2, Map, Clock, Book, AlertTriangle, Sparkles, Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { generateWorldFoundation, generateWorldLocations, generateWorldTimeline, analyzeWorldConsistency } from '../services/geminiService';

interface WorldBuilderProps {
    isOpen: boolean;
    onClose: () => void;
    settings: NovelSettings;
    onUpdateWorld: (world: WorldData) => void;
}

const WorldBuilder: React.FC<WorldBuilderProps> = ({ isOpen, onClose, settings, onUpdateWorld }) => {
    const [worldData, setWorldData] = useState<WorldData>(settings.structuredWorld || {
        geography: '',
        society: '',
        culture: '',
        technology: '',
        locations: [],
        timeline: [],
        encyclopedia: []
    });
    
    const [activeTab, setActiveTab] = useState<'foundation' | 'map' | 'timeline' | 'encyclopedia' | 'analysis'>('foundation');
    const [isGenerating, setIsGenerating] = useState<string | null>(null); // 'geo', 'map', etc.
    const [analysisReport, setAnalysisReport] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleUpdate = (field: keyof WorldData, value: any) => {
        const newData = { ...worldData, [field]: value };
        setWorldData(newData);
        // We sync on close or save, but keeping local state responsive
    };

    const handleSave = () => {
        onUpdateWorld(worldData);
        onClose();
    };

    const generateFoundation = async (category: 'geography' | 'society' | 'culture' | 'technology') => {
        setIsGenerating(category);
        try {
            const content = await generateWorldFoundation({ ...settings, structuredWorld: worldData }, category);
            handleUpdate(category, content);
        } catch (e) {
            console.error(e);
            alert("Generation failed.");
        } finally {
            setIsGenerating(null);
        }
    };

    const generateMap = async () => {
        setIsGenerating('map');
        try {
            const locs = await generateWorldLocations({ ...settings, structuredWorld: worldData });
            handleUpdate('locations', locs);
        } catch (e) {
            console.error(e);
            alert("Map generation failed.");
        } finally {
            setIsGenerating(null);
        }
    };

    const generateTimeline = async () => {
        setIsGenerating('timeline');
        try {
            const events = await generateWorldTimeline({ ...settings, structuredWorld: worldData });
            handleUpdate('timeline', events);
        } catch (e) {
            console.error(e);
            alert("Timeline generation failed.");
        } finally {
            setIsGenerating(null);
        }
    };

    const runAnalysis = async () => {
        setIsGenerating('analysis');
        try {
            const report = await analyzeWorldConsistency(worldData, settings);
            setAnalysisReport(report);
        } catch (e) {
            console.error(e);
            alert("Analysis failed.");
        } finally {
            setIsGenerating(null);
        }
    };

    // --- Sub-Components ---

    const renderFoundation = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full overflow-y-auto p-1">
            {[
                { key: 'geography', label: '地理环境 (Geography)' }, 
                { key: 'society', label: '社会制度 (Society)' }, 
                { key: 'culture', label: '文化背景 (Culture)' }, 
                { key: 'technology', label: '科技/魔法 (Tech/Magic)' }
            ].map((cat) => (
                <div key={cat.key} className="border rounded-lg p-4 bg-gray-50 flex flex-col">
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold text-gray-700 capitalize">{cat.label}</h4>
                        <button 
                            onClick={() => generateFoundation(cat.key as any)} 
                            disabled={!!isGenerating}
                            className="text-xs flex items-center gap-1 text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                        >
                            {isGenerating === cat.key ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>}
                            <span>自动生成</span>
                        </button>
                    </div>
                    <textarea 
                        value={(worldData as any)[cat.key]}
                        onChange={(e) => handleUpdate(cat.key as any, e.target.value)}
                        className="flex-1 w-full p-2 border border-gray-200 rounded text-sm resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                        placeholder={`描述${cat.label}...`}
                    />
                </div>
            ))}
        </div>
    );

    const renderMap = () => (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <button onClick={generateMap} disabled={!!isGenerating} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded text-xs font-medium flex items-center gap-2">
                    {isGenerating === 'map' ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                    <span>生成地点</span>
                </button>
                <div className="text-xs text-gray-500">当前版本仅支持列表生成，交互式地图开发中。</div>
            </div>
            <div className="flex-1 border rounded-lg bg-slate-50 relative overflow-hidden">
                <div className="absolute inset-0 p-4">
                    {worldData.locations.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-gray-400">暂无地点信息。</div>
                    ) : (
                        <svg width="100%" height="100%" viewBox="0 0 400 300">
                            {worldData.locations.map((loc, i) => (
                                <g key={loc.id || i}>
                                    <circle cx={loc.x} cy={loc.y} r="6" fill={loc.type === 'city' ? '#ef4444' : loc.type === 'region' ? '#22c55e' : '#3b82f6'} stroke="white" strokeWidth="2" />
                                    <text x={loc.x} y={loc.y + 12} textAnchor="middle" fontSize="8" className="fill-gray-700 font-bold select-none">{loc.name}</text>
                                    <title>{loc.description}</title>
                                </g>
                            ))}
                        </svg>
                    )}
                </div>
            </div>
            <div className="mt-4 h-1/3 overflow-y-auto border-t pt-2">
                {worldData.locations.map((loc, i) => (
                    <div key={i} className="flex items-center justify-between p-2 border-b text-sm">
                        <div>
                            <span className="font-bold">{loc.name}</span> <span className="text-xs text-gray-500">({loc.type})</span>
                            <p className="text-xs text-gray-600 truncate max-w-[200px]">{loc.description}</p>
                        </div>
                        <button onClick={() => {
                            const newLocs = worldData.locations.filter((_, idx) => idx !== i);
                            handleUpdate('locations', newLocs);
                        }} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderTimeline = () => (
        <div className="h-full flex flex-col">
             <div className="flex justify-between items-center mb-4">
                <button onClick={generateTimeline} disabled={!!isGenerating} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded text-xs font-medium flex items-center gap-2">
                    {isGenerating === 'timeline' ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                    <span>生成历史事件</span>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                {worldData.timeline.length === 0 && <div className="text-gray-400 text-center mt-10">暂无历史记录。</div>}
                {worldData.timeline.map((event, i) => (
                    <div key={i} className="flex gap-4 group">
                        <div className="w-20 text-right font-mono text-sm font-bold text-indigo-600 pt-1">{event.year}</div>
                        <div className="relative flex-1 pb-4 border-l border-indigo-100 pl-4">
                            <div className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-indigo-400 border-2 border-white"></div>
                            <p className="text-sm text-gray-700 bg-white p-2 rounded border border-gray-100 shadow-sm">{event.description}</p>
                            <button onClick={() => {
                                const newTime = worldData.timeline.filter((_, idx) => idx !== i);
                                handleUpdate('timeline', newTime);
                            }} className="absolute right-0 top-0 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Trash2 size={12}/>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderAnalysis = () => (
        <div className="h-full flex flex-col">
            <div className="mb-4">
                <button onClick={runAnalysis} disabled={!!isGenerating} className="w-full py-3 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-lg font-bold flex items-center justify-center gap-2 border border-orange-200">
                    {isGenerating === 'analysis' ? <Loader2 size={18} className="animate-spin"/> : <AlertTriangle size={18}/>}
                    <span>运行世界观一致性检查</span>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-gray-50 p-4 rounded-lg border border-gray-200 prose prose-sm max-w-none">
                {analysisReport ? (
                    <div dangerouslySetInnerHTML={{ __html: analysisReport.replace(/\n/g, '<br/>') }} /> // Simple render, reader handles markdown usually
                ) : (
                    <div className="text-gray-400 text-center mt-10">运行检查以发现世界观设定中的逻辑冲突或缺失元素。</div>
                )}
            </div>
        </div>
    );

    const renderEncyclopedia = () => (
        <div className="h-full flex flex-col">
            <div className="flex justify-end mb-2">
                <button onClick={() => {
                    const newTerm: WorldTerm = { id: crypto.randomUUID(), term: "新术语", definition: "...", category: "通用" };
                    handleUpdate('encyclopedia', [...worldData.encyclopedia, newTerm]);
                }} className="text-xs flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                    <Plus size={12}/> 添加词条
                </button>
            </div>
            <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                        <tr>
                            <th className="px-3 py-2 rounded-tl-lg">术语 (Term)</th>
                            <th className="px-3 py-2">分类 (Category)</th>
                            <th className="px-3 py-2">定义 (Definition)</th>
                            <th className="px-3 py-2 rounded-tr-lg w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {worldData.encyclopedia.map((item, i) => (
                            <tr key={item.id || i} className="border-b hover:bg-gray-50">
                                <td className="px-3 py-2 font-bold">
                                    <input className="bg-transparent w-full outline-none" value={item.term} onChange={e => {
                                        const newList = [...worldData.encyclopedia];
                                        newList[i].term = e.target.value;
                                        handleUpdate('encyclopedia', newList);
                                    }}/>
                                </td>
                                <td className="px-3 py-2 text-gray-500">
                                    <input className="bg-transparent w-full outline-none" value={item.category} onChange={e => {
                                        const newList = [...worldData.encyclopedia];
                                        newList[i].category = e.target.value;
                                        handleUpdate('encyclopedia', newList);
                                    }}/>
                                </td>
                                <td className="px-3 py-2 text-gray-700">
                                    <input className="bg-transparent w-full outline-none" value={item.definition} onChange={e => {
                                        const newList = [...worldData.encyclopedia];
                                        newList[i].definition = e.target.value;
                                        handleUpdate('encyclopedia', newList);
                                    }}/>
                                </td>
                                <td className="px-3 py-2">
                                    <button onClick={() => {
                                        const newList = worldData.encyclopedia.filter((_, idx) => idx !== i);
                                        handleUpdate('encyclopedia', newList);
                                    }} className="text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {worldData.encyclopedia.length === 0 && <div className="text-center text-gray-400 py-10">暂无词条。</div>}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div className="flex items-center gap-2 text-indigo-700">
                        <Globe2 size={24} />
                        <div>
                            <h2 className="text-xl font-bold">世界观构建工具 (World Builder)</h2>
                            <p className="text-xs text-gray-500">构建地理、历史与规则</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-indigo-700 transition-colors">
                            <Save size={16} /> 保存更改
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar Tabs */}
                    <div className="w-48 bg-gray-50 border-r border-gray-200 flex flex-col p-2 space-y-1">
                        <button onClick={() => setActiveTab('foundation')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'foundation' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <Globe2 size={16}/> 基础设定
                        </button>
                        <button onClick={() => setActiveTab('map')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'map' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <Map size={16}/> 地图 & 地点
                        </button>
                        <button onClick={() => setActiveTab('timeline')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'timeline' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <Clock size={16}/> 历史 & 时间线
                        </button>
                        <button onClick={() => setActiveTab('encyclopedia')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'encyclopedia' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <Book size={16}/> 设定百科
                        </button>
                        <hr className="border-gray-200 my-2"/>
                        <button onClick={() => setActiveTab('analysis')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'analysis' ? 'bg-white shadow text-orange-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <AlertTriangle size={16}/> 一致性检查
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 p-6 overflow-hidden relative">
                        {activeTab === 'foundation' && renderFoundation()}
                        {activeTab === 'map' && renderMap()}
                        {activeTab === 'timeline' && renderTimeline()}
                        {activeTab === 'encyclopedia' && renderEncyclopedia()}
                        {activeTab === 'analysis' && renderAnalysis()}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default WorldBuilder;
