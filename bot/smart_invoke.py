"""One-shot invoker for the Smart workflow "SPX Tìm đơn tương đồng" (Workflow-as-API).

Usage (run from a machine that can reach smart.shopee.io):
    python bot/smart_invoke.py --product-name "Yame Jean Nam" --inbound-time "2026-10-17 17:41"
    python bot/smart_invoke.py --product-name "Yame Jean Nam" --inbound-time "2026-10-17 17:41" --photo /path/to/img.png

Reads SMART_ENDPOINT_HASH / SMART_ENDPOINT_KEY (and optional SMART_ENDPOINT_URL)
from .env next to the repo root. Prints each stage + the final output shape so
P1 can be verified and the result shape captured into docs/smart.md.
"""
import argparse
import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request

DEFAULT_URL = 'https://smart.shopee.io/apis/smart/v1/workflow_orchestrator/deployments/invoke'
TIMEOUT = 300


def load_env(path):
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def find_env():
    # walk up from this file to find .env
    here = os.path.dirname(os.path.abspath(__file__))
    for d in (here, os.path.dirname(here)):
        cand = os.path.join(d, '.env')
        if os.path.exists(cand):
            return cand
    return os.path.join(os.getcwd(), '.env')


def to_data_url(photo_path):
    if not photo_path:
        return ''
    mime = mimetypes.guess_type(photo_path)[0] or 'image/png'
    with open(photo_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('ascii')
    return 'data:%s;base64,%s' % (mime, b64)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--product-name', default='')
    ap.add_argument('--inbound-time', required=True)
    ap.add_argument('--photo', default='')
    ap.add_argument('--dry', action='store_true', help='print body, do not POST')
    args = ap.parse_args()

    env = load_env(find_env())
    hash_id = env.get('SMART_ENDPOINT_HASH', '').strip()
    key = env.get('SMART_ENDPOINT_KEY', '').strip()
    url = env.get('SMART_ENDPOINT_URL', '').strip() or DEFAULT_URL

    if not hash_id or not key:
        print('ERROR: missing SMART_ENDPOINT_HASH / SMART_ENDPOINT_KEY in .env', file=sys.stderr)
        sys.exit(2)

    body = {
        'endpoint_deployment_hash_id': hash_id,
        'endpoint_deployment_key': key,
        'user_id': env.get('SMART_USER_ID', '').strip() or None,
        'mode': 'sync',
        'start_user_variables': {
            'product_name': args.product_name,
            'inbound_time': args.inbound_time,
        },
    }
    photo = to_data_url(args.photo) if args.photo else ''
    if photo:
        body['start_user_variables']['photo'] = photo
    # drop null user_id
    if body['user_id'] is None:
        del body['user_id']

    print('STAGE 1 invoke ->', url)
    print('STAGE 2 body (masked) size:', len(json.dumps(body)))
    scrubbed = json.dumps(body).replace(hash_id, '[hash]').replace(key, '[key]')
    if args.dry:
        print('DRY-RUN body:', scrubbed[:1500])
        return

    t0 = time.time()
    req = urllib.request.Request(
        url, data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            code = resp.getcode()
            text = resp.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        code = e.code
        text = e.read().decode('utf-8', 'replace')
    except Exception as e:
        print('STAGE 3 FAILED transport:', repr(e), file=sys.stderr)
        sys.exit(1)
    dt = time.time() - t0
    print('STAGE 3 HTTP', code, 'in %.1fs' % dt)
    print('STAGE 4 raw (masked):', scrubbed_body(text, hash_id, key)[:2000])

    try:
        j = json.loads(text or '{}')
    except Exception:
        print('STAGE 5 parse: NOT JSON', file=sys.stderr)
        sys.exit(1)

    data = j.get('data') if isinstance(j, dict) else None
    success = (data or {}).get('success') if isinstance(data, dict) else None
    thread_id = (data or {}).get('thread_id') if isinstance(data, dict) else None
    output = (data or {}).get('output') if isinstance(data, dict) else None
    err = (data or {}).get('error') if isinstance(data, dict) else None
    print('STAGE 5 status envelope:', j.get('status'), '| code:', j.get('code'))
    print('STAGE 5 data.success:', success, '| thread_id:', thread_id)
    if err:
        print('STAGE 5 data.error:', str(err)[:500])
    if output is not None:
        print('STAGE 6 output keys:', list(output.keys()) if isinstance(output, dict) else type(output).__name__)
        print('STAGE 6 output (masked):', scrubbed_body(json.dumps(output), hash_id, key)[:3000])
    else:
        print('STAGE 6 output: (none)')
    if success is False or err:
        sys.exit(1)


def scrubbed_body(s, h, k):
    s = str(s)
    if h: s = s.replace(h, '[hash]')
    if k: s = s.replace(k, '[key]')
    return s


if __name__ == '__main__':
    main()
PYEOF