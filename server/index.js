import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import https from 'https'; // 使用 Node.js 原生模块，解决低版本 Node 没有 fetch 的问题

// 加载环境变量（会读取根目录下的 .env 文件）
dotenv.config();

// 在最顶层从环境变量中提取 API_KEY
// 注意：.env 里定义的名字是 DASHSCOPE_API_KEY，不是 API_KEY
const API_KEY = process.env.DASHSCOPE_API_KEY;

const app = express();

// === 阶段 5A：基于当前综述二次修改 ===
app.post('/api/revise-summary', express.json(), (req, res) => {
  const { currentSummary, summarySources, instruction } = req.body || {};

  if (!currentSummary || !summarySources || !instruction || !Array.isArray(summarySources) || summarySources.length === 0) {
    return res.status(400).json({ error: 'currentSummary, summarySources 和 instruction 不能为空' });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: '服务端未配置 DASHSCOPE_API_KEY，请检查 .env 文件。' });
  }

  const sourcesText = summarySources.map((s) => `[${s.label}] ${s.text}`).join('\n\n');

  const systemPrompt = `你是一个严谨的学术编辑。你的任务是根据用户的修改意见，对已有的文献综述进行改写。
【核心规则】
1. 无论怎么改写，都必须严格基于提供的【原始摘录资料】和【当前版本的综述】。
2. 只要用到了摘录中的信息，就必须在句子末尾保留对应的引用标号（如 [1], [2]）。
3. 不允许捏造不存在的事实、来源或引用编号。
4. 如果用户要求翻译，请只翻译表达方式，不要丢失原有引用标号。
5. 直接输出修改后的 Markdown 综述正文，不要输出额外解释。`;

  const userPrompt = `【原始摘录资料】
${sourcesText}

【当前版本的综述】
${currentSummary}

【用户的修改要求】
${instruction}`;

  // 和首次生成保持同一套 OpenAI 兼容协议，前端才能复用现有 SSE 解析器。
  const postData = JSON.stringify({
    model: 'qwen-plus',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    stream: true,
  });

  const options = {
    hostname: 'dashscope.aliyuncs.com',
    port: 443,
    path: '/compatible-mode/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const aliyunReq = https.request(options, (aliyunRes) => {
    if (aliyunRes.statusCode !== 200) {
      let errData = '';
      aliyunRes.on('data', (chunk) => { errData += chunk; });
      aliyunRes.on('end', () => {
        console.error('阿里云二次修改 API 返回错误:', errData);
        res.status(aliyunRes.statusCode || 500).json({ error: `大模型请求失败: ${errData}` });
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    aliyunRes.pipe(res);
  });

  aliyunReq.on('error', (e) => {
    if (e.message === 'socket hang up') {
      console.log('🟡 已成功切断二次修改与阿里云的连接');
      return;
    }

    console.error('二次修改代理请求时发生网络错误:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: '二次修改代理服务器网络错误' });
    }
  });

  req.on('aborted', () => {
    console.log('🔴 客户端已主动中止二次修改连接，正在中断大模型请求...');
    aliyunReq.destroy();
  });

  aliyunReq.write(postData);
  aliyunReq.end();
});

const PORT = process.env.PORT || 3000;

// 允许跨域和解析 JSON
app.use(cors());
app.use(express.json());

// 【核心 BFF 接口】代理流式生成请求
app.post('/api/generate-summary', (req, res) => {
  const { excerpts } = req.body;
  const apiKey = process.env.DASHSCOPE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 DASHSCOPE_API_KEY，请检查 .env 文件。' });
  }

  if (!excerpts || !Array.isArray(excerpts)) {
    return res.status(400).json({ error: '无效的摘录数据' });
  }

  // 1. 组装 Prompt
  // 将最新的摘录放在最后（倒序遍历），保证 [1] 是最老的那条摘录，[2] 是次老，这最符合人类和大模型的阅读习惯
  const reversedExcerpts = [...excerpts].reverse();
  const excerptTexts = reversedExcerpts.map((e, index) => `[${index + 1}] ${e.text}`).join('\n\n');
  const prompt = `你是一个学术研究助手。请根据以下我摘录的 PDF 文献片段，生成一份结构清晰的文献综述草稿。

【要求】
1. 必须使用 Markdown 格式输出。
2. 保持客观严谨的学术语调。
3. 请在合适的地方引用原文（如在句子末尾加上 [1], [2] 等标记）。
4. 结构建议包含：引言、核心观点、总结。

【摘录片段】
${excerptTexts}`;

  const postData = JSON.stringify({
    model: 'qwen-plus',
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });

  const options = {
    hostname: 'dashscope.aliyuncs.com',
    port: 443,
    path: '/compatible-mode/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  // 2. 发起原生 HTTPS 请求
  const aliyunReq = https.request(options, (aliyunRes) => {
    if (aliyunRes.statusCode !== 200) {
      let errData = '';
      aliyunRes.on('data', (chunk) => { errData += chunk; });
      aliyunRes.on('end', () => {
        console.error('阿里云 API 返回错误:', errData);
        res.status(aliyunRes.statusCode || 500).json({ error: `大模型请求失败: ${errData}` });
      });
      return;
    }

    // 3. 准备将流数据直接转发给前端
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 直接管道透传（pipe），把阿里云返回的数据流，源源不断地写到前端响应里
    aliyunRes.pipe(res);
  });

  aliyunReq.on('error', (e) => {
    // 如果是因为我们主动 destroy 导致的 socket hang up，就当做正常中断处理
    if (e.message === 'socket hang up') {
      console.log('🟡 已成功切断与阿里云的连接');
      return;
    }
    
    console.error('代理请求时发生网络错误:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: '代理服务器网络错误' });
    }
  });

  // 【必改项】处理客户端主动断开连接
  // 监听 'aborted' 事件，这是最准确的客户端异常断开（比如前端调用了 AbortController.abort() 或关闭了网页）
  req.on('aborted', () => {
    console.log('🔴 客户端已主动中止连接，正在中断大模型请求...');
    aliyunReq.destroy(); // 销毁与阿里云的连接，防止服务器资源泄漏
  });

  // 写入请求体并结束请求
  aliyunReq.write(postData);
  aliyunReq.end();
});

app.listen(PORT, () => {
  console.log(`✅ Backend BFF Server running at http://localhost:${PORT}`);
  console.log(`✅ Loaded DASHSCOPE_API_KEY: ${process.env.DASHSCOPE_API_KEY ? 'Yes' : 'No'}`);
});
