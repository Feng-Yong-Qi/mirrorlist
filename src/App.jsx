import { useState, useEffect, useCallback, useMemo } from 'react'
import Header from './components/Header'
import RepoCard from './components/RepoCard'
import Toast from './components/Toast'
import './App.css'

const REGION_NAMES = {
  'cn-beijing': '华北2 (北京)',
  'cn-zhangjiakou': '华北3 (张家口)',
  'cn-hangzhou': '华东1 (杭州)',
  'cn-shanghai': '华东2 (上海)',
  'cn-shenzhen': '华南1 (深圳)',
  'cn-chengdu': '西南1 (成都)',
  'cn-hongkong': '中国香港',
}

// 加载状态组件
const LoadingState = () => (
  <div className="loading-state">
    <div className="loading-spinner-wrapper">
      <div className="loading-spinner-main"></div>
      <div className="loading-spinner-inner"></div>
    </div>
    <div className="loading-title">正在同步镜像库...</div>
    <div className="loading-tips">正在从 Docker Registry 获取最新的版本信息</div>
  </div>
)

// 空状态组件
const EmptyState = ({ onClear }) => (
  <div className="empty-state">
    <div className="empty-icon">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        <line x1="8" y1="11" x2="14" y2="11" strokeWidth="3"></line>
      </svg>
    </div>
    <div className="empty-title">未找到相关镜像</div>
    <div className="empty-tips">
      没有找到匹配关键字的仓库，请尝试更换搜索词或者切换左侧地域分类。
    </div>
    <button className="clear-search-btn" onClick={onClear}>清除搜索内容</button>
  </div>
)

export default function App() {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('all')
  const [toast, setToast] = useState({ visible: false, message: '' })

  const fetchImages = useCallback(async (isManual = false) => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/images')
      const text = await resp.text()
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`)
      setImages(JSON.parse(text))
      if (isManual) {
        setToast({ visible: true, message: '列表已刷新' })
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchImages() }, [fetchImages])

  const handleCopy = useCallback(() => {
    setToast({ visible: true, message: '复制成功' })
  }, [])

  const groupedRepos = useMemo(() => {
    const map = {}
    images.forEach(img => {
      if (!img.repo) return
      if (!map[img.repo]) {
        map[img.repo] = { name: img.repo, regions: [] }
      }
      map[img.repo].regions.push({
        id: img.region,
        name: REGION_NAMES[img.region] || img.region,
        tags: img.tags || []
      })
    })
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
  }, [images])

  const availableRegions = useMemo(() => {
    const regionIds = [...new Set(images.map(img => img.region))]
    return regionIds.filter(id => !!id).sort()
  }, [images])

  const regionStats = useMemo(() => {
    const stats = { all: 0 }
    const k = keyword.toLowerCase()
    groupedRepos.forEach(repo => {
      const matchKeyword = !k || repo.name.toLowerCase().includes(k)
      if (!matchKeyword) return
      stats.all++
      repo.regions.forEach(r => {
        stats[r.id] = (stats[r.id] || 0) + 1
      })
    })
    return stats
  }, [groupedRepos, keyword])

  const filteredRepos = useMemo(() => {
    const k = keyword.toLowerCase()
    return groupedRepos.filter(repo => {
      const matchKeyword = !k || repo.name.toLowerCase().includes(k)
      if (!matchKeyword) return false
      if (selectedRegion === 'all') return true
      return repo.regions.some(r => r.id === selectedRegion)
    })
  }, [groupedRepos, keyword, selectedRegion])

  const totalTags = useMemo(() => {
    return filteredRepos.reduce((sum, repo) => {
      const regionTags = repo.regions.reduce((s, r) => s + r.tags.length, 0)
      return sum + regionTags
    }, 0)
  }, [filteredRepos])

  return (
    <div className="app">
      <Header
        repoCount={filteredRepos.length}
        tagCount={totalTags}
        loading={loading}
        onRefresh={() => fetchImages(true)}
      />
      
      <div className="main-layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <input 
              className="search-input"
              placeholder="搜索仓库名..."
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
          </div>
          <nav className="nav-list">
            <div 
              className={`nav-item ${selectedRegion === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedRegion('all')}
            >
              <span className="nav-label">全部仓库</span>
              <span className="nav-badge">{regionStats.all}</span>
            </div>
            
            {availableRegions.length > 0 && <div className="nav-divider">地域分类</div>}
            
            {availableRegions.map(rid => (
              <div 
                key={rid}
                className={`nav-item ${selectedRegion === rid ? 'active' : ''} ${!regionStats[rid] ? 'disabled' : ''}`}
                onClick={() => regionStats[rid] && setSelectedRegion(rid)}
              >
                <span className="nav-label">{REGION_NAMES[rid] || rid}</span>
                <span className="nav-badge">{regionStats[rid] || 0}</span>
              </div>
            ))}
          </nav>
        </aside>

        <main className="content-area">
          {loading && images.length === 0 ? (
            <LoadingState />
          ) : error ? (
            <div className="error-msg">{error}</div>
          ) : filteredRepos.length === 0 ? (
            <EmptyState onClear={() => setKeyword('')} />
          ) : (
            <div className="repo-grid">
              {filteredRepos.map(repo => (
                <RepoCard
                  key={repo.name}
                  repo={repo}
                  highlightRegion={selectedRegion !== 'all' ? selectedRegion : null}
                  onCopy={handleCopy}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <Toast visible={toast.visible} message={toast.message} onHide={() => setToast(t => ({...t, visible: false}))} />
      <div className="footer">
        Docker Registry V2 API · Powered by ESA Pages
      </div>
    </div>
  )
}
