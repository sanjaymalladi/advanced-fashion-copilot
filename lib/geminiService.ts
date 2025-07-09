
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { FileConversionResult } from "../utils/fileUtils";
import { FashionPromptData } from "../App"; // Import FashionPromptData for type usage

const API_KEY = process.env.API_KEY;

if (!API_KEY || API_KEY.trim() === "") {
  console.error("API_KEY environment variable not set or is empty. Please ensure it is configured.");
  // Potentially throw an error here or handle it in a way that alerts the user in the UI
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });
const model = 'gemini-2.5-flash-preview-04-17';

interface ImageInput extends FileConversionResult {} 

interface GeneratePromptParams {
  imagesToProcess?: ImageInput[]; 
  textConcept?: string;
  refinementSuggestions?: string;
}

interface CharacterSheetPrompt {
  title: string;
  prompt: string;
}

interface RefinedStudioPrompt { // Now also used for Lifestyle prompts
  title: string;
  prompt: string;
}


export const generateDetailedPrompt = async ({ imagesToProcess, textConcept, refinementSuggestions }: GeneratePromptParams): Promise<string> => {
  if ((!imagesToProcess || imagesToProcess.length === 0) && !textConcept) {
    throw new Error("Either one or more images or a text concept must be provided.");
  }

  let systemInstruction: string;
  const parts: any[] = [];

  if (refinementSuggestions) {
    if (imagesToProcess && imagesToProcess.length > 0) { 
        const isFusion = imagesToProcess.length > 1;
        systemInstruction = `You are an expert prompt engineer. You previously analyzed ${isFusion ? 'multiple images and generated a "fused" prompt' : 'an image and generated a prompt for it'}.
Now, you must refine that initial analysis based on the following user suggestions: "${refinementSuggestions}".
The original image(s) are provided again.

Your critical task is to generate a NEW, updated prompt that:
1.  Incorporates the user's suggestions.
${isFusion ? '2.  Continues to synthesize elements from **EACH AND EVERY** original image into a single, cohesive scene. Do not default to describing only one image or favoring one image over others. The final prompt must be a true amalgamation.' : ''}
3.  If a suggestion conflicts with the image(s), prioritize the suggestion where it makes creative sense, or subtly blend it while still respecting the core elements from all image(s).

Focus on vivid details, describing a single cohesive scene that logically integrates elements from all image(s) (considering subject appearance, actions, emotions, attire, setting, composition, lighting, color palette, artistic style, and mood) AND incorporates the new refinement suggestions.
Output only the single, refined, comprehensive text prompt. Do not add any conversational text or explanations.
The output MUST be a single prompt.`;
        
        imagesToProcess.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } }));
        parts.push({ text: `Based on all provided image(s) and the system instructions (which include refinement suggestions), generate the single refined detailed prompt.` });

    } else if (textConcept) { 
      systemInstruction = `You are an expert prompt engineer. You previously expanded a text concept: "${textConcept}" into a detailed prompt.
Now, you need to refine that initial prompt based on the following user suggestions: "${refinementSuggestions}".
Your task is to generate a NEW, updated prompt that incorporates these suggestions while building upon the original concept.
Focus on vivid details, including subject appearance, actions, emotions, attire, setting, composition, lighting, color palette, artistic style, and mood.
Output only the single, refined, comprehensive text prompt. Do not add any conversational text or explanations.`;
      parts.push({ text: `Refine the prompt for the concept: "${textConcept}", using the refinement suggestions outlined in the system instruction.` });
    } else {
         throw new Error("Invalid parameters for refinement: Missing original image(s) or text concept.");
    }
  } else { 
    if (imagesToProcess && imagesToProcess.length > 0) {
        const isFusion = imagesToProcess.length > 1;
        if (isFusion) {
            systemInstruction = `You are an expert prompt engineer. Multiple images are provided.
Your critical task is to synthesize elements from **EACH AND EVERY** provided image into a **SINGLE, NEW, AND COHERENT** scene description. Do not simply describe one image and ignore the others, or heavily favor one image. The final prompt must be a true amalgamation and reflect contributions from all inputs.
Identify a central theme or narrative that creatively binds elements from all images.
Describe this synthesized scene with vivid details: Overall Scene, Subject(s), Setting/Background, Composition & Framing, Lighting, Color Palette, Artistic Style, Mood/Atmosphere, Key Details & Textures.
Include technical keywords if appropriate (e.g., "4k", "hyperrealistic", "cinematic lighting").
Format your output as one rich, coherent paragraph. Start the prompt directly. Do not use conversational introductions or explanations.
The output MUST be a single prompt representing the fusion of all images.`;
        } else { // Single image
            systemInstruction = `You are an expert prompt engineer specializing in creating highly descriptive prompts for advanced AI image generation models.
Analyze the provided image in meticulous detail. Your goal is to generate a single, comprehensive text prompt that an AI image generator could use to recreate or reimagine a similar image with high fidelity.
The prompt must cover: Subject(s), Setting/Background, Composition & Framing, Lighting, Color Palette, Artistic Style, Mood/Atmosphere, Key Details & Textures, Technical Keywords.
Format your output as one rich, coherent paragraph. Start the prompt directly. Do not use conversational introductions or explanations about your process. Focus solely on crafting the descriptive prompt itself.`;
        }
        
        imagesToProcess.forEach(img => parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } }));
        parts.push({ text: `Based on the image(s) provided, generate the detailed prompt as per the system instructions. ${isFusion ? 'Ensure elements from every image contribute to the final prompt.' : ''}` });

    } else if (textConcept) { 
      systemInstruction = `You are an expert prompt engineer specializing in creating highly descriptive prompts for advanced AI image generation models.
Take the following text concept and expand it into a rich, detailed, and highly effective text prompt. The concept is: "${textConcept}".
Your generated prompt should vividly imagine and detail: Subject(s), Setting/Background, Composition & Framing, Lighting, Color Palette, Artistic Style, Mood/Atmosphere, Key Details & Textures, Technical Keywords.
Format your output as one rich, coherent paragraph. Start the prompt directly. Do not use conversational introductions or explanations. Focus solely on crafting the descriptive prompt itself.`;
      parts.push({ text: `Generate a detailed prompt for the concept: "${textConcept}", following the system instructions.` });
    } else {
      throw new Error("Invalid parameters: No image(s) or text concept provided for initial generation.");
    }
  }
  
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: { parts: parts },
      config: {
        systemInstruction: systemInstruction,
      }
    });
    
    const resultText = response.text;
    if (!resultText) {
        throw new Error("The API returned an empty prompt. Please try a different input or refine your concept/suggestions.");
    }
    return resultText.trim();

  } catch (error) {
    console.error("Error calling Gemini API for detailed prompt:", error);
    if (error instanceof Error) {
      if (error.message.includes("API_KEY_INVALID") || error.message.includes("API key not valid")) {
        throw new Error("The API key is invalid or not configured correctly. Please check your environment setup.");
      }
      if (error.message.includes("Quota") || error.message.includes("quota")) {
         throw new Error("API quota exceeded. Please check your Google AI Studio account or try again later.");
      }
      if ((imagesToProcess && imagesToProcess.length > 0) && (error.message.includes("blockedBy Vez") || error.message.includes("SAFETY") || error.message.includes("prompt was blocked"))) {
        throw new Error("The prompt generation was blocked due to the content policy, likely related to the input image(s). Please try with different images.");
      }
      throw new Error(`Failed to generate prompt from Gemini API: ${error.message}`);
    }
    throw new Error("An unknown error occurred while communicating with the Gemini API.");
  }
};


