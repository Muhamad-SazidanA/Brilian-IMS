/**
 * Brilian IDMS - Centralized Typed REST API Client & Offline Mock Dispatcher
 * Communicates with backend endpoints (/api/v1/...) with transparent fallback
 * to enable instant standalone demos and testability.
 */

import {
  Role,
  User,
  Folder,
  Document,
  DocumentVersion,
  TrashItem,
  BoundingBox,
  CompareResponse,
  QAResponse,
  UploadResponse,
  UploadInitResponse,
  UploadChunkResponse,
  UploadStatusResponse,
  WorkflowActionResponse,
  WorkflowActionType,
  WorkflowItem,
} from '../types';

export interface ExtractedData {
  dates: string[];
  currencies: string[];
  percentages: string[];
  identifiers: string[];
}

export interface ClassificationResult {
  doc_type: string;
  confidence: number;
  matched_keywords?: string[];
}

export interface SearchFilter {
  folder_id?: string;
  division?: string;
  classification?: string;
  doc_type?: string;
}

export interface SearchResult {
  doc_id: string;
  title: string;
  snippet: string;
  score: number;
  matches: string[];
}

export interface SummarizeResponse {
  status: string;
  summary: string;
  token_count: number;
  model: string;
  provider: string;
}

const TOKEN_KEY = 'brilian_token';
const API_BASE = '/api/v1';


// Authoritative RBAC matrix matching jwt_oracle.js
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: [
    'auth:manage',
    'documents:read',
    'documents:upload',
    'documents:delete',
    'folders:manage',
    'workflow:action',
    'ai:compare',
    'ai:qa',
    'system:admin',
  ],
  reviewer: [
    'documents:read',
    'workflow:action',
    'ai:compare',
    'ai:qa',
  ],
  uploader: [
    'documents:read',
    'documents:upload',
    'folders:manage',
    'workflow:submit',
    'ai:qa',
  ],
  viewer: [
    'documents:read',
    'ai:qa',
  ],
};

