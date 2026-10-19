# 文印工具箱 (printshop-toolbox)

[![CI](https://github.com/KQai/printshop-toolbox/actions/workflows/ci.yml/badge.svg)](https://github.com/KQai/printshop-toolbox/actions/workflows/ci.yml)
[![Release](https://github.com/KQai/printshop-toolbox/actions/workflows/release.yml/badge.svg)](https://github.com/KQai/printshop-toolbox/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

面向**文印店 / 打印店**的桌面批处理工具。所有转换都在本机完成，**文件不上传、不需要服务器、不需要备案**。

## 功能

| 模块 | 说明 | 需要额外装东西吗 |
|---|---|---|
| **Word 转 PDF** | 批量把 .doc / .docx 转 PDF，保留排版 | 需要 Office 或 LibreOffice |
| **PDF 转 Word** | 转成可编辑的 .docx | 内置引擎免装；保版模式需 LibreOffice |
| **图片转 PDF** | 多图合成一个 PDF，或每图一个；A4/A3/跟随原图尺寸 | 否 |
| **图片格式转换** | 批量转 JPG / PNG / WebP / AVIF，可压缩画质、限制最长边 | 否 |
| **PDF 拼版** | 小页拼大纸，A3 拼 A4 最常用；支持骑马钉对折成册、打印裁切线 | 否 |
| **PDF 合并** | 按自定义顺序合并多个 PDF | 否 |
| **PDF 拆分** | 按固定页数切分，或按页码区间（`1-3, 5, 8-10`）拆分 | 否 |
| **PDF 批量加页码** | 位置/字号/起始页/文字模板（如「第 {n} 页 / 共 {total} 页」） | 否 |

## 快速开始

```bash
npm install          # 国内建议先设置镜像，见下方
npm run dev          # 开发模式，自动打开窗口
npm run build        # 编译到 out/
npm run selftest     # 端到端自测，真实文件跑一遍全部转换
npm run dist         # 打包成 Windows 安装包（输出到 release/）
```

国内网络装依赖时，Electron / sharp 的二进制建议走镜像：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:SHARP_BINARY_HOST="https://npmmirror.com/mirrors/sharp"
$env:SHARP_LIBVIPS_BINARY_HOST="https://npmmirror.com/mirrors/libvips"
npm install
```

## 转换引擎

| 功能 | 引擎 | 说明 |
|---|---|---|
| 图片相关 | `sharp` | 随程序打包，跨平台 |
| PDF 合并/拆分/页码/拼版 | `pdf-lib` | 纯 JS，零依赖 |
| PDF 转 Word（默认） | `pdf-parse` | 纯 JS 提取文字，**免安装**；保留文字与换行，不保留原排版/图片/表格 |
| PDF 转 Word（保版） | LibreOffice | 尽量保留版式，复杂排版仍可能走形 |
| Word 转 PDF | Office COM / LibreOffice | 启动时自动探测 |

首次启动会做一次环境探测并在界面上提示哪种引擎可用。

## 目录结构

```
src/
  main/                 Electron 主进程（所有重活在这里，Node 环境）
    index.ts            创建窗口、应用生命周期
    ipc.ts              所有 IPC 接口 + 进度上报
    tools/
      office.ts         Word→PDF（Office COM / LibreOffice）、环境探测
      pdf2word.ts       PDF→Word（文字提取 / LibreOffice）
      images.ts         sharp 图片转换、图片合成 PDF
      pdf.ts            PDF 合并/拆分/加页码
      impose.ts         PDF 拼版（N-up、骑马订、裁切线）
      paths.ts          输出路径与重名处理
  preload/              contextBridge 暴露给界面的 API
  renderer/             React 界面
    src/tools/          八个功能页
    src/components/     拖拽选择、进度条、结果面板
  shared/types.ts       主进程与界面共享的类型
scripts/selftest.mjs    端到端自测（含 zip / 几何单元测试）
.github/workflows/      CI 与自动打包发布
```

## 技术要点

踩过的坑，记下来省得重踩：

- **拖拽取路径**：Electron 29+ 移除了 `File.path`，必须用 preload 里的 `webUtils.getPathForFile`。
- **PowerShell 脚本编码**：含中文的 `.ps1` 必须以 **UTF-8 BOM** 写入，否则 PowerShell 5.1 会按 ANSI 解析导致乱码。
- **Word COM 调用**：`SaveAs` 的文件名要先用变量承接再 `[ref]` 传入；`Quit()` 可能抛 RPC 异常，必须 try/catch 包住。
- **LibreOffice 并发**：必须给每个进程独立的 `-env:UserInstallation` 配置目录，否则并发会崩。
- **中文页码**：`pdf-lib` 内置字体不含中文，通过 `@pdf-lib/fontkit` 嵌入系统字体（simhei / simkai 等）。
- **拼版旋转页**：PDF 的 `/Rotate` 是「顺时针显示」，而 pdf-lib 的 `rotate` 是逆时针，两者要换算；旋转后页面的实际占位宽高会交换，放置点也要跟着换算（见 `placeRotated`，有单元测试覆盖 0°/90°/270°）。
- **打包**：`sharp` 是原生模块，需要在 `electron-builder.yml` 里 `asarUnpack` 出来才能加载。
- **自测里读 .docx**：docx 是 zip，且写入器常使用 data descriptor（本地头里尺寸写 0），必须走**中央目录**才能拿到可信的压缩尺寸。

## 已知限制

- **PDF 转 Word 不保版**：默认引擎只提取文字，图片、表格、分栏会丢失。需要保留版式请装 LibreOffice 用保版模式，或使用商业服务。
- **扫描件（图片型 PDF）** 提取不出文字，程序会提示你。OCR 尚未实现。
- **Word 转 PDF 依赖 Office/LibreOffice**，两者都没有时该功能不可用（其他功能不受影响）。

## 发布新版本

```bash
# 改完代码，提交并打 tag
git add -A
git commit -m "feat: ..."
git push
git tag v0.2.0
git push origin v0.2.0
```

推到 `v*` 开头的 tag 后，GitHub Actions 会自动在 `windows-latest` 上打包出安装包，并创建对应的 Release 附件。

## 路线图

- [ ] 扫描件 OCR（Tesseract / PaddleOCR）
- [ ] PDF 加水印 / 加盖公章位
- [ ] 批量重命名
- [ ] PDF 压缩
- [ ] 更多拼版方案（一页多图、按裁切尺寸自动分块）

## 贡献

欢迎提 Issue 和 PR。提交前请确保：

```bash
npm run typecheck && npm run selftest
```

全部通过。

## 许可

[MIT](LICENSE)
