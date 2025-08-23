import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set. Please set it in your hosting environment's secrets.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const model = 'gemini-2.5-flash';

const imageSystemInstruction = `당신은 세계 최고의 여행 가이드 도슨트입니다. 제공된 이미지를 분석하여, 한국어로 생생하게 설명해주세요.

[분석 유형별 가이드라인]
• 미술작품: 작품명, 작가, 시대적 배경, 예술적 특징, 감상 포인트
• 건축/풍경: 명칭, 역사적 의의, 건축 양식, 특징, 방문 팁
• 음식: 음식명, 특징, 유래, 맛의 특징, 추천 사항

[출력 규칙]
- 자연스러운 나레이션 형식으로 작성
- 1분 내외의 음성 해설에 적합한 길이
- 전문 용어는 쉽게 풀어서 설명
- 흥미로운 일화나 배경 지식 포함
- 분석 과정, 기호, 번호, 별표 등은 제외하고 순수한 설명문만 출력`;

const textSystemInstruction = `당신은 세계 최고의 여행 가이드 도슨트입니다. 사용자의 질문에 대해, 한국어로 친절하고 상세하게 설명해주세요. 여행과 관련없는 질문이라도 최선을 다해 답변해주세요.

[출력 규칙]
- 자연스러운 나레이션 형식으로 작성
- 1분 내외의 음성 해설에 적합한 길이
- 전문 용어는 쉽게 풀어서 설명
- 흥미로운 일화나 배경 지식 포함
- 분석 과정, 기호, 번호, 별표 등은 제외하고 순수한 설명문만 출력`;

/**
 * Generates a description for an image using a streaming model.
 * @param base64Image The base64 encoded JPEG image data (without the 'data:image/jpeg;base64,' prefix).
 * @returns An async generator that yields text chunks from the AI.
 */
export async function generateDescriptionStream(base64Image: string): Promise<AsyncGenerator<{ text: string }>> {
  try {
    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Image,
      },
    };

    const responseStream = await ai.models.generateContentStream({
        model,
        contents: { parts: [imagePart] },
        config: {
            systemInstruction: imageSystemInstruction,
            temperature: 0.7,
            topP: 0.9,
        }
    });

    return responseStream;

  } catch (error) {
    console.error("Error calling Gemini API for image:", error);
    throw new Error("Failed to get description stream from Gemini API.");
  }
}

/**
 * Generates a description for a text prompt using a streaming model.
 * @param prompt The user's text prompt.
 * @returns An async generator that yields text chunks from the AI.
 */
export async function generateTextStream(prompt: string): Promise<AsyncGenerator<{ text: string }>> {
    try {
        const responseStream = await ai.models.generateContentStream({
            model,
            contents: { parts: [{ text: prompt }] },
            config: {
                systemInstruction: textSystemInstruction,
                temperature: 0.7,
                topP: 0.9,
            }
        });
        return responseStream;
    } catch (error) {
        console.error("Error calling Gemini API for text:", error);
        throw new Error("Failed to get text stream from Gemini API.");
    }
}
