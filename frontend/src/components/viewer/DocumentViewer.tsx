import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Presentation,
  FileCode,
  Image as ImageIcon,
  Music,
  Video,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  X,
  Highlighter,
} from 'lucide-react';
import { Document, BoundingBox } from '../../types';
import { defaultHighlightBridge } from '../../wasm/bridge';
import { SAMPLE_HIGHLIGHT_BOXES } from '../../api/client';
import { WatermarkOverlay } from './WatermarkOverlay';

interface DocumentViewerProps {
  document: Document | null;
  initialPage?: number;
  onClose?: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  initialPage = 1,
  onClose,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(1.0);
  const [showHighlights, setShowHighlights] = useState<boolean>(true);
  const [activeSlide, setActiveSlide] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPage) {
      setCurrentPage(initialPage);
    }
  }, [initialPage]);

  if (!document) {
    return (
      <div className="flex-1 flex items-center justify-center bg-mist text-slate p-8">
        <div className="text-center space-y-2">
          <FileText className="w-12 h-12 mx-auto text-slate-muted stroke-[1.5]" />
          <p className="text-sm">Pilih dokumen untuk melihat pratinjau</p>
        </div>
      </div>
    );
  }

  const mime = document.mime_type.toLowerCase();
  const totalPages = document.pages || 6;

  // Classify format
  const isPdf = mime.includes('pdf');
  const isDocx = mime.includes('wordprocessingml') || document.title.endsWith('.docx');
  const isXlsx = mime.includes('spreadsheetml') || document.title.endsWith('.xlsx');
  const isPptx = mime.includes('presentationml') || document.title.endsWith('.pptx');
  const isImage = mime.startsWith('image/');
  const isAudio = mime.startsWith('audio/');
  const isVideo = mime.startsWith('video/');
  const isText = mime.startsWith('text/') || document.title.endsWith('.txt');
  const isUnsupported = !isPdf && !isDocx && !isXlsx && !isPptx && !isImage && !isAudio && !isVideo && !isText;

  // Base canvas viewport dimensions
  const baseViewportWidth = 750;
  const baseViewportHeight = 980;
  const currentViewportWidth = Math.round(baseViewportWidth * scale);
  const currentViewportHeight = Math.round(baseViewportHeight * scale);

  // Raw bounding boxes for active document
  const rawBoxes: BoundingBox[] = useMemo(() => {
    if (!document) return [];
    const docBoxes = SAMPLE_HIGHLIGHT_BOXES[document.id];
    if (docBoxes && docBoxes[currentPage]) {
      return docBoxes[currentPage];
    }
    if (currentPage === 2) {
      return [{ page: 2, x: 40, y: 110, width: 520, height: 32, label: 'Klausul Pembayaran & Jatuh Tempo' }];
    }
    if (currentPage === 3) {
      return [{ page: 3, x: 40, y: 100, width: 480, height: 32, label: 'Klausul Denda Keterlambatan' }];
    }
    return [];
  }, [document, currentPage]);

  // Wasm coordinate transformation
  const highlightRectangles = useMemo(() => {
    if (!showHighlights || rawBoxes.length === 0) return [];
    try {
      return defaultHighlightBridge.renderHighlights(
        rawBoxes,
        currentViewportWidth,
        currentViewportHeight,
        scale
      );
    } catch {
      return [];
    }
  }, [showHighlights, rawBoxes, currentViewportWidth, currentViewportHeight, scale]);

  const handleDownload = () => {
    const blob = new Blob([document.raw_content || 'Simulated file content with dynamic watermark'], {
      type: document.mime_type,
    });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = document.title;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-mist overflow-hidden select-none">
      {/* Top Toolbar */}
      <div className="h-14 px-4 bg-paper border-b border-hairline flex items-center justify-between z-20">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {isPdf && <FileText className="w-4 h-4 text-accent flex-shrink-0" />}
            {isDocx && <FileText className="w-4 h-4 text-accent flex-shrink-0" />}
            {isXlsx && <FileSpreadsheet className="w-4 h-4 text-success flex-shrink-0" />}
            {isPptx && <Presentation className="w-4 h-4 text-warning flex-shrink-0" />}
            {isImage && <ImageIcon className="w-4 h-4 text-accent flex-shrink-0" />}
            {isAudio && <Music className="w-4 h-4 text-accent flex-shrink-0" />}
            {isVideo && <Video className="w-4 h-4 text-accent flex-shrink-0" />}
            {isText && <FileCode className="w-4 h-4 text-slate flex-shrink-0" />}
            {isUnsupported && <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />}
            <h2 className="text-[15px] font-semibold text-ink truncate max-w-sm sm:max-w-md">
              {document.title}
            </h2>
          </div>
          <span className="hidden sm:inline-block font-mono text-[11px] px-2 py-0.5 rounded-sm bg-mist border border-hairline text-slate">
            v{document.current_version}.0
          </span>
          <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-mono text-success">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Watermark aktif</span>
          </span>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* PDF pagination */}
          {isPdf && (
            <div className="flex items-center bg-mist rounded-sm p-0.5 border border-hairline text-xs">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1 rounded-sm text-slate hover:text-ink disabled:opacity-40 transition-colors"
                title="Halaman sebelumnya"
              >
                <ChevronLeft className="w-3.5 h-3.5 stroke-[1.7]" />
              </button>
              <span className="px-2 font-mono text-[12px] text-slate">
                Hal {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1 rounded-sm text-slate hover:text-ink disabled:opacity-40 transition-colors"
                title="Halaman berikutnya"
              >
                <ChevronRight className="w-3.5 h-3.5 stroke-[1.7]" />
              </button>
            </div>
          )}

          {/* PPTX slide navigation */}
          {isPptx && (
            <div className="flex items-center bg-mist rounded-sm p-0.5 border border-hairline text-xs">
              <button
                type="button"
                onClick={() => setActiveSlide((s) => Math.max(1, s - 1))}
                disabled={activeSlide <= 1}
                className="p-1 rounded-sm text-slate hover:text-ink disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 font-mono text-[12px] text-slate">
                Slide {activeSlide} / {document.preview_content?.length || 5}
              </span>
              <button
                type="button"
                onClick={() => setActiveSlide((s) => Math.min(document.preview_content?.length || 5, s + 1))}
                disabled={activeSlide >= (document.preview_content?.length || 5)}
                className="p-1 rounded-sm text-slate hover:text-ink disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Zoom controls for PDF / image */}
          {(isPdf || isImage) && (
            <div className="hidden sm:flex items-center bg-mist rounded-sm p-0.5 border border-hairline text-xs">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.75, Number((s - 0.25).toFixed(2))))}
                disabled={scale <= 0.75}
                className="p-1 rounded-sm text-slate hover:text-ink disabled:opacity-40"
                title="Perkecil (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setScale(1.0)}
                className="px-2 font-mono text-[12px] text-slate hover:text-ink"
                title="Reset zoom"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(2.0, Number((s + 0.25).toFixed(2))))}
                disabled={scale >= 2.0}
                className="p-1 rounded-sm text-slate hover:text-ink disabled:opacity-40"
                title="Perbesar (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Wasm highlight toggle */}
          {isPdf && (
            <button
              type="button"
              onClick={() => setShowHighlights(!showHighlights)}
              className={`px-2.5 py-1.5 rounded-sm text-xs font-medium transition-colors flex items-center gap-1.5 border ${
                showHighlights
                  ? 'bg-accent-subtle text-accent border-accent/30'
                  : 'bg-paper text-slate border-hairline hover:bg-mist'
              }`}
            >
              <Highlighter className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Highlight Wasm</span>
            </button>
          )}

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-paper hover:bg-mist text-ink border border-hairline rounded-sm text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate" />
            <span className="hidden sm:inline">Unduh</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate hover:text-ink rounded-sm hover:bg-mist transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Preview Viewport */}
      <div ref={containerRef} className="flex-1 overflow-auto p-6 flex justify-center items-start">
        {/* 1. PDF Preview */}
        {isPdf && (
          <div
            style={{
              width: `${currentViewportWidth}px`,
              minHeight: `${currentViewportHeight}px`,
            }}
            className="relative bg-paper border border-hairline rounded-md p-10 font-sans leading-relaxed transition-all shadow-none"
          >
            <WatermarkOverlay />

            <div className="relative z-10">
              <div className="border-b border-hairline pb-4 mb-6 text-center">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-ink">
                  {document.title}
                </h3>
                <p className="text-[11px] text-slate mt-1 font-mono">
                  Halaman {currentPage} dari {totalPages} • Brilian IDMS On-Premise Protection
                </p>
              </div>

              <div className="text-xs space-y-4 text-ink leading-relaxed">
                <div className="p-4 bg-mist border border-hairline rounded-sm font-mono text-[12px] leading-relaxed whitespace-pre-line">
                  {document.preview_content && document.preview_content[currentPage - 1]
                    ? document.preview_content[currentPage - 1]
                    : `DOKUMEN KONTRAK KERJA SAMA ENTERPRISE\nHALAMAN ${currentPage} DARI ${totalPages}\n\nPASAL ${currentPage}: KETENTUAN DAN SPESIFIKASI LAYANAN\nSeluruh klausul pada halaman ini telah diindeks ke dalam basis data vector pgvector dan diverifikasi melalui modul Rust WebAssembly.`}
                </div>

                <div className="space-y-2 text-[12px] text-slate">
                  <p>
                    <strong>Ketentuan kepatuhan & audit:</strong>
                  </p>
                  <p>
                    Setiap transaksi dan akses data terikat pada kebijakan RBAC dan otentikasi JWT yang diverifikasi secara realtime pada backend server Golang. Data yang diindeks disimpan pada vector embeddings pgvector untuk memastikan pencarian semantik berkecepatan tinggi.
                  </p>
                  <p>
                    Sistem WebAssembly pada sisi browser memproses transformasi koordinat bounding box tanpa mengirimkan data mentah dokumen ke server pihak ketiga, menjamin kepatuhan zero-source-code leakage.
                  </p>
                </div>

                <div className="pt-8 mt-8 border-t border-hairline grid grid-cols-2 text-center text-[12px]">
                  <div>
                    <div className="font-medium text-slate">Pihak Pertama</div>
                    <div className="h-12"></div>
                    <div className="font-semibold text-ink">PT Brilian Solusi Nusantara</div>
                  </div>
                  <div>
                    <div className="font-medium text-slate">Pihak Kedua</div>
                    <div className="h-12"></div>
                    <div className="font-semibold text-ink">Penyedia Jasa / Vendor IT</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Wasm Highlighting Overlay Layer */}
            {showHighlights && (
              <div
                className="absolute inset-0 pointer-events-none z-20"
                style={{ width: `${currentViewportWidth}px`, height: `${currentViewportHeight}px` }}
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
                    className="absolute bg-warning/20 border-2 border-warning rounded-xs pointer-events-auto group cursor-help transition-all"
                  >
                    {rect.label && (
                      <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-ink text-white text-[11px] font-sans px-2.5 py-1 rounded-sm shadow-float whitespace-nowrap z-30">
                        <span>{rect.label}</span>
                        <div className="text-[10px] text-slate-muted font-mono mt-0.5">
                          X:{rect.x} Y:{rect.y} W:{rect.width} H:{rect.height}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2. DOCX Word Document Preview */}
        {isDocx && (
          <div className="relative w-full max-w-3xl bg-paper border border-hairline rounded-md p-10 text-ink leading-relaxed">
            <WatermarkOverlay />
            <div className="relative z-10 space-y-6">
              <div className="border-b border-hairline pb-4">
                <span className="text-[11px] font-mono uppercase tracking-wider text-accent">
                  Microsoft Word Document (OpenXML)
                </span>
                <h1 className="text-xl font-semibold text-ink mt-1">{document.title}</h1>
              </div>
              <div className="space-y-4 text-sm leading-relaxed">
                {(document.preview_content || [
                  'Dokumen spesifikasi formal diterbitkan untuk keperluan internal.',
                  'Seluruh klausul dan arsitektur teknis telah disetujui oleh Komite Tata Kelola Teknologi Informasi.',
                  'Penyimpanan berkas dikelola melalui MinIO object storage dan metadata terindeks pada PostgreSQL.'
                ]).map((para, i) => (
                  <p key={i} className="text-slate-700 whitespace-pre-line">{para}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 3. XLSX Spreadsheet Preview */}
        {isXlsx && (
          <div className="relative w-full max-w-4xl bg-paper border border-hairline rounded-md p-6 overflow-x-auto">
            <WatermarkOverlay />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between border-b border-hairline pb-3">
                <div>
                  <h3 className="font-semibold text-sm text-ink">{document.title}</h3>
                  <span className="text-xs text-slate">Lembar kerja aktif: Sheet 1 (Ringkasan Keuangan)</span>
                </div>
                <span className="font-mono text-xs px-2 py-0.5 rounded-sm bg-mist border border-hairline text-slate">
                  {formatFileSize(document.file_size)}
                </span>
              </div>

              {document.raw_content ? (
                (() => {
                  try {
                    const rows = JSON.parse(document.raw_content);
                    return (
                      <table className="w-full text-xs text-left border border-hairline">
                        <thead className="bg-mist border-b border-hairline">
                          <tr>
                            {rows[0]?.map((col: string, ci: number) => (
                              <th key={ci} className="p-2.5 font-semibold text-ink border-r border-hairline last:border-r-0">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline font-mono">
                          {rows.slice(1).map((row: string[], ri: number) => (
                            <tr key={ri} className="hover:bg-mist/40">
                              {row.map((cell: string, ci: number) => (
                                <td key={ci} className="p-2.5 text-slate border-r border-hairline last:border-r-0">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  } catch {
                    return <p className="text-xs text-slate">Tidak dapat mem-parsing data lembar kerja.</p>;
                  }
                })()
              ) : (
                <p className="text-xs text-slate">Tabel lembar kerja siap ditampilkan.</p>
              )}
            </div>
          </div>
        )}

        {/* 4. PPTX Presentation Slide Deck */}
        {isPptx && (
          <div className="relative w-full max-w-3xl bg-paper border border-hairline rounded-md p-8 aspect-video flex flex-col justify-between">
            <WatermarkOverlay />
            <div className="relative z-10 flex-1 flex flex-col justify-center text-center space-y-4">
              <span className="font-mono text-xs text-warning uppercase tracking-wider">
                Slide {activeSlide} of {document.preview_content?.length || 5}
              </span>
              <h2 className="text-xl font-semibold text-ink max-w-lg mx-auto">
                {document.preview_content && document.preview_content[activeSlide - 1]
                  ? document.preview_content[activeSlide - 1]
                  : `Presentasi Strategis: Halaman ${activeSlide}`}
              </h2>
            </div>
            <div className="relative z-10 flex justify-between items-center pt-4 border-t border-hairline text-xs text-slate">
              <span>Brilian IDMS Executive Slide Viewer</span>
              <span className="font-mono">Rencana Strategis 2026</span>
            </div>
          </div>
        )}

        {/* 5. Image Preview */}
        {isImage && (
          <div className="relative max-w-3xl bg-paper border border-hairline rounded-md p-6 flex flex-col items-center">
            <WatermarkOverlay />
            <div className="relative z-10 space-y-4 text-center">
              <div
                style={{ transform: `scale(${scale})` }}
                className="w-96 h-64 bg-mist border border-hairline rounded-sm flex items-center justify-center transition-transform"
              >
                <div className="text-center space-y-2 p-4">
                  <ImageIcon className="w-12 h-12 mx-auto text-accent stroke-[1.5]" />
                  <p className="font-mono text-xs text-ink">{document.title}</p>
                  <p className="font-mono text-[11px] text-slate">Resolusi: 1920x1080 • PNG Lossless</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. Media Audio Preview */}
        {isAudio && (
          <div className="relative w-full max-w-lg bg-paper border border-hairline rounded-md p-6 space-y-4">
            <WatermarkOverlay />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-sm bg-accent-subtle text-accent flex items-center justify-center">
                  <Music className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-ink">{document.title}</h3>
                  <span className="font-mono text-xs text-slate">Audio MP3 • 42:15 menit</span>
                </div>
              </div>
              <div className="h-10 bg-mist border border-hairline rounded-sm flex items-center justify-center font-mono text-xs text-slate">
                <span>[ Pemutar Audio Terintegrasi ]</span>
              </div>
            </div>
          </div>
        )}

        {/* 7. Plain Text / Code Preview */}
        {isText && (
          <div className="relative w-full max-w-3xl bg-paper border border-hairline rounded-md p-6 font-mono text-xs">
            <WatermarkOverlay />
            <div className="relative z-10 space-y-2">
              <div className="border-b border-hairline pb-2 mb-4 flex justify-between text-slate">
                <span>{document.title}</span>
                <span>Plain Text UTF-8</span>
              </div>
              <pre className="text-slate-800 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                {document.raw_content || 'Memuat berkas teks...'}
              </pre>
            </div>
          </div>
        )}

        {/* 8. Non-Renderable Binary Fallback */}
        {isUnsupported && (
          <div className="w-full max-w-lg bg-paper border border-hairline rounded-md p-8 space-y-6 text-center">
            <div className="w-14 h-14 rounded-full bg-mist border border-hairline flex items-center justify-center mx-auto text-slate">
              <AlertCircle className="w-7 h-7 stroke-[1.5]" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-semibold text-ink">{document.title}</h3>
              <p className="text-xs text-slate">
                Format berkas ini tidak mendukung pratinjau inline langsung, namun seluruh metadata teknis tercatat secara aman.
              </p>
            </div>

            {/* Complete Technical Metadata Card */}
            <div className="bg-mist border border-hairline rounded-sm p-4 text-left font-mono text-xs space-y-2.5">
              <div className="flex justify-between">
                <span className="text-slate font-sans">Tipe MIME:</span>
                <span className="text-ink">{document.mime_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate font-sans">Ukuran Berkas:</span>
                <span className="text-ink">{formatFileSize(document.file_size)} ({document.file_size.toLocaleString()} byte)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate font-sans">Versi Aktif:</span>
                <span className="text-ink">v{document.current_version}.0</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate font-sans">Diunggah Oleh:</span>
                <span className="text-ink">{document.uploaded_by}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate font-sans">Waktu Unggah:</span>
                <span className="text-ink">{document.created_at.substring(0, 19).replace('T', ' ')} UTC</span>
              </div>
              {document.sha256 && (
                <div className="pt-2 border-t border-hairline">
                  <span className="text-slate font-sans block mb-1">SHA-256 Hash:</span>
                  <span className="text-[11px] text-slate-800 break-all bg-paper p-1.5 rounded-sm border border-hairline block">
                    {document.sha256}
                  </span>
                </div>
              )}
            </div>

            {/* Conditional Download Action */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleDownload}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dark text-white rounded-sm text-xs font-semibold transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Unduh berkas terverifikasi</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

