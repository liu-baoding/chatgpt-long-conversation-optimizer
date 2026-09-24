# ChatGPT Webchat Helper

一组相互独立的 Tampermonkey 用户脚本，用于增强 ChatGPT / DeepSeek 网页端的长对话性能、LaTeX 复制、用量查看和思考过程显示体验。

四个脚本可以单独安装、单独启用。

## 1. ChatGPT 长对话性能优化器

文件：`chatgpt-long-conversation-optimizer.user.js`

用于改善长对话页面的滚动和浏览体验。

### 主要功能

- 分别限制用户消息和助手消息的最大显示高度。
- 超出高度后，在消息内部显示纵向滚动条。
- 兼容新版 ChatGPT 的 user / assistant 消息 DOM。
- 旧版 ChatGPT 结构继续使用 `content-visibility: auto` 做离屏渲染优化。
- 新版 ChatGPT 已有自己的 turn 虚拟化机制，不额外叠加离屏 `content-visibility`，避免高度测量冲突。
- 支持通过 Tampermonkey 菜单独立开启或关闭各项功能。
- 支持自定义用户消息、助手消息及离屏占位高度。

默认配置：

- 助手消息最大高度：`400px`
- 用户消息最大高度：`300px`
- 离屏占位高度：`600px`

该脚本不处理公式、剪贴板或复制按钮行为。

## 2. AI LaTeX 悬浮与复制增强

文件：`chatgpt-latex-copy-enhancer.user.js`

> 为保持已安装脚本的自动更新链路，v3.0.0 暂时保留原文件名；脚本显示名称已改为 **AI LaTeX 悬浮与复制增强**。

v3.0.0 将原先针对 ChatGPT 的实现重构为“通用核心 + 网站适配器”。悬浮预览、单公式复制、选择复制、剪贴板写入和提示 UI 由核心统一处理，各网站只负责公式源码提取、块级/行内判断以及必要的复制按钮适配。

### 当前适配

- **ChatGPT**
  - 当前 ChatGPT 公式容器与标准 KaTeX annotation 双路径
  - 单公式复制
  - 选择“文本 + 公式”复制
  - 回复级“复制”按钮修复
  - v3.4.3：回复底部复制继续保留 ChatGPT 原生完整 Markdown 并仅规范化公式；表格右上角复制只在局部表格容器内识别按钮，并直接生成该表格的 Markdown + `$...$` 公式，避免与整条回复复制的作用域互相污染
  - v3.1.0 起不再读取已有剪贴板：优先拦截网页自身 `clipboard.writeText` 的待写文本并修复，必要时回退为从回复 DOM 直接构造文本
- **Claude**
  - KaTeX / `math-inline` / `math-display`
  - 单公式复制与选择复制
- **DeepSeek**
  - KaTeX annotation
  - `.ds-markdown-math` 块级判断
  - 单公式、选择复制与复制按钮修复
  - 兼容当前 `div[role="button"].ds-button` 回复操作栏；复制图标无 aria-label/title 时使用 SVG path 指纹识别
  - v3.1.0 起不再调用 `navigator.clipboard.readText()`，因此不会再触发浏览器“查看复制到剪贴板的文字和图片”权限提示
  - 优先保留 DeepSeek 原生复制文本结构并在写入前修复公式；若站点未走 `writeText`，则自动从当前回复 DOM 构造纯文本回退
- **Google Gemini**
  - 标准 KaTeX annotation 优先
  - 保留旧脚本已验证的 KaTeX render hook 作为源码回退
  - 对选择边界落在公式内部的情况扩展到完整公式
- **Google AI Studio**
  - `ms-katex` 与标准 KaTeX annotation
- **豆包**
  - 优先读取 `data-custom-copy-text`
  - 标准 KaTeX annotation 回退
  - 回复复制按钮定界规范化
- **知乎**
  - 读取 `.ztext-math[data-tex]`
- **通用 KaTeX 适配**
  - Wikipedia
  - Liaox
  - Moonshot / Kimi 相关域名
  - Stack Exchange
  - OI Wiki
  - 洛谷
  - 腾讯元宝

### 主要功能

- 鼠标悬浮公式时高亮并显示原始 LaTeX。
- 单击公式复制标准 LaTeX：
  - 行内公式使用 `$...$`
  - 行间公式使用 `$$...$$`
- 选择包含公式的文本后 `Ctrl+C`，自动将渲染公式恢复为 LaTeX。
- 通过事件委托处理动态生成的回复，无需定时全页扫描公式节点。
- ChatGPT 保留针对当前回复级复制按钮的专门修复逻辑。
- DeepSeek / 豆包沿用旧脚本的按钮后处理思路，并增加代码块复制按钮排除。
- 多站点兼容逻辑参考 fanxing 的 MIT 许可脚本“AI网站公式复制Latex”，并改造成彼此隔离的网站 adapter，避免大量跨站点 `if/else` 相互影响。

### 维护原则

各 adapter 可以独立声明能力。某个网站只在已经能够可靠获取公式源码时启用对应功能；不会为了“功能对齐”而强行劫持未知复制按钮。

