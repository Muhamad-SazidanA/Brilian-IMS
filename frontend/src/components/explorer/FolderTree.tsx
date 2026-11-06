import React, { useState } from 'react';
import { Folder } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface FolderTreeProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onAddFolder?: (name: string, parentId: string | null) => void;
}

export const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  selectedFolderId,
  onSelectFolder,
  onAddFolder,
}) => {
  const { hasPermission } = useAuth();
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'fld-legal': true,
  });
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim() && onAddFolder) {
      onAddFolder(newFolderName.trim(), selectedFolderId);
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  };

  const canManageFolders = hasPermission('folders:manage');

  // Build root folders and child folders lookup
  const rootFolders = folders.filter((f) => !f.parent_id);
  const getChildFolders = (parentId: string) =>
    folders.filter((f) => f.parent_id === parentId);

  const renderFolderItem = (folder: Folder, depth = 0) => {
    const children = getChildFolders(folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = !!expandedFolders[folder.id];
    const isSelected = selectedFolderId === folder.id;

    return (
      <div key={folder.id} className="select-none">
        <div
          onClick={() => onSelectFolder(folder.id)}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className={`flex items-center justify-between py-2 pr-2.5 rounded-lg cursor-pointer text-xs transition-colors group ${
            isSelected
              ? 'bg-sky-500/15 text-sky-300 font-semibold border-l-2 border-sky-400'
              : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(folder.id, e)}
                className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-white rounded"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <span className="w-4" />
            )}

            <svg
              className={`w-4 h-4 flex-shrink-0 ${
                isSelected ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-200'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <span className="truncate">{folder.name}</span>
          </div>

          {hasChildren && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
              {children.length}
            </span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5 mt-0.5">
            {children.map((child) => renderFolderItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-64 flex-shrink-0 bg-slate-900/90 border-r border-slate-800 flex flex-col h-full">
      {/* Panel Header */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Direktori Dokumen
          </span>
        </div>

        {canManageFolders && (
          <button
            type="button"
            onClick={() => setIsCreatingFolder(true)}
            title="Tambah Folder Baru"
            className="p-1 rounded text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>

      {/* Folder Tree Scroll Area */}
      <div className="p-2 space-y-1 flex-1 overflow-y-auto">
        {/* All Documents Root Item */}
        <div
          onClick={() => onSelectFolder(null)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
            selectedFolderId === null
              ? 'bg-sky-500/15 text-sky-300 font-semibold border-l-2 border-sky-400'
              : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
          }`}
        >
          <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span>Semua Dokumen</span>
        </div>

        <div className="pt-2 pb-1 px-3 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
          Kategori Berkas
        </div>

        {rootFolders.map((folder) => renderFolderItem(folder, 0))}
      </div>

      {/* New Folder Inline Form */}
      {isCreatingFolder && (
        <form onSubmit={handleCreateSubmit} className="p-2.5 border-t border-slate-800 bg-slate-850">
          <input
            type="text"
            autoFocus
            placeholder="Nama folder..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <div className="flex justify-end gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => setIsCreatingFolder(false)}
              className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-2.5 py-1 text-[11px] bg-sky-600 hover:bg-sky-500 text-white rounded font-medium"
            >
              Simpan
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
