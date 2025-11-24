import { useState, useEffect } from 'react'

function PermissionGuide({ onClose }) {
  const [step, setStep] = useState(1)

  const openSystemSettings = async () => {
    // 在 macOS 13+ 打开系统设置的隐私页面
    if (window.__TAURI__) {
      const { shell } = window.__TAURI__
      try {
        // macOS Ventura (13.0) 及更高版本使用新的 URL scheme
        await shell.open('x-apple.systemsettings:com.apple.settings.PrivacySecurity.extension')
      } catch (error) {
        console.error('打开系统设置失败，尝试旧版 URL:', error)
        // 如果新版失败，尝试旧版（macOS 12 及更早）
        try {
          await shell.open('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
        } catch (error2) {
          console.error('打开系统设置失败:', error2)
          alert('无法自动打开系统设置\n\n请手动打开：\n系统设置 → 隐私与安全性 → 完全磁盘访问权限')
        }
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-8">
      <div className="bg-gradient-to-br from-purple-900/90 to-purple-800/90 rounded-3xl p-8 max-w-2xl w-full border border-purple-500/30 shadow-2xl">
        {/* 标题 */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-white mb-2">
            检测到权限不足
          </h2>
          <p className="text-gray-300 text-sm">
            当前应用没有完全磁盘访问权限，无法准确统计目录大小<br/>
            <span className="text-yellow-400 font-semibold">建议立即授权以获得完整功能</span>
          </p>
        </div>

        {/* 步骤说明 */}
        <div className="space-y-4 mb-8">
          <div className={`bg-white/10 rounded-xl p-4 border-2 ${
            step === 1 ? 'border-pink-500' : 'border-transparent'
          } transition-all`}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                1
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold mb-1">打开系统设置</h3>
                <p className="text-gray-300 text-sm mb-3">
                  点击下方按钮自动打开系统设置，或手动打开：<br/>
                  <span className="text-purple-300">  → 系统设置 → 隐私与安全性</span>
                </p>
                <button
                  onClick={openSystemSettings}
                  className="px-4 py-2 bg-pink-500 hover:bg-pink-600 rounded-lg text-white text-sm font-semibold transition-colors"
                >
                  📱 打开系统设置
                </button>
              </div>
            </div>
          </div>

          <div className={`bg-white/10 rounded-xl p-4 border-2 ${
            step === 2 ? 'border-pink-500' : 'border-transparent'
          } transition-all`}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold mb-1">找到"完全磁盘访问权限"</h3>
                <p className="text-gray-300 text-sm">
                  在左侧列表中找到 <span className="text-purple-300 font-semibold">"完全磁盘访问权限"</span>
                </p>
              </div>
            </div>
          </div>

          <div className={`bg-white/10 rounded-xl p-4 border-2 ${
            step === 3 ? 'border-pink-500' : 'border-transparent'
          } transition-all`}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                3
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold mb-1">添加"空间透视"应用</h3>
                <p className="text-gray-300 text-sm">
                  点击左下角 <span className="text-purple-300">🔒</span> 解锁（需要密码）<br/>
                  点击 <span className="text-purple-300">+</span> 按钮 → 找到 <span className="text-purple-300 font-semibold">/Applications/空间透视.app</span><br/>
                  确保开关已打开 ✅
                </p>
              </div>
            </div>
          </div>

          <div className={`bg-white/10 rounded-xl p-4 border-2 ${
            step === 4 ? 'border-pink-500' : 'border-transparent'
          } transition-all`}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                4
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold mb-1">重启应用</h3>
                <p className="text-gray-300 text-sm">
                  完成授权后，<span className="text-purple-300">完全退出并重新启动</span>应用
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              localStorage.setItem('permission-guide-shown', 'true')
              onClose()
            }}
            className="px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-white font-semibold transition-colors"
          >
            稍后设置
          </button>
          
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((s) => (
              <button
                key={s}
                onClick={() => setStep(s)}
                className={`w-2 h-2 rounded-full transition-all ${
                  step === s ? 'bg-pink-500 w-6' : 'bg-white/30'
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => {
              if (step < 4) {
                setStep(step + 1)
              } else {
                localStorage.setItem('permission-guide-shown', 'true')
                onClose()
              }
            }}
            className="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 hover:opacity-90 rounded-lg text-white font-bold transition-opacity"
          >
            {step < 4 ? '下一步 →' : '我知道了'}
          </button>
        </div>

        {/* 提示 */}
        <div className="mt-6 text-center">
          <p className="text-gray-400 text-xs">
            💡 一次授权，永久有效。授权后不会再频繁弹出权限请求
          </p>
        </div>
      </div>
    </div>
  )
}

export default PermissionGuide

