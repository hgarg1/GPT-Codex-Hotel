const POSITIVE_WORDS = new Set([
  'great',
  'amazing',
  'love',
  'good',
  'fantastic',
  'wonderful',
  'relax',
  'thank',
  'thanks',
  'happy',
  'excited',
  'enjoy'
]);

const NEGATIVE_WORDS = new Set([
  'bad',
  'terrible',
  'angry',
  'upset',
  'frustrated',
  'sad',
  'disappointed',
  'issue',
  'problem',
  'delay',
  'help',
  'concern'
]);

function scoreSentiment(message) {
  const tokens = String(message)
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  let score = 0;
  tokens.forEach((token) => {
    if (POSITIVE_WORDS.has(token)) {
      score += 1;
    } else if (NEGATIVE_WORDS.has(token)) {
      score -= 1;
    }
  });
  if (score > 1) {
    return { sentiment: 'positive', score };
  }
  if (score < -1) {
    return { sentiment: 'negative', score };
  }
  return { sentiment: 'neutral', score };
}

function buildSuggestions(message, partnerName = 'them') {
  const analysis = scoreSentiment(message);
  const suggestions = new Set();

  if (analysis.sentiment === 'positive') {
    suggestions.add(`That's wonderful to hear! Is there anything else I can do for you?`);
    suggestions.add(`I love that energy—would you like a recommendation to keep it going?`);
  } else if (analysis.sentiment === 'negative') {
    suggestions.add(`I'm so sorry you're experiencing that. How can I make this better for you?`);
    suggestions.add(`I understand your concern—would scheduling a call help resolve it quickly?`);
  } else {
    suggestions.add(`Thanks for the update! Should I follow up on anything for you?`);
    suggestions.add(`Got it. Is there anything specific you'd like me to handle next?`);
  }

  if (message.toLowerCase().includes('thank')) {
    suggestions.add(`You're very welcome! I'm here if you need anything else.`);
  }
  if (message.toLowerCase().includes('help')) {
    suggestions.add(`I'd be happy to help. What would be most useful right now?`);
  }

  return {
    sentiment: analysis.sentiment,
    score: analysis.score,
    suggestions: Array.from(suggestions).slice(0, 3)
  };
}

module.exports = {
  buildSuggestions
};
