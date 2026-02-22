const config = require('./config');
const usersDb = require('./database/users');
const { addOutageRecord } = require('./statistics');
const { formatExactDuration, formatTime, formatInterval } = require('./utils');
const { formatTemplate } = require('./formatter');
const { pool, getSetting } = require('./database/db');
const { 
  POWER_MAX_CONCURRENT_PINGS, 
  POWER_PING_TIMEOUT_MS 
} = require('./constants/timeouts');
const logger = require('./utils/logger').createLogger('PowerMonitor');
const { isTelegramUserInactiveError } = require('./utils/errorHandler');

// Get monitoring manager
let metricsCollector = null;
try {
  metricsCollector = require('./monitoring/metricsCollector');
} catch (e) {
  // Monitoring not available yet, will work without it
}

let bot = null;
let monitoringInterval = null;
let periodicSaveInterval = null; // Інтервал для періодичного збереження станів
const userStates = new Map(); // Зберігання стану для кожного користувача

// Константи для захисту від спаму сповіщень
const NOTIFICATION_COOLDOWN_MS = 60 * 1000; // 60 секунд - мінімальний інтервал між сповіщеннями
const MIN_STABILIZATION_MS = 30 * 1000; // 30 секунд - мінімальна затримка для захисту від флаппінгу

// Нормалізація timestamp з PostgreSQL до UTC ISO string (усуває зміщення часового поясу)
function normalizeTimestamp(value) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch (e) {
    return null;
  }
}

// Структура стану користувача:
// {
//   currentState: 'on' | 'off' | null,
//   lastChangeAt: timestamp,
//   consecutiveChecks: number,
//   isFirstCheck: boolean,
//   // Нові поля для debounce:
//   pendingState: 'on' | 'off' | null, // Стан, який очікує підтвердження
//   pendingStateTime: timestamp, // Час початку очікування нового стану
//   debounceTimer: timeout, // Таймер для debounce
//   instabilityStart: timestamp, // Час початку нестабільності
//   switchCount: number, // Кількість перемикань під час нестабільності
//   lastStableState: 'on' | 'off' | null, // Останній стабільний стан
//   lastStableAt: timestamp, // Час останнього стабільного стану
// }

// Перевірка доступності роутера за IP
async function checkRouterAvailability(routerAddress = null) {
  const addressToCheck = routerAddress || config.ROUTER_HOST;
  
  if (!addressToCheck) {
    return null; // Моніторинг вимкнено
  }
  
  // Розділяємо на хост і порт
  let host = addressToCheck;
  let port = config.ROUTER_PORT || 80;
  
  // Перевіряємо чи є порт в адресі
  const portMatch = addressToCheck.match(/^(.+):(\d+)$/);
  if (portMatch) {
    host = portMatch[1];
    port = parseInt(portMatch[2], 10);
  }
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), POWER_PING_TIMEOUT_MS);
    
    const response = await fetch(`http://${host}:${port}`, {
      signal: controller.signal,
      method: 'HEAD'
    });
    
    clearTimeout(timeout);
    return true; // Роутер доступний = світло є
  } catch (error) {
    return false; // Роутер недоступний = світла нема
  }
}

// Отримати або створити стан користувача
function getUserState(userId) {
  if (!userStates.has(userId)) {
    userStates.set(userId, {
      currentState: null,
      lastChangeAt: null,
      consecutiveChecks: 0,
      isFirstCheck: true,
      pendingState: null,
      pendingStateTime: null,
      debounceTimer: null,
      instabilityStart: null,
      switchCount: 0,
      lastStableState: null,
      lastStableAt: null,
      lastPingTime: null, // Track last ping time
      lastPingSuccess: null, // Track if last ping was successful
      lastNotificationAt: null, // Track last notification time for cooldown
    });
  }
  return userStates.get(userId);
}

