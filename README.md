# ScholarFlow AI | 智能学术文献综述工作台

![Vue 3](https://img.shields.io/badge/Vue.js-35495E?style=for-the-badge&logo=vuedotjs&logoColor=4FC08D)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)
![Pinia](https://img.shields.io/badge/Pinia-F6D365?style=for-the-badge&logo=vue.js&logoColor=green)
![IndexedDB](https://img.shields.io/badge/IndexedDB-Dexie.js-blue?style=for-the-badge)

ScholarFlow AI 是一个面向科研与学术场景的 **本地优先 (Local-First)** 智能文献阅读与综述辅助工作台。
项目围绕“PDF 深度阅读、碎片化摘录、AI 流式综述、引用溯源”四大核心场景，打通了从底层文档解析到大模型流式响应的前端全链路闭环。

## ✨ 核心特性与技术亮点

### 📄 PDF 双层渲染与精准选区劫持
深入解析 `pdfjs-dist` 底层渲染机制，构建 `Canvas 图像层 + HTML 文本层` 的双层架构。
通过修复层叠关系与 `pointer-events` 穿透，激活原生选区（`window.getSelection`）交互，实现跨行/跨页的精准文本提取，打破传统 Web PDF 阅读器“可读不可选”的限制。

### 🔄 原生 SSE 流式解析与 Buffer 防截断机制
摒弃厚重第三方库，基于浏览器原生 `ReadableStream` 和 `TextDecoder` 手写 SSE (Server-Sent Events) 解析器。
针对网络传输中 JSON 数据块被截断导致解析报错的痛点，设计了 **基于换行符切割 + 尾部字符串 Pop 的 Buffer 缓冲池策略**，确保数据块绝对完整，实现平滑的打字机渲染与主动中断（AbortController）控制。

### 🔗 多轮流式综述与引用溯源链路
将单向的综述生成升级为“围绕同一快照的多轮改写历史对话线程”。
前端基于 Markdown 语法与正则替换，自动拦截 AI 响应中的 `[n]` 引用标号并注入事件委托。结合**异步跨文档跳转（Pending Jump）**与文本匹配算法，实现“点击角标 -> 左侧文档自动翻页 -> TextLayer 碎片化 Span 精准定位与高亮”的完整知识溯源闭环。

### 💾 分层存储策略与本地会话持久化
基于 `Dexie.js` (IndexedDB) 构建本地持久化层，保护用户长周期打磨的综述成果。
设计 **“Metadata 必存 + PDF Blob 可选缓存”** 的分层存储模型，结合 Pinia 状态监听与 Debounce 节流写入，实现页面刷新后的文档列表、摘录池、多轮对话历史与阅读现场的无感恢复，并妥善处理 Blob 丢失时的平滑降级。

### 🛡️ 安全渲染管道与富文本复制体系
针对流式 Markdown 输出构建 `marked + DOMPurify` 安全渲染管道防御 XSS 注入。
坚持“单一真相来源（Single Source of Truth）”原则，底层 State 隔离保存原始 Markdown，展示层实时渲染 HTML，结合 Clipboard API 与隐藏 `textarea` 降级方案，实现干净无污染的“一键复制 Markdown 原文”体验。

## 🛠️ 技术栈

- **框架**: Vue 3 (Composition API)
- **语言**: TypeScript
- **构建工具**: Vite
- **状态管理**: Pinia
- **PDF 渲染**: pdfjs-dist
- **本地存储**: Dexie.js (IndexedDB)
- **Markdown 渲染与安全**: marked + DOMPurify
- **样式**: Tailwind CSS / CSS Modules
- **BFF (Backend for Frontend)**: Node.js + Express (用于大模型流式代理与鉴权)

## 🚀 快速开始

### 1. 克隆项目
```bash
git clone https://github.com/Areyoupeople1/pdf.git
cd pdf
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量
在项目根目录创建 `.env` 文件，并填入阿里云 DashScope（通义千问）的 API Key：
```env
DASHSCOPE_API_KEY=sk-你的真实API_KEY
```

### 4. 启动本地代理服务 (BFF)
需要启动后端 Node.js 服务来代理流式请求并注入鉴权：
```bash
node server/index.js
```
*(默认运行在 http://localhost:3000)*

### 5. 启动前端开发环境
新开一个终端窗口，启动 Vite 服务：
```bash
npm run dev
```

## 📁 核心目录结构

```text
├── server/
│   └── index.js                 # BFF 代理层，处理 SSE 与大模型鉴权
├── src/
│   ├── app/                     # 应用入口与全局样式
│   ├── composables/             # 核心逻辑复用 (usePdf, useSelection, useWorkspacePersistence)
│   ├── db/                      # Dexie IndexedDB 本地数据库配置
│   ├── features/                # 业务模块 (PDF 阅读器、工作台、上传侧边栏)
│   ├── services/                # API 请求与 SSE 原生解析器
│   ├── stores/                  # Pinia 状态管理 (documentStore, workbenchStore)
│   ├── types/                   # 全局 TypeScript 类型定义
│   └── main.ts                  # Vue 挂载点
├── .env                         # 环境变量 (需手动创建)
└── package.json                 # 项目依赖
```

## 📝 阶段开发日志
本项目严格遵循“分阶段、可验证”的工程化流程推进，详细复盘可见 `docs/phases/` 目录。
- Phase 1: 基础布局与 PDF 渲染
- Phase 2: 阅读器增强 (分页、缩放)
- Phase 3: 选区劫持与摘录池
- Phase 4: 引用跳转与溯源高亮
- Phase 5: 多轮改写历史与富文本复制
- Phase 7: Local-First 会话持久化与阅读状态恢复
