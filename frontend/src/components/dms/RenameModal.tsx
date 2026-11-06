import React, { useState } from 'react';
import { Edit3, AlertCircle, X } from 'lucide-react';
import { Document } from '../../types';
import { api } from '../../api/client';

interface RenameModalProps {
  isOpen: boolean;
  document: Document | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  document,
  onClose,
  onSuccess,
}) => {
  if (!isOpen || !document) return null;

  const [title, setTitle] = useState(document.title);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Nama dokumen tidak boleh kosong');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await api.renameDocument(document.id, title.trim());
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengubah nama dokumen');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs">
      <div className="bg-paper border border-hairline rounded-md max-w-md w-full p-6 shadow-float flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-hairline">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-accent stroke-[1.7]" />
            <h3 className="text-sm font-semibold text-ink">Ubah nama dokumen</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate hover:text-ink rounded-sm hover:bg-mist transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 bg-danger-subtle border border-danger/30 text-danger text-xs rounded-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate mb-1">
              Nama dokumen baru
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-9 bg-mist/50 border border-hairline rounded-sm px-3 text-xs text-ink focus:border-accent focus:bg-paper"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-hairline bg-paper hover:bg-mist text-ink text-xs font-medium rounded-sm transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-accent hover:bg-accent-dark text-white text-xs font-semibold rounded-sm transition-colors disabled:opacity-50"
            >
              Simpan perubahan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

