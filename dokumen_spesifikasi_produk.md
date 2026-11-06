# Product Requirements Document (PRD): Brilian DMS

Dokumen spesifikasi produk ini merinci tujuan fitur, alur pengguna (*user flow*), serta batasan ruang lingkup pengembangan untuk **Brilian**.

## 1. Tujuan Produk (Product Goals)
Menyediakan sistem manajemen dokumen perusahaan yang aman untuk implementasi *On-Premise* (tanpa kebocoran kode sumber) yang dilengkapi asisten AI untuk mempercepat pencarian, analisis, dan komparasi dokumen lintas versi.

## 2. Fitur Utama & Alur Pengguna (User Flows)

### Fitur 1: Zero-Source-Code On-Premise Deployment
* **Tujuan:** Melindungi hak kekayaan intelektual perusahaan dari pembajakan saat diinstal di server klien.
* **Alur:** Klien menerima installer berbentuk Docker Image berbasisi `FROM scratch` berisi *binary* Golang tunggal. Klien tidak memiliki akses ke kode sumber mentah.

### Fitur 2: Dual-Layer Data & Document Encryption
* **Tujuan:** Menjaga kerahasiaan dokumen fisik di *storage* dan lalu lintas jaringan.
* **Alur:** Dokumen dienkripsi AES-256 saat disimpan ke MinIO, dan didekripsi secara aman di memori RAM server saat diakses oleh pengguna berwenang.

### Fitur 3: Layout-Aware OCR & Hybrid Search
* **Tujuan:** Membaca dokumen pindai dengan akurasi tata letak tabel/kolom yang tinggi.
* **Alur:** Dokumen PDF/scan di-parsing otomatis, diekstrak teksnya, lalu diindeks ke dalam PostgreSQL (`tsvector` & `pgvector`).

### Fitur 4: AI-Driven Document & Task Workflow
* **Tujuan:** Menggabungkan alur persetujuan dokumen dengan validasi otomatis oleh AI Agent.
* **Alur:** Dokumen masuk ke tahap *Review*, AI Agent melakukan *auto-diff/compare* dengan versi sebelumnya, memberikan ringkasan, lalu supervisor memberikan persetujuan akhir.