// Import services and utils
import { generateDescriptionStream, generateTextStream } from './services/geminiService.js';
import { optimizeImage } from './utils/imageOptimizer.js';

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const video = document.getElementById('camera-feed');
    const canvas = document.getElementById('capture-canvas');
    const uploadInput = document.getElementById('upload-input');
    const toastContainer = document.getElementById('toastContainer');
    
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
    const loadingHeaderText = loadingHeader ? loadingHeader.querySelector('h1') : null;
    const loadingText = document.getElementById('loadingText');
    const detailFooter = document.getElementById('detailFooter');
    const audioBtn = document.getElementById('audioBtn');
    const textToggleBtn = document.getElementById('textToggleBtn');
    const saveBtn = document.getElementById('saveBtn');

    // Archive Page Elements
    const archiveBackBtn = document.getElementById('archiveBackBtn');
    const archiveGrid = document.getElementById('archiveGrid');
    const emptyArchiveMessage = document.getElementById('emptyArchiveMessage');
    const archiveHeader = document.getElementById('archiveHeader');
    const selectionHeader = document.getElementById('selectionHeader');
    const selectArchiveBtn = document.getElementById('selectArchiveBtn');
    const cancelSelectionBtn = document.getElementById('cancelSelectionBtn');
    const selectionCount = document.getElementById('selectionCount');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');

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
    let isSelectionMode = false;
    let selectedItemIds = new Set();
    
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
            if (cameraStartOverlay) cameraStartOverlay.classList.remove('hidden');
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
        if (isSelectionMode) { // Exit selection mode if active
            toggleSelectionMode(false); // Explicitly exit
        }
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
        // This is the first user gesture. A perfect place to unlock audio context
        // for SpeechSynthesis on mobile browsers.
        if (synth && !synth.speaking) {
            const unlockUtterance = new SpeechSynthesisUtterance('');
            synth.speak(unlockUtterance);
            // It might speak for a fraction of a second, cancel it immediately.
            synth.cancel();
        }

        cameraStartOverlay.removeEventListener('click', handleStartCameraClick);

        const startTextElements = cameraStartOverlay.querySelectorAll('p, svg');
        startTextElements.forEach(el => el.classList.add('hidden'));
        startLoader.classList.remove('hidden');

        try {
            await startCamera();
            cameraStartOverlay.classList.add('hidden');
        } catch (error) {
            console.error(`Initialization error: ${error.message}`);
            const errorText = cameraStartOverlay.querySelector('p');
            if(errorText) {
                errorText.textContent = "카메라 시작 실패. 다시 터치하세요.";
                startTextElements.forEach(el => el.classList.remove('hidden'));
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
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error("카메라 기능을 지원하지 않는 브라우저입니다.");
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
        resetSpeechState();

        showDetailPage();
        
        currentContent = { imageDataUrl: dataUrl, description: '' };
        
        resultImage.src = dataUrl;
        resultImage.classList.remove('hidden');
        loader.classList.remove('hidden');
        textOverlay.classList.add('hidden');
        textOverlay.classList.remove('animate-in');
        if (loadingHeader) loadingHeader.classList.remove('hidden');
        if (loadingHeaderText) loadingHeaderText.textContent = '스마트 해설을 만들고 있어요...';
        detailFooter.classList.add('hidden');
        descriptionText.innerHTML = '';
        updateAudioButton('loading');

        const loadingMessages = ["이미지를 분석하고 있습니다...", "핵심 정보를 추출하는 중...", "나만의 가이드가 해설을 준비 중입니다."];
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
        if (loadingHeader) loadingHeader.classList.remove('hidden');
        if (loadingHeaderText) loadingHeaderText.textContent = '답변을 찾고 있어요...';
        detailFooter.classList.add('hidden');
        descriptionText.innerHTML = '';
        updateAudioButton('loading');

        const loadingMessages = ["질문을 분석하고 있습니다...", "관련 정보를 찾는 중...", "가이드가 답변을 준비하고 있습니다."];
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
        if (loadingHeader) loadingHeader.classList.add('hidden');
        detailFooter.classList.remove('hidden');

        let sentenceBuffer = '';
        for await (const chunk of stream) {
             if (currentStreamController?.signal.aborted) break;
            
            const cleanedChunk = chunk.text.replace(/\*\*/g, ''); // Remove markdown bold characters
            currentContent.description += cleanedChunk;
            sentenceBuffer += cleanedChunk;

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
        if (!data) {
            return [];
        }
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error("Failed to parse archive data from localStorage. Data might be corrupted.", e);
            return [];
        }
    }

    function saveToArchive(items) {
        try {
            const dataToSave = JSON.stringify(items);
            localStorage.setItem(STORAGE_KEY, dataToSave);
            return true; // Indicate success
        } catch (e) {
            console.error("Failed to save to archive:", e);
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                showToast("저장 공간이 부족하여 작업을 완료할 수 없습니다.");
            } else {
                showToast("알 수 없는 오류로 저장/삭제에 실패했습니다.");
            }
            return false; // Indicate failure
        }
    }

    function handleSaveClick() {
        if (!currentContent.description || !currentContent.imageDataUrl) return;

        const archive = getArchive();
        const newItem = {
            id: Date.now(),
            ...currentContent
        };
        archive.unshift(newItem);
        
        const success = saveToArchive(archive);

        if (success) {
            showToast("보관함에 저장되었습니다.");
            saveBtn.disabled = true;
            const savedIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="currentColor" viewBox="0 0 24 24"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>`;
            saveBtn.innerHTML = savedIcon;
        }
    }
    
    function toggleSelectionMode(forceState) {
        const previousState = isSelectionMode;
        isSelectionMode = (typeof forceState === 'boolean') ? forceState : !isSelectionMode;
    
        // UI 상태 업데이트
        archiveHeader.classList.toggle('hidden', isSelectionMode);
        selectionHeader.classList.toggle('hidden', !isSelectionMode);
    
        if (isSelectionMode) {
            // 선택 모드 진입
            selectedItemIds.clear(); // 이전 선택 초기화
            updateSelectionHeader();
            renderArchive();
        } else if (previousState) {
            // 선택 모드 종료 (이전에 선택 모드였던 경우만)
            selectedItemIds.clear();
            renderArchive();
        }
    }
    
    function updateSelectionHeader() {
        const count = selectedItemIds.size;
        selectionCount.textContent = `${count}개 선택`;
        deleteSelectedBtn.disabled = count === 0;
    }

    function handleDeleteSelected() {
        const count = selectedItemIds.size;
        if (count === 0) return;
    
        const message = count === 1 ? '1개의 항목을 삭제하시겠습니까?' : `${count}개의 항목을 삭제하시겠습니까?`;
        
        if (confirm(message)) {
            const archive = getArchive();
            
            const updatedArchive = archive.filter(item => {
                const itemId = Number(item.id);
                return !Array.from(selectedItemIds).some(selectedId => Number(selectedId) === itemId);
            });
            
            const success = saveToArchive(updatedArchive);
    
            if (success) {
                showToast(`${count}개 항목이 삭제되었습니다.`);
                
                // 1. 선택 모드를 직접 종료하고 상태를 정리합니다. (toggleSelectionMode 호출 제거)
                isSelectionMode = false;
                selectedItemIds.clear();
                
                // 2. 헤더 UI를 직접 업데이트합니다.
                archiveHeader.classList.remove('hidden');
                selectionHeader.classList.add('hidden');
                
                // 3. 최신 데이터로 화면을 한 번만 갱신합니다. (역할의 완전한 분리)
                renderArchive(updatedArchive);
    
            } else {
                showToast('삭제 중 오류가 발생했습니다.');
            }
        }
    }

    function renderArchive(itemsToRender) {
        const archive = itemsToRender || getArchive();
        archiveGrid.innerHTML = '';
    
        const hasItems = archive.length > 0;
        emptyArchiveMessage.classList.toggle('hidden', hasItems);
        selectArchiveBtn.classList.toggle('hidden', !hasItems);
    
        if (hasItems) {
            archive.forEach((item, index) => {
                // 강화된 데이터 무결성 검사
                if (!item) {
                    console.warn(`Skipping null item at index ${index}`);
                    return;
                }
                
                if (typeof item.id === 'undefined' || item.id === null) {
                    console.warn(`Skipping item without valid ID at index ${index}:`, item);
                    return;
                }
    
                // ID를 Number로 정규화
                const itemId = Number(item.id);
                if (isNaN(itemId)) {
                    console.warn(`Skipping item with invalid ID at index ${index}:`, item.id);
                    return;
                }
    
                const description = item.description || '';
                
                const itemDiv = document.createElement('div');
                itemDiv.className = 'archive-item';
                itemDiv.dataset.id = itemId.toString(); // 문자열로 저장하되 Number로 정규화된 값 사용
    
                if (isSelectionMode) {
                    itemDiv.classList.add('selectable');
                    // Number로 비교
                    if (selectedItemIds.has(itemId)) {
                        itemDiv.classList.add('selected');
                    }
                }
    
                itemDiv.setAttribute('role', 'button');
                itemDiv.setAttribute('tabindex', '0');
                itemDiv.setAttribute('aria-label', `보관된 항목: ${description.substring(0, 30)}...`);
                
                if (isSelectionMode) {
                    const checkbox = document.createElement('div');
                    checkbox.className = 'selection-checkbox';
                    checkbox.innerHTML = `
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
                        </svg>
                    `;
                    itemDiv.appendChild(checkbox);
                }
    
                const img = document.createElement('img');
                img.src = item.imageDataUrl || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                img.alt = description.substring(0, 30);
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
        if (loadingHeader) loadingHeader.classList.add('hidden');
        detailFooter.classList.remove('hidden');
        
        const description = item.description || '';
        
        const sentences = description.match(/[^.?!]+[.?!]+/g) || [description];
        sentences.forEach(sentence => {
            if (!sentence) return;
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

    function handleArchiveGridClick(event) {
        const itemDiv = event.target.closest('.archive-item');
        if (!itemDiv) return;
    
        // 수정: ID를 Number로 일관되게 처리 (사용자 제안 코드)
        const itemIdString = itemDiv.dataset.id;
        const itemId = Number(itemIdString);
        
        if (isNaN(itemId)) {
            console.warn('Invalid item ID:', itemIdString);
            return;
        }
    
        if (isSelectionMode) {
            event.preventDefault();
            
            // Set에 Number 타입으로 저장
            if (selectedItemIds.has(itemId)) {
                selectedItemIds.delete(itemId);
                itemDiv.classList.remove('selected');
            } else {
                selectedItemIds.add(itemId);
                itemDiv.classList.add('selected');
            }
            updateSelectionHeader();
        } else {
            const archive = getArchive();
            const item = archive.find(i => Number(i.id) === itemId);
            if (item) {
                populateDetailPageFromArchive(item);
            }
        }
    }

    function handleArchiveGridKeydown(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            const itemDiv = document.activeElement;
            if (!isSelectionMode && itemDiv.classList.contains('archive-item') && archiveGrid.contains(itemDiv)) {
                event.preventDefault(); 
                const itemId = Number(itemDiv.dataset.id);
                if (isNaN(itemId)) return;

                const archive = getArchive();
                const item = archive.find(i => Number(i.id) === itemId);
                if (item) {
                    populateDetailPageFromArchive(item);
                }
            }
        }
    }

    function debugArchiveState() {
        console.log('=== Archive Debug Info ===');
        console.log('Selection Mode:', isSelectionMode);
        console.log('Selected IDs:', Array.from(selectedItemIds));
        console.log('Archive Items in localStorage:', getArchive().map(item => ({ id: item.id, type: typeof item.id })));
        
        const archiveItems = document.querySelectorAll('.archive-item');
        console.log('DOM Items:', Array.from(archiveItems).map(item => ({ 
            id: item.dataset.id, 
            selected: item.classList.contains('selected') 
        })));
    }
    
    // --- Event Listeners ---
    if (cameraStartOverlay) cameraStartOverlay.addEventListener('click', handleStartCameraClick);
    if (shootBtn) shootBtn.addEventListener('click', capturePhoto);
    if (uploadBtn) uploadBtn.addEventListener('click', () => uploadInput.click());
    if (micBtn) micBtn.addEventListener('click', handleMicButtonClick);
    if (archiveBtn) archiveBtn.addEventListener('click', showArchivePage);
    if (uploadInput) uploadInput.addEventListener('change', handleFileSelect);
    
    if (backBtn) backBtn.addEventListener('click', showMainPage);
    if (archiveBackBtn) archiveBackBtn.addEventListener('click', showMainPage);
    
    if (audioBtn) audioBtn.addEventListener('click', handleAudioButtonClick);
    if (saveBtn) saveBtn.addEventListener('click', handleSaveClick);
    if (textToggleBtn) textToggleBtn.addEventListener('click', () => {
        const isHidden = textOverlay.classList.toggle('hidden');
        textToggleBtn.setAttribute('aria-label', isHidden ? '해설 보기' : '해설 숨기기');
    });

    if (selectArchiveBtn) selectArchiveBtn.addEventListener('click', () => toggleSelectionMode(true));
    if (cancelSelectionBtn) cancelSelectionBtn.addEventListener('click', () => toggleSelectionMode(false));
    if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', handleDeleteSelected);
    
    if (archiveGrid) {
        archiveGrid.addEventListener('click', handleArchiveGridClick);
        archiveGrid.addEventListener('keydown', handleArchiveGridKeydown);
    }

    // --- Global Access ---
    window.debugArchiveState = debugArchiveState;

    // Start the app
    initializeApp();

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js').then(registration => {
                console.log('SW registered: ', registration);
            }).catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
        });
    }
});