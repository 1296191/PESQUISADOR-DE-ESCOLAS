const map=L.map('map').setView([-19.9191,-43.9386],11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map);

let schools=[],origin=null,originMarker=null,schoolMarkers=[],routeLayer=null;
const $=id=>document.getElementById(id);

fetch('data/escolas.geojson')
  .then(r=>{if(!r.ok) throw Error('HTTP '+r.status); return r.json()})
  .then(d=>{schools=d.features||[]; setStatus(`${schools.length} escolas carregadas.`)})
  .catch(e=>setStatus('Não foi possível carregar os dados das escolas.'));

function setStatus(t){$('status').textContent=t}
function hav(a,b){const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLon=(b.lon-a.lon)*Math.PI/180,x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))}
async function geocode(q){const u='https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&bounded=1&viewbox=-44.15,-19.75,-43.80,-20.10&q='+encodeURIComponent(q+', Belo Horizonte, MG, Brasil');const r=await fetch(u,{headers:{'Accept-Language':'pt-BR'}});if(!r.ok)throw Error('Falha ao localizar o endereço.');const d=await r.json();if(!d.length)throw Error('Endereço não encontrado em Belo Horizonte.');return {lat:+d[0].lat,lon:+d[0].lon,label:d[0].display_name}}
function clearMap(){schoolMarkers.forEach(m=>map.removeLayer(m));schoolMarkers=[];if(routeLayer){map.removeLayer(routeLayer);routeLayer=null}}
function mode(){return $('mode').value}
function candidates(){const rede=$('rede').value,etapa=$('etapa').value;return schools.filter(f=>{const p=f.properties||{};return(!rede||p.rede===rede)&&(!etapa||p.etapa===etapa)}).map(f=>{const [lon,lat]=f.geometry.coordinates;return{f,lon,lat,d:hav(origin,{lat,lon})}}).sort((a,b)=>a.d-b.d).slice(0,10)}
function color(rede){return{Municipal:'#16834e',Estadual:'#1769aa',Federal:'#7b3fa0',Privada:'#dc7416'}[rede]||'#006b3f'}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function attrLabel(k){return({nome:'Nome da escola',endereco:'Endereço',bairro:'Bairro',regional:'Regional',rede:'Rede de ensino',etapa:'Etapa de ensino'}[k]||k).replaceAll('_',' ')}
function popupContent(p){
  const preferred=['nome','endereco','bairro','regional','rede','etapa'];
  const keys=[...preferred,...Object.keys(p).filter(k=>!preferred.includes(k))];
  const rows=keys.filter(k=>p[k]!==null&&p[k]!==undefined&&p[k]!=='').map(k=>`<tr><th>${esc(attrLabel(k))}</th><td>${esc(p[k])}</td></tr>`).join('');
  return `<div class="school-popup"><h3>${esc(p.nome||'Escola')}</h3><div class="popup-title">Tabela de atributos</div><table class="attr-table"><tbody>${rows||'<tr><td colspan="2">Sem atributos disponíveis.</td></tr>'}</tbody></table></div>`;
}
async function routes(){
  if(!origin)return;
  clearMap();
  if(originMarker)map.removeLayer(originMarker);
  originMarker=L.marker([origin.lat,origin.lon]).addTo(map).bindPopup('<b>Origem da pesquisa</b><br>'+esc(origin.label)).openPopup();
  const c=candidates();
  if(!c.length){render([]);return}
  setStatus('Calculando o tempo de deslocamento…');
  const profile=mode()==='foot'?'driving':'driving';
  const coords=[`${origin.lon},${origin.lat}`,...c.map(x=>`${x.lon},${x.lat}`)].join(';');
  const u=`https://router.project-osrm.org/table/v1/${profile}/${coords}?sources=0&destinations=${c.map((_,i)=>i+1).join(';')}&annotations=duration,distance`;
  try{
    const r=await fetch(u),d=await r.json();
    if(d.code!=='Ok')throw Error();
    const items=c.map((x,i)=>({...x,duration:d.durations[0][i],distance:d.distances[0][i]})).sort((a,b)=>a.duration-b.duration);
    render(items);setStatus(`${items.length} escolas com tempo estimado.`)
  }catch(e){setStatus('O serviço de rota não respondeu. Exibindo as escolas por distância.');render(c)}
}
function render(items){
  $('resultTitle').textContent=origin?`${items.length} opções próximas`:'Informe seu endereço';
  $('results').innerHTML='';
  if(!items.length){$('results').innerHTML='<div class="empty"><strong>Nenhuma escola encontrada</strong><p>Tente remover algum filtro.</p></div>';return}
  const bounds=L.latLngBounds([[origin.lat,origin.lon]]);
  items.forEach(x=>{
    const p=x.f.properties||{};const [lon,lat]=x.f.geometry.coordinates;
    const m=L.circleMarker([lat,lon],{radius:8,color:'#fff',weight:2,fillColor:color(p.rede),fillOpacity:.95}).addTo(map);
    m.bindTooltip(p.nome||'Escola');
    m.bindPopup(popupContent(p),{maxWidth:420,minWidth:300,autoPan:true});
    m.on('click',()=>select(x));
    schoolMarkers.push(m);bounds.extend([lat,lon]);
    const card=document.createElement('article');card.className='school';
    const min=x.duration!=null?Math.max(1,Math.round(x.duration/60))+' min':'—';
    const dist=x.distance!=null?(x.distance/1000).toFixed(1)+' km':x.d.toFixed(1)+' km';
    card.innerHTML=`<h3>${esc(p.nome||'Escola sem nome')}</h3><div class="address">📍 ${esc(p.endereco||'Endereço não informado')}${p.bairro?' • '+esc(p.bairro):''}</div><div class="time"><strong>${min}</strong><span>${mode()==='foot'?'a pé':'de carro'}</span></div><div class="meta"><span class="badge">${esc(p.rede||'Rede não informada')}</span><span>${dist}</span><span>${esc(p.etapa||'')}</span></div>`;
    card.onclick=()=>select(x);$('results').appendChild(card)
  });
  map.fitBounds(bounds.pad(.12))
}
async function select(x){
  const [lon,lat]=x.f.geometry.coordinates,p=x.f.properties||{};
  const marker=schoolMarkers.find(m=>{const ll=m.getLatLng();return Math.abs(ll.lat-lat)<1e-9&&Math.abs(ll.lng-lon)<1e-9});
  if(marker)marker.openPopup();
  map.setView([lat,lon],15);
  const u=`https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${lon},${lat}?overview=full&geometries=geojson&steps=false`;
  try{
    const r=await fetch(u),d=await r.json();if(d.code!=='Ok')throw Error();
    if(routeLayer)map.removeLayer(routeLayer);
    routeLayer=L.geoJSON(d.routes[0].geometry,{style:{weight:5,color:'#006b3f',opacity:.85}}).addTo(map);
    if(marker)marker.setPopupContent(popupContent(p)+`<div class="route-summary"><strong>${Math.max(1,Math.round(d.routes[0].duration/60))} min</strong> ${mode()==='foot'?'a pé':'de carro'} · ${(d.routes[0].distance/1000).toFixed(1)} km</div>`).openPopup();
  }catch(e){if(marker)marker.setPopupContent(popupContent(p)).openPopup()}
}
$('addressForm').onsubmit=async e=>{e.preventDefault();try{setStatus('Localizando endereço…');origin=await geocode($('address').value.trim());$('mapOrigin').textContent=origin.label.split(',').slice(0,3).join(', ');map.setView([origin.lat,origin.lon],14);await routes()}catch(e){setStatus(e.message)}};
$('geoBtn').onclick=()=>{if(!navigator.geolocation)return setStatus('Seu navegador não suporta localização.');setStatus('Obtendo sua localização…');navigator.geolocation.getCurrentPosition(async p=>{origin={lat:p.coords.latitude,lon:p.coords.longitude,label:'Sua localização atual'};$('mapOrigin').textContent='Sua localização atual';await routes()},()=>setStatus('Não foi possível obter sua localização.'))};
['mode','rede','etapa'].forEach(id=>$(id).onchange=()=>origin&&routes());
