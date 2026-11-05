(function(){
  const names=['3633157798','1067670621','1346283004','1496794925','15188706','1556121263','1567764639','1685574543','1691598415','1921184108','1985033761','2092728361','2105341026','216002432','2408571862','241982474','2433257836','2555201982','2673486300','2911400658','3053358711','3093695251','3445509318','3486592864','3504114588','3543922127','3632243251','3738591194','4065829345','4128600785','60233393','980813302'];
  fetch(`sound/auto_narrator/n2_${names[0]}.mp3`,{cache:'force-cache'}).catch(()=>{});
  window.addEventListener('room:ready',()=>setTimeout(()=>warm(names.slice(1)),1500),{once:true});
  function warm(queue){let next=0;const worker=async()=>{while(next<queue.length){const name=queue[next++];try{await fetch(`sound/auto_narrator/n2_${name}.mp3`,{cache:'force-cache'});}catch(_){}}};Promise.all([worker(),worker()]);}
})();
