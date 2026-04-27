# 阶段 5B：围绕同一份综述的多轮改写历史

## 1. 这一阶段要解决什么问题

阶段 5A 已经实现了“基于当前综述继续修改”，但它仍然有一个明显短板：

- 用户只能看到当前最新结果，看不到之前改过什么。
- 每次修改后的结果会覆盖上一版，不利于比较版本差异。
- 如果用户对某一版满意，希望直接复制 Markdown，也缺少贴近真实使用场景的交互。

因此，阶段 5B 的目标不是做开放式聊天，也不是做任意问答，而是把右侧 AI 工作台升级为：

- 围绕同一份综述的单线程改写历史。
- 围绕同一批来源快照持续迭代。
- 保留每一版 assistant 综述的 Markdown 内容。
- 保留每次用户修改要求。
- 保持原有的 `[1][2]` 引用跳转和 PDF 高亮能力不丢失。

最终用户看到的结构应该是：

1. 第一版综述
2. 用户修改要求
3. 第二版综述
4. 再次修改要求
5. 第三版综述

这就是阶段 5B 的产品定义。

## 2. 阶段 5B 的主要改进

相对于阶段 5A，这一阶段的核心改进有 4 个。

### 2.1 从“覆盖式结果”升级为“多轮历史列表”

原来工作台更像是一个单结果面板，最新综述会直接替换旧内容。

现在改成了消息列表结构：

- assistant 消息表示某一版综述。
- user 消息表示一次修改要求。
- 所有消息按时间顺序保存在同一个数组里。

这样用户就可以看到完整链路，而不是只看到最后一版。

### 2.2 从单个 `summaryContent` 升级为 `summaryMessages`

这是这一阶段最关键的数据结构升级。

原来的思路更偏“一个字符串不断被覆盖”。

现在的思路变成：

- 用一个消息数组保存整个线程。
- 用计算属性动态拿到“当前最新一版综述”。
- 流式返回时只往最后一个 assistant 消息里追加 chunk。

这样既保住历史，又不影响原有的流式打字机体验。

### 2.3 二次修改真正变成“基于上一版继续改”

阶段 5B 里，每次发送修改要求时，前端都会先取出当前最新 assistant 消息的内容，作为本轮改写基底，再把用户要求和新的 assistant 占位消息追加到列表中。

这意味着：

- 新一轮修改不是从头生成。
- 也不是基于旧的固定首版生成。
- 而是严格基于“当前最新版本”继续改写。

这更符合真实写作里的迭代过程。

### 2.4 每条 assistant 消息都可以复制 Markdown

用户最终需要的不是复杂的版本管理器，而是：

- 能看到历史版本。
- 如果某一版满意，可以直接复制 Markdown。

因此当前实现选择了一个非常实用的方案：

- 每条 assistant 消息右上角都有“复制 Markdown”按钮。
- 复制的是原始 Markdown，不是渲染后的 HTML。
- 复制成功后会有轻量 toast 提示，按钮文案也会短暂变成“已复制”。

这让工作台更接近 GPT 风格的交互体验。

## 3. 核心实现思路

阶段 5B 的实现可以拆成 4 条主线：

1. 状态层升级
2. 生成与改写链路改造
3. UI 从单块内容改为消息列表
4. Markdown 与引用跳转能力继续复用

### 3.1 状态层：把综述结果建模成消息线程

在 `src/stores/workbench.ts` 中，AI 综述区的核心状态已经改成：

```ts
const summaryMessages = ref<ChatMessage[]>([]);
```

对应的消息类型定义在 `src/types/index.ts`：

```ts
export type MessageType = 'summary_initial' | 'revision_instruction' | 'revision_result';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  messageType: MessageType;
  content: string;
  createdAt: number;
}
```

这样设计的好处是：

- `role` 决定左对齐还是右对齐。
- `messageType` 决定标题文案和图标。
- `content` 保存原始 Markdown。
- `createdAt` 可用于时间展示和后续扩展。

同时，store 里增加了一个非常关键的计算属性：

```ts
const currentSummary = computed(() => {
  const assistantMessages = summaryMessages.value.filter(m => m.role === 'assistant');
  return assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1].content : '';
});
```

它的作用是：

- 对 UI 来说，不需要手动维护“当前版本号对应哪条消息”。
- 对后端调用来说，每次二次修改都能自动拿到最新 assistant 内容。

### 3.2 Store Action：新增消息与流式追加解耦

为了让消息线程结构清晰，store 中增加了两个核心动作：

```ts
const addMessage = (role: 'user' | 'assistant', messageType: MessageType, content: string = '') => {
  summaryMessages.value.push({
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    role,
    messageType,
    content,
    createdAt: Date.now()
  });
};
```

