/**
 * Dual-Axis RBAC Oracle: Division & Level (L1-L5) vs Document Classification
 * Evaluates view and download permissions according to PROJECT.md and spec_miner analysis.
 */

const VALID_DIVISIONS = ['Finance', 'HR', 'Legal', 'IT', 'Marketing', 'Operations', 'Executive', 'ALL'];
const VALID_LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];
const VALID_CLASSIFICATIONS = ['Publik', 'Internal', 'Rahasia', 'Sangat Rahasia'];

/**
 * Evaluates access permission for a given user against a document.
 * 
 * @param {Object} userClaims - { user_id, name, division, level, role }
 * @param {string} docClassification - 'Publik' | 'Internal' | 'Rahasia' | 'Sangat Rahasia'
 * @param {string} docDivision - Document's origin division (e.g. 'HR', 'Finance')
 * @param {'view'|'download'} action - Requested action verb
 * @returns {{ allowed: boolean, reason?: string }}
 */
function evaluateAccess(userClaims, docClassification, docDivision, action = 'view') {
  if (!userClaims || typeof userClaims !== 'object') {
    return { allowed: false, reason: 'Invalid or missing user claims' };
  }

  const { division, level, role } = userClaims;

  if (!VALID_CLASSIFICATIONS.includes(docClassification)) {
    return { allowed: false, reason: `Unknown document classification: ${docClassification}` };
  }

  if (action !== 'view' && action !== 'download') {
    return { allowed: false, reason: `Invalid action verb: ${action}` };
  }

  // Executive override: Admin role or Executive/ALL L5 has universal access
  if (role === 'admin' || division === 'ALL' || (division === 'Executive' && level === 'L5')) {
    return { allowed: true };
  }

  if (!VALID_DIVISIONS.includes(division)) {
    return { allowed: false, reason: `Invalid user division: ${division}` };
  }
  if (!VALID_LEVELS.includes(level)) {
    return { allowed: false, reason: `Invalid user level: ${level}` };
  }

  const levelNum = parseInt(level.replace('L', ''), 10);
  const isSameDivision = division === docDivision;

  // 1. Publik: Open to any division, L1-L5 for both view and download
  if (docClassification === 'Publik') {
    return { allowed: true };
  }

  // 2. Internal: Any division
  // L1: View allowed, Download denied
  // L2-L5: View allowed, Download allowed
  if (docClassification === 'Internal') {
    if (action === 'view') {
      return { allowed: true };
    }
    if (action === 'download') {
      if (levelNum >= 2) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'Level L1 has view-only rights for Internal documents' };
    }
  }

  // 3. Rahasia: Restricted to origin division
  if (docClassification === 'Rahasia') {
    if (!isSameDivision) {
      return { allowed: false, reason: `Access denied: Rahasia document restricted to ${docDivision} division` };
    }
    if (levelNum < 2) {
      return { allowed: false, reason: 'Level L1 has no access to Rahasia documents' };
    }
    if (action === 'view') {
      return { allowed: true }; // L2-L5 can view
    }
    if (action === 'download') {
      if (levelNum >= 3) {
        return { allowed: true }; // L3-L5 can download
      }
      return { allowed: false, reason: 'Level L2 has view-only rights for Rahasia documents' };
    }
  }

  // 4. Sangat Rahasia: Strictly confidential
  if (docClassification === 'Sangat Rahasia') {
    if (!isSameDivision) {
      return { allowed: false, reason: `Access denied: Sangat Rahasia document restricted to ${docDivision} division` };
    }
    if (levelNum < 4) {
      return { allowed: false, reason: 'Levels L1-L3 have no access to Sangat Rahasia documents' };
    }
    if (action === 'view') {
      return { allowed: true }; // L4-L5 can view
    }
    if (action === 'download') {
      if (levelNum >= 5) {
        return { allowed: true }; // L5 can download
      }
      return { allowed: false, reason: 'Level L4 has view-only rights for Sangat Rahasia documents' };
    }
  }

  return { allowed: false, reason: 'Access denied by security matrix policy' };
}

module.exports = {
  evaluateAccess,
  VALID_DIVISIONS,
  VALID_LEVELS,
  VALID_CLASSIFICATIONS
};
