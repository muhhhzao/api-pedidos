const request = require('supertest');
const app = require('../src/app');
const pedidosService = require('../src/services/pedidos.service');

const pedidoValido = {
  cliente: 'Carlos Silva',
  tipo: 'entrega',
  valor: 350,
  prioridade: 'normal',
};

beforeEach(() => {
  pedidosService.resetar();
});

describe('POST /pedidos', () => {
  test('cria pedido válido e retorna 201 com status "recebido"', async () => {
    const res = await request(app).post('/pedidos').send(pedidoValido);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 1, ...pedidoValido, status: 'recebido' });
  });

  test('gera ids sequenciais', async () => {
    const primeiro = await request(app).post('/pedidos').send(pedidoValido);
    const segundo = await request(app).post('/pedidos').send(pedidoValido);

    expect(primeiro.body.id).toBe(1);
    expect(segundo.body.id).toBe(2);
  });

  test('remove espaços nas pontas do nome do cliente', async () => {
    const res = await request(app).post('/pedidos').send({ ...pedidoValido, cliente: '  Ana  ' });

    expect(res.status).toBe(201);
    expect(res.body.cliente).toBe('Ana');
  });

  test.each([
    ['cliente vazio', { cliente: '' }],
    ['cliente só com espaços', { cliente: '   ' }],
    ['cliente ausente', { cliente: undefined }],
    ['cliente que não é texto', { cliente: 123 }],
    ['valor negativo', { valor: -10 }],
    ['valor zero', { valor: 0 }],
    ['valor como texto', { valor: '350' }],
    ['valor ausente', { valor: undefined }],
    ['tipo desconhecido', { tipo: 'voando' }],
    ['tipo com letra maiúscula', { tipo: 'Entrega' }],
    ['tipo ausente', { tipo: undefined }],
    ['prioridade desconhecida', { prioridade: 'urgentissima' }],
    ['prioridade ausente', { prioridade: undefined }],
  ])('retorna 400 para %s', async (_nome, alteracao) => {
    const res = await request(app)
      .post('/pedidos')
      .send({ ...pedidoValido, ...alteracao });

    expect(res.status).toBe(400);
    expect(res.body.erro).toBeDefined();
  });

  test('retorna 400 para valor infinito vindo do JSON (1e999)', async () => {
    const res = await request(app)
      .post('/pedidos')
      .set('Content-Type', 'application/json')
      .send('{"cliente":"Ana","tipo":"entrega","valor":1e999,"prioridade":"normal"}');

    expect(res.status).toBe(400);
  });

  test('retorna 400 (e não 500) para JSON malformado', async () => {
    const res = await request(app)
      .post('/pedidos')
      .set('Content-Type', 'application/json')
      .send('{ "cliente": ');

    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/JSON inválido/);
  });

  test('retorna 400 quando não há corpo', async () => {
    const res = await request(app).post('/pedidos');

    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/objeto JSON/);
  });

  test('retorna 400 quando o corpo é um array', async () => {
    const res = await request(app).post('/pedidos').send([pedidoValido]);

    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/objeto JSON/);
  });

  test('retorna 400 quando o corpo não é enviado como JSON', async () => {
    const res = await request(app)
      .post('/pedidos')
      .set('Content-Type', 'text/plain')
      .send('cliente=Ana');

    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/objeto JSON/);
  });

  test('retorna 413 para corpo grande demais', async () => {
    const res = await request(app)
      .post('/pedidos')
      .send({ ...pedidoValido, cliente: 'a'.repeat(200000) });

    expect(res.status).toBe(413);
    expect(res.body.erro).toBeDefined();
  });

  test('não cria o pedido quando a validação falha', async () => {
    await request(app).post('/pedidos').send({ ...pedidoValido, valor: -1 });

    const res = await request(app).get('/pedidos');

    expect(res.body).toEqual([]);
  });
});

