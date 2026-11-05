const cfg=window.PORTFOLIO_CONFIG;
document.querySelector('#brandName').textContent=cfg.brand.name;
document.querySelector('#eyebrow').textContent=cfg.brand.eyebrow;
document.querySelector('#headline').textContent=cfg.brand.headline;
document.querySelector('#intro').textContent=cfg.brand.introduction;

const grid=document.querySelector('#courseGrid');
cfg.courses.forEach(c=>{
  const card=document.createElement('article');
  card.className='course-card';
  card.innerHTML=`<a class="course-image" href="player.html?course=${encodeURIComponent(c.id)}" aria-label="Play ${c.title}"><img src="${c.thumbnail}" alt="" loading="lazy"><span class="play" aria-hidden="true">▶</span><span class="module">Project ${c.number}</span></a><div class="course-body"><p class="meta">${c.standard} · Interactive demo</p><h3>${c.title}</h3><p>${c.description}</p><a class="text-link" href="player.html?course=${encodeURIComponent(c.id)}">Play the course <span>↗</span></a></div>`;
  grid.append(card);
});

const email=document.querySelector('#contactLink');
email.href=`mailto:${cfg.contact.email}?subject=${encodeURIComponent(cfg.contact.subject)}`;
const phone=document.querySelector('#phoneLink');
phone.href=`tel:${cfg.contact.phoneHref}`;
phone.textContent=cfg.contact.phoneDisplay;
