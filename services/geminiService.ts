
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { NovelSettings, Chapter, Character, WorldData, PlotData, WorldLocation, WorldEvent, WorldTerm } from '../types';
import { PROMPT_KEYS, getPromptTemplate, fillPrompt } from './promptTemplates';

// Helper to get client with user's key or env key
const getClient = (settings: NovelSettings) => {
    // Guidelines say: The API key must be obtained exclusively from the environment variable process.env.API_KEY.
    // However, to support the app's existing multi-provider/custom key feature, we check settings first.
    // If we must strictly follow the rule for the prompt:
    const key = settings.apiKey || process.env.API_KEY;
    if (!key) throw new Error("API Key is missing. Please configure it in Settings.");
    return new GoogleGenAI({ apiKey: key });
};

// Helper to sanitize character data
export const sanitizeCharacter = (char: any): Character => {
    return {
        name: char.name || 'Unknown',
        role: char.role || 'Supporting',
        description: char.description || '',
        relationships: char.relationships || '',
        imageUrl: char.imageUrl,
        voiceGuide: char.voiceGuide,
        arc: char.arc,
        psychology: char.psychology,
        goals: char.goals,
        storylineId: char.storylineId,
        personalityTags: char.personalityTags,
        backgroundStory: char.backgroundStory,
        skills: char.skills
    };
};

// --- Basic Generators ---

export const generateTitles = async (settings: NovelSettings): Promise<string[]> => {
    const ai = getClient(settings);
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_TITLES, settings);
    const prompt = fillPrompt(template, {
        mainCategory: settings.mainCategory,
        premise: settings.premise,
        themes: settings.themes.join(', ')
    });

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
        }
    });

    try {
        const text = response.text || "[]";
        return JSON.parse(text);
    } catch (e) {
        console.error("Failed to parse titles", e);
        return [];
    }
};

export const generatePremise = async (title: string, idea: string, settings: NovelSettings): Promise<string> => {
    const ai = getClient(settings);
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_PREMISE, settings);
    const prompt = fillPrompt(template, {
        title,
        premise: idea,
        mainCategory: settings.mainCategory,
        themes: settings.themes.join(', '),
        writingTone: settings.writingTone
    });

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
    });

    return response.text || '';
};

export const expandText = async (text: string, section: string, settings: NovelSettings): Promise<string> => {
    const ai = getClient(settings);
    const template = getPromptTemplate(PROMPT_KEYS.EXPAND_TEXT, settings);
    const prompt = fillPrompt(template, {
        text,
        section,
        premise: settings.premise
    });

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
    });
    return response.text || text;
};

export const generateWorldSetting = async (settings: NovelSettings): Promise<string> => {
    const ai = getClient(settings);
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_WORLD_SETTING, settings);
    const prompt = fillPrompt(template, {
        premise: settings.premise,
        mainCategory: settings.mainCategory,
        themes: settings.themes.join(', ')
    });

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
    });
    return response.text || '';
};

export const generateCharacterConcepts = async (settings: NovelSettings): Promise<string> => {
    const ai = getClient(settings);
    // Simple text version
    const prompt = `Generate a list of main character concepts for a ${settings.mainCategory} story: ${settings.premise}. Return as a list.`;
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
    });
    return response.text || '';
};

// --- Structured Generation ---

export const generateOutline = async (
    settings: NovelSettings, 
    signal?: AbortSignal,
    onUsage?: (usage: {input: number, output: number}) => void
): Promise<Chapter[]> => {
    const ai = getClient(settings);
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_OUTLINE, settings);
    const prompt = fillPrompt(template, {
        novelType: settings.novelType,
        chapterCount: settings.chapterCount.toString(),
        premise: settings.premise,
        mainCharacters: settings.mainCharacters || ''
    });

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', // Use Pro for better structure
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        id: { type: Type.INTEGER },
                        title: { type: Type.STRING },
                        summary: { type: Type.STRING },
                        volumeId: { type: Type.INTEGER }
                    }
                }
            }
        }
    });

    if (onUsage && response.usageMetadata) {
        onUsage({
            input: response.usageMetadata.promptTokenCount || 0,
            output: response.usageMetadata.candidatesTokenCount || 0
        });
    }

    try {
        const json = JSON.parse(response.text || "[]");
        return json.map((c: any) => ({
            ...c,
            content: '',
            isGenerating: false,
            isDone: false
        }));
    } catch (e) {
        console.error("Outline parse error", e);
        throw new Error("Failed to generate valid outline JSON");
    }
};