export const generateCharacterSheetPrompts = async (image: ImageInput, crazyShotBackgroundIdea?: string): Promise<CharacterSheetPrompt[]> => {
  let crazyShotInstruction = `Describe the character in a "realistic crazy shot". This prompt should play with unique and dramatic lighting, an unconventional or surreal background, and dynamic camera angles while maintaining a realistic depiction of the character themselves. Focus on creating a visually striking and memorable image.`;
  if (crazyShotBackgroundIdea && crazyShotBackgroundIdea.trim() !== '') {
    crazyShotInstruction += ` The user has suggested a specific idea for this shot: "${crazyShotBackgroundIdea.trim()}". Incorporate this idea prominently into the lighting, background, or overall concept of the crazy shot.`;
  }
  
  const systemInstruction = `You are an expert AI prompt engineer. Analyze the provided image of a person.
Your task is to generate a series of 6 distinct text prompts for AI image generation, based on this single character.
The prompts should enable the creation of a character sheet, showing the character from different angles and in various settings.

The 6 prompts must be:
1.  **"Character - Full Body Front View"**: A detailed description of the character seen from the front. Focus on their full body appearance, clothing, hairstyle, facial features, accessories, and any notable details.
2.  **"Character - Full Body Back View"**: A detailed description of the character seen from the back. Describe their clothing from behind, hairstyle from the back, and any details visible from this angle.
3.  **"Character - Full Body Side View"**: A detailed description of the character seen from the side (e.g., left profile). Describe their profile, clothing from the side, and posture.
4.  **"Character in Scene - Cinematic Front Shot"**: Describe the character (front-facing or slightly angled) within a simple, consistent background scene (e.g., "standing on a gritty urban street at night with neon signs in the background" or "in a sunlit meadow with tall grass"). The prompt should specify a camera shot like "medium full shot" or "cowboy shot". The focus is on the character integrated into this scene. The scene details for this prompt should be consistent.
5.  **"Character in Scene - Cinematic Back Shot"**: Describe the character (back-facing) within a background scene and lighting conditions. This scene can be different from the 'Cinematic Front Shot'. Use a similar camera shot (e.g., "medium full shot from behind"). The focus is on the character from behind, integrated into a scene.
6.  **"Character - Realistic Crazy Shot"**: ${crazyShotInstruction}

For all prompts, include details on:
- Subject appearance (as visible from the angle)
- Attire and textures
- Hairstyle and color
- Key distinguishing features
- For scene prompts: setting, lighting, mood, camera angle, and composition. The background scene elements for "Character in Scene - Cinematic Front Shot" (prompt 4) should be internally consistent for that prompt.

**VERY IMPORTANT OUTPUT FORMATTING:**
Your entire response MUST be a single, valid JSON array of objects.
Each object in the array MUST have a "title" field (exactly as listed above, e.g., "Character - Full Body Front View") and a "prompt" field (the generated text prompt as a string).
There should be exactly 6 objects in the array, one for each prompt title.
Do NOT include any other text, explanations, code block fences (like \`\`\`json), or markdown formatting outside of this single JSON array.
The JSON array should start with '[' and end with ']'.

Example of the required JSON structure:
[
  { "title": "Character - Full Body Front View", "prompt": "A detailed prompt describing the character from the front..." },
  { "title": "Character - Full Body Back View", "prompt": "A detailed prompt describing the character from the back..." },
  { "title": "Character - Full Body Side View", "prompt": "A detailed prompt describing the character from the side..." },
  { "title": "Character in Scene - Cinematic Front Shot", "prompt": "A detailed prompt describing the character in a scene, front view..." },
  { "title": "Character in Scene - Cinematic Back Shot", "prompt": "A detailed prompt describing the character in a scene, back view..." },
  { "title": "Character - Realistic Crazy Shot", "prompt": "A detailed prompt for a realistic crazy shot..." }
]
Ensure any double quotes within the prompt strings themselves are properly escaped (e.g., "a \\"quoted\\" phrase").`;

  const parts = [
    { inlineData: { mimeType: image.mimeType, data: image.base64 } },
    { text: `Generate the 6 character sheet prompts based on the image and system instructions, adhering strictly to the specified JSON output format.` }
  ];

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: { parts: parts },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
      }
    });

    let jsonStr = response.text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }
    
    const parsedData = JSON.parse(jsonStr) as CharacterSheetPrompt[];
    
    const expectedTitles = [
        "Character - Full Body Front View",
        "Character - Full Body Back View",
        "Character - Full Body Side View",
        "Character in Scene - Cinematic Front Shot",
        "Character in Scene - Cinematic Back Shot",
        "Character - Realistic Crazy Shot"
    ];

    if (!Array.isArray(parsedData)) {
        throw new Error("API response for character sheet prompts is not a JSON array.");
    }
    if (parsedData.length !== expectedTitles.length) {
        throw new Error(`API returned an incorrect number of character sheet prompts. Expected ${expectedTitles.length}, got ${parsedData.length}.`);
    }
    if (!parsedData.every(item => 
        typeof item === 'object' && 
        item !== null && 
        typeof item.title === 'string' && item.title.trim() !== '' &&
        typeof item.prompt === 'string' && item.prompt.trim() !== ''
    )) {
        throw new Error("One or more character sheet prompt items from API are malformed (missing title or prompt, or incorrect types).");
    }
    
    const receivedTitles = parsedData.map(item => item.title);
    const missingTitles = expectedTitles.filter(title => !receivedTitles.includes(title));
    if (missingTitles.length > 0) {
        throw new Error(`API response for character sheet prompts is missing expected titles: ${missingTitles.join(', ')}.`);
    }

    return parsedData;

  } catch (error) {
    console.error("Error calling Gemini API for character sheet:", error);
    if (error instanceof Error) {
      if (error.message.includes("API_KEY_INVALID") || error.message.includes("API key not valid")) {
        throw new Error("The API key is invalid or not configured correctly. Please check your environment setup.");
      }
      if (error.message.includes("Quota") || error.message.includes("quota")) {
         throw new Error("API quota exceeded. Please check your Google AI Studio account or try again later.");
      }
       if (error.message.includes("blockedBy Vez") || error.message.includes("SAFETY") || error.message.includes("prompt was blocked")) {
        throw new Error("The prompt generation was blocked due to the content policy, likely related to the input image. Please try with a different image.");
      }
      if (error.message.startsWith("API response for character sheet prompts is not a JSON array.") ||
          error.message.startsWith("API returned an incorrect number of character sheet prompts.") ||
          error.message.startsWith("One or more character sheet prompt items from API are malformed") ||
          error.message.startsWith("API response for character sheet prompts is missing expected titles:")) {
          throw error; 
      }
      if (error.message.toLowerCase().includes("json")) {
         throw new Error(`Failed to parse character sheet prompts from Gemini API. The response might not be valid JSON: ${error.message}`);
      }
      throw new Error(`Failed to generate character sheet from Gemini API: ${error.message}`);
    }
    throw new Error("An unknown error occurred while communicating with the Gemini API for character sheet generation.");
  }
};


