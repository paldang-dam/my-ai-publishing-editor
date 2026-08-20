import { useEffect, useMemo, useState } from 'react'
import { api } from './lib/api'
import EditorHeader from './components/EditorHeader'
import SuggestionCard, { Suggestion } from './components/SuggestionCard'
type Doc = { id: number; original_text: string; created_at: string }
type Guideline = { id: number; title: string; content: string; is_enabled: number | boolean; created_at: string; updated_at: string }
const sample = '독자는 책을 읽으며 저자의 생각을 따라갑니다. 하지만 문장이 지나치게 길어지면 뜻을 한 번에 이해하기 어려울수 있습니다. 같은 경우에는 핵심을 먼저 밝히는 것이 좋습니다.'
export default function App() {
  const [text, setText] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [documentId, setDocumentId] = useState<number | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [guidelines, setGuidelines] = useState<Guideline[]>([])
  const [guidelineTitle, setGuidelineTitle] = useState('')
  const [guidelineContent, setGuidelineContent] = useState('')
  const [editingGuidelineId, setEditingGuidelineId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [guidelinesOpen, setGuidelinesOpen] = useState(false)
  const [guidelinesMessage, setGuidelinesMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const characters = text.replace(/\s/g, '').length
  const searchMatches = useMemo(() => {
    const query = searchTerm.trim()
    if (!query) return 0
    return text.split(query).length - 1
  }, [text, searchTerm])
  const highlightedText = useMemo(() => {
    const query = searchTerm.trim()
    if (!query || !text) return text
    const fragments = text.split(query)
    return fragments.map((fragment, index) => <span key={`${fragment}-${index}`}>{fragment}{index < fragments.length - 1 && <mark className="search-highlight">{query}</mark>}</span>)
  }, [text, searchTerm])
  const appliedText = useMemo(() => {
    return suggestions.filter(item => item.accepted).reduce((draft, item) => draft.replace(item.original_text, item.suggested_text), text)
  }, [text, suggestions])
  const acceptedCount = useMemo(() => suggestions.filter(item => item.accepted).length, [suggestions])
  const loadDocs = async () => {
    try { const res = await api('documents'); if (res.ok) setDocs(await res.json()) } catch { /* 기록은 비어 있어도 편집 가능 */ }
  }
  const loadGuidelines = async () => {
    try { const res = await api('guidelines'); if (res.ok) setGuidelines(await res.json()) } catch { /* 원칙은 없어도 검토 가능 */ }
  }
  useEffect(() => { loadDocs(); loadGuidelines() }, [])
  const resetGuidelineForm = () => {
    setGuidelineTitle(''); setGuidelineContent(''); setEditingGuidelineId(null)
  }
  const saveGuideline = async () => {
    setGuidelinesMessage('')
    if (!guidelineTitle.trim() || !guidelineContent.trim()) {
      setGuidelinesMessage('원칙 제목과 내용을 모두 입력해 주세요.')
      return
    }
    try {
      const path = editingGuidelineId ? `guidelines/${editingGuidelineId}` : 'guidelines'
      const res = await api(path, { method: editingGuidelineId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: guidelineTitle, content: guidelineContent }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || '저장하지 못했습니다.')
      await loadGuidelines(); resetGuidelineForm(); setGuidelinesMessage('편집 원칙을 저장했습니다.')
    } catch (e) { setGuidelinesMessage(e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.') }
  }
  const editGuideline = (item: Guideline) => {
    setEditingGuidelineId(item.id); setGuidelineTitle(item.title); setGuidelineContent(item.content); setGuidelinesMessage('')
  }
  const toggleGuideline = async (item: Guideline) => {
    const is_enabled = !Boolean(item.is_enabled)
    setGuidelines(prev => prev.map(guideline => guideline.id === item.id ? { ...guideline, is_enabled } : guideline))
    try {
      const res = await api(`guidelines/${item.id}/enabled`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_enabled }) })
      if (!res.ok) throw new Error('사용 상태를 저장하지 못했습니다.')
    } catch (e) {
      await loadGuidelines()
      setGuidelinesMessage(e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.')
    }
  }
  const deleteGuideline = async (id: number) => {
    if (!window.confirm('이 편집 원칙을 삭제할까요?')) return
    try {
      const res = await api(`guidelines/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('삭제하지 못했습니다.')
      if (editingGuidelineId === id) resetGuidelineForm()
      await loadGuidelines(); setGuidelinesMessage('편집 원칙을 삭제했습니다.')
    } catch (e) { setGuidelinesMessage(e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.') }
  }
  const deleteAllGuidelines = async () => {
    if (!window.confirm('편집 원칙을 모두 삭제할까요?')) return
    try {
      const res = await api('guidelines', { method: 'DELETE' })
      if (!res.ok) throw new Error('삭제하지 못했습니다.')
      setGuidelines([]); resetGuidelineForm(); setGuidelinesMessage('편집 원칙을 모두 삭제했습니다.')
    } catch (e) { setGuidelinesMessage(e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.') }
  }
  const review = async () => {
    if (!text.trim()) { setError('검토할 원고를 입력해 주세요.'); return }
    setLoading(true); setError('')
    try {
      const res = await api('documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || '검토를 준비하지 못했습니다.')
      setDocumentId(data.id); setSuggestions(data.suggestions); await loadDocs()
    } catch (e) { setError(e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.') } finally { setLoading(false) }
  }
  const openDocument = async (id: number) => {
    try {
      const res = await api(`documents/${id}`); const data = await res.json()
      if (!res.ok) throw new Error()
      setText(data.original_text); setDocumentId(data.id); setSuggestions(data.suggestions); setHistoryOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch { setError('기록을 불러오지 못했습니다.') }
  }
  const deleteDocument = async (id: number) => {
    if (!window.confirm('이 검토 기록과 제안 내용을 삭제할까요?')) return
    try {
      const res = await api(`documents/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('삭제하지 못했습니다.')
      if (documentId === id) { setDocumentId(null); setSuggestions([]); setText('') }
      await loadDocs()
    } catch { setError('기록을 삭제하지 못했습니다.') }
  }
  const deleteAllDocuments = async () => {
    if (!window.confirm('검토 기록과 제안 내용을 모두 삭제할까요?')) return
    try {
      const res = await api('documents', { method: 'DELETE' })
      if (!res.ok) throw new Error('삭제하지 못했습니다.')
      setDocs([]); setDocumentId(null); setSuggestions([]); setText(''); setHistoryOpen(false)
    } catch { setError('검토 기록을 모두 삭제하지 못했습니다.') }
  }
  const accept = async (id: number, accepted: boolean) => {
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, accepted } : s))
    try { await api(`suggestions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accepted }) }) } catch { setError('선택 상태를 저장하지 못했습니다.') }
  }
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value) } catch { setError('복사 기능을 사용할 수 없습니다.') } }
  return <div id="top"><EditorHeader savedCount={docs.length} onHistory={() => setHistoryOpen(true)} />
    <main>
      <section className="hero"><h1>편집자를 위한 교정기</h1><p>출판사별 표기와 문체 기준을 편집 원칙에 직접 등록해 주세요.</p></section>
      <section className="editor-panel" aria-label="원고 입력"><div className="panel-title"><div><h2>원고 입력</h2></div><div className="editor-meta"><span>{characters.toLocaleString()}자</span><button className="copy-text-button" onClick={() => copy(text)} disabled={!text} aria-label="입력한 원고 복사" title="원고 복사">📋</button><button className="clear-text-button" onClick={() => { setText(''); setError('') }} disabled={!text} aria-label="입력한 원고 비우기" title="원고 비우기">×</button></div></div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="다듬고 싶은 원고를 입력해 주세요." aria-label="검토할 원고" />
        <div className="text-search" aria-label="원고에서 찾기"><label htmlFor="text-search-input">원고에서 찾기</label><div className="search-control"><input id="text-search-input" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="찾을 글자나 단어를 입력해 주세요" aria-label="찾을 글자나 단어" />{searchTerm && <button className="clear-search-button" type="button" onClick={() => setSearchTerm('')} aria-label="찾기어 비우기" title="찾기어 비우기">×</button>}</div>{searchTerm.trim() && <span className="search-count">{searchMatches}곳</span>}</div>
        {searchTerm.trim() && <div className="search-preview" aria-live="polite"><p>{highlightedText}</p></div>}
        {error && <p className="inline-error">{error}</p>}
        <div className="editor-footer"><div className="footer-options"><button className="sample-button" onClick={() => setText(sample)}>예시 원고 불러오기</button><button className="guideline-button" onClick={() => { setGuidelinesOpen(true); setGuidelinesMessage('') }}>편집 원칙 {guidelines.length ? `${guidelines.length}개` : '입력'}</button></div><button className="review-button" disabled={loading} onClick={review}>{loading ? '문장을 살피는 중…' : '문장 다듬기'} <span>→</span></button></div>
      </section>
      <section className="results" aria-live="polite"><div className="results-heading"><div><h2>{documentId ? `검토한 문장 ${suggestions.length}개` : '제안 결과'}</h2></div>{documentId && <span className="count-chip">제안 {suggestions.length}개</span>}</div>
        {loading && <div className="state-box">문장을 차분히 살피고 있습니다.</div>}
        {!loading && !documentId && <div className="empty-state"><span>✦</span><p>원고를 입력하고 ‘문장 다듬기’를 누르면 문장별 제안이 이곳에 표시됩니다.</p></div>}
        {!loading && documentId && suggestions.length === 0 && <div className="state-box">교정 사항이 없습니다.</div>}
        <div className="suggestion-list">{suggestions.map((item, i) => <SuggestionCard key={item.id} item={item} index={i} onAccept={accept} />)}</div>
        {documentId && acceptedCount > 0 && <section className="applied-panel" aria-label="반영한 원고"><div className="applied-heading"><div><h2>반영한 원고</h2></div><button className="copy-history-button" onClick={() => copy(appliedText)} aria-label="반영한 원고 복사" title="반영한 원고 복사">📋</button></div><p className="applied-text">{appliedText}</p></section>}
      </section>
    </main>
    {guidelinesOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setGuidelinesOpen(false)}><section className="modal guidelines-modal" role="dialog" aria-modal="true" aria-label="편집 원칙" onMouseDown={e => e.stopPropagation()}><button className="close" onClick={() => setGuidelinesOpen(false)} aria-label="닫기">×</button><h2>편집 원칙</h2><p className="guidelines-intro">표기 통일과 공백 조정은 “기존 표현 → 권장 표현” 형식으로 작성하면 원고 검토에 반영됩니다.<br />예: 인공지능 → AI / 인공지능 → 인공 지능</p><div className="guideline-form"><input value={guidelineTitle} onChange={e => setGuidelineTitle(e.target.value)} maxLength={80} placeholder="원칙 제목 (예: 외래어 표기)" aria-label="원칙 제목" /><textarea className="guidelines-input" value={guidelineContent} onChange={e => setGuidelineContent(e.target.value)} maxLength={1000} placeholder="예: 기존 표현 → 권장 표현" aria-label="원칙 내용" /></div>{guidelinesMessage && <p className="guidelines-message">{guidelinesMessage}</p>}<div className="modal-actions"><button className="copy-button" onClick={resetGuidelineForm}>입력 취소</button><button className="confirm" onClick={saveGuideline}>{editingGuidelineId ? '원칙 수정' : '원칙 추가'}</button></div><div className="guideline-list" aria-label="저장한 편집 원칙">{guidelines.length === 0 ? <p className="state-box">아직 등록한 편집 원칙이 없습니다.</p> : <><div className="guideline-list-heading"><span>저장한 원칙 {guidelines.length}개</span></div>{guidelines.map(item => <article key={item.id} className={`guideline-item ${item.is_enabled ? '' : 'disabled'}`}><div><strong>{item.title}</strong><p>{item.content}</p></div><div className="item-actions"><button className={item.is_enabled ? 'guideline-use-button active' : 'guideline-use-button'} onClick={() => toggleGuideline(item)} aria-label={`${item.title} 원칙 ${item.is_enabled ? '사용하지 않기' : '사용하기'}`}>{item.is_enabled ? '사용하지 않기' : '사용하기'}</button><button className="copy-guideline-button" onClick={() => copy(item.content)} aria-label={`${item.title} 내용 복사`} title="원칙 내용 복사">📋</button><button className="text-button" onClick={() => editGuideline(item)}>수정</button><button className="delete-button" onClick={() => deleteGuideline(item.id)}>삭제</button></div></article>)}<div className="guidelines-footer"><button className="clear-guidelines-button" onClick={deleteAllGuidelines} aria-label="편집 원칙 전체 삭제" title="편집 원칙 전체 삭제">🗑️</button></div></>}</div></section></div>}
    {historyOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setHistoryOpen(false)}><section className="modal history" role="dialog" aria-modal="true" aria-label="검토 기록" onMouseDown={e => e.stopPropagation()}><button className="close" onClick={() => setHistoryOpen(false)} aria-label="닫기">×</button><div className="history-title"><h2>검토 기록</h2></div>{docs.length === 0 ? <p className="state-box">아직 저장된 검토 기록이 없습니다.</p> : <><div className="history-list">{docs.map(doc => <article key={doc.id} className="history-item"><button onClick={() => openDocument(doc.id)}><span>{new Date(doc.created_at).toLocaleDateString('ko-KR')}</span><strong>{doc.original_text.slice(0, 62)}{doc.original_text.length > 62 ? '…' : ''}</strong></button><button className="delete-button" onClick={() => deleteDocument(doc.id)} aria-label="검토 기록 삭제">삭제</button></article>)}</div><div className="history-footer"><button className="clear-history-button" onClick={deleteAllDocuments} aria-label="검토 기록 전체 삭제" title="검토 기록 전체 삭제"><span aria-hidden="true">🗑️</span></button></div></>}</section></div>}
  </div>
}
