"""Daemon bridge: GAS SmartJobs queue <-> Smart Workflow-as-API (sync).

Runs on a machine inside the Shopee network (smart.shopee.io is intranet-only).
Loop every 3s:
  1. GET  <GAS_EXEC_URL>?action=smartjobs&token=<TOKEN>&site=<SITE>
  2. for each pending job: POST smartclaim {jobId, bridgeId, token, site}
  3. on claim OK: invoke Workflow-as-API (mode sync, 300s) -> POST smartcomplete
     {jobId, ok, result|error, thread_id, token, site}

Config via .env:
  GAS_EXEC_URL        (required)  e.g. https://script.google.com/macros/s/.../exec
  SMART_BRIDGE_TOKEN  (required)  must equal Script Property SMART_BRIDGE_TOKEN
  SMART_ENDPOINT_HASH / SMART_ENDPOINT_KEY / SMART_ENDPOINT_URL  (Smart creds)
  BRIDGE_SITE (optional, default HN2)
  BRIDGE_ID   (optional, default hostname)
"""
import base64
import json
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request

POLL_INTERVAL = 3
CLAIM_BACKOFF_ON_ERROR = 10
TIMEOUT_INVOKE = 300


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
    here = os.path.dirname(os.path.abspath(__file__))
    for d in (here, os.path.dirname(here)):
        cand = os.path.join(d, '.env')
        if os.path.exists(cand):
            return cand
    return os.path.join(os.getcwd(), '.env')


def http_json(method, url, payload=None, timeout=30):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode('utf-8', 'replace')
            try:
                return resp.getcode(), json.loads(raw or '{}')
            except Exception:
                return resp.getcode(), {'raw': raw}
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'replace')
        try:
            return e.code, json.loads(raw or '{}')
        except Exception:
            return e.code, {'raw': raw}
    except Exception as e:
        return 0, {'error': repr(e)}


def invoke_smart(env, product_name, inbound_time, photo_data_url=''):
    hash_id = env.get('SMART_ENDPOINT_HASH', '').strip()
    key = env.get('SMART_ENDPOINT_KEY', '').strip()
    url = env.get('SMART_ENDPOINT_URL', '').strip() or 'https://smart.shopee.io/apis/smart/v1/workflow_orchestrator/deployments/invoke'
    body = {
        'endpoint_deployment_hash_id': hash_id,
        'endpoint_deployment_key': key,
        'user_id': (env.get('SMART_USER_ID', '').strip() or None),
        'mode': 'sync',
        'start_user_variables': {
            'product_name': product_name,
            'inbound_time': inbound_time,
            'photo': photo_data_url,
        },
    }
    if body['user_id'] is None:
        del body['user_id']
    code, j = http_json('POST', url, body, timeout=TIMEOUT_INVOKE)
    if code != 200:
        return False, None, 'Smart HTTP %d' % code
    data = j.get('data') if isinstance(j, dict) else None
    if not isinstance(data, dict):
        return False, None, 'Smart response has no data envelope'
    if data.get('success') is False:
        return False, None, str(data.get('error') or data.get('message') or 'Smart reported failure')
    thread_id = data.get('thread_id')
    # Flexible output: store the whole data.output (bridge does not reshape).
    output = data.get('output')
    if output is None:
        output = data.get('result')
    if output is None:
        output = data
    return True, {'output': output, 'thread_id': thread_id}, None


def main():
    env = load_env(find_env())
    gas_url = env.get('GAS_EXEC_URL', '').strip()
    token = env.get('SMART_BRIDGE_TOKEN', '').strip()
    site = env.get('BRIDGE_SITE', 'HN2').strip() or 'HN2'
    bridge_id = env.get('BRIDGE_ID', '').strip() or socket.gethostname()
    if not gas_url or not token:
        print('FATAL: GAS_EXEC_URL and SMART_BRIDGE_TOKEN are required in .env', flush=True)
        raise SystemExit(2)

    print('bridge starting: site=%s bridge_id=%s gas=%s' % (site, bridge_id, gas_url), flush=True)
    while True:
        try:
            url = gas_url + '?action=smartjobs&token=' + urllib.parse.quote(token) + '&site=' + urllib.parse.quote(site)
            code, j = http_json('GET', url, None, timeout=20)
            if code != 200 or not (isinstance(j, dict) and j.get('ok')):
                print('poll smartjobs failed: HTTP %d %s' % (code, (j.get('error') if isinstance(j, dict) else j)), flush=True)
                time.sleep(CLAIM_BACKOFF_ON_ERROR)
                continue
            jobs = (j.get('data') or {}).get('jobs') or []
            for job in jobs:
                jid = job.get('jobId')
                if not jid:
                    continue
                # claim
                ccode, cj = http_json('POST', gas_url, {
                    'action': 'smartclaim', 'jobId': jid, 'bridgeId': bridge_id,
                    'token': token, 'site': site,
                }, timeout=20)
                if not (ccode == 200 and isinstance(cj, dict) and cj.get('ok')):
                    # already claimed or missing -> skip
                    continue
                product_name = job.get('productName', '')
                inbound_time = job.get('inboundTime', '')
                photo_file_id = (job.get('photoFileId') or '').strip()
                photo_data_url = ''
                if photo_file_id:
                    print('fetching photo %s for job %s' % (photo_file_id, jid), flush=True)
                    gcode, gj = http_json('GET', gas_url + '?action=getPhoto&fileId=' + urllib.parse.quote(photo_file_id) + '&token=' + urllib.parse.quote(token) + '&site=' + urllib.parse.quote(site), None, timeout=30)
                    if gcode == 200 and isinstance(gj, dict) and gj.get('ok'):
                        gd = gj.get('data') or {}
                        mime = gd.get('mime') or 'image/jpeg'
                        b64 = gd.get('b64') or ''
                        if b64:
                            photo_data_url = 'data:%s;base64,%s' % (mime, b64)
                    else:
                        print('photo fetch failed for %s: HTTP %d' % (photo_file_id, gcode), flush=True)
                print('claimed job %s (%s / %s)%s' % (jid, product_name, inbound_time, ' [photo]' if photo_data_url else ''), flush=True)
                ok_flag, result, err = invoke_smart(env, product_name, inbound_time, photo_data_url)
                thread_id = None
                if isinstance(result, dict):
                    thread_id = result.get('thread_id')
                payload = {
                    'action': 'smartcomplete', 'jobId': jid, 'ok': bool(ok_flag),
                    'token': token, 'site': site,
                }
                if ok_flag:
                    payload['result'] = result.get('output') if isinstance(result, dict) else result
                    if thread_id:
                        payload['thread_id'] = thread_id
                else:
                    payload['error'] = err or 'invoke failed'
                scode, sj = http_json('POST', gas_url, payload, timeout=30)
                if not (scode == 200 and isinstance(sj, dict) and sj.get('ok')):
                    print('complete failed for %s: HTTP %d %s' % (jid, scode, sj), flush=True)
                else:
                    print('completed job %s -> %s' % (jid, 'done' if ok_flag else 'error'), flush=True)
            time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            print('bridge stopped', flush=True)
            raise SystemExit(0)
        except Exception as e:
            print('bridge loop error:', repr(e), flush=True)
            time.sleep(CLAIM_BACKOFF_ON_ERROR)


if __name__ == '__main__':
    main()
PYEOF