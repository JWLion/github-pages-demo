const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

export function readContextForm(form) {
  const data = Object.fromEntries(new FormData(form));
  data.studentPersonas = [...form.querySelectorAll('[data-persona-card]')].map(card => ({
    id:card.dataset.personaId,
    keywords:[...card.querySelectorAll('[data-persona-keyword]:checked')].map(input => input.value),
    description:card.querySelector('[data-persona-description]')?.value.trim() || ''
  }));
  return data;
}

export function renderContextStage(context, keywordOptions) {
  const c = context || {};
  const personas = Array.isArray(c.studentPersonas) ? c.studentPersonas : [];
  const option = (value, current) => `<option value="${esc(value)}" ${current === value ? 'selected' : ''}>${esc(value)}</option>`;
  return `<div class="stage-scroll context-scroll">
    <div class="stage-overline">STEP 02 · CONTEXT</div>
    <h2 class="stage-heading">이 수업의 맥락을 알려주세요</h2>
    <p class="stage-desc">교사의 수업 방식과 시뮬레이션에 등장할 가상 학생을 각각 설정할 수 있습니다.</p>
    <form id="context-form">
      <div class="form-section"><h3><span class="section-number">01</span> 기본 정보</h3>
        <div class="field-grid">
          <div class="field"><label for="grade">학년 / 대상</label><input id="grade" name="grade" placeholder="예: 중학교 2학년" value="${esc(c.grade || '')}"></div>
          <div class="field"><label for="subject">과목 / 단원</label><input id="subject" name="subject" placeholder="예: 과학 · 물질의 상태" value="${esc(c.subject || '')}"></div>
          <div class="field"><label for="duration">수업 시간</label><input id="duration" name="duration" placeholder="예: 45분" value="${esc(c.duration || '')}"></div>
          <div class="field"><label for="classSize">학생 수</label><input id="classSize" name="classSize" placeholder="예: 28명" value="${esc(c.classSize || '')}"></div>
        </div>
      </div>
      <div class="form-section"><h3><span class="section-number">02</span> 수업 환경</h3>
        <div class="field-grid">
          <div class="field"><label for="wifi">인터넷 환경</label><select id="wifi" name="wifi"><option value="">선택해 주세요</option>${['사용 가능','제한적','사용 어려움'].map(value => option(value, c.wifi)).join('')}</select></div>
          <div class="field"><label for="devices">기기 사용</label><select id="devices" name="devices"><option value="">선택해 주세요</option>${['학생 개인 기기','모둠별 기기','교사 기기만','기기 없음'].map(value => option(value, c.devices)).join('')}</select></div>
        </div>
        <div class="field"><label for="resources">활용 가능한 자원</label><input id="resources" name="resources" placeholder="예: 빔 프로젝터, 활동지" value="${esc(c.resources || '')}"></div>
      </div>
      <div class="form-section"><h3><span class="section-number">03</span> 교사 페르소나 설정</h3>
        <p class="persona-help">평소 선생님의 스타일을 알려주세요.</p>
        <div class="field"><label for="teachingStyle">평소 수업 방식과 말투</label><textarea id="teachingStyle" name="teachingStyle" placeholder="예: 일상 사례로 시작하고, 질문을 통해 개념을 이끌어냅니다.">${esc(c.teachingStyle || '')}</textarea></div>
        <div class="field"><label for="teacherPriorities">수업에서 지키고 싶은 원칙</label><textarea id="teacherPriorities" name="teacherPriorities" placeholder="예: 학생이 직접 자료를 해석하도록 기다립니다.">${esc(c.teacherPriorities || '')}</textarea></div>
      </div>
      <div class="form-section"><h3><span class="section-number">04</span> 학생 페르소나 설정</h3>
        <p class="persona-help">여기서 만든 가상 학생이 시뮬레이션에 등장합니다. 각 학생의 키워드를 고르고, 필요하면 특징을 자세히 적어 주세요.</p>
        <div class="field"><label for="studentContext">학급 전체의 사전지식과 참여 특성</label><textarea id="studentContext" name="studentContext" placeholder="예: 데이터 분석 경험은 적지만 사회 문제에 대한 관심은 높습니다.">${esc(c.studentContext || '')}</textarea><div class="field-help">실제 학생의 이름이나 민감한 개인정보는 입력하지 않아도 됩니다.</div></div>
        <div class="persona-editor-list">${personas.map((persona, index) => `<section class="persona-editor" data-persona-card data-persona-id="${esc(persona.id)}">
          <div class="persona-editor-head"><strong>가상 학생 ${index + 1}</strong><button type="button" class="text-button" data-action="remove-persona" data-id="${esc(persona.id)}" ${personas.length === 1 ? 'disabled' : ''}>삭제</button></div>
          <div class="field"><label>성향 키워드 · 여러 개 선택 가능</label><div class="persona-keywords">${keywordOptions.map(keyword => `<label class="keyword-choice"><input type="checkbox" data-persona-keyword value="${esc(keyword)}" ${(persona.keywords || []).includes(keyword) ? 'checked' : ''}><span>${esc(keyword)}</span></label>`).join('')}</div></div>
          <div class="field"><label for="persona-${index}">페르소나 자세히 기술하기</label><textarea id="persona-${index}" data-persona-description placeholder="예: 숫자는 잘 읽지만 국제 뉴스와 경제 제재의 관계는 아직 낯설어합니다.">${esc(persona.description || '')}</textarea></div>
        </section>`).join('')}</div>
        <button type="button" class="secondary add-persona" data-action="add-persona" ${personas.length >= 8 ? 'disabled' : ''}>+ 학생 페르소나 추가</button>
        <p class="field-help">시뮬레이션에는 최대 8명의 가상 학생을 설정할 수 있습니다.</p>
      </div>
    </form>
  </div><div class="panel-footer"><span class="footer-hint">입력 내용은 다음 단계의 시뮬레이션 조건이 됩니다.</span><button type="submit" form="context-form" class="primary">주의 지점 탐색하기 →</button></div>`;
}
