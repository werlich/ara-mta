#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo 'Execute como root com sudo bash deploy/install.sh'; exit 1; fi
source_dir="$(cd "$(dirname "$0")/.." && pwd)"
node_bin="$(command -v node || true)"
if [ -z "$node_bin" ]; then echo 'Instale uma versão LTS do Node.js, 22 ou superior, antes de continuar.'; exit 1; fi
"$node_bin" -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)' || { echo 'Node.js 22 ou superior é necessário.'; exit 1; }
if [ -e /opt/ara-mta ]; then echo '/opt/ara-mta já existe. Instalação interrompida para preservar o projeto.'; exit 1; fi
if [ -e /var/lib/ara-mta/config.json ]; then echo 'Dados existentes encontrados. Instalação interrompida.'; exit 1; fi
getent passwd ara-mta >/dev/null || useradd --system --home-dir /var/lib/ara-mta --shell /usr/sbin/nologin ara-mta
install -d -m 750 /opt/ara-mta
cp -R "$source_dir"/. /opt/ara-mta/
chown -R root:ara-mta /opt/ara-mta
chmod -R o-rwx /opt/ara-mta
chmod -R g+rX /opt/ara-mta
install -d -m 700 -o ara-mta -g ara-mta /var/lib/ara-mta
cd /opt/ara-mta
runuser -u ara-mta -- env APP_CONFIG=/var/lib/ara-mta/config.json "$node_bin" scripts/setup.mjs
cat > /etc/systemd/system/ara-mta.service <<EOF
[Unit]
Description=ARA MTA - Sala de navegacao
After=network.target
[Service]
Type=simple
User=ara-mta
Group=ara-mta
WorkingDirectory=/opt/ara-mta
Environment=NODE_ENV=production
Environment=APP_CONFIG=/var/lib/ara-mta/config.json
ExecStart=$node_bin /opt/ara-mta/server.mjs
Restart=on-failure
RestartSec=5
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/ara-mta
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now ara-mta
echo 'Aplicação instalada em 127.0.0.1:3000. Configure o virtual host e HTTPS antes de acessar pelo domínio.'
