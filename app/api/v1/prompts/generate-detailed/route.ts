import { NextRequest, NextResponse } from 'next/server';
import { generateDetailedPrompt } from '@/lib/geminiService';
import { FileConversionResult } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { imagesToProcess, textConcept, refinementSuggestions } = await request.json();

    if ((!imagesToProcess || imagesToProcess.length === 0) && !textConcept) {
      return NextResponse.json({ error: "Either 'imagesToProcess' or 'textConcept' must be provided." }, { status: 400 });
    }

    const detailedPrompt = await generateDetailedPrompt({
      imagesToProcess,
      textConcept,
      refinementSuggestions,
    });

    return NextResponse.json({ prompt: detailedPrompt });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to generate detailed prompt.", details: errorMessage }, { status: 500 });
  }
} 