# ChatGPT 用户脚本集合

本项目包含两个**相互独立**的 Tampermonkey 用户脚本，分别解决 ChatGPT 长对话页面性能和 LaTeX 公式复制问题。两个脚本可以单独安装、单独启用。

## 脚本一：长对话性能优化器

文件：`chatgpt-long-conversation-optimizer.user.js`

用于改善 ChatGPT 长对话页面的滚动、渲染和浏览体验。

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

该脚本只控制消息显示高度和渲染策略，不修改公式、剪贴板或复制按钮行为。

## 脚本二：LaTeX 悬浮与复制增强

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

## 安装

推荐直接从 GitHub Raw 地址安装。仓库为 Public 后，Tampermonkey 可以直接读取并检查更新。

正式版：

- `https://raw.githubusercontent.com/liu-baoding/chatgpt-long-conversation-optimizer/main/chatgpt-long-conversation-optimizer.user.js`
- `https://raw.githubusercontent.com/liu-baoding/chatgpt-long-conversation-optimizer/main/chatgpt-latex-copy-enhancer.user.js`

脚本头部的 `@updateURL` 和 `@downloadURL` 指向 `main` 分支；后续发布新版本时应同步提高 `@version`。

## 适用页面

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

## 许可证

本项目采用 [MIT License](https://opensource.org/license/mit)。
