function formatTemplate(template, variables = {}) {
  if (!template || typeof template !== 'string') return '';
  if (!variables || typeof variables !== 'object') return template;

  let result = template;

  // Заміна змінних - use simple string replace for better performance
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    // Safely convert value to string, handle null/undefined
    const replacement = (value !== null && value !== undefined) ? String(value) : '';
    while (result.includes(placeholder)) {
      result = result.replace(placeholder, replacement);
    }
  }

  // Заміна <br> на новий рядок
  result = result.replace(/<br>/g, '\n');

  return result;
}

// Форматувати поточну дату/час для шаблонів
function getCurrentDateTimeForTemplate() {
  const now = new Date();
  return {
    timeStr: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    dateStr: `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
  };
}

module.exports = {
  formatTemplate,
  getCurrentDateTimeForTemplate,
};
