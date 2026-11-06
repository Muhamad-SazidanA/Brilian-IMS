import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const originalFiles = [
  'tier1_features/test_feature_01_single_binary.test.js',
  'tier1_features/test_feature_02_aes_prompt_encryptor.test.js',
  'tier1_features/test_feature_03_rust_wasm_bounding_box.test.js',
  'tier1_features/test_feature_04_dockerfile_scratch.test.js',
  'tier1_features/test_feature_05_database_schema.test.js',
  'tier1_features/test_feature_06_config_env.test.js',
  'tier1_features/test_feature_07_docker_compose.test.js',
  'tier1_features/test_feature_08_vertex_ai_adapter.test.js',
  'tier1_features/test_feature_09_react_wasm_bridge.test.js',
  'tier1_features/test_feature_10_license_validator.test.js',
  'tier1_features/test_feature_11_jwt_rbac.test.js',
  'tier1_features/test_feature_12_rest_api_handlers.test.js',
  'tier1_features/test_feature_13_test_suite_runner.test.js',
  'tier1_features/test_feature_14_task_status_board.test.js',
  'tier2_boundaries/test_boundaries_and_edges.test.js',
  'tier3_combinations/test_pairwise_combinations.test.js',
  'tier4_scenarios/test_real_world_scenarios.test.js'
].map(f => path.join(__dirname, 'e2e', f));

console.log(`Running original 17 test suites (${originalFiles.length} files)...`);
const s = run({ files: originalFiles, concurrency: false });
s.compose(new spec()).pipe(process.stdout);
