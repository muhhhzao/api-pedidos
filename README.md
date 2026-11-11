# API de Gerenciamento de Pedidos

API REST para controlar os pedidos de uma pequena loja. Feita com **Node.js + Express**, organizada em camadas (routes, controllers e services), com validação de dados, tratamento de erros e testes automatizados com Jest.

Os pedidos ficam guardados **em memória**: ao reiniciar o servidor, a lista começa vazia de novo. O enunciado permite isso, e assim o projeto roda em qualquer máquina sem precisar instalar banco de dados.

- **Aluno:** [Murillo Mello Rodrigues]
- **Aluno:** [Giulia Rodrigues Daniel]
- **Aluno:** [Kethelyn Carolyne Silva]
- **Aluno:** [João Luigi Bovollon Shimada]

---

## Como rodar

Pré-requisitos: Node.js e npm instalados.

```bash
# 1. clonar o repositório
git clone https://github.com/muhhhzao/api-pedidos
cd api-pedidos

# 2. instalar as dependências
npm install

# 3. iniciar a API
npm start
```

A API sobe em `http://localhost:3000`. Se a porta 3000 estiver ocupada, use outra:

```bash
PORT=4000 npm start          # Linux/Mac
set PORT=4000 && npm start   # Windows (cmd)
```

Para rodar os testes:

```bash
npm test
```

---

## Regras do negócio

**Tipos de pedido válidos:** `entrega`, `retirada`

**Prioridades válidas:** `baixa`, `normal`, `alta`

**Status possíveis:** `recebido`, `em_preparacao`, `enviado`, `entregue`, `cancelado`

Todo pedido novo nasce com status `recebido`.

### Transições de status permitidas

| Status atual    | Pode ir para                 |
|-----------------|------------------------------|
| `recebido`      | `em_preparacao`, `cancelado` |
| `em_preparacao` | `enviado`, `cancelado`       |
| `enviado`       | `entregue`                   |
| `entregue`      | (nenhuma, status final)      |
| `cancelado`     | (nenhuma, status final)      |

A lógica é a de um pedido real: ele avança passo a passo e só dá para cancelar antes de sair para entrega. Pular etapas (por exemplo `recebido` direto para `entregue`) ou mexer em pedido já finalizado devolve erro 400.

### Validações do cadastro

- `cliente`: texto obrigatório. Espaços nas pontas são removidos, e um texto só com espaços conta como vazio.
- `valor`: precisa ser **número** maior que zero. O texto `"350"` é rejeitado, só `350` é aceito.
- `tipo` e `prioridade`: precisam estar nas listas acima, escritos exatamente assim, em minúsculas (`Entrega` é rejeitado).
- O corpo da requisição precisa ser um objeto JSON (com o cabeçalho `Content-Type: application/json`).

---

## Rotas

| Método | Rota                      | O que faz                  | Respostas      |
|--------|---------------------------|----------------------------|----------------|
| POST   | `/pedidos`                | Cadastra um pedido         | 201, 400       |
| GET    | `/pedidos`                | Lista todos os pedidos     | 200            |
| GET    | `/pedidos/:id`            | Busca um pedido pelo id    | 200, 404       |
| PATCH  | `/pedidos/:id/status`     | Atualiza o status          | 200, 400, 404  |

### Exemplos

**Criar pedido**

```http
POST /pedidos
Content-Type: application/json

{
  "cliente": "Carlos Silva",
  "tipo": "entrega",
  "valor": 350,
  "prioridade": "normal"
}
```

Resposta `201 Created`:

```json
{
  "id": 1,
  "cliente": "Carlos Silva",
  "tipo": "entrega",
  "valor": 350,
  "prioridade": "normal",
  "status": "recebido"
}
```

**Pedido inválido** (cliente vazio) → `400 Bad Request`:

```json
{ "erro": "O campo \"cliente\" é obrigatório e não pode ser vazio." }
```

**Buscar pedido que não existe** (`GET /pedidos/999`) → `404 Not Found`:

```json
{ "erro": "Pedido com id \"999\" não encontrado." }
```

**Atualizar status**

```http
PATCH /pedidos/1/status
Content-Type: application/json

{ "status": "em_preparacao" }
```

Resposta `200 OK`: o pedido completo com o status novo.

**Transição inválida** (`recebido` → `entregue`) → `400 Bad Request`:

```json
{ "erro": "Não é possível mudar de \"recebido\" para \"entregue\". Transições permitidas: em_preparacao, cancelado." }
```

### Resumo dos códigos de erro

| Código | Quando acontece |
|--------|-----------------|
| 400    | Dados inválidos, status desconhecido, transição não permitida, corpo que não é um objeto JSON ou JSON malformado |
| 404    | Pedido inexistente (inclusive id inválido como `abc`, `0` ou `01`) ou rota que não existe |
| 413    | Corpo da requisição grande demais (limite padrão de 100 KB) |
| 415    | Codificação ou compressão do corpo não suportada (use UTF-8) |
| 500    | Erro inesperado do servidor. A mensagem é genérica e o detalhe fica só no log |

Toda resposta de erro tem o formato `{ "erro": "mensagem explicativa" }`.

---

## Arquitetura

