#!/bin/bash
# 创建通用 macOS 应用（包含 ARM64 和 x86_64）

echo "正在创建通用 macOS 应用..."

# 创建临时目录
mkdir -p /tmp/universal-build

# 解压两个 DMG
echo "解压 ARM64 版本..."
hdiutil attach src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/空间透视_1.0.0_aarch64.dmg -mountpoint /Volumes/SpaceViz-ARM

echo "解压 x86_64 版本..."
hdiutil attach src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/空间透视_1.0.0_x64.dmg -mountpoint /Volumes/SpaceViz-x64

# 复制应用
cp -R "/Volumes/SpaceViz-ARM/空间透视.app" /tmp/universal-build/空间透视-arm64.app
cp -R "/Volumes/SpaceViz-x64/空间透视.app" /tmp/universal-build/空间透视-x64.app

# 卸载 DMG
hdiutil detach /Volumes/SpaceViz-ARM
hdiutil detach /Volumes/SpaceViz-x64

# 创建通用二进制
echo "合并二进制..."
lipo -create \
  "/tmp/universal-build/空间透视-arm64.app/Contents/MacOS/空间透视" \
  "/tmp/universal-build/空间透视-x64.app/Contents/MacOS/空间透视" \
  -output "/tmp/universal-build/空间透视-universal"

# 复制到 ARM64 版本
cp -R "/tmp/universal-build/空间透视-arm64.app" "/tmp/universal-build/空间透视.app"
cp "/tmp/universal-build/空间透视-universal" "/tmp/universal-build/空间透视.app/Contents/MacOS/空间透视"

echo "通用应用已创建: /tmp/universal-build/空间透视.app"
echo "验证架构..."
lipo -info "/tmp/universal-build/空间透视.app/Contents/MacOS/空间透视"

# 清理
rm -rf /tmp/universal-build/空间透视-arm64.app /tmp/universal-build/空间透视-x64.app /tmp/universal-build/空间透视-universal
