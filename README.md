# ChatGPT Webchat Helper

一组相互独立的 Tampermonkey 用户脚本，用于增强 ChatGPT 网页端的长对话性能、LaTeX 复制和用量查看体验。

三个脚本可以单独安装、单独启用。

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

## 2. ChatGPT LaTeX 悬浮与复制增强

文件：`chatgpt-latex-copy-enhancer.user.js`

为 ChatGPT 数学公式提供 LaTeX 源码预览、单公式复制、选择复制和整条回复复制修复。

### 主要功能

- 鼠标悬浮公式时高亮公式区域。
- 悬浮约 300 ms 后显示原始 LaTeX 源码。
- 单击公式即可复制标准 LaTeX：
  - 行内公式使用 `$...$`
  - 行间公式使用 `$$...$$`
- 选择包含公式的文本后 `Ctrl+C`，自动把渲染公式转换回 LaTeX。
- 修复新版 ChatGPT 回复级“复制”按钮中的公式格式。
- 恢复 ChatGPT 复制过程中丢失反斜杠的 `(...)` / `[...]` 公式定界。
- 兼容 `[data-client-katex-layout][aria-label]` 和标准 KaTeX `annotation[encoding="application/x-tex"]`。

选择复制机制参考 fanxing 的 MIT 许可脚本“AI网站公式复制Latex”的已验证思路，并针对 ChatGPT 当前 DOM 与回复复制按钮进行了专门适配。

如果同时安装原版“AI网站公式复制Latex”，建议在该脚本中排除：

```text
https://chatgpt.com/*
https://chat.openai.com/*
```

避免两个脚本同时监听 ChatGPT 的复制事件。

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
- 点击圆环后展开详情面板。
- 页面刷新后会自动获取一次用量，使圆环直接显示当前状态。
- 页面保持打开时约每 5 分钟后台刷新一次；从后台切回且数据已过期时也会自动刷新。
- 被动监听 ChatGPT 自身的 Sentinel `chat-requirements` / `prepare` 响应，提取 `proofofwork.difficulty`；不会为了检测而主动重复发送 Sentinel prepare 请求。
- PoW 仅在当前标签页 `sessionStorage` 保存 `difficulty`、`persona` 和采样时间，不保存 `prepare_token`、`seed`、Turnstile / `dx` 等 challenge 数据。
- PoW 风险等级采用社区工具的启发式规则：去掉前导 0 后，有效十六进制位数 `<=2 / 3 / 4 / >=5` 分别显示为高风险 / 中风险 / 低风险 / 正常。该指标只作为 Sentinel 风控信号参考，并不能单独证明实际模型发生降级。

### 说明

该脚本使用 ChatGPT 网页内部接口，而不是稳定的公开 OpenAI API。若 ChatGPT 后续调整内部接口或会话结构，可能需要同步更新脚本。

## 安装

仓库为 Public，可直接从 GitHub Raw 地址安装。Tampermonkey 会识别 `.user.js` 并打开安装页面。

正式版：

- `https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/chatgpt-long-conversation-optimizer.user.js`
- `https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/chatgpt-latex-copy-enhancer.user.js`
- `https://raw.githubusercontent.com/liu-baoding/chatgpt-webchat-helper/main/chatgpt-usage-monitor.user.js`

脚本头部的 `@updateURL` 和 `@downloadURL` 均指向 `main` 分支。发布新版本时应同步提高 `@version`，Tampermonkey 才会识别为更新。

## 开发与测试

功能修改通常先在独立 feature branch / Draft PR 中验证，通过实际页面测试后再合并到 `main`。

## 适用页面

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

## 许可证

本项目采用 MIT License。
