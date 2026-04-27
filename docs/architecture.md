# ScholarFlow AI (Vue 3) 架构设计

## 1. 项目定位
ScholarFlow AI 是一个面向多 PDF 阅读、片段摘录和 AI 综述生成的智能研报工作站。它通过提供多 PDF 文件的统一阅读体验，并结合 AI 文本摘录和结构化综述流式生成，帮助求职者展示完整的 Vue3 工程化前端能力。

## 2. 为什么选择 Vue 3 + Pinia
- **Vue 3 (Composition API)**：提供优秀的逻辑复用能力（Composables），使如 `usePdfRenderer` 这类复杂的 DOM 操作和状态维护从 UI 中完全抽离，保持代码干净。`<script setup>` 提供了极佳的开发者体验。
- **Pinia**：Vue 官方推荐的新一代状态管理库，类型推断极其友好，没有 Vuex 繁琐的 mutations，天然适合本项目中“多文档状态流转”等核心状态的集中管理。
- **Vite + Tailwind CSS v4**：极致的启动速度和极低配置的原子化 CSS 引擎，加速三栏结构及细节 UI 的搭建。
- **pdfjs-dist**：直接使用底层解析库而不是高层封装，方便我们在后续阶段精确控制 Canvas 渲染和自定义文本层（摘录功能强依赖此能力）。

## 3. 三栏布局设计说明
为了提供“沉浸式文献处理”体验，项目采用了经典的三栏布局：
1. **左侧（UploadSidebar）**：文档管理区，提供拖拽上传与历史 PDF 列表，负责多文档的快速切换。
2. **中间（PdfWorkspace）**：核心阅读区，承担渲染 PDF 页面、处理阅读状态（缩放、页码）等职责。
3. **右侧（WorkbenchPanel）**：AI 交互区（当前占位），后续将承载“摘录池”与“AI 生成结果展示”，形成“左看右写”的黄金工作流。

## 4. 为什么第一阶段先做“上传 + 基础阅读壳”
核心目标是打通底层的渲染管线与状态流转。只有确保 PDF 能够成功加载、解析（`pdfjsLib` Worker 成功挂载）并在多文档间流畅切换，后续的文本高亮摘录与 AI 对话才有“数据载体”。此阶段验证了基于 `pdfjs-dist` 的自定义渲染器封装（Composable）的可行性。

## 5. 阶段 3 架构设计：状态拆分与真实 AI 接入
随着文本摘录与 AI 流式综述的加入，我们引入了 `workbenchStore` 与 `ai.service.ts`，形成了如下的架构分层：
1. **状态拆分（Separation of Concerns）**：
   - `documentStore` 专门负责“左侧与中间”的 PDF 阅读器状态（页码、缩放、当前文档）。
   - `workbenchStore` 专门负责“右侧”的工作台业务（摘录数组、AI 流式状态、AbortController）。
   这种按 Feature 拆分 Store 的做法避免了单一 Store 过于臃肿，符合微前端与高内聚的工程化标准。
2. **Service 层抽象**：
   - 将调用阿里云 DashScope API 的 Fetch 和 SSE 解析逻辑抽离到 `src/services/ai.service.ts` 中。UI 组件只负责调用该函数并传入回调更新 Store，不关心底层网络细节。这为后续可能接入 OpenAI 或 DeepSeek 等多模型打下了基础。
3. **选区与文本层分离**：
   - 依赖 `pdfjs-dist` v4 版本的 `TextLayer` 构建 DOM 层，再通过自定义的 `useSelection.ts` Composable 监听原生 DOM 选区。实现了“视觉在 Canvas，交互在 DOM”的高性能双层渲染架构。

## 6. 后续阶段规划
- **阶段 4**：加入引用回跳（点击综述标签定位 PDF），将摘录卡片与 PDF 阅读器深度联动。
- **阶段 5**：引入 Dexie 本地数据库持久化，保存会话和草稿。
- **阶段 6**：完善 Markdown 渲染与导出功能。
