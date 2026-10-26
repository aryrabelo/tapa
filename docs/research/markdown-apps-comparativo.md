# Comparativo: editores de Markdown para desktop em 2026 e onde fica o Tapa

> Pesquisa feita em 26/10/2026. As fontes são primárias sempre que possível: site oficial, documentação, changelog, GitHub. Quando um dado só aparece num comparativo de terceiros, o texto diz isso. **n/d** quer dizer que não encontrei documentação, não que o recurso não existe. `[INFERÊNCIA]` marca conclusão minha, sem fonte direta.

## Resumo

O Tapa ganha de todos os concorrentes pesquisados em leveza. O `.dmg` tem cerca de 5 MB ([README][tp-readme]). O do Obsidian tem 235 MB ([release 1.14.5][ob-rel]), o do Zettlr 201 MB ([release 4.9.0][zt-rel]) e o do SoloMD, o concorrente mais leve, de 15 a 32 MB ([README do SoloMD][so-gh]).

O Tapa também mostra "o que mudou" em frases simples, sem precisar de Git ([CHANGELOG 0.7.0][tp-chg]). Só que essa ideia já não é exclusiva dele. O Wymark faz *track changes* no estilo do Word por cima de commits Git e versões salvas, com aceitar/rejeitar em cada mudança ([wymark.app][wy-home]). O SoloMD manda cada escrita de um agente para um branch próprio, que você aceita ou rejeita ([README do SoloMD][so-gh]). O iA Writer pinta de outra cor o texto que veio da IA ([Authorship][ia-auth]).

As maiores lacunas do Tapa, pensando em leigos que usam IA, são:
1. revisar e desfazer cada mudança da IA ali mesmo no texto;
2. histórico de versões que dá para restaurar;
3. edição visual de tabelas;
4. exportar para PDF e Word;
5. Mermaid, porque a IA gera muito diagrama.

## Apps cobertos

