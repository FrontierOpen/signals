# GPT-5.6 Sol 1M 上下文 — 编辑与证据记录

## 状态

- Article ID: `2026-08-18/codex-gpt56-sol-1m-context`
- Format: `bulletin`
- State: local draft
- Event time: 2026-08-17 08:13 Asia/Shanghai
- Rebuilt from scratch: 2026-08-18 16:14 Asia/Shanghai
- Public source: `article.md`
- Previous `work/frontier-signals-new/.../signal.json` draft is discarded and is not a publication source.

## 七行写作简报

1. 读者：使用 ChatGPT 账号登录 Codex、并承担长时间仓库任务的开发者与团队。
2. 触发：Tibo 表示 GPT-5.6 Sol 的 1M 配置从 API Key 路径扩到 ChatGPT 账号用量。
3. 冲突：更大窗口能保留更多原始历史，也会让后续请求携带更多仍然活跃的内容。
4. 最硬材料：Tibo 的两条原帖；OpenAI Sol 模型页；Codex 配置、CLI 与定价文档。
5. 判断：1M 增加的是长任务可使用的历史预算，没有改变默认窗口，也不会自动提高任务质量。
6. 边界：帖子未逐项列明套餐、地区与产品入口；1M/900K 是请求值；没有延迟、成功率或满窗口任务质量数据。
7. 收束：容量增加后，相关性筛选仍然需要由任务与操作者负责。

## 参考文章复读

- 参考 URL: https://mp.weixin.qq.com/s/h1MZ2Fz1RpU6mu89__OsNQ
- 标题: `Codex 一跑长任务就“失忆”？改 3 行配置，把上下文开到 100 万 Token`
- 学习内容：先给长任务的具体症状，再按“用途—单次命令—长期配置—代价”回答读者自然产生的问题；代码块承担视觉停顿，每段只增加一项信息。
- 未沿用内容：原文标题、句子、小标题、第一人称建议、橙色排版与固定结尾。
- 参考文章只用于结构校准，不进入 sources 或 claims。

## 人类编辑样本研究

下列五篇只用于编辑方法研究，不进入公开 sources 或 claims。

### 《AI 生成的书卖不动，却让人类作者更穷了》

- URL: https://mp.weixin.qq.com/s/uGHQHbVOnEbg4-8R8iobMQ
- 开头把“人类作者收入下降”和“45 分钟生成一本书”并置，再用问题把两个场景锁成一条主线。
- 数据段遵循“数字—白话解释—反例—边界—判断”，反例真正负责排除“大盘整体下跌”等替代解释。
- Coral Hart 在开头出现，数据验证后再次回归，人物成为结构回环，不只是装饰案例。
- 不沿用其标题中的强因果、本雅明/阿多诺式连续升华、作者自我表演与文学价值的过度外推。

### 《Claude 的文字水印，成功把人类套路了》

- URL: https://mp.weixin.qq.com/s/6kXjTDb5glf0NTT0GdWzJw
- 第一屏已经交代事件、机制、反制、限制与核心矛盾，后文只需逐层证明。
- 解释阶梯是“正常生成—概率偏置—统计积累—检测—同一介入点留下攻击面”；每节末尾自然生成下一节问题。
- 最小填词例子先让机制可见，再回到正式概念；观点放在反方边界之后。
- 不沿用网络梗、连续类比、翻案句，以及从产品机制直接上升到语言哲学的跨度。

### 《刚刚，Claude文字水印细节全曝光，官方检测工具即将推出》

- URL: https://mp.weixin.qq.com/s/1mI1tSQQ1HvI8UDf7d-BeQ
- 主体、动作、监管范围与读者问题进入很快；官方说法中的限定词被编辑及时转译成证据边界。
- 官方截图和论文材料紧跟对应主张，原始链接贴在材料附近。
- 不沿用“刚刚/全曝光”、情绪化质疑、长篇翻译压过报道，以及官方“我们”与编辑部声音混在一起的写法。

### 《实测GLM-5.3: 在神仙打架的一周杀回国模顶流，还按下了重置键》

- URL: https://mp.weixin.qq.com/s/mqTVviuLG14dzN2OK2Q-7w
- 最有用的循环是“主张—图片—解释”：榜单、界面、实测结果和失败点都贴着它们所证明的句子。
- 测试先交代任务，再展示结果，同时写优点、失败与兼容问题；失败自然推动工具切换和下一段。
- 不沿用竞品巡礼、无证据排名、根据尺寸猜价格、一次 Demo 外推稳定能力，以及互动式三选一结尾。

### 《DeepSeek V4 Flash 之后，大模型开始卷「智效比」了》

