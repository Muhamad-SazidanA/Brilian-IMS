# Brilian — Intelligent Document Management System (IDMS)

Brilian adalah sistem manajemen dokumen cerdas (*Enterprise Intelligent Document Management System*) berbasis AI yang dirancang untuk mengelola siklus hidup berkas secara aman, modular, dan berperforma tinggi.

---

## 🚀 Fitur Utama

1. **Intelligent DMS & File Lifecycle:**
   - Unggah berkas *chunked* & *resumable* untuk file besar ($\ge 100\text{ MB}$).
   - Validasi tipe file berbasis *magic bytes* (bukan hanya ekstensi), sanitasi nama berkas berbahaya, dan proteksi dari file mencurigakan (zip bomb, SVG script).
   - Penomoran versi otomatis (*auto-versioning*), riwayat versi, dan *trash recovery* (*soft-delete* & *restore*).
   - Penampil dokumen multi-format (PDF, Office, Gambar, Audio, Video, Teks) dengan fallback metadata.

2. **Deterministic Engine-First & AI Assistant:**
   - **Prinsip Engine Dulu, AI Kemudian:** Ekstraksi pola regex (tanggal, nominal, nomor dokumen), klasifikasi dokumen berbasis aturan (*rule-based*), dan pencarian teks penuh (*full-text search*) lokal dilakukan tanpa membebani LLM.
   - **AI Semantik:** Ringkasan dokumen dan fitur Tanya-Jawab (Q&A) berbasis LLM.
   - **Prompt Shield:** Proteksi isolasi terhadap serangan *prompt injection* dari berkas dokumen.

3. **RBAC Divisi & Level:**
   - Kontrol akses berbasis matriks: Divisi $\times$ Level (L1–L5) $\times$ Klasifikasi Dokumen.
   - Pemisahan hak akses *View* dan *View + Download*.

4. **Dynamic Watermarking:**
   - Watermark dinamis diagonal (berulang di seluruh halaman) memuat nama lengkap pengguna, ID user, dan timestamp.
   - Opacity samar (15–25%) namun jelas terbaca, anti-tamper, dan tidak dapat dilewati via URL langsung.

---

## 🛠️ Stack Teknologi

- **Backend:** Go 1.22 (`net/http.ServeMux`), Clean Architecture
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS (Design Token: Paper/Mist/Ink)
- **Basis Data:** PostgreSQL 16 dengan ekstensi `pgvector` & `tsvector`
- **Object Storage:** MinIO (S3-compatible)
- **Kontainerisasi:** Docker & Docker Compose

---

## 💻 Memulai (Quick Start)

### 1. Prasyarat
- [Docker Desktop](https://www.docker.com/) (aktif)
- Node.js & npm (opsional untuk pengembangan frontend)

### 2. Konfigurasi Lingkungan
Salin berkas konfigurasi template:
```bash
cp .env.example .env
```

### 3. Menjalankan Aplikasi

Jalankan container dependency (PostgreSQL & MinIO):
```powershell
.\dev.ps1 up
```

Jalankan server aplikasi Brilian DMS:
```powershell
.\dev.ps1 run
```

Buka peramban di: **`http://localhost:8080`**

---

## 📂 Struktur Direktori

```text
brilian-dms/
├── cmd/server/          # Entrypoint server Golang
├── internal/
│   ├── api/             # HTTP REST Handlers & Router
│   ├── config/          # Manajemen konfigurasi terpusat
│   ├── database/        # Migrasi skema SQL & pgvector
│   ├── dms/             # Core DMS & chunked upload engine
│   ├── engine/          # Deterministic search, classifier, & extractor
│   └── ai/              # Prompt shield & LLM adapter
├── frontend/            # Antarmuka web React + Vite + Tailwind CSS
├── docs/                # Dokumentasi arsitektur, audit, dan style guide
├── dev.ps1              # CLI helper otomasi pengembang
└── docker-compose.yml   # Konfigurasi layanan lokal
```

---

## 📜 Lisensi
Hak Cipta © 2026 PT Brilian Solusi Teknologi. Seluruh hak cipta dilindungi undang-undang.
