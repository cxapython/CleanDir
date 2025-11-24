import { useState, useEffect, useMemo } from 'react'
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
  const [scanMode, setScanMode] = useState('fast') // 'fast' or 'full'

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
      startScan() // 重新扫描
    } catch (error) {
      alert('删除失败: ' + error)
    }
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getSizeColor = (size) => {
    if (size > 1_000_000_000) return 'text-pink-400' // > 1GB
    if (size > 100_000_000) return 'text-orange-400'  // > 100MB
    return 'text-white'
  }

  return (
    <div className="h-screen flex flex-col bg-gradient-purple p-5">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="text-4xl">🔍</span>
          <h1 className="text-3xl font-bold bg-gradient-pink-orange bg-clip-text text-transparent">
            空间透视
          </h1>
        </div>
        
        <div className="flex gap-3 items-center">
          {/* 扫描模式切换 */}
          <div className="flex gap-2 bg-black/30 rounded-lg p-1">
            <button
              onClick={() => setScanMode('fast')}
              className={`px-3 py-1.5 rounded text-sm font-semibold transition-all ${
                scanMode === 'fast' 
                  ? 'bg-purple-600 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ⚡ 快速
            </button>
            <button
              onClick={() => setScanMode('full')}
              className={`px-3 py-1.5 rounded text-sm font-semibold transition-all ${
                scanMode === 'full' 
                  ? 'bg-purple-600 text-white' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🎯 完整
            </button>
          </div>
          
          <button
            onClick={goBack}
            disabled={pathHistory.length === 0}
            className="btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← 返回
          </button>
          
          <button onClick={selectDirectory} className="btn-secondary">
            📁 选择目录
          </button>
          
          <button
            onClick={() => startScan()}
            disabled={isScanning || !currentPath}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isScanning ? '⏸️ 扫描中...' : '🔄 开始扫描'}
          </button>
        </div>
      </div>

      {/* 模式说明 */}
      <div className="mb-4 text-sm text-gray-400">
        {scanMode === 'fast' ? (
          <span>⚡ 快速模式: 瞬间完成，大小为估算值（推荐日常使用）</span>
        ) : (
          <span>🎯 完整模式: 精确计算，但较慢（适合详细分析）</span>
        )}
      </div>

      {/* 当前路径 */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-gray-400 text-sm">当前路径:</span>
        <div className="flex-1 bg-white/10 rounded-lg px-4 py-2 text-sm truncate">
          {currentPath || '未选择'}
        </div>
      </div>

      {/* 进度提示 */}
      {isScanning && (
        <div className="mb-4">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-pink-orange animate-pulse w-full"></div>
          </div>
          <p className="text-gray-400 text-xs mt-2">正在扫描...</p>
        </div>
      )}

      {/* 文件列表 */}
      <div className="flex-1 bg-black/30 rounded-xl border border-white/10 overflow-hidden flex flex-col">
        {/* 表头 */}
        <div className="flex items-center bg-white/5 px-4 py-3 text-sm font-bold text-white/70 border-b border-white/10">
          <div className="w-12"></div>
          <div className="flex-1">名称</div>
          <div className="w-32 text-right">大小</div>
          <div className="w-24 text-right">项目数</div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              {isScanning ? '扫描中...' : '点击"开始扫描"查看文件'}
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.path}
                className={`flex items-center px-4 py-3 hover:bg-white/5 cursor-pointer border-b border-white/5 transition-colors ${
                  selectedItems.has(item.path) ? 'bg-pink-500/20' : ''
                }`}
                onDoubleClick={() => enterDirectory(item)}
              >
                <div className="w-12">
                  <input
                    type="checkbox"
                    checked={selectedItems.has(item.path)}
                    onChange={() => toggleSelection(item.path)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-5 h-5 rounded accent-pink-500 cursor-pointer"
                  />
                </div>
                
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <span className="text-xl">
                    {item.is_directory ? '📁' : '📄'}
                  </span>
                  <span className="truncate">{item.name}</span>
                </div>
                
                <div className={`w-32 text-right font-medium ${getSizeColor(item.size)}`}>
                  {formatBytes(item.size)}
                </div>
                
                <div className="w-24 text-right text-gray-400 text-sm">
                  {item.is_directory && item.item_count > 0 ? `${item.item_count} 项` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between mt-4">
        <div className="text-gray-400 text-sm">
          共 {stats.count} 项，总大小: {formatBytes(stats.totalSize)}
        </div>
        
        <button
          onClick={deleteSelected}
          disabled={selectedItems.size === 0}
          className="btn-danger disabled:opacity-40 disabled:cursor-not-allowed"
        >
          🗑️ 删除选中项 ({selectedItems.size})
        </button>
      </div>
    </div>
  )
}

export default App
