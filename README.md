# Novas Regras

Manifesto de estudantes de design por regras mais justas nos prêmios de design.

- `index.html`: a página (HTML, CSS e JS sem build).
- `api/assinaturas.js`: função do Vercel que lê e grava assinaturas no Vercel Blob.
  - `GET /api/assinaturas` devolve a lista pública (sem e-mails).
  - `POST /api/assinaturas` com `{ nome, email, ocupacao, instituicao, cidade }` grava ou atualiza uma assinatura (uma por e-mail).

Os e-mails ficam em `contatos/` no Blob e nunca são enviados ao navegador.
Para remover uma assinatura, apague o arquivo correspondente em `assinaturas/` no painel do Blob.
