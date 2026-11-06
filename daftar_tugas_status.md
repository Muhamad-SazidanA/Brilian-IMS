# Task Board & TODO: Brilian DMS

Dokumen ini memuat daftar tugas yang belum selesai, fitur dalam pengembangan, catatan bug, serta rencana perbaikan jangka pendek.

## 🚀 Dalam Pengembangan (In Progress)
- [ ] Implementasi modul enkripsi AES-256 untuk *system prompt* AI Agent di Golang.
- [ ] Integrasi Rust WebAssembly (`.wasm`) untuk *highlighting* dokumen PDF di Frontend React.
- [ ] Pembuatan skrip otomatis Multi-Stage Dockerfile (`FROM scratch`).

## 📋 Perencanaan Berikutnya (Backlog)
- [ ] Penambahan fitur ekspor laporan audit trail ke format Excel/PDF.
- [ ] Optimalisasi indeks `ivfflat` di PostgreSQL `pgvector` untuk pencarian dokumen skala besar (>1 juta halaman).
- [ ] Integrasi *Webhook* notifikasi otomatis ke Telegram/WhatsApp untuk *SLA workflow* yang mendekati batas waktu.

## 🐛 Bug Tracker & Catatan Perbaikan
- [ ] Perbaikan *memory leak* kecil saat proses OCR dokumen PDF berukuran di atas 100 halaman.