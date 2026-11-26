import datetime as dt
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error

from scripts.universal_status import (
    bcb_url, campaign_active, collect_exchange, integration_status,
    parse_rate, read_json, safe_error, write_json,
)


NOW = dt.datetime(2026, 11, 26, 18, 0, tzinfo=dt.timezone.utc)


def payload(rate=5.7446, date='2026-11-26 13:11:27.937451'):
    return {'value': [{'cotacaoVenda': rate, 'dataHoraCotacao': date}]}


class PublicDataTests(unittest.TestCase):
    def test_official_odata_encoding(self):
        url = bcb_url(NOW)
        self.assertTrue(url.startswith('https://olinda.bcb.gov.br/'))
        self.assertIn("@dataFinalCotacao='11-26-2026'", url)
        self.assertIn('$orderby=dataHoraCotacao%20desc', url)
        self.assertNotIn('%40data', url)

    def test_reference_publication_time_uses_brasilia(self):
        rate, when = parse_rate(payload(), NOW)
        self.assertEqual(rate, 5.7446)
        self.assertEqual(when.astimezone(dt.timezone.utc).hour, 16)
        self.assertNotEqual(when, NOW)

    def test_invalid_rates_are_rejected(self):
        for rate in (True, None, '5.74', 0, -2, float('nan'), float('inf'), 1001):
            with self.subTest(rate=rate), self.assertRaises(ValueError):
                parse_rate(payload(rate), NOW)

    def test_empty_and_invalid_responses(self):
        for value in ({}, {'value': []}, {'value': {}}, {'value': [None]}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_rate(value, NOW)

    def test_future_or_old_reference_date_is_rejected(self):
        for date in ('2026-11-27 13:11:27', '2026-10-26 13:11:27'):
            with self.subTest(date=date), self.assertRaises(ValueError):
                parse_rate(payload(date=date), NOW)

    def test_success_preserves_reference_and_check_timestamps(self):
        value = collect_exchange(NOW, fetch=lambda _: payload())
        self.assertEqual(value['status'], 'ready')
        self.assertEqual(value['reference_date'], '2026-11-26')
        self.assertEqual(value['rate'], 5.7446)
        self.assertNotEqual(value['observed_at'], value['checked_at'])
        self.assertEqual(value['last_success_at'], value['checked_at'])

    def test_weekend_previous_business_day_is_not_fabricated(self):
        value = collect_exchange(NOW + dt.timedelta(days=3), fetch=lambda _: payload())
        self.assertEqual(value['reference_date'], '2026-11-26')
        self.assertEqual(value['status'], 'ready')

    def test_aging_result_is_labeled_stale(self):
        value = collect_exchange(NOW + dt.timedelta(days=6), fetch=lambda _: payload())
        self.assertEqual(value['status'], 'stale')
        self.assertEqual(value['reference_date'], '2026-11-26')

    def test_failed_fetch_keeps_last_real_rate_and_observation_time(self):
        previous = collect_exchange(NOW, fetch=lambda _: payload())
        def fail(_):
            raise TimeoutError('sensitive request details')
        later = collect_exchange(NOW + dt.timedelta(hours=3), previous, fail)
        for key in ('rate', 'reference_date', 'observed_at', 'last_success_at'):
            self.assertEqual(later[key], previous[key])
        self.assertNotEqual(later['checked_at'], previous['checked_at'])
        self.assertEqual(later['status'], 'stale')
        self.assertEqual(later['error_code'], 'connection_unavailable')
        self.assertNotIn('sensitive', json.dumps(later))

    def test_failure_without_previous_price_is_unavailable(self):
        value = collect_exchange(NOW, fetch=lambda _: {'value': []})
        self.assertEqual(value['status'], 'unavailable')
        self.assertIsNone(value['rate'])
        self.assertIsNone(value['last_success_at'])

    def test_malformed_previous_rate_is_not_reused(self):
        value = collect_exchange(NOW, {'rate': 5.7}, lambda _: {'value': []})
        self.assertIsNone(value['rate'])
        self.assertEqual(value['status'], 'unavailable')

    def test_http_errors_do_not_expose_urls_or_tokens(self):
        exc = urllib.error.HTTPError('https://example.invalid/?secret=private', 403, 'private', {}, None)
        self.assertEqual(safe_error(exc), 'http_403')

    def test_sources_without_keys_never_claim_live_collection(self):
        result = integration_status(NOW, collect_exchange(NOW, fetch=lambda _: payload()), {})
        by_id = {source['id']: source for source in result['sources']}
        self.assertEqual(by_id['ebay']['state'], 'pending_config')
        self.assertEqual(by_id['bestbuy']['state'], 'pending_config')
        self.assertTrue(all(source['last_success_at'] is None for source in result['sources']))
        self.assertEqual(result['counters']['price_requests_this_run'], 0)
        self.assertTrue(result['privacy']['local_catalog'])

    def test_credentials_mean_pending_validation_not_ready(self):
        env = {'EBAY_CLIENT_ID': 'TEST_ONLY_CLIENT', 'EBAY_CLIENT_SECRET': 'TEST_ONLY_SECRET', 'BESTBUY_API_KEY': 'TEST_ONLY_KEY'}
        result = integration_status(NOW, {'status': 'unavailable'}, env)
        by_id = {source['id']: source for source in result['sources']}
        self.assertEqual(by_id['ebay']['state'], 'pending_validation')
        self.assertEqual(by_id['bestbuy']['state'], 'pending_validation')
        self.assertNotIn('TEST_ONLY', json.dumps(result))

    def test_cutoff_is_in_brasilia_and_does_not_repeat_next_year(self):
        self.assertTrue(campaign_active(dt.datetime(2026, 12, 1, 2, 59, tzinfo=dt.timezone.utc)))
        self.assertFalse(campaign_active(dt.datetime(2026, 12, 1, 3, 0, tzinfo=dt.timezone.utc)))
        self.assertFalse(campaign_active(NOW.replace(year=2027)))

    def test_reference_schedule_remains_active_after_nuc_campaign_ends(self):
        future = dt.datetime(2026, 12, 1, 13, 0, tzinfo=dt.timezone.utc)
        result = integration_status(future, {'status': 'unavailable'}, {})
        self.assertEqual(result['schedule']['kind'], 'reference_data')
        self.assertEqual(result['schedule']['times'], ['13:07', '18:07'])
        self.assertTrue(result['schedule']['active'])
        self.assertIsNone(result['schedule']['until'])
        self.assertEqual(result['nuc_campaign']['until'], '2026-11-30')
        self.assertFalse(result['nuc_campaign']['active'])
        self.assertFalse(result['nuc_campaign']['price_polling_enabled'])
        self.assertEqual(result['counters']['price_requests_this_run'], 0)

    def test_campaign_metadata_does_not_enable_price_collection_before_expiry(self):
        result = integration_status(NOW, {'status': 'ready'}, {})
        self.assertTrue(result['nuc_campaign']['active'])
        self.assertFalse(result['nuc_campaign']['price_polling_enabled'])
        self.assertTrue(all(source['price_requests_this_run'] == 0 for source in result['sources']))

    def test_atomic_json_write_and_corrupt_file_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'nested/data.json'
            write_json(path, {'status': 'ready', 'name': 'câmbio'})
            self.assertEqual(read_json(path), {'status': 'ready', 'name': 'câmbio'})
            self.assertEqual(len(list(path.parent.iterdir())), 1)
            path.write_text('{incomplete')
            self.assertEqual(read_json(path), {})


if __name__ == '__main__':
    unittest.main()
