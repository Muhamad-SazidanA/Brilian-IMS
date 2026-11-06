import React, { useState } from 'react';
import { FolderInput, AlertCircle, X, Folder } from 'lucide-react';
import { Document, Folder as FolderType } from '../../types';
import { api } from '../../api/client';

interface MoveModalProps {
  isOpen: boolean;
  document: Document | null;
  folders: FolderType[];
  onClose: () => void;
  onSuccess: () => void;
}

export const MoveModal: React.FC<MoveModalProps> = ({
  isOpen,
  document,
  folders,
  onClose,
  onSuccess,
}) => {
  if (!isOpen || !document) return null;

  const [targetFolderId, setTargetFolderId] = useState(document.folder_id);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetFolderId) {
      setErrorMsg('Pilih folder tujuan');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await api.moveDocument(document.id, targetFolderId);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memindahkan dokumen');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs">
      <div className="bg-paper border border-hairline rounded-md max-w-md w-full p-6 shadow-float flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-hairline">
          <div className="flex items-center gap-2">
            <FolderInput className="w-4 h-4 text-accent stroke-[1.7]" />
            <h3 className="text-sm font-semibold text-ink">Pindahkan dokumen</h3>
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
            <p className="text-xs text-slate mb-2">
              Pindahkan berkas <strong className="text-ink">{document.title}</strong> ke folder:
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto border border-hairline rounded-sm p-1">
              {folders.map((f) => {
                const isSelected = targetFolderId === f.id;
                return (
                  <div
                    key={f.id}
                    onClick={() => setTargetFolderId(f.id)}
                    className={`flex items-center gap-2 p-2 rounded-xs cursor-pointer text-xs transition-colors ${
                      isSelected
                        ? 'bg-accent-subtle text-accent font-semibold'
                        : 'text-ink hover:bg-mist'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-hairline bg-paper hover:bg-mist text-ink text-xs font-medium rounded-sm transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || targetFolderId === document.folder_id}
              className="px-4 py-1.5 bg-accent hover:bg-accent-dark text-white text-xs font-semibold rounded-sm transition-colors disabled:opacity-50"
            >
              Pindahkan sekarang
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

