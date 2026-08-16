import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
const BLUE=0x258cff, RED=0xff4038;
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

const helicopters=[];

function accentHelicopter(root,color){
  root.traverse(o=>{
    if(!o.isMesh||!o.material) return;
    o.material=o.material.clone();

    const body=o.name==="Object_10";
    const weapons=o.name==="Object_6";
    if(!body&&!weapons) return;

    if(body){
      if(o.material.color) o.material.color.multiplyScalar(0.22);
      if("metalness" in o.material) o.material.metalness=Math.max(o.material.metalness,0.72);
      if("roughness" in o.material) o.material.roughness=Math.min(o.material.roughness,0.68);
    }

    if(weapons){
      if(o.material.color) o.material.color.lerp(new THREE.Color(color),0.58);
      if(o.material.emissive){
        o.material.emissive.set(color);
        o.material.emissiveIntensity=0.16;
      }
    }
  });
}

function addRotorBlur(unit,color){
  const material=new THREE.MeshBasicMaterial({
    color,
    transparent:true,
    opacity:0.075,
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

const root = document.getElementById('battlefield');

const scene = new THREE.Scene();
window.scene = scene;
window.THREE = THREE;
scene.background = null;

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

loader.load('./assets/models/master-tank.glb', (gltf) => {
  const tank = gltf.scene;
  tank.position.set(-22, 0, 8);
  tank.rotation.y = Math.PI;
  tank.scale.setScalar(0.35);
    tank.traverse((o)=>{if(o.isMesh)o.material=o.material.clone();});
  darkenUnit(tank,0.58);
  tank.userData.side="blue"; tank.userData.kind="tank";
    const redTank=clone(tank); redTank.position.set(22,0,8);
  accentTank(tank,BLUE);
  redTank.userData.side="red"; redTank.userData.kind="tank";
  accentTank(redTank,RED);
  redTank.rotation.y = Math.PI;
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
  soldier.scale.setScalar(0.75);

  soldier.traverse((o)=>{if(o.isMesh)o.material=o.material.clone();});
  darkenUnit(soldier,0.62);

  const redSoldier=clone(soldier); redSoldier.position.set(10,0,-8); redSoldier.rotation.y=-Math.PI/2;
  accentSoldier(soldier,BLUE); accentSoldier(redSoldier,RED);
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
    groundUnits.push(o);

    if(d.combatState===undefined){
      const soldier=d.kind==="soldier";
      d.combatState="advance";
      d.startZ=o.position.z;
      d.movePhase=(Math.abs(o.position.x)*0.37+Math.abs(o.position.z)*0.19)%(Math.PI*2);
      d.moveSpeed=soldier?THREE.MathUtils.randFloat(0.38,0.62):THREE.MathUtils.randFloat(0.12,0.22);
      d.collisionRadius=soldier?0.78:2.35;
      const line=THREE.MathUtils.randFloat(2.5,6.5);
      d.engageX=d.side==="blue"?-line:line;
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

  renderer.render(scene,camera);
}

animate();
