# E2E Test Infrastructure & Strategy Specification: BrilianIDMS

## 1. Executive Summary & Test Philosophy
**BrilianIDMS** (Intelligent Document Management System) is an enterprise-grade document management and AI assistant platform built with Go backend services, React 18 / Vite frontend, PostgreSQL persistence, and MinIO object storage. The system enforces strict separation between deterministic code engines and semantic LLM models, dual-axis division and level (L1-L5) RBAC, and mandatory dynamic watermarking across all document previews and downloads.

The End-to-End (E2E) Test Suite validates the entire system surface against the contracts, architectures, schemas, and security policies defined in specification documentation (`ORIGINAL_REQUEST.md`, `PROJECT.md`, `skema_basis_data.md`, `dokumentasi_api_backend.md`, `kebijakan_keamanan.md`, and `spec_miner_requirements/analysis.md`).

### Test Philosophy
1. **Opaque-Box Verification**: The test suite treats components as black-box units adhering to strict input/output contracts, protocol schemas, and mathematical invariants (AES-256-GCM authentication, JWT claims, PDF coordinate transforms, SQL DDL relational integrity, magic bytes detection, and dual-axis RBAC evaluation).
2. **Defensive Boundary Stressing**: Zero-tolerance for uncaught exceptions, out-of-bounds memory leaks, tampered ciphertext payloads, path traversal, null-byte injections, quota overflows, SVG script injections, or privilege escalations.
3. **Reproducibility & Zero Dependency Friction**: Tests are automated and executable using standard Node.js (Node 20+/24+) built-in runners (`node:test` and `node:assert/strict`), ensuring zero host environment friction.

---

## 2. Test Architecture & Directory Layout

```text
c:\Zidan\BrilianIDMS/
├── TEST_INFRA.md                       # This document: Comprehensive Test Strategy
├── TEST_READY.md                       # Test runner execution guide & coverage summary
├── tests/
│   └── e2e/
│       ├── runner.js                   # Unified test orchestrator & TAP / Spec reporter
│       ├── helpers/
│       │   ├── crypto_oracle.js        # AES-256-GCM oracle & memory wipe verification
│       │   ├── wasm_oracle.js          # Rust Wasm coordinate transform & clamp oracle
│       │   ├── jwt_oracle.js           # JWT issuance, verification & RBAC matrix validator
│       │   ├── schema_oracle.js        # SQL DDL & vector index validator
│       │   ├── rbac_oracle.js          # Dual-axis Division + Level (L1-L5) RBAC evaluator
│       │   ├── watermark_oracle.js     # Dynamic diagonal repeating watermark oracle
│       │   ├── magic_bytes_oracle.js   # Binary signature inspector & MIME spoofing detector
│       │   ├── sanitizer_oracle.js     # Filename traversal sanitizer & malware quarantine
│       │   ├── engine_oracle.js        # Deterministic extraction, classification & prompt shield
│       │   └── api_mock_server.js      # In-process HTTP client & handler simulator
│       ├── tier1_features/             # 25 Dedicated Feature Test Suites
│       │   ├── test_feature_01_single_binary.test.js
│       │   ├── test_feature_02_aes_prompt_encryptor.test.js
│       │   ├── test_feature_03_rust_wasm_bounding_box.test.js
│       │   ├── test_feature_04_dockerfile_scratch.test.js
│       │   ├── test_feature_05_database_schema.test.js
│       │   ├── test_feature_06_config_env.test.js
│       │   ├── test_feature_07_docker_compose.test.js
│       │   ├── test_feature_08_vertex_ai_adapter.test.js
│       │   ├── test_feature_09_react_wasm_bridge.test.js
│       │   ├── test_feature_10_license_validator.test.js
│       │   ├── test_feature_11_jwt_rbac.test.js
│       │   ├── test_feature_12_rest_api_handlers.test.js
│       │   ├── test_feature_13_test_suite_runner.test.js
│       │   ├── test_feature_14_task_status_board.test.js
│       │   ├── test_feature_15_chunked_upload.test.js
│       │   ├── test_feature_16_magic_bytes_validation.test.js
│       │   ├── test_feature_17_quota_enforcement.test.js
│       │   ├── test_feature_18_filename_sanitization.test.js
│       │   ├── test_feature_19_malicious_file_quarantine.test.js
│       │   ├── test_feature_20_document_versioning.test.js
│       │   ├── test_feature_21_trash_lifecycle.test.js
│       │   ├── test_feature_22_dynamic_watermarking.test.js
│       │   ├── test_feature_23_division_level_rbac.test.js
│       │   ├── test_feature_24_deterministic_engines.test.js
│       │   └── test_feature_25_audit_logging_notifications.test.js
│       ├── tier2_boundaries/           # 2 Boundary & Corner Case Test Suites
│       │   ├── test_boundaries_and_edges.test.js
│       │   └── test_tier2_advanced_boundaries.test.js
│       ├── tier3_combinations/         # 2 Cross-Feature Combination Test Suites
│       │   ├── test_pairwise_combinations.test.js
│       │   └── test_tier3_cross_feature_combinations.test.js
│       └── tier4_scenarios/            # 2 Enterprise Lifecycle Application Suites
│           ├── test_real_world_scenarios.test.js
│           └── test_tier4_multi_department_workflow.test.js
```

