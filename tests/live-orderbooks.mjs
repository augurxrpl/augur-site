// Opt-in public feed probe. No account credentials or market actions.
import { connectOrderBooks } from '../battlefield/assets/js/v2/orderbook-feeds.js';
import { writeFileSync } from 'node:fs';
const samples = {}, counts = {}, statuses = {}, failures = [];
const stop = connectOrderBooks({
  onBook(event) { counts[event.source] = (counts[event.source] || 0) + 1; samples[event.source] = event; },
  onStatus(source, status, reason) { statuses[source] = status; if(reason) failures.push({source,reason}); },
});
setTimeout(() => {
  const report = { checkedAt: new Date().toISOString(), counts: {...counts}, statuses: {...statuses}, failures, samples };
  stop();
  writeFileSync('tests/live-orderbooks-result.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checkedAt: report.checkedAt, counts:report.counts, statuses:report.statuses, failures }));
}, 20000);
