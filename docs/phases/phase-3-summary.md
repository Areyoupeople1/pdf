# Phase 3 Summary: 文本摘录与真实 AI 流式生成

## 本阶段完成内容
1. **文本层渲染与修复**：将 `pdfjs-dist` 的 v4 版本的 `TextLayer` 渲染 API 接入项目，使得原本只读的 Canvas PDF 具备了可被鼠标选中的透明文本层。
2. **选区监听与提取**：开发了 `useSelection.ts`，利用原生 `window.getSelection()` 和 `Range` API 获取用户选中文本的位置信息和文本内容。
3. **摘录池闭环交互**：用户划选文本后弹出脱离文档流（Teleport）的“加入摘录池”按钮，点击后将文本对象通过 `workbenchStore` 加入右侧列表。
4. **真实 AI 服务接入**：开发了 `ai.service.ts`，通过 Fetch API 调用阿里云 DashScope（兼容 OpenAI）流式接口，实现打字机效果输出综述。
5. **右侧工作台 UI 扩展**：为 `WorkbenchPanel.vue` 添加了 API Key 输入、生成状态管理（Loading/Generating/Success/Error）以及中断（AbortController）控制。

## 技术选型与设计原因
1. **为什么用原生 `window.getSelection`？**
   相比引入第三方选区库，原生 API 足以满足本阶段“提取纯文本”和“获取 DOM 坐标以定位悬浮按钮”的需求，保持项目轻量级。
2. **为什么独立抽出 `ai.service.ts`？**
   AI 接口调用涉及 SSE 解析、网络请求、AbortSignal 控制等复杂逻辑，将其放在 Vue 组件或 Store 中会造成严重的耦合。抽出 Service 层后，Store 只负责派发状态，UI 组件只负责展示。
3. **为什么使用 `Teleport` 挂载悬浮按钮？**
   在 PDF 滚动容器内绝对定位容易受到 `overflow: hidden` 或 `transform` 的影响。使用 `<Teleport to="body">` 配合 `fixed` 定位可以确保悬浮按钮永远在最上层且不被遮挡。

## 关键数据结构说明
**workbenchStore:**
- `excerpts`: Array<Excerpt> - 存放用户摘录的片段。
- `summaryContent`: string - 存放 AI 返回的流式字符串。
- `aiStatus`: 'idle' | 'loading' | 'generating' | 'error' | 'success' - 状态机，驱动 UI 变化。
- `abortController`: AbortController | null - 用于前端主动阻断流式请求。

## 已知限制 (MVP)
- 目前只提取纯文本，不包含高亮持久化。
- Markdown 渲染暂时只用了白文本输出，未接入真正的 Markdown Parser (如 `markdown-it`)。
- API Key 目前使用明文和 `localStorage` 存储，仅供前端演示，无后端代理安全。