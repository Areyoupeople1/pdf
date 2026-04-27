# 阶段 2 总结：PDF 分页与缩放控制 MVP

## 1. 本阶段完成内容
- **阅读器工具栏 (`PdfToolbar.vue`)**：新增顶部控制条，包含“上一页、下一页、指定页码跳转、放大、缩小、重置比例”的完整交互 UI。
- **Store 状态扩展 (`document.ts`)**：将阅读器的操作动作（Actions）全部提升到全局，如 `setPage`, `nextPage`, `zoomIn`，并增加了严格的**越界保护**。在切换文档时（`setActiveDocument`），重置这些状态以防止报错。
- **渲染防抖与竞态锁 (`usePdf.ts`)**：在 Composable 中引入了 `isRendering` 状态和 `renderTask.cancel()` 机制。当用户高频点击翻页或缩放时，立刻中止未完成的旧渲染任务，释放主线程与 Worker 压力。

## 2. 阅读器状态设计与边界说明
- **State 在 Pinia (全局)**：`pageNumber` 和 `scale`。
  - **为什么**：未来右侧的“摘录池”与“AI 引用回跳”必须能够从外部控制中间阅读器的页面跳转。
- **Action 在 Pinia**：
  - 职责是处理业务边界：比如下一页不能超过 `numPages`，缩小不能低于 `0.5` 倍。保证状态的“合法性”。
- **Composable 负责防抖与渲染锁**：
  - `isRendering` 和 `renderTask` 的管理只属于当前阅读器实例，不会污染全局 Store，这是“机制”与“业务事实”的完美隔离。
- **Component (UI) 只负责调度**：
  - `PdfWorkspace` 只通过 `watch` 监听 Store 中的 `[pageNumber, scale]`，变化后无脑调用 Composable 的 `renderPage`，做到了极简和高内聚。