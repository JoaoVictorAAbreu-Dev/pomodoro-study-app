# Direção premium · Glassmorphism

Preservamos as quatro páginas, a hierarquia bento, as fotos e a marca aprovada. O mesh de baixa saturação e o ruído estático dão profundidade. Vidro aparece somente na navegação e no cronômetro: no máximo duas superfícies com backdrop-filter. Os demais cards permanecem sólidos para leitura. O menu flutua e se desloca 3–4 px com o scroll. CTAs têm glow suave e brilho que acompanha o mouse, limitado por requestAnimationFrame. A busca de rádio usa skeletons. Não há parallax nem dependências novas.

## Tokens

| Token | Valor |
|---|---|
| Texto | `#203E35` |
| Texto secundário | `#4E6056` |
| Ação | `#C7493A`, texto branco |
| Fundo | `#F7F6F2`, mesh `#DCE7DE` / `#EEE1D9` |
| Vidro | branco 88% |
| Fallback | `#F5F7F2` |
| Borda | branca 76%, 1 px |
| Blur | 16 px |
| Raio | 22 px |
| Sombra | `0 12px 36px rgb(32 62 53 / 8%)` |
| Glow | `0 4px 18px rgb(199 73 58 / 18%)` |
| Movimento | 220 ms, `cubic-bezier(.2,.7,.2,1)` |

## Fontes consultadas

- [MDN: backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter): exige superfície parcialmente transparente; suporte moderno, com fallback via @supports para versões antigas.
- [web.dev: animações eficientes](https://web.dev/articles/animations-guide): priorizar transform e opacity e verificar repinturas no profiler.
- [MDN: movimento reduzido](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion): desligar animações e brilho decorativo conforme preferência do sistema.

## Riscos e validação

- **GPU/blur:** limitar a duas superfícies, sem animar blur. Validar no Performance/Rendering do DevTools, incluindo celular de entrada; avaliar frames perdidos durante scroll.
- **Contraste:** texto escuro sobre vidro branco 88% e áreas de leitura sólidas; foto recebe overlay escuro. Medir combinações renderizadas com ferramenta de contraste, incluindo hover, foco e imagem mais clara. Não há certificação completa WCAG nesta entrega.
- **Compatibilidade:** fallback sólido fora de @supports e preferência por transparência reduzida quando suportada. Conferir Chrome, Firefox e Safari reais; instalação PWA e áudio não foram validados em dispositivos físicos.
- **Movimento:** animações desligadas com prefers-reduced-motion; testar a preferência do sistema e teclado.
- **Integrações:** rádio/clima sujeitos à rede; mensagens de erro e skeletons presentes. Não há garantia de disponibilidade das estações.

## Evidência

15 testes automatizados de domínio e plataforma passaram antes do acabamento; executados novamente após a alteração visual. Navegação, tarefa, início, pausa, persistência após reload, reinício e seleção de ambiente foram exercitados no navegador. Nenhuma publicação remota foi feita.