export function hasPermission(role: Role, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// Initial Mock Dataset for instant demo and offline fallback
const INITIAL_FOLDERS: Folder[] = [
  { id: 'fld-legal', name: 'Legal & Kontrak Pengadaan', parent_id: null, created_at: '2026-01-10T08:00:00Z' },
  { id: 'fld-vendor', name: 'Perjanjian Vendor & PKS', parent_id: 'fld-legal', created_at: '2026-01-12T09:30:00Z' },
  { id: 'fld-finance', name: 'Keuangan & Audit Pajak', parent_id: null, created_at: '2026-01-15T11:00:00Z' },
  { id: 'fld-compliance', name: 'Kepatuhan & Kebijakan Internal', parent_id: null, created_at: '2026-01-18T14:20:00Z' },
  { id: 'fld-media', name: 'Dokumentasi Multimedia & Aset', parent_id: null, created_at: '2026-01-22T10:00:00Z' },
];

const INITIAL_DOCUMENTS: Document[] = [
  {
    id: 'doc-kontrak-2025',
    title: 'Kontrak Kerja Sama Pengadaan IT 2025 (v1.0).pdf',
    folder_id: 'fld-vendor',
    file_path: '/storage/kontrak_it_2025_v1.pdf',
    file_size: 2457600, // ~2.4 MB
    mime_type: 'application/pdf',
    classification: 'Internal',
    division: 'Legal',
    current_version: 1,
    status: 'approved',
    uploaded_by: 'usr-upl-1',
    created_at: '2025-11-20T10:15:00Z',
    updated_at: '2025-12-01T15:30:00Z',
    pages: 6,
    sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    metadata: {
      parties: ['PT Brilian Solusi Nusantara', 'PT Mitra Perkasa Teknologi'],
      effective_date: '2025-01-01',
      denda_keterlambatan: '1% per minggu',
      jatuh_tempo: '30 hari setelah invoice',
    },
    preview_content: [
      'PASAL 1: KETENTUAN UMUM\nPerjanjian ini mengatur kerja sama pengadaan infrastruktur server on-premise.',
      'PASAL 2: TATA CARA PEMBAYARAN\nTanggal jatuh tempo pembayaran adalah 30 hari setelah invoice diterbitkan secara sah.',
      'PASAL 3: DENDA DAN GANTI RUGI\nNilai denda keterlambatan ditetapkan sebesar 1% untuk setiap minggu keterlambatan.',
      'PASAL 4: HAK DAN KEWAJIBAN\nPihak Kedua berkewajiban menjamin ketersediaan suku cadang selama masa garansi.',
      'PASAL 5: PENGAKHIRAN KONTRAK\nKontrak dapat diakhiri secara sepihak jika terjadi wanprestasi selama 30 hari berturut-turut.',
      'PASAL 6: PENYELESAIAN SENGKETA\nSegala sengketa diselesaikan melalui Badan Arbitrase Nasional Indonesia (BANI).'
    ]
  },
  {
    id: 'doc-kontrak-2026',
    title: 'Adendum Kontrak Pengadaan IT & SLA 2026 (v2.0).pdf',
    folder_id: 'fld-vendor',
    file_path: '/storage/kontrak_it_2026_v2.pdf',
    file_size: 2894100, // ~2.8 MB
    mime_type: 'application/pdf',
    classification: 'Rahasia',
    division: 'Legal',
    current_version: 2,
    status: 'review',
    uploaded_by: 'usr-upl-1',
    created_at: '2026-01-14T09:00:00Z',
    updated_at: '2026-02-01T11:45:00Z',
    pages: 6,
    sha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    metadata: {
      parties: ['PT Brilian Solusi Nusantara', 'PT Mitra Perkasa Teknologi'],
      effective_date: '2026-01-01',
      denda_keterlambatan: '2% per minggu',
      jatuh_tempo: '45 hari setelah invoice',
    },
    preview_content: [
      'PASAL 1: KETENTUAN UMUM REVISI\nPerjanjian ini memperbarui SLA infrastruktur server high-availability.',
      'PASAL 2: TATA CARA PEMBAYARAN\nTanggal jatuh tempo pembayaran disesuaikan menjadi 45 hari setelah verifikasi berita acara.',
      'PASAL 3: REVISI KLAUSUL DENDA\nNilai denda keterlambatan ditingkatkan menjadi 2% per minggu untuk menjamin disiplin delivery.',
      'PASAL 4: STANDAR SLA & UPTIME\nPenyedia wajib mempertahankan uptime 99.95% dengan dukungan on-site 24/7.',
      'PASAL 5: KLAUSUL PENGAKHIRAN KHUSUS\nPengakhiran memerlukan pemberitahuan tertulis minimal 60 hari kerja sebelum tanggal efektif.',
      'PASAL 6: JURISDIKSI HUKUM\nKetentuan arbitrase mengacu pada Pengadilan Negeri Jakarta Pusat dan BANI.'
    ]
  },
  {
    id: 'doc-laporan-keuangan',
    title: 'Laporan Finansial dan Neraca Kuartal IV 2025.xlsx',
    folder_id: 'fld-finance',
    file_path: '/storage/laporan_keuangan_q4_2025.xlsx',
    file_size: 1420500,
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    classification: 'Sangat Rahasia',
    division: 'Finance',
    current_version: 1,
    status: 'approved',
    uploaded_by: 'usr-admin-1',
    created_at: '2026-01-18T11:20:00Z',
    updated_at: '2026-01-18T11:20:00Z',
    pages: 3,
    sha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    metadata: {
      total_revenue: 'Rp 48.500.000.000',
      ebitda_margin: '28.4%',
      tax_status: 'Audit Clean Opinion',
    },
    raw_content: JSON.stringify([
      ['Bulan', 'Pendapatan (Miliar IDR)', 'Beban Pokok', 'Laba Operasional', 'Margin'],
      ['Oktober 2025', '15.2', '9.4', '5.8', '38.1%'],
      ['November 2025', '16.1', '10.2', '5.9', '36.6%'],
      ['Desember 2025', '17.2', '10.5', '6.7', '38.9%'],
      ['Total Q4', '48.5', '30.1', '18.4', '37.9%']
    ])
  },
  {
    id: 'doc-spesifikasi-arsitektur',
    title: 'Dokumen Spesifikasi Arsitektur Sistem.docx',
    folder_id: 'fld-compliance',
    file_path: '/storage/spesifikasi_arsitektur.docx',
    file_size: 1845000,
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    classification: 'Internal',
    division: 'Technology',
    current_version: 1,
    status: 'draft',
    uploaded_by: 'usr-upl-1',
    created_at: '2026-01-25T14:10:00Z',
    updated_at: '2026-01-25T14:10:00Z',
    pages: 4,
    sha256: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
    preview_content: [
      'BAB 1: RINGKASAN EKSEKUTIF\nSistem Brilian IDMS diimplementasikan menggunakan arsitektur single-binary on-premise Go backend.',
      'BAB 2: STANDAR ENKRIPSI & MEMORI\nSetiap system prompt dan kunci rahasia dienkripsi in-memory menggunakan AES-256-GCM.',
      'BAB 3: HIGHLIGHTING WEBASSEMBLY\nTransformasi koordinat bounding box dokumen PDF dieksekusi client-side menggunakan modul Rust WebAssembly.',
      'BAB 4: KEPATUHAN AUDIT TRAIL\nSeluruh aktivitas akses, unggah, dan unduh dokumen dicatat pada log imutabel append-only.'
    ]
  },
  {
    id: 'doc-presentasi-direksi',
    title: 'Materi Presentasi Direksi Rencana Strategis 2026.pptx',
    folder_id: 'fld-compliance',
    file_path: '/storage/presentasi_direksi_2026.pptx',
    file_size: 4580000,
    mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    classification: 'Rahasia',
    division: 'Executive',
    current_version: 1,
    status: 'approved',
    uploaded_by: 'usr-admin-1',
    created_at: '2026-01-28T08:45:00Z',
    updated_at: '2026-01-28T08:45:00Z',
    pages: 5,
    sha256: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
    preview_content: [
      'SLIDE 1: PENGANTAR RENCANA STRATEGIS 2026\nTransformasi Digital & Manajemen Dokumen Cerdas Berbasis On-Premise AI.',
      'SLIDE 2: CAPAIAN KPI OPERASIONAL\nPenurunan latensi pencarian dokumen sebesar 74% melalui indexing terdistribusi pgvector.',
      'SLIDE 3: TARGET EFISIENSI BIAYA\nPengurangan biaya lisensi eksternal melalui penerapan model LLM lokal dan deterministic code engines.',
      'SLIDE 4: PENGUATAN TATA KELOLA RBAC\nPenerapan matriks otorisasi dual-axis Division + Level (L1-L5) dengan dynamic watermarking.',
      'SLIDE 5: ROADMAP EKSEKUSI Q1-Q4\nIntegrasi berkesinambungan dan audit kepatuhan keamanan OWASP ASVS berkala.'
    ]
  },
  {
    id: 'doc-diagram-jaringan',
    title: 'Topologi Jaringan dan Arsitektur Server.png',
    folder_id: 'fld-media',
    file_path: '/storage/topologi_server.png',
    file_size: 980000,
    mime_type: 'image/png',
    classification: 'Internal',
    division: 'Technology',
    current_version: 1,
    status: 'approved',
    uploaded_by: 'usr-upl-1',
    created_at: '2026-02-02T10:00:00Z',
    updated_at: '2026-02-02T10:00:00Z',
    sha256: '2c6a465997283d963607a4f67b36add54d03e870795d81f147e9a44e8bd953ac',
    metadata: {
      resolution: '1920x1080',
      color_depth: '24-bit RGB',
      format: 'PNG (Lossless)'
    }
  },
  {
    id: 'doc-rekaman-rapat',
    title: 'Rekaman Audio Notulensi Rapat Direksi.mp3',
    folder_id: 'fld-media',
    file_path: '/storage/notulensi_rapat_direksi.mp3',
    file_size: 15400000, // 15.4 MB
    mime_type: 'audio/mpeg',
    classification: 'Rahasia',
    division: 'Executive',
    current_version: 1,
    status: 'approved',
    uploaded_by: 'usr-admin-1',
    created_at: '2026-02-03T16:20:00Z',
    updated_at: '2026-02-03T16:20:00Z',
    sha256: '111222333444555666777888999aaabbbcccdddeeefff0001112223334445556',
    metadata: {
      duration: '42:15 menit',
      bitrate: '192 kbps',
      channels: 'Stereo'
    }
  },
  {
    id: 'doc-konfigurasi-server',
    title: 'Konfigurasi Lingkungan Server On-Premise.txt',
    folder_id: 'fld-compliance',
    file_path: '/storage/server_environment.txt',
    file_size: 12400,
    mime_type: 'text/plain',
    classification: 'Publik',
    division: 'Technology',
    current_version: 1,
    status: 'approved',
    uploaded_by: 'usr-upl-1',
    created_at: '2026-02-04T09:15:00Z',
    updated_at: '2026-02-04T09:15:00Z',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    raw_content: [
      '# BRILIAN IDMS ON-PREMISE ENGINE CONFIGURATION',
      'ENV=production',
      'PORT=8080',
      'DATABASE_URL=postgres://brilian:securepassword@localhost:5432/briliandms?sslmode=disable',
      'STORAGE_TYPE=minio',
      'MINIO_ENDPOINT=localhost:9000',
      'MINIO_BUCKET=brilian-documents',
      'MAX_UPLOAD_SIZE_MB=500',
      'WATERMARK_OPACITY=0.20',
      'WATERMARK_ANGLE=-45'
    ].join('\n')
  },
  {
    id: 'doc-backup-database',
    title: 'Dump Snapshot Database Enkripsi.bin',
    folder_id: 'fld-finance',
    file_path: '/storage/snapshot_backup.bin',
    file_size: 52428800, // 52.4 MB
    mime_type: 'application/octet-stream',
    classification: 'Sangat Rahasia',
    division: 'Finance',
    current_version: 1,
    status: 'approved',
    uploaded_by: 'usr-admin-1',
    created_at: '2026-02-05T01:00:00Z',
    updated_at: '2026-02-05T01:00:00Z',
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    metadata: {
      archive_type: 'Encrypted Binary Snapshot',
      cipher: 'AES-256-GCM',
      compression: 'Zstandard'
    }
  }
];

export const SAMPLE_HIGHLIGHT_BOXES: Record<string, Record<number, BoundingBox[]>> = {
  'doc-kontrak-2025': {
    2: [
      { page: 2, x: 45, y: 120, width: 480, height: 28, label: 'Klausul Pembayaran: 30 Hari' }
    ],
    3: [
      { page: 3, x: 45, y: 110, width: 440, height: 28, label: 'Klausul Denda: 1% per minggu' }
    ]
  },
  'doc-kontrak-2026': {
    2: [
      { page: 2, x: 45, y: 120, width: 510, height: 28, label: 'Revisi Pembayaran: 45 Hari' }
    ],
    3: [
      { page: 3, x: 45, y: 115, width: 460, height: 28, label: 'Peningkatan Denda: 2% per minggu' }
    ]
  }
};

class ApiClient {
  private folders: Folder[] = [...INITIAL_FOLDERS];
  private documents: Document[] = [...INITIAL_DOCUMENTS];
  private documentVersions: Map<string, DocumentVersion[]> = new Map();
  private trashItems: TrashItem[] = [];
  private uploadSessions: Map<string, {
    sessionId: string;
    filename: string;
    totalSize: number;
    mimeType: string;
    folderId: string;
    totalChunks: number;
    chunkSize: number;
    receivedChunks: Map<number, Uint8Array>;
  }> = new Map();

  private workflows: WorkflowItem[] = [
    {
      id: 'wf-101',
      document_id: 'doc-kontrak-2026',
      document_title: 'Adendum Kontrak Pengadaan IT & SLA 2026 (v2.0).pdf',
      current_step: 'Legal Compliance Review',
      status: 'review',
      notes: 'Menunggu persetujuan penyesuaian klausul denda 2% dan SLA 99.95%.',
      updated_at: '2026-02-01T11:45:00Z',
    }
  ];

  constructor() {
    // Initialize version histories for seed documents
    this.documents.forEach((d) => {
      this.documentVersions.set(d.id, [
        {
          version_number: 1,
          file_size: d.file_size,
          created_at: d.created_at,
          uploaded_by: d.uploaded_by,
        },
      ]);
      if (d.current_version > 1) {
        for (let v = 2; v <= d.current_version; v++) {
          this.documentVersions.get(d.id)?.push({
            version_number: v,
            file_size: d.file_size,
            created_at: d.updated_at,
            uploaded_by: d.uploaded_by,
          });
        }
      }
    });
  }

  public getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  public setToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }

  public removeToken(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }

  public getCurrentUser(): User | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const claims = JSON.parse(json);
      return {
        id: claims.sub || claims.user_id || 'usr-default',
        username: claims.username || 'User',
        role: claims.role || 'viewer',
        name: claims.name || claims.username || 'User',
        division: claims.division || 'General',
        level: claims.level || 'L2',
      };
    } catch (err) {
      console.error('Failed to parse token claims:', err);
      return null;
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson.message) errorMsg = errorJson.message;
      } catch {
        // ignore
      }
      const err = new Error(errorMsg);
      (err as any).status = response.status;
      throw err;
    }

    return response.json();
  }

  /**
   * POST /api/v1/auth/login
   */
  public async login(username: string, password: string): Promise<{ token: string; user: User }> {
    try {
      const result = await this.request<{ status: string; token: string }>('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      this.setToken(result.token);
      const user = this.getCurrentUser()!;
      return { token: result.token, user };
    } catch (err: any) {
      const knownUsers: Record<string, { id: string; role: Role; pass: string; div: string; lvl: any; name: string }> = {
        admin_brilian: { id: 'usr-admin-1', role: 'admin', pass: 'securepassword', div: 'ALL', lvl: 'L5', name: 'Budi Santoso' },
        reviewer_1: { id: 'usr-rev-1', role: 'reviewer', pass: 'reviewerpass', div: 'Legal', lvl: 'L3', name: 'Dewi Lestari' },
        uploader_1: { id: 'usr-upl-1', role: 'uploader', pass: 'uploaderpass', div: 'HR', lvl: 'L2', name: 'Ahmad Fauzi' },
        viewer_1: { id: 'usr-viw-1', role: 'viewer', pass: 'viewerpass', div: 'Finance', lvl: 'L2', name: 'Rina Wijaya' },
      };

      const match = knownUsers[username];
      if (match && match.pass === password) {
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
          .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        const payload = btoa(JSON.stringify({
          sub: match.id,
          user_id: match.id,
          username,
          role: match.role,
          division: match.div,
          level: match.lvl,
          name: match.name,
          exp: Math.floor(Date.now() / 1000) + 86400,
        })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        const signature = 'mock_signature_for_offline_mode';
        const mockToken = `${header}.${payload}.${signature}`;

        this.setToken(mockToken);
        const user: User = {
          id: match.id,
          username,
          role: match.role,
          name: match.name,
          division: match.div,
          level: match.lvl,
        };
        return { token: mockToken, user };
      }

      throw new Error('Nama pengguna atau kata sandi tidak valid');
    }
  }

  // =========================================================================
  // Resumable Chunked Upload Protocol
  // =========================================================================

  public async initUpload(params: {
    filename: string;
    total_size: number;
    mime_type?: string;
    folder_id?: string;
    classification?: string;
    division?: string;
  }): Promise<UploadInitResponse> {
    try {
      return await this.request<UploadInitResponse>('/documents/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    } catch (err: any) {
      if (err.status) throw err;

      // Offline fallback: validate filename, simulate quota & session
      if (params.filename.includes('..') || params.filename.includes('\0') || params.filename.includes('%00')) {
        throw new Error('Filename rejected: Null byte injection or invalid traversal detected');
      }
      if (params.total_size > 1024 * 1024 * 1024) {
        const error = new Error('Storage quota exceeded');
        (error as any).status = 413;
        throw error;
      }

      const chunkSize = 5 * 1024 * 1024; // 5 MB
      const totalChunks = Math.ceil(params.total_size / chunkSize);
      const sessionId = `mock-upload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      this.uploadSessions.set(sessionId, {
        sessionId,
        filename: params.filename,
        totalSize: params.total_size,
        mimeType: params.mime_type || 'application/octet-stream',
        folderId: params.folder_id || 'root',
        totalChunks,
        chunkSize,
        receivedChunks: new Map(),
      });

      return {
        status: 'success',
        session_id: sessionId,
        chunk_size: chunkSize,
        total_chunks: totalChunks,
      };
    }
  }

  public async uploadChunk(params: {
    session_id: string;
    chunk_index: number;
    chunk_hash?: string;
    file: Blob | ArrayBuffer | Uint8Array;
  }): Promise<UploadChunkResponse> {
    try {
      const formData = new FormData();
      formData.append('session_id', params.session_id);
      formData.append('chunk_index', String(params.chunk_index));
      if (params.chunk_hash) formData.append('chunk_hash', params.chunk_hash);

      const blob = params.file instanceof Blob ? params.file : new Blob([params.file as any]);
      formData.append('file', blob);

      const token = this.getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/documents/upload/chunk`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const err = new Error(json.message || 'Chunk upload failed');
        (err as any).status = res.status;
        throw err;
      }

      return res.json();
    } catch (err: any) {
      if (err.status) throw err;

      // Offline simulation
      const session = this.uploadSessions.get(params.session_id);
      if (!session) throw new Error('Upload session not found');

      session.receivedChunks.set(params.chunk_index, new Uint8Array(10));
      const received = session.receivedChunks.size;
      return {
        status: 'success',
        received,
        total: session.totalChunks,
        percent: Math.round((received / session.totalChunks) * 100),
      };
    }
  }

  public async completeUpload(sessionId: string): Promise<UploadResponse> {
    try {
      return await this.request<UploadResponse>('/documents/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch (err: any) {
      if (err.status) throw err;

      // Offline completion simulation
      const session = this.uploadSessions.get(sessionId);
      if (!session) throw new Error('Upload session not found');

      // Quarantine simulation: check for malicious extensions
      const ext = session.filename.substring(session.filename.lastIndexOf('.')).toLowerCase();
      if (['.docm', '.xlsm', '.pptm'].includes(ext)) {
        throw new Error(`Macro-enabled file extension '${ext}' is prohibited by security policy`);
      }

      // Check version increment
      const existing = this.documents.find(
        (d) => d.title === session.filename && d.folder_id === session.folderId && !d.is_deleted
      );

      let docId = `doc-${Date.now()}`;
      let version = 1;

      if (existing) {
        existing.current_version += 1;
        existing.updated_at = new Date().toISOString();
        existing.file_size = session.totalSize;
        docId = existing.id;
        version = existing.current_version;

        const hist = this.documentVersions.get(existing.id) || [];
        hist.push({
          version_number: version,
          file_size: session.totalSize,
          created_at: new Date().toISOString(),
          uploaded_by: this.getCurrentUser()?.id || 'usr-local',
        });
        this.documentVersions.set(existing.id, hist);
      } else {
        const newDoc: Document = {
          id: docId,
          title: session.filename,
          folder_id: session.folderId,
          file_size: session.totalSize,
          mime_type: session.mimeType,
          current_version: 1,
          status: 'draft',
          uploaded_by: this.getCurrentUser()?.id || 'usr-local',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          pages: 4,
          sha256: 'mock-sha256-' + Math.random().toString(36).substring(2, 10),
          preview_content: [
            `BERKAS DIUNGGAH RESUMABLE: ${session.filename}`,
            `Ukuran Total: ${(session.totalSize / (1024 * 1024)).toFixed(2)} MB`,
            `Diverifikasi Magic Bytes: ${session.mimeType}`,
            `Status: Terverifikasi bebas malware & zip bomb.`
          ]
        };
        this.documents.unshift(newDoc);
        this.documentVersions.set(docId, [{
          version_number: 1,
          file_size: session.totalSize,
          created_at: new Date().toISOString(),
          uploaded_by: newDoc.uploaded_by,
        }]);
      }

      this.uploadSessions.delete(sessionId);

      return {
        status: 'success',
        document_id: docId,
        version,
        message: `Berkas ${session.filename} berhasil diunggah dan diverifikasi (Versi ${version}).`,
      };
    }
  }

  public async getUploadStatus(sessionId: string): Promise<UploadStatusResponse> {
    try {
      return await this.request<UploadStatusResponse>(`/documents/upload/status/${sessionId}`);
    } catch (err: any) {
      if (err.status) throw err;
      const session = this.uploadSessions.get(sessionId);
      if (!session) throw new Error('Upload session not found');
      const received = Array.from(session.receivedChunks.keys());
      return {
        status: received.length === session.totalChunks ? 'completed' : 'pending',
        received_chunks: received,
        total_chunks: session.totalChunks,
        percent: Math.round((received.length / session.totalChunks) * 100),
      };
    }
  }

  /**
   * High-Level Resumable File Upload Engine
   * Handles slicing into 5MB chunks, sequential upload, progress reporting, and pause/abort.
   */
  public async uploadFileResumable(
    file: File,
    folderId: string,
    options: {
      classification?: string;
      division?: string;
      onProgress?: (percent: number, receivedChunks: number, totalChunks: number, speedMBps: number) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<UploadResponse> {
    const user = this.getCurrentUser();
    if (user && !hasPermission(user.role, 'documents:upload')) {
      const err = new Error('Forbidden: insufficient role permissions to upload documents');
      (err as any).status = 403;
      throw err;
    }

    // 1. Initialize upload session
    const init = await this.initUpload({
      filename: file.name,
      total_size: file.size,
      mime_type: file.type || 'application/octet-stream',
      folder_id: folderId,
      classification: options.classification || 'Internal',
      division: options.division || user?.division || 'General',
    });

    const chunkSize = init.chunk_size;
    const totalChunks = init.total_chunks;
    const startTime = Date.now();

    // 2. Transmit each chunk
    for (let i = 0; i < totalChunks; i++) {
      if (options.signal?.aborted) {
        throw new Error('Upload dibatalkan oleh pengguna');
      }

      const start = i * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const chunkBlob = file.slice(start, end);

      const chunkRes = await this.uploadChunk({
        session_id: init.session_id,
        chunk_index: i,
        file: chunkBlob,
      });

      if (options.onProgress) {
        const elapsedSeconds = Math.max(0.1, (Date.now() - startTime) / 1000);
        const uploadedBytes = (i + 1) * chunkSize;
        const speedMBps = Number((uploadedBytes / (1024 * 1024) / elapsedSeconds).toFixed(2));
        options.onProgress(chunkRes.percent, chunkRes.received, totalChunks, speedMBps);
      }
    }

    // 3. Assemble and complete
    return await this.completeUpload(init.session_id);
  }

  /**
   * Legacy single-part upload fallback
   */
  public async uploadDocument(title: string, folderId: string, file: File): Promise<UploadResponse> {
    return this.uploadFileResumable(file, folderId);
  }

  // =========================================================================
  // Document Versions Lifecycle
  // =========================================================================

  public async getDocumentVersions(docId: string): Promise<DocumentVersion[]> {
    try {
      const res = await this.request<{ status: string; versions: DocumentVersion[] }>(`/documents/${docId}/versions`);
      return res.versions;
    } catch {
      return this.documentVersions.get(docId) || [
        {
          version_number: 1,
          file_size: 1048576,
          created_at: new Date().toISOString(),
          uploaded_by: 'usr-default',
        }
      ];
    }
  }

  public async restoreDocumentVersion(docId: string, targetVersion: number): Promise<Document> {
    try {
      await this.request(`/documents/${docId}/versions/${targetVersion}/restore`, {
        method: 'POST',
      });
      const updated = await this.getDocumentById(docId);
      if (updated) return updated;
    } catch (err: any) {
      if (err.status) throw err;
    }

    // Offline fallback: increment active version
    const doc = this.documents.find((d) => d.id === docId);
    if (!doc) throw new Error('Dokumen tidak ditemukan');

    const newVersion = doc.current_version + 1;
    doc.current_version = newVersion;
    doc.updated_at = new Date().toISOString();

    const versions = this.documentVersions.get(docId) || [];
    versions.push({
      version_number: newVersion,
      file_size: doc.file_size,
      created_at: new Date().toISOString(),
      uploaded_by: this.getCurrentUser()?.id || 'usr-local',
    });
    this.documentVersions.set(docId, versions);

    return doc;
  }

  // =========================================================================
  // Document Management: Rename & Move
  // =========================================================================

  public async renameDocument(docId: string, newTitle: string): Promise<Document> {
    try {
      const res = await this.request<{ status: string; document: Document }>(`/documents/${docId}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      return res.document;
    } catch (err: any) {
      if (err.status) throw err;
      const doc = this.documents.find((d) => d.id === docId);
      if (!doc) throw new Error('Dokumen tidak ditemukan');
      doc.title = newTitle;
      doc.updated_at = new Date().toISOString();
      return doc;
    }
  }

  public async moveDocument(docId: string, targetFolderId: string): Promise<Document> {
    try {
      const res = await this.request<{ status: string; document: Document }>(`/documents/${docId}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: targetFolderId }),
      });
      return res.document;
    } catch (err: any) {
      if (err.status) throw err;
      const doc = this.documents.find((d) => d.id === docId);
      if (!doc) throw new Error('Dokumen tidak ditemukan');
      doc.folder_id = targetFolderId;
      doc.updated_at = new Date().toISOString();
      return doc;
    }
  }

  // =========================================================================
  // Trash Lifecycle: Soft Delete, List, Restore & Permanent Purge
  // =========================================================================

  public async deleteDocument(docId: string): Promise<{ message: string }> {
    try {
      return await this.request<{ status: string; message: string }>(`/documents/${docId}`, {
        method: 'DELETE',
      });
    } catch (err: any) {
      if (err.status) throw err;
      const idx = this.documents.findIndex((d) => d.id === docId);
      if (idx === -1) throw new Error('Dokumen tidak ditemukan');
      const doc = this.documents[idx];
      doc.is_deleted = true;

      this.trashItems.unshift({
        id: doc.id,
        title: doc.title,
        folder_id: doc.folder_id,
        deleted_at: new Date().toISOString(),
        deleted_by: this.getCurrentUser()?.id || 'usr-local',
        file_size: doc.file_size,
      });

      this.documents.splice(idx, 1);
      return { message: 'Dokumen berhasil dipindahkan ke kotak sampah.' };
    }
  }

  public async getTrashItems(): Promise<TrashItem[]> {
    try {
      const res = await this.request<{ status: string; trash_items: TrashItem[] }>('/trash');
      return res.trash_items;
    } catch {
      return [...this.trashItems];
    }
  }

  public async restoreTrashItem(docId: string): Promise<{ message: string }> {
    try {
      return await this.request<{ status: string; message: string }>(`/trash/${docId}/restore`, {
        method: 'POST',
      });
    } catch (err: any) {
      if (err.status) throw err;
      const idx = this.trashItems.findIndex((t) => t.id === docId);
      if (idx === -1) throw new Error('Item tidak ditemukan di kotak sampah');
      const item = this.trashItems.splice(idx, 1)[0];

      // Re-add to documents
      this.documents.push({
        id: item.id,
        title: item.title,
        folder_id: item.folder_id,
        file_size: item.file_size,
        mime_type: 'application/pdf',
        current_version: 1,
        status: 'draft',
        uploaded_by: item.deleted_by,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      return { message: 'Dokumen berhasil dipulihkan dari kotak sampah.' };
    }
  }

  public async permanentlyPurgeTrashItem(docId: string): Promise<{ message: string }> {
    const user = this.getCurrentUser();
    if (user?.role !== 'admin' && user?.level !== 'L5') {
      const err = new Error('Forbidden: only Administrator or Level L5 can permanently purge items');
      (err as any).status = 403;
      throw err;
    }

    try {
      return await this.request<{ status: string; message: string }>(`/trash/${docId}/permanent`, {
        method: 'DELETE',
      });
    } catch (err: any) {
      if (err.status) throw err;
      const idx = this.trashItems.findIndex((t) => t.id === docId);
      if (idx !== -1) {
        this.trashItems.splice(idx, 1);
      }
      this.documentVersions.delete(docId);
      return { message: 'Dokumen berhasil dihapus secara permanen.' };
    }
  }

  // =========================================================================
  // AI Operations & Workflow Action
  // =========================================================================

  public async compareDocuments(documentIds: string[], query: string): Promise<CompareResponse> {
    const user = this.getCurrentUser();
    if (user && !hasPermission(user.role, 'ai:compare')) {
      const err = new Error('Forbidden: role does not have AI compare permission');
      (err as any).status = 403;
      throw err;
    }

    if (!documentIds || documentIds.length < 2) {
      const err = new Error('At least two document_ids are required for comparison');
      (err as any).status = 400;
      throw err;
    }

    try {
      return await this.request<CompareResponse>('/ai/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_ids: documentIds, query }),
      });
    } catch (err: any) {
      if (err.status === 403) throw err;
      return {
        status: 'success',
        comparison_result: [
          '| Parameter Evaluasi | Kontrak Kerja Sama 2025 (v1.0) | Adendum Kontrak 2026 (v2.0) | Analisis Dampak Risiko |',
          '|---|---|---|---|',
          '| **Nilai Denda Keterlambatan** | 1% per minggu keterlambatan | **2% per minggu keterlambatan** | Kenaikan 100% beban denda, membutuhkan pengetatan monitoring vendor |',
          '| **Jatuh Tempo Pembayaran** | 30 hari setelah invoice diterbitkan | **45 hari setelah verifikasi BAST** | Memperpanjang ruang cash flow perusahaan sebesar 15 hari |',
          '| **Target SLA / Uptime** | 99.0% garansi standar | **99.95% dengan dukungan on-site 24/7** | Perlindungan keandalan operasional sistem enterprise jauh lebih tinggi |',
          '| **Klausul Pengakhiran** | Notifikasi 30 hari kalender | **Notifikasi 60 hari kerja tertulis** | Memberikan waktu mitigasi transisi yang lebih aman jika terjadi pergantian vendor |'
        ].join('\n'),
        citations: [
          { document_id: documentIds[0], page: 3 },
          { document_id: documentIds[1], page: 3 },
        ],
      };
    }
  }

  public async askAI(documentId: string, question: string): Promise<QAResponse> {
    const user = this.getCurrentUser();
    if (user && !hasPermission(user.role, 'ai:qa')) {
      const err = new Error('Forbidden: role does not have AI QA permission');
      (err as any).status = 403;
      throw err;
    }

    if (!question || question.trim() === '') {
      const err = new Error('question cannot be empty');
      (err as any).status = 400;
      throw err;
    }

    try {
      return await this.request<QAResponse>('/ai/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId, question }),
      });
    } catch (err: any) {
      if (err.status === 403) throw err;
      const lower = question.toLowerCase();
      let answer = 'Berdasarkan analisis dokumen, klausul terkait telah diidentifikasi dan diverifikasi sesuai pedoman legal.';
      let page = 2;

      if (lower.includes('jatuh tempo') || lower.includes('tempo') || lower.includes('bayar')) {
        if (documentId === 'doc-kontrak-2026') {
          answer = 'Tanggal jatuh tempo pembayaran pada Adendum 2026 disesuaikan menjadi 45 hari setelah verifikasi berita acara (Pasal 2).';
          page = 2;
        } else {
          answer = 'Tanggal jatuh tempo pembayaran adalah 30 hari setelah invoice diterbitkan secara sah oleh Pihak Kedua.';
          page = 2;
        }
      } else if (lower.includes('denda') || lower.includes('terlambat') || lower.includes('keterlambatan')) {
        if (documentId === 'doc-kontrak-2026') {
          answer = 'Nilai denda keterlambatan pada Adendum 2026 ditingkatkan menjadi 2% per minggu keterlambatan.';
          page = 3;
        } else {
          answer = 'Nilai denda keterlambatan ditetapkan sebesar 1% untuk setiap minggu keterlambatan pekerjaan.';
          page = 3;
        }
      } else if (lower.includes('akhir') || lower.includes('pengakhiran') || lower.includes('putus')) {
        answer = 'Kontrak dapat diakhiri secara sepihak jika terjadi wanprestasi selama 30 hari berturut-turut setelah peringatan tertulis ketiga.';
        page = 5;
      } else if (lower.includes('sla') || lower.includes('uptime') || lower.includes('garansi')) {
        answer = 'Penyedia wajib mempertahankan service level agreement (SLA) uptime minimal 99.95% dengan dukungan technical support on-site 24/7.';
        page = 4;
      } else if (lower.includes('sengketa') || lower.includes('hukum') || lower.includes('arbitrase')) {
        answer = 'Segala perselisihan diselesaikan secara musyawarah dan melalui Badan Arbitrase Nasional Indonesia (BANI).';
        page = 6;
      }

      return {
        status: 'success',
        answer,
        page_reference: page,
      };
    }
  }

  public async executeWorkflowAction(
    workflowId: string,
    action: WorkflowActionType,
    notes: string = ''
  ): Promise<WorkflowActionResponse> {
    const user = this.getCurrentUser();
    if (user && !hasPermission(user.role, 'workflow:action')) {
      const err = new Error('Forbidden: role does not have workflow action permission');
      (err as any).status = 403;
      throw err;
    }

    const validActions: WorkflowActionType[] = ['approve', 'reject', 'revise'];
    if (!validActions.includes(action)) {
      const err = new Error(`Invalid action. Must be one of: ${validActions.join(', ')}`);
      (err as any).status = 400;
      throw err;
    }

    try {
      return await this.request<WorkflowActionResponse>(`/workflows/${workflowId}/action`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes }),
      });
    } catch (err: any) {
      if (err.status === 403) throw err;
      const wf = this.workflows.find((w) => w.id === workflowId);
      if (wf) {
        wf.last_action = action;
        wf.notes = notes;
        wf.action_by = user?.id || 'usr-offline';
        wf.updated_at = new Date().toISOString();
        if (action === 'approve') {
          wf.status = 'approved';
          const doc = this.documents.find((d) => d.id === wf.document_id);
          if (doc) doc.status = 'approved';
        } else if (action === 'reject') {
          wf.status = 'archived';
          const doc = this.documents.find((d) => d.id === wf.document_id);
          if (doc) doc.status = 'archived';
        } else if (action === 'revise') {
          wf.status = 'draft';
          const doc = this.documents.find((d) => d.id === wf.document_id);
          if (doc) doc.status = 'draft';
        }
      }
      return {
        status: 'success',
        message: 'Status workflow berhasil diperbarui.',
      };
    }
  }

  // Repository helper methods
  public async getFolders(): Promise<Folder[]> {
    return [...this.folders];
  }

  public async getDocuments(folderId?: string): Promise<Document[]> {
    const active = this.documents.filter((d) => !d.is_deleted);
    if (folderId) {
      return active.filter((d) => d.folder_id === folderId);
    }
    return active;
  }

  public async getDocumentById(id: string): Promise<Document | undefined> {
    return this.documents.find((d) => d.id === id);
  }

  public async getWorkflows(): Promise<WorkflowItem[]> {
    return [...this.workflows];
  }

  public addFolder(name: string, parentId: string | null = null): Folder {
    const newFolder: Folder = {
      id: `fld-${Date.now()}`,
      name,
      parent_id: parentId,
      created_at: new Date().toISOString(),
    };
    this.folders.push(newFolder);
    return newFolder;
  }

  // =========================================================================
  // Deterministic Code Engines (R3): Extraction, Classification & FTS
  // =========================================================================

  public async extractMetadata(text: string): Promise<ExtractedData> {
    try {
      const res = await this.request<{ status: string; data: ExtractedData }>('/engine/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      return res.data;
    } catch {
      return this.offlineExtractMetadata(text);
    }
  }

  public async classifyDocument(text: string, filename: string = ''): Promise<ClassificationResult> {
    try {
      const res = await this.request<{ status: string; result: ClassificationResult }>('/engine/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, filename }),
      });
      return res.result;
    } catch {
      return this.offlineClassifyDocument(text, filename);
    }
  }

  public async searchDocuments(query: string, filter?: SearchFilter): Promise<SearchResult[]> {
    try {
      const params = new URLSearchParams();
      params.set('q', query);
      if (filter?.folder_id) params.set('folder_id', filter.folder_id);
      if (filter?.division) params.set('division', filter.division);
      if (filter?.classification) params.set('classification', filter.classification);
      if (filter?.doc_type) params.set('doc_type', filter.doc_type);

      const res = await this.request<{ status: string; query: string; count: number; results: SearchResult[] }>(
        `/engine/search?${params.toString()}`
      );
      return res.results;
    } catch {
      return this.offlineSearch(query, filter);
    }
  }

  // =========================================================================
  // Dual-Axis RBAC & Dynamic Watermarking API (Milestone 4)
  // =========================================================================

  public async checkRbac(
    docClassification: string,
    docDivision: string,
    action: 'view' | 'download' = 'view'
  ): Promise<{
    allowed: boolean;
    can_view: boolean;
    can_download: boolean;
    reason?: string;
    action: string;
    user: any;
  }> {
    try {
      return await this.request('/rbac/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_classification: docClassification,
          doc_division: docDivision,
          action,
        }),
      });
    } catch {
      // Offline fallback evaluation matching rbac_oracle.js
      const user = this.getCurrentUser();
      const div = user?.division || 'General';
      const lvl = user?.level || 'L1';
      const role = user?.role || 'viewer';
      const levelNum = parseInt(lvl.replace('L', ''), 10) || 1;

      let allowed = false;
      let canView = false;
      let canDownload = false;
      let reason = '';

      if (role === 'admin' || div === 'ALL' || (div === 'Executive' && lvl === 'L5')) {
        allowed = true;
        canView = true;
        canDownload = true;
      } else if (docClassification === 'Publik') {
        allowed = true;
        canView = true;
        canDownload = true;
      } else if (docClassification === 'Internal') {
        canView = true;
        canDownload = levelNum >= 2;
        allowed = action === 'view' ? canView : canDownload;
        if (!allowed) reason = 'Level L1 has view-only rights for Internal documents';
      } else if (docClassification === 'Rahasia') {
        if (div !== docDivision) {
          reason = `Access denied: Rahasia document restricted to ${docDivision} division`;
        } else if (levelNum < 2) {
          reason = 'Level L1 has no access to Rahasia documents';
        } else {
          canView = true;
          canDownload = levelNum >= 3;
          allowed = action === 'view' ? canView : canDownload;
          if (!allowed) reason = 'Level L2 has view-only rights for Rahasia documents';
        }
      } else if (docClassification === 'Sangat Rahasia') {
        if (div !== docDivision) {
          reason = `Access denied: Sangat Rahasia document restricted to ${docDivision} division`;
        } else if (levelNum < 4) {
          reason = 'Levels L1-L3 have no access to Sangat Rahasia documents';
        } else {
          canView = true;
          canDownload = levelNum >= 5;
          allowed = action === 'view' ? canView : canDownload;
          if (!allowed) reason = 'Level L4 has view-only rights for Sangat Rahasia documents';
        }
      }

      return {
        allowed,
        can_view: canView,
        can_download: canDownload,
        reason,
        action,
        user: { user_id: user?.id, division: div, level: lvl, role },
      };
    }
  }

  public async getAdminUsers(): Promise<User[]> {
    try {
      const res = await this.request<{ status: string; users: User[] }>('/admin/users');
      return res.users;
    } catch {
      return [
        { id: 'usr-admin-1', username: 'admin_brilian', name: 'Budi Santoso', role: 'admin', division: 'ALL', level: 'L5' },
        { id: 'usr-rev-1', username: 'reviewer_1', name: 'Dewi Lestari', role: 'reviewer', division: 'Legal', level: 'L3' },
        { id: 'usr-upl-1', username: 'uploader_1', name: 'Ahmad Fauzi', role: 'uploader', division: 'HR', level: 'L2' },
        { id: 'usr-viw-1', username: 'viewer_1', name: 'Rina Wijaya', role: 'viewer', division: 'Finance', level: 'L2' },
      ];
    }
  }

  public async updateAdminUser(id: string, updates: Partial<User>): Promise<{ user: User; message: string }> {
    try {
      const res = await this.request<{ status: string; user: User; message: string }>(`/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      return res;
    } catch {
      const user: User = {
        id,
        username: updates.username || 'user',
        name: updates.name || 'User',
        role: updates.role || 'viewer',
        division: updates.division || 'General',
        level: updates.level || 'L1',
      };
      return { user, message: 'User attributes successfully updated.' };
    }
  }

  public async getWatermarkConfig(): Promise<{ default_opacity: number; default_angle: number; banner_text: string }> {
    try {
      const res = await this.request<{ status: string; config: any }>('/admin/watermark');
      return res.config;
    } catch {
      return {
        default_opacity: 0.20,
        default_angle: -45,
        banner_text: 'BRILIAN INTELLIGENT DMS',
      };
    }
  }

  public async updateWatermarkConfig(config: { opacity?: number; angle?: number; banner_text?: string }): Promise<any> {
    try {
      return await this.request('/admin/watermark', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
    } catch (err: any) {
      if (err.status) throw err;
      return { status: 'success', config, message: 'Watermark configuration updated.' };
    }
  }

  public async getDocumentPreview(docId: string): Promise<any> {
    return await this.request(`/documents/${docId}/preview?format=json`);
  }

  public async downloadWatermarkedDocument(docId: string): Promise<Blob> {
    const token = this.getToken();
    const res = await fetch(`${API_BASE}/documents/${docId}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const err = new Error(`Download failed with status ${res.status}`);
      (err as any).status = res.status;
      throw err;
    }
    return await res.blob();
  }

  public async summarizeDocument(params: {
    document_id: string;
    text?: string;
    max_tokens?: number;
  }): Promise<SummarizeResponse> {
    try {
      return await this.request<SummarizeResponse>('/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    } catch {
      const doc = this.documents.find((d) => d.id === params.document_id);
      const content = params.text || doc?.preview_content?.join('\n') || doc?.title || '';
      const cls = this.offlineClassifyDocument(content, doc?.title || '');
      const ext = this.offlineExtractMetadata(content);

      const summaryParts = [
        `Dokumen diklasifikasikan sebagai ${cls.doc_type} (Keyakinan: ${(cls.confidence * 100).toFixed(0)}%).`,
        ext.identifiers.length ? `Nomor Referensi: ${ext.identifiers.join(', ')}` : '',
        ext.currencies.length ? `Nilai Transaksi: ${ext.currencies.join(', ')}` : '',
        ext.dates.length ? `Tanggal Penting: ${ext.dates.join(', ')}` : '',
        doc?.preview_content?.slice(0, 3).map((p, i) => `${i + 1}. ${p.slice(0, 80)}...`).join('\n') || ''
      ].filter(Boolean);

      const summaryText = summaryParts.join('\n\n');

      return {
        status: 'success',
        summary: summaryText,
        token_count: Math.ceil(summaryText.length / 4),
        model: 'mock-deterministic-v1',
        provider: 'mock',
      };
    }
  }

  // -------------------------------------------------------------------------
  // Offline Engine Simulators matching engine_oracle.js
  // -------------------------------------------------------------------------

  private offlineExtractMetadata(text: string): ExtractedData {
    if (!text || typeof text !== 'string') {
      return { dates: [], currencies: [], percentages: [], identifiers: [] };
    }

    const dateRegexes = [
      /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/g,
      /\b(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})\b/gi,
      /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g,
    ];

    const dates = new Set<string>();
    for (const rx of dateRegexes) {
      const matches = text.match(rx);
      if (matches) matches.forEach((m) => dates.add(m.trim()));
    }

    const currencies = new Set<string>();
    const currMatches = text.match(/\b(?:Rp\.?|IDR|\$|USD)\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\b/gi);
    if (currMatches) currMatches.forEach((m) => currencies.add(m.trim()));

    const percentages = new Set<string>();
    const pctMatches = text.match(/\b(\d+(?:[.,]\d+)?)\s*%/g);
    if (pctMatches) pctMatches.forEach((m) => percentages.add(m.trim()));

    const identifiers = new Set<string>();
    const idMatches = text.match(/\b(?:No\.?|Nomor|INV|SPK|SK)[\s\:\/]*([A-Za-z0-9\-\.\/]+)\b/gi);
    if (idMatches) idMatches.forEach((m) => identifiers.add(m.trim()));

    return {
      dates: Array.from(dates),
      currencies: Array.from(currencies),
      percentages: Array.from(percentages),
      identifiers: Array.from(identifiers),
    };
  }

  private offlineClassifyDocument(text: string, filename: string = ''): ClassificationResult {
    const combined = `${filename} ${text}`.toUpperCase();
    const dictionary: Record<string, string[]> = {
      'Surat Perjanjian': ['SURAT PERJANJIAN', 'PERJANJIAN KERJASAMA', 'PIHAK PERTAMA', 'PIHAK KEDUA', 'PASAL', 'KLAUSUL'],
      'Invoice / Tagihan': ['INVOICE', 'TAGIHAN', 'TOTAL PEMBAYARAN', 'JATUH TEMPO', 'REKENING'],
      'Surat Keputusan': ['SURAT KEPUTUSAN', 'MEMUTUSKAN', 'MENIMBANG', 'MENETAPKAN'],
      'SOP / Pedoman': ['STANDAR OPERASIONAL PROSEDUR', 'SOP', 'PROSEDUR KERJA', 'RUANG LINGKUP'],
      'Laporan Keuangan': ['LAPORAN KEUANGAN', 'NERACA', 'LABA RUGI', 'ARUS KAS'],
      'Formulir HR': ['FORMULIR PENGAJUAN', 'CUTI TAHUNAN', 'SLIP GAJI', 'KARYAWAN'],
    };

    let bestType = 'Dokumen Umum';
    let highestScore = 0;
    let matchedKeywords: string[] = [];

    for (const [docType, keywords] of Object.entries(dictionary)) {
      let score = 0;
      const matched: string[] = [];
      for (const kw of keywords) {
        if (combined.includes(kw)) {
          score++;
          matched.push(kw);
        }
      }
      if (score > highestScore) {
        highestScore = score;
        bestType = docType;
        matchedKeywords = matched;
      }
    }

    const confidence = highestScore > 0 ? Math.min(1.0, 0.5 + highestScore * 0.15) : 0.2;
    return {
      doc_type: bestType,
      confidence: Number(confidence.toFixed(2)),
      matched_keywords: matchedKeywords,
    };
  }

  private offlineSearch(query: string, filter?: SearchFilter): SearchResult[] {
    const q = query.toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const results: SearchResult[] = [];

    for (const doc of this.documents) {
      if (doc.is_deleted) continue;
      if (filter?.folder_id && doc.folder_id !== filter.folder_id) continue;
      if (filter?.division && doc.division?.toLowerCase() !== filter.division.toLowerCase() && filter.division !== 'ALL') continue;
      if (filter?.classification && doc.classification !== filter.classification) continue;

      const titleLower = doc.title.toLowerCase();
      const content = doc.preview_content?.join(' ') || doc.raw_content || '';
      const contentLower = content.toLowerCase();

      let hits = 0;
      const matchedTerms: string[] = [];
      for (const t of tokens) {
        if (titleLower.includes(t)) {
          hits += 3;
          matchedTerms.push(t);
        }
        if (contentLower.includes(t)) {
          hits += 1;
          matchedTerms.push(t);
        }
      }

      if (hits > 0) {
        let snippet = content.slice(0, 160) + '...';
        for (const t of matchedTerms) {
          snippet = snippet.replace(new RegExp(`(${t})`, 'gi'), '<mark>$1</mark>');
        }

        results.push({
          doc_id: doc.id,
          title: doc.title,
          snippet,
          score: hits,
          matches: Array.from(new Set(matchedTerms)),
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }
}


export const api = new ApiClient();
