# Storyloom

Flask · SQLite · Gemini API로 동작하는 AI 소설 집필 웹앱입니다.
기획, 설정 자료집, 회차 집필, 수정안 검토·승인, 작품 공개 및 다른 줄거리 만들기를 제공합니다.

## 준비

- Python 3.11 이상
- 본인 Google 프로젝트의 Gemini API 키
- 인터넷 연결이 가능한 웹 브라우저

API 키와 계정·작품 데이터는 포함되어 있지 않습니다. 무료 이용 여부와 제공 한도는 본인 Google 프로젝트에서 확인하세요.

## 실행 — Windows PowerShell

이 폴더를 열고 다음 명령을 실행하세요.

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

`.env`를 편집하여 본인의 키를 입력하세요.

```env
GEMINI_API_KEY=본인의_API_키
```

```powershell
.\.venv\Scripts\python app.py
```

브라우저에서 <http://127.0.0.1:5000>을 여세요. 종료는 실행 터미널에서 Ctrl+C입니다.
기본 모델은 코드의 `gemini-3.5-flash-lite`이며, 필요한 경우에만 `STORYLOOM_MODEL` 환경변수로 변경할 수 있습니다.
이 실행 방법은 로컬 사용용입니다. 인터넷 공개 서비스 배포 설정은 포함하지 않습니다.

## 사용 순서

1. 회원가입 후 로그인합니다. 닉네임은 1~20자, 새 아이디는 4~50자, 비밀번호는 8~200자입니다. 아이디와 닉네임은 각각 중복을 허용하지 않습니다.
2. 내 작품에서 새 작품을 만들고 AI와 대화하며 기획안을 정리합니다.
3. 기획안과 설정을 검토하고 승인한 뒤, 분량·회차 구성을 정해 원고를 집필합니다.
4. 수정안은 내용을 확인하고 수락합니다. 회차 원고와 설정 검토가 남아 있으면 화면 안내에 따라 완료하세요.
5. 작품 공개, 관심 작품, 다른 줄거리 기능은 앱 화면에서 이용할 수 있습니다.

AI 출력의 분량·사실·일관성을 최종 확인한 뒤 승인하세요. API 혼잡이나 제공 한도에 따라 오류 또는 지연이 발생할 수 있습니다.

## 저장 파일과 백업

처음 실행하면 `storyloom.sqlite3`와 `storyloom.session-key`가 자동 생성됩니다.
DB에는 계정·작품·원고 등이 저장되고 세션 키는 로그인 상태를 검증하는 데 쓰입니다.
실사용 데이터가 있는 두 파일은 보관하고 GitHub에 올리지 마세요. 앱 내 내보내기 기능으로 작품을 백업할 수 있습니다.
브라우저 데이터가 남아 있으면 새 환경에서 로그아웃 후 다시 로그인하세요.

## 폴더 구성

- `app.py`: Flask 서버와 API
- 나머지 루트 Python 파일: AI 통신, 집필·설정·검토 처리 모듈
- `templates/`: 화면 템플릿
- `static/`: JavaScript, CSS, 이미지
- `requirements.txt`: Python 의존성
- `.env.example`: 비밀값 없는 환경설정 예시
- `.gitignore`: 로컬 환경·비밀키·데이터 제외 규칙

## GitHub 업로드 전

이 폴더의 코드와 문서만 업로드하세요. `.gitignore`와 `.env.example`도 포함하세요.
`.env`, API 키, DB, 세션 키, 작품 백업은 업로드하지 마세요.
이 폴더는 업로드 준비본이며 Git 초기화·커밋·원격 저장소 연결·업로드는 수행하지 않았습니다.
