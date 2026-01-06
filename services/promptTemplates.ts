
// This file contains the default prompts used by the system.
// Users can override these by saving custom strings in NovelSettings.customPrompts

export const PROMPT_KEYS = {
    GENERATE_OUTLINE: 'generate_outline',
    GENERATE_CHARACTERS: 'generate_characters',
    GENERATE_CHAPTER: 'generate_chapter',
    GENERATE_WORLD: 'generate_world',
    GENERATE_PREMISE: 'generate_premise',
    GENERATE_TITLES: 'generate_titles',
    EXPAND_TEXT: 'expand_text',
    CHECK_CONSISTENCY: 'check_consistency',
    FIX_CONSISTENCY: 'fix_consistency',
    GENERATE_SINGLE_CHARACTER: 'generate_single_character',
    
    // New Plot & Pacing Prompts
    GENERATE_PLOT_STRUCTURE: 'generate_plot_structure',
    GENERATE_PLOT_NODES: 'generate_plot_nodes',
    ANALYZE_PACING: 'analyze_pacing',
    CHECK_PLOT_LOGIC: 'check_plot_logic',
    
    // Character Depth
    ANALYZE_CHARACTER_DEPTH: 'analyze_character_depth',
    
    // Import Analysis
    ANALYZE_IMPORTED_NOVEL: 'analyze_imported_novel'
} as const;

