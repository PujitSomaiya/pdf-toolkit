(function() {
  if (window.pdfjsLib) {
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.js', document.baseURI).href;
    } catch (e) {
      console.warn('Unable to set workerSrc with document.baseURI:', e);
    }
  }

  // Active documents cache to avoid re-parsing the whole PDF on every page render
  const docCache = new Map();

  window.renderPdfPageToPng = async function(pdfData, pageIndex, targetWidth) {
    try {
      if (!window.pdfjsLib) {
        console.warn('pdfjsLib is not loaded');
        return null;
      }

      // Generate a quick cache key from byte length and first/last bytes
      const len = pdfData.length;
      const key = len > 32 
        ? `${len}_${pdfData[0]}_${pdfData[len - 1]}_${pdfData[Math.floor(len / 2)]}` 
        : `${len}`;

      let pdfDoc = docCache.get(key);
      if (!pdfDoc) {
        const loadingTask = window.pdfjsLib.getDocument({
          data: pdfData,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
          cMapPacked: true,
        });
        pdfDoc = await loadingTask.promise;
        docCache.set(key, pdfDoc);
        // Evict older docs if cache grows
        if (docCache.size > 8) {
          const firstKey = docCache.keys().next().value;
          docCache.delete(firstKey);
        }
      }

      const pageNumber = pageIndex + 1;
      if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
        return null;
      }

      const page = await pdfDoc.getPage(pageNumber);
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const width = targetWidth || 360;
      const scale = width / unscaledViewport.width;
      const viewport = page.getViewport({ scale: Math.max(scale, 0.2) });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');

      await page.render({
        canvasContext: ctx,
        viewport: viewport,
      }).promise;

      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(new Uint8Array(reader.result));
          };
          reader.readAsArrayBuffer(blob);
        }, 'image/png');
      });
    } catch (err) {
      console.error('renderPdfPageToPng error:', err);
      return null;
    }
  };
})();
