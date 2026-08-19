---
schema: frontier-signals/article@2
id: 2026-08-18/codex-gpt56-sol-1m-context
date: 2026-08-18
slug: codex-gpt56-sol-1m-context
format: bulletin
title: GPT-5.6 Sol 1M 上下文向 ChatGPT 账号开放
title_segments: [GPT-5.6 Sol 1M 上下文, 向 ChatGPT 账号开放]
description: OpenAI 工程师 Tibo 称，Codex 的 GPT-5.6 Sol 1M 配置现已支持 ChatGPT 账号用量。它让早期材料更晚进入历史压缩，但没有改变默认窗口。
published_at: 2026-08-18T00:00:00+08:00
updated_at: 2026-08-18T17:54:00+08:00
thesis:
  core: Tibo 的说法扩大了可以请求 Sol 1M 配置的账号路径；它延后的是长任务的历史压缩，没有把 1M 变成 Codex 的新默认。
  boundary: Tibo 的帖子不是正式产品公告，未逐项列明套餐、地区和产品入口；1M 与 900K 是配置请求值，公开资料也没有证明它会改善任务质量。
cover: wechat-cover.png
hero: og.png
wechat:
  author: Frontier World
  digest: OpenAI 工程师 Tibo 称，Codex 的 GPT-5.6 Sol 1M 配置已支持 ChatGPT 账号。它让更多早期材料留在活跃上下文，默认窗口没有改变。
  topics: [Codex, OpenAI, AI编程]
  comments:
    enabled: true
    fans_only: false
media:
  - path: wechat-cover.png
    alt: Frontier Signals 封面，标题为 GPT-5.6 Sol 1M 上下文向 ChatGPT 账号开放
    credit: Frontier World 排版；OpenAI 官方图标
    rights: fair_use_reviewed
    purpose: cover
    generated: false
    source_url: https://platform.openai.com/assets/logos/openai-logo.svg
  - path: og.png
    alt: Frontier Signals 网站头图，GPT-5.6 Sol 1M 上下文向 ChatGPT 账号开放
    credit: Frontier World
    rights: owned
    purpose: hero
    generated: false
  - path: images/source/openai-gpt56-sol-model-specs.png
    alt: OpenAI Developers 的 GPT-5.6 Sol 页面，显示 1,050,000 上下文窗口和 128,000 最大输出
    credit: OpenAI Developers
    rights: official
    purpose: evidence
    generated: false
    show_caption: false
  - path: images/source/openai-codex-context-config.png
    alt: OpenAI 配置参考，显示 model_context_window 与 model_auto_compact_token_limit 的字段说明
    credit: OpenAI Docs
    rights: official
    purpose: evidence
    generated: false
    show_caption: false
  - path: images/source/tibo-sol-1m-chatgpt-post.png
    alt: Tibo 在 X 上表示 GPT-5.6 Sol 的 1M 配置现已支持 ChatGPT 账号用量
    credit: Tibo / X
    rights: fair_use_reviewed
    purpose: evidence
    generated: false
    show_caption: false
    source_url: https://x.com/thsottiaux/status/2089143488696705077
sources:
  - id: S1
    kind: social
    title: GPT-5.6 Sol 1M in Codex now works through ChatGPT accounts
    publisher: Tibo / X
    url: https://x.com/thsottiaux/status/2089143488696705077
    published_at: 2026-08-17T00:13:16Z
    checked_at: 2026-08-18T16:03:00+08:00
  - id: S2
    kind: social
    title: How to enable a 1M-token context window in Codex for GPT-5.6 Sol
    publisher: Tibo / X
    url: https://x.com/thsottiaux/status/2089082893804896524
    published_at: 2026-08-16T20:12:29Z
    checked_at: 2026-08-18T16:03:00+08:00
  - id: S3
    kind: primary
    title: GPT-5.6 Sol Model
    publisher: OpenAI Developers
    url: https://developers.openai.com/api/docs/models/gpt-5.6-sol
    published_at: null
    checked_at: 2026-08-18T16:03:00+08:00
  - id: S4
    kind: primary
    title: Codex Configuration Reference
    publisher: OpenAI Docs
    url: https://developers.openai.com/codex/config-file/config-reference
    published_at: null
    checked_at: 2026-08-18T16:03:00+08:00
  - id: S8
    kind: primary
    title: ChatGPT Work and Codex pricing
    publisher: OpenAI Docs
    url: https://learn.chatgpt.com/docs/pricing
    published_at: null
    checked_at: 2026-08-18T16:03:00+08:00
  - id: S9
    kind: primary
    title: Models in ChatGPT Work and Codex
    publisher: OpenAI Docs
    url: https://learn.chatgpt.com/docs/models
    published_at: null
    checked_at: 2026-08-18T16:03:00+08:00
  - id: S10
    kind: social
    title: Tibo profile
    publisher: Tibo / X
    url: https://x.com/thsottiaux
    published_at: null
    checked_at: 2026-08-18T16:03:00+08:00
