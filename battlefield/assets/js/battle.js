import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
const BLUE=0x258cff, RED=0xff4038;
const UNIT_METAL=0x60717e;
const accentTank=(r,c)=>r.traverse(o=>{if(o.isMesh&&["Tank_Turret_2","Tank_body_4","Tank_body_5","Tank_Gun","Tank_Gun_1"].includes(o.name)){o.material=o.material.clone();o.material.color.set(c);if(o.material.emissive){o.material.emissive.set(c);o.material.emissiveIntensity=.20;}}});
const accentSoldier=(root,color)=>{
  root.traverse(o=>{
    if(!o.isMesh||!o.material) return;

    const pads=o.name.startsWith("ShoulderPad");
    const head=o.name.startsWith("Head");
    if(!pads&&!head) return;

    const wasArray=Array.isArray(o.material);
    const sources=wasArray?o.material:[o.material];
    let changed=false;

    const materials=sources.map(source=>{
      const helmet=head&&source.name==="Grey";
      if(!pads&&!helmet) return source;

      changed=true;
      const material=source.clone();

      if(material.color) material.color.set(color);
      if(material.emissive){
        material.emissive.set(color);
        material.emissiveIntensity=helmet?.48:.38;
      }

      return material;
    });

    if(changed) o.material=wasArray?materials:materials[0];
  });
};
function darkenUnit(root,factor){
  root.traverse(o=>{
    if(!o.isMesh||!o.material) return;
    o.material=o.material.clone();
    if(o.material.color) o.material.color.multiplyScalar(factor);
  });
}

function tuneSoldierUniform(root){
  root.traverse(o=>{
    if(!o.isMesh||!o.material||o.name!=="Body") return;

    const wasArray=Array.isArray(o.material);
    const sources=wasArray?o.material:[o.material];

    const materials=sources.map(source=>{
      const material=source.clone();
      if(material.name!=="Skin"){
        if(material.color) material.color.set(UNIT_METAL);
        if("metalness" in material) material.metalness=0.12;
        if("roughness" in material) material.roughness=0.82;
        if(material.emissive){
          material.emissive.set(UNIT_METAL);
          material.emissiveIntensity=0.10;
        }
      }
      return material;
    });

    o.material=wasArray?materials:materials[0];
  });
}

function tuneTankMetal(root){
  root.traverse(o=>{
    if(!o.isMesh||!o.material) return;
    if(o.name.startsWith("TrackMesh")) return;

    const wasArray=Array.isArray(o.material);
    const sources=wasArray?o.material:[o.material];

    const materials=sources.map(source=>{
      const material=source.clone();
      if(material.color) material.color.set(UNIT_METAL);
      if("metalness" in material) material.metalness=0.72;
      if("roughness" in material) material.roughness=0.58;
      return material;
    });

    o.material=wasArray?materials:materials[0];
  });
}

const helicopters=[];
const warplanes=[];
const airstrikeEffects=[];
const combatEffects=[];
const aftermathEffects=[];
const destroyedUnits=[];
const battlefieldEventQueue=[];
const unitTemplates={
  blue:{soldier:null,tank:null},
  red:{soldier:null,tank:null}
};
const UNIT_CAPS={soldier:90,tank:30};

const COMBAT_EVENT_TYPES=new Set([
  "infantry_volley",
  "tank_artillery",
  "helicopter_strike",
  "warplane_airstrike",
  "reinforcement"
]);

function queueBattlefieldEvent(event){
  if(!event||!COMBAT_EVENT_TYPES.has(event.type)) return false;
  if(!["blue","red"].includes(event.side)) return false;

  battlefieldEventQueue.push({
    type:event.type,
    side:event.side,
    intensity:THREE.MathUtils.clamp(Number(event.intensity)||1,0.25,3),
    kind:event.kind,
    count:event.count,
    source:event.source||"market",
    hash:event.hash||"",
    xrpAmount:Number(event.xrpAmount)||0,
    receivedAt:performance.now()*0.001
  });

  if(battlefieldEventQueue.length>40) battlefieldEventQueue.shift();
  return true;
}

window.dispatchBattlefieldEvent=queueBattlefieldEvent;
window.addEventListener("augur-battlefield-event",event=>{
  queueBattlefieldEvent(event.detail);
});

const xrplMarketState={
  connected:false,
  reconnectDelay:1000,
  reconnectTimer:null,
  lastTrade:null,
  growthCredit:{blue:0,red:0},
  sessionVolume:{blue:0,red:0},
  tradeCount:{blue:0,red:0},
  xrpUsd:null,
  xrpChange24h:null
};

window.augurBattlefieldMarket=xrplMarketState;

function isXrpAmount(amount){
  return typeof amount==="string";
}

function isExecutedXrpMarketTransaction(tx){
  if(tx.TransactionType==="OfferCreate"){
    return isXrpAmount(tx.TakerGets)!==isXrpAmount(tx.TakerPays);
  }

  if(tx.TransactionType==="Payment"&&tx.SendMax){
    const destinationAmount=tx.DeliverMax??tx.Amount;
    return destinationAmount&&isXrpAmount(tx.SendMax)!==isXrpAmount(destinationAmount);
  }

  return false;
}

function sourceAccountXrpDelta(tx,meta){
  const nodes=Array.isArray(meta?.AffectedNodes)?meta.AffectedNodes:[];

  for(const wrapper of nodes){
    const node=wrapper.ModifiedNode;
    if(!node||node.LedgerEntryType!=="AccountRoot") continue;

    const finalFields=node.FinalFields||{};
    const previousFields=node.PreviousFields||{};
    if(finalFields.Account!==tx.Account) continue;
    if(previousFields.Balance===undefined||finalFields.Balance===undefined) continue;

    try{
      const finalDrops=BigInt(finalFields.Balance);
      const previousDrops=BigInt(previousFields.Balance);
      const feeDrops=BigInt(tx.Fee||"0");
      return Number(finalDrops-previousDrops+feeDrops)/1000000;
    }catch(error){
      return 0;
    }
  }

  return 0;
}

function dispatchValidatedXrpTrade(side,xrpAmount,hash){
  const amount=Math.abs(Number(xrpAmount)||0);
  if(amount<0.01) return;

  const intensity=THREE.MathUtils.clamp(0.55+Math.log10(amount+1)*0.55,0.55,3);

  queueBattlefieldEvent({
    type:"infantry_volley",
    side,
    intensity,
    source:"xrpl",
    hash
  });

  xrplMarketState.growthCredit[side]+=Math.min(2.5,Math.sqrt(amount)/60);

  while(xrplMarketState.growthCredit[side]>=1){
    queueBattlefieldEvent({
      type:"reinforcement",
      side,
      kind:"soldier",
      count:1,
      source:"xrpl",
      hash
    });
    xrplMarketState.growthCredit[side]-=1;
  }

  if(amount>=5000){
    queueBattlefieldEvent({type:"tank_artillery",side,intensity,source:"xrpl",hash});
  }

  if(amount>=25000){
    queueBattlefieldEvent({type:"helicopter_strike",side,intensity,source:"xrpl",hash});
  }

  if(amount>=100000){
    queueBattlefieldEvent({
      type:"reinforcement",
      side,
      kind:"tank",
      count:1,
      source:"xrpl",
      hash
    });
  }

  if(amount>=250000){
    queueBattlefieldEvent({
      type:"warplane_airstrike",
      side,
      intensity,
      xrpAmount:amount,
      source:"xrpl",
      hash
    });
  }

  xrplMarketState.sessionVolume[side]+=amount;
  xrplMarketState.tradeCount[side]+=1;
  xrplMarketState.lastTrade={side,xrpAmount:amount,hash,receivedAt:Date.now()};
  renderBattlefieldMarketHud();
}

