import { GoogleGenAI, GenerateContentParameters, GenerateContentResponse } from "@google/genai";

const SESSION_KEY_INDEX = 'current_gemini_api_key_index';
// The free tier for gemini-2.5-flash is 10 RPM. 60s / 10 = 6s per request.
// We'll set it to 7 seconds to be safe and avoid hitting the limit.
const MIN_DELAY_BETWEEN_CALLS_MS = 7000;
let lastApiCallTimestamp = 0;


const getCurrentKeyIndex = (): number => {
    const indexStr = sessionStorage.getItem(SESSION_KEY_INDEX);
    return indexStr ? parseInt(indexStr, 10) : 0;
};

const setCurrentKeyIndex = (index: number) => {
    sessionStorage.setItem(SESSION_KEY_INDEX, index.toString());
};

export const callGeminiApi = async (
    params: Omit<GenerateContentParameters, 'model'> & { model: string }
): Promise<GenerateContentResponse> => {
    const apiKeys: string[] = JSON.parse(localStorage.getItem('gemini_api_keys') || '[]');
    
    if (apiKeys.length === 0) {
        throw new Error("No Gemini API keys found. Please add a key in the API Manager.");
    }

    // --- Rate Limiting Logic ---
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCallTimestamp;
    
    if (timeSinceLastCall < MIN_DELAY_BETWEEN_CALLS_MS) {
        const waitTime = MIN_DELAY_BETWEEN_CALLS_MS - timeSinceLastCall;
        console.log(`Rate limiting: waiting for ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Update the timestamp right after waiting, before making the new call.
    lastApiCallTimestamp = Date.now();
    // --- End Rate Limiting Logic ---

    let keyIndex = getCurrentKeyIndex();
    if (keyIndex >= apiKeys.length) {
        keyIndex = 0;
    }

    let lastError: Error | null = null;

    // Try each key once, starting from the last known good index
    for (let i = 0; i < apiKeys.length; i++) {
        const currentKey = apiKeys[keyIndex];
        try {
            const ai = new GoogleGenAI({ apiKey: currentKey });
            const response = await ai.models.generateContent(params);
            
            // CRITICAL FIX: Access the .text property here to trigger any potential
            // errors (like safety blocks) within this try/catch block.
            const textContent = response.text;

            // If we get here without an error, the call was successful.
            setCurrentKeyIndex(keyIndex);
            return response;

        } catch (error) {
            console.warn(`API key at index ${keyIndex} failed. Trying next key.`, error);
            lastError = error as Error;
            // Rotate to the next key for the next attempt in this loop
            keyIndex = (keyIndex + 1) % apiKeys.length;
        }
    }

    // If the loop completes, all keys failed. Throw the last captured error.
    if (lastError) {
        let finalMessage = lastError.message;
        try {
            // Attempt to parse the error message as JSON to get a cleaner message.
            const parsedError = JSON.parse(lastError.message);
            if (parsedError?.error?.message) {
                finalMessage = parsedError.error.message;
            }
        } catch (e) {
            // Not a JSON error message, use it as is.
        }
        throw new Error(`All API keys failed. Last error: ${finalMessage}`);
    }

    // Fallback error, should be rare
    throw new Error("All available API keys failed. Please check your keys in the API Manager or add new ones.");
};