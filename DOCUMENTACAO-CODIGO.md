# Documentação do código: passo a passo de cada arquivo

O código-fonte não tem comentários. Toda a explicação que normalmente ficaria nos comentários está aqui, arquivo por arquivo, na ordem em que uma requisição atravessa a aplicação.

---

## 1. Caminho de uma requisição

```
Cliente (Postman)
   │  POST /pedidos { ... }
   ▼
server.js          liga o servidor na porta
   ▼
app.js             express.json() transforma o corpo em objeto (req.body)
   ▼
routes             acha a rota certa e chama o controller
   ▼
controller         chama o service e escolhe o status HTTP da resposta
   ▼
service            valida, aplica as regras e guarda/busca os dados
   ▼
controller         res.status(201).json(pedido)
```

Se algo der errado em qualquer ponto depois do `app.js`:

```
service lança erro → controller captura e chama next(err) → errorHandler monta a resposta JSON
```

---

## 2. `src/server.js`

**Papel:** ponto de entrada. Só liga o servidor.

1. Importa o `app` pronto.
2. Lê a porta de `process.env.PORT` (se não existir ou for inválida, usa 3000).
3. Chama `app.listen`. O callback recebe um erro quando não consegue subir (por exemplo, porta ocupada): nesse caso mostra uma mensagem clara e encerra com código 1. Se subiu, mostra o endereço.

**Por que é separado do `app.js`:** os testes importam o `app` sem abrir porta nenhuma.

---

## 3. `src/app.js`

**Papel:** monta a aplicação Express. Não liga servidor.

A **ordem** dos `app.use` importa:

1. `express.json()`: lê o corpo da requisição e o transforma em objeto. Se o JSON for inválido, gera um erro que vai para o `errorHandler`.
2. `app.use('/pedidos', pedidosRoutes)`: tudo que começa com `/pedidos` vai para o arquivo de rotas.
3. `rotaNaoEncontrada`: pega qualquer requisição que nenhuma rota atendeu e gera um 404.
4. `errorHandler`: **sempre por último**. É quem recebe todos os erros.

---

## 4. `src/routes/pedidos.routes.js`

**Papel:** ligar método HTTP + URL a uma função do controller. Nenhuma lógica.

| Linha | Significado |
|-------|-------------|
| `router.post('/', controller.criar)` | `POST /pedidos` |
| `router.get('/', controller.listar)` | `GET /pedidos` |
| `router.get('/:id', controller.buscarPorId)` | `GET /pedidos/1` (o `1` fica em `req.params.id`) |
| `router.patch('/:id/status', controller.atualizarStatus)` | `PATCH /pedidos/1/status` |

Como o `app.js` já montou tudo sob `/pedidos`, aqui as rotas são escritas sem esse prefixo.

---

## 5. `src/controllers/pedidos.controller.js`

**Papel:** fazer a ponte entre HTTP e service. Não valida nada e não mexe nos dados.

Cada função segue o mesmo padrão:

1. Dentro de um `try`, lê o que precisa de `req` (`req.body` ou `req.params.id`).
2. Chama a função do service.
3. Responde com o status HTTP de sucesso e o JSON.
4. No `catch`, chama `next(err)`. Isso entrega o erro ao `errorHandler`.

| Função | Lê de | Chama | Sucesso |
|--------|-------|-------|---------|
| `criar` | `req.body` | `service.criar` | 201 |
| `listar` | (nada) | `service.listar` | 200 |
| `buscarPorId` | `req.params.id` | `service.buscarPorId` | 200 |
| `atualizarStatus` | `req.params.id` e `req.body?.status` | `service.atualizarStatus` | 200 |

O `?.` em `req.body?.status` evita um erro quando a requisição chega sem corpo (`req.body` fica `undefined`). Nesse caso o service recebe `undefined` e responde 400.

---

## 6. `src/services/pedidos.service.js`

**Papel:** regras de negócio, validação e armazenamento. Não conhece `req`, `res` nem status HTTP.

### Constantes no topo

- `TIPOS_VALIDOS`, `PRIORIDADES_VALIDAS`, `STATUS_VALIDOS`: as listas de valores aceitos. É aqui que se adiciona um valor novo.
- `TRANSICOES`: para cada status atual, a lista dos status para os quais ele pode ir. Lista vazia significa status final.
- `ID_VALIDO`: expressão `/^[1-9]\d*$/`. Só aceita inteiro positivo escrito em dígitos, sem zero à esquerda. Por isso `abc`, `0`, `01`, `-1` e `1.5` nunca são ids válidos.

### "Banco de dados" em memória

- `pedidos`: array com todos os pedidos.
- `proximoId`: contador que gera o id e só aumenta.

### Funções internas (não exportadas)

- **`copiar(pedido)`**: devolve uma cópia do objeto. Todo dado que sai do service é copiado, para quem receber não conseguir alterar o array interno sem passar pelas regras.
- **`validarDadosPedido(dados)`**: valida na ordem:
  1. O corpo é um objeto (não `null`, não array)? Senão, 400.
  2. `cliente` é texto e não fica vazio depois do `trim()`?
  3. `valor` é do tipo número, finito e maior que zero? (`"350"` como texto é rejeitado.)
  4. `tipo` está em `TIPOS_VALIDOS`? (maiúsculas importam: `Entrega` é rejeitado.)
  5. `prioridade` está em `PRIORIDADES_VALIDAS`?
  
  Na primeira falha lança `ValidationError` (400) com mensagem explicativa.