function handleXrplMarketMessage(message){
  let payload;
  try{
    payload=JSON.parse(message.data);
  }catch(error){
    return;
  }

  if(payload.type!=="transaction"||payload.validated!==true) return;

  const tx=payload.tx_json||payload.transaction;
  const meta=payload.meta||payload.metaData;
  if(!tx||!meta||meta.TransactionResult!=="tesSUCCESS") return;
  if(!isExecutedXrpMarketTransaction(tx)) return;

  const xrpDelta=sourceAccountXrpDelta(tx,meta);
  if(Math.abs(xrpDelta)<0.01) return;

  const side=xrpDelta>0?"blue":"red";
  dispatchValidatedXrpTrade(side,Math.abs(xrpDelta),tx.hash||payload.hash||"");
}

function connectXrplMarketStream(){
  const socket=new WebSocket("wss://s1.ripple.com");
  xrplMarketState.socket=socket;

  socket.addEventListener("open",()=>{
    xrplMarketState.connected=true;
    xrplMarketState.reconnectDelay=1000;
    renderBattlefieldMarketHud();
    socket.send(JSON.stringify({
      id:"augur-battlefield-market",
      command:"subscribe",
      streams:["transactions"]
    }));
  });

  socket.addEventListener("message",handleXrplMarketMessage);

  socket.addEventListener("close",()=>{
    xrplMarketState.connected=false;
    renderBattlefieldMarketHud();
    clearTimeout(xrplMarketState.reconnectTimer);
    xrplMarketState.reconnectTimer=setTimeout(connectXrplMarketStream,xrplMarketState.reconnectDelay);
    xrplMarketState.reconnectDelay=Math.min(xrplMarketState.reconnectDelay*2,30000);
  });

  socket.addEventListener("error",()=>socket.close());
}

function formatHudNumber(value,maximumFractionDigits=0){
  return Number(value||0).toLocaleString(undefined,{maximumFractionDigits});
}

function battlefieldForceCounts(side){
  const counts={soldier:0,tank:0,helicopter:0};
  if(!window.scene) return counts;

  window.scene.traverse(unit=>{
    const d=unit.userData;
    if(d.side!==side||d.combatState==="destroyed") return;
    if(Object.hasOwn(counts,d.kind)) counts[d.kind]+=1;
  });
  return counts;
}

function createBattlefieldMarketHud(){
  if(document.getElementById("battlefield-market-hud")) return;

  const style=document.createElement("style");
  style.textContent=`
    #battlefield-market-hud{position:fixed;inset:0;z-index:30;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#eef6ff;text-shadow:0 1px 3px #000}
    .bf-hud-panel{position:absolute;background:linear-gradient(180deg,rgba(9,16,24,.88),rgba(4,8,13,.72));border:1px solid rgba(180,215,240,.24);box-shadow:0 8px 26px rgba(0,0,0,.34),inset 0 0 18px rgba(140,190,220,.05);backdrop-filter:blur(7px)}
    .bf-market{top:14px;left:50%;transform:translateX(-50%);min-width:250px;padding:9px 16px;border-radius:8px;text-align:center}
    .bf-price-row{display:flex;align-items:baseline;justify-content:center;gap:10px}.bf-price{font-size:22px;font-weight:900;letter-spacing:.03em}.bf-change{font-size:13px;font-weight:800}.bf-positive{color:#39e68a}.bf-negative{color:#ff5d57}
    .bf-status{margin-top:3px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#9fb2c2}.bf-status-dot{display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:#ff554d;box-shadow:0 0 8px currentColor}.bf-online .bf-status-dot{background:#35e784}
    .bf-army{top:14px;width:245px;padding:11px 13px;border-radius:8px}.bf-blue{left:14px;border-color:rgba(37,140,255,.55)}.bf-red{right:14px;border-color:rgba(255,64,56,.55)}
    .bf-army-title{display:flex;justify-content:space-between;font-size:12px;font-weight:900;letter-spacing:.12em}.bf-blue .bf-army-title,.bf-blue .bf-volume{color:#65adff}.bf-red .bf-army-title,.bf-red .bf-volume{color:#ff6d66}.bf-volume{margin-top:5px;font-size:17px;font-weight:900}.bf-unit-row{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:7px;font-size:10px;color:#aebdca}.bf-unit-row strong{display:block;color:#fff;font-size:13px}
    .bf-ticker{bottom:14px;left:50%;transform:translateX(-50%);width:min(760px,calc(100vw - 28px));padding:9px 14px;border-radius:8px;text-align:center;font-size:12px;letter-spacing:.045em}.bf-ticker strong{color:#ffd56b}.bf-hash{margin-left:9px;color:#94aabc;font-family:ui-monospace,monospace}
    @media(max-width:850px){.bf-army{top:82px;width:190px}.bf-unit-row{font-size:9px}.bf-market{top:8px}.bf-blue{left:8px}.bf-red{right:8px}}
    @media(max-width:480px){.bf-army{width:calc(50vw - 12px);padding:8px}.bf-army-title{font-size:9px}.bf-volume{font-size:13px}.bf-ticker{font-size:10px}}
  `;
  document.head.append(style);

  const hud=document.createElement("div");
  hud.id="battlefield-market-hud";
  hud.innerHTML=`
    <section class="bf-hud-panel bf-market"><div class="bf-price-row"><span class="bf-price" data-bf-price>$XRP --</span><span class="bf-change" data-bf-change>--</span></div><div class="bf-status" data-bf-status><span class="bf-status-dot"></span>XRPL CONNECTING</div></section>
    <section class="bf-hud-panel bf-army bf-blue"><div class="bf-army-title"><span>BLUE ARMY</span><span>BUYS</span></div><div class="bf-volume" data-bf-blue-volume>0 $XRP</div><div class="bf-unit-row" data-bf-blue-units></div></section>
    <section class="bf-hud-panel bf-army bf-red"><div class="bf-army-title"><span>RED ARMY</span><span>SELLS</span></div><div class="bf-volume" data-bf-red-volume>0 $XRP</div><div class="bf-unit-row" data-bf-red-units></div></section>
    <section class="bf-hud-panel bf-ticker" data-bf-ticker>WAITING FOR VALIDATED $XRP MARKET ACTIVITY</section>
  `;
  document.body.append(hud);
  renderBattlefieldMarketHud();
  refreshXrpMarketPrice();
  setInterval(renderBattlefieldMarketHud,1000);
  setInterval(refreshXrpMarketPrice,30000);
}

