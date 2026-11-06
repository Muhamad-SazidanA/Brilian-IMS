import React, { useState, useEffect } from 'react';
import {
  FileText,
  Folder,
  MessageSquare,
  GitCompare,
  Eye,
  Shield,
  LogOut,
} from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { LoginView } from './components/auth/LoginView';
import { DmsExplorer } from './components/dms/DmsExplorer';
import { ResumableUploader } from './components/upload/ResumableUploader';
import { DocumentViewer } from './components/viewer/DocumentViewer';
import { AgentChatPanel } from './components/chat/AgentChatPanel';
import { CompareView } from './components/compare/CompareView';
import { WorkflowModal } from './components/workflow/WorkflowModal';
import { AdminPage } from './components/admin/AdminPage';
import { Folder as FolderType, Document as DocumentType, Role } from './types';
import { api } from './api/client';

type ActiveTab = 'explorer' | 'chat' | 'compare' | 'viewer' | 'admin';

export const App: React.FC = () => {
  const { user, isAuthenticated, logout, switchRole } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('explorer');
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<DocumentType | null>(null);

  // Modals & Navigation state
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isWorkflowOpen, setIsWorkflowOpen] = useState(false);
  const [viewerInitialPage, setViewerInitialPage] = useState<number>(1);
  const [compareDocA, setCompareDocA] = useState<DocumentType | null>(null);
  const [compareDocB, setCompareDocB] = useState<DocumentType | null>(null);

  const loadData = async () => {
    try {
      const [fld, doc] = await Promise.all([
        api.getFolders(),
        api.getDocuments(selectedFolderId || undefined),
      ]);
      setFolders(fld);
      setDocuments(doc);
      if (doc.length > 0 && !selectedDocument) {
        setSelectedDocument(doc[0]);
      }
    } catch (e) {
      console.error('Error loading repository data:', e);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, selectedFolderId]);

  if (!isAuthenticated) {
    return <LoginView />;
  }

  // Action handlers
  const handleOpenViewer = (doc: DocumentType, page: number = 1) => {
    setSelectedDocument(doc);
    setViewerInitialPage(page);
    setActiveTab('viewer');
  };

  const handleOpenChat = (doc: DocumentType) => {
    setSelectedDocument(doc);
    setActiveTab('chat');
  };

  const handleOpenCompare = (doc: DocumentType) => {
    setCompareDocA(doc);
    const otherDoc = documents.find((d) => d.id !== doc.id);
    if (otherDoc) setCompareDocB(otherDoc);
    setActiveTab('compare');
  };

  const handleOpenWorkflow = (doc: DocumentType) => {
    setSelectedDocument(doc);
    setIsWorkflowOpen(true);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-mist text-ink overflow-hidden font-sans">
      {/* Top Main Navigation Bar */}
      <header className="h-14 bg-paper border-b border-hairline px-4 flex items-center justify-between flex-shrink-0 z-30">
        {/* Brand & System Status */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-sm bg-accent text-white flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-ink flex items-center gap-1.5">
                <span>Brilian IDMS</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-mist text-slate font-mono border border-hairline">
                  v1.0
                </span>
              </h1>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-2 pl-4 border-l border-hairline text-[11px] text-slate">
            <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
            <span>Single-binary on-premise engine</span>
            <span className="text-hairline">•</span>
            <span className="text-slate-muted">Zero-leakage memory protection</span>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <nav className="flex items-center bg-mist p-0.5 rounded-sm border border-hairline text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('explorer')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xs font-medium transition-colors ${
              activeTab === 'explorer'
                ? 'bg-accent text-white'
                : 'text-slate hover:text-ink'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>DMS explorer</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xs font-medium transition-colors ${
              activeTab === 'chat'
                ? 'bg-accent text-white'
                : 'text-slate hover:text-ink'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>AI Q&A chat</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('compare')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xs font-medium transition-colors ${
              activeTab === 'compare'
                ? 'bg-accent text-white'
                : 'text-slate hover:text-ink'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>AI compare</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('viewer')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xs font-medium transition-colors ${
              activeTab === 'viewer'
                ? 'bg-accent text-white'
                : 'text-slate hover:text-ink'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Document viewer</span>
          </button>

          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xs font-medium transition-colors ${
                activeTab === 'admin'
                  ? 'bg-accent text-white'
                  : 'text-slate hover:text-ink'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>RBAC & Security</span>
            </button>
          )}
        </nav>

        {/* User Profile & Role Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-mist rounded-sm px-2 py-1 border border-hairline text-xs">
              <span className="text-[11px] text-slate pr-1.5 hidden md:inline">Role:</span>
              <select
                value={user?.role}
                onChange={(e) => switchRole(e.target.value as Role)}
                className="bg-transparent text-xs font-medium text-ink focus:outline-none cursor-pointer"
              >
                <option value="admin">Administrator (L5)</option>
                <option value="reviewer">Reviewer (L3)</option>
                <option value="uploader">Uploader (L2)</option>
                <option value="viewer">Viewer (L1)</option>
              </select>
            </div>

            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-ink leading-none">
                {user?.name || user?.username}
              </div>
              <div className="text-[10px] text-slate font-mono leading-tight mt-0.5">
                {user?.division || 'General'} • {user?.level || 'L2'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            title="Keluar dari sistem"
            className="p-1.5 rounded-sm text-slate hover:text-danger hover:bg-mist transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Tab 1: DMS Explorer */}
        {activeTab === 'explorer' && (
          <DmsExplorer
            folders={folders}
            documents={documents}
            selectedFolderId={selectedFolderId}
            selectedDocument={selectedDocument}
            onSelectFolder={(fId) => setSelectedFolderId(fId)}
            onSelectDocument={(doc) => setSelectedDocument(doc)}
            onOpenUpload={() => setIsUploadOpen(true)}
            onOpenViewer={(doc, page) => handleOpenViewer(doc, page || 1)}
            onOpenChat={(doc) => handleOpenChat(doc)}
            onOpenCompare={(doc) => handleOpenCompare(doc)}
            onOpenWorkflow={(doc) => handleOpenWorkflow(doc)}
            onRefreshData={loadData}
          />
        )}

        {/* Tab 2: AI Agent Q&A Chat */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex h-full overflow-hidden">
            <AgentChatPanel
              document={selectedDocument}
              onNavigateToPage={(page) => handleOpenViewer(selectedDocument!, page)}
            />
          </div>
        )}

        {/* Tab 3: Multi-Document Comparison View */}
        {activeTab === 'compare' && (
          <div className="flex-1 flex h-full overflow-hidden">
            <CompareView
              documents={documents}
              initialDocA={compareDocA}
              initialDocB={compareDocB}
              onOpenViewerWithCitation={(docId, page) => {
                const targetDoc = documents.find((d) => d.id === docId);
                if (targetDoc) handleOpenViewer(targetDoc, page);
              }}
              onOpenWorkflow={(doc) => handleOpenWorkflow(doc)}
            />
          </div>
        )}

        {/* Tab 4: Multi-Format Document Viewer & WASM Highlighting Bridge */}
        {activeTab === 'viewer' && (
          <DocumentViewer
            document={selectedDocument}
            initialPage={viewerInitialPage}
          />
        )}

        {/* Tab 5: RBAC & Security Admin Control Center */}
        {activeTab === 'admin' && (
          <div className="flex-1 flex h-full overflow-hidden">
            <AdminPage />
          </div>
        )}
      </main>

      {/* Global Modals */}
      <ResumableUploader
        isOpen={isUploadOpen}
        folders={folders}
        initialFolderId={selectedFolderId}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={loadData}
      />

      <WorkflowModal
        isOpen={isWorkflowOpen}
        document={selectedDocument}
        onClose={() => setIsWorkflowOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
};
