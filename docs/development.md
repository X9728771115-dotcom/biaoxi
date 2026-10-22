# 开发指南

## 环境与安装

使用 Node.js 22（至少 22.13）、npm 10.9.8 与 Git 命令行工具。候选准备环境为 Node.js 22.23.2、npm 10.9.8；最低版本声明不表示所有补丁版本均已实测。源码索引检查和隔离工具的回归测试需要 Git，ZIP 用户也应先安装 Git。依赖包含 Electron、OCR 与原生 canvas 模块，首次安装需要下载依赖；安装完成后的默认文件分析可离线运行。

```sh
node --version
npm --version
npm ci
```

使用锁文件安装，不要为了绕过错误随意升级解析器或删除锁文件。SheetJS 包来自仓库内 `vendor`，来源与许可见 [第三方说明](../THIRD_PARTY_NOTICES.md) 和 [vendor/README.md](../vendor/README.md)。

## 隔离启动

```sh
npm run dev:safe
```

浏览器默认使用 [http://127.0.0.1:43221](http://127.0.0.1:43221)。桌面开发版：

```sh
npm run start:safe
```

在本候选里，`npm run dev` 和 `npm start` 也调用同一个隔离启动器。隔离启动器将浏览器数据固定到候选根目录的 `candidate-data/web`，将桌面用户数据固定到 `candidate-data/desktop`，替换继承的 `BIAOXI_DATA_DIR` 和 `BIAOXI_USER_DATA_DIR`，避免使用旧安装的报告与登录状态。桌面报告位于 `candidate-data/desktop/data`。

不要直接用 `electron .` 或直接运行底层入口作为日常开发启动方式：它们绕过上述隔离约定，桌面入口可能使用系统的“标析”用户目录。关闭自己启动的开发进程后，才能备份或清理该候选的 `candidate-data`。

| 模式 | 数据位置 |
| --- | --- |
| 本候选浏览器开发入口 | `candidate-data/web` |
| 本候选桌面开发入口 | `candidate-data/desktop/data`，登录会话等在同一桌面用户数据目录 |
| 原有 Windows 安装包 | `%APPDATA%\标析\data` |
| 原有 macOS 安装包 | `~/Library/Application Support/标析/data` |

源码隔离入口不迁移、清理或覆盖已有安装数据。本候选没有交付新安装包；今后打包出的应用仍按打包程序的系统用户数据规则运行，需要单独安排测试数据隔离。业务数据不要复制进公开源码或测试夹具。

## 端口与进程

浏览器服务绑定 `127.0.0.1`，默认端口 `43221`。若端口占用，先辨认现有服务，保留它，再选择已确认空闲的端口。例如：

macOS / Linux：

```sh
BIAOXI_PORT=43222 npm run dev:safe
```

Windows PowerShell：

```powershell
$env:BIAOXI_PORT = '43222'
npm run dev:safe
```

示例端口也可能已被占用；以终端成功启动后打印的 URL 和数据目录为准。用同一终端的 Ctrl+C 停止自己启动的浏览器进程，桌面窗口正常退出。不要求停止其他服务或关闭旧实例来验证候选。桌面开发服务使用其启动时选择的本地地址，以日志为准。

## 源码与自动化检查

```sh
npm run check:source
npm test
npm run test:ocr
```

- `check:source` 检查公开源码范围及部分敏感内容模式；这是有范围的检查，不是完整泄密扫描。
- `npm test` 执行快速回归。部分需要特定条件的测试会跳过，应保留测试器的跳过统计。
- `test:ocr` 通过跨平台启动器启用 `BIAXI_OCR_TEST=1`，执行包含合成英文及中文扫描材料的 OCR 回归。无需把真实业务文件放入测试目录。
- 测试启动器移除继承的 `BIAXI_REAL*` 私有样本配置；公开 CI 不依赖真实合同或证照目录。

测试的网络模拟、本地服务及浏览器桩不会确认真实模型、真实平台登录、上传授权或业务语义准确。执行结果和未执行检查分别写入 [验证记录](validation.md)。

## CI

[CI 工作流](../.github/workflows/ci.yml) 在 Ubuntu 上执行锁文件安装、源码检查、回归和合成 OCR；只授予 `contents: read`，不持久化 checkout 凭据，不使用模型密钥、平台会话或发布令牌。工作流没有发布、部署、仓库写入或安装包上传步骤。

Action 引用采用官方当前 README 中的主版本标签，见 [checkout](https://github.com/actions/checkout) 和 [setup-node](https://github.com/actions/setup-node)。标签不是不可变提交；维护者可以在核对上游真实提交后改为 SHA 固定，不能编造 SHA。CI 文件存在不表示它已在远端成功运行。

## 打包

```sh
npm run build:win
npm run build:mac
```

Windows 目标是 x64 便携程序，macOS 目标是 arm64 与 x64 ZIP。打包需要目标架构的 `@napi-rs/canvas` 原生包。npm 可能跳过当前系统不适用的可选依赖；跨平台构建前必须核对目标原生依赖、Electron 资源及包内 OCR Worker、语言数据和 WASM，不能只检查是否生成了文件。

项目提供打包资源检查脚本；其执行方式和依赖范围应先阅读 `scripts/package-smoke.mjs`，并在临时打包副本中验证。构建脚本与打包内检查不代表真实目标系统运行通过。macOS 临时签名不等于开发者证书签名或 Apple 公证；Windows 与 Mac Intel 均需要对应设备验证。

此候选没有自动发布任务。公开发布之前，需核对 [验证清单](validation.md) 与 [安全渠道](../SECURITY.md)，再由维护者决定发布范围。