// Отримати наступний заплановану подію з графіка
async function getNextScheduledTime(user) {
  try {
    const { fetchScheduleData } = require('./api');
    const { parseScheduleForQueue, findNextEvent } = require('./parser');
    
    const data = await fetchScheduleData(user.region);
    const scheduleData = parseScheduleForQueue(data, user.queue);
    const nextEvent = findNextEvent(scheduleData);
    
    return nextEvent;
  } catch (error) {
    console.error('Error getting next scheduled time:', error);
    return null;
  }
}

// Обробка зміни стану живлення
async function handlePowerStateChange(user, newState, oldState, userState, originalChangeTime = null) {
  try {
    const now = new Date();
    
    // Track IP monitoring event
    if (metricsCollector) {
      if (oldState === 'off' && newState === 'on') {
        metricsCollector.trackIPEvent('offlineToOnline');
      }
    }
    
    // Check minimum cooldown to prevent notification spam
    let shouldNotify = true;
    
    if (userState.lastNotificationAt) {
      const timeSinceLastNotification = now - new Date(userState.lastNotificationAt);
      if (timeSinceLastNotification < NOTIFICATION_COOLDOWN_MS) {
        shouldNotify = false;
        const remainingSeconds = Math.ceil((NOTIFICATION_COOLDOWN_MS - timeSinceLastNotification) / 1000);
        console.log(`User ${user.id}: Пропуск сповіщення через cooldown (залишилось ${remainingSeconds}с)`);
      }
    }
    
    // Атомарно оновлюємо стан і отримуємо тривалість — все в одному SQL запиті
    const powerResult = await usersDb.changePowerStateAndGetDuration(user.telegram_id, newState);
    
    const changedAt = powerResult ? powerResult.power_changed_at : new Date().toISOString();
    const changeTime = new Date(changedAt);
    
    // Якщо є попередній стан, обчислюємо тривалість
    let durationText = '';
    
    if (powerResult && powerResult.duration_minutes !== null) {
      const totalDurationMinutes = Math.floor(powerResult.duration_minutes);
      logger.debug(`User ${user.id}: Duration calc from PostgreSQL: ${totalDurationMinutes}min`);
      
      // Захист від некоректних даних: якщо тривалість від'ємна або дуже мала
      if (totalDurationMinutes < 1) {
        durationText = 'менше хвилини';
      } else {
        durationText = formatExactDuration(totalDurationMinutes);
      }
    }
    
    // Отримуємо графік для визначення чи це запланований період
    const nextEvent = await getNextScheduledTime(user);
    const { fetchScheduleData } = require('./api');
    const { parseScheduleForQueue, isCurrentlyOff } = require('./parser');
    
    let isScheduledOutage = false;
    try {
      const data = await fetchScheduleData(user.region);
      const scheduleData = parseScheduleForQueue(data, user.queue);
      isScheduledOutage = isCurrentlyOff(scheduleData);
    } catch (error) {
      console.error('Error checking schedule:', error);
    }
    
    let scheduleText = '';
    
    if (newState === 'off') {
      // Світло зникло
      // Показуємо "Світло має з'явитися" тільки якщо це запланований період
      if (isScheduledOutage && nextEvent) {
        const eventTime = formatTime(nextEvent.time);
        if (nextEvent.type === 'power_on') {
          scheduleText = `\n🗓 Світло має з'явитися: <b>${eventTime}</b>`;
        } else if (nextEvent.endTime) {
          const endTime = formatTime(nextEvent.endTime);
          scheduleText = `\n🗓 Світло має з'явитися: <b>${endTime}</b>`;
        }
      } else {
        // Позапланове відключення
        scheduleText = '\n⚠️ Позапланове відключення';
      }
    } else {
      // Світло з'явилося - показуємо наступне відключення
      if (nextEvent && nextEvent.type === 'power_off') {
        if (nextEvent.endTime) {
          const eventTime = formatTime(nextEvent.time);
          const endTime = formatTime(nextEvent.endTime);
          scheduleText = `\n🗓 Наступне планове: <b>${eventTime} - ${endTime}</b>`;
        } else {
          const eventTime = formatTime(nextEvent.time);
          scheduleText = `\n🗓 Наступне планове: <b>${eventTime}</b>`;
        }
      }
    }
    
    // Формуємо повідомлення в простому форматі згідно вимог
    let message = '';
    const kyivTime = new Date(changeTime.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
    const timeStr = `${String(kyivTime.getHours()).padStart(2, '0')}:${String(kyivTime.getMinutes()).padStart(2, '0')}`;
    const dateStr = `${String(kyivTime.getDate()).padStart(2, '0')}.${String(kyivTime.getMonth() + 1).padStart(2, '0')}.${kyivTime.getFullYear()}`;
    
    if (newState === 'off') {
      // Світло зникло - use custom template if available
      if (user.power_off_text) {
        message = formatTemplate(user.power_off_text, {
          time: timeStr,
          date: dateStr,
          duration: durationText || ''
        });
      } else {
        // Default message - NEW FORMAT
        message = `🔴 <b>${timeStr} Світло зникло</b>\n`;
        message += `🕓 Воно було ${durationText || '—'}`;
        message += scheduleText; // Додаємо інфо про наступне включення
      }
      
      // Якщо є попередній стан 'on', зберігаємо запис про відключення
      if (oldState === 'on' && userState.lastStableAt) {
        await addOutageRecord(user.id, userState.lastStableAt, changedAt);
      }
    } else {
      // Світло з'явилося - use custom template if available
      if (user.power_on_text) {
        message = formatTemplate(user.power_on_text, {
          time: timeStr,
          date: dateStr,
          duration: durationText || ''
        });
      } else {
        // Default message - NEW FORMAT
        message = `🟢 <b>${timeStr} Світло з'явилося</b>\n`;
        message += `🕓 Його не було ${durationText || '—'}`;
        message += scheduleText; // Додаємо інфо про наступне відключення
      }
    }
    
    // Отримуємо налаштування куди публікувати
    const notifyTarget = user.power_notify_target || 'both';
    
    // Send notifications only if cooldown elapsed
    if (shouldNotify) {
      // Відправляємо в особистий чат користувача
      if (notifyTarget === 'bot' || notifyTarget === 'both') {
        try {
          await bot.api.sendMessage(user.telegram_id, message, { parse_mode: 'HTML' });
          console.log(`📱 Повідомлення про зміну стану відправлено користувачу ${user.telegram_id}`);
        } catch (error) {
          if (isTelegramUserInactiveError(error)) {
            console.log(`ℹ️ Користувач ${user.telegram_id} заблокував бота або недоступний — сповіщення вимкнено`);
            await usersDb.setUserActive(user.telegram_id, false);
          } else {
            console.error(`Помилка відправки повідомлення користувачу ${user.telegram_id}:`, error.message);
          }
          // Track error
          if (metricsCollector) {
            metricsCollector.trackError(error, { 
              context: 'power_notification', 
              userId: user.telegram_id 
            });
          }
        }
      }
      
      // Відправляємо в канал користувача, якщо він налаштований і відрізняється від особистого чату
      if (user.channel_id && user.channel_id !== user.telegram_id && (notifyTarget === 'channel' || notifyTarget === 'both')) {
        // Check if channel is paused
        if (user.channel_paused) {
          console.log(`Канал користувача ${user.telegram_id} зупинено, пропускаємо публікацію в канал`);
        } else {
          try {
            await bot.api.sendMessage(user.channel_id, message, { parse_mode: 'HTML' });
            console.log(`📢 Повідомлення про зміну стану відправлено в канал ${user.channel_id}`);
          } catch (error) {
            if (isTelegramUserInactiveError(error)) {
              console.log(`ℹ️ Канал ${user.channel_id} недоступний — публікацію пропущено`);
            } else {
              console.error(`Помилка відправки повідомлення в канал ${user.channel_id}:`, error.message);
            }
            // Track channel error
            if (metricsCollector) {
              metricsCollector.trackChannelEvent('publishErrors');
              metricsCollector.trackError(error, { 
                context: 'channel_power_notification', 
                channelId: user.channel_id 
              });
            }
          }
        }
      }
      
      // Update lastNotificationAt after successful notification
      userState.lastNotificationAt = now.toISOString();
    }
    
    // Оновлюємо стан користувача
    userState.lastStableAt = changedAt;
    userState.lastStableState = newState;
    
    // Скидаємо лічильники нестабільності
    userState.instabilityStart = null;
    userState.switchCount = 0;
    
  } catch (error) {
    console.error('Error handling power state change:', error);
  }
}

// Перевірка стану живлення для одного користувача
async function checkUserPower(user) {
  try {
    const isAvailable = await checkRouterAvailability(user.router_ip);
    
    // Get or create user state before processing availability result
    // This ensures we have a state object to update with ping information
    const userState = getUserState(user.telegram_id);
    
    // Update last ping time
    userState.lastPingTime = new Date().toISOString();
    userState.lastPingSuccess = isAvailable !== null;
    
    if (isAvailable === null) {
      return; // Не вдалося перевірити
    }
    
    const newState = isAvailable ? 'on' : 'off';
    
    // Перша перевірка - читаємо останній стан з БД
    if (userState.isFirstCheck) {
      // Читаємо з БД останній збережений стан
      if (user.power_state && user.power_changed_at) {
        userState.currentState = user.power_state;
        userState.lastStableState = user.power_state;
        // Зберігаємо power_changed_at як lastStableAt тільки якщо він ще не був встановлений
        // (може бути вже встановлений через restoreUserStates)
        if (!userState.lastStableAt) {
          userState.lastStableAt = new Date(user.power_changed_at).toISOString();
        }
        userState.isFirstCheck = false;
        console.log(`User ${user.id}: Відновлено стан з БД: ${user.power_state} з ${user.power_changed_at}`);
      } else {
        // Немає збереженого стану - встановлюємо поточний без lastStableAt
        // (lastStableAt буде встановлено при першій зміні стану)
        userState.currentState = newState;
        userState.lastStableState = newState;
        userState.lastStableAt = null; // Не встановлюємо, бо немає попереднього стану
        userState.isFirstCheck = false;
        userState.consecutiveChecks = 0;
        
        // Оновлюємо БД з поточним часом як початковим станом
        await usersDb.updateUserPowerState(user.telegram_id, newState);
      }
      return;
    }
    
    // Якщо стан такий же як поточний стабільний - скидаємо все
    if (userState.currentState === newState) {
      userState.consecutiveChecks = 0;
      
      // Якщо був pending стан, скасовуємо його
      if (userState.pendingState !== null && userState.pendingState !== newState) {
        console.log(`User ${user.id}: Скасування pending стану ${userState.pendingState} -> повернення до ${newState}`);
        
        // Скасовуємо таймер
        if (userState.debounceTimer) {
          clearTimeout(userState.debounceTimer);
          userState.debounceTimer = null;
        }
        
        // Рахуємо як ще одне перемикання
        userState.switchCount++;
        
        userState.pendingState = null;
        userState.pendingStateTime = null;
        await usersDb.clearPendingPowerChange(user.telegram_id);
      }
      
      return;
    }
    
    // Стан відрізняється від поточного
    // Перевіряємо чи це той самий pending стан що вже очікує
    if (userState.pendingState === newState) {
      // Продовжуємо очікувати - нічого не робимо
      return;
    }
    
    // Новий стан відрізняється і від поточного, і від pending (якщо він є)
    // Це означає зміну стану
    
    // Скасовуємо попередній таймер, якщо він є
    if (userState.debounceTimer) {
      clearTimeout(userState.debounceTimer);
      userState.debounceTimer = null;
    }
    
    // Якщо це перша зміна стану (початок нестабільності)
    if (userState.pendingState === null) {
      userState.instabilityStart = new Date().toISOString();
      userState.switchCount = 1;
      console.log(`User ${user.id}: Початок нестабільності, перемикання з ${userState.currentState} на ${newState}`);
    } else {
      // Ще одне перемикання під час нестабільності
      userState.switchCount++;
      console.log(`User ${user.id}: Перемикання #${userState.switchCount} на ${newState}`);
    }
    
    // Встановлюємо новий pending стан
    userState.pendingState = newState;
    userState.pendingStateTime = new Date().toISOString();
    await usersDb.setPendingPowerChange(user.telegram_id, newState); // зберігаємо в БД
    
    // Отримуємо час debounce з бази даних (щоб враховувати зміни адміністратора)
    const debounceMinutes = parseInt(await getSetting('power_debounce_minutes', '5'), 10);
    
    // Визначаємо час затримки:
    // - Якщо debounce = 0, використовуємо мінімальну затримку для захисту від флаппінгу
    // - Інакше використовуємо налаштований debounce
    let debounceMs;
    
    if (debounceMinutes === 0) {
      debounceMs = MIN_STABILIZATION_MS;
      console.log(`User ${user.id}: Debounce=0, використання мінімальної затримки 30с для захисту від флаппінгу`);
    } else {
      debounceMs = debounceMinutes * 60 * 1000;
      console.log(`User ${user.id}: Очікування стабільності ${newState} протягом ${debounceMinutes} хв`);
    }
    
    // Створюємо таймер для підтвердження зміни
    userState.debounceTimer = setTimeout(async () => {
      console.log(`User ${user.id}: Debounce завершено, підтвердження стану ${newState}`);
      
      // Стан був стабільний протягом debounce часу
      const oldState = userState.currentState;
      
      userState.currentState = newState;
      userState.consecutiveChecks = 0;
      userState.debounceTimer = null;
      userState.pendingState = null;
      userState.pendingStateTime = null;
      
      // Обробляємо зміну стану — час і тривалість розраховує PostgreSQL
      await handlePowerStateChange(user, newState, oldState, userState);
    }, debounceMs);
    
  } catch (error) {
    console.error(`Помилка перевірки живлення для користувача ${user.telegram_id}:`, error.message);
  }
}

// Guard against overlapping checkAllUsers calls
let isCheckingAllUsers = false;

// Перевірка всіх користувачів з обмеженням конкурентності
async function checkAllUsers() {
  if (isCheckingAllUsers) {
    logger.debug('checkAllUsers already running, skipping');
    return;
  }
  isCheckingAllUsers = true;
  
  try {
    const users = await usersDb.getUsersWithRouterIp();
    
    if (!users || users.length === 0) {
      return;
    }
    
    logger.debug(`Перевірка ${users.length} користувачів з обмеженням ${POWER_MAX_CONCURRENT_PINGS} одночасних пінгів`);
    
    // Семафор для обмеження конкурентних пінгів
    const results = [];
    let index = 0;
    
    // Функція-воркер для обробки користувачів
    const worker = async () => {
      while (index < users.length) {
        const user = users[index++];
        await checkUserPower(user);
      }
    };
    
    // Створюємо пул воркерів (max POWER_MAX_CONCURRENT_PINGS одночасно)
    const workerCount = Math.min(POWER_MAX_CONCURRENT_PINGS, users.length);
    for (let i = 0; i < workerCount; i++) {
      results.push(worker());
    }
    
    // Чекаємо завершення всіх воркерів
    await Promise.all(results);
    
  } catch (error) {
    logger.error('Помилка при перевірці користувачів', { error: error.message });
  } finally {
    isCheckingAllUsers = false;
  }
}

// Обчислити динамічний інтервал перевірки на основі кількості користувачів
function calculateCheckInterval(userCount) {
  if (userCount < 50) {
    return 2; // 2 секунди
  } else if (userCount < 200) {
    return 5; // 5 секунд
  } else if (userCount < 1000) {
    return 10; // 10 секунд
  } else {
    return 30; // 30 секунд для 1000+ користувачів
  }
}

// Запуск моніторингу живлення
async function startPowerMonitoring(botInstance) {
  // Prevent duplicate intervals
  if (monitoringInterval) {
    logger.warn('Power monitoring already running, skipping');
    return;
  }
  
  bot = botInstance;
  
  // Отримуємо кількість користувачів для розрахунку інтервалу
  const users = await usersDb.getUsersWithRouterIp();
  const userCount = users ? users.length : 0;
  
  // Перевіряємо, чи адмін встановив власний інтервал
  const adminInterval = await getSetting('power_check_interval', null);
  const adminIntervalNum = parseInt(adminInterval, 10) || 0;
  
  let checkInterval;
  let intervalMode;
  
  // Якщо адмін встановив значення > 0, використовуємо його
  // Якщо 0 або null - використовуємо динамічний розрахунок
  if (adminIntervalNum > 0) {
    checkInterval = adminIntervalNum;
    intervalMode = 'admin';
  } else {
    checkInterval = calculateCheckInterval(userCount);
    intervalMode = 'dynamic';
  }
  
  // Отримуємо час debounce з бази даних для логування
  const debounceMinutes = parseInt(await getSetting('power_debounce_minutes', '5'), 10);
  const debounceText = debounceMinutes === 0 
    ? 'вимкнено (миттєві сповіщення)' 
    : `${debounceMinutes} хв (очікування стабільного стану)`;
  
  logger.info('⚡ Запуск системи моніторингу живлення...');
  logger.info(`   Користувачів з IP: ${userCount}`);
  
  if (intervalMode === 'admin') {
    logger.info(`   Інтервал перевірки: ${checkInterval}с (встановлено адміном)`);
  } else {
    logger.info(`   Інтервал перевірки: ${checkInterval}с (динамічний, на основі ${userCount} користувачів)`);
  }
  
  logger.info(`   Макс. одночасних пінгів: ${POWER_MAX_CONCURRENT_PINGS}`);
  logger.info(`   Таймаут пінга: ${POWER_PING_TIMEOUT_MS}мс`);
  logger.info(`   Debounce: ${debounceText}`);
  
  // Відновлюємо стани з БД (асинхронно, не блокуємо запуск)
  restoreUserStates().catch(error => {
    logger.error('Помилка відновлення станів', { error });
  });
  
  // Запускаємо періодичну перевірку з динамічним інтервалом
  monitoringInterval = setInterval(async () => {
    await checkAllUsers();
  }, checkInterval * 1000);
  
  // Запускаємо періодичне збереження станів (кожні 5 хвилин)
  periodicSaveInterval = setInterval(async () => {
    await saveAllUserStates();
  }, 5 * 60 * 1000);
  
  // Перша перевірка відразу
  checkAllUsers();
  
  logger.success('✅ Система моніторингу живлення запущена');
}

// Зупинка моніторингу
function stopPowerMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log('⚡ Моніторинг живлення зупинено');
  }
  if (periodicSaveInterval) {
    clearInterval(periodicSaveInterval);
    periodicSaveInterval = null;
    console.log('💾 Періодичне збереження станів зупинено');
  }
}

