# API Documentation: Brilian DMS

Dokumen ini mencantumkan daftar *endpoint* utama layanan REST API pada Backend Golang Brilian, format *request/response* JSON, serta metode autentikasi.

## 1. Autentikasi
Seluruh *endpoint* (kecuali `/api/v1/auth/login`) memerlukan header `Authorization` dengan format **Bearer Token**:
```http
Authorization: Bearer <JWT_TOKEN>
```

---

## 2. Daftar Endpoint Utama

### A. Autentikasi
* **POST `/api/v1/auth/login`**
  * *Request Body:*
    ```json
    {
      "username": "admin_brilian",
      "password": "securepassword"
    }
    ```
  * *Response (200 OK):*
    ```json
    {
      "status": "success",
      "token": "eyJhbGciOiJIUzI1NiIsIn..."
    }
    ```

### B. Manajemen Dokumen
* **POST `/api/v1/documents/upload`** (Multipart Form-Data)
  * *Form Fields:* `title`, `folder_id`, `file`
  * *Response (201 Created):*
    ```json
    {
      "status": "success",
      "document_id": "uuid-string-here",
      "message": "Dokumen berhasil diunggah dan dijadwalkan untuk OCR indexing."
    }
    ```

### C. AI Agent & Multi-Document Comparison
* **POST `/api/v1/ai/compare`**
  * *Request Body:*
    ```json
    {
      "document_ids": ["uuid-doc-1", "uuid-doc-2"],
      "query": "Bandingkan perubahan nilai klausul denda pada kedua kontrak ini."
    }
    ```
  * *Response (200 OK):*
    ```json
    {
      "status": "success",
      "comparison_result": "| Parameter | Kontrak 2025 | Kontrak 2026 |\n|---|---|---|\n| Nilai Denda | 1% | 2% |",
      "citations": [
        {"document_id": "uuid-doc-1", "page": 4},
        {"document_id": "uuid-doc-2", "page: 5"}
      ]
    }
    ```

* **POST `/api/v1/ai/qa`**
  * *Request Body:*
    ```json
    {
      "document_id": "uuid-doc-1",
      "question": "Berapa tanggal jatuh tempo pembayaran?"
    }
    ```
  * *Response (200 OK):*
    ```json
    {
      "status": "success",
      "answer": "Tanggal jatuh tempo pembayaran adalah 30 hari setelah invoice diterbitkan.",
      "page_reference": 2
    }
    ```

### D. Workflow & Approval
* **PUT `/api/v1/workflows/{id}/action`**
  * *Request Body:*
    ```json
    {
      "action": "approve", // options: approve, reject, revise
      "notes": "Dokumen sudah sesuai dengan ketentuan hukum."
    }
    ```
  * *Response (200 OK):*
    ```json
    {
      "status": "success",
      "message": "Status workflow berhasil diperbarui."
    }
    ```