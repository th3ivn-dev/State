#!/usr/bin/env node
require('dotenv').config();
const { createLogger } = require('../utils/logger');

const logger = createLogger('StandaloneWorker');

logger.info('Starting standalone notification worker...');
logger.info('NOTE: This worker requires a running bot instance for full functionality.');
logger.info('For production use, scale the main process or use the built-in worker.');
logger.info('This file serves as a template for future horizontal scaling.');

function shutdown() {
  logger.info('Shutting down standalone worker...');
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
