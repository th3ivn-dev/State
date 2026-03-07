const logger = require('./logger');

/**
 * Validate required environment variables at startup.
 * Fails fast with clear error messages if critical vars are missing.
 */
function validateEnv() {
  const required = [
    { name: 'BOT_TOKEN', description: 'Telegram Bot API token' },
    { name: 'DATABASE_URL', description: 'PostgreSQL connection string' },
  ];

  const optional = [
    { name: 'WEBHOOK_URL', description: 'Webhook URL for the bot' },
    { name: 'PORT', description: 'Server port', default: '3000' },
    { name: 'LOG_LEVEL', description: 'Logging level', default: 'info' },
    { name: 'ADMIN_IDS', description: 'Comma-separated admin Telegram IDs' },
  ];

  const missing = [];
  const warnings = [];

  // Check required vars
  for (const { name, description } of required) {
    if (!process.env[name] || process.env[name].trim() === '') {
      missing.push(`  ❌ ${name} — ${description}`);
    }
  }

  // Check optional vars (just warn)
  for (const { name, description, default: defaultVal } of optional) {
    if (!process.env[name]) {
      if (defaultVal) {
        warnings.push(`  ⚠️ ${name} — ${description} (using default: ${defaultVal})`);
      } else {
        warnings.push(`  ⚠️ ${name} — ${description} (not set)`);
      }
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    logger.warn('Optional environment variables not set:\n' + warnings.join('\n'));
  }

  // Fail on missing required vars
  if (missing.length > 0) {
    const errorMsg = 'Missing required environment variables:\n' + missing.join('\n');
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  logger.info('✅ Environment validation passed');
}

module.exports = { validateEnv };
