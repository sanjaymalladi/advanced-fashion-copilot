"use client"

import type React from "react"
import { useState, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Upload, Loader2, ImageIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import BlurImage from '@/components/ui/blur-image';

interface UploadedFile {
  file: File
  preview: string
}

interface AnalysisResult {
  garmentAnalysis: string
  qaChecklist: string
  initialJsonPrompt: string
}

interface GeneratedImage {
  id: string
  title: string
  imageData: string | null
  loading: boolean
  error: string | null
  revealProgress: number
}

// Utility to convert File to base64
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Utility to upload a file to /api/upload and get a public URL
async function uploadFileToBlob(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  if (!res.ok) throw new Error('Failed to upload file');
  const data = await res.json();
  return data.url;
}

// Utility to delete a blob by URL
async function deleteBlobUrl(url: string): Promise<void> {
  await fetch('/api/upload', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

export default function AdvancedFashionCopilot() {
  const [isAdvancedMode, setIsAdvancedMode] = useState(false)
  const [currentView, setCurrentView] = useState<"upload" | "processing">("upload")
  const [advancedStep, setAdvancedStep] = useState<"analyze" | "analysis" | "qa" | "final">("analyze")
  const [simpleModeStep, setSimpleModeStep] = useState<
    | "idle"
    | "analyzing"
    | "frontImage"
    | "qa"
    | "generatingImages"
    | "done"
    | "error"
  >("idle");
  const [simpleModeError, setSimpleModeError] = useState<string | null>(null);
  const [advancedPrompts, setAdvancedPrompts] = useState<any[]>([]);
  const [advancedPromptImages, setAdvancedPromptImages] = useState<{ [key: number]: string }>({});
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [editingPromptValue, setEditingPromptValue] = useState<string>("");

  // File uploads
  const [garmentImages, setGarmentImages] = useState<UploadedFile[]>([])
  const [backgroundImages, setBackgroundImages] = useState<UploadedFile[]>([])
  const [modelImages, setModelImages] = useState<UploadedFile[]>([])
  const [qaImage, setQaImage] = useState<UploadedFile | null>(null)

  // Analysis results
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false)

  // Generated images
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  const handleFileUpload = (
    files: FileList | null,
    setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    maxFiles: number,
  ) => {
    if (!files) return

    const newFiles: UploadedFile[] = []
    for (let i = 0; i < Math.min(files.length, maxFiles); i++) {
      const file = files[i]
      const preview = URL.createObjectURL(file)
      newFiles.push({ file, preview })
    }

    setter((prev) => [...prev, ...newFiles].slice(0, maxFiles))
  }

  const handleSingleFileUpload = (
    files: FileList | null,
    setter: React.Dispatch<React.SetStateAction<UploadedFile | null>>,
  ) => {
    if (!files || files.length === 0) return

    const file = files[0]
    const preview = URL.createObjectURL(file)
    setter({ file, preview })
  }

  const removeFile = (index: number, setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>) => {
    setter((prev) => prev.filter((_, i) => i !== index))
  }

  const startAnalysis = async () => {
    setIsAnalyzing(true)
    setCurrentView("processing")
    try {
      // Prepare garment images as base64
      const garmentImagesBase64 = await Promise.all(
        garmentImages.map(async (img) => ({
          mimeType: img.file.type,
          base64: await fileToBase64(img.file),
        }))
      );
      // Prepare background/model refs if present
      const backgroundImagesBase64 = await Promise.all(
        backgroundImages.map(async (img) => ({
          mimeType: img.file.type,
          base64: await fileToBase64(img.file),
        }))
      );
      const modelImagesBase64 = await Promise.all(
        modelImages.map(async (img) => ({
          mimeType: img.file.type,
          base64: await fileToBase64(img.file),
        }))
      );
      // Call Gemini Edge API
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          garmentImages: garmentImagesBase64,
          backgroundRefImages: backgroundImagesBase64.length > 0 ? backgroundImagesBase64 : undefined,
          modelRefImages: modelImagesBase64.length > 0 ? modelImagesBase64 : undefined,
          mode: "analysis"
        }),
      });
      const data = await res.json();
      if (res.ok && data.result) {
        setAnalysisResult(data.result);
        setAdvancedStep("analysis");
      } else {
        setAnalysisResult(null);
        alert(data.error || "Failed to analyze garment");
      }
    } catch (err) {
      setAnalysisResult(null);
      alert("Error analyzing garment: " + (err instanceof Error ? err.message : String(err)));
    }
    setIsAnalyzing(false)
  }

  const performQA = async () => {
    setIsGeneratingPrompts(true)

    await new Promise((resolve) => setTimeout(resolve, 2500))

    setAdvancedStep("final")
    setIsGeneratingPrompts(false)
  }

  const generateImages = async (type: "studio" | "lifestyle") => {
    setIsProcessing(true)
    if (!isAdvancedMode) {
      setSimpleModeStep("analyzing");
      setSimpleModeError(null);
      try {
        // 1. Analyze garments
        const garmentImageUrls = await Promise.all(
          garmentImages.map(async (img) => await uploadFileToBlob(img.file))
        );
        const analysisRes = await fetch('/api/v1/fashion/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            garmentImages: garmentImageUrls.map((url) => ({ url })),
            backgroundRefImages: [],
            modelRefImages: [],
          }),
        });
        const analysisData = await analysisRes.json();
        if (!analysisRes.ok || !analysisData) throw new Error(analysisData.error || 'Analysis failed');
        setSimpleModeStep("frontImage");
        // 2. Generate front-facing image
        const frontImageRes = await fetch('/api/v1/images/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: analysisData.initialJsonPrompt,
            aspect_ratio: '3:4',
            input_images: garmentImageUrls,
          }),
        });
        const frontImageData = await frontImageRes.json();
        if (!frontImageRes.ok || !frontImageData.imageUrl) throw new Error(frontImageData.error || 'Front image generation failed');
        setSimpleModeStep("qa");
        // 3. Perform QA and get refined prompts
        const qaRes = await fetch('/api/v1/fashion/perform-qa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalGarmentImages: garmentImageUrls,
            generatedFashionImage: { base64: frontImageData.imageUrl, mimeType: 'image/png' },
            analysisData,
          }),
        });
        const refinedPrompts = await qaRes.json();
        if (!qaRes.ok || !Array.isArray(refinedPrompts)) throw new Error(refinedPrompts.error || 'QA failed');
        setSimpleModeStep("generatingImages");
        // 4. Generate the rest of the images using refined prompts
        const imagesToGenerate = refinedPrompts.slice(0, 4).map((promptObj: any, index: number) => ({
          id: `${type}-${index}`,
          title: promptObj.title || `${type.charAt(0).toUpperCase() + type.slice(1)} Image ${index + 1}`,
          imageData: null,
          loading: true,
          error: null,
          revealProgress: 0,
        }));
        setGeneratedImages(imagesToGenerate);
        for (let i = 0; i < imagesToGenerate.length; i++) {
          try {
            const res = await fetch('/api/v1/images/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: refinedPrompts[i].prompt,
                aspect_ratio: '3:4',
                input_image_1: frontImageData.imageUrl,
                input_image_2: garmentImageUrls[0],
              }),
            });
            const data = await res.json();
            setGeneratedImages((prev) =>
              prev.map((img, idx) =>
                idx === i
                  ? { ...img, loading: false, imageData: data.imageUrl || null, error: data.error || null }
                  : img
              )
            );
          } catch (err) {
            setGeneratedImages((prev) =>
              prev.map((img, idx) =>
                idx === i
                  ? { ...img, loading: false, imageData: null, error: err instanceof Error ? err.message : String(err) }
                  : img
              )
            );
          }
        }
        setSimpleModeStep("done");
      } catch (err) {
        setSimpleModeStep("error");
        setSimpleModeError(err instanceof Error ? err.message : String(err));
        setGeneratedImages([
          {
            id: `${type}-0`,
            title: 'Error',
            imageData: null,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
            revealProgress: 0,
          },
        ]);
      }
      setIsProcessing(false);
      return;
    }

    // ADVANCED MODE (existing logic)
    const garmentImageUrls = await Promise.all(
      garmentImages.map(async (img) => await uploadFileToBlob(img.file))
    );
    const imagesToGenerate = Array.from({ length: 4 }, (_, index) => ({
      id: `${type}-${index}`,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} Image ${index + 1}`,
      imageData: null,
      loading: true,
      error: null,
      revealProgress: 0,
    }))
    setGeneratedImages(imagesToGenerate)
    const prompt = analysisResult?.initialJsonPrompt || "Fashion image";
    for (let i = 0; i < 4; i++) {
      try {
        const res = await fetch("/api/v1/images/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            aspect_ratio: "3:4",
            input_image_1: garmentImageUrls[0],
            input_image_2: garmentImageUrls[1] || garmentImageUrls[0],
          }),
        });
        const data = await res.json();
        if (res.ok && data.imageUrl) {
          setGeneratedImages((prev) =>
            prev.map((img, idx) =>
              idx === i
                ? { ...img, loading: false, imageData: data.imageUrl, error: null }
                : img
            )
          );
        } else {
          setGeneratedImages((prev) =>
            prev.map((img, idx) =>
              idx === i
                ? { ...img, loading: false, imageData: null, error: data.error || "Failed to generate image" }
                : img
            )
          );
        }
      } catch (err) {
        setGeneratedImages((prev) =>
          prev.map((img, idx) =>
            idx === i
              ? { ...img, loading: false, imageData: null, error: err instanceof Error ? err.message : String(err) }
              : img
          )
        );
      }
    }
    setIsProcessing(false)
  }

  const startProcessing = async (type: "studio" | "lifestyle") => {
    setCurrentView("processing")
    if (!isAdvancedMode) {
      await generateImages(type)
    }
  }

  const UploadSection = ({
    title,
    files,
    onUpload,
    onRemove,
    maxFiles,
    icon,
  }: {
    title: string
    files: UploadedFile[]
    onUpload: (files: FileList | null) => void
    onRemove: (index: number) => void
    maxFiles: number
    icon: string
  }) => (
    <div className="flex-1 space-y-4">
      <div className="text-center">
        <div className="text-3xl mb-2">{icon}</div>
        <h3 className="font-medium text-sm text-gray-700">{title}</h3>
        <p className="text-xs text-gray-500">Max {maxFiles} files</p>
      </div>

      <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-gray-300 transition-all duration-300 backdrop-blur-sm bg-white/50 min-h-[140px] flex flex-col justify-center">
        <input
          type="file"
          multiple={maxFiles > 1}
          accept="image/*"
          onChange={(e) => onUpload(e.target.files)}
          className="hidden"
          id={title.replace(/\s+/g, "-").toLowerCase()}
        />
        <label
          htmlFor={title.replace(/\s+/g, "-").toLowerCase()}
          className="cursor-pointer flex flex-col items-center space-y-2"
        >
          <Upload className="h-8 w-8 text-gray-400" />
          <span className="text-sm text-gray-600">Drop or click to upload</span>
        </label>
      </div>

      {files.length > 0 && (
        <div className="space-y-3">
          {files.map((file, index) => (
            <div key={index} className="relative group">
              <div className="relative overflow-hidden rounded-lg border backdrop-blur-sm bg-white/80">
                <img
                  src={file.preview || "/placeholder.svg"}
                  alt={`Upload ${index + 1}`}
                  className="w-full h-32 object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <button
                  onClick={() => onRemove(index)}
                  className="absolute top-2 right-2 bg-red-500/90 backdrop-blur-sm text-white rounded-full w-6 h-6 flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-600"
                >
                  ×
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1 truncate">{file.file.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const SingleFileUploader = ({
    title,
    file,
    onUpload,
    onRemove,
  }: {
    title: string
    file: UploadedFile | null
    onUpload: (files: FileList | null) => void
    onRemove: () => void
  }) => (
    <div className="space-y-4">
      <Label className="text-sm font-medium">{title}</Label>
      <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-gray-300 transition-all duration-300 backdrop-blur-sm bg-white/50">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onUpload(e.target.files)}
          className="hidden"
          id={title.replace(/\s+/g, "-").toLowerCase()}
        />
        <label
          htmlFor={title.replace(/\s+/g, "-").toLowerCase()}
          className="cursor-pointer flex flex-col items-center space-y-2"
        >
          <Upload className="h-8 w-8 text-gray-400" />
          <span className="text-sm text-gray-600">Drop test image here or click to upload</span>
        </label>
      </div>

      {file && (
        <div className="relative group">
          <div className="relative overflow-hidden rounded-lg border backdrop-blur-sm bg-white/80">
            <img src={file.preview || "/placeholder.svg"} alt="QA Upload" className="w-full h-48 object-cover" />
            <button
              onClick={onRemove}
              className="absolute top-2 right-2 bg-red-500/90 backdrop-blur-sm text-white rounded-full w-6 h-6 flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-all duration-200"
            >
              ×
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1 truncate">{file.file.name}</p>
        </div>
      )}
    </div>
  )

  const ImageCarousel = ({ images }: { images: GeneratedImage[] }) => {
    const completedImages = images.filter((img) => !img.loading && img.imageData)

    if (completedImages.length === 0) return null

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">Generated Images ({completedImages.length})</h3>
          <div className="flex items-center space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentImageIndex(Math.max(0, currentImageIndex - 1))}
              disabled={currentImageIndex === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-gray-500">
              {currentImageIndex + 1} / {completedImages.length}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCurrentImageIndex(Math.min(completedImages.length - 1, currentImageIndex + 1))}
              disabled={currentImageIndex === completedImages.length - 1}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Main Image */}
        <div className="relative">
          <div className="aspect-[3/4] bg-white rounded-xl border overflow-hidden shadow-lg backdrop-blur-sm">
            <img
              src={completedImages[currentImageIndex]?.imageData || "/placeholder.svg"}
              alt={completedImages[currentImageIndex]?.title}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute bottom-4 left-4 backdrop-blur-md bg-black/20 text-white px-3 py-1 rounded-full text-sm">
            {completedImages[currentImageIndex]?.title}
          </div>
        </div>

        {/* Thumbnail Stack */}
        <div className="flex space-x-2 overflow-x-auto pb-2">
          {completedImages.map((image, index) => (
            <button
              key={image.id}
              onClick={() => setCurrentImageIndex(index)}
              className={`flex-shrink-0 relative ${
                index === currentImageIndex ? "ring-2 ring-blue-500" : ""
              } rounded-lg overflow-hidden transition-all duration-200 hover:scale-105`}
            >
              <img src={image.imageData! || "/placeholder.svg"} alt={image.title} className="w-16 h-20 object-cover" />
              <div
                className={`absolute inset-0 ${
                  index === currentImageIndex ? "bg-blue-500/20" : "bg-black/20"
                } transition-colors`}
              />
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Simple Mode Stepper UI
  const simpleModeSteps = [
    { key: "analyzing", label: "Analyzing Garments" },
    { key: "frontImage", label: "Generating Front Image" },
    { key: "qa", label: "Performing QA & Refining Prompts" },
    { key: "generatingImages", label: "Generating Final Images" },
    { key: "done", label: "Done" },
  ];

  if (currentView === "upload") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        {/* Navigation */}
        <nav className="backdrop-blur-md bg-white/80 border-b border-gray-200/50 px-6 py-4 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <img src="https://framerusercontent.com/images/Sn5VF1Si4Nr6jofjVzhOWDq5sGo.svg" alt="Logo" style={{height: 40}} />

            <div className="flex items-center space-x-3">
              <Label htmlFor="mode-toggle" className="text-sm text-gray-600">
                Simple
              </Label>
              <Switch id="mode-toggle" checked={isAdvancedMode} onCheckedChange={setIsAdvancedMode} />
              <Label htmlFor="mode-toggle" className="text-sm text-gray-600">
                Advanced
              </Label>
            </div>
          </div>
        </nav>

        {/* Main Upload Interface */}
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)] p-6">
          <div className="w-full max-w-5xl space-y-8">
            {/* Central Upload Bar */}
            <Card className="p-8 backdrop-blur-md bg-white/80 border-0 shadow-xl">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-3">Upload Your Assets</h2>
                <p className="text-gray-600 text-lg">
                  Upload your garment images and optional references to get started
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <UploadSection
                  title="Garment Images"
                  files={garmentImages}
                  onUpload={(files) => handleFileUpload(files, setGarmentImages, 2)}
                  onRemove={(index) => removeFile(index, setGarmentImages)}
                  maxFiles={2}
                  icon="👕"
                />

                <UploadSection
                  title="Background Reference"
                  files={backgroundImages}
                  onUpload={(files) => handleFileUpload(files, setBackgroundImages, 3)}
                  onRemove={(index) => removeFile(index, setBackgroundImages)}
                  maxFiles={3}
                  icon="🏙️"
                />

                <UploadSection
                  title="Model Reference"
                  files={modelImages}
                  onUpload={(files) => handleFileUpload(files, setModelImages, 3)}
                  onRemove={(index) => removeFile(index, setModelImages)}
                  maxFiles={3}
                  icon="👤"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {isAdvancedMode ? (
                  <Button
                    onClick={startAnalysis}
                    disabled={garmentImages.length === 0}
                    size="lg"
                    className="px-12 py-3 text-lg backdrop-blur-sm bg-blue-600/90 hover:bg-blue-700/90"
                  >
                    <ImageIcon className="w-5 h-5 mr-3" />
                    Analyze Garment
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={() => startProcessing("studio")}
                      disabled={garmentImages.length === 0}
                      size="lg"
                      className="px-8 py-3 backdrop-blur-sm bg-blue-600/90 hover:bg-blue-700/90"
                    >
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Generate Studio Images
                    </Button>

                    <Button
                      onClick={() => startProcessing("lifestyle")}
                      disabled={garmentImages.length === 0}
                      size="lg"
                      variant="outline"
                      className="px-8 py-3 backdrop-blur-sm bg-white/50 hover:bg-white/70"
                    >
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Generate Lifestyle Images
                    </Button>
                  </>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  // Processing View - Two Panel Layout
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      {/* Navigation */}
      <nav className="backdrop-blur-md bg-white/80 border-b border-gray-200/50 px-6 py-4 flex-shrink-0 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setCurrentView("upload")}>← Back</Button>
            <img src="https://framerusercontent.com/images/Sn5VF1Si4Nr6jofjVzhOWDq5sGo.svg" alt="Logo" style={{height: 40}} />
          </div>

          <div className="flex items-center space-x-3">
            <Label htmlFor="mode-toggle" className="text-sm text-gray-600">
              Simple
            </Label>
            <Switch id="mode-toggle" checked={isAdvancedMode} onCheckedChange={setIsAdvancedMode} />
            <Label htmlFor="mode-toggle" className="text-sm text-gray-600">
              Advanced
            </Label>
          </div>
        </div>
      </nav>

      {/* Two Panel Layout */}
      <div className="flex-1 flex">
        {/* Left Panel - Process Flow */}
        <div className="w-1/2 backdrop-blur-md bg-white/80 border-r border-gray-200/50 p-6 overflow-y-auto">
          <div className="space-y-6">
            {isAdvancedMode ? (
              <>
                {/* Advanced Mode Sections */}
                {advancedStep === "analyze" && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900">Advanced Analysis</h2>
                    <p className="text-sm text-gray-600">Click analyze to start the detailed AI processing workflow</p>
                    <Button
                      onClick={startAnalysis}
                      disabled={isAnalyzing}
                      size="lg"
                      className="w-full backdrop-blur-sm bg-blue-600/90 hover:bg-blue-700/90"
                    >
                      {isAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Analyze Garment & Generate Initial Prompt
                    </Button>
                  </div>
                )}

                {advancedStep === "analysis" && analysisResult && (
                  <div className="space-y-6">
                    <h2 className="text-lg font-semibold text-gray-900">Initial Analysis & Prompt Output</h2>

                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Garment Analysis</Label>
                        <Textarea
                          value={analysisResult.garmentAnalysis}
                          readOnly
                          className="mt-2 min-h-[120px] backdrop-blur-sm bg-white/50"
                        />
                      </div>

                      <div>
                        <Label className="text-sm font-medium">QA Checklist</Label>
                        <Textarea
                          value={analysisResult.qaChecklist}
                          readOnly
                          className="mt-2 min-h-[120px] backdrop-blur-sm bg-white/50"
                        />
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Initial JSON Prompt</Label>
                        <Textarea
                          value={analysisResult.initialJsonPrompt}
                          readOnly
                          className="mt-2 min-h-[120px] font-mono text-sm backdrop-blur-sm bg-white/50"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={() => setAdvancedStep("qa")}
                      size="lg"
                      className="w-full backdrop-blur-sm bg-green-600/90 hover:bg-green-700/90"
                    >
                      Continue to QA Upload
                    </Button>
                  </div>
                )}

                {advancedStep === "qa" && (
                  <div className="space-y-6">
                    <h2 className="text-lg font-semibold text-gray-900">QA Image Upload</h2>
                    <p className="text-sm text-gray-600">
                      Upload a test image generated from the initial prompt for quality assurance
                    </p>

                    <SingleFileUploader
                      title="Test Image for QA"
                      file={qaImage}
                      onUpload={(files) => handleSingleFileUpload(files, setQaImage)}
                      onRemove={() => setQaImage(null)}
                    />

                    {qaImage && (
                      <Button
                        onClick={performQA}
                        disabled={isGeneratingPrompts}
                        size="lg"
                        className="w-full backdrop-blur-sm bg-purple-600/90 hover:bg-purple-700/90"
                      >
                        {isGeneratingPrompts ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Perform QA & Generate Final Prompts
                      </Button>
                    )}
                  </div>
                )}

                {advancedStep === "final" && (
                  <div className="space-y-6">
                    <h2 className="text-lg font-semibold text-gray-900">Final Output & Image Generation</h2>
                    <p className="text-sm text-gray-600">Ready to generate your final fashion images</p>
                    {advancedPrompts.length > 0 && (
                      <div className="space-y-4">
                        {advancedPrompts.map((promptObj, idx) => (
                          <div key={idx} className="flex items-center gap-4 border-b pb-4 mb-4">
                            <div className="flex-1">
                              {editingPromptIndex === idx ? (
                                <>
                                  <textarea
                                    className="w-full border rounded p-2 mb-2"
                                    value={editingPromptValue}
                                    onChange={e => setEditingPromptValue(e.target.value)}
                                  />
                                  <div className="flex gap-2">
                                    <Button onClick={async () => {
                                      // Save edit
                                      const newPrompts = [...advancedPrompts];
                                      newPrompts[idx].prompt = editingPromptValue;
                                      setAdvancedPrompts(newPrompts);
                                      setEditingPromptIndex(null);
                                    }}>Save</Button>
                                    <Button variant="outline" onClick={() => setEditingPromptIndex(null)}>Cancel</Button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="font-medium mb-1">{promptObj.title}</div>
                                  <div className="text-sm text-gray-700 mb-2 whitespace-pre-line">{promptObj.prompt}</div>
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => {
                                      setEditingPromptIndex(idx);
                                      setEditingPromptValue(promptObj.prompt);
                                    }}>Edit</Button>
                                    <Button size="sm" onClick={async () => {
                                      // Generate image for this prompt
                                      setAdvancedPromptImages(prev => ({ ...prev, [idx]: 'loading' }));
                                      try {
                                        const garmentImagesBase64 = await Promise.all(
                                          garmentImages.map(async (img) => await fileToBase64(img.file))
                                        );
                                        const res = await fetch('/api/v1/images/generate', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            prompt: promptObj.prompt,
                                            aspect_ratio: '3:4',
                                            input_images: garmentImagesBase64,
                                          }),
                                        });
                                        const data = await res.json();
                                        setAdvancedPromptImages(prev => ({ ...prev, [idx]: data.imageUrl || '' }));
                                      } catch (err) {
                                        setAdvancedPromptImages(prev => ({ ...prev, [idx]: '' }));
                                      }
                                    }}>Generate Image</Button>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="w-40 h-56 flex items-center justify-center">
                              {advancedPromptImages[idx] === 'loading' ? (
                                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                              ) : advancedPromptImages[idx] ? (
                                <BlurImage src={advancedPromptImages[idx]} alt={promptObj.title} width={160} height={224} />
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Existing buttons for generating all images */}
                    <div className="flex flex-col gap-3">
                      <Button
                        onClick={() => generateImages("studio")}
                        disabled={isProcessing}
                        className="backdrop-blur-sm bg-blue-600/90 hover:bg-blue-700/90"
                      >
                        {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Generate 4 Studio Images
                      </Button>
                      <Button
                        onClick={() => generateImages("lifestyle")}
                        disabled={isProcessing}
                        variant="outline"
                        className="backdrop-blur-sm bg-white/50 hover:bg-white/70"
                      >
                        {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Generate 4 Lifestyle Images
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Simple Generation</h2>
                <p className="text-sm text-gray-600">Streamlined AI processing for quick results</p>

                {isProcessing && !isAdvancedMode && (
                  <div className="mb-6">
                    <ol className="flex space-x-4">
                      {simpleModeSteps.map((step, idx) => (
                        <li key={step.key} className={`flex-1 text-center ${simpleModeStep === step.key ? 'font-bold text-blue-600' : 'text-gray-400'}`}>{step.label}</li>
                      ))}
                    </ol>
                    {simpleModeError && <div className="text-red-500 text-sm mt-2">{simpleModeError}</div>}
                  </div>
                )}

                {simpleModeStep === "analyzing" && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900">Simple Analysis</h2>
                    <p className="text-sm text-gray-600">Click analyze to start the detailed AI processing workflow</p>
                    <Button
                      onClick={startAnalysis}
                      disabled={isAnalyzing}
                      size="lg"
                      className="w-full backdrop-blur-sm bg-blue-600/90 hover:bg-blue-700/90"
                    >
                      {isAnalyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Analyze Garment & Generate Initial Prompt
                    </Button>
                  </div>
                )}

                {simpleModeStep === "frontImage" && analysisResult && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900">Simple Front Image Generation</h2>
                    <p className="text-sm text-gray-600">Click generate to start the front image generation workflow</p>
                    <Button
                      onClick={() => generateImages("studio")}
                      disabled={isProcessing}
                      size="lg"
                      className="w-full backdrop-blur-sm bg-blue-600/90 hover:bg-blue-700/90"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Generate Front Image
                    </Button>
                  </div>
                )}

                {simpleModeStep === "qa" && qaImage && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900">Simple QA & Refinement</h2>
                    <p className="text-sm text-gray-600">Click perform QA to start the quality assurance workflow</p>
                    <Button
                      onClick={performQA}
                      disabled={isGeneratingPrompts}
                      size="lg"
                      className="w-full backdrop-blur-sm bg-purple-600/90 hover:bg-purple-700/90"
                    >
                      {isGeneratingPrompts ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Perform QA & Generate Final Prompts
                    </Button>
                  </div>
                )}

                {simpleModeStep === "generatingImages" && generatedImages.length > 0 && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900">Simple Final Image Generation</h2>
                    <p className="text-sm text-gray-600">Click generate to start the final image generation workflow</p>
                    <div className="flex flex-col gap-3">
                      <Button
                        onClick={() => generateImages("studio")}
                        disabled={isProcessing}
                        className="backdrop-blur-sm bg-blue-600/90 hover:bg-blue-700/90"
                      >
                        {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Generate 4 Studio Images
                      </Button>

                      <Button
                        onClick={() => generateImages("lifestyle")}
                        disabled={isProcessing}
                        variant="outline"
                        className="backdrop-blur-sm bg-white/50 hover:bg-white/70"
                      >
                        {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Generate 4 Lifestyle Images
                      </Button>
                    </div>
                  </div>
                )}

                {simpleModeStep === "done" && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900">Simple Generation Complete</h2>
                    <p className="text-sm text-gray-600">Your images have been generated!</p>
                    <div className="flex flex-col gap-3">
                      <Button
                        onClick={() => generateImages("studio")}
                        disabled={isProcessing}
                        className="backdrop-blur-sm bg-blue-600/90 hover:bg-blue-700/90"
                      >
                        {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Generate 4 Studio Images
                      </Button>

                      <Button
                        onClick={() => generateImages("lifestyle")}
                        disabled={isProcessing}
                        variant="outline"
                        className="backdrop-blur-sm bg-white/50 hover:bg-white/70"
                      >
                        {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Generate 4 Lifestyle Images
                      </Button>
                    </div>
                  </div>
                )}

                {simpleModeStep === "error" && (
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold text-gray-900">Simple Generation Error</h2>
                    <p className="text-sm text-gray-600">An error occurred during generation.</p>
                    <Button
                      onClick={() => setSimpleModeStep("analyzing")}
                      size="lg"
                      className="w-full backdrop-blur-sm bg-red-600/90 hover:bg-red-700/90"
                    >
                      Retry Analysis
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Generated Images */}
        <div className="w-1/2 backdrop-blur-md bg-gray-50/80 p-6 overflow-y-auto">
          <div className="space-y-6">
            {generatedImages.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-gray-500">
                <div className="text-center">
                  <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg">Images will appear here as they're generated</p>
                </div>
              </div>
            ) : (
              <>
                <ImageCarousel images={generatedImages} />

                {/* Individual Image Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {generatedImages.map((image) => (
                    <div key={image.id} className="space-y-2">
                      <h3 className="font-medium text-sm text-gray-700">{image.title}</h3>
                      <div className="aspect-[3/4] bg-white rounded-lg border overflow-hidden shadow-sm backdrop-blur-sm relative">
                        {image.loading ? (
                          <div className="w-full h-full bg-gray-200 animate-pulse" />
                        ) : image.error ? (
                          <div className="w-full h-full flex items-center justify-center text-red-500 text-sm">
                            Error generating image
                          </div>
                        ) : (
                          <div className="relative w-full h-full">
                            <BlurImage src={image.imageData! || "/placeholder.svg"} alt={image.title} width={300} height={400} />
                            {/* Blur reveal effect */}
                            <div
                              className="absolute inset-0 backdrop-blur-md bg-white/20 transition-all duration-1000"
                              style={{
                                clipPath: `inset(${image.revealProgress}% 0 0 0)`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
