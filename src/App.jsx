import { useState, useEffect, useCallback } from 'react'
import Header from './components/Header'
import SearchToolbar from './components/SearchToolbar'
import RepoCard from './components/RepoCard'
import Toast from './components/Toast'
import './App.css'

const REGION_NAMES = {
  'cn-beijing': '华北2（北京）',
  'cn-zhangjiakou': '华北3（张家口）',
  'cn-hangzhou': '华东1（杭州）',
  'cn-shanghai': '华东2（上海）',
  'cn-shenzhen': '华南1（深圳）',
  'cn-chengdu': '西南1（成都）',
  'cn-hongkong': '中国香港',
}

export default function App() {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [keyword, setKeyword] = useState('')
  const [activeRegion, setActiveRegion] = useState('')
  const [toast, setToast] = useState({ visible: false, message: '' })

  const fetchImages = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/images')
      const text = await resp.text()
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`)
      setImages(JSON.parse(text))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchImages() }, [fetchImages])

  const handleCopy = useCallback((cmd) => {
    setToast({ visible: true, message: '已复制到剪贴板' })
  }, [])

  const hideToast = useCallback(() => {
    setToast(t => ({ ...t, visible: false }))
  }, [])

  const regions = [...new Set(images.map(i => i.region))]

  const filtered = images.filter(item => {
    if (item.error && !item.repo) return false
    if (activeRegion && item.region !== activeRegion) return false
    if (keyword && !item.repo.toLowerCase().includes(keyword.toLowerCase())) return false
    return true
  })

  const grouped = {}
  for (const item of filtered) {
    if (!grouped[item.region]) grouped[item.region] = []
    grouped[item.region].push(item)
  }

  const totalTags = filtered.reduce((sum, i) => sum + (i.tags?.length || 0), 0)

  return (
    <div className="app">
      <Header
        repoCount={filtered.length}
        tagCount={totalTags}
        loading={loading}
        onRefresh={fetchImages}
      />
      <div className="container">
        {!loading && images.length > 0 && (
          <SearchToolbar
            keyword={keyword}
            onKeywordChange={setKeyword}
            regions={regions}
            regionNames={REGION_NAMES}
            activeRegion={activeRegion}
            onRegionChange={setActiveRegion}
          />
        )}
        <div className="content">
          {loading ? (
            <div className="loading">
              <div className="spinner" />
              <div>正在获取镜像列表...</div>
            </div>
          ) : error ? (
            <div className="error-msg">获取失败：{error}</div>
          ) : filtered.length === 0 ? (
            <div className="empty">无匹配结果</div>
          ) : (
            Object.entries(grouped).map(([region, repos]) => (
              <div className="region-section" key={region}>
                <div className="region-title">
                  {REGION_NAMES[region] || region}
                  <span className="count">{repos.length}</span>
                </div>
                {repos.map((repo, i) => (
                  <RepoCard
                    key={`${region}-${repo.repo}-${i}`}
                    repo={repo}
                    registry={`registry.${region}.aliyuncs.com`}
                    onCopy={handleCopy}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
      <div className="footer">
        Docker Registry V2 API · Powered by ESA Pages
      </div>
      <Toast visible={toast.visible} message={toast.message} onHide={hideToast} />
    </div>
  )
}
