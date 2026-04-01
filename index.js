require('dotenv').config();

const { iniciarPolling, encerrarBot } = require('./src/bot');

iniciarPolling()
  .then(() => {
    encerrarBot();
  })
  .catch((error) => {
    console.error('Falha ao iniciar o bot em polling:', error.message);
    process.exitCode = 1;
  });