- **`encontrar(idTexto)`**: converte o id (que chega como texto da URL) em número, só se passar na regra `ID_VALIDO` e for um inteiro seguro. Procura no array. Se não achar, lança `NotFoundError` (404). Devolve o objeto **original** do array, por isso não é exportada.

### Funções exportadas

| Função | O que faz |
|--------|-----------|
| `criar(dados)` | Valida, monta o pedido (`id` novo, `cliente` sem espaços nas pontas, `status: 'recebido'`), guarda no array e devolve uma cópia |
| `listar()` | Devolve cópias de todos os pedidos |
| `buscarPorId(id)` | Usa `encontrar` e devolve uma cópia |
| `atualizarStatus(id, novoStatus)` | Ver abaixo |
| `resetar()` | Esvazia a lista e volta o contador para 1. Existe só para os testes começarem limpos |

### `atualizarStatus`, passo a passo

1. `encontrar(id)`: se o pedido não existe, **404**. Isso vem primeiro de propósito: id inexistente é 404 mesmo que o corpo também esteja errado.
2. O `novoStatus` é um texto que está em `STATUS_VALIDOS`? Senão, **400**.
3. O `novoStatus` está em `TRANSICOES[status atual]`? Senão, **400**, com mensagem dizendo quais transições são permitidas (ou que o pedido está em status final).
4. Tudo certo: altera o status no objeto original e devolve uma cópia.

---

## 7. `src/errors/AppError.js`

**Papel:** erros com status HTTP embutido.

- `AppError`: classe base. Guarda `message` e `statusCode`.
- `ValidationError`: filha de `AppError` com status **400**.
- `NotFoundError`: filha de `AppError` com status **404**.

O service lança esses erros dizendo apenas *o que* deu errado. O número do status viaja dentro do erro, então o service continua sem saber nada de HTTP.

---

## 8. `src/middlewares/errorHandler.js`

**Papel:** único lugar onde um erro vira resposta. Exporta duas funções.

### `rotaNaoEncontrada`

Cria um `NotFoundError` com o método e a URL pedidos e entrega ao `errorHandler` via `next`. Cobre rotas inexistentes e métodos não previstos (ex.: `DELETE /pedidos/1`).

### `errorHandler(err, req, res, next)`

O Express reconhece que é um middleware de erro **pelos 4 parâmetros**, mesmo que `next` apareça pouco.

Ele decide a resposta nesta ordem:

1. **A resposta já começou a ser enviada** (`res.headersSent`)? Passa o erro adiante com `next(err)`, pois não dá mais para montar outra resposta.
2. **É um `AppError`** (nosso 400 ou 404)? Responde com o `statusCode` do erro e `{ "erro": mensagem }`.
3. **É um erro de leitura do corpo?** A tabela `ERROS_DE_CORPO` traduz:

   | Tipo do erro | Status | Quando acontece |
   |--------------|--------|-----------------|
   | `entity.parse.failed` | 400 | JSON malformado |
   | `entity.too.large` | 413 | Corpo maior que o limite (100 KB por padrão) |
   | `charset.unsupported` | 415 | Codificação diferente de UTF-8 |
   | `encoding.unsupported` | 415 | Compressão não suportada |

4. **Qualquer outra coisa** é erro inesperado: registra o erro completo no terminal do servidor com `console.error` e responde **500** com mensagem genérica. O detalhe interno nunca vai para o cliente, e um bug nosso nunca é apresentado como erro de validação.

---

## 9. `tests/pedidos.test.js`

**Papel:** testar a API de ponta a ponta com Jest + Supertest, sem abrir porta.

- `pedidoValido`: objeto-base reaproveitado nos testes. Cada teste de erro troca só um campo.
- `beforeEach` com `resetar()`: cada teste começa com a lista vazia e o contador em 1. Assim os testes não dependem uns dos outros.
- `test.each`: roda o mesmo teste para vários dados inválidos (cliente vazio, valor negativo, tipo desconhecido etc.).
- O teste de erro 500 usa `jest.spyOn` para fazer o service lançar um erro falso e checar que a resposta é genérica. Ele silencia o `console.error` durante o teste para não poluir a saída.
- O teste de isolamento altera o que `listar()` devolveu e confirma que os dados guardados continuam intactos.

---

## 10. Falhas encontradas na revisão e como foram corrigidas

| Falha | Onde | Correção |
|-------|------|----------|
| `GET /pedidos/01` devolvia o pedido 1 | service | Regex do id passou a `/^[1-9]\d*$/` |
| Corpo grande demais virava **500** | errorHandler | Tabela `ERROS_DE_CORPO` com 413/415 |
| Corpo que não era objeto JSON (texto, array) gerava mensagem enganosa sobre "cliente" | service | Checagem explícita do corpo com mensagem própria |
| Quem recebia a lista ou um pedido podia alterar os dados internos | service | `copiar()` em toda saída |
| Id gigante (acima do inteiro seguro) dependia de comparação imprecisa | service | `Number.isSafeInteger` |
| Porta ocupada derrubava o servidor com erro confuso | server | Callback do `listen` trata o erro e sai com mensagem clara |
| Erro após resposta já enviada podia causar falha dupla | errorHandler | Verificação de `res.headersSent` |
| Pasta `evidencias/` vazia não sobe para o GitHub | repositório | Arquivo `.gitkeep` |
| Sem versão mínima do Node declarada | package.json | `"engines": { "node": ">=18" }` (o Express 5 exige) |
