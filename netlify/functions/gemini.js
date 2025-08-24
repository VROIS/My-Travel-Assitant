import { GoogleGenAI } from "@google/genai";

// This code runs on Netlify's servers, not in the user's browser.
// process.env.API_KEY is securely provided by Netlify's build environment.
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const model = 'gemini-2.5-flash';

// The main handler for the Netlify serverless function.
export default async (req) => {
    if (req.method !== 'POST') {
        return new Response("Method Not Allowed", { status: 405 });
    }

    try {
        const { base64Image, prompt, systemInstruction } = await req.json();

        let contents;
        if (base64Image) {
            const imagePart = {
                inlineData: { mimeType: 'image/jpeg', data: base64Image },
            };
            // Corrected: For a single request, 'contents' should be a single Content object.
            contents = { parts: [imagePart] };
        } else if (prompt) {
            // Corrected: For a simple text request, 'contents' can be just the prompt string.
            contents = prompt;
        } else {
            return new Response(JSON.stringify({ error: "Missing 'base64Image' or 'prompt' in request body" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        const genAIStream = await ai.models.generateContentStream({
            model,
            contents,
            config: {
                systemInstruction,
                temperature: 0.7,
                topP: 0.9,
            }
        });
        
        // Pipe the stream from Google's SDK to a web standard ReadableStream for the browser.
        const readableStream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                for await (const chunk of genAIStream) {
                    const text = chunk.text;
                    if (text) {
                        // Format as a Server-Sent Event (SSE)
                        const sseChunk = `data: ${JSON.stringify({ text })}\n\n`;
                        controller.enqueue(encoder.encode(sseChunk));
                    }
                }
                controller.close();
            }
        });

        return new Response(readableStream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        });

    } catch (error) {
        console.error("Error in Gemini function:", error);
        return new Response(JSON.stringify({ error: "An error occurred while communicating with the AI service." }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
};
