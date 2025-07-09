import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: NextRequest) {
  try {
    const { productAnalysis, brandData } = await request.json();
    
    if (!productAnalysis || !brandData) {
      return NextResponse.json(
        { error: "Missing productAnalysis or brandData" },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    // Initialize Gemini AI
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 1024,
      }
    });

    // Use style keywords for brand aesthetic
    const styleKeywords = brandData.styleKeywords || ['modern', 'stylish', 'premium'];
    const styleDescription = styleKeywords.join(', ');
    const brandName = brandData.name;
    
    // Determine if this is a clothing/fashion item that requires human models
    const isClothingItem = productAnalysis.toLowerCase().includes('clothing') || 
                          productAnalysis.toLowerCase().includes('shirt') || 
                          productAnalysis.toLowerCase().includes('dress') || 
                          productAnalysis.toLowerCase().includes('skirt') || 
                          productAnalysis.toLowerCase().includes('pants') || 
                          productAnalysis.toLowerCase().includes('pajama') || 
                          productAnalysis.toLowerCase().includes('top') || 
                          productAnalysis.toLowerCase().includes('bottom') || 
                          productAnalysis.toLowerCase().includes('fashion') || 
                          productAnalysis.toLowerCase().includes('wear') || 
                          productAnalysis.toLowerCase().includes('garment');
    
    const promptText = `
You are an expert **Fashion Marketing Image Prompt Generator** specializing in creating high-quality marketing photoshoot content.

**Your Task:** Transform the analyzed product into 4 different marketing photoshoot prompts with different poses but maintaining the same outfit and ${styleDescription} aesthetic.

**Product Analysis:**
${productAnalysis}

**Brand Style Requirements:**
- Style Aesthetic: ${styleDescription}
- Brand Identity: ${brandName}
- Marketing Focus: Professional photoshoot content

**CRITICAL REQUIREMENTS:**
${isClothingItem ? `
- **MANDATORY HUMAN MODELS**: Since this is a clothing/fashion item, ALL prompts MUST include professional human models wearing the product
- **NO FLAT LAY SHOTS**: No laying flat, no product-only shots - models must be wearing the items
- **DIVERSE POSES**: Each prompt must show the model in different poses while wearing the exact same outfit
` : `
- **PRODUCT FOCUS**: Show the product in premium marketing presentation
- **LIFESTYLE CONTEXT**: Include relevant lifestyle or usage context
`}

**Instructions:**
1. **Analyze the Outfit Image:** Extract core outfit features from the analysis:
   - Garment Type (be highly specific)
   - Color Palette (exact colors and tones)
   - Texture/Material (fabric details)
   - Pattern/Print (if any)
   - Fit/Silhouette (how it fits the body)

2. **Apply Brand Aesthetic:** Incorporate ${styleDescription} style throughout:
   - Setting should reflect ${styleDescription} aesthetic
   - Lighting should enhance ${styleDescription} mood
   - Overall vibe should embody ${styleDescription} brand essence

3. **Generate 4 IMAGE COMBINATION Prompts:** Create 4 distinct prompts that COMBINE/MERGE multiple input images:
   - **COMBINE INPUT IMAGES:** Each prompt must start with "Combine these product images into one cohesive scene"
   - **MERGE ELEMENTS:** Blend styling elements from all input images seamlessly
   - **UNIFIED COMPOSITION:** Create one unified photograph from multiple source images
   - **Different Poses:** Vary model poses, angles, and compositions
   - **Consistent Style:** Maintain ${styleDescription} aesthetic in all
   - **Professional Quality:** Studio/lifestyle marketing photography
   ${isClothingItem ? `- **Human Models Required:** Professional models wearing the clothing in every shot` : ''}

**Output Format:**
Generate EXACTLY 4 separate, detailed IMAGE COMBINATION prompts. Use this EXACT format:

**PROMPT 1:**
Combine these product images into one cohesive scene: [detailed prompt for front pose]

**PROMPT 2:**
Combine these product images into one cohesive scene: [detailed prompt for profile/side pose]

**PROMPT 3:**
Combine these product images into one cohesive scene: [detailed prompt for dynamic/movement pose]

**PROMPT 4:**
Combine these product images into one cohesive scene: [detailed prompt for close-up/detail pose]

**Requirements for Each Prompt:**
- **MUST START WITH:** "Combine these product images into one cohesive scene:"
- **MANDATORY ELEMENTS:** Show professional model wearing ALL clothing items from BOTH input images
- **EXACT COLORS:** Use the EXACT colors from the input images - do NOT change colors to match brand aesthetic
- **CLOTHING ACCURACY:** Use the precise clothing items shown in the input images, not brand-inspired alternatives
- **HUMAN MODELS:** Every prompt must include "professional model wearing both the [exact top from input] and [exact skirt from input]"
- **COMPLETE OUTFIT:** Show the FULL outfit from both input images combined
- **COLOR OVERRIDE:** Maintain original clothing colors even if they don't match ${styleDescription} palette
- **DIFFERENT POSES:** Vary poses: (1) front pose, (2) profile/side pose, (3) dynamic/movement pose, (4) close-up/detail pose
- **PROFESSIONAL QUALITY:** Studio lighting, premium marketing photography
${isClothingItem ? `
- **NO EXCEPTIONS:** No flat lay, no product-only shots, no partial outfits
- **COMPLETE COMBINATION:** Show model wearing items from BOTH input images simultaneously
- **COLOR ACCURACY:** Maintain exact colors from original images
` : ''}

**CRITICAL:** Generate ONLY the 4 prompts in the exact format above. Do not add extra explanations or text. Each prompt must show a model wearing the complete outfit from both input images.
`;

    console.log('📝 Generating fashion marketing prompts...');
    console.log('🎨 Brand aesthetic:', styleDescription);
    console.log('🏷️ Brand:', brandName);
    console.log('👤 Clothing item requiring models:', isClothingItem);
    
    const result = await model.generateContent(promptText);
    const response = result.response;
    const text = response.text();

    console.log('✅ Brand prompt generation completed');
    
    if (!text || text.trim() === '') {
      throw new Error('Gemini returned empty response');
    }
    
    return NextResponse.json({ 
      brandPrompt: text,
      brandName: brandData.name,
      success: true 
    });

  } catch (error) {
    console.error("❌ Error generating brand prompt:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to generate brand prompt: ${errorMessage}` },
      { status: 500 }
    );
  }
} 