function renderBattlefieldMarketHud(){
  const hud=document.getElementById("battlefield-market-hud");
  if(!hud) return;

  const price=hud.querySelector("[data-bf-price]");
  const change=hud.querySelector("[data-bf-change]");
  const status=hud.querySelector("[data-bf-status]");
  const blue=battlefieldForceCounts("blue");
  const red=battlefieldForceCounts("red");

  price.textContent=xrplMarketState.xrpUsd===null?"$XRP --":`$XRP $${xrplMarketState.xrpUsd.toFixed(4)}`;
  const changeValue=xrplMarketState.xrpChange24h;
  change.textContent=changeValue===null?"--":`${changeValue>=0?"+":""}${changeValue.toFixed(2)}%`;
  change.className=`bf-change ${changeValue>=0?"bf-positive":"bf-negative"}`;
  status.className=`bf-status ${xrplMarketState.connected?"bf-online":""}`;
  status.innerHTML=`<span class="bf-status-dot"></span>${xrplMarketState.connected?"XRPL LIVE":"XRPL RECONNECTING"}`;

  hud.querySelector("[data-bf-blue-volume]").textContent=`${formatHudNumber(xrplMarketState.sessionVolume.blue,2)} $XRP`;
  hud.querySelector("[data-bf-red-volume]").textContent=`${formatHudNumber(xrplMarketState.sessionVolume.red,2)} $XRP`;
  hud.querySelector("[data-bf-blue-units]").innerHTML=`<span><strong>${blue.soldier}</strong>TROOPS</span><span><strong>${blue.tank}</strong>TANKS</span><span><strong>${blue.helicopter}</strong>COPTERS</span>`;
  hud.querySelector("[data-bf-red-units]").innerHTML=`<span><strong>${red.soldier}</strong>TROOPS</span><span><strong>${red.tank}</strong>TANKS</span><span><strong>${red.helicopter}</strong>COPTERS</span>`;

  const trade=xrplMarketState.lastTrade;
  if(trade){
    const action=trade.side==="blue"?"BUY":"SELL";
    const shortHash=trade.hash?`${trade.hash.slice(0,8)}...${trade.hash.slice(-6)}`:"VALIDATED";
    const combatAction=trade.xrpAmount>=250000?"WHALE AIRSTRIKE":trade.xrpAmount>=25000?"HELICOPTER STRIKE":trade.xrpAmount>=5000?"ARTILLERY + INFANTRY":"INFANTRY VOLLEY";
    hud.querySelector("[data-bf-ticker]").innerHTML=`<strong>${action} • ${formatHudNumber(trade.xrpAmount,2)} $XRP</strong> • ${combatAction} <span class="bf-hash">${shortHash}</span>`;
  }
}

async function refreshXrpMarketPrice(){
  try{
    const response=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd&include_24hr_change=true",{cache:"no-store"});
    if(!response.ok) throw new Error(`Price response ${response.status}`);
    const data=await response.json();
    xrplMarketState.xrpUsd=Number(data?.ripple?.usd)||null;
    xrplMarketState.xrpChange24h=Number.isFinite(Number(data?.ripple?.usd_24h_change))?Number(data.ripple.usd_24h_change):null;
    renderBattlefieldMarketHud();
  }catch(error){
    console.warn("AUGUR $XRP price refresh failed",error);
  }
}

createBattlefieldMarketHud();
connectXrplMarketStream();

function accentHelicopter(root,color){
  root.traverse(o=>{
    if(!o.isMesh||!o.material) return;

    const weapons=o.name==="Object_6";
    const wasArray=Array.isArray(o.material);
    const sources=wasArray?o.material:[o.material];

    const materials=sources.map(source=>{
      const material=source.clone();

      if(material.color) material.color.set(UNIT_METAL);
      material.map=null;
      material.vertexColors=false;
      if("metalness" in material) material.metalness=0.72;
      if("roughness" in material) material.roughness=0.58;
      if(material.emissive){
        material.emissive.set(UNIT_METAL);
        material.emissiveIntensity=0.14;
      }

      if(weapons){
        if(material.color) material.color.lerp(new THREE.Color(color),0.58);
        if(material.emissive){
          material.emissive.set(color);
          material.emissiveIntensity=0.16;
        }
      }

      return material;
    });

    o.material=wasArray?materials:materials[0];
  });
}

function addRotorBlur(unit,color){
  const material=new THREE.MeshBasicMaterial({
    color:new THREE.Color(color).multiplyScalar(0.92),
    transparent:true,
    opacity:0.11,
    depthWrite:false,
    side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending
  });
  for(const y of [9.45,9.82]){
    const rotor=new THREE.Mesh(new THREE.CircleGeometry(12.2,48),material.clone());
    rotor.rotation.x=-Math.PI/2;
    rotor.position.y=y;
    rotor.userData.kind="rotor";
    rotor.userData.spin=y<9.6?1:-1;
    unit.add(rotor);
  }
}

function spawnInfantryTracer(unit,now){
  playBattlefieldSound("infantry",unit.userData.side);
  if(combatEffects.length>=90) return;

  const direction=unit.userData.side==="blue"?1:-1;
  const length=THREE.MathUtils.randFloat(6.0,11.0);
  const drift=THREE.MathUtils.randFloat(-0.55,0.55);
  const start=new THREE.Vector3(
    unit.position.x+direction*0.42,
    unit.position.y+0.88,
    unit.position.z
  );
  const end=new THREE.Vector3(
    start.x+direction*length,
    start.y+THREE.MathUtils.randFloat(-0.04,0.08),
    start.z+drift
  );
  const midpoint=start.clone().add(end).multiplyScalar(0.5);
  const tracerLength=start.distanceTo(end);

  const group=new THREE.Group();

  const tracer=new THREE.Mesh(
    new THREE.BoxGeometry(tracerLength,0.045,0.045),
    new THREE.MeshBasicMaterial({
      color:0xffd36a,
      transparent:true,
      opacity:0.92,
      depthWrite:false,
      blending:THREE.AdditiveBlending
    })
  );
  tracer.position.copy(midpoint);
  tracer.rotation.y=-Math.atan2(end.z-start.z,end.x-start.x);
  group.add(tracer);

  const flash=new THREE.Mesh(
    new THREE.SphereGeometry(0.14,8,6),
    new THREE.MeshBasicMaterial({
      color:0xfff1a8,
      transparent:true,
      opacity:1,
      depthWrite:false,
      blending:THREE.AdditiveBlending
    })
  );
  flash.position.copy(start);
  group.add(flash);

  scene.add(group);
  combatEffects.push({
    object:group,
    tracer,
    flash,
    born:now,
    life:THREE.MathUtils.randFloat(0.08,0.14)
  });
}

