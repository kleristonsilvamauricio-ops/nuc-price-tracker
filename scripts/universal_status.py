#!/usr/bin/env python3
"""Update only public integration status and official reference FX; no shop scraping."""
from __future__ import annotations
import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

BRASILIA = ZoneInfo('America/Fortaleza')
UTC = dt.timezone.utc
CAMPAIGN_END = dt.date(2026, 11, 30)
BCB_BASE = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata'
BCB_DATASET = 'https://dadosabertos.bcb.gov.br/dataset/dolar-americano-usd-todos-os-boletins-diarios'


def iso(value):
    return value.astimezone(UTC).isoformat(timespec='seconds')


def campaign_active(now):
    return dt.date(2026, 11, 26) <= now.astimezone(BRASILIA).date() <= CAMPAIGN_END


def bcb_url(now):
    today = now.astimezone(BRASILIA).date()
    start = today - dt.timedelta(days=10)
    params = {'@dataInicial': "'" + start.strftime('%m-%d-%Y') + "'",
              '@dataFinalCotacao': "'" + today.strftime('%m-%d-%Y') + "'",
              '$top': '1', '$orderby': 'dataHoraCotacao desc', '$format': 'json'}
    query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote, safe="@,$'")
    return BCB_BASE + '/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?' + query


def request_bcb(url):
    if not url.startswith(BCB_BASE + '/CotacaoDolarPeriodo('):
        raise ValueError('unapproved_source')
    request = urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'PriceTrackerUniversal/2.0'})
    with urllib.request.urlopen(request, timeout=15) as response:
        raw = response.read(250001)
    if len(raw) > 250000:
        raise ValueError('response_too_large')
    value = json.loads(raw.decode('utf-8'))
    if not isinstance(value, dict):
        raise ValueError('invalid_response')
    return value


def parse_rate(payload, now):
    rows = payload.get('value')
    if not isinstance(rows, list) or not rows:
        raise ValueError('no_rate_available')
    row = rows[0]
    if not isinstance(row, dict):
        raise ValueError('invalid_rate')
    rate = row.get('cotacaoVenda')
    if isinstance(rate, bool) or not isinstance(rate, (int, float)) or not math.isfinite(rate) or not 0.01 < rate < 1000:
        raise ValueError('invalid_rate')
    text = row.get('dataHoraCotacao')
    if not isinstance(text, str):
        raise ValueError('invalid_reference_date')
    published = dt.datetime.fromisoformat(text.replace('Z', '+00:00'))
    if published.tzinfo is None:
        published = published.replace(tzinfo=BRASILIA)
    if published > now + dt.timedelta(minutes=5):
        raise ValueError('future_reference_date')
    if now - published > dt.timedelta(days=11):
        raise ValueError('reference_too_old')
    return float(rate), published


def safe_error(exc):
    # Never publish response bodies, API headers, env values, or token-bearing URLs.
    if isinstance(exc, urllib.error.HTTPError):
        return 'http_' + str(exc.code)
    if isinstance(exc, (TimeoutError, urllib.error.URLError)):
        return 'connection_unavailable'
    if isinstance(exc, ValueError) and str(exc) in {'no_rate_available', 'invalid_rate', 'invalid_reference_date', 'future_reference_date', 'reference_too_old', 'response_too_large', 'invalid_response', 'unapproved_source'}:
        return str(exc)
    return 'invalid_response'


def previous_rate_valid(previous):
    rate = previous.get('rate')
    if isinstance(rate, bool) or not isinstance(rate, (int, float)) or not math.isfinite(rate) or not 0.01 < rate < 1000:
        return False
    if previous.get('base') != 'USD' or previous.get('quote') != 'BRL':
        return False
    try:
        dt.date.fromisoformat(previous['reference_date'])
        dt.datetime.fromisoformat(previous['observed_at'].replace('Z', '+00:00'))
    except (ValueError, TypeError, KeyError, AttributeError):
        return False
    return True


