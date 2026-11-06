export type Role = 'admin' | 'reviewer' | 'uploader' | 'viewer';
export type UserLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
export type DocumentClassification = 'Publik' | 'Internal' | 'Rahasia' | 'Sangat Rahasia';

export interface User {
  id: string;
  username: string;
  role: Role;
  name?: string;
  division?: string;
  level?: UserLevel;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export type DocumentStatus = 'draft' | 'review' | 'approved' | 'archived';

export interface DocumentVersion {
  version_number: number;
  file_size: number;
  created_at: string;
  uploaded_by: string;
}

export interface Document {
  id: string;
  title: string;
  folder_id: string;
  file_path?: string;
  file_size: number;
  mime_type: string;
  classification?: DocumentClassification;
  division?: string;
  current_version: number;
  status: DocumentStatus;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  is_deleted?: boolean;
  sha256?: string;
  pages?: number;
  metadata?: Record<string, any>;
  preview_content?: string[];
  raw_content?: string;
}

export interface TrashItem {
  id: string;
  title: string;
  folder_id: string;
  deleted_at: string;
  deleted_by: string;
  file_size: number;
}

export interface BoundingBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export type WorkflowActionType = 'approve' | 'reject' | 'revise';

export interface WorkflowItem {
  id: string;
  document_id: string;
  document_title: string;
  current_step: string;
  status: DocumentStatus;
  last_action?: string;
  notes?: string;
  action_by?: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  text: string;
  page_reference?: number;
  timestamp: string;
}

export interface Citation {
  document_id: string;
  page: number;
}

export interface CompareResponse {
  status: string;
  comparison_result: string;
  citations: Citation[];
}

export interface QAResponse {
  status: string;
  answer: string;
  page_reference: number;
}

export interface UploadResponse {
  status: string;
  document_id: string;
  message: string;
  version?: number;
}

export interface UploadInitResponse {
  status: string;
  session_id: string;
  chunk_size: number;
  total_chunks: number;
}

export interface UploadChunkResponse {
  status: string;
  received: number;
  total: number;
  percent: number;
}

export interface UploadStatusResponse {
  status: string;
  received_chunks: number[];
  total_chunks: number;
  percent: number;
}

export interface WorkflowActionResponse {
  status: string;
  message: string;
}

export interface LoginResponse {
  status: string;
  token: string;
  user?: User;
}

export interface WatermarkOptions {
  FullName: string;
  UserID: string;
  Timestamp: Date | string;
  Opacity: number;
  DiagonalAngle: number;
}

export type ViewMode = 'list' | 'grid';
