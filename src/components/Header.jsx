export default function Header({ repoCount, tagCount, loading, onRefresh }) {
  return (
    <div className="header">
      <div className="container header-inner">
        <div>
          <h1>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12.5c0-2.3-3.6-4.5-10-4.5S2 10.2 2 12.5" />
              <path d="M5.5 8V4.5" /><path d="M8 9V2" /><path d="M10.5 8.5V5" />
              <path d="M13 9V3.5" /><path d="M15.5 8.5V5.5" />
              <path d="M2 12.5c0 2.3 3.6 4.5 10 4.5s10-2.2 10-4.5" />
            </svg>
            MirrorList
          </h1>
          {!loading && (
            <div className="stats">{repoCount} 个仓库 · {tagCount} 个标签</div>
          )}
        </div>
        <button className="btn" disabled={loading} onClick={onRefresh}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          刷新
        </button>
      </div>
    </div>
  )
}
