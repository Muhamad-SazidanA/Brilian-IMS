# Security Policy: Brilian DMS

Dokumen ini menjelaskan kebijakan keamanan, prosedur pelaporan kerentanan (*vulnerability*), serta penanganan data sensitif di dalam proyek Brilian.

## 1. Pelaporan Kerentanan Keamanan
Jika Anda menemukan kerentanan keamanan (celah eksploitasi, kebocoran data, atau masalah lisensi *On-Premise*), **jangan** mempublikasikannya secara terbuka di isu publik GitHub. Silakan kirimkan laporan langsung melalui email ke: `security@company.com`.

## 2. Penanganan Data Sensitif & IP Protection
* Seluruh *source code* dan *system prompt* AI dilindungi melalui kompilasi biner native Golang dan enkripsi memori RAM.
* Data klien dienkripsi menggunakan standar AES-256 baik saat disimpan (*at-rest*) maupun saat dikirimkan (*in-transit* melalui TLS 1.3).