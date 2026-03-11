export default function SearchToolbar({
  keyword, onKeywordChange,
  regions, regionNames, activeRegion, onRegionChange,
}) {
  return (
    <div className="toolbar">
      <input
        className="search-box"
        type="text"
        placeholder="搜索仓库名..."
        value={keyword}
        onChange={e => onKeywordChange(e.target.value)}
      />
      <button
        className={`filter-btn${activeRegion === '' ? ' active' : ''}`}
        onClick={() => onRegionChange('')}
      >
        全部
      </button>
      {regions.map(r => (
        <button
          key={r}
          className={`filter-btn${activeRegion === r ? ' active' : ''}`}
          onClick={() => onRegionChange(r)}
        >
          {regionNames[r] || r}
        </button>
      ))}
    </div>
  )
}
