# Central das IAs

Site pessoal com a bancada de chips: cada chip guarda a personalidade de uma IA. Ao tocar em um chip, ele entra no
leitor, a tela faz a sequência de carregamento (máscara → faíscas → partículas → rosto → corpo trocando de cor → nome
novo) e abre o prompt completo com o botão **Copiar**.

## Como adicionar ou trocar uma IA

1. Coloque o prompt completo em `ias/prompts/<id>.md`.
2. (Opcional) Coloque o rosto em `ias/rostos/` e aponte o campo `rosto` para ele. Fundo escuro funciona melhor: as
   partes claras viram o holograma.
3. Acrescente ou edite o bloco correspondente em `ias/lista.js`.

## Rodar no computador

O site é só HTML, CSS e JavaScript, sem build. Como os prompts são lidos por `fetch`, ele precisa de um servidor local:

```
python3 -m http.server 8000
```

e abrir `http://localhost:8000`.

## Créditos dos modelos 3D

- `modelos/DamagedHelmet.glb`: "Battle Damaged Sci-fi Helmet - PBR", de theblueturtle_, licença Creative Commons
  Attribution-NonCommercial 4.0 (Khronos glTF Sample Assets).
- `modelos/BrainStem.glb`: robô BrainStem, © Smith Micro Software (Poser EULA) e ctxwing (CC BY 4.0)
  (Khronos glTF Sample Assets).
- `modelos/LeePerrySmith.glb`: cabeça de Lee Perry-Smith, licença Creative Commons Attribution 3.0, tirada dos
  exemplos do three.js.
