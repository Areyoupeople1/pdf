import { ref, shallowRef, watch } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';

// 初始化 PDF.js worker
// 注意：Vite 环境下使用 ?url 导入 worker
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * 封装 PDF.js 渲染逻辑的 Composable
 * 职责：
 * 1. 加载并解析 PDF 文档
 * 2. 渲染指定页码到 Canvas
 * 3. 提供加载状态和错误状态
 */
export function usePdfRenderer() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  
  // 使用 shallowRef 避免 Vue 代理整个 PDFDocumentProxy 对象，引发性能问题
  const pdfDoc = shallowRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const numPages = ref<number>(0);

  // 渲染锁，防止高频并发渲染导致崩溃
  const isRendering = ref(false);
  let renderTask: pdfjsLib.RenderTask | null = null;
  // 当前加载任务的自增 ID，用于处理并发加载时的竞态覆盖问题
  let currentLoadId = 0;

  /**
   * 加载 PDF 文件
   * @param file 用户上传的 PDF File 对象
   */
  const loadPdf = async (file: File) => {
    loading.value = true;
    error.value = null;
    numPages.value = 0;

    // 每次发起新的加载任务，自增 ID
    const loadId = ++currentLoadId;

    // 【核心修复 2】：显式销毁旧文档，防止 Worker 内存泄漏
    if (pdfDoc.value) {
      try {
        await pdfDoc.value.destroy();
      } catch (e) {
        console.warn('销毁旧 PDF 失败', e);
      }
      pdfDoc.value = null;
    }

    // 切换文档前，取消可能存在的渲染任务
    if (renderTask) {
      renderTask.cancel();
      renderTask = null;
    }
    isRendering.value = false;

    try {
      const arrayBuffer = await file.arrayBuffer();//File 对象只是一个文件外壳，我们要真正读取里面的内容，需要把它转成 ArrayBuffer，读到内存里面
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });//把内存的 ArrayBuffer 传递给 PDF.js，开始解析 PDF 文档
      const doc = await loadingTask.promise;//等待 PDF 文档解析完成，第一层：解析骨架
      
      // 【核心修复 1】：防竞态篡改。如果当前的 ID 已经不等于发起时的 ID，
      // 说明用户在这个漫长的解析过程中又点击了别的文件，抛弃本次结果！
      if (loadId !== currentLoadId) {
        console.log(`检测到加载竞态，抛弃过期的文档: ${file.name}`);
        // 既然抛弃了，顺手把刚刚辛辛苦苦解析出来的废弃文档也销毁掉防泄漏
        await doc.destroy();
        return;
      }

      pdfDoc.value = doc;//将解析完成的 PDF 文档赋值给 pdfDoc 变量(shallowRef)
      numPages.value = doc.numPages;//将解析完成的 PDF 文档的页数赋值给 numPages 变量
    } catch (err: any) {
      console.error('Failed to load PDF:', err);
      error.value = err.message || '加载 PDF 失败';
    } finally {
      loading.value = false;
    }
  };

  /**
   * 渲染特定页面到指定的 Canvas 元素，并渲染 TextLayer
   * @param pageNumber 要渲染的页码（1-based）
   * @param canvas Canvas DOM 元素
   * @param textLayerDiv TextLayer 容器
   * @param scale 缩放比例
   * @param textToHighlight 需要高亮的文本（可选）
   */
  const renderPage = async (
    pageNumber: number, 
    canvas: HTMLCanvasElement, 
    textLayerDiv: HTMLDivElement, // 【新增】接收外部传进来的 textLayer 容器
    scale: number = 1.0,
    textToHighlight?: string | null
  ) => {
    if (!pdfDoc.value) return;

    // 取消之前未完成的渲染任务（核心防抖机制）
    if (renderTask !== null) {
      renderTask.cancel();
      renderTask = null;
    }

    isRendering.value = true;
    let currentTask: any = null;

    try {
      const dpr = window.devicePixelRatio || 1;
      const page = await pdfDoc.value.getPage(pageNumber);
      
      // 1. 渲染 Canvas (高清)
      const viewport = page.getViewport({ scale: scale * dpr });

      // 内部缓冲区 = 逻辑尺寸 × DPR，CSS 尺寸保持逻辑尺寸，避免 Retina 屏模糊
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      
      const canvasContext = canvas.getContext('2d');
      if (!canvasContext) {
        throw new Error('Failed to get 2d context from canvas');
      }

      // 清空画布
      canvasContext.clearRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext,
        viewport,
      };

      currentTask = page.render(renderContext);
      renderTask = currentTask;
      await currentTask.promise;

      // 2. 渲染 TextLayer (逻辑尺寸)
      // 清空旧的文本层
      textLayerDiv.innerHTML = '';
      
      // TextLayer 不需要乘 DPR，使用原始 scale 对应的逻辑尺寸
      const textViewport = page.getViewport({ scale });
      
      // 强制设置 TextLayer 的宽高，使其与 Canvas 的 CSS 逻辑尺寸完全重合
      textLayerDiv.style.width = `${textViewport.width}px`;
      textLayerDiv.style.height = `${textViewport.height}px`;
      // 这里必须设置 CSS 变量，pdfjs-dist 的 text_layer_builder 会读取这些变量来缩放文字
      textLayerDiv.style.setProperty('--scale-factor', scale.toString());

      // 提取该页的文本内容
      const textContent = await page.getTextContent();
      
      // 使用官方 API (v4+) 渲染文本层
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: textViewport
      });
      await textLayer.render();

      // 【阶段 4】在 TextLayer 渲染完成后，执行高亮匹配算法
      if (textToHighlight) {
        highlightTextInLayer(textLayerDiv, textToHighlight);
      }

    } catch (err: any) {
      if (err.name === 'RenderingCancelledException') {
        return;
      }
      console.error(`Failed to render page ${pageNumber}:`, err);
    } finally {
      if (renderTask === currentTask) {
        isRendering.value = false;
      }
    }
  };

  return {
    loading,
    error,
    numPages,
    pdfDoc,
    isRendering,
    loadPdf,
    renderPage,
    highlightTextInLayer, // 【新增】导出高亮算法，允许外部直接调用
    clearHighlightInLayer, // 【新增】清除高亮
  };
}

