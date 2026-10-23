# 标析 · 招标文件分析助手

[English quickstart](README.en.md)

标析是以本地桌面使用为主的招标文件分析工具：读取主文件与附件，保留原文出处，整理 14 类分析和四项重点输出，帮助人工检查资格、评分、废标风险与承诺材料。

**桌面试用版本为 `v0.5.6-alpha.2`，基于开源候选版 2 整理。** 普通用户请在[安装包版本页](https://github.com/X9728771115-dotcom/biaoxi/releases/tag/v0.5.6-alpha.2)选择 Windows x64、Mac Apple 芯片或 Mac Intel 安装包；可见下载文件后即可下载安装，无需配置开发环境。安装步骤和签名限制见[下载安装说明](docs/desktop-install.md)。自动化检查与真实项目验收分别记录，不能据测试通过认定分析内容准确或企业可以投标。

第一次了解标析，可以先打开[演示与试用版本页（可直接转发）](https://github.com/X9728771115-dotcom/biaoxi/releases/tag/v0.5.6-alpha.1)，或阅读[在线演示图解与完整试用指南](docs/trial/README.md)。看演示无需安装；本轮合成样本的离线试用无需模型 API 或企业资料。

项目主页：[X9728771115-dotcom/biaoxi](https://github.com/X9728771115-dotcom/biaoxi)。普通问题与建议请使用 [Issues](https://github.com/X9728771115-dotcom/biaoxi/issues)；安全漏洞按 [安全说明](SECURITY.md) 私密报告。

## 可以做什么

- 离线读取 PDF、DOC、DOCX、XLSX、XLS、图片和 TXT；扫描内容使用内置中英文 OCR。
- 生成废标项清单、必须加分项、必须承诺内容和投标可行性结论；14 类详细分析保留引文及定位。
- 管理本地企业证照、人员、业绩与产品资料；每份报告保存企业和政策快照。
- 人工核验条款、企业证据和 AI 候选，导出 PDF / Word 报告。
- 可选接入用户配置的模型 API；桌面版另有豆包 / DeepSeek 网页分析实验功能。

完整功能、数据发送条件和已知限制见 [功能与边界](docs/features-and-limits.md)。

候选第 2 次整理修复了同段评分遗漏、重述重复计分及共享封顶边界，并定向替换两处有审计告警的依赖链。政策原件和核对图片不随源码分发，离线事实目录仍可使用；完整来源、显式缓存和重建方法见 [政策目录说明](assets/policies/README.md)。

## 从源码开始

建议使用 **Node.js 22（至少 22.13）与 npm 10.9.8**，并安装用于源码检查及回归测试的 Git 命令行工具。本地候选准备所用环境为 Node.js **22.23.2**、npm **10.9.8**；其他版本需另行验证。

先使用 Git 克隆仓库：

```sh
git clone https://github.com/X9728771115-dotcom/biaoxi.git
cd biaoxi
```

也可在项目主页点击 **Code → Download ZIP**，解压后进入源码目录。然后执行：

```sh
npm ci
npm run dev:safe
```

浏览器默认地址为 [http://127.0.0.1:43221](http://127.0.0.1:43221)，以终端打印的实际地址为准。启动 Electron 桌面开发版（Electron 44 需要显式下载运行时；首次安装或重装依赖后执行第一行）：

```sh
node node_modules/electron/install.js
npm run start:safe
```

本候选的 `npm run dev` / `npm start` 也使用相同隔离启动器。浏览器数据写入本目录 `candidate-data/web`，桌面用户数据写入 `candidate-data/desktop`（报告在其 `data` 子目录）；启动器不沿用外部设置的生产数据目录。开发试验请始终使用这些 npm 命令。

端口占用时保留现有服务，按 [开发指南](docs/development.md#端口与进程) 为浏览器开发版指定空闲的 `BIAOXI_PORT`。详细的目录隔离、构建条件和故障排查也见该指南。

## 验证

```sh
npm run check:source
npm test
npm run test:ocr
```

这些命令检查源码边界、自动化回归和合成扫描样本 OCR。常规 CI 不使用模型密钥、真实企业材料或平台账号。独立的桌面发布工作流在三个原生架构环境构建并检查安装包，成功后仅创建草稿，由维护者复核公开。真实模型 API、网页平台账号流程及真实设备 GUI 仍需单独验证；各版本执行证据见 Release 附件，历史记录见 [验证记录与发布前检查](docs/validation.md)。

## 数据与使用边界

默认分析在本机完成，不内置云同步。选择联网分析并开始本次任务后，所选材料会按对应模式发送给服务商；单纯打开登录窗口不发送材料。真实招标文件、企业原件、报告、账号和密钥不得提交到公开仓库或 Issue。

机器未识别不表示没有要求，引用匹配不表示解读正确；高分不能抵消资格或符合性硬门槛。资料不足、来源不明和未完成复核的事项保持待核验。请逐项对照原件、有效澄清和企业事实，保留人工决策责任。

## 参与与许可

- [贡献指南](CONTRIBUTING.md)：合成样本、变更范围与验证要求。
- [安全说明](SECURITY.md)：漏洞信息处理及私密报告指引。
- [更新记录](CHANGELOG.md)：候选版本说明。
- 项目原创代码采用 [MIT License](LICENSE)；第三方依赖及资源保留各自许可，见 [第三方说明](THIRD_PARTY_NOTICES.md)。MIT 许可不包含商标授权，也不改变招标文件、企业资料及服务商内容的权利归属。
