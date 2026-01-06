
import { GoogleGenAI, Type, Schema, GenerateContentResponse } from "@google/genai";
import { NovelSettings, Chapter, ModelProvider, Character, GrammarIssue, WorldData, WorldLocation, WorldEvent, WorldTerm, PlotData, PlotNode } from "../types";
import { DEFAULT_PROMPTS, PROMPT_KEYS, fillPrompt } from "./promptTemplates";

const GEMINI_API_KEY = process.env.API_KEY || '';

// --- Universal Helpers ---

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getPromptTemplate = (key: string, settings: NovelSettings) => {
    return settings.customPrompts?.[key] || DEFAULT_PROMPTS[key] || "";
};

// Centralized Helper for Model/Key Resolution
const getModelConfig = (settings: NovelSettings) => {
    let model = settings.modelName || "";
    let apiKey = settings.apiKey || "";
    
    if (settings.provider === 'gemini') {
        apiKey = GEMINI_API_KEY; // Always use env var for Gemini per guidelines
        if (!model) model = "gemini-3-flash-preview"; 
    } else if (settings.provider === 'alibaba') {
        if (!model) model = "qwen-plus";
    }
    
    return { model, apiKey, provider: settings.provider };
};

// Helper to handle cancellation
async function wrapWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return new Promise((resolve, reject) => {
        const abortHandler = () => {
            reject(new DOMException('Aborted', 'AbortError'));
        };
        signal.addEventListener('abort', abortHandler);
        promise.then(
            res => {
                signal.removeEventListener('abort', abortHandler);
                resolve(res);
            },
            err => {
                signal.removeEventListener('abort', abortHandler);
                reject(err);
            }
        );
    });
}

// Helper to sanitize system instructions for strict providers
const getSystemInstruction = (base: string, settings: NovelSettings) => {
    if (settings.provider === 'alibaba') {
        return `${base}\nSAFETY REQUIREMENT: Output must be safe for general audiences. Strictly avoid explicit violence, gore, sexual content, or sensitive political topics. Describe tension psychologically or implicitly rather than graphically.`;
    }
    return base;
};

// Helper to sanitize character object to ensure fields are strings
export const sanitizeCharacter = (char: any): Character => {
    const ensureString = (val: any) => {
        if (typeof val === 'string') return val;
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') {
            // Flatten object to string (e.g. relationship map)
            return Object.entries(val).map(([k, v]) => `${k}: ${v}`).join('; ');
        }
        return String(val);
    };

    return {
        name: ensureString(char.name),
        role: ensureString(char.role),
        description: ensureString(char.description),
        relationships: ensureString(char.relationships),
        imageUrl: char.imageUrl ? ensureString(char.imageUrl) : undefined,
        voiceGuide: char.voiceGuide ? ensureString(char.voiceGuide) : undefined,
        arc: char.arc ? ensureString(char.arc) : undefined,
        psychology: char.psychology ? ensureString(char.psychology) : undefined,
        goals: char.goals ? ensureString(char.goals) : undefined,
        backgroundStory: char.backgroundStory ? ensureString(char.backgroundStory) : undefined,
        skills: char.skills ? ensureString(char.skills) : undefined,
        personalityTags: char.personalityTags // Object is fine
    };
};

async function withRetry<T>(operation: () => Promise<T>, retries = 3, baseDelay = 2000): Promise<T> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            const msg = error?.message || JSON.stringify(error);
            const isRateLimit = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
            const isServer = msg.includes('500') || msg.includes('503') || msg.includes('Overloaded');
            const isNetwork = msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch failed');
            const isAborted = msg.includes('Aborted') || error.name === 'AbortError';
            // Don't retry safety blocks or bad request (400/404) unless it's a specific known transient issue
            const isSafetyBlock = msg.includes('data_inspection_failed') || msg.includes('inappropriate content');
            const isAuthError = msg.includes('401') || msg.includes('Unauthorized');
            const isNotFound = msg.includes('404') || msg.includes('not exist');

            if (isAborted || isSafetyBlock || isAuthError || isNotFound) throw error; 
            
            if (isRateLimit) {
                // If it is the LAST retry, we shouldn't wait, just loop to fail
                if (i === retries - 1) break;

                // Aggressive backoff for rate limits: 10s, 20s, 40s... to allow quota to reset
                // Cap at 60s wait per try to avoid hanging forever
                const rawDelay = 10000 * Math.pow(2, i); 
                const delay = Math.min(rawDelay, 60000); 

                console.warn(`API Rate Limit (${msg}). Retrying in ${delay/1000}s...`);
                await wait(delay);
                continue;
            }

            if ((isServer || isNetwork) && i < retries - 1) {
                const delay = baseDelay * Math.pow(2, i); // 2s, 4s, 8s
                console.warn(`API Error (${msg}). Retrying in ${delay}ms...`);
                await wait(delay);
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}

function cleanAndParseJson(text: string) {
    if (!text) return [];
    let clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    const tryParse = (str: string) => {
        try { return JSON.parse(str); } catch (e) { return null; }
    };

    let result = tryParse(clean);
    if (result) return result;

    const fixUnquoted = (str: string) => {
        // Broad key matching for all JSON structures we use
        const keys = ['summary', 'title', 'description', 'relationships', 'name', 'role', 'content', 'id', 'original', 'suggestion', 'explanation', 'volume_number', 'volume_title', 'chapters', 'volumeId', 'volumeTitle', 'term', 'definition', 'category', 'year', 'x', 'y', 'type', 'issues', 'analysis', 'storylineId', 'chapterRange', 'tension', 'premise', 'mainCategory', 'worldSetting', 'voiceGuide'];
        let fixed = str;
        keys.forEach(key => {
             if (key === 'id' || key === 'volume_number' || key === 'volumeId' || key === 'x' || key === 'y' || key === 'storylineId' || key === 'tension') return;
             const regex = new RegExp(`"${key}"\\s*:\\s*(?![{\\["\\d]|true|false|null)([^,}\\]]+)`, 'g');
             fixed = fixed.replace(regex, (match, val) => {
                const trimmed = val.trim();
                if (!isNaN(Number(trimmed))) return match; 
                return `"${key}": "${trimmed.replace(/"/g, '\\"')}"`;
             });
        });
        return fixed;
    };
    
    result = tryParse(fixUnquoted(clean));
    if (result) return result;

    // Last ditch: try to find array brackets
    const firstBracket = clean.indexOf('[');
    const lastBracket = clean.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        const arrayStr = clean.substring(firstBracket, lastBracket + 1);
        result = tryParse(arrayStr);
        if (result) return result;
        result = tryParse(fixUnquoted(arrayStr));
        if (result) return result;
    }
    
    console.error("JSON Parse Failed. Raw:", text);
    throw new Error(`JSON Parse Error: Could not parse or repair output. Raw: ${text.slice(0, 50)}...`);
}