/**
 * Зберегти стан користувача в БД (PostgreSQL)
 * Використовує upsert для оновлення існуючого запису або створення нового
 * @param {number} userId - Telegram ID користувача
 * @param {Object} state - Об'єкт стану користувача
 * @param {string} state.currentState - Поточний стан ('on' | 'off' | null)
 * @param {string} state.pendingState - Стан що очікує підтвердження
 * @param {string} state.pendingStateTime - Час початку очікування нового стану
 * @param {string} state.lastStableState - Останній стабільний стан
 * @param {string} state.lastStableAt - Час останнього стабільного стану
 * @param {string} state.instabilityStart - Час початку нестабільності
 * @param {number} state.switchCount - Кількість перемикань під час нестабільності
 */
async function saveUserStateToDb(userId, state) {
  try {
    await pool.query(`
      INSERT INTO user_power_states 
      (telegram_id, current_state, pending_state, pending_state_time, 
       last_stable_state, last_stable_at, instability_start, switch_count, 
       last_notification_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT(telegram_id) DO UPDATE SET
        current_state = EXCLUDED.current_state,
        pending_state = EXCLUDED.pending_state,
        pending_state_time = EXCLUDED.pending_state_time,
        last_stable_state = EXCLUDED.last_stable_state,
        last_stable_at = EXCLUDED.last_stable_at,
        instability_start = EXCLUDED.instability_start,
        switch_count = EXCLUDED.switch_count,
        last_notification_at = EXCLUDED.last_notification_at,
        updated_at = NOW()
    `, [
      userId,
      state.currentState,
      state.pendingState,
      state.pendingStateTime,
      state.lastStableState,
      state.lastStableAt,
      state.instabilityStart,
      state.switchCount || 0,
      state.lastNotificationAt
    ]);
  } catch (error) {
    console.error(`Помилка збереження стану користувача ${userId}:`, error.message);
  }
}

