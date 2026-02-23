/**
 * Schedule look-ahead helpers for power monitoring.
 * Fetches and parses the outage schedule to determine upcoming power events.
 */

// Look up the next scheduled power event for a given user
async function getNextScheduledTime(user) {
  try {
    const { fetchScheduleData } = require('../api');
    const { parseScheduleForQueue, findNextEvent } = require('../parser');

    const data = await fetchScheduleData(user.region);
    const scheduleData = parseScheduleForQueue(data, user.queue);
    const nextEvent = findNextEvent(scheduleData);

    return nextEvent;
  } catch (error) {
    console.error('Error getting next scheduled time:', error);
    return null;
  }
}

module.exports = {
  getNextScheduledTime,
};