// ... (Stream helpers unchanged) ...
async function* streamOpenAICompatible(
    url: string, 
    apiKey: string, 
    model: string, 
    messages: any[], 
    systemInstruction?: string, 
    temperature: number = 0.7, 
    maxTokens?: number, 
    signal?: AbortSignal,
    onUsage?: (u: {input: number, output: number}) => void
): AsyncGenerator<string, void, unknown> {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  const body: any = {
    model: model,
    messages: [
       ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []),
       ...messages
    ],
    stream: true,
    stream_options: { include_usage: true }, 
    temperature: temperature
  };

  if (maxTokens) body.max_tokens = maxTokens;

  let response: Response | null = null;
  for(let i=0; i<5; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
        if (!response.ok) {
             const errorText = await response.text();
             let errorMsg = errorText;
             try {
                const jsonErr = JSON.parse(errorText);
                errorMsg = jsonErr.error?.message || jsonErr.message || errorText;
             } catch(e) {}
             
             if (response.status === 429 || errorMsg.includes('quota') || errorMsg.includes('429')) {
                 if (i === 4) throw new Error(`Provider API Rate Limit: ${response.status} ${errorMsg}`);
                 await wait(5000 * Math.pow(2, i));
                 continue;
             }
             throw new Error(`Provider API Error: ${response.status} ${errorMsg}`);
        }
        break; 
      } catch (e: any) {
          if (i === 4) throw e;
          await wait(2000 * Math.pow(2, i));
      }
  }

  if (!response || !response.body) throw new Error("Failed to get response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
      while (true) {
        if (signal?.aborted) {
            reader.cancel();
            throw new DOMException('Aborted', 'AbortError');
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') continue;
          try {
            const json = JSON.parse(dataStr);
            if (json.usage && onUsage) {
                onUsage({ input: json.usage.prompt_tokens || 0, output: json.usage.completion_tokens || 0 });
            }
            const content = json.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch (e) {}
        }
      }
  } catch (e) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw e;
  }
}

async function fetchOpenAICompatible(url: string, apiKey: string, model: string, messages: any[], systemInstruction?: string, signal?: AbortSignal, maxTokens?: number, onUsage?: (u: {input: number, output: number}) => void) {
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    const body: any = {
        model: model,
        messages: [ ...(systemInstruction ? [{ role: 'system', content: systemInstruction }] : []), ...messages ],
        stream: false
    };
    if (maxTokens) body.max_tokens = maxTokens;

    return await withRetry(async () => {
        const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
        if(!response.ok) {
            const txt = await response.text();
            throw new Error(`API Error: ${response.status} ${txt}`);
        }
        const json = await response.json();
        if (json.usage && onUsage) onUsage({ input: json.usage.prompt_tokens || 0, output: json.usage.completion_tokens || 0 });
        return json.choices?.[0]?.message?.content || "";
    }, 3);
}

// ... (existing helper functions) ...

const buildGenreString = (settings: NovelSettings): string => {
    let genreStr = `主分类: ${settings.mainCategory}`;
    if (settings.themes && settings.themes.length > 0) {
        genreStr += `, 主题: ${settings.themes.join('/')}`;
    }
    if (settings.roles && settings.roles.length > 0) {
        genreStr += `, 角色: ${settings.roles.join('/')}`;
    }
    if (settings.plots && settings.plots.length > 0) {
        genreStr += `, 情节: ${settings.plots.join('/')}`;
    }
    return genreStr;
};

const getGenreSpecificInstructions = (settings: NovelSettings) => {
    const mainCat = settings.mainCategory;
    let instructions = "";
    if (mainCat.includes('玄幻') || mainCat.includes('仙侠') || mainCat.includes('武侠')) {
         instructions += `\nGENRE GUIDE - EASTERN FANTASY/CULTIVATION (玄幻/仙侠/武侠):\n- **Key Elements**: Cultivation ranks, martial arts sects, immortality, ruthlessness, strength rules.\n`;
    } else if (mainCat.includes('都市') || mainCat.includes('现实') || mainCat.includes('职场')) {
         instructions += `\nGENRE GUIDE - URBAN/MODERN (都市/现实):\n- **Key Elements**: Modern cities, career success, social dynamics, realistic relationships.\n`;
    } else if (mainCat.includes('言情') || mainCat.includes('婚恋')) {
         instructions += `\nGENRE GUIDE - ROMANCE (言情):\n- **Key Elements**: Relationship development, emotional growth, intimacy, psychological tension.\n`;
    } else if (mainCat.includes('悬疑') || mainCat.includes('灵异') || mainCat.includes('惊悚')) {
         instructions += `\nGENRE GUIDE - SUSPENSE/THRILLER (悬疑/灵异):\n- **Key Elements**: High stakes, hidden truths, atmosphere of fear or mystery, unreliable narration.\n`;
    } else if (mainCat.includes('科幻') || mainCat.includes('未来世界')) {
         instructions += `\nGENRE GUIDE - SCI-FI (科幻):\n- **Key Elements**: Futuristic technology, space/time travel, AI, societal changes.\n`;
    } else if (mainCat.includes('历史') || mainCat.includes('军事')) {
         instructions += `\nGENRE GUIDE - HISTORY (历史/军事):\n- **Key Elements**: Historical accuracy or plausible alternate history, warfare, kingdom building, strategy.\n`;
    } else if (mainCat.includes('游戏')) {
         instructions += `\nGENRE GUIDE - GAMING (网游):\n- **Key Elements**: Game mechanics, levels, skills, e-sports, virtual vs reality.\n`;
    }
    instructions += `\nIMPORTANT: Integrate the selected themes (${settings.themes?.join(',') || 'none'}) and plot elements (${settings.plots?.join(',') || 'none'}) naturally into the narrative. If the role is '${settings.roles?.join(',') || 'none'}', ensure the protagonist acts accordingly.`;
    return instructions;
};

