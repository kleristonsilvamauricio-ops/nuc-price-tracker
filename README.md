# Price Tracker Universal · Brasil & EUA

Comparador pessoal gratuito, instalável no celular, que preserva o projeto ASUS NUC e permite acompanhar outros produtos. Funciona no mesmo endereço do monitor original:

**https://kleristonsilvamauricio-ops.github.io/nuc-price-tracker/**

## Estado real da versão 2.0

O cadastro, histórico, comparações e backups locais funcionam sem criar outra conta. O serviço automático publica câmbio de referência e estado das integrações. **A coleta automática de preços das lojas ainda depende de acesso às APIs e não está habilitada.** O botão **Atualizar painel** atualiza as referências disponíveis; não consulta novamente anúncios das lojas.

Não há preços de exemplo apresentados como ofertas, licenças compradas, assinaturas contratadas ou credenciais no navegador.

## Recursos entregues

- Produtos de qualquer categoria, marca, modelo, especificação e preço-alvo.
- Categorias e lojas personalizáveis.
- Filtros Brasil, Estados Unidos e comparação entre países; BRL e USD.
- Pesquisa nas lojas e identificação da loja a partir do link de um anúncio.
- Registro de preço, vendedor, condição, disponibilidade, frete, impostos e desconto.
- Histórico preservado a cada nova cotação, com gráfico e exportação CSV.
- Projetos de compra por componentes, quantidades e itens que o usuário já possui.
- Comparação NUC pronto versus barebone, com 32/64 GB, SSD de 2 TB e Windows 11 Pro.
- Metas de preço, validade da cotação e sinalização de informação incompleta.
- Salvamento automático no dispositivo; oito pontos de recuperação locais.
- Backup JSON com restauração integral ou mesclagem conservadora.
- Compartilhamento de arquivo pelo dispositivo, inclusive para OneDrive quando disponível no menu do sistema.
- Instalação como PWA, interface para celular e abertura offline após o primeiro carregamento.
- Migração dos registros legados e acesso à interface NUC original em `legacy/`.

## Como usar

### Cadastrar e acompanhar

1. Abra **Adicionar produto**. Cole um anúncio, se já o tiver, e toque em **Ler link**.
2. Confira nome, modelo e especificações. Defina categoria e uma meta opcional em reais ou dólares.
3. Use **Registrar preço** para salvar a cotação que verificou. Os links de pesquisa abrem as lojas cadastradas.
4. Para atualizar uma oferta existente, use **Nova cotação**. O valor anterior permanece no histórico.

O leitor de link identifica domínio e sugere um nome quando a URL contém texto útil. Não baixa nem extrai automaticamente o anúncio.

### Comparar corretamente

**Comparar** já contém quatro projetos NUC: montagem 32 GB, montagem 64 GB, pronto 32 GB e pronto 64 GB, todos com SSD de 2 TB. Os nove produtos iniciais também incluem as configurações com 1 TB para referência.

- O total usa preço menos desconto, mais frete e impostos registrados.
- Deixe encargos desconhecidos em branco. Digite zero somente quando gratuitos, inclusos ou não aplicáveis.
- Uma oferta sem encargos completos produz **subtotal conhecido**, sem ser apresentada como custo final.
- Sem cotação recente, disponível e de produto novo, o componente mantém a montagem incompleta.
- Itens marcados **Já tenho** têm custo adicional zero. A compatibilidade física continua precisando ser verificada.
- Custos de cada componente são multiplicados pela quantidade; fretes combinados de um carrinho devem ser ajustados no registro para não contar duas vezes.
- Valores em moedas diferentes usam o câmbio de referência configurado. Essa conversão não inclui automaticamente custos de cartão ou importação.

A referência histórica de **US$ 1.869 para NUC 32 GB/1 TB** é informativa e não entra no ranking. Descontos da Black Friday só podem ser avaliados após existirem cotações verificadas comparáveis; não há selo de desconto artificial.

### Instalar no celular

