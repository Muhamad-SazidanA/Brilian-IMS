import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Document, BoundingBox } from '../../types';
import { defaultHighlightBridge } from '../../wasm/bridge';
import { SAMPLE_HIGHLIGHT_BOXES } from '../../api/client';

interface PdfViewerProps {
  document: Document | null;
  initialPage?: number;
  onClose?: () => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  document,
  initialPage = 1,
  onClose,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(1.0);
  const [showHighlights, setShowHighlights] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync initialPage prop changes
  useEffect(() => {
    if (initialPage) {
      setCurrentPage(initialPage);
    }
  }, [initialPage]);

  const totalPages = document?.pages || 6;

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((p) => p - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage((p) => p + 1);
  };

  const handleZoomIn = () => {
    setScale((s) => Math.min(2.0, Number((s + 0.25).toFixed(2))));
  };

  const handleZoomOut = () => {
    setScale((s) => Math.max(0.75, Number((s - 0.25).toFixed(2))));
  };

  const handleResetZoom = () => {
    setScale(1.0);
  };

  // Base canvas viewport dimensions
  const baseViewportWidth = 750;
  const baseViewportHeight = 980;

  const currentViewportWidth = Math.round(baseViewportWidth * scale);
  const currentViewportHeight = Math.round(baseViewportHeight * scale);

  // Fetch raw bounding boxes for active document and current page
  const rawBoxes: BoundingBox[] = useMemo(() => {
    if (!document) return [];
    const docBoxes = SAMPLE_HIGHLIGHT_BOXES[document.id];
    if (docBoxes && docBoxes[currentPage]) {
      return docBoxes[currentPage];
    }
    // Default sample bounding box for demo on page 2 or 3
    if (currentPage === 2) {
      return [
        {
          page: 2,
          x: 40,
          y: 110,
          width: 520,
          height: 32,
          label: 'Klausul Pembayaran & Jatuh Tempo',
        },
      ];
    }
    if (currentPage === 3) {
      return [
        {
          page: 3,
          x: 40,
          y: 100,
          width: 480,
          height: 32,
          label: 'Klausul Denda Keterlambatan',
        },
      ];
    }
    return [];
  }, [document, currentPage]);

  // Transform coordinates through the Rust Wasm Highlight Bridge!
  const highlightRectangles = useMemo(() => {
    if (!showHighlights || rawBoxes.length === 0) return [];
    try {
      return defaultHighlightBridge.renderHighlights(
        rawBoxes,
        currentViewportWidth,
        currentViewportHeight,
        scale
      );
    } catch (err) {
      console.error('Wasm bridge transform error:', err);
      return [];
    }
  }, [showHighlights, rawBoxes, currentViewportWidth, currentViewportHeight, scale]);

  const pageText =
    document?.preview_content && document.preview_content[currentPage - 1]
      ? document.preview_content[currentPage - 1]
      : `DOKUMEN KONTRAK KERJA SAMA ENTERPRISE\nHALAMAN ${currentPage} DARI ${totalPages}\n\nPASAL ${currentPage}: KETENTUAN DAN SPESIFIKASI LAYANAN\nSeluruh klausul pada halaman ini telah diindeks ke dalam basis data vector pgvector dan diverifikasi melalui modul Rust WebAssembly.`;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden select-none">
      {/* Top Toolbar */}
      <div className="h-14 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span>
            <h3 className="text-xs font-semibold text-white truncate max-w-[200px] sm:max-w-md">
              {document ? document.title : 'PDF Viewer'}
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            WASM Bridge Active
          </span>
        </div>

