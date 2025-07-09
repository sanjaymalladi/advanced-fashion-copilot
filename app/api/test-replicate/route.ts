import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

export async function GET() {
  return NextResponse.json({
    message: 'Replicate test endpoint',
    available: true
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.REPLICATE_API_TOKEN) {
      throw new Error('Replicate API token not configured');
    }

    const { testImageUrl, testPrompt } = await request.json();
    
    console.log('🧪 Testing Replicate API...');
    console.log('🧪 Test image URL:', testImageUrl);
    console.log('🧪 Test prompt:', testPrompt);

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    // Test with simple image URLs first
    const input = {
      prompt: testPrompt || "Transform this into an Aesop-style minimalist aesthetic",
      aspect_ratio: "1:1" as const,
      input_images: [testImageUrl],
      output_format: "png" as const,
      safety_tolerance: 2
    };

    console.log('🧪 Input to Replicate:', JSON.stringify(input, null, 2));

    const output = await replicate.run("flux-kontext-apps/multi-image-list", { input }) as unknown;

    console.log('🧪 Raw Replicate output:', output);
    console.log('🧪 Output type:', typeof output);
    console.log('🧪 Output constructor:', output && typeof output === 'object' ? output.constructor.name : 'N/A');
    console.log('🧪 Is Buffer:', Buffer.isBuffer(output));
    console.log('🧪 Is Uint8Array:', output instanceof Uint8Array);
    console.log('🧪 Is ReadableStream:', output instanceof ReadableStream);
    console.log('🧪 Output keys:', typeof output === 'object' && output ? Object.keys(output) : 'N/A');

    // Try to extract any URLs from the response
    const foundUrls: string[] = [];
    
    function extractUrls(obj: unknown, path = ''): void {
      if (typeof obj === 'string' && obj.startsWith('http')) {
        foundUrls.push(`${path}: ${obj}`);
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => extractUrls(item, `${path}[${index}]`));
      } else if (typeof obj === 'object' && obj !== null) {
        const objRecord = obj as Record<string, unknown>;
        Object.keys(objRecord).forEach(key => extractUrls(objRecord[key], path ? `${path}.${key}` : key));
      }
    }

    extractUrls(output);

    return NextResponse.json({
      success: true,
      debugInfo: {
        outputType: typeof output,
        outputKeys: typeof output === 'object' && output ? Object.keys(output) : null,
        foundUrls: foundUrls,
        rawOutput: output
      }
    });

  } catch (error) {
    console.error('🧪 Test failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        error: `Test failed: ${errorMessage}`,
        debugInfo: {
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          errorMessage: errorMessage
        }
      },
      { status: 500 }
    );
  }
} 