function spawnTankCannon(unit,now){
  playBattlefieldSound("tank",unit.userData.side);
  if(combatEffects.length>=90) return;

  const direction=unit.userData.side==="blue"?1:-1;
  const length=THREE.MathUtils.randFloat(17.0,29.0);
  const drift=THREE.MathUtils.randFloat(-1.0,1.0);
  const start=new THREE.Vector3(
    unit.position.x+direction*1.75,
    unit.position.y+0.82,
    unit.position.z
  );
  const end=new THREE.Vector3(
    start.x+direction*length,
    0.22,
    start.z+drift
  );
  const midpoint=start.clone().add(end).multiplyScalar(0.5);
  const tracerLength=start.distanceTo(end);
  const group=new THREE.Group();

  const tracer=new THREE.Mesh(
    new THREE.BoxGeometry(tracerLength,0.11,0.11),
    new THREE.MeshBasicMaterial({
      color:0xffb238,
      transparent:true,
      opacity:1,
      depthWrite:false,
      blending:THREE.AdditiveBlending
    })
  );
  tracer.position.copy(midpoint);
  tracer.rotation.y=-Math.atan2(end.z-start.z,end.x-start.x);
  group.add(tracer);

  const flash=new THREE.Mesh(
    new THREE.SphereGeometry(0.38,10,8),
    new THREE.MeshBasicMaterial({
      color:0xffe08a,
      transparent:true,
      opacity:1,
      depthWrite:false,
      blending:THREE.AdditiveBlending
    })
  );
  flash.position.copy(start);
  group.add(flash);

  const impact=new THREE.Mesh(
    new THREE.SphereGeometry(1.10,14,10),
    new THREE.MeshBasicMaterial({
      color:0xff6a18,
      transparent:true,
      opacity:0.92,
      depthWrite:false,
      blending:THREE.AdditiveBlending
    })
  );
  impact.position.copy(end);
  group.add(impact);

  scene.add(group);
  combatEffects.push({
    object:group,
    tracer,
    flash,
    impact,
    sourceSide:unit.userData.side,
    damageRadius:8.5,
    born:now,
    life:THREE.MathUtils.randFloat(0.26,0.38)
  });
}

function spawnHelicopterMissile(unit,now){
  playBattlefieldSound("helicopter",unit.userData.side);
  if(combatEffects.length>=90) return;

  const direction=unit.userData.side==="blue"?1:-1;
  const start=new THREE.Vector3(
    unit.position.x+direction*1.2,
    unit.position.y-0.35,
    unit.position.z
  );
  const end=new THREE.Vector3(
    start.x+direction*THREE.MathUtils.randFloat(12,22),
    0.22,
    start.z+THREE.MathUtils.randFloat(-5,5)
  );
  const midpoint=start.clone().add(end).multiplyScalar(0.5);
  const missileVector=end.clone().sub(start);
  const missileLength=missileVector.length();
  const group=new THREE.Group();

  const tracer=new THREE.Mesh(
    new THREE.CylinderGeometry(0.065,0.065,missileLength,7),
    new THREE.MeshBasicMaterial({
      color:0xffb238,
      transparent:true,
      opacity:1,
      depthWrite:false,
      blending:THREE.AdditiveBlending
    })
  );
  tracer.position.copy(midpoint);
  tracer.quaternion.setFromUnitVectors(
    new THREE.Vector3(0,1,0),
    missileVector.clone().normalize()
  );
  group.add(tracer);

  const flash=new THREE.Mesh(
    new THREE.SphereGeometry(0.34,10,8),
    new THREE.MeshBasicMaterial({
      color:0xffe08a,
      transparent:true,
      opacity:1,
      depthWrite:false,
      blending:THREE.AdditiveBlending
    })
  );
  flash.position.copy(start);
  group.add(flash);

  const impact=new THREE.Mesh(
    new THREE.SphereGeometry(1.10,14,10),
    new THREE.MeshBasicMaterial({
      color:0xff5a12,
      transparent:true,
      opacity:0.96,
      depthWrite:false,
      blending:THREE.AdditiveBlending
    })
  );
  impact.position.copy(end);
  group.add(impact);

  scene.add(group);
  combatEffects.push({
    object:group,
    tracer,
    flash,
    impact,
    sourceSide:unit.userData.side,
    damageRadius:8.5,
    born:now,
    life:THREE.MathUtils.randFloat(0.26,0.38)
  });
}

function destroyUnit(unit,now){
  const d=unit.userData;
  if(d.combatState==="destroyed") return;

  d.combatState="destroyed";
  d.destroyedAt=now;
  d.destroyDuration=d.kind==="tank"?3.8:1.8;
  d.destroyStartY=unit.position.y;
  d.destroyDirection=d.side==="blue"?1:-1;

  unit.traverse(o=>{
    if(!o.isMesh||!o.material) return;
    const wasArray=Array.isArray(o.material);
    const sources=wasArray?o.material:[o.material];
    const materials=sources.map(source=>{
      const material=source.clone();
      material.transparent=true;
      material.opacity=1;
      return material;
    });
    o.material=wasArray?materials:materials[0];
  });

  destroyedUnits.push(unit);
}

function applyImpactDamage(position,attackerSide,now,radius){
  if(!attackerSide) return;

  let target=null;
  let nearest=radius;

  scene.traverse(o=>{
    const d=o.userData;
    if(!["soldier","tank"].includes(d.kind)) return;
    if(d.side===attackerSide||d.combatState==="destroyed") return;

    const distance=Math.hypot(
      o.position.x-position.x,
      o.position.z-position.z
    );

    if(distance<nearest){
      nearest=distance;
      target=o;
    }
  });

  if(!target) return;

  const d=target.userData;
  if(d.health===undefined) d.health=d.kind==="tank"?3:1;
  d.health-=1;

  if(d.health<=0) destroyUnit(target,now);
}

function spawnAftermath(position,now){
  if(aftermathEffects.length>=28) return;

  const group=new THREE.Group();
  group.position.copy(position);
  const smoke=[];
  const debris=[];

  for(let i=0;i<4;i++){
    const cloud=new THREE.Mesh(
      new THREE.SphereGeometry(THREE.MathUtils.randFloat(0.38,0.72),9,7),
      new THREE.MeshBasicMaterial({
        color:i===0?0x292421:0x1b1d20,
        transparent:true,
        opacity:THREE.MathUtils.randFloat(0.22,0.34),
        depthWrite:false
      })
    );
    cloud.position.set(
      THREE.MathUtils.randFloat(-0.7,0.7),
      THREE.MathUtils.randFloat(0.1,0.6),
      THREE.MathUtils.randFloat(-0.7,0.7)
    );
    group.add(cloud);
    smoke.push({
      mesh:cloud,
      rise:THREE.MathUtils.randFloat(0.75,1.35),
      driftX:THREE.MathUtils.randFloat(-0.18,0.18),
      driftZ:THREE.MathUtils.randFloat(-0.18,0.18)
    });
  }

  for(let i=0;i<7;i++){
    const fragment=new THREE.Mesh(
      new THREE.BoxGeometry(
        THREE.MathUtils.randFloat(0.10,0.28),
        THREE.MathUtils.randFloat(0.08,0.22),
        THREE.MathUtils.randFloat(0.10,0.30)
      ),
      new THREE.MeshBasicMaterial({
        color:i%2?0x40342d:0x24282b
      })
    );
    fragment.position.set(
      THREE.MathUtils.randFloat(-0.35,0.35),
      THREE.MathUtils.randFloat(0.15,0.55),
      THREE.MathUtils.randFloat(-0.35,0.35)
    );
    group.add(fragment);
    debris.push({
      mesh:fragment,
      velocity:new THREE.Vector3(
        THREE.MathUtils.randFloat(-1.8,1.8),
        THREE.MathUtils.randFloat(1.8,3.7),
        THREE.MathUtils.randFloat(-1.8,1.8)
      ),
      spin:new THREE.Vector3(
        THREE.MathUtils.randFloat(-5,5),
        THREE.MathUtils.randFloat(-5,5),
        THREE.MathUtils.randFloat(-5,5)
      )
    });
  }

  scene.add(group);
  aftermathEffects.push({
    group,
    smoke,
    debris,
    born:now,
    life:THREE.MathUtils.randFloat(2.8,4.2)
  });
}


