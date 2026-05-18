/**
 * securityScanner.js - OWASP Top 10 vulnerability detection
 *
 * Scans generated code for common security vulnerabilities.
 * Returns severity-graded findings with auto-fix suggestions.
 */

/**
 * @typedef {'critical'|'high'|'medium'|'low'|'info'} Severity
 * @typedef {{ id: string, severity: Severity, title: string, description: string, file: string, line: number, snippet: string, fix: string }} Finding
 */

// -----------------------------------------------------------------------
// Vulnerability patterns (regex-based static analysis)
// -----------------------------------------------------------------------
const VULNERABILITY_PATTERNS = [
  // CRITICAL: Hardcoded secrets
  {
    id: 'SEC-001',
    severity: 'critical',
    title: 'Hardcoded Secret Key',
    pattern: /(secret_key|SECRET_KEY|api_key|API_KEY|password|PASSWORD)\s*=\s*["'][^"']{8,}["']/gi,
    fix: 'Move secrets to environment variables. Use: process.env.SECRET_KEY or os.environ["SECRET_KEY"]',
  },
  {
    id: 'SEC-002',
    severity: 'critical',
    title: 'Hardcoded JWT Secret',
    pattern: /jwt\.encode\([^)]*["'][a-zA-Z0-9_\-]{10,}["']/g,
    fix: 'Use environment variable for JWT secret: jwt.encode(payload, os.environ["JWT_SECRET"])',
  },
  {
    id: 'SEC-003',
    severity: 'critical',
    title: 'Hardcoded Database Credentials',
    pattern: /(postgresql|mysql|mongodb):\/\/[a-zA-Z0-9_]+:[^@\s"']{4,}@/gi,
    fix: 'Use DATABASE_URL environment variable instead of hardcoded credentials',
  },

  // HIGH: Injection vulnerabilities
  {
    id: 'SEC-010',
    severity: 'high',
    title: 'SQL Injection Risk (String Concatenation)',
    pattern: /execute\s*\(\s*f["']|execute\s*\(\s*["'][^"']*\+|cursor\.execute\([^)]*%[^)]*\)/g,
    fix: 'Use parameterized queries: cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))',
  },
  {
    id: 'SEC-011',
    severity: 'high',
    title: 'SQL Injection Risk (Template Literals)',
    pattern: /query\s*=\s*`[^`]*\$\{[^}]*\}[^`]*`/g,
    fix: 'Use parameterized queries: db.query("SELECT * FROM users WHERE id = $1", [userId])',
  },
  {
    id: 'SEC-012',
    severity: 'high',
    title: 'Command Injection Risk',
    pattern: /(exec|execSync|spawn|system|os\.system|subprocess\.call)\s*\([^)]*\+/g,
    fix: 'Never concatenate user input into shell commands. Use subprocess with array args instead.',
  },
  {
    id: 'SEC-013',
    severity: 'high',
    title: 'Path Traversal Risk',
    pattern: /open\s*\([^)]*\+[^)]*\)|readFile\s*\([^)]*\+[^)]*\)/g,
    fix: 'Validate and sanitize file paths. Use path.resolve() and check against allowed directories.',
  },

  // HIGH: Authentication issues
  {
    id: 'SEC-020',
    severity: 'high',
    title: 'Missing Authentication on Sensitive Route',
    pattern: /@app\.(post|put|delete|patch)\s*\([^)]+\)\s*\nasync def (?!.*Depends\(get_current_user\))/gs,
    fix: 'Add authentication dependency: async def endpoint(current_user = Depends(get_current_user))',
  },
  {
    id: 'SEC-021',
    severity: 'high',
    title: 'Weak Password Hashing',
    pattern: /md5|sha1|sha256\s*\([^)]*password|hashlib\.md5|hashlib\.sha1/gi,
    fix: 'Use bcrypt or argon2: from passlib.context import CryptContext; pwd_context = CryptContext(schemes=["bcrypt"])',
  },

  // HIGH: XSS
  {
    id: 'SEC-030',
    severity: 'high',
    title: 'Potential XSS (dangerouslySetInnerHTML)',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{/g,
    fix: 'Avoid dangerouslySetInnerHTML. If necessary, sanitize with DOMPurify first.',
  },
  {
    id: 'SEC-031',
    severity: 'high',
    title: 'Unescaped Template Variable in HTML',
    pattern: /innerHTML\s*=\s*[^"'`]|innerHTML\s*\+=\s*[^"'`]/g,
    fix: 'Use textContent instead of innerHTML, or use DOMPurify.sanitize() before setting innerHTML.',
  },

  // MEDIUM: CORS issues
  {
    id: 'SEC-040',
    severity: 'medium',
    title: 'CORS Wildcard Origin',
    pattern: /allow_origins\s*=\s*\[\s*["']\*["']\s*\]|origins:\s*\[\s*["']\*["']\s*\]/g,
    fix: 'Restrict CORS origins to specific domains: allow_origins=["https://yourdomain.com"]',
  },

  // MEDIUM: JWT issues
  {
    id: 'SEC-050',
    severity: 'medium',
    title: 'JWT Algorithm None',
    pattern: /algorithm\s*=\s*["']none["']|algorithms\s*=\s*\[\s*["']none["']\s*\]/gi,
    fix: 'Never use "none" algorithm. Use HS256 or RS256: algorithm="HS256"',
  },
  {
    id: 'SEC-051',
    severity: 'medium',
    title: 'Missing JWT Expiration',
    pattern: /jwt\.encode\s*\(\s*\{(?![^}]*exp)[^}]*\}/g,
    fix: 'Always include expiration: {"sub": user_id, "exp": datetime.utcnow() + timedelta(hours=24)}',
  },

  // MEDIUM: Insecure patterns
  {
    id: 'SEC-060',
    severity: 'medium',
    title: 'eval() Usage',
    pattern: /\beval\s*\([^)]*\)/g,
    fix: 'Never use eval(). Parse JSON with JSON.parse() or use safe alternatives.',
  },
  {
    id: 'SEC-061',
    severity: 'medium',
    title: 'Insecure Random (Math.random)',
    pattern: /Math\.random\(\)/g,
    fix: 'For security tokens, use crypto.randomBytes(): import crypto from "crypto"; crypto.randomBytes(32).toString("hex")',
  },

  // LOW: Information disclosure
  {
    id: 'SEC-070',
    severity: 'low',
    title: 'Debug Mode in Production',
    pattern: /DEBUG\s*=\s*True|debug\s*=\s*true|debug:\s*true/gi,
    fix: 'Set DEBUG=False in production. Use environment variable: DEBUG = os.environ.get("DEBUG", "false") == "true"',
  },
  {
    id: 'SEC-071',
    severity: 'low',
    title: 'Stack Trace Exposure',
    pattern: /traceback\.print_exc\(\)|console\.error\(.*error\.stack/g,
    fix: 'Never expose stack traces to clients. Log internally, return generic error messages to users.',
  },
  {
    id: 'SEC-072',
    severity: 'low',
    title: 'Missing Rate Limiting',
    pattern: /@app\.(post|put)\s*\([^)]+login|@app\.(post|put)\s*\([^)]+register/gi,
    fix: 'Add rate limiting to auth endpoints: from slowapi import Limiter; @limiter.limit("5/minute")',
  },

  // INFO: Best practices
  {
    id: 'SEC-080',
    severity: 'info',
    title: 'TODO/FIXME Security Comment',
    pattern: /\/\/.*(TODO|FIXME).*(auth|security|secret|password|token)/gi,
    fix: 'Resolve all security-related TODOs before production deployment.',
  },
];

/**
 * Scan source code for vulnerabilities.
 * @param {string} code - Source code content
 * @param {string} filename - Filename for context
 * @returns {Finding[]}
 */
function scanCode(code, filename = 'unknown') {
  const findings = [];
  const lines = code.split('\n');

  for (const vuln of VULNERABILITY_PATTERNS) {
    const regex = new RegExp(vuln.pattern.source, vuln.pattern.flags);
    let match;

    while ((match = regex.exec(code)) !== null) {
      // Find line number
      const beforeMatch = code.slice(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      // Get snippet context (up to 100 chars)
      const snippet = match[0].slice(0, 100).replace(/\n/g, ' ');

      findings.push({
        id: `${vuln.id}-${findings.length}`,
        ruleId: vuln.id,
        severity: vuln.severity,
        title: vuln.title,
        description: vuln.title,
        file: filename,
        line: lineNum,
        snippet,
        fix: vuln.fix,
      });

      // Prevent infinite loops on zero-width matches
      if (match.index === regex.lastIndex) regex.lastIndex++;
    }
  }

  return findings;
}

/**
 * Scan multiple files.
 * @param {Object} files - { filename: content }
 * @returns {{ findings: Finding[], summary: Object, passed: boolean }}
 */
export function scanFiles(files) {
  const allFindings = [];

  for (const [filename, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    // Only scan relevant file types
    if (!filename.match(/\.(js|jsx|ts|tsx|py|go|java|rb|php|html|json)$/)) continue;
    const findings = scanCode(content, filename);
    allFindings.push(...findings);
  }

  const summary = {
    total: allFindings.length,
    critical: allFindings.filter((f) => f.severity === 'critical').length,
    high: allFindings.filter((f) => f.severity === 'high').length,
    medium: allFindings.filter((f) => f.severity === 'medium').length,
    low: allFindings.filter((f) => f.severity === 'low').length,
    info: allFindings.filter((f) => f.severity === 'info').length,
  };

  // Fail if any critical or high findings
  const passed = summary.critical === 0 && summary.high === 0;

  return { findings: allFindings, summary, passed };
}

/**
 * Scan a single code snippet.
 * @param {string} code
 * @param {string} [filename]
 * @returns {Finding[]}
 */
export function scanSnippet(code, filename = 'snippet') {
  return scanCode(code, filename);
}

/**
 * Generate a human-readable security report.
 * @param {{ findings: Finding[], summary: Object, passed: boolean }} result
 * @returns {string}
 */
export function formatReport(result) {
  const lines = [
    `## Security Scan Report`,
    `**Status**: ${result.passed ? 'PASSED' : 'FAILED'}`,
    `**Findings**: ${result.summary.total} total (${result.summary.critical} critical, ${result.summary.high} high, ${result.summary.medium} medium, ${result.summary.low} low)`,
    '',
  ];

  if (result.findings.length === 0) {
    lines.push('No vulnerabilities detected.');
    return lines.join('\n');
  }

  const grouped = {};
  for (const finding of result.findings) {
    if (!grouped[finding.severity]) grouped[finding.severity] = [];
    grouped[finding.severity].push(finding);
  }

  for (const severity of ['critical', 'high', 'medium', 'low', 'info']) {
    const group = grouped[severity];
    if (!group) continue;

    lines.push(`### ${severity.toUpperCase()} (${group.length})`);
    for (const f of group) {
      lines.push(`- **${f.title}** in \`${f.file}:${f.line}\``);
      lines.push(`  Snippet: \`${f.snippet}\``);
      lines.push(`  Fix: ${f.fix}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export const securityScanner = { scanFiles, scanSnippet, formatReport };
export default securityScanner;
