// Pages served by the trainer. Plain HTML/CSS/JS, ASCII only, kept small.
#pragma once

namespace web {

static const char STYLE[] = R"CSS(
*{box-sizing:border-box}body{margin:0;font:16px/1.4 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;
background:#0b1530;color:#fff}main{max-width:640px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:4px 0 12px}h2{font-size:16px;margin:20px 0 8px;color:#ffd400;text-transform:uppercase;letter-spacing:1px}
.card{background:#16244a;border:1px solid #33467a;border-radius:12px;padding:14px;margin:10px 0}
.muted{color:#9fb0d8;font-size:14px}.ok{color:#6ff0ad}.warn{color:#ffd400}.bad{color:#ff8080}
a.btn,button{display:inline-block;background:#ffd400;color:#111;border:0;border-radius:8px;padding:10px 16px;
font-weight:800;font-size:15px;text-decoration:none;cursor:pointer}button.ghost{background:transparent;color:#fff;border:1px solid #5a6a94}
input,select{background:#0b1530;color:#fff;border:1px solid #33467a;border-radius:6px;padding:7px;font:inherit}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:5px 4px;text-align:right}td:first-child,th:first-child{text-align:left}
th{color:#9fb0d8;font-weight:600}tr+tr td{border-top:1px solid #22356a}
.bar{height:10px;border-radius:5px;background:#22356a;overflow:hidden}.bar i{display:block;height:100%}
.stat{display:grid;grid-template-columns:44px 36px 1fr 70px;gap:8px;align-items:center;margin:6px 0}
.day{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:6px 0}.day b{width:38px}
.big{font-size:40px;font-weight:900;color:#ffd400;line-height:1}
)CSS";

// Shown after the game navigates to http://<trainer>/send#<payload>.
static const char SEND_PAGE[] = R"HTML(<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Trainer</title>
<link rel="stylesheet" href="/style.css"></head><body><main>
<h1>Soccer Trainer</h1><div class="card"><p id="msg">Sending player...</p><p id="sub" class="muted"></p>
<p><a class="btn" id="back" href="#" style="display:none">Back to the game</a></p></div>
<script>
function dec(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var b=atob(s),u=new Uint8Array(b.length);
for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new TextDecoder().decode(u);}
var code=location.hash.slice(1),ret='',msg=document.getElementById('msg'),sub=document.getElementById('sub'),back=document.getElementById('back');
try{var j=JSON.parse(dec(code));if(/^https?:\/\//.test(j.ret||''))ret=j.ret;}catch(e){}
if(ret){back.href=ret;back.style.display='inline-block';}
if(!code){msg.textContent='No player was sent. Open Trainer in the game and press SEND.';}
else fetch('/api/receive',{method:'POST',headers:{'Content-Type':'text/plain'},body:code})
.then(function(r){return r.json();}).then(function(r){
if(!r.ok){msg.textContent='That did not work: '+(r.error||'unknown error');msg.className='bad';return;}
if(r.status==='pending'){msg.textContent=r.name+' is waiting.';sub.textContent='Tap YES on the trainer to swap players.';msg.className='warn';return;}
msg.textContent=r.name+(r.status==='merged'?' is up to date on the trainer!':' is on the trainer!');msg.className='ok';
if(ret){sub.textContent='Going back to the game...';setTimeout(function(){location.href=ret;},3000);}
}).catch(function(){msg.textContent='Could not reach the trainer. Is it still on the LINK screen?';msg.className='bad';});
</script></main></body></html>)HTML";

// Parent dashboard at http://soccer-trainer.local/
static const char DASHBOARD_PAGE[] = R"HTML(<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Trainer dashboard</title>
<link rel="stylesheet" href="/style.css"></head><body><main>
<h1 id="title">Soccer Trainer</h1>
<div class="card" id="player"><p class="muted">Loading...</p></div>
<h2>Last two weeks</h2><div class="card"><table id="hist"></table></div>
<h2>Weekly training plan</h2><div class="card"><p class="muted">Up to three drills a day. Ticking one off on the trainer gives +50% XP.</p>
<div id="plan"></div><p><button id="savePlan">Save plan</button> <button class="ghost" id="resetPlan">Use default plan</button>
<span id="planMsg" class="muted"></span></p></div>
<h2>Settings</h2><div class="card"><p><label>Coach name <input id="coach" maxlength="20"></label></p>
<p><label><input type="checkbox" id="sound"> Sound on</label></p><p><button id="saveSet">Save settings</button>
<span id="setMsg" class="muted"></span></p></div>
<script>
var DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],COL=['#3b9eff','#ff6b3d','#2bd4a0','#b77dff'],S=null;
function $(i){return document.getElementById(i);}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function post(url,obj){return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)}).then(function(r){return r.json();});}
function fmtDay(k){if(!k)return'today';var s=String(k);return s.slice(4,6)+'/'+s.slice(6,8);}
function render(){
 $('title').textContent=S.coach?('Coach '+S.coach+"'s trainer"):'Soccer Trainer';
 var p=S.player,h='';
 if(!p){h='<p>No player yet. In the game, open <b>Trainer</b> and press <b>SEND</b>.</p>';}
 else{h='<div style="display:flex;justify-content:space-between;align-items:center"><div><b style="font-size:20px">'+esc(p.name)+'</b><div class="muted">'+esc(p.pos)+' '+esc(p.club)+'</div></div><div class="big">'+p.ovr+'</div></div>';
  p.stats.forEach(function(s,i){var f=s.value>=99?100:Math.round(100*s.xp/s.next);
   h+='<div class="stat"><b style="color:'+COL[i]+'">'+s.name+'</b><b>'+s.value+'</b><div class="bar"><i style="width:'+f+'%;background:'+COL[i]+'"></i></div><span class="muted">+'+(s.value-s.base)+' trained</span></div>';});
  h+='<p class="muted">Since arriving: '+p.steps.toLocaleString()+' steps, '+p.runMin+' min running, '+p.sessions+' sessions, '+p.games+' games.</p>';}
 h+='<p class="muted">Energy '+S.energy+'/10 &middot; Streak '+S.streak+' days</p>';
 $('player').innerHTML=h;
 var t='<tr><th>Day</th><th>Steps</th><th>Run</th><th>Training</th><th>Games</th><th>XP</th></tr>';
 S.days.forEach(function(d){t+='<tr><td>'+fmtDay(d.key)+'</td><td>'+d.steps.toLocaleString()+'</td><td>'+d.runMin+'m</td><td>'+d.sessionMin+'m</td><td>'+d.games+'</td><td>'+d.xp+'</td></tr>';});
 $('hist').innerHTML=t;
 var opts='<option value="">-</option>'+S.activities.map(function(a){return'<option value="'+a.id+'">'+esc(a.name)+'</option>';}).join('');
 var pl='';for(var d=0;d<7;d++){pl+='<div class="day"><b>'+DAYS[d]+'</b>';for(var i=0;i<3;i++){var dr=(S.program[d]||[])[i]||{};
  pl+='<select data-d="'+d+'" data-i="'+i+'">'+opts+'</select><input type="number" min="5" max="180" step="5" style="width:64px" data-m="'+d+'-'+i+'" value="'+(dr.m||'')+'">';
  }pl+='</div>';}
 $('plan').innerHTML=pl;
 document.querySelectorAll('#plan select').forEach(function(sel){var dr=(S.program[sel.dataset.d]||[])[sel.dataset.i];if(dr)sel.value=dr.t;});
 $('coach').value=S.coach||'';$('sound').checked=!!S.sound;
}
function load(){fetch('/api/state').then(function(r){return r.json();}).then(function(s){S=s;render();});}
$('savePlan').onclick=function(){var days=[];for(var d=0;d<7;d++){var day=[];for(var i=0;i<3;i++){
 var t=document.querySelector('select[data-d="'+d+'"][data-i="'+i+'"]').value,m=+document.querySelector('input[data-m="'+d+'-'+i+'"]').value;
 if(t&&m>0)day.push({t:t,m:m});}days.push(day);}
 post('/api/program',{days:days}).then(function(r){$('planMsg').textContent=r.ok?'Saved':'Could not save';load();});};
$('resetPlan').onclick=function(){post('/api/program',{reset:true}).then(function(){$('planMsg').textContent='Default plan restored';load();});};
$('saveSet').onclick=function(){post('/api/settings',{coach:$('coach').value,sound:$('sound').checked}).then(function(r){$('setMsg').textContent=r.ok?'Saved':'Could not save';load();});};
post('/api/time',{now:Date.now(),tz:-new Date().getTimezoneOffset()});
load();
</script></main></body></html>)HTML";

// Setup hotspot page. %NETWORKS% becomes <option> tags.
static const char PORTAL_HEAD[] = R"HTML(<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Trainer Wi-Fi setup</title>
<style>%STYLE%</style></head><body><main>
<h1>Soccer Trainer Wi-Fi</h1><div class="card"><p class="muted">Pick the Wi-Fi the game computer uses. The trainer only turns Wi-Fi on while it shows the LINK screen.</p>
<form method="post" action="/save">
<p><label>Network<br><select name="ssid" style="width:100%">)HTML";

static const char PORTAL_TAIL[] = R"HTML(</select></label></p>
<p><label>Or type it<br><input name="ssid2" style="width:100%" placeholder="Network name"></label></p>
<p><label>Password<br><input name="pass" type="password" style="width:100%"></label></p>
<p><label>Coach name<br><input name="coach" maxlength="20" style="width:100%" placeholder="Huxley"></label></p>
<p><button type="submit">Save and connect</button> <a class="btn" style="background:#22356a;color:#fff" href="/">Rescan</a></p>
</form></div></main></body></html>)HTML";

}  // namespace web
