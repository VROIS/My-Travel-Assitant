# 내손안의 여행비서 (My Travel Assistant)

**Google Gemini API를 활용한 AI 기반 실시간 여행 가이드**

이 앱은 사용자의 카메라, 앨범, 마이크를 통해 여행 중 마주치는 랜드마크나 사물에 대한 흥미로운 정보를 실시간으로 제공하는 개인 투어 가이드입니다.

## ✨ 핵심 기능

- **실시간 AI 분석**: Gemini API를 통해 이미지와 음성 질문에 대한 빠르고 정확한 설명을 제공합니다.
- **다양한 입력 방식**: 카메라 촬영, 갤러리 업로드, 음성 질문 등 편리한 입력 방식을 지원합니다.
- **즉각적인 음성 해설**: AI의 답변이 생성되는 즉시 음성(TTS)으로 변환하여, 요청 후 몇 초 안에 정보를 들을 수 있습니다.
- **콘텐츠 보관**: 나만의 여행 기록을 만들 수 있도록, 분석 결과를 앱 내 보관함에 저장하고 다시 볼 수 있습니다.

## 🛠️ 기술 스택

- **Frontend**: HTML, CSS, TypeScript (프레임워크 없음)
- **AI Model**: Google Gemini API (`gemini-2.5-flash`)
- **Web APIs**: `getUserMedia`, `SpeechRecognition`, `SpeechSynthesis`

## 🚀 시작하기

이 프로젝트는 별도의 빌드 과정 없이 정적 웹 호스팅 환경(예: Netlify, Vercel, GitHub Pages)에 바로 배포할 수 있습니다.
