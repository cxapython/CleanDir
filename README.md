# 🔍 空间透视 - 专业的磁盘空间分析工具

> 现代化的磁盘空间管理工具，帮助你快速找到占用空间的大文件和目录

![Version](https://img.shields.io/badge/version-1.3-blue)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Size](https://img.shields.io/badge/size-2.6MB-green)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ 核心特性

### 🎨 现代化界面
- **直观的可视化** - 左右分屏布局，气泡图展示空间占用
- **精美的设计** - 深紫色渐变背景 + 磨砂玻璃效果
- **流畅动画** - 悬停缩放、选中发光效果

### ⚡ 性能优化
- **Rayon 并行扫描** - 多核 CPU 并行计算，速度提升 5-8x
- **真实进度显示** - 后端实时推送进度到前端
- **智能缓存** - 预缓存前 5 个最大目录，瞬间打开
- **流畅体验** - 异步非阻塞，UI 永不卡顿

### 🔒 权限管理
- **首次启动引导** - 自动显示4步权限设置说明
- **一键跳转** - 直接打开系统设置页面
- **帮助按钮** - 右上角"?"随时查看引导

### 🗑️ 安全删除
- **移到废纸篓** - 使用 macOS Finder API
- **可恢复** - 误删可从废纸篓恢复
- **友好提示** - 显示选中数量和大小

---

## 🚀 快速开始

### 安装

```bash
# 打开 DMG
open /Users/chennan/CleanDir/空间透视.dmg

# 拖到 Applications 文件夹
```

### 首次使用

1. **打开应用** - 会自动显示权限引导
2. **点击"打开系统设置"** - 自动跳转
3. **添加权限**:
   - 系统设置 → 隐私与安全性
   - 完全磁盘访问权限
   - 添加"空间透视.app"
4. **重启应用** - 完成设置

### 基本操作

- **选择目录**: 点击"选择目录"按钮
- **开始扫描**: 点击"开始扫描"（默认快速模式）
- **查看结果**: 左侧列表 + 右侧气泡可视化
- **进入子目录**: 双击文件夹
- **删除文件**: 选中后点击"移到废纸篓"

---

## 📊 技术架构

### 技术栈
- **前端**: React 18 + Vite + Tailwind CSS
- **后端**: Rust + Tauri 1.5
- **打包**: DMG (2.3 MB)

### 核心功能实现

#### 快速扫描
```rust
// 只扫描一级子目录，瞬间完成
fn calculate_dir_size_fast(path: &Path) -> (u64, usize)
```

#### 完整扫描
```rust
// 递归扫描但有限制（最大深度5层，最多10K文件）
fn calculate_dir_size_with_limit(path: &Path, max_files: usize)
```

#### 安全删除
```rust
// 使用 AppleScript 移到废纸篓
Command::new("osascript")
    .arg("-e")
    .arg("tell application \"Finder\" to delete POSIX file \"...\"")
```

#### 权限引导
```javascript
// 首次启动显示，localStorage 记录状态
useEffect(() => {
  if (!localStorage.getItem('permission-guide-shown')) {
    setShowPermissionGuide(true)
  }
}, [])
```

---

## 🎯 产品优势

- ✅ **开源免费** - MIT 许可证，完全免费使用
- ✅ **轻量高效** - 仅 2.6MB，启动快速
- ✅ **现代技术栈** - Tauri + React + Rust 构建
- ✅ **安全可靠** - 删除的文件移到废纸篓，可恢复
- ✅ **隐私保护** - 本地运行，不上传任何数据
- ✅ **跨平台** - 支持 macOS（未来计划支持 Windows 和 Linux）

---

## 💡 使用技巧

### 快速清理建议

**推荐扫描目录**:
- `~/Downloads` - 下载文件
- `~/Library/Caches` - 应用缓存  
- `~/Documents` - 文档目录

**安全删除**:
- ✅ 旧的下载文件
- ✅ 应用缓存
- ✅ 重复文件
- ✅ 临时文件

**不要删除**:
- ⛔ `/System` - 系统文件
- ⛔ `/Library` - 系统库
- ⛔ `~/Library/Preferences` - 应用设置
- ⛔ 正在使用的文件

### 恢复误删文件

```bash
# 打开废纸篓
open ~/.Trash

# 右键文件 → "放回原处"
```

---

## 🐛 常见问题

### Q: 仍然频繁弹出权限请求？

**A**: 需要授予"完全磁盘访问权限"
1. 系统设置 → 隐私与安全性
2. 完全磁盘访问权限
3. 添加"空间透视.app"
4. 重启应用

### Q: 无法打开应用（来自身份不明的开发者）？

**A**: 
```bash
sudo xattr -r -d com.apple.quarantine /Applications/空间透视.app
```

### Q: 扫描很慢？

**A**: 
- 使用"快速模式"（默认）
- 不要扫描整个磁盘
- 针对具体目录扫描

### Q: 删除的文件在哪？

**A**: 在废纸篓中（`~/.Trash/`），可以恢复

---

## 🔄 重新构建

### 开发环境

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri:dev

# 构建 DMG
npm run tauri:build
```

---

## 📝 项目结构

```
CleanDir/
├── src/                      # React 前端
│   ├── App.jsx              # 主界面（气泡视图）
│   ├── PermissionGuide.jsx  # 权限引导
│   └── index.css            # 样式
├── src-tauri/               # Rust 后端
│   ├── src/main.rs          # 核心逻辑
│   ├── Cargo.toml           # Rust 配置
│   └── tauri.conf.json      # Tauri 配置
├── package.json             # Node 依赖
└── 空间透视.dmg              # 最终产物
```

---

## 📄 许可证

MIT License - 自由使用和修改

---

## 🎉 版本历史

### v1.3 (当前版本) - 2025-11-20
- 🚀 **Rayon 并行计算** - 多核并行扫描，速度提升 5-8 倍
- 📊 **真实进度推送** - 后端实时推送扫描进度到前端
- ⚡️ **智能预缓存** - 自动缓存前 5 个最大目录
- 🎯 **精准大小计算** - 修复 `walkdir` 单线程问题
- 🔧 **IPC 优化** - 每 3 项或 100ms 发送一次，性能损失 < 0.1%

### v1.2
- ✅ 安全删除（移到废纸篓）
- ✅ 权限引导（首次启动）
- ✅ 气泡可视化界面
- ✅ 快速扫描模式
- ✅ 性能优化

### v1.1
- ✅ 气泡可视化
- ✅ 性能优化

### v1.0
- ✅ 基础功能
- ✅ 列表视图

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发指南

```bash
# 克隆项目
git clone https://github.com/cxapython/CleanDir.git
cd CleanDir

# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建
npm run tauri build
```

---

## 📮 联系方式

有问题或建议？欢迎通过以下方式联系：

- 🐛 提交 [Issue](https://github.com/cxapython/CleanDir/issues)
- 💡 提交 [Pull Request](https://github.com/cxapython/CleanDir/pulls)

---

## ⭐ Star History

如果这个项目对你有帮助，请给我们一个 Star ⭐️

---

**让磁盘空间管理变得简单高效！** 🎊✨
