// Tela de senha e destrancamento dos prompts (que ficam criptografados em ias/trancados/).
// A senha nunca sai do aparelho: ela gera a chave aqui mesmo e abre os arquivos.

const CHAVE_LEMBRAR = 'central-ias:senha';
const de64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const texto = new TextEncoder();
const leitor = new TextDecoder();

let config = null;
async function lerConfig() {
  if (!config) {
    const r = await fetch('ias/trancados/chave.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('Arquivo ias/trancados/chave.json não encontrado');
    config = await r.json();
  }
  return config;
}

async function derivarChave(senha) {
  const c = await lerConfig();
  const base = await crypto.subtle.importKey('raw', texto.encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: de64(c.sal), iterations: c.iteracoes, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
}

async function abrir(chave, pacote) {
  const dados = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: de64(pacote.iv) }, chave, de64(pacote.dados));
  return leitor.decode(dados);
}

async function testar(senha) {
  try {
    const chave = await derivarChave(senha);
    const c = await lerConfig();
    return (await abrir(chave, c.verificador)) === 'central-das-ias' ? chave : null;
  } catch (e) {
    return null;
  }
}

// Mostra a tela de senha (se preciso) e devolve a chave quando a senha estiver certa.
export async function abrirCofre() {
  const tela = document.getElementById('cofre');
  const form = document.getElementById('cofreForm');
  const campo = document.getElementById('cofreSenha');
  const lembrar = document.getElementById('cofreLembrar');
  const aviso = document.getElementById('cofreAviso');
  const botao = document.getElementById('cofreEntrar');

  let salva = null;
  try { salva = localStorage.getItem(CHAVE_LEMBRAR); } catch (e) { /* sem armazenamento */ }
  if (salva) {
    const chave = await testar(salva);
    if (chave) { tela.hidden = true; return chave; }
    try { localStorage.removeItem(CHAVE_LEMBRAR); } catch (e) { /* nada */ }
  }

  tela.hidden = false;
  campo.focus();
  return new Promise((ok) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const senha = campo.value;
      if (!senha) return;
      botao.disabled = true;
      aviso.textContent = 'Verificando...';
      const chave = await testar(senha);
      botao.disabled = false;
      if (!chave) {
        aviso.textContent = 'Senha incorreta.';
        campo.select();
        tela.querySelector('.cofre-caixa').animate(
          [{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }],
          { duration: 300 }
        );
        return;
      }
      if (lembrar.checked) { try { localStorage.setItem(CHAVE_LEMBRAR, senha); } catch (e2) { /* nada */ } }
      aviso.textContent = '';
      tela.classList.add('saindo');
      setTimeout(() => { tela.hidden = true; }, 450);
      ok(chave);
    });
  });
}

export async function lerPrompt(chave, id) {
  const r = await fetch(`ias/trancados/${id}.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Não encontrei ias/trancados/${id}.json`);
  return abrir(chave, await r.json());
}

export function esquecerSenha() {
  try { localStorage.removeItem(CHAVE_LEMBRAR); } catch (e) { /* nada */ }
}
