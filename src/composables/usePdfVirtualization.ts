import { ref, computed } from 'vue';
import * as pdfjsLib from 'pdfjs-dist';
import type { PageMetrics, VisibleRange } from '@/types';

/**
 * PDF 页级虚拟列表核心 Composable
 */
export function usePdfVirtualization() {
  // 保存所有页面的尺寸和位置信息
  const pageMetrics = ref<PageMetrics[]>([]);
  const totalHeight = ref(0);

  // 初始化所有页面的精确尺寸
  // 根据用户修正 1：在不渲染 Canvas 的前提下预计算所有页真实尺寸
  const initializeMetrics = async (pdfDoc: pdfjsLib.PDFDocumentProxy, scale: number = 1.0) => {
    const numPages = pdfDoc.numPages;
    const metrics: PageMetrics[] = [];
    let currentTop = 0;

    // 为了避免一次性阻塞主线程过长，可以分批获取，但因为只是 getViewport，其实很快
    // 如果几百页也可以一次性拿，因为不涉及解析图像
    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDoc.getPage(i);
      
      // 获取 scale=1 时的基础尺寸
      const baseViewport = page.getViewport({ scale: 1.0 });
      const baseWidth = baseViewport.width;
      const baseHeight = baseViewport.height;

      // 计算当前缩放下的尺寸
      const currentWidth = baseWidth * scale;
      const currentHeight = baseHeight * scale;

      metrics.push({
        pageNumber: i,
        baseWidth,
        baseHeight,
        width: currentWidth,
        height: currentHeight,
        top: currentTop,
        bottom: currentTop + currentHeight
      });

      // 累加高度，页与页之间可以留一点 gap (比如 10px)
      currentTop += currentHeight + 10;
    }

    pageMetrics.value = metrics;
    totalHeight.value = currentTop;
  };

  // 响应缩放比例改变（不需要重新调 pdf.js）
  // 根据用户修正 2：用基础尺寸乘缩放，避免误差累积
  const updateScale = (newScale: number) => {
    let currentTop = 0;
    pageMetrics.value = pageMetrics.value.map(metric => {
      const currentWidth = metric.baseWidth * newScale;
      const currentHeight = metric.baseHeight * newScale;

      const newMetric: PageMetrics = {
        ...metric,
        width: currentWidth,
        height: currentHeight,
        top: currentTop,
        bottom: currentTop + currentHeight
      };

      currentTop += currentHeight + 10; // gap 10px
      return newMetric;
    });
    totalHeight.value = currentTop;
  };

  // 二分查找：找到距离顶部最近的一页
  const findPageIndexByTop = (scrollTop: number): number => {
    let start = 0;
    let end = pageMetrics.value.length - 1;

    while (start <= end) {
      const mid = Math.floor((start + end) / 2);
      const metric = pageMetrics.value[mid];

      if (scrollTop >= metric.top && scrollTop <= metric.bottom) {
        return mid;
      } else if (scrollTop < metric.top) {
        end = mid - 1;
      } else {
        start = mid + 1;
      }
    }
    return start;
  };

  // 计算当前可视范围
  const calculateVisibleRange = (scrollTop: number, clientHeight: number, overscan: number = 1): VisibleRange => {
    if (pageMetrics.value.length === 0) return { startIndex: 0, endIndex: 0 };

    const startIndex = findPageIndexByTop(scrollTop);
    let endIndex = startIndex;

    while (endIndex < pageMetrics.value.length - 1 && pageMetrics.value[endIndex].top < scrollTop + clientHeight) {
      endIndex++;
    }

    return {
      startIndex: Math.max(0, startIndex - overscan),
      endIndex: Math.min(pageMetrics.value.length - 1, endIndex + overscan)
    };
  };

  const getVisiblePages = (range: VisibleRange): PageMetrics[] => {
    if (pageMetrics.value.length === 0) return [];
    return pageMetrics.value.slice(range.startIndex, range.endIndex + 1);
  };

  const getCurrentPageNumber = (scrollTop: number, clientHeight: number): number => {
    if (pageMetrics.value.length === 0) return 1;
    const centerTop = scrollTop + clientHeight / 2;
    const index = findPageIndexByTop(centerTop);
    return pageMetrics.value[Math.min(index, pageMetrics.value.length - 1)].pageNumber;
  };

  return {
    pageMetrics,
    totalHeight,
    initializeMetrics,
    updateScale,
    calculateVisibleRange,
    getVisiblePages,
    getCurrentPageNumber
  };
}
