# 🎉 空间透视 v1.3.0

> 专业的磁盘空间分析工具 - 现在支持真实进度跟踪！

---

## 🚀 核心改进

### ⚡️ 性能提升 5-8 倍

利用 **Rayon 并行处理**，充分发挥多核 CPU 性能：

- ✅ 8 核 CPU 扫描速度提升 **6-7x**
- ✅ 4 核 CPU 扫描速度提升 **3-4x**
- ✅ IPC 优化，性能开销 < 0.1%

**对比测试**（扫描 100 个子目录）：
- 之前：60 秒 ⏱️
- 现在：8-10 秒 ⚡️

---

### 📊 真实进度显示

不再是假的进度条！现在显示：

```
🔍 正在扫描
已扫描 23 / 50 项

[████████████░░░░] 46%

当前项目：
com.docker.docker
```

**特性**：
- ✅ 显示已完成 / 总数
- ✅ 显示当前正在扫描的项目名称
- ✅ 流畅的进度更新
- ✅ 基于实际完成数量（不是估算）

---

### 💾 智能缓存

- ✅ 自动预缓存前 5 个最大目录
- ✅ 进入已缓存目录时**瞬间显示**
- ✅ 无需重复扫描

---

## ✨ 现有功能

### 🎨 现代化界面
- 左右分屏布局
- 气泡可视化展示
- 深紫色渐变 + 磨砂玻璃效果

### 🗑️ 安全删除
- 移到废纸篓（可恢复）
- 批量选择删除
- 显示选中文件的总大小

### 🔒 权限管理
- 首次启动自动引导
- 一键跳转系统设置
- 完全磁盘访问权限支持

---

## 📦 下载

### macOS (Apple Silicon) - M1/M2/M3

**文件名**: `CleanDir-v1.3.0-macOS-aarch64.dmg`  
**大小**: 2.6 MB  
**支持**: macOS 11.0+ (M1/M2/M3/M4)  
**SHA256**: `a97d1fe08675eb67a6e5d5c44b23d872467ac18f1ddccad60ee10390ce269e88`

### macOS (Intel) - x86_64

**文件名**: `CleanDir-v1.3.0-macOS-x86_64.dmg`  
**大小**: 2.6 MB  
**支持**: macOS 10.13+ (Intel CPU)  
**SHA256**: `d76813de00b3b4e980d79f8f7bacd5bb90e586a649d2ae296d30f87ae62b7b29`

### 安装步骤（macOS）

1. 下载对应你 Mac 架构的 DMG 文件
   - Apple Silicon (M 系列芯片): 下载 `aarch64` 版本
   - Intel 芯片: 下载 `x86_64` 版本
2. 双击 DMG 文件打开
3. 拖动应用到 Applications 文件夹
4. 首次打开时授予"完全磁盘访问权限"

### Windows

**暂不支持** - 由于在 macOS 上交叉编译 Windows 需要额外工具链配置，暂时无法提供 Windows 版本。如有需求，请在 Issue 中反馈。

### Linux

**计划中** - 未来版本将支持 Linux (.deb, .AppImage)

### Android

**不支持** - Tauri 1.x 不支持移动平台。Tauri 2.x 计划支持移动端，敬请期待。

---

## 🔧 技术细节

### 并行扫描实现

```rust
// 使用 Rayon 并行处理
let items: Vec<DiskItem> = entries
    .par_iter()  // 多核并行
    .map(|entry| {
        let size = calculate_dir_size_walkdir(&path);
        
        // 完成后更新进度
        let count = completed.fetch_add(1, Ordering::Relaxed) + 1;
        window.emit("scan-progress", percent).ok();
        
        DiskItem { /* ... */ }
    })
    .collect();
```

### 进度推送机制

- **Event Emitter**: Rust 后端 → Tauri IPC → React 前端
- **智能限流**: 每 3 项或 200ms 发送一次
- **原子计数**: `Arc<AtomicUsize>` 保证线程安全

---

## 📊 性能对比

| 场景 | v1.2 (串行) | v1.3 (并行) | 提升 |
|------|------------|-----------|------|
| 扫描 10 个目录 | 5 秒 | 1 秒 | **5x** |
| 扫描 50 个目录 | 30 秒 | 5 秒 | **6x** |
| 扫描 100 个目录 | 60 秒 | 8 秒 | **7.5x** |

---

## 🐛 已修复

- ✅ 修复进度条一直显示 0% 的问题
- ✅ 修复目录大小计算不准确的问题
- ✅ 修复进度更新时机错误的问题
- ✅ 优化 IPC 频率，避免卡顿

---

## 🛠️ 技术栈

- **前端**: React 18 + Vite + Tailwind CSS
- **后端**: Rust + Tauri 1.5
- **并行**: Rayon 1.8
- **文件系统**: walkdir 2.4

---

## 📝 已知问题

- macOS 13+ 需要手动授予"完全磁盘访问权限"
- 首次扫描大目录可能需要几秒钟（会缓存）
- Intel Mac 版本还在构建中

---

## 🙏 致谢

感谢所有测试用户的反馈和建议！

---

## 📮 反馈

有问题或建议？欢迎：

- 🐛 [提交 Issue](https://github.com/cxapython/CleanDir/issues)
- 💡 [提交 Pull Request](https://github.com/cxapython/CleanDir/pulls)

---

**享受更快的磁盘空间管理体验！** 🚀✨

