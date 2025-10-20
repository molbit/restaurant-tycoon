// Restaurant Tycoon — demo core
// 全体書き換え: このファイルがゲームロジック全部。
// 拡張ポイントにコメントを残してあるので自由にいじって！

/* ========= game state ========= */
const state = {
  money: 10000,
  day: 1,
  reputation: 50,
  served: 0,
  ingredients: 10,
  price: 600,
  staff: { waiter: 0, chef: 0 },
  kitchenLevel: 1,
  running: false,
  pause: false,
};

/* ========= DOM ========= */
const $ = id => document.getElementById(id);
const moneyEl = $('money'), dayEl = $('day'), repEl = $('rep'), servedEl = $('served');
const ingrEl = $('ingredients'), priceInput = $('priceInput'), msgEl = $('msg');

const canvas = $('game'); const ctx = canvas.getContext('2d');

/* ========= simple save/load ========= */
function save(){
  localStorage.setItem('rt_state', JSON.stringify(state));
}
function load(){
  const s = localStorage.getItem('rt_state');
  if(s) Object.assign(state, JSON.parse(s));
}
load();

/* ========= HUD update ========= */
function updateHUD(){
  moneyEl.textContent = Math.floor(state.money);
  dayEl.textContent = state.day;
  repEl.textContent = Math.max(0, Math.min(100, Math.floor(state.reputation)));
  servedEl.textContent = state.served;
  ingrEl.textContent = state.ingredients;
  priceInput.value = state.price;
}
updateHUD();

/* ========= game world: customers ========= */
const WORLD = { customers: [], spawnTimer: 0, spawnInterval: 2.2 }; // seconds

class Customer {
  constructor(id){
    this.id = id;
    this.x = 50 + Math.random()*620;
    this.y = -20;
    this.speed = 40 + Math.random()*40; // px/s falling into view
    this.state = 'entering'; // entering -> waiting -> seated -> ordering -> cooked -> served -> gone
    this.patience = 8 + Math.random()*8; // seconds before leaving
    this.table = null;
    this.orderTime = 0;
  }
  update(dt){
    if(this.state==='entering'){
      this.y += this.speed*dt;
      if(this.y >= 60){ this.state='waiting'; }
    } else if(this.state==='waiting'){
      this.patience -= dt;
      if(this.patience <= 0){ this.state='gone'; state.reputation -= 2; }
    } else if(this.state==='seated'){
      // waiting to be served
    } else if(this.state==='ordering'){
      // chef/waiter interplay
    }
  }
}

/* ===== tables: 4 seats ===== */
const tables = [
  {x:120,y:220,occupied:null},
  {x:300,y:220,occupied:null},
  {x:480,y:220,occupied:null},
  {x:600,y:220,occupied:null},
];

/* ========= action helpers ========= */
function spawnCustomer(){
  const id = Date.now() + Math.floor(Math.random()*1000);
  WORLD.customers.push(new Customer(id));
}
function seatCustomerAt(customer,table){
  if(customer.state!=='waiting') return false;
  if(table.occupied) return false;
  table.occupied = customer.id;
  customer.state = 'seated';
  customer.table = table;
  // after seating, either waiter or player will take order
  if(state.staff.waiter>0){
    // automated: waiter takes order after short delay
    setTimeout(()=> takeOrder(customer), 1000);
  }
  return true;
}
function takeOrder(customer){
  if(!customer || customer.state!=='seated') return;
  if(state.ingredients <= 0){
    // cannot cook
    customer.state='gone';
    if(customer.table) customer.table.occupied = null;
    state.reputation -= 5;
    showMsg('No ingredients! Customers leave.');
    return;
  }
  customer.state='ordering';
  customer.orderTime = 0;
  // if chef exists, chef will cook automatically; else player must click "Cook"
  if(state.staff.chef>0){
    // chef cooks faster depending on kitchenLevel
    const cookDelay = Math.max(1.0, 3.5 - 0.5*(state.kitchenLevel-1));
    setTimeout(()=> finishCooking(customer), cookDelay*1000);
  } else {
    // wait for player action (we provide a cook button UI later)
  }
}
function finishCooking(customer){
  if(!customer || (customer.state!=='ordering' && customer.state!=='seated')) return;
  // serve
  customer.state='cooked';
  serveCustomer(customer);
}
function serveCustomer(customer){
  if(!customer) return;
  if(customer.state==='gone') return;
  // receive money
  state.money += state.price;
  state.ingredients = Math.max(0, state.ingredients - 1);
  state.served += 1;
  state.reputation += 0.5;
  // free table
  if(customer.table) customer.table.occupied = null;
  customer.state='served';
  // remove customer after short time
  setTimeout(()=> {
    WORLD.customers = WORLD.customers.filter(c => c.id !== customer.id);
  }, 800);
}

