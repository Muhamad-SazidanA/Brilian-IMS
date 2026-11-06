import React, { useState, useEffect } from 'react';
import {
  FileText,
  Calendar,
  CreditCard,
  Percent,
  Hash,
  Sparkles,
  Search,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import { api, ExtractedData, ClassificationResult } from '../../api/client';
import { Document } from '../../types';

interface MetadataExtractorProps {
  document?: Document | null;
}

export const MetadataExtractor: React.FC<MetadataExtractorProps> = ({ document }) => {
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [customText, setCustomText] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const runExtraction = async (text: string, filename: string = '') => {
    if (!text.trim()) return;
    setIsProcessing(true);
    try {
      const [meta, cls] = await Promise.all([
        api.extractMetadata(text),
        api.classifyDocument(text, filename),
      ]);
      setExtractedData(meta);
      setClassification(cls);
    } catch (err) {
      console.error('Extraction failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (document) {
      const content =
        document.preview_content?.join('\n') ||
        document.raw_content ||
        document.title;
      runExtraction(content, document.title);
    }
  }, [document]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-paper border border-hairline rounded-md overflow-hidden">
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-hairline bg-mist/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-accent" strokeWidth={1.6} />
          <div>
            <h3 className="text-[15px] font-semibold text-ink">
              Mesin ekstraksi metadata deterministik
            </h3>
            <p className="text-[12px] text-slate">
              Pemindaian pola regex untuk tanggal, mata uang, persentase, dan pengenal dokumen (0 token LLM)
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-paper border border-hairline rounded-xs text-xs font-mono text-slate">
          <div className="w-[7px] h-[7px] rounded-full bg-success" />
          <span>Mesin aktif</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Document Classification Card */}
        {classification && (
          <div className="border border-hairline rounded-md bg-mist/30 p-4 flex flex-col gap-2">
            <div className="text-[11px] font-mono text-slate uppercase tracking-wider">
              Hasil klasifikasi dokumen
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-accent" strokeWidth={1.6} />
                <span className="text-sm font-semibold text-ink">
                  {classification.doc_type}
                </span>
              </div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 border border-hairline rounded-sm bg-paper text-xs font-mono text-slate">
                <span>Keyakinan:</span>
                <span className="font-semibold text-ink">
                  {(classification.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            {classification.matched_keywords && classification.matched_keywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {classification.matched_keywords.map((kw, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 bg-paper border border-hairline text-[11px] font-mono text-slate rounded-xs"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Extracted Metadata Categories */}
        {extractedData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dates */}
            <div className="border border-hairline rounded-md p-3.5 bg-paper flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate">
                <Calendar className="w-4 h-4 text-slate" strokeWidth={1.6} />
                <span>Tanggal Terdeteksi</span>
                <span className="ml-auto text-[11px] font-mono text-slate-muted">
                  ({extractedData.dates.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[38px] items-center">
                {extractedData.dates.length === 0 ? (
                  <span className="text-xs text-slate-muted italic">Tidak ada tanggal terdeteksi</span>
                ) : (
                  extractedData.dates.map((date, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 border border-hairline bg-mist/60 px-2 py-1 rounded-sm text-xs font-mono text-ink"
                    >
                      {date}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Currencies */}
            <div className="border border-hairline rounded-md p-3.5 bg-paper flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate">
                <CreditCard className="w-4 h-4 text-slate" strokeWidth={1.6} />
                <span>Nilai Keuangan & Valuta</span>
                <span className="ml-auto text-[11px] font-mono text-slate-muted">
                  ({extractedData.currencies.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[38px] items-center">
                {extractedData.currencies.length === 0 ? (
                  <span className="text-xs text-slate-muted italic">Tidak ada nilai uang terdeteksi</span>
                ) : (
                  extractedData.currencies.map((curr, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 border border-hairline bg-mist/60 px-2 py-1 rounded-sm text-xs font-mono text-ink font-semibold"
                    >
                      {curr}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Percentages */}
            <div className="border border-hairline rounded-md p-3.5 bg-paper flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate">
                <Percent className="w-4 h-4 text-slate" strokeWidth={1.6} />
                <span>Persentase / Bunga / Denda</span>
                <span className="ml-auto text-[11px] font-mono text-slate-muted">
                  ({extractedData.percentages.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[38px] items-center">
                {extractedData.percentages.length === 0 ? (
                  <span className="text-xs text-slate-muted italic">Tidak ada persentase terdeteksi</span>
                ) : (
                  extractedData.percentages.map((pct, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 border border-hairline bg-mist/60 px-2 py-1 rounded-sm text-xs font-mono text-ink"
                    >
                      {pct}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Identifiers */}
            <div className="border border-hairline rounded-md p-3.5 bg-paper flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate">
                <Hash className="w-4 h-4 text-slate" strokeWidth={1.6} />
                <span>Nomor Identitas & Kontrak (NPWP, NIK, UUID, No.)</span>
                <span className="ml-auto text-[11px] font-mono text-slate-muted">
                  ({extractedData.identifiers.length})
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[38px] items-center">
                {extractedData.identifiers.length === 0 ? (
                  <span className="text-xs text-slate-muted italic">Tidak ada pengenal terdeteksi</span>
                ) : (
                  extractedData.identifiers.map((id, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 border border-hairline bg-mist/60 px-2 py-1 rounded-sm text-xs font-mono text-ink group"
                    >
                      <span>{id}</span>
                      <button
                        onClick={() => copyToClipboard(id, `id-${idx}`)}
                        className="text-slate hover:text-ink transition-colors"
                        title="Salin pengenal"
                      >
                        {copiedKey === `id-${idx}` ? (
                          <Check className="w-3 h-3 text-success" />
                        ) : (
                          <Copy className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                        )}
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-hairline rounded-md p-8 text-center text-slate text-sm">
            {isProcessing ? 'Sedang mengekstraksi metadata...' : 'Pilih dokumen atau masukkan teks untuk dipindai secara deterministik.'}
          </div>
        )}

        {/* Freeform Text Tester */}
        <div className="border border-hairline rounded-md p-4 bg-mist/20 flex flex-col gap-3">
          <div className="text-xs font-semibold text-ink">
            Uji ekstraksi teks kustom (Tanpa pemanggilan LLM)
          </div>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            rows={3}
            placeholder="Ketik atau tempel teks dokumen di sini (contoh: Surat No. SPK/2026/VND-992 tertanggal 06/11/2026 senilai Rp 1.850.000.000 dengan denda 1.5%)..."
            className="w-full bg-paper border border-hairline hover:border-slate/40 focus:border-accent rounded-sm p-2.5 text-xs text-ink placeholder:text-slate-muted transition-colors font-mono"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-muted">
              {customText.length} karakter
            </span>
            <button
              onClick={() => runExtraction(customText, 'custom_text.txt')}
              disabled={!customText.trim() || isProcessing}
              className="bg-accent hover:bg-accent-dark active:bg-accent-active text-white text-xs font-semibold px-4 py-1.5 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} strokeWidth={1.6} />
              <span>Ekstrak deterministik</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