const WARPLANE_COOLDOWN=18;
const lastWarplaneLaunch={blue:-Infinity,red:-Infinity};
let warplaneTemplate=null;

function makeWarplane(side){
  if(!warplaneTemplate) return null;

  const color=side==="blue"?BLUE:RED;
  const model=clone(warplaneTemplate);
  const plane=new THREE.Group();
  plane.add(model);

  model.traverse(o=>{
    if(!o.isMesh||!o.material) return;

    const wasArray=Array.isArray(o.material);
    const sources=wasArray?o.material:[o.material];
    const materials=sources.map(source=>{
      const material=source.clone();
      if(material.color){
        material.color.lerp(new THREE.Color(0xb7c0c8),0.32);
        material.color.lerp(new THREE.Color(color),0.10);
      }
      if(material.emissive){
        material.emissive.set(color);
        material.emissiveIntensity=0.045;
      }
      if("metalness" in material) material.metalness=Math.max(material.metalness,0.68);
      if("roughness" in material) material.roughness=0.28;
      return material;
    });

    o.material=wasArray?materials:materials[0];
    o.castShadow=true;
    o.receiveShadow=true;
  });

  const markerMaterial=new THREE.MeshBasicMaterial({
    color,
    transparent:true,
    opacity:0.72,
    depthWrite:false,
    blending:THREE.AdditiveBlending
  });

  for(const z of [-1.65,1.65]){
    const marker=new THREE.Mesh(
      new THREE.SphereGeometry(0.13,10,8),
      markerMaterial.clone()
    );
    marker.position.set(0,0.08,z);
    plane.add(marker);
  }

  plane.userData={kind:"warplane",side};
  return plane;
}

function chooseAirstrikeTarget(side){
  const targets=[];
  scene.traverse(unit=>{
    const d=unit.userData;
    if(!["soldier","tank"].includes(d.kind)) return;
    if(d.side===side||d.combatState==="destroyed") return;
    targets.push(unit.position.clone());
  });
  if(targets.length) return targets[Math.floor(Math.random()*targets.length)];
  return new THREE.Vector3(side==="blue"?18:-18,0,THREE.MathUtils.randFloat(-12,12));
}

function launchWarplaneAirstrike(event,now){
  if(now-lastWarplaneLaunch[event.side]<WARPLANE_COOLDOWN) return false;
  lastWarplaneLaunch[event.side]=now;

  const direction=event.side==="blue"?1:-1;
  const target=chooseAirstrikeTarget(event.side);
  const plane=makeWarplane(event.side);
  if(!plane) return false;

  const startX=-direction*82;
  const endX=direction*82;
  const startZ=THREE.MathUtils.randFloat(-16,6);
  const endZ=THREE.MathUtils.randFloat(-16,6);
  const startY=THREE.MathUtils.randFloat(18,23);
  const endY=THREE.MathUtils.randFloat(18,23);

  plane.position.set(startX,startY,startZ);
  plane.rotation.y=direction>0?0:Math.PI;
  plane.rotation.z=-direction*0.05;
  scene.add(plane);

  warplanes.push({
    plane,
    side:event.side,
    direction,
    target,
    startX,
    endX,
    startZ,
    endZ,
    startY,
    endY,
    born:now,
    duration:THREE.MathUtils.randFloat(3.2,4.0),
    released:false,
    xrpAmount:event.xrpAmount||0,
    hash:event.hash||""
  });

  return true;
}

function releaseAirstrikeBombs(strike,now){
  playBattlefieldSound("bomb",strike.side);
  strike.released=true;
  for(let i=0;i<3;i++){
    const bomb=new THREE.Mesh(
      new THREE.CapsuleGeometry(0.24,0.72,5,8),
      new THREE.MeshStandardMaterial({color:0x24292d,metalness:0.82,roughness:0.40})
    );
    bomb.rotation.z=Math.PI/2;
    bomb.position.copy(strike.plane.position);
    bomb.position.z+=(i-1)*2.8;
    scene.add(bomb);
    airstrikeEffects.push({
      type:"bomb",
      object:bomb,
      side:strike.side,
      target:strike.target.clone().add(new THREE.Vector3((i-1)*2.6,0,(i-1)*2.1)),
      velocity:new THREE.Vector3(strike.direction*9,-3.2,0),
      born:now,
      delay:i*0.13
    });
  }
}

function applyAirstrikeDamage(position,attackerSide,now,radius){
  const victims=[];
  scene.traverse(unit=>{
    const d=unit.userData;
    if(!["soldier","tank"].includes(d.kind)) return;
    if(d.side===attackerSide||d.combatState==="destroyed") return;
    const distance=Math.hypot(unit.position.x-position.x,unit.position.z-position.z);
    if(distance<=radius) victims.push({unit,distance});
  });

  victims.sort((a,b)=>a.distance-b.distance);
  for(const {unit,distance} of victims.slice(0,9)){
    const d=unit.userData;
    if(d.health===undefined) d.health=d.kind==="tank"?3:1;
    const damage=distance<radius*0.48?3:distance<radius*0.78?2:1;
    d.health-=damage;
    if(d.health<=0) destroyUnit(unit,now);
  }
}

function detonateAirstrike(position,side,now){
  playBattlefieldSound("explosion",side);
  const group=new THREE.Group();
  group.position.copy(position);
  group.position.y=0.45;

  const fire=new THREE.Mesh(
    new THREE.SphereGeometry(1.4,16,12),
    new THREE.MeshBasicMaterial({color:0xff641c,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending})
  );
  const core=new THREE.Mesh(
    new THREE.SphereGeometry(0.72,14,10),
    new THREE.MeshBasicMaterial({color:0xfff0a1,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending})
  );
  const ring=new THREE.Mesh(
    new THREE.RingGeometry(1.1,1.85,28),
    new THREE.MeshBasicMaterial({color:0xff8b31,transparent:true,opacity:0.9,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending})
  );
  ring.rotation.x=-Math.PI/2;
  group.add(fire,core,ring);
  scene.add(group);
  airstrikeEffects.push({type:"blast",object:group,fire,core,ring,born:now,life:1.15});

  applyAirstrikeDamage(position,side,now,13.5);
  spawnAftermath(position,now);
  for(let i=0;i<3;i++){
    spawnAftermath(position.clone().add(new THREE.Vector3(
      THREE.MathUtils.randFloat(-4.5,4.5),0,THREE.MathUtils.randFloat(-4.5,4.5)
    )),now);
  }
}

