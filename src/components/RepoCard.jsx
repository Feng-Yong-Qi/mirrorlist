import { useState, useCallback, useMemo, useRef, useEffect } from 'react'

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

const PlatformIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
  </svg>
)

export default function RepoCard({ repo, highlightRegion, onCopy }) {
  const allTags = useMemo(() => {
    const tags = new Set()
    repo.regions.forEach(r => r.tags.forEach(t => tags.add(t)))
    return Array.from(tags).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  }, [repo.regions])

  const defaultTag = useMemo(() => {
    const found = allTags.find(t => t.toLowerCase() === 'latest')
    return found || allTags[0] || ''
  }, [allTags])

  const [selectedTag, setSelectedTag] = useState(defaultTag)
  const [showPopover, setShowPopover] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const [platforms, setPlatforms] = useState(undefined)
  const [platformsLoading, setPlatformsLoading] = useState(false)
  
  const popoverRef = useRef(null)
  const platformCache = useRef({})
  const cardRef = useRef(null)
  const hasAutoFetched = useRef(false)

  const { visibleTags, moreCount } = useMemo(() => {
    if (allTags.length <= 4) {
      return { visibleTags: allTags, moreCount: 0 }
    }
    const hasLongTag = allTags.some(t => t.length > 15)
    const limit = hasLongTag ? 2 : 6
    const visible = allTags.slice(0, limit)
    return {
      visibleTags: visible,
      moreCount: allTags.length - visible.length
    }
  }, [allTags])

  useEffect(() => {
    setSelectedTag(defaultTag)
    hasAutoFetched.current = false
    setPlatforms(undefined)
  }, [defaultTag])

  const fetchPlatforms = useCallback((tag) => {
    if (!tag || repo.regions.length === 0) return
    const region = repo.regions[0].id
    const cacheKey = `${region}:${repo.name}:${tag}`
    if (platformCache.current[cacheKey] !== undefined) {
      setPlatforms(platformCache.current[cacheKey])
      return
    }
    setPlatformsLoading(true)
    fetch(`/api/manifest?region=${encodeURIComponent(region)}&repo=${encodeURIComponent(repo.name)}&tag=${encodeURIComponent(tag)}`)
      .then(r => r.json())
      .then(data => {
        const val = data.platforms || null
        platformCache.current[cacheKey] = val
        setPlatforms(val)
      })
      .catch(() => {
        platformCache.current[cacheKey] = null
        setPlatforms(null)
      })
      .finally(() => setPlatformsLoading(false))
  }, [repo.regions, repo.name])

  useEffect(() => {
    if (!cardRef.current || !defaultTag) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !hasAutoFetched.current) {
        hasAutoFetched.current = true
        fetchPlatforms(defaultTag)
        observer.disconnect()
      }
    }, { threshold: 0.1 })
    observer.observe(cardRef.current)
    return () => observer.disconnect()
  }, [defaultTag, fetchPlatforms])

  const handleSelectTag = useCallback((tag) => {
    setSelectedTag(tag)
    fetchPlatforms(tag)
  }, [fetchPlatforms])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowPopover(false)
      }
    }
    if (showPopover) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPopover])

  const filteredTags = useMemo(() => {
    if (!tagSearch) return allTags
    return allTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()))
  }, [allTags, tagSearch])

  const handleCopy = useCallback((cmd) => {
    navigator.clipboard.writeText(cmd).then(() => onCopy?.())
  }, [onCopy])

  return (
    <div className="repo-card" ref={cardRef}>
      <div className="repo-header">
        <div className="repo-title-wrapper">
          <span className="repo-name">{repo.name}</span>
          <span className="repo-badge-mini">{repo.regions.length} Regions</span>
        </div>
      </div>

      <div className="card-section">
        <div className="section-label">
          <div className="label-main">
            Selected Tag: <span className="active-tag-name">{selectedTag}</span>
          </div>
          <div className="label-sub">
            <span className="separator">·</span>
            <PlatformIcon />
            <span className="platform-label-text">Platforms:</span>
            {platformsLoading ? (
              <span className="arch-loading">Scanning...</span>
            ) : Array.isArray(platforms) && platforms.length > 0 ? (
              <span className="arch-badges">
                {platforms.map((p, i) => (
                  <span key={i} className="arch-badge">{p}</span>
                ))}
              </span>
            ) : platforms === null ? (
              <span className="arch-badge arch-single">single-arch</span>
            ) : (
              <span className="arch-pending">Pending</span>
            )}
          </div>
        </div>
        
        <div className="tags-row-wrapper">
          <div className="tags-row">
            {visibleTags.map(tag => (
              <span
                key={tag}
                className={`tag ${tag === selectedTag ? 'active' : ''}`}
                title={tag}
                onClick={() => handleSelectTag(tag)}
              >
                {tag}
              </span>
            ))}

            {moreCount > 0 && (
              <div className="popover-container" ref={popoverRef}>
                <span
                  className={`tag tag-more ${showPopover ? 'open' : ''}`}
                  onClick={() => setShowPopover(!showPopover)}
                >
                  {showPopover ? 'Close' : `+${moreCount} more`}
                </span>

                {showPopover && (
                  <div className="tags-popover">
                    <div className="popover-search">
                      <input
                        autoFocus
                        placeholder="Search tags..."
                        value={tagSearch}
                        onChange={e => setTagSearch(e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                    <div className="popover-list">
                      {filteredTags.map(tag => (
                        <div
                          key={tag}
                          className={`popover-item ${tag === selectedTag ? 'active' : ''}`}
                          title={tag}
                          onClick={() => {
                            handleSelectTag(tag)
                            setShowPopover(false)
                          }}
                        >
                          {tag}
                        </div>
                      ))}
                      {filteredTags.length === 0 && <div className="popover-empty">No tags found</div>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card-section">
        <div className="section-label">Regions & Pull Commands</div>
        <div className="region-list">
          {repo.regions.map(r => {
            const pullCmd = `docker pull registry.${r.id}.aliyuncs.com/${repo.name}${selectedTag ? ':' + selectedTag : ''}`
            return (
              <div key={r.id} className={`region-row ${highlightRegion === r.id ? 'highlight' : ''}`}>
                <div className="region-info">
                  <span className="region-dot"></span>
                  <span className="region-name-text">{r.name}</span>
                </div>
                <div className="pull-cmd" onClick={() => handleCopy(pullCmd)}>
                  <span className="cmd-text">{pullCmd}</span>
                  <span className="copy-icon"><CopyIcon /></span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
