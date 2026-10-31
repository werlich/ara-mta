#!/usr/bin/env bash
# Instalador específico: Ubuntu 24.04 / Nginx / ara-mta.signau.cc
set -Eeuo pipefail
umask 077
domain=ara-mta.signau.cc
app=/opt/ara-mta
data=/var/lib/ara-mta
webroot=/var/www/ara-mta-acme
vhost=/etc/nginx/sites-available/ara-mta.signau.cc
enabled=/etc/nginx/sites-enabled/ara-mta.signau.cc
marker='ARA-MTA-INSTALADOR-V1'
source_dir="$(cd "$(dirname "$0")/.." && pwd)"
stage=''
backup=''
nginx_changed=0
previous_vhost=0
previous_link=0
fail(){ echo "ERRO: $*" >&2; return 1; }
cleanup(){ if [ -n "$stage" ] && [ -d "$stage" ]; then rm -rf -- "$stage"; fi; }
rollback(){
 local code=${1:-$?}
 trap - ERR
 echo 'A instalação parou. Confira a mensagem acima.' >&2
 if [ "$nginx_changed" -eq 1 ]; then
  if [ "$previous_vhost" -eq 1 ]; then cp -a "$backup/own-vhost" "$vhost"; else rm -f -- "$vhost"; fi
  if [ "$previous_link" -eq 1 ]; then cp -a --no-dereference "$backup/own-enabled" "$enabled"; else rm -f -- "$enabled"; fi
  if nginx -t; then systemctl reload nginx || true; fi
  echo 'Foi restaurada a configuração anterior deste subdomínio.' >&2
 fi
 echo 'Dados do curso foram preservados. Não remova /var/lib/ara-mta.' >&2
 if [ -n "$backup" ]; then echo "Backup: $backup" >&2; fi
 exit "$code"
}
trap cleanup EXIT
trap rollback ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
[ "$(id -u)" -eq 0 ] || fail 'Execute este instalador como root.'
[ -t 0 ] || fail 'Execute em terminal interativo para definir suas credenciais.'
. /etc/os-release
[ "$ID" = ubuntu ] && [ "$VERSION_ID" = 24.04 ] || fail 'Este instalador foi preparado para Ubuntu 24.04.'
for cmd in nginx systemctl python3 tar sha256sum runuser getent ss awk; do command -v "$cmd" >/dev/null || fail "Comando necessário ausente: $cmd"; done
systemctl is-active --quiet nginx || fail 'O Nginx precisa estar ativo.'
nginx -t
if [ -e "$app" ]; then
 [ -f "$app/.managed-installer" ] && grep -qx "$marker" "$app/.managed-installer" || fail '/opt/ara-mta já existe e não pertence a este instalador.'
fi
for path in "$vhost" "$enabled"; do
 if [ -e "$path" ] || [ -L "$path" ]; then
  grep -q "^# $marker$" "$path" || fail "Configuração existente preservada: $path. Envie a mensagem para análise."
 fi
done
for path in /etc/systemd/system/ara-mta.service /etc/systemd/system/ara-mta-cert-renew.service /etc/systemd/system/ara-mta-cert-renew.timer /etc/letsencrypt/renewal-hooks/deploy/ara-mta-reload; do
 if [ -e "$path" ]; then grep -q "$marker" "$path" || fail "Arquivo existente preservado: $path"; fi
done
# Recusa outra definição deste nome, inclusive em arquivos fora de sites-enabled.
check_dump="$(mktemp /tmp/ara-mta-nginx-check.XXXXXXXX)"
nginx -T > "$check_dump" 2>/dev/null
python3 - "$check_dump" "$domain" "$enabled" "$vhost" <<'PY'
import re,sys
from pathlib import Path
text=Path(sys.argv[1]).read_text(); Path(sys.argv[1]).unlink()
source=''
for line in text.splitlines():
 if line.startswith('# configuration file '):source=line[len('# configuration file '):].rstrip(':')
 clean=line.split('#',1)[0]
 if re.search(r'\bserver_name\b',clean) and sys.argv[2] in re.split(r'[\s;]+',clean) and source not in sys.argv[3:]:
  raise SystemExit('ERRO: o subdomínio já está configurado em '+source)
PY
missing=()
command -v curl >/dev/null || missing+=(curl)
command -v xz >/dev/null || missing+=(xz-utils)
command -v certbot >/dev/null || missing+=(certbot)
if [ "${#missing[@]}" -gt 0 ]; then
 apt-get update
 NEEDRESTART_MODE=l apt-get install -y --no-install-recommends "${missing[@]}" ca-certificates
