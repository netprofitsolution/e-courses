(function(){
  const names=['926063731','1003551642','1079105274','110311300','1208722671','1220047910','1419615851','1426081061','1561767959','1639653882','1982097858','2056109421','209653343','2216992780','2227543623','2511280291','2564975765','2748608017','2770086488','2818103284','2829771354','2867730893','2909875011','2925656856','2969722917','3083429834','3216176568','3433954743','3850511076','4155839300','4166537282','4289469741','4292398736','79313415'];
  fetch(`sound/auto_narrator/n2_${names[0]}.mp3`,{cache:'force-cache'}).catch(()=>{});
  window.addEventListener('room:ready',()=>setTimeout(()=>warm(names.slice(1)),1500),{once:true});
  function warm(queue){let next=0;const worker=async()=>{while(next<queue.length){const name=queue[next++];try{await fetch(`sound/auto_narrator/n2_${name}.mp3`,{cache:'force-cache'});}catch(_){}}};Promise.all([worker(),worker()]);}
})();
