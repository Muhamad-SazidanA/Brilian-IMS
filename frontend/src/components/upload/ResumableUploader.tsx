import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  File,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Pause,
  Play,
  X,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { Folder, DocumentClassification } from '../../types';
import { api, hasPermission } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface UploadQueueItem {
  id: string;
  file: File;
  folderId: string;
  classification: DocumentClassification;
  progress: number;
  receivedChunks: number;
  totalChunks: number;
  speedMBps: number;
  status: 'idle' | 'uploading' | 'paused' | 'completed' | 'error';
  errorMessage?: string;
  detectedMime?: string;
  isQuarantined?: boolean;
  quarantineReason?: string;
  abortController?: AbortController;
}

interface ResumableUploaderProps {
  isOpen: boolean;
  folders: Folder[];
  initialFolderId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const ResumableUploader: React.FC<ResumableUploaderProps> = ({
  isOpen,
  folders,
  initialFolderId,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(
    initialFolderId || folders[0]?.id || 'root'
  );
  const [selectedClassification, setSelectedClassification] =
    useState<DocumentClassification>('Internal');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const canUpload = user ? hasPermission(user.role, 'documents:upload') : false;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  // Pre-validate file for client-side quarantine warnings
  const preCheckFile = (file: File): { safe: boolean; reason?: string; mime: string } => {
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const mime = file.type || 'application/octet-stream';

    // 1. Prohibited executable extensions
    if (['.exe', '.bat', '.cmd', '.sh', '.msi', '.vbs', '.js', '.dll'].includes(ext)) {
      return { safe: false, reason: `Ekstensi '${ext}' dilarang oleh kebijakan keamanan sistem.`, mime };
    }

    // 2. Macro-enabled Office extensions
    if (['.docm', '.xlsm', '.pptm'].includes(ext)) {
      return { safe: false, reason: `Berkas dengan macro VBA (${ext}) dikarantina secara otomatis.`, mime };
    }

    return { safe: true, mime };
  };

  const handleAddFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newItems: UploadQueueItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const check = preCheckFile(f);

      newItems.push({
        id: `upl-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
        file: f,
        folderId: selectedFolderId,
        classification: selectedClassification,
        progress: 0,
        receivedChunks: 0,
        totalChunks: Math.ceil(f.size / (5 * 1024 * 1024)) || 1,
        speedMBps: 0,
        status: check.safe ? 'idle' : 'error',
        errorMessage: check.reason,
        detectedMime: check.mime,
        isQuarantined: !check.safe,
        quarantineReason: check.reason,
      });
    }

    setQueue((prev) => [...prev, ...newItems]);
  };

  const startUploadItem = async (item: UploadQueueItem) => {
    if (item.status === 'completed' || item.isQuarantined) return;

    const controller = new AbortController();

    setQueue((prev) =>
      prev.map((q) =>
        q.id === item.id
          ? { ...q, status: 'uploading', errorMessage: undefined, abortController: controller }
          : q
      )
    );

    try {
      await api.uploadFileResumable(item.file, item.folderId, {
        classification: item.classification,
        division: user?.division || 'General',
        signal: controller.signal,
        onProgress: (percent, received, total, speed) => {
          setQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    progress: percent,
                    receivedChunks: received,
                    totalChunks: total,
                    speedMBps: speed,
                  }
                : q
            )
          );
        },
      });

      setQueue((prev) =>
        prev.map((q) =>
          q.id === item.id ? { ...q, status: 'completed', progress: 100 } : q
        )
      );
    } catch (err: any) {
      if (controller.signal.aborted) {
        setQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: 'paused' } : q))
        );
      } else {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'error',
                  errorMessage: err.message || 'Gagal mengunggah berkas',
                }
              : q
          )
        );
      }
    }
  };

  const pauseUploadItem = (itemId: string) => {
    const item = queue.find((q) => q.id === itemId);
    if (item?.abortController) {
      item.abortController.abort();
    }
  };

  const removeItem = (itemId: string) => {
    pauseUploadItem(itemId);
    setQueue((prev) => prev.filter((q) => q.id !== itemId));
  };

  const handleUploadAll = async () => {
    for (const item of queue) {
      if (item.status === 'idle' || item.status === 'paused') {
        await startUploadItem(item);
      }
    }
    onSuccess();
  };

  const allCompleted = queue.length > 0 && queue.every((q) => q.status === 'completed');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs">
      <div className="bg-paper border border-hairline rounded-md max-w-2xl w-full p-6 shadow-float flex flex-col gap-5 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-hairline">
          <div>
            <h2 className="text-[18px] font-semibold text-ink">Unggah berkas</h2>
            <p className="text-xs text-slate mt-0.5">
              Mesin pengunggahan chunked resumable dengan validasi magic bytes & anti-malware
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate hover:text-ink rounded-sm hover:bg-mist transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* RBAC Warning if user cannot upload */}
        {!canUpload ? (
          <div className="p-4 rounded-sm bg-warning-subtle border border-warning/30 text-warning text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-ink">Akses terbatas</p>
              <p className="text-slate mt-0.5">
                Role Anda tidak memiliki hak akses <code>documents:upload</code>. Hanya Administrator dan Uploader yang berwenang mengunggah berkas.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Target Settings */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate mb-1">Folder tujuan</label>
                <select
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                  className="w-full h-9 bg-mist/50 border border-hairline rounded-sm px-3 text-ink focus:border-accent focus:bg-paper"
                >
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate mb-1">Klasifikasi keamanan</label>
                <select
                  value={selectedClassification}
                  onChange={(e) => setSelectedClassification(e.target.value as DocumentClassification)}
                  className="w-full h-9 bg-mist/50 border border-hairline rounded-sm px-3 text-ink focus:border-accent focus:bg-paper"
                >
                  <option value="Publik">Publik</option>
                  <option value="Internal">Internal</option>
                  <option value="Rahasia">Rahasia</option>
                  <option value="Sangat Rahasia">Sangat Rahasia</option>
                </select>
              </div>
            </div>

            {/* Drag & Drop Area */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                handleAddFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${
                isDragOver ? 'border-accent bg-accent-subtle/40' : 'border-hairline bg-mist hover:border-slate'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleAddFiles(e.target.files)}
              />
              <UploadCloud className="w-8 h-8 mx-auto text-slate stroke-[1.5] mb-2" />
              <p className="text-sm font-semibold text-ink">
                Tarik & lepas berkas ke sini, atau telusuri berkas
              </p>
              <p className="text-xs text-slate-muted mt-1">
                Mendukung PDF, DOCX, XLSX, PPTX, gambar, audio, video, dan arsip hingga 500 MB
              </p>
            </div>

            {/* Queue List */}
            {queue.length > 0 && (
              <div className="space-y-2 overflow-y-auto max-h-56 pr-1">
                <div className="flex items-center justify-between text-xs text-slate px-1">
                  <span>Antrean berkas ({queue.length})</span>
                  <span>Per-file resumable progress</span>
                </div>

                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="border border-hairline rounded-sm p-3 bg-paper flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <File className="w-4 h-4 text-slate flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-ink truncate">{item.file.name}</p>
                          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-muted mt-0.5">
                            <span>{formatFileSize(item.file.size)}</span>
                            <span>•</span>
                            <span>{item.detectedMime}</span>
                            {item.speedMBps > 0 && item.status === 'uploading' && (
                              <>
                                <span>•</span>
                                <span className="text-accent">{item.speedMBps} MB/s</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center gap-1">
                        {item.status === 'uploading' && (
                          <button
                            type="button"
                            onClick={() => pauseUploadItem(item.id)}
                            className="p-1 rounded-sm text-slate hover:text-ink hover:bg-mist"
                            title="Jeda unggahan"
                          >
                            <Pause className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.status === 'paused' && (
                          <button
                            type="button"
                            onClick={() => startUploadItem(item)}
                            className="p-1 rounded-sm text-accent hover:bg-accent-subtle"
                            title="Lanjutkan unggahan"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {item.status === 'completed' && (
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        )}
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="p-1 rounded-sm text-slate-muted hover:text-danger hover:bg-danger-subtle"
                          title="Hapus dari antrean"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="h-1.5 w-full bg-hairline rounded-full overflow-hidden">
                        <div
                          style={{ width: `${item.progress}%` }}
                          className={`h-full transition-all duration-300 ${
                            item.status === 'error'
                              ? 'bg-danger'
                              : item.status === 'completed'
                              ? 'bg-success'
                              : 'bg-accent'
                          }`}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-muted">
                        <span>
                          {item.receivedChunks} / {item.totalChunks} chunks
                        </span>
                        <span>{item.progress}%</span>
                      </div>
                    </div>

                    {/* Quarantine Alert */}
                    {item.isQuarantined && (
                      <div className="bg-danger-subtle border border-danger/30 text-danger text-[11px] p-2 rounded-sm flex items-center gap-2">
                        <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{item.quarantineReason}</span>
                      </div>
                    )}

                    {/* General Error */}
                    {!item.isQuarantined && item.errorMessage && (
                      <div className="bg-danger-subtle border border-danger/30 text-danger text-[11px] p-2 rounded-sm flex items-center gap-2">
                        <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{item.errorMessage}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Footer Actions */}
            <div className="pt-3 border-t border-hairline flex items-center justify-between">
              <span className="text-[11px] text-slate font-mono">
                {queue.length} berkas dalam antrean
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 border border-hairline bg-paper hover:bg-mist text-ink text-xs font-medium rounded-sm transition-colors"
                >
                  {allCompleted ? 'Tutup' : 'Batal'}
                </button>
                <button
                  type="button"
                  onClick={handleUploadAll}
                  disabled={queue.length === 0 || allCompleted}
                  className="px-4 py-1.5 bg-accent hover:bg-accent-dark text-white text-xs font-semibold rounded-sm transition-colors disabled:opacity-50"
                >
                  Unggah semua berkas
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