fi
case "$(uname -m)" in x86_64) arch=x64;; aarch64) arch=arm64;; *) fail 'Arquitetura não suportada.';; esac
# Não altera /usr/bin/node, repositórios apt, PATH ou outras aplicações.
stage="$(mktemp -d /tmp/ara-mta-install.XXXXXXXX)"
chmod 700 "$stage"
backup="$(mktemp -d /root/ara-mta-backup-$(date +%Y%m%d-%H%M%S).XXXXXXXX)"
cp -a /etc/nginx "$backup/nginx"
if [ -e "$vhost" ]; then previous_vhost=1; cp -a "$vhost" "$backup/own-vhost"; fi
if [ -e "$enabled" ] || [ -L "$enabled" ]; then previous_link=1; cp -a --no-dereference "$enabled" "$backup/own-enabled"; fi
if [ -d "$data" ]; then cp -a "$data" "$backup/data"; fi
echo "Backup criado em $backup"
if ss -H -ltn 'sport = :3000' | grep -q .; then
 systemctl is-active --quiet ara-mta || fail 'A porta 3000 está ocupada por outro serviço.'
fi
if [ ! -e "$app" ]; then
 if getent passwd ara-mta >/dev/null; then fail 'Usuário ara-mta preexistente. Precisa ser verificado antes da instalação.'; fi
 [ ! -e "$data" ] || fail 'Pasta de dados preexistente sem instalação reconhecida.'
 install -d -m 750 "$app"
 printf '%s\n' "$marker" > "$app/.managed-installer"
 useradd --system --home-dir "$data" --shell /usr/sbin/nologin ara-mta
fi
getent passwd ara-mta >/dev/null || fail 'Usuário de serviço ausente.'
systemctl stop ara-mta.service 2>/dev/null || true
for file in server.mjs security.mjs package.json LEIA-ME.md; do install -m 640 "$source_dir/$file" "$app/$file"; done
for dir in public private scripts deploy; do cp -R "$source_dir/$dir" "$app/"; done
chown -R root:ara-mta "$app"
find "$app" -type d -exec chmod 750 {} +
find "$app" -type f -not -path "$app/node-runtime/*" -exec chmod 640 {} +
install -d -m 700 -o ara-mta -g ara-mta "$data"
if [ ! -x "$app/node-runtime/bin/node" ]; then
 echo 'Baixando Node.js 24 LTS do site oficial e verificando SHA-256…'
 curl --proto '=https' --tlsv1.2 -fsS --retry 2 --connect-timeout 15 --max-time 180 https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$stage/SHASUMS256.txt"
 archive="$(awk -v suffix="-linux-$arch.tar.xz" '$2 ~ /^node-v24\.[0-9]+\.[0-9]+-linux-/ && substr($2,length($2)-length(suffix)+1)==suffix {print $2}' "$stage/SHASUMS256.txt")"
 [[ "$archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || fail 'Não foi possível identificar um pacote oficial do Node 24.'
 version="${archive#node-}";version="${version%-linux-*}"
 curl --proto '=https' --tlsv1.2 -fsS --retry 2 --connect-timeout 15 --max-time 600 "https://nodejs.org/dist/$version/$archive" -o "$stage/$archive"
 awk -v name="$archive" '$2==name {print}' "$stage/SHASUMS256.txt" > "$stage/selected.sha256"
 (cd "$stage" && sha256sum -c selected.sha256)
 install -d -m 750 "$app/node-runtime"
 tar -xJf "$stage/$archive" --strip-components=1 -C "$app/node-runtime" --no-same-owner
 chown -R root:ara-mta "$app/node-runtime"
 chmod -R g+rX,o-rwx "$app/node-runtime"
fi
node_bin="$app/node-runtime/bin/node"
"$node_bin" -e 'if(Number(process.versions.node.split(".")[0])!==24)process.exit(1)'
if [ ! -f "$data/config.json" ]; then
 echo 'Defina agora o usuário e a senha do instrutor. Na URL, pressione Enter para manter o subdomínio.'
 (cd "$app" && runuser -u ara-mta -- env APP_CONFIG="$data/config.json" "$node_bin" scripts/setup.mjs)
fi
"$node_bin" --input-type=module - "$data/config.json" <<'JS'
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(config.origin!=='https://ara-mta.signau.cc'||config.host!=='127.0.0.1'||config.port!==3000||config.secureCookies!==true)throw Error('Configuração diferente da esperada. Não alterada automaticamente.');
JS
cat > /etc/systemd/system/ara-mta.service <<EOF
# $marker
[Unit]
Description=ARA MTA - Sala de navegacao
After=network.target
[Service]
Type=simple
User=ara-mta
Group=ara-mta
WorkingDirectory=$app
Environment=NODE_ENV=production
Environment=APP_CONFIG=$data/config.json
ExecStart=$node_bin $app/server.mjs
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$data
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now ara-mta
curl -fsS --retry 8 --retry-connrefused --retry-delay 1 http://127.0.0.1:3000/ -o /dev/null
install -d -m 755 "$webroot/.well-known/acme-challenge"
cat > "$stage/http.conf" <<EOF
# $marker
server {
    listen 80;
    listen [::]:80;
    server_name $domain;
    location ^~ /.well-known/acme-challenge/ {
        root $webroot;
        default_type text/plain;
        try_files \$uri =404;
    }
    location / { return 503; }
}
EOF
nginx_changed=1
install -m 644 "$stage/http.conf" "$vhost"
if [ ! -L "$enabled" ]; then ln -s "$vhost" "$enabled"; fi
nginx -t
systemctl reload nginx
echo 'Solicitando o certificado. O Certbot poderá pedir e-mail e aceitação dos termos no terminal.'
certbot certonly --webroot -w "$webroot" -d "$domain" --cert-name "$domain" --keep-until-expiring
cat > "$stage/https.conf" <<EOF
# $marker
server {
    listen 80;
    listen [::]:80;
    server_name $domain;
    location ^~ /.well-known/acme-challenge/ {
        root $webroot;
        default_type text/plain;
        try_files \$uri =404;
    }
    location / { return 301 https://$domain\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $domain;
    ssl_certificate /etc/letsencrypt/live/$domain/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$domain/privkey.pem;
    client_max_body_size 32k;
    add_header Strict-Transport-Security "max-age=31536000" always;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_no_cache 1;
        proxy_cache_bypass 1;
    }
}
EOF
install -m 644 "$stage/https.conf" "$vhost"
nginx -t
systemctl reload nginx
curl --noproxy "*" --resolve "$domain:443:127.0.0.1" --retry 10 --retry-all-errors --retry-delay 1 --connect-timeout 5 --max-time 15 -fsS "https://$domain/" -o /dev/null
status="$(curl --noproxy "*" --resolve "$domain:443:127.0.0.1" -sS -o /dev/null -w '%{http_code}' "https://$domain/api/media/ficha-01")"
[ "$status" = 401 ] || fail "Falha na verificação de acesso às fichas: HTTP $status."
hook=/etc/letsencrypt/renewal-hooks/deploy/ara-mta-reload
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
if [ -e "$hook" ]; then grep -q "$marker" "$hook" || fail 'Hook de renovação já existente: precisa ser verificado.'; fi
cat > "$hook" <<'HOOK'
#!/bin/sh
# ARA-MTA-INSTALADOR-V1
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/ara-mta.signau.cc ]; then
 /usr/sbin/nginx -t && /usr/bin/systemctl reload nginx
fi
HOOK
chmod 750 "$hook"
certbot_bin="$(command -v certbot)"
cat > /etc/systemd/system/ara-mta-cert-renew.service <<EOF
# $marker
[Unit]
Description=Renovar apenas o certificado ARA MTA
[Service]
Type=oneshot
ExecStart=$certbot_bin renew --cert-name $domain --quiet
EOF
cat > /etc/systemd/system/ara-mta-cert-renew.timer <<EOF
# $marker
[Unit]
Description=Verificar certificado ARA MTA diariamente
[Timer]
OnCalendar=daily
RandomizedDelaySec=3600
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now ara-mta-cert-renew.timer
nginx_changed=0
echo
echo "INSTALAÇÃO CONCLUÍDA: https://$domain"
echo 'Verificações locais: aplicação acessível por HTTPS; imagens sem login retornam HTTP 401.'
echo 'Entre com o usuário e a senha que definiu e faça um cadastro de aluno de teste.'
echo "Backup das configurações: $backup"
echo 'Para diagnóstico: systemctl status ara-mta --no-pager'
echo 'Caso não abra de outro computador, envie o resultado; a verificação final de acesso externo ainda é necessária.'
