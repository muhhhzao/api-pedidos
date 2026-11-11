const app = require('./app');

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, (erro) => {
  if (erro) {
    console.error(`Não foi possível iniciar o servidor na porta ${PORT}: ${erro.message}`);
    process.exit(1);
  }
  console.log(`API de pedidos rodando em http://localhost:${PORT}`);
});
