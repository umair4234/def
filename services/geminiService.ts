import { Type } from "@google/genai";
import { ChapterOutline, ThumbnailIdeas } from "../types";
import { OUTLINES_PROMPT_TEMPLATE, HOOK_PROMPT_TEMPLATE, CHAPTER_BATCH_PROMPT_TEMPLATE, THUMBNAIL_IDEAS_PROMPT_TEMPLATE } from "../constants";
import { callGeminiApi, callGeminiImagesApi } from "./apiService";

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

export const generateThumbnailImage = async (prompt: string, textOverlay: string): Promise<string> => {
  // Combine prompt and text overlay instruction
  const fullPrompt = `${prompt}. The image MUST have the following text prominently displayed on it, in a large, bold, easy-to-read font, styled like a viral YouTube thumbnail: "${textOverlay}"`;

  const response = await callGeminiImagesApi({
      model: 'imagen-4.0-generate-001',
      prompt: fullPrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: '16:9',
      },
  });

  if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("Image generation failed to return an image.");
  }

  const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
  return `data:image/jpeg;base64,${base64ImageBytes}`;
};
