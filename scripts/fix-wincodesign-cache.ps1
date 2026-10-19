<#
  打包前置修复：准备 winCodeSign 缓存。

  背景
  ----
  electron-builder 打包 Windows 安装包时要下载 winCodeSign 工具包（里面是
  rcedit / signtool），而这个 7z 压缩包里含有 macOS 的符号链接文件。
  Windows 上普通用户没有创建符号链接的权限（需要管理员，或者打开
  「设置 → 系统 → 开发者选项 → 开发人员模式」），7-Zip 解压时会报：

      ERROR: Cannot create symbolic link : 客户端没有所需的特权
      ...\darwin\10.12\lib\libcrypto.dylib

  并以退出码 2 结束，electron-builder 认为解压失败而中止打包，界面上的报错
  是「cannot execute cause=exit status 2」，看起来跟项目本身毫无关系。

  GitHub Actions 的 runner 以管理员运行，所以 CI 不会遇到这个问题。

  解决办法
  --------
  手动把该包解压到 electron-builder 的缓存目录，跳过 macOS 专属的那两个符号
  链接（Windows 构建用不到）。electron-builder 发现缓存已存在就会直接复用。

  用法
  ----
      powershell -ExecutionPolicy Bypass -File scripts\fix-wincodesign-cache.ps1

  正常情况下不需要手动跑：本机缓存已经准备好，只有缓存被清掉后才需要再执行一次。
#>

$ErrorActionPreference = 'Stop'

$mirror = 'https://npmmirror.com/mirrors/electron-builder-binaries'
$name   = 'winCodeSign-2.6.0'
$cache  = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign"
$target = Join-Path $cache $name

if (Test-Path (Join-Path $target 'rcedit-x64.exe')) {
  Write-Host "[OK] winCodeSign 缓存已就绪：$target"
  exit 0
}

$sevenZip = Join-Path $PSScriptRoot '..\node_modules\7zip-bin\win\x64\7za.exe'
if (-not (Test-Path $sevenZip)) {
  throw "找不到 $sevenZip，请先执行 npm install"
}

New-Item -ItemType Directory -Path $cache -Force | Out-Null
$archive = Join-Path $cache "$name.7z"

if (-not (Test-Path $archive)) {
  Write-Host "[..] 下载 $name.7z"
  & curl.exe -sL "$mirror/$name/$name.7z" -o $archive
}

if (-not (Test-Path $archive)) {
  throw "下载失败，请手动下载 $mirror/$name/$name.7z 放到 $cache"
}

if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item -ItemType Directory -Path $target -Force | Out-Null

# 清掉之前失败留下的临时目录
Get-ChildItem $cache -Directory | Where-Object { $_.Name -match '^\d+$' } |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[..] 解压中（macOS 符号链接的报错可忽略）"
& $sevenZip x $archive "-o$target" -bd -y | Out-Null

if (Test-Path (Join-Path $target 'rcedit-x64.exe')) {
  Write-Host "[OK] 完成。现在可以运行 npm run dist 了。"
} else {
  throw "解压后没找到 rcedit-x64.exe，请检查上面的报错信息。"
}