export const DEFAULT_PROMPTS: Record<string, string> = {
    [PROMPT_KEYS.GENERATE_OUTLINE]: `Create a chapter outline for "{{title}}".
Genres: {{genre}}
{{language}}
Premise: {{premise}}.
{{format}}
{{genreGuide}}
{{world}}
{{characters}}

PLOT PLAN:
{{plotContext}}

CONTEXT & CONTINUITY:
{{paginationContext}}

IMPORTANT - STRUCTURE: {{structure}}`,

    [PROMPT_KEYS.GENERATE_CHAPTER]: `{{task}}
{{language}}

STORY PREMISE:
{{premise}}

OVERARCHING PLOT CONTEXT (PREVIOUS CHAPTERS SUMMARY):
{{storySummaries}}

IMMEDIATE NARRATIVE CONTEXT (PREVIOUS CHAPTER CONTENT):
{{previousChapterContent}}

CURRENT CHAPTER PLAN:
{{chapterSummary}}

NARRATIVE ARC & PLOT NODES (Target for this section):
{{plotNodesContext}}

CHARACTERS:
{{characters}}

STYLE GUIDELINES:
{{style}}
{{genreGuide}}

CRITICAL INSTRUCTIONS:
- Write the content for Chapter {{chapterId}}.
- **Narrative Continuity**: Use the 'IMMEDIATE NARRATIVE CONTEXT' to ensure a seamless scene transition.
- **Plot Consistency**: Refer to 'OVERARCHING PLOT CONTEXT' and 'NARRATIVE ARC' to ensure plot threads, foreshadowing, and callbacks are integrated.
- **Foreshadowing**: If the plot plan mentions a future event, subtly hint at it here.
- **Consistency Check**: Strictly avoid plot holes. Ensure character voices, locations, and inventory/status remain consistent.
- Show, don't tell.`,

    [PROMPT_KEYS.GENERATE_CHARACTERS]: `Create {{count}} distinct and diverse main characters for "{{title}}".
Genres: {{genre}}
Premise: {{premise}}
{{language}}
{{genreGuide}}
{{world}}
{{characters}}

Guidelines:
- Ensure a mix of roles (protagonist, antagonist, supporting, foil).
- Avoid common tropes and stereotypes.
- Create multidimensional characters with unique motivations and flaws.
- Ensure diversity in background, personality, and skills where appropriate for the setting.

Provide: name, role, description, relationships.`,

    [PROMPT_KEYS.GENERATE_SINGLE_CHARACTER]: `Task: Create ONE new character for "{{title}}".
Genres: {{genre}}
{{language}}
Premise: {{premise}}
World Setting: {{world}}
{{genreGuide}}

EXISTING CHARACTERS:
{{existingNames}}

INSTRUCTIONS:
- Create a character that fits the setting and genre perfectly.
- Determine a unique role (e.g., Ally, Rival, Mentor, Antagonist) that complements the existing cast.
- Describe their appearance, personality, and specific relationship/dynamic with at least one existing character.

Provide: name, role, description, relationships.`,

    [PROMPT_KEYS.GENERATE_WORLD]: `Task: Create a World Setting for "{{title}}". 
Genres: {{genre}}. 
{{language}}. 
Premise: {{premise}}. 
{{specificPrompt}}. 
Keep it under 300 words.`,

    [PROMPT_KEYS.GENERATE_PREMISE]: `Task: {{task}}. 
Genres: {{genre}}. 
{{language}}. 
Return ONLY summary text.`,

    [PROMPT_KEYS.GENERATE_TITLES]: `Task: Generate 5 catchy, trending, and click-worthy novel titles based on the info below.
Genres: {{genre}}.
Premise: {{premise}}.
{{language}}.
Style: Popular web novel trends (e.g., Tomato Novel/Webnovel style). Catchy, intriguing, maybe slightly long or descriptive if appropriate for the genre.
Output: JSON Array of strings (e.g., ["Title 1", "Title 2"]).`,

    [PROMPT_KEYS.EXPAND_TEXT]: `You are a creative writing assistant.
Task: Expand the following {{contextType}} for a {{genre}} novel titled "{{title}}".
{{language}}

Original Input:
"{{currentText}}"

Instructions:
- Flesh out the details, adding depth, atmosphere, and specific elements suitable for the genre.
- Keep the core idea but make it richer and more evocative.
- If the input is very short, creatively brainstorm based on it.
- Length: Approximately 200-300 words.
- Output ONLY the expanded text.`,

    [PROMPT_KEYS.CHECK_CONSISTENCY]: `Task: Analyze the chapter content for consistency issues.

CHARACTER PROFILES:
{{characters}}

CONTENT TO ANALYZE:
{{content}}

CHECKLIST:
1. **Personality Consistency**: Do characters act according to their defined traits and roles?
2. **Voice Consistency**: Do character dialogues match their defined "Voice Guide" and background?
3. **Fact Consistency**: Are there contradictions with established facts or previous context?
4. **Plot Logic**: Are there any logical gaps or plot holes?

Output:
If issues are found, list them clearly. 
If consistent, strictly output "Consistent".`,

    [PROMPT_KEYS.FIX_CONSISTENCY]: `Rewrite to fix consistency.
Issues:
{{analysis}}
Profiles:
{{characters}}
Content:
{{content}}`,

    [PROMPT_KEYS.GENERATE_PLOT_STRUCTURE]: `Task: Design a Classic Three-Act Structure for "{{title}}".
Genres: {{genre}}
Premise: {{premise}}
{{language}}

Output markdown with 3 sections:
1. **Act 1 (Setup)**: Inciting incident, intro to world/characters, key conflict trigger.
2. **Act 2 (Confrontation)**: Rising action, obstacles, midpoint twist, character development.
3. **Act 3 (Resolution)**: Climax, falling action, final resolution, theme realization.`,

    [PROMPT_KEYS.GENERATE_PLOT_NODES]: `Task: Generate key plot nodes (beats) for "{{title}}".
Structure Context:
{{structure}}

Storylines: {{storylines}}

Requirement:
Generate 5-10 key events. For each event identify:
- Title
- Description
- Type (Inciting Incident, Climax, Twist, Foreshadowing, etc.)
- Associated Storyline (Main or Sub)
- Approximate Chapter Range (e.g. 1-3, 10-15)
- Tension Level (1-10)

Output JSON Array.`,

    [PROMPT_KEYS.ANALYZE_PACING]: `Task: Analyze narrative pacing and emotional tension.
Content:
"{{content}}"

Analyze:
1. **Pacing Speed**: Is it fast, slow, or balanced? Is it appropriate for the current scene type?
2. **Tension**: Identify high-tension moments and lulls.
3. **Emotional Curve**: How does the reader's emotion change?
4. **Suggestions**: How to improve the rhythm?

Output concise Markdown report.`,

    [PROMPT_KEYS.CHECK_PLOT_LOGIC]: `Task: Check the plot outline/nodes for logical consistency.
Plot Plan:
{{plan}}

Check for:
1. **Causality**: Do events follow a logical cause-and-effect chain?
2. **Timeline**: Are there chronological impossibilities?
3. **Motivation**: Do character actions make sense given their goals?
4. **Loose Ends**: Are there unresolved setups?

Output concise Markdown report.`,

    [PROMPT_KEYS.ANALYZE_CHARACTER_DEPTH]: `Task: Deep psychoanalysis of character "{{name}}".
Role: {{role}}
Description: {{description}}
Relationships: {{relationships}}

Analyze:
1. **Psychological Profile**: MBTI or Big 5 approximation, core fears, and desires.
2. **Internal Conflict**: What is the lie they believe vs the truth they need?
3. **Growth Arc**: Suggested trajectory (Static, Positive, Negative).
4. **Relationship Dynamics**: Hidden motivations in relationships.

Output concise Markdown.`,

    [PROMPT_KEYS.ANALYZE_IMPORTED_NOVEL]: `Task: Analyze the provided novel excerpt (Chapters 1-3) to extract metadata.
Content Snippet:
"{{content}}"

Require JSON Output with fields:
1. title: Suggested title if unknown.
2. premise: Summary of the core story logic.
3. mainCategory: Genre classification.
4. characters: Array of { name, role, description, relationships, voiceGuide }.
5. worldSetting: Summary of the geography and society.

Constraint: JSON Only. Language: {{language}}.`
};

export const fillPrompt = (template: string, data: Record<string, string>): string => {
    let result = template;
    for (const key in data) {
        // Replace {{key}} with value, handling mostly simple cases
        const placeholder = `{{${key}}}`;
        // Use a global replace
        result = result.split(placeholder).join(data[key] || '');
    }
    return result;
};