export const refineCharacterSheetPrompts = async (
    image: ImageInput, 
    suggestions: string,
    originalCrazyShotIdea?: string
): Promise<CharacterSheetPrompt[]> => {

    let crazyShotRefinementGuidance = `For the "Character - Realistic Crazy Shot", incorporate the user's new suggestions: "${suggestions}". Emphasize unique lighting, background, and dynamic angles, while keeping the character realistic.`;
    if (originalCrazyShotIdea && originalCrazyShotIdea.trim() !== '') {
        crazyShotRefinementGuidance += ` Also, remember the original background/idea provided for this shot was: "${originalCrazyShotIdea.trim()}". Blend this original idea with the new suggestions if they don't directly conflict, or prioritize the new suggestions if they offer a new direction.`;
    }
    
    const systemInstruction = `You are an expert AI prompt engineer. You are refining a set of 6 character sheet prompts based on an image and user suggestions.
The original image is provided.
The user's refinement suggestions for ALL prompts are: "${suggestions}".

Your task is to generate a NEW set of 6 refined text prompts. For each prompt, incorporate the user's suggestions while respecting the original intent of its title.
The 6 prompt titles you must generate refined prompts for are:
1.  **"Character - Full Body Front View"**: Refine the description of the character seen from the front, incorporating: "${suggestions}".
2.  **"Character - Full Body Back View"**: Refine the description of the character seen from the back, incorporating: "${suggestions}".
3.  **"Character - Full Body Side View"**: Refine the description of the character seen from the side, incorporating: "${suggestions}".
4.  **"Character in Scene - Cinematic Front Shot"**: Refine the description of the character (front-facing) within a scene, incorporating: "${suggestions}". Ensure the scene description is rich and cinematic, and consistent for this prompt.
5.  **"Character in Scene - Cinematic Back Shot"**: Refine the description of the character (back-facing) within a scene, incorporating: "${suggestions}". This scene can be different from the front shot. Ensure it's rich and cinematic.
6.  **"Character - Realistic Crazy Shot"**: ${crazyShotRefinementGuidance}

For all prompts, ensure vivid details related to subject appearance, attire, hairstyle, features, and for scene prompts, the setting, lighting, mood, camera angle, and composition.

**VERY IMPORTANT OUTPUT FORMATTING:**
Your entire response MUST be a single, valid JSON array of objects.
Each object in the array MUST have a "title" field (exactly as listed above) and a "prompt" field (the refined text prompt as a string).
There should be exactly 6 objects in the array, one for each prompt title.
Do NOT include any other text, explanations, code block fences (like \`\`\`json), or markdown formatting outside of this single JSON array.
The JSON array should start with '[' and end with ']'.
Ensure any double quotes within the prompt strings themselves are properly escaped (e.g., "a \\"quoted\\" phrase").`;

    const parts = [
        { inlineData: { mimeType: image.mimeType, data: image.base64 } },
        { text: `Refine the 6 character sheet prompts based on the image and the system instruction (which includes overall suggestions and specific guidance for the crazy shot). Adhere strictly to the specified JSON output format.` }
    ];

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: { parts: parts },
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
            }
        });

        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
            jsonStr = match[2].trim();
        }
        
        const parsedData = JSON.parse(jsonStr) as CharacterSheetPrompt[];
        
        const expectedTitles = [
            "Character - Full Body Front View",
            "Character - Full Body Back View",
            "Character - Full Body Side View",
            "Character in Scene - Cinematic Front Shot",
            "Character in Scene - Cinematic Back Shot",
            "Character - Realistic Crazy Shot"
        ];

        if (!Array.isArray(parsedData)) {
            throw new Error("API response for refined character sheet prompts is not a JSON array.");
        }
        if (parsedData.length !== expectedTitles.length) {
            throw new Error(`API returned an incorrect number of refined character sheet prompts. Expected ${expectedTitles.length}, got ${parsedData.length}.`);
        }
        if (!parsedData.every(item => 
            typeof item === 'object' &&
            item !== null &&
            typeof item.title === 'string' && item.title.trim() !== '' &&
            typeof item.prompt === 'string' && item.prompt.trim() !== ''
        )) {
            throw new Error("One or more refined character sheet prompt items from API are malformed (missing title or prompt, or incorrect types).");
        }
        const receivedTitles = parsedData.map(item => item.title);
        const missingTitles = expectedTitles.filter(title => !receivedTitles.includes(title));
        if (missingTitles.length > 0) {
            throw new Error(`API response for refined character sheet prompts is missing expected titles: ${missingTitles.join(', ')}.`);
        }
        
        return parsedData;

    } catch (error) {
        console.error("Error calling Gemini API for refining character sheet:", error);
        if (error instanceof Error) {
            if (error.message.includes("API_KEY_INVALID") || error.message.includes("API key not valid")) {
                throw new Error("The API key is invalid or not configured correctly. Please check your environment setup.");
            }
            if (error.message.includes("Quota") || error.message.includes("quota")) {
                throw new Error("API quota exceeded. Please check your Google AI Studio account or try again later.");
            }
            if (error.message.includes("blockedBy Vez") || error.message.includes("SAFETY") || error.message.includes("prompt was blocked")) {
                throw new Error("The prompt refinement was blocked due to the content policy, likely related to the input image or suggestions. Please try again with different inputs.");
            }
            if (error.message.startsWith("API response for refined character sheet prompts is not a JSON array.") ||
                error.message.startsWith("API returned an incorrect number of refined character sheet prompts.") ||
                error.message.startsWith("One or more refined character sheet prompt items from API are malformed") ||
                error.message.startsWith("API response for refined character sheet prompts is missing expected titles:")) {
                throw error; 
            }
            if (error.message.toLowerCase().includes("json")) {
                throw new Error(`Failed to parse refined character sheet prompts from Gemini API. Response might not be valid JSON: ${error.message}`);
            }
            throw new Error(`Failed to refine character sheet prompts from Gemini API: ${error.message}`);
        }
        throw new Error("An unknown error occurred while communicating with the Gemini API for character sheet refinement.");
    }
};

