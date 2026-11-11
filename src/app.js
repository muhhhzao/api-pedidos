const express = require('express');
const pedidosRoutes = require('./routes/pedidos.routes');
const { rotaNaoEncontrada, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());
app.use('/pedidos', pedidosRoutes);
app.use(rotaNaoEncontrada);
app.use(errorHandler);

module.exports = app;