/* ========= player interactions: click to seat or click to cook ========= */
canvas.addEventListener('click', (e)=>{
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width/rect.width);
  const my = (e.clientY - rect.top) * (canvas.height/rect.height);

  // click customer to seat them at nearest free table
  // first try: click within customer circle
  for(const c of WORLD.customers){
    if(c.state==='waiting'){
      const dx = mx - c.x, dy = my - c.y;
      if(dx*dx + dy*dy < 16*16){
        // find nearest free table
        let best = null, bestDist = 1e9;
        for(const t of tables){
          if(!t.occupied){
            const dd = (t.x - c.x)**2 + (t.y - c.y)**2;
            if(dd < bestDist){ bestDist = dd; best = t; }
          }
        }
        if(best){
          seatCustomerAt(c,best);
          save(); updateHUD(); return;
        }
      }
    }
    // If clicking seated and no chef, allow player to "cook" by clicking customer while ordering
    if((c.state==='ordering' || c.state==='seated') && state.staff.chef===0){
      const dx = mx - c.x, dy = my - c.y;
      if(dx*dx + dy*dy < 20*20){
        // player cooks: time cost simulated by small delay
        showMsg('You start cooking (player).');
        setTimeout(()=> finishCooking(c), 1200);
        return;
      }
    }
  }
});

