import { NextRequest, NextResponse } from 'next/server';
import { refineCharacterSheetPrompts } from '@/lib/geminiService';
import { FileConversionResult } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { image, suggestions, originalCrazyShotIdea } = await request.json();

    if (!image || !suggestions) {
      return NextResponse.json({ error: "Missing required fields: 'image' or 'suggestions'." }, { status: 400 });
    }

    const refinedPrompts = await refineCharacterSheetPrompts(image, suggestions, originalCrazyShotIdea);
    return NextResponse.json(refinedPrompts);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to refine character sheet.", details: errorMessage }, { status: 500 });
  }
} 