export const generateFashionAnalysisAndInitialJsonPrompt = async (
    garmentImages: ImageInput[],
    backgroundRefImages?: ImageInput[],
    modelRefImages?: ImageInput[]
): Promise<FashionPromptData> => {
    if (!garmentImages || garmentImages.length === 0 || garmentImages.length > 2) {
        throw new Error("Please provide 1 or 2 garment images.");
    }
    
    let imageProcessingInstruction = "You will be provided with one image of a garment. Analyze it accordingly.";
    if (garmentImages.length === 2) {
        imageProcessingInstruction = `You will be provided with two garment images.
First, determine if these two images show:
(a) The same garment from different perspectives or details.
(b) Two distinct garments (e.g., a top and a bottom, or two different dresses).

If **(a) same garment**: Synthesize all information from both images into a single, comprehensive analysis for that one garment. The 'initialJsonPrompt' should feature this single garment.
If **(b) two distinct garments**:
    - Your 'garmentAnalysis' string must clearly separate the analysis for each garment. Use a format like:
      '**Garment 1 ([briefly name/describe garment from image 1, e.g., Red Silk Blouse]):**\\n[Detailed analysis of Garment 1]\\n\\n**Garment 2 ([briefly name/describe garment from image 2, e.g., Black Denim Jeans]):**\\n[Detailed analysis of Garment 2]'
    - Your 'qaChecklist' string must similarly separate checks for each distinct garment, using a similar heading format.
    - Your 'initialJsonPrompt' (Step 4) must aim to generate an image featuring **both distinct garments** styled appropriately together on a model (or models, if logical for the garments). The prompt should describe this complete look or ensemble clearly.
This distinction is crucial for accurate output.`;
    }

    let referenceImageInstructions = "";
    if (backgroundRefImages && backgroundRefImages.length > 0) {
        referenceImageInstructions += `\n- Optional background reference image(s) are provided. Analyze these for style, mood, key elements, or composition. When generating the 'initialJsonPrompt' (Step 4), ensure the **STUDIO background** description is subtly inspired or influenced by these references (e.g., color palette, texture hints, overall mood) while remaining a studio setting. Do not simply copy the reference; integrate its essence.`;
    }
    if (modelRefImages && modelRefImages.length > 0) {
        referenceImageInstructions += `\n- Optional model reference image(s) are provided. Analyze these for model appearance (e.g., general features, hair style/color, ethnicity if clearly discernible and relevant, body type). When generating the 'initialJsonPrompt' (Step 4), the description of the model wearing the garment(s) should reflect these observed characteristics from the reference images. Aim for the generated model to resemble the reference(s).`;
    }


    const systemInstruction = `You are an AI assistant specialized in fashion image prompting. ${imageProcessingInstruction}
You may also receive optional background reference images and/or model reference images.
Follow these steps extremely carefully and return the output as a single JSON object with three keys: "garmentAnalysis", "qaChecklist", and "initialJsonPrompt".

🧩 Step 1: Input Analysis
- Study the input garment image(s) in detail. (Handle 1 or 2 images as per the initial instruction above).
- Extract and document the following attributes. If analyzing two distinct garments, do this for each:
    - Garment type (e.g., T-shirt, kurta, dress, onesie, jacket, trousers)
    - Target wearer (infant / child / adult male / adult female)
    - Fabric type and weave (cotton, silk, denim, wool, polyester, jersey, etc.)
    - Color tone (with nuance: e.g., muted dusty blue, vibrant cherry red, matte olive green)
    - Material finish (matte / glossy / satin / velvet / dry)
    - Neckline or collar shape (round neck, V-neck, shirt collar, mandarin collar, lapel)
    - Sleeve style (sleeveless, cap sleeves, cuffed full sleeves, raglan, drop shoulder)
    - Closure details (button, zipper, hook — count, type, spacing, material)
    - Seam type (topstitched, hidden seams, visible decorative seams)
    - Print, embroidery, or patterns (type, size, placement)
    - Fit style (relaxed, slim, oversized, flared)
    - Trims and additional details (pockets, lace, elastics, belts, hoodie)
    - Edge finishing (folded, topstitched, raw hem, piped)
    - Drape and structure (soft flowy, structured crisp, rigid denim, etc.)
- Format this 'garmentAnalysis' as a multi-line string. If two distinct garments, ensure clear separation as instructed.
${referenceImageInstructions ? `\n- Also consider any provided reference images for background or model appearance when formulating descriptions later, but the core garment analysis here is based on the garment images ONLY.` : ''}

🛡 Step 2: Checklist Preparation
- Based on the extracted garment attributes from Step 1, dynamically build a strict QA checklist. If analyzing two distinct garments, create checklist sections for each.
- Add special checks based on garment type(s).
    - Example: For suits → lapel sharpness, vent symmetry.
    - Example: For baby onesies → snap closure spacing, fabric softness.
- Format this 'qaChecklist' as a multi-line string. If two distinct garments, ensure clear separation.

🎯 Step 3: Set Ultra-Strict QA Mode
- (This is an internal mode for you for future QA if applicable. No specific text output needed for this key in THIS response, but keep it in mind.)

📈 Step 4: Give a JSON prompt for generating an output
- Based on the input analysis (Step 1) and the QA checklist (Step 2), give a detailed JSON prompt string.
- This JSON prompt string should be suitable for use in an AI image generation model.
- The prompt should aim to generate a premium image (for socials and print) featuring the garment(s) on an appropriate person/people (inferred from garment analysis).
- If one garment was analyzed, feature that garment. If two distinct garments were analyzed, the prompt must feature **both distinct garments** styled as an ensemble or complete look.
- The prompt must specify a **STUDIO background**.
    - If background reference images were provided (see Step 1 instructions), ensure the studio background description (e.g., seamless paper color, texture, simple props) is creatively inspired by their style, mood, or key elements, while *remaining a clean studio setup*. For example, if a reference shows a moody forest, the studio background might be "dark olive green seamless paper with subtle dappled lighting effect" rather than an actual forest.
    - If no background references, use a standard professional studio background (e.g., "light grey seamless paper," "plain white cyclorama wall").
- The prompt must specify professional studio lighting.
- If model reference images were provided (see Step 1 instructions), the description of the model in this JSON prompt should aim to have the generated model resemble the characteristics (features, hair, ethnicity, body type if discernible and appropriate) from those reference images.
- Include model pose(s) and encourage variations to ensure diverse outputs when used.
- This "initialJsonPrompt" must be a single string (copy-paste ready).

Return a single JSON object with the keys "garmentAnalysis", "qaChecklist", and "initialJsonPrompt".
Do not include any other text, explanations, or markdown formatting outside this JSON object.
The entire response MUST be a single, valid JSON object.
Ensure any double quotes within the string values (especially 'initialJsonPrompt') are properly escaped (e.g., "a \\"quoted\\" phrase").
`;

    const parts: any[] = [];
    garmentImages.forEach((img, idx) => {
      parts.push({text: `Input Garment Image ${idx + 1}:`}); 
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } })
    });
    if (backgroundRefImages && backgroundRefImages.length > 0) {
        parts.push({text: "Optional Background Reference Image(s):"});
        backgroundRefImages.forEach((img, idx) => {
            parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        });
    }
    if (modelRefImages && modelRefImages.length > 0) {
        parts.push({text: "Optional Model Reference Image(s):"});
        modelRefImages.forEach((img, idx) => {
            parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        });
    }
    parts.push({ text: `Analyze the garment image(s) (and any reference images) and generate the fashion analysis, QA checklist, and initial JSON prompt as per the system instructions. Carefully determine if one or two distinct garments are shown.` });
    

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: { parts: parts },
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
            }
        });

        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
            jsonStr = match[2].trim();
        }
        
        const parsedData = JSON.parse(jsonStr) as FashionPromptData;
        
        if (!parsedData || typeof parsedData.garmentAnalysis !== 'string' || typeof parsedData.qaChecklist !== 'string' || typeof parsedData.initialJsonPrompt !== 'string') {
            console.error("Parsed JSON for fashion prompt is not in the expected format:", parsedData);
            throw new Error("The API returned an unexpected format for the fashion prompt analysis.");
        }
        
        return parsedData;

    } catch (error) {
        console.error("Error calling Gemini API for fashion analysis and initial prompt:", error);
        if (error instanceof Error) {
            if (error.message.includes("API_KEY_INVALID") || error.message.includes("API key not valid")) {
                throw new Error("The API key is invalid or not configured correctly. Please check your environment setup.");
            }
            if (error.message.includes("Quota") || error.message.includes("quota")) {
                throw new Error("API quota exceeded. Please check your Google AI Studio account or try again later.");
            }
            if (error.message.includes("blockedBy Vez") || error.message.includes("SAFETY") || error.message.includes("prompt was blocked")) {
                throw new Error("The fashion prompt generation was blocked due to the content policy, likely related to the input image(s). Please try with a different image(s).");
            }
            if (error.message.toLowerCase().includes("json")) {
                 throw new Error(`Failed to parse fashion analysis from Gemini API. The response might not be valid JSON: ${error.message}`);
            }
            throw new Error(`Failed to generate fashion analysis from Gemini API: ${error.message}`);
        }
        throw new Error("An unknown error occurred while communicating with the Gemini API for fashion analysis generation.");
    }
};


