import type { Excerpt, SummarySourceRef } from '@/types';

/**
 * 【重构版】调用后端 BFF 接口获取流式综述
 * 现在前端不需要传递 API Key，也不需要拼接 Prompt，一切脏活都在后端做。
 * 前端只需要请求 `/api/generate-summary` 即可。
 */
export async function generateSummaryStream(
  excerpts: SummarySourceRef[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('/api/generate-summary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ excerpts }),
    signal, // 传递 AbortSignal 给 fetch
  });

  await processStreamResponse(response, onChunk);
}

/**
 * 阶段 5A：调用 BFF 接口，基于用户指令修改当前综述，并流式返回结果
 */
export async function reviseSummaryStream(
  currentSummary: string,
  summarySources: SummarySourceRef[],
  instruction: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('/api/revise-summary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // 注意：按照需求，传递 summarySources 而不是 sources
    body: JSON.stringify({ currentSummary, summarySources, instruction }),
    signal,
  });

  await processStreamResponse(response, onChunk);
}

/**
 * 提取的通用流式响应处理逻辑
 */
async function processStreamResponse(response: Response, onChunk: (text: string) => void) {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`请求失败: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('浏览器不支持 ReadableStream');

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    if (value) {
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        if (trimmedLine === 'data: [DONE]') {
          return;
        }

        if (trimmedLine.startsWith('data: ')) {
          try {
            const dataStr = trimmedLine.slice(6);
            const data = JSON.parse(dataStr);
            const delta = data.choices?.[0]?.delta?.content || '';
            if (delta) {
              onChunk(delta);
            }
          } catch (e) {
            console.warn('解析流式数据块失败 (可能被大模型返回格式干扰):', trimmedLine, e);
          }
        }
      }
    }
  }
}