/**
 * 清除 TextLayer 中的所有高亮样式
 */
export function clearHighlightInLayer(container: HTMLDivElement) {
  const spans = container.querySelectorAll('span');
  spans.forEach(span => {
    span.style.backgroundColor = '';
    span.style.borderRadius = '';
  });
}

/**
 * 在 TextLayer 中查找并高亮指定的文本字符串
 * 核心难点：PDF 的 TextLayer 是由无数个打碎的 <span> 组成的。
 * 一个连续的摘录句子，在 DOM 里可能被拆成了好几个 <span>。
 */
export function highlightTextInLayer(container: HTMLDivElement, targetText: string) {
  // 先清除已有高亮
  clearHighlightInLayer(container);

  if (!targetText) return;
  
  // 1. 去除目标文本的空白字符，方便模糊匹配
  const normalizedTarget = targetText.replace(/\s+/g, '');
  if (!normalizedTarget) return;

  // 2. 拿到容器里所有的文本 span
  const spans = Array.from(container.querySelectorAll('span'));
  if (spans.length === 0) return;

  // 3. 构建一个包含所有 span 文本的“虚拟长字符串”，并记录映射关系
  let fullText = '';
  // 记录 fullText 中每个字符属于哪个 span
  const charIndexToSpanIndex: number[] = [];

  spans.forEach((span, spanIndex) => {
    const text = span.textContent || '';
    for (let i = 0; i < text.length; i++) {
      // 如果不是空白字符，才加入我们的虚拟字符串中
      if (!/\s/.test(text[i])) {
        fullText += text[i];
        charIndexToSpanIndex.push(spanIndex);
      }
    }
  });

  // 4. 在“虚拟长字符串”中查找目标文本
  const startIndex = fullText.indexOf(normalizedTarget);
  if (startIndex === -1) {
    console.warn('当前页面未找到匹配的摘录文本，无法高亮。', { targetText, fullText });
    return;
  }

  const endIndex = startIndex + normalizedTarget.length - 1;

  // 5. 找出这些字符对应的所有 span
  const matchedSpanIndices = new Set<number>();
  for (let i = startIndex; i <= Math.min(endIndex, charIndexToSpanIndex.length - 1); i++) {
    matchedSpanIndices.add(charIndexToSpanIndex[i]);
  }

  // 6. 给命中的 span 添加高亮样式
  let isFirst = true;
  matchedSpanIndices.forEach(index => {
    const span = spans[index];
    if (!span) return;
    
    // 给 TextLayer 的 span 添加背景色
    span.style.backgroundColor = 'rgba(255, 215, 0, 0.4)'; // 金黄色高亮
    span.style.borderRadius = '2px';
    
    // 原本文字是 transparent，为了高亮更清晰，我们也可以稍微改变文字颜色或者保持原样
    // span.style.color = 'rgba(0, 0, 0, 0.8)';
    
    // 如果是第一个匹配的 span，滚动到视野内
    if (isFirst) {
      span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      isFirst = false;
    }
  });
}
