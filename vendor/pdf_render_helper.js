(function() {
  function getWorkerSrc() {
    try {
      const base = document.baseURI || window.location.href;
      return new URL('vendor/pdf.worker.min.js', base).href;
    } catch (_) {
      return 'vendor/pdf.worker.min.js';
    }
  }

  if (window.pdfjsLib) {
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = getWorkerSrc();
    } catch (e) {
      console.warn('Error setting workerSrc:', e);
    }
  }

  const docCache = new Map();

  /**
   * Renders a single page of a PDF document into a PNG image data byte array (Uint8Array)
   * @param {Uint8Array|ArrayBuffer} pdfData - Raw PDF bytes
   * @param {number} pageIndex - 0-indexed page number
   * @param {number} targetWidth - desired pixel width (default: 1200)
   * @returns {Promise<Uint8Array|null>}
   */
  window.renderPdfPageToPng = async function(pdfData, pageIndex, targetWidth) {
    try {
      if (!window.pdfjsLib) {
        console.error('renderPdfPageToPng: pdfjsLib is not loaded');
        return null;
      }

      // Ensure workerSrc is set
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = getWorkerSrc();
      }

      // Convert any typed data or buffer to clean Uint8Array
      let bytes;
      if (pdfData instanceof Uint8Array) {
        bytes = pdfData;
      } else if (pdfData && pdfData.buffer) {
        bytes = new Uint8Array(pdfData.buffer, pdfData.byteOffset || 0, pdfData.byteLength || pdfData.length);
      } else {
        bytes = new Uint8Array(pdfData);
      }

      // Compute cache key based on byte length and sample bytes
      const len = bytes.length;
      const key = len > 32
        ? `${len}_${bytes[0]}_${bytes[len - 1]}_${bytes[Math.floor(len / 2)]}`
        : `${len}`;

      let pdfDoc = docCache.get(key);
      if (!pdfDoc) {
        const loadingTask = window.pdfjsLib.getDocument({
          data: bytes,
        });
        pdfDoc = await loadingTask.promise;
        docCache.set(key, pdfDoc);
        if (docCache.size > 10) {
          const firstKey = docCache.keys().next().value;
          docCache.delete(firstKey);
        }
      }

      const pageNumber = (pageIndex || 0) + 1;
      if (pageNumber < 1 || pageNumber > pdfDoc.numPages) {
        console.warn(`renderPdfPageToPng: invalid pageNumber ${pageNumber} of ${pdfDoc.numPages}`);
        return null;
      }

      const page = await pdfDoc.getPage(pageNumber);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      // Determine scale factor (default: targetWidth or 1.5x)
      const desiredWidth = targetWidth && targetWidth > 0 ? targetWidth : Math.max(unscaledViewport.width * 1.5, 800);
      const scale = desiredWidth / unscaledViewport.width;
      const viewport = page.getViewport({ scale: Math.max(scale, 0.25) });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      };

      await page.render(renderContext).promise;

      // Extract PNG bytes from canvas
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
          reader.onerror = () => resolve(null);
          reader.readAsArrayBuffer(blob);
        }, 'image/png');
      });
    } catch (err) {
      console.error('renderPdfPageToPng error:', err);
      return null;
    }
  };
})();
