const { randomInt } = require('crypto');

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function randomLetters(count) {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    out += LETTERS[randomInt(LETTERS.length)];
  }
  return out;
}

// Format: abc-defg-hij (26^10 combinations)
function generateMeetingCode() {
  return `${randomLetters(3)}-${randomLetters(4)}-${randomLetters(3)}`;
}

module.exports = { generateMeetingCode };