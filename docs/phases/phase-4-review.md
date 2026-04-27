# 阶段 4：AI 综述引用回跳与原文高亮流程复盘

## 一、 流程概览与核心疑问解答

### 1. 为什么 `workbenchMode` 有 `excerpt` 和 `summary` 两个状态？
**代码位置**：[WorkbenchPanel.vue](file:///d:/V4/src/features/workbench/WorkbenchPanel.vue#L140)
**解答**：
这是典型的“条件渲染”状态管理。右侧工作台有限的空间里，既要能展示用户手动收集的“摘录池”（`excerpt`），又要能展示 AI 生成的“综述报告”（`summary`）。
通过这两个状态配合 `v-if` / `v-else-if`，我们实现了同一块 UI 区域的无缝切换，保证了界面的整洁，这也是单页应用（SPA）的标准做法。

### 2. AI 综述生成前的快照机制
**代码位置**：[workbench.ts](file:///d:/V4/src/stores/workbench.ts#L87)
**你的疑问**：“主要是这个顺序，为什么是 `-`？最新的摘录是最大值？”
**解答**：
我们在左侧摘录池中，为了让用户体验更好，新添加的摘录总是出现在列表的**最上面**（也就是 `unshift` 的效果）。
但是，发给 AI 大模型的 Prompt 必须是符合人类阅读习惯的**从上往下、从老到新**的顺序。
如果不做逆向计算 `label: total - index`，用户最新摘录的一条（排在列表最上面，索引为 0），就会被标为 `[1]` 发给 AI，这违背了时间线顺序。所以我们通过相减，保证最早摘录的文字编号是 `[1]`，最晚摘录的是最大的数字。这样大模型生成的逻辑才会连贯。

### 3. AI 的返回内容去哪了？为什么要做两次清洗？
**代码位置**：[WorkbenchPanel.vue](file:///d:/V4/src/features/workbench/WorkbenchPanel.vue#L17)
**你的疑问**：“AI 的返回内容是存到 store 里面的？这里做了两次安全清洗？”
**解答**：
- **存储**：是的，流式返回的 Markdown 文本被不断拼接到 Pinia store 的 `summaryContent` 字段中。
- **渲染与清洗**：
  因为 AI 返回的是纯粹的 Markdown 文本（如 `# 标题 [1]`）。Vue 的模板引擎不认识 Markdown。
  - **第一次转换 (`marked`)**：把 Markdown 转换为 HTML，`# 标题` 变成了 `<h1>标题</h1>`。
  - **正则替换**：将 `[1]` 这种文本强行替换为我们自定义的 HTML 按钮 `<button class="source-ref-btn" data-ref-label="1">[1]</button>`。
  - **第二次清洗 (`DOMPurify`)**：因为我们在上一步引入了原生 HTML，为了防止 XSS 攻击（假设 AI 生成了恶意 `<script>` 标签），必须用 `DOMPurify` 洗一遍，过滤掉所有危险的标签，只保留安全的标签和我们自定义的 `<button>`。

### 4. 事件委托：如何让动态生成的 HTML 响应点击？
**代码位置**：[WorkbenchPanel.vue](file:///d:/V4/src/features/workbench/WorkbenchPanel.vue#L115-117) 和 [WorkbenchPanel.vue](file:///d:/V4/src/features/workbench/WorkbenchPanel.vue#L235)
**你的疑问**：“这个 click 事件啥时候才触发？这个按钮依据是什么 'source-ref-btn'？”
**解答**：
因为那个包含 `[1]` 的 `<button>` 是用 `v-html` 动态塞进页面的，Vue 无法在它身上绑定 `@click`。
所以我们在外层父容器 `div` 上绑定了 `@click="handleMarkdownClick"`。当鼠标点击父容器内的任何区域时，事件会冒泡上来：
- 我们检查 `e.target`（真正被点击的元素）。
- 如果这个元素包含 `source-ref-btn` 这个 CSS 类名，我们就确认：“哦！用户点击了我们替换出来的引用角标！”
- 接着提取 `data-ref-label` 属性的值（比如 `1`），就拿到了我们要回跳的依据。

### 5. 跨文档跳页的“备忘录”机制 (`pendingJump`)
**你的疑问**：“pendingJump.value = { documentId: docId, pageNumber: pageNum }; 这句话是啥意思？咋挂的跳页请求？”
**解答**：
这是解决 Vue 异步更新渲染最核心的地方。
假设你在看 A 文档，点击引用 `[1]` 需要跳到 B 文档的第 5 页：
1. 你不能马上执行 `setPage(5)`。因为 B 文档还没加载，它的总页数还是 0，立刻翻页会被拦截报错。
2. 于是，你把“要去 B 文档第 5 页”这个任务写进 `pendingJump`（相当于备忘录）。
3. 接着你调用 `setActiveDocument('doc-b')` 触发左侧切换到 B 文档。
4. **代码位置**：[PdfWorkspace.vue](file:///d:/V4/src/features/pdf-viewer/PdfWorkspace.vue#L80-83)
   当 B 文档花费几百毫秒终于加载完毕，并解析出总页数 `numPages` 后。组件的 `watch` 会调用 `documentStore.consumePendingJump()`。
5. 这个函数会查看备忘录，发现要去第 5 页，此时文档已就绪，安全地执行 `setPage(5)`，完成跨文档跳页。

### 6. 为什么 PdfWorkspace 里的 watch 看上去有两段重复代码？
**代码位置**：[PdfWorkspace.vue](file:///d:/V4/src/features/pdf-viewer/PdfWorkspace.vue#L83-95)
**解答**：
这并不重复，它们监听的维度不同：
- **第一个 watch (`() => documentStore.activeDocument`)**：监听**换了哪份文档**。当切文档时，要重新走一次漫长的 `loadPdf` 解析过程。
- **第二个 watch (`() => documentStore.viewerState.pageNumber`)**：监听**同一份文档内翻页**。它不需要重新 `loadPdf`，只需要从内存中拿出对应页的数据，重新渲染 Canvas 即可。这是为了极大地提升同文档内翻页的速度。

### 7. 原文高亮是怎么实现的？
**解答**：
和 `pendingJump` 类似，高亮也是靠状态驱动的：
1. 跳页时，将要高亮的摘录文本存入 `documentStore.highlightText`。
2. 在 `PdfWorkspace.vue` 中，每次渲染页面（`renderPage`）时，都会把这个高亮文本传给底层的 PDF 渲染函数。
3. 当 PDF 的 `TextLayer` 渲染完毕后，底层算法会把所有打碎的 `<span>` 拼成完整的字符串进行模糊匹配，找到对应的文字位置，然后给那些 `<span>` 加上黄色的背景色，并自动滚动到视野中间。

## 二、 阶段 4 完整链路总结图

```mermaid
graph TD
    A[在 PdfWorkspace 划选文字] -->|触发| B[存入 workbenchStore 摘录池]
    B -->|点击生成综述| C[冻结当前摘录池，生成带 label 的快照 summarySources]
    C -->|发送给后端/大模型| D[大模型流式返回带角标 [1] 的 Markdown]
    D -->|前端 marked 转 HTML| E[正则劫持 [1] 替换为 <button data-ref-label="1">]
    E -->|DOMPurify 净化| F[v-html 渲染到页面]
    F -->|用户点击角标| G[事件委托触发 handleMarkdownClick]
    G -->|提取 label| H[在快照中查找原始摘录文档ID和页码]
    H -->|判断是否跨文档| I{当前文档 == 目标文档?}
    I -- 是 --> J[直接跳页并执行高亮]
    I -- 否 --> K[将跳页和高亮任务挂起到 pendingJump]
    K -->|触发加载新文档| L[新文档加载完毕，总页数就绪]
    L -->|消费备忘录| J
```
