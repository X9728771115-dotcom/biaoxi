# 依赖审计与定向替换

核对日期：2026-10-23。范围：0.5.6 本地开源候选的 npm 生产及开发依赖；尚未公开发布。审计结果是该日期依赖树与公告库的快照，不代表没有其他安全问题。

## 问题与上游状态

原生产依赖链为 `mammoth@1.13.0 → argparse@1.0.10 → sprintf-js@1.0.3`。`npm audit --omit=dev` 报告 3 个中危项，它们来自同一底层公告及其传播依赖关系，并非三项独立漏洞。

[GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) 说明 `sprintf-js <=1.1.3` 会将无界精度传给数字格式化方法，可能抛出未捕获的 `RangeError`；核对时没有已发布的修复版本。npm registry 当前的 Mammoth 仍为 1.13.0，依赖旧 argparse；[Mammoth 上游开发分支](https://github.com/mwilliamson/mammoth.js/blob/master/package.json) 已迁移到 argparse 3，但尚不能把开发分支视为新的 npm 发布版本。

标析调用 Mammoth 的 DOCX 库接口。已安装的 Mammoth 包中，`argparse` 由其 `bin/mammoth` 命令行入口使用，库转换接口没有使用该参数解析器。此次复现验证的是依赖中的实际行为，不证明招标正文能控制该格式字符串，也不声称已发现标析远程利用路径。

## 最小修复

在根 `package.json` 中，对两个具体依赖作用域使用精确版本替换：

```json
{
  "overrides": {
    "mammoth": {
      "argparse": "2.0.1"
    },
    "@electron/get": {
      "global-agent": "4.1.3"
    }
  }
}
```

argparse 2.0.1 不依赖 sprintf-js，并保留 Mammoth 1.13.0 CLI 所需的 v1 兼容接口。Mammoth 本身仍是 1.13.0，库代码和应用解析 API 没有更改；打包链的另一项定向替换见下文。argparse 3 [已经移除 v1 兼容 API](https://github.com/nodeca/argparse/blob/master/CHANGELOG.md)，因此没有直接覆盖到 3，也没有接受 `npm audit fix --force` 建议的 Mammoth 0.3.29 回退。

锁文件由 npm 根据相同依赖声明重新计算：删除 Mammoth 内嵌的 argparse 1.0.10 与 sprintf-js 1.0.3，将已存在的 argparse 2.0.1 标记为生产依赖。未手动删除依赖记录、改写审计级别或设置忽略项。`npm ci --omit=dev` 已验证实际生产安装包含 argparse 2.0.1，生产树不再包含 sprintf-js。

## 复现与验证

环境：macOS Apple 芯片，Node.js 22.23.2，npm 10.9.8。安装与测试使用候选源码的独立副本，不操作已有安装数据。

新增回归 `tests/dependency-argparse.test.js`：

- 先在原链运行：超界精度帮助模板抛出公告所述 `RangeError`，安全断言失败；其余两项兼容基线通过。
- 替换后，超界精度模板不再进入 sprintf-js 数字格式化路径，帮助可生成。
- 实际运行 Mammoth CLI，验证帮助、非法输出格式的错误退出、样式映射、带空格的中文输入/输出路径、中文正文与表格。
- 实际调用 Mammoth 库转换同一合成 DOCX，保留中文、比例和表格。

| 命令 / 检查 | 独立副本结果 |
| --- | --- |
| `npm ci --omit=dev` | PASS；实际安装成功 |
| `npm audit --omit=dev --json` | PASS；0 项漏洞 |
| `npm ls --omit=dev mammoth argparse sprintf-js --all` | Mammoth 1.13.0 → argparse 2.0.1，无生产 sprintf-js |
| 完整 `npm ci` | PASS；安装成功，审计 0 项漏洞 |
| 完整 `npm audit --json` | PASS；0 项漏洞，生产和开发链均已检查 |
| `node --test tests/dependency-argparse.test.js` | 3 通过，0 失败 |
| 依赖、提取、Word 格式与导出测试四文件 | 38 项：35 通过、0 失败、3 跳过 |
| `npm test`（两项替换后的独立源码快照） | 1183 项：1180 通过、0 失败、3 跳过 |

四文件命令为：

```sh
node --test tests/dependency-argparse.test.js tests/extractor.test.js tests/word-format-v7.test.js tests/export.test.js
```

其中 OCR 默认关闭的项目按测试器保留跳过记录。Mammoth 的旧 CLI API 在 argparse 2 下会发出弃用警告；这是兼容接口提示，未隐去或当成新的安全修复。独立快照的全量回归不包含复制后发生的并行修改，最终候选仍需按主验证记录重新核对。

## 开发打包链的 8 项告警

生产链修复后，完整审计曾剩余 8 个中危传播项，均来自同一 sprintf-js 公告。上游已发布的 [global-agent 4.1.3](https://github.com/gajus/global-agent/releases/tag/v4.1.3) 不再依赖 roarr / sprintf-js，仍提供 Electron 下载器实际调用的 `bootstrap` 公共接口。因此仅将 `@electron/get` 作用域的 global-agent 替换为 4.1.3；保留 Electron 44.7.0、electron-builder 26.15.3 和其下载器版本，没有为消除告警而降级打包器。

| 原审计项 | 依赖传播位置 | 处理结果 |
| --- | --- | --- |
| sprintf-js | roarr 的实际消息格式化器 | 已移出完整依赖树 |
| roarr | global-agent 3 的日志器 | 已移出完整依赖树 |
| global-agent | @electron/get 的可选代理模块 | 定向替换为官方 4.1.3 |
| @electron/get | app-builder-lib 的 Electron 下载器 | 保留版本；传递告警消除 |
| app-builder-lib | electron-builder 的构建实现 | 保留版本；传递告警消除 |
| dmg-builder | 构建工具内部依赖关系 | 保留版本；传递告警消除 |
| electron-builder-squirrel-windows | 构建工具内部依赖关系 | 保留版本；传递告警消除 |
| electron-builder | 开发打包入口 | 保留版本；传递告警消除 |

global-agent 4 的变更包括 TypeScript 类型迁移及 TLS 默认校验修正，见 [上游 4.0.0 说明](https://github.com/gajus/global-agent/releases/tag/v4.0.0)。其依赖变化同时带来 matcher 4.0.0、serialize-error 8.1.0 和 type-fest 0.20.2；锁文件共有 431 个包记录，移除了只为旧日志链保留的包。

实测验证如下：

- 旧 roarr 启用日志后，`%.101f` 实际抛出 `RangeError`。旧下载器代理初始化会加载 sprintf-js，新增安全回归先失败。
- 替换后，实际调用 `app-builder-lib` 所用 `@electron/get.initializeProxy()`，代理初始化成功且不加载 sprintf-js。
- 使用回环 HTTP 代理和回环源站，验证普通下载地址走代理、`NO_PROXY` 地址直连；合成请求不会访问外网。
- `electron-builder --version` 仍为 26.15.3，`--help` 正常退出。
- 用已准备好的 Electron 44.7.0 运行最小合成 macOS arm64 目录打包；输出应用包含预期合成入口文件，未发布、签名或启动该应用。首次尝试因惰性下载的 Electron 目录尚未准备而停止；准备分发目录后成功。
- 两个依赖测试文件共 5 项全部通过，独立源码快照全量回归结果见上表。

最小合成包只证明此次依赖替换与该构建路径兼容，不是标析完整安装包验收。Windows、Mac Intel、完整应用打包和真实目标设备状态仍以主验证记录为准。

## 剩余边界

npm 安装仍会显示部分上游包弃用提示，它们与本次审计漏洞项不同。真实 API、网页账号、OCR 全样本及完整安装包和目标设备验证不属于本次依赖替换的验收证据。后续升级 Mammoth 或 Electron 下载器时，应先核对新发布包的实际依赖，再删除相应 override 并重跑相关测试、代理兼容检查和完整审计。
