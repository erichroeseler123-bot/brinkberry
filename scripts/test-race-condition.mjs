import { spawn } from 'child_process';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runRaceConditionTest() {
  console.log('=== RIGOROUS RACE CONDITION VERIFICATION: Delayed Out-of-Order Response Test ===\n');

  // 1. Launch Headless Edge
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9224',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'https://brinkberry.com/?city=Denver'
  ]);

  await sleep(3000);

  try {
    const listRes = await fetch('http://127.0.0.1:9224/json/list');
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

    // Wait for cards to finish rendering
    let cardsCount = 0;
    for (let i = 0; i < 20; i++) {
      const res = await sendCommand('Runtime.evaluate', {
        expression: `document.querySelectorAll('.card').length`,
        returnByValue: true
      });
      cardsCount = res.result?.value || 0;
      if (cardsCount > 1) break;
      await sleep(500);
    }
    console.log(`Live cards loaded on page: ${cardsCount}`);
    if (cardsCount < 2) throw new Error('Need at least 2 events to test race condition');

    // 2. Install interceptor in browser window to pause Event 1's route request
    await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        window.__origFetch = window.fetch;
        window.__routeCalls = [];
        window.__delayedEvent1Resolver = null;
        window.__delayedEvent1Promise = new Promise(resolve => {
          window.__delayedEvent1Resolver = resolve;
        });

        window.fetch = async function(url, options) {
          if (typeof url === 'string' && url.includes('/api/route')) {
            window.__routeCalls.push({ url, time: Date.now() });
            // The first call (Event 1) will be paused until we explicitly tell it to release
            if (window.__routeCalls.length === 1) {
              console.log('[TestHook] Intercepted Event 1 route request, holding promise in-flight...');
              await window.__delayedEvent1Promise;
              console.log('[TestHook] Released Event 1 route request with delayed response (999 min)');
              return new Response(JSON.stringify({
                durationMinutes: 999,
                distanceMiles: 88.8,
                provider: 'Delayed-Event1-Simulator'
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
          return window.__origFetch(url, options);
        };
        return true;
      })()`,
      returnByValue: true
    });
    console.log('Installed route fetch interceptor to hold Event 1 in-flight');

    // 3. Click Event 1
    const event1Info = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const cards = document.querySelectorAll('.card');
        cards[0].click();
        return {
          id: cards[0].dataset.id,
          title: cards[0].querySelector('.card-title')?.innerText
        };
      })()`,
      returnByValue: true
    });
    console.log(`\nStep 1: Clicked Event 1 [${event1Info.result?.value?.id}] "${event1Info.result?.value?.title}"`);

    // Wait 1 second - Event 1 fetch has started but is held in flight
    await sleep(1000);

    const event1Intermediate = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const driveEl = document.getElementById('detailDriveTime');
        return {
          text: driveEl ? driveEl.innerText : '',
          routeCallsCount: window.__routeCalls.length
        };
      })()`,
      returnByValue: true
    });
    console.log('Event 1 In-Flight UI State:', event1Intermediate.result?.value);

    // 4. Click Event 2 (while Event 1 is STILL unresolved and pending in-flight!)
    const event2Info = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const dlg = document.getElementById('detailDlg');
        if (dlg) dlg.close();
        const cards = document.querySelectorAll('.card');
        cards[1].click();
        return {
          id: cards[1].dataset.id,
          title: cards[1].querySelector('.card-title')?.innerText
        };
      })()`,
      returnByValue: true
    });
    console.log(`\nStep 2: Switched to Event 2 [${event2Info.result?.value?.id}] "${event2Info.result?.value?.title}" while Event 1 fetch is still in flight!`);

    // Wait 3.5 seconds for Event 2 route request to complete normally
    await sleep(3500);

    const event2LoadedState = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const driveEl = document.getElementById('detailDriveTime');
        return {
          html: driveEl ? driveEl.innerHTML : '',
          text: driveEl ? driveEl.innerText : '',
          routeCallsCount: window.__routeCalls.length
        };
      })()`,
      returnByValue: true
    });
    console.log('Event 2 Finished Loading State:', event2LoadedState.result?.value);

    const event2ExpectedText = event2LoadedState.result?.value?.text;
    console.log(`\nEvent 2 current estimate in DOM: "${event2ExpectedText}"`);

    // 5. NOW release Event 1's delayed late response (which returns 999 min)!
    console.log('\nStep 3: Releasing Event 1 late delayed response (fake 999 min)...');
    await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        window.__delayedEvent1Resolver();
        return true;
      })()`,
      returnByValue: true
    });

    // Wait 2.0 seconds for Event 1's late promise to finish resolving and hit any .then() handlers
    await sleep(2000);

    // 6. Inspect the DOM again: did Event 1 overwrite Event 2?
    const finalModalState = await sendCommand('Runtime.evaluate', {
      expression: `(() => {
        const driveEl = document.getElementById('detailDriveTime');
        return {
          html: driveEl ? driveEl.innerHTML : '',
          text: driveEl ? driveEl.innerText : ''
        };
      })()`,
      returnByValue: true
    });
    console.log('\nStep 4: DOM State AFTER Event 1 late response resolved:', finalModalState.result?.value);

    const isOverwritten = finalModalState.result?.value?.text.includes('999 min');
    const matchesEvent2 = finalModalState.result?.value?.text === event2ExpectedText;

    console.log('\n=== VERIFICATION OUTCOME ===');
    console.log('Was Event 2 estimate overwritten by Event 1 late response?:', isOverwritten ? 'YES (BUG DETECTED)' : 'NO (PASSED)');
    console.log('Does DOM still accurately display Event 2 estimate?:', matchesEvent2 ? 'YES (PASSED)' : 'NO');

    if (isOverwritten || !matchesEvent2) {
      throw new Error('Race condition check failed: stale response overwrote newer estimate!');
    }

    console.log('\n>>> RACE CONDITION TEST 100% PASSED: Late out-of-order response was safely ignored! <<<');

    ws.close();
  } finally {
    edgeProc.kill();
  }
}

runRaceConditionTest().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
