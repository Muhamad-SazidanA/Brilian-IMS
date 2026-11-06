import React, { useState } from 'react';
import { Document, CompareResponse, Citation } from '../../types';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface CompareViewProps {
  documents: Document[];
  initialDocA?: Document | null;
  initialDocB?: Document | null;
  onOpenViewerWithCitation?: (docId: string, page: number) => void;
  onOpenWorkflow?: (doc: Document) => void;
}

export const CompareView: React.FC<CompareViewProps> = ({
  documents,
  initialDocA,
  initialDocB,
  onOpenViewerWithCitation,
  onOpenWorkflow,
}) => {
  const { hasPermission } = useAuth();
  const [docAId, setDocAId] = useState<string>(
    initialDocA?.id || (documents[0]?.id || '')
  );
  const [docBId, setDocBId] = useState<string>(
    initialDocB?.id || (documents[1]?.id || documents[0]?.id || '')
  );
  const [query, setQuery] = useState(
    'Bandingkan perubahan nilai klausul denda, batas waktu pembayaran, dan ketentuan SLA pada kedua kontrak ini.'
  );
  const [isComparing, setIsComparing] = useState(false);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canCompare = hasPermission('ai:compare');

  const handleRunCompare = async () => {
    if (!canCompare) {
      setErrorMsg('Forbidden: role does not have AI compare permission');
      return;
    }
    if (!docAId || !docBId) {
      setErrorMsg('Pilih minimal 2 dokumen untuk dibandingkan.');
      return;
    }
    if (docAId === docBId) {
      setErrorMsg('Pilih 2 dokumen yang berbeda untuk membandingkan variasi kontrak/versi.');
      return;
    }

    setIsComparing(true);
    setErrorMsg(null);

    try {
      const res = await api.compareDocuments([docAId, docBId], query);
      setResult(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menjalankan komparasi AI.');
    } finally {
      setIsComparing(false);
    }
  };

  // Convert markdown table text into structured table data
  const parseMarkdownTable = (md: string) => {
    const lines = md.split('\n').filter((l) => l.trim().startsWith('|'));
    if (lines.length < 2) return null;

    const headers = lines[0]
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim().replace(/\*\*/g, ''));
    
    // Skip separator line (e.g. |---|---|)
    const rowLines = lines.slice(2);
    const rows = rowLines.map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim())
    );

    return { headers, rows };
  };

  const docA = documents.find((d) => d.id === docAId);
  const docB = documents.find((d) => d.id === docBId);

  const tableData = result ? parseMarkdownTable(result.comparison_result) : null;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 overflow-y-auto">
      {/* Header */}
      <div className="p-5 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Multi-Document Comparison & Delta Analysis</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  AI Diff Engine
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Analisis perbandingan klausa hukum dan parameter kontrak antar dokumen secara otomatis
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
        {!canCompare ? (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            <h4 className="font-semibold text-sm mb-1">Akses Komparasi Dibatasi (RBAC)</h4>
            <p className="text-slate-400 leading-relaxed">
              Role akun Anda saat ini tidak memiliki hak akses <code>ai:compare</code>.
              Fitur perbandingan multi-dokumen dengan analisis Vertex AI hanya diperuntukkan bagi role <strong>Admin</strong> dan <strong>Reviewer</strong>.
            </p>
          </div>
        ) : (
          <>
            {/* Document Selectors Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Document A Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Dokumen A (Baseline / Versi Awal)</span>
                    {docA && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-sky-400 font-mono">
                        v{docA.current_version}.0
                      </span>
                    )}
                  </label>
                  <select
                    value={docAId}
                    onChange={(e) => setDocAId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title} ({d.id})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Document B Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Dokumen B (Revisi / Komparator)</span>
                    {docB && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 font-mono">
                        v{docB.current_version}.0
                      </span>
                    )}
                  </label>
                  <select
                    value={docBId}
                    onChange={(e) => setDocBId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title} ({d.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Comparison Query Prompt */}
              <div className="mt-4">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Fokus Analisis Perbandingan (AI Prompt)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="misal: Bandingkan klausul denda dan tanggal jatuh tempo..."
                    className="flex-1 px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleRunCompare}
                    disabled={isComparing || !docAId || !docBId}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isComparing ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Menganalisis...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Jalankan Komparasi AI</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400">
                {errorMsg}
              </div>
            )}

            {/* Comparison Results Card */}
            {result && (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Tabel Evaluasi Komparatif</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                        Matched Clauses
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Perbandingan delta klausul berdasarkan analisis NLP semantic difference
                    </p>
                  </div>

                  {/* If either document is in review, show quick workflow approval button */}
                  {(docA?.status === 'review' || docB?.status === 'review') && onOpenWorkflow && (
                    <button
                      type="button"
                      onClick={() => onOpenWorkflow(docB?.status === 'review' ? docB : docA!)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Review / Setujui Dokumen</span>
                    </button>
                  )}
                </div>

                {/* Structured Markdown Table */}
                {tableData ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-300 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-800">
                        <tr>
                          {tableData.headers.map((h, i) => (
                            <th key={i} className="py-3 px-4">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {tableData.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-900/40 transition-colors">
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className={`py-3 px-4 leading-relaxed ${
                                  cIdx === 0
                                    ? 'font-medium text-slate-200'
                                    : 'text-slate-300'
                                }`}
                              >
                                {cell.replace(/\*\*/g, '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <pre className="p-4 bg-slate-900 rounded-xl text-xs text-slate-200 overflow-x-auto whitespace-pre-wrap font-sans">
                    {result.comparison_result}
                  </pre>
                )}

                {/* Citations List & Jump Links */}
                {result.citations && result.citations.length > 0 && (
                  <div className="pt-4 border-t border-slate-800">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                      Sitasi Halaman & Bounding Box Koordinat:
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {result.citations.map((cite: Citation, idx: number) => {
                        const targetDoc = documents.find((d) => d.id === cite.document_id);
                        return (
                          <div
                            key={idx}
                            className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="text-xs font-medium text-slate-200 truncate">
                                {targetDoc?.title || cite.document_id}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                Halaman {cite.page} • OCR Highlighting Ready
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                onOpenViewerWithCitation &&
                                onOpenViewerWithCitation(cite.document_id, cite.page)
                              }
                              className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                            >
                              Buka di Viewer &rarr;
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
