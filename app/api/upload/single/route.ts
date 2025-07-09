import { NextRequest, NextResponse } from 'next/server';

// Test endpoint to verify routing works
export async function GET() {
  return NextResponse.json({
    message: 'Upload endpoint is working',
    endpoint: '/api/upload/single',
    methods: ['GET', 'POST'],
    note: 'Files are converted to data URLs for immediate processing'
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log('📤 Processing file upload:', file.name);
    console.log('📄 File size:', file.size);
    console.log('📄 File type:', file.type);

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Only image files are allowed' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Convert file to base64 data URL (no file system storage needed)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    // Generate unique identifier for tracking
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const filename = `upload_${timestamp}_${randomString}.${file.name.split('.').pop() || 'jpg'}`;

    console.log('✅ File processed successfully:', filename);

    return NextResponse.json({
      url: dataUrl,  // Return data URL instead of file path
      filename: file.name,
      savedAs: filename,
      size: file.size,
      mimetype: file.type
    });

  } catch (error) {
    console.error('❌ Error processing file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `File processing failed: ${errorMessage}` },
      { status: 500 }
    );
  }
} 