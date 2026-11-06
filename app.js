import { fallbackLessonTemplate, renderLessonTemplate } from './lesson_template.js';
import { readContextForm, renderContextStage } from './context_stage.js';
import { renderProposalStage } from './proposal_stage.js';
import { SAMPLE_PLAN, SAMPLE_LAYOUT } from './sample_plan.js';
import { API_BASE_URL } from './config.js';

const app = document.querySelector('#app');

const icons = {
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5C9.3 4.9 5.8 4.8 3 6v13c2.8-1.2 6.3-1.1 9 .5 2.7-1.6 6.2-1.7 9-.5V6c-2.8-1.2-6.3-1.1-9 .5Z"/><path d="M12 6.5v13"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M13 2v7h7M8 13h8M8 17h8"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>'
};

const personaKeywords = ['사례로 이해', '질문이 많음', '발표에 신중', '시각 자료 선호', '토론 선호', '혼자 탐구', '사전지식 부족', '사전지식 풍부', '실생활 연결', '근거를 따짐'];
const newPersona = () => ({ id:crypto.randomUUID(), keywords:[], description:'' });

const state = {
  stage: 1, file: null, filename: '', plan: '', formattedBefore: null, originalPdfUrl:'', planMode: 'formatted', view: 'before',
  context: { studentPersonas:[newPersona(), newPersona(), newPersona()] }, teacher: null, students: [], points: [], pointIndex: 0,
  attentionNote: '', attentionNotes: {}, customPointDraft:'', transcript: [], feedback: '', feedbackTranscript: '', summary: '', proposals: [], decisions: {}, final: null,
  discussions:{}, selectedProposalId:'', discussionDrafts:{}, pendingRevision:{}, discussionBusy:false,
  demoSample:false
};

const playback = {
  playing: false, inFlight: false, pumping: false, controller: null,
  pendingDirection: '', manualRequested: false, speed: 1, lastTurnAt: 0
};
const voice = { recognition:null, stream:null, chunks:[], discard:false, processing:false, status:'마이크로 녹음한 음성은 OpenAI에서 전사하고, 원문 근거만 항목으로 정리합니다.' };
let accessCode = '';
const speedSteps = [0.5, 0.8, 1.0, 1.2, 1.5];

const stageLabels = { 2: '수업 맥락', 3: '주의 지점', 4: '시뮬레이션', 5: '교사 피드백', 6: '제안 확인', 7: '계획서 완성' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}

function truncate(text, n = 66) { const s = String(text || ''); return s.length > n ? s.slice(0, n) + '…' : s; }

async function api(route, data = {}, signal) {
  const base = API_BASE_URL.replace(/\/$/, '');
  if (base.includes('YOUR-WORKER')) throw new Error('config.js에 배포한 Worker 주소를 먼저 입력해 주세요.');
  if (!accessCode || accessCode.length < 16) throw new Error('팀 접속 코드를 입력해 주세요.');
  const response = await fetch(`${base}/api/${route}`, {
    method:route === 'health' ? 'GET' : 'POST', signal,
    headers:{ 'content-type':'application/json', 'x-demo-access-code':accessCode },
    ...(route === 'health' ? {} : { body:JSON.stringify(data) })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `API 요청 실패 (HTTP ${response.status})`);
  return result;
}

async function apiStream(route, data, onTurn, signal) {
  const base = API_BASE_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/api/${route}`, {
    method:'POST', signal,
    headers:{ 'content-type':'application/json', 'x-demo-access-code':accessCode },
    body:JSON.stringify(data)
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `시뮬레이션 요청 실패 (HTTP ${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  while (true) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value || new Uint8Array(), { stream:!done });
    const chunks = pending.split(/\r?\n\r?\n/);
    pending = chunks.pop() || '';
    for (const chunk of chunks) {
      const line = chunk.split(/\r?\n/).find(row => row.startsWith('data: '));
      if (!line) continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === 'error') throw new Error(event.error || '시뮬레이션을 진행하지 못했습니다.');
      if (event.type === 'turn') await onTurn(event.turn);
    }
    if (done) break;
  }
}

// 체험판에서는 어떤 입력이나 조작도 기록하지 않습니다.
function logEvent() { return Promise.resolve(); }
function quietLog() {}

function loading(title, detail = '잠시만 기다려 주세요.') {
  document.querySelector('.loading-overlay')?.remove();
  const element = document.createElement('div');
  element.className = 'loading-overlay';
  element.innerHTML = `<div class="loading-card" role="status" aria-live="polite"><div class="spinner"></div><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>`;
  document.body.append(element);
  return () => element.remove();
}

function toast(message, isError = true) {
  document.querySelector('.toast')?.remove();
  const element = document.createElement('div');
  element.className = `toast ${isError ? 'error' : ''}`;
  element.setAttribute('role', 'alert');
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), 6500);
}

function brand() {
  return `<header class="topbar"><a href="./" class="brand" data-action="home" aria-label="수업연구실 처음으로"><span class="brand-icon">${icons.book}</span>수업연구실</a><div class="topbar-right"><span class="key-pill ready"><span class="dot"></span>실제 AI · 저장 안 함</span>${state.stage > 1 ? '<button type="button" class="top-ghost" data-action="new">새 계획서 시작</button>' : ''}</div></header>`;
}