function processBattlefieldEvent(event,now){
  if(event.type==="warplane_airstrike"){
    return launchWarplaneAirstrike(event,now);
  }
  if(event.type==="reinforcement"){
    const kind=event.kind==="tank"?"tank":"soldier";
    return spawnReinforcements(event.side,kind,event.count||1)>0;
  }

  const candidates=[];

  if(event.type==="helicopter_strike"){
    for(const heli of helicopters){
      if(heli.userData.side===event.side) candidates.push(heli);
    }
  }else{
    const kind=event.type==="infantry_volley"?"soldier":"tank";
    scene.traverse(unit=>{
      if(unit.userData.kind!==kind) return;
      if(unit.userData.side!==event.side) return;
      if(unit.userData.combatState==="destroyed") return;
      candidates.push(unit);
    });
  }

  if(!candidates.length) return false;

  for(let i=candidates.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }

  const baseCount=event.type==="infantry_volley"?4:event.type==="tank_artillery"?2:1;
  const count=Math.min(candidates.length,Math.max(1,Math.round(baseCount*event.intensity)));

  for(let i=0;i<count;i++){
    const unit=candidates[i];
    if(event.type==="infantry_volley") spawnInfantryTracer(unit,now);
    else if(event.type==="tank_artillery") spawnTankCannon(unit,now);
    else spawnHelicopterMissile(unit,now);
  }

  return true;
}

const root = document.getElementById('battlefield');

const scene = new THREE.Scene();
window.scene = scene;
window.THREE = THREE;
scene.background = null;

new GLTFLoader().load(
  "./assets/models/master-warplane.glb",
  gltf=>{
    const model=gltf.scene;
    const hiddenAircraftParts=/(landing|wheel|ladder)/i;

    model.traverse(object=>{
      if(hiddenAircraftParts.test(object.name||"")){
        object.visible=false;
      }
    });

    const bounds=new THREE.Box3().setFromObject(model);
    const size=bounds.getSize(new THREE.Vector3());
    const center=bounds.getCenter(new THREE.Vector3());
    const maximum=Math.max(size.x,size.y,size.z)||1;

    model.position.sub(center);
    model.scale.setScalar(6.2/maximum);
    model.rotation.set(0,Math.PI/2,0);

    warplaneTemplate=model;
    window.launchTestWarplane=(side="blue")=>launchWarplaneAirstrike({
      type:"warplane_airstrike",
      side,
      intensity:3,
      xrpAmount:250000,
      hash:"DIRECT-WARPLANE-TEST"
    },performance.now()*0.001);

    console.log("AUGUR master warplane loaded",{size,scale:6.2/maximum});
  },
  undefined,
  error=>console.error("AUGUR warplane load failed",error)
);

root.style.backgroundImage = "url('./assets/textures/battlefield.webp')";
root.style.backgroundSize = "cover";
root.style.backgroundPosition = "center center";
root.style.backgroundRepeat = "no-repeat";

const camera = new THREE.PerspectiveCamera(
  55,
  innerWidth / innerHeight,
  0.1,
  500
);

camera.position.set(0, 35, 65);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setClearColor(0x000000, 0);
renderer.setSize(innerWidth, innerHeight);

root.replaceChildren(renderer.domElement);

renderer.render(scene, camera);


/* AUGUR BATTLEFIELD — SCREEN BACKGROUND + INVISIBLE PLAYFIELD */
root.style.backgroundImage = "url('./assets/textures/battlefield.webp')";
root.style.backgroundSize = "cover";
root.style.backgroundPosition = "center center";
root.style.backgroundRepeat = "no-repeat";

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 90),
  new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  })
);

ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.08;
scene.add(ground);

scene.add(new THREE.HemisphereLight(0xb8d8ff, 0x202015, 3));

const battlefieldFillLight=new THREE.AmbientLight(0xdbe5ed,1.35);
scene.add(battlefieldFillLight);

const battlefieldKeyLight=new THREE.DirectionalLight(0xffe4c2,2.25);
battlefieldKeyLight.position.set(-18,38,32);
scene.add(battlefieldKeyLight);

const battlefieldRimLight=new THREE.DirectionalLight(0x9ecbff,1.45);
battlefieldRimLight.position.set(22,24,-28);
scene.add(battlefieldRimLight);

renderer.render(scene, camera);

renderer.render(scene,camera);
const loader = new GLTFLoader();

/* Organic battlefield placement */
const occupied = [];

/* Unit visibility halos */
function addUnitHalo(unit, color, kind){
  const size = kind === "tank" ? 3.25 : 1.35;
  const opacity = kind === "tank" ? 0.15 : 0.30;

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(size, 28),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );

  halo.rotation.x = -Math.PI / 2;
  halo.position.set(0, 0.035, 0);
  halo.renderOrder = 1;

  unit.add(halo);
}

function scatteredPosition(side, minGap=5){
  const minX = side==="blue" ? -52 : 8;
  const maxX = side==="blue" ? -8  : 52;

  for(let tries=0; tries<200; tries++){
    const x = THREE.MathUtils.randFloat(minX,maxX);
    const z = THREE.MathUtils.randFloat(-34,34);

    const clear = occupied.every(p=>{
      const dx=x-p.x, dz=z-p.z;
      return Math.hypot(dx,dz) >= minGap;
    });

    if(clear){
      occupied.push({x,z});
      return {x,z};
    }
  }

  return {
    x: THREE.MathUtils.randFloat(minX,maxX),
    z: THREE.MathUtils.randFloat(-34,34)
  };
}

function countActiveUnits(side,kind){
  let count=0;
  scene.traverse(unit=>{
    if(unit.userData.side===side&&unit.userData.kind===kind&&unit.userData.combatState!=="destroyed") count++;
  });
  return count;
}

function spawnReinforcements(side,kind,requested=1){
  const template=unitTemplates[side]?.[kind];
  if(!template) return 0;

  const available=Math.max(0,UNIT_CAPS[kind]-countActiveUnits(side,kind));
  const count=Math.min(available,Math.max(1,Math.floor(requested)));
  const color=side==="blue"?BLUE:RED;

  for(let i=0;i<count;i++){
    const unit=clone(template);
    const rearX=side==="blue"
      ?THREE.MathUtils.randFloat(-52,-43)
      :THREE.MathUtils.randFloat(43,52);
    unit.position.set(rearX,0,THREE.MathUtils.randFloat(-31,31));
    unit.userData.side=side;
    unit.userData.kind=kind;
    delete unit.userData.combatState;
    addUnitHalo(unit,color,kind);
    scene.add(unit);
  }

  return count;
}

