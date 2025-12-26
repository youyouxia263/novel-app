import { GoogleGenAI, Type, Schema } from "@google/genai";
import { NovelSettings, Chapter } from "../types";

const API_KEY = process.env.API_KEY || '';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Generates a premise based on the title, or expands an existing premise.
 */
export const generatePremise = async (title: string, currentPremise: string, genre: string, language: string): Promise<string> => {
  if (!API_KEY) throw new Error("API Key is missing");
  const model = "gemini-3-flash-preview";

  const langInstruction = language === 'zh'
    ? "OUTPUT LANGUAGE: Chinese (Simplified)."
    : "OUTPUT LANGUAGE: English.";

  const task = currentPremise && currentPremise.trim().length > 0
    ? `The user has provided a rough idea: "${currentPremise}". Expand this into a compelling, detailed plot summary (about 100-200 words) for a ${genre} novel.`
    : `Create a compelling, detailed plot summary (about 100-200 words) for a ${genre} novel titled "${title}".`;

  const prompt = `
    Role: Expert creative writing assistant.
    Task: ${task}
    ${langInstruction}
    Requirements:
    - Include the main conflict, protagonist, and stakes.
    - Make it intriguing and suitable for the back cover of a book.
    - Return ONLY the summary text, no conversational filler.
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        systemInstruction: "You are a helpful creative writing assistant.",
      }
    });
    return response.text || "";
  } catch (error) {
    console.error("Error generating premise:", error);
    throw error;
  }
};

/**
 * Summarizes the generated chapter content.
 */
export const summarizeChapter = async (content: string, genre: string, language: string): Promise<string> => {
  if (!API_KEY) throw new Error("API Key is missing");
  // Use Flash for fast summarization
  const model = "gemini-3-flash-preview";

  const langInstruction = language === 'zh'
    ? "OUTPUT LANGUAGE: Chinese (Simplified)."
    : "OUTPUT LANGUAGE: English.";

  const prompt = `
    Role: Editor.
    Task: Summarize the following chapter content in 2-3 sentences. Capture the key plot points and character developments.
    Genre: ${genre}
    ${langInstruction}
    
    Content:
    ${content.slice(0, 20000)} 
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });
    return response.text || "";
  } catch (error) {
    console.error("Error summarizing chapter:", error);
    return ""; // Return empty string on failure, calling code should handle fallback
  }
};

/**
 * Generates an outline (list of chapters) based on the novel settings.
 */
export const generateOutline = async (settings: NovelSettings): Promise<Omit<Chapter, 'content' | 'isGenerating' | 'isDone'>[]> => {
  if (!API_KEY) throw new Error("API Key is missing");

  const model = "gemini-3-flash-preview";

  const languageInstruction = settings.language === 'zh' 
    ? "OUTPUT LANGUAGE: Chinese (Simplified). Ensure all titles and summaries are in Chinese." 
    : "OUTPUT LANGUAGE: English.";

  const prompt = `
    Create a detailed chapter outline for a ${settings.genre} novel titled "${settings.title}".
    ${languageInstruction}
    Premise: ${settings.premise}.
    The novel should be approximately ${settings.targetWordCount} words long.
    Generate exactly ${settings.chapterCount} chapters.
    For each chapter, provide a creative title and a 2-3 sentence summary of the plot points that happen in that chapter.
    Ensure the plot flows logically and maintains the tone of a ${settings.genre} novel.
  `;

  const responseSchema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.INTEGER, description: "Chapter number, starting from 1" },
        title: { type: Type.STRING, description: "Creative chapter title" },
        summary: { type: Type.STRING, description: "Detailed summary of the chapter events" },
      },
      required: ["id", "title", "summary"],
    },
  };

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "You are an expert novelist and editor specializing in plotting best-selling fiction.",
      },
    });

    const jsonText = response.text || "[]";
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Error generating outline:", error);
    throw error;
  }
};

/**
 * Generates the content for a specific chapter.
 * Returns an async generator to stream the text.
 */
export const generateChapterStream = async function* (
  settings: NovelSettings,
  chapter: Chapter,
  previousContext: string = ""
) {
  if (!API_KEY) throw new Error("API Key is missing");

  // Use Pro model for better creative writing quality
  const model = "gemini-3-pro-preview";

  const languageInstruction = settings.language === 'zh' 
    ? "IMPORTANT: Write the story content in Chinese (Simplified)." 
    : "IMPORTANT: Write the story content in English.";

  const prompt = `
    Write Chapter ${chapter.id}: "${chapter.title}" for the ${settings.genre} novel "${settings.title}".
    
    ${languageInstruction}

    Chapter Summary: ${chapter.summary}
    
    Overall Premise: ${settings.premise}
    
    Context from previous chapters: ${previousContext.slice(-2000)} ${previousContext.length > 2000 ? "(...truncated)" : ""}

    Style Guide:
    - Write in a compelling, immersive style suitable for ${settings.genre}.
    - Focus on "show, don't tell".
    - Include dialogue and sensory details.
    - Aim for approximately ${Math.round(settings.targetWordCount / settings.chapterCount)} words for this chapter.
    - Output only the story content. Do not include the title or summary again.
  `;

  try {
    const stream = await ai.models.generateContentStream({
      model: model,
      contents: prompt,
      config: {
        // Thinking budget helps with narrative consistency and plotting within the chapter
        thinkingConfig: { thinkingBudget: 2048 }, 
      }
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  } catch (error) {
    console.error("Error generating chapter stream:", error);
    throw error;
  }
};