// Tranca (criptografa) os prompts para que possam ficar num repositório público.
//
//   SENHA='a-senha' node scripts/trancar.mjs
//
// Lê ias/prompts/*.md (que NÃO vão para o GitHub, ver .gitignore) e grava ias/trancados/*.json.
// O site pede a senha e destranca no próprio aparelho (AES-GCM com chave derivada por PBKDF2-SHA256).

import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const senha = process.env.SENHA;
if (!senha) { console.error('Defina a senha: SENHA=... node scripts/trancar.mjs'); process.exit(1); }

const ITERACOES = 310000;
const raiz = new URL('..', import.meta.url).pathname;
const origem = join(raiz, 'ias/prompts');
const destino = join(raiz, 'ias/trancados');
mkdirSync(destino, { recursive: true });

const b64 = (buf) => Buffer.from(buf).toString('base64');
const texto = new TextEncoder();

// Reaproveita o sal existente para a mesma senha continuar valendo.
const arqChave = join(destino, 'chave.json');
const sal = existsSync(arqChave)
  ? Buffer.from(JSON.parse(readFileSync(arqChave, 'utf8')).sal, 'base64')
  : crypto.getRandomValues(new Uint8Array(16));

const base = await crypto.subtle.importKey('raw', texto.encode(senha), 'PBKDF2', false, ['deriveKey']);
const chave = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt: sal, iterations: ITERACOES, hash: 'SHA-256' },
  base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
);

async function cifrar(conteudo) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, texto.encode(conteudo));
  return { iv: b64(iv), dados: b64(dados) };
}

// "verificador": serve só para o site saber se a senha está certa
writeFileSync(arqChave, JSON.stringify({ v: 1, sal: b64(sal), iteracoes: ITERACOES, verificador: await cifrar('central-das-ias') }, null, 2) + '\n');

for (const arq of readdirSync(origem).filter((a) => a.endsWith('.md'))) {
  const id = basename(arq, '.md');
  const conteudo = readFileSync(join(origem, arq), 'utf8');
  writeFileSync(join(destino, id + '.json'), JSON.stringify(await cifrar(conteudo)) + '\n');
  console.log('trancado:', id, conteudo.length, 'caracteres');
}
