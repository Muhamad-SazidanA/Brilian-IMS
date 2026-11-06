import React, { useState } from 'react';
import { Document, ChatMessage } from '../../types';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface AgentChatPanelProps {
  document: Document | null;
  onNavigateToPage?: (page: number) => void;
  onClose?: () => void;
}

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
  document,
  onNavigateToPage,
  onClose,
}) => {
  const { hasPermission } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      sender: 'agent',
      text: 'Halo! Saya AI Agent Brilian IDMS. Anda dapat mengajukan pertanyaan spesifik terkait isi dokumen ini, seperti klausul denda, ketentuan pembayaran, hak & kewajiban, atau dasar hukum.',
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canAskAI = hasPermission('ai:qa');

  const suggestedQueries = [
    'Berapa tanggal jatuh tempo pembayaran?',
    'Berapa nilai denda keterlambatan?',
    'Sebutkan klausul pengakhiran kontrak ini.',
    'Berapa target SLA ketersediaan sistem?',
  ];

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || inputQuery;
    if (!textToSend.trim()) return;

    if (!document) {
      setErrorMsg('Pilih dokumen terlebih dahulu untuk melakukan analisis tanya-jawab.');
      return;
    }

    if (!canAskAI) {
      setErrorMsg('Forbidden: role does not have AI QA permission');
      return;
    }

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await api.askAI(document.id, textToSend.trim());
      const agentMsg: ChatMessage = {
        id: `agent-${Date.now()}`,
        sender: 'agent',
        text: res.answer,
        page_reference: res.page_reference,
        timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memperoleh jawaban dari AI agent.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 border-l border-slate-800">
      {/* Chat Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span>AI Agent Document Q&A</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                RAG Engine
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 truncate max-w-xs">
              {document ? `Konteks: ${document.title}` : 'Pilih dokumen dari explorer'}
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Message History Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-sm ${
                msg.sender === 'user'
                  ? 'bg-sky-600 text-white rounded-br-xs'
                  : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-xs'
              }`}
            >
              {/* Message Sender Icon Header */}
              {msg.sender === 'agent' && (
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-indigo-400 mb-1">
                  <span>🤖</span>
                  <span>AI Agent (Vertex / RAG)</span>
                </div>
              )}

              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* Citation badge with click-to-navigate */}
              {msg.page_reference && (
                <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Sitasi Terverifikasi:</span>
                  <button
                    type="button"
                    onClick={() => onNavigateToPage && onNavigateToPage(msg.page_reference!)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-[11px] font-semibold transition-colors border border-indigo-500/30"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Halaman {msg.page_reference}</span>
                  </button>
                </div>
              )}
            </div>
            <span className="text-[10px] text-slate-500 mt-1 px-1">
              {msg.timestamp}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-2 max-w-[80%] bg-slate-800/80 border border-slate-700/50 p-3.5 rounded-2xl rounded-bl-xs animate-pulse">
            <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs">
              🤖
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="text-xs text-indigo-300 font-medium">
                AI Agent sedang menganalisis dokumen via RAG...
              </div>
              <div className="h-2 bg-slate-700 rounded w-5/6"></div>
              <div className="h-2 bg-slate-700 rounded w-3/4"></div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Suggested Query Chips */}
      <div className="px-4 py-2 bg-slate-950/60 border-t border-slate-800/60">
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          Rekomendasi Pertanyaan Cepat:
        </div>
        <div className="flex flex-wrap gap-1.5">
          {suggestedQueries.map((q, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isLoading || !document}
              onClick={() => handleSend(q)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800/90 text-slate-300 hover:text-white hover:bg-slate-700/80 border border-slate-700/60 transition-colors disabled:opacity-50 text-left"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
      >
        <input
          type="text"
          value={inputQuery}
          disabled={isLoading || !document}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder={document ? 'Tanyakan apapun tentang dokumen ini...' : 'Pilih dokumen terlebih dahulu'}
          className="flex-1 px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !inputQuery.trim() || !document}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span>Kirim</span>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </form>
    </div>
  );
};
