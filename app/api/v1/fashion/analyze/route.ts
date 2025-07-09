import { NextRequest, NextResponse } from 'next/server';
import { generateFashionAnalysisAndInitialJsonPrompt } from '@/lib/geminiService';
import { FileConversionResult } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { garmentImages, backgroundRefImages, modelRefImages } = await request.json();

    if (!garmentImages || !Array.isArray(garmentImages) || garmentImages.length === 0) {
      return NextResponse.json({ error: "The 'garmentImages' field is required and must be a non-empty array." }, { status: 400 });
    }

    const analysisData = await generateFashionAnalysisAndInitialJsonPrompt(
      garmentImages,
      backgroundRefImages,
      modelRefImages
    );

    return NextResponse.json(analysisData);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to analyze garments.", details: errorMessage }, { status: 500 });
  }
} 