# ARA · MTA — Sala de navegação

Aplicação preparada para **ara-mta.signau.cc**, com as 19 fichas fornecidas por Claudio Werlich. Os arquivos originais e as assinaturas foram preservados. A ordem está em `private/catalog.json` e pode ser ajustada antes de iniciar o serviço. O conteúdo didático foi incorporado como fornecido; este trabalho não faz uma nova revisão normativa das fichas.

## O que está pronto

- Login individual de instrutor e alunos, sem cadastro público.
- Instrutor: cadastrar aluno, definir usuário/senha, vencimento, bloquear ou prorrogar e redefinir senha.
- Aluno: índice com busca/filtros e leitor com ampliação, rolagem e tela cheia.
- Instrutor: modo aula e tela de pausa, além das mesmas funções de leitura.
- Vencimento no horário de Brasília: o dia informado permanece liberado até 23h59; a partir de 00h do dia seguinte, o servidor nega novas requisições, inclusive de imagens. A interface verifica a sessão a cada 30 segundos e ao voltar à aba.
- Alterar um aluno encerra sua sessão. Novo login também encerra a sessão anterior desse usuário. Sessões duram no máximo 12 horas e acabam quando o serviço reinicia.
- Senhas protegidas com scrypt e salt individual; cookies HttpOnly, SameSite e Secure em produção; limite de tentativas; autorização no servidor para cada imagem e cada operação administrativa; arquivos privados fora das rotas públicas.

Quem vê uma imagem pode capturá-la. O controle de acesso evita consulta futura ao servidor depois do prazo, mas não apaga capturas ou cópias já realizadas pelo aluno. Não há botão de download, impressão, cadastro público ou integração com serviços externos. Não são usados fontes, scripts ou rastreadores externos.

## Requisitos

Linux com systemd, Node.js **22 ou superior**, e Nginx ou Apache com HTTPS. A aplicação não precisa de npm install, banco de dados externo ou Docker. Usa uma única instância Node; não executar múltiplos processos ou réplicas para o mesmo banco JSON. Para grandes volumes simultâneos, migrar sessões e usuários a um banco antes de escalar.

## Instalação na VPS

1. Faça um backup da configuração atual do servidor web. Confirme que o DNS de `ara-mta.signau.cc` aponta para a VPS e que há um certificado TLS válido para esse nome.
2. Envie e extraia este pacote em uma pasta temporária da VPS, entre na pasta `ara-mta` e execute `sudo bash deploy/install.sh`. O script usa `/opt/ara-mta` para o programa e `/var/lib/ara-mta` para os dados, cria o usuário de serviço e pede as credenciais do instrutor no terminal. **Não há senha padrão.** O Node deve estar instalado em um caminho de sistema acessível ao usuário de serviço, por exemplo `/usr/bin/node` ou `/usr/local/bin/node`; instalações privadas em `/root` não funcionam com o isolamento do serviço.
3. Durante a configuração, mantenha `https://ara-mta.signau.cc` como URL pública, sem barra no final. A porta padrão é 3000; se estiver ocupada, altere `port` no arquivo `/var/lib/ara-mta/config.json` e no proxy. Mantenha o host `127.0.0.1`.
4. Integre **um** dos modelos em `deploy/nginx.conf` ou `deploy/apache.conf` ao virtual host desse subdomínio. Ajuste os caminhos reais do certificado. Os modelos são referências; não sobrescreva outros sites ou copie as duas opções. Não configure `root`, `alias`, `DocumentRoot` ou cache para a pasta do projeto. Todas as requisições passam pelo Node.
5. Valide o servidor web: `sudo nginx -t` ou `sudo apachectl configtest`. Se passar, recarregue o serviço correspondente: `sudo systemctl reload nginx` ou `sudo systemctl reload apache2` (o nome pode ser `httpd` em outras distribuições). No Apache, habilite os módulos citados no modelo usando o mecanismo da distribuição.
6. Entre pelo endereço HTTPS, com as credenciais criadas no terminal. Cadastre um aluno de teste. Verifique a ficha logado, o bloqueio em janela anônima, o acesso vencido e a prorrogação antes de distribuir as credenciais.

O instalador não altera DNS, certificados, firewall ou configurações dos sites existentes. O serviço escuta somente em loopback; não exponha a porta 3000 à internet. Desative cache de proxy/CDN para esse subdomínio. Se houver CDN na frente da VPS, configure a recuperação segura do IP real antes do limite de tentativas por IP. Em uma rede com muitos alunos no mesmo IP, dez tentativas incorretas em 15 minutos podem bloquear novas tentativas temporariamente para aquele IP.

## Uso em aula e estudo

No painel **Alunos e acessos**, use **Cadastrar aluno**. A data da prova é também o último dia de acesso. Se preferir outra data de encerramento, informe-a nesse campo. O botão **Gerar** sugere uma senha. Guarde-a antes de salvar e envie as credenciais ao aluno por um canal de sua escolha; o sistema não envia mensagens. Senhas não podem ser recuperadas, apenas substituídas. Para bloquear, desmarque **Acesso liberado** e salve. Para prorrogar, altere a data e salve. O aluno precisará entrar novamente.

No leitor, **Leitura** ajusta a ficha à largura; role para ler até o final. **Ficha inteira** mostra o pôster completo. As setas trocam de ficha. **F** alterna tela cheia; **A** ativa o modo aula; **B** pausa; **Esc** volta ao índice (alguns navegadores primeiro saem da tela cheia). No modo aula, mova o ponteiro para o topo ou rodapé para revelar controles. Compartilhe apenas a janela da apresentação na plataforma de aulas.

## Desenvolvimento local

Execute `npm run setup`, escolha uma senha e use `http://localhost:3000` como URL pública apenas para testar localmente. Depois execute `npm start` e abra exatamente esse endereço. Cookies sem Secure são aceitos somente no ambiente local configurado. A implantação deve usar HTTPS. Execute `npm test` para verificar autorização e vencimento. O diretório `data/` nunca deve entrar em pacotes de distribuição ou repositórios.

## Operação e backup

Consulte `sudo systemctl status ara-mta` e `sudo journalctl -u ara-mta`. Faça backups protegidos de `/var/lib/ara-mta` (cadastros e hashes de senha) e `/opt/ara-mta/private` (fichas). Limite o acesso aos backups; eles contêm dados pessoais. Para uma cópia consistente, pare o serviço, copie a pasta de dados e inicie novamente. Preserve as permissões e proprietários ao restaurar. Não exponha backups pelo servidor web. Defina sua rotina de retenção e exclusão de cadastros conforme a necessidade do curso; não há coleta além de nome, usuário, validade e senha protegida.

Para redefinir a senha do instrutor, pare o serviço e execute, na pasta `/opt/ara-mta`:

```
sudo systemctl stop ara-mta
sudo -u ara-mta env APP_CONFIG=/var/lib/ara-mta/config.json node scripts/reset-admin.mjs
sudo systemctl start ara-mta
```

Para substituir uma ficha, pare o serviço, substitua o JPEG correspondente em `private/media/` e a miniatura em `private/thumbs/`, mantenha os IDs e atualize o catálogo se necessário. Reinicie e confira. O sistema não possui upload público. A configuração e o banco são lidos na inicialização; alterações externas exigem reinício. Guarde a pasta de dados separada ao atualizar o código.

Pacote entregue para instalação. Não confirma instalação, TLS ou publicação na VPS: essas etapas dependem do acesso e da configuração efetiva do servidor.
