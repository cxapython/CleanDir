import { useState } from 'react'

/**
 * 删除确认对话框组件
 * @param {Object} props
 * @param {boolean} props.isOpen - 是否显示
 * @param {Function} props.onClose - 关闭回调
 * @param {Function} props.onConfirm - 确认删除回调
 * @param {Array} props.items - 待删除的项目列表
 * @param {Function} props.formatBytes - 格式化字节函数
 */
function DeleteConfirmModal({ isOpen, onClose, onConfirm, items, formatBytes }) {
  const [isDeleting, setIsDeleting] = useState(false)

  if (!isOpen) return null

  const totalSize = items.reduce((sum, item) => sum + item.size, 0)
  const totalCount = items.reduce((sum, item) => {
    return sum + (item.is_directory ? (item.item_count || 1) : 1)
  }, 0)
  const hasDirectory = items.some(item => item.is_directory)
  const dirCount = items.filter(item => item.is_directory).length
  const fileCount = items.filter(item => !item.is_directory).length

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onConfirm()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div 
        className="bg-gradient-to-br from-[#2D1B4E] to-[#1A0B2E] rounded-2xl p-6 max-w-md w-full border border-red-500/30 shadow-2xl animate-scale-in"
        style={{
          animation: 'scaleIn 0.2s ease-out'
        }}
      >
        {/* 警告图标 */}
        <div className="text-center mb-5">
          <div className="w-20 h-20 mx-auto bg-red-500/20 rounded-full flex items-center justify-center mb-4">
            <span className="text-5xl">⚠️</span>
          </div>
          <h2 className="text-white text-2xl font-bold mb-2">确认删除</h2>
          <p className="text-gray-300 text-sm">
            以下文件将被移到废纸篓
          </p>
        </div>

        {/* 删除详情 */}
        <div className="bg-black/30 rounded-xl p-4 mb-5 border border-white/10">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">选中项目</span>
              <span className="text-white font-bold">{items.length} 项</span>
            </div>
            
            {hasDirectory && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">包含</span>
                <span className="text-white">
                  {dirCount > 0 && <span className="mr-2">📁 {dirCount} 个文件夹</span>}
                  {fileCount > 0 && <span>📄 {fileCount} 个文件</span>}
                </span>
              </div>
            )}

            {hasDirectory && totalCount > items.length && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">总文件数</span>
                <span className="text-orange-400 font-semibold">约 {totalCount} 项</span>
              </div>
            )}
            
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-gray-400">总大小</span>
              <span className="text-pink-400 font-bold text-lg">{formatBytes(totalSize)}</span>
            </div>
          </div>
        </div>

        {/* 删除项目预览 */}
        {items.length <= 5 && (
          <div className="mb-5 max-h-32 overflow-y-auto">
            <p className="text-gray-400 text-xs mb-2">即将删除：</p>
            <div className="space-y-1">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-sm bg-white/5 rounded-lg px-3 py-1.5">
                  <span>{item.is_directory ? '📁' : '📄'}</span>
                  <span className="text-white truncate flex-1">{item.name}</span>
                  <span className="text-gray-400 text-xs">{formatBytes(item.size)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 提示信息 */}
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-5">
          <div className="flex items-start gap-2">
            <span className="text-green-400">💡</span>
            <p className="text-green-300 text-sm">
              文件会移到废纸篓，您可以随时从废纸篓恢复
            </p>
          </div>
        </div>

        {/* 按钮 */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-red-500 to-orange-500 hover:opacity-90 rounded-xl text-white font-bold transition-opacity disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {isDeleting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                <span>删除中...</span>
              </>
            ) : (
              <>
                <span>🗑️</span>
                <span>确认删除</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* CSS 动画 */}
      <style>{`
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  )
}

export default DeleteConfirmModal