loader.load('./assets/models/master-tank.glb', (gltf) => {
  const tank = gltf.scene;
  tank.position.set(-22, 0, 8);
  tank.rotation.y = Math.PI;
  tank.scale.setScalar(0.35);
    tank.traverse((o)=>{if(o.isMesh)o.material=o.material.clone();});
  tuneTankMetal(tank);
  tank.userData.side="blue"; tank.userData.kind="tank";
    const redTank=clone(tank); redTank.position.set(22,0,8);
  accentTank(tank,BLUE);
  redTank.userData.side="red"; redTank.userData.kind="tank";
  accentTank(redTank,RED);
  redTank.rotation.y = Math.PI;
  unitTemplates.blue.tank=clone(tank);
  unitTemplates.red.tank=clone(redTank);
    for(let i=0;i<20;i++){
    const bp=scatteredPosition("blue",7);
    const b=clone(tank);
    b.position.set(bp.x,0,bp.z);
    b.userData.side="blue";
    b.userData.kind="tank";
    addUnitHalo(b, BLUE, "tank");
    scene.add(b);

    const rp=scatteredPosition("red",7);
    const r=clone(redTank);
    r.position.set(rp.x,0,rp.z);
    r.userData.side="red";
    r.userData.kind="tank";
    addUnitHalo(r, RED, "tank");
    scene.add(r);
  }
  renderer.render(scene, camera);
});

loader.load('./assets/models/master-soldier.glb', (gltf) => {
  const soldier = gltf.scene;
  soldier.position.set(-10, 0, -8);
  soldier.rotation.y = Math.PI / 2;
  soldier.scale.setScalar(0.90);

  soldier.traverse((o)=>{if(o.isMesh)o.material=o.material.clone();});
  tuneSoldierUniform(soldier);

  const redSoldier=clone(soldier); redSoldier.position.set(10,0,-8); redSoldier.rotation.y=-Math.PI/2;
  accentSoldier(soldier,BLUE); accentSoldier(redSoldier,RED);
  unitTemplates.blue.soldier=clone(soldier);
  unitTemplates.red.soldier=clone(redSoldier);
  for(let i=0;i<60;i++){
    const bp=scatteredPosition("blue",4);
    const b=clone(soldier);
    b.position.set(bp.x,0,bp.z);
    b.userData.side="blue";
    b.userData.kind="soldier";
    addUnitHalo(b, BLUE, "soldier");
    scene.add(b);

    const rp=scatteredPosition("red",4);
    const r=clone(redSoldier);
    r.position.set(rp.x,0,rp.z);
    r.userData.side="red";
    r.userData.kind="soldier";
    addUnitHalo(r, RED, "soldier");
    scene.add(r);
  }
  renderer.render(scene, camera);
});

loader.load('./assets/models/master-helicopter.glb',(gltf)=>{
  const master=gltf.scene;
  master.scale.setScalar(0.18);

  for(const side of ["blue","red"]){
    const color=side==="blue"?BLUE:RED;
    for(let i=0;i<4;i++){
      const heli=clone(master);
      accentHelicopter(heli,color);
      addRotorBlur(heli,color);
      heli.userData.kind="helicopter";
      heli.userData.side=side;
      heli.userData.phase=Math.random()*Math.PI*2;
      heli.userData.speed=THREE.MathUtils.randFloat(0.16,0.24);
      heli.userData.altitude=THREE.MathUtils.randFloat(7,12);
      heli.userData.depth=THREE.MathUtils.randFloat(-12,12);
      heli.userData.radiusX=THREE.MathUtils.randFloat(9,15);
      heli.userData.radiusZ=THREE.MathUtils.randFloat(5,10);
      helicopters.push(heli);
      scene.add(heli);
    }
  }
  renderer.render(scene,camera);
},undefined,(error)=>{
  console.error("AUGUR helicopter load failed",error);
});

let lastFrame=performance.now();

