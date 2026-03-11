import { useState, useCallback, useEffect } from 'react'

const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

const MAX_VISIBLE = 12

export default function RepoCard({ repo, registry, onCopy }) {
  const tags = repo.tags || []
  const pullBase = `${registry}/${repo.repo}`
  const defaultTag = tags.includes('latest') ? 'latest' : (tags[tags.length - 1] || '')

  const [selectedTag, setSelectedTag] = useState(defaultTag)
  const [expanded, setExpanded] = useState(false)

  // 当 tags 变化时，确保 selectedTag 仍然有效
  useEffect(() => {
    if (tags.length === 0) {
      setSelectedTag('')
    } else if (!tags.includes(selectedTag)) {
      setSelectedTag(tags.includes('latest') ? 'latest' : tags[tags.length - 1])
    }
  }, [tags])

  const pullCmd = `docker pull ${pullBase}${selectedTag ? ':' + selectedTag : ''}`

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(pullCmd).then(() => {
      onCopy?.(pullCmd)
    })
  }, [pullCmd, onCopy])

  const showExpand = tags.length > MAX_VISIBLE
  const visibleTags = expanded ? tags : tags.slice(0, MAX_VISIBLE)
  const hiddenCount = tags.length - MAX_VISIBLE

  return (
    <div className="repo-card">
      <div className="repo-header">
        <span className="repo-name">{repo.repo}</span>
        <span className="tag-count">{tags.length} tags</span>
      </div>
      {tags.length > 0 && (
        <div className="tags-section">
          <div className="tags-row">
            {visibleTags.map(tag => (
              <span
                key={tag}
                className={`tag${tag === selectedTag ? ' active' : ''}`}
                onClick={() => setSelectedTag(tag)}
              >
                {tag}
              </span>
            ))}
            {showExpand && !expanded && (
              <span className="tag tag-more" onClick={() => setExpanded(true)}>
                +{hiddenCount} more
              </span>
            )}
            {showExpand && expanded && (
              <span className="tag tag-more" onClick={() => setExpanded(false)}>
                收起
              </span>
            )}
          </div>
        </div>
      )}
      <div className="pull-cmd" onClick={handleCopy}>
        <span className="cmd-text">{pullCmd}</span>
        <span className="copy-icon"><CopyIcon /></span>
      </div>
    </div>
  )
}
