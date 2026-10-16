#!/bin/bash
# Point 6: kill the dev server in the middle of a run, restart it, and see if the run finishes.
cd "$(dirname "$0")"
B=http://localhost:8799
before=$(curl -s -m 10 $B/count | python3 -c "import json,sys;print(json.load(sys.stdin)['messages'])")
echo "messages before: $before"
curl -s "$B/submit?q=Call%20the%20slow%20tool%20once%2C%20then%20reply%20with%20the%20word%20FINISHED.&id=crash-$$" >/dev/null
echo "submitted"
# wait until the slow tool call appears in the transcript (the model must choose it first)
until curl -s -m 10 $B/dump | grep -q '"type":"toolCall","id":"[^"]*","name":"slow"'; do sleep 2; done
echo "slow tool call is in the transcript: killing dev server"
pkill -9 -f "wrangler-dist/cli.js dev"; pkill -9 -f workerd; sleep 3
(npx wrangler dev --port 8799 > /tmp/spike-dev2.log 2>&1 &)
until grep -q "Ready on" /tmp/spike-dev2.log; do sleep 2; done
echo "restarted; waiting for the run to finish"
for i in $(seq 1 90); do
  sleep 4
  out=$(curl -s $B/dump)
  if echo "$out" | grep -q 'FINISHED'; then echo "RESULT: run resumed and finished (after $((i*4))s)"; break; fi
done
echo "$out" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for e in d[-5:]: print(e['kind'], json.dumps(e['model'])[:200])"
