# 文印工具箱（printshop-toolbox）

面向**文印店 / 打印店**的桌面批处理工具。所有转换都在本机完成，**文件不上传、不需要服务器、不需要备案**。

## 功能

| 模块 | 说明 |
|---|---|
| **Word 转 PDF** | 批量把 .doc / .docx 转 PDF，保留排版。自动调用本机 Microsoft Office，没有 Office 时回退到 LibreOffice |
| **图片转 PDF** | 多张图片合成一个 PDF（可选 A4/A3/跟随图片尺寸、纸张方向、页边距），或每张图片各生成一个 PDF |
| **图片格式转换** | 批量转 JPG / PNG / WebP / AVIF，可压缩画质、限制最长边。透明图转 JPG 时自动铺白底 |
| **PDF 合并** | 按自定义顺序合并多个 PDF（列表里可用 ↑↓ 调序） |
| **PDF 拆分** | 按固定页数切分，或按页码区间（`1-3, 5, 8-10`）拆分 |
| **PDF 批量加页码** | 自定义位置/字号/起始页码/文字模板（如「第 {n} 页 / 共 {total} 页」），原件不改动 |

## 快速开始

```bash
npm install          # 国内建议先设置镜像，见下方
npm run dev          # 开发模式，自动打开窗口
npm run build        # 编译到 out/
npm run selftest     # 端到端自测，真实文件跑一遍全部转换
npm run dist         # 打包成 Windows 安装包（输出到 release/）
```

国内网络装依赖时，Electron 二进制建议走镜像：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:SHARP_BINARY_HOST="https://npmmirror.com/mirrors/sharp"
$env:SHARP_LIBVIPS_BINARY_HOST="https://npmmirror.com/mirrors/libvips"
npm install
```

## 转换引擎说明

| 功能 | 依赖 | 备注 |
|---|---|---|
| 图片相关、PDF 相关 | 无外部依赖 | 用 `sharp` + `pdf-lib`，随程序打包 |
| Word 转 PDF | **Microsoft Office** 或 **LibreOffice** | 启动时自动探测；两者都没有时界面会给出提示 |

**给客户装机时**：Office/WPS 是国内文印店的标配，通常不用额外装东西。如果目标机器什么都没有，引导安装免费的 LibreOffice 即可（约 300MB）。

## 目录结构

```
src/
  main/                 Electron 主进程（所有重活在这里，Node 环境）
    index.ts            创建窗口、应用生命周期
    ipc.ts              所有 IPC 接口 + 进度上报
    tools/
      office.ts         Word→PDF（Office COM / LibreOffice）、环境探测
      images.ts         sharp 图片转换、图片合成 PDF
      pdf.ts            PDF 合并/拆分/加页码
      paths.ts          输出路径与重名处理
  preload/              contextBridge 暴露给界面的 API
  renderer/             React 界面
    src/tools/          六个功能页
    src/components/     拖拽选择、进度条、结果面板
  shared/types.ts       主进程与界面共享的类型
scripts/selftest.mjs    端到端自测
```

## 技术要点

- **拖拽取路径**：Electron 29+ 移除了 `File.path`，必须用 preload 里的 `webUtils.getPathForFile`。
- **PowerShell 脚本编码**：含中文的 .ps1 必须以 **UTF-8 BOM** 写入，否则 PowerShell 5.1 会按 ANSI 解析导致乱码。
- **Word COM 调用**：`SaveAs` 的文件名要先用变量承接再 `[ref]` 传入；`Quit()` 可能抛 RPC 异常，必须 try/catch 包住。
- **LibreOffice 并发**：必须给每个进程独立的 `-env:UserInstallation` 配置目录，否则并发会崩。
- **中文页码**：`pdf-lib` 内置字体不含中文，通过 `@pdf-lib/fontkit` 嵌入系统字体（simhei / simkai 等）。
- **打包**：`sharp` 是原生模块，需要在 `electron-builder.yml` 里 `asarUnpack` 出来才能加载。

## 后续可加的功能

- PDF 转 Word（LibreOffice `--convert-to docx`，或接 `pdf2docx`）
- 扫描件 OCR（PaddleOCR / Tesseract）
- 拼版：A3 拼 A4、一页多图、骑马钉排序
- 批量加水印 / 加盖公章位 / 批量重命名
- 授权码激活（机器码 + 离线校验）

## 合规提示

本工具是**一次性买断的本地软件**，不运营网站、不提供在线服务、不做订阅，符合「财产转让所得 / 著作权许可」的合规路径。

⚠️ 注意避免把功能做成「与本职工作相关的教务工具」，也不要自己长期运营收费的在线服务（那属于持续性经营活动）。
