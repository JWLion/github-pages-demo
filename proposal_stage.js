const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);

export function renderProposalStage(state) {
  const selectedId = state.selectedProposalId || state.proposals[0]?.id || '';
  const selected = state.proposals.find(item => item.id === selectedId) || state.proposals[0];
  const history = state.discussions?.[selectedId] || [];
  const pending = state.pendingRevision?.[selectedId] || '';
  return `<div class="stage-scroll proposal-scroll">
    <div class="stage-overline">STEP 06 · REVIEW</div>
    <h2 class="stage-heading">교사 의견과 AI 제안을 확인해 주세요</h2>
    <p class="stage-desc">교사가 남긴 피드백과 AI가 추가로 제안한 내용을 구분했습니다. 각 제안을 토론하고, 최종 계획서에 반영할지 선택하세요.</p>
    <section class="teacher-feedback-review"><div class="review-label">교사 피드백 · 5단계에서 확인한 내용</div><div class="teacher-feedback-text">${esc(state.feedback)}</div></section>
    <div class="review-label ai-label">AI 수정 제안</div>
    <div class="summary-box">${esc(state.summary)}</div>
    ${state.proposals.map((proposal, index) => {
      const decision = state.decisions[proposal.id] || { status:'hold', text:proposal.revision };
      return `<article class="proposal ${selectedId === proposal.id ? 'selected-proposal' : ''}" data-proposal="${esc(proposal.id)}">
        <div class="proposal-top"><span class="card-index">SUGGESTION ${String(index + 1).padStart(2,'0')}${state.pendingRevision?.[proposal.id] ? ' · 변경안 확인 필요' : ''}</span><button type="button" class="discuss-pick" data-action="discuss-proposal" data-id="${esc(proposal.id)}">${selectedId === proposal.id ? '토론 중' : '이 제안 토론'}</button></div>
        <h3>${esc(proposal.title)}</h3>
        <p><b>제안 이유</b> · ${esc(proposal.reason)}</p>
        <p><b>예상 효과</b> · ${esc(proposal.expectedEffect)}</p>
        <div class="revision">${esc(proposal.revision)}</div>
        <div class="decision-row"><button type="button" class="decision ${decision.status === 'apply' ? 'active' : ''}" data-decision="apply" data-id="${esc(proposal.id)}">반영</button><button type="button" class="decision ${decision.status === 'revise' ? 'active' : ''}" data-decision="revise" data-id="${esc(proposal.id)}">수정 후 반영</button><button type="button" class="decision ${decision.status === 'hold' ? 'active' : ''}" data-decision="hold" data-id="${esc(proposal.id)}">보류</button></div>
        ${decision.status === 'revise' ? `<textarea data-revision="${esc(proposal.id)}" aria-label="${esc(proposal.title)} 수정 내용" placeholder="반영할 내용을 직접 고쳐 적어주세요">${esc(decision.text || proposal.revision)}</textarea>` : ''}
      </article>`;
    }).join('')}
  </div>
  <section class="proposal-discussion" aria-label="제안 내용 토론하기">
    <div class="discussion-heading"><div><h3>제안 내용 토론하기</h3><p>${selected ? `선택한 제안 · ${esc(selected.title)}` : '위에서 제안을 선택해 주세요.'}</p></div><span>AI와 구체화</span></div>
    <div class="discussion-messages" aria-live="polite">${history.length ? history.map(message => `<div class="discussion-message ${message.role === 'teacher' ? 'teacher' : 'assistant'}"><strong>${message.role === 'teacher' ? '교사' : 'AI'}</strong><p>${esc(message.text)}</p></div>`).join('') : '<p class="discussion-empty">예: “이 제안에 맞는 구체적인 수업 사례를 알려줘.”</p>'}${state.discussionBusy ? '<p class="discussion-wait">답변을 만들고 있습니다…</p>' : ''}</div>
    ${pending ? `<div class="discussion-confirm"><strong>본 내용을 안건에 반영할까요?</strong><p>${esc(pending)}</p><div><button type="button" class="secondary" data-action="dismiss-discussion">나중에</button><button type="button" class="primary inline" data-action="apply-discussion">제안에 반영</button></div></div>` : ''}
    <div class="discussion-input-row"><input id="proposal-question" class="chat-input" aria-label="선택한 제안에 대해 질문하기" placeholder="사례나 세부 내용을 질문해 보세요" value="${esc(state.discussionDrafts?.[selectedId] || '')}" ${state.discussionBusy || !selected ? 'disabled' : ''}><button type="button" data-action="send-discussion" ${state.discussionBusy || !selected ? 'disabled' : ''} aria-label="질문 보내기">↗</button></div>
  </section>
  <div class="panel-footer"><button class="text-button" type="button" data-action="back-feedback">← 피드백 수정</button><button class="primary" type="button" data-action="make-final">최종 계획서 만들기 →</button></div>`;
}
