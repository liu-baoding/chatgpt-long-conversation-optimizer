# ChatGPT 用户脚本集合

本项目包含两个**相互独立**的 Tampermonkey 用户脚本，分别解决页面性能和 LaTeX 公式处理问题。两个脚本可以单独安装、单独启用，不需要合并成一个脚本。

## 脚本一：长对话性能优化器

文件：`chatgpt-long-conversation-optimizer.user.js`

用于改善 ChatGPT 长对话页面的滚动、渲染和浏览体验。

### 主要功能

- 分别限制用户消息和助手消息的最大显示高度。
- 超出高度后，在消息内部显示纵向滚动条。
- 使用 `content-visibility: auto` 跳过离屏消息的布局和绘制。
- 降低超长对话中的页面卡顿和滚动闪烁。
- 支持通过 Tampermonkey 菜单独立开启或关闭各项功能。
- 支持自定义用户消息、助手消息及离屏占位高度。

默认配置：

- 助手消息最大高度：`400px`
- 用户消息最大高度：`300px`
- 离屏占位高度：`600px`

该脚本只使用 CSS 控制消息高度和离屏渲染，不移动、删除或折叠 ChatGPT 的 DOM 节点，也不修改剪贴板、公式和复制按钮行为。

## 脚本二：LaTeX 悬浮与复制增强

文件：`chatgpt-latex-copy-enhancer.user.js`

为 ChatGPT 数学公式提供 LaTeX 源码预览、单公式复制、选择复制和整条回复复制修复。

### 主要功能

- 鼠标悬浮公式时高亮公式区域。
- 悬浮约 300 ms 后显示原始 LaTeX 源码。
- 单击公式即可复制标准 LaTeX：行内公式使用 `$...# ChatGPT 用户脚本集合

本项目包含两个**相互独立**的 Tampermonkey 用户脚本，分别解决页面性能和 LaTeX 公式处理问题。两个脚本可以单独安装、单独启用，不需要合并成一个脚本。

## 脚本一：长对话性能优化器

文件：`chatgpt-long-conversation-optimizer.user.js`

用于改善 ChatGPT 长对话页面的滚动、渲染和浏览体验。

### 主要功能

- 分别限制用户消息和助手消息的最大显示高度。
- 超出高度后，在消息内部显示纵向滚动条。
- 使用 `content-visibility: auto` 跳过离屏消息的布局和绘制。
- 降低超长对话中的页面卡顿和滚动闪烁。
- 支持通过 Tampermonkey 菜单独立开启或关闭各项功能。
- 支持自定义用户消息、助手消息及离屏占位高度。

默认配置：

- 助手消息最大高度：`400px`
- 用户消息最大高度：`300px`
- 离屏占位高度：`600px`

该脚本只使用 CSS 控制消息高度和离屏渲染，不移动、删除或折叠 ChatGPT 的 DOM 节点，也不修改剪贴板、公式和复制按钮行为。

## 脚本二：LaTeX 悬浮与复制增强

文件：`chatgpt-latex-copy-enhancer.user.js`

为 ChatGPT 数学公式提供 LaTeX 源码预览、单公式复制、选择复制和整条回复复制修复。

### 主要功能

，行间公式使用 `$...$`。
- 选择包含公式的文本后 `Ctrl+C`，自动把渲染公式转换回 LaTeX。
- 修复新版 ChatGPT 回复级“复制”按钮中的公式格式。
- 将复制结果中的裸括号和方括号公式恢复为标准 Markdown LaTeX。
- 正确处理 `\frac`、`\boxed`、`\operatorname`、`\%` 等复杂公式。
- 保留公式外部真正具有语义的普通括号。

该脚本从公式容器的 `[data-client-katex-layout][aria-label]` 属性读取原始 LaTeX，使用事件委托处理动态生成的公式，不依赖旧版 KaTeX 的 `annotation[encoding="application/x-tex"]`，也不进行定时扫描或全页 `MutationObserver`。

如同时使用原版“AI网站公式复制Latex”脚本，建议将以下页面排除，避免重复处理：

```text
https://chatgpt.com/*
https://chat.openai.com/*
```

## 安装

1. 安装 Tampermonkey。
2. 根据需要打开上面对应的 `.user.js` 文件。
3. 新建 Tampermonkey 用户脚本，将**该文件的完整内容**粘贴进去并保存。
4. 刷新或重新打开 ChatGPT 页面。

两个脚本的安装和运行彼此独立，可以只安装其中一个，也可以同时安装。

## 适用页面

两个脚本均适用于：

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

## 许可证

本项目采用 [MIT License](https://opensource.org/license/mit) 许可。
