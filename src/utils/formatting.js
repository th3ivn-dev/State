// Форматувати час для відображення
function formatTime(date) {
  if (!date) return 'невідомо';

  try {
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch (_error) {
    return 'невідомо';
  }
}

// Форматувати дату для відображення
function formatDate(date) {
  if (!date) return 'невідомо';

  try {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch (_error) {
    return 'невідомо';
  }
}

// Форматувати дату та час
function formatDateTime(date) {
  if (!date) return 'невідомо';
  return `${formatDate(date)} ${formatTime(date)}`;
}

// Форматувати час, що залишився
function formatTimeRemaining(minutes) {
  if (minutes < 0) return 'минуло';
  if (minutes === 0) return 'зараз';

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0 && mins > 0) {
    return `${hours} год ${mins} хв`;
  } else if (hours > 0) {
    return `${hours} год`;
  }
  return `${mins} хв`;
}

// Форматувати uptime для відображення
function formatUptime(seconds) {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} д`);
  if (hours > 0) parts.push(`${hours} год`);
  if (minutes > 0) parts.push(`${minutes} хв`);

  return parts.join(' ') || '< 1 хв';
}

// Форматувати тривалість з мілісекунд
function formatDurationFromMs(ms) {
  const hours = ms / (1000 * 60 * 60);

  if (hours >= 1) {
    // Format as decimal hours (e.g., "1.5 год") but omit .0 for whole hours
    const formattedHours = hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1);
    return `${formattedHours} год`;
  }

  const minutes = Math.floor(ms / (1000 * 60));
  if (minutes > 0) return `${minutes} хв`;
  return '< 1 хв';
}

// Форматувати розмір пам'яті
function formatMemory(bytes) {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
}

// Форматувати точну тривалість українською мовою
function formatExactDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);

  // Тільки хвилини
  if (hours === 0) {
    if (minutes === 0) return 'менше хвилини';
    return `${minutes} хв`;
  }

  // Тільки години
  if (minutes === 0) {
    return `${hours} год`;
  }

  // Години + хвилини
  return `${hours} год ${minutes} хв`;
}

// Форматувати інтервал в секундах для відображення
function formatInterval(seconds) {
  if (seconds < 60) {
    // Менше 60 секунд - показуємо в секундах
    return `${seconds} сек`;
  } else {
    // 60+ секунд - показуємо в хвилинах
    const minutes = seconds / 60;
    // Якщо ділиться націло - показуємо як ціле число хвилин
    if (Number.isInteger(minutes)) {
      return `${minutes} хв`;
    } else {
      // Якщо не ділиться націло - показуємо в секундах для точності
      return `${seconds} сек`;
    }
  }
}

// Форматувати тривалість в секундах згідно з вимогами Task 7
function formatDuration(seconds) {
  if (seconds < 60) {
    return '< 1 хв';
  }

  const totalMinutes = Math.floor(seconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays >= 1) {
    const hours = totalHours % 24;
    // Proper Ukrainian pluralization for days
    let dayWord = 'день';
    if (totalDays >= 5 || totalDays === 0) {
      dayWord = 'днів';
    } else if (totalDays >= 2) {
      dayWord = 'дні';
    }

    if (hours > 0) {
      return `${totalDays} ${dayWord} ${hours} год`;
    }
    return `${totalDays} ${dayWord}`;
  }

  if (totalHours >= 1) {
    const minutes = totalMinutes % 60;
    if (minutes > 0) {
      return `${totalHours} год ${minutes} хв`;
    }
    return `${totalHours} год`;
  }

  return `${totalMinutes} хв`;
}

module.exports = {
  formatTime,
  formatDate,
  formatDateTime,
  formatTimeRemaining,
  formatUptime,
  formatDurationFromMs,
  formatMemory,
  formatExactDuration,
  formatInterval,
  formatDuration,
};
