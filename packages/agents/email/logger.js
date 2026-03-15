'use strict';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function createLogger(prefix = '') {
  const levelName = (process.env.LOG_LEVEL || 'info').toLowerCase();
  const currentLevel = LEVELS[levelName] ?? 1;

  function log(lvl, ...args) {
    if ((LEVELS[lvl] ?? 0) >= currentLevel) {
      const ts = new Date().toISOString();
      const pfx = prefix ? ` [${prefix}]` : '';
      console.log(`${ts} [${lvl.toUpperCase()}]${pfx}`, ...args);
    }
  }

  return {
    debug: (...args) => log('debug', ...args),
    info:  (...args) => log('info',  ...args),
    warn:  (...args) => log('warn',  ...args),
    error: (...args) => log('error', ...args),
    child: (childPrefix) =>
      createLogger(prefix ? `${prefix}:${childPrefix}` : childPrefix),
  };
}

module.exports = { createLogger };
