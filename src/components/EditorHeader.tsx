type Props = { savedCount: number; onHistory: () => void }
export default function EditorHeader({ savedCount, onHistory }: Props) {
  const refreshApp = () => window.location.reload()
  return <header className="topbar">
    <button className="brand" type="button" onClick={refreshApp} aria-label="교정기 새로고침" title="처음부터 다시 시작하기"><span className="brand-mark" aria-hidden="true">📖</span><span>교정기</span></button>
    <div className="topbar-actions">
      <button className="history-button" onClick={onHistory}>검토 기록 <b>{savedCount}</b></button>
    </div>
  </header>
}