function renderIntro() {
  app.innerHTML = `<div class="app-shell">${brand()}<main class="intro"><div class="eyebrow">STATIC LESSON DESIGN DEMO</div><div class="intro-grid"><section><h1>수업 전에,<br><em>학생의 반응을</em><br>미리 만나보세요.</h1><p class="intro-copy">예시 계획서 또는 TXT·MD 문서로 학생 반응 탐색 흐름을 체험해 보세요. 교사의 수업 방식과 피드백을 반영해 계획서를 함께 다듬습니다.</p><div class="intro-chips"><span>교사 페르소나</span><span>다양한 학생 관점</span><span>수정 전후 비교</span></div></section><section class="upload-card"><div class="upload-card-head"><div><div class="step-kicker">STEP 01 · 시작하기</div><h2>수업계획서 초안 업로드</h2><p>가지고 있는 계획서에서 수업 탐색을 시작합니다.</p></div><div class="doc-icon">${icons.file}</div></div><div class="dropzone" id="dropzone"><div class="upload-graphic">${icons.upload}</div><strong>파일을 이곳에 끌어다 놓으세요</strong><small>PDF, Word(DOCX), TXT, MD · 최대 8MB</small><label class="file-label" for="file-input">파일 선택하기</label><input type="file" id="file-input" accept=".pdf,.docx,.txt,.md" hidden></div>${state.file ? `<div class="selected-file"><span>📄 ${esc(state.file.name)} · ${(state.file.size / 1024).toFixed(0)}KB</span><button type="button" data-action="remove-file">삭제</button></div>` : ''}<button type="button" class="primary" data-action="upload" ${state.file ? '' : 'disabled'}>초안 업로드하고 계속하기 →</button><p class="upload-note">TXT·MD는 브라우저에서 읽습니다. PDF·DOCX는 내용을 분석하지 않고 예시 계획서로 체험합니다. 입력 내용은 서버로 전송되지 않고 새로고침하면 사라집니다.</p></section></div><div class="flow-teaser"><article><span class="flow-no">01</span><div><b>맥락을 더하고</b><p>환경, 학생 특성, 교사의 수업 방식을 입력합니다.</p></div></article><article><span class="flow-no">02</span><div><b>반응을 탐색하고</b><p>주의 지점을 골라 모의수업을 살펴봅니다.</p></div></article><article><span class="flow-no">03</span><div><b>계획서를 발전시킵니다</b><p>교사가 승인한 제안으로 수정본을 만듭니다.</p></div></article></div></main></div>`;
  document.querySelector('[data-action="upload"]').insertAdjacentHTML('afterend', '<button type="button" class="secondary demo-sample-button" data-action="sample">예시 계획서로 바로 체험하기</button>');
  document.querySelector('.eyebrow').textContent = 'LIVE AI LESSON DESIGN';
  document.querySelector('.intro-copy').textContent = '실제 수업계획서 PDF를 올리고 교사·학생 페르소나와 모의수업을 AI로 탐색해 보세요. 작업은 서버에 저장하지 않습니다.';
  document.querySelector('.upload-note').textContent = 'PDF·DOCX·TXT·MD의 실제 내용을 OpenAI가 분석합니다. 입력과 음성은 API 처리에 전송되지만 이 앱은 파일·대화·연구 로그를 저장하지 않습니다.';
  document.querySelector('[data-action="upload"]').insertAdjacentHTML('beforebegin', `<div class="demo-access-field"><label for="access-code">팀 접속 코드</label><input id="access-code" type="password" autocomplete="off" placeholder="팀원에게 받은 접속 코드를 입력하세요" value="${esc(accessCode)}"><small>접속 코드는 새로고침하면 사라집니다. OpenAI API 키를 입력하지 마세요.</small></div>`);
  const zone = document.querySelector('#dropzone');
  zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('drag'); setFile(event.dataTransfer.files[0]); });
}

function setFile(file) {
  if (!file) return;
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!['.pdf','.docx','.txt','.md'].includes(ext)) return toast('PDF, DOCX, TXT, MD 파일을 선택해 주세요.');
  if (file.size > 8 * 1024 * 1024) return toast('8MB 이하 파일을 선택해 주세요.');
  state.file = file;
  renderIntro();
}

function renderSteps() {
  return `<nav class="steps" aria-label="진행 단계">${Object.entries(stageLabels).map(([num,label]) => `<div class="step ${Number(num) === state.stage ? 'active' : Number(num) < state.stage ? 'done' : ''}"><span class="num">${Number(num) < state.stage ? '✓' : num}</span>${esc(label)}</div>`).join('')}</nav>`;
}

function stageContent() {
  if (state.stage === 2) return renderContextStage(state.context, personaKeywords);
  if (state.stage === 3) return attentionStage();
  if (state.stage === 4) return simulationStage();
  if (state.stage === 5) return feedbackStage();
  if (state.stage === 6) return renderProposalStage(state);
  return finalStage();
}