function animate(){
  requestAnimationFrame(animate);

  const frameTime=performance.now();
  const delta=Math.min((frameTime-lastFrame)/1000,0.05);
  lastFrame=frameTime;
  const now=frameTime*0.001;


  for(let i=warplanes.length-1;i>=0;i--){
    const strike=warplanes[i];
    const progress=(now-strike.born)/strike.duration;
    strike.plane.position.x=THREE.MathUtils.lerp(strike.startX,strike.endX,progress);
    strike.plane.position.y=
      THREE.MathUtils.lerp(strike.startY,strike.endY,progress)+
      Math.sin(progress*Math.PI)*1.2;
    strike.plane.position.z=
      THREE.MathUtils.lerp(strike.startZ,strike.endZ,progress)+
      Math.sin(progress*Math.PI)*1.2;

    if(!strike.released&&progress>=0.47) releaseAirstrikeBombs(strike,now);

    if(progress>=1){
      scene.remove(strike.plane);
      strike.plane.traverse(o=>{
        if(!o.isMesh) return;
        o.geometry.dispose();
        const materials=Array.isArray(o.material)?o.material:[o.material];
        for(const material of materials) material.dispose();
      });
      warplanes.splice(i,1);
    }
  }

  for(let i=airstrikeEffects.length-1;i>=0;i--){
    const effect=airstrikeEffects[i];
    if(effect.type==="bomb"){
      const age=now-effect.born;
      if(age<effect.delay) continue;
      effect.velocity.y-=19*delta;
      effect.object.position.addScaledVector(effect.velocity,delta);
      effect.object.rotation.x+=4.2*delta;
      effect.object.rotation.z+=2.8*delta;
      if(effect.object.position.y<=0.65){
        const impact=new THREE.Vector3(
          effect.object.position.x,
          0,
          effect.object.position.z
        );
        scene.remove(effect.object);
        effect.object.geometry.dispose();
        effect.object.material.dispose();
        airstrikeEffects.splice(i,1);
        detonateAirstrike(impact,effect.side,now);
      }
      continue;
    }

    const age=(now-effect.born)/effect.life;
    if(age>=1){
      scene.remove(effect.object);
      effect.object.traverse(o=>{
        if(!o.isMesh) return;
        o.geometry.dispose();
        o.material.dispose();
      });
      airstrikeEffects.splice(i,1);
      continue;
    }
    effect.fire.scale.setScalar(1+age*8.5);
    effect.core.scale.setScalar(1+age*5.5);
    effect.ring.scale.setScalar(1+age*10);
    effect.fire.material.opacity=0.95*(1-age);
    effect.core.material.opacity=1-Math.min(1,age*1.35);
    effect.ring.material.opacity=0.9*(1-age);
  }

  for(const heli of helicopters){
    const d=heli.userData;
    const t=now*d.speed+d.phase;
    const centerX=d.side==="blue"?-27:27;
    const direction=d.side==="blue"?1:-1;

    heli.position.set(
      centerX+Math.cos(t)*d.radiusX,
      d.altitude+Math.sin(t*1.7)*1.2,
      d.depth+Math.sin(t)*d.radiusZ
    );
    heli.rotation.y=(direction>0?-Math.PI/2:Math.PI/2)-Math.sin(t)*0.35;
    heli.rotation.z=Math.sin(t)*0.14*direction;
    heli.rotation.x=Math.cos(t*1.7)*0.035;

    heli.traverse(o=>{
      if(o.userData.kind==="rotor") o.rotation.z+=0.32*o.userData.spin;
    });

  }

  const groundUnits=[];

  scene.traverse((o)=>{
    if(!["soldier","tank"].includes(o.userData.kind)) return;
    const d=o.userData;
    if(d.combatState==="destroyed") return;
    groundUnits.push(o);

    if(d.combatState===undefined){
      const soldier=d.kind==="soldier";
      d.combatState="advance";
      d.startZ=o.position.z;
      d.movePhase=(Math.abs(o.position.x)*0.37+Math.abs(o.position.z)*0.19)%(Math.PI*2);
      d.moveSpeed=soldier?THREE.MathUtils.randFloat(0.38,0.62):THREE.MathUtils.randFloat(0.12,0.22);
      d.collisionRadius=soldier?0.78:2.35;
      const direction=d.side==="blue"?1:-1;
      const advanceDistance=soldier
        ?THREE.MathUtils.randFloat(2.5,8.5)
        :THREE.MathUtils.randFloat(1.5,5.0);
      const frontBand=soldier
        ?THREE.MathUtils.randFloat(3.5,9.5)
        :THREE.MathUtils.randFloat(7.0,14.0);
      const proposed=o.position.x+direction*advanceDistance;
      d.engageX=d.side==="blue"
        ?Math.min(proposed,-frontBand)
        :Math.max(proposed,frontBand);
    }

    if(d.combatState==="advance"){
      const direction=d.side==="blue"?1:-1;
      o.position.x+=direction*d.moveSpeed*delta;
      const reached=d.side==="blue"?o.position.x>=d.engageX:o.position.x<=d.engageX;
      if(reached){
        o.position.x=d.engageX;
        d.combatState="engage";
        d.engagedAt=now;
      }
    }

    const soldier=d.kind==="soldier";
    const motion=d.combatState==="advance"?1:0.3;
    o.position.z=d.startZ+Math.sin(now*(soldier?4.2:1.2)+d.movePhase)*(soldier?0.11:0.025)*motion;

  });

  for(let i=destroyedUnits.length-1;i>=0;i--){
    const unit=destroyedUnits[i];
    const d=unit.userData;
    const age=Math.min((now-d.destroyedAt)/d.destroyDuration,1);
    const fade=age<0.42?1:1-(age-0.42)/0.58;

    if(d.kind==="soldier"){
      unit.rotation.z=d.destroyDirection*age*Math.PI*0.48;
      unit.position.y=d.destroyStartY-Math.min(age,0.55)*0.18;
    }else{
      unit.rotation.z=d.destroyDirection*age*0.12;
      unit.position.y=d.destroyStartY-age*0.32;
    }

    unit.traverse(o=>{
      if(!o.isMesh||!o.material) return;
      const materials=Array.isArray(o.material)?o.material:[o.material];
      for(const material of materials) material.opacity=Math.max(0,fade);
    });

    if(age>=1){
      scene.remove(unit);
      unit.traverse(o=>{
        if(!o.isMesh||!o.material) return;
        const materials=Array.isArray(o.material)?o.material:[o.material];
        for(const material of materials) material.dispose();
      });
      destroyedUnits.splice(i,1);
    }
  }

  for(let pass=0;pass<2;pass++){
    for(let i=0;i<groundUnits.length;i++){
      const a=groundUnits[i];

      for(let j=i+1;j<groundUnits.length;j++){
        const b=groundUnits[j];
        let dx=b.position.x-a.position.x;
        let dz=b.position.z-a.position.z;
        let distance=Math.hypot(dx,dz);
        const minimum=a.userData.collisionRadius+b.userData.collisionRadius;

        if(distance>=minimum) continue;

        if(distance<0.001){
          dx=((i+j)%2===0)?1:-1;
          dz=((i*3+j)%2===0)?0.5:-0.5;
          distance=Math.hypot(dx,dz);
        }

        const nx=dx/distance;
        const nz=dz/distance;
        const correction=(minimum-distance)*0.52;
        const massA=a.userData.kind==="tank"?4:1;
        const massB=b.userData.kind==="tank"?4:1;
        const moveA=massB/(massA+massB);
        const moveB=massA/(massA+massB);

        a.position.x-=nx*correction*moveA;
        a.position.z-=nz*correction*moveA;
        b.position.x+=nx*correction*moveB;
        b.position.z+=nz*correction*moveB;

        a.userData.startZ-=nz*correction*moveA;
        b.userData.startZ+=nz*correction*moveB;
      }
    }
  }

  // Preserve a permanent neutral corridor between both armies.
  for(const unit of groundUnits){
    if(unit.userData.side==="blue"){
      unit.position.x=Math.min(unit.position.x,-4.5);
    }else{
      unit.position.x=Math.max(unit.position.x,4.5);
    }
  }

  for(let i=combatEffects.length-1;i>=0;i--){
    const effect=combatEffects[i];
    const age=(now-effect.born)/effect.life;

    if(age>=1){
      scene.remove(effect.object);
      effect.tracer.geometry.dispose();
      effect.tracer.material.dispose();
      effect.flash.geometry.dispose();
      effect.flash.material.dispose();
      if(effect.impact){
        spawnAftermath(effect.impact.position,now);
        applyImpactDamage(
          effect.impact.position,
          effect.sourceSide,
          now,
          effect.damageRadius
        );
        effect.impact.geometry.dispose();
        effect.impact.material.dispose();
      }
      combatEffects.splice(i,1);
      continue;
    }

    effect.tracer.material.opacity=0.92*(1-age);
    effect.flash.material.opacity=1-age;
    effect.flash.scale.setScalar(1+age*1.8);
    if(effect.impact){
      effect.impact.material.opacity=0.92*(1-age);
      effect.impact.scale.setScalar(0.8+age*4.2);
    }
  }

  for(let i=aftermathEffects.length-1;i>=0;i--){
    const effect=aftermathEffects[i];
    const age=(now-effect.born)/effect.life;

    if(age>=1){
      scene.remove(effect.group);
      effect.group.traverse(o=>{
        if(!o.isMesh) return;
        o.geometry.dispose();
        o.material.dispose();
      });
      aftermathEffects.splice(i,1);
      continue;
    }

    for(const cloud of effect.smoke){
      cloud.mesh.position.x+=cloud.driftX*delta;
      cloud.mesh.position.y+=cloud.rise*delta;
      cloud.mesh.position.z+=cloud.driftZ*delta;
      cloud.mesh.scale.setScalar(1+age*2.6);
      cloud.mesh.material.opacity=0.30*(1-age);
    }

    for(const fragment of effect.debris){
      fragment.velocity.y-=5.2*delta;
      fragment.mesh.position.addScaledVector(fragment.velocity,delta);
      fragment.mesh.rotation.x+=fragment.spin.x*delta;
      fragment.mesh.rotation.y+=fragment.spin.y*delta;
      fragment.mesh.rotation.z+=fragment.spin.z*delta;

      if(fragment.mesh.position.y<0){
        fragment.mesh.position.y=0;
        fragment.velocity.y=Math.abs(fragment.velocity.y)*0.28;
        fragment.velocity.x*=0.72;
        fragment.velocity.z*=0.72;
      }
    }
  }

  for(let processed=0;processed<2&&battlefieldEventQueue.length;processed++){
    const event=battlefieldEventQueue.shift();
    processBattlefieldEvent(event,now);
  }

  renderer.render(scene,camera);
}

animate();