// Зберегти всі стани користувачів
async function saveAllUserStates() {
  const SAVE_TIMEOUT_MS = 10000; // 10 second timeout
  
  const savePromise = (async () => {
    let savedCount = 0;
    for (const [userId, state] of userStates) {
      await saveUserStateToDb(userId, state);
      savedCount++;
    }
    console.log(`💾 Збережено ${savedCount} станів користувачів`);
    return savedCount;
  })();
  
  try {
    return await Promise.race([
      savePromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('saveAllUserStates timed out')), SAVE_TIMEOUT_MS)
      )
    ]);
  } catch (error) {
    const isTimeout = error.message.includes('timed out');
    console.error(isTimeout 
      ? `⏱️ Збереження станів перевищило таймаут (${SAVE_TIMEOUT_MS}мс)` 
      : `Помилка збереження станів: ${error.message}`);
    return 0;
  }
}

// Відновити стани користувачів з БД
async function restoreUserStates() {
  try {
    const result = await pool.query(`
      SELECT * FROM user_power_states 
      WHERE updated_at > NOW() - INTERVAL '1 hour'
    `);
    
    for (const row of result.rows) {
      userStates.set(row.telegram_id, {
        currentState: row.current_state,
        pendingState: row.pending_state,
        pendingStateTime: normalizeTimestamp(row.pending_state_time),
        lastStableState: row.last_stable_state,
        lastStableAt: normalizeTimestamp(row.last_stable_at),
        instabilityStart: normalizeTimestamp(row.instability_start),
        switchCount: row.switch_count || 0,
        lastNotificationAt: normalizeTimestamp(row.last_notification_at),
        consecutiveChecks: 0,
        isFirstCheck: false,
        debounceTimer: null  // Таймери не відновлюємо
      });
    }
    
    console.log(`🔄 Відновлено ${result.rows.length} станів користувачів`);
    return result.rows.length;
  } catch (error) {
    console.error('Помилка відновлення станів:', error.message);
    return 0;
  }
}

