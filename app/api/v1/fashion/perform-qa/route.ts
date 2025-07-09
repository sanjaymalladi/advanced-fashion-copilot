import { NextRequest, NextResponse } from 'next/server';
import { performQaAndGenerateStudioPrompts } from '@/lib/geminiService';
import { FashionPromptData } from '@/lib/types';
import { FileConversionResult } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { originalGarmentImages, generatedFashionImage, analysisData } = await request.json();

    if (!originalGarmentImages || !generatedFashionImage || !analysisData) {
      return NextResponse.json({ error: "Missing required fields: 'originalGarmentImages', 'generatedFashionImage', or 'analysisData'." }, { status: 400 });
    }

    const refinedPrompts = await performQaAndGenerateStudioPrompts(
      originalGarmentImages,
      generatedFashionImage,
      analysisData
    );

    return NextResponse.json(refinedPrompts);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to perform QA and generate prompts.", details: errorMessage }, { status: 500 });
  }
} 