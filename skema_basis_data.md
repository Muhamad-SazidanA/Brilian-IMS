# Database Schema & ERD: Brilian DMS

Dokumen ini merinci struktur basis data PostgreSQL yang digunakan oleh Brilian, mencakup tabel relasional, indeks teks dan vektor, serta aturan relasi antar entitas.

## 1. Rancangan Entitas Utama (ERD Overview)
* **Users & Roles:** Mengatur identitas pengguna dan hak akses (*Role-Based Access Control*).
* **Folders & Documents:** Struktur hierarki penyimpanan folder dan metadata dokumen fisik.
* **Document Versions:** Riwayat revisi dokumen untuk mendukung fitur perbandingan (*compare*).
* **Workflows & Task Logs:** Catatan status persetujuan (*approval state*) dan riwayat aktivitas (*audit trail*).

## 2. Skema Tabel PostgreSQL (DDL)

```sql
-- Ekstensi yang Diperlukan
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Tabel Pengguna & Role
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer', -- admin, reviewer, uploader, viewer
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Struktur Folder
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Dokumen Utama
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    file_path VARCHAR(512) NOT NULL, -- Lokasi file terenkripsi di MinIO
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    current_version INT NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- draft, review, approved, archived
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Versi Dokumen (Untuk Auto-Compare & Riwayat)
CREATE TABLE document_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    file_path VARCHAR(512) NOT NULL,
    change_summary TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Hybrid Index & Vektor AI (pgvector)
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('indonesian', content)) STORED,
    embedding vector(1536) -- Dimensi embedding model AI
);

-- Indeks untuk Performa Pencarian Teks & Vektor
CREATE INDEX idx_document_chunks_search ON document_chunks USING gin(search_vector);
CREATE INDEX idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Tabel Workflow & Audit Trail
CREATE TABLE document_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES users(id),
    stage VARCHAR(50) NOT NULL, -- draft, supervisor_review, director_approval
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    notes TEXT,
    due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```