// Для сумісності з попереднім кодом
function getPowerState() {
  return {
    state: null,
    changedAt: null
  };
}

function updatePowerState(isAvailable) {
  return { changed: false, state: null };
}

function resetPowerMonitor() {
  // Очищаємо всі таймери перед скиданням
  userStates.forEach((state) => {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }
  });
  userStates.clear();
}

// Get IP monitoring status for user
function getUserIpStatus(userId) {
  const userState = userStates.get(userId);
  if (!userState) {
    return {
      state: 'unknown',
      label: '⚪ Невідомо',
      lastPing: null,
      lastPingSuccess: null,
    };
  }
  
  const { getIpState, getIpStateLabel, formatLastPing } = require('./constants/ipStates');
  const state = getIpState(userState);
  
  return {
    state,
    label: getIpStateLabel(state),
    lastPing: userState.lastPingTime ? formatLastPing(userState.lastPingTime) : null,
    lastPingSuccess: userState.lastPingSuccess,
    currentState: userState.currentState,
    pendingState: userState.pendingState,
  };
}

module.exports = {
  checkRouterAvailability,
  getPowerState,
  updatePowerState,
  resetPowerMonitor,
  startPowerMonitoring,
  stopPowerMonitoring,
  getNextScheduledTime,
  handlePowerStateChange,
  saveAllUserStates,
  saveUserStateToDb,
  restoreUserStates,
  getUserIpStatus,
};