/* ========= game loop ========= */
let lastTs = performance.now();
function tick(ts){
  if(state.pause){ lastTs = ts; requestAnimationFrame(tick); return; }
  const dt = Math.min(0.5, (ts - lastTs)/1000);
  lastTs = ts;

  if(state.running){
    // spawn logic
    WORLD.spawnTimer += dt;
    // spawn frequency scales with day and reputation
    const spawnInterval = Math.max(0.6, WORLD.spawnInterval - (state.day-1)*0.05 - (state.reputation-50)*0.01);
    if(WORLD.spawnTimer >= spawnInterval){
      WORLD.spawnTimer = 0;
      spawnCustomer();
    }

    // update customers
    for(const c of WORLD.customers) c.update(dt);
    // automated staff: waiter seats customer if free tables
    if(state.staff.waiter > 0){
      for(const c of WORLD.customers){
        if(c.state==='waiting'){
          const free = tables.find(t => !t.occupied);
          if(free){
            seatCustomerAt(c, free);
          }
        }
      }
    }
    // automatic cooking if chef present: handled when taking order
    // handle patience timeouts -> remove gone customers
    for(const c of [...WORLD.customers]){
      if(c.state==='gone'){
        WORLD.customers = WORLD.customers.filter(x=>x.id!==c.id);
      }
    }

    // small passive costs (staff salaries)
    const wageCost = (state.staff.waiter*5 + state.staff.chef*8) * dt;
    state.money -= wageCost * 0.5; // small continuous drain
  }

  render();
  updateHUD();
  save();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* ========= rendering ========= */
function render(){
  // clear
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // background floor
  ctx.fillStyle = '#112233';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // draw tables
  for(const t of tables){
    ctx.fillStyle = t.occupied ? '#663' : '#886';
    ctx.fillRect(t.x-28, t.y-12, 56, 24);
    ctx.strokeStyle = '#222';
    ctx.strokeRect(t.x-28, t.y-12, 56, 24);
  }

  // draw customers
  for(const c of WORLD.customers){
    ctx.beginPath();
    let color = '#ffd7b5'; // default
    if(c.state==='waiting') color = '#ffd7b5';
    if(c.state==='seated') color = '#b5ffd8';
    if(c.state==='ordering') color = '#b5d0ff';
    if(c.state==='cooked') color = '#d0ffb5';
    if(c.state==='gone') color = '#666';
    if(c.state==='served') color = '#aaaaaa';
    ctx.fillStyle = color;
    ctx.arc(c.x, c.y, 14, 0, Math.PI*2);
    ctx.fill();
    // patience bar
    if(c.state==='waiting'){
      const w = 28 * (c.patience / 14);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(c.x-14, c.y+18, 28, 4);
      ctx.fillStyle = 'rgba(255,80,60,0.9)';
      ctx.fillRect(c.x-14, c.y+18, w, 4);
    }
  }

  // draw floor decor / counters
  ctx.fillStyle = '#223344';
  ctx.fillRect(20,14, 120,40); // door area
  ctx.fillStyle = '#334455';
  ctx.fillRect(20,260, 200,60); // kitchen area visual
  ctx.fillStyle = '#8899aa';
  ctx.fillText('Kitchen', 30, 290);
}

/* ========= UI actions ========= */
$('startBtn').addEventListener('click', ()=>{
  if(!state.running){
    state.running = true;
    showMsg('Day started.');
    // each day resets a bit
    WORLD.customers = [];
    WORLD.spawnTimer = 0;
  } else {
    // end day -> process earnings & next day
    endDay();
  }
  $('startBtn').textContent = state.running ? 'End Day' : 'Start Day';
  save();
});
$('pauseBtn').addEventListener('click', ()=>{
  state.pause = !state.pause;
  $('pauseBtn').textContent = state.pause ? 'Resume' : 'Pause';
});
$('savePrice').addEventListener('click', ()=>{
  const v = Math.max(100, Number(priceInput.value) || 600);
  state.price = v;
  showMsg(`Price set to ¥${v}`);
  save(); updateHUD();
});
document.querySelectorAll('.hireBtn').forEach(b=>{
  b.addEventListener('click', ()=>{
    const role = b.dataset.role;
    const cost = Number(b.dataset.cost);
    if(state.money < cost) { showMsg('Not enough money'); return; }
    state.money -= cost;
    state.staff[role] += 1;
    showMsg(`${role} hired!`);
    save(); updateHUD();
  });
});
$('buyIngr').addEventListener('click', ()=>{
  if(state.money < 500){ showMsg('Not enough'); return; }
  state.money -= 500;
  state.ingredients += 5;
  showMsg('Ingredients bought.');
  save(); updateHUD();
});
$('upgradeKitchen').addEventListener('click', ()=>{
  if(state.money < 4000){ showMsg('Not enough'); return; }
  state.money -= 4000;
  state.kitchenLevel += 1;
  showMsg('Kitchen upgraded!');
  save(); updateHUD();
});

/* ========= end of day processing ========= */
function endDay(){
  // day summary and scaling
  state.running = false;
  // reputation influences next day customers; provide simple profit/loss
  const rent = 300;
  state.money -= rent;
  state.reputation += (state.served * 0.02);
  state.day += 1;
  showMsg(`Day ${state.day-1} ended. Rent ¥${rent} paid.`);
  // small random event chance
  if(Math.random() < 0.12){
    const r = Math.random();
    if(r<0.5){ state.reputation -= 3; showMsg('Bad review! Reputation down.'); }
    else { state.reputation += 4; showMsg('Local blogger loved you! Reputation up.'); }
  }
  // reset served daily (could be kept if you want persistent)
  state.served = 0;
  save(); updateHUD();
}

/* ========= small UI helper ========= */
let msgTimer = null;
function showMsg(t){
  msgEl.textContent = t;
  if(msgTimer) clearTimeout(msgTimer);
  msgTimer = setTimeout(()=> msgEl.textContent = '', 3000);
}

/* ========= initial hints ========= */
showMsg('Click customers to seat them. Hire staff to automate tasks.');

/* ========= developer extension notes ========= */
/*
 - Add persistent database: connect Supabase to save global leaderboards.
 - Make dishes variety: different ingredient consumption & prices.
 - Add staff salaries as discrete monthly pay, not continuous drain.
 - Add animations / sprites for better visuals.
 - Add sound effects and mobile touch optimizations.
*/
