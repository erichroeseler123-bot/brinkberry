import http from 'http';
import { spawn } from 'child_process';
import widgetHandler from '../api/widget.js';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const server = http.createServer((req, res) => {
  widgetHandler(req, res);
});

server.listen(4571, '127.0.0.1', async () => {
  const proc = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9227',
    '--window-size=375,667',
    'http://127.0.0.1:4571/?city=denver&layout=grid&limit=6&partner=pilot_partner'
  ]);

  try {
    await new Promise(r => setTimeout(r, 3000));
    const list = await (await fetch('http://127.0.0.1:9227/json/list')).json();
    const tab = list.find(t => t.type === 'page');
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let id = 1;
    const send = (m, p = {}) => new Promise(res => {
      const cur = id++;
      const h = (e) => {
        const d = JSON.parse(e.data);
        if (d.id === cur) { ws.removeEventListener('message', h); res(d.result); }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id: cur, method: m, params: p }));
    });
    await new Promise(r => ws.onopen = r);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
    await new Promise(r => setTimeout(r, 2000));

    // 1. Measure standard grid layout
    const gridRes = await send('Runtime.evaluate', {
      expression: `(() => ({
        layout: 'grid',
        scrollHeight: document.documentElement.scrollHeight,
        cardsCount: document.querySelectorAll('.card').length
      }))()`,
      returnByValue: true
    });
    console.log('Grid Layout 6 Cards Mobile (375px):', gridRes.result?.value);

    // 2. Navigate to compact layout
    await send('Page.navigate', { url: 'http://127.0.0.1:4571/?city=denver&layout=compact&limit=6&partner=pilot_partner' });
    await new Promise(r => setTimeout(r, 2500));

    const compactRes = await send('Runtime.evaluate', {
      expression: `(() => ({
        layout: 'compact',
        scrollHeight: document.documentElement.scrollHeight,
        cardsCount: document.querySelectorAll('.card-compact').length
      }))()`,
      returnByValue: true
    });
    console.log('Compact Layout 6 Cards Mobile (375px):', compactRes.result?.value);

    ws.close();
  } finally {
    proc.kill();
    server.close();
  }
});