| App | O que é | Situação em 2026 |
|---|---|---|
| **Typora** | Editor WYSIWYG pago, para Mac, Windows e Linux | Versão 1.12 adaptada ao macOS 26 ([1.12][ty-112]); a 1.14.x já existe ([issue #6671][ty-6671]) |
| **iA Writer** | Editor de texto puro focado em escrita, para Mac, Windows, iOS e Android | 7.x com Authorship ([ia.net/writer][ia-home]) |
| **Obsidian** | Base de conhecimento local, feita em Electron | 1.12 trouxe a CLI ([changelog][ob-112]); 1.13 (Electron 43) ([changelog][ob-113]); última versão 1.14.5 ([release][ob-rel]) |
| **MarkText** | WYSIWYG open source, feito em Electron | Voltou a ser mantido: v0.23.0 saiu em 21/10/2026 ([release][mt-023]). O fork de Tkaixiang foi incorporado ao repositório original ([Tkaixiang/marktext][mt-fork]) |
| **Zettlr** | Bancada acadêmica, com Pandoc e citações | v4.9.0 saiu em 25/10/2026 ([release][zt-rel]) |
| **Bear** | Notas em Markdown para Apple, com versão web | 2.8 trouxe MCP e CLI ([blog][br-28]); 2.9 ([blog][br-upd]); Bear Web 0.40 ([fórum][br-web]) |
| **Ulysses** | App de escrita só para Apple, por assinatura | Versão 42 de 23/10/2026 ([release notes][ul-rel]) |
| **SoloMD** | Editor Tauri da era da IA, com MCP embutido e AutoGit | 4.6 ([README][so-gh]) |
| **Wymark** | WYSIWYG com comentários e *track changes* para edições de IA | Beta público, só macOS 26 em Apple Silicon ([beta][wy-beta]) |
| **Ritemark** | Editor visual com Claude Code, Codex e OpenCode embutidos | Grátis, MIT, Mac e Windows ([ritemark.app][rm-home]) |
| **Tapa** | Leitor e editor ultraleve, Tauri + React + CodeMirror | 0.7.0, mais abas soltas ainda não lançadas ([CHANGELOG][tp-chg]) |

Outros nomes da era da IA, citados sem entrar na matriz:
- **Nimbalyst**: espaço de trabalho para agentes, com revisão visual de diffs em documentos renderizados ([blog][nb-diff], [nimbalyst.com][nb-home]).
- **MarkFlowy** e **Markra**: editores "AI-native"; o MarkFlowy é feito em Tauri ([Star History][sh-blog]).
- **Notion e editores locais no estilo Notion**: o mais próximo encontrado é o Tolaria, um editor de blocos sobre arquivos, mas só aparece no comparativo do SoloMD ([SoloMD compare][so-cmp]). Ficou de fora por falta de fonte primária.

## Matriz de recursos

Legenda: ✅ tem · ◐ parcial ou depende de condição · ❌ não tem · n/d sem documentação encontrada.

| Recurso | Typora | iA Writer | Obsidian | MarkText | Zettlr | Bear | Ulysses | SoloMD | Wymark | Ritemark | **Tapa** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Abas / vários arquivos** | ◐ abas nativas só no macOS; no Linux a interface com abas é pedido em aberto ([issue][ty-tabs]) | ✅ abas no Mac ([iA][ia-tabs]) | ✅ abas e painéis ([help][ob-tabs]) | ✅ barra de abas ([release 0.21.2][mt-rel]) | ✅ abas e tela dividida ([features][zt-feat]) | n/d | ✅ abas no macOS ([release notes 39.1][ul-rel]) | ✅ abas e painéis ([README][so-gh]) | n/d | n/d | ◐ arquivos soltos se acumulam na barra lateral como abas (não lançado) ([CHANGELOG][tp-chg]) |
| **Preview ao vivo vs WYSIWYG** | ✅ WYSIWYG ao vivo ([typora.io][ty-home]) | ◐ texto puro com Preview separado ([iA][ia-home]) | ✅ Live Preview ([features Zettlr][zt-feat]) | ✅ WYSIWYG ([site][mt-site]) | ✅ no lugar ou WYSIWYG ([features][zt-feat]) | ✅ esconde o Markdown ([Bear 2][br-2]) | ◐ editor baseado em marcação ([ulysses.app][ul-home]) | ✅ edição ao vivo e tela dividida ([README][so-gh]) | ✅ WYSIWYG + fonte ([wymark][wy-home]) | ✅ editor visual ([ritemark][rm-home]) | ✅ superfície sempre editável, símbolos escondidos ([CHANGELOG 0.4.0][tp-chg]) |
| **Edição de tabelas** | ✅ arrastar para redimensionar, reordenar, inserir com atalho ([typora.io][ty-home]) | ◐ Smart Tables: cálculo no Mac/iOS, formatação no Windows ([features][ia-feat]) | ✅ editor visual: botões de linha/coluna, arrastar, ordenar ([1.5][ob-15]) | ✅ tabelas montadas visualmente ([site][mt-site]) | ✅ table helper com navegação por Tab ([changelog][zt-chg]) | ✅ tabelas ([Bear 2][br-2]) | ✅ (citadas nas correções) ([release notes][ul-rel]) | n/d | n/d | ◐ editor de CSV ([ritemark][rm-home]) | ◐ tabela desenhada; clicar abre o código da tabela ([CHANGELOG 0.4.0][tp-chg]) |
| **Ver mudanças / diff / histórico** | ◐ versões do macOS; no Windows/Linux só recupera rascunhos ([suporte][ty-ver]) | ✅ Authorship (IA colorida) + versões do macOS via iCloud ([Authorship][ia-auth], [versões][ia-ver]) | ✅ snapshots locais a cada 5 min por 7 dias ([File recovery][ob-rec]); histórico do Sync (pago) ([help][ob-syncver]) | n/d | n/d | ❌ histórico por nota é pedido em aberto; só backup completo ([fórum][br-hist], [backup][br-bk]) | ✅ backups por hora, dia, semana e mês ([41.2][ul-rel]) | ✅ AutoGit a cada ⌘S; aceitar/rejeitar branch do agente ([README][so-gh]) | ✅ *track changes* com aceitar/rejeitar por mudança e comentários ([wymark][wy-home]) | ◐ revisar arquivos alterados por tarefa ([comparativo Ritemark][rm-cmp]) | ✅ frases adicionadas e removidas vs último commit ou cópia da abertura (`⌘⇧G`) ([CHANGELOG 0.7.0][tp-chg]) |
| **Git** | ❌ | n/d | ◐ plugin da comunidade com commit, histórico e diff ([obsidian-git][ob-git]) | ❌ | n/d | ❌ | ❌ | ✅ libgit2 embutido + sync com GitHub ([README][so-gh]) | ✅ lê commits como mudanças ([wymark][wy-home]) | n/d | ◐ só lê o último commit, não faz commit ([CHANGELOG][tp-chg]) |
| **Ajuda de IA** | ❌ ([comparativo Ritemark][rm-cmp]) | ◐ marca e rastreia texto de IA; Style Check no aparelho ([iA][ia-home]) | ◐ CLI 1.12 + plugins ([changelog][ob-112], [Ritemark][rm-cmp]) | ❌ | ◐ integração com Apple Intelligence ([features][zt-feat]) | ◐ servidor MCP, Claude Connector, BearCLI ([2.8][br-28]) | ◐ Siri AI / Writing Tools ([41][ul-rel]) | ✅ painel de agente, 14 provedores BYOK, receitas, MCP ([README][so-gh]) | ◐ revisa edições de agentes externos ([wymark][wy-home]) | ✅ Claude Code / Codex / OpenCode embutidos + terminal ([ritemark][rm-home]) | ◐ autocomplete local a partir das notas + `tapa-mcp` opcional ([README][tp-readme], [CHANGELOG 0.5.0][tp-chg]) |
| **Busca** | n/d | ✅ busca global no Mac/iOS; ❌ no Windows ([features][ia-feat]) | ✅ texto completo ([features Zettlr][zt-feat]) | n/d | ✅ texto completo ([features][zt-feat]) | ✅ + OCR em PDF/imagem (Pro) ([bear.app][br-home]) | ✅ busca no editor ([40][ul-rel]) | ✅ semântica ([README][so-gh]) | n/d | n/d | ✅ `⌘K` arquivos, `⌘⇧F` conteúdo, `⌘F` na nota ([README][tp-readme]) |
| **Exportar PDF/HTML/DOCX** | ✅ PDF com marcadores, DOCX, ePub, LaTeX… ([typora.io][ty-home]) | ✅ PDF, DOCX, HTML ([features][ia-feat]) | ◐ PDF nativo ([help][ob-pdf]); resto via plugins ([features Zettlr][zt-feat]) | ◐ PDF e HTML ([site][mt-site]) | ✅ todo formato do Pandoc (30+) ([features][zt-feat]) | ◐ TXT/MD/RTF grátis; PDF/HTML/DOCX no Pro ([bear.app][br-home]) | ✅ PDF, DOCX, ePub, HTML + publicar em blog ([ulysses.app][ul-home]) | ✅ Pandoc, DOCX, PDF, HTML ([README][so-gh]) | n/d | ✅ Word e PDF ([ritemark][rm-home]) | ❌ (PDF é a [issue #13][tp-13]) |
| **Temas** | ✅ CSS ([typora.io][ty-home]) | ◐ modelos para preview/exportação ([features][ia-feat]) | ✅ ([features Zettlr][zt-feat]) | ✅ 33 temas ([site][mt-site]) | ✅ ([features][zt-feat]) | ◐ 3 grátis, 28+ no Pro ([bear.app][br-home]) | ✅ ([39][ul-rel]) | n/d | n/d | n/d | ◐ claro/escuro/sistema ([README][tp-readme]) |
| **Foco / máquina de escrever** | ✅ ambos ([typora.io][ty-home]) | ✅ Focus Mode ([iA][ia-home]) | n/d (nativo) | ✅ ambos ([GitHub][mt-gh]) | ✅ typewriter ([changelog][zt-chg]) | n/d | ✅ marcador de linha + rolagem fixa ([39][ul-rel]) | n/d | n/d | n/d | ✅ frase em foco + linha centralizada (`⌘⇧D`) ([CHANGELOG 0.5.0][tp-chg]) |
| **Sync / celular** | ◐ pasta no Dropbox/iCloud; sem app de celular ([typora.io][ty-home], [SoloMD][so-cmp]) | ✅ iCloud/Dropbox/Drive/OneDrive; iOS e Android ([features][ia-feat]) | ✅ Sync pago + apps de celular ([pricing][ob-price]) | ❌ só desktop ([SoloMD][so-cmp]) | ❌ sem sync forçado ([zettlr.com][zt-home]) | ✅ iCloud (Pro) + web ([bear.app][br-home], [web][br-web]) | ✅ iCloud, só Apple ([ulysses.app][ul-home]) | ✅ GitHub + E2EE; iOS e Android ([README][so-gh]) | ❌ só macOS ([beta][wy-beta]) | ❌ Mac e Windows ([ritemark][rm-home]) | ❌ (issues [#12][tp-12], [#15][tp-15], [#16][tp-16]) |
| **Associação de arquivo / abrir rápido** | n/d | n/d | ◐ trabalha por *vault* | ✅ instalação via Homebrew/winget ([GitHub][mt-gh]) | n/d | ❌ biblioteca própria `[INFERÊNCIA]` | ❌ biblioteca própria ([ulysses.app][ul-home]) | ✅ CLI `solomd open` ([README][so-gh]) | n/d | n/d | ✅ associação `.md` no macOS, Finder/arrastar ([README][tp-readme], [CHANGELOG 0.6.0][tp-chg]) |
| **Tamanho / leveza** | ~70 MB instalador, medido pelo SoloMD ([SoloMD][so-cmp]) | nativo, tamanho n/d | `.dmg` 235 MB, Electron ([release][ob-rel], [1.13][ob-113]) | `.deb` 127 MB / AppImage 165 MB, Electron ([release][mt-023]) | `.dmg` arm64 201 MB, Electron ([release][zt-rel]) | nativo, n/d | nativo, n/d | 15 MB (x64) – 32 MB (`.dmg` universal), Tauri ([README][so-gh]) | n/d | n/d | **~5 MB `.dmg`; boot de ~27 KB gzip JS** ([README][tp-readme]) |
| **Plugins** | ❌ ([Ritemark][rm-cmp]) | ❌ | ✅ maior ecossistema ([Ritemark][rm-cmp]) | n/d | n/d | ❌ | ❌ | ❌ sem ecossistema de terceiros ([SoloMD][so-cmp]) | n/d | n/d | ◐ plugins internos por manifesto, só os do próprio app ([CHANGELOG 0.4.0][tp-chg]) |
| **Colar / gerenciar imagem** | ✅ arrastar, copiar para pasta, colar ([suporte][ty-img]) | ✅ imagens locais ([features][ia-feat]) | ✅ redimensionar, visualizador, limpar anexos ([1.12][ob-112], [1.13][ob-113]) | ✅ colar do clipboard ([GitHub][mt-gh]) | ✅ diálogo ao colar ([1.1][zt-img]) | ✅ redimensionar e cortar ([bear.app][br-home]) | ✅ ([40][ul-rel]) | ✅ colar em `_assets/` ([README][so-gh]) | n/d | n/d | ◐ só renderiza imagens ([README][tp-readme]) |
| **Sumário / outline** | ✅ painel + `[TOC]` ([typora.io][ty-home]) | ✅ Document Outline (Mac/iOS) ([features][ia-feat]) | ✅ painel de outline ([1.12][ob-112]) | n/d | n/d | ✅ sumário ([bear.app][br-home]) | ✅ outline ([42][ul-rel]) | ✅ painel Outline ([README][so-gh]) | n/d | n/d | ❌ |
| **Matemática / Mermaid** | ✅ MathJax + Mermaid ([typora.io][ty-home]) | ◐ equações no preview ([features][ia-feat]) | ✅ Mermaid 11.13 ([1.13][ob-113]) | ✅ KaTeX, Mermaid, Vega ([site][mt-site]) | ✅ LaTeX + Mermaid ([zettlr.com][zt-home]) | ✅ matemática (2025) e Mermaid (2026) ([math][br-math], [mermaid][br-mermaid]) | ◐ equações ([40][ul-rel]) | ✅ KaTeX + Mermaid ([README][so-gh]) | n/d | ◐ diagramas na exportação ([ritemark][rm-home]) | ❌ não é objetivo do projeto ([README][tp-readme]) |
| **Colaboração** | ❌ | ◐ cores por autor, sem tempo real ([iA][ia-what]) | ✅ vaults compartilhados (Sync) ([pricing][ob-price]) | ❌ | ❌ | ❌ | ❌ | ◐ link público só para leitura ([README][so-gh]) | ✅ comentários e respostas ([wymark][wy-home]) | ◐ comentários para o agente ([ritemark][rm-home]) | ❌ |
| **Preço** | US$ 14,99 uma vez ([features Zettlr][zt-feat]) | US$ 49,99 Mac / 29,99 Windows, uma vez ([preços][ia-price], [Ritemark][rm-cmp]) | grátis; Sync US$ 4–5/mês ([pricing][ob-price]) | grátis, MIT ([GitHub][mt-gh]) | grátis, open source ([zettlr.com][zt-home]) | grátis; Pro US$ 2,99/mês ou 29,99/ano ([bear.app][br-home]) | assinatura (US$ 39,99/ano no anúncio oficial) ([blog][ul-price], [ajuda][ul-sub]) | grátis, MIT ([README][so-gh]) | grátis ([beta][wy-beta]) | grátis, MIT ([ritemark][rm-home]) | grátis, MIT ([README][tp-readme]) |

## Onde os outros ganham do Tapa (ranking)

A ordem leva em conta duas coisas: o impacto para leigos que usam IA e o custo de manter o Tapa ultraleve. Esforço: **S** = dias, sem dependência pesada; **M** = uma a duas semanas, ou um chunk carregado só quando usado; **L** = muda a arquitetura ou exige serviço externo. As estimativas de esforço são `[INFERÊNCIA]` minha, com base na arquitetura descrita no [README][tp-readme].

1. **Revisar e desfazer cada mudança da IA dentro do texto**
   - **Quem faz melhor:** Wymark. Toda edição, venha de um commit, de uma versão salva ou de uma ferramenta, vira uma mudança no texto que você aceita ou rejeita uma por uma ([wymark.app][wy-home]). O SoloMD faz o mesmo no nível do agente, com um branch por execução ([README][so-gh]).
   - **Por que importa:** o leigo não lê lista de diff. Ele quer ver o trecho novo destacado no texto e um botão "desfazer só isso". Hoje o painel `⌘⇧G` do Tapa só lista as frases ([CHANGELOG 0.7.0][tp-chg]).
   - **Esforço: M.** O motor de diff já existe (`src/modules/changes/diff.ts`). Faltam as decorações do CodeMirror e a ação de reverter um trecho contra a base. O `@codemirror/merge`, usado pelo plugin Git do Obsidian ([obsidian-git][ob-git]), é uma opção carregada só quando usada.

2. **Marcar no texto o que veio da IA (autoria)**
   - **Quem faz melhor:** iA Writer. O texto humano fica em tons discretos, o de IA aparece em gradiente colorido, tudo processado no aparelho. A autoria fica guardada no fim do arquivo ([Authorship][ia-auth]).
   - **Por que importa:** responde "isso fui eu ou o ChatGPT?" sem precisar de Git. O próprio Tapa já usa uma ideia parecida no autocomplete, quando o texto aceito pisca em arco-íris ([CHANGELOG 0.5.0][tp-chg]).
   - **Esforço: M.** O caminho de escrita do `tapa-mcp` já sabe quando quem escreveu foi um agente. O [VISION][tp-vision] já prevê procedência via `x-tapa.*`.

3. **Histórico de versões que dá para restaurar**
   - **Quem faz melhor:** Obsidian. Guarda snapshots locais automáticos a cada 5 minutos por 7 dias, configuráveis ([File recovery][ob-rec]). O Ulysses guarda backups por hora, dia, semana e mês, e os mensais ficam para sempre ([41.2][ul-rel]). O Bear não tem histórico por nota; os usuários pedem isso há anos ([fórum][br-hist]).
   - **Por que importa:** "a IA estragou minha nota de ontem" é o pânico mais comum. Hoje o Tapa só compara com o último commit ou com a cópia de quando a nota foi aberta.
   - **Esforço: M.** Snapshots em texto na pasta de dados do app, mais uma lista "voltar para esta versão" que reaproveita o painel de mudanças.

4. **Edição visual de tabelas**
   - **Quem faz melhor:** Obsidian 1.5: botões para nova linha ou coluna, arrastar, ordenar, menu de contexto, e o arquivo continua Markdown puro ([1.5][ob-15]). O Typora vem logo atrás, com redimensionar arrastando, reordenar e inserir por atalho ([typora.io][ty-home]).
   - **Por que importa:** IA adora gerar tabelas. No Tapa, clicar numa célula abre o código com `|` ([CHANGELOG 0.4.0][tp-chg]), e isso assusta quem não é técnico.
   - **Esforço: M.** Editar a célula no próprio widget e ter ações de linha/coluna, gravando de volta o GFM.

5. **Exportar para PDF e Word**
   - **Quem faz melhor:** Typora, com PDF com marcadores, DOCX e ePub ([typora.io][ty-home]). Também iA Writer ([features][ia-feat]) e Ulysses ([ulysses.app][ul-home]). O Ritemark exporta para Word sem os comentários ([ritemark][rm-home]).
   - **Por que importa:** o leigo precisa entregar o texto ao chefe ou ao cliente em PDF ou Word.
   - **Esforço:** PDF **S** (impressão do webview; [issue #13][tp-13]). DOCX **L**, se for embutir Pandoc, porque quebra o orçamento de tamanho. **M**, se for um gerador DOCX mínimo próprio.

6. **Diagramas Mermaid e matemática**
   - **Quem faz melhor:** Typora ([typora.io][ty-home]), MarkText ([site][mt-site]) e Obsidian ([1.13][ob-113]). Até o Bear, minimalista, adicionou matemática em 2025 e Mermaid em 2026 ([math][br-math], [mermaid][br-mermaid]).
   - **Por que importa:** ChatGPT e Claude produzem blocos `mermaid` com frequência, e o leigo vê código em vez de diagrama.
   - **Esforço: M.** Chunk carregado só quando aparece um bloco `mermaid`, para não pesar no boot. Isso contraria a lista de "não objetivos" do [README][tp-readme], então é uma decisão de produto.

7. **Colar e arrastar imagem salvando na pasta**
   - **Quem faz melhor:** Typora, com a regra "copiar imagem para a pasta" por documento ([suporte][ty-img]). O Zettlr mostra um diálogo ao colar ([1.1][zt-img]).
   - **Por que importa:** prints de tela são o anexo mais comum de quem trabalha com IA.
   - **Esforço: S.** Um comando Rust que grava os bytes numa pasta `assets/` ao lado da nota e insere o link relativo.

8. **Sumário / outline da nota**
   - **Quem faz melhor:** Typora, com painel de outline e `[TOC]` ([typora.io][ty-home]). Também iA Writer ([features][ia-feat]) e Obsidian ([1.12][ob-112]).
   - **Por que importa:** respostas longas de IA têm muitos títulos e o leigo se perde.
   - **Esforço: S.** Ler os títulos da árvore de sintaxe do CodeMirror que o app já carrega.

9. **Agente de IA dentro do app, sem terminal**
   - **Quem faz melhor:** Ritemark, com Claude Code, Codex e OpenCode na barra lateral e um modo Plan antes de mexer no arquivo ([ritemark][rm-home]). O SoloMD instala o MCP em todos os clientes com `solomd mcp install` ([README][so-gh]).
   - **Por que importa:** o `tapa-mcp` precisa ser compilado com `cargo build` e registrado na mão ([README][tp-readme]), e nenhum leigo faz isso.
   - **Esforço:** um instalador de MCP em um clique é **M**. Um agente embutido é **L** e contraria a regra "sem LLM no binário" do [VISION][tp-vision].

10. **Git sem terminal (salvar versão = commit)**
    - **Quem faz melhor:** SoloMD: cada `⌘S` vira um commit num `.git` local, com libgit2 embutido e sem precisar do git do sistema ([README][so-gh]).
    - **Por que importa:** o "o que mudou" do Tapa fica muito melhor quando há commits, mas o leigo não sabe fazer commit.
    - **Esforço: M**, se usar o `git` do sistema. **L**, se embutir libgit2, porque pesa no tamanho.

11. **Sync e celular**
    - **Quem faz melhor:** Obsidian Sync, com E2EE e histórico ([pricing][ob-price]), e iA Writer, que aceita qualquer nuvem e tem iOS e Android ([features][ia-feat]).
    - **Esforço: L** (issues [#12][tp-12], [#15][tp-15], [#16][tp-16]).

12. **Checagem de estilo**
    - **Quem faz melhor:** iA Writer, com o Style Check no aparelho ([iA][ia-home]). O Ulysses tem gramática e estilo em mais de 20 idiomas ([ulysses.app][ul-home]).
    - **Esforço: M** ([issue #10][tp-10], para palavras de enchimento em português).

13. **Abas de verdade**
    - **Quem faz melhor:** Obsidian ([help][ob-tabs]) e Zettlr, com abas e tela dividida ([features][zt-feat]).
    - **Situação no Tapa:** já está sendo feito, com a lista de arquivos soltos na barra lateral ([CHANGELOG][tp-chg]).
    - **Esforço: S** para terminar.

14. **Temas**
    - **Quem faz melhor:** MarkText, com 33 temas em CSS ([site][mt-site]).
    - **Esforço: S.** Prioridade baixa para o público do Tapa.

15. **Plugins de terceiros e colaboração em tempo real**
    - **Quem faz melhor:** Obsidian, com o ecossistema de plugins e os vaults compartilhados ([Ritemark][rm-cmp], [pricing][ob-price]).
    - **Esforço: L.** Contraria a leveza e a segurança defendidas no [VISION][tp-vision]. Não recomendo.

## O que só o Tapa tem (ou faz melhor)

1. **O mais leve do comparativo, com teto de tamanho no CI.**
   - O `.dmg` tem ~5 MB e o boot ~27 KB gzip de JS ([README][tp-readme]).
   - Os outros: Obsidian 235 MB ([release][ob-rel]), Zettlr 201 MB ([release][zt-rel]), MarkText 127–165 MB no Linux ([release][mt-023]), SoloMD 15–32 MB ([README][so-gh]).
   - O `size-budget.json` faz o CI falhar se o app crescer, e o teto nunca sobe sozinho ([README][tp-readme]). Não encontrei regra parecida em nenhum outro app.
2. **"O que mudou" em frases simples, sem símbolos de diff e sem precisar de Git.** A base é o último commit ou a cópia guardada ao abrir a nota ([CHANGELOG 0.7.0][tp-chg]). O Wymark é o mais próximo, mas exige macOS 26 em Apple Silicon e está em beta ([beta][wy-beta]). No Obsidian, diff de verdade só com plugin ([obsidian-git][ob-git]).
3. **MCP reativo e seguro, num binário separado e opcional.**
   - O `tapa-mcp` empurra `resources/updated` quando um arquivo muda.
   - O `patch` é endereçado por `^block-id`/título com `if_match` e recusa se o texto mudou no meio do caminho.
   - As escritas são atômicas (detalhes no [README][tp-readme]).
   - Bear ([2.8][br-28]) e SoloMD ([README][so-gh]) também têm MCP, e o Obsidian tem CLI ([1.12][ob-112]). Por isso o "MCP" sozinho já não diferencia. O que diferencia são as assinaturas ao vivo e o `if_match`. Nenhum dos dois aparece na lista de 16 ferramentas do SoloMD (`[INFERÊNCIA]`: pela lista publicada).
4. **Recarrega sozinho quando um agente edita o arquivo.** Se houver edição não salva, pergunta antes de descartar ([README][tp-readme]). O salvamento é atômico, então nunca deixa a nota vazia pela metade ([CHANGELOG 0.5.0][tp-chg]).
5. **Autocomplete 100% local, aprendido das suas notas.** O texto aceito pisca, mostrando o que foi inserido. Nada sai pela rede ([CHANGELOG 0.5.0][tp-chg]).
6. **Grátis, MIT e nos três desktops ao mesmo tempo.**
   - iA Writer é pago ([preços][ia-price]).
   - Bear e Ulysses são só Apple ([bear.app][br-home], [ulysses.app][ul-home]).
   - Wymark é só macOS ([beta][wy-beta]).
   - Ritemark não tem Linux ([ritemark][rm-home]).
7. **Teleprompter no notch do macOS** ([CHANGELOG 0.4.0][tp-chg]). Não achei nada parecido nos concorrentes.

## Achados que mudam o posicionamento

- **O [VISION][tp-vision] está desatualizado em um ponto.** Ele diz que o Obsidian "não tem acesso nativo para agentes". O Obsidian 1.12 lançou uma CLI oficial para automação ([changelog][ob-112]), e o Bear 2.8 lançou servidor MCP e Claude Connector ([blog][br-28]). A frase de lançamento ("convida agentes pela porta da frente") ainda funciona, mas a comparação com o Obsidian precisa mudar.
- **O nicho "ver o que a IA mudou" encheu em 2026.** Entraram o Wymark ([wymark][wy-home]), o SoloMD ([README][so-gh]), o Nimbalyst ([blog][nb-diff]) e o Authorship do iA ([iA][ia-auth]). O Tapa ainda tem o caminho mais simples e mais leve, mas precisa da revisão no próprio texto (itens 1 a 3 do ranking) para não ficar para trás.
- **O MarkText não está abandonado.** O comparativo do SoloMD diz "parado desde ~2022" ([SoloMD][so-cmp]), mas houve várias versões em outubro de 2026 ([releases][mt-rel]).

## Fontes

- **Usadas:** todas as linkadas abaixo. Prioridade a sites oficiais, documentação, changelogs e releases no GitHub.
- **Descartadas:**
  - análises de terceiros (makerstack, eesel, usecarly, quillspace, rywalker), trocadas pela fonte oficial equivalente sempre que havia;
  - comparativos de SEO (markdific, markdowntools, docsio), por redundância e baixa confiabilidade;
  - a resposta-resumo do buscador sobre a "Claude Code Review", que não tem relação com editores de Markdown.
- **Viés declarado:**
  - o comparativo do SoloMD é do próprio fornecedor ([SoloMD][so-cmp]); usei só para o tamanho do instalador do Typora e para plataformas;
  - o comparativo do Ritemark também é de fornecedor ([Ritemark][rm-cmp]); usei para preço do iA Writer, ausência de IA/plugins no Typora e IA via plugins no Obsidian.

## Lacunas

- **RAM:** nenhum app publica uso de memória, e não encontrei benchmark confiável. Recomendo medir no mesmo Mac, com a mesma nota aberta (Activity Monitor / `ps -o rss`), Tapa contra Obsidian, Typora, MarkText e SoloMD.
- **Tamanho dos apps nativos** (iA Writer, Bear, Ulysses) e do Typora direto da fonte: não verificado.
- **Wymark e Ritemark:** a documentação pública não cobre abas, busca, temas nem tamanho, daí os "n/d".
- **Preço mensal atual do Ulysses:** a página oficial manda conferir na App Store ([ajuda][ul-sub]).
- **Tempo de abertura (cold start):** não medido em nenhum app, nem no Tapa.

[tp-readme]: ../../README.md
[tp-chg]: ../../CHANGELOG.md
[tp-vision]: ../VISION.md
[tp-10]: https://github.com/aryrabelo/tapa/issues/10
[tp-12]: https://github.com/aryrabelo/tapa/issues/12
[tp-13]: https://github.com/aryrabelo/tapa/issues/13
[tp-15]: https://github.com/aryrabelo/tapa/issues/15
[tp-16]: https://github.com/aryrabelo/tapa/issues/16
[ty-home]: https://typora.io/
[ty-ver]: https://support.typora.io/Version-Control/
[ty-tabs]: https://github.com/typora/typora-issues/issues/6569
[ty-6671]: https://github.com/typora/typora-issues/issues/6671
[ty-img]: https://support.typora.io/Images/
[ty-112]: https://support.typora.io/What's-New-1.12/
[ia-home]: https://ia.net/writer
[ia-feat]: https://ia.net/writer/support/basics/features
[ia-auth]: https://ia.net/writer/support/editor/authorship
[ia-what]: https://ia.net/topics/see-what-ai-wrote
[ia-tabs]: https://ia.net/topics/ia-writer-mac-with-tabs
[ia-ver]: https://ia.net/writer/support/help/versions-and-backups
[ia-price]: https://ia.net/writer/pricing
[ob-price]: https://obsidian.md/pricing
[ob-tabs]: https://obsidian.md/help/tabs
[ob-rec]: https://obsidian.md/help/plugins/file-recovery
[ob-syncver]: https://obsidian.md/help/sync/version-history
[ob-15]: https://obsidian.md/changelog/2023-12-26-desktop-v1.5.3/
[ob-112]: https://obsidian.md/changelog/2026-02-27-desktop-v1.12.4/
[ob-113]: https://obsidian.md/changelog/2026-07-30-desktop-v1.13.4/
[ob-pdf]: https://obsidian.md/help/pdf
[ob-git]: https://github.com/Vinzent03/obsidian-git
[ob-rel]: https://github.com/obsidianmd/obsidian-releases/releases/tag/v1.14.5
[mt-gh]: https://github.com/marktext/marktext
[mt-site]: https://marktext.me/
[mt-rel]: https://github.com/marktext/marktext/releases/tag/v0.21.2
[mt-023]: https://github.com/marktext/marktext/releases/tag/v0.23.0
[mt-fork]: https://github.com/Tkaixiang/marktext
[zt-home]: https://www.zettlr.com/
[zt-feat]: https://www.zettlr.com/features
[zt-rel]: https://github.com/Zettlr/Zettlr/releases/tag/v4.9.0
[zt-chg]: https://zettlr.com/changelog
[zt-img]: https://www.zettlr.com/post/release-notes-zettlr-110
[br-home]: https://bear.app/
[br-2]: https://bear.app/faq/whats-new-in-bear-2/
[br-upd]: https://blog.bear.app/category/updates/
[br-28]: https://blog.bear.app/2026/04/bear-2-8-bearcli-claude-connector-and-mcp-server/
[br-math]: https://blog.bear.app/2025/08/bear-now-supports-math-formulas/
[br-mermaid]: https://blog.bear.app/2026/07/bear-now-supports-mermaid-diagrams/
[br-hist]: https://community.bear.app/t/note-revision-history/12381
[br-bk]: https://bear.app/faq/backup-restore/
[br-web]: https://community.bear.app/t/bear-web-update-0-40-0-2026-10-26/20015
[ul-home]: https://ulysses.app/
[ul-rel]: https://ulysses.app/release-notes/
[ul-price]: https://blog.ulysses.app/ulysses-switches-to-subscription/
[ul-sub]: https://help.ulysses.app/en_US/subscription-synchronization/subscription-options-
[so-gh]: https://github.com/zhitongblog/solomd
[so-cmp]: https://solomd.app/compare/best-free-markdown-editors
[wy-home]: https://wymark.app/
[wy-beta]: https://wymark.app/beta
[rm-home]: https://ritemark.app/en/
[rm-cmp]: https://ritemark.app/en/good-to-know/comparisons/best-markdown-editor-for-ai/
[nb-home]: https://nimbalyst.com/
[nb-diff]: https://nimbalyst.com/blog/ai-diff-review-visual-agent-changes/
[sh-blog]: https://www.star-history.com/blog/standalone-markdown-editor/
