# Architecture & Directory Structure: Brilian DMS

Dokumen ini menjelaskan struktur direktori folder proyek, pola desain (*design pattern*), alur data (*data flow*), serta skema komunikasi antar komponen di dalam sistem Brilian.

## 1. Struktur Direktori Proyek (Project Layout)

```text
brilian-dms/
├── cmd/
│   └── server/
│       └── main.go              # Titik masuk utama aplikasi (Entrypoint Golang)
├── internal/
│   ├── api/
│   │   ├── handler/             # HTTP Handlers (REST API endpoints)
│   │   ├── middleware/          # Auth, RBAC, dan Rate Limiter middleware
│   │   └── router.go            # Konfigurasi rute HTTP Gin/Fiber
│   ├── core/
│   │   ├── ai/                  # Integrasi LLM, RAG Pipeline, & Prompt Encryptor
│   │   ├── ocr/                 # Layout-Aware OCR & Text Chunking Engine
│   │   └── workflow/            # Engine alur kerja dokumen & SLA tracker
│   ├── database/
│   │   ├── migrations/          # Skema SQL & migrasi database PostgreSQL
│   │   └── repository/          # Akses data (SQL Queries & pgvector operations)
│   └── license/
│       └── validator.go         # Pengecekan Hardware ID & Lisensi On-Premise
├── frontend/
│   ├── src/
│   │   ├── components/          # Komponen UI React (DMS Tree, Chat AI, Compare View)
│   │   ├── wasm/                # Modul Rust yang dikompilasi ke WebAssembly
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── Dockerfile                   # Multi-stage build (Go + React -> Scratch)
├── docker-compose.yml           # Layanan lokal (PostgreSQL & MinIO)
└── README.md
```

## 2. Pola Desain (Design Patterns)
* **Clean Architecture / Layered Architecture:** Memisahkan lapisan presentasi (HTTP API), logika bisnis (*Core Services*), dan akses data (*Repositories*).
* **Adapter Pattern:** Digunakan pada modul AI untuk memungkinkan peralihan fleksibel antara integrasi Cloud API dan Local Inference Engine tanpa mengubah logika bisnis utama.
* **Embed Pattern:** Memadukan aset statis frontend ke dalam binary backend menggunakan direktif `go:embed`.

## 3. Alur Data (Data Flow)

### A. Alur Unggah & Indeks Dokumen (Document Ingestion & OCR)
1. Pengguna mengunggah file (PDF/Scan) melalui Frontend React.
2. Backend Golang menerima file, mengenversinya dengan **AES-256**, lalu menyimpannya ke **MinIO**.
3. Modul OCR mengekstrak teks dengan mempertahankan struktur tata letak (*Layout-Aware OCR*).
4. Teks dipecah menjadi beberapa *chunk*, lalu dikirim ke model embedding untuk menghasilkan vektor.
5. Indeks teks (`tsvector`) dan vektor (`pgvector`) disimpan ke **PostgreSQL**.

### B. Alur AI Agent Q&A & Multi-Document Compare
1. Pengguna memasukkan pertanyaan atau memilih 2 dokumen untuk dibandingkan di antarmuka React.
2. Backend mengambil *chunks* dokumen terkait dari PostgreSQL berdasarkan hak akses RBAC pengguna.
3. Backend merakit prompt terenkripsi, mendekripsinya di RAM, lalu mengirimkan *payload* terenkripsi via **TLS 1.3** ke **Enterprise Cloud AI API**.
4. Hasil analisis AI dikembalikan ke backend, diformat, dan ditampilkan secara *real-time* ke antarmuka pengguna.