function renderWorkspace() {
  app.innerHTML = `<div class="app-shell">${brand()}<main class="workspace"><div class="workspace-top"><div><h1 class="workspace-title">${esc(state.filename || '수업계획서')}</h1><p class="workspace-sub">${state.demoSample ? '체험용 예시 계획서 · 업로드한 PDF·DOCX의 내용은 분석하지 않습니다.' : '입력한 TXT·MD 내용으로 화면 흐름을 체험합니다.'}</p></div>${renderSteps()}</div><div class="workspace-grid"><section class="panel plan-panel" aria-label="수업계획서 미리보기"><div class="panel-header"><div class="panel-titleline"><span class="panel-badge">${icons.file}</span><div><h2>${state.stage === 7 && state.view === 'after' ? '수정 후 계획서' : '수업계획서 초안'}</h2><small>왼쪽 문서를 스크롤하며 내용을 확인하세요</small></div></div>${state.stage === 7 ? `<div class="plan-tabs"><button type="button" data-action="view-before" class="${state.view === 'before' ? 'active' : ''}">Before</button><button type="button" data-action="view-after" class="${state.view === 'after' ? 'active' : ''}">After</button></div>` : '<small>원본 문서</small>'}</div><div class="plan-body"><article class="paper"><div class="paper-top">LESSON PLAN · ${state.stage === 7 && state.view === 'after' ? 'AFTER' : 'BEFORE'}</div><h3>${esc(state.stage === 7 && state.view === 'after' ? (state.final?.title || '수정된 수업계획서') : (state.filename || '수업계획서 초안'))}</h3><div class="paper-meta">${state.stage === 7 && state.view === 'after' ? '교사가 승인한 변경을 반영한 수정본' : '업로드한 문서의 텍스트'}</div><div class="plan-content" id="plan-content"></div></article></div></section><section class="panel stage-panel" aria-label="진행 중인 단계">${stageContent()}</section></div></main></div>`;
  document.querySelector('.workspace-sub').textContent = state.demoSample ? '예시 문서 · 실제 OpenAI 에이전트로 진행 중입니다.' : '업로드한 문서의 실제 내용을 OpenAI가 분석했습니다.';
  const showingAfter = state.stage === 7 && state.view === 'after';
  document.querySelector('.plan-panel .panel-header').insertAdjacentHTML('beforeend', `<div class="plan-view-controls"><button type="button" data-action="mode-formatted" class="${state.planMode === 'formatted' ? 'active' : ''}">정리된 보기</button><button type="button" data-action="mode-raw" class="${state.planMode === 'raw' ? 'active' : ''}">추출 텍스트</button>${state.originalPdfUrl && !showingAfter ? `<button type="button" data-action="mode-pdf" class="${state.planMode === 'pdf' ? 'active' : ''}">원본 PDF</button>` : ''}</div>`);
  const originalBadge = document.querySelector('.plan-panel .panel-header > small');
  if (originalBadge) originalBadge.textContent = '계획서 보기';
  if (state.stage === 3) {
    document.querySelector('.stage-desc').textContent = 'AI가 제시한 지점을 선택하거나, 교사가 확인하고 싶은 지점을 직접 추가할 수 있습니다.';
    document.querySelectorAll('.attention-card').forEach((card, index) => {
      if (!state.points[index]?.quote) card.querySelector('.quote').textContent = '교사가 직접 지정한 탐색 지점';
    });
    document.querySelector('.stage-panel .stage-scroll').insertAdjacentHTML('beforeend', `<div class="field attention-note"><label for="attention-note">선택한 지점에서 확인하고 싶은 점</label><textarea id="attention-note" placeholder="예: 학생들이 어떤 부분에서 개념을 헷갈릴지 살펴보고 싶어요.">${esc(state.attentionNote)}</textarea></div><div class="field custom-point"><label for="custom-point">교사가 직접 지적할 지점</label><textarea id="custom-point" placeholder="예: 2차시 모둠 토론에서 자료의 출처를 어떻게 확인할지 살펴보고 싶어요.">${esc(state.customPointDraft)}</textarea><button type="button" class="secondary" data-action="add-custom-point">내 지점 추가</button></div>`);
  }
  if (state.stage === 4) {
    document.querySelector('.stage-desc').textContent = '실제 AI 교사와 학생 페르소나가 차례로 대화합니다. 재생 중에는 계속 이어지고, 정지하면 다음 생성이 멈춥니다.';
    document.querySelector('.chat-settings span:last-child').textContent = '가상 학생 반응은 실제 학생의 예측이 아닙니다.';
  }
  if (state.stage === 5) {
    document.querySelector('.stage-desc').textContent = '시뮬레이션에서 관찰한 반응과 계획서에서 바꾸고 싶은 점을 글이나 음성으로 남겨주세요. 음성은 OpenAI가 전사한 뒤 원문에서 확인된 내용만 항목으로 정리합니다.';
    document.querySelector('.voice-card-head p').textContent = '녹음이 끝나면 OpenAI가 전사하고 편집 가능한 항목으로 정리합니다.';
    document.querySelector('.voice-privacy').textContent = '녹음은 전사를 위해 OpenAI에 전송됩니다. 이 앱은 녹음 파일을 저장하지 않고 처리 직후 메모리에서 버립니다.';
  }
  renderPlanText();
}

function normalizeWithMap(value) {
  const chars = [], map = [];
  for (let i = 0; i < value.length; i++) {
    const ch = /\s/.test(value[i]) ? ' ' : value[i];
    if (ch === ' ' && chars.at(-1) === ' ') continue;
    chars.push(ch); map.push(i);
  }
  return { text:chars.join(''), map };
}

function highlightRange(text, quote) {
  if (!quote) return null;
  const source = normalizeWithMap(text), target = normalizeWithMap(quote.trim()).text;
  let matchedLength = target.length;
  let index = source.text.indexOf(target);
  if (index < 0 && target.length > 18) {
    matchedLength = Math.min(18, target.length);
    index = source.text.indexOf(target.slice(0, matchedLength));
  }
  if (index < 0) return null;
  return [source.map[index], source.map[Math.min(index + matchedLength - 1, source.map.length - 1)] + 1];
}

function highlighted(value, quote) {
  const text = String(value || '');
  const range = highlightRange(text, quote);
  return range ? `${esc(text.slice(0, range[0]))}<mark>${esc(text.slice(range[0], range[1]))}</mark>${esc(text.slice(range[1]))}` : esc(text);
}

function renderPlanText() {
  const node = document.querySelector('#plan-content');
  if (!node) return;
  const showingAfter = state.stage === 7 && state.view === 'after';
  const content = showingAfter ? (state.final?.revisedPlan || '') : state.plan;
  const title = showingAfter ? (state.final?.title || '수정된 수업계획서') : (state.filename || '수업계획서 초안');
  const quote = !showingAfter && (state.stage === 3 || state.stage === 4) ? state.points[state.pointIndex]?.quote : '';
  const layout = showingAfter ? state.final?.formatted : state.formattedBefore;
  const paper = document.querySelector('.paper');
  const paperTitle = document.querySelector('.paper h3');
  const paperMeta = document.querySelector('.paper-meta');
  paper.classList.remove('pdf-view');
  node.classList.remove('pdf-content');
  if (state.planMode === 'pdf' && !showingAfter && state.originalPdfUrl) {
    paper.classList.remove('template-view');
    paper.classList.add('pdf-view');
    node.classList.remove('raw-content');
    node.replaceChildren();
    const link = document.createElement('a');
    link.href = state.originalPdfUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = '원본 PDF를 새 창에서 열기 ↗';
    const frame = document.createElement('iframe');
    frame.src = state.originalPdfUrl;
    frame.title = '업로드한 수업계획서 원본 PDF';
    node.classList.add('pdf-content');
    node.append(link, frame);
    return;
  }
  if (state.planMode === 'raw') {
    paper.classList.remove('template-view');
    paperTitle.textContent = title;
    paperMeta.textContent = showingAfter ? 'AI가 만든 수정본 텍스트' : '업로드한 문서의 추출 텍스트';
    node.classList.add('raw-content');
    node.textContent = '';
    const range = highlightRange(content, quote);
    if (range) {
      node.append(document.createTextNode(content.slice(0, range[0])));
      const mark = document.createElement('mark'); mark.textContent = content.slice(range[0], range[1]); node.append(mark);
      node.append(document.createTextNode(content.slice(range[1])));
      mark.scrollIntoView({ block:'center' });
    } else node.textContent = content;
    return;
  }
  paper.classList.add('template-view');
  node.classList.remove('raw-content');
  const display = layout?.identity ? layout : fallbackLessonTemplate(showingAfter ? (state.final?.corePlan || content) : content, showingAfter ? title : '');
  node.innerHTML = renderLessonTemplate(display, value => highlighted(value, quote), showingAfter ? {
    sessionExamples:state.final?.sessionExamples || [],
    studentOpinions:state.final?.studentOpinions || []
  } : null);
  node.querySelector('mark')?.scrollIntoView({ block:'center' });
}

