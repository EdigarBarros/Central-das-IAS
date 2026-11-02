# Central das IAs

Site pessoal com a bancada de chips: cada chip guarda a personalidade de uma IA. Ao tocar em um chip, ele entra no
leitor, a tela faz a sequência de carregamento (máscara → faíscas → partículas → rosto → corpo trocando de cor → nome
novo) e abre o prompt completo com o botão **Copiar**.

## Senha e prompts trancados

O site abre com uma tela de senha. Os prompts ficam criptografados em `ias/trancados/` (AES-GCM, chave derivada da
senha por PBKDF2), então o repositório pode ser público sem expor nada: o site destranca no próprio aparelho.
Os prompts abertos (`ias/prompts/*.md`) ficam só no computador e não vão para o GitHub.

O link pessoal leva a senha depois do `#` (`/#acesso=SENHA`) e abre o site direto, sem tela de senha. A parte
depois do `#` não é enviada a nenhum servidor.

## Como adicionar ou trocar uma IA

1. Coloque o prompt completo em `ias/prompts/<id>.md`.
2. Tranque os prompts: `SENHA='a-senha' node scripts/trancar.mjs` (gera `ias/trancados/<id>.json`).
3. (Opcional) Coloque o rosto em `ias/rostos/` e aponte o campo `rosto` para ele. Fundo escuro funciona melhor: as
   partes claras viram o holograma.
4. Acrescente ou edite o bloco correspondente em `ias/lista.js`.

## Rodar no computador

O site é só HTML, CSS e JavaScript, sem build. Como os prompts são lidos por `fetch`, ele precisa de um servidor local:

```
python3 -m http.server 8000
```

e abrir `http://localhost:8000`.

## Créditos dos modelos 3D

Os modelos são carregados direto dos repositórios de origem pelo jsDelivr (veja `MODELOS` em `js/holograma.js`).


- DamagedHelmet: "Battle Damaged Sci-fi Helmet - PBR", de theblueturtle_, licença Creative Commons
  Attribution-NonCommercial 4.0 (Khronos glTF Sample Assets).
- BrainStem: robô BrainStem, © Smith Micro Software (Poser EULA) e ctxwing (CC BY 4.0)
  (Khronos glTF Sample Assets).
- LeePerrySmith: cabeça de Lee Perry-Smith, licença Creative Commons Attribution 3.0, tirada dos
  exemplos do three.js.
