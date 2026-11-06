# Coding Standards & Conventions: Brilian DMS

Dokumen ini menetapkan aturan baku penulisan kode (*coding standards*), standar penamaan (*naming conventions*), penanganan error, serta pola manajemen status untuk menjaga konsistensi kode di seluruh tim pengembang.

## 1. Backend Standards (Golang)
* **Penamaan File & Variabel:** Menggunakan format `snake_case` untuk nama file (contoh: `document_handler.go`) dan `camelCase` untuk variabel lokal.
* **Penanganan Error (Error Handling):** Jangan pernah mengabaikan error (`_`). Setiap fungsi yang mengembalikan error wajib diperiksa secara eksplisit:
  ```go
  result, err := db.Query(...)
  if err != nil {
      return fmt.Errorf("gagal mengambil data dokumen: %w", err)
  }
  ```
* **Struktur Repository:** Pisahkan logika HTTP Handler dari logika basis data (*Repository Pattern*). Handler hanya bertugas membaca request HTTP dan mengembalikan respons JSON.

## 2. Frontend Standards (React + TypeScript)
* **Penamaan Komponen:** Menggunakan `PascalCase` untuk komponen React dan file JSX/TSX (contoh: `DocumentViewer.tsx`).
* **State Management:** Gunakan *React Context* atau *Zustand* untuk state global aplikasi, dan *React Query (TanStack Query)* untuk manajemen pengambilan data API (*server state*).
* **Keamanan Wasm:** Seluruh logika kritis yang bersentuhan dengan pemrosesan dokumen lokal wajib dienkapsulasi ke dalam fungsi Rust `.wasm`.

## 3. Git Commit Conventions
Gunakan format standar *Conventional Commits*:
* `feat: menambahkan fitur multi-document compare AI`
* `fix: memperbaiki error timeout saat proses layout-aware ocr`
* `refactor: mengoptimalkan query pgvector di repository dokumen`
* `sec: memperketat enkripsi system prompt di memory`