const getStyleInstructions = (settings: NovelSettings) => {
    const { writingStyle, narrativePerspective, writingTone, pacing, rhetoricLevel } = settings;
    
    let stylePrompt = `\n### WRITING STYLE CONFIGURATION\n`;
    stylePrompt += `- **Perspective**: ${narrativePerspective}\n`;
    stylePrompt += `- **Tone**: ${writingTone}\n`;
    stylePrompt += `- **Complexity**: ${writingStyle}\n`;
    
    // Pacing Control
    if (pacing === 'Fast') {
        stylePrompt += `- **Pacing (FAST)**: Use shorter sentences and paragraphs. Focus heavily on action, dialogue, and advancing the plot quickly. Minimize static descriptions.\n`;
    } else if (pacing === 'Slow') {
        stylePrompt += `- **Pacing (SLOW)**: Take time to build atmosphere. Use detailed sensory descriptions, internal monologues, and world-building elements. Allow scenes to breathe.\n`;
    } else {
        stylePrompt += `- **Pacing (MODERATE)**: Balance dialogue, action, and description. Maintain a steady narrative flow.\n`;
    }

    // Rhetoric / Expressiveness
    if (rhetoricLevel === 'Rich') {
        stylePrompt += `- **Rhetoric (RICH)**: Use vivid imagery, metaphors, similes, and personification. The language should be expressive, literary, and evocative.\n`;
    } else if (rhetoricLevel === 'Plain') {
        stylePrompt += `- **Rhetoric (PLAIN)**: Use direct, clear, and concise language. Avoid flowery adjectives or complex metaphors. Focus on clarity and function.\n`;
    } else {
        stylePrompt += `- **Rhetoric (BALANCED)**: Use rhetorical devices where appropriate to highlight emotional moments or key settings, but keep the prose accessible.\n`;
    }

    // Character Voices
    stylePrompt += `- **Character Voices**: Ensure each character's dialogue matches their defined personality, role, and background. \n`;
    stylePrompt += `  - A 'Cold' character should speak concisely and detachedly.\n`;
    stylePrompt += `  - A 'Cheerful' character should use exclamation points, energetic phrasing, and informal language.\n`;
    stylePrompt += `  - An 'Intellectual' character should use more complex vocabulary.\n`;
    stylePrompt += `  - **CRITICAL**: Do not make all characters sound the same.`;

    return stylePrompt;
};

const getBaseUrl = (settings: NovelSettings) => {
    if (settings.provider === 'alibaba') return "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
    if (settings.provider === 'volcano') return "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
    if (settings.provider === 'custom') return settings.baseUrl || "";
    return "";
}

// --- Common ---

const runSimpleGeneration = async (prompt: string, settings: NovelSettings): Promise<string> => {
    const { model, apiKey, provider } = getModelConfig(settings);
    const systemInstruction = getSystemInstruction("You are a helpful creative writing assistant.", settings);

    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const config: any = { systemInstruction };
        if (settings.maxOutputTokens) config.maxOutputTokens = settings.maxOutputTokens;
        
        const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model, contents: prompt, config }));
        return response.text || "";
    } else {
        const url = getBaseUrl(settings);
        return await fetchOpenAICompatible(
            url, 
            apiKey, 
            model, 
            [{role: 'user', content: prompt}], 
            systemInstruction, 
            undefined, // signal
            settings.maxOutputTokens
        );
    }
};

export const analyzeImportedNovel = async (content: string, settings: NovelSettings): Promise<{
    title: string;
    premise: string;
    mainCategory: string;
    characters: Character[];
    worldSetting: string;
}> => {
    const { model, apiKey, provider } = getModelConfig(settings);
    const template = getPromptTemplate(PROMPT_KEYS.ANALYZE_IMPORTED_NOVEL, settings);
    
    // Take first 15000 chars for analysis to avoid token limits
    const prompt = fillPrompt(template, {
        content: content.slice(0, 15000),
        language: settings.language === 'zh' ? "Chinese" : "English"
    });

    let resultText = "";
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const responseSchema: Schema = {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING },
                premise: { type: Type.STRING },
                mainCategory: { type: Type.STRING },
                worldSetting: { type: Type.STRING },
                characters: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            role: { type: Type.STRING },
                            description: { type: Type.STRING },
                            relationships: { type: Type.STRING },
                            voiceGuide: { type: Type.STRING }
                        },
                        required: ["name", "role", "description"]
                    }
                }
            },
            required: ["title", "premise", "mainCategory", "characters", "worldSetting"]
        };
        const config: any = { responseMimeType: "application/json", responseSchema };
        const response = await withRetry(() => ai.models.generateContent({ model, contents: prompt, config }));
        resultText = (response as any).text || "{}";
    } else {
        const url = getBaseUrl(settings);
        resultText = await fetchOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt}], undefined, undefined, settings.maxOutputTokens);
    }
    
    const parsed = cleanAndParseJson(resultText);
    return {
        title: parsed.title || "Imported Novel",
        premise: parsed.premise || "",
        mainCategory: parsed.mainCategory || "Uncategorized",
        worldSetting: parsed.worldSetting || "",
        characters: (parsed.characters || []).map(sanitizeCharacter)
    };
};

// ... (World Building & Basic Exports kept) ...
export const generateWorldFoundation = async (settings: NovelSettings, category: 'geography' | 'society' | 'culture' | 'technology'): Promise<string> => {
    const template = `Create detailed ${category} settings for a novel.
    Title: {{title}}
    Genre: {{genre}}
    Premise: {{premise}}
    Existing World Context: {{world}}
    Requirement: Focus strictly on ${category}. Be creative. Output in Markdown.`;
    const prompt = fillPrompt(template, { title: settings.title, genre: buildGenreString(settings), premise: settings.premise, world: settings.worldSetting || "None" });
    return runSimpleGeneration(prompt, settings);
};

