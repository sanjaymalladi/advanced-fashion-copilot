import Replicate from "replicate";

interface ReplicateInputs {
  prompt: string;
  aspect_ratio: string; // e.g., "1:1", "16:9"
  input_images: string[]; // Array of Data URLs or public URLs
}

export const generateImageViaReplicate = async (inputs: ReplicateInputs): Promise<string> => {
  if (!process.env.REPLICATE_API_TOKEN) {
    console.error("REPLICATE_API_TOKEN is not set in environment variables.");
    throw new Error("Replicate API token is not configured.");
  }

  if (!inputs.input_images || inputs.input_images.length < 2) {
    throw new Error("At least two input images must be provided in input_images array.");
  }

  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

  const input = {
    prompt: inputs.prompt,
    aspect_ratio: inputs.aspect_ratio,
    input_images: inputs.input_images,
  };

  try {
    const output = await replicate.run(
      "flux-kontext-apps/multi-image-list",
      { input }
    );
    if (Array.isArray(output) && output.length > 0) {
      return output[0]; // Return the first output image URL
    } else if (typeof output === "string") {
      return output;
    } else {
      throw new Error("Replicate output format is unexpected.");
    }
  } catch (error) {
    console.error("Error running Replicate model:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to generate image: ${error.message}`);
    }
    throw new Error("An unknown error occurred while generating image.");
  }
};
