const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const empty = value => String(value ?? '').trim() ? esc(value) : '&nbsp;';

export function fallbackLessonTemplate(raw, filename = '') {
  const lines = String(raw || '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^\[페이지\s*\d+\]$/.test(line));
  const identity = {
    region:'', school:'', author:'', lessonTitle:filename.replace(/\.[^.]+$/, ''),
    schoolLevel:'', subject:'', unit:'', topic:'', difficulty:'', lessonType:'',
    method:'', tools:'', sessions:'', duration:''
  };
  const labels = {
    '소속권역':'region', '소속학교':'school', '이름':'author', '수업명':'lessonTitle',
    '학교급':'schoolLevel', '교과':'subject', '단원':'unit', '주제':'topic',
    '난이도':'difficulty', '수업 유형':'lessonType', '수업 방법':'method',
    '활용할 AI 디지털 도구':'tools', '차시':'sessions', '수업 시간':'duration'
  };
  const unclassified = [];
  const objectives = [];
  const steps = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/^#{1,4}\s*/, '');
    const pair = line.match(/^([^:：]{2,24})[:：]\s*(.+)$/);
    if (pair && labels[pair[1].trim()]) identity[labels[pair[1].trim()]] = pair[2].trim();
    else if (pair && /^(성취기준|인공지능 관련 내용|교과\+AI융합|교과\+AI융합)$/.test(pair[1].trim())) objectives.push({ label:pair[1].trim(), text:pair[2].trim() });
    else if (pair && /^(도입|전개|마무리|정리)$/.test(pair[1].trim())) steps.push({ stage:pair[1].trim(), content:pair[2].trim(), tool:'' });
    else if (labels[line] && lines[index + 1]) identity[labels[line]] = lines[++index];
    else unclassified.push(line);
  }
  return {
    title:identity.lessonTitle, identity, objectives, evaluation:[], flow:steps.length ? [{ label:identity.sessions, duration:identity.duration, steps }] : [],
    notes:unclassified.length ? [{ heading:'원문 내용', paragraphs:unclassified, items:[] }] : []
  };
}