export const generateWorldLocations = async (settings: NovelSettings): Promise<WorldLocation[]> => {
    const { model, apiKey, provider } = getModelConfig(settings);
    const prompt = `Generate 5-10 key locations for the world map. Title: ${settings.title} Genre: ${buildGenreString(settings)} Output JSON Array of objects: { "name", "description", "type": "city"|"landmark"|"region", "x": number(0-400), "y": number(0-300) }`;
    let resultText = "";
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const responseSchema: Schema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, description: { type: Type.STRING }, type: { type: Type.STRING, enum: ['city', 'landmark', 'region'] }, x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, }, required: ["name", "description", "type", "x", "y"], } };
        const config: any = { responseMimeType: "application/json", responseSchema };
        const response = await withRetry(() => ai.models.generateContent({ model, contents: prompt, config }));
        resultText = (response as any).text || "[]";
    } else {
        const url = getBaseUrl(settings);
        resultText = await fetchOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt}], undefined, undefined, settings.maxOutputTokens);
    }
    const parsed = cleanAndParseJson(resultText);
    return Array.isArray(parsed) ? parsed.map((l: any) => ({ ...l, id: crypto.randomUUID() })) : [];
};

export const generateWorldTimeline = async (settings: NovelSettings): Promise<WorldEvent[]> => {
    const { model, apiKey, provider } = getModelConfig(settings);
    const prompt = `Generate a timeline of 5-10 major historical events. Title: ${settings.title} Output JSON Array: { "year", "description" }`;
    let resultText = "";
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const responseSchema: Schema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { year: { type: Type.STRING }, description: { type: Type.STRING }, }, required: ["year", "description"], } };
        const config: any = { responseMimeType: "application/json", responseSchema };
        const response = await withRetry(() => ai.models.generateContent({ model, contents: prompt, config }));
        resultText = (response as any).text || "[]";
    } else {
        const url = getBaseUrl(settings);
        resultText = await fetchOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt}], undefined, undefined, settings.maxOutputTokens);
    }
    const parsed = cleanAndParseJson(resultText);
    return Array.isArray(parsed) ? parsed.map((e: any) => ({ ...e, id: crypto.randomUUID() })) : [];
};

export const analyzeWorldConsistency = async (world: WorldData, settings: NovelSettings): Promise<string> => {
    const template = `Analyze the world settings for contradictions. Geography: ${world.geography} Society: ${world.society} Culture: ${world.culture} Technology: ${world.technology} Output concise report in Markdown.`;
    return runSimpleGeneration(template, settings);
};

// --- Plot Planning Services ---

export const generatePlotStructure = async (settings: NovelSettings, structureType: string = 'Three-Act'): Promise<string> => {
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_PLOT_STRUCTURE, settings);
    const prompt = fillPrompt(template, {
        title: settings.title,
        genre: buildGenreString(settings),
        premise: settings.premise,
        language: settings.language === 'zh' ? "Chinese" : "English"
    });
    return runSimpleGeneration(prompt, settings);
};

export const generatePlotNodes = async (settings: NovelSettings, structure: string, storylines: any[]): Promise<PlotNode[]> => {
    const { model, apiKey, provider } = getModelConfig(settings);
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_PLOT_NODES, settings);
    
    const storylineStr = storylines.map(s => `${s.name} (${s.type}): ${s.description}`).join('\n');
    
    const prompt = fillPrompt(template, {
        title: settings.title,
        structure: structure,
        storylines: storylineStr
    });

    let resultText = "";
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const responseSchema: Schema = {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['inciting_incident', 'turning_point', 'midpoint', 'climax', 'resolution', 'foreshadowing', 'callback'] },
                    storylineId: { type: Type.STRING },
                    chapterRange: { type: Type.STRING },
                    tension: { type: Type.INTEGER },
                },
                required: ["title", "description", "type", "chapterRange", "tension"],
            }
        };
        const config: any = { responseMimeType: "application/json", responseSchema };
        const response = await withRetry(() => ai.models.generateContent({ model, contents: prompt, config }));
        resultText = (response as any).text || "[]";
    } else {
        const url = getBaseUrl(settings);
        resultText = await fetchOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt}], undefined, undefined, settings.maxOutputTokens);
    }
    const parsed = cleanAndParseJson(resultText);
    return Array.isArray(parsed) ? parsed.map((n: any) => ({ ...n, id: crypto.randomUUID(), tension: n.tension || 5 })) : [];
};

export const analyzePacing = async (content: string, settings: NovelSettings): Promise<string> => {
    const template = getPromptTemplate(PROMPT_KEYS.ANALYZE_PACING, settings);
    const prompt = fillPrompt(template, {
        content: content.slice(0, 15000)
    });
    return runSimpleGeneration(prompt, settings);
};

export const checkPlotLogic = async (plotData: PlotData, settings: NovelSettings): Promise<string> => {
    const template = getPromptTemplate(PROMPT_KEYS.CHECK_PLOT_LOGIC, settings);
    const plan = `
    Acts: ${plotData.act1} | ${plotData.act2} | ${plotData.act3}
    Nodes: ${plotData.nodes.map(n => `${n.title} (${n.type})`).join(' -> ')}
    `;
    const prompt = fillPrompt(template, {
        plan: plan
    });
    return runSimpleGeneration(prompt, settings);
};

export const analyzeCharacterDepth = async (character: Character, settings: NovelSettings): Promise<string> => {
    const template = getPromptTemplate(PROMPT_KEYS.ANALYZE_CHARACTER_DEPTH, settings);
    const prompt = fillPrompt(template, {
        name: character.name,
        role: character.role,
        description: character.description,
        relationships: character.relationships
    });
    return runSimpleGeneration(prompt, settings);
};

// ... (Existing exports: generateOutline, generateCharacters, etc. KEEP THEM) ...

