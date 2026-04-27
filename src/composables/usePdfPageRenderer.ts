import { ref, shallowRef } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';
import { clearHighlightInLayer, highlightTextInLayer } from './usePdf';

/**
 * 单页 PDF 渲染器 Composable
 * 专为虚拟列表设计：每个页面实例持有自己的渲染任务和 Canvas 上下文
 */
export function usePdfPageRenderer() {
  const isRendering = ref(false);
  const error = ref<string | null>(null);

  // 独立持有渲染任务，以便在组件卸载时取消
  let renderTask: pdfjsLib.RenderTask | null = null;

  const renderPage = async (
    page: pdfjsLib.PDFPageProxy,
    canvas: HTMLCanvasElement,
    textLayerDiv: HTMLDivElement,
    scale: number = 1.0,
    textToHighlight?: string | null
  ) => {
    if (renderTask !== null) {
      renderTask.cancel();
      renderTask = null;
    }

    isRendering.value = true;
    error.value = null;
    let currentTask: any = null;

    try {
      const dpr = window.devicePixelRatio || 1;
      
      // 1. 渲染 Canvas (高清)
      const viewport = page.getViewport({ scale: scale * dpr });

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      
      const canvasContext = canvas.getContext('2d');
      if (!canvasContext) throw new Error('Failed to get 2d context from canvas');

      canvasContext.clearRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext,
        viewport,
      };

      currentTask = page.render(renderContext);
      renderTask = currentTask;
      await currentTask.promise;

      // 2. 渲染 TextLayer (逻辑尺寸)
      textLayerDiv.innerHTML = '';
      const textViewport = page.getViewport({ scale });
      
      textLayerDiv.style.width = `${textViewport.width}px`;
      textLayerDiv.style.height = `${textViewport.height}px`;
      textLayerDiv.style.setProperty('--scale-factor', scale.toString());

      const textContent = await page.getTextContent();
      
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: textViewport
      });
      await textLayer.render();

      if (textToHighlight) {
        highlightTextInLayer(textLayerDiv, textToHighlight);
      }

    } catch (err: any) {
      if (err.name === 'RenderingCancelledException') {
        // 这是正常的任务取消，不是错误
        return;
      }
      console.error(`Failed to render page:`, err);
      error.value = err.message || '渲染页面失败';
    } finally {
      if (renderTask === currentTask) {
        isRendering.value = false;
        renderTask = null;
      }
    }
  };

  const cancelRender = () => {
    if (renderTask) {
      renderTask.cancel();
      renderTask = null;
    }
    isRendering.value = false;
  };

  return {
    isRendering,
    error,
    renderPage,
    cancelRender
  };
}