def collect_exchange(now, previous=None, fetch=request_bcb):
    previous = previous or {}
    url = bcb_url(now)
    result = {'schemaVersion': 1, 'base': 'USD', 'quote': 'BRL', 'rate': None,
              'reference_date': None, 'observed_at': None, 'checked_at': iso(now),
              'last_success_at': previous.get('last_success_at'), 'status': 'unavailable',
              'source': {'name': 'Banco Central do Brasil · PTAX venda', 'url': url, 'dataset': BCB_DATASET, 'license': 'ODbL'},
              'note': 'Taxa de referência; não inclui spread, IOF ou outros custos da compra.', 'error_code': None}
    try:
        rate, published = parse_rate(fetch(url), now)
        age = (now.astimezone(BRASILIA).date() - published.astimezone(BRASILIA).date()).days
        result.update(rate=rate, reference_date=published.astimezone(BRASILIA).date().isoformat(),
                      observed_at=iso(published), last_success_at=iso(now), status='ready' if age <= 4 else 'stale')
    except Exception as exc:
        result['error_code'] = safe_error(exc)
        if previous_rate_valid(previous):
            for field in ('rate', 'reference_date', 'observed_at', 'last_success_at'):
                result[field] = previous.get(field)
            result['source'] = previous.get('source') or result['source']
            result['status'] = 'stale'
    return result


def integration_status(now, exchange, environ=None):
    environ = os.environ if environ is None else environ
    stamp = iso(now)
    names = [('amazon-br', 'Amazon Brasil', 'BR'), ('mercado-livre', 'Mercado Livre', 'BR'), ('kabum', 'KaBuM!', 'BR'),
             ('amazon-us', 'Amazon EUA', 'US'), ('bh', 'B&H', 'US'), ('newegg', 'Newegg', 'US')]
    sources = [{'id': key, 'name': name, 'country': country, 'state': 'manual', 'checked_at': stamp,
                'last_success_at': None, 'price_requests_this_run': 0,
                'detail': 'Links e cotações manuais disponíveis; sem coleta automática habilitada.'}
               for key, name, country in names]
    configurations = [
        ('ebay', 'eBay EUA', bool(environ.get('EBAY_CLIENT_ID') and environ.get('EBAY_CLIENT_SECRET')),
         'API oficial exige acesso de produção e validação real. A coleta pública anterior retornou HTTP 403 e não é executada pela v2.'),
        ('bestbuy', 'Best Buy', bool(environ.get('BESTBUY_API_KEY')),
         'API oficial exige chave e validação real. Catálogo da API não é gravado no repositório público nem em backup permanente.')]
    sources.extend({'id': key, 'name': name, 'country': 'US', 'state': 'pending_validation' if configured else 'pending_config',
                    'checked_at': stamp, 'last_success_at': None, 'price_requests_this_run': 0, 'detail': detail}
                   for key, name, configured, detail in configurations)
    return {'schemaVersion': 1, 'checked_at': stamp, 'last_success_at': None,
            'schedule': {'kind': 'reference_data', 'timezone': 'America/Fortaleza',
                         'times': ['13:07', '18:07'], 'until': None, 'active': True,
                         'detail': 'Câmbio e estado das fontes são atualizados duas vezes por dia. GitHub Actions pode atrasar. Esta rotina não consulta preços de lojas.'},
            'nuc_campaign': {'timezone': 'America/Fortaleza', 'times': ['08:07', '13:07', '18:07'],
                             'until': CAMPAIGN_END.isoformat(), 'active': campaign_active(now),
                             'price_polling_enabled': False,
                             'detail': 'Prazo original do acompanhamento do NUC. A campanha de preços não foi prorrogada; a coleta das lojas continua pendente de integração.'},
            'sources': sources,
            'exchange': {'state': exchange['status'], 'last_success_at': exchange.get('last_success_at'),
                         'reference_date': exchange.get('reference_date'),
                         'detail': 'PTAX venda, referência oficial. A data da cotação é preservada em caso de falha.'},
            'privacy': {'local_catalog': True, 'private_data_uploaded': False},
            'counters': {'price_requests_this_run': 0, 'exchange_requests_this_run': 1},
            'detail': 'Verificação de configuração não comprova coleta de ofertas. Preços pessoais permanecem no navegador.'}


def read_json(path):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def write_json(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, delete=False) as handle:
        json.dump(content, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write('\n')
        temporary = Path(handle.name)
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', default='data')
    parser.add_argument('--event', choices=('manual', 'push', 'schedule'), default='manual')
    args = parser.parse_args()
    now = dt.datetime.now(UTC)
    # Reference FX keeps serving all products after the separate NUC campaign ends.
    # No shop requests are made, regardless of event or campaign state.
    path = Path(args.output_dir)
    exchange = collect_exchange(now, read_json(path / 'exchange.json'))
    write_json(path / 'exchange.json', exchange)
    write_json(path / 'automation-status.json', integration_status(now, exchange))
    print('FX status:', exchange['status'], '| Shop price requests: 0 | No private catalog uploaded.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
