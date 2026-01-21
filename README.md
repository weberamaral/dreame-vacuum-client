# Dreame Vacuum Client (Cloud)

Cliente simples em Node.js para controle de robôs aspiradores **Dreame Home**
via **Dreame Cloud**, usando apenas HTTP (sem MQTT, sem acesso local).

Este projeto foi criado como base sólida para:

- testes
- entendimento da API Dreame
- futura integração com Matter / Matterbridge

---

## ✨ Funcionalidades

- Login via Dreame Cloud
- Persistência de **refresh token** (`auth.json`)
- Leitura de estado via `iotstatus/props`
- Comandos via **MIoT Action (cloud)**:
  - Start / Resume
  - Pause
  - Stop
  - Home (retornar à base)
- Confirmação de comandos baseada em **mudança real de estado**
- CLI simples para testes manuais

---

## 📦 Requisitos

- Node.js **18+** (usa `fetch` nativo)
- Conta no app **Dreame Home**
- Robô Dreame vinculado à conta

---

## 🚀 Primeira execução

Na primeira execução, o projeto pedirá **username e senha** apenas uma vez.

```bash
npm run status
```

Isso irá:

1. Fazer login no Dreame Cloud
2. Salvar o refreshToken em src/auth.json
3. Listar o device
4. Mostrar o estado atual do robô

⚠️ A senha não é salva. Apenas o refresh token fica em disco.

## 🔑 Autenticação

O arquivo src/auth.json contém apenas:

- refreshToken
- tenantId
- metadados básicos

Ele é usado automaticamente nas próximas execuções.

## 🕹️ Comandos disponíveis (CLI)

```bash
npm run status        # estado atual
npm run start:clean  # iniciar limpeza
npm run pause         # pausar
npm run resume        # retomar limpeza
npm run stop          # parar
npm run home          # voltar para base
npm run watch         # imprimir estado a cada 2s
```

## 📊 Estados interpretados

O estado é derivado de iotstatus/props:

- running → robô limpando
- paused → robô pausado
- docked → robô na base
- batteryPercent
- error (quando existir)

O retorno do cloud (code: 80001) não é tratado como falha.
O sucesso real é confirmado pela mudança de estado.

## 🧠 Arquitetura

- dreameClient.js
  - Comunicação direta com Dreame Cloud
  - Login, leitura de estado e envio de comandos

- dreameController.js
  - Camada de alto nível (controller)
  - Métodos: start, pause, resume, stop, home, status

- index.js
  - CLI
  - Interface para testes manuais

Essa separação facilita a migração futura para:

- Matterbridge
- Home Assistant
- Outros hubs

## 🔮 Próximos passos (planejados)

- Encapsular o controller como serviço
- Mapear estados para Matter RVC clusters
- Criar plugin para Matterbridge
- Expor comandos via Matter

## ⚠️ Observações importantes

- A API Dreame Cloud nem sempre retorna sucesso imediato (80001)
- O robô pode executar o comando mesmo assim
- Por isso, este projeto valida tudo via polling de estado
- Esse comportamento é normal para o backend Dreame.

## 📜 Licença

Uso educacional / experimental.
Sem afiliação oficial com Dreame.
