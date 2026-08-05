/* Campaign OS — Login: handler de Google Sign-In
   Extraído de index.html. Script CLÁSICO a propósito (NO type="module"):
   el HTML llama estas funciones desde atributos onclick/onchange, que solo
   resuelven contra el scope global. El orden de carga en index.html replica
   el orden original de ejecución y no debe alterarse. */

(function(){
  var shell=document.getElementById('lrShell');
  if(shell && !(window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches)){
    requestAnimationFrame(function(){shell.classList.add('lr-in');});
    setTimeout(function(){shell.classList.remove('lr-in');},2200);
  }
  var tags=[].slice.call(document.querySelectorAll('#loginScreen .lr-tagline'));
  var ti=0;
  if(tags.length>1){setInterval(function(){tags[ti].classList.remove('on');ti=(ti+1)%tags.length;tags[ti].classList.add('on');},3800);}
})();
function lrGoogleLogin(btn){
  if(btn.classList.contains('lr-loading'))return;
  btn.classList.add('lr-loading');
  Promise.resolve().then(function(){ return (typeof loginGoogle==='function')?loginGoogle():null; })
    .catch(function(){})
    .finally(function(){ setTimeout(function(){btn.classList.remove('lr-loading');},500); });
}

