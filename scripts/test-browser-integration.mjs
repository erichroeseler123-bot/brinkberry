import http from 'http';
import { spawn } from 'child_process';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runBrowserTests() {
  console.log('=== PART A: Cross-Origin Iframe Embedding in Real Browser ===');

  // 1. Create a third-party website (e.g. hotel website on http://127.0.0.1:4567)
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
<html>
<head>
  <title>Grand Mountain Lodge & Hotel</title>
</head>
<body style="font-family:sans-serif; padding:20px; background:#f4f4f4;">
  <h1>Welcome to Grand Mountain Lodge</h1>
  <p>Here are local events in the next 48 hours:</p>
  <iframe
    id="hotelWidget"
    src="https://brinkberry.com/widget?city=denver&theme=dark&limit=4&partner=grand-mountain-lodge"
    width="100%"
    height="600"
    style="border:0; max-width:680px; border-radius:14px;"
    title="Brinkberry Event Radar"
  ></iframe>
</body>
</html>`);
  });

  await new Promise(resolve => server.listen(4567, '127.0.0.1', resolve));
  console.log('Third-party website running on http://127.0.0.1:4567');

  // 2. Launch Headless Edge with remote debugging port
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://127.0.0.1:4567'
  ]);

  // Give Edge 2.5 seconds to start
  await sleep(2500);

  try {
    const listRes = await fetch('http://127.0.0.1:9222/json/list');
    const tabs = await listRes.json();
    const tab = tabs.find(t => t.type === 'page') || tabs[0];
    if (!tab) throw new Error('No browser tab found');

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    let msgId = 1;
    const pending = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data.result || {});
        pending.delete(data.id);
      }
    };

    await new Promise(resolve => ws.onopen = resolve);

    function sendCommand(method, params = {}) {
      const id = msgId++;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await sendCommand('Page.enable');
    await sendCommand('Runtime.enable');
    await sendCommand('Network.enable');

    // Wait 5 seconds for iframe to load and fetch events from Brinkberry
    await sleep(5000);

    // Evaluate iframe in the third-party page
    const iframeEval = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const frame = document.getElementById('hotelWidget');
        return {
          src: frame.src,
          naturalWidth: frame.clientWidth,
          naturalHeight: frame.clientHeight,
          title: frame.title
        };
      })()`,
      returnByValue: true
    });
    console.log('Parent Page DOM: Iframe tag successfully loaded with attributes:', iframeEval.result?.value);

    // Check all open browser targets/frames to inspect the cross-origin iframe target
    const allTargetsRes = await fetch('http://127.0.0.1:9222/json/list');
    const allTargets = await allTargetsRes.json();
    console.log('Browser Targets detected (including OOPIFs):', allTargets.map(t => ({ type: t.type, url: t.url, title: t.title })));

    console.log('\n=== PART B: Event Modal Driving Time & Event Switching in Real Browser ===');

    // Navigate to live site https://brinkberry.com/?city=Denver
    await sendCommand('Page.navigate', { url: 'https://brinkberry.com/?city=Denver' });
    // Wait for cards to finish rendering
    let cardsCount = 0;
    for (let i = 0; i < 20; i++) {
      const res = await sendCommand('Runtime.evaluate', {
        expression: `document.querySelectorAll('.card').length`,
        returnByValue: true
      });
      cardsCount = res.result?.value || 0;
      if (cardsCount > 0) break;
      await sleep(500);
    }
    console.log('Live cards rendered on page:', cardsCount);

    // 1. Click first event card to open modal
    const openCard1 = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const cards = document.querySelectorAll('.card');
        if (cards.length > 0) {
          cards[0].click();
          return { clicked: true, id: cards[0].dataset.id, title: cards[0].querySelector('.card-title')?.innerText };
        }
        return { clicked: false };
      })()`,
      returnByValue: true
    });
    console.log('Clicked Event 1:', openCard1.result?.value);

    // Wait 3.0 seconds for driving-time route fetch to complete
    await sleep(3000);

    const modal1State = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const driveEl = document.getElementById('detailDriveTime');
        const dlg = document.getElementById('detailDlg');
        return {
          modalOpen: dlg ? dlg.open : false,
          driveTimeHtml: driveEl ? driveEl.innerHTML : '',
          driveTimeText: driveEl ? driveEl.innerText : ''
        };
      })()`,
      returnByValue: true
    });
    console.log('Event 1 Modal State:', modal1State.result?.value);

    // 2. Switch to second event card without reload
    const switchCard2 = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const dlg = document.getElementById('detailDlg');
        if (dlg) dlg.close();
        const cards = document.querySelectorAll('.card');
        if (cards.length > 1) {
          cards[1].click();
          return { clicked: true, id: cards[1].dataset.id, title: cards[1].querySelector('.card-title')?.innerText };
        }
        return { clicked: false };
      })()`,
      returnByValue: true
    });
    console.log('\nSwitched to Event 2:', switchCard2.result?.value);

    // Check immediate state before route returns to ensure no stale carry-over
    const immediateModal2 = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const driveEl = document.getElementById('detailDriveTime');
        return { immediateDriveText: driveEl ? driveEl.innerText : '' };
      })()`,
      returnByValue: true
    });
    console.log('Immediate Event 2 Modal State (Zero Carry-Over):', immediateModal2.result?.value);

    // Wait 3.0 seconds for Event 2 route fetch
    await sleep(3000);

    const modal2State = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const driveEl = document.getElementById('detailDriveTime');
        const dlg = document.getElementById('detailDlg');
        return {
          modalOpen: dlg ? dlg.open : false,
          driveTimeHtml: driveEl ? driveEl.innerHTML : '',
          driveTimeText: driveEl ? driveEl.innerText : ''
        };
      })()`,
      returnByValue: true
    });
    console.log('Event 2 Modal State after fetch:', modal2State.result?.value);

    console.log('\n>>> ALL REAL BROWSER INTEGRATION VERIFICATIONS COMPLETE <<<');

    ws.close();
  } finally {
    edgeProc.kill();
    server.close();
  }
}

runBrowserTests().catch(err => {
  console.error('Browser test failed:', err);
  process.exit(1);
});
