# Verificação da versão 2.0

Data: 26/11/2026. Escopo: comparador universal pessoal, preservando o monitor NUC no mesmo repositório e endereço.

## Verificações automatizadas

- 24 testes de domínio e persistência: centavos, BRL/USD, custos desconhecidos, condição, disponibilidade, validade, datas futuras, montagens, migração, backup, quota e dados corrompidos.
- 18 testes da publicação de referências: sucesso/falha de câmbio, preservação de dados reais, credenciais ausentes, estados sem falsos sucessos e continuidade do câmbio sem estender a campanha NUC.
- Sintaxe JavaScript e integridade de manifest, arquivos e módulos locais.
- Validação de whitespace pelo Git.

## Conferência de interface

Executada em navegador com dados sintéticos locais, separados do conteúdo publicado:

- Cadastro de produto personalizado e meta em USD.
- Cotação de US$ 100 + US$ 10 de frete + US$ 5 de imposto, exibindo total US$ 115.
- Reabertura da página com os registros preservados.
- Nova cotação US$ 90, mantendo a anterior no histórico.
- Frete desconhecido mantendo total pendente; sem inferir frete zero.
- Histórico com dois registros, mínimo US$ 90, máximo US$ 100 e média US$ 95.
- Geração de pontos de recuperação.
- Download do JSON, leitura pela interface e restauração integral confirmada.
- Layout de celular em quadro de 390 px: corpo sem transbordamento horizontal e navegação inferior funcional.
- Tela de comparação com quatro configurações NUC, mantendo incompletas as montagens sem cotações.

## Correções resultantes da revisão

- Arquivos locais corrompidos são preservados antes de qualquer substituição.
- Edição de montagem não troca silenciosamente um componente arquivado.
- Restauração integral recupera personalizações dos produtos iniciais e preferências; mesclagem é uma opção separada.
- Atualizações de referência não removem campos que estão sendo editados.
- Cotações de data futura não entram no ranking.
- Envio de formulário fica protegido contra repetição enquanto salva.

## Limitações explícitas

Preços de lojas não são coletados automaticamente nesta versão. O serviço agendado atualiza câmbio e estado de integração. OneDrive não está conectado; exportação e compartilhamento de arquivo estão disponíveis. O uso de múltiplas abas para editar simultaneamente ainda deve ser evitado. Não foi feita instalação remota no celular físico nem alegada validação em todos os navegadores.

Os dados sintéticos de teste não fazem parte do catálogo publicado. Os arquivos públicos contêm código, documentação e referências oficiais; dados pessoais permanecem no dispositivo.
