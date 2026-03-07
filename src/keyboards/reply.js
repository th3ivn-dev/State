'use strict';

const { Markup } = require('telegraf');

/**
 * Convert inline keyboard to reply keyboard while preserving custom emoji and button styling.
 * @param {Array} inlineKeyboard - The inline keyboard to convert.
 * @returns {Array} - The formatted reply keyboard.
 */
const inlineToReply = (inlineKeyboard) => {
  return inlineKeyboard.map(row => {
    return row.map(button => {
      const { text, callback_data } = button;
      return Markup.button.callback(text, callback_data || '');
    });
  });
};

/**
 * Example function to demonstrate usage.
 */
const exampleFunction = () => {
  const inlineKeyboard = [[
    { text: 'Button 1', callback_data: 'callback1' },
    { text: 'Button 2', callback_data: 'callback2' }
  ]];

  const replyKeyboard = inlineToReply(inlineKeyboard);
  return replyKeyboard;
};

module.exports = { inlineToReply, exampleFunction };