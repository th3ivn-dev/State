// Обчислити різницю в хвилинах між двома датами
function getMinutesDifference(date1, date2 = new Date()) {
  try {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.floor((d1 - d2) / (1000 * 60));
  } catch (_error) {
    return null;
  }
}

// Парсити час з рядка (формат HH:MM)
function parseTime(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  const now = new Date();
  const time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
  return time;
}

// Отримати поточний час у timezone
function getCurrentTime() {
  return new Date();
}

module.exports = { getMinutesDifference, parseTime, getCurrentTime };
