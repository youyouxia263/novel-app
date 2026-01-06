
import React, { useState } from 'react';
import { NovelSettings, PlotData, Storyline, PlotNode } from '../types';
import { X, GitMerge, List, AlertTriangle, Sparkles, Loader2, Save, Plus, Trash2, Milestone, Activity, TrendingUp, Anchor, Link as LinkIcon, Eye } from 'lucide-react';
import { generatePlotStructure, generatePlotNodes, checkPlotLogic } from '../services/geminiService';

interface PlotPlannerProps {
    isOpen: boolean;
    onClose: () => void;
    settings: NovelSettings;
    onUpdatePlot: (plot: PlotData) => void;
}

const PlotPlanner: React.FC<PlotPlannerProps> = ({ isOpen, onClose, settings, onUpdatePlot }) => {
    const [plotData, setPlotData] = useState<PlotData>(settings.plotData || {
        act1: '',
        act2: '',
        act3: '',
        storylines: [
            { id: 'main', name: 'Main Plot', description: 'The primary journey', type: 'main' }
        ],
        nodes: []
    });
    
    const [activeTab, setActiveTab] = useState<'structure' | 'nodes' | 'visuals' | 'logic'>('structure');
    const [isGenerating, setIsGenerating] = useState(false);
    const [analysisReport, setAnalysisReport] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleUpdate = (field: keyof PlotData, value: any) => {
        const newData = { ...plotData, [field]: value };
        setPlotData(newData);
    };

    const handleSave = () => {
        onUpdatePlot(plotData);
        onClose();
    };

    const handleGenerateStructure = async () => {
        setIsGenerating(true);
        try {
            const structureText = await generatePlotStructure(settings);
            const acts = structureText.split(/Act \d.*:/i);
            if (acts.length >= 4) {
                handleUpdate('act1', acts[1].trim());
                handleUpdate('act2', acts[2].trim());
                handleUpdate('act3', acts[3].trim());
            } else {
                handleUpdate('act1', structureText);
            }
        } catch (e) {
            console.error(e);
            alert("Structure generation failed.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerateNodes = async () => {
        setIsGenerating(true);
        try {
            const structureContext = `Act 1: ${plotData.act1}\nAct 2: ${plotData.act2}\nAct 3: ${plotData.act3}`;
            const newNodes = await generatePlotNodes(settings, structureContext, plotData.storylines);
            handleUpdate('nodes', [...plotData.nodes, ...newNodes]);
        } catch (e) {
            console.error(e);
            alert("Node generation failed.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCheckLogic = async () => {
        setIsGenerating(true);
        try {
            const report = await checkPlotLogic(plotData, settings);
            setAnalysisReport(report);
        } catch (e) {
            console.error(e);
            alert("Logic check failed.");
        } finally {
            setIsGenerating(false);
        }
    };

    const addStoryline = () => {
        const newSL: Storyline = { id: crypto.randomUUID(), name: 'Subplot', description: '', type: 'sub' };
        handleUpdate('storylines', [...plotData.storylines, newSL]);
    };

    const sortedNodes = [...plotData.nodes].sort((a,b) => {
        const getStart = (r:string) => parseInt(r?.split('-')[0]) || 0;
        return getStart(a.chapterRange || '0') - getStart(b.chapterRange || '0');
    });

    const getTensionPoints = () => {
        if (sortedNodes.length < 2) return "";
        const maxCh = sortedNodes.reduce((max, n) => Math.max(max, parseInt(n.chapterRange?.split('-')[1] || n.chapterRange?.split('-')[0] || '0')), 0) || 20;
        const width = 600;
        const height = 200;
        
        let points = `0,${height} `; // Start bottom-left
        
        sortedNodes.forEach((node) => {
            const chStart = parseInt(node.chapterRange?.split('-')[0] || '0');
            const x = (chStart / maxCh) * width;
            const y = height - ((node.tension || 5) / 10) * height; // 1-10 scale
            points += `${x},${y} `;
        });
        
        return points;
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col animate-in zoom-in-95 duration-200">
                
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div className="flex items-center gap-2 text-indigo-700">
                        <GitMerge size={24} className="rotate-90" />
                        <div>
                            <h2 className="text-xl font-bold">Plot Planner</h2>
                            <p className="text-xs text-gray-500">Narrative structure & event timeline</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center gap-2 text-sm font-medium hover:bg-indigo-700 transition-colors">
                            <Save size={16} /> Save Plan
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Tabs */}
                    <div className="w-48 bg-gray-50 border-r border-gray-200 flex flex-col p-2 space-y-1">
                        <button onClick={() => setActiveTab('structure')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'structure' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <List size={16}/> Structure (Acts)
                        </button>
                        <button onClick={() => setActiveTab('nodes')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'nodes' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <Milestone size={16}/> Plot Nodes
                        </button>
                        <button onClick={() => setActiveTab('visuals')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'visuals' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <TrendingUp size={16}/> Visuals & Arcs
                        </button>
                        <hr className="border-gray-200 my-2"/>
                        <button onClick={() => setActiveTab('logic')} className={`px-3 py-2 rounded-lg text-left text-sm font-medium flex items-center gap-2 ${activeTab === 'logic' ? 'bg-white shadow text-orange-600' : 'text-gray-600 hover:bg-gray-200'}`}>
                            <Activity size={16}/> Logic Check
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-6 overflow-hidden relative bg-slate-50">
                        
                        {/* STRUCTURE VIEW */}
                        {activeTab === 'structure' && (
                            <div className="h-full flex flex-col">
                                <div className="mb-4 flex justify-between">
                                    <h3 className="text-lg font-bold text-gray-800">Three-Act Structure</h3>
                                    <button onClick={handleGenerateStructure} disabled={isGenerating} className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full hover:bg-indigo-200 flex items-center gap-1">
                                        {isGenerating ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} Auto-Generate
                                    </button>
                                </div>
                                <div className="flex-1 grid grid-cols-3 gap-4 h-full overflow-hidden pb-2">
                                    {['act1', 'act2', 'act3'].map((act, i) => (
                                        <div key={act} className="flex flex-col bg-white rounded-lg border border-gray-200 shadow-sm">
                                            <div className="p-3 border-b border-gray-100 bg-gray-50/50 font-bold text-sm text-gray-600">
                                                Act {i+1}
                                            </div>
                                            <textarea 
                                                className="flex-1 p-3 text-sm resize-none outline-none focus:bg-indigo-50/10 transition-colors" 
                                                value={(plotData as any)[act]}
                                                onChange={(e) => handleUpdate(act as any, e.target.value)}
                                                placeholder={`Details for Act ${i+1}...`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* NODES VIEW */}
                        {activeTab === 'nodes' && (
                            <div className="h-full flex flex-col">
                                <div className="flex gap-4 h-full">
                                    {/* Storylines Sidebar */}
                                    <div className="w-1/3 bg-white rounded-lg border border-gray-200 p-4 overflow-y-auto">
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="font-bold text-sm text-gray-700">Storylines</h4>
                                            <button onClick={addStoryline} className="p-1 hover:bg-gray-100 rounded"><Plus size={16}/></button>
                                        </div>
                                        <div className="space-y-3">
                                            {plotData.storylines.map((sl, i) => (
                                                <div key={sl.id} className="p-3 border rounded-lg hover:shadow-sm transition-shadow">
                                                    <div className="flex justify-between mb-1">
                                                        <input 
                                                            value={sl.name} 
                                                            onChange={e => {
                                                                const newSL = [...plotData.storylines];
                                                                newSL[i].name = e.target.value;
                                                                handleUpdate('storylines', newSL);
                                                            }}
                                                            className="font-bold text-sm outline-none w-full"
                                                        />
                                                        {sl.type !== 'main' && (
                                                            <button onClick={() => {
                                                                const newSL = plotData.storylines.filter(s => s.id !== sl.id);
                                                                handleUpdate('storylines', newSL);
                                                            }} className="text-gray-400 hover:text-red-500"><Trash2 size={12}/></button>
                                                        )}
                                                    </div>
                                                    <textarea 
                                                        value={sl.description}
                                                        onChange={e => {
                                                            const newSL = [...plotData.storylines];
                                                            newSL[i].description = e.target.value;
                                                            handleUpdate('storylines', newSL);
                                                        }}
                                                        className="text-xs text-gray-500 w-full resize-none outline-none bg-transparent"
                                                        placeholder="Description..."
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Nodes List */}
                                    <div className="flex-1 bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
                                        <div className="flex justify-between items-center mb-4">
                                            <h4 className="font-bold text-sm text-gray-700">Plot Events (Nodes)</h4>
                                            <div className="flex gap-2">
                                                <button onClick={() => {
                                                    const newNode: PlotNode = { 
                                                        id: crypto.randomUUID(), 
                                                        title: 'New Event', 
                                                        description: '', 
                                                        type: 'turning_point', 
                                                        storylineId: 'main',
                                                        chapterRange: '1',
                                                        tension: 5
                                                    };
                                                    handleUpdate('nodes', [...plotData.nodes, newNode]);
                                                }} className="text-xs px-2 py-1 border rounded hover:bg-gray-50"><Plus size={12}/> Add</button>
                                                <button onClick={handleGenerateNodes} disabled={isGenerating} className="text-xs px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full hover:bg-indigo-200 flex items-center gap-1">
                                                    {isGenerating ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} AI Gen
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                                            {plotData.nodes.length === 0 && <div className="text-center text-gray-400 mt-10">No events defined.</div>}
                                            {sortedNodes.map((node) => (
                                                <div key={node.id} className="border p-3 rounded-lg flex flex-col gap-2 relative hover:bg-slate-50 group bg-white shadow-sm">
                                                    <div className="flex gap-3">
                                                        <div className="w-16 flex-shrink-0 flex flex-col justify-center items-center border-r border-gray-100 pr-3">
                                                            <span className="text-[10px] text-gray-400 uppercase font-bold">Ch.</span>
                                                            <input 
                                                                value={node.chapterRange}
                                                                onChange={e => {
                                                                    const newNodes = [...plotData.nodes];
                                                                    const target = newNodes.find(n => n.id === node.id);
                                                                    if(target) target.chapterRange = e.target.value;
                                                                    handleUpdate('nodes', newNodes);
                                                                }}
                                                                className="w-full text-center font-mono text-sm font-bold bg-transparent outline-none"
                                                            />
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex justify-between">
                                                                <input 
                                                                    value={node.title}
                                                                    onChange={e => {
                                                                        const newNodes = [...plotData.nodes];
                                                                        const target = newNodes.find(n => n.id === node.id);
                                                                        if(target) target.title = e.target.value;
                                                                        handleUpdate('nodes', newNodes);
                                                                    }}
                                                                    className="font-bold text-sm bg-transparent outline-none w-full"
                                                                />
                                                                <div className="flex gap-1">
                                                                    <div className="text-[10px] bg-indigo-50 text-indigo-600 px-2 rounded-full h-fit whitespace-nowrap">
                                                                        {plotData.storylines.find(s => s.id === node.storylineId)?.name || 'Unknown'}
                                                                    </div>
                                                                    <div className="text-[10px] bg-orange-50 text-orange-600 px-2 rounded-full h-fit whitespace-nowrap">
                                                                        Tension: {node.tension || 5}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <textarea 
                                                                value={node.description}
                                                                onChange={e => {
                                                                    const newNodes = [...plotData.nodes];
                                                                    const target = newNodes.find(n => n.id === node.id);
                                                                    if(target) target.description = e.target.value;
                                                                    handleUpdate('nodes', newNodes);
                                                                }}
                                                                className="text-xs text-gray-600 w-full bg-transparent resize-none outline-none mt-1"
                                                                rows={2}
                                                            />
                                                        </div>
                                                    </div>
                                                    {/* Links & Settings Row */}
                                                    <div className="flex gap-3 text-[10px] items-center border-t border-dashed border-gray-100 pt-2 text-gray-500">
                                                        <div className="flex items-center gap-1">
                                                            <Activity size={10}/>
                                                            <span>Tension:</span>
                                                            <input type="range" min="1" max="10" value={node.tension || 5} 
                                                                onChange={e => {
                                                                    const newNodes = [...plotData.nodes];
                                                                    const target = newNodes.find(n => n.id === node.id);
                                                                    if(target) target.tension = parseInt(e.target.value);
                                                                    handleUpdate('nodes', newNodes);
                                                                }}
                                                                className="w-16 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <LinkIcon size={10}/>
                                                            <span>Caused By:</span>
                                                            <select 
                                                                value={node.causalLink || ''}
                                                                onChange={e => {
                                                                    const newNodes = [...plotData.nodes];
                                                                    const target = newNodes.find(n => n.id === node.id);
                                                                    if(target) target.causalLink = e.target.value;
                                                                    handleUpdate('nodes', newNodes);
                                                                }}
                                                                className="bg-transparent border-b border-gray-200 outline-none w-20 truncate"
                                                            >
                                                                <option value="">None</option>
                                                                {sortedNodes.filter(n => n.id !== node.id).map(n => (
                                                                    <option key={n.id} value={n.id}>{n.title}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        {node.type === 'foreshadowing' && (
                                                            <div className="flex items-center gap-1 text-purple-600">
                                                                <Eye size={10}/>
                                                                <span>Payoff In:</span>
                                                                <select 
                                                                    value={node.foreshadowLink || ''}
                                                                    onChange={e => {
                                                                        const newNodes = [...plotData.nodes];
                                                                        const target = newNodes.find(n => n.id === node.id);
                                                                        if(target) target.foreshadowLink = e.target.value;
                                                                        handleUpdate('nodes', newNodes);
                                                                    }}
                                                                    className="bg-transparent border-b border-purple-200 outline-none w-20 truncate"
                                                                >
                                                                    <option value="">Pending</option>
                                                                    {sortedNodes.filter(n => n.id !== node.id).map(n => (
                                                                        <option key={n.id} value={n.id}>{n.title}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button onClick={() => {
                                                        handleUpdate('nodes', plotData.nodes.filter(n => n.id !== node.id));
                                                    }} className="absolute right-2 top-2 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Trash2 size={12}/>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* VISUALS VIEW */}
                        {activeTab === 'visuals' && (
                            <div className="h-full flex flex-col gap-6 overflow-y-auto pr-2">
                                {/* Tension Curve */}
                                <div className="bg-white p-4 rounded-lg border shadow-sm">
                                    <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                        <TrendingUp className="text-orange-500"/> Narrative Tension Curve
                                    </h4>
                                    <div className="h-48 w-full border-l border-b border-gray-200 relative">
                                        <svg width="100%" height="100%" viewBox="0 0 600 200" preserveAspectRatio="none">
                                            {/* Grid */}
                                            <line x1="0" y1="100" x2="600" y2="100" stroke="#f0f0f0" strokeDasharray="4"/>
                                            
                                            {/* Curve */}
                                            <polyline 
                                                points={getTensionPoints()}
                                                fill="none"
                                                stroke="#f97316"
                                                strokeWidth="3"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                            {/* Dots */}
                                            {sortedNodes.map((n, i) => {
                                                const maxCh = sortedNodes.reduce((max, n) => Math.max(max, parseInt(n.chapterRange?.split('-')[1] || n.chapterRange?.split('-')[0] || '0')), 0) || 20;
                                                const x = (parseInt(n.chapterRange?.split('-')[0] || '0') / maxCh) * 600;
                                                const y = 200 - ((n.tension || 5) / 10) * 200;
                                                return (
                                                    <circle key={i} cx={x} cy={y} r="3" fill="#f97316">
                                                        <title>{n.title} (Tension: {n.tension})</title>
                                                    </circle>
                                                );
                                            })}
                                        </svg>
                                    </div>
                                    <div className="text-center text-xs text-gray-400 mt-2">Story Progression (Chapters) &rarr;</div>
                                </div>

                                {/* Foreshadowing Tracker */}
                                <div className="bg-white p-4 rounded-lg border shadow-sm">
                                    <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                        <Anchor className="text-purple-500"/> Foreshadowing Tracker
                                    </h4>
                                    <div className="space-y-2">
                                        {plotData.nodes.filter(n => n.type === 'foreshadowing').length === 0 && (
                                            <div className="text-gray-400 text-sm">No foreshadowing nodes defined yet.</div>
                                        )}
                                        {plotData.nodes.filter(n => n.type === 'foreshadowing').map(node => {
                                            const payoff = plotData.nodes.find(n => n.id === node.foreshadowLink);
                                            return (
                                                <div key={node.id} className="flex items-center justify-between p-3 border rounded bg-purple-50/30">
                                                    <div>
                                                        <div className="text-sm font-bold text-purple-800">Setup: {node.title}</div>
                                                        <div className="text-xs text-gray-500">{node.description} (Ch. {node.chapterRange})</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-gray-300">&rarr;</span>
                                                        {payoff ? (
                                                            <div className="text-right">
                                                                <div className="text-sm font-bold text-green-700">Payoff: {payoff.title}</div>
                                                                <div className="text-xs text-gray-500">(Ch. {payoff.chapterRange})</div>
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm font-bold text-red-400 italic">Unresolved</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* LOGIC CHECK VIEW */}
                        {activeTab === 'logic' && (
                            <div className="h-full flex flex-col">
                                <div className="mb-4">
                                    <button onClick={handleCheckLogic} disabled={isGenerating} className="w-full py-3 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-lg font-bold flex items-center justify-center gap-2 border border-orange-200">
                                        {isGenerating ? <Loader2 size={18} className="animate-spin"/> : <AlertTriangle size={18}/>}
                                        <span>Check Plot Consistency & Causality</span>
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto bg-white p-6 rounded-lg border border-gray-200 prose prose-sm max-w-none shadow-inner">
                                    {analysisReport ? (
                                        <div dangerouslySetInnerHTML={{ __html: analysisReport.replace(/\n/g, '<br/>') }} />
                                    ) : (
                                        <div className="text-gray-400 text-center mt-20">Run check to identify plot holes or timeline issues.</div>
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
