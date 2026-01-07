
import { NovelSettings } from '../types';

export const PROMPT_KEYS = {
    GENERATE_PREMISE: 'generate_premise',
    EXPAND_TEXT: 'expand_text',
    GENERATE_TITLES: 'generate_titles',
    GENERATE_WORLD_SETTING: 'generate_world_setting',
    GENERATE_WORLD_FOUNDATION: 'generate_world_foundation',
    GENERATE_WORLD_LOCATIONS: 'generate_world_locations',
    GENERATE_WORLD_TIMELINE: 'generate_world_timeline',
    ANALYZE_WORLD_CONSISTENCY: 'analyze_world_consistency',
    GENERATE_CHARACTERS: 'generate_characters',
    GENERATE_SINGLE_CHARACTER: 'generate_single_character',
    ANALYZE_CHARACTER_DEPTH: 'analyze_character_depth',
    GENERATE_OUTLINE: 'generate_outline',
    GENERATE_CHAPTER: 'generate_chapter',
    CONTINUE_WRITING: 'continue_writing',
    EXTEND_CHAPTER: 'extend_chapter',
    SUMMARIZE_CHAPTER: 'summarize_chapter',
    CHECK_GRAMMAR: 'check_grammar',
    AUTO_CORRECT_GRAMMAR: 'auto_correct_grammar',
    ANALYZE_PACING: 'analyze_pacing',
    CHECK_CONSISTENCY: 'check_consistency',
    FIX_CONSISTENCY: 'fix_consistency',
    ANALYZE_IMPORTED: 'analyze_imported',
    CHECK_PLOT_LOGIC: 'check_plot_logic',
    GENERATE_CHARACTER_IMAGE: 'generate_character_image',
};

export const DEFAULT_PROMPTS: Record<string, string> = {
    [PROMPT_KEYS.GENERATE_PREMISE]: `Role: Professional Novelist/Editor.
Task: Create a compelling story premise based on the user's input.
Input: Title: "{{title}}", Idea: "{{premise}}"
Requirements:
- Genre: {{mainCategory}}
- Themes: {{themes}}
- Tone: {{writingTone}}
- Output a single, engaging paragraph summarizing the core conflict, protagonist, and stakes.`,

    [PROMPT_KEYS.GENERATE_TITLES]: `Role: Best-selling Author.
Task: Generate 5 catchy titles for a {{mainCategory}} novel.
Context: {{premise}}
Themes: {{themes}}
Output: A JSON array of strings. e.g. ["Title 1", "Title 2"]`,

    [PROMPT_KEYS.GENERATE_WORLD_SETTING]: `Role: World Builder.
Task: Create a high-level world setting summary for a {{mainCategory}} novel.
Context: {{premise}}
Themes: {{themes}}
Output: A concise description of the world, magic system/technology, and key locations.`,

    [PROMPT_KEYS.GENERATE_CHARACTERS]: `Role: Character Designer.
Task: Create a cast of main characters for the story.
Context: {{premise}}
Output: JSON array of character objects with fields: name, role, description, relationships, backgroundStory, skills.`,

    [PROMPT_KEYS.GENERATE_OUTLINE]: `Role: Plot Architect.
Task: Generate a chapter-by-chapter outline.
Novel Type: {{novelType}}
Target Chapters: {{chapterCount}}
Context: {{premise}}
Characters: {{mainCharacters}}
Output: JSON array of chapter objects (id, title, summary).`,

    [PROMPT_KEYS.GENERATE_CHAPTER]: `Role: Fiction Writer.
Task: Write Chapter {{chapterId}}: {{chapterTitle}}.
Summary: {{chapterSummary}}
Previous Story: {{storySummaries}}
Previous Chapter Content: {{previousContext}}
Tone: {{writingTone}}
Style: {{writingStyle}}
Perspective: {{narrativePerspective}}
Requirements: Write a detailed, engaging chapter. Minimum 1000 words.`,

    [PROMPT_KEYS.EXPAND_TEXT]: `Role: Co-writer.
Task: Expand and polish the following text for a {{section}} section.
Text: "{{text}}"
Context: {{premise}}
Requirement: Add detail, depth, and clarity.`,

    [PROMPT_KEYS.CHECK_PLOT_LOGIC]: `Task: Analyze the plot structure for logical consistency and provide concrete suggestions for improvement.

Plot Plan:
{{plan}}

Analysis Requirements:
1. **Causality & Logic**: Do events follow a logical cause-and-effect chain? Are there contradictions or non-sequiturs?
2. **Pacing & Tension**: Evaluate the distribution of tension. Is the climax properly built up? Are there dragging sections?
3. **Character Motivation**: Do the events align with implied character goals?
4. **Loose Ends**: Are there unresolved setups or foreshadowing?

Output Format (Markdown):
### 1. Analysis Summary
(Brief overview of the plot's health)

### 2. Identified Issues
- **[Issue Type]**: Description of the problem.

### 3. Suggestions for Improvement
- **[Suggestion]**: Concrete idea to fix an issue or enhance the story.

### 4. Rating
- **Cohesiveness**: X/10
- **Excitement**: X/10`,
};

export const getPromptTemplate = (key: string, settings: NovelSettings): string => {
    return settings.customPrompts?.[key] || DEFAULT_PROMPTS[key] || '';
};

export const fillPrompt = (template: string, data: Record<string, string>): string => {
    let result = template || '';
    for (const [key, value] of Object.entries(data)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    }
    return result;
};
