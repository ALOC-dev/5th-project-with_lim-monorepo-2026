# 프로젝트 소개

## 프로젝트 개요

TypeScript 기반 모노레포입니다.

현재 구성은 추천 엔진 패키지, API 서버, 클라이언트 앱, 공통 API 계약 패키지로 나뉘어 있습니다.

## 기술 스택

- 패키지 매니저: pnpm workspace
- 언어: TypeScript
- 클라이언트: React, Vite
- 서버: Node.js, Express

## 프로젝트 구조

```txt

├── apps
│   ├── client                 # React 기반 클라이언트 어플리케이션
│   └── server                 # Express 기반 API 서버 어플리케이션
├── packages
│   ├── api-contracts          # 서버/클라이언트에서 공유하는 API 응답 타입과 유틸
│   └── recommendation-engine  # 장소 추천 엔진 핵심 로직
├── agent                      # AI 에이전트 작업 규칙과 작업 로그
├── package.json               # 루트 스크립트와 공통 의존성
├── pnpm-workspace.yaml        # pnpm workspace 설정
└── tsconfig.base.json         # 공통 TypeScript 설정
```

# 초기 설정과 프로젝트 실행

## 사전 요구사항

- Node.js와 pnpm이 필요합니다. 앖으면 설치해오셔야 합니다.

```bash
node -v
pnpm -v
```

## 패키지 설치

```bash
pnpm install
```

## 환경변수 설정

로컬 개발 서버 기준 환경변수를 `apps/server/.env`에 설정합니다. 해당 값들은 필요 시 팀장에게 문의해주세요.

```env
OPENAI_API_KEY=
KAKAO_REST_API_KEY=
TMAP_APP_KEY=
NAVER_SEARCH_CLIENT_ID=
NAVER_SEARCH_CLIENT_SECRET=
```

## 로컬 개발 서버 실행

전체 앱을 한 번에 실행합니다.

```bash
pnpm dev
```

필요한 앱만 따로 실행할 수도 있습니다.

```bash
pnpm --filter @monorepo/server dev
pnpm --filter @monorepo/client dev
```

서버 상태 확인:

```bash
curl http://localhost:3000/health
```

# 개발 방식

## 브랜치 관리 전략

규모가 크지 않은 프로젝트이므로, one issue - one branch 방식으로 관리합니다.

작업은 먼저 GitHub Issue를 생성한 뒤, 이슈 번호를 기준으로 브랜치를 생성합니다.

브랜치 이름은 아래 형식을 사용합니다.

```txt
{영역}-{이슈번호}
```

영역 구분:

- `FE`: Frontend
- `BE`: Backend
- `COMMON`: Common / Core

예시:

```txt
F-1
B-2
C-3
```

작업 내용은 이슈 제목과 PR 제목에 명확하게 작성합니다.

## 커밋 컨벤션

커밋 메시지는 아래 형식을 사용합니다.

```txt
type: 변경 내용 요약
```

자주 사용하는 타입:

- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 수정
- `refactor`: 기능 변화 없는 코드 정리
- `chore`: 설정, 패키지, 빌드 등 기타 작업

예시:

```txt
feat: 장소 추천 결과 카드 추가
```

```txt
fix: 서버 헬스 체크 응답 오류 수정
```
