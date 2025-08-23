// Import services and utils
import { generateDescriptionStream, generateTextStream } from './services/geminiService.ts';
import { optimizeImage } from './utils/imageOptimizer.ts';

// Type definition for archived items
interface ArchivedItem {
    id: number;
    imageDataUrl: string | null;
    description: string;
}

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const video = document.getElementById('camera-feed') as HTMLVideoElement;
    const canvas = document.getElementById('capture-canvas') as HTMLCanvasElement;
    const uploadInput = document.getElementById('upload-input') as HTMLInputElement;
    const toastContainer = document.getElementById('toastContainer') as HTMLDivElement;
    
    // Pages
    const mainPage = document.getElementById('mainPage') as HTMLDivElement;
    const detailPage = document.getElementById('detailPage') as HTMLDivElement;
    const archivePage = document.getElementById('archivePage') as HTMLDivElement;

    // Main Page Elements
    const cameraStartOverlay = document.getElementById('cameraStartOverlay') as HTMLDivElement;
    const startLoader = document.getElementById('startLoader') as HTMLDivElement;
    const shootBtn = document.getElementById('shootBtn') as HTMLButtonElement;
    const uploadBtn = document.getElementById('uploadBtn') as HTMLButtonElement;
    const micBtn = document.getElementById('micBtn') as HTMLButtonElement;
    const archiveBtn = document.getElementById('archiveBtn') as HTMLButtonElement;

    // Detail Page Elements
    const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
    const resultImage = document.getElementById('resultImage') as HTMLImageElement;
    const loader = document.getElementById('loader') as HTMLDivElement;
    const textOverlay = document.getElementById('textOverlay') as HTMLDivElement;
    const descriptionText = document.getElementById('descriptionText') as HTMLParagraphElement;
    const loadingHeader = document.getElementById('loadingHeader') as HTMLDivElement;
    const loadingHeaderText = loadingHeader.querySelector('h1') as HTMLHeadingElement;
    const loadingText = document.getElementById('loadingText') as HTMLParagraphElement;
    const detailFooter = document.getElementById('detailFooter') as HTMLDivElement;
    const audioBtn = document.getElementById('audioBtn') as HTMLButtonElement;
    const textToggleBtn = document.getElementById('textToggleBtn') as HTMLButtonElement;
    const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;

    // Archive Page Elements
    const archiveBackBtn = document.getElementById('archiveBackBtn') as HTMLButtonElement;
    const archiveGrid = document.getElementById('archiveGrid') as HTMLDivElement;
    const emptyArchiveMessage = document.getElementById('emptyArchiveMessage') as HTMLParagraphElement;

    // Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let recognition: any | null = SpeechRecognition ? new SpeechRecognition() : null;
    let isRecognizing = false;

    let stream: MediaStream | null = null;
    let isCameraActive = false; // To prevent camera re-initialization
    
    // TTS State
    const synth = window.speechSynthesis;
    let utteranceQueue: { utterance: SpeechSynthesisUtterance; element: HTMLElement; }[] = [];
    let isSpeaking = false;
    let isPaused = false;
    let currentStreamController: AbortController | null = null;
    let currentlySpeakingElement: HTMLElement | null = null;

    // App State
    const STORAGE_KEY = 'travel_assistant_archive';
    let currentContent: { imageDataUrl: string | null; description: string; } = { imageDataUrl: null, description: '' };

    // --- UI Helpers ---
    function showToast(message: string, duration = 3000) {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = message;
        toastContainer.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Animate out and remove
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => {
                toast.remove();
            });
        }, duration);
    }

    // --- Page Control ---
    function showPage(pageToShow: HTMLElement) {
        [mainPage, detailPage, archivePage].forEach(page => {
            page.classList.toggle('visible', page === pageToShow);
        });
    }
    
    async function showMainPage() {
        if (currentStreamController) {
            currentStreamController.abort();
        }
        synth.cancel();
        resetSpeechState();
        showPage(mainPage);
        resultImage.classList.remove('hidden'); // Ensure it's visible for next time
        // Clean up styles from text-only view
        detailPage.classList.remove('bg-white');
        descriptionText.classList.remove('text-gray-800');
        descriptionText.classList.add('readable-on-image');

        try {
            // Only start camera if it's not already active
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
        // We handle the 'once' logic manually to allow for retries
        cameraStartOverlay.removeEventListener('click', handleStartCameraClick);

        const startText = cameraStartOverlay.querySelector('p');
        if(startText) startText.classList.add('hidden');
        startLoader.classList.remove('hidden');

        try {
            await startCamera();
            cameraStartOverlay.classList.add('hidden');
        } catch (error) {
            console.error(`Initialization error: ${(error as Error).message}`);
            if(startText) {
                startText.textContent = "카메라 시작 실패. 다시 터치하세요.";
                startText.classList.remove('hidden');
            }
            // Re-add listener on failure
            cameraStartOverlay.addEventListener('click', handleStartCameraClick);
        } finally {
            startLoader.classList.add('hidden');
        }
    }


    // --- Camera Controls ---
    function startCamera(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
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

    // --- Image Handling & AI Analysis ---
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
    
    function handleFileSelect(event: Event) {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => processImage(e.target?.result as string);
            reader.readAsDataURL(file);
        }
        (event.target as HTMLInputElement).value = '';
    }

    async function processImage(dataUrl: string) {
        // Unlock audio & reset state on user gesture
        if (synth.speaking || synth.pending) synth.cancel();
        const unlockUtterance = new SpeechSynthesisUtterance('');
        synth.speak(unlockUtterance);
        synth.cancel();
        resetSpeechState();

        showDetailPage();
        
        currentContent = { imageDataUrl: dataUrl, description: '' };
        
        // Reset UI
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

        // Dynamic loading messages
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
            currentContent.imageDataUrl = optimizedDataUrl; // Store optimized version for saving

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
    
    // --- Voice Search Handling ---
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

        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            processTextQuery(transcript);
        };

        recognition.onerror = (event: any) => {
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
    
    async function processTextQuery(prompt: string) {
        if (synth.speaking || synth.pending) synth.cancel();
        const unlockUtterance = new SpeechSynthesisUtterance('');
        synth.speak(unlockUtterance);
        synth.cancel();
        resetSpeechState();
        
        showDetailPage();
        
        // Style page for text-only view
        detailPage.classList.add('bg-white');
        descriptionText.classList.add('text-gray-800');
        descriptionText.classList.remove('readable-on-image');
        saveBtn.disabled = true; // No image to save

        currentContent = { imageDataUrl: null, description: '' };

        // Reset UI for text query
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

    // --- Common Stream Processing ---
    async function processStream(stream: AsyncGenerator<{ text: string }>, loadingInterval: number) {
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

    // --- Archive & Save Logic ---
    function getArchive(): ArchivedItem[] {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    }

    function saveToArchive(items: ArchivedItem[]) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }

    function handleSaveClick() {
        if (!currentContent.description || !currentContent.imageDataUrl) return;

        const archive = getArchive();
        const newItem: ArchivedItem = {
            id: Date.now(),
            ...currentContent
        };
        archive.unshift(newItem); // Add to the beginning
        saveToArchive(archive);

        showToast("보관함에 저장되었습니다.");

        saveBtn.disabled = true;
        const savedIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>`;
        saveBtn.innerHTML = savedIcon;
    }

    function handleDeleteItem(itemId: number) {
        if (confirm("이 항목을 삭제하시겠습니까?")) {
            const archive = getArchive();
            const updatedArchive = archive.filter(item => item.id !== itemId);
            saveToArchive(updatedArchive);
            renderArchive(); // Re-render the grid
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
                
                // Click to view
                itemDiv.onclick = () => populateDetailPageFromArchive(item);

                // Long-press to delete
                let pressTimer: number;
                const startPress = (e: Event) => {
                    e.preventDefault();
                    pressTimer = window.setTimeout(() => {
                        handleDeleteItem(item.id);
                    }, 800); // 800ms for long press
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
                img.src = item.imageDataUrl || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; // Use transparent pixel if no image
                img.alt = item.description.substring(0, 30);
                img.loading = 'lazy';
                
                itemDiv.appendChild(img);
                archiveGrid.appendChild(itemDiv);
            });
        }
    }

    function populateDetailPageFromArchive(item: ArchivedItem) {
        resetSpeechState();
        
        // Populate UI
        resultImage.src = item.imageDataUrl || '';
        resultImage.classList.toggle('hidden', !item.imageDataUrl);

        // Style page correctly for archive view (which always has an image)
        detailPage.classList.remove('bg-white');
        descriptionText.classList.remove('text-gray-800');
        descriptionText.classList.add('readable-on-image');

        descriptionText.innerHTML = '';
        
        loader.classList.add('hidden');
        textOverlay.classList.remove('hidden');
        textOverlay.classList.remove('animate-in'); // No animation for archive view
        loadingHeader.classList.add('hidden');
        detailFooter.classList.remove('hidden');
        
        // Re-create spans and queue for TTS
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

    // --- TTS Controls ---
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

    function queueForSpeech(text: string, element: HTMLElement) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR';
        utteranceQueue.push({ utterance, element });

        if (!isSpeaking && !synth.speaking && !isPaused) {
            updateAudioButton('pause');
            playNextInQueue();
        }
    }

    function handleAudioButtonClick() {
        if (!isSpeaking && utteranceQueue.length > 0) { // Play
            isPaused = false;
            if (synth.paused) {
                synth.resume();
            } else {
                playNextInQueue();
            }
            updateAudioButton('pause');
        } else if (isSpeaking && !isPaused) { // Pause
            isPaused = true;
            synth.pause();
            updateAudioButton('resume');
        } else if (isSpeaking && isPaused) { // Resume
            isPaused = false;
            synth.resume();
            updateAudioButton('pause');
        }
    }
    
    function updateAudioButton(state: 'play' | 'pause' | 'resume' | 'loading' | 'disabled') {
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
    initializeApp();
});
