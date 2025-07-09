import { NextRequest, NextResponse } from 'next/server';
import { generateCharacterSheetPrompts } from '@/lib/geminiService';
import { FileConversionResult } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { image, crazyShotBackgroundIdea } = await request.json();

    if (!image) {
      return NextResponse.json({ error: "The 'image' field is required." }, { status: 400 });
    }

    const prompts = await generateCharacterSheetPrompts(image, crazyShotBackgroundIdea);
    return NextResponse.json(prompts);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to generate character sheet.", details: errorMessage }, { status: 500 });
  }
} 