```
src/
├── server.js                  # só liga o servidor na porta
├── app.js                     # monta o Express: JSON, rotas e tratamento de erros
├── routes/
│   └── pedidos.routes.js      # liga método + URL ao controller
├── controllers/
│   └── pedidos.controller.js  # lê a requisição, chama o service, devolve o status HTTP
├── services/
│   └── pedidos.service.js     # regras de negócio, validações e dados em memória
├── errors/
│   └── AppError.js            # ValidationError (400) e NotFoundError (404)
└── middlewares/
    └── errorHandler.js        # transforma qualquer erro em resposta JSON
tests/
└── pedidos.test.js            # testes automatizados
evidencias/                    # prints do Postman
DOCUMENTACAO-CODIGO.md         # passo a passo de cada arquivo (o código não tem comentários)
```

Uma explicação detalhada de cada arquivo, na ordem em que a requisição o atravessa, está em [`DOCUMENTACAO-CODIGO.md`](./DOCUMENTACAO-CODIGO.md).

### Quem faz o quê

| Camada      | Responsabilidade | Não deve fazer |
|-------------|------------------|----------------|
| **Routes**      | Dizer qual controller atende cada método e URL | Ter qualquer regra ou lógica |
| **Controller**  | Ler `req`, chamar o service, responder com `res` | Validar dados ou mexer na lista de pedidos |
| **Service**     | Validar, aplicar regras de transição, guardar e buscar pedidos | Conhecer `req`/`res` ou códigos HTTP |

### Como um erro percorre a aplicação

1. O **service** detecta o problema e lança `ValidationError` (400) ou `NotFoundError` (404).
2. O **controller** captura e repassa com `next(err)`.
3. O **errorHandler** decide a resposta: erros conhecidos usam o status do próprio erro; qualquer outra coisa vira 500 com mensagem genérica. Assim um bug nosso nunca é confundido com um erro de validação do usuário.

### Decisões técnicas

- **`app.js` separado de `server.js`:** o Supertest consegue importar o `app` sem abrir uma porta de verdade, e os testes ficam rápidos.
- **Erros com classes próprias:** o service não precisa saber nada de HTTP. Ele só diz *o que* deu errado e o status vem junto no erro.
- **No PATCH, a ordem é 404 antes de 400:** primeiro confirma que o pedido existe, depois valida o corpo.
- **ID aceito apenas como inteiro positivo sem zero à esquerda (`/^[1-9]\d*$/`):** `abc`, `0`, `01`, `1.5` ou `-1` caem em 404 em vez de causar comportamento estranho.
- **Armazenamento em memória:** um array dentro do service, com um contador para gerar os ids.
- **O service devolve cópias dos pedidos:** quem recebe o resultado não consegue alterar os dados guardados sem passar pelas regras de negócio.
- **Erros de leitura do corpo têm status próprio:** JSON malformado é 400, corpo grande demais é 413 e codificação não suportada é 415. Nenhum deles vira 500.

---

## Testes

Os testes usam **Jest** com **Supertest** e fazem requisições reais contra o `app`, sem precisar subir o servidor.

```bash
npm test
```

Cenários cobertos (50 testes):

- Criação válida (201), ids sequenciais e remoção de espaços no nome do cliente
- Criação inválida (400): cliente vazio, só espaços, ausente ou que não é texto; valor negativo, zero, em texto, ausente ou infinito; tipo e prioridade desconhecidos, ausentes ou com maiúscula; JSON malformado; corpo ausente, em array ou que não é JSON
- Corpo grande demais (413) e pedido que não é salvo quando a validação falha
- Listagem vazia e com itens, e isolamento dos dados internos
- Consulta por id existente (200), inexistente (404) e ids inválidos como `abc`, `0`, `01`, `-1` e `1.5` (404)
- Atualização de status: transição válida e persistida, cancelamento, status desconhecido, ausente ou que não é texto, transição inválida, mesmo status repetido, pedido em status final, id inexistente (404 antes de 400) e fluxo completo até `entregue`
- Rota inexistente e método não previsto (404 em JSON) e erro inesperado (500 sem vazar detalhes)

Os testes manuais com Postman estão na pasta [`evidencias/`](./evidencias):

| Arquivo | Cenário |
|---------|---------|
| `01-criacao.png` | POST válido, resposta 201 |
| `02-validacao.png` | POST inválido, resposta 400 |
| `03-listagem.png` | GET da lista de pedidos |
| `04-consulta-inexistente.png` | GET de id inexistente, resposta 404 |
| `05-atualizacao.png` | PATCH de status válido |

---

## Uso de IA

**Utilizei IA?** Sim, o Claude (Anthropic).

**Para quais tarefas:**
- Montar o roteiro do projeto e a ordem de implementação.
- Gerar a base do código (camadas, middleware de erros e testes) e este README.
- Tirar dúvidas sobre o que cada camada deve ou não fazer.

**Sugestões aceitas, modificadas ou rejeitadas:**

- **Aceita: separar `app.js` e `server.js`.** A IA sugeriu essa divisão e eu aceitei porque permite testar a API com Supertest sem abrir porta, o que deixa os testes mais simples e rápidos.
- **Aceita: classes `ValidationError` e `NotFoundError`.** Concordei porque mantém o service livre de conceitos de HTTP: ele só lança o erro e o middleware escolhe o status.
- **Aceita: dados em memória em vez de banco de dados.** O enunciado permite, e um banco aumentaria o tempo e o risco sem melhorar o que está sendo avaliado.
- **[AJUSTE: escreva aqui uma sugestão que VOCÊ modificou ou rejeitou, com o motivo. Exemplo: "Modifiquei as transições de status: a IA permitia cancelar a partir de `enviado`, mas eu removi porque um pedido que já saiu para entrega não deveria ser cancelado pelo sistema."]**

**Como validei o código:** li cada arquivo, rodei `npm test` e testei os cenários manualmente no Postman, conferindo se as respostas batiam com o que está documentado aqui.
