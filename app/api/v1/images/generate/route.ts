import { NextRequest, NextResponse } from 'next/server';
import { generateImageViaReplicate } from '@/lib/replicateService';

export async function POST(request: NextRequest) {
  try {
    const inputs = await request.json();
    // Backward compatibility: if input_image_1/input_image_2 are provided, convert to input_images array
    let input_images = inputs.input_images;
    if (!input_images && (inputs.input_image_1 || inputs.input_image_2)) {
      input_images = [];
      if (inputs.input_image_1) input_images.push(inputs.input_image_1);
      if (inputs.input_image_2) input_images.push(inputs.input_image_2);
    }
    if (!input_images || input_images.length < 2) {
      throw new Error('At least two input images must be provided.');
    }
    const imageUrl = await generateImageViaReplicate({
      prompt: inputs.prompt,
      aspect_ratio: inputs.aspect_ratio,
      input_images,
    });
    return NextResponse.json({ imageUrl: imageUrl });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    return NextResponse.json({ error: "Failed to generate image.", details: errorMessage }, { status: 500 });
  }
} 