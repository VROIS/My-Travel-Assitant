# TRD (기술 요구사항 문서) - 손안의 가이드 V2.1 (보안 강화 버전)

**문서 목표**: 이 문서는 '손안의 가이드' 프로젝트의 기술적 아키텍처, 핵심 로직, 데이터 흐름, 배포 전략을 상세히 기술하여, 어떤 개발자든 프로젝트를 신속하게 이해하고 유지보수할 수 있도록 돕는 것을 목표로 합니다.

---

### 1. 시스템 아키텍처

본 프로젝트는 **Netlify Function을 백엔드로 활용하는 Jamstack 아키텍처**로 구성되어 있습니다. 클라이언트는 정적 파일로 제공되며, 모든 지능형 기능은 서버리스 함수(Serverless Function)를 통해 안전하게 실행됩니다.

-   **Frontend (Client)**: 순수 `HTML`, `CSS`, `JavaScript`로 구성된 정적(Static) 웹 애플리케이션입니다. 사용자 인터페이스와 상호작용을 담당합니다.
-   **Backend (Serverless)**: Netlify Function을 사용하여 Google Gemini API와의 통신을 중계하는 '보안 대리인' 역할을 수행합니다. **API 키는 이 서버리스 환경에만 안전하게 저장되며 클라이언트에는 절대 노출되지 않습니다.**
-   **데이터 저장**: 사용자의 보관함 데이터는 서버가 아닌, 브라우저의 `localStorage`에 안전하게 저장됩니다.

---

### 2. 파일 구조

```
.
├── docs/
│   ├── PRD.md
│   └── TRD.md              # (현재 파일)
│   └── TODOs.md
├── icons/
│   ├── icon-192x192.png
│   └── icon-512x512.png
├── netlify/
│   └── functions/
│       └── gemini.js       # Gemini API 호출을 중계하는 서버리스 함수
├── services/
│   └── geminiService.js    # 서버리스 함수(/api/gemini)와 통신 담당
├── utils/
│   └── imageOptimizer.js
├── .gitignore
├── .env.example
├── index.html
├── index.js
├── manifest.json
├── metadata.json
├── netlify.toml            # Netlify 빌드 및 함수 설정 파일
├── package.json            # 서버리스 함수의 의존성(@google/genai) 관리
└── service-worker.js
```

---

### 3. 핵심 파일 설명

-   **`index.js`**: 앱의 '두뇌' 역할을 하는 핵심 파일. 모든 UI/UX 로직과 상태 관리를 담당합니다.
-   **`netlify/functions/gemini.js`**: **API 키를 안전하게 보관하는 '보안 대리인'**. 클라이언트로부터 요청을 받아, 서버 환경에서 Gemini API를 호출하고 그 결과를 스트리밍으로 클라이언트에 전달합니다.
-   **`services/geminiService.js`**: 클라이언트의 '통신 전문가'. 이제 Gemini API 대신, 우리 앱의 보안 대리인(`gemini.js` 함수)에게 네트워크 요청을 보냅니다.
-   **`netlify.toml`**: Netlify 플랫폼의 설정 파일. `/api/*` 같은 깔끔한 주소로 서버리스 함수에 접근할 수 있도록 설정하고, 함수의 위치를 알려줍니다.
-   **`package.json`**: `gemini.js` 함수가 서버에서 실행되기 위해 필요한 `@google/genai` 라이브러리를 정의하는 파일입니다.

---

### 4. 주요 데이터 흐름 (보안 강화)

1.  **이미지 분석 흐름**:
    `클라이언트 (카메라/앨범)` → `이미지 최적화 (imageOptimizer.js)` → **`geminiService.js`가 `/api/gemini`로 요청 전송** → **`Netlify Function (gemini.js)`이 요청 수신** → `서버 환경에서 안전하게 Gemini API 호출` → `스트리밍 텍스트 응답` → `함수가 클라이언트로 응답 스트리밍` → `index.js` (화면 표시 및 TTS 음성 출력)

2.  **보관함 데이터 흐름**: (변경 없음)
    `저장 버튼 클릭` → `현재 이미지/설명 데이터 취합` → `localStorage` (JSON 형태로 저장)

---

### 5. 핵심 기술 및 API

-   **기본 기술**: `HTML5`, `Tailwind CSS`, `Vanilla JavaScript (ESM)`
-   **아키텍처**: **Jamstack**
-   **서버리스 백엔드**: **Netlify Functions**
-   **생성형 모델**: `@google/genai` (서버리스 함수 환경에서만 사용)
-   **Web APIs**: `getUserMedia`, `SpeechRecognition`, `SpeechSynthesis`, `Canvas API`
-   **PWA 기술**: `Service Worker`, `Web App Manifest`

---

### 6. 배포 전략

-   **플랫폼**: **GitHub**와 **Netlify**를 연동한 CI/CD(지속적 통합/배포) 파이프라인을 사용합니다.
-   **배포 과정**:
    1.  로컬에서 코드 수정 후 `GitHub` 저장소에 `push`합니다.
    2.  `Netlify`는 변경사항을 감지하고, `package.json`을 확인하여 서버리스 함수에 필요한 의존성을 자동으로 설치합니다.
    3.  `Netlify`는 정적 파일과 서버리스 함수를 전 세계 CDN에 함께 배포합니다.
-   **API 키 관리**:
    -   **절대로 코드에 API 키를 하드코딩하지 않습니다.**
    -   `Netlify`의 `Site settings > Build & deploy > Environment > Environment variables` 메뉴에서 `API_KEY`라는 이름으로 환경 변수를 설정합니다. **오직 `netlify/functions/gemini.js` 함수만이 이 환경 변수에 접근할 수 있습니다.**

---

### 7. 업무 연속성 확보 방안 (Handover Protocol)

-   **핵심 원칙**: 어떤 개발자가 프로젝트를 이어받더라도, 3개의 핵심 문서(`PRD.md`, `TRD.md`, `TODOs.md`)만 읽으면 모든 맥락을 파악할 수 있어야 합니다.
-   **프로세스**:
    1.  새로운 개발 세션 시작 시, 항상 최신 버전의 `docs/` 폴더 내 3개 문서를 먼저 검토합니다.
    2.  개발 작업이 완료되면, `TODOs.md`에 **무엇을, 왜, 어떻게** 변경했는지 상세히 기록하고, 변경 사항이 제품/기술 요구사항에 영향을 미칠 경우 `PRD.md`와 `TRD.md`를 함께 업데이트합니다.
