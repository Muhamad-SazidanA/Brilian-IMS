# Project: Brilian Intelligent Document Management System (IDMS)

## Architecture
Brilian IDMS is an enterprise-grade Intelligent Document Management System built with a Go backend HTTP API, React 18 / Vite / Tailwind CSS frontend, PostgreSQL + pgvector persistence, and MinIO object storage. The system enforces strict separation between deterministic code engines (for search, extraction, and classification) and semantic LLM models (for document summarization and interactive Q&A), backed by division and level (L1-L5) RBAC and mandatory dynamic watermarking across all document previews and downloads.

```
                    +------------------------------------------+
                    |             Client Browser               |
                    | (React 18 + Vite + Tailwind v3 Paper UI) |
                    +--------------------+---------------------+
                                         |
                       HTTP / REST API   |  (JWT + Access Matrix)
                                         v
                    +------------------------------------------+
                    |             Go API Gateway               |
                    |  - Auth Middleware (Division & L1-L5)    |
                    |  - Audit Logging Middleware (Immutable)  |
                    |  - Rate Limiter & Security Headers       |
                    +----+---------------+----------------+----+
                         |               |                |
         +---------------+               |                +---------------+
         v                               v                                v
+------------------+           +-------------------+            +-------------------+
| DMS Core Engine  |           | Deterministic     |            | AI Semantic       |
| - Chunked Upload |           | Code Engine       |            | Assistant         |
|   (>=100MB, BVA) |           | - Regex Extractor |            | - Summarizer      |
| - Magic Bytes    |           | - Keyword DocType |            | - Q&A Engine      |
| - Quota & Sanit. |           | - Full-Text Search|            | - Prompt Inj.     |
| - Versioning     |           |   (tsvector/FTS)  |            |   Sanitizer       |
| - Watermarking   |           +-------------------+            | - Mock Fallback   |
|   (PDF/Office/   |                                            +-------------------+
|    Images/Text)  |
+--------+---------+
         |
         v
+------------------+-------------------+
| PostgreSQL 16    | MinIO Storage     |
| - Metadata & RBAC| - Raw Documents   |
| - Version Tree   | - Chunks & Buffer |
| - Immutable Logs | - Renditions      |
+------------------+-------------------+
```

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Codebase Audit & Gap Analysis | Comprehensive audit of existing backend, frontend, and tests documented in docs/AUDIT.md | M1 | R1 |
| 2 | Canonical Style Guide Definition | Style tokens, fonts (IBM Plex), hairline borders, Lucide icons in docs/STYLE_GUIDE.md | M1 | R1 |
| 3 | Frontend Theme Alignment | Align Tailwind tokens, index.css, and base layout to paper/mist/ink palette; remove slop/emojis | M1 | R1 |
| 4 | Resumable Chunked Upload Engine | Upload >=100MB files with chunking, per-file progress, pausing, and resuming | M2 | R2 |
| 5 | Content-Based File Validation | Magic byte inspection for all supported MIME types to prevent extension spoofing | M2 | R2 |
| 6 | File & User Quota Enforcement | Configurable per-file size caps and per-user storage quota enforcement | M2 | R2 |
| 7 | Filename Sanitization | Sanitize path traversal, null bytes, unicode spoofing, and dangerous characters | M2 | R2 |
| 8 | Malicious File Quarantine | Detect & quarantine zip bombs, SVGs with script tags, and macro-enabled Office files | M2 | R2 |
| 9 | Automatic Document Versioning | Auto v1 on upload, increment on re-upload with identical name, preserve full history | M2 | R2 |
| 10 | Version Inspection, Download & Restore | View prior versions, download historical renditions, and restore previous version | M2 | R2 |
| 11 | Folder Navigation & Hierarchy | Hierarchical folder tree, nested folders, breadcrumb navigation | M2 | R2 |
| 12 | Folder List & Grid Views | Toggleable grid view and tabular list view with sorting and metadata | M2 | R2 |
| 13 | File Rename & Move Operations | Move documents across folders and rename files with uniqueness checks | M2 | R2 |
| 14 | Trash Lifecycle (Soft-Delete) | Soft-delete documents/folders to trash with retention tracking | M2 | R2 |
| 15 | Trash Restore & Permanent Deletion | Restore soft-deleted items or permanently purge items by authorized roles | M2 | R2 |
| 16 | PDF Preview Renderer | Secure inline multi-page PDF rendering | M2 | R2 |
| 17 | Office Document Previewer | Render DOCX, XLSX, and PPTX previews or HTML/SVG extracts | M2 | R2 |
| 18 | Image, Video & Audio Previewer | Secure inline media player and high-res image viewport | M2 | R2 |
| 19 | Plain Text & Code Previewer | Monospace text viewer with syntax formatting and line numbers | M2 | R2 |
| 20 | Non-Renderable Metadata Fallback | Display complete file metadata, hash, and conditional download for unsupported types | M2 | R2 |
| 21 | Deterministic Regex Data Extraction | Extract dates, currencies, IDs, tax numbers using deterministic regex engines | M3 | R3 |
| 22 | Keyword Document Type Classification | Deterministic pattern/keyword matching to categorize documents without LLM calls | M3 | R3 |
| 23 | Indexed Full-Text Search (FTS) | Fast, indexed full-text search across document metadata and extracted content | M3 | R3 |
| 24 | Semantic LLM Summarization | Document summarization via LLM integration with token budgeting | M3 | R3 |
| 25 | Semantic LLM Document Q&A | Contextual question answering grounded in document chunks via LLM | M3 | R3 |
| 26 | LLM Test Mock / Deterministic Fallback | Environment-variable driven deterministic mock fallback for offline test passes | M3 | R3 |
| 27 | Prompt Injection Defense | Sanitization and delimiting against embedded adversarial instructions in documents | M3 | R3 |
| 28 | Division & Level (L1-L5) RBAC Matrix | Access matrix evaluating User Division + Level against Document Classification | M4 | R4 |
| 29 | Document Classification Levels | Classifications: Publik, Internal, Rahasia, Sangat Rahasia with division scoping | M4 | R4 |
| 30 | Granular Rights (View vs View+Download) | Enforce separate view permissions and download permissions based on classification | M4 | R4 |
| 31 | Dynamic Diagonal Repeating Watermark | Render diagonal repeating watermark (Name, ID, Timestamp, 15-25% opacity) | M4 | R4 |
| 32 | Universal Watermarking on View | Enforce dynamic watermarking on all rendered previews (PDF, images, Office, text) | M4 | R4 |
| 33 | Permanent Watermarking on Download | Embed dynamic watermark permanently into downloaded PDF, images, and documents | M4 | R4 |
| 34 | Direct URL Access Protection | Non-bypassable signed/authenticated file streaming URLs preventing watermark bypass | M4 | R4 |
| 35 | Admin User & Division Management | Admin UI & APIs to manage user accounts, assign divisions, and configure levels | M4 | R4 |
| 36 | Admin Access Policy & Watermark Config | Admin UI & APIs to configure RBAC matrix and policy-level watermark settings | M4 | R4 |
| 37 | Immutable Audit Logging Engine | Tamper-resistant append-only logging of upload, view, download, permission changes | M5 | R5 |
| 38 | Monitored Folder Event Notifications | In-app/API notifications triggered on monitored folder activities | M5 | R5 |
| 39 | Zero Dead Code & Linter Compliance | Full static analysis pass with zero unused code or duplicated implementations | M5 | R5 |
| 40 | Performance Target Validation | Validate p95 list <200ms, 100MB upload, preview <1.5s, search <500ms in docs/PERF.md | M5 | R5 |
| 41 | OWASP ASVS & Top 10 Security Verification | Two-round security testing (IDOR, path traversal, injection) in docs/SECURITY_REPORT.md | M5 | R5 |
| 42 | Architecture Docs, ADRs & Final Report | Complete docs/ARCH.md, docs/REQUIREMENTS.md, docs/ADR/, docs/PROGRESS.md, final.md | M5 | R5 |
| 43 | 100% E2E Test Suite Execution (Tiers 1-4) | Pass all functional, boundary, pairwise, and application tests from E2E Testing Track | M6 | Acceptance |
| 44 | Adversarial Coverage Hardening (Tier 5) | White-box challenger gap analysis and adversarial test case hardening | M6 | Acceptance |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Audit, Style Guide & UI Foundation | Author docs/AUDIT.md and docs/STYLE_GUIDE.md, configure Tailwind tokens & base light theme | none | DONE |
| M2 | Core DMS & Resumable File Upload Engine | Chunked upload (100MB+), magic bytes, quota, quarantine, versioning, trash, previews | M1 | DONE |
| M3 | Deterministic Engines & AI Assistant | Regex extractor, keyword classification, indexed FTS, LLM summarization/QA with mock | M2 | DONE |
| M4 | Division & Level RBAC & Dynamic Watermarking | Division + L1-L5 access matrix, dynamic repeating watermark on view/download, admin UI | M1, M2 | IN_PROGRESS |
| M5 | Observability, Security, Performance & Docs | Immutable audit log, notifications, linters, docs/PERF.md, docs/SECURITY_REPORT.md, docs/ | M1, M2, M3, M4 | PLANNED |
| M6 | Final Milestone: E2E Test Pass & Hardening | Pass 100% of E2E tests (Tiers 1-4) followed by Tier 5 adversarial hardening | M1-M5, TEST_READY.md | PLANNED |

---

## Interface Contracts

### Backend ↔ Frontend API Contract
- Base URL: `/api/v1`
- Auth: `Authorization: Bearer <jwt_token>`
- User Context in Claims: `{ "user_id": string, "name": string, "division": string, "level": "L1"|"L2"|"L3"|"L4"|"L5", "role": string }`

### Upload Engine Contract
- `POST /api/v1/documents/upload/init`: Body `{ "filename": string, "total_size": number, "mime_type": string, "folder_id"?: string }` -> `{ "session_id": string, "chunk_size": number, "total_chunks": number }`
- `POST /api/v1/documents/upload/chunk`: Multipart `{ "session_id": string, "chunk_index": number, "chunk_hash": string, "file": binary }` -> `{ "received": number, "status": "pending"|"completed" }`
- `POST /api/v1/documents/upload/complete`: Body `{ "session_id": string }` -> `{ "document": DocumentRecord, "version": number }`

### Watermark Engine Contract
- Function Signature: `ApplyWatermark(content: []byte, mimeType: string, options: WatermarkOptions) -> ([]byte, error)`
- WatermarkOptions: `{ FullName: string, UserID: string, Timestamp: time.Time, Opacity: 0.15..0.25, DiagonalAngle: -45 }`
- Target Mimes: `application/pdf`, `image/*`, `text/*`, `application/vnd.openxmlformats-officedocument.*`

### Deterministic Engine Contract
- Extractor: `ExtractMetadata(text: string) -> ExtractedData { Dates: []string, Currencies: []string, Identifiers: []string }`
- Classifier: `ClassifyDocument(text: string, filename: string) -> ClassificationResult { DocType: string, Confidence: float64 }`
- Search: `SearchDocuments(query: string, filter: SearchFilter) -> []SearchResult { DocID: string, Snippet: string, Score: float64 }`

---

## Code Layout
```
c:\Zidan\BrilianIDMS\
├── cmd/
│   └── server/                 # Go API server entrypoint (cmd/server/main.go)
├── internal/
│   ├── api/                    # HTTP handlers, routers, middleware
│   │   ├── handler/            # Handlers (documents, upload, auth, rbac, ai, admin, trash)
│   │   └── middleware/         # Auth, RBAC matrix, audit log, rate limiter
│   ├── dms/                    # Core DMS business logic (storage, chunking, magic bytes, quota)
│   ├── watermark/              # Dynamic watermarking engine (PDF, images, Office, text)
│   ├── engine/                 # Deterministic extraction, classification, and FTS engines
│   ├── ai/                     # Semantic LLM summarizer and Q&A with mock fallback
│   ├── audit/                  # Immutable audit logger and notification dispatcher
│   ├── database/               # PostgreSQL migrations and queries
│   └── config/                 # Environment configuration
├── frontend/
│   ├── src/
│   │   ├── api/                # API client with real endpoints and fallback
│   │   ├── components/         # UI components (dms, upload, viewer, ai, admin, auth)
│   │   │   ├── viewer/         # Multi-format previewers + WatermarkOverlay
│   │   │   ├── upload/         # Resumable chunked uploader with progress
│   │   │   └── rbac/           # Admin RBAC management
│   │   ├── styles/             # Design tokens and Tailwind styles
│   │   └── types/              # TypeScript interface definitions
│   ├── tailwind.config.js      # Paper/mist/ink design tokens
│   └── index.html              # IBM Plex Sans & Mono fonts
├── docs/                       # Architecture, audit, style guide, security, and perf docs
│   ├── AUDIT.md
│   ├── STYLE_GUIDE.md
│   ├── ARCH.md
│   ├── REQUIREMENTS.md
│   ├── PERF.md
│   ├── SECURITY_REPORT.md
│   ├── DECISIONS.md
│   └── ADR/
└── tests/
    └── e2e/                    # Comprehensive E2E test suites (Tiers 1-4)
```
