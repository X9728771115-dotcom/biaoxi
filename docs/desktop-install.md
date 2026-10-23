# 标析开源试用版：下载安装

本文对应 **v0.5.6-alpha.2**。请打开[本版下载与验证记录](https://github.com/X9728771115-dotcom/biaoxi/releases/tag/v0.5.6-alpha.2)，以可见的 Release 附件 JSON 和关联的 GitHub Actions 构建记录为准。若版本页或下面的下载链接尚不可用，表示该版本尚未公开或附件未就绪，请等待发布。

本版面向试用反馈。自动化检查与真实项目验收分开记录；分析结果需要结合原文和业务证据复核，不能直接作为可投标结论。

## 1. 选对下载文件

打开版本页，找到 **v0.5.6-alpha.2**，展开下方 **Assets**（下载文件）。普通下载安装不需要 GitHub 账号，也不需要安装 Node.js、npm 或开发工具。

| 你的电脑 | 推荐下载 | 系统要求 |
| --- | --- | --- |
| Windows 电脑，x64 处理器 | [biaoxi-oss-0.5.6-alpha.2-windows-x64-setup.exe](https://github.com/X9728771115-dotcom/biaoxi/releases/download/v0.5.6-alpha.2/biaoxi-oss-0.5.6-alpha.2-windows-x64-setup.exe) | Windows 10 / 11，x64 |
| Mac，Apple 芯片（M1、M2、M3 等） | [biaoxi-oss-0.5.6-alpha.2-arm64-mac.dmg](https://github.com/X9728771115-dotcom/biaoxi/releases/download/v0.5.6-alpha.2/biaoxi-oss-0.5.6-alpha.2-arm64-mac.dmg) | macOS 13 或以上 |
| Mac，Intel 处理器 | [biaoxi-oss-0.5.6-alpha.2-x64-mac.dmg](https://github.com/X9728771115-dotcom/biaoxi/releases/download/v0.5.6-alpha.2/biaoxi-oss-0.5.6-alpha.2-x64-mac.dmg) | macOS 13 或以上 |

Mac 点左上角苹果菜单 →“关于本机”，查看“芯片”或“处理器”；Apple M 系列选 arm64，Intel 选 x64。Windows 可在“设置 → 系统 → 系统信息/关于”查看系统类型。本轮没有 Windows ARM 原生包。

备用文件：Windows 可选 `biaoxi-oss-0.5.6-alpha.2-windows-x64-portable.exe`；Mac 可选对应架构的 `biaoxi-oss-0.5.6-alpha.2-arm64-mac.zip` 或 `biaoxi-oss-0.5.6-alpha.2-x64-mac.zip`。GitHub 自动提供的 **Source code (zip/tar.gz)** 是源码，不是安装包。

## 2. 安装并打开

**Windows 推荐安装版：** 下载后双击 `setup.exe`，按系统提示完成安装，从桌面或开始菜单打开“标析开源试用版”。如选择 portable 便携版，把文件放在自己可写的文件夹后双击运行；便携版同样会在系统用户数据目录保存分析记录。

**Mac 推荐 DMG：** 双击 `.dmg`，把“标析开源试用版”拖到“应用程序”，完成复制后弹出磁盘映像，再从“应用程序”打开。若使用备用 ZIP，先完整解压，再把其中的“标析开源试用版.app”放入“应用程序”。

**首次打开可能被系统拦截。** 当前没有开发者签名或 Apple 公证；Mac 包中的本地 ad-hoc 签名不代表 Apple 已认可开发者身份。请先核对下载版本、文件名和校验值，只有使用者本人愿意信任此来源时，才通过系统提供的确认入口手动打开。若没有可用的确认入口，请停止并反馈；不要关闭系统保护。单位管理的电脑请遵循单位软件安装规定。

首次进入后，可先用不含个人或企业敏感信息的合成样本试用，检查原文、分析结果以及 PDF / Word 导出。本轮离线分析无需配置模型 API 密钥。真实资料的识别、分析与结论仍需人工复核。

## 3. 原标析和数据在哪里

本版的程序名和数据目录都为“标析开源试用版”，与原“标析”分开。它**不会自动导入、迁移或改动原标析程序及其数据**。

| 系统 | 本版用户数据目录 |
| --- | --- |
| Windows | `%APPDATA%\标析开源试用版` |
| macOS | `~/Library/Application Support/标析开源试用版` |

这里保存本版的分析记录和设置。关闭并重新打开程序后，记录应保留。Windows 安装版卸载后也不会自动删除这些数据。暂时不要手动合并两个版本的数据目录；如需清理或迁移，请先另存备份并确认范围。

## 4. 核对下载及了解验证范围

同一版本的 Assets 还会提供 `SHA256SUMS.txt`、这份 `desktop-install.md`，以及三套组件清单、包内核心功能和启动验证 JSON。SHA-256 用于确认下载内容与该版本公布的文件一致，不能代替开发者签名或 Apple 公证。

愿意做校验的用户可以使用系统自带命令，只读取下载文件：

- Windows：在 PowerShell 输入 `Get-FileHash -Algorithm SHA256 -LiteralPath `（末尾有空格），再拖入下载文件后回车；把显示的 Hash 与 `SHA256SUMS.txt` 中同名文件一行比较。
- Mac：在终端输入 `shasum -a 256 `（末尾有空格），再拖入下载文件后回车；把显示的值与 `SHA256SUMS.txt` 中同名文件一行比较。

发布工作流要求源码、回归和 OCR 检查，以及三个目标平台的包内核心功能、最终安装产物启动和重启检查成功后，才创建草稿。下载可见后，请以该 Release 附带的组件清单、`core-smoke`、`startup-smoke` JSON 和关联构建记录了解实际验证结果，不能把工作流配置当成已经通过。**真实设备 GUI 点击验收仍为 NOT_RUN**；自动化合成样本检查也不能代替真实项目的业务验收。

遇到问题，可在 [反馈页](https://github.com/X9728771115-dotcom/biaoxi/issues/new/choose) 提交系统版本、芯片/架构、下载文件名、出现步骤和已脱敏的错误截图。不要上传企业原件、人员证件、接口密钥或个人数据目录。
