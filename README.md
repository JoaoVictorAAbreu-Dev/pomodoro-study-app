# Pomodoro Study

PWA de estudos em HTML, CSS e JavaScript, sem dependências de runtime. Quatro páginas: Foco, Plano de estudos, Progresso e Ambientes. Identidade C — Recorte, com maçã e relógio.

## Executar

Node 22 ou superior:

```sh
npm start
npm test
npm run check
```

Abra http://localhost:4318. Para outra porta: `PORT=4320 npm start`. Para hospedagem estática, publique o conteúdo de `pomodoro-pwa/` em HTTPS. Não é necessário build.

## Organização

- `src/model.js`: regras do cronômetro, migração, histórico e exportação; funções testáveis sem navegador.
- `src/app.js`: interação e renderização das quatro páginas.
- `src/services.js`: rádio, clima e aviso sonoro.
- `styles.css`: layout responsivo e componentes.
- `glass.css` e `src/glass.js`: tokens e aprimoramentos visuais progressivos.
- `sw.js`: cache offline exclusivo do escopo da aplicação. Incremente a versão a cada publicação; feche as abas anteriores para ativar atualizações.

## Comportamento e dados

A pausa longa ocorre após quatro focos completos. Cada sessão guarda sua duração e tarefa originais. Ao retornar de uma aba suspensa, o app reconcilia o intervalo vencido sem inventar ciclos adicionais. Avisos dependem de o navegador manter o app ativo; não há agendamento com o app fechado.

Os dados ficam no armazenamento local. A migração preserva os contadores antigos, cuja duração é desconhecida. As chaves antigas são mantidas. A exportação Markdown permite guardar uma cópia e importar no Notion. A antiga integração via proxy público foi removida; o app não lê nem envia o token antigo.

Rádio e clima precisam de internet. Localização só é solicitada ao clicar em Ver clima. Fotos e fontes são locais e entram no cache offline. Web Locks coordena alterações entre abas nos navegadores que oferecem suporte.

## Design

[Figma: telas editáveis](https://www.figma.com/design/jsSzBLThSs0nURl605Y0HD?node-id=12-2). O arquivo contém a direção editorial anterior ao acabamento glassmorphism; a atualização final no Figma ficou pendente por limite de uso da revisão automática.

Consulte `DESIGN.md` para tokens, decisões, riscos e limites da validação.

## YouTube em Ambientes

Cole um link HTTPS de vídeo, live, Shorts ou playlist no campo YouTube. O player oficial usa reprodução manual, sem chave de API e sem dependências novas. Abrir o YouTube interrompe a rádio; escolher uma rádio fecha o YouTube. Ao sair de Ambientes ou ocultar a aba, o iframe é removido para evitar reprodução escondida. O link permanece no campo enquanto a página estiver aberta. Não há extração de áudio, download ou funcionamento offline; restrições de incorporação são determinadas pelo YouTube e pelo proprietário do vídeo.

Referências: [player oficial](https://developers.google.com/youtube/player_parameters), [políticas](https://developers.google.com/youtube/terms/developer-policies-guide).

### Busca do YouTube por nome

Em Ambientes, abra **Configurar busca do YouTube**, insira uma chave restrita da YouTube Data API v3 e faça a busca. A chave permanece somente no campo da página: não é persistida, incluída no repositório nem armazenada pelo service worker. Recarregar exige inseri-la novamente. A busca envia a chave e o termo diretamente ao Google; miniaturas são carregadas do YouTube.

Restrinja a chave no Google Cloud à YouTube Data API v3 e aos HTTP referrers locais/produção usados pelo app. Uma chave usada no frontend é visível nas requisições: restrições são essenciais. Revogue chaves compartilhadas em chats. Não cole credenciais no código.

Busca manual, seis resultados por envio, timeout de 15 segundos e mensagens para falhas de rede, cota e configuração. A reprodução continua no player oficial visível, sem extrair áudio. Documentação: https://developers.google.com/youtube/data/reference/rest/v3/search/list

## Stack e desenvolvimento

A aplicação usa Vite para desenvolvimento e build da PWA, TypeScript estrito nos módulos de domínio e roteamento, e JavaScript modular na interface em migração. Node.js 22+ executa as ferramentas e os testes nativos. Não há framework de interface: preservamos o HTML/CSS acessível e o service worker existente.

```bash
npm install
npm run start
npm run check
npm run build
npm test
```

O build gera a versão de produção em `dist/`; sirva esse diretório em hospedagem estática compatível com service workers. `npm run preview` abre o build localmente.
