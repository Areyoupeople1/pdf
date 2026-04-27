# 阶段 1 总结：Vue3 项目骨架与基础阅读壳

## 1. 本阶段完成内容
- 使用 Vue 3 + Vite + TypeScript 初始化了全新的前端项目。
- 引入并配置了 Tailwind CSS v4 和 Pinia。
- 搭建了符合 Vue3 Composition API 规范的模块化目录结构。
- 实现了三栏核心布局：左侧上传区、中间 PDF 预览区、右侧工作台占位区。
- 使用 Pinia `useDocumentStore` 实现了多文档全局状态管理。
- 封装了 `usePdfRenderer` Composable，使用 `pdfjs-dist` 原生 API 实现了 PDF 第一页的 Canvas 渲染壳。
- 添加了非 PDF 文件的错误拦截和空状态提示。

## 2. 目录结构说明
```text
src/
├── app/               # 存放应用入口和全局样式 (App.vue, style.css)
├── composables/       # 业务逻辑与状态抽离 (usePdf.ts)
├── features/          # 按业务功能划分的模块
│   ├── upload/        # 左侧上传及文档列表相关逻辑
│   ├── pdf-viewer/    # 中间 PDF 渲染逻辑
│   └── workbench/     # 右侧工作台占位相关
├── shared/            # 公用工具和组件 (utils.ts)
├── stores/            # Pinia 状态管理 (document.ts)
└── types/             # 全局 TS 类型定义 (index.ts)
```
此结构确保了视图（Vue 组件）和逻辑（Composable/Store）的高度分离。

## 3. 文档状态设计说明
Pinia 的 `useDocumentStore` 核心维护了以下状态：
- `documents`：存储所有上传成功的 PDF 信息（包括 `id`, `name`, `size`, `file` 等）。
- `activeDocumentId`：当前用户正在阅读的文档 ID，`activeDocument` getter 自动计算当前选中文档。
- `viewerState`：独立管理阅读器的状态（如当前页码 `pageNumber`，总页数 `numPages` 等）。

## 4. PDF 预览实现思路说明
不同于 React 版本使用第三方组件，本项目直接封装 `pdfjs-dist`：
- **Worker 配置**：在 Vite 环境下，通过 `import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'` 显式导入 Worker 脚本并挂载到 `GlobalWorkerOptions.workerSrc`，确保解析能在浏览器正常运行。
- **逻辑抽离**：将 PDF 加载（`getDocument`）、页面获取（`getPage`）和渲染（`page.render`）逻辑封装在 `usePdfRenderer` 组合式函数中，暴露 `loading`, `error` 状态和 `renderPage` 方法给组件。
- **渲染策略**：本阶段仅渲染 `pageNumber: 1` 到原生 Canvas 元素作为基础壳。为后续阶段实现自定义 TextLayer（文本高亮与摘录核心）打下底层基础。
