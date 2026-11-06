-- Migration: 000001_init_schema.down.sql
-- Brilian IDMS - Intelligent Document Management System
-- Schema Rollback for PostgreSQL 16 + pgvector

-- 1. Drop Indexes
DROP INDEX IF EXISTS idx_document_workflows_assigned_to;
DROP INDEX IF EXISTS idx_document_workflows_document_id;
DROP INDEX IF EXISTS idx_document_chunks_document_id;
DROP INDEX IF EXISTS idx_document_versions_document_id;
DROP INDEX IF EXISTS idx_documents_uploaded_by;
DROP INDEX IF EXISTS idx_documents_folder_id;
DROP INDEX IF EXISTS idx_folders_parent_id;
DROP INDEX IF EXISTS idx_document_chunks_embedding;
DROP INDEX IF EXISTS idx_document_chunks_search;

-- 2. Drop Tables in reverse dependency order
DROP TABLE IF EXISTS document_workflows CASCADE;
DROP TABLE IF EXISTS document_chunks CASCADE;
DROP TABLE IF EXISTS document_versions CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS folders CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 3. Drop Extensions
DROP EXTENSION IF EXISTS "vector";
DROP EXTENSION IF EXISTS "uuid-ossp";
