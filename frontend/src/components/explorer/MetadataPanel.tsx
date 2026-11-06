import React from 'react';
import { Document } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface MetadataPanelProps {
  document: Document | null;
  onOpenViewer: (doc: Document) => void;
  onOpenChat: (doc: Document) => void;
  onOpenCompare: (doc: Document) => void;
  onOpenWorkflow: (doc: Document) => void;
  onClose?: () => void;
}

export const MetadataPanel: React.FC<MetadataPanelProps> = ({
  document,
  onOpenViewer,
  onOpenChat,
  onOpenCompare,
  onOpenWorkflow,
  onClose,
}) => {
  const { hasPermission } = useAuth();
  if (!document) return null;

  const canWorkflow = hasPermission('workflow:action');
  const canCompare = hasPermission('ai:compare');

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="w-80 flex-shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Inspektur Dokumen
        </h4>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Document Overview */}
      <div className="p-4 space-y-4">
        <div>
          <span className="text-[10px] uppercase font-semibold text-sky-400 tracking-wider">
            Judul Dokumen
          </span>
          <h3 className="text-sm font-semibold text-white mt-0.5 leading-snug">
            {document.title}
          </h3>
        </div>

        {/* Quick Launch Buttons */}
        <div className="space-y-1.5 pt-2">
          <button
            type="button"
            onClick={() => onOpenViewer(document)}
            className="w-full flex items-center justify-between px-3 py-2 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>Buka di PDF Viewer</span>
            </span>
            <span className="text-[10px] text-sky-400">Wasm &rarr;</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenChat(document)}
            className="w-full flex items-center justify-between px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span>Tanya AI Agent (Q&A)</span>
            </span>
            <span className="text-[10px] text-indigo-400">RAG &rarr;</span>
          </button>

          {canCompare && (
            <button
              type="button"
              onClick={() => onOpenCompare(document)}
              className="w-full flex items-center justify-between px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span>Bandingkan Dokumen</span>
              </span>
              <span className="text-[10px] text-emerald-400">Compare &rarr;</span>
            </button>
          )}

          {canWorkflow && (
            <button
              type="button"
              onClick={() => onOpenWorkflow(document)}
              className="w-full flex items-center justify-between px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium transition-colors"
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Tindakan Approval</span>
              </span>
              <span className="text-[10px] text-amber-400">Review &rarr;</span>
            </button>
          )}
        </div>

        {/* Detailed Metadata Fields */}
        <div className="pt-4 border-t border-slate-800 space-y-3 text-xs">
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-semibold">ID Dokumen</div>
            <div className="font-mono text-slate-300 break-all select-all mt-0.5 bg-slate-950 px-2 py-1 rounded border border-slate-800">
              {document.id}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Versi</div>
              <div className="text-slate-300 font-medium">v{document.current_version}.0</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Status</div>
              <div className="text-slate-300 font-medium capitalize">{document.status}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Ukuran Berkas</div>
              <div className="text-slate-300">{formatFileSize(document.file_size)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Tipe MIME</div>
              <div className="text-slate-300 font-mono text-[10px]">{document.mime_type}</div>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Status AI & OCR Indexing</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>Indexed with pgvector (768-dim)</span>
            </div>
          </div>

          {document.metadata && Object.keys(document.metadata).length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1.5">
                Klausul Terekstrak (NLP OCR)
              </div>
              <div className="space-y-1 bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-[11px]">
                {Object.entries(document.metadata).map(([key, val]) => (
                  <div key={key}>
                    <span className="text-slate-400 capitalize">{key.replace(/_/g, ' ')}: </span>
                    <span className="text-slate-200 font-medium">
                      {Array.isArray(val) ? val.join(', ') : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
