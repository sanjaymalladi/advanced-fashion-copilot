import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { getBrandById } from '@/lib/brands';

// Configuration
const FLUX_MODEL = "flux-kontext-apps/multi-image-list";
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // 3 seconds

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePromptsFromGemini(geminiText: string | object): string[] {
  try {
    console.log('🔍 Parsing prompts from Gemini response...');
    
    const geminiObj = geminiText as Record<string, unknown>;
    const textString = typeof geminiText === 'string' ? geminiText : 
                      (typeof geminiObj?.brandPrompt === 'string' ? geminiObj.brandPrompt : '') ||
                      (typeof geminiObj?.text === 'string' ? geminiObj.text : '') ||
                      JSON.stringify(geminiText);
    
    // Try to find structured prompts with **PROMPT 1:**, **PROMPT 2:**, etc.
    const structuredPrompts: string[] = [];
    const structuredRegex = /\*\*PROMPT\s+(\d+):\*\*\s*(.+?)(?=\*\*PROMPT\s+\d+:\*\*|$)/gim;
    
    let match;
    while ((match = structuredRegex.exec(textString)) !== null) {
      const promptContent = match[2].trim();
      if (promptContent.length > 20) {
        structuredPrompts.push(promptContent);
      }
    }
    
    if (structuredPrompts.length >= 4) {
      console.log(`✅ Found ${structuredPrompts.length} structured prompts`);
      return structuredPrompts.slice(0, 4);
    }
    
    console.log('⚠️ No structured prompts found, will use original text for all variations');
    return [];
    
  } catch (error) {
    console.error('❌ Error parsing Gemini prompts:', error);
    return [];
  }
}

