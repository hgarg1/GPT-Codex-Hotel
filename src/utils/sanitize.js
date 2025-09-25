const sanitizeHtml = require('sanitize-html');

// Sanitise user supplied values by stripping tags and trimming whitespace.
function sanitizeString(value = '') {
  return sanitizeHtml(String(value), {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: (text) => text.replace(/\s+/g, ' ')
  }).trim();
}

module.exports = {
  sanitizeString
};
