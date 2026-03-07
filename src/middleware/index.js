const { maintenanceMiddleware } = require('./maintenance');
const { autoDeleteCommandsMiddleware } = require('./autoDeleteCommands');

module.exports = { maintenanceMiddleware, autoDeleteCommandsMiddleware };