Abra o endereço no navegador do aparelho e use **Adicionar à tela inicial / Instalar aplicativo**, quando disponível. A interface adaptável também funciona sem instalação. Em Ajustes aparece um botão de instalação quando o navegador oferece esse recurso.

A atualização utiliza o mesmo endereço. Dados legados só podem ser migrados no navegador/origem onde foram salvos. Uma cópia do monitor aberta por `file://`, outro domínio ou outro navegador precisa de exportação/importação própria.

## Dados e recuperação

O catálogo pessoal permanece no navegador, preferencialmente em IndexedDB, com fallback para localStorage. Não é enviado para o repositório público. A limpeza do navegador ou a perda do dispositivo pode apagar o banco local.

Em **Ajustes → Backup e recuperação**:

- **Baixar backup** gera o JSON completo.
- **Salvar / compartilhar** usa o menu de arquivos do dispositivo; onde não houver suporte, baixa o arquivo.
- **Restaurar arquivo → Restaurar tudo** recupera produtos, metas, histórico, montagens e preferências, guardando um ponto do estado anterior.
- **Adicionar novos registros** faz uma mesclagem. Em IDs já existentes, as personalizações locais e as preferências atuais prevalecem.
- **Ver pontos de recuperação locais** recupera versões recentes. Se houve conteúdo corrompido, permite baixar o original preservado para análise.

O CSV serve para planilhas; não substitui o JSON de backup. Não existe sincronização direta com OneDrive nesta versão. O código e a documentação estão versionados neste repositório.

## Automação e limites

Os detalhes, horários, fonte oficial de câmbio e dependências das lojas estão em [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

- Cálculos, consultas ao histórico e mudanças de filtros não têm franquia de pesquisa paga.
- A quantidade de consultas automáticas às lojas é **zero** até uma fonte ser habilitada e validada.
- Limites defensivos de importação: até 20 MB por arquivo, 10 mil produtos e 100 mil observações. São limites de validação, não promessa de desempenho em qualquer celular; o armazenamento disponível varia por navegador.
- Não há login, colaboração multiusuário, sincronização entre aparelhos ou notificações de preço com o aplicativo fechado.
- Edite o cadastro em uma aba por vez: duas abas simultâneas ainda podem substituir alterações uma da outra.
- Indisponibilidade de rede preserva a última referência com sua data. Não transforma falha de consulta em sucesso ou preço zero.

## Estrutura técnica

| Caminho | Responsabilidade |
| --- | --- |
| `index.html`, `src/styles.css`, `src/app.js` | Interface sem dependências de terceiros |
| `src/domain.js` | Centavos inteiros, validação, ranking, projetos, migração e backup |
| `src/storage.js` | Persistência e recuperação local |
| `manifest.webmanifest`, `sw.js` | Instalação e cache do aplicativo |
| `scripts/universal_status.py` | Câmbio oficial e estado das fontes |
| `data/` | Apenas referências públicas, sem cadastro pessoal |
| `tests/` | Regressões de cálculo, backup, migração e automação |
| `legacy/` | Interface anterior preservada |

### Verificar e executar localmente

Requer Node.js 22 e Python 3.12 para as verificações usadas pelo CI; não exige `npm install`.

```sh
npm test
npm run check
python -m unittest discover -s tests -p 'test_*.py' -v
python scripts/validate_static.py
npm run dev
```

As cotações nos testes são dados sintéticos isolados e não entram no aplicativo publicado. A atualização pública realiza uma requisição à fonte oficial:

```sh
python scripts/universal_status.py --event manual
```

## Publicação e continuidade

GitHub Pages mantém a publicação a partir de `main`. O workflow de validação roda nas alterações e pull requests; a atualização pública grava somente arquivos permitidos em `data/`. A branch `backup/nuc-before-universal-20261126` preserva a versão anterior. A PR #1, de conectores oficiais ainda pendentes, continua separada.

Próxima integração técnica: validar uma única API oficial em produção e sua política de cache antes de habilitar atualização de preços. Depois, adicionar sincronização opcional Microsoft com acesso restrito à pasta do aplicativo. Nenhuma dessas dependências é simulada no produto atual.
