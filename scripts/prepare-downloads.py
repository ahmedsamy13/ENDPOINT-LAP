#!/usr/bin/env python3
"""Validate the native build outputs and prepare stable GitHub Release filenames."""
import hashlib
from pathlib import Path
import shutil
import sys


def prepare(source: Path, output: Path) -> None:
    installers = {
        'Relay-Windows-x64-Setup.exe': list(source.glob('**/nsis/*_x64-setup.exe')),
        'Relay-Linux-amd64.deb': list(source.glob('**/deb/*_amd64.deb')),
    }
    for name, matches in installers.items():
        if len(matches) != 1:
            raise ValueError(f'Expected exactly one {name}, found {len(matches)}: {matches}')
        if matches[0].stat().st_size == 0:
            raise ValueError(f'Installer is empty: {matches[0]}')
    output.mkdir(parents=True, exist_ok=True)
    checksums = []
    for name, matches in installers.items():
        destination = output / name
        shutil.copy2(matches[0], destination)
        with destination.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        checksums.append(f'{digest}  {name}\n')
        print(f'{name}: {destination.stat().st_size:,} bytes')
    (output / 'SHA256SUMS.txt').write_text(''.join(checksums), encoding='utf-8')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: prepare-downloads.py ARTIFACT_DIRECTORY OUTPUT_DIRECTORY')
    prepare(Path(sys.argv[1]), Path(sys.argv[2]))