        {/* Viewer Controls */}
        <div className="flex items-center gap-2">
          {/* Page Pagination */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={currentPage <= 1}
              className="p-1 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
              title="Halaman Sebelumnya"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="px-2 font-mono text-[11px] text-slate-300">
              Hal {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages}
              className="p-1 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
              title="Halaman Berikutnya"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="hidden sm:flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={scale <= 0.75}
              className="p-1 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
              title="Perkecil (-)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="px-2 font-mono text-[11px] text-slate-300 hover:text-white"
              title="Reset Zoom"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={scale >= 2.0}
              className="p-1 rounded hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
              title="Perbesar (+)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* Highlighting Toggle */}
          <button
            type="button"
            onClick={() => setShowHighlights(!showHighlights)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${
              showHighlights
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
            title="Nyalakan/Matikan Overlay Highlight WebAssembly"
          >
            <span>🖍️</span>
            <span className="hidden md:inline">Highlight WASM</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas / Document Viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-8 flex justify-center bg-slate-950/80"
      >
        <div
          style={{
            width: `${currentViewportWidth}px`,
            minHeight: `${currentViewportHeight}px`,
          }}
          className="relative bg-white text-slate-900 shadow-2xl rounded-sm p-10 font-serif leading-relaxed transition-all duration-150 border border-slate-300"
        >
          {/* Watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.03]">
            <span className="text-8xl font-black text-slate-900 transform -rotate-45">
              BRILIAN IDMS
            </span>
          </div>

          {/* Document Content Simulation */}
          <div className="relative z-0">
            {/* Document Header */}
            <div className="border-b-2 border-slate-900 pb-4 mb-6">
              <div className="text-center font-bold text-sm tracking-wider uppercase">
                {document?.title || 'DOKUMEN RESMI PERJANJIAN'}
              </div>
              <div className="text-center text-[10px] text-slate-600 mt-1">
                Kerahasiaan Dokumen Terjaga • Single-Binary On-Premise Protected
              </div>
            </div>

            {/* Document Clauses Text */}
            <div className="text-xs space-y-4 font-sans text-slate-800">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded text-[11px] font-mono leading-relaxed whitespace-pre-line">
                {pageText}
              </div>

              <div className="space-y-2 text-[11px] leading-relaxed text-slate-700">
                <p>
                  <strong>PASAL TERKAIT KEPATUHAN & AUDIT:</strong>
                </p>
                <p>
                  Setiap transaksi dan akses data terikat pada kebijakan RBAC dan otentikasi JWT yang diverifikasi secara realtime pada backend server Golang. Data yang diindeks disimpan pada vector embeddings pgvector untuk memastikan pencarian semantik berkecepatan tinggi.
                </p>
                <p>
                  Sistem WebAssembly pada sisi browser memproses transformasi koordinat bounding box tanpa mengirimkan data mentah dokumen ke server pihak ketiga, menjamin kepatuhan zero-source-code leakage.
                </p>
              </div>

              {/* Signatures Footer */}
              <div className="pt-12 mt-12 border-t border-slate-300 grid grid-cols-2 text-center text-[11px]">
                <div>
                  <div className="font-semibold">PIHAK PERTAMA</div>
                  <div className="h-14"></div>
                  <div className="underline font-medium">PT Brilian Solusi Nusantara</div>
                </div>
                <div>
                  <div className="font-semibold">PIHAK KEDUA</div>
                  <div className="h-14"></div>
                  <div className="underline font-medium">Penyedia Jasa / Vendor IT</div>
                </div>
              </div>
            </div>
          </div>

          {/* Rust WebAssembly Highlighting Bounding Box Overlay Layer */}
          {showHighlights && (
            <div
              className="absolute inset-0 pointer-events-none z-10"
              style={{
                width: `${currentViewportWidth}px`,
                height: `${currentViewportHeight}px`,
              }}
            >
              {highlightRectangles.map((rect, idx) => (
                <div
                  key={idx}
                  style={{
                    left: `${rect.x}px`,
                    top: `${rect.y}px`,
                    width: `${rect.width}px`,
                    height: `${rect.height}px`,
                  }}
                  className="absolute bg-amber-400/30 border-2 border-amber-500 rounded-xs shadow-sm transition-all pointer-events-auto group cursor-help animate-pulse"
                >
                  {/* Tooltip Label */}
                  {rect.label && (
                    <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-slate-900 text-amber-300 text-[10px] font-sans px-2 py-1 rounded shadow-lg border border-slate-700 whitespace-nowrap z-20">
                      <span>🏷️ {rect.label}</span>
                      <div className="text-[9px] text-slate-400 font-mono">
                        X:{rect.x} Y:{rect.y} W:{rect.width} H:{rect.height}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
