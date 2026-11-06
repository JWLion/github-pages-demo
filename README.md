# 수업연구실 · 실제 AI 체험판

기존 연구 DB 버전은 그대로 두고 만든 배포용 체험판입니다. GitHub Pages는 웹 화면을 제공하고, Cloudflare Worker가 OpenAI API 키를 숨긴 채 AI 요청을 처리합니다. **GitHub Pages에 폴더만 올리면 실제 AI 기능은 작동하지 않습니다.** Worker도 한 번 배포해야 합니다.

## 실제로 동작하는 기능

1. AIEDAP 계획서 PDF 또는 DOCX를 그대로 올려 실제 내용을 읽고, 원문에서 확인된 문구만 초안 표에 정리합니다. TXT·MD도 지원합니다.
   스캔 PDF의 글자 읽기는 오류가 있을 수 있으므로 왼쪽의 **원본 PDF**와 **추출 텍스트**를 확인하세요.
2. 교사와 최대 8명의 가상 학생 페르소나를 설정합니다.
3. AI가 주의 지점을 제시하고, 교사가 직접 탐색 지점을 추가할 수 있습니다.
4. 교사 에이전트와 학생별 에이전트가 실제 OpenAI API로 대화합니다. 재생·정지, 속도, 마스터 채팅을 사용할 수 있습니다.
   비용이 계속 발생하지 않도록 다른 탭으로 이동하면 재생이 자동으로 멈춥니다.
5. 마이크 음성을 OpenAI가 전사하고, 원문에 근거한 피드백 항목을 만들며, 교사가 직접 수정합니다.
6. AI 제안을 개별 선택·수정·보류하고, 선택한 제안을 AI와 토론한 뒤 교사 확인으로 반영합니다.
7. 교사 피드백과 승인한 제안만 반영한 최종 계획서, 차시별 사례, 학생 페르소나별 예상 의견을 확인하고 내려받습니다.

예시 계획서 버튼도 남겨 두었습니다. 이 버튼을 사용해도 **2단계부터는 실제 AI API**가 동작합니다.

## 저장 범위

- 앱은 교사의 문서·녹음 파일·대화·연구 로그를 DB나 파일로 저장하지 않습니다. 작업 상태와 접속 코드는 현재 열린 브라우저 탭의 메모리에만 있으며 새로고침하면 사라집니다.
- Worker는 문서와 음성을 요청 처리 중 메모리에서만 사용합니다. 녹음 파일은 전사 응답 뒤 브라우저 메모리에서도 버립니다. 서버 코드에 파일 쓰기나 데이터베이스가 없습니다.
- OpenAI API에는 분석에 필요한 문서·대화·음성이 전송됩니다. Responses 요청에는 `store: false`를 설정했지만, 이것이 OpenAI 측의 모든 보관을 없애지는 않습니다. 기본 남용 방지 로그에 일부 내용이 최대 30일 남을 수 있습니다. **민감한 학생 실명·개인정보가 들어간 문서는 올리지 마세요.** [OpenAI 데이터 관리 안내](https://developers.openai.com/api/docs/guides/your-data)
- 실제 API 사용량에 따른 비용이 발생합니다. 공유 전에 OpenAI 프로젝트의 사용 한도를 설정하는 편이 좋습니다.

## 게시 방법 · 명령어 없이 진행

GitHub 계정과 Cloudflare 계정이 필요합니다. **먼저 GitHub 저장소를 만들고, 이어서 같은 저장소를 Cloudflare에 연결**합니다.

1. [wrangler.toml](./wrangler.toml)의 `ALLOWED_ORIGINS`에서 `YOUR-GITHUB-NAME`을 실제 GitHub 사용자 이름으로 바꿉니다. 예를 들어 `https://hongj.github.io,http://127.0.0.1:3002`처럼 **저장소 이름과 경로를 제외한 주소**를 입력합니다. `name = "lesson-lab-demo-api"`는 그대로 둡니다.
2. GitHub에서 새 저장소를 만듭니다. 예: `lesson-lab-demo`. 이 `github-pages-demo` **폴더 안의 파일 전체**를 저장소 최상위에 올립니다. 저장소를 열었을 때 `index.html`과 `wrangler.toml`이 바로 보여야 합니다. 상위 프로젝트의 `api chatgpt API key.txt`나 `data` 폴더는 올리지 않습니다.
3. GitHub 저장소의 **Settings → Pages → Build and deployment**에서 **Deploy from a branch**, **main / (root)**, **Save**를 선택합니다. 이때 페이지가 열려도 아직 AI 기능은 연결 전입니다.
4. Cloudflare 대시보드의 **Workers & Pages → Create application → GitHub**에서 방금 만든 저장소를 선택합니다. Worker 이름은 `lesson-lab-demo-api`, 루트 디렉터리는 저장소 최상위로 두고 **Save and Deploy**를 누릅니다. 완료 뒤 `https://...workers.dev` 주소를 확인합니다.
5. Cloudflare에서 방금 만든 Worker의 **Settings → Variables and Secrets → Add**로 이동합니다. 유형을 **Secret**으로 선택해 `OPENAI_API_KEY`에 OpenAI API 키를 넣습니다. 같은 방식으로 `DEMO_ACCESS_CODE`에 **임의의 16자 이상 팀 접속 코드**를 넣습니다. 이 값은 GitHub에 입력하지 않습니다.
6. GitHub에서 [config.js](./config.js)를 편집해 `API_BASE_URL`을 4단계의 Worker 주소로 바꾸고 커밋합니다. 잠시 뒤 GitHub Pages가 다시 게시됩니다.
7. 게시된 페이지에 접속해 팀 접속 코드를 넣고 PDF를 올려 확인합니다. 팀원에게는 페이지 주소와 접속 코드를 각각 전달합니다.

Cloudflare의 [GitHub 저장소 연결 안내](https://developers.cloudflare.com/workers/ci-cd/builds/)와 [비밀값 설정 안내](https://developers.cloudflare.com/workers/configuration/secrets/), [GitHub Pages 게시 설정 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)를 참고하세요. OpenAI는 API 키를 브라우저 코드나 저장소에 공개하지 말라고 안내합니다: [API 인증 안내](https://developers.openai.com/api/reference/overview#authentication).

Node.js와 npm을 직접 설치해 사용하는 경우에는 같은 폴더에서 `npx wrangler login`, `npx wrangler deploy`, `npx wrangler secret put OPENAI_API_KEY`, `npx wrangler secret put DEMO_ACCESS_CODE` 순서로 Worker를 배포할 수도 있습니다.

## 로컬 확인

`index.html`을 더블클릭하지 말고, Windows에서 [start-preview.cmd](./start-preview.cmd)를 실행하세요. 또는 이 폴더에서 `node preview.mjs`를 실행합니다. 검은 창을 열어 둔 채 Chrome 주소창에 `http://127.0.0.1:3002/`을 입력합니다.

화면은 바로 열리지만 **실제 PDF 분석과 AI 대화는 Worker를 배포하고 `config.js`에 Worker 주소를 넣은 뒤** 동작합니다. Worker의 `ALLOWED_ORIGINS`에는 `http://127.0.0.1:3002`가 들어 있어야 합니다. 실행을 마치려면 검은 창에서 `Ctrl+C`를 누릅니다.

Worker 코드의 자동 검사는 `node --test worker/worker.test.mjs`로 실행할 수 있습니다. 이 검사는 실제 OpenAI 키나 요금을 사용하지 않습니다.