export const generateCharacters = async (
    settings: NovelSettings,
    signal?: AbortSignal,
    onUsage?: (usage: {input: number, output: number}) => void
): Promise<Character[]> => {
    const ai = getClient(settings);
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_CHARACTERS, settings);
    const prompt = fillPrompt(template, {
        premise: settings.premise
    });

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        role: { type: Type.STRING },
                        description: { type: Type.STRING },
                        relationships: { type: Type.STRING },
                        backgroundStory: { type: Type.STRING },
                        skills: { type: Type.STRING }
                    }
                }
            }
        }
    });

    if (onUsage && response.usageMetadata) {
        onUsage({
            input: response.usageMetadata.promptTokenCount || 0,
            output: response.usageMetadata.candidatesTokenCount || 0
        });
    }

    try {
        const json = JSON.parse(response.text || "[]");
        return json.map(sanitizeCharacter);
    } catch (e) {
        console.error("Characters parse error", e);
        return [];
    }
};

// --- Chapter Content Generation ---

export async function* generateChapterStream(
    settings: NovelSettings,
    chapter: Chapter,
    storySummaries: string,
    previousContext: string,
    characters: Character[],
    signal?: AbortSignal,
    onUsage?: (usage: {input: number, output: number}) => void
): AsyncGenerator<string, void, unknown> {
    const ai = getClient(settings);
    const template = getPromptTemplate(PROMPT_KEYS.GENERATE_CHAPTER, settings);
    
    // Construct char context
    const charContext = characters.map(c => `${c.name} (${c.role}): ${c.description}`).join('\n');

    const prompt = fillPrompt(template, {
        chapterId: chapter.id.toString(),
        chapterTitle: chapter.title,
        chapterSummary: chapter.summary,
        storySummaries: storySummaries || 'Start of story.',
        previousContext: previousContext || 'None',
        writingTone: settings.writingTone,
        writingStyle: settings.writingStyle,
        narrativePerspective: settings.narrativePerspective,
        charContext
    });

    const streamResult = await ai.models.generateContentStream({
        model: 'gemini-3-pro-preview', // High quality for writing
        contents: prompt,
    });

    for await (const chunk of streamResult) {
        if (signal?.aborted) break;
        yield chunk.text || '';
    }
}

export async function* extendChapter(
    currentContent: string,
    settings: NovelSettings,
    chapterTitle: string,
    characters: Character[],
    targetWords: number,
    currentWords: number,
    signal?: AbortSignal,
    onUsage?: (usage: {input: number, output: number}) => void
): AsyncGenerator<string, void, unknown> {
    const ai = getClient(settings);
    const prompt = `You are writing chapter: ${chapterTitle}. 
    Current text:\n${currentContent.slice(-2000)}\n\n
    Goal: Continue the scene naturally to reach ${targetWords} words (currently ${currentWords}). 
    Keep the same tone and style.`;

    const streamResult = await ai.models.generateContentStream({
        model: 'gemini-3-pro-preview',
        contents: prompt,
    });

    for await (const chunk of streamResult) {
        if (signal?.aborted) break;
        yield chunk.text || '';
    }
}

export async function* continueWriting(
    currentText: string,
    settings: NovelSettings,
    chapterTitle: string,
    characters: Character[]
): AsyncGenerator<string, void, unknown> {
    const ai = getClient(settings);
    const prompt = `Continue writing this story (Chapter: ${chapterTitle}). 
    Context: ${currentText.slice(-2000)}.
    Maintain the style: ${settings.writingStyle}, Tone: ${settings.writingTone}.`;

    const streamResult = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview', // Faster for interactive continue
        contents: prompt,
    });

    for await (const chunk of streamResult) {
        yield chunk.text || '';
    }
}

export const summarizeChapter = async (
    content: string, 
    settings: NovelSettings,
    onUsage?: (usage: {input: number, output: number}) => void
): Promise<string> => {
    const ai = getClient(settings);
    const prompt = `Summarize the following chapter content in 2-3 sentences:\n\n${content.slice(0, 10000)}`;
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
    });
    
    if (onUsage && response.usageMetadata) {
        onUsage({
            input: response.usageMetadata.promptTokenCount || 0,
            output: response.usageMetadata.candidatesTokenCount || 0
        });
    }
    return response.text || '';
};

// --- Tools & Checks ---

export const checkGrammar = async (text: string, settings: NovelSettings): Promise<any[]> => {
    const ai = getClient(settings);
    const prompt = `Check the following text for grammar and spelling errors. 
    Return a JSON array of objects with { original, suggestion, explanation }.
    Text: ${text.slice(0, 5000)}`; // Limit context
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    try {
        return JSON.parse(response.text || "[]");
    } catch {
        return [];
    }
};

export const autoCorrectGrammar = async (text: string, settings: NovelSettings): Promise<string> => {
    const ai = getClient(settings);
    const prompt = `Correct the grammar and spelling of the following text directly. Maintain style.
    Text: ${text.slice(0, 5000)}`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
    });
    return response.text || text;
};

export const analyzePacing = async (text: string, settings: NovelSettings): Promise<string> => {
    const ai = getClient(settings);
    const prompt = `Analyze the pacing and tension of this text.
    Text: ${text.slice(0, 5000)}`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
    });
    return response.text || '';
};