// Updated generateOutline to include Plot Context if available
export const generateOutline = async (settings: NovelSettings, signal?: AbortSignal, onUsage?: (u: {input: number, output: number}) => void): Promise<Omit<Chapter, 'content' | 'isGenerating' | 'isDone'>[]> => {
  const { model, apiKey, provider } = getModelConfig(settings);
  const languageInstruction = settings.language === 'zh' ? "OUTPUT LANGUAGE: Chinese (Simplified)." : "OUTPUT LANGUAGE: English.";
  const genreInstructions = getGenreSpecificInstructions(settings);
  const genreString = buildGenreString(settings);
  const targetCount = settings.chapterCount || 20;

  const worldSettingContext = settings.worldSetting ? `WORLD SETTING: ${settings.worldSetting}` : ``;
  const charContext = settings.mainCharacters ? `CHARACTERS: ${settings.mainCharacters}` : ``;
  
  // Inject Plot Plan
  let plotContext = "";
  if (settings.plotData) {
      plotContext = `
      ACT 1: ${settings.plotData.act1}
      ACT 2: ${settings.plotData.act2}
      ACT 3: ${settings.plotData.act3}
      KEY PLOT NODES:
      ${settings.plotData.nodes.map(n => `- ${n.title} (${n.chapterRange}): ${n.description}`).join('\n')}
      `;
  }

  const template = getPromptTemplate(PROMPT_KEYS.GENERATE_OUTLINE, settings);
  const systemInstruction = getSystemInstruction("You are an expert novelist planning a story.", settings);

  // Volume Structure Logic (Simplified for brevity in update, keep logic same as before)
  const VOLUME_THRESHOLD = 120;
  let volumePlanStr = "";
  const volumeMap: { start: number, end: number, id: number }[] = [];
  if (targetCount > VOLUME_THRESHOLD) {
      const optimalVolSize = 100;
      const numVolumes = Math.ceil(targetCount / optimalVolSize);
      const volSize = Math.ceil(targetCount / numVolumes);
      let start = 1;
      for (let i = 1; i <= numVolumes; i++) {
          const end = Math.min(start + volSize - 1, targetCount);
          volumeMap.push({ start, end, id: i });
          volumePlanStr += `Volume ${i}: Chapters ${start}-${end}. `;
          start = end + 1;
      }
      volumePlanStr += "\nEnsure continuity between volumes.";
  } else {
      volumeMap.push({ start: 1, end: targetCount, id: 1 });
      volumePlanStr = "Single Volume (Volume 1).";
  }

  const BATCH_SIZE = 10; 
  let allChapters: Omit<Chapter, 'content' | 'isGenerating' | 'isDone'>[] = [];
  let currentStartId = 1;

  while (currentStartId <= targetCount) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const currentEndId = Math.min(currentStartId + BATCH_SIZE - 1, targetCount);
      const isLastBatch = currentEndId === targetCount;
      const currentVolInfo = volumeMap.find(v => currentStartId >= v.start && currentStartId <= v.end) || volumeMap[0];
      const isVolStart = currentStartId === currentVolInfo.start;
      
      let paginationContext = "";
      if (allChapters.length > 0) {
          const lastChapter = allChapters[allChapters.length - 1];
          paginationContext = `PREVIOUS CONTEXT: Up to Chapter ${lastChapter.id} ("${lastChapter.title}"). LAST EVENTS: ${lastChapter.summary}. CURRENT VOLUME: Volume ${currentVolInfo.id}.`;
          if (isVolStart && currentVolInfo.id > 1) paginationContext += `\nNOTICE: NEW VOLUME (Volume ${currentVolInfo.id}).`;
      } else {
          paginationContext = `STARTING POINT: Chapter 1. Volume 1.`;
      }

      const structureInstruction = `STRICT REQUIREMENT: Generate chapters ${currentStartId} to ${currentEndId}. Return FLAT JSON Array with 'id', 'title', 'summary', 'volumeId', 'volumeTitle'. VOLUME PLAN: ${volumePlanStr}. ${isLastBatch ? "Conclude story." : "Continue story."}`;

      const promptText = fillPrompt(template, {
          title: settings.title,
          genre: genreString,
          language: languageInstruction,
          premise: settings.premise,
          format: `Format: Long Novel. Total planned: ${targetCount} chapters.`,
          genreGuide: genreInstructions,
          world: worldSettingContext,
          characters: charContext,
          plotContext: plotContext, 
          paginationContext: paginationContext,
          structure: structureInstruction
      });

      let batchResult: any[] = [];
      
      if (provider === 'gemini') {
          const ai = new GoogleGenAI({ apiKey });
          const responseSchema: Schema = {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.INTEGER },
                title: { type: Type.STRING },
                summary: { type: Type.STRING },
                volumeId: { type: Type.INTEGER },
                volumeTitle: { type: Type.STRING },
              },
              required: ["id", "title", "summary"],
            },
          };
          const config: any = { responseMimeType: "application/json", responseSchema, systemInstruction };
          if (settings.maxOutputTokens) config.maxOutputTokens = settings.maxOutputTokens;

          const response = await wrapWithSignal(
              withRetry(() => ai.models.generateContent({ model, contents: promptText, config }), 5), 
              signal
          ) as GenerateContentResponse;

          if (response.usageMetadata && onUsage) {
              onUsage({ input: response.usageMetadata.promptTokenCount || 0, output: response.usageMetadata.candidatesTokenCount || 0 });
          }
          batchResult = cleanAndParseJson((response as any).text || "[]");

      } else {
          const url = getBaseUrl(settings);
          if (!url || !apiKey || !model) throw new Error("Configuration Error: API Key/Model/URL missing.");
          const text = await fetchOpenAICompatible(url, apiKey, model, [{role: 'user', content: promptText}], systemInstruction, signal, settings.maxOutputTokens, onUsage);
          batchResult = cleanAndParseJson(text);
      }

      if (!Array.isArray(batchResult)) {
          if (batchResult && typeof batchResult === 'object') {
              if ((batchResult as any).chapters) batchResult = (batchResult as any).chapters;
              else if ((batchResult as any).items) batchResult = (batchResult as any).items;
              else batchResult = [batchResult]; 
          } else {
              batchResult = [];
          }
      }

      let localId = currentStartId;
      for (const item of batchResult) {
          if (!item.title || !item.summary) continue;
          item.id = localId; 
          const correctVol = volumeMap.find(v => item.id >= v.start && item.id <= v.end) || volumeMap[0];
          item.volumeId = correctVol.id;
          if (!item.volumeTitle) {
              const prevInVol = allChapters.find(c => c.volumeId === correctVol.id);
              item.volumeTitle = prevInVol?.volumeTitle || `Volume ${correctVol.id}`;
          }
          allChapters.push(item);
          localId++;
      }

      if (batchResult.length === 0) {
          console.warn("Batch generation returned empty. Stopping early.");
          break; 
      }

      currentStartId += BATCH_SIZE; 
      if (currentStartId <= targetCount) await wait(5000); 
  }

  return allChapters;
};