describe('GET /pedidos', () => {
  test('retorna lista vazia com 200', async () => {
    const res = await request(app).get('/pedidos');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('retorna os pedidos cadastrados', async () => {
    await request(app).post('/pedidos').send(pedidoValido);
    await request(app).post('/pedidos').send({ ...pedidoValido, cliente: 'Maria' });

    const res = await request(app).get('/pedidos');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[1].cliente).toBe('Maria');
  });

  test('alterar o resultado do service não afeta os dados armazenados', async () => {
    await request(app).post('/pedidos').send(pedidoValido);

    const lista = pedidosService.listar();
    lista[0].status = 'entregue';
    lista.pop();

    const res = await request(app).get('/pedidos/1');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('recebido');
  });
});

describe('GET /pedidos/:id', () => {
  test('retorna 200 para pedido existente', async () => {
    await request(app).post('/pedidos').send(pedidoValido);

    const res = await request(app).get('/pedidos/1');

    expect(res.status).toBe(200);
    expect(res.body.cliente).toBe('Carlos Silva');
  });

  test('retorna 404 para id inexistente', async () => {
    const res = await request(app).get('/pedidos/999');

    expect(res.status).toBe(404);
    expect(res.body.erro).toBeDefined();
  });

  test.each(['abc', '0', '01', '-1', '1.5', '99999999999999999999999'])(
    'retorna 404 para id inválido "%s"',
    async (id) => {
      await request(app).post('/pedidos').send(pedidoValido);

      const res = await request(app).get(`/pedidos/${id}`);

      expect(res.status).toBe(404);
    }
  );
});

describe('PATCH /pedidos/:id/status', () => {
  beforeEach(async () => {
    await request(app).post('/pedidos').send(pedidoValido);
  });

  test('atualiza status com transição válida (200)', async () => {
    const res = await request(app).patch('/pedidos/1/status').send({ status: 'em_preparacao' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('em_preparacao');
  });

  test('a alteração fica salva para consultas seguintes', async () => {
    await request(app).patch('/pedidos/1/status').send({ status: 'em_preparacao' });

    const res = await request(app).get('/pedidos/1');

    expect(res.body.status).toBe('em_preparacao');
  });

  test('permite cancelar um pedido recebido', async () => {
    const res = await request(app).patch('/pedidos/1/status').send({ status: 'cancelado' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelado');
  });

  test('retorna 400 para status desconhecido', async () => {
    const res = await request(app).patch('/pedidos/1/status').send({ status: 'voando' });

    expect(res.status).toBe(400);
  });

  test('retorna 400 quando falta o campo status', async () => {
    const res = await request(app).patch('/pedidos/1/status').send({});

    expect(res.status).toBe(400);
  });

  test('retorna 400 quando não há corpo', async () => {
    const res = await request(app).patch('/pedidos/1/status');

    expect(res.status).toBe(400);
  });

  test('retorna 400 quando o status não é texto', async () => {
    const res = await request(app).patch('/pedidos/1/status').send({ status: 5 });

    expect(res.status).toBe(400);
  });

  test('retorna 400 para transição inválida (recebido -> entregue)', async () => {
    const res = await request(app).patch('/pedidos/1/status').send({ status: 'entregue' });

    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/Não é possível mudar/);
  });

  test('retorna 400 ao repetir o mesmo status', async () => {
    const res = await request(app).patch('/pedidos/1/status').send({ status: 'recebido' });

    expect(res.status).toBe(400);
  });

  test('retorna 400 ao tentar alterar pedido cancelado (status final)', async () => {
    await request(app).patch('/pedidos/1/status').send({ status: 'cancelado' });

    const res = await request(app).patch('/pedidos/1/status').send({ status: 'em_preparacao' });

    expect(res.status).toBe(400);
    expect(res.body.erro).toMatch(/status final/);
  });

  test('retorna 404 para id inexistente', async () => {
    const res = await request(app).patch('/pedidos/999/status').send({ status: 'cancelado' });

    expect(res.status).toBe(404);
  });

  test('retorna 404 (e não 400) para id inexistente com status inválido', async () => {
    const res = await request(app).patch('/pedidos/999/status').send({ status: 'voando' });

    expect(res.status).toBe(404);
  });

  test('percorre o fluxo completo até entregue', async () => {
    await request(app).patch('/pedidos/1/status').send({ status: 'em_preparacao' });
    await request(app).patch('/pedidos/1/status').send({ status: 'enviado' });
    const res = await request(app).patch('/pedidos/1/status').send({ status: 'entregue' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('entregue');
  });
});

describe('Rotas inexistentes e erros inesperados', () => {
  test('rota desconhecida retorna 404 em JSON', async () => {
    const res = await request(app).get('/qualquer-coisa');

    expect(res.status).toBe(404);
    expect(res.body.erro).toBeDefined();
  });

  test('método não previsto retorna 404 em JSON', async () => {
    const res = await request(app).delete('/pedidos/1');

    expect(res.status).toBe(404);
    expect(res.body.erro).toBeDefined();
  });

  test('erro inesperado vira 500 sem vazar detalhes', async () => {
    const spyLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    const spyService = jest.spyOn(pedidosService, 'listar').mockImplementation(() => {
      throw new Error('falha secreta do banco');
    });

    const res = await request(app).get('/pedidos');

    expect(res.status).toBe(500);
    expect(res.body.erro).toBe('Erro interno do servidor.');
    expect(JSON.stringify(res.body)).not.toMatch(/secreta/);

    spyService.mockRestore();
    spyLog.mockRestore();
  });
});
