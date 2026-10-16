#!/bin/bash
# Kill the dev server in the middle of a run, start it again, and check that the answer still lands in the thread.
# Needs the dev server on port 5173 started with: npx react-router dev --port 5173
cd "$(dirname "$0")/.."
BOT=${1:-builder}
rows() { node -e '
const ws=new WebSocket("ws://localhost:5173/agents/bot-agent/'$BOT'");
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==="history"){console.log(m.rows.length, m.rows.at(-1)?.role, (m.rows.at(-1)?.text||"").slice(0,80).replace(/\n/g," "));process.exit(0)}}
setTimeout(()=>process.exit(3),20000)'; }
echo "before: $(rows)"
node -e '
const ws=new WebSocket("ws://localhost:5173/agents/bot-agent/'$BOT'");
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==="history"){ws.send(JSON.stringify({type:"send",id:crypto.randomUUID(),text:"Reply with exactly: RECOVERED"}));setTimeout(()=>process.exit(0),800)}}'
echo "sent a message; killing the server now"
pkill -9 -f "react-router dev"; pkill -9 -f workerd; sleep 2
(npx react-router dev --port 5173 > /tmp/durabot-dev.log 2>&1 &)
until grep -q "Local:" /tmp/durabot-dev.log; do sleep 2; done
curl -s -m 60 -o /dev/null localhost:5173/   # wake the Worker
for i in $(seq 1 40); do
  sleep 3
  out=$(rows)
  if echo "$out" | grep -q "assistant"; then echo "after ($((i*3))s): $out"; exit 0; fi
done
echo "after: $out"; echo "NOT RECOVERED"; exit 1
