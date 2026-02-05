// utils/logger.js
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

export const backend = {
  log: msg => console.log(`${colors.cyan}[Backend] ${msg}${colors.reset}`),
  success: msg => console.log(`${colors.green}[Backend ✅] ${msg}${colors.reset}`),
  warn: (msg, data) => console.warn(`${colors.yellow}[Backend ⚠️] ${msg}${colors.reset}`, data ?? ''),
  error: (msg, err) => console.error(`${colors.red}[Backend ❌] ${msg}${colors.reset}`, err ?? ''),
};

