(function(){
  const params=new URLSearchParams(location.search), course=params.get('course')||'unknown', key='scorm12:'+course+':';
  let initialized=false,lastError='0'; const defaults={'cmi.core.student_id':'demo-learner','cmi.core.student_name':'Demo Learner','cmi.core.lesson_status':'not attempted','cmi.core.lesson_location':'','cmi.core.score.raw':'','cmi.core.score.min':'','cmi.core.score.max':'','cmi.suspend_data':'','cmi.launch_data':'','cmi.core.credit':'no-credit','cmi.core.lesson_mode':'normal','cmi.core.entry':'ab-initio','cmi.core.exit':'','cmi.core.total_time':'0000:00:00.00','cmi.core.session_time':'0000:00:00.00'};
  const get=k=>{const v=localStorage.getItem(key+k);return v===null?(defaults[k]??''):v}; const set=(k,v)=>{try{localStorage.setItem(key+k,String(v));return true}catch(e){lastError='101';return false}};
  window.API={
    LMSInitialize(){initialized=true;lastError='0';if(get('cmi.core.lesson_location')||get('cmi.suspend_data'))defaults['cmi.core.entry']='resume';window.dispatchEvent(new CustomEvent('scormchange'));return 'true'},
    LMSFinish(){initialized=false;lastError='0';window.dispatchEvent(new CustomEvent('scormchange'));return 'true'},
    LMSGetValue(k){if(!initialized){lastError='301';return ''}lastError='0';return get(k)},
    LMSSetValue(k,v){if(!initialized){lastError='301';return 'false'}lastError='0';const ok=set(k,v);window.dispatchEvent(new CustomEvent('scormchange',{detail:{key:k,value:v}}));return ok?'true':'false'},
    LMSCommit(){lastError='0';return 'true'},LMSGetLastError(){return lastError},
    LMSGetErrorString(e){return {'0':'No error','101':'General exception','201':'Invalid argument','301':'Not initialized','401':'Not implemented error'}[String(e)]||'Unknown error'},
    LMSGetDiagnostic(e){return this.LMSGetErrorString(e)}
  };
  window.SCORM_DEMO={course,get,clear(){Object.keys(localStorage).filter(k=>k.startsWith(key)).forEach(k=>localStorage.removeItem(k))}};
})();