```ts
const appendSummaryChunk = (chunk: string) => {
  if (summaryMessages.value.length === 0) return;
  const lastMessage = summaryMessages.value[summaryMessages.value.length - 1];
  if (lastMessage.role === 'assistant') {
    lastMessage.content += chunk;
  }
};
```

这里的分工非常重要：

- `addMessage()` 负责在时间线上创建一条新消息。
- `appendSummaryChunk()` 负责把流式返回的数据追加到最后一条 assistant 消息。

也就是说，阶段 5B 不再是“清空一个字符串再往里拼”，而是“先插入一个 assistant 占位气泡，再持续往它里面写内容”。

### 3.3 首次生成链路：先创建第一条 assistant 消息，再流式填充

在 `src/features/workbench/WorkbenchPanel.vue` 中，首次生成的关键流程是：

1. `resetSummary()` 清空旧线程。
2. `createSummarySourcesSnapshot()` 固定当前摘录快照。
3. `addMessage('assistant', 'summary_initial', '')` 先插入第一版综述占位消息。
4. 调用 `generateSummaryStream(...)`。
5. 流返回过程中不断执行 `appendSummaryChunk(chunk)`。

这样做有两个好处：

- 列表 UI 能立刻出现“正在生成的第一条 assistant 消息”。
- 流式内容天然落到第一版综述里，不需要额外映射。

### 3.4 多轮改写链路：先取基底，再追加 user / assistant 两条消息

阶段 5B 最核心的动作在 `handleReviseSummary()`。

它的关键顺序是：

1. 先读取 `const baseSummary = workbenchStore.currentSummary`
2. 再追加 user 消息
3. 再追加 assistant 占位消息
4. 发起 `reviseSummaryStream(...)`
5. 把流式 chunk 追加到最后一条 assistant 消息

这里“先取基底，再追加占位消息”非常关键。

如果反过来写，先追加一个空 assistant 消息，再读取 `currentSummary`，那么 `currentSummary` 读到的就会是刚插入的空字符串，导致后端收到空的当前综述，这是之前联调时真实踩过的坑。

因此这一阶段一个重要修正就是：

```ts
const baseSummary = workbenchStore.currentSummary;
```

必须放在：

```ts
workbenchStore.addMessage('assistant', 'revision_result', '');
```

之前执行。

## 4. 为什么引用跳转能力在 5B 里还能继续工作

这是阶段 5B 非常重要的一点。

虽然 UI 从“单块综述”变成了“消息列表”，但 assistant 消息里的正文仍然是 Markdown，引用仍然是 `[1]`、`[2]` 这种格式，所以阶段 4 的引用体系可以直接复用。

整体链路如下：

1. assistant 消息保存原始 Markdown。
2. 渲染时用 `marked()` 把 Markdown 转成 HTML。
3. 再用正则把 `[1]` 这样的引用替换成带 `data-ref-label` 的按钮。
4. 再通过 `DOMPurify.sanitize()` 做安全清洗。
5. 模板里通过 `v-html` 渲染。
6. 外层容器继续用事件委托监听 `.source-ref-btn` 点击。
7. 点击后调用 `handleRefClick(label)`。
8. `handleRefClick()` 去 `summarySources` 快照里找到对应来源。
9. 再调用 `documentStore.jumpToDocumentPage(...)` 触发左侧 PDF 跳页与高亮。

因此，5B 虽然改了展示结构，但没有破坏阶段 4 的溯源链路。

这也是当前实现的一个工程亮点：

- 把“消息线程”和“引用回跳”解耦。
- assistant 消息只是新的承载容器。
- 真正的引用解析和回跳逻辑可以继续复用。

## 5. 复制 Markdown 是怎么实现的

用户在阶段 5B 明确提出一个真实需求：

- 如果我对某一版综述满意，不一定要继续改。
- 我更可能是直接复制这一版 Markdown 去别的地方使用。

因此，`WorkbenchPanel.vue` 里给每条 assistant 消息都加了复制能力。

实现思路如下：

### 5.1 为什么复制原始 Markdown，而不是复制渲染后的 HTML

因为 assistant 消息在 store 里保存的是原始 Markdown 文本：

- 里面保留了原始标题、列表、引用标号。
- 渲染后的 HTML 只是给页面展示用。

如果复制 HTML：

- 用户粘贴到 Markdown 编辑器里体验会很差。
- `[1]` 还可能变成按钮 HTML 结构。

所以正确方案是直接复制 `msg.content`。

### 5.2 优先 Clipboard API，失败时再降级

复制函数的核心策略是：

1. 先尝试 `navigator.clipboard.writeText(content)`
2. 如果浏览器环境或权限不支持，就降级为 `textarea + document.execCommand('copy')`

这保证了兼容性。

### 5.3 用局部 UI 状态做反馈

当前页面里增加了 3 个局部状态：