export const performQaAndGenerateStudioPrompts = async (
    originalGarmentImages: ImageInput[],
    generatedFashionImage: ImageInput,
    analysisData: FashionPromptData
    // Optional: Pass backgroundRefImages and modelRefImages if they need to directly influence this step beyond analysisData
): Promise<RefinedStudioPrompt[]> => {
    const systemInstruction = `You are an AI fashion QA expert and prompt generator.
You will receive:
1.  Original garment image(s) (1 or 2 images showing the garment(s) to be accurately represented).
2.  A garment analysis (text describing the original garment(s) attributes, possibly influenced by original model/background refs).
3.  A QA checklist (specific points to verify for the original garment(s)).
4.  An initial JSON prompt (the prompt that was ideally used to create an image of the garment(s), possibly influenced by original model/background refs).
5.  The 'generated image' (an image supposedly created based on the initial prompt, which needs QA).

Your tasks are:
A.  **Ultra-Strict QA:**
    -   Compare the 'generated image' meticulously against the 'original garment image(s)', the 'garment analysis', and the 'QA checklist'.
    -   Identify ALL discrepancies: color shifts, fabric weave differences, fit inaccuracies, incorrect seam types, pattern misplacements, errors in closure details, neckline shape, sleeve style, etc. If the analysis specified two garments, check both.
    -   Note if material finish (matte/glossy/satin) is correct for the garment(s).
    -   Assess if the 'generated image' generally adhered to the 'initial JSON prompt' in terms of pose, background, and style, but prioritize accuracy to the *original garment(s)* above all.
    -   Provide a brief summary of key QA findings if significant deviations are found (this summary is for your internal use to inform prompt generation, not for direct output in the JSON).

B.  **Refine & Generate 4 Studio Prompts:**
    -   Based on your QA AND primarily drawing from the accurate details in the 'original garment image(s)' and 'garment analysis', generate 4 NEW, highly detailed studio prompts.
    -   **IMPORTANT CONSISTENCY RULES FOR STUDIO PROMPTS:** For all 4 studio prompts below:
        1.  You **MUST** choose ONE consistent, clean studio background (e.g., "plain white seamless paper background," "soft grey cyclorama wall," "neutral textured backdrop"). This choice can be informed by the 'initial JSON prompt' if it specified a good studio setup.
        2.  You **MUST** choose ONE consistent professional studio lighting setup (e.g., "bright and even studio lighting using softboxes," "dramatic single-source key light with subtle fill," "crisp fashion studio lighting").
        3.  Use these exact same chosen background and lighting descriptions in EACH of the 4 studio prompts. Do not vary them.
    -   These prompts must aim to create images that *perfectly and accurately* represent the *original garment(s) or ensemble* as detailed in the 'garment analysis', in this consistent high-quality studio setting.
    -   The model description in these studio prompts should be consistent with the one described/implied in the 'garment analysis' (which might have been influenced by original model references).
    -   The 4 studio prompts must be titled exactly:
        1.  **"Studio Prompt - Front View"**: Detailed description of the garment(s) on a model, full body or 3/4 shot, model facing front. Emphasize clear visibility of all front details of the garment or ensemble. Incorporate relevant details from the 'garment analysis'.
        2.  **"Studio Prompt - Back View"**: 
            *   **Internal Pre-computation (Mandatory for AI):** Before writing this prompt, meticulously re-examine the 'original garment image(s)' and 'garment analysis'. Internally list ALL back-specific design elements, closures, seam details, fabric behaviors, patterns, prints, texture, and any other distinguishing features visible or relevant to the back of the garment(s) or ensemble.
            *   **Prompt Generation:** This prompt is CRITICAL. Do not be generic. Based on your internal list, provide a detailed description of the garment(s) on a model, full body or 3/4 shot, model facing back/angled to showcase complete back details. Describe specific back design elements, closures, seams, cut/shape of the back, fabric drape/fit from the rear, and patterns/prints visible primarily from this perspective. If an ensemble, describe EACH garment's back. Suggest a pose that unambiguously showcases all critical back details. Incorporate all relevant back details from the 'garment analysis' and your internal pre-computation. The level of detail must be exhaustive.
        3.  **"Studio Prompt - Side View"**: Detailed description of the garment(s) on a model, full body or 3/4 shot, model in profile. Describe silhouette, fit, and side-specific details. Incorporate relevant details from the 'garment analysis'.
        4.  **"Studio Prompt - Close-up Detail"**: Focus on a specific, key feature of the garment(s). If one garment, a key detail (e.g., "texture of the fabric," "embroidery on sleeve"). If an ensemble, a key feature of *one* garment or their interaction (e.g., "close-up of the textured knit of the sweater (Garment 1) where it meets the waistband of the skirt (Garment 2)"). Be specific.
    -   For each studio prompt: Adhere to chosen consistent studio background/lighting. Suggest appropriate model pose. Incorporate all critical details from 'garment analysis'. Correct QA issues implicitly.

C.  **Generate 4 Lifestyle Prompts (with CONSISTENT Background):**
    -   Based on your QA AND primarily drawing from the accurate details in the 'original garment image(s)' and 'garment analysis', generate 4 NEW, distinct lifestyle prompts.
    -   **CRUCIAL BACKGROUND CONSISTENCY:**
        1.  First, establish **ONE SINGLE, CONSISTENT, highly detailed, and realistic lifestyle background scene.**
            *   This scene's *concept* should be inspired by any background ideas present in the 'initial JSON prompt' (which itself might have been influenced by user-provided background reference images during the initial analysis phase).
            *   If the 'initial JSON prompt' provides a clear lifestyle background concept, elaborate on it richly for this single scene.
            *   If no strong background concept is evident from the 'initial JSON prompt' or if no background references were used initially, then you must invent ONE suitable, aspirational, and detailed lifestyle setting appropriate for the garment(s)/ensemble (e.g., "a sun-drenched Italian cafe terrace with terracotta pots and distant rolling hills," "a minimalist art gallery interior with large abstract paintings and polished concrete floors," "a vibrant autumn park scene with golden leaves and a cobblestone path").
        2.  Once this single lifestyle background scene is established and described in detail, **USE THIS EXACT SAME DETAILED BACKGROUND SCENE DESCRIPTION in EACH of the 4 lifestyle prompts.** Do not create four entirely different locations.
        3.  The variation in the 4 lifestyle prompts should come from:
            *   Different model poses and actions *within this same scene*.
            *   Different camera angles or perspectives focusing on the model and garment(s) *within this same scene*.
            *   Subtle variations in lighting if natural (e.g., "golden hour light casting long shadows across the previously described cafe terrace," "soft, diffused daylight filtering into the same art gallery").
    -   The model description in these lifestyle prompts should be consistent with the one described/implied in the 'garment analysis'.
    -   These prompts must aim to create images that *accurately* represent the *original garment(s) or ensemble* in this consistent lifestyle setting.
    -   The 4 lifestyle prompts must be titled exactly:
        1.  **"Lifestyle Prompt - Scene 1"**
        2.  **"Lifestyle Prompt - Scene 2"**
        3.  **"Lifestyle Prompt - Scene 3"**
        4.  **"Lifestyle Prompt - Scene 4"**
    -   For EACH of these 4 lifestyle prompts:
        -   Start with the established consistent, detailed background scene description.
        -   Then, describe the model wearing the garment(s) naturally, interacting within *that specific part* of the consistent scene, or viewed from a different angle within it.
        -   Suggest appropriate model poses, dynamic camera angles, and lighting suitable for *that part* of the consistent scene.
        -   Incorporate all critical details from the 'garment analysis' (fabric, color, fit, style, specific features for each garment if multiple) to ensure faithful representation.
        -   If your QA noted issues in the 'generated image', the new prompts should implicitly correct these by focusing on the true garment attributes.

**VERY IMPORTANT OUTPUT FORMATTING for ALL 8 Prompts:**
-   Your entire response MUST be a single, valid JSON array of objects.
-   Each object in the array MUST have a "title" field (exactly as listed for all 8 prompts above) and a "prompt" field (the generated text prompt as a string).
-   There should be exactly 8 objects in the array (4 studio, 4 lifestyle).
-   Do NOT include any other text, explanations, code block fences (like \`\`\`json), or markdown formatting outside of this single JSON array.
-   The JSON array should start with '[' and end with ']'.
-   **Crucially, ensure that any double quotes (") within the textual description of ANY prompt MUST be escaped (e.g., using \\\\" for a quote, so it would look like: "a model wearing a \\\\\\"silken\\\\\\" dress").**
Example JSON structure (first 2 studio, first lifestyle):
[
  { "title": "Studio Prompt - Front View", "prompt": "Full body studio shot... Background: plain white seamless paper. Lighting: bright, even softbox lighting..." },
  { "title": "Studio Prompt - Back View", "prompt": "Full body studio shot, model facing away... Background: plain white seamless paper. Lighting: bright, even softbox lighting..." },
  { "title": "Studio Prompt - Side View", "prompt": "..." },
  { "title": "Studio Prompt - Close-up Detail", "prompt": "..." },
  { "title": "Lifestyle Prompt - Scene 1", "prompt": "Model at a [CONSISTENT SCENE DESCRIPTION, e.g., 'sun-drenched Italian cafe terrace with terracotta pots and distant rolling hills'], sitting at a wrought iron table, casually holding a coffee cup. Garment: [garment details]. Camera: eye-level medium shot, capturing interaction with environment. Lighting: warm, natural sunlight." },
  { "title": "Lifestyle Prompt - Scene 2", "prompt": "Model strolling along the edge of the [CONSISTENT SCENE DESCRIPTION, e.g., 'sun-drenched Italian cafe terrace, with the distant rolling hills more prominent in the background']. Garment: [garment details]. Camera: full body shot from a slightly low angle, emphasizing movement. Lighting: bright, late afternoon sun." },
  { "title": "Lifestyle Prompt - Scene 3", "prompt": "..." },
  { "title": "Lifestyle Prompt - Scene 4", "prompt": "..." }
]
Ensure all string values within the JSON (especially the 'prompt' values) are correctly escaped.`;

    const parts: any[] = [];
    originalGarmentImages.forEach((img, index) => {
        parts.push({text: `Original Garment Image ${index + 1}:`});
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 }});
    });
    parts.push({text: "Garment Analysis (from original garment(s)):"});
    parts.push({text: analysisData.garmentAnalysis});
    parts.push({text: "QA Checklist (from original garment(s)):"});
    parts.push({text: analysisData.qaChecklist});
    parts.push({text: "Initial JSON Prompt (used to create the 'generated image'):"});
    parts.push({text: analysisData.initialJsonPrompt});
    parts.push({text: "Generated Image (to be QA'd):"});
    parts.push({ inlineData: { mimeType: generatedFashionImage.mimeType, data: generatedFashionImage.base64 } });
    parts.push({ text: `Perform QA and generate the 4 studio prompts and 4 lifestyle prompts as per the system instructions. Ensure consistent background/lighting for studio prompts and a single, consistent, richly detailed scene for all lifestyle prompts (varying poses/angles within that same scene). Ensure all JSON string values are correctly escaped.` });

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: { parts: parts },
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
            }
        });

        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
            jsonStr = match[2].trim();
        }
        
        const parsedData = JSON.parse(jsonStr) as RefinedStudioPrompt[];
        
        const expectedTitles = [
            "Studio Prompt - Front View",
            "Studio Prompt - Back View",
            "Studio Prompt - Side View",
            "Studio Prompt - Close-up Detail",
            "Lifestyle Prompt - Scene 1",
            "Lifestyle Prompt - Scene 2",
            "Lifestyle Prompt - Scene 3",
            "Lifestyle Prompt - Scene 4"
        ];

        if (!Array.isArray(parsedData)) {
            throw new Error("API response for refined prompts is not a JSON array.");
        }
        if (parsedData.length !== expectedTitles.length) {
            throw new Error(`API returned an incorrect number of refined prompts. Expected ${expectedTitles.length}, got ${parsedData.length}.`);
        }
        if (!parsedData.every(item => 
            typeof item === 'object' && 
            item !== null && 
            typeof item.title === 'string' && item.title.trim() !== '' &&
            typeof item.prompt === 'string' && item.prompt.trim() !== ''
        )) {
            throw new Error("One or more refined prompt items from API are malformed (missing title or prompt, or incorrect types).");
        }
        
        const receivedTitles = parsedData.map(p => p.title);
        const missingTitles = expectedTitles.filter(title => !receivedTitles.includes(title));
        if (missingTitles.length > 0) {
             throw new Error(`API response for refined prompts is missing expected titles: ${missingTitles.join(', ')}.`);
        }


        return parsedData;

    } catch (error) {
        console.error("Error calling Gemini API for QA and refined prompts:", error);
        if (error instanceof Error) {
            if (error.message.includes("API_KEY_INVALID") || error.message.includes("API key not valid")) {
                throw new Error("The API key is invalid or not configured correctly. Please check your environment setup.");
            }
            if (error.message.includes("Quota") || error.message.includes("quota")) {
                throw new Error("API quota exceeded. Please check your Google AI Studio account or try again later.");
            }
            if (error.message.includes("blockedBy Vez") || error.message.includes("SAFETY") || error.message.includes("prompt was blocked")) {
                throw new Error("The QA/prompt generation was blocked due to content policy. Please try with different images or review inputs.");
            }
            if (error.message.startsWith("API response for refined prompts is not a JSON array.") ||
                error.message.startsWith("API returned an incorrect number of refined prompts.") ||
                error.message.startsWith("One or more refined prompt items from API are malformed") ||
                error.message.startsWith("API response for refined prompts is missing expected titles:")) {
                throw error; 
            }
            if (error.message.toLowerCase().includes("json")) {
                 throw new Error(`Failed to parse refined prompts from Gemini API. Response might not be valid JSON: ${error.message}`);
            }
            throw new Error(`Failed to generate refined prompts from Gemini API: ${error.message}`);
        }
        throw new Error("An unknown error occurred while communicating with the Gemini API for QA and prompt generation.");
    }
};
