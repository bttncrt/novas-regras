import { put, list } from "@vercel/blob";
import { createHash } from "node:crypto";

// Assinaturas ficam no Vercel Blob, uma por arquivo:
//   assinaturas/<hash>.json  -> dados públicos (nome, ocupação, instituição, cidade, data)
//   contatos/<hash>.json     -> e-mail, nunca enviado ao navegador
// O <hash> vem do e-mail, então cada e-mail tem uma única assinatura;
// enviar de novo atualiza os dados e mantém a posição na lista.

const FUNDADORES = [
  {
    nome: "Rafael Bittencourt",
    ocupacao: "Designer",
    instituicao: "Meiuca",
    cidade: "São Paulo",
    criadoEm: 1795191000000,
  },
];

const LIMITES = { nome: 120, email: 120, ocupacao: 80, instituicao: 120, cidade: 80 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function limpa(v, max) {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function hashDe(email) {
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 40);
}

async function listaTudo(prefix) {
  const blobs = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return blobs;
}

async function leJson(blob) {
  const v = new Date(blob.uploadedAt).getTime();
  const r = await fetch(`${blob.url}?v=${v}`, { cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

async function emLotes(itens, tamanho, fn) {
  const out = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    out.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  }
  return out;
}

async function getAssinaturas(res) {
  const blobs = await listaTudo("assinaturas/");
  const dados = await emLotes(blobs, 25, (b) => leJson(b).catch(() => null));
  const publicas = dados
    .filter(Boolean)
    .map((d) => ({
      nome: limpa(d.nome, LIMITES.nome),
      ocupacao: limpa(d.ocupacao, LIMITES.ocupacao),
      instituicao: limpa(d.instituicao, LIMITES.instituicao),
      cidade: limpa(d.cidade, LIMITES.cidade),
      criadoEm: Number(d.criadoEm) || 0,
    }));
  const todas = [...FUNDADORES, ...publicas].sort((a, b) => a.criadoEm - b.criadoEm);
  res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=30");
  res.status(200).json({ total: todas.length, assinaturas: todas });
}

async function postAssinatura(req, res) {
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Campo isca: pessoas não veem; robôs costumam preencher.
  if (limpa(body.site, 200)) return res.status(200).json({ ok: true });

  const v = {};
  for (const k of Object.keys(LIMITES)) v[k] = limpa(body[k], LIMITES[k]);
  const faltando = Object.keys(LIMITES).filter((k) => !v[k]);
  if (faltando.length) {
    return res.status(400).json({ erro: "Preencha todos os campos para assinar." });
  }
  if (!EMAIL_RE.test(v.email)) {
    return res.status(400).json({ erro: "Confira o e-mail: ele precisa ter o formato nome@dominio.com." });
  }

  const id = hashDe(v.email);
  const caminho = `assinaturas/${id}.json`;

  let criadoEm = Date.now();
  const existente = (await list({ prefix: caminho, limit: 1 })).blobs.find((b) => b.pathname === caminho);
  if (existente) {
    const antigo = await leJson(existente).catch(() => null);
    if (antigo && Number(antigo.criadoEm)) criadoEm = Number(antigo.criadoEm);
  }

  const opcoes = {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  };
  await put(`contatos/${id}.json`, JSON.stringify({ email: v.email, nome: v.nome, atualizadoEm: Date.now() }), opcoes);
  await put(
    caminho,
    JSON.stringify({ nome: v.nome, ocupacao: v.ocupacao, instituicao: v.instituicao, cidade: v.cidade, criadoEm }),
    opcoes
  );

  res.status(existente ? 200 : 201).json({ ok: true, atualizada: !!existente });
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") return await getAssinaturas(res);
    if (req.method === "POST") return await postAssinatura(req, res);
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ erro: "Método não permitido." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: "A assinatura não foi enviada. Tente de novo em alguns instantes." });
  }
}
