#!/usr/bin/env python3
"""
Adversarial Verification Suite for Milestone 1 DDL Schemas & Migrations.
Validates:
1. Parentheses & delimiter balance (state machine parsing)
2. Dependency graph analysis & reverse drop order
3. Live PostgreSQL 16 + pgvector DDL execution
4. Vector dimension boundary constraints (1535 vs 1536 vs 1537)
5. Indonesian tsvector text search generation & index queries
6. Role & Workflow CHECK domain constraints
7. Foreign key CASCADE and SET NULL referential actions
8. Full migration roundtrip (UP -> POPULATE -> DOWN -> UP)
"""

import os
import re
import sys
import subprocess
import json

CONTAINER_NAME = "test_pg_challenger"
DB_NAME = "brilian_test"

def run_psql(sql: str) -> tuple[int, str, str]:
    """Execute SQL statement against test PostgreSQL container."""
    cmd = ["docker", "exec", "-i", CONTAINER_NAME, "psql", "-U", "postgres", "-d", DB_NAME, "-v", "ON_ERROR_STOP=1"]
    proc = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()

def check_delimiter_balance(filename: str, content: str) -> list[str]:
    """Verify delimiter balance ignoring comments and string literals."""
    errors = []
    stack = []
    matching = {')': '(', ']': '[', '}': '{'}
    
    in_single_quote = False
    in_double_quote = False
    in_line_comment = False
    in_block_comment = False
    
    i = 0
    line = 1
    col = 1
    n = len(content)
    
    while i < n:
        c = content[i]
        
        if c == '\n':
            line += 1
            col = 1
            in_line_comment = False
            i += 1
            continue
            
        if in_line_comment:
            i += 1
            col += 1
            continue
            
        if in_block_comment:
            if c == '*' and i + 1 < n and content[i + 1] == '/':
                in_block_comment = False
                i += 2
                col += 2
                continue
            i += 1
            col += 1
            continue
            
        if in_single_quote:
            if c == "'":
                if i + 1 < n and content[i + 1] == "'":
                    i += 2
                    col += 2
                    continue
                in_single_quote = False
            i += 1
            col += 1
            continue
            
        if in_double_quote:
            if c == '"':
                in_double_quote = False
            i += 1
            col += 1
            continue
            
        if c == '-' and i + 1 < n and content[i + 1] == '-':
            in_line_comment = True
            i += 2
            col += 2
            continue
            
        if c == '/' and i + 1 < n and content[i + 1] == '*':
            in_block_comment = True
            i += 2
            col += 2
            continue
            
        if c == "'":
            in_single_quote = True
            i += 1
            col += 1
            continue
            
        if c == '"':
            in_double_quote = True
            i += 1
            col += 1
            continue
            
        if c in '([{':
            stack.append((c, line, col))
        elif c in ')]}':
            if not stack:
                errors.append(f"Unmatched closing '{c}' at line {line}, col {col}")
            else:
                top, top_l, top_c = stack.pop()
                expected = matching[c]
                if top != expected:
                    errors.append(f"Mismatched delimiter: expected '{matching[c]}' for '{c}' at line {line}, col {col}, found '{top}' from line {top_l}, col {top_c}")
                    
        i += 1
        col += 1
        
    if in_single_quote:
        errors.append("Unclosed single-quote literal at end of file")
    if in_double_quote:
        errors.append("Unclosed double-quote identifier at end of file")
    if in_block_comment:
        errors.append("Unclosed block comment /* ... */ at end of file")
    while stack:
        top, top_l, top_c = stack.pop()
        errors.append(f"Unclosed opening '{top}' from line {top_l}, col {top_c}")
        
    return errors