export function renderLessonTemplate(layout, highlight = empty, extras = null) {
  const identity = layout?.identity || {};
  const cell = value => String(value ?? '').trim() ? highlight(value) : '&nbsp;';
  const row = (label, value, label2, value2, label3, value3) => `<tr><th>${esc(label)}</th><td>${cell(value)}</td><th>${esc(label2)}</th><td>${cell(value2)}</td>${label3 ? `<th>${esc(label3)}</th><td>${cell(value3)}</td>` : ''}</tr>`;
  const objectives = Array.isArray(layout?.objectives) && layout.objectives.length ? layout.objectives : [{ label:'성취기준', text:'' }, { label:'인공지능 관련 내용', text:'' }, { label:'교과+AI융합', text:'' }];
  const evaluation = Array.isArray(layout?.evaluation) && layout.evaluation.length ? layout.evaluation : [{ criterion:'', high:'', middle:'', low:'' }];
  const flow = Array.isArray(layout?.flow) && layout.flow.length ? layout.flow : [{ label:'', duration:'', steps:[{ stage:'', content:'', tool:'' }] }];
  const notes = Array.isArray(layout?.notes) ? layout.notes : [];
  const sessionExamples = Array.isArray(extras?.sessionExamples) ? extras.sessionExamples : null;
  const studentOpinions = Array.isArray(extras?.studentOpinions) ? extras.studentOpinions : null;
  return `<div class="lesson-template">
    <div class="template-band template-main-band"><span aria-hidden="true">▤</span> AIEDAP AI 융합수업 지도안</div>
    <table class="template-table template-identity"><colgroup><col style="width:14%"><col style="width:19%"><col style="width:14%"><col style="width:19%"><col style="width:14%"><col style="width:20%"></colgroup><tbody>
      ${row('소속권역', identity.region, '소속학교', identity.school, '이름', identity.author)}
      <tr><th>수업명</th><td colspan="5">${cell(identity.lessonTitle || layout.title)}</td></tr>
      ${row('학교급', identity.schoolLevel, '교과', identity.subject, '단원', identity.unit)}
      <tr><th>주제</th><td colspan="3">${cell(identity.topic)}</td><th>난이도</th><td>${cell(identity.difficulty)}</td></tr>
      <tr><th>수업 유형</th><td colspan="2">${cell(identity.lessonType)}</td><th>수업 방식</th><td colspan="2">${cell(identity.method)}</td></tr>
      <tr><th>활용할 AI<br>디지털 도구</th><td colspan="5">${cell(identity.tools)}</td></tr>
      ${objectives.map((item, index) => `<tr>${index === 0 ? `<th rowspan="${objectives.length}">수업 목표</th>` : ''}<th colspan="2" class="template-subhead">${esc(item.label)}</th><td colspan="3">${cell(item.text)}</td></tr>`).join('')}
      <tr><th>차시</th><td colspan="2">${cell(identity.sessions)}</td><th>수업 시간</th><td colspan="2">${cell(identity.duration)}</td></tr>
    </tbody></table>
    <div class="template-band">✎ 평가 계획</div>
    <table class="template-table template-evaluation"><colgroup><col style="width:34%"><col style="width:22%"><col style="width:22%"><col style="width:22%"></colgroup><thead><tr><th rowspan="2">성취기준</th><th colspan="3">성취기준별 성취수준</th></tr><tr><th>상</th><th>중</th><th>하</th></tr></thead><tbody>${evaluation.map(item => `<tr><td>${cell(item.criterion)}</td><td>${cell(item.high)}</td><td>${cell(item.middle)}</td><td>${cell(item.low)}</td></tr>`).join('')}</tbody></table>
    <div class="template-band">☷ 수업흐름</div>
    ${flow.map(group => {
      const steps = Array.isArray(group.steps) && group.steps.length ? group.steps : [{ stage:'', content:'', tool:'' }];
      return `<table class="template-table template-flow"><colgroup><col style="width:14%"><col style="width:18%"><col style="width:50%"><col style="width:18%"></colgroup><thead><tr><th class="session-head">차시 · 시간</th><th>단계</th><th>수업 내용</th><th>활용할 AI<br>디지털 도구</th></tr></thead><tbody>${steps.map((step, index) => {
        const firstInStage = index === 0 || steps[index - 1].stage !== step.stage;
        let stageCount = 0;
        if (firstInStage) for (let i = index; i < steps.length && steps[i].stage === step.stage; i++) stageCount++;
        return `<tr>${index === 0 ? `<th rowspan="${steps.length}" class="session-cell">${cell([group.label, group.duration].filter(Boolean).join(' · '))}</th>` : ''}${firstInStage ? `<th rowspan="${stageCount}" class="template-subhead">${cell(step.stage)}</th>` : ''}<td>${cell(step.content)}</td><td>${cell(step.tool)}</td></tr>`;
      }).join('')}</tbody></table>`;
    }).join('')}
    ${sessionExamples ? `<div class="template-examples"><div class="template-band">차시별 소개 사례</div><table class="template-table"><colgroup><col style="width:20%"><col style="width:42%"><col style="width:38%"></colgroup><thead><tr><th>차시</th><th>구체적인 사례</th><th>수업에서 활용</th></tr></thead><tbody>${sessionExamples.length ? sessionExamples.map(item => `<tr><th>${cell(item.session)}</th><td>${cell(item.example)}</td><td>${cell(item.teachingUse)}</td></tr>`).join('') : '<tr><td colspan="3">차시별 사례를 생성하지 못했습니다.</td></tr>'}</tbody></table></div>` : ''}
    <div class="template-notes"><h4>정교화 결과</h4>${notes.length ? notes.map(note => `<section><h5>${esc(note.heading)}</h5>${(note.paragraphs || []).map(text => `<p>${cell(text)}</p>`).join('')}${note.items?.length ? `<ul>${note.items.map(text => `<li>${cell(text)}</li>`).join('')}</ul>` : ''}</section>`).join('') : '<p class="template-empty">기록된 내용이 없습니다.</p>'}</div>
    ${studentOpinions ? `<section class="template-student-opinions"><h4>학생들의 예상 의견</h4><p class="template-opinion-intro">시뮬레이션에 등장한 가상 학생의 발화와 페르소나를 바탕으로 정리했습니다.</p>${studentOpinions.length ? studentOpinions.map(item => `<div class="template-opinion-card"><h5>${esc(item.name)}</h5><ul>${(item.bullets || []).map(bullet => `<li>${cell(bullet)}</li>`).join('')}</ul></div>`).join('') : '<p class="template-empty">표시할 학생 의견이 없습니다.</p>'}</section>` : ''}
  </div>`;
}