DeepSeek 思考过程显示/隐藏已从本脚本中完全拆出，由独立脚本 `deepseek-thinking-collapse.user.js` 负责，避免公式复制逻辑与 DeepSeek 虚拟列表行为互相影响。

## 3. ChatGPT 用量监视器

文件：`chatgpt-usage-monitor.user.js`

将原 `gpt-usage-check` 的核心用量查询能力改造成 ChatGPT 页面内 userscript。原 `gpt-usage-check` 仓库保持不变。

### 主要功能

- 直接从当前 ChatGPT 登录会话读取临时 `accessToken`。
- 不需要手工复制或定期刷新 Bearer Token。
- 直接查询：
  - `/backend-api/wham/usage`
  - `/backend-api/wham/rate-limit-reset-credits`
  - `/backend-api/accounts/check/v4-2023-04-27`
- 显示：
  - 5 小时限额及重置倒计时
  - 周限额及重置倒计时
  - 重置额度及明细
  - 当前使用状态
  - 当前订阅套餐与状态
  - 自动续费状态及当前订阅周期节点
  - PoW difficulty、Persona 与风险提示
  - 积分余额、消费控制等辅助信息
  - 原始 JSON
- Token 只保存在当前页面 JS 内存中，不写入：
  - `localStorage`
  - Tampermonkey 存储
  - 本地文件
- 若请求返回 401/403，会重新读取当前登录会话并自动重试一次。
- 页面右侧输入区外侧使用两个竖排圆环显示 5 小时 / 周限额剩余比例，避免横向胶囊遮挡输入框。
- 详情面板改为视口垂直居中，并限制最大高度，避免顶部超出页面。
- 点击圆环后展开详情面板。
- 页面刷新后会自动获取一次用量，使圆环直接显示当前状态。
- 页面保持打开时约每 5 分钟后台刷新一次；从后台切回且数据已过期时也会自动刷新。
- 从 `document-start` 开始被动监听 ChatGPT 自身的 Sentinel `chat-requirements` / `prepare` 响应，提取 `proofofwork.difficulty`；不会为了检测而主动重复发送 Sentinel prepare 请求。
- PoW 仅在当前标签页 `sessionStorage` 保存 `difficulty`、`persona` 和采样时间，不保存 `prepare_token`、`seed`、Turnstile / `dx` 等 challenge 数据。
- PoW 风险等级采用社区工具的启发式规则：去掉前导 0 后，有效十六进制位数 `<=2 / 3 / 4 / >=5` 分别显示为高风险 / 中风险 / 低风险 / 正常。面板中的“PoW 求解难度”只指 Sentinel challenge 的计算工作量，不是模型推理难度。该指标只作为 Sentinel 风控信号参考，并不能单独证明实际模型发生降级。
- 用量 / 重置额度 / 订阅信息采用混合策略：若网页自身刚刚请求过对应接口，则复用被动捕获结果；缺失或过期时再由监视器主动补发 GET。手动点击刷新仍强制获取最新数据。

### 说明

该脚本使用 ChatGPT 网页内部接口，而不是稳定的公开 OpenAI API。若 ChatGPT 后续调整内部接口或会话结构，可能需要同步更新脚本。

## 4. DeepSeek 思考折叠（CSS 优先）

文件：`deepseek-thinking-collapse.user.js`

用于解决 DeepSeek 长对话中思考过程默认展开、占用大量空间的问题。

### 设计原则

- `document-start` 即注入 CSS，默认隐藏 `.ds-think-content`。
- 不点击 DeepSeek 原生折叠按钮。
- 不扫描或轮询虚拟列表。
- 不使用 `MutationObserver` 追踪历史消息。
- 不修改 `scrollTop` / `scrollBy`。
- 历史消息被虚拟列表反复卸载、重新挂载时，CSS 会直接重新生效，不会产生“先展开再折叠”的高度突变。
- 页面右下角提供“显示思考 / 隐藏思考”开关；`Alt+T` 可快速切换。

该方案故意不维护“某条消息是否已经折叠”的 JS 状态，而是将显示/隐藏作为纯 CSS 展示策略，避免与 DeepSeek 自身的 React 虚拟列表状态机竞争。

> 若曾安装第三方 DeepSeek 自动折叠脚本，请先禁用或卸载，避免它继续模拟点击原生折叠按钮并与本脚本冲突。

## 安装

仓库为 Public，可直接从 GitHub Raw 地址安装。Tampermonkey 会识别 `.user.js` 并打开安装页面。

正式版：

- `https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/chatgpt-long-conversation-optimizer.user.js`
- `https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/chatgpt-latex-copy-enhancer.user.js`
- `https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/chatgpt-usage-monitor.user.js`
- `https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/deepseek-thinking-collapse.user.js`

脚本头部的 `@updateURL` 和 `@downloadURL` 均指向 `main` 分支。发布新版本时应同步提高 `@version`，Tampermonkey 才会识别为更新。

## 开发与测试

功能修改通常先在独立 feature branch / Draft PR 中验证，通过实际页面测试后再合并到 `main`。

## 适用页面

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://chat.deepseek.com/*`

## 许可证

本项目采用 MIT License。
