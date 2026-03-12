import { useEffect } from 'react'

export default function Toast({ visible, message, onHide }) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        onHide()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [visible, onHide])

  return (
    <div className={`toast-wrapper ${visible ? 'show' : ''}`}>
      <div className="toast-content">
        <div className="success-icon-mini" key={visible ? 'active' : 'hidden'}>
          <svg viewBox="0 0 52 52">
            {/* 外层圆圈 */}
            <circle 
              className="checkmark-circle" 
              cx="26" 
              cy="26" 
              r="23" 
              fill="none" 
            />
            {/* 内部对号 */}
            <path 
              className="checkmark-path" 
              fill="none" 
              d="M16 26l7 7 13-13" 
            />
          </svg>
        </div>
        <span className="toast-text">{message}</span>
      </div>
    </div>
  )
}
