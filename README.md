# ARA · MTA

Código da aplicação em produção em https://ara-mta.signau.cc/, importado do VPS em 31/10/2026.

Inclui a interface, autenticação, gestão de alunos, registro de estudo, anotações e scripts de implantação. Consulte [LEIA-ME.md](LEIA-ME.md) para operação e configuração.

## Requisitos

- Node.js 22 ou superior; sem dependências npm externas.
- Para produção: Linux, systemd, Nginx e HTTPS.
- Catálogo, fichas e miniaturas incluídos em `private/`, com autorização do proprietário. A aplicação exige login para servir esse material no site; a visibilidade das cópias no GitHub depende das permissões do repositório.

Execute `npm run setup` para criar a configuração local e `npm start` para iniciar. Nunca copie os dados de produção para o repositório.

## Estado da sincronização

O código e o material didático correspondem à instalação do VPS. A ficha “Áreas de navegação e habilitações” e sua miniatura incluem a correção **1 MN = 1.852 m**.

O catálogo inclui também a ficha ilustrada **Hidrojato e dispositivos acoplados** (NORMAM-212/DPC, itens 1.9.4 e 1.9.5), em Legislação, logo após “Regras para motos aquáticas”. São 21 fichas, com imagem e miniatura protegidas pelo login habitual. A atualização de um VPS existente é descrita em `LEIA-ME.md`.

Credenciais, cadastros, sessões, registros de estudo, backups e o runtime Node do servidor foram excluídos. Os testes referenciados por `npm test` não estavam presentes na instalação do VPS e não foram recuperados; não há alegação de execução dessa suíte.

A cópia importada foi validada com um teste funcional local usando um usuário temporário: página inicial, bloqueio sem login, autenticação, catálogo de 20 fichas e acesso às 40 imagens (fichas e miniaturas). A ficha corrigida foi conferida por SHA-256.
