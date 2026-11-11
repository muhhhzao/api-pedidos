const { AppError, NotFoundError } = require('../errors/AppError');

const ERROS_DE_CORPO = {
  'entity.parse.failed': [400, 'JSON inválido no corpo da requisição.'],
  'entity.too.large': [413, 'O corpo da requisição é grande demais.'],
  'charset.unsupported': [415, 'Codificação de caracteres não suportada. Use UTF-8.'],
  'encoding.unsupported': [415, 'Compressão do corpo da requisição não suportada.'],
};

function rotaNaoEncontrada(req, res, next) {
  next(new NotFoundError(`Rota ${req.method} ${req.originalUrl} não encontrada.`));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ erro: err.message });
  }

  const erroDeCorpo = ERROS_DE_CORPO[err.type];
  if (erroDeCorpo) {
    const [status, mensagem] = erroDeCorpo;
    return res.status(status).json({ erro: mensagem });
  }

  console.error(err);
  return res.status(500).json({ erro: 'Erro interno do servidor.' });
}

module.exports = { rotaNaoEncontrada, errorHandler };