- URL: https://mp.weixin.qq.com/s/psDhV_d52yFKLASw7dt9Gw
- 主线是连续求解：“便宜但审美不足—效果好但超预算—能否找到中间解”，转场由上一个测试留下的问题触发。
- 跑分后承认跑分有限，再做真实任务；数据段后用短判断换气，结论放到材料之后。
- 不沿用过长恋爱类比、未控制变量的横向排名、未经复测的成本推断、文字疏漏和宏大结尾。

### 本稿吸收的方法

- 第一屏直接使用“开放入口扩大，但默认窗口不变”的矛盾，不先铺行业背景。
- 全文只追一条问题线：更大窗口延后历史压缩，同时可能让后续请求携带更多仍然活跃的内容。
- 用一个最小长任务场景解释机制，再回到官方模型规格与配置字段。
- 图片紧贴主张；数字之后立即说明它改变什么、没有证明什么。
- 删除配置教程与操作清单。结尾只保留开放范围和接近窗口上限的独立任务结果这两项待验证证据。
- 最终 `humanizer-zh` 冷读删掉刻意造金句的情绪句和面向编辑的查证口吻，重点重写入口范围、用量规则与结尾边界；公开稿只留下读者理解事件需要的结果。

## 重新核验后的更正

- 删除“长任务失忆”的确定性说法。公开材料只证明更大窗口能在摘要旧材料前保留更多代码、工具输出和对话。
- 删除桌面端 `26.707.30751` 与 CLI `0.144.0` 的最低版本门槛；当前官方材料没有建立这组要求。
- 将 1M 与 900K 写为配置请求值。官方配置说明没有承诺它们必然成为最终运行值。
- 删除“输入越长，等待时间通常越长”的表述；没有当前官方延迟数据。
- API 超过 272K 后的 2× 输入、1.5× 输出只作为 API 规则，不外推到 ChatGPT 账号。
- 不使用任何本机、当前账号或编辑部短测作为公开正文材料。

## 证据摘要

- S1: Tibo 于 8 月 17 日称，Sol 1M 此前只对 API Key 有效，现在也支持 ChatGPT 账号用量；同时强调当前默认窗口经过调优。
- S2: Tibo 给出 `model_context_window=1000000` 与 `model_auto_compact_token_limit=900000` 的长期与单次配置示例。
- S3: OpenAI 模型页列出 1.05M 总上下文、922K 最大输入、128K 最大输出，以及 API 超过 272K 后的长上下文价格倍数。
- S4: OpenAI Docs 定义 `model_context_window` 与 `model_auto_compact_token_limit` 的字段语义。
- S8: OpenAI Docs 说明长任务、扩展会话和更多上下文会增加单条消息用量；上下文、模型、推理和工具都会影响消耗。
- S9: OpenAI Docs 将 Sol 列为 ChatGPT 桌面端/Web、Codex CLI/IDE/Cloud、ChatGPT Credits 与 API 可用模型。
- S10: Tibo 的个人资料标注 `Codex & ChatGPT @OpenAI`，只用于最小身份归属。

## 图片记录

- `wechat-cover.png`: Frontier World 900×383 确定性排版封面；右侧使用 OpenAI 官方结绳图标，源文件为 https://platform.openai.com/assets/logos/openai-logo.svg，保留原始 41×41 viewBox 与单色比例。确定性源保存在 `artifacts/openai-logo.svg`、`openai-logo.source.json`、`wechat-cover.svg` 与 `render-wechat-cover.mjs`。
- `og.png`: Frontier World 自有 1200×630 确定性网站头图。
- `images/source/openai-gpt56-sol-model-specs.png`: OpenAI Developers 官方模型页移动端截图，保留官方身份、模型名、总窗口与最大输出；未拼接或改写页面文字。
- `images/source/openai-codex-context-config.png`: OpenAI Docs 配置参考 390×610 移动端截图，保留官方页眉、页面标题和两个相关字段；只裁掉原图底部 90 px 无内容留白，未改动证据文字。
- `images/source/tibo-sol-1m-chatgpt-post.png`: Tibo 的 X 原帖移动端截图，保留 X 标志、姓名、账号、完整主帖、时间日期、浏览量与互动数据；隐藏登录入口、回复与底部登录遮罩，未改动主帖文字。内嵌前一条帖子仍是 X 原生截断预览。仅用于证明 Tibo 的公开表述。

## 发布边界

- 稿件保持本地草稿。
- 未创建微信公众号草稿，未发送预览，未部署网站，未进行任何公开发布。
- 正文、封面或图片发生变化后，所有旧批准都失效。
