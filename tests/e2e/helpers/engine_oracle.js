/**
 * Deterministic Engine Oracle: Regex Extraction, Keyword Classification & Injection Defense
 * Implements R3 requirements strictly without LLM invocations.
 */

const DATE_REGEXES = [
  // Indonesian: DD/MM/YYYY or DD-MM-YYYY
  /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/g,
  // Indonesian Textual: 17 Agustus 1945
  /\b(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})\b/gi,
  // ISO: YYYY-MM-DD
  /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g
];

const CURRENCY_REGEX = /\b(?:Rp\.?|IDR)\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\b/gi;
const PERCENTAGE_REGEX = /\b(\d+(?:[.,]\d+)?)\s*%/g;
const IDENTIFIER_REGEX = /\b(?:No\.?|Nomor|INV|SPK|SK)[\s\:\/]*([A-Za-z0-9\-\.\/]+)\b/gi;

const CLASSIFICATION_DICTIONARY = {
  'Surat Perjanjian': ['SURAT PERJANJIAN', 'PERJANJIAN KERJASAMA', 'MEMORANDUM OF UNDERSTANDING', 'PIHAK PERTAMA', 'PIHAK KEDUA', 'PASAL', 'KLAUSUL'],
  'Invoice / Tagihan': ['INVOICE', 'FAKTUR PENJUALAN', 'TAGIHAN', 'TOTAL PEMBAYARAN', 'JATUH TEMPO', 'DUE DATE', 'REKENING'],
  'Surat Keputusan': ['SURAT KEPUTUSAN', 'MEMUTUSKAN', 'MENIMBANG', 'MENGINGAT', 'MENETAPKAN'],
  'SOP / Pedoman': ['STANDAR OPERASIONAL PROSEDUR', 'STANDARD OPERATING PROCEDURE', 'SOP', 'PROSEDUR KERJA', 'RUANG LINGKUP'],
  'Laporan Keuangan': ['LAPORAN KEUANGAN', 'NERACA', 'LABA RUGI', 'ARUS KAS', 'BALANCE SHEET', 'ASSET'],
  'Formulir HR': ['FORMULIR PENGAJUAN', 'CUTI TAHUNAN', 'SLIP GAJI', 'PAYSLIP', 'KARYAWAN']
};

/**
 * Extracts dates, currencies, percentages, and identifiers using deterministic regex.
 */
function extractMetadata(text) {
  if (!text || typeof text !== 'string') {
    return { dates: [], currencies: [], percentages: [], identifiers: [] };
  }

  const dates = new Set();
  for (const regex of DATE_REGEXES) {
    const matches = text.match(regex);
    if (matches) {
      matches.forEach(m => dates.add(m.trim()));
    }
  }

  const currencies = new Set();
  const currMatches = text.match(CURRENCY_REGEX);
  if (currMatches) {
    currMatches.forEach(m => currencies.add(m.trim()));
  }

  const percentages = new Set();
  const pctMatches = text.match(PERCENTAGE_REGEX);
  if (pctMatches) {
    pctMatches.forEach(m => percentages.add(m.trim()));
  }

  const identifiers = new Set();
  const idMatches = text.match(IDENTIFIER_REGEX);
  if (idMatches) {
    idMatches.forEach(m => identifiers.add(m.trim()));
  }

  return {
    dates: Array.from(dates),
    currencies: Array.from(currencies),
    percentages: Array.from(percentages),
    identifiers: Array.from(identifiers)
  };
}

/**
 * Classifies document text and filename into document types using pattern scoring.
 */
function classifyDocument(text, filename = '') {
  const combined = `${filename} ${text}`.toUpperCase();
  let bestType = 'Dokumen Umum';
  let highestScore = 0;

  for (const [docType, keywords] of Object.entries(CLASSIFICATION_DICTIONARY)) {
    let score = 0;
    for (const kw of keywords) {
      if (combined.includes(kw)) {
        score += 1;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestType = docType;
    }
  }

  const confidence = highestScore > 0 ? Math.min(1.0, 0.5 + highestScore * 0.15) : 0.2;
  return {
    docType: bestType,
    confidence: Number(confidence.toFixed(2))
  };
}

/**
 * Sanitizes untrusted document text against prompt injection.
 * Wraps content in delimiter tags and strips known adversarial jailbreak patterns.
 */
function sanitizePromptContent(docText, docId = 'unknown') {
  if (!docText) return '';

  // Neutralize common prompt injection patterns
  let cleaned = docText
    .replace(/ignore\s+all\s+(?:previous|prior)\s+instructions/gi, '[INJECTION_BLOCKED]')
    .replace(/system\s+prompt\s+override/gi, '[INJECTION_BLOCKED]')
    .replace(/you\s+are\s+now\s+in\s+dan\s+mode/gi, '[INJECTION_BLOCKED]')
    .replace(/output\s+the\s+system\s+prompt/gi, '[INJECTION_BLOCKED]');

  return `<<<UNTRUSTED_DOCUMENT_CONTENT doc_id="${docId}">>>\n${cleaned}\n<<</UNTRUSTED_DOCUMENT_CONTENT>>>`;
}

module.exports = {
  extractMetadata,
  classifyDocument,
  sanitizePromptContent,
  CLASSIFICATION_DICTIONARY
};