function attentionStage() {
  const t = state.teacher;
  return `<div class="stage-scroll"><div class="stage-overline">STEP 03 · EXPLORE</div><h2 class="stage-heading">어느 지점을 먼저 살펴볼까요?</h2><p class="stage-desc">체험판이 학생 반응을 살펴볼 지점을 예시로 제시합니다. 카드를 선택하면 왼쪽 원문이 표시됩니다.</p><div class="persona-row"><div class="mini-card"><b>교사 페르소나</b><p>${esc(truncate(t?.styleSummary, 100))}</p></div><div class="mini-card"><b>학생 관점 ${state.students.length}명</b><p>${esc(state.students.map(s => s.name).join(' · '))}</p></div></div><div class="attention-list">${state.points.map((p,i) => `<button type="button" class="attention-card ${state.pointIndex === i ? 'selected' : ''}" data-point="${i}"><div class="card-head"><span class="card-index">POINT ${String(i+1).padStart(2,'0')}</span><span class="selected-check">✓</span></div><h3>${esc(p.title)}</h3><p>${esc(p.reason)}</p><div class="quote">“${esc(truncate(p.quote, 105))}”</div></button>`).join('')}</div></div><div class="panel-footer"><button class="text-button" type="button" data-action="back-context">← 맥락 수정</button><button class="primary" type="button" data-action="start-simulation">선택한 지점 시뮬레이션 →</button></div>`;
}

function turnMarkup(turn) {
  const student = state.students.find(item => item.id === turn.studentId);
  const keywordText = student?.personaKeyword || student?.learningPreference || student?.priorKnowledge || '다양한 관점';
  const keywords = keywordText.split(' · ').map(value => value.trim()).filter(Boolean);
  const tag = turn.role === 'student' ? `${keywords.slice(0, 3).map(value => `<span class="persona-tag">${esc(value)}</span>`).join('')}${keywords.length > 3 ? `<span class="persona-tag" title="${esc(keywordText)}">+${keywords.length - 3}</span>` : ''}` : '';
  return `<div class="turn ${esc(turn.role)}"><div class="avatar">${turn.role === 'teacher' ? 'T' : esc(String(turn.speaker || '?')[0])}</div><div class="turn-inner"><div class="turn-name">${esc(turn.speaker)} <span class="role-label">· ${turn.role === 'teacher' ? '교사' : '학생'}</span>${tag}</div><div class="bubble">${esc(turn.text)}</div><div class="signal">${turn.role === 'teacher' ? '수업 의도' : '관찰 신호'} · ${esc(turn.meta)}</div></div></div>`;
}

function simulationStage() {
  const point = state.points[state.pointIndex];
  return `
    <div class="stage-scroll simulation-scroll">
      <div class="stage-overline">STEP 04 · SIMULATION</div>
      <h2 class="stage-heading">학생들은 어떻게 반응할까요?</h2>
      <p class="stage-desc">실제 AI 교사와 학생 페르소나가 차례로 대화합니다. 재생 중에는 대화가 이어지고, 정지하면 다음 생성을 멈춥니다.</p>
      <div class="focus-card"><div class="label">지금 탐색 중인 지점</div><strong>${esc(point?.title)}</strong><p>${esc(point?.questionToExplore)}</p></div>
      <div class="transcript" aria-live="polite">${state.transcript.map(turnMarkup).join('')}</div>
    </div>
    <div class="chat-box simulation-chat">
      <div class="chat-head"><div><h3>마스터 채팅</h3><p>반응을 더 보고싶은 사람과 어떤 점이 궁금한지 자유롭게 입력해보세요.</p></div><div class="chat-controls"><div class="speed-control"><label for="chat-speed">대화 속도 <output id="speed-value">${playback.speed.toFixed(1)}×</output></label><input type="range" id="chat-speed" min="0" max="4" step="1" value="${speedSteps.indexOf(playback.speed)}" aria-label="대화 속도"><div class="speed-ticks">${speedSteps.map(value => `<span>${value.toFixed(1)}</span>`).join('')}</div></div><button type="button" class="play-control ${playback.playing ? 'playing' : ''}" data-action="toggle-play" aria-pressed="${playback.playing}">${playback.playing ? '■ 정지' : '▶ 재생'}</button></div></div>
      <p class="chat-example">예: “사전지식이 적은 학생의 반응을 더 자세히 보여줘”</p>
      <div class="chat-settings"><span id="simulation-status" role="status">${playback.playing ? '대화가 재생 중입니다' : '일시정지 상태입니다'}</span><span>AI가 생성하는 가상 학생 반응입니다.</span></div>
      <div class="chat-row"><input class="chat-input" id="direction" aria-label="시뮬레이션 추가 요청" placeholder="보고 싶은 사람과 궁금한 점을 입력하세요"><button type="button" data-action="send-direction" aria-label="요청 보내기">↗</button></div>
    </div>
    <div class="panel-footer"><button class="text-button" type="button" data-action="back-attention">← 다른 지점 보기</button><div style="display:flex;gap:8px"><button class="secondary" type="button" data-action="next-scene" ${playback.playing || playback.inFlight ? 'disabled' : ''}>다음 장면</button><button class="primary inline" type="button" data-action="to-feedback">교사 피드백 →</button></div></div>`;
}

