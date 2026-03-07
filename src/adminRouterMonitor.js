const {
  getAllConfiguredAdminRouters,
  updateAdminRouterState,
  updateAdminRouterCheckTime,
  addAdminRouterEvent,
  getAdminRouter,
} = require('./database/adminRouters');
const { safeSendMessage } = require('./utils/errorHandler');
const { formatExactDuration, formatTime } = require('./utils');

const ADMIN_ROUTER_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const ADMIN_ROUTER_PING_TIMEOUT_MS = 5000; // 5 seconds

let bot = null;
let monitoringInterval = null;

/**
 * Check router availability via TCP connection
 */
async function checkRouterAvailability(routerIp, routerPort = 80) {
  if (!routerIp) {
    return null;
  }

  // Parse IP and port
  let host = routerIp;
  let port = routerPort;

  // Check if port is included in the IP address
  const portMatch = routerIp.match(/^(.+):(\d+)$/);
  if (portMatch) {
    host = portMatch[1];
    port = parseInt(portMatch[2], 10);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ADMIN_ROUTER_PING_TIMEOUT_MS);

    await fetch(`http://${host}:${port}`, {
      signal: controller.signal,
      method: 'HEAD',
    });

    clearTimeout(timeout);
    return true; // Router is online
  } catch (_error) {
    return false; // Router is offline
  }
}

/**
 * Monitor a single admin's router
 */
async function monitorAdminRouter(adminRouter) {
  const { admin_telegram_id, router_ip, router_port, last_state, last_change_at, notifications_on } = adminRouter;

  try {
    // Ping the router
    const isOnline = await checkRouterAvailability(router_ip, router_port);
    const newState = isOnline ? 'online' : 'offline';

    // Update check time
    await updateAdminRouterCheckTime(admin_telegram_id);

    // Check if state changed
    if (last_state !== newState && last_state !== null) {
      // Calculate duration of previous state
      let durationMinutes = null;
      if (last_change_at) {
        const previousChangeTime = new Date(last_change_at);
        const now = new Date();
        durationMinutes = Math.floor((now - previousChangeTime) / (1000 * 60));
      }

      // Update state
      await updateAdminRouterState(admin_telegram_id, newState);

      // Add history event (record the state that just ended)
      await addAdminRouterEvent(admin_telegram_id, last_state, durationMinutes);

      // Send notification if enabled
      if (notifications_on && bot) {
        await sendStateChangeNotification(admin_telegram_id, newState, durationMinutes, router_ip);
      }
    } else if (last_state === null) {
      // First check - just set the state without notification
      await updateAdminRouterState(admin_telegram_id, newState);
    }
  } catch (error) {
    console.error(`Error monitoring admin router for ${admin_telegram_id}:`, error);
  }
}

/**
 * Send notification about state change
 */
async function sendStateChangeNotification(adminTelegramId, newState, durationMinutes, routerIp) {
  try {
    const now = new Date();
    const timeStr = formatTime(now);

    let message = '';

    if (newState === 'offline') {
      message = `🔴 Роутер офлайн! (${timeStr})\n📍 IP: ${routerIp}`;
    } else if (newState === 'online') {
      const durationStr = durationMinutes !== null ? formatExactDuration(durationMinutes * 60) : 'невідомо';
      message = `🟢 Роутер онлайн! (${timeStr})\n📍 IP: ${routerIp}\n⏱️ Був офлайн: ${durationStr}`;
    }

    if (message && bot) {
      await safeSendMessage(bot, adminTelegramId, message);
    }
  } catch (error) {
    console.error(`Error sending state change notification to ${adminTelegramId}:`, error);
  }
}

/**
 * Run monitoring check for all configured admin routers
 */
async function runMonitoringCheck() {
  try {
    const adminRouters = await getAllConfiguredAdminRouters();

    if (adminRouters.length === 0) {
      return;
    }

    console.log(`🔍 Checking ${adminRouters.length} admin router(s)...`);

    // Monitor each admin's router
    for (const adminRouter of adminRouters) {
      await monitorAdminRouter(adminRouter);
    }
  } catch (error) {
    console.error('Error in admin router monitoring check:', error);
  }
}

/**
 * Start admin router monitoring
 */
function startAdminRouterMonitoring(botInstance) {
  if (monitoringInterval) {
    console.log('⚠️ Admin router monitoring already running');
    return;
  }

  bot = botInstance;

  console.log('🚀 Starting admin router monitoring...');
  console.log(`⏱️ Check interval: ${ADMIN_ROUTER_CHECK_INTERVAL_MS / 1000 / 60} minutes`);

  // Run initial check after 30 seconds
  setTimeout(() => {
    runMonitoringCheck();
  }, 30000);

  // Set up recurring checks
  monitoringInterval = setInterval(() => {
    runMonitoringCheck();
  }, ADMIN_ROUTER_CHECK_INTERVAL_MS);

  console.log('✅ Admin router monitoring started');
}

/**
 * Stop admin router monitoring
 */
function stopAdminRouterMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log('🛑 Admin router monitoring stopped');
  }
}

/**
 * Force an immediate check for a specific admin
 */
async function forceCheckAdminRouter(adminTelegramId) {
  try {
    const adminRouter = await getAdminRouter(adminTelegramId);
    if (!adminRouter || !adminRouter.router_ip) {
      return null;
    }

    const isOnline = await checkRouterAvailability(adminRouter.router_ip, adminRouter.router_port);
    const newState = isOnline ? 'online' : 'offline';

    // Update check time and state if needed
    if (adminRouter.last_state !== newState && adminRouter.last_state !== null) {
      // State changed
      let durationMinutes = null;
      if (adminRouter.last_change_at) {
        const previousChangeTime = new Date(adminRouter.last_change_at);
        const now = new Date();
        durationMinutes = Math.floor((now - previousChangeTime) / (1000 * 60));
      }

      await updateAdminRouterState(adminTelegramId, newState);
      await addAdminRouterEvent(adminTelegramId, adminRouter.last_state, durationMinutes);
    } else {
      await updateAdminRouterCheckTime(adminTelegramId);
    }

    return newState;
  } catch (error) {
    console.error(`Error force checking admin router for ${adminTelegramId}:`, error);
    return null;
  }
}

module.exports = {
  startAdminRouterMonitoring,
  stopAdminRouterMonitoring,
  forceCheckAdminRouter,
};