async function generateSingleImageWithRetry(
  productImageUrls: string[], 
  prompt: string, 
  brandName: string, 
  variationNumber: number
): Promise<string> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🔄 Generating ${brandName} variation ${variationNumber} (attempt ${attempt}/${MAX_RETRIES})`);
      
      const replicate = new Replicate({
        auth: process.env.REPLICATE_API_TOKEN!,
      });
      
      // Ensure we have at least one image, duplicate if necessary for multi-image model
      let inputImages = productImageUrls;
      if (inputImages.length === 1) {
        // Duplicate the single image since the model might expect multiple images
        inputImages = [inputImages[0], inputImages[0], inputImages[0]];
        console.log(`🔄 Duplicated single image to 3 images for multi-image model`);
      }
      
      // Simplify and sanitize the prompt to avoid content filtering
      const sanitizedPrompt = prompt
        .replace(/\bmodel\b/gi, 'person')
        .replace(/\bwoman\b/gi, 'person')
        .replace(/\bgirl\b/gi, 'person')
        .replace(/\bman\b/gi, 'person')
        .replace(/\bboy\b/gi, 'person')
        .replace(/\bface\b/gi, 'portrait')
        .replace(/\bskin\b/gi, 'texture')
        .substring(0, 500); // Limit prompt length
      
      console.log(`🧼 Sanitized prompt: ${sanitizedPrompt}`);
      
      const input = {
        prompt: sanitizedPrompt,
        aspect_ratio: "1:1" as const,
        input_images: inputImages,
        output_format: "png" as const,
        safety_tolerance: 2 as const
      };
      
      console.log(`🔄 Trying multi-image model with input:`, JSON.stringify(input, null, 2));
      const output = await replicate.run(FLUX_MODEL, { input }) as unknown;
      
      if (output === null || output === undefined) {
        console.error(`❌ Replicate returned null/undefined output`);
        throw new Error('Replicate returned null/undefined output');
      }
      
      console.log(`🔍 Raw output from Replicate:`, output);
      console.log(`🔍 Output type:`, typeof output);
      console.log(`🔍 Output constructor:`, output && typeof output === 'object' ? output.constructor.name : 'N/A');
      console.log(`🔍 Is Buffer:`, Buffer.isBuffer(output));
      console.log(`🔍 Is Uint8Array:`, output instanceof Uint8Array);
      console.log(`🔍 Is ReadableStream:`, output instanceof ReadableStream);
      
      // Check if object is truly empty
      if (typeof output === 'object' && output !== null && !Buffer.isBuffer(output) && !(output instanceof Uint8Array) && !(output instanceof ReadableStream)) {
        const keys = Object.keys(output);
        console.log(`🔍 Object has ${keys.length} keys:`, keys);
        if (keys.length === 0) {
          console.error(`❌ Replicate returned empty object {}`);
          throw new Error('Replicate returned empty object - this might indicate a model issue or API problem');
        }
      }
      
      // Handle binary image data (the model returns image data directly)
      if (output instanceof ReadableStream || output instanceof Uint8Array || Buffer.isBuffer(output) || 
          (output && typeof output === 'object' && output.constructor && output.constructor.name === 'File')) {
        console.log(`🔍 Detected binary image data`);
        try {
          let buffer: Buffer;
          
          if (output instanceof ReadableStream) {
            // Convert ReadableStream to buffer
            const reader = output.getReader();
            const chunks: Uint8Array[] = [];
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              chunks.push(value);
            }
            
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            buffer = Buffer.alloc(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              buffer.set(chunk, offset);
              offset += chunk.length;
            }
          } else if (output instanceof Uint8Array) {
            buffer = Buffer.from(output);
          } else if (Buffer.isBuffer(output)) {
            buffer = output;
          } else {
            // Handle File-like objects
            const fileObj = output as { arrayBuffer: () => Promise<ArrayBuffer> };
            const arrayBuffer = await fileObj.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
          }
          
          // Convert to base64 data URL
          const base64Data = buffer.toString('base64');
          const dataUrl = `data:image/png;base64,${base64Data}`;
          
          console.log(`✅ ${brandName} variation ${variationNumber} completed: converted binary to data URL (${buffer.length} bytes)`);
          return dataUrl;
          
        } catch (binaryError) {
          console.error(`❌ Failed to process binary data:`, binaryError);
          throw new Error(`Failed to process binary image data: ${binaryError instanceof Error ? binaryError.message : 'Unknown error'}`);
        }
      }
      
      // Handle different output formats from Replicate API
      let imageUrl: string | null = null;
      
      if (typeof output === 'string' && output.startsWith('http')) {
        // Direct URL string
        imageUrl = output;
      } else if (Array.isArray(output) && output.length > 0) {
        // Array of URLs - take the first one
        const firstItem = output[0];
        console.log(`🔍 First array item:`, firstItem, typeof firstItem);
        if (typeof firstItem === 'string' && firstItem.startsWith('http')) {
          imageUrl = firstItem;
        } else if (typeof firstItem === 'object' && firstItem && 'url' in firstItem) {
          imageUrl = String(firstItem.url);
        }
      } else if (typeof output === 'object' && output && output !== null) {
        console.log(`🔍 Object keys:`, Object.keys(output));
        // Check for direct URL in object
        if ('url' in output && typeof output.url === 'string') {
          imageUrl = output.url;
        }
        // Check for images array
        else if ('images' in output && Array.isArray(output.images)) {
          const images = output.images;
          console.log(`🔍 Images array:`, images);
          if (images.length > 0) {
            const firstImage = images[0];
            if (typeof firstImage === 'string') {
              imageUrl = firstImage;
            } else if (typeof firstImage === 'object' && firstImage && 'url' in firstImage) {
              imageUrl = String(firstImage.url);
            }
          }
        }
        // Check for other possible properties that might contain the URL
        else {
          const outputObj = output as Record<string, unknown>;
          for (const [key, value] of Object.entries(outputObj)) {
            console.log(`🔍 Checking key ${key}:`, value, typeof value);
            if (typeof value === 'string' && value.startsWith('http')) {
              console.log(`🔍 Found URL in key ${key}:`, value);
              imageUrl = value;
              break;
            }
            if (Array.isArray(value) && value.length > 0) {
              const firstItem = value[0];
              if (typeof firstItem === 'string' && firstItem.startsWith('http')) {
                console.log(`🔍 Found URL in array key ${key}:`, firstItem);
                imageUrl = firstItem;
                break;
              }
            }
          }
        }
      }
      
      if (imageUrl && imageUrl.startsWith('http')) {
        console.log(`✅ ${brandName} variation ${variationNumber} completed: ${imageUrl}`);
        return imageUrl;
      } else {
        console.error(`❌ Could not extract valid URL from output. Full output:`, JSON.stringify(output, null, 2));
        throw new Error(`No valid URL found in response. Output keys: ${typeof output === 'object' && output ? Object.keys(output).join(', ') : 'N/A'}`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Attempt ${attempt} failed for ${brandName} variation ${variationNumber}:`, errorMessage);
      
      // Enhanced error logging for Cloudflare issues
      if (errorMessage.includes('403') || errorMessage.includes('Forbidden') || errorMessage.includes('Cloudflare')) {
        console.error(`🚫 CLOUDFLARE BLOCK DETECTED:`, {
          attempt: attempt,
          brandName: brandName,
          variation: variationNumber,
          errorMessage: errorMessage,
          timestamp: new Date().toISOString()
        });
      }
      
      lastError = error instanceof Error ? error : new Error(errorMessage);
      
      if (attempt < MAX_RETRIES) {
        const delayTime = RETRY_DELAY * attempt; // Exponential backoff
        console.log(`⏳ Waiting ${delayTime}ms before retry...`);
        await sleep(delayTime);
      }
    }
  }
  
  throw new Error(`Failed to generate ${brandName} variation ${variationNumber} after ${MAX_RETRIES} attempts: ${lastError!.message}`);
}

