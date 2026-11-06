# Brilian – Intelligent Document Management System (AI-Powered DMS)

Brilian adalah sistem manajemen dokumen (*Document Management System*) cerdas kelas *enterprise* yang dirancang dengan arsitektur *Single-Binary On-Premise* terproteksi, dilengkapi dengan AI Agent terintegrasi untuk tanya-jawab kontekstual, ekstraksi layout dokumen, serta komparasi dokumen lintas versi secara instan.

## 1. Prasyarat Sistem (System Prerequisites)
Sebelum menjalankan atau mengembangkan aplikasi di lingkungan lokal, pastikan perangkat Anda telah terinstal:
* **Go (Golang):** Versi 1.22 atau lebih baru.
* **Node.js:** Versi 20.x LTS atau lebih baru (untuk *build* aset Frontend React/Vite).
* **Rust Toolchain:** Versi stabil terbaru dengan target `wasm32-unknown-unknown` (untuk kompilasi modul WebAssembly).
* **Docker & Docker Compose:** Untuk menjalankan layanan pendukung (PostgreSQL + pgvector dan MinIO).
* **Make:** (Opsional) Untuk mempermudah eksekusi skrip *build*.

## 2. Instalasi Dependensi
Clone repository ini ke komputer lokal Anda, lalu jalankan instalasi pada modul Frontend dan Backend:

```bash
# Clone repository
git clone https://github.com/company/brilian-dms.git
cd brilian-dms

# Instal dependensi Frontend & Build WebAssembly
cd frontend
npm install
# Kompilasi modul Rust ke WebAssembly (jika ada perubahan pada crate wasm)
npm run build:wasm
cd ..
```

## 3. Konfigurasi Variabel Lingkungan (.env)
Buat file `.env` di akar direktori proyek berdasarkan templat berikut:

```env
# Server Configuration
SERVER_PORT=8080
GIN_MODE=release

# Database Configuration (PostgreSQL + pgvector)
DB_HOST=localhost
DB_PORT=5432
DB_USER=brilian_user
DB_PASSWORD=secure_password_here
DB_NAME=brilian_db
DB_SSLMODE=disable

# Object Storage Configuration (MinIO)
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minio_admin
MINIO_SECRET_KEY=minio_secret_password
MINIO_BUCKET_NAME=brilian-documents
MINIO_USE_SSL=false

# AI Agent & Cloud API Configuration
AI_PROVIDER=vertex_ai
AI_API_KEY=your_enterprise_zero_data_retention_api_key
AI_MODEL_NAME=gemini-1.5-flash
AI_REGION=us-central1

# Security & Licensing
ENCRYPTION_KEY=32_byte_hex_encoded_secret_key_for_aes_256
LICENSE_FILE_PATH=./license.lic
```

## 4. Menjalankan Aplikasi di Lingkungan Lokal
Untuk menjalankan lingkungan pengembangan (*development mode*):

1. **Jalankan Layanan Database & Storage via Docker Compose:**
   ```bash
   docker compose up -d postgres minio
   ```
2. **Jalankan Backend Golang (Hot Reload):**
   ```bash
   go run cmd/server/main.go
   ```
3. **Jalankan Frontend Development Server (Vite):**
   ```bash
   cd frontend
   npm run dev
   ```
Akses aplikasi melalui browser di `http://localhost:5173`.