// ... (keep rest of exports generateCharacterImage, generateTitles, etc. same as before) ...

export const generateCharacterImage = async (character: Character, settings: NovelSettings): Promise<string> => {
    const { apiKey } = getModelConfig(settings);
    const model = 'gemini-2.5-flash-image';
    if (!apiKey) throw new Error("API Key required for image generation");
    const prompt = `Character Portrait for Novel. Name: ${character.name} Role: ${character.role} Description: ${character.description} Genre Style: ${settings.mainCategory} (${settings.writingTone}). Art Style: High quality digital art, detailed, expressive.`;
    const ai = new GoogleGenAI({ apiKey });
    const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ model, contents: { parts: [{ text: prompt }] } }));
    const parts = response.candidates?.[0]?.content?.parts;
    if (parts) {
        for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
                const mimeType = part.inlineData.mimeType || 'image/png';
                return `data:${mimeType};base64,${part.inlineData.data}`;
            }
        }
    }
    throw new Error("No image data returned from API.");
};

export const generateTitles = async (settings: NovelSettings): Promise<string[]> => {
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_TITLES, settings);
    const prompt = fillPrompt(template, { genre: buildGenreString(settings), premise: settings.premise || "Untitled Story", language: settings.language === 'zh' ? "Output: Chinese" : "Output: English", });
    const { model, apiKey, provider } = getModelConfig(settings);
    let resultText = "";
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const responseSchema: Schema = { type: Type.ARRAY, items: { type: Type.STRING } };
        const config: any = { responseMimeType: "application/json", responseSchema };
        if (settings.maxOutputTokens) config.maxOutputTokens = settings.maxOutputTokens;
        const response = await withRetry(() => ai.models.generateContent({ model, contents: prompt, config }));
        resultText = (response as any).text || "[]";
    } else {
        const url = getBaseUrl(settings);
        resultText = await fetchOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt + "\nOutput JSON Array of strings."}], undefined, undefined, settings.maxOutputTokens);
    }
    const parsed = cleanAndParseJson(resultText);
    return Array.isArray(parsed) ? parsed : [];
};

export const generatePremise = async (title: string, currentPremise: string, settings: NovelSettings): Promise<string> => {
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_PREMISE, settings);
    const prompt = fillPrompt(template, { task: "Create a compelling novel premise based on the title and any existing ideas.", title: title || "Untitled", genre: buildGenreString(settings), language: settings.language === 'zh' ? "Chinese" : "English", premise: currentPremise || "None" });
    return runSimpleGeneration(prompt, settings);
};

export const generateWorldSetting = async (settings: NovelSettings): Promise<string> => {
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_WORLD, settings);
    const prompt = fillPrompt(template, { title: settings.title || "Untitled", genre: buildGenreString(settings), language: settings.language === 'zh' ? "Chinese" : "English", premise: settings.premise || "None", specificPrompt: "Include details about magic/technology, geography, and society." });
    return runSimpleGeneration(prompt, settings);
};

export const expandText = async (text: string, contextType: string, settings: NovelSettings): Promise<string> => {
    const template = getPromptTemplate(PROMPT_KEYS.EXPAND_TEXT, settings);
    const prompt = fillPrompt(template, { contextType, title: settings.title || "Untitled", genre: buildGenreString(settings), language: settings.language === 'zh' ? "Chinese" : "English", currentText: text });
    return runSimpleGeneration(prompt, settings);
};

export const generateCharacterConcepts = async (settings: NovelSettings): Promise<string> => {
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_CHARACTERS, settings);
    const prompt = fillPrompt(template, { title: settings.title || "Untitled", genre: buildGenreString(settings), premise: settings.premise || "None", language: settings.language === 'zh' ? "Chinese" : "English", genreGuide: getGenreSpecificInstructions(settings), world: settings.worldSetting || "", characters: "None", count: "3-5" });
    return runSimpleGeneration(prompt, settings);
};

export const generateCharacters = async (settings: NovelSettings, signal?: AbortSignal, onUsage?: any): Promise<Character[]> => {
    const { model, apiKey, provider } = getModelConfig(settings);
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_CHARACTERS, settings);
    const prompt = fillPrompt(template, { title: settings.title || "Untitled", genre: buildGenreString(settings), premise: settings.premise || "None", language: settings.language === 'zh' ? "Chinese" : "English", genreGuide: getGenreSpecificInstructions(settings), world: settings.worldSetting || "", characters: settings.mainCharacters || "Generate new based on premise", count: "4" });
    let resultText = "";
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const responseSchema: Schema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, role: { type: Type.STRING }, description: { type: Type.STRING }, relationships: { type: Type.STRING }, voiceGuide: { type: Type.STRING }, arc: { type: Type.STRING }, }, required: ["name", "role", "description"], } };
        const config: any = { responseMimeType: "application/json", responseSchema };
        if (settings.maxOutputTokens) config.maxOutputTokens = settings.maxOutputTokens;
        const response = await wrapWithSignal(withRetry(() => ai.models.generateContent({ model, contents: prompt, config })), signal) as GenerateContentResponse;
        if (response.usageMetadata && onUsage) { onUsage({ input: response.usageMetadata.promptTokenCount || 0, output: response.usageMetadata.candidatesTokenCount || 0 }); }
        resultText = (response as any).text || "[]";
    } else {
        const url = getBaseUrl(settings);
        resultText = await fetchOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt + "\nOutput JSON Array."}], undefined, signal, settings.maxOutputTokens, onUsage);
    }
    const parsed = cleanAndParseJson(resultText);
    const charArray = Array.isArray(parsed) ? parsed : [];
    return charArray.map(sanitizeCharacter);
};