claims:
  - id: C1
    kind: quote
    statement: Tibo 称 Codex 的 GPT-5.6 Sol 1M 路径此前只支持 API Key，现在也支持 ChatGPT 账号用量。
    source_ids: [S1, S10]
    test_run_ids: []
    confidence: high
  - id: C2
    kind: quote
    statement: Tibo 给出 1M 上下文与 900K 自动压缩阈值的配置请求，并称现有默认窗口已经按性能和成本调优。
    source_ids: [S2]
    test_run_ids: []
    confidence: high
  - id: C3
    kind: fact
    statement: GPT-5.6 Sol 的总上下文为 1.05M，最大输入为 922K，最大输出为 128K。
    source_ids: [S3]
    test_run_ids: []
    confidence: high
  - id: C4
    kind: fact
    statement: OpenAI Docs 将 Sol 列为 ChatGPT 桌面端与 Web、Codex CLI、IDE、Cloud、ChatGPT Credits 和 API 可用模型。
    source_ids: [S9]
    test_run_ids: []
    confidence: high
  - id: C5
    kind: fact
    statement: model_context_window 与 model_auto_compact_token_limit 分别配置上下文窗口值与自动历史压缩阈值。
    source_ids: [S4]
    test_run_ids: []
    confidence: high
  - id: C7
    kind: fact
    statement: GPT-5.6 Sol 的 API 输入超过 272K 后，整次请求按 2 倍输入与 1.5 倍输出计价。
    source_ids: [S3]
    test_run_ids: []
    confidence: high
  - id: C8
    kind: fact
    statement: OpenAI Docs 说明长任务或需要保留更多上下文的长会话会增加单条消息的用量，模型、上下文、推理和工具都会影响消耗。
    source_ids: [S8]
    test_run_ids: []
    confidence: high
  - id: C9
    kind: analysis
    statement: 1M 选项适合任务后半程仍需早期原始材料的场景；只提高上限不会自动改善任务质量。
    source_ids: [S2, S3, S8]
    test_run_ids: []
    confidence: medium
  - id: C10
    kind: analysis
    statement: Tibo 的说法扩大了可以请求 1M 配置的账号路径，没有把 1M 变成 Codex 的新默认。
    source_ids: [S1, S2]
    test_run_ids: []
    confidence: high
  - id: C11
    kind: analysis
    statement: 官方配置文档定义了两个字段的语义，但没有承诺任意请求值都会成为最终运行值。
    source_ids: [S2, S4]
    test_run_ids: []
    confidence: medium
test_runs: []
---
# GPT-5.6 Sol 1M 上下文向 ChatGPT 账号开放

8 月 17 日，负责 Codex 与 ChatGPT 的 OpenAI 工程师 Tibo 在 X 上表示，GPT-5.6 Sol 的 1M 配置此前只支持 API Key，现在也支持 ChatGPT 账号用量。

![Tibo 在 X 上表示 GPT-5.6 Sol 的 1M 配置现已支持 ChatGPT 账号用量](images/source/tibo-sol-1m-chatgpt-post.png)

一个仓库任务跑得够久，Codex 到后半程还可能需要前面读过的代码、工具输出和对话。1M 让这些材料在上下文里留得更久，晚一点再被压成摘要。

Tibo 同时说，现有默认窗口已经按性能和成本调过。1M 适合任务后半程还要翻早期材料的长任务，普通任务未必需要这么大的窗口。

## 1M 会把历史压缩往后推

Codex 在任务开头读过一段代码，经过几轮工具调用后，可能还要回头核对它。原文仍在活跃上下文里时，Codex 可以继续使用；如果原文已经被压缩，后续步骤只能依赖摘要留下的信息。

Tibo 说，使用 1M 配置后，更多代码、工具输出和对话会留在活跃上下文里，系统也会更晚压缩旧材料。

OpenAI 给出的正式数字是：总上下文 1.05M，最大输入 922K，最大输出 128K。这里的 1M 只是个顺口的简称，并不表示一轮可以提交 100 万 token 的用户输入。仓库文件之外，工具输出和对话也会占用这部分空间。

![OpenAI Developers 的 GPT-5.6 Sol 页面，显示 1,050,000 上下文窗口和 128,000 最大输出](images/source/openai-gpt56-sol-model-specs.png)

容量更大，并不等于模型更会找材料。窗口快满时，Codex 能不能准确找回前面的内容，还要靠独立的长任务测试来回答。

## 1M 和 900K 是配置请求值

Tibo 给出的配置有三项：选择 `gpt-5.6-sol`，把 `model_context_window` 设为 1M，再把 `model_auto_compact_token_limit` 设为 900K。长期写入配置或只对单次命令启用，改的都是后两项数值。

![OpenAI 配置参考，显示 model_context_window 与 model_auto_compact_token_limit 的字段说明](images/source/openai-codex-context-config.png)

配置里可以填 1M 和 900K，Codex 运行时仍会按模型的实际窗口截顶。900K 也不保证压缩会刚好在这个数字上发生。

能不能开到 1M，首先取决于账号里有没有 Sol。OpenAI 已在桌面端、Web、CLI、IDE 和 Cloud 提供这个模型；没有 Sol 的账号，改配置也不会多出这个入口。

## 历史变长，用量才增加

把上限调到 1M，不等于每条消息都按 1M 计算。会话留住的历史越多，后面的消息带上的内容也越多，用量会跟着增加。

API 用户还要留意 272K 这条线：输入一旦超过它，整次请求按 2 倍输入、1.5 倍输出计价。ChatGPT 账号的用量是否采用同样的倍数，OpenAI 暂时没有说明。

更大的窗口也会把过期日志和废弃方案留得更久。它只负责装下更多内容，不会替 Codex 判断哪些材料已经没用了。

按 Tibo 的说法，1M 仍是一项按需配置，Codex 的默认窗口没有改变。它会覆盖哪些套餐、地区和入口，接近上限时长任务表现如何，OpenAI 还没有公布。
