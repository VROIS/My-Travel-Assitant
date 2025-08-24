/**
 * Generates a stream from the backend function.
 * @param {object} body The request body to send to the backend.
 * @returns {AsyncGenerator<{text: string}>} An async generator that yields text chunks from the backend.
 */
async function* generateStream(body) {
    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok || !response.body) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
            throw new Error(errorData.error || `Server error: ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            
            // Process buffer line by line for Server-Sent Events (SSE)
            const parts = buffer.split('\n\n');
            buffer = parts.pop() || ''; // Keep the last, possibly incomplete part

            for (const part of parts) {
                if (part.startsWith('data: ')) {
                    const jsonString = part.substring(6);
                    if (jsonString) {
                        try {
                           yield JSON.parse(jsonString);
                        } catch (e) {
                            console.error("Failed to parse stream JSON:", jsonString, e);
                        }
                    }
                }
            }
        }

    } catch (error) {
        console.error("Error calling backend function:", error);
        throw error;
    }
}


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
- 분석 과정, 기호, 번호 등은 제외하고 순수한 설명문만 출력
- 절대로 마크다운 강조 기호(\`**\`, \`*\` 등)를 사용하지 마세요.`;

const textSystemInstruction = `당신은 세계 최고의 여행 가이드 도슨트입니다. 사용자의 질문에 대해, 한국어로 친절하고 상세하게 설명해주세요. 여행과 관련없는 질문이라도 최선을 다해 답변해주세요.

[출력 규칙]
- 자연스러운 나레이션 형식으로 작성
- 1분 내외의 음성 해설에 적합한 길이
- 전문 용어는 쉽게 풀어서 설명
- 흥미로운 일화나 배경 지식 포함
- 분석 과정, 기호, 번호 등은 제외하고 순수한 설명문만 출력
- 절대로 마크다운 강조 기호(\`**\`, \`*\` 등)를 사용하지 마세요.`;

/**
 * Generates a description for an image by calling the backend function.
 * @param {string} base64Image The base64 encoded JPEG image data (without the 'data:image/jpeg;base64,' prefix).
 * @returns {Promise<AsyncGenerator<{text: string}>>} An async generator that yields text chunks from the AI.
 */
export async function generateDescriptionStream(base64Image) {
  const body = {
    base64Image,
    systemInstruction: imageSystemInstruction,
  };
  return generateStream(body);
}

/**
 * Generates a description for a text prompt by calling the backend function.
 * @param {string} prompt The user's text prompt.
 * @returns {Promise<AsyncGenerator<{text: string}>>} An async generator that yields text chunks from the AI.
 */
export async function generateTextStream(prompt) {
  const body = {
    prompt,
    systemInstruction: textSystemInstruction,
  };
  return generateStream(body);
}