import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

const origin = 'https://demo.github.io';
const env = { OPENAI_API_KEY:'test-secret', DEMO_ACCESS_CODE:'abcdefghijklmnop', ALLOWED_ORIGINS:origin, OPENAI_MODEL:'gpt-4o-mini' };
const call = (path, body, code = env.DEMO_ACCESS_CODE) => worker.fetch(new Request(`https://worker.example${path}`, {
  method:body ? 'POST' : 'GET', headers:{ Origin:origin, 'x-demo-access-code':code, ...(body ? { 'content-type':'application/json' } : {}) },
  ...(body ? { body:JSON.stringify(body) } : {})
}), env);
const response = text => new Response(JSON.stringify({ output:[{ content:[{ type:'output_text', text }] }] }), { headers:{ 'content-type':'application/json' } });

test('access and CORS reject unauthorized calls', async () => {
  assert.equal((await call('/api/health', null, 'wrong')).status, 401);
  const outside = await worker.fetch(new Request('https://worker.example/api/health', { headers:{ Origin:'https://other.example', 'x-demo-access-code':env.DEMO_ACCESS_CODE } }), env);
  assert.equal(outside.status, 403);
  assert.equal((await call('/api/health')).status, 200);
});

test('PDF content is extracted, grounded and never stored in model state', async () => {
  const original = globalThis.fetch;
  const source = '수업명: 물의 순환\n도입: 물방울 관찰하기\n전개: 증발과 응결을 설명한다.';
  const layout = { title:'물의 순환', identity:{ region:'', school:'', author:'', lessonTitle:'물의 순환', schoolLevel:'', subject:'', unit:'', topic:'', difficulty:'', lessonType:'', method:'', tools:'', sessions:'', duration:'' }, objectives:[], evaluation:[], flow:[{ label:'', duration:'', steps:[{ stage:'도입', content:'물방울 관찰하기', tool:'' }] }], notes:[] };
  let calls = 0;
  globalThis.fetch = async (_, options) => {
    calls++;
    const input = JSON.parse(options.body);
    assert.equal(input.store, false);
    assert.equal(options.headers.authorization, `Bearer ${env.OPENAI_API_KEY}`);
    if (calls === 1) { assert.equal(input.input[0].content[0].type, 'input_file'); return response(source); }
    return response(JSON.stringify(layout));
  };
  try {
    const result = await call('/api/upload', { name:'lesson.pdf', base64:btoa('%PDF-1.4') });
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.text, source);
    assert.equal(body.formatted.identity.lessonTitle, '물의 순환');
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test('audio is transcribed then organized from quoted source only', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/audio/transcriptions')) return new Response(JSON.stringify({ text:'그래프 축을 먼저 설명하고 싶어요.' }), { headers:{ 'content-type':'application/json' } });
    assert.equal(JSON.parse(options.body).store, false);
    return response(JSON.stringify({ points:[{ text:'그래프 축을 먼저 설명하기', sourceQuote:'그래프 축을 먼저 설명하고 싶어요.' }, { text:'새 활동 추가', sourceQuote:'원문에 없는 문장' }] }));
  };
  try {
    const result = await call('/api/voice-feedback', { base64:btoa('fake audio'), mime:'audio/webm', existingFeedback:'도입을 유지하기' });
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.match(body.organized, /그래프 축을 먼저 설명하기/);
    assert.doesNotMatch(body.organized, /새 활동 추가/);
  } finally { globalThis.fetch = original; }
});

test('simulation streams separate teacher and student turns', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_, options) => {
    const name = JSON.parse(options.body).text.format.name;
    return response(JSON.stringify(name === 'teacherTurn' ? { line:'자료에서 무엇이 보이나요?', intention:'관찰 유도' } : { line:'축의 단위가 헷갈려요.', signal:'자료 읽기 질문' }));
  };
  try {
    const result = await call('/api/simulate-stream', { plan:'수업명: 물의 순환. 물의 변화를 자료로 살펴보는 수업입니다.', context:{}, teacher:{ name:'교사' }, students:[{ id:'s1', name:'김수현' }], point:{ id:'p1' }, transcript:[] });
    assert.equal(result.status, 200);
    const events = (await result.text()).trim().split('\n\n').map(line => JSON.parse(line.slice(6)));
    assert.deepEqual(events.map(item => item.type), ['turn','turn','done']);
    assert.equal(events[1].turn.studentId, 's1');
  } finally { globalThis.fetch = original; }
});

test('teacher feedback, discussion, and approved final changes remain distinct', async () => {
  const original = globalThis.fetch;
  const plan = '수업명: 물의 순환\n도입: 물방울을 관찰한다.\n전개: 증발과 응결을 설명한다.';
  const revised = `${plan}\n정교화 결과: 축과 단위를 먼저 확인한다.`;
  globalThis.fetch = async (_, options) => {
    const input = JSON.parse(options.body);
    assert.equal(input.store, false);
    const name = input.text.format.name;
    if (name === 'feedback') return response(JSON.stringify({ summary:'AI 제안', proposals:[{ id:'a1', title:'자료 안내', reason:'읽기 지원', expectedEffect:'이해', revision:'축과 단위를 먼저 확인한다.' }] }));
    if (name === 'discussion') return response(JSON.stringify({ reply:'구체적인 그래프 사례를 제시할 수 있습니다.', hasRevision:true, candidateRevision:'축과 단위를 먼저 확인한다.' }));
    if (name === 'final') {
      const data = JSON.parse(input.input);
      assert.equal(data.teacherFeedback, '도입 활동은 그대로 유지한다.');
      assert.equal(data.approved.length, 1);
      return response(JSON.stringify({ title:'물의 순환', revisedPlan:revised, changeLog:['자료 안내'], sessionExamples:[{ session:'1차시', example:'물방울 관찰', teachingUse:'도입에서 사용' }], studentOpinions:[{ studentId:'s1', name:'김수현', bullets:['축이 헷갈린다고 질문했다.'] }] }));
    }
    if (name === 'layout') return response(JSON.stringify({ title:'물의 순환', identity:{ region:'', school:'', author:'', lessonTitle:'물의 순환', schoolLevel:'', subject:'', unit:'', topic:'', difficulty:'', lessonType:'', method:'', tools:'', sessions:'', duration:'' }, objectives:[], evaluation:[], flow:[], notes:[] }));
    throw Error(`unexpected model call ${name}`);
  };
  try {
    const feedback = await (await call('/api/feedback', { plan, feedback:'도입 활동은 그대로 유지한다.', context:{} })).json();
    assert.equal(feedback.proposals.length, 1);
    const discussion = await (await call('/api/proposal-discuss', { plan, proposal:feedback.proposals[0], question:'그래프 사례를 반영해줘', history:[] })).json();
    assert.equal(discussion.hasRevision, true);
    const final = await (await call('/api/final', { plan, feedback:'도입 활동은 그대로 유지한다.', approved:[feedback.proposals[0]], students:[{ id:'s1', name:'김수현' }], transcript:[{ studentId:'s1', text:'축이 헷갈려요.' }] })).json();
    assert.match(final.revisedPlan, /학생들의 예상 의견/);
    assert.equal(final.studentOpinions[0].name, '김수현');
    assert.equal(final.formatted.identity.lessonTitle, '물의 순환');
  } finally { globalThis.fetch = original; }
});