export const generateSingleCharacter = async (settings: NovelSettings, existingCharacters: Character[]): Promise<Character> => {
    const { model, apiKey, provider } = getModelConfig(settings);
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_SINGLE_CHARACTER, settings);
    const existingSummary = existingCharacters.length > 0 ? existingCharacters.map(c => `${c.name} (${c.role})`).join(", ") : "None";
    const prompt = fillPrompt(template, { title: settings.title || "Untitled", genre: buildGenreString(settings), premise: settings.premise || "None", language: settings.language === 'zh' ? "Chinese" : "English", existingNames: existingSummary, world: settings.worldSetting || "Standard", genreGuide: getGenreSpecificInstructions(settings) });
    let resultText = "";
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const responseSchema: Schema = { type: Type.OBJECT, properties: { name: { type: Type.STRING }, role: { type: Type.STRING }, description: { type: Type.STRING }, relationships: { type: Type.STRING }, voiceGuide: { type: Type.STRING }, arc: { type: Type.STRING }, }, required: ["name", "role", "description"], };
        const config: any = { responseMimeType: "application/json", responseSchema };
        const response = await withRetry(() => ai.models.generateContent({ model, contents: prompt, config }));
        resultText = (response as any).text || "{}";
    } else {
        const url = getBaseUrl(settings);
        resultText = await fetchOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt + "\nOutput JSON Object."}], undefined, undefined, settings.maxOutputTokens);
    }
    const parsed = cleanAndParseJson(resultText);
    return sanitizeCharacter(parsed);
};

export async function* continueWriting(content: string, settings: NovelSettings, chapterTitle: string, characters: Character[]): AsyncGenerator<string, void, unknown> {
    const { model, apiKey, provider } = getModelConfig(settings);
    const charStr = characters.map(c => `${c.name}: ${c.description} (Voice: ${c.voiceGuide || 'Standard'})`).join('\n');
    const prompt = `Continue writing this chapter.\nTitle: ${chapterTitle}\nGenre: ${buildGenreString(settings)}\n${settings.language === 'zh' ? 'Output Chinese.' : 'Output English.'}\nStyle: ${getStyleInstructions(settings)}\nCHARACTERS IN SCENE (Reference only if relevant):\n${charStr}\nCurrent Content:\n"${content.slice(-2500)}"\nContinue the story naturally from here. Do not repeat the last sentence.`;
    if (provider === 'gemini') {
         const ai = new GoogleGenAI({ apiKey });
         const stream = await ai.models.generateContentStream({ model, contents: prompt, config: { maxOutputTokens: settings.maxOutputTokens } });
         for await (const chunk of stream) { const c = chunk as GenerateContentResponse; if ((c as any).text) yield (c as any).text; }
    } else {
         const url = getBaseUrl(settings);
         const stream = streamOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt}], undefined, 0.7, settings.maxOutputTokens);
         for await (const chunk of stream) { yield chunk; }
    }
}

export const checkGrammar = async (content: string, settings: NovelSettings): Promise<GrammarIssue[]> => {
    const { model, apiKey, provider } = getModelConfig(settings);
    const prompt = `Check grammar and spelling.\nContent:\n"${content.slice(0, 4000)}"\nOutput JSON Array of objects: { original: string, suggestion: string, explanation: string }`;
    let resultText = "";
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const responseSchema: Schema = { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { original: { type: Type.STRING }, suggestion: { type: Type.STRING }, explanation: { type: Type.STRING }, }, required: ["original", "suggestion"], } };
        const config: any = { responseMimeType: "application/json", responseSchema };
        const response = await withRetry(() => ai.models.generateContent({ model, contents: prompt, config }));
        resultText = (response as any).text || "[]";
    } else {
        const url = getBaseUrl(settings);
        resultText = await fetchOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt}], undefined, undefined, settings.maxOutputTokens);
    }
    const parsed = cleanAndParseJson(resultText);
    return Array.isArray(parsed) ? parsed : [];
};

export const autoCorrectGrammar = async (content: string, settings: NovelSettings): Promise<string> => {
    const prompt = `Correct grammar and spelling. Output ONLY the corrected text.\nContent:\n"${content}"`;
    return runSimpleGeneration(prompt, settings);
};

export async function* generateChapterStream(settings: NovelSettings, chapter: Chapter, storySummaries: string, previousContent: string, characters: Character[], signal?: AbortSignal, onUsage?: any): AsyncGenerator<string, void, unknown> {
    const { model, apiKey, provider } = getModelConfig(settings);
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_CHAPTER, settings);
    const charStr = characters.map(c => `${c.name} (${c.role}): ${c.description}. Voice: ${c.voiceGuide || 'Normal'}`).join('\n');
    
    // Build Plot Context specific for this chapter
    let plotNodesContext = "No specific plot nodes assigned.";
    if (settings.plotData && settings.plotData.nodes) {
        // Find nodes relevant to this chapter ID (crude parsing "1-3" or "5")
        const currentId = chapter.id;
        const relevantNodes = settings.plotData.nodes.filter(node => {
            if (!node.chapterRange) return false;
            const parts = node.chapterRange.split('-').map(s => parseInt(s.trim()));
            if (parts.length === 1) return parts[0] === currentId;
            if (parts.length === 2) return currentId >= parts[0] && currentId <= parts[1];
            return false;
        });
        if (relevantNodes.length > 0) {
            plotNodesContext = relevantNodes.map(n => `[${n.type.toUpperCase()}] ${n.title}: ${n.description}`).join('\n');
        }
    }

    const prompt = fillPrompt(template, { 
        task: "Write a chapter for the novel.", 
        language: settings.language === 'zh' ? "Output: Chinese" : "Output: English", 
        premise: settings.premise, 
        storySummaries: storySummaries || "No previous chapters.", 
        previousChapterContent: previousContent || "Start of story.", 
        chapterSummary: `Chapter ${chapter.id} Title: ${chapter.title}\nSummary: ${chapter.summary}`, 
        plotNodesContext: plotNodesContext,
        characters: charStr, 
        style: getStyleInstructions(settings), 
        genreGuide: getGenreSpecificInstructions(settings), 
        chapterId: chapter.id.toString() 
    });
    const systemInstruction = getSystemInstruction("You are a professional novelist.", settings);
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const stream = await ai.models.generateContentStream({ model, contents: prompt, config: { systemInstruction, maxOutputTokens: settings.maxOutputTokens } });
        for await (const chunk of stream) { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); const c = chunk as GenerateContentResponse; if (c.usageMetadata && onUsage) { onUsage({ input: 0, output: c.usageMetadata.candidatesTokenCount || 0 }); } if ((c as any).text) yield (c as any).text; }
    } else {
        const url = getBaseUrl(settings);
        const stream = streamOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt}], systemInstruction, 0.7, settings.maxOutputTokens, signal, onUsage);
        for await (const chunk of stream) { yield chunk; }
    }
}

