# 标析离线采购产品政策包

`cn-gpp-2019-2025.1.json` 是官方附件的版本化事实转录，包含节能43叶品目、环境标志92叶品目、绿色建材109小类和101实施市/区。本源码仅携带离线目录和来源元数据，不携带官方 PDF、DOCX、网页副本或原件核对图片。每一来源保留官方 URL、发布时间/适用生效时间、核对日期和 SHA256。内部版本 `cn-gpp-2019-2025.1-oss.1` 只修正分发说明，政策事实与判定规则没有更新；旧 `localFile` 字段是历史来源定位，不表示源码内存在原件。

转录保留2019目录原始品目编码，不能把原编码宣称为现行采购分类编码。节能、环境目录的标准列是官方目录原文；具体认证应依据相关标准最新版本，离线附件不能证明核对日期之后没有修订。目录2019发布日期与执行机制2019-04-01生效日分别记录。绿色 `GM2025:条款:小类序号` 为包内引用编号，不是国家采购编码。绿色sourcePage指需求标准的印刷页码，sourceTable/sourceRow定位表1目录，clause指详细技术要求。

官方《需求标准》DOCX保留全部技术指标、禁止使用目录和附录，不把详细指标约化为通用合格判断。表1粗体表示必选；钢结构构件仅钢结构建筑必选，混凝土结构构件仅装配式混凝土结构建筑必选。绿色可选类40%按本项目涉及小类数量计算；只有同一小类实际绿色用量达到80%时才计为选用了该小类，不按采购金额计算。

需要原件时，维护者在仓库根目录显式执行 `node scripts/cache-policy-sources.mjs`。脚本只读取记录的财政部域名，拒绝重定向，在写入被 Git 忽略的 `policy-source-cache/` 前核对 SHA256；内容变化或读取失败时停止，不替换政策快照。

安装 pdfplumber 和 python-docx 的 Python 3 环境可运行 `python3 assets/policies/build-official-catalog.py --output rebuilt-policy.json` 从缓存重建；脚本还会再次检查原件哈希。`--source-dir` 可选择已核验的私有缓存。本次使用保全原件重建，结果与候选 JSON 逐字节一致。应用运行只读取 JSON，没有 Python、网络或后台更新依赖。重建后须再次检查原件、日期和变更，并保持政策版本与报告快照一致。政策包导入器仅接受有界普通 JSON 及显式支持的字段，不执行用户正则、规则代码或原件 HTML。

核心接口：

- `DEFAULT_POLICY_PACKAGE`：深冻结内置包。
- `validatePolicyPackage(pkg)`：非法数据抛错，成功返回独立副本，最大2MB。
- `analyzeProcurementPolicy({documents,companySnapshot,projectContext,policyPackage,asOf})`：返回version、asOf、policySources、applicability、products、warnings、summary。

建议projectContext明确governmentProcurement、projectDate、region（市/区）、projectType、localImplementationConfirmed、buildingStructure。分析日期不能替代项目适用日期。地方/日期/项目类型不足和既往版本适用不清均待核验；其他工程或地方扩围不能直接断言不适用。

项目定位与官方定位分开。产品来源保留文件、块、页/工作表、原行和原引文；无品目命中的真实材料保留unknown/pending。目录条件示例、报价/资格/评分表、拆除和措施费不作为产品，BOQ特征列及跨页行可提供材料证据。这里只做可追溯资料支持，不承诺抽取所有清单子材料；详细特征原文保留供人工补查。

满足（met）必须同时有明确项目制造商及型号、匹配产品类别、合适证件类型、确切型号覆盖、有效起止日和有效状态、人工确认产品条目和原件证明关系，并且核心字段能追溯到同一份已核验原件。经销商可持制造商原件，无需与制造商同名。CCC/ISO不替代节能或环境认证。绿色检测报告只有对应本版本与小类全部适用指标的确认材料才能支持；一般检测报告不能自动替代。

met只说明证据链支持产品证明，不代表实际用量满足绿色40%/80%、证件在线实时查询完成、全部投标响应符合或项目验收通过。招标“不涉及”与外部政策候选冲突时保留双方来源并待澄清，不修改招标原事实，不新增废标条件。

