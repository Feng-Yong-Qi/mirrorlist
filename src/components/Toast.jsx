import { useEffect } from 'react'

export default function Toast({ message, visible, onHide }) {
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onHide, 1800)
      return () => clearTimeout(t)
    }
  }, [visible, onHide])

  return (
    <div className={`toast${visible ? ' show' : ''}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      {message}
    </div>
  )
}
