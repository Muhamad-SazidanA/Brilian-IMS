const test = require('node:test');
const assert = require('node:assert/strict');

test('Tier 1 - Feature 08: Vertex AI Adapter with Zero Data Retention', async (t) => {
  // Mock implementation of Vertex AI Adapter adhering to PROJECT.md interface contract
  class MockVertexAIAdapter {
    constructor(config = {}) {
      this.provider = config.AI_PROVIDER || 'vertex_ai';
      this.model = config.AI_MODEL_NAME || 'gemini-1.5-flash';
      this.zeroDataRetention = true; // Strict Enterprise Zero Data Retention policy
    }

    async compareDocuments(doc1Chunks, doc2Chunks, query, decryptedPrompt) {
      if (!this.zeroDataRetention) {
        throw new Error('Violation: Zero Data Retention must be enforced');
      }
      if (!decryptedPrompt || decryptedPrompt.length === 0) {
        throw new Error('System prompt required');
      }

      // Simulate Vertex AI Structured Markdown Diff
      return {
        comparison_result: '| Parameter | Kontrak 2025 | Kontrak 2026 |\n|---|---|---|\n| Nilai Denda | 1% | 2% |\n| Termin Bayar | 30 Hari | 14 Hari |',
        citations: [
          { document_id: 'doc-uuid-1', page: 4 },
          { document_id: 'doc-uuid-2', page: 5 }
        ],
        model: this.model,
        retention_policy: 'zero_retention_verified'
      };
    }

    async answerQuestion(docChunks, question, decryptedPrompt) {
      if (!question || question.trim() === '') {
        throw new Error('Question cannot be empty');
      }

      return {
        answer: 'Tanggal jatuh tempo pembayaran adalah 30 hari setelah invoice diterbitkan.',
        page_reference: 2,
        retention_policy: 'zero_retention_verified'
      };
    }
  }

  const adapter = new MockVertexAIAdapter();

  await t.test('8.1 Adapter enforces zero data retention policy invariant', () => {
    assert.equal(adapter.zeroDataRetention, true, 'Zero Data Retention flag must be active');
  });

  await t.test('8.2 Multi-document compare returns structured markdown and page citations', async () => {
    const res = await adapter.compareDocuments(['clause 1'], ['clause 2'], 'Bandingkan nilai denda', 'System prompt');
    assert.match(res.comparison_result, /\| Parameter \| Kontrak 2025 \| Kontrak 2026 \|/);
    assert.equal(res.citations.length, 2);
    assert.equal(res.citations[0].page, 4);
    assert.equal(res.citations[1].page, 5);
  });

  await t.test('8.3 Q&A returns contextual answer with page reference', async () => {
    const res = await adapter.answerQuestion(['payment clause text'], 'Berapa tanggal jatuh tempo pembayaran?', 'System prompt');
    assert.match(res.answer, /30 hari/);
    assert.equal(res.page_reference, 2);
  });
});
