# 월간일정표 대시보드 (BTI-Schedule) 작업 지침

이 파일은 Claude Code와 Codex가 함께 읽는 프로젝트 공통 지침의 원본입니다.
- 프로젝트 규칙을 추가하거나 고칠 때는 어느 도구에서든 이 파일을 수정합니다.
- CLAUDE.md는 이 파일을 불러오기만 하므로 공통 내용을 CLAUDE.md에 쓰지 않습니다.
- 이 저장소는 동료와 공유합니다. 개인 선호(문서 톤, 파일명 형식 등)는 각자의 전역 지침에 두고, 여기에는 프로젝트 규칙만 둡니다.

## 구성
- 백엔드: FastAPI `server.py` (인증 `auth.py`, 감사 로그 `audit_*.py`, 사용량 집계 `usage_tracker.py`)
- 프론트: 정적 파일 `index.html`, `app.js`, `styles.css`, `db.js`, `data.js`와 화면별 개편 파일 `*개편_*.css`, `*개편_*.js`, `*정돈_*.css`, `*통일_*.css` (빌드 단계 없음)
- 글꼴: Pretendard 공식 배포 WOFF2를 `assets/`에 두고 사용 (OFL 예약 글꼴 이름이 있어 직접 변환한 파일은 쓰지 않음)
- 운영: AWS App Runner (`apprunner.yaml`), DB는 RDS PostgreSQL (Secrets Manager `DB_SECRET_ARN`)
- 인증: Microsoft Entra SSO. 운영 `/api/*`는 로그인 세션 없이 호출하면 401

## 로컬 실행과 검증
- 백엔드 포함 실행: `python -m uvicorn server:app --reload --port 8000` (DB 환경변수 필요)
- 화면만 확인: `node serve.js` (정적 서버이며 API 없음). 화면 QA는 Playwright로 `/api/*` 응답을 모의 처리해 렌더링을 확인
- 테스트: `python -m pytest tests`
- JS를 고친 뒤 `node --check app.js`로 문법 확인

## 운영 데이터 다루기
- 운영 API는 SSO로 막혀 있어 스크립트나 CLI로 조회, 수정할 수 없으므로 시도하지 않습니다.
- DB 반영이 필요하면 브라우저 콘솔용 스크립트를 만들어 사용자가 로그인한 탭에서 실행하게 합니다.
  - 저장 전 기존 값 백업 출력, 변경 내용 미리보기, 확인 창 승인 후 저장하는 구조를 따릅니다.
  - 예시: `reference/2026경영관리팀 OKR실적/목표관리대시보드_3분기실적반영_20260930.js`
- `reference/`는 원본 자료 보관 폴더이며 커밋하지 않습니다.

## 수정 시 규칙
- 정적 파일(`app.js`, `styles.css`, `db.js`, `data.js`, 개편 CSS와 JS)을 고치면 `index.html`의 `?v=YYYYMMDDx` 캐시 버전을 모두 같은 값으로 올립니다.
- 새 정적 파일을 추가하면 git에 함께 등록합니다. 수정 파일만 커밋하면 운영에서 404가 나 화면이 깨집니다.
- 운영은 `.js`, `.css`, `.png` 등 정적 파일을 로그인 없이 공개합니다. 로컬 검토 도구나 민감 정보가 담긴 정적 파일은 커밋하지 않습니다.
- 모바일 화면(320px, 390px)에서 가로 넘침과 상단 메뉴 노출을 확인합니다.
- 식단 이미지: 운영 `/api/menu_weeks` 목록에는 날짜 키(`YYYY-MM-DD`) 정식 행과 이미지 저장 경로를 키로 쓰는 행이 섞여 옵니다. 화면은 정식 행의 `storage_path`만 사용합니다. 이미지 삭제 API(`DELETE /api/storage/menu-images/{key}`)는 행을 지우지 않고 `image_data`만 비우므로 이미지 행은 남습니다. 삭제는 정식 행을 먼저 지우고 성공을 확인한 뒤 이미지를 비우며, 각 응답의 오류를 확인합니다. 자동 반영 식단(`storage_path`가 주차 키와 같은 행)은 정식 행 삭제로 이미지가 함께 지워지므로 이미지 삭제 요청을 보내지 않습니다(재반영된 새 이미지 보호).
- 로컬 검토 서버(`로컬개편서버_*.js`)는 운영 저장 계약을 그대로 재현하지 않습니다. 저장, 업로드, 삭제 로직을 바꾸면 `server.py`의 실제 처리 방식 기준으로 다시 검증합니다.
- `schedules/`는 커밋하지 않으므로 운영에 없습니다. 화면에서 이 경로로 링크하지 않습니다.
- API를 추가하거나 바꾸면 `docs/AUDIT-ACTIONS.md`의 감사 이벤트 계약과 `audit_registry.py` 등록을 함께 맞춥니다.
- 요청자료 자동 생성 로직은 `요청자료일정자동생성규칙_20260521.md`, `app.js`의 `syncAutoRequestForMonth()`, `_backfill_auto_request.py`를 함께 맞춥니다.

## 커밋과 배포
- 커밋 메시지: `type(scope): 한글 요약` (예: `fix(goals): 목표 초과 실적의 진척률을 100%로 표시`)
- 개인 작업 브랜치(예: `zecks3636-collab`)에서 커밋한 뒤 `master`에 `--no-ff`로 병합합니다(메시지 `merge: 요약`).
- 배포 전 `git fetch --all`로 `enterprise/master`를 확인하고, 동료 커밋이 있으면 먼저 병합합니다.
- `origin`, `enterprise` 두 원격에 `master`와 작업 브랜치를 push하면 App Runner가 자동 배포합니다.
- push와 배포는 사용자 확인을 받은 뒤 진행합니다.
