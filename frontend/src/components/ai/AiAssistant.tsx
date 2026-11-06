import React, { useState } from 'react';
import {
  Bot,
  Cpu,
  Sparkles,
  Send,
  AlertTriangle,
  FileText,
  CornerDownRight,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { api } from '../../api/client';
import { Document } from '../../types';

interface AiAssistantProps {
  activeDocument?: Document | null;
  onNavigateToPage?: (page: number) => void;
}

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  pageReference?: number;
  tokensUsed?: number;
  isInjectionBlocked?: boolean;
  timestamp: string;
}

export const AiAssistant: React.FC<AiAssistantProps> = ({
  activeDocument,
  onNavigateToPage,
}) => {
  const [engineMode, setEngineMode] = useState<'deterministic' | 'semantic'>('deterministic');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: activeDocument
        ? `Dokumen "${activeDocument.title}" aktif. Anda dapat mengajukan pertanyaan faktual atau meminta ringkasan eksekutif.`
        : 'Selamat datang di Asisten Brilian IDMS. Silakan pilih dokumen untuk memulai analisis atau tanya jawab.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [promptShieldAlert, setPromptShieldAlert] = useState<string | null>(null);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputQuery.trim();
    if (!query || isLoading) return;

    setPromptShieldAlert(null);
    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsLoading(true);

    try {
      if (engineMode === 'deterministic') {
        // Deterministic engine mode: keyword search & metadata extraction
        const searchResults = await api.searchDocuments(query, {
          folder_id: activeDocument?.folder_id,
        });

        if (searchResults.length > 0) {
          const top = searchResults[0];
          // Strip HTML tags from snippet for chat presentation
          const cleanSnippet = top.snippet.replace(/<\/?mark>/g, '');
          setMessages((prev) => [
            ...prev,
            {
              id: `ans-${Date.now()}`,
              sender: 'assistant',
              text: `Pencarian deterministik menemukan kecocokan pada "${top.title}":\n\n"${cleanSnippet}"`,
              pageReference: 1,
              tokensUsed: 0,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `ans-${Date.now()}`,
              sender: 'assistant',
              text: 'Tidak ditemukan kecocokan kata kunci pada dokumen aktif dalam indeks pencarian deterministik (0 token LLM).',
              tokensUsed: 0,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
        }
      } else {
        // Semantic LLM mode: Q&A grounded in document context with Prompt Shield defense
        const docId = activeDocument?.id || 'doc-general';
        const docContext = activeDocument?.preview_content?.join('\n') || '';

        const qaRes = await api.askAI(docId, query);

        if (qaRes.answer.includes('manipulasi prompt') || qaRes.answer.includes('INJECTION_BLOCKED')) {
          setPromptShieldAlert('Percobaan manipulasi prompt terdeteksi dan dinetralisir oleh Prompt Shield.');
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `ans-${Date.now()}`,
            sender: 'assistant',
            text: qaRes.answer,
            pageReference: qaRes.page_reference || 1,
            tokensUsed: 142,
            isInjectionBlocked: qaRes.answer.includes('manipulasi prompt'),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text: `Gagal memproses permintaan: ${err.message || 'Kesalahan sistem internal'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!activeDocument || isLoading) return;
    setIsLoading(true);
    setPromptShieldAlert(null);

    const docContent = activeDocument.preview_content?.join('\n') || activeDocument.raw_content || activeDocument.title;

    try {
      const res = await api.summarizeDocument({
        document_id: activeDocument.id,
        text: docContent,
        max_tokens: 350,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `summary-${Date.now()}`,
          sender: 'assistant',
          text: `**Ringkasan Eksekutif (${activeDocument.title}):**\n\n${res.summary}`,
          tokensUsed: res.token_count,
          pageReference: 1,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text: `Gagal menghasilkan ringkasan dokumen: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-paper border border-hairline rounded-md overflow-hidden">
      {/* Header & Engine-First Mode Toggle */}
      <div className="flex flex-col border-b border-hairline bg-mist/40 p-3.5 gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-accent" strokeWidth={1.6} />
            <span className="text-[15px] font-semibold text-ink">Asisten pemahaman dokumen</span>
          </div>

          {activeDocument && (
            <button
              onClick={handleGenerateSummary}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-paper border border-hairline hover:bg-mist text-ink text-xs font-medium rounded-sm transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent" strokeWidth={1.6} />
              <span>Ringkas dokumen</span>
            </button>
          )}
        </div>

        {/* Docked Engine Mode Selector */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEngineMode('deterministic')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-xs font-mono transition-colors border ${
              engineMode === 'deterministic'
                ? 'bg-paper border-accent text-accent font-semibold shadow-subtle'
                : 'bg-mist border-hairline text-slate hover:text-ink'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" strokeWidth={1.6} />
            <span>Mode Mesin Deterministik (0 Token LLM)</span>
          </button>

          <button
            onClick={() => setEngineMode('semantic')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-xs font-mono transition-colors border ${
              engineMode === 'semantic'
                ? 'bg-paper border-accent text-accent font-semibold shadow-subtle'
                : 'bg-mist border-hairline text-slate hover:text-ink'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-success" strokeWidth={1.6} />
            <span>Mode Asisten Semantik (Prompt Shield Aktif)</span>
          </button>
        </div>

        {/* Security Warning Banner if prompt injection blocked */}
        {promptShieldAlert && (
          <div className="flex items-center gap-2 px-3 py-2 bg-danger-subtle border border-danger/30 rounded-sm text-xs text-danger">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" strokeWidth={1.6} />
            <span>{promptShieldAlert}</span>
          </div>
        )}
      </div>

      {/* Conversation Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-paper">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`${
                msg.sender === 'user'
                  ? 'max-w-[80%] bg-accent-subtle border border-accent/20 rounded-md p-3.5 text-sm text-ink'
                  : 'max-w-[85%] bg-mist border border-hairline rounded-md p-4 text-sm text-ink flex flex-col gap-2'
              }`}
            >
              <div className="whitespace-pre-wrap leading-relaxed">{msg.text}</div>

              {/* Citations and Token Metrics */}
              {msg.sender === 'assistant' && (msg.pageReference || msg.tokensUsed !== undefined) && (
                <div className="flex items-center gap-2 pt-1 border-t border-hairline/60 mt-1">
                  {msg.pageReference && (
                    <button
                      onClick={() => onNavigateToPage && onNavigateToPage(msg.pageReference!)}
                      className="inline-flex items-center gap-1 border border-hairline bg-paper px-2 py-0.5 rounded-sm text-xs text-slate hover:border-accent hover:text-ink cursor-pointer font-mono transition-colors"
                      title="Klik untuk membuka halaman ini di penampil dokumen"
                    >
                      <CornerDownRight className="w-3 h-3 text-accent" strokeWidth={1.6} />
                      <span>Hal {msg.pageReference}</span>
                    </button>
                  )}

                  {msg.tokensUsed !== undefined && (
                    <span className="text-[11px] font-mono text-slate-muted">
                      {msg.tokensUsed === 0 ? '0 token (mesin kode)' : `${msg.tokensUsed} token`}
                    </span>
                  )}

                  <span className="text-[11px] font-mono text-slate-muted ml-auto">
                    {msg.timestamp}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-slate font-mono p-2 bg-mist/60 rounded-sm border border-hairline w-fit">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" strokeWidth={1.6} />
            <span>Memproses analisis teks...</span>
          </div>
        )}
      </div>

      {/* Input Composer */}
      <form
        onSubmit={handleSendMessage}
        className="border-t border-hairline bg-paper p-3 flex items-center gap-2"
      >
        <input
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder={
            engineMode === 'deterministic'
              ? 'Cari istilah atau klausul dokumen (pencarian penuh teks)...'
              : 'Ajukan pertanyaan mengenai dokumen aktif...'
          }
          className="flex-1 h-9 bg-mist/50 border border-hairline hover:border-slate/40 focus:bg-paper focus:border-accent rounded-sm px-3 text-sm text-ink placeholder:text-slate-muted transition-colors"
        />

        <button
          type="submit"
          disabled={!inputQuery.trim() || isLoading}
          className="bg-accent hover:bg-accent-dark active:bg-accent-active text-white text-xs font-semibold px-4 py-2 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <span>Kirim</span>
          <Send className="w-3.5 h-3.5" strokeWidth={1.6} />
        </button>
      </form>
    </div>
  );
};
