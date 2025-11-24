#!/bin/bash
# 创建简单的彩色图标
sips -z 32 32 icon.png --out 32x32.png 2>/dev/null || cp icon.png 32x32.png
sips -z 128 128 icon.png --out 128x128.png 2>/dev/null || cp icon.png 128x128.png
sips -z 256 256 icon.png --out 128x128@2x.png 2>/dev/null || cp icon.png 128x128@2x.png

# 创建 icns (macOS)
if [ -f "/usr/bin/iconutil" ]; then
    mkdir -p icon.iconset
    sips -z 16 16 icon.png --out icon.iconset/icon_16x16.png 2>/dev/null
    sips -z 32 32 icon.png --out icon.iconset/icon_16x16@2x.png 2>/dev/null
    sips -z 32 32 icon.png --out icon.iconset/icon_32x32.png 2>/dev/null
    sips -z 64 64 icon.png --out icon.iconset/icon_32x32@2x.png 2>/dev/null
    sips -z 128 128 icon.png --out icon.iconset/icon_128x128.png 2>/dev/null
    sips -z 256 256 icon.png --out icon.iconset/icon_128x128@2x.png 2>/dev/null
    sips -z 256 256 icon.png --out icon.iconset/icon_256x256.png 2>/dev/null
    sips -z 512 512 icon.png --out icon.iconset/icon_256x256@2x.png 2>/dev/null
    sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png 2>/dev/null
    sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png 2>/dev/null
    iconutil -c icns icon.iconset -o icon.icns
    rm -rf icon.iconset
fi

# 创建空的 ico (Windows)
touch icon.ico

echo "✅ 图标文件创建完成"
