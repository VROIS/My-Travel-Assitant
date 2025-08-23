// Import services and utils
import { generateDescriptionStream, generateTextStream } from './services/geminiService.js';
import { optimizeImage } from './utils/imageOptimizer.js';

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('capture-canvas');
    const uploadInput = document.getElementById('upload-input');
    const toastContainer = document.getElementById('toastContainer');
    const apiKeyError = document.getElementById('apiKeyError');
    
    // Pages
    const mainPage = document.getElementById('mainPage');
    const detailPage = document.getElementById('detailPage');
    const archivePage = document.getElementById('archivePage');

    // Main Page Elements
    const cameraStartOverlay = document.getElementById('cameraStartOverlay');
    const startLoader = document.getElementById('startLoader');
    const shootBtn = document.getElementById('shootBtn');
    const uploadBtn = document.getElementById('uploadBtn');
    const micBtn = document.getElementById('micBtn');
    const archiveBtn = document.getElementById('archiveBtn');

    // Detail Page Elements
    const backBtn = document.getElementById('backBtn');
    const resultImage = document.getElementById('resultImage');
    const loader = document.getElementById('loader');
    const textOverlay = document.getElementById('textOverlay');
    const descriptionText = document.getElementById('descriptionText');
    const loadingHeader = document.getElementById('loadingHeader');
    const loadingHeaderText = loadingHeader.querySelector('h1');
    const loadingText = document.getElementById('loadingText');
    const detailFooter = document.getElementById('detailFooter');
    const audioBtn = document.getElementById('audioBtn');
    const textToggleBtn = document.getElementById('textToggleBtn');
    const saveBtn = document.getElementById('saveBtn');

    // Archive Page Elements
    const archiveBackBtn = document.getElementById('archiveBackBtn');
    const archiveGrid = document.getElementById('archiveGrid');
    const emptyArchiveMessage = document.getElementById('emptyArchiveMessage');

    // Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = SpeechRecognition ? new SpeechRecognition() : null;
    let isRecognizing = false;

    let stream = null;
    let isCameraActive = false; // To prevent camera re-initialization
    
    // TTS State
    const synth = window.speechSynthesis;
    let utteranceQueue = [];
    let isSpeaking = false;
    let isPaused = false;
    let currentStreamController = null;
    let currentlySpeakingElement = null;

    // App State
    const STORAGE_KEY = 'travel_assistant_archive';
    let currentContent = { imageDataUrl: null, description: '' };
    
    // --- API Key Check ---
    function checkApiKey() {
        // This is a placeholder check. In a real Netlify environment, 
        // process.env.API_KEY would be replaced during the build.
        // Since we have no build step, this check is tricky.
        // We will rely on the error thrown by the geminiService if the key is missing.
        // For a more robust client-side check, you'd need a way to inject the key.
        // Let's assume for now if geminiService.js loads, the key is present.
        // A better approach is to have a dedicated check function.
        if (!process.env.API_KEY) {
             console.error("API_KEY is not defined. This will fail in geminiService.js");
             if (apiKeyError) {
                apiKeyError.classList.remove('hidden');
                cameraStartOverlay.classList.add('hidden'); // Hide start button if key is missing
             }
             return false;
        }
        return true;
    }


    // --- UI Helpers ---
    function showToast(message, duration = 3000) {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => {
                toast.remove();
            });
        }, duration);
    }

    // --- Page Control ---
    function showPage(pageToShow) {
        [mainPage, detailPage, archivePage].forEach(page => {
            if (page) page.classList.toggle('visible', page === pageToShow);
        });
    }
    
    async function showMainPage() {
        if (currentStreamController) {
            currentStreamController.abort();
        }
        synth.cancel();
        resetSpeechState();
        showPage(mainPage);
        resultImage.classList.remove('hidden');
        detailPage.classList.remove('bg-white');
        descriptionText.classList.remove('text-gray-800');
        descriptionText.classList.add('readable-on-image');

        try {
            if (!isCameraActive) {
                await startCamera();
            }
        } catch (error) {
            console.error("Failed to restart camera.", error);
            cameraStartOverlay.classList.remove('hidden');
        }
    }

    function showDetailPage(isFromArchive = false) {
        stopCamera();
        showPage(detailPage);
        saveBtn.disabled = isFromArchive;
        if (isFromArchive) {
            const savedIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>`;
            saveBtn.innerHTML = savedIcon;
        } else {
             const notSavedIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>`;
             saveBtn.innerHTML = notSavedIcon;
        }
    }

    function showArchivePage() {
        stopCamera();
        renderArchive();
        showPage(archivePage);
    }
    
    function resetSpeechState() {
        utteranceQueue = [];
        isSpeaking = false;
        isPaused = false;
        if (currentlySpeakingElement) {
            currentlySpeakingElement.classList.remove('speaking');
        }
        currentlySpeakingElement = null;
    }

    // --- App Initialization ---
    function initializeApp() {
        showPage(mainPage);
        if (recognition) {
            recognition.continuous = false;
            recognition.lang = 'ko-KR';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
        }
    }

    async function handleStartCameraClick() {
        cameraStartOverlay.removeEventListener('click', handleStartCameraClick);

        const startText = cameraStartOverlay.querySelector('p');
        if(startText) startText.classList.add('hidden');
        startLoader.classList.remove('hidden');

        try {
            await startCamera();
            cameraStartOverlay.classList.add('hidden');
        } catch (error) {
            console.error(`Initialization error: ${error.message}`);
            if(startText) {
                startText.textContent = "카메라 시작 실패. 다시 터치하세요.";
                startText.classList.remove('hidden');
            }
            cameraStartOverlay.addEventListener('click', handleStartCameraClick);
        } finally {
            startLoader.classList.add('hidden');
        }
    }

    function startCamera() {
        return new Promise(async (resolve, reject) => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'camera' });
                if (permissionStatus.state === 'denied') {
                    throw new Error("카메라 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.");
                }
                
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' },
                    audio: false
                });
                video.srcObject = stream;
                video.onloadedmetadata = () => {
                    shootBtn.disabled = false;
                    uploadBtn.disabled = false;
                    micBtn.disabled = false;
                    isCameraActive = true;
                    resolve();
                };
            } catch (err) {
                console.error("Camera access denied:", err);
                shootBtn.disabled = true;
                uploadBtn.disabled = true;
                micBtn.disabled = true;
                reject(err);
            }
        });
    }

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            video.srcObject = null;
            isCameraActive = false;
        }
    }

    function capturePhoto() {
        if (!video.videoWidth || !video.videoHeight) return;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (context) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            processImage(canvas.toDataURL('image/jpeg'));
        }
    }
    
    function handleFileSelect(event) {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => processImage(e.target?.result);
            reader.readAsDataURL(file);
        }
        event.target.value = '';
    }

    async function processImage(dataUrl) {
        if (synth.speaking || synth.pending) synth.cancel();
        const unlockUtterance = new SpeechSynthesisUtterance('');
        synth.speak(unlockUtterance);
        synth.cancel();
        resetSpeechState();

        showDetailPage();
        
        currentContent = { imageDataUrl: dataUrl, description: '' };
        
        resultImage.src = dataUrl;
        resultImage.classList.remove('hidden');
        loader.classList.remove('hidden');
        textOverlay.classList.add('hidden');
        textOverlay.classList.remove('animate-in');
        loadingHeader.classList.remove('hidden');
        loadingHeaderText.textContent = 'AI 해설 생성 중...';
        detailFooter.classList.add('hidden');
        descriptionText.innerHTML = '';
        updateAudioButton('loading');

        const loadingMessages = ["이미지를 분석하고 있습니다...", "핵심 정보를 추출하는 중...", "AI가 멋진 해설을 만들고 있어요!"];
        let msgIndex = 0;
        loadingText.innerText = loadingMessages[msgIndex];
        const loadingInterval = window.setInterval(() => {
            msgIndex = (msgIndex + 1) % loadingMessages.length;
            loadingText.innerText = loadingMessages[msgIndex];
        }, 1500);

        try {
            const optimizedDataUrl = await optimizeImage(dataUrl);
            const base64Image = optimizedDataUrl.split(',')[1];
            currentContent.imageDataUrl = optimizedDataUrl;

            currentStreamController = new AbortController();
            const stream = await generateDescriptionStream(base64Image);
            
            await processStream(stream, loadingInterval);

        } catch (err) {
            console.error(err);
            clearInterval(loadingInterval);
            descriptionText.innerText = "이미지 분석 중 오류가 발생했습니다. 다시 시도해 주세요.";
            updateAudioButton('disabled');
        }
    }
    
    function handleMicButtonClick() {
        if (!recognition) {
            showToast("음성 인식이 지원되지 않는 브라우저입니다.");
            return;
        }

        if (isRecognizing) {
            return;
        }
        
        isRecognizing = true;
        micBtn.classList.add('mic-listening');
        recognition.start();

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            processTextQuery(transcript);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'no-speech') {
                showToast('음성을 인식하지 못했습니다. 다시 시도해주세요.');
            } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                showToast('마이크 사용 권한이 필요합니다.');
            } else {
                showToast('음성 인식 중 오류가 발생했습니다.');
            }
        };
        
        recognition.onend = () => {
            micBtn.classList.remove('mic-listening');
            isRecognizing = false;
        };
    }
    
    async function processTextQuery(prompt) {
        if (synth.speaking || synth.pending) synth.cancel();
        const unlockUtterance = new SpeechSynthesisUtterance('');
        synth.speak(unlockUtterance);
        synth.cancel();
        resetSpeechState();
        
        showDetailPage();
        
        detailPage.classList.add('bg-white');
        descriptionText.classList.add('text-gray-800');
        descriptionText.classList.remove('readable-on-image');
        saveBtn.disabled = true;

        currentContent = { imageDataUrl: null, description: '' };

        resultImage.src = '';
        resultImage.classList.add('hidden');
        loader.classList.remove('hidden');
        textOverlay.classList.add('hidden');
        textOverlay.classList.remove('animate-in');
        loadingHeader.classList.remove('hidden');
        loadingHeaderText.textContent = 'AI 답변 생성 중...';
        detailFooter.classList.add('hidden');
        descriptionText.innerHTML = '';
        updateAudioButton('loading');

        const loadingMessages = ["질문을 분석하고 있습니다...", "관련 정보를 찾는 중...", "AI가 답변을 만들고 있어요!"];
        let msgIndex = 0;
        loadingText.innerText = loadingMessages[msgIndex];
        const loadingInterval = window.setInterval(() => {
            msgIndex = (msgIndex + 1) % loadingMessages.length;
            loadingText.innerText = loadingMessages[msgIndex];
        }, 1500);

        try {
            currentStreamController = new AbortController();
            const stream = await generateTextStream(prompt);
            await processStream(stream, loadingInterval);
        } catch (err) {
            console.error(err);
clearInterval(loadingInterval);
            descriptionText.innerText = "답변 생성 중 오류가 발생했습니다. 다시 시도해 주세요.";
            updateAudioButton('disabled');
        }
    }

    async function processStream(stream, loadingInterval) {
        clearInterval(loadingInterval);
        loader.classList.add('hidden');
        textOverlay.classList.remove('hidden');
        textOverlay.classList.add('animate-in');
        loadingHeader.classList.add('hidden');
        detailFooter.classList.remove('hidden');

        let sentenceBuffer = '';
        for await (const chunk of stream) {
             if (currentStreamController?.signal.aborted) break;
            
            const textChunk = chunk.text;
            currentContent.description += textChunk;
            sentenceBuffer += textChunk;

            const sentenceEndings = /[.?!]/g;
            let match;
            while ((match = sentenceEndings.exec(sentenceBuffer)) !== null) {
                const sentence = sentenceBuffer.substring(0, match.index + 1).trim();
                sentenceBuffer = sentenceBuffer.substring(match.index + 1);
                if (sentence) {
                    const span = document.createElement('span');
                    span.textContent = sentence + ' ';
                    descriptionText.appendChild(span);
                    queueForSpeech(sentence, span);
                }
            }
        }

        if (sentenceBuffer.trim()) {
             const sentence = sentenceBuffer.trim();
             const span = document.createElement('span');
             span.textContent = sentence + ' ';
             descriptionText.appendChild(span);
             queueForSpeech(sentence, span);
        }
        currentStreamController = null;
    }

    function getArchive() {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    function saveToArchive(items) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }

    function handleSaveClick() {
        if (!currentContent.description || !currentContent.imageDataUrl) return;

        const archive = getArchive();
        const newItem = {
            id: Date.now(),
            ...currentContent
        };
        archive.unshift(newItem);
        saveToArchive(archive);

        showToast("보관함에 저장되었습니다.");

        saveBtn.disabled = true;
        const savedIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>`;
        saveBtn.innerHTML = savedIcon;
    }

    function handleDeleteItem(itemId) {
        if (confirm("이 항목을 삭제하시겠습니까?")) {
            const archive = getArchive();
            const updatedArchive = archive.filter(item => item.id !== itemId);
            saveToArchive(updatedArchive);
            renderArchive();
        }
    }

    function renderArchive() {
        const archive = getArchive();
        archiveGrid.innerHTML = '';
        if (archive.length === 0) {
            emptyArchiveMessage.classList.remove('hidden');
        } else {
            emptyArchiveMessage.classList.add('hidden');
            archive.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'archive-item interactive-btn';
                
                itemDiv.onclick = () => populateDetailPageFromArchive(item);

                let pressTimer;
                const startPress = (e) => {
                    e.preventDefault();
                    pressTimer = window.setTimeout(() => {
                        handleDeleteItem(item.id);
                    }, 800);
                };
                const cancelPress = () => {
                    clearTimeout(pressTimer);
                };
                itemDiv.addEventListener('mousedown', startPress);
                itemDiv.addEventListener('touchstart', startPress);
                itemDiv.addEventListener('mouseup', cancelPress);
                itemDiv.addEventListener('mouseleave', cancelPress);
                itemDiv.addEventListener('touchend', cancelPress);
                itemDiv.addEventListener('touchmove', cancelPress);

                const img = document.createElement('img');
                img.src = item.imageDataUrl || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                img.alt = item.description.substring(0, 30);
                img.loading = 'lazy';
                
                itemDiv.appendChild(img);
                archiveGrid.appendChild(itemDiv);
            });
        }
    }

    function populateDetailPageFromArchive(item) {
        resetSpeechState();
        
        resultImage.src = item.imageDataUrl || '';
        resultImage.classList.toggle('hidden', !item.imageDataUrl);

        detailPage.classList.remove('bg-white');
        descriptionText.classList.remove('text-gray-800');
        descriptionText.classList.add('readable-on-image');

        descriptionText.innerHTML = '';
        
        loader.classList.add('hidden');
        textOverlay.classList.remove('hidden');
        textOverlay.classList.remove('animate-in');
        loadingHeader.classList.add('hidden');
        detailFooter.classList.remove('hidden');
        
        const sentences = item.description.match(/[^.?!]+[.?!]+/g) || [item.description];
        sentences.forEach(sentence => {
            const span = document.createElement('span');
            span.textContent = sentence.trim() + ' ';
            descriptionText.appendChild(span);
            queueForSpeech(sentence.trim(), span);
        });

        updateAudioButton('play');
        showDetailPage(true);
    }

    function playNextInQueue() {
        if (isPaused || utteranceQueue.length === 0) {
            if (utteranceQueue.length === 0) {
                 isSpeaking = false;
                 isPaused = false;
                 if(currentlySpeakingElement) currentlySpeakingElement.classList.remove('speaking');
                 currentlySpeakingElement = null;
                 updateAudioButton('play');
            }
            return;
        }
        
        isSpeaking = true;
        const { utterance, element } = utteranceQueue[0];
        
        if (currentlySpeakingElement) {
            currentlySpeakingElement.classList.remove('speaking');
        }
        element.classList.add('speaking');
        currentlySpeakingElement = element;
        
        utterance.onend = () => {
            utteranceQueue.shift();
            playNextInQueue();
        };

        synth.speak(utterance);
    }

    function queueForSpeech(text, element) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR';
        utteranceQueue.push({ utterance, element });

        if (!isSpeaking && !synth.speaking && !isPaused) {
            updateAudioButton('pause');
            playNextInQueue();
        }
    }

    function handleAudioButtonClick() {
        if (!isSpeaking && utteranceQueue.length > 0) {
            isPaused = false;
            if (synth.paused) {
                synth.resume();
            } else {
                playNextInQueue();
            }
            updateAudioButton('pause');
        } else if (isSpeaking && !isPaused) {
            isPaused = true;
            synth.pause();
            updateAudioButton('resume');
        } else if (isSpeaking && isPaused) {
            isPaused = false;
            synth.resume();
            updateAudioButton('pause');
        }
    }
    
    function updateAudioButton(state) {
        const playIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
        const pauseIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        const loadingIcon = `<div class="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>`;

        audioBtn.disabled = state === 'loading' || state === 'disabled';
        
        switch (state) {
            case 'play':
            case 'resume':
                audioBtn.innerHTML = playIcon;
                audioBtn.setAttribute('aria-label', '오디오 재생');
                break;
            case 'pause':
                audioBtn.innerHTML = pauseIcon;
                audioBtn.setAttribute('aria-label', '오디오 일시정지');
                break;
            case 'loading':
                audioBtn.innerHTML = loadingIcon;
                 audioBtn.setAttribute('aria-label', '오디오 로딩 중');
                break;
            case 'disabled':
                 audioBtn.innerHTML = playIcon;
                 audioBtn.setAttribute('aria-label', '오디오 재생 불가');
                break;
        }
    }
    
    // --- Event Listeners ---
    cameraStartOverlay.addEventListener('click', handleStartCameraClick);
    shootBtn.addEventListener('click', capturePhoto);
    uploadBtn.addEventListener('click', () => uploadInput.click());
    micBtn.addEventListener('click', handleMicButtonClick);
    archiveBtn.addEventListener('click', showArchivePage);
    uploadInput.addEventListener('change', handleFileSelect);
    
    backBtn.addEventListener('click', showMainPage);
    archiveBackBtn.addEventListener('click', showMainPage);
    
    audioBtn.addEventListener('click', handleAudioButtonClick);
    saveBtn.addEventListener('click', handleSaveClick);
    textToggleBtn.addEventListener('click', () => {
        const isHidden = textOverlay.classList.toggle('hidden');
        textToggleBtn.setAttribute('aria-label', isHidden ? '해설 보기' : '해설 숨기기');
    });

    // Start the app
    try {
      if (checkApiKey()) {
        initializeApp();
      }
    } catch (e) {
      console.error(e);
      if (apiKeyError) {
        apiKeyError.classList.remove('hidden');
        cameraStartOverlay.classList.add('hidden');
      }
    }
});
--- START OF FILE _redirects ---

