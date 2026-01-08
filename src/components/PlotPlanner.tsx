
import React, { useState } from 'react';
import { NovelSettings, PlotData, PlotNode, Storyline, Character } from '../types';
import { X, GitMerge, Plus, Trash2, Save, AlertTriangle, Loader2, Activity, Layers, ArrowRight } from 'lucide-react';
import { checkPlotLogic } from '../services/geminiService';

interface PlotPlannerProps {
    isOpen: boolean;
    onClose: () => void;
    settings: NovelSettings;
    onUpdatePlot: (plot: PlotData) => void;
    characters: Character[];
}

const PlotPlanner: React.FC<PlotPlannerProps> = ({ isOpen, onClose, settings, onUpdatePlot, characters }) => {
    const [plotData, setPlotData] = useState<PlotData>(settings.plotData || {
        act1: '',
        act2: '',
        act3: '',
        storylines: [{ id: 'main', name: 'Main Plot', description: '', type: 'main' }],
        nodes: []
    });

    const [activeTab, setActiveTab] = useState<'structure' | 'storylines' | 'events' | 'logic'>('structure');
    const [isGenerating, setIsGenerating] = useState(false);
    const [analysisReport, setAnalysisReport] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleUpdate = (field: keyof PlotData, value: any) => {
        setPlotData({ ...plotData, [field]: value });
    };

    const handleSave = () => {
        onUpdatePlot(plotData);
        onClose();
    };

    const handleCheckLogic = async () => {
        setIsGenerating(true);
        try {
            const report = await checkPlotLogic(plotData, settings, characters);
            setAnalysisReport(report);
        } catch (e: any) {
            setAnalysisReport("Error: " + e.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const addStoryline = () => {
        const newSL: Storyline = {
            id: crypto.randomUUID(),
            name: 'New Subplot',
            description: '',
            type: 'sub'
        };
        handleUpdate('storylines', [...plotData.storylines, newSL]);
    };

    const addNode = () => {
        const newNode: PlotNode = {
            id: crypto.randomUUID(),
            title: 'New Event',
            description: '',
            type: 'inciting_incident',
            storylineId: plotData.storylines[0]?.id || 'main',
            tension: 5
        };
        handleUpdate('nodes', [...plotData.nodes, newNode]);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div className="flex items-center gap-2 text-indigo-700">
                        <GitMerge size={24} />
                        <div>
                            <h2 className="text-xl font-bold">情节规划 (Plot Planner)</h2>
                            <p className="text-xs text-gray-500">三幕式结构与事件流</p>
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
                    {/* Sidebar */}
                    <div className="w-48 bg-gray-50 border-r border-gray-200 flex flex-col p-2 space-y-1">
                        <button onClick={() => setActiveTab('structure')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'structure' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <Layers size={16}/> 宏观结构 (Structure)
                        </button>
                        <button onClick={() => setActiveTab('storylines')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'storylines' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <GitMerge size={16}/> 故事线 (Storylines)
                        </button>
                        <button onClick={() => setActiveTab('events')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'events' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <Activity size={16}/> 事件节点 (Events)
                        </button>
                        <hr className="border-gray-200 my-2"/>
                        <button onClick={() => setActiveTab('logic')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'logic' ? 'bg-white shadow text-orange-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <AlertTriangle size={16}/> 逻辑检查 (Logic)
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-6 overflow-hidden bg-gray-50/30">
                        {activeTab === 'structure' && (
                            <div className="h-full overflow-y-auto space-y-4">
                                <div className="p-4 bg-white border rounded-lg shadow-sm">
                                    <h3 className="font-bold text-gray-700 mb-2">第一幕：铺垫 (Act 1: Setup)</h3>
                                    <textarea 
                                        value={plotData.act1} 
                                        onChange={(e) => handleUpdate('act1', e.target.value)}
                                        className="w-full h-32 p-3 border rounded text-sm resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                                        placeholder="介绍主角、世界观、引发事件..."
                                    />
                                </div>
                                <div className="p-4 bg-white border rounded-lg shadow-sm">
                                    <h3 className="font-bold text-gray-700 mb-2">第二幕：冲突 (Act 2: Confrontation)</h3>
                                    <textarea 
                                        value={plotData.act2} 
                                        onChange={(e) => handleUpdate('act2', e.target.value)}
                                        className="w-full h-32 p-3 border rounded text-sm resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                                        placeholder="试炼、失败、中点转折..."
                                    />
                                </div>
                                <div className="p-4 bg-white border rounded-lg shadow-sm">
                                    <h3 className="font-bold text-gray-700 mb-2">第三幕：结局 (Act 3: Resolution)</h3>
                                    <textarea 
                                        value={plotData.act3} 
                                        onChange={(e) => handleUpdate('act3', e.target.value)}
                                        className="w-full h-32 p-3 border rounded text-sm resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
                                        placeholder="高潮、结局..."
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'storylines' && (
                            <div className="h-full flex flex-col">
                                <div className="flex justify-end mb-2">
                                    <button onClick={addStoryline} className="text-xs flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                                        <Plus size={12}/> 添加故事线
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-3">
                                    {plotData.storylines.map((sl, idx) => (
                                        <div key={sl.id} className="bg-white p-3 rounded border flex items-start gap-3">
                                            <div className="flex-1 grid gap-2">
                                                <input 
                                                    value={sl.name}
                                                    onChange={(e) => {
                                                        const newSL = [...plotData.storylines];
                                                        newSL[idx].name = e.target.value;
                                                        handleUpdate('storylines', newSL);
                                                    }}
                                                    className="font-bold text-sm border-b border-transparent focus:border-indigo-500 outline-none"
                                                    placeholder="Storyline Name"
                                                />
                                                <textarea 
                                                    value={sl.description}
                                                    onChange={(e) => {
                                                        const newSL = [...plotData.storylines];
                                                        newSL[idx].description = e.target.value;
                                                        handleUpdate('storylines', newSL);
                                                    }}
                                                    className="text-xs text-gray-600 resize-none w-full bg-transparent outline-none h-16"
                                                    placeholder="Description..."
                                                />
                                            </div>
                                            <select 
                                                value={sl.type}
                                                onChange={(e) => {
                                                    const newSL = [...plotData.storylines];
                                                    newSL[idx].type = e.target.value as any;
                                                    handleUpdate('storylines', newSL);
                                                }}
                                                className="text-xs border rounded p-1"
                                            >
                                                <option value="main">主线</option>
                                                <option value="sub">支线</option>
                                            </select>
                                            <button onClick={() => {
                                                const newSL = plotData.storylines.filter((_, i) => i !== idx);
                                                handleUpdate('storylines', newSL);
                                            }} className="text-gray-400 hover:text-red-500">
                                                <Trash2 size={16}/>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'events' && (
                            <div className="h-full flex flex-col">
                                <div className="flex justify-end mb-2">
                                    <button onClick={addNode} className="text-xs flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                                        <Plus size={12}/> 添加事件节点
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-3">
                                    {plotData.nodes.map((node, idx) => (
                                        <div key={node.id} className="bg-white p-3 rounded border flex flex-col gap-2 relative">
                                            <div className="flex justify-between items-center">
                                                <input 
                                                    value={node.title}
                                                    onChange={(e) => {
                                                        const newNodes = [...plotData.nodes];
                                                        newNodes[idx].title = e.target.value;
                                                        handleUpdate('nodes', newNodes);
                                                    }}
                                                    className="font-bold text-sm outline-none"
                                                    placeholder="Event Title"
                                                />
                                                <button onClick={() => {
                                                    const newNodes = plotData.nodes.filter((_, i) => i !== idx);
                                                    handleUpdate('nodes', newNodes);
                                                }} className="text-gray-400 hover:text-red-500">
                                                    <Trash2 size={14}/>
                                                </button>
                                            </div>
                                            <div className="flex gap-2">
                                                <select 
                                                    value={node.type}
                                                    onChange={(e) => {
                                                        const newNodes = [...plotData.nodes];
                                                        newNodes[idx].type = e.target.value as any;
                                                        handleUpdate('nodes', newNodes);
                                                    }}
                                                    className="text-xs border rounded p-1 bg-gray-50"
                                                >
                                                    <option value="inciting_incident">引发事件</option>
                                                    <option value="turning_point">转折点</option>
                                                    <option value="midpoint">中点</option>
                                                    <option value="climax">高潮</option>
                                                    <option value="resolution">结局</option>
                                                    <option value="foreshadowing">伏笔</option>
                                                </select>
                                                <select 
                                                    value={node.storylineId}
                                                    onChange={(e) => {
                                                        const newNodes = [...plotData.nodes];
                                                        newNodes[idx].storylineId = e.target.value;
                                                        handleUpdate('nodes', newNodes);
                                                    }}
                                                    className="text-xs border rounded p-1 bg-gray-50 max-w-[100px]"
                                                >
                                                    {plotData.storylines.map(sl => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
                                                </select>
                                                <div className="flex items-center gap-1 text-xs text-gray-500">
                                                    <span>张力:</span>
                                                    <input 
                                                        type="number" min="1" max="10"
                                                        value={node.tension}
                                                        onChange={(e) => {
                                                            const newNodes = [...plotData.nodes];
                                                            newNodes[idx].tension = parseInt(e.target.value);
                                                            handleUpdate('nodes', newNodes);
                                                        }}
                                                        className="w-10 border rounded p-1"
                                                    />
                                                </div>
                                            </div>
                                            <textarea 
                                                value={node.description}
                                                onChange={(e) => {
                                                    const newNodes = [...plotData.nodes];
                                                    newNodes[idx].description = e.target.value;
                                                    handleUpdate('nodes', newNodes);
                                                }}
                                                className="text-xs text-gray-600 resize-none h-12 w-full border border-transparent hover:border-gray-200 rounded p-1 outline-none transition-colors"
                                                placeholder="Description..."
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'logic' && (
                            <div className="h-full flex flex-col">
                                <div className="mb-4">
                                    <button onClick={handleCheckLogic} disabled={isGenerating} className="w-full py-3 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-lg font-bold flex items-center justify-center gap-2 border border-orange-200">
                                        {isGenerating ? <Loader2 size={18} className="animate-spin"/> : <AlertTriangle size={18}/>}
                                        <span>运行情节逻辑与角色动机检查</span>
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto bg-white p-6 rounded-lg border border-gray-200 shadow-inner">
                                    {analysisReport ? (
                                        <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed font-mono">
                                            <div dangerouslySetInnerHTML={{ __html: analysisReport.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                        </div>
                                    ) : (
                                        <div className="text-gray-400 text-center mt-20 flex flex-col items-center">
                                            <Activity size={48} className="mb-4 opacity-20"/>
                                            <p>运行检查以识别情节漏洞、时间线冲突、角色动机不符或逻辑问题。</p>
                                            <p className="text-xs mt-2 opacity-70">AI 将分析所有节点、因果关系、张力曲线及人物目标。</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlotPlanner;
