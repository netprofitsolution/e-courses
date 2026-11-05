(function(){
  const names=['3301552368','1113782624','1210547275','1376483923','142950700','1430442996','1564618168','1806406953','183876174','2155122985','2200408891','2287064355','2297700726','2405283649','2432913731','2566745998','2636010873','2648097581','274417943','3193631286','3223480205','3291440308','3419131484','3433679996','3716056391','3886609572','560555282','612319687','685562019','721115666','751803498','752463240','915228093'];
  fetch(`sound/auto_narrator/n2_${names[0]}.mp3`,{cache:'force-cache'}).catch(()=>{});
  window.addEventListener('room:ready',()=>setTimeout(()=>warm(names.slice(1)),1500),{once:true});
  function warm(queue){let next=0;const worker=async()=>{while(next<queue.length){const name=queue[next++];try{await fetch(`sound/auto_narrator/n2_${name}.mp3`,{cache:'force-cache'});}catch(_){}}};Promise.all([worker(),worker()]);}
})();