function feedbackStage() {
  return `<div class="stage-scroll"><div class="stage-overline">STEP 05 · TEACHER FEEDBACK</div><h2 class="stage-heading">교사의 판단을 남겨주세요</h2><p class="stage-desc">시뮬레이션에서 인상 깊었던 반응과 계획서에서 바꾸고 싶은 점을 글이나 음성으로 남겨주세요. 이 내용은 다음 단계에서 별도로 보여주고 최종안에 반영합니다.</p><div class="feedback-prompt"><b>생각을 정리할 때 참고해 보세요</b><p>· 어떤 학생 반응이 예상과 달랐나요?</p><p>· 설명, 활동 지시, 참여 방식 중 어디를 바꾸고 싶나요?</p><p>· 현재 계획서에서 꼭 유지하고 싶은 부분은 무엇인가요?</p></div><div class="voice-card"><div class="voice-card-head"><div><h3>음성으로 피드백 남기기</h3><p>OpenAI가 녹음을 전사하고 편집 가능한 항목으로 정리합니다.</p></div><button type="button" class="voice-button ${voice.recognition ? 'recording' : ''}" data-action="toggle-voice" ${voice.processing ? 'disabled' : ''}>${voice.recognition ? '■ 음성 입력 종료' : '🎙 음성 입력 시작'}</button></div><p class="voice-status" id="voice-status" role="status" aria-live="polite">${esc(voice.status)}</p><p class="voice-privacy">녹음은 전사를 위해 OpenAI에 전송됩니다. 이 앱은 녹음 파일을 저장하지 않습니다.</p></div>${state.feedbackTranscript ? `<details class="transcript-review"><summary>음성 전사 원문 확인</summary><p>${esc(state.feedbackTranscript)}</p></details>` : ''}<div class="field"><label for="feedback">교사 피드백 · 직접 수정 가능</label><textarea id="feedback" class="feedback-area" placeholder="직접 입력하거나 음성 녹음으로 초안을 만든 뒤 자유롭게 고쳐 주세요.">${esc(state.feedback)}</textarea><div class="field-help">이 편집창의 최종 내용이 다음 단계와 최종안에 반영됩니다.</div></div></div><div class="panel-footer"><button class="text-button" type="button" data-action="back-simulation">← 시뮬레이션 다시 보기</button><button class="primary" type="button" data-action="make-proposals" ${voice.recognition || voice.processing ? 'disabled' : ''}>AI 수정안 확인하기 →</button></div>`;
}

function finalStage() {
  const changes = state.final?.changeLog || [];
  return `<div class="stage-scroll"><div class="stage-overline">STEP 07 · COMPLETE</div><h2 class="stage-heading">수업계획서가 완성됐어요</h2><p class="stage-desc">왼쪽 After에서 차시별 소개 사례와 학생들의 예상 의견을 확인하세요. Before와 오가며 비교하거나 수정본을 내려받을 수 있습니다.</p><div class="complete-banner"><span class="big-check">✓</span><div><h3>교사 승인 내용 반영 완료</h3><p>선택한 수정안을 원본 계획서에 반영했습니다.</p></div></div><div class="form-section"><h3><span class="section-number">✓</span> 이번에 반영한 변경</h3>${changes.length ? `<ol class="change-list">${changes.map(c => `<li>${esc(c)}</li>`).join('')}</ol>` : '<p class="empty-note">반영된 변경이 없습니다. 왼쪽 탭에서 원본을 확인할 수 있습니다.</p>'}</div></div><div class="panel-footer"><button class="text-button" type="button" data-action="back-proposals">← 제안 다시 확인</button><button class="primary" type="button" data-action="download">수정본 다운로드 ↓</button></div>`;
}

function render() { state.stage === 1 ? renderIntro() : renderWorkspace(); }

function rerenderPreservingScroll(scrollDiscussionToBottom = false) {
  const planTop = document.querySelector('.plan-body')?.scrollTop || 0;
  const stageTop = document.querySelector('.stage-scroll')?.scrollTop || 0;
  const discussionTop = document.querySelector('.discussion-messages')?.scrollTop || 0;
  render();
  const planBody = document.querySelector('.plan-body');
  const stageBody = document.querySelector('.stage-scroll');
  const discussionBody = document.querySelector('.discussion-messages');
  if (planBody) planBody.scrollTop = planTop;
  if (stageBody) stageBody.scrollTop = stageTop;
  if (discussionBody) discussionBody.scrollTop = scrollDiscussionToBottom ? discussionBody.scrollHeight : discussionTop;
}

function blobBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
}

async function upload() {
  accessCode = document.querySelector('#access-code')?.value.trim() || accessCode;
  const stop = loading('수업계획서를 읽고 있어요', '실제 문서를 OpenAI로 분석합니다. 파일은 저장하지 않습니다.');
  try {
    await api('health');
    const result = state.file
      ? await api('upload', { name:state.file.name, base64:await blobBase64(state.file) })
      : { name:'체험용 예시 계획서', text:SAMPLE_PLAN, formatted:structuredClone(SAMPLE_LAYOUT), demoSample:true };
    state.filename = result.name;
    state.plan = result.text;
    state.formattedBefore = result.formatted;
    state.demoSample = !state.file;
    if (state.originalPdfUrl) URL.revokeObjectURL(state.originalPdfUrl);
    state.originalPdfUrl = state.file?.name.toLowerCase().endsWith('.pdf') ? URL.createObjectURL(state.file) : '';
    state.stage = 2;
    render();
    if (state.demoSample) toast('예시 계획서로 시작했습니다. 이후의 페르소나·대화·제안은 실제 AI가 만듭니다.', false);
    else if (result.groundingRemoved) toast('원문에서 확인되지 않은 정리 문구는 초안 표에서 제외했습니다. 추출 텍스트와 비교해 주세요.', false);
  } catch (error) { toast(error.message); }
  finally { stop(); }
}

async function submitContext(form) {
  const values = readContextForm(form);
  if (!values.grade.trim() || !values.subject.trim()) return toast('학년과 과목·단원을 입력해 주세요.');
  state.context = values;
  const stop = loading('교사와 학생 관점을 구성하고 있어요', '페르소나를 만든 뒤 계획서의 주의 지점을 탐색합니다.');
  try {
    await logEvent('context_submitted', { context:values });
    const setup = await api('setup', { plan:state.plan, context:state.context });
    state.teacher = setup.teacher; state.students = setup.students;
    const attention = await api('attention', { plan:state.plan, context:state.context, teacher:state.teacher, students:state.students });
    if (!attention.points?.length) throw new Error('주의 지점을 찾지 못했습니다. 다시 시도해 주세요.');
    state.points = attention.points; state.pointIndex = 0; state.attentionNote = ''; state.attentionNotes = {}; state.transcript = []; state.stage = 3; render();
  } catch (error) { toast(error.message); }
  finally { stop(); }
}

function updatePlaybackUi() {
  if (state.stage !== 4) return;
  const button = document.querySelector('[data-action="toggle-play"]');
  if (button) {
    button.textContent = playback.playing ? '■ 정지' : '▶ 재생';
    button.classList.toggle('playing', playback.playing);
    button.setAttribute('aria-pressed', String(playback.playing));
  }
  const status = document.querySelector('#simulation-status');
  if (status) status.textContent = playback.pendingDirection ? '마스터 요청이 다음 장면에 반영됩니다' : playback.inFlight ? '교사와 학생의 반응을 생성 중입니다' : playback.playing ? '재생 중 · AI 대화가 이어집니다' : '일시정지 상태입니다';
  const next = document.querySelector('[data-action="next-scene"]');
  if (next) next.disabled = playback.playing || playback.inFlight;
}

function appendTurn(turn) {
  state.transcript.push(turn);
  quietLog('simulation_turn', { pointId:state.points[state.pointIndex]?.id, turn });
  const list = document.querySelector('.transcript');
  const scroll = document.querySelector('.stage-scroll');
  if (!list || !scroll) return;
  const nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 260;
  list.insertAdjacentHTML('beforeend', turnMarkup(turn));
  if (nearBottom) list.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function waitForPace(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('중단됨', 'AbortError'));
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('중단됨', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function runSimulationCycle(direction = '') {
  const controller = new AbortController();
  playback.controller = controller;
  playback.inFlight = true;
  updatePlaybackUi();
  try {
    await apiStream('simulate-stream', {
      plan:state.plan, context:state.context, teacher:state.teacher,
      students:state.students, point:{ ...state.points[state.pointIndex], teacherNote:state.attentionNote },
      transcript:state.transcript.slice(-12), direction
    }, async turn => {
      const remaining = playback.lastTurnAt ? Math.max(0, 1100 / playback.speed - (Date.now() - playback.lastTurnAt)) : 0;
      await waitForPace(remaining, controller.signal);
      if (controller.signal.aborted || state.stage !== 4) return;
      appendTurn(turn);
      playback.lastTurnAt = Date.now();
    }, controller.signal);
  } catch (error) {
    if (!controller.signal.aborted) {
      playback.playing = false;
      playback.manualRequested = false;
      toast(error.message || 'AI 시뮬레이션을 진행하지 못했습니다.');
    }
  } finally {
    if (playback.controller === controller) playback.controller = null;
    playback.inFlight = false;
    updatePlaybackUi();
  }
}
async function pumpSimulation() {
  if (playback.pumping) return;
  playback.pumping = true;
  try {
    while (state.stage === 4 && (playback.playing || playback.manualRequested)) {
      const direction = playback.pendingDirection;
      playback.pendingDirection = '';
      playback.manualRequested = false;
      updatePlaybackUi();
      await runSimulationCycle(direction);
      if (playback.playing && state.stage === 4) await new Promise(resolve => setTimeout(resolve, 450));
    }
  } finally {
    playback.pumping = false;
    if (state.stage === 4 && (playback.playing || playback.manualRequested)) queueMicrotask(pumpSimulation);
  }
}

function stopPlayback(clearDirection = false) {
  playback.playing = false;
  playback.manualRequested = false;
  if (clearDirection) playback.pendingDirection = '';
  playback.controller?.abort();
  updatePlaybackUi();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && playback.playing) stopPlayback();
});

function startPlayback() {
  if (state.stage !== 4) return;
  playback.playing = true;
  updatePlaybackUi();
  void pumpSimulation();
}

function sendDirection() {
  const input = document.querySelector('#direction');
  const direction = input?.value.trim();
  if (!direction) return;
  quietLog('master_chat_submitted', { direction, pointId:state.points[state.pointIndex]?.id, playing:playback.playing });
  playback.pendingDirection = [playback.pendingDirection, direction].filter(Boolean).join('\n').slice(-500);
  input.value = '';
  if (!playback.playing) playback.manualRequested = true;
  updatePlaybackUi();
  void pumpSimulation();
}

function updateVoiceUi() {
  if (state.stage !== 5) return;
  const button = document.querySelector('[data-action="toggle-voice"]');
  if (button) {
    button.textContent = voice.recognition ? '■ 음성 입력 종료' : '🎙 음성 입력 시작';
    button.classList.toggle('recording', !!voice.recognition);
    button.disabled = voice.processing;
  }
  const status = document.querySelector('#voice-status');
  if (status) status.textContent = voice.status;
}

function stopVoiceRecording(discard = false) {
  if (!voice.recognition) return;
  const recorder = voice.recognition;
  voice.recognition = null;
  voice.discard = discard;
  if (!discard) voice.processing = true;
  if (recorder.state !== 'inactive') recorder.stop();
  voice.status = discard ? '녹음을 취소했습니다.' : '녹음을 전사하고 핵심 내용을 정리하고 있습니다.';
  updateVoiceUi();
}

async function startVoiceRecording() {
  if (voice.recognition) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('이 브라우저는 녹음을 지원하지 않습니다. Chrome 또는 Edge에서 다시 시도해 주세요.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    voice.stream = stream;
    const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    voice.recognition = recorder;
    voice.chunks = [];
    voice.discard = false;
    recorder.ondataavailable = event => { if (event.data.size) voice.chunks.push(event.data); };
    recorder.onstop = async () => {
      const chunks = voice.chunks;
      voice.chunks = [];
      stream.getTracks().forEach(track => track.stop());
      voice.stream = null;
      if (voice.discard) { voice.processing = false; updateVoiceUi(); return; }
      try {
        const audio = new Blob(chunks, { type:recorder.mimeType || 'audio/webm' });
        if (!audio.size) throw new Error('녹음된 음성이 없습니다. 다시 시도해 주세요.');
        if (audio.size > 8 * 1024 * 1024) throw new Error('녹음은 8MB 이하로 해 주세요.');
        const result = await api('voice-feedback', { base64:await blobBase64(audio), mime:audio.type, existingFeedback:document.querySelector('#feedback')?.value || state.feedback });
        state.feedbackTranscript = [state.feedbackTranscript, result.transcript].filter(Boolean).join('\n');
        state.feedback = result.organized;
        voice.status = '음성을 전사하고 원문 근거만 정리했습니다. 아래에서 직접 수정할 수 있습니다.';
      } catch (error) { voice.status = error.message; toast(error.message); }
      finally { voice.processing = false; if (state.stage === 5) render(); }
    };
    recorder.start();
    voice.status = '녹음 중입니다. 말을 마치면 음성 입력 종료를 눌러 주세요.';
    updateVoiceUi();
  } catch (error) {
    voice.stream?.getTracks().forEach(track => track.stop());
    voice.stream = null;
    toast(error.name === 'NotAllowedError' ? '마이크 사용 권한을 허용해 주세요.' : '녹음을 시작하지 못했습니다.');
  }
}
async function makeProposals() {
  if (voice.recognition || voice.processing) return toast('음성 녹음과 정리가 끝난 뒤 수정안을 확인해 주세요.');
  state.feedback = document.querySelector('#feedback')?.value.trim() || '';
  if (state.feedback.length < 10) return toast('인상 깊었던 반응이나 바꾸고 싶은 점을 조금 더 적어주세요.');
  const stop = loading('AI 수정 제안을 준비하고 있어요', '교사 피드백과 시뮬레이션을 검토합니다.');
  try {
    await logEvent('feedback_submitted', { feedback:state.feedback, pointId:state.points[state.pointIndex]?.id, transcriptLength:state.transcript.length });
    const result = await api('feedback', { plan:state.plan, context:state.context, teacher:state.teacher, point:state.points[state.pointIndex], transcript:state.transcript.slice(-60), feedback:state.feedback });
    state.summary = result.summary; state.proposals = result.proposals; state.decisions = {};
    state.discussions = {}; state.discussionDrafts = {}; state.pendingRevision = {}; state.selectedProposalId = state.proposals[0]?.id || '';
    for (const p of state.proposals) state.decisions[p.id] = { status:'hold', text:p.revision };
    state.stage = 6; render();
  } catch (error) { toast(error.message); }
  finally { stop(); }
}

