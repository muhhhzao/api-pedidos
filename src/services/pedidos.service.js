const { ValidationError, NotFoundError } = require('../errors/AppError');

const TIPOS_VALIDOS = ['entrega', 'retirada'];
const PRIORIDADES_VALIDAS = ['baixa', 'normal', 'alta'];
const STATUS_VALIDOS = ['recebido', 'em_preparacao', 'enviado', 'entregue', 'cancelado'];

const TRANSICOES = {
  recebido: ['em_preparacao', 'cancelado'],
  em_preparacao: ['enviado', 'cancelado'],
  enviado: ['entregue'],
  entregue: [],
  cancelado: [],
};

const ID_VALIDO = /^[1-9]\d*$/;

let pedidos = [];
let proximoId = 1;

function copiar(pedido) {
  return { ...pedido };
}

function validarDadosPedido(dados) {
  if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new ValidationError('O corpo da requisição deve ser um objeto JSON.');
  }

  const { cliente, tipo, valor, prioridade } = dados;

  if (typeof cliente !== 'string' || cliente.trim() === '') {
    throw new ValidationError('O campo "cliente" é obrigatório e não pode ser vazio.');
  }
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0) {
    throw new ValidationError('O campo "valor" deve ser um número maior que zero.');
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    throw new ValidationError(`O campo "tipo" deve ser um destes valores: ${TIPOS_VALIDOS.join(', ')}.`);
  }
  if (!PRIORIDADES_VALIDAS.includes(prioridade)) {
    throw new ValidationError(
      `O campo "prioridade" deve ser um destes valores: ${PRIORIDADES_VALIDAS.join(', ')}.`
    );
  }
}

function encontrar(idTexto) {
  const texto = String(idTexto);
  const id = ID_VALIDO.test(texto) ? Number(texto) : NaN;
  const pedido = Number.isSafeInteger(id) ? pedidos.find((p) => p.id === id) : undefined;

  if (!pedido) {
    throw new NotFoundError(`Pedido com id "${texto}" não encontrado.`);
  }
  return pedido;
}

function criar(dados) {
  validarDadosPedido(dados);

  const pedido = {
    id: proximoId++,
    cliente: dados.cliente.trim(),
    tipo: dados.tipo,
    valor: dados.valor,
    prioridade: dados.prioridade,
    status: 'recebido',
  };

  pedidos.push(pedido);
  return copiar(pedido);
}

function listar() {
  return pedidos.map(copiar);
}

function buscarPorId(idTexto) {
  return copiar(encontrar(idTexto));
}

function atualizarStatus(idTexto, novoStatus) {
  const pedido = encontrar(idTexto);

  if (typeof novoStatus !== 'string' || !STATUS_VALIDOS.includes(novoStatus)) {
    throw new ValidationError(`O campo "status" deve ser um destes valores: ${STATUS_VALIDOS.join(', ')}.`);
  }

  const permitidos = TRANSICOES[pedido.status];

  if (!permitidos.includes(novoStatus)) {
    const dica = permitidos.length > 0
      ? `Transições permitidas: ${permitidos.join(', ')}.`
      : 'Esse pedido está em um status final e não pode mais ser alterado.';
    throw new ValidationError(`Não é possível mudar de "${pedido.status}" para "${novoStatus}". ${dica}`);
  }

  pedido.status = novoStatus;
  return copiar(pedido);
}

function resetar() {
  pedidos = [];
  proximoId = 1;
}

module.exports = {
  criar,
  listar,
  buscarPorId,
  atualizarStatus,
  resetar,
  TIPOS_VALIDOS,
  PRIORIDADES_VALIDAS,
  STATUS_VALIDOS,
  TRANSICOES,
};
