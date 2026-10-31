# ARA · MTA

Código da aplicação em produção em https://ara-mta.signau.cc/, importado do VPS em 31/10/2026.

Inclui a interface, autenticação, gestão de alunos, registro de estudo, anotações e scripts de implantação. Consulte [LEIA-ME.md](LEIA-ME.md) para operação e configuração.

## Requisitos

- Node.js 22 ou superior; sem dependências npm externas.
- Para produção: Linux, systemd, Nginx e HTTPS.
- O catálogo e as imagens de `private/` devem ser fornecidos separadamente. Esses arquivos não estão incluídos nesta versão do repositório, portanto o checkout sozinho ainda não executa a aplicação completa.

Após disponibilizar `private/catalog.json`, `private/media/` e `private/thumbs/`, execute `npm run setup` para criar a configuração local e `npm start` para iniciar. Nunca copie os dados de produção para o repositório.

## Estado da sincronização

O código corresponde à instalação do VPS. A ficha “Áreas de navegação e habilitações” foi corrigida no VPS para **1 MN = 1.852 m**; a ficha e sua miniatura ainda não foram incluídas no GitHub, pois a exportação do material didático aguarda autorização.

Credenciais, cadastros, sessões, registros de estudo, backups e o runtime Node do servidor foram excluídos. Os testes referenciados por `npm test` não estavam presentes na instalação do VPS e não foram recuperados; não há alegação de execução dessa suíte.
