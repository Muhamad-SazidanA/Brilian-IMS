import React, { useState } from 'react';
import { Document, WorkflowActionType } from '../../types';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface WorkflowModalProps {
  isOpen: boolean;
  document: Document | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const WorkflowModal: React.FC<WorkflowModalProps> = ({
  isOpen,
  document,
  onClose,
  onSuccess,
}) => {
  const { hasPermission } = useAuth();
  const [action, setAction] = useState<WorkflowActionType>('approve');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !document) return null;

  const canWorkflow = hasPermission('workflow:action');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWorkflow) {
      setErrorMsg('Forbidden: role does not have workflow action permission');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await api.executeWorkflowAction(
        `wf-${document.id}`,
        action,
        notes
      );
      setSuccessMsg(res.message || 'Status workflow berhasil diperbarui.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memproses aksi workflow.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Tindakan Workflow Dokumen</h3>
              <p className="text-xs text-slate-400 truncate max-w-xs">{document.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
            <span>{successMsg}</span>
          </div>
        )}

        {!canWorkflow ? (
          <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            <h4 className="font-semibold mb-1">Akses Review Terbatas (RBAC)</h4>
            <p className="text-slate-400">
              Role Anda tidak memiliki wewenang <code>workflow:action</code>. Hanya <strong>Admin</strong> dan <strong>Reviewer</strong> yang dapat menyetujui atau meminta revisi dokumen.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Keputusan Reviewer
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAction('approve')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium text-center transition-all ${
                    action === 'approve'
                      ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500 font-semibold'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  <div className="text-base mb-0.5">✅</div>
                  Setujui
                </button>

                <button
                  type="button"
                  onClick={() => setAction('revise')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium text-center transition-all ${
                    action === 'revise'
                      ? 'bg-amber-600/20 text-amber-300 border-amber-500 font-semibold'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  <div className="text-base mb-0.5">⚠️</div>
                  Minta Revisi
                </button>

                <button
                  type="button"
                  onClick={() => setAction('reject')}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium text-center transition-all ${
                    action === 'reject'
                      ? 'bg-red-600/20 text-red-300 border-red-500 font-semibold'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  }`}
                >
                  <div className="text-base mb-0.5">❌</div>
                  Tolak
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Catatan Review & Audit Trail
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="misal: Dokumen telah sesuai klausul hukum dan disetujui untuk penandatanganan..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Memproses...</span>
                  </>
                ) : (
                  <span>Kirim Keputusan</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
