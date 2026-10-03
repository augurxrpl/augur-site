import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createMarketRuntime } from '../battlefield/assets/js/v2/market-runtime.js';
import { CoinbaseBook, BinanceBook, connectOrderBooks } from '../battlefield/assets/js/v2/orderbook-feeds.js';
import { createLiquidityView } from '../battlefield/assets/js/v2/liquidity-view.js';

let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
const snapshot = (sequence = 0, updates = [
  { side: 'bid', price_level: '2.49', new_quantity: '8000' },
  { side: 'offer', price_level: '2.51', new_quantity: '1000' },
]) => ({ channel: 'l2_data', sequence_num: sequence, events: [{ type: 'snapshot', product_id: 'XRP-USD', updates }] });

test('exact trade thresholds, both sides, source attribution', () => {
  const queue = [], runtime = createMarketRuntime({ queue: e => queue.push(e) });
  for (const side of ['blue', 'red']) for (const [amount, type] of [
    [0.01,'infantry_volley'],[4999.999,'infantry_volley'],[5000,'tank_artillery'],
    [24999.999,'tank_artillery'],[25000,'helicopter_strike'],[249999.999,'helicopter_strike'],[250000,'warplane_airstrike'],
  ]) {
    const before = queue.length;
    assert.equal(runtime.trade({ source:'kraken', side, xrp:amount, price:2.5, tradeId:`${side}-${amount}` }).accepted, true);
    assert.equal(queue.length, before+1);
    assert.equal(queue.at(-1).type,type); assert.equal(queue.at(-1).side,side);
    assert.equal(queue.at(-1).marketEvent.source,'kraken');
    assert.equal(queue.at(-1).xrpAmount,amount);
  }
});
test('replayed trade at a different receipt time has no duplicate combat or volume', () => {
  let now=1000, count=0;
  const runtime=createMarketRuntime({queue:()=>count++,now:()=>now});
  const trade={source:'coinbase',side:'blue',xrp:6000,tradeId:'7',timestamp:1};
  runtime.trade(trade); now+=1000;
  assert.equal(runtime.trade({...trade,timestamp:999}).accepted,false); assert.equal(count,1);
  assert.equal(runtime.trade({...trade,source:'kraken'}).accepted,true);
});
test('dedupe expiration uses receipt time rather than provider time', () => {
  let now=1000;
  const runtime=createMarketRuntime({queue:()=>{},now:()=>now});
  const trade={source:'kraken',side:'blue',xrp:10,tradeId:1,timestamp:1};
  runtime.trade(trade);
  runtime.trade({...trade,tradeId:2,timestamp:1e15});
  assert.equal(runtime.trade(trade).accepted,false);
  now+=120001; assert.equal(runtime.trade(trade).accepted,true);
});
test('invalid quantities, sides, and absent identifiers cannot fire', () => {
  const runtime=createMarketRuntime({queue:()=>assert.fail('unexpected combat')});
  for (const xrp of [0,-1,NaN,Infinity,'bad']) assert.equal(runtime.trade({source:'kraken',side:'blue',xrp,tradeId:1}).accepted,false);
  assert.equal(runtime.trade({source:'kraken',side:'other',xrp:5000,tradeId:1}).accepted,false);
  assert.equal(runtime.trade({source:'kraken',side:'blue',xrp:5000}).accepted,false);
});
test('ledger activity is neutral and never creates combat or directional pressure', () => {
  const runtime=createMarketRuntime({queue:()=>assert.fail('ledger combat')});
  for(const type of ['Payment','OfferCreate','AMMDeposit','AccountSet']) runtime.ledger({hash:type,type});
  assert.equal(runtime.engine.snapshot().buyPressure,0);
  assert.equal(runtime.engine.snapshot().sellPressure,0);
  assert.equal(runtime.engine.history[1].event.category,'xrpl_activity');
});
test('pressure decays during silence; liquidity is not executed volume', () => {
  let now=1000;
  const runtime=createMarketRuntime({queue:()=>{},now:()=>now});
  runtime.trade({source:'kraken',side:'blue',xrp:5000,tradeId:1});
  const before=runtime.engine.snapshot().buyPressure;
  runtime.book(new CoinbaseBook().ingest(snapshot(),now));
  assert.equal(runtime.engine.snapshot().buyPressure,before);
  now+=1000; assert.ok(runtime.engine.snapshot().buyPressure<before);
});
test('USDT cannot overwrite USD price', () => {
  const runtime=createMarketRuntime({queue:()=>{}});
  runtime.trade({source:'kraken',side:'blue',xrp:1,price:2.5,tradeId:1});
  runtime.trade({source:'binance',side:'blue',xrp:1,price:2.6,tradeId:1,quote:'USDT'});
  assert.equal(runtime.engine.snapshot().lastPrice,2.5);
});
test('Coinbase snapshot, absolute updates, deletion, sequence evidence', () => {
  const book=new CoinbaseBook();
  assert.equal(book.ingest(snapshot()).meta.bidXrp,8000);
  const update={channel:'l2_data',sequence_num:1,events:[{type:'update',product_id:'XRP-USD',updates:[
    {side:'bid',price_level:'2.49',new_quantity:'4000'},
    {side:'bid',price_level:'2.48',new_quantity:'2000'},
  ]}]};
  assert.equal(book.ingest(update).meta.bidXrp,6000);
  update.sequence_num=2; update.events[0].updates=[{side:'bid',price_level:'2.48',new_quantity:'0'}];
  const event=book.ingest(update);
  assert.equal(event.meta.bidXrp,4000); assert.equal(event.meta.bids.length,1);
  const runtime=createMarketRuntime({queue:()=>{}});
  assert.equal(runtime.book(event).event.evidence.sequence,'2');
});
test('Coinbase rejects gaps, duplicates, updates before snapshot, and bad levels', () => {
  const book=new CoinbaseBook();book.ingest(snapshot());
  assert.equal(book.ingest(snapshot()),null);
  assert.throws(()=>book.ingest(snapshot(2)),/gap/);
  const update=snapshot();update.events[0].type='update';
  assert.throws(()=>book.ingest(update),/before snapshot/);
  assert.throws(()=>new CoinbaseBook().ingest(snapshot(0,[{side:'bid',price_level:'bad',new_quantity:'1'}])),/Invalid/);
});
test('Binance partial snapshots replace rather than accumulate; older updates ignored', () => {
  const book=new BinanceBook();
  const msg={lastUpdateId:10,bids:[['2.49','100']],asks:[['2.51','200']]};
  assert.equal(book.ingest(msg).meta.quote,'USDT');
  assert.equal(book.ingest({...msg,lastUpdateId:20,bids:[['2.48','50']]}).meta.bidXrp,50);
  assert.equal(book.ingest(msg),null);
  assert.throws(()=>book.ingest({...msg,lastUpdateId:21,bids:[['2.6','50']]}),/crossed/);
});
test('Coinbase connection-wide sequence includes interleaved heartbeats and subscription messages', () => {
  const book=new CoinbaseBook(); book.ingest(snapshot(0));
  assert.equal(book.ingest({channel:'subscriptions',sequence_num:1}),null);
  assert.equal(book.ingest({channel:'heartbeats',sequence_num:2}),null);
  const update=snapshot(3); update.events[0].type='update';
  assert.equal(book.ingest(update).meta.bidXrp,8000);
});
test('book reconnect, watchdog, fresh snapshot identity, and shutdown', () => {
  const sockets=[],tasks=new Map(),events=[],states=[];let id=0;
  class Socket {
    constructor(url){this.url=url;this.handlers={};sockets.push(this);}
    addEventListener(k,fn){this.handlers[k]=fn;}
    send(){}
    emit(k,value){this.handlers[k]?.(value);}
    close(){this.emit('error');this.emit('close');}
  }
  const stop=connectOrderBooks({WebSocketImpl:Socket,now:()=>1000,
    setTimer:(fn,ms)=>{tasks.set(++id,{fn,ms});return id;},clearTimer:id=>tasks.delete(id),
    onBook:e=>events.push(e),onStatus:(source,status)=>states.push([source,status])});
  sockets[0].emit('message',{data:JSON.stringify(snapshot())});
  assert.equal(events.length,1);
  sockets[0].emit('message',{data:JSON.stringify(snapshot(2))});
  assert.ok(states.some(([,s])=>s==='resyncing'));
  const retry=[...tasks.entries()].find(([,t])=>t.ms===1000);tasks.delete(retry[0]);retry[1].fn();
  sockets[2].emit('message',{data:JSON.stringify(snapshot())});
  assert.notEqual(events[0].id,events[1].id);
  const watchdog=[...tasks.entries()].find(([,t])=>t.ms===15000);tasks.delete(watchdog[0]);watchdog[1].fn();
  assert.ok(states.some(([,s])=>s==='stale'));
  stop(); assert.equal(tasks.size,0);
});
test('actual battle.js exchange callbacks preserve maker/taker direction and reject snapshots', () => {
  const source=readFileSync(new URL('../battlefield/assets/js/battle.js',import.meta.url),'utf8');
  const start=source.indexOf('function connectCoinbaseXrpFeed()');
  const end=source.indexOf('function connectGlobalXrpMarketFeeds()',start);
  const handlers={},trades=[];
  const ctx=vm.createContext({connectGlobalFeed:(name,url,open,message)=>handlers[name]=message,
    registerGlobalXrpTrade:(...args)=>trades.push(args)});
  vm.runInContext(source.slice(start,end)+'\nconnectCoinbaseXrpFeed();connectKrakenXrpFeed();connectBinanceXrpFeed();',ctx);
  handlers.coinbase({channel:'market_trades',events:[{type:'update',trades:[{product_id:'XRP-USD',side:'BUY',size:'5',price:'2',trade_id:'1'}]}]});
  handlers.kraken({channel:'trade',type:'update',data:[{symbol:'XRP/USD',side:'buy',qty:5,price:2,trade_id:1}]});
  handlers.binance({e:'aggTrade',s:'XRPUSDT',m:true,q:'5',p:'2',a:1});
  assert.deepEqual(trades.map(t=>t[1]),['red','blue','red']);
  handlers.kraken({channel:'trade',type:'snapshot',data:[{symbol:'XRP/USD',side:'buy'}]});
  handlers.binance({e:'aggTrade',s:'BTCUSDT',m:true});
  assert.equal(trades.length,3);
});
test('actual battle.js retains XRPL trade-funded reinforcements only once per hash', () => {
  const source=readFileSync(new URL('../battlefield/assets/js/battle.js',import.meta.url),'utf8');
  const window={addEventListener:()=>{}};
  const ctx=vm.createContext({window,createMarketRuntime,performance:{now:()=>1000},
    THREE:{MathUtils:{clamp:(x,lo,hi)=>Math.max(lo,Math.min(hi,x))}},
    setInterval:()=>{},requestAnimationFrame:()=>{}});
  vm.runInContext(source.slice(source.indexOf('const helicopters=[];'),source.indexOf('function connectXrplMarketStream()'))+
    ';dispatchValidatedXrpTrade("blue",100000,"verified-test-hash");dispatchValidatedXrpTrade("blue",100000,"verified-test-hash");'+
    'window.result={types:battlefieldEventQueue.map(e=>e.type),count:xrplMarketState.tradeCount.blue,volume:xrplMarketState.sessionVolume.blue};',ctx);
  assert.equal(window.result.count,1);assert.equal(window.result.volume,100000);
  assert.deepEqual(Array.from(window.result.types),['helicopter_strike','reinforcement','reinforcement','reinforcement']);
});
test('liquidity markers use real USD price levels and disappear on stale data or disconnect', () => {
  let now=1000;
  class Vector { set(x,y,z){Object.assign(this,{x,y,z});} }
  class Group { constructor(){this.children=[];} add(m){this.children.push(m);} }
  class Mesh { constructor(){this.scale=new Vector();this.position=new Vector();} }
  const THREE={Group,Mesh,BoxGeometry:class{},MeshBasicMaterial:class{}};
  const scene=new Group(),panel={dataset:{},style:{}};
  const document={createElement:()=>panel,body:{appendChild:()=>{}}};
  const view=createLiquidityView({THREE,scene,document,now:()=>now});
  const book=new CoinbaseBook().ingest(snapshot(0,[
    {side:'bid',price_level:'2.499',new_quantity:'1000'},
    {side:'offer',price_level:'2.501',new_quantity:'2000'},
  ]),now);
  view.price(2.5); view.book({kind:'bunker',event:book});view.status('coinbase','live');view.update();
  const children=scene.children[0].children;
  assert.equal(children.filter(c=>c.visible).length,3);
  assert.ok(children[0].position.x<0);assert.ok(children[5].position.x>0);
  now+=16000;view.update();assert.equal(children.filter(c=>c.visible).length,0);
  assert.match(panel.textContent,/STALE/);
  view.status('coinbase','unavailable');now+=250;view.update();assert.match(panel.textContent,/UNAVAILABLE/);
});
console.log(`${checks} Phase 2 scenario groups passed`);
