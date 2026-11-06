# Stack & Technology Choices: Brilian DMS

Dokumen ini merinci seluruh komponen teknologi, *framework*, *library*, basis data, serta perangkat pendukung yang digunakan dalam pengembangan **Brilian**, beserta alasan pemilihan teknisnya.

## 1. Ringkasan Core Stack
* **Frontend UI Framework:** React 18 + TypeScript + Vite (Pure SPA)
* **Client-Side High-Performance Logic:** Rust (WebAssembly / `.wasm`)
* **Backend Core & Orchestrator:** Golang (Go) dengan `go:embed`
* **Relational & Vector Database:** PostgreSQL 16 + `pgvector` + `tsvector`
* **Object Storage:** MinIO (AES-256 Encrypted Storage)
* **AI Engine:** Google Vertex AI (Gemini 1.5 Flash/Pro) via *Enterprise Zero Data Retention API*
* **Container & Packaging:** Docker `FROM scratch` (Zero-OS Base Image)

## 2. Penjelasan & Alasan Pemilihan Stack (Rationale)

### A. Frontend: React + TypeScript + Vite + Rust (WebAssembly)
* **React 18 + Vite:** Dipilih karena menyediakan ekosistem UI yang sangat matang untuk membangun antarmuka DMS yang kompleks (tree view folder, preview interaktif, tabel manajemen dokumen) dengan kecepatan *bundling* instan berbasis Vite.
* **Rust (WebAssembly):** Digunakan untuk menangani modul komputasi berat di sisi *browser* (seperti *parsing* koordinat PDF, render *bounding box* OCR, dan dekripsi pratinjau dokumen lokal). Kode Rust dikompilasi ke `.wasm` sehingga tidak dapat dibaca atau di-*reverse-engineer* lewat *Inspect Element*.

### B. Backend: Golang (Go) dengan `go:embed`
* **Golang:** Dipilih karena menghasilkan kode *binary* native yang sangat cepat, memakan konsumsi RAM yang minim, serta memiliki pustaka bawaan yang kuat untuk pengelolaan konkuren (`goroutines`) saat memproses ribuan dokumen dan antrean OCR.
* **`go:embed`:** Memungkinkan seluruh aset Frontend (HTML, CSS, JS, dan `.wasm`) dikompilasi menyatu ke dalam **satu file executable tunggal** (`brilian-engine`). Tidak ada ketergantungan pada *runtime* eksternal seperti Node.js di server klien.

### C. Database: PostgreSQL 16 + `pgvector` + `tsvector`
* **PostgreSQL + `pgvector`:** Menyatukan data relasional bisnis (pengguna, hak akses folder, status *workflow*) dengan penyimpanan vektor embedding dokumen (*semantic search*) dalam satu mesin database tunggal. Menghilangkan kebutuhan untuk mengelola database vektor terpisah seperti Pinecone atau Milvus di server *On-Premise* klien.
* **`tsvector`:** Menyediakan pencarian teks lengkap (*Full-Text Search*) yang sangat cepat untuk nomor dokumen, judul, dan isi teks eksak.

### D. AI Engine: Enterprise Cloud API (Vertex AI)
* **Google Vertex AI (Gemini):** Dipilih untuk mendukung fitur *Multi-Document Comparison* dan tanya-jawab kontekstual karena memiliki *context window* yang sangat besar (jutaan token) dan kecepatan *response time* tinggi.
* **Kebijakan Keamanan:** Menggunakan perjanjian *Zero Data Retention* (data perusahaan klien tidak disimpan dan tidak digunakan untuk melatih model publik).