async function sendDiscussion() {
  if (state.stage !== 6 || state.discussionBusy) return;
  const id = state.selectedProposalId || state.proposals[0]?.id;
  const proposal = state.proposals.find(item => item.id === id);
  const question = (document.querySelector('#proposal-question')?.value || '').trim();
  if (!proposal || question.length < 2) return toast('선택한 제안에 대한 질문을 적어 주세요.');
  const history = (state.discussions[id] || []).slice(-12);
  state.discussions[id] = [...(state.discussions[id] || []), { role:'teacher', text:question }];
  state.discussionDrafts[id] = '';
  state.discussionBusy = true;
  quietLog('proposal_discussion_question', { proposalId:id, question });
  rerenderPreservingScroll(true);
  try {
    const answer = await api('proposal-discuss', {
      plan:state.plan, context:state.context, teacher:state.teacher,
      point:state.points[state.pointIndex], feedback:state.feedback,
      proposal, history, question
    });
    state.discussions[id].push({ role:'assistant', text:answer.reply });
    if (answer.hasRevision && answer.candidateRevision?.trim() && answer.candidateRevision.trim() !== proposal.revision.trim()) {
      state.pendingRevision[id] = answer.candidateRevision.trim();
    }
    quietLog('proposal_discussion_answer', { proposalId:id, reply:answer.reply, candidateRevision:state.pendingRevision[id] || '' });
  } catch (error) { toast(error.message); }
  finally { state.discussionBusy = false; rerenderPreservingScroll(true); }
}

function applyDiscussionRevision() {
  const id = state.selectedProposalId;
  const revision = state.pendingRevision[id];
  const proposal = state.proposals.find(item => item.id === id);
  if (!revision || !proposal) return;
  proposal.revision = revision;
  if (state.decisions[id]) state.decisions[id].text = revision;
  delete state.pendingRevision[id];
  quietLog('proposal_discussion_revision_applied', { proposalId:id, revision });
  rerenderPreservingScroll(true);
  toast('수정 제안에 반영했습니다. 최종 계획서에 포함하려면 「반영」을 선택해 주세요.', false);
}

async function makeFinal() {
  const pendingId = Object.keys(state.pendingRevision).find(id => state.pendingRevision[id]);
  if (pendingId) {
    state.selectedProposalId = pendingId;
    rerenderPreservingScroll(true);
    return toast('토론에서 나온 변경안을 제안에 반영할지 먼저 선택해 주세요.');
  }
  const approved = state.proposals.flatMap(p => {
    const d = state.decisions[p.id];
    return d?.status === 'apply' || d?.status === 'revise' ? [{ title:p.title, revision:d.status === 'revise' ? d.text : p.revision }] : [];
  });
  if (approved.some(p => !p.revision?.trim())) return toast('수정 후 반영할 내용을 입력해 주세요.');
  const stop = loading('수업계획서를 수정하고 있어요', '승인한 내용만 반영해 After 버전을 작성합니다.');
  try {
    await logEvent('final_requested', { approved, feedback:state.feedback });
    state.final = await api('final', { plan:state.plan, layout:state.formattedBefore, context:state.context, teacher:state.teacher, students:state.students, transcript:state.transcript, feedback:state.feedback, approved });
    await logEvent('final_generated', { title:state.final.title, revisedPlan:state.final.revisedPlan, changeLog:state.final.changeLog, sessionExamples:state.final.sessionExamples, studentOpinions:state.final.studentOpinions });
    state.view = 'after'; state.stage = 7; render();
  } catch (error) { toast(error.message); }
  finally { stop(); }
}