```ts
const copiedMessageId = ref<string | null>(null);
const copyToastText = ref('');
const isCopyToastVisible = ref(false);
```

它们分别负责：

- 哪一条消息刚刚被复制
- toast 显示什么文案
- toast 当前是否展示

复制成功后会出现两层反馈：

- 当前按钮临时切换为“已复制”
- 右上角弹出“Markdown 已复制”的轻量 toast

这样用户既能看到局部反馈，也能看到全局反馈。

## 6. 阶段 5B 的文件改动归属

这一阶段主要集中在以下几个文件：

### 6.1 `src/types/index.ts`

职责：

- 补充消息线程需要的类型定义。

新增重点：

- `MessageType`
- `ChatMessage`

### 6.2 `src/stores/workbench.ts`

职责：

- 把原本偏单结果的 AI 状态，升级成可维护多轮历史的线程状态。

新增或强化的重点：

- `summaryMessages`
- `currentSummary`
- `addMessage()`
- `appendSummaryChunk()`
- `resetSummary()`

### 6.3 `src/features/workbench/WorkbenchPanel.vue`

职责：

- 负责多轮历史列表 UI。
- 负责首次生成和继续修改的交互。
- 负责 assistant Markdown 渲染。
- 负责每条 assistant 消息的复制能力。
- 负责引用点击后的回跳入口。

这一阶段最主要的视觉变化几乎都在这里。

### 6.4 `src/services/ai.service.ts`

职责：

- 前端继续复用统一的流式解析器。
- 首次生成和二次修改都走相同的流式消费模式。

虽然 5B 本身没有大改这里的协议结构，但它是多轮生成链路能正常工作的基础。

### 6.5 `server/index.js`

职责：

- 继续提供 `/api/generate-summary`
- 继续提供 `/api/revise-summary`
- 保证前后端流式协议一致

5B 依赖 5A 打通的这条基础链路，才能实现“上一版继续改写”。

## 7. 当前这一版的产品边界

阶段 5B 仍然是一个严格收敛的 MVP，不是完整聊天系统。

当前明确没有做的内容包括：

- 没有开放式问答。
- 没有跨主题聊天。
- 没有把历史消息持久化到本地数据库或服务端数据库。
- 没有做版本对比视图。
- 没有做“将某一版设为当前选中版本”的复杂机制。

为什么不做这些：

- 当前任务目标非常明确，就是围绕一份综述持续打磨。
- 过早引入复杂聊天架构，会让产品边界发散。
- 对这个阶段来说，最有价值的是保留历史、继续改写、复制 Markdown。

这也是阶段 5B 的工程取舍。

## 8. 手动验证时应该重点看什么

完成阶段 5B 后，建议按下面顺序验证。

### 8.1 多轮线程是否成立

步骤：

1. 在摘录池里准备若干摘录。
2. 点击“基于摘录生成综述”。
3. 输入第一次修改要求并发送。
4. 再输入第二次修改要求并发送。

预期现象：

- 消息列表结构应为 assistant -> user -> assistant -> user -> assistant。
- assistant 标题应显示“综述版本 1 / 2 / 3”。
- user 消息应显示“我的修改要求”。

### 8.2 每一版 assistant 消息里的 `[n]` 是否还能跳转

步骤：

1. 点击任意一版综述中的 `[1]` 或 `[2]`。

预期现象：

- 右侧对应摘录卡片高亮。
- 左侧 PDF 跳到对应页码。
- 对应原文文本被高亮。

### 8.3 复制 Markdown 是否正常

步骤：

1. 点击任意一版 assistant 消息右上角的“复制 Markdown”。
2. 粘贴到编辑器里。

预期现象：

- 按钮短暂变成“已复制”。
- 右上角出现“Markdown 已复制”的 toast。
- 粘贴结果应为 Markdown 原文，而不是 HTML。

### 8.4 二次修改是否真的基于上一版继续改

步骤：

1. 先让第一版综述生成完成。
2. 输入“把全文翻译成英文”。
3. 再输入“把第一段精简一点”。

预期现象：

- 第二次修改应基于英文版继续改，而不是回退到中文首版重新生成。

## 9. 这一阶段的工程价值

如果从项目复盘或面试角度讲，阶段 5B 很有价值，因为它体现了几个很典型的前端工程能力：

- 能把“单结果 UI”抽象成“消息线程 UI”。
- 能用类型系统约束多种消息结构。
- 能把流式生成和消息列表状态管理结合起来。
- 能在重构 UI 形态的同时，保住既有的引用跳转链路。
- 能围绕真实用户场景设计复制反馈，而不是只停留在功能可用层面。

一句话概括阶段 5B：

它不是把 ScholarFlow AI 改成聊天软件，而是把“单次生成的综述面板”升级成了“可持续打磨、可回看历史、可直接复制成果”的学术写作工作台。
