import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { open } from '@tauri-apps/api/dialog'
import { homeDir } from '@tauri-apps/api/path'

function App() {
  const [currentPath, setCurrentPath] = useState('')
  const [items, setItems] = useState([])
  const [isScanning, setIsScanning] = useState(false)
  const [selectedItems, setSelectedItems] = useState(new Set())
  const [pathHistory, setPathHistory] = useState([])
  const [stats, setStats] = useState({ count: 0, totalSize: 0 })
  const [scanMode, setScanMode] = useState('fast')
  const [viewMode, setViewMode] = useState('bubble') // 'bubble' or 'list'

  useEffect(() => {
    homeDir().then(setCurrentPath)
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

  const startScan = async (mode = scanMode) => {
    if (!currentPath) return
    
    setIsScanning(true)
    setItems([])
    setSelectedItems(new Set())
    
    try {
      const command = mode === 'fast' ? 'scan_directory_fast' : 'scan_directory'
      const result = await invoke(command, { path: currentPath })
      setItems(result.items)
      setStats({
        count: result.items.length,
        totalSize: result.items.reduce((sum, item) => sum + item.size, 0)
      })
    } catch (error) {
      console.error('扫描失败:', error)
      alert('扫描失败: ' + error)
    } finally {
      setIsScanning(false)
    }
  }

  const enterDirectory = async (item) => {
    if (!item.is_directory) return
    
    setPathHistory([...pathHistory, currentPath])
    setCurrentPath(item.path)
    setIsScanning(true)
    
    try {
      const command = scanMode === 'fast' ? 'scan_directory_fast' : 'scan_directory'
      const result = await invoke(command, { path: item.path })
      setItems(result.items)
      setStats({
        count: result.items.length,
        totalSize: result.items.reduce((sum, item) => sum + item.size, 0)
      })
    } catch (error) {
      console.error('扫描失败:', error)
    } finally {
      setIsScanning(false)
    }
  }

  const goBack = async () => {
    if (pathHistory.length === 0) return
    
    const newHistory = [...pathHistory]
    const lastPath = newHistory.pop()
    setPathHistory(newHistory)
    setCurrentPath(lastPath)
    setIsScanning(true)
    
    try {
      const command = scanMode === 'fast' ? 'scan_directory_fast' : 'scan_directory'
      const result = await invoke(command, { path: lastPath })
      setItems(result.items)
      setStats({
        count: result.items.length,
        totalSize: result.items.reduce((sum, item) => sum + item.size, 0)
      })
    } catch (error) {
      console.error('扫描失败:', error)
    } finally {
      setIsScanning(false)
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
    
    const confirmed = window.confirm(
      `确定要删除选中的 ${selectedItems.size} 项吗？\n此操作不可恢复！`
    )
    
    if (!confirmed) return
    
    try {
      const pathsToDelete = Array.from(selectedItems)
      await invoke('delete_items', { paths: pathsToDelete })
      alert('删除成功！')
      setSelectedItems(new Set())
      startScan()
    } catch (error) {
      alert('删除失败: ' + error)
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

  const getDisplayName = (name) => {
    if (name.length > 12) {
      return name.substring(0, 10) + '...'
    }
    return name
  }

  const maxSize = items.length > 0 ? Math.max(...items.map(i => i.size)) : 1

  return (
    <div className="h-screen flex bg-gradient-to-br from-[#1A0B2E] via-[#2D1B4E] to-[#1A0B2E]">
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
            <div className="flex-1"></div>
            <button className="px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 to-orange-500 text-white font-bold text-sm hover:opacity-90 transition-opacity">
              解锁完整版本
            </button>
          </div>

          {/* 面包屑 */}
          <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
            <span>💾</span>
            <span className="text-white">Macintosh HD</span>
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

          {/* 选择模式 */}
          <div className="mt-4">
            <label className="text-sm text-gray-400 block mb-2">选择: 手动 ⌄</label>
          </div>
        </div>

        {/* 文件列表 */}
        <div className="flex-1 overflow-y-auto px-3">
          {items.slice(0, 10).map((item, index) => {
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
                  {isSelected ? (
                    <span className="text-lg">ℹ️</span>
                  ) : (
                    <span className="text-lg">{item.is_directory ? '📁' : '📄'}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">
                    {item.name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white text-sm font-bold">
                    {formatBytes(item.size)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 底部状态 */}
        <div className="p-4 border-t border-white/10 bg-black/20">
          <div className="flex items-center justify-between text-sm">
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
          <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-pink-500 to-orange-500"
              style={{ width: `${(stats.totalSize / (494 * 1024 * 1024 * 1024)) * 100}%` }}
            ></div>
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
            <div className="text-center">
              <div className="w-20 h-20 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-white text-lg">正在扫描...</p>
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
                    <div className={`w-full h-full rounded-full flex flex-col items-center justify-center transition-all ${
                      isSelected 
                        ? 'bg-gradient-to-br from-pink-500/40 to-purple-600/40 ring-4 ring-pink-500/50' 
                        : 'bg-gradient-to-br from-pink-500/30 to-purple-600/30'
                    } backdrop-blur-md border border-white/10 shadow-2xl`}>
                      <div className="text-4xl mb-2">
                        {item.is_directory ? '📁' : '📄'}
                      </div>
                      <div className="text-white font-bold text-center px-4">
                        {getDisplayName(item.name)}
                      </div>
                      <div className="text-white text-lg font-bold mt-1">
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
                    <div className={`w-full h-full rounded-full flex flex-col items-center justify-center ${
                      isSelected
                        ? 'bg-gradient-to-br from-purple-500/40 to-blue-500/40 ring-2 ring-purple-500/50'
                        : 'bg-gradient-to-br from-purple-500/25 to-blue-500/25'
                    } backdrop-blur-sm border border-white/10 shadow-xl`}>
                      <div className="text-2xl mb-1">
                        {item.is_directory ? '📁' : '📄'}
                      </div>
                      <div className="text-white text-xs font-bold text-center px-2">
                        {getDisplayName(item.name)}
                      </div>
                      <div className="text-white text-sm font-bold mt-0.5">
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
                    <div className={`w-full h-full rounded-full flex items-center justify-center ${
                      isSelected
                        ? 'bg-purple-500/40 ring-1 ring-purple-500/50'
                        : 'bg-purple-500/20'
                    } backdrop-blur-sm border border-white/10 shadow-lg`}>
                      <div className="text-lg">
                        {item.is_directory ? '📁' : '📄'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 底部操作按钮 */}
        <div className="p-5 flex items-center justify-center gap-4">
          <button
            onClick={selectDirectory}
            className="px-5 py-2.5 bg-purple-600/80 hover:bg-purple-600 rounded-full text-white font-semibold transition-colors"
          >
            📁 选择目录
          </button>
          <button
            onClick={() => startScan()}
            disabled={isScanning || !currentPath}
            className="px-5 py-2.5 bg-purple-600/80 hover:bg-purple-600 rounded-full text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isScanning ? '扫描中...' : '🔄 开始扫描'}
          </button>
          <button
            onClick={deleteSelected}
            disabled={selectedItems.size === 0}
            className="px-5 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 hover:opacity-90 rounded-full text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shadow-lg shadow-pink-500/30"
          >
            查看并移除
          </button>
        </div>
      </div>
    </div>
  )
}

export default App