/*    /index.html    200--- START OF FILE services/geminiService.js ---

import { GoogleGenAI } from "@google/genai";

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
 * @param {string} base64Image The base64 encoded JPEG image data (without the 'data:image/jpeg;base64,' prefix).
 * @returns {AsyncGenerator<{text: string}>} An async generator that yields text chunks from the AI.
 */
export async function generateDescriptionStream(base64Image) {
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
 * @param {string} prompt The user's text prompt.
 * @returns {AsyncGenerator<{text: string}>} An async generator that yields text chunks from the AI.
 */
export async function generateTextStream(prompt) {
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
}--- START OF FILE utils/imageOptimizer.js ---

/**
 * Optimizes an image by resizing and compressing it.
 * @param {string} dataUrl The base64 data URL of the image.
 * @param {number} [maxWidth=1024] The maximum width of the output image.
 * @param {number} [quality=0.85] The JPEG quality (0 to 1).
 * @returns {Promise<string>} A promise that resolves with the optimized image as a base64 data URL.
 */
export function optimizeImage(dataUrl, maxWidth = 1024, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = maxWidth / img.width;
            const newWidth = img.width > maxWidth ? maxWidth : img.width;
            const newHeight = img.height * (img.width > maxWidth ? scale : 1);

            canvas.width = newWidth;
            canvas.height = newHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return reject(new Error('Could not get canvas context'));
            }
            ctx.drawImage(img, 0, 0, newWidth, newHeight);

            const optimizedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(optimizedDataUrl);
        };
        img.onerror = (err) => {
            reject(new Error(`Failed to load image for optimization.`));
        };
        img.src = dataUrl;
    });
}
