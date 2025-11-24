# 平台支持说明

## ✅ 当前支持的平台

### macOS

| 架构 | 文件名 | 大小 | 最低系统要求 | 状态 |
|------|--------|------|-------------|------|
| Apple Silicon (ARM64) | `CleanDir-v1.3.0-macOS-aarch64.dmg` | 2.6 MB | macOS 11.0+ | ✅ 已发布 |
| Intel (x86_64) | `CleanDir-v1.3.0-macOS-x86_64.dmg` | 2.6 MB | macOS 10.13+ | ✅ 已发布 |

**功能完整性**: 100%  
**性能**: 原生性能，充分利用多核 CPU

---

## ❌ 当前不支持的平台

### Windows

**状态**: 暂不支持  
**原因**: 
- 在 macOS 上交叉编译 Windows 需要额外的工具链配置
- 需要安装 `mingw-w64` 或设置 Windows 交叉编译环境
- Windows 特定的 API 调用（如删除到回收站）需要重写

**未来计划**:
- 使用 GitHub Actions 在 Windows 环境下构建
- 预计 v1.4.0 支持

**如果你需要 Windows 版本**:
1. 在 Issue 中投票或评论
2. 如果有 Windows 机器，可以自行构建：
   ```bash
   git clone https://github.com/cxapython/CleanDir.git
   cd CleanDir
   npm install
   npm run tauri build
   ```

---

### Linux

**状态**: 计划中  
**原因**: 
- 需要适配不同的桌面环境（GNOME, KDE, XFCE 等）
- 需要测试不同的发行版（Ubuntu, Fedora, Arch 等）
- 打包格式需要支持 `.deb`, `.rpm`, `.AppImage`

**未来计划**:
- 预计 v1.5.0 支持
- 优先支持 Ubuntu 22.04+

---

### Android / iOS

**状态**: Tauri 1.x 不支持移动平台  
**原因**: 
- Tauri 1.x 架构基于桌面平台设计
- Tauri 2.x 正在开发移动端支持

**未来计划**:
- 等待 Tauri 2.x 稳定后迁移
- 或使用 React Native 重写移动版

---

## 🛠️ 构建指南

### 在 macOS 上构建所有支持的版本

```bash
# ARM64 版本（Apple Silicon）
npm run tauri build -- --target aarch64-apple-darwin

# x86_64 版本（Intel）
npm run tauri build -- --target x86_64-apple-darwin

# 通用版本（包含两个架构，可选）
./build-universal.sh
```

### 在 Windows 上构建 Windows 版本

```bash
# 安装依赖（需要管理员权限）
# 安装 Visual Studio Build Tools 或 Visual Studio

# 构建
npm install
npm run tauri build
```

### 在 Linux 上构建 Linux 版本

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# Fedora
sudo dnf install webkit2gtk4.0-devel \
    openssl-devel \
    curl \
    wget \
    file \
    libappindicator-gtk3-devel \
    librsvg2-devel

# Arch
sudo pacman -S webkit2gtk \
    base-devel \
    curl \
    wget \
    file \
    openssl \
    appmenu-gtk-module \
    gtk3 \
    libappindicator-gtk3 \
    librsvg

# 构建
npm install
npm run tauri build
```

---

## 📊 平台优先级

根据用户需求和开发资源，平台支持的优先级：

1. **macOS (ARM64 + x86_64)** - ✅ 已完成
2. **Windows (x86_64)** - 🔄 计划中（v1.4.0）
3. **Linux (deb + AppImage)** - 🔄 计划中（v1.5.0）
4. **macOS (Universal Binary)** - 🔄 可选
5. **Mobile (Android/iOS)** - 🔄 长期计划（等待 Tauri 2.x）

---

## 🤝 贡献

如果你想帮助支持更多平台：

1. **Windows 用户**: 可以在 Windows 环境下构建并测试
2. **Linux 用户**: 可以在不同发行版上测试兼容性
3. **开发者**: 欢迎提交 PR 适配不同平台

---

## 📮 反馈

需要特定平台支持？请：
- 🐛 [提交 Issue](https://github.com/cxapython/CleanDir/issues)
- 💬 说明你的操作系统和使用场景
- ⭐ 给项目 Star 以支持开发

---

**更新时间**: 2024-11-24  
**文档版本**: 1.0