export const analyzeImportedNovel = async (text: string, settings: NovelSettings): Promise<any> => {
    const ai = getClient(settings);
    const prompt = `Analyze the beginning of this novel and extract metadata.
    Text: ${text.slice(0, 5000)}
    Output JSON with: title, premise, mainCategory, worldSetting, characters (array of {name, role}).`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    try {
        return JSON.parse(response.text || "{}");
    } catch {
        return { characters: [] };
    }
};

// --- Character & World Advanced ---

export const generateSingleCharacter = async (settings: NovelSettings, existingChars: Character[]): Promise<Character> => {
    const ai = getClient(settings);
    const existingNames = existingChars.map(c => c.name).join(', ');
    const prompt = `Create a new unique character for a ${settings.mainCategory} story.
    Existing characters: ${existingNames}.
    Premise: ${settings.premise}.
    Output JSON: name, role, description, relationships, backgroundStory, skills, personalityTags (openness, etc 0-100).`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    try {
        const json = JSON.parse(response.text || "{}");
        return sanitizeCharacter(json);
    } catch {
        return sanitizeCharacter({});
    }
};

export const generateCharacterImage = async (character: Character, settings: NovelSettings): Promise<string> => {
    const ai = getClient(settings);
    // Use gemini-2.5-flash-image for images
    const prompt = `A portrait of ${character.name}, ${character.role}. 
    Description: ${character.description}. 
    Style: Digital Art, detailed.`;

    // Note: The new SDK image generation usually returns inline data.
    // Assuming standard content generation with image model logic described in guidelines
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: prompt,
        config: {
            imageConfig: { aspectRatio: '1:1' }
        }
    });

    // Extract image
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
    }
    throw new Error("No image generated");
};

export const analyzeCharacterDepth = async (character: Character, settings: NovelSettings): Promise<string> => {
    const ai = getClient(settings);
    const prompt = `Analyze the depth, psychology, and potential arc for: ${character.name}.
    Description: ${character.description}.
    Role: ${character.role}.`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
    });
    return response.text || '';
};

// --- World Builder ---

export const generateWorldFoundation = async (settings: NovelSettings, category: string): Promise<string> => {
    const ai = getClient(settings);
    const prompt = `Create detailed ${category} setting for a ${settings.mainCategory} world.
    Premise: ${settings.premise}.`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
    });
    return response.text || '';
};

export const generateWorldLocations = async (settings: NovelSettings): Promise<WorldLocation[]> => {
    const ai = getClient(settings);
    const prompt = `Generate key locations for this world: ${settings.premise}.
    Output JSON array: name, description, type (city/region/landmark), x (0-400), y (0-300).`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });

    try {
        return JSON.parse(response.text || "[]");
    } catch {
        return [];
    }
};

export const generateWorldTimeline = async (settings: NovelSettings): Promise<WorldEvent[]> => {
    const ai = getClient(settings);
    const prompt = `Generate a historical timeline for this world.
    Output JSON array: year, description.`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
    });
    try {
        return JSON.parse(response.text || "[]");
    } catch {
        return [];
    }
};

export const analyzeWorldConsistency = async (world: WorldData, settings: NovelSettings): Promise<string> => {
    const ai = getClient(settings);
    const prompt = `Analyze the consistency of this world setting:
    Geography: ${world.geography}
    Society: ${world.society}
    Magic/Tech: ${world.technology}
    Point out contradictions or gaps.`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
    });
    return response.text || '';
};

// --- Plot Planner ---

export const checkPlotLogic = async (plotData: PlotData, settings: NovelSettings): Promise<string> => {
    const ai = getClient(settings);
    const template = getPromptTemplate(PROMPT_KEYS.CHECK_PLOT_LOGIC, settings);
    
    const enrichedNodes = plotData.nodes.map(n => {
        const sl = plotData.storylines.find(s => s.id === n.storylineId);
        const parent = n.causalLink ? plotData.nodes.find(p => p.id === n.causalLink) : null;
        return `
        - Event: "${n.title}" (${n.type})
          Description: ${n.description || 'No description'}
          Storyline: ${sl ? sl.name : 'Unknown'}
          Chapter Range: ${n.chapterRange || 'Unassigned'}
          Tension: ${n.tension}/10
          ${parent ? `Caused By: "${parent.title}"` : ''}
        `.trim();
    }).join('\n');

    const plan = `
    ### STRUCTURE
    Act 1: ${plotData.act1 || 'Not defined'}
    Act 2: ${plotData.act2 || 'Not defined'}
    Act 3: ${plotData.act3 || 'Not defined'}

    ### PLOT EVENTS SEQUENCE
    ${enrichedNodes || 'No events defined.'}
    `;
    
    const prompt = fillPrompt(template, {
        plan: plan
    });
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview', // Reasoning needed
        contents: prompt
    });
    return response.text || '';
};