function download() {
  if (!state.final) return;
  quietLog('final_downloaded', { filename:state.filename });
  const blob = new Blob(['\ufeff' + state.final.revisedPlan], { type:'text/markdown;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = (state.filename.replace(/\.[^.]+$/, '') || '수업계획서') + '_수정본.md';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

app.addEventListener('change', event => {
  if (event.target.id === 'file-input') setFile(event.target.files[0]);
  if (event.target.id === 'chat-speed') quietLog('simulation_speed_changed', { speed:playback.speed });
  if (event.target.closest('#context-form')) state.context = readContextForm(event.target.form);
});

app.addEventListener('input', event => {
  if (event.target.id === 'access-code') accessCode = event.target.value.trim();
  if (event.target.id === 'feedback') state.feedback = event.target.value;
  if (event.target.id === 'proposal-question') state.discussionDrafts[state.selectedProposalId] = event.target.value;
  if (event.target.dataset.revision) state.decisions[event.target.dataset.revision].text = event.target.value;
  if (event.target.id === 'attention-note') { state.attentionNote = event.target.value; state.attentionNotes[state.points[state.pointIndex]?.id] = state.attentionNote; }
  if (event.target.id === 'custom-point') state.customPointDraft = event.target.value;
  if (event.target.id === 'chat-speed') {
    playback.speed = speedSteps[Number(event.target.value)];
    document.querySelector('#speed-value').textContent = `${playback.speed.toFixed(1)}×`;
  }
  if (event.target.closest('#context-form')) state.context = readContextForm(event.target.form);
});

app.addEventListener('submit', event => {
  if (event.target.id === 'context-form') { event.preventDefault(); submitContext(event.target); }
});

app.addEventListener('keydown', event => {
  if (event.target.id === 'direction' && event.key === 'Enter') {
    event.preventDefault(); sendDirection();
  }
  if (event.target.id === 'proposal-question' && event.key === 'Enter') {
    event.preventDefault(); void sendDiscussion();
  }
});

app.addEventListener('click', event => {
  const point = event.target.closest('[data-point]');
  if (point) { state.pointIndex = Number(point.dataset.point); state.attentionNote = state.attentionNotes[state.points[state.pointIndex]?.id] || ''; quietLog('attention_selected', { pointId:state.points[state.pointIndex]?.id, note:state.attentionNote }); render(); return; }
  const decision = event.target.closest('[data-decision]');
  if (decision) { state.decisions[decision.dataset.id].status = decision.dataset.decision; quietLog('proposal_decision', { proposalId:decision.dataset.id, decision:decision.dataset.decision, text:state.decisions[decision.dataset.id].text }); rerenderPreservingScroll(); return; }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  quietLog('button_clicked', { action });
  if (action === 'home' || action === 'new') { event.preventDefault(); if (state.stage > 1 && !confirm('현재 작업을 지우고 새 계획서를 시작할까요?')) return; stopPlayback(true); stopVoiceRecording(true); location.reload(); }
  else if (action === 'remove-file') { state.file = null; render(); }
  else if (action === 'upload') upload();
  else if (action === 'sample') { state.file = null; void upload(); }
  else if (action === 'add-custom-point') {
    const text = document.querySelector('#custom-point')?.value.trim() || '';
    if (text.length < 5) return toast('살펴볼 지점을 조금 더 구체적으로 적어 주세요.');
    const point = { id:`teacher-${crypto.randomUUID()}`, quote:state.plan.includes(text) ? text : '', title:truncate(text, 42), reason:'교사가 직접 지정한 탐색 지점입니다.', possibleResponses:'학생의 이해·질문·참여', questionToExplore:text };
    state.points.push(point); state.pointIndex = state.points.length - 1; state.attentionNote = ''; state.customPointDraft = ''; render();
  }
  else if (action === 'add-persona') {
    state.context = readContextForm(document.querySelector('#context-form'));
    if (state.context.studentPersonas.length >= 8) return toast('가상 학생은 최대 8명까지 설정할 수 있습니다.');
    state.context.studentPersonas.push(newPersona());
    quietLog('student_persona_added', { count:state.context.studentPersonas.length });
    render();
    document.querySelector('.persona-editor:last-child')?.scrollIntoView({ block:'nearest' });
  }
  else if (action === 'remove-persona') {
    state.context = readContextForm(document.querySelector('#context-form'));
    if (state.context.studentPersonas.length <= 1) return;
    state.context.studentPersonas = state.context.studentPersonas.filter(persona => persona.id !== event.target.closest('[data-id]')?.dataset.id);
    quietLog('student_persona_removed', { count:state.context.studentPersonas.length });
    render();
  }
  else if (action === 'back-context') { state.stage = 2; render(); }
  else if (action === 'start-simulation') { quietLog('simulation_started', { pointId:state.points[state.pointIndex]?.id, note:state.attentionNote }); stopPlayback(true); state.transcript = []; playback.lastTurnAt = 0; playback.pendingDirection = state.attentionNote; state.stage = 4; playback.playing = true; render(); void pumpSimulation(); }
  else if (action === 'back-attention') { stopPlayback(true); state.stage = 3; render(); }
  else if (action === 'toggle-play') { quietLog(playback.playing ? 'simulation_paused' : 'simulation_resumed', { pointId:state.points[state.pointIndex]?.id, transcriptLength:state.transcript.length }); playback.playing ? stopPlayback() : startPlayback(); }
  else if (action === 'next-scene') { if (!playback.playing && !playback.inFlight) { playback.manualRequested = true; void pumpSimulation(); } }
  else if (action === 'send-direction') sendDirection();
  else if (action === 'to-feedback') { stopPlayback(true); state.stage = 5; render(); }
  else if (action === 'toggle-voice') { voice.recognition ? stopVoiceRecording() : void startVoiceRecording(); }
  else if (action === 'back-simulation') { if (voice.recognition || voice.processing) return toast('녹음과 정리가 끝난 뒤 시뮬레이션으로 돌아가 주세요.'); state.stage = 4; render(); }
  else if (action === 'make-proposals') makeProposals();
  else if (action === 'discuss-proposal') { state.selectedProposalId = event.target.closest('[data-id]').dataset.id; quietLog('proposal_discussion_selected', { proposalId:state.selectedProposalId }); rerenderPreservingScroll(true); document.querySelector('#proposal-question')?.focus(); }
  else if (action === 'send-discussion') void sendDiscussion();
  else if (action === 'apply-discussion') applyDiscussionRevision();
  else if (action === 'dismiss-discussion') { const id = state.selectedProposalId; quietLog('proposal_discussion_revision_deferred', { proposalId:id, revision:state.pendingRevision[id] }); delete state.pendingRevision[id]; rerenderPreservingScroll(true); }
  else if (action === 'back-feedback') { state.stage = 5; render(); }
  else if (action === 'make-final') makeFinal();
  else if (action === 'back-proposals') { state.stage = 6; render(); }
  else if (action === 'view-before') { state.view = 'before'; render(); }
  else if (action === 'view-after') { state.view = 'after'; if (state.planMode === 'pdf') state.planMode = 'formatted'; render(); }
  else if (action === 'mode-formatted') { state.planMode = 'formatted'; render(); }
  else if (action === 'mode-raw') { state.planMode = 'raw'; render(); }
  else if (action === 'mode-pdf') { state.planMode = 'pdf'; render(); }
  else if (action === 'download') download();
});

window.addEventListener('pagehide', () => { stopPlayback(true); stopVoiceRecording(true); if (state.originalPdfUrl) URL.revokeObjectURL(state.originalPdfUrl); });

render();
