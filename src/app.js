const express = require('express');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to GPT Codex Hotel API' });
});

module.exports = app;
