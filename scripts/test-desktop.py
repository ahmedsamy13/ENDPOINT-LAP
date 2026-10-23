#!/usr/bin/env python3
"""Real Tauri/WebKit smoke test. Requires tauri-driver and a graphical session.
TAURI_DRIVER_URL defaults to localhost:4444; ENDPOINT_BINARY selects the executable.
No renderer mocks: all commands cross IPC into the Rust HTTP engine and SQLite.
"""
import base64
import http.server
import json
import os
from pathlib import Path
import threading
import time
import urllib.error
import urllib.request
import uuid
from urllib.parse import parse_qs, urlsplit

BASE = os.environ.get('TAURI_DRIVER_URL', 'http://127.0.0.1:4444')
BINARY = os.environ.get('ENDPOINT_BINARY', str(Path(__file__).resolve().parents[1] / 'src-tauri/target/debug/endpoint-lap'))
SESSION = ''

class Fixture(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/slow':
            time.sleep(3)
        if self.path == '/redirect':
            self.send_response(302)
            self.send_header('Location', 'http://localhost:1/unreachable')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        self.reply()
    def do_POST(self):
        self.reply()
    def reply(self):
        length = int(self.headers.get('Content-Length', '0'))
        payload = self.rfile.read(length).decode(errors='replace')
        body = json.dumps({'ok': True, 'token': 'fixture-access-token', 'body': payload, 'authorization': self.headers.get('Authorization'), 'path': self.path}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Set-Cookie', 'session=fixture; HttpOnly; SameSite=Strict')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            pass
    def log_message(self, *_):
        pass


def request(path, data=None, method=None):
    req = urllib.request.Request(BASE + path, data=json.dumps(data).encode() if data is not None else None, headers={'Content-Type': 'application/json'}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            value = json.load(r)['value']
    except urllib.error.HTTPError as e:
        raise RuntimeError(e.read().decode()) from e
    if isinstance(value, dict) and 'error' in value and 'message' in value:
        raise RuntimeError(value)
    return value


def script(js, args=None):
    return request(f'/session/{SESSION}/execute/sync', {'script': js, 'args': args or []})


def invoke(command, args=None, allow_error=False):
    value = request(f'/session/{SESSION}/execute/async', {'script': "const [command,args,done]=arguments;window.__TAURI_INTERNALS__.invoke(command,args).then(value=>done({ok:true,value})).catch(e=>done({ok:false,error:String(e)}));", 'args': [command, args or {}]})
    if not value['ok'] and not allow_error:
        raise RuntimeError(value['error'])
    return value if allow_error else value.get('value')


def wait(js, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = script(js)
        if result:
            return result
        time.sleep(.1)
    raise AssertionError(f'Timed out: {js}')


def start():
    global SESSION
    start_time = time.monotonic()
    SESSION = request('/session', {'capabilities': {'alwaysMatch': {'tauri:options': {'application': BINARY}}}})['sessionId']
    wait("return document.body.innerText.includes('Native engine connected') && !!document.querySelector('.welcome-cta, .url-input')")
    return round((time.monotonic()-start_time)*1000)


def main():
    global SESSION
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}'
    try:
        startup = start()
        project = invoke('list_nodes', {'project': None})[0]
        p = project['id']
        folder = str(uuid.uuid4())
        request_id = str(uuid.uuid4())
        environment_id = str(uuid.uuid4())
        auth = {'type':'none','token':'','username':'','password':'','key':'X-API-Key','value':'','location':'header','tokenUrl':'','clientId':'','clientSecret':'','scope':'','grant':'client_credentials','refreshToken':''}
        data = {'url':url+'/json','method':'POST','description':'Native integration fixture','params':[], 'headers':[], 'bodyType':'json','body':'{"hello":"native"}','fields':[],'auth':auth,'variables':[], 'assertions':[{'id':'a','type':'status','path':'','expected':'200'},{'id':'b','type':'json','path':'$.ok','expected':'true'},{'id':'c','type':'schema','path':'','expected':'{"type":"object","required":["ok"]}'}], 'extractions':[{'path':'response.body.token','variable':'accessToken','secret':False}],'timeoutMs':30000,'followRedirects':True,'maxResponseBytes':1048576}
        def node(i,parent,kind,name,d):
            return {'id':i,'projectId':p,'parentId':parent,'kind':kind,'name':name,'method':'POST' if kind=='request' else None,'favorite':False,'data':d}
        invoke('save_node', {'node':node(folder,p,'collection','Native smoke tests',{})})
        invoke('save_node', {'node':node(request_id,folder,'request','Native request',data)})
        invoke('save_environment', {'environment':{'id':environment_id,'projectId':p,'name':'Native fixture','variables':[]}})
        transient = str(uuid.uuid4())
        bad = node(str(uuid.uuid4()),'missing-parent','request','Invalid',data)
        result = invoke('import_workspace', {'nodes':[node(transient,p,'folder','Should roll back',{}),bad],'environments':[]}, True)
        assert not result['ok']
        assert not invoke('get_node',{'id':transient},True)['ok'], 'Failed import was not rolled back'
        print('PASS native SQLite hierarchy and transactional rollback')
        invoke('save_setting',{'key':'workspace','value':{'projectId':p,'environmentId':environment_id,'tabs':[request_id],'activeId':request_id}})
        request(f'/session/{SESSION}/refresh', {})
        wait("return !!document.querySelector('.url-input')")
        wait("return document.querySelector('.url-input').value.includes('/json')")
        script("document.querySelector('.send-button').click()")
        wait("return document.querySelector('.status-chip')?.innerText.includes('200')")
        wait("return !document.querySelector('.send-button.cancel') && document.querySelectorAll('.response-tabs button').length===7")
        errors = script("return [...document.querySelectorAll('.error-banner')].map(e=>e.innerText)")
        assert not errors, errors
        script("[...document.querySelectorAll('.response-tabs button')].find(b=>b.textContent.trim().startsWith('Tests')).click()")
        wait("return document.querySelectorAll('.test-pass').length===3")
        assert script("return document.querySelectorAll('.test-fail').length") == 0
        env = next(e for e in invoke('list_environments') if e['id']==environment_id)
        assert env['variables'][0]['value']=='fixture-access-token'
        assert invoke('list_history')[0]['status']==200
        print('PASS real desktop UI → Rust POST → response → 3 worker assertions (including schema) → environment extraction → history')
        result = request(f'/session/{SESSION}/execute/async', {'script': "const [url,done]=arguments;const api=window.__TAURI_INTERNALS__;setTimeout(()=>api.invoke('cancel_request',{id:'cancel-smoke'}),150);api.invoke('execute_request',{request:{id:'cancel-smoke',url:url+'/slow',method:'GET'}}).then(()=>done(false)).catch(e=>done(String(e).includes('cancelled')));", 'args':[url]})
        assert result, 'Cancellation did not abort the native request'
        response = invoke('execute_request',{'request':{'id':'redirect','url':url+'/redirect','method':'GET'}})
        assert response['status']==302 and response['redirects']==0
        response = invoke('execute_request',{'request':{'id':'basic','url':url+'/json','method':'GET','headers':[{'key':'Authorization','value':'Basic-Endpoint user:fixture-password','enabled':True}]}})
        assert json.loads(response['body'])['authorization']=='Basic '+base64.b64encode(b'user:fixture-password').decode()
        print('PASS native cancellation, cross-origin redirect safety and Basic auth')
        for encoding in ['form','multipart']:
            response=invoke('execute_request',{'request':{'id':encoding,'url':url+'/json','method':'POST','bodyType':encoding,'fields':[{'key':'name','value':'Ada & Grace','enabled':True}]}})
            payload=json.loads(response['body'])['body']
            assert ('name=Ada+%26+Grace' in payload) if encoding=='form' else ('Ada & Grace' in payload)
        response=invoke('execute_request',{'request':{'id':'binary','url':url+'/json','method':'POST','bodyType':'binary','upload':base64.b64encode(b'fixture-upload').decode()}})
        assert json.loads(response['body'])['body']=='fixture-upload'
        print('PASS native URL-encoded forms, multipart text fields and binary uploads')
        if os.environ.get('ENDPOINT_TEST_KEYCHAIN')=='1':
            credential='smoke-'+str(uuid.uuid4())
            reference=invoke('store_secret',{'name':credential,'value':'fixture+value&?'})
            assert reference=='{{secret:'+credential+'}}'
            response=invoke('execute_request',{'request':{'id':'vault-query','url':url+'/json?key='+reference,'method':'GET'}})
            actual=parse_qs(urlsplit(json.loads(response['body'])['path']).query)['key'][0]
            assert actual=='fixture+value&?', 'Secret query resolution changed the value'
            invoke('delete_secret',{'name':credential})
            print('PASS OS keychain store → native query resolution/encoding → delete')
        screenshot = request(f'/session/{SESSION}/screenshot')
        output=Path('test-results');output.mkdir(exist_ok=True)
        (output/'native-desktop.png').write_bytes(base64.b64decode(screenshot))
        request(f'/session/{SESSION}',method='DELETE');SESSION=''
        restart = start()
        assert invoke('get_node',{'id':request_id})['data']['body']==data['body']
        assert any(e['id']==environment_id for e in invoke('list_environments'))
        print('PASS SQLite saved request and environment survive application restart')
        print(json.dumps({'webdriverStartupMs':startup,'webdriverRestartMs':restart,'binary':Path(BINARY).name,'binaryBytes':Path(BINARY).stat().st_size,'note':'WebDriver startup includes driver negotiation; not a cold-start benchmark.'}))
        # Remove fixture data while retaining all pre-existing user workspace data.
        invoke('delete_node',{'id':folder})
        invoke('delete_environment',{'id':environment_id})
    except Exception:
        if SESSION:
            print(script('return document.body.innerText'))
            print(script("return [...document.querySelectorAll('.response-tabs button')].map(b=>({text:b.textContent,inner:b.innerText}))"))
        raise
    finally:
        if SESSION:
            request(f'/session/{SESSION}',method='DELETE')
        server.shutdown()

if __name__=='__main__':
    main()
