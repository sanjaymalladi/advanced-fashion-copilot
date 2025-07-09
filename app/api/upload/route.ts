import { NextRequest, NextResponse } from 'next/server';
import { put, del } from '@vercel/blob';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  // Upload to Vercel Blob (public)
  const blob = await put(file.name, file, { access: 'public' });

  return NextResponse.json({ url: blob.url });
}

export async function DELETE(request: NextRequest) {
  const { url } = await request.json();
  if (!url) {
    return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
  }
  try {
    await del(url);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to delete blob' }, { status: 500 });
  }
} 