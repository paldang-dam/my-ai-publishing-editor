export type Suggestion = { id: number; original_text: string; suggested_text: string; reason: string; accepted: boolean }
type Props = { item: Suggestion; index: number; onAccept: (id: number, accepted: boolean) => void }
export default function SuggestionCard({ item, index, onAccept }: Props) {
  return <article className={`suggestion-card ${item.accepted ? 'accepted' : ''}`}>
    <div className="card-head"><span className="sequence">{String(index + 1).padStart(2, '0')}</span>{item.accepted && <span className="accepted-tag">선택됨</span>}<button className={item.accepted ? 'confirm selected card-accept-button' : 'confirm card-accept-button'} onClick={() => onAccept(item.id, !item.accepted)}>{item.accepted ? '사용하지 않기' : '사용하기'}</button></div>
    <div className="comparison">
      <div><span className="compare-label">원문</span><p>{item.original_text}</p></div>
      <span className="arrow" aria-hidden="true">→</span>
      <div><span className="compare-label highlight-label">제안</span><p className="suggested">{item.suggested_text}</p></div>
    </div>
    <p className="reason"><strong>편집 메모</strong>{item.reason}</p>
  </article>
}
