import { Modality, Type } from "@google/genai";
import { ChapterOutline, ThumbnailIdeas, TitleDescriptionPackage } from "../types";
import { OUTLINES_PROMPT_TEMPLATE, HOOK_PROMPT_TEMPLATE, CHAPTER_BATCH_PROMPT_TEMPLATE, THUMBNAIL_IDEAS_PROMPT_TEMPLATE, TITLES_DESCRIPTIONS_PROMPT_TEMPLATE } from "../constants";
import { callGeminiApi, callImagenApi } from "./apiService";

export const generateOutlines = async (title: string, concept: string, duration: number): Promise<string> => {
  const prompt = OUTLINES_PROMPT_TEMPLATE(title, concept, duration);
  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return response.text;
};

export const generateHook = async (outlinesText: string): Promise<string> => {
  const prompt = HOOK_PROMPT_TEMPLATE(outlinesText);
  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return response.text;
};

export const generateChapterBatch = async (
  fullOutlinesText: string,
  chapters: ChapterOutline[]
): Promise<string[]> => {
  if (chapters.length === 0) return [];
  
  const prompt = CHAPTER_BATCH_PROMPT_TEMPLATE(fullOutlinesText, chapters);
  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  const content = response.text;
  const chapterContents = content.split('---CHAPTER-BREAK---').map(c => c.trim());
  
  if (chapterContents.length !== chapters.length) {
    console.error("Mismatch between requested and generated chapters.", {
      requested: chapters.length,
      received: chapterContents.length,
    });
  }
  
  return chapterContents;
};

export const generateThumbnailIdeas = async (title: string, hook: string): Promise<ThumbnailIdeas> => {
  const prompt = THUMBNAIL_IDEAS_PROMPT_TEMPLATE(title, hook);
  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          image_generation_prompt: {
            type: Type.STRING,
            description: "A detailed, ready-to-use image generation prompt for a cinematic thumbnail."
          },
          text_on_thumbnail: {
            type: Type.STRING,
            description: "The exact, punchy, all-caps text to overlay on the thumbnail."
          }
        }
      }
    }
  });

  try {
    const jsonStr = response.text.trim();
    const parsed = JSON.parse(jsonStr);
    return parsed as ThumbnailIdeas;
  } catch (error) {
    console.error("Failed to parse thumbnail ideas JSON:", error);
    throw new Error("Could not parse the thumbnail ideas from the AI response.");
  }
};

export const generateTitlesAndDescriptions = async (originalTitle: string, fullScript: string): Promise<TitleDescriptionPackage[]> => {
  const prompt = TITLES_DESCRIPTIONS_PROMPT_TEMPLATE(originalTitle, fullScript);
  const response = await callGeminiApi({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "The video title, under 100 characters."
            },
            description: {
              type: Type.STRING,
              description: "A 2-3 line summary of the video's story."
            },
            hashtags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "An array of 5 relevant hashtags."
            }
          }
        }
      }
    }
  });

  try {
    const jsonStr = response.text.trim();
    const parsed = JSON.parse(jsonStr) as Omit<TitleDescriptionPackage, 'id' | 'status'>[];
    // Add the id and default status client-side
    return parsed.map((item, index) => ({
      ...item,
      id: index + 1,
      status: 'Unused'
    }));
  } catch (error) {
    console.error("Failed to parse titles and descriptions JSON:", error);
    throw new Error("Could not parse the titles and descriptions from the AI response.");
  }
};

function fileToGenerativePart(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL format');
  }
  const mimeType = match[1];
  const data = match[2];
  return {
    inlineData: {
      mimeType,
      data,
    },
  };
}

export const generateThumbnailImage = async (
  prompt: string,
  textOverlay: string,
  addTextOverlay: boolean,
  model: 'gemini-2.5-flash-image-preview' | 'imagen-4.0-generate-001',
  baseImage?: string
): Promise<string> => {
  if (model === 'imagen-4.0-generate-001') {
    if (baseImage) {
      throw new Error("Imagen 4.0 does not support image editing/variations.");
    }

    const response = await callImagenApi({
      model: 'imagen-4.0-generate-001',
      prompt: prompt, // Text overlay is not reliable with Imagen
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '16:9',
      },
    });

    const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
    return `data:image/jpeg;base64,${base64ImageBytes}`;

  } else { // gemini-2.5-flash-image-preview
    let fullPrompt = prompt;

    if (!baseImage && addTextOverlay) {
      // For initial generation with text.
      fullPrompt = `${prompt}. The image MUST have the following text prominently displayed on it, in a large, bold, easy-to-read font, styled like a viral YouTube thumbnail: "${textOverlay}"`;
    } else if (baseImage) {
      // For variations, the prompt is just the edit instruction.
      fullPrompt = prompt;
    }

    const parts: any[] = [];
    if (baseImage) {
      parts.push(fileToGenerativePart(baseImage));
    }
    parts.push({ text: fullPrompt });

    const response = await callGeminiApi({
      model: 'gemini-2.5-flash-image-preview',
      contents: { parts }, // FIX: The payload should be an object, not an array of objects.
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (!imagePart || !imagePart.inlineData) {
      console.error("Image generation response did not contain an image part:", response);
      throw new Error("Image generation failed to return an image.");
    }

    const { mimeType, data } = imagePart.inlineData;
    return `data:${mimeType};base64,${data}`;
  }
};