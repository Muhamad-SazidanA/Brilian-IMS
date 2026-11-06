import React, { useState, useEffect } from 'react';
import {
  Folder,
  FolderPlus,
  FolderOpen,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileCode,
  Image as ImageIcon,
  Music,
  Video,
  File,
  Search,
  LayoutList,
  LayoutGrid,
  UploadCloud,
  Trash2,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  ShieldCheck,
  Edit3,
  FolderInput,
  Eye,
  MessageSquare,
  GitCompare,
  CheckCircle,
  HardDrive,
} from 'lucide-react';
import {
  Folder as FolderType,
  Document as DocumentType,
  DocumentStatus,
  DocumentVersion,
  ViewMode,
} from '../../types';
import { api, hasPermission } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { RenameModal } from './RenameModal';
import { MoveModal } from './MoveModal';
import { TrashModal } from './TrashModal';

interface DmsExplorerProps {
  folders: FolderType[];
  documents: DocumentType[];
  selectedFolderId: string | null;
  selectedDocument: DocumentType | null;
  onSelectFolder: (folderId: string | null) => void;
  onSelectDocument: (doc: DocumentType | null) => void;
  onOpenUpload: () => void;
  onOpenViewer: (doc: DocumentType, page?: number) => void;
  onOpenChat: (doc: DocumentType) => void;
  onOpenCompare: (doc: DocumentType) => void;
  onOpenWorkflow: (doc: DocumentType) => void;
  onRefreshData: () => void;
}

export const DmsExplorer: React.FC<DmsExplorerProps> = ({
  folders,
  documents,
  selectedFolderId,
  selectedDocument,
  onSelectFolder,
  onSelectDocument,
  onOpenUpload,
  onOpenViewer,
  onOpenChat,
  onOpenCompare,
  onOpenWorkflow,
  onRefreshData,
}) => {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'fld-legal': true,
  });

  // Modal dialog states
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<DocumentType | null>(null);
  const [moveTarget, setMoveTarget] = useState<DocumentType | null>(null);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [trashCount, setTrashCount] = useState(0);

  // Version history state for inspector
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  const canUpload = user ? hasPermission(user.role, 'documents:upload') : false;
  const canDelete = user ? (hasPermission(user.role, 'documents:delete') || user.role === 'admin') : false;
  const canManageFolders = user ? hasPermission(user.role, 'folders:manage') : false;

  const loadTrashBadge = async () => {
    try {
      const items = await api.getTrashItems();
      setTrashCount(items.length);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadTrashBadge();
  }, [documents]);

  // Load versions whenever active document changes
  useEffect(() => {
    if (selectedDocument) {
      setIsLoadingVersions(true);
      api.getDocumentVersions(selectedDocument.id)
        .then((vList) => setVersions(vList))
        .catch(() => setVersions([]))
        .finally(() => setIsLoadingVersions(false));
    } else {
      setVersions([]);
    }
  }, [selectedDocument]);

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      api.addFolder(newFolderName.trim(), selectedFolderId);
      setNewFolderName('');
      setIsNewFolderOpen(false);
      onRefreshData();
    }
  };

  const handleDeleteDocument = async (doc: DocumentType, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Pindahkan dokumen "${doc.title}" ke kotak sampah?`)) {
      try {
        await api.deleteDocument(doc.id);
        onRefreshData();
        loadTrashBadge();
      } catch (err: any) {
        alert(err.message || 'Gagal memindahkan dokumen ke sampah');
      }
    }
  };

  const handleRestoreVersion = async (versionNum: number) => {
    if (!selectedDocument) return;
    if (window.confirm(`Pulihkan dokumen ke Versi ${versionNum}? Tindakan ini akan membuat versi aktif baru.`)) {
      try {
        const updated = await api.restoreDocumentVersion(selectedDocument.id, versionNum);
        onSelectDocument(updated);
        onRefreshData();
      } catch (err: any) {
        alert(err.message || 'Gagal memulihkan versi');
      }
    }
  };

  // Filter documents
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
    const matchesFolder = !selectedFolderId || doc.folder_id === selectedFolderId;
    return matchesSearch && matchesStatus && matchesFolder && !doc.is_deleted;
  });

  // Calculate current folder breadcrumbs
  const getBreadcrumbs = () => {
    if (!selectedFolderId) return [{ id: null, name: 'Semua Dokumen' }];
    const pathList: { id: string | null; name: string }[] = [];
    let currentId: string | null = selectedFolderId;

    while (currentId) {
      const fld = folders.find((f) => f.id === currentId);
      if (fld) {
        pathList.unshift({ id: fld.id, name: fld.name });
        currentId = fld.parent_id;
      } else {
        break;
      }
    }
    pathList.unshift({ id: null, name: 'Home' });
    return pathList;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const getFileIcon = (mime: string, title: string) => {
    const lower = mime.toLowerCase();
    if (lower.includes('pdf')) return <FileText className="w-4 h-4 text-accent flex-shrink-0" />;
    if (lower.includes('spreadsheetml') || title.endsWith('.xlsx')) return <FileSpreadsheet className="w-4 h-4 text-success flex-shrink-0" />;
    if (lower.includes('wordprocessingml') || title.endsWith('.docx')) return <FileText className="w-4 h-4 text-accent flex-shrink-0" />;
    if (lower.includes('presentationml') || title.endsWith('.pptx')) return <Presentation className="w-4 h-4 text-warning flex-shrink-0" />;
    if (lower.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-accent flex-shrink-0" />;
    if (lower.startsWith('audio/')) return <Music className="w-4 h-4 text-accent flex-shrink-0" />;
    if (lower.startsWith('video/')) return <Video className="w-4 h-4 text-accent flex-shrink-0" />;
    if (lower.startsWith('text/') || title.endsWith('.txt')) return <FileCode className="w-4 h-4 text-slate flex-shrink-0" />;
    return <File className="w-4 h-4 text-slate flex-shrink-0" />;
  };

  const getClassificationBadge = (cls?: string) => {
    switch (cls) {
      case 'Sangat Rahasia':
        return <span className="font-mono text-[11px] px-2 py-0.5 rounded-sm bg-danger-subtle text-danger border border-danger/30">Sangat Rahasia</span>;
      case 'Rahasia':
        return <span className="font-mono text-[11px] px-2 py-0.5 rounded-sm bg-warning-subtle text-warning border border-warning/30">Rahasia</span>;
      case 'Publik':
        return <span className="font-mono text-[11px] px-2 py-0.5 rounded-sm bg-mist text-slate border border-hairline">Publik</span>;
      default:
        return <span className="font-mono text-[11px] px-2 py-0.5 rounded-sm bg-accent-subtle text-accent border border-accent/30">Internal</span>;
    }
  };

  // Render folder hierarchy
  const rootFolders = folders.filter((f) => !f.parent_id);
  const getChildFolders = (parentId: string) => folders.filter((f) => f.parent_id === parentId);

  const renderFolderNode = (folder: FolderType, depth = 0) => {
    const children = getChildFolders(folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = !!expandedFolders[folder.id];
    const isSelected = selectedFolderId === folder.id;
    const docCount = documents.filter((d) => d.folder_id === folder.id && !d.is_deleted).length;

    return (
      <div key={folder.id} className="select-none">
        <div
          onClick={() => onSelectFolder(folder.id)}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`flex items-center justify-between py-1.5 pr-2 rounded-sm cursor-pointer text-xs transition-colors group ${
            isSelected
              ? 'bg-accent-subtle text-accent font-semibold border-l-2 border-accent'
              : 'text-ink hover:bg-mist'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(folder.id, e)}
                className="w-4 h-4 flex items-center justify-center text-slate hover:text-ink rounded-xs"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <span className="w-4" />
            )}
            {isSelected ? (
              <FolderOpen className="w-3.5 h-3.5 text-accent flex-shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-slate flex-shrink-0" />
            )}
            <span className="truncate">{folder.name}</span>
          </div>

          <span className="font-mono text-[11px] text-slate-muted">{docCount}</span>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5 mt-0.5">
            {children.map((child) => renderFolderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-paper">
      {/* =========================================================================
          Pane 1: Left Folder Hierarchy Pane
          ========================================================================= */}
      <div className="w-64 flex-shrink-0 border-r border-hairline bg-mist/40 p-3 flex flex-col justify-between h-full">
        <div className="space-y-3 overflow-hidden flex flex-col flex-1">
          {/* Top Folder Action */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate uppercase tracking-wider">
              Direktori berkas
            </span>
            {canManageFolders && (
              <button
                type="button"
                onClick={() => setIsNewFolderOpen(true)}
                className="inline-flex items-center gap-1 px-2 py-1 border border-hairline bg-paper hover:bg-mist text-ink text-xs font-medium rounded-sm transition-colors"
                title="Tambah folder baru"
              >
                <FolderPlus className="w-3.5 h-3.5 text-accent" />
                <span>Folder baru</span>
              </button>
            )}
          </div>

          {/* New Folder Form Dialog */}
          {isNewFolderOpen && (
            <form onSubmit={handleCreateFolder} className="p-2 border border-hairline bg-paper rounded-sm space-y-2">
              <input
                type="text"
                autoFocus
                placeholder="Nama folder..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full h-8 px-2 text-xs bg-mist/50 border border-hairline rounded-sm text-ink focus:border-accent"
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsNewFolderOpen(false)}
                  className="px-2 py-1 text-[11px] text-slate hover:text-ink"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-2.5 py-1 text-[11px] bg-accent text-white rounded-sm font-medium"
                >
                  Simpan
                </button>
              </div>
            </form>
          )}

          {/* Folder Tree Scroll */}
          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
            <div
              onClick={() => onSelectFolder(null)}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-sm cursor-pointer text-xs transition-colors ${
                selectedFolderId === null
                  ? 'bg-accent-subtle text-accent font-semibold border-l-2 border-accent'
                  : 'text-ink hover:bg-mist'
              }`}
            >
              <div className="flex items-center gap-2">
                <Folder className="w-3.5 h-3.5 text-accent" />
                <span>Semua dokumen</span>
              </div>
              <span className="font-mono text-[11px] text-slate-muted">
                {documents.filter((d) => !d.is_deleted).length}
              </span>
            </div>

            <div className="pt-2 pb-1 text-[10px] uppercase font-semibold text-slate-muted px-2 tracking-wider">
              Kategori direktori
            </div>

            {rootFolders.map((fld) => renderFolderNode(fld, 0))}
          </div>
        </div>

        {/* Bottom Quota & Trash Section */}
        <div className="pt-3 border-t border-hairline space-y-2.5">
          {/* Quota Widget */}
          <div className="bg-paper border border-hairline rounded-sm p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-slate font-medium">
                <HardDrive className="w-3.5 h-3.5" />
                <span>Kapasitas penyimpanan</span>
              </span>
              <span className="font-mono text-slate-muted">2.4 GB / 10 GB</span>
            </div>
            <div className="h-1.5 w-full bg-hairline rounded-full overflow-hidden">
              <div style={{ width: '24%' }} className="h-full bg-accent" />
            </div>
          </div>

          {/* Trash Navigation Button */}
          <button
            type="button"
            onClick={() => setIsTrashOpen(true)}
            className="w-full flex items-center justify-between px-3 py-2 bg-paper hover:bg-mist border border-hairline rounded-sm text-xs font-medium text-ink transition-colors"
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5 text-danger" />
              <span>Kotak sampah</span>
            </span>
            {trashCount > 0 && (
              <span className="font-mono text-[11px] px-1.5 py-0.2 rounded-xs bg-danger-subtle text-danger font-semibold border border-danger/30">
                {trashCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* =========================================================================
          Pane 2: Center Main Explorer Pane
          ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 bg-paper overflow-hidden">
        {/* Top Breadcrumb & Actions Bar */}
        <div className="p-4 border-b border-hairline flex flex-wrap items-center justify-between gap-3 bg-paper">
          {/* Breadcrumb Navigation */}
          <nav className="flex items-center gap-1.5 text-xs text-slate overflow-hidden">
            {getBreadcrumbs().map((b, i, arr) => {
              const isLast = i === arr.length - 1;
              return (
                <React.Fragment key={i}>
                  <button
                    type="button"
                    onClick={() => onSelectFolder(b.id)}
                    className={`hover:text-ink truncate max-w-[140px] ${isLast ? 'font-semibold text-ink' : ''}`}
                  >
                    {b.name}
                  </button>
                  {!isLast && <ChevronRight className="w-3.5 h-3.5 text-slate-muted flex-shrink-0" />}
                </React.Fragment>
              );
            })}
          </nav>

          {/* Action Triggers */}
          <div className="flex items-center gap-2">
            {canUpload && (
              <button
                type="button"
                onClick={onOpenUpload}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-accent hover:bg-accent-dark text-white rounded-sm text-xs font-semibold transition-colors"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Unggah berkas</span>
              </button>
            )}
          </div>
        </div>

        {/* Toolbar: Search, Filters, View Toggle */}
        <div className="px-4 py-2.5 border-b border-hairline flex flex-wrap items-center justify-between gap-3 bg-mist/30">
          <div className="flex items-center gap-3 flex-1 min-w-[240px]">
            {/* Search Input with Ctrl+K */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari berkas, klausul, atau ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 pl-9 pr-14 bg-paper border border-hairline rounded-sm text-xs text-ink placeholder:text-slate-muted focus:border-accent"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-slate-muted border border-hairline px-1 rounded-xs bg-mist">
                Ctrl+K
              </span>
            </div>

            {/* Status Filter Tabs */}
            <div className="hidden md:flex items-center bg-paper p-0.5 rounded-sm border border-hairline text-xs">
              {[
                { key: 'all', label: 'Semua' },
                { key: 'draft', label: 'Draft' },
                { key: 'review', label: 'Review' },
                { key: 'approved', label: 'Approved' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-2.5 py-1 rounded-xs font-medium transition-colors ${
                    statusFilter === tab.key
                      ? 'bg-accent text-white'
                      : 'text-slate hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* List vs Grid Mode Toggle */}
          <div className="flex items-center bg-paper p-0.5 rounded-sm border border-hairline text-xs">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-xs transition-colors ${
                viewMode === 'list' ? 'bg-mist text-ink font-semibold' : 'text-slate hover:text-ink'
              }`}
              title="Tampilan tabel (list)"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-xs transition-colors ${
                viewMode === 'grid' ? 'bg-mist text-ink font-semibold' : 'text-slate hover:text-ink'
              }`}
              title="Tampilan kisi (grid)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Main Document Body: List or Grid */}
        <div className="flex-1 overflow-auto p-4">
          {filteredDocuments.length === 0 ? (
            <div className="py-20 text-center text-xs text-slate space-y-2">
              <File className="w-10 h-10 mx-auto text-slate-muted stroke-[1.2]" />
              <p>Tidak ada dokumen yang sesuai dengan kriteria pencarian</p>
            </div>
          ) : viewMode === 'list' ? (
            /* Table / List View */
            <div className="border border-hairline rounded-md overflow-hidden bg-paper">
              <table className="w-full text-left text-xs">
                <thead className="bg-mist/70 border-b border-hairline text-slate font-medium text-[12px]">
                  <tr>
                    <th className="py-2.5 px-4">Nama berkas</th>
                    <th className="py-2.5 px-3">Versi</th>
                    <th className="py-2.5 px-3">Klasifikasi</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Ukuran</th>
                    <th className="py-2.5 px-3">Waktu modifikasi</th>
                    <th className="py-2.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filteredDocuments.map((doc) => {
                    const isSelected = selectedDocument?.id === doc.id;
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => onSelectDocument(doc)}
                        className={`cursor-pointer transition-colors group ${
                          isSelected ? 'bg-accent-subtle/50' : 'hover:bg-mist/40'
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {getFileIcon(doc.mime_type, doc.title)}
                            <div className="min-w-0">
                              <p className="font-semibold text-ink truncate">{doc.title}</p>
                              <p className="font-mono text-[10px] text-slate-muted truncate">{doc.id}</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <span className="font-mono text-[11px] px-2 py-0.5 rounded-xs bg-mist border border-hairline text-slate">
                            v{doc.current_version}.0
                          </span>
                        </td>

                        <td className="py-3 px-3">
                          {getClassificationBadge(doc.classification)}
                        </td>

                        <td className="py-3 px-3 capitalize text-slate">
                          {doc.status}
                        </td>

                        <td className="py-3 px-3 font-mono text-slate">
                          {formatFileSize(doc.file_size)}
                        </td>

                        <td className="py-3 px-3 font-mono text-slate">
                          {doc.updated_at.substring(0, 10)}
                        </td>

                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onOpenViewer(doc)}
                              className="p-1 rounded-sm text-slate hover:text-ink hover:bg-mist"
                              title="Buka pratinjau dokumen"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenChat(doc)}
                              className="p-1 rounded-sm text-slate hover:text-ink hover:bg-mist"
                              title="Tanya AI Assistant"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenameTarget(doc)}
                              className="p-1 rounded-sm text-slate hover:text-ink hover:bg-mist"
                              title="Ganti nama berkas"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setMoveTarget(doc)}
                              className="p-1 rounded-sm text-slate hover:text-ink hover:bg-mist"
                              title="Pindahkan berkas"
                            >
                              <FolderInput className="w-3.5 h-3.5" />
                            </button>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={(e) => handleDeleteDocument(doc, e)}
                                className="p-1 rounded-sm text-slate-muted hover:text-danger hover:bg-danger-subtle"
                                title="Pindahkan ke kotak sampah"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredDocuments.map((doc) => {
                const isSelected = selectedDocument?.id === doc.id;
                return (
                  <div
                    key={doc.id}
                    onClick={() => onSelectDocument(doc)}
                    className={`p-4 border rounded-md cursor-pointer transition-colors flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'border-accent bg-accent-subtle/30'
                        : 'border-hairline bg-paper hover:border-slate'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="p-2 rounded-sm bg-mist border border-hairline">
                          {getFileIcon(doc.mime_type, doc.title)}
                        </div>
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-xs bg-mist border border-hairline text-slate">
                          v{doc.current_version}.0
                        </span>
                      </div>
                      <h4 className="text-xs font-semibold text-ink line-clamp-2 leading-snug">
                        {doc.title}
                      </h4>
                    </div>

                    <div className="pt-2 border-t border-hairline flex items-center justify-between text-[11px] font-mono text-slate-muted">
                      <span>{formatFileSize(doc.file_size)}</span>
                      <span>{doc.updated_at.substring(0, 10)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          Pane 3: Right Metadata Inspector Pane
          ========================================================================= */}
      {selectedDocument && (
        <div className="w-80 flex-shrink-0 border-l border-hairline bg-paper p-5 flex flex-col justify-between overflow-y-auto h-full">
          <div className="space-y-5">
            {/* Title & Preview Snippet */}
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider text-accent font-semibold">
                Inspektur dokumen
              </span>
              <h3 className="text-[15px] font-semibold text-ink leading-snug mt-1">
                {selectedDocument.title}
              </h3>
              <p className="font-mono text-[11px] text-slate-muted mt-0.5">
                {selectedDocument.id}
              </p>
            </div>

            {/* Classification & Access Summary */}
            <div className="bg-mist border border-hairline rounded-sm p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate">Klasifikasi:</span>
                {getClassificationBadge(selectedDocument.classification)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate">Hak akses:</span>
                <span className="font-medium text-ink">Lihat & Unduh</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate">Watermark:</span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-success">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Wajib</span>
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => onOpenViewer(selectedDocument)}
                className="w-full inline-flex items-center justify-between px-3 py-2 bg-paper hover:bg-mist border border-hairline rounded-sm text-xs font-medium text-ink transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-accent" />
                  <span>Buka di Document Viewer</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-muted" />
              </button>

              <button
                type="button"
                onClick={() => onOpenChat(selectedDocument)}
                className="w-full inline-flex items-center justify-between px-3 py-2 bg-paper hover:bg-mist border border-hairline rounded-sm text-xs font-medium text-ink transition-colors"
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-accent" />
                  <span>Tanya AI Assistant (Q&A)</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-muted" />
              </button>

              <button
                type="button"
                onClick={() => onOpenCompare(selectedDocument)}
                className="w-full inline-flex items-center justify-between px-3 py-2 bg-paper hover:bg-mist border border-hairline rounded-sm text-xs font-medium text-ink transition-colors"
              >
                <span className="flex items-center gap-2">
                  <GitCompare className="w-3.5 h-3.5 text-success" />
                  <span>Bandingkan dokumen (AI)</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-muted" />
              </button>
            </div>

            {/* Version History Lifecycle Tree */}
            <div className="space-y-2 pt-2 border-t border-hairline">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink">Riwayat versi</span>
                <span className="font-mono text-slate-muted">
                  Aktif: v{selectedDocument.current_version}.0
                </span>
              </div>

              {isLoadingVersions ? (
                <p className="text-xs text-slate">Memuat versi...</p>
              ) : versions.length === 0 ? (
                <p className="text-xs text-slate">Hanya versi 1.0 tersedia</p>
              ) : (
                <div className="border border-hairline rounded-sm divide-y divide-hairline bg-paper max-h-48 overflow-y-auto">
                  {versions.map((ver) => {
                    const isCurrent = ver.version_number === selectedDocument.current_version;
                    return (
                      <div
                        key={ver.version_number}
                        className="p-2.5 flex items-center justify-between text-xs hover:bg-mist/30"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold text-ink">
                              v{ver.version_number}.0
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-success-subtle text-success border border-success/30 rounded-xs">
                                Aktif
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[10px] text-slate-muted">
                            {formatFileSize(ver.file_size)} • {ver.created_at.substring(0, 10)}
                          </span>
                        </div>

                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleRestoreVersion(ver.version_number)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-hairline bg-paper hover:bg-mist text-ink rounded-xs transition-colors"
                            title="Pulihkan ke versi ini"
                          >
                            <RotateCcw className="w-3 h-3 text-accent" />
                            <span>Pulihkan</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Action Modals */}
      <RenameModal
        isOpen={!!renameTarget}
        document={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSuccess={onRefreshData}
      />

      <MoveModal
        isOpen={!!moveTarget}
        document={moveTarget}
        folders={folders}
        onClose={() => setMoveTarget(null)}
        onSuccess={onRefreshData}
      />

      <TrashModal
        isOpen={isTrashOpen}
        onClose={() => setIsTrashOpen(false)}
        onRestored={() => {
          onRefreshData();
          loadTrashBadge();
        }}
      />
    </div>
  );
};

