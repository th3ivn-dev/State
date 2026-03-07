const { formatExactDuration } = require('../utils');

// Форматувати статистику для popup в каналі
function formatStatsForChannelPopup(stats) {
  if (stats.count === 0) {
    return '📊 За тиждень:\n\n✅ Відключень не було';
  }

  const lines = [];
  lines.push('📊 За тиждень:');
  lines.push('');
  lines.push(`⚡ Відключень: ${stats.count}`);

  // Форматувати загальний час
  const totalDuration = formatExactDuration(stats.totalMinutes);
  lines.push(`🕓 Загальний час без світла: ${totalDuration}`);

  // Середня тривалість
  const avgDuration = formatExactDuration(stats.avgMinutes);
  lines.push(`📉 Середня тривалість: ${avgDuration}`);

  // Найдовше відключення
  if (stats.longest) {
    const longDuration = formatExactDuration(stats.longest.duration_minutes);
    const longDate = new Date(stats.longest.start_time);
    const longDateStr = `${String(longDate.getDate()).padStart(2, '0')}.${String(longDate.getMonth() + 1).padStart(2, '0')}`;
    const longStartTime = `${String(longDate.getHours()).padStart(2, '0')}:${String(longDate.getMinutes()).padStart(2, '0')}`;
    const longEndDate = new Date(stats.longest.end_time);
    const longEndTime = `${String(longEndDate.getHours()).padStart(2, '0')}:${String(longEndDate.getMinutes()).padStart(2, '0')}`;

    lines.push(`🏆 Найдовше: ${longDuration} (${longDateStr} ${longStartTime}-${longEndTime})`);
  }

  // Найкоротше відключення
  if (stats.shortest) {
    const shortDuration = formatExactDuration(stats.shortest.duration_minutes);
    const shortDate = new Date(stats.shortest.start_time);
    const shortDateStr = `${String(shortDate.getDate()).padStart(2, '0')}.${String(shortDate.getMonth() + 1).padStart(2, '0')}`;
    const shortStartTime = `${String(shortDate.getHours()).padStart(2, '0')}:${String(shortDate.getMinutes()).padStart(2, '0')}`;
    const shortEndDate = new Date(stats.shortest.end_time);
    const shortEndTime = `${String(shortEndDate.getHours()).padStart(2, '0')}:${String(shortEndDate.getMinutes()).padStart(2, '0')}`;

    lines.push(`🔋 Найкоротше: ${shortDuration} (${shortDateStr} ${shortStartTime}-${shortEndTime})`);
  }

  return lines.join('\n');
}

module.exports = {
  formatStatsForChannelPopup,
};
