const comparable = value => String(value ?? '').replace(/\s+/g, '');

export function groundDraftLayout(layout, sourceText) {
  const source = comparable(sourceText);
  let removedCount = 0;
  let acceptedCount = 0;
  const keep = value => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (source.includes(comparable(text))) {
      acceptedCount++;
      return text;
    }
    removedCount++;
    return '';
  };
  const identity = Object.fromEntries(Object.entries(layout?.identity || {}).map(([key, value]) => [key, keep(value)]));
  const objectives = (layout?.objectives || []).map(item => ({ label:keep(item.label), text:keep(item.text) })).filter(item => item.text);
  const evaluation = (layout?.evaluation || []).map(item => ({
    criterion:keep(item.criterion), high:keep(item.high), middle:keep(item.middle), low:keep(item.low)
  })).filter(item => Object.values(item).some(Boolean));
  const flow = (layout?.flow || []).map(group => ({
    label:keep(group.label), duration:keep(group.duration),
    steps:(group.steps || []).map(step => ({ stage:keep(step.stage), content:keep(step.content), tool:keep(step.tool) })).filter(step => Object.values(step).some(Boolean))
  })).filter(group => group.steps.length);
  const notes = (layout?.notes || []).map(note => ({
    heading:keep(note.heading),
    paragraphs:(note.paragraphs || []).map(keep).filter(Boolean),
    items:(note.items || []).map(keep).filter(Boolean)
  })).filter(note => note.paragraphs.length || note.items.length);
  return { layout:{ title:keep(layout?.title), identity, objectives, evaluation, flow, notes }, acceptedCount, removedCount };
}
