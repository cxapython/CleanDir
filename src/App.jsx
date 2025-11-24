import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { open } from '@tauri-apps/api/dialog'
import { homeDir } from '@tauri-apps/api/path'
import { listen } from '@tauri-apps/api/event'
import PermissionGuide from './PermissionGuide'

function App() {
  const [currentPath, setCurrentPath] = useState('')
  const [items, setItems] = useState([])
  const [isScanning, setIsScanning] = useState(false)
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [pathHistory, setPathHistory] = useState([])
  const [stats, setStats] = useState({ count: 0, totalSize: 0 })
  const [viewMode, setViewMode] = useState('bubble') // 'bubble' or 'list'
  const [showDeleteHistory, setShowDeleteHistory] = useState(false) // 显示删除历史面板
  const [showPermissionGuide, setShowPermissionGuide] = useState(false)
  const [hasFullDiskAccess, setHasFullDiskAccess] = useState(true) // 权限状态
  const [isLoading, setIsLoading] = useState(true) // 初始加载状态
  const [scanCache, setScanCache] = useState({}) // 扫描结果缓存: { path: { items, stats, timestamp } }
  const [progressPercent, setProgressPercent] = useState(0) // 进度百分比
  const [scanProgress, setScanProgress] = useState({ 
    current: 0, 
    total: 0, 
    currentItem: '', 
    elapsed_seconds: 0,
    estimated_remaining_seconds: 0 
  }) // 扫描进度详情

  useEffect(() => {
    // 初始化：设置默认路径并检测权限
    const initialize = async () => {
      // 默认扫描 /Users 目录
      setCurrentPath('/Users')
      
      // 检测磁盘访问权限（添加超时保护）
      try {
        // 使用 Promise.race 添加超时机制
        const checkPermission = invoke('check_disk_access_permission')
        const timeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('超时')), 3000)
        )
        
        const hasPermission = await Promise.race([checkPermission, timeout])
          .catch(() => false)  // 超时或错误，假设没有权限
        
        setHasFullDiskAccess(hasPermission)
        setIsLoading(false) // 加载完成
        
        if (!hasPermission) {
          // 没有权限，延迟显示引导
          setTimeout(() => {
            setShowPermissionGuide(true)
          }, 1500)
        } else {
          // 有权限，检查是否是首次使用
          const hasShownGuide = localStorage.getItem('permission-guide-shown')
          if (!hasShownGuide) {
            // 首次使用，简单提示一下
            console.log('✅ 已检测到完全磁盘访问权限')
            localStorage.setItem('permission-guide-shown', 'true')
          }
        }
      } catch (error) {
        console.error('权限检测失败:', error)
        setHasFullDiskAccess(false)
        setIsLoading(false)
        // 即使失败也显示引导
        setTimeout(() => {
          setShowPermissionGuide(true)
        }, 1500)
      }
    }
    
    initialize()
  }, [])

  const selectDirectory = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: currentPath,
    })
    
    if (selected) {
      setCurrentPath(selected)
      setPathHistory([])
    }
  }

  const startScan = async (forceRefresh = false) => {
    if (!currentPath) return
    
    // 检查缓存（除非强制刷新）
    if (!forceRefresh && scanCache[currentPath]) {
      console.log('✅ 从缓存加载:', currentPath)
      const cached = scanCache[currentPath]
      setItems(cached.items)
      setStats(cached.stats)
      return
    }
    
    // 立即更新 UI 状态
    setIsScanning(true)
    setItems([])
    setSelectedItems(new Set())
    setProgressPercent(0)
    
    // 使用 setTimeout 确保状态更新完成并渲染后再执行扫描
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // 🔥 监听后端真实进度（详细信息）
    const unlisten = await listen('scan-progress', (event) => {
      const { percent, current, total, current_item } = event.payload
      setProgressPercent(percent || 0)
      setScanProgress({
        current: current || 0,
        total: total || 0,
        currentItem: current_item || ''
      })
    })
    
    try {
      const result = await invoke('scan_directory_fast', { path: currentPath })
      
      // 确保显示 100%
      setProgressPercent(100)
      
      const stats = {
        count: result.items.length,
        totalSize: result.items.reduce((sum, item) => sum + item.size, 0)
      }
      
      // 保存当前目录到缓存 (带时间戳)
      setScanCache(prev => ({
        ...prev,
        [currentPath]: { items: result.items, stats, timestamp: Date.now() }
      }))
      
      // ⚡️ 关键优化：后台预缓存前5个最大的子目录
      setTimeout(async () => {
        const topDirs = result.items
          .filter(item => item.is_directory)
          .slice(0, 5)
        
        for (const item of topDirs) {
          if (!scanCache[item.path]) {
            try {
              const subResult = await invoke('scan_directory_fast', { path: item.path })
              const subStats = {
                count: subResult.items.length,
                totalSize: subResult.items.reduce((sum, i) => sum + i.size, 0)
              }
              setScanCache(prev => ({
                ...prev,
                [item.path]: { items: subResult.items, stats: subStats, timestamp: Date.now() }
              }))
              console.log('✅ 预缓存:', item.name)
            } catch (e) {
              // 静默失败
            }
          }
        }
      }, 100)
      
      setItems(result.items)
      setStats(stats)
    } catch (error) {
      console.error('扫描失败:', error)
      alert('扫描失败: ' + error)
    } finally {
      unlisten()  // 清理监听器
      setIsScanning(false)
      setProgressPercent(0)
    }
  }

  const enterDirectory = async (item) => {
    if (!item.is_directory) return
    
    // 保存当前状态到历史
    setPathHistory([...pathHistory, currentPath])
    setCurrentPath(item.path)
    
    // 检查缓存
    if (scanCache[item.path]) {
      console.log('⚡️ 立即从缓存显示:', item.path)
      const cached = scanCache[item.path]
      setItems(cached.items)
      setStats(cached.stats)
      return
    }
    
    // 没有缓存，需要扫描
    setIsScanning(true)
    setProgressPercent(0)
    
    // 使用 setTimeout 确保 UI 先渲染
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // 🔥 监听后端真实进度（详细信息）
    const unlisten = await listen('scan-progress', (event) => {
      const { percent, current, total, current_item, elapsed_seconds, estimated_remaining_seconds } = event.payload
      setProgressPercent(percent || 0)
      setScanProgress({
        current: current || 0,
        total: total || 0,
        currentItem: current_item || '',
        elapsed_seconds: elapsed_seconds || 0,
        estimated_remaining_seconds: estimated_remaining_seconds || 0
      })
    })
    
    try {
      const result = await invoke('scan_directory_fast', { path: item.path })
      
      setProgressPercent(100)
      
      const stats = {
        count: result.items.length,
        totalSize: result.items.reduce((sum, item) => sum + item.size, 0)
      }
      
      // 保存到缓存 (带时间戳)
      setScanCache(prev => ({
        ...prev,
        [item.path]: { items: result.items, stats, timestamp: Date.now() }
      }))
      
      setItems(result.items)
      setStats(stats)
    } catch (error) {
      console.error('扫描失败:', error)
    } finally {
      unlisten()  // 清理监听器
      setIsScanning(false)
      setProgressPercent(0)
    }
  }

  const goBack = () => {
    if (pathHistory.length === 0) return
    
    const newHistory = [...pathHistory]
    const lastPath = newHistory.pop()
    setPathHistory(newHistory)
    setCurrentPath(lastPath)
    
    // 从缓存立即加载（后退必然有缓存）
    if (scanCache[lastPath]) {
      console.log('⚡️ 后退立即显示:', lastPath)
      const cached = scanCache[lastPath]
      setItems(cached.items)
      setStats(cached.stats)
    }
  }

  const toggleSelection = (itemPath) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(itemPath)) {
      newSelected.delete(itemPath)
    } else {
      newSelected.add(itemPath)
    }
    setSelectedItems(newSelected)
  }

  const deleteSelected = async () => {
    if (selectedItems.size === 0) return
    
    const itemsToDelete = Array.from(selectedItems).map(path => {
      const item = items.find(i => i.path === path)
      return item
    }).filter(Boolean)
    
    const totalSize = itemsToDelete.reduce((sum, item) => sum + item.size, 0)
    const totalCount = itemsToDelete.reduce((sum, item) => {
      return sum + (item.is_directory ? (item.item_count || 1) : 1)
    }, 0)
    
    // 检查是否有目录
    const hasDirectory = itemsToDelete.some(item => item.is_directory)
    
    let confirmMessage = `确定要移到废纸篓吗？\n\n` +
      `选中项: ${selectedItems.size} 个\n` +
      `总大小: ${formatBytes(totalSize)}\n`
    
    if (hasDirectory) {
      confirmMessage += `包含文件/目录: ${totalCount} 项\n`
    }
    
    confirmMessage += `\n💡 提示: 文件会移到废纸篓，可以恢复`
    
    const confirmed = window.confirm(confirmMessage)
    
    if (!confirmed) return
    
    try {
      const pathsToDelete = Array.from(selectedItems)
      await invoke('delete_items', { paths: pathsToDelete })
      
      // 保存删除历史到 localStorage
      const deleteHistory = JSON.parse(localStorage.getItem('delete-history') || '[]')
      const timestamp = Date.now()
      
      itemsToDelete.forEach(item => {
        deleteHistory.unshift({
          path: item.path,
          name: item.name,
          size: item.size,
          is_directory: item.is_directory,
          deleted_at: timestamp,
          deleted_at_readable: new Date(timestamp).toLocaleString('zh-CN')
        })
      })
      
      // 只保留最近 100 条删除记录
      if (deleteHistory.length > 100) {
        deleteHistory.splice(100)
      }
      
      localStorage.setItem('delete-history', JSON.stringify(deleteHistory))
      
      // 清空选中项
      setSelectedItems(new Set())
      
      // 清除当前目录缓存并立即刷新
      setScanCache(prev => {
        const newCache = { ...prev }
        delete newCache[currentPath]
        return newCache
      })
      
      // 立即重新扫描
      await startScan('fast', true)
      
      alert('✅ 已移到废纸篓！\n可以在废纸篓中恢复这些文件。\n\n删除历史已保存，可在"删除历史"中查看。')
    } catch (error) {
      alert('❌ 移到废纸篓失败:\n' + error)
    }
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i]
  }

  const getBubbleSize = (size, maxSize) => {
    const minSize = 80
    const maxBubbleSize = 300
    const ratio = Math.sqrt(size / maxSize)
    return Math.max(minSize, ratio * maxBubbleSize)
  }

  const getDisplayName = (name, maxLength = 15) => {
    if (name.length > maxLength) {
      // 智能截断：保留扩展名
      const parts = name.split('.')
      if (parts.length > 1) {
        const ext = parts.pop()
        const basename = parts.join('.')
        const availableLength = maxLength - ext.length - 4 // 减去 "..." 和 "."
        if (availableLength > 0 && basename.length > availableLength) {
          return basename.substring(0, availableLength) + '...' + ext
        }
      }
      return name.substring(0, maxLength - 3) + '...'
    }
    return name
  }

  const maxSize = items.length > 0 ? Math.max(...items.map(i => i.size)) : 1

  // 获取删除历史
  const getDeleteHistory = () => {
    return JSON.parse(localStorage.getItem('delete-history') || '[]')
  }

  // 清空删除历史
  const clearDeleteHistory = () => {
    if (window.confirm('确定要清空删除历史吗？\n\n注意: 这不会影响废纸篓中的文件，只是清除历史记录。')) {
      localStorage.removeItem('delete-history')
      setShowDeleteHistory(false)
      alert('✅ 删除历史已清空')
    }
  }

  return (
    <>
      {/* 删除历史面板 */}
      {showDeleteHistory && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-[#2D1B4E] to-[#1A0B2E] rounded-2xl p-6 max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col border border-purple-500/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-2xl font-bold">🗑️ 删除历史</h2>
              <div className="flex gap-2">
                <button
                  onClick={clearDeleteHistory}
                  className="px-4 py-2 bg-red-600/80 hover:bg-red-600 rounded-lg text-white text-sm font-semibold transition-colors"
                >
                  清空历史
                </button>
                <button
                  onClick={() => setShowDeleteHistory(false)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm font-semibold transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {getDeleteHistory().length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400 text-lg">暂无删除记录</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {getDeleteHistory().map((record, index) => (
                    <div
                      key={index}
                      className="bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{record.is_directory ? '📁' : '📄'}</span>
                            <span className="text-white font-semibold">{record.name}</span>
                          </div>
                          <p className="text-gray-400 text-xs font-mono mb-1">{record.path}</p>
                          <div className="flex items-center gap-4 text-xs text-gray-400">
                            <span>大小: {formatBytes(record.size)}</span>
                            <span>删除时间: {record.deleted_at_readable}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 text-center">
              <p className="text-gray-400 text-sm">
                💡 提示: 文件在废纸篓中，可以通过 Finder 恢复
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 初始加载动画 */}
      {isLoading && (
        <div className="fixed inset-0 bg-gradient-to-br from-[#1A0B2E] via-[#2D1B4E] to-[#1A0B2E] flex items-center justify-center z-50">
          <div className="text-center">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-purple-500/30"></div>
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-500 animate-spin"></div>
              <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-pink-500 animate-spin" style={{animationDirection: 'reverse', animationDuration: '1s'}}></div>
            </div>
            <h2 className="text-white text-2xl font-bold mb-2">空间透视</h2>
            <p className="text-gray-400">正在启动...</p>
          </div>
        </div>
      )}

      {/* 权限引导弹窗 */}
      {showPermissionGuide && (
        <PermissionGuide onClose={() => setShowPermissionGuide(false)} />
      )}

      <div className="h-screen flex flex-col bg-gradient-to-br from-[#1A0B2E] via-[#2D1B4E] to-[#1A0B2E]">
        {/* 权限警告横幅 */}
        {!hasFullDiskAccess && (
          <div className="bg-gradient-to-r from-yellow-600 to-orange-600 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-white font-semibold text-sm">权限不足：无法准确统计目录大小</p>
                <p className="text-white/80 text-xs">当前显示的大小可能不完整，建议授予完全磁盘访问权限</p>
              </div>
            </div>
            <button
              onClick={() => setShowPermissionGuide(true)}
              className="px-4 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white text-sm font-semibold transition-colors"
            >
              查看教程
            </button>
          </div>
        )}

        <div className="flex flex-1">
        {/* 左侧列表面板 */}
      <div className="w-[480px] flex flex-col border-r border-white/10 bg-black/20">
        {/* 顶部 */}
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={goBack}
              disabled={pathHistory.length === 0}
              className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            >
              <span className="text-xl">←</span>
            </button>
            <button
              onClick={() => setPathHistory([])}
              className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-30 flex items-center justify-center transition-colors"
            >
              <span className="text-xl">→</span>
            </button>
          </div>

          {/* 快捷目录 */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => { setCurrentPath('/'); setPathHistory([]) }}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 hover:text-white transition-colors"
            >
              💾 根目录
            </button>
            <button
              onClick={() => { setCurrentPath('/Users'); setPathHistory([]) }}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 hover:text-white transition-colors"
            >
              👥 Users
            </button>
            <button
              onClick={async () => { 
                const home = await homeDir()
                setCurrentPath(home)
                setPathHistory([])
              }}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-gray-300 hover:text-white transition-colors"
            >
              🏠 我的
            </button>
          </div>

          {/* 面包屑 */}
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
            <span>📍</span>
            <span className="text-white font-mono text-xs">{currentPath}</span>
          </div>


          {/* 目录信息卡片 */}
          <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-2xl p-5 backdrop-blur-sm border border-purple-500/20">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-blue-400/20 rounded-xl flex items-center justify-center">
                <span className="text-2xl">💾</span>
              </div>
              <div className="flex-1">
                <h2 className="text-white font-bold text-lg">
                  {currentPath.split('/').pop() || 'Macintosh HD'}
                </h2>
                <p className="text-sm text-gray-400">
                  {formatBytes(stats.totalSize)} | {stats.count} 项
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* 文件列表 */}
        <div className="flex-1 overflow-y-auto px-3">
          {[...items].sort((a, b) => b.size - a.size).slice(0, 10).map((item, index) => {
            const isSelected = selectedItems.has(item.path)
            return (
              <div
                key={item.path}
                className={`flex items-center gap-3 p-3 my-1 rounded-xl cursor-pointer transition-all hover:bg-white/5 ${
                  isSelected ? 'bg-purple-500/20' : ''
                }`}
                onClick={() => toggleSelection(item.path)}
                onDoubleClick={() => enterDirectory(item)}
              >
                <div className="w-8 h-8 flex items-center justify-center">
                  {item.error ? (
                    <span className="text-lg" title={item.error}>⚠️</span>
                  ) : isSelected ? (
                    <span className="text-lg">ℹ️</span>
                  ) : (
                    <span className="text-lg">{item.is_directory ? '📁' : '📄'}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">
                    {item.name}
                  </div>
                  {item.error && (
                    <div className="text-red-400 text-xs mt-0.5">
                      {item.error}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${item.error ? 'text-gray-500' : 'text-white'}`}>
                    {formatBytes(item.size)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 底部状态和操作 */}
        <div className="border-t border-white/10 bg-black/20">
          {/* 状态信息 */}
          <div className="p-4">
            <div className="flex items-center justify-between text-sm mb-3">
              <span className="text-gray-400">
                已用空间: {formatBytes(stats.totalSize)} (共 494 GB)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">ℹ️</span>
                <span className="text-white font-bold">已勾选 {selectedItems.size} 项</span>
                <span className="text-gray-400">|</span>
                <span className="text-white font-bold">{formatBytes(
                  Array.from(selectedItems).reduce((sum, path) => {
                    const item = items.find(i => i.path === path)
                    return sum + (item?.size || 0)
                  }, 0)
                )}</span>
              </div>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-pink-500 to-orange-500"
                style={{ width: `${(stats.totalSize / (494 * 1024 * 1024 * 1024)) * 100}%` }}
              ></div>
            </div>
          </div>
          
          {/* 操作按钮 */}
          <div className="p-4 pt-0 flex gap-2">
            <button
              onClick={selectDirectory}
              className="flex-1 px-3 py-2 bg-purple-600/80 hover:bg-purple-600 rounded-lg text-white text-sm font-semibold transition-colors"
            >
              📁 选择目录
            </button>
            <button
              onClick={() => {
                setScanCache(prev => {
                  const newCache = { ...prev }
                  delete newCache[currentPath]
                  return newCache
                })
                startScan(true)
              }}
              disabled={isScanning || !currentPath}
              className="flex-1 px-3 py-2 bg-purple-600/80 hover:bg-purple-600 rounded-lg text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isScanning ? '扫描中...' : '🔄 扫描'}
            </button>
            <button
              onClick={deleteSelected}
              disabled={selectedItems.size === 0}
              className="flex-1 px-3 py-2 bg-gradient-to-r from-pink-500 to-orange-500 hover:opacity-90 rounded-lg text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              🗑️ 删除 ({selectedItems.size})
            </button>
          </div>
        </div>
      </div>

      {/* 右侧气泡可视化 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部标题 */}
        <div className="p-5 text-center">
          <h1 className="text-white text-2xl font-bold">空间透视</h1>
        </div>

        {/* 气泡区域 */}
        <div className="flex-1 relative overflow-hidden flex items-center justify-center p-8">
          {isScanning ? (
            <div className="text-center max-w-md mx-auto">
              <div className="relative w-32 h-32 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-purple-500/30"></div>
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-500 border-r-pink-500 animate-spin"></div>
                <div className="absolute inset-4 rounded-full border-4 border-transparent border-t-pink-500 border-r-orange-500 animate-spin" style={{animationDirection: 'reverse', animationDuration: '1.5s'}}></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl">🔍</span>
                </div>
              </div>
              <h3 className="text-white text-2xl font-bold mb-2">正在扫描</h3>
              <p className="text-gray-300 text-sm mb-4">
                {scanProgress.total > 0 
                  ? `已扫描 ${scanProgress.current} / ${scanProgress.total} 项` 
                  : '正在准备...'}
              </p>
              {scanProgress.estimated_remaining_seconds > 0 && (
                <p className="text-purple-300 text-sm mb-2">
                  ⏱️ 预计剩余: {Math.floor(scanProgress.estimated_remaining_seconds / 60)}分{scanProgress.estimated_remaining_seconds % 60}秒
                </p>
              )}
              
              {/* 进度条 */}
              <div className="w-full bg-white/10 rounded-full h-3 mb-2 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              <p className="text-gray-400 text-xs mb-2">
                {Math.round(progressPercent)}%
              </p>
              
              {scanProgress.currentItem && (
                <div className="bg-white/5 rounded-lg px-4 py-2 mt-3 max-w-md mx-auto">
                  <p className="text-gray-400 text-xs mb-1">当前项目：</p>
                  <p className="text-white text-sm font-mono truncate">
                    {scanProgress.currentItem}
                  </p>
                </div>
              )}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center">
              <p className="text-gray-400 text-lg mb-4">选择目录并开始扫描</p>
              <button
                onClick={selectDirectory}
                className="px-6 py-3 bg-gradient-to-r from-pink-500 to-orange-500 rounded-full text-white font-bold hover:opacity-90 transition-opacity"
              >
                📁 选择目录
              </button>
            </div>
          ) : (
            <div className="relative w-full h-full">
              {/* 主要的大气泡（前3个） */}
              {items.slice(0, 3).map((item, index) => {
                const size = getBubbleSize(item.size, maxSize)
                const positions = [
                  { x: '30%', y: '50%' }, // 左中
                  { x: '60%', y: '35%' }, // 右上
                  { x: '55%', y: '65%' }, // 右下
                ]
                const pos = positions[index]
                const isSelected = selectedItems.has(item.path)
                
                return (
                  <div
                    key={item.path}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all hover:scale-105"
                    style={{
                      left: pos.x,
                      top: pos.y,
                      width: `${size}px`,
                      height: `${size}px`,
                      zIndex: 10 - index,
                    }}
                    onClick={() => toggleSelection(item.path)}
                    onDoubleClick={() => enterDirectory(item)}
                  >
                    <div className={`w-full h-full rounded-full flex flex-col items-center justify-center gap-1 transition-all ${
                      isSelected 
                        ? 'bg-gradient-to-br from-pink-500/40 to-purple-600/40 ring-4 ring-pink-500/50' 
                        : 'bg-gradient-to-br from-pink-500/30 to-purple-600/30'
                    } backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden`} style={{padding: '12%'}}>
                      <div className="text-5xl flex-shrink-0 mb-1">
                        {item.is_directory ? '📁' : '📄'}
                      </div>
                      <div className="text-white font-bold text-center text-base leading-tight w-full overflow-hidden px-2" style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word'
                      }}>
                        {getDisplayName(item.name, 18)}
                      </div>
                      <div className="text-white/90 text-lg font-bold mt-1 flex-shrink-0">
                        {formatBytes(item.size)}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* 次要的小气泡（4-8个） */}
              {items.slice(3, 8).map((item, index) => {
                const size = getBubbleSize(item.size, maxSize) * 0.6
                const positions = [
                  { x: '15%', y: '20%' },
                  { x: '80%', y: '20%' },
                  { x: '85%', y: '50%' },
                  { x: '75%', y: '80%' },
                  { x: '20%', y: '75%' },
                ]
                const pos = positions[index] || { x: '50%', y: '50%' }
                const isSelected = selectedItems.has(item.path)
                
                return (
                  <div
                    key={item.path}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all hover:scale-110"
                    style={{
                      left: pos.x,
                      top: pos.y,
                      width: `${size}px`,
                      height: `${size}px`,
                      zIndex: 5,
                    }}
                    onClick={() => toggleSelection(item.path)}
                    onDoubleClick={() => enterDirectory(item)}
                  >
                    <div className={`w-full h-full rounded-full flex flex-col items-center justify-center gap-1 ${
                      isSelected
                        ? 'bg-gradient-to-br from-purple-500/40 to-blue-500/40 ring-2 ring-purple-500/50'
                        : 'bg-gradient-to-br from-purple-500/25 to-blue-500/25'
                    } backdrop-blur-sm border border-white/10 shadow-xl p-4`}>
                      <div className="text-3xl flex-shrink-0 mb-1">
                        {item.is_directory ? '📁' : '📄'}
                      </div>
                      <div className="text-white text-sm font-bold text-center leading-tight w-full" style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word',
                        overflow: 'hidden'
                      }}>
                        {getDisplayName(item.name, 15)}
                      </div>
                      <div className="text-white/90 text-sm font-bold flex-shrink-0 mt-1">
                        {formatBytes(item.size)}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* 更小的气泡（其余的） */}
              {items.slice(8, 15).map((item, index) => {
                const size = 60
                const angle = (index / 7) * 2 * Math.PI
                const radius = 200
                const x = 50 + Math.cos(angle) * 35
                const y = 50 + Math.sin(angle) * 35
                const isSelected = selectedItems.has(item.path)
                
                return (
                  <div
                    key={item.path}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all hover:scale-125"
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${size}px`,
                      height: `${size}px`,
                      zIndex: 2,
                    }}
                    onClick={() => toggleSelection(item.path)}
                    onDoubleClick={() => enterDirectory(item)}
                  >
                    <div 
                      className={`w-full h-full rounded-full flex flex-col items-center justify-center gap-0.5 p-2 ${
                        isSelected
                          ? 'bg-purple-500/40 ring-1 ring-purple-500/50'
                          : 'bg-purple-500/20'
                      } backdrop-blur-sm border border-white/10 shadow-lg`}
                      title={`${item.name}\n${formatBytes(item.size)}`}
                    >
                      <div className="text-xl flex-shrink-0">
                        {item.is_directory ? '📁' : '📄'}
                      </div>
                      <div className="text-white text-[10px] font-bold text-center leading-tight" style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word',
                        overflow: 'hidden'
                      }}>
                        {getDisplayName(item.name, 8)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>

      {/* 顶部按钮组 */}
      <div className="fixed top-5 right-5 flex gap-2 z-40">
        <button
          onClick={() => setShowDeleteHistory(true)}
          className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-lg transition-colors"
          title="查看删除历史"
        >
          🗑️
        </button>
        <button
          onClick={() => setShowPermissionGuide(true)}
          className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-xl transition-colors"
          title="权限设置帮助"
        >
          ?
        </button>
      </div>
      </div>
    </div>
    </>
  )
}

export default App