已确认的历史冲突可保留 `recognition.conflicts[].resolved=true`；只有仍未解决的冲突阻止资料支持。人工解决标记不替代制造商、具体型号、证件类型、日期、状态和同一原件一致性。原件标识按完整字段/型号列表及标识边界核对，不能以WT-10证明WT-1或从备注借用型号。绿色检测报告的否定、不合格、未通过结论不得判为met，肯定结论须对应本型号及本小类条款。

拆旧装新清单以实际采购/安装片段匹配新产品，同时保留整行原引文；删除的旧产品不作为新采购，旧产品型号不赋予新产品。附件、支架等须与设备整机区分，不因整行出现整机名称生成强制品目。

## 开源候选包的来源与许可边界

本目录保留财政部政策目录的事实转录和项目编写的匹配注释。原始 PDF、DOCX、网页副本及 QA 图片已从公开候选移出，在任务私有证据中保全；原工程资料不受影响。下表来源 URL 和原件 SHA256 沿用 `sources` 记录；2026-10-23 移出前逐项核对哈希一致。本次没有重新下载官方文件，也未据“公开可访问”推断任意再分发授权。

| 来源 | 历史原件名（不随包） | 官方来源 | SHA-256 |
| --- | --- | --- | --- |
| 财库〔2019〕9号：节能、环境标志采购执行机制 | `official/authority-2019.html` | [原始来源](https://gks.mof.gov.cn/ztztz/zhengfucaigouguanli/201902/t20190212_3146225.htm) | `f818c6c7959bb78ebe11244b58979ff6d1ad3e30067caeac34625686ccd3e353` |
| 节能产品政府采购品目清单（财库〔2019〕19号附件） | `official/energy-2019.pdf` | [原始来源](https://gks.mof.gov.cn/ztztz/zhengfucaigouguanli/201904/P020190404409422168443.pdf) | `e34c0e40c91bcddc24b80eb69a6de72e559c76394e9f6c7446a5acf7da347c96` |
| 环境标志产品政府采购品目清单（财库〔2019〕18号附件） | `official/environment-2019.pdf` | [原始来源](https://gks.mof.gov.cn/ztztz/zhengfucaigouguanli/201903/P020190329702478575295.pdf) | `fad6d06b5edaa8173031143d15b30ee33da17b5f11f08b65ccf28f49ca78c3a0` |
| 财库〔2024〕36号：扩大绿色建材政策实施范围 | `official/green-material-2025.html` | [原始来源](https://gks.mof.gov.cn/guizhangzhidu/202501/t20250110_3951449.htm) | `1b972799f441741aafed7a8f2c89143cfdbfdc8444f97040c3abf0a534e6e963` |
| 绿色建筑和绿色建材政府采购需求标准（2025年版） | `official/green-material-standard-2025.docx` | [原始来源](https://gks.mof.gov.cn/guizhangzhidu/202501/P020250110319997903210.docx) | `e5129a4352c32f1d86cac9bcb9bf3185e34b8cf370086be8229086b974e75612` |
| 政府采购支持绿色建材政策实施城市名单（101市、区） | `official/green-material-cities-2025.docx` | [原始来源](https://gks.mof.gov.cn/guizhangzhidu/202501/P020250110319997676870.docx) | `f061745bad25c2e2362b8ef47b41109ed3ce5cd173173aa4e59dd68d577faa34` |

MIT 只覆盖项目原创代码与注释，不向官方文件或附件中的第三方内容授予新许可。官方原件和核对图不进入源码及安装包，因此本候选不替这些原件决定再分发授权。目录项、标准名称及实施地域等作为可追溯事实记录保留，完整技术指标须查看官方来源，转录不是官方正式版本或授权结论。[全国人大法规库的著作权法文本](https://wb.flk.npc.gov.cn/flfg/PDF/3d00c03d87cf4863878081a3e1b54638.pdf)第五条对具有行政性质的国家机关文件等有专门规定；这不是对任意网页模板、附件第三方内容或后续分发行为的概括授权。

如果以后另行发布官方原件缓存或在安装包附带原件，应单独重新核对其权利与声明，不能取消本候选的排除规则。不要把客户或公司的非公开原件放入本目录；演示与测试使用合成材料。机器可读记录见 [policy-source-manifest.json](../../third_party/policy-source-manifest.json)。
