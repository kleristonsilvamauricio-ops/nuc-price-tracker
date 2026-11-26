# Integrações e automação — Price Tracker Universal 2.0

## O que funciona sem contas adicionais

- Cadastro, cotações, histórico e composição de compras permanecem no navegador.
- Câmbio de referência USD/BRL pela API pública PTAX do Banco Central do Brasil, sem chave e sem assinatura paga.
- `scripts/universal_status.py` publica apenas câmbio oficial e estado das fontes, nunca dados pessoais ou preços fictícios.
- Atualização do painel lê os JSONs públicos atuais. Isso **não** significa que as lojas foram consultadas novamente.
- A interface consulta `https://raw.githubusercontent.com/kleristonsilvamauricio-ops/nuc-price-tracker/main/data/automation-status.json` e `data/exchange.json` no mesmo endereço-base, com fallback para a cópia local.

O uso de raw GitHub evita uma limitação documentada: commits criados com `GITHUB_TOKEN` não iniciam um novo build de GitHub Pages. O mecanismo de publicação do aplicativo continua o já configurado na branch `main`; nenhuma nova conta de hospedagem é necessária.

## Horários e prazo

O workflow `prices.yml` atualiza **somente câmbio e estado das fontes**, todos os dias às **13h07 e 18h07 de Brasília**, sem data de término. O cron usa 16h07 e 21h07 UTC. Essa rotina faz uma única consulta oficial de câmbio por execução, para que a comparação Brasil/EUA continue útil em todos os produtos. O GitHub pode atrasar a execução. A execução manual permanece disponível.

O prazo original do acompanhamento de preços do NUC continua separado, em `nuc_campaign.until`: **30/11/2026**. Seus horários de referência são 08h07, 13h07 e 18h07. Esse objeto é metadado do plano, não comprova que lojas estejam sendo consultadas: `price_polling_enabled` permanece `false`. O fim é avaliado no fuso de Brasília e não reativa a campanha em outro ano. A rotina permanente de câmbio não estende o monitoramento de preços do NUC.

A tarefa de pesquisas agendadas dentro do ChatGPT é independente deste workflow e não foi alterada por esta versão.

## Contrato público de dados

`data/exchange.json` contém:

| Campo | Significado |
| --- | --- |
| `rate` | Reais por dólar; `null` quando nunca houve resultado válido |
| `reference_date` | Data da taxa publicada pelo Banco Central |
| `observed_at` | Momento de publicação da taxa, normalizado para UTC |
| `checked_at` | Última tentativa de consulta |
| `last_success_at` | Última resposta válida recebida |
| `status` | `ready`, `stale` ou `unavailable` |
| `source` | Nome, URL efetivamente consultada, catálogo oficial e licença |

Falhas preservam a última taxa real e sua data; alteram o estado para `stale`. Nenhuma falha cria uma taxa padrão. Taxas publicadas há mais de quatro dias recebem o estado `stale`, mesmo se a requisição HTTP tiver sucesso. Fins de semana não mudam artificialmente a data de referência.

A PTAX serve para comparação aproximada. Não representa a taxa de pagamento do cartão e não incorpora spread, IOF, frete ou tributos de importação. O usuário pode informar custos efetivos na comparação.

`data/automation-status.json` contém o estado por fonte. `schedule` descreve a rotina permanente de dados de referência; `nuc_campaign` descreve o acompanhamento de preços com prazo separado. `checked_at` das lojas significa verificação de configuração, não verificação de preço. `last_success_at` fica `null` enquanto não houver uma consulta real validada. `price_requests_this_run` permanece zero nesta versão. Um secret existente muda o estado de `pending_config` para `pending_validation`; não muda para `ready`.

## Lojas

| Fonte | Situação nesta versão |
| --- | --- |
| Amazon Brasil / EUA | Links, cadastro e cotações manuais; API não habilitada |
| Mercado Livre / KaBuM! | Links, cadastro e cotações manuais; API não habilitada |
| B&H / Newegg | Links, cadastro e cotações manuais; API não habilitada |
| eBay Browse | Protótipo oficial isolado na PR #1; requer aprovação e acesso de produção |
| Best Buy Products | Protótipo oficial isolado na PR #1; requer chave e teste real |

O scraper público anterior retornou HTTP 403 nas seis categorias. Seu código e o arquivo de resultado legado foram preservados como histórico do NUC, mas o novo agendamento não o executa. Não há tentativas de contornar bloqueios.

Antes de habilitar uma fonte: verificar autorização, condições de uso, quota real, vendedor, moeda, disponibilidade, configuração exata e comportamento de falhas. As quotas publicadas por provedores não são tratadas como quotas já concedidas a este projeto.

### Proteção de credenciais e catálogo

Os nomes `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` e `BESTBUY_API_KEY` podem existir como secrets do GitHub Actions. Os valores não entram no JavaScript, JSON, logs, links ou commits. Esta entrega não criou nem alterou secrets.

O workflow isolado existente na branch `test/official-api-collector`, inclusive o ambiente `api-validation`, não foi modificado. Não foi feito merge da PR #1.

As condições publicadas da Best Buy limitam a retenção de conteúdo da API. Por isso, o novo workflow não coleta nem comita catálogo Best Buy, e não transforma respostas da API em histórico permanente. Uma integração futura exigirá cache temporário compatível com os termos vigentes. Registros manuais do usuário têm origem distinguida de dados da API.

## Backup e OneDrive

Os pontos de recuperação automáticos locais ajudam a desfazer alterações, mas não protegem contra limpeza do navegador ou perda do aparelho. Exportação/importação JSON é o backup independente; CSV é útil para análise, não substitui backup completo.

Não existe conexão OneDrive confirmada nesta entrega. Uma conexão direta futura necessita aplicativo Microsoft registrado e consentimento da conta, preferencialmente com acesso restrito à pasta do aplicativo (`Files.ReadWrite.AppFolder`) e fluxo OAuth adequado. Nenhum client secret pode ficar em uma PWA pública. Até essa autorização, um arquivo JSON pode ser salvo/compartilhado para o OneDrive pelos recursos do dispositivo, sem alegar sincronização automática.

## Verificação

```sh
node --test tests/*.test.mjs
python -m unittest discover -s tests -p 'test_*.py' -v
python scripts/validate_static.py
python scripts/universal_status.py --event manual
```

O último comando realiza uma única requisição à API oficial do BCB. Os testes usam respostas sintéticas para verificar estados e validação; não são publicadas como cotações reais.

## Fontes oficiais

- Banco Central, catálogo e licença ODbL: https://dadosabertos.bcb.gov.br/dataset/dolar-americano-usd-todos-os-boletins-diarios
- Banco Central, documentação OData: https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/documentacao
- GitHub, publicação Pages e `GITHUB_TOKEN`: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- GitHub, eventos agendados: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- Best Buy, condições da API: https://developer.bestbuy.com/legal
- Microsoft Graph, pasta de aplicativo: https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder

Dados cambiais atribuídos ao Banco Central do Brasil, publicados sob a licença ODbL indicada no catálogo oficial. Essa atribuição se refere aos dados, não altera a licença do código do aplicativo.
