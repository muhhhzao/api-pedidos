const pedidosService = require('../services/pedidos.service');

function criar(req, res, next) {
  try {
    const pedido = pedidosService.criar(req.body);
    res.status(201).json(pedido);
  } catch (err) {
    next(err);
  }
}

function listar(req, res, next) {
  try {
    res.status(200).json(pedidosService.listar());
  } catch (err) {
    next(err);
  }
}

function buscarPorId(req, res, next) {
  try {
    const pedido = pedidosService.buscarPorId(req.params.id);
    res.status(200).json(pedido);
  } catch (err) {
    next(err);
  }
}

function atualizarStatus(req, res, next) {
  try {
    const pedido = pedidosService.atualizarStatus(req.params.id, req.body?.status);
    res.status(200).json(pedido);
  } catch (err) {
    next(err);
  }
}

module.exports = { criar, listar, buscarPorId, atualizarStatus };
