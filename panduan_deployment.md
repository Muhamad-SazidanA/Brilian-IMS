# Deployment & Operations Guide: Brilian DMS

Panduan operasional langkah demi langkah untuk merilis aplikasi ke lingkungan *Staging* atau *Production* dengan arsitektur *Single-Binary On-Premise*.

## 1. Proses Build & Packaging (Di Lingkungan Developer)
Pastikan seluruh kode telah teruji, lalu jalankan proses *build* menggunakan skrip atau Dockerfile produksi:

```bash
# Build multi-stage container image
docker build -t brilian-dms:v1.0.0 --target production .
```

## 2. Instalasi di Server On-Premise Klien
Di server klien (yang sudah terinstal Docker dan Docker Compose), lakukan langkah berikut:

1. Salin arsip *image* Docker dan file konfigurasi:
   ```bash
   docker load -i brilian-dms-v1.0.0.tar
   ```
2. Siapkan file `docker-compose.yml` di server klien:
   ```yaml
   version: '3.8'
   services:
     postgres:
       image: pgvector/pgvector:pg16
       environment:
         POSTGRES_DB: brilian_db
         POSTGRES_USER: brilian_user
         POSTGRES_PASSWORD: secure_password_here
       volumes:
         - pgdata:/var/lib/postgresql/data
     
     minio:
       image: minio/minio
       command: server /data --console-address ":9001"
       environment:
         MINIO_ROOT_USER: minio_admin
         MINIO_ROOT_PASSWORD: minio_secret_password
       volumes:
         - miniodata:/data

     brilian-engine:
       image: brilian-dms:v1.0.0
       ports:
         - "8080:8080"
       environment:
         - DB_HOST=postgres
         - MINIO_ENDPOINT=minio:9000
       volumes:
         - ./license.lic:/app/license.lic
       depends_on:
         - postgres
         - minio

   volumes:
     pgdata:
     miniodata:
   ```
3. Jalankan aplikasi:
   ```bash
   docker compose up -d
   ```