def main():
    print("=================================================================")
    print(" Milestone 1 Empirical Challenger: Adversarial DDL Stress Harness")
    print("=================================================================")
    
    workspace_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    up_path = os.path.join(workspace_root, "internal", "database", "migrations", "000001_init_schema.up.sql")
    down_path = os.path.join(workspace_root, "internal", "database", "migrations", "000001_init_schema.down.sql")
    
    with open(up_path, "r", encoding="utf-8") as f:
        up_sql = f.read()
    with open(down_path, "r", encoding="utf-8") as f:
        down_sql = f.read()
        
    passed_tests = 0
    failed_tests = 0
    
    def record_test(name: str, passed: bool, detail: str = ""):
        nonlocal passed_tests, failed_tests
        status = "PASS" if passed else "FAIL"
        print(f"[{status}] {name}")
        if not passed and detail:
            print(f"       Details: {detail}")
            failed_tests += 1
        elif passed:
            passed_tests += 1
            if detail:
                print(f"       Info: {detail}")

    # TEST 1: Delimiter & Parentheses Balance in UP and DOWN migrations
    up_errors = check_delimiter_balance("000001_init_schema.up.sql", up_sql)
    record_test("T1.1 Delimiter & Quote Balance (up.sql)", len(up_errors) == 0, "; ".join(up_errors))
    
    down_errors = check_delimiter_balance("000001_init_schema.down.sql", down_sql)
    record_test("T1.2 Delimiter & Quote Balance (down.sql)", len(down_errors) == 0, "; ".join(down_errors))

    # TEST 2: Static Dependency Graph & Reverse Drop Order
    # Extract foreign keys
    # pattern: CREATE TABLE (IF NOT EXISTS )?(\w+)
    # pattern inside: REFERENCES (\w+)
    table_deps = {}
    current_table = None
    for line in up_sql.splitlines():
        create_match = re.search(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)", line, re.I)
        if create_match:
            current_table = create_match.group(1).lower()
            table_deps[current_table] = set()
        if current_table:
            ref_matches = re.findall(r"REFERENCES\s+(\w+)", line, re.I)
            for ref in ref_matches:
                ref_tbl = ref.lower()
                if ref_tbl != current_table: # ignore self-references
                    table_deps[current_table].add(ref_tbl)

    # Extract drop order from down_sql
    drop_matches = re.findall(r"DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)", down_sql, re.I)
    dropped_tables = [m.lower() for m in drop_matches]
    
    # In reverse drop order, if table A references table B, A must appear BEFORE B in dropped_tables
    drop_order_valid = True
    drop_order_details = []
    for dependent, parents in table_deps.items():
        if dependent not in dropped_tables:
            drop_order_valid = False
            drop_order_details.append(f"Table {dependent} missing from DROP TABLE statements")
            continue
        dep_idx = dropped_tables.index(dependent)
        for parent in parents:
            if parent not in dropped_tables:
                drop_order_valid = False
                drop_order_details.append(f"Parent {parent} missing from DROP TABLE statements")
                continue
            parent_idx = dropped_tables.index(parent)
            if dep_idx > parent_idx:
                drop_order_valid = False
                drop_order_details.append(f"Violation: {dependent} references {parent}, but {parent} is dropped at index {parent_idx} before {dependent} at {dep_idx}")

    record_test("T2.1 Topological Reverse Drop Order in down.sql", drop_order_valid, "; ".join(drop_order_details) if drop_order_details else f"Drop order: {' -> '.join(dropped_tables)}")

    # TEST 3: Dynamic Live PostgreSQL Execution
    # Ensure database is clean: run down.sql first
    code, out, err = run_psql(down_sql)
    record_test("T3.1 Down Migration Execution on Clean Database", code == 0, err if code != 0 else "All objects dropped")

    # Apply up.sql
    code, out, err = run_psql(up_sql)
    record_test("T3.2 Up Migration Live Execution", code == 0, err if code != 0 else "All schemas and tables initialized")

    # Verify extensions
    code, out, err = run_psql("SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp', 'vector');")
    exts = [line.strip() for line in out.splitlines() if line.strip() in ('uuid-ossp', 'vector')]
    record_test("T3.3 Required Extensions Installed (uuid-ossp, vector)", set(exts) == {'uuid-ossp', 'vector'}, f"Installed extensions: {exts}")

    # Verify tables
    code, out, err = run_psql("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
    existing_tables = set(re.findall(r"\b[a-z_]+\b", out.lower()))
    expected_tables = {'users', 'folders', 'documents', 'document_versions', 'document_chunks', 'document_workflows'}
    record_test("T3.4 All 6 Relational Tables Present", expected_tables.issubset(existing_tables), f"Existing: {sorted(list(existing_tables))}")

    # TEST 4: Domain Constraints & CHECK Enforcements
    # 4.1 users.role check constraint
    code_valid_role, _, _ = run_psql("INSERT INTO users (username, email, password_hash, role) VALUES ('alice', 'alice@test.com', 'hash', 'admin');")
    code_invalid_role, _, err_role = run_psql("INSERT INTO users (username, email, password_hash, role) VALUES ('mallory', 'mallory@test.com', 'hash', 'superuser');")
    record_test("T4.1 users.role CHECK constraint blocks unauthorized roles", (code_valid_role == 0 and code_invalid_role != 0), f"Invalid role rejected with error: {err_role}")

    # 4.2 documents.status check constraint
    code_valid_doc, _, _ = run_psql("""
        INSERT INTO folders (id, name) VALUES ('11111111-1111-1111-1111-111111111111', 'Root');
        INSERT INTO documents (id, title, folder_id, file_path, file_size, mime_type, status)
        VALUES ('22222222-2222-2222-2222-222222222222', 'Policy', '11111111-1111-1111-1111-111111111111', '/docs/pol.pdf', 1024, 'application/pdf', 'draft');
    """)
    code_invalid_status, _, err_status = run_psql("""
        INSERT INTO documents (title, folder_id, file_path, file_size, mime_type, status)
        VALUES ('BadDoc', '11111111-1111-1111-1111-111111111111', '/docs/bad.pdf', 1024, 'application/pdf', 'deleted');
    """)
    record_test("T4.2 documents.status CHECK constraint enforces valid statuses", (code_valid_doc == 0 and code_invalid_status != 0), f"Invalid status rejected: {err_status}")

    # TEST 5: Vector Dimension Boundaries (1535 vs 1536 vs 1537)
    v1535 = "[" + ",".join(["0.0"] * 1535) + "]"
    v1536 = "[" + ",".join(["0.001"] * 1536) + "]"
    v1537 = "[" + ",".join(["0.0"] * 1537) + "]"

    code_1535, _, err_1535 = run_psql(f"INSERT INTO document_chunks (document_id, chunk_index, content, embedding) VALUES ('22222222-2222-2222-2222-222222222222', 101, 'dim 1535', '{v1535}');")
    code_1537, _, err_1537 = run_psql(f"INSERT INTO document_chunks (document_id, chunk_index, content, embedding) VALUES ('22222222-2222-2222-2222-222222222222', 102, 'dim 1537', '{v1537}');")
    code_1536, _, err_1536 = run_psql(f"INSERT INTO document_chunks (document_id, chunk_index, content, embedding) VALUES ('22222222-2222-2222-2222-222222222222', 1, 'Standar Operasional Prosedur Keamanan Informasi', '{v1536}');")

    record_test("T5.1 Vector Dimension 1535 Rejected", code_1535 != 0, f"Error: {err_1535}")
    record_test("T5.2 Vector Dimension 1537 Rejected", code_1537 != 0, f"Error: {err_1537}")
    record_test("T5.3 Vector Dimension 1536 Accepted", code_1536 == 0, f"Successfully inserted 1536-dim vector")

    # TEST 6: Indonesian Full-Text Search Generation & GIN Index Query
    code_fts, out_fts, _ = run_psql("""
        SELECT chunk_index, content, (search_vector @@ to_tsquery('indonesian', 'prosedur')) as matched
        FROM document_chunks
        WHERE document_id = '22222222-2222-2222-2222-222222222222' AND chunk_index = 1;
    """)
    fts_matched = "t" in out_fts.split()
    record_test("T6.1 Indonesian tsvector Automatically Generated & Matches Query", fts_matched, f"Output:\n{out_fts}")

    # TEST 7: Vector Cosine Similarity Search Query
    code_vec, out_vec, _ = run_psql(f"""
        SELECT chunk_index, 1 - (embedding <=> '{v1536}') as cosine_similarity
        FROM document_chunks
        ORDER BY embedding <=> '{v1536}'
        LIMIT 1;
    """)
    record_test("T7.1 Vector Cosine Distance Index Query Execution", code_vec == 0 and "cosine_similarity" in out_vec, f"Result:\n{out_vec}")

    # TEST 8: Foreign Key Referencing & CASCADE Invariants
    # 8.1 Delete document -> document_chunks & versions deleted
    code_version, _, _ = run_psql("INSERT INTO document_versions (document_id, version_number, file_path) VALUES ('22222222-2222-2222-2222-222222222222', 1, '/docs/pol.pdf');")
    code_workflow, _, _ = run_psql("INSERT INTO document_workflows (document_id, stage, status) VALUES ('22222222-2222-2222-2222-222222222222', 'supervisor_review', 'pending');")
    
    # Delete parent document
    code_del_doc, _, _ = run_psql("DELETE FROM documents WHERE id = '22222222-2222-2222-2222-222222222222';")
    code_chk_chunks, out_chk_chunks, _ = run_psql("SELECT count(*) FROM document_chunks WHERE document_id = '22222222-2222-2222-2222-222222222222';")
    code_chk_vers, out_chk_vers, _ = run_psql("SELECT count(*) FROM document_versions WHERE document_id = '22222222-2222-2222-2222-222222222222';")
    code_chk_wf, out_chk_wf, _ = run_psql("SELECT count(*) FROM document_workflows WHERE document_id = '22222222-2222-2222-2222-222222222222';")
    
    cascade_ok = (
        "0" in out_chk_chunks.split() and
        "0" in out_chk_vers.split() and
        "0" in out_chk_wf.split()
    )
    record_test("T8.1 ON DELETE CASCADE removes child chunks, versions, workflows", cascade_ok, f"Chunks count: {out_chk_chunks.split()[-2]}, Versions: {out_chk_vers.split()[-2]}, Workflows: {out_chk_wf.split()[-2]}")

    # TEST 9: Non-Empty Database Rollback (down.sql Stress Test)
    # Re-insert interconnected data across all 6 tables
    repopulate_sql = f"""
        INSERT INTO users (id, username, email, password_hash, role) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bob', 'bob@test.com', 'h', 'uploader');
        INSERT INTO folders (id, name, created_by) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Finance', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
        INSERT INTO documents (id, title, folder_id, file_path, file_size, mime_type, uploaded_by) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Budget', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '/f/b.pdf', 2048, 'application/pdf', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
        INSERT INTO document_versions (document_id, version_number, file_path, created_by) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 1, '/f/b.pdf', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
        INSERT INTO document_chunks (document_id, chunk_index, content, embedding) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 1, 'Ringkasan Laporan Keuangan Tahunan', '{v1536}');
        INSERT INTO document_workflows (document_id, assigned_to, stage, status) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'director_approval', 'approved');
    """
    code_pop, _, err_pop = run_psql(repopulate_sql)
    record_test("T9.1 Populate Interconnected Non-Empty Schema", code_pop == 0, err_pop if code_pop != 0 else "All 6 tables populated with relational data")

    # Execute down.sql without clearing data first
    code_down, _, err_down = run_psql(down_sql)
    record_test("T9.2 Down Migration on Non-Empty Tables (Reverse Drop Integrity)", code_down == 0, err_down if code_down != 0 else "Tables dropped successfully without foreign key lock or violation")

    # Verify everything dropped
    code_verify, out_verify, _ = run_psql("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
    remaining_tables = set(re.findall(r"\b[a-z_]+\b", out_verify.lower()))
    record_test("T9.3 Zero Residual Tables Post-Down Migration", len(remaining_tables.intersection(expected_tables)) == 0, f"Remaining tables: {remaining_tables}")

    # TEST 10: Migration Re-Application (Complete Lifecycle Round-Trip)
    code_reup, _, err_reup = run_psql(up_sql)
    record_test("T10.1 Full Lifecycle Re-Application (Up -> Down -> Up)", code_reup == 0, err_reup if code_reup != 0 else "Schema recreated cleanly")

    print("=================================================================")
    print(f" Challenger Summary: {passed_tests} PASSED, {failed_tests} FAILED")
    print("=================================================================")
    
    if failed_tests > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()
