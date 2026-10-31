#!/usr/bin/env python3
"""Inclui somente a ficha de hidrojato em um VPS existente, com backup e rollback."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request

SOURCE_REF = '50fa00e9352d322691cc2a094239c60122acbe51'
SOURCE = f'https://raw.githubusercontent.com/werlich/ara-mta/{SOURCE_REF}/private'
ENTRY = {
    'id': 'ficha-hidrojato',
    'file': 'ficha-hidrojato.jpg',
    'title': 'Hidrojato e dispositivos acoplados',
    'group': 'Legislação',
    'keywords': 'normam 212 moto aquática motonauta flyboard hoverboard jetpack jet wave boat colete classe V 200 metros inscrição',
    'width': 1536,
    'height': 1024,
}
HASHES = {
    'media': 'cdadd9e209c6bf4f95a036c63bc8d11fd3a839f333d8873b31c5350f5f06a10c',
    'thumbs': 'b2e3eae198b201e549736577ba2430bf8deffccbbf866df26f872699cad38554',
}


def updated_catalog(records):
    if not isinstance(records, list) or not all(isinstance(r, dict) and 'id' in r for r in records):
        raise ValueError('Catálogo inválido; nenhum arquivo foi alterado.')
    ids = [r['id'] for r in records]
    if len(ids) != len(set(ids)):
        raise ValueError('Há identificadores repetidos no catálogo; atualização cancelada.')
    if ENTRY['id'] in ids:
        if records[ids.index(ENTRY['id'])] != ENTRY:
            raise ValueError('Já existe uma ficha de hidrojato diferente. Nenhuma ficha será substituída.')
        return records
    if any(r.get('file') == ENTRY['file'] for r in records):
        raise ValueError('O nome do JPEG já está em uso por outra ficha.')
    result = list(records)
    index = ids.index('ficha-15') + 1 if 'ficha-15' in ids else len(result)
    result.insert(index, dict(ENTRY))
    return result


def atomic_write(path, data, metadata):
    fd, tmp = tempfile.mkstemp(prefix='.hidrojato-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            os.fchmod(stream.fileno(), stat.S_IMODE(metadata.st_mode))
            os.fchown(stream.fileno(), metadata.st_uid, metadata.st_gid)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Execute como root no terminal do VPS.')
    app = Path('/opt/ara-mta')
    private = app / 'private'
    catalog_path = private / 'catalog.json'
    if not catalog_path.is_file() or not (private / 'media').is_dir() or not (private / 'thumbs').is_dir():
        raise RuntimeError('A instalação esperada em /opt/ara-mta não foi encontrada.')
    subprocess.run(['systemctl', 'is-active', '--quiet', 'ara-mta'], check=True)
    original = catalog_path.read_bytes()
    catalog = updated_catalog(json.loads(original))
    payloads = {}
    for folder, expected in HASHES.items():
        print(f'Baixando {folder}...', flush=True)
        with urllib.request.urlopen(f'{SOURCE}/{folder}/{ENTRY["file"]}', timeout=45) as response:
            data = response.read(8 * 1024 * 1024)
        if hashlib.sha256(data).hexdigest() != expected:
            raise RuntimeError(f'Verificação da imagem {folder} falhou. Nenhum arquivo foi alterado.')
        target = private / folder / ENTRY['file']
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != expected:
            raise RuntimeError(f'O arquivo {target} já existe com outro conteúdo; atualização cancelada.')
        payloads[target] = data
    backup = Path(tempfile.mkdtemp(prefix='ara-mta-backup-hidrojato-', dir=app.parent))
    shutil.copy2(catalog_path, backup / 'catalog.json')
    existing = {p: p.exists() for p in payloads}
    metadata = catalog_path.stat()
    # Tudo é validado antes de instalar. Não altera cadastros nem registros de estudo.
    try:
        for path, data in payloads.items():
            atomic_write(path, data, path.stat() if existing[path] else metadata)
        # Não sobrescrever alterações de catálogo feitas durante os downloads.
        if catalog_path.read_bytes() != original:
            raise RuntimeError('O catálogo mudou durante a atualização. Tente novamente.')
        atomic_write(catalog_path, (json.dumps(catalog, ensure_ascii=False, indent=2) + '\n').encode(), metadata)
        subprocess.run(['systemctl', 'restart', 'ara-mta'], check=True)
        config_path = Path('/var/lib/ara-mta/config.json')
        port = int(json.loads(config_path.read_text()).get('port', 3000)) if config_path.is_file() else 3000
        healthy = False
        for _ in range(30):
            try:
                subprocess.run(['systemctl', 'is-active', '--quiet', 'ara-mta'], check=True)
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=2) as response:
                    healthy = response.status == 200 and b'id="login"' in response.read()
                if healthy:
                    break
            except Exception:
                pass
            time.sleep(0.2)
        if not healthy:
            raise RuntimeError('O serviço não respondeu como esperado após a atualização.')
    except Exception:
        # Restaurar apenas se este instalador efetivamente modificou o catálogo.
        current = catalog_path.read_bytes()
        installed = (json.dumps(catalog, ensure_ascii=False, indent=2) + '\n').encode()
        if current == installed:
            atomic_write(catalog_path, original, metadata)
        for path in payloads:
            if not existing[path] and path.exists():
                path.unlink()
        subprocess.run(['systemctl', 'restart', 'ara-mta'], check=False)
        print(f'Atualização cancelada. Backup preservado em {backup}.', file=sys.stderr)
        raise
    print(f'Ficha instalada com sucesso! Catálogo com {len(catalog)} fichas.')
    print(f'Backup: {backup}')
    print('Entre novamente no site e abra Legislação > Hidrojato e dispositivos acoplados.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'ERRO: {exc}', file=sys.stderr)
        sys.exit(1)