export async function POST(request: NextRequest) {
  try {
    const { productImageUrls, brandPrompt, brandId, count = 4 } = await request.json();

    // Accept both single image (backward compatibility) and multiple images
    const imageUrls = Array.isArray(productImageUrls) ? productImageUrls : 
                     productImageUrls ? [productImageUrls] : [];
    
    console.log('🔍 Received image URLs:', imageUrls);
    
    // Upload data URLs to Replicate's file storage
    const processedImageUrls: string[] = [];
    
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      if (url.startsWith('data:')) {
        console.log(`🔄 Uploading data URL ${i + 1} to Replicate file storage...`);
        try {
          const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });
          
          // Convert data URL to buffer
          const base64Data = url.split(',')[1];
          const buffer = Buffer.from(base64Data, 'base64');
          
          // Upload to Replicate
          const uploadedFile = await replicate.files.create(buffer);
          const uploadedUrl = uploadedFile.urls.get;
          
          console.log(`✅ Uploaded to Replicate: ${uploadedUrl}`);
          processedImageUrls.push(uploadedUrl);
        } catch (uploadError) {
          console.error(`❌ Failed to upload image ${i + 1}:`, uploadError);
          // Fallback: try to use the data URL anyway
          processedImageUrls.push(url);
        }
      } else {
        processedImageUrls.push(url);
      }
    }
    
    console.log('🔍 Processed image URLs for Replicate:', processedImageUrls.length, 'images');
    
    if (processedImageUrls.length === 0 || !brandPrompt || !brandId) {
      return NextResponse.json(
        { error: "Missing required parameters: productImageUrls, brandPrompt, brandId" },
        { status: 400 }
      );
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      throw new Error('Replicate API token not configured');
    }

    // Get actual brand data
    const brand = getBrandById(brandId);
    if (!brand) {
      return NextResponse.json(
        { error: "Brand not found" },
        { status: 404 }
      );
    }
    
    console.log(`🎨 Generating ${count} brand images for ${brand.name}...`);
    console.log(`📸 Using ${processedImageUrls.length} input images`);
    
    // Parse the 4 distinct prompts from Gemini response
    const prompts = parsePromptsFromGemini(brandPrompt);
    console.log(`📝 Parsed ${prompts.length} distinct prompts from Gemini`);
    
    // Use the parsed prompts or fall back to the original if parsing fails
    let promptsToUse: string[];
    if (prompts.length >= count) {
      promptsToUse = prompts.slice(0, count);
      console.log(`✅ Using ${promptsToUse.length} parsed prompts`);
    } else {
      // Fallback: use original text for all variations (ensure it's a string)
      const brandObj = brandPrompt as Record<string, unknown>;
      const fallbackText = typeof brandPrompt === 'string' ? brandPrompt : 
                          (typeof brandObj?.brandPrompt === 'string' ? brandObj.brandPrompt : '') ||
                          (typeof brandObj?.text === 'string' ? brandObj.text : '') ||
                          JSON.stringify(brandPrompt);
      promptsToUse = Array(count).fill(fallbackText);
      console.log(`⚠️ Using original prompt for all ${count} variations`);
    }
    
    // Generate all variations in sequence to avoid rate limiting
    const generatedImages: string[] = [];
    const failures: string[] = [];
    
    for (let i = 0; i < promptsToUse.length; i++) {
      try {
        console.log(`🔄 Generating variation ${i + 1}/${promptsToUse.length}...`);
        const result = await generateSingleImageWithRetry(processedImageUrls, promptsToUse[i], brand.name, i + 1);
        generatedImages.push(result);
        console.log(`✅ ${brand.name} variation ${i + 1} succeeded`);
        
        // Small delay between requests
        if (i < promptsToUse.length - 1) {
          await sleep(2000);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failures.push(`Variation ${i + 1}: ${errorMessage}`);
        console.error(`❌ ${brand.name} variation ${i + 1} failed:`, errorMessage);
      }
    }
    
    console.log(`✅ Successfully generated ${generatedImages.length}/${count} ${brand.name} variations`);
    
    if (generatedImages.length === 0) {
      throw new Error(`All ${count} variations failed: ${failures.join(', ')}`);
    }
    
    console.log(`🎉 Final result: ${generatedImages.length} images generated for ${brand.name}`);
    
    return NextResponse.json({ 
      images: generatedImages,
      brandName: brand.name,
      method: "replicate",
      success: true 
    });

  } catch (error) {
    console.error("❌ Error generating brand images:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to generate brand images: ${errorMessage}` },
      { status: 500 }
    );
  }
} 