---

## 3. Test Methodology & Derivation Techniques

### 3.1 Opaque-Box Testing
All tests exercise interface contracts defined in `PROJECT.md` and `dokumentasi_api_backend.md` without presuming private language internals:
- **AES Encryptor**: Validates that encrypted payloads adhere to standard IV (12 bytes) + Ciphertext + GCM Auth Tag (16 bytes), decryption restores exact plaintext, altered bits fail GCM verification, and wiped memory buffers are zeroized.
- **Rust Wasm Bounding Box**: Validates normalized coordinate projection $(x, y, w, h) \times \text{scale}$, viewport clipping, non-negative dimensions, and JSON schema compliance.
- **Database Schema**: Validates DDL constraints, UUID v4 primary keys, foreign key cascade actions, Indonesian `tsvector` generation, and `pgvector(1536)` IVFFLAT indexing.
- **REST APIs**: Validates HTTP status codes (200, 201, 400, 401, 403, 404, 405, 413, 415), JSON response structures, and header requirements.
- **Resumable Chunked Ingestion**: Validates session initialization (`/upload/init`), chunk upload offset ordering (`/upload/chunk`), hash verification, pause/resume polling (`/upload/status`), and atomic assembly (`/upload/complete`).
- **Dynamic Watermark Engine**: Validates diagonal repeating watermark pattern (`FullName | UserID | Timestamp`), strict opacity bounding ($0.15 \le \text{opacity} \le 0.25$), canvas baking for previews, and permanent stream injection for downloads.

### 3.2 Category-Partition Method
Input domains are divided into mutually exclusive, collectively exhaustive equivalence classes:

| Domain | Partition Categories | Equivalence Classes |
|---|---|---|
| **Authentication Token** | Signature, Expiration, Role Claim, Header Format | Valid Bearer JWT; Expired JWT; Corrupted Signature; Missing Header; Unknown Role; Valid Roles (`admin`, `reviewer`, `uploader`, `viewer`) |
| **Dual-Axis RBAC Matrix** | Division, Level (L1-L5), Doc Classification, Action | Match Origin vs Cross-Division; L1 (Field), L2 (Associate), L3 (Senior), L4 (Head), L5 (Director); Classifications (`Publik`, `Internal`, `Rahasia`, `Sangat Rahasia`); Verbs (`view`, `download`) |
| **Chunked File Ingestion** | Size, Chunks, Offsets, Integrity | In-bounds (<User Quota); Out-of-bounds (>Quota, 413); Complete multi-chunk sequence; Incomplete chunks; Duplicate retry chunks; Hash mismatch; Zero-byte file |
| **File Binary Headers** | Magic Bytes, Extension | Matching header/ext (PDF `%PDF-`, PNG, JPEG, GIF, WebP, MP4, MP3, WAV, DOCX/XLSX/PPTX `PK\x03\x04`); Mismatched header (PE `MZ` disguised as PDF $\rightarrow$ 415) |
| **Filenames** | Traversal, Null Bytes, Reserved Names, Characters | Canonical (`report.pdf`); Path traversal (`../../etc/passwd`); Null byte (`test\0.pdf`); Reserved device (`CON`, `PRN`, `NUL`); Unicode (accented, Chinese, Arabic) |
| **Malicious Payloads** | Archive, Markup, Office Scripting | Benign OpenXML; Macro extensions (`.docm`, `.xlsm`); Embedded `vbaProject.bin`; Zip bomb ratio >100:1; SVG `<script>`, `onload=`, `javascript:` |
| **Watermark Configuration** | Opacity, Angle, Identity | Valid opacity ($0.15 \dots 0.25$); Out-of-range (<0.15, >0.25); Angle (-45 deg); Required FullName, UserID, Timestamp |

### 3.3 Boundary Value Analysis (BVA)
Tests probe boundaries, transition thresholds, and extreme limits:
- **AES Key Size**: 31 bytes (invalid), 32 bytes (valid), 33 bytes (invalid).
- **Coordinate Clipping**: $x = -0.001$ (clamped to 0.0), $x = W$ (clamped to $W$), $w = W + 50$ (clamped to $W - x$).
- **Vector Dimension**: 1535 (invalid), 1536 (valid), 1537 (invalid).
- **Quota Boundaries**: User quota remaining = 1,000 bytes; file of 1,000 bytes (accepted 201); file of 1,001 bytes (rejected 413).
- **Chunk Boundaries**: File size exactly 104,857,600 bytes (100MB) with 5MB chunks yields exactly 20 chunks.
- **Watermark Opacity**: Opacity 0.149 (rejected), 0.150 (valid lower bound), 0.200 (default), 0.250 (valid upper bound), 0.251 (rejected).
- **Filename Length**: Long filename at 250 characters safely sanitized without truncation failure.

### 3.4 Pairwise Combinatorial Testing
Validates orthogonal feature interactions across the matrix of Roles $\times$ Divisions $\times$ Levels $\times$ Classifications $\times$ Operations:

| Test Case ID | Role | Division | Level | Classification | Action Verb | Expected Outcome |
|---|---|---|---|---|---|---|
| **PAIR-01** | `admin` | `ALL` | `L5` | `Publik` | Upload / View / Download | 200/201 (Universal Access) |
| **PAIR-02** | `admin` | `ALL` | `L5` | `Sangat Rahasia` | View / Download | 200 OK (Universal Access + Stamped) |
| **PAIR-03** | `uploader` | `Legal` | `L2` | `Internal` | Upload Document | 201 Created |
| **PAIR-04** | `reviewer` | `Legal` | `L3` | `Internal` | Upload Document | 403 Forbidden (Reviewers do not upload) |
| **PAIR-05** | `viewer` | `Finance` | `L1` | `Internal` | Preview Document | 200 OK (Dynamic Watermarked View) |
| **PAIR-06** | `viewer` | `Finance` | `L1` | `Internal` | Download Document | 403 Forbidden (L1 has View-Only rights) |
| **PAIR-07** | `viewer` | `Finance` | `L2` | `Internal` | Download Document | 200 OK (Dynamic Watermarked File) |
| **PAIR-08** | `viewer` | `HR` | `L2` | `Rahasia` (Finance) | Preview / Download | 403 Forbidden (Cross-Division Block) |
| **PAIR-09** | `reviewer` | `Legal` | `L2` | `Rahasia` (Legal) | Preview Document | 200 OK (Same Division View Allowed) |
| **PAIR-10** | `reviewer` | `Legal` | `L2` | `Rahasia` (Legal) | Download Document | 403 Forbidden (L2 has View-Only rights) |
| **PAIR-11** | `reviewer` | `Legal` | `L3` | `Rahasia` (Legal) | Download Document | 200 OK (L3+ Download Allowed) |
| **PAIR-12** | `reviewer` | `Executive` | `L3` | `Sangat Rahasia` | Preview Document | 403 Forbidden (L1-L3 Denied) |
| **PAIR-13** | `reviewer` | `Executive` | `L4` | `Sangat Rahasia` | Preview Document | 200 OK (L4 View Allowed) |
| **PAIR-14** | `reviewer` | `Executive` | `L4` | `Sangat Rahasia` | Download Document | 403 Forbidden (L4 View-Only rights) |
| **PAIR-15** | `reviewer` | `Executive` | `L5` | `Sangat Rahasia` | Download Document | 200 OK (Director Download Allowed) |

### 3.5 Real-World Application Scenarios
Simulates complete multi-user, multi-department enterprise workflows:

#### Scenario 1: Multi-Department Enterprise Workflow & Access Governance
1. **HR Ingestion**: HR Uploader (Level L2) initiates and completes resumable chunked upload of `Kebijakan_Karyawan_2026.pdf` (Classification: `Internal`, Division: `HR`).
2. **Integrity Pass**: Magic bytes validated, Version 1 created, `DOCUMENT_UPLOAD` audit log recorded, notification dispatched.
3. **Cross-Division Preview**: Finance Viewer (Level L2) logs in and previews the Internal HR document. Internal documents allow cross-division viewing. Dynamic diagonal repeating watermark (`Rina Wijaya | usr-fin-viw | <timestamp>`) rendered at 20% opacity. `DOCUMENT_VIEW` audit log recorded.
4. **Cross-Division Download**: Finance Viewer downloads the file. Stamped permanent dynamic watermark embedded in binary stream. `DOCUMENT_DOWNLOAD` audit log recorded.
5. **Confidential Ingestion**: HR Uploader uploads `Evaluasi_Kompensasi_Direksi.pdf` (Classification: `Rahasia`, Division: `HR`).
6. **Cross-Division Rejection**: Finance Viewer attempts to preview or download the HR confidential document. Access strictly denied (HTTP 403 Forbidden).
7. **Authorized Executive Download**: HR Director (Level L5) logs in, reviews, and downloads the Rahasia document with permanent dynamic watermark stamped with HR Director's identity.
8. **Audit Inspection & Immutability**: System Admin reviews append-only audit logs, verifying complete lifecycle sequence with IP and user IDs. Attempt to delete audit logs is rejected with HTTP 405 Method Not Allowed.

#### Scenario 2: Regulatory Legal Audit, Deterministic Extraction & Version Provenance
1. **Contract Ingestion**: Legal Counsel (Level L4) uploads `Perjanjian_Kerjasama_Vendor_2026.pdf`.
2. **Deterministic Extraction**: Regex engine extracts contract numbers (`SPK/2026/VND-992`), dates (`06/11/2026`, `2026-11-06`), and Indonesian currency amounts (`Rp 1.850.000.000`) with zero LLM API invocation.
3. **Keyword Classification**: Deterministic classifier scores document as `Surat Perjanjian` with >0.80 confidence.
4. **Version Increment**: Amended agreement uploaded with identical filename in same folder $\rightarrow$ automatically increments to Version 2 while preserving Version 1.
5. **Accidental Deletion**: Soft-deletion moves document to trash bin (`is_deleted = true`). Document omitted from active listing.
6. **Disaster Recovery**: Compliance Officer inspects trash bin and restores document to active state.
7. **Version Restoration**: Historical Version 1 restored as active Version 3.
8. **Compliance Verification**: Complete non-destructive history verified in immutable audit trail.

---

## 4. 4-Tier Test Coverage Matrix (Traceability to Feature Inventory 1-42)

The 4-tier testing hierarchy completely covers all 42 features defined in `PROJECT.md` Feature Inventory:

| Feature # | Feature Name | Tier | Primary Test Suite Path | Verification Focus |
|---|---|:---:|---|---|
| **F-01** | Codebase Audit & Gap Analysis | Tier 1 | `tier1_features/test_feature_01_single_binary.test.js` | Directory layout, documentation contracts, architecture adherence |
| **F-02** | Canonical Style Guide Definition | Tier 1 | `tier1_features/test_feature_13_test_suite_runner.test.js` | Style guide existence, paper/mist/ink tokens, font contracts |
| **F-03** | Frontend Theme Alignment | Tier 1 | `tier1_features/test_feature_09_react_wasm_bridge.test.js` | React SPA tokens, typography, component styling contracts |
| **F-04** | Resumable Chunked Upload Engine | Tier 1 | `tier1_features/test_feature_15_chunked_upload.test.js` | Chunked upload >=100MB, session init, chunk offset tracking, assembly |
| **F-05** | Content-Based File Validation | Tier 1 | `tier1_features/test_feature_16_magic_bytes_validation.test.js` | Magic byte checks (PDF, Office, PNG, JPEG, GIF, WebP, MP4, MP3, WAV, text) |
| **F-06** | File & User Quota Enforcement | Tier 1 | `tier1_features/test_feature_17_quota_enforcement.test.js` | Per-user storage caps, pre-upload rejection (413 Payload Too Large) |
| **F-07** | Filename Sanitization | Tier 1 | `tier1_features/test_feature_18_filename_sanitization.test.js` | Path traversal, null bytes, Windows reserved device names, clean extensions |
| **F-08** | Malicious File Quarantine | Tier 1 | `tier1_features/test_feature_19_malicious_file_quarantine.test.js` | Zip bombs (>100:1 ratio), script-laden SVGs, Office macro files (`vbaProject.bin`) |
| **F-09** | Automatic Document Versioning | Tier 1 | `tier1_features/test_feature_20_document_versioning.test.js` | Auto v1 on upload, increment on re-upload with identical title |
| **F-10** | Version Inspection & Restore | Tier 1 | `tier1_features/test_feature_20_document_versioning.test.js` | Historical version listing, download historical version, restore older version |
| **F-11** | Folder Navigation & Hierarchy | Tier 1 | `tier1_features/test_feature_05_database_schema.test.js` | Hierarchical self-referential parent_id, breadcrumb calculation, tree traversal |
| **F-12** | Folder List & Grid Views | Tier 1 | `tier1_features/test_feature_09_react_wasm_bridge.test.js` | Toggleable list/grid UI contracts, column sorting, metadata cards |
| **F-13** | File Rename & Move Operations | Tier 1 | `tier1_features/test_feature_12_rest_api_handlers.test.js` | Document move across folders, rename uniqueness validation |
| **F-14** | Trash Lifecycle (Soft-Delete) | Tier 1 | `tier1_features/test_feature_21_trash_lifecycle.test.js` | Soft delete (`is_deleted=true`), active query exclusion, retention tracking |
| **F-15** | Trash Restore & Permanent Deletion | Tier 1 | `tier1_features/test_feature_21_trash_lifecycle.test.js` | One-click restore to active hierarchy, permanent purge restricted to Admin/L5 |
| **F-16** | PDF Preview Renderer | Tier 1 | `tier1_features/test_feature_03_rust_wasm_bounding_box.test.js` | Multi-page PDF coordinate projection, viewport clamping, scaling |
| **F-17** | Office Document Previewer | Tier 1 | `tier1_features/test_feature_16_magic_bytes_validation.test.js` | OpenXML DOCX, XLSX, PPTX structure validation and preview fallbacks |
| **F-18** | Image, Video & Audio Previewer | Tier 1 | `tier1_features/test_feature_16_magic_bytes_validation.test.js` | Media streaming magic bytes, container integrity (PNG/JPEG/WebP/MP4/MP3) |
| **F-19** | Plain Text & Code Previewer | Tier 1 | `tier1_features/test_feature_16_magic_bytes_validation.test.js` | UTF-8 text validation, line numbering, syntax formatting contracts |
| **F-20** | Non-Renderable Metadata Fallback | Tier 1 | `tier1_features/test_feature_12_rest_api_handlers.test.js` | SHA256 checksum, metadata card display, conditional download button |
| **F-21** | Deterministic Regex Data Extraction | Tier 1 | `tier1_features/test_feature_24_deterministic_engines.test.js` | Regex extraction of Indonesian dates, currencies (IDR), percentages, IDs |
| **F-22** | Keyword Document Classification | Tier 1 | `tier1_features/test_feature_24_deterministic_engines.test.js` | Deterministic dictionary scoring (Kontrak, Invoice, SK, SOP, Laporan) |
| **F-23** | Indexed Full-Text Search (FTS) | Tier 1 | `tier1_features/test_feature_05_database_schema.test.js` | PostgreSQL `tsvector` with Indonesian dictionary, GIN indexing |
| **F-24** | Semantic LLM Summarization | Tier 1 | `tier1_features/test_feature_08_vertex_ai_adapter.test.js` | Summarization adapter interface, token budgeting, zero retention |
| **F-25** | Semantic LLM Document Q&A | Tier 1 | `tier1_features/test_feature_08_vertex_ai_adapter.test.js` | Contextual Q&A grounded in document chunks with page references |
| **F-26** | LLM Mock / Deterministic Fallback | Tier 1 | `tier1_features/test_feature_08_vertex_ai_adapter.test.js` | Environment variable mock adapter for offline deterministic test execution |
| **F-27** | Prompt Injection Defense | Tier 1 | `tier1_features/test_feature_24_deterministic_engines.test.js` | Untrusted content delimiter encapsulation, system override neutralization |
| **F-28** | Division & Level RBAC Matrix | Tier 1 | `tier1_features/test_feature_23_division_level_rbac.test.js` | Dual-axis Division + Level (L1-L5) vs Document Classification matrix |
| **F-29** | Document Classification Levels | Tier 1 | `tier1_features/test_feature_23_division_level_rbac.test.js` | Publik, Internal, Rahasia, Sangat Rahasia division scoping |
| **F-30** | Granular Rights (View vs Download) | Tier 1 | `tier1_features/test_feature_23_division_level_rbac.test.js` | Granular separation of view permission from download permission |
| **F-31** | Dynamic Diagonal Repeating Watermark | Tier 1 | `tier1_features/test_feature_22_dynamic_watermarking.test.js` | Diagonal repeating grid, FullName, UserID, timestamp, 15-25% opacity |
| **F-32** | Universal Watermarking on View | Tier 1 | `tier1_features/test_feature_22_dynamic_watermarking.test.js` | Dynamic watermark enforced on all rendered previews across all formats |
| **F-33** | Permanent Watermarking on Download | Tier 1 | `tier1_features/test_feature_22_dynamic_watermarking.test.js` | Permanent dynamic watermark embedded into downloaded binary streams |
| **F-34** | Direct URL Access Protection | Tier 1 | `tier1_features/test_feature_22_dynamic_watermarking.test.js` | Non-bypassable authenticated streaming endpoints; unauthenticated returns 401 |
| **F-35** | Admin User & Division Management | Tier 1 | `tier1_features/test_feature_11_jwt_rbac.test.js` | Admin user account creation, division assignment, level configuration |
| **F-36** | Admin Access Policy & Watermark Config | Tier 1 | `tier1_features/test_feature_22_dynamic_watermarking.test.js` | Admin watermark configuration APIs with opacity bounds validation |
| **F-37** | Immutable Audit Logging Engine | Tier 1 | `tier1_features/test_feature_25_audit_logging_notifications.test.js` | Append-only audit logger capturing upload, view, download, restore, delete |
| **F-38** | Monitored Folder Notifications | Tier 1 | `tier1_features/test_feature_25_audit_logging_notifications.test.js` | In-app/API notifications triggered on monitored folder activities |
| **F-39** | Zero Dead Code & Linter Compliance | Tier 1 | `tier1_features/test_feature_13_test_suite_runner.test.js` | Static analysis pass with zero unused code or duplicated implementations |
| **F-40** | Performance Target Validation | Tier 1 | `tier1_features/test_feature_15_chunked_upload.test.js` | Validates p95 listing <200ms, stable 100MB chunked upload, preview <1.5s |
| **F-41** | OWASP ASVS & Top 10 Security | Tier 2 | `tier2_boundaries/test_tier2_advanced_boundaries.test.js` | Path traversal, null byte injection, SVG XSS, zip bombs, quota overflows |
| **F-42** | Architecture Docs & Final Report | Tier 1 | `tier1_features/test_feature_14_task_status_board.test.js` | Documentation integrity across ARCH, REQUIREMENTS, ADR, PROGRESS, final |

---

## 5. Test Runner Semantics & Execution Guide

The test orchestrator `tests/e2e/runner.js` uses native Node.js `node:test` and `node:test/reporters` to execute all suites sequentially with zero external NPM runtime dependencies.

### Command Semantics

```bash
# Execute full 4-tier test suite (31 suites, 174 assertions)
npm test

# Equivalent direct Node.js execution
node tests/e2e/runner.js

# Execute specific tier only:
node tests/e2e/runner.js --tier=1
node tests/e2e/runner.js --tier=2
node tests/e2e/runner.js --tier=3
node tests/e2e/runner.js --tier=4

# Execute individual test file:
node tests/e2e/tier1_features/test_feature_15_chunked_upload.test.js
node tests/e2e/tier1_features/test_feature_22_dynamic_watermarking.test.js
node tests/e2e/tier1_features/test_feature_23_division_level_rbac.test.js
node tests/e2e/tier4_scenarios/test_tier4_multi_department_workflow.test.js
```

### Exit Codes & Reporting
- Exit code `0`: All assertions passed cleanly across all discovered suites.
- Exit code `1`: One or more test assertions failed, reporting line numbers, diffs, and stack traces.
