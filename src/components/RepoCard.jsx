import { useState, useCallback } from 'react'

const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

export default function RepoCard({ repo, registry }) {
  const tags = repo.tags || []
  const pullBase = `${registry}/${repo.repo}`
  const defaultTag = tags.includes('latest') ? 'latest' : (tags[tags.length - 1] || '')

  const [selectedTag, setSelectedTag] = useState(defaultTag)
  const [copied, setCopied] = useState(false)

  const pullCmd = `docker pull ${pullBase}${selectedTag ? ':' + selectedTag : ''}`

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(pullCmd).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }, [pullCmd])

  return (
    <div className="repo-card">
      <div className="repo-header">
        <span className="repo-name">{repo.repo}</span>
        <span className="tag-count">{tags.length} tags</span>
      </div>
      {tags.length > 0 && (
        <div className="tags-row">
          {tags.map(tag => (
            <span
              key={tag}
              className={`tag${tag === selectedTag ? ' active' : ''}`}
              onClick={() => setSelectedTag(tag)}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <div
        className={`pull-cmd${copied ? ' copied' : ''}`}
        onClick={handleCopy}
      >
        <span className="cmd-text">{pullCmd}</span>
        <span className="copy-icon"><CopyIcon /></span>
      </div>
    </div>
  )
}
