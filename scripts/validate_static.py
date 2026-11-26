#!/usr/bin/env python3
"""Check that the checked-in buildless PWA references existing local assets."""
import json
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def local_target(owner, value):
    if not value or value.startswith('#'):
        return None
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return None
    path = unquote(parsed.path)
    if not path:
        return None
    return (ROOT / path.lstrip('/') if path.startswith('/') else owner.parent / path).resolve()


class Assets(HTMLParser):
    def __init__(self, owner):
        super().__init__()
        self.owner = owner
        self.references = []
    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        for key in ('src', 'href'):
            value = fields.get(key)
            if value and (tag != 'a' or not value.startswith('#')):
                self.references.append(value)


def validate(root=ROOT):
    failures = []
    for required in ('index.html', 'manifest.webmanifest', 'sw.js', 'data/exchange.json', 'data/automation-status.json'):
        if not (root / required).is_file():
            failures.append('Missing: ' + required)
    html_files = [root / 'index.html']
    if (root / 'legacy/index.html').exists():
        html_files.append(root / 'legacy/index.html')
    for path in html_files:
        if not path.exists():
            continue
        parser = Assets(path)
        parser.feed(path.read_text(encoding='utf-8'))
        for ref in parser.references:
            target = local_target(path, ref)
            if target is None:
                continue
            if not target.is_relative_to(root.resolve()):
                failures.append(f'Asset escapes app root: {path.name}: {ref}')
            elif not target.exists():
                failures.append(f'Unknown local asset: {path.relative_to(root)}: {ref}')
    manifest_path = root / 'manifest.webmanifest'
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text())
            if not manifest.get('name') or manifest.get('display') != 'standalone':
                failures.append('Manifest must have a name and standalone display.')
            for icon in manifest.get('icons', []):
                target = local_target(manifest_path, icon.get('src', ''))
                if target is None or not target.is_file():
                    failures.append('Missing local manifest icon.')
        except (ValueError, AttributeError):
            failures.append('Invalid manifest JSON.')
    for path in (root / 'src').glob('*.js'):
        source = path.read_text(encoding='utf-8')
        for match in re.finditer(r"(?:from\s*|import\s*)['\"]([^'\"]+)['\"]", source):
            ref = match.group(1)
            if ref.startswith('.') and not local_target(path, ref).is_file():
                failures.append(f'Missing import: {path.relative_to(root)}: {ref}')
    return failures


if __name__ == '__main__':
    errors = validate()
    if errors:
        print('\n'.join(errors))
        raise SystemExit(1)
    print('Static assets, manifest, and local module references verified.')