export async function* extendChapter(currentContent: string, settings: NovelSettings, chapterTitle: string, characters: Character[], targetWordCount: number, currentWordCount: number, signal?: AbortSignal, onUsage?: any): AsyncGenerator<string, void, unknown> {
    const { model, apiKey, provider } = getModelConfig(settings);
    const prompt = `The chapter "${chapterTitle}" is currently ${currentWordCount} words long, but needs to be at least ${targetWordCount} words.\nCurrent Content ending:\n"${currentContent.slice(-2000)}"\nTask: Continue the scene naturally to add more depth, dialogue, and detail. Do not rush to finish.\n${settings.language === 'zh' ? "Output: Chinese" : "Output: English"}`;
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const stream = await ai.models.generateContentStream({ model, contents: prompt, config: { maxOutputTokens: settings.maxOutputTokens } });
        for await (const chunk of stream) { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); const c = chunk as GenerateContentResponse; if (c.usageMetadata && onUsage) onUsage({ input: 0, output: c.usageMetadata.candidatesTokenCount || 0 }); if ((c as any).text) yield (c as any).text; }
    } else {
        const url = getBaseUrl(settings);
        const stream = streamOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt}], undefined, 0.7, settings.maxOutputTokens, signal, onUsage);
        for await (const chunk of stream) { yield chunk; }
    }
}

export const summarizeChapter = async (content: string, settings: NovelSettings, onUsage?: any): Promise<string> => {
    const { model, apiKey, provider } = getModelConfig(settings);
    const prompt = `Summarize the following chapter content into a concise paragraph (max 200 words).\nFocus on key plot events and character developments.\n${settings.language === 'zh' ? "Output: Chinese" : "Output: English"}\nContent:\n"${content.slice(0, 15000)}"`;
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const config: any = {};
        if (settings.maxOutputTokens) config.maxOutputTokens = settings.maxOutputTokens;
        const response = await withRetry(() => ai.models.generateContent({ model, contents: prompt, config }));
        if ((response as any).usageMetadata && onUsage) { onUsage({ input: (response as any).usageMetadata.promptTokenCount || 0, output: (response as any).usageMetadata.candidatesTokenCount || 0 }); }
        return (response as any).text || "";
    } else {
        const url = getBaseUrl(settings);
        const text = await fetchOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt}], undefined, undefined, settings.maxOutputTokens, onUsage);
        return text;
    }
};

export const checkConsistency = async (content: string, characters: Character[], settings: NovelSettings, onUsage?: any): Promise<string> => {
    const { model, apiKey, provider } = getModelConfig(settings);
    const template = getPromptTemplate(PROMPT_KEYS.CHECK_CONSISTENCY, settings);
    const charStr = characters.map(c => `Name: ${c.name}, Role: ${c.role}\nDescription: ${c.description}\nVoice Guide: ${c.voiceGuide}\nPersonality/Arc: ${c.arc}`).join('\n---\n');
    const prompt = fillPrompt(template, { characters: charStr, content: content.slice(0, 20000) });
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const config: any = {};
        if (settings.maxOutputTokens) config.maxOutputTokens = settings.maxOutputTokens;
        const response = await withRetry(() => ai.models.generateContent({ model, contents: prompt, config }));
        if ((response as any).usageMetadata && onUsage) { onUsage({ input: (response as any).usageMetadata.promptTokenCount || 0, output: (response as any).usageMetadata.candidatesTokenCount || 0 }); }
        return (response as any).text || "Analysis failed.";
    } else {
         const url = getBaseUrl(settings);
         const text = await fetchOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt}], undefined, undefined, settings.maxOutputTokens, onUsage);
         return text;
    }
};

export const fixChapterConsistency = async (content: string, characters: Character[], analysis: string, settings: NovelSettings, onUsage?: any): Promise<string> => {
    const { model, apiKey, provider } = getModelConfig(settings);
    const template = getPromptTemplate(PROMPT_KEYS.FIX_CONSISTENCY, settings);
    const charStr = characters.map(c => `${c.name} (${c.role}): ${c.description}. Voice: ${c.voiceGuide}`).join('\n');
    const prompt = fillPrompt(template, { analysis: analysis, characters: charStr, content: content });
    if (provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey });
        const config: any = {};
        if (settings.maxOutputTokens) config.maxOutputTokens = settings.maxOutputTokens;
        const response = await withRetry(() => ai.models.generateContent({ model, contents: prompt, config }));
        if ((response as any).usageMetadata && onUsage) { onUsage({ input: (response as any).usageMetadata.promptTokenCount || 0, output: (response as any).usageMetadata.candidatesTokenCount || 0 }); }
        return (response as any).text || content;
    } else {
        const url = getBaseUrl(settings);
        const text = await fetchOpenAICompatible(url, apiKey, model, [{role: 'user', content: prompt}], undefined, undefined, settings.maxOutputTokens, onUsage);
        return text;
    }
};
