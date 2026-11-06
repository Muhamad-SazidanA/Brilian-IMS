import React, { useState, useEffect } from 'react';
import { Trash2, RotateCcw, AlertTriangle, X, ShieldAlert } from 'lucide-react';
import { TrashItem } from '../../types';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface TrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestored: () => void;
}

export const TrashModal: React.FC<TrashModalProps> = ({ isOpen, onClose, onRestored }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canPurge = user?.role === 'admin' || user?.level === 'L5';

  const loadTrash = async () => {
    setIsLoading(true);
    try {
      const data = await api.getTrashItems();
      setItems(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memuat kotak sampah');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTrash();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRestore = async (id: string) => {
    try {
      await api.restoreTrashItem(id);
      await loadTrash();
      onRestored();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal memulihkan dokumen');
    }
  };

  const handlePurge = async (id: string) => {
    if (!window.confirm('Hapus dokumen ini dan seluruh riwayat versinya secara permanen? Tindakan ini tidak dapat dibatalkan.')) {
      return;
    }
    try {
      await api.permanentlyPurgeTrashItem(id);
      await loadTrash();
      onRestored();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menghapus permanen');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs">
      <div className="bg-paper border border-hairline rounded-md max-w-2xl w-full p-6 shadow-float flex flex-col gap-4 max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-hairline">
          <div className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-danger stroke-[1.7]" />
            <h2 className="text-[18px] font-semibold text-ink">Kotak sampah (trash)</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate hover:text-ink rounded-sm hover:bg-mist transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-danger-subtle border border-danger/30 text-danger text-xs rounded-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* List of deleted items */}
        <div className="flex-1 overflow-y-auto min-h-[220px]">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-slate">Memuat kotak sampah...</div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate space-y-2">
              <Trash2 className="w-8 h-8 mx-auto text-slate-muted stroke-[1.5]" />
              <p>Kotak sampah kosong</p>
            </div>
          ) : (
            <div className="border border-hairline rounded-sm divide-y divide-hairline">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-3 flex items-center justify-between gap-3 hover:bg-mist/30 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">{item.title}</p>
                    <div className="flex items-center gap-2 text-[11px] font-mono text-slate-muted mt-0.5">
                      <span>{formatFileSize(item.file_size)}</span>
                      <span>•</span>
                      <span>Dihapus: {item.deleted_at.substring(0, 10)}</span>
                      <span>•</span>
                      <span>Oleh: {item.deleted_by}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRestore(item.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-hairline bg-paper hover:bg-mist text-ink text-xs font-medium rounded-sm transition-colors"
                      title="Pulihkan dokumen ke direktori asal"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-accent" />
                      <span>Pulihkan</span>
                    </button>

                    {canPurge ? (
                      <button
                        type="button"
                        onClick={() => handlePurge(item.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-danger/30 bg-danger-subtle hover:bg-danger text-danger hover:text-white text-xs font-semibold rounded-sm transition-colors"
                        title="Hapus permanen (Admin / L5 only)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Purge</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-muted italic flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        <span>Purge dibatasi</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-hairline flex items-center justify-between text-xs text-slate">
          <span>{items.length} berkas di dalam kotak sampah</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-paper border border-hairline hover:bg-mist text-ink rounded-sm text-xs font-medium transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

