// PULSE 2.3 — resilient source-image loader
(function(){
  "use strict";
  const fallbackByTopic={};
  function imageUrl(raw){const u=String(raw||"");if(!u)return "";if(u.startsWith("/"))return u;return "/api/image?url="+encodeURIComponent(u)}
  function imgFor(e){return e?.image||e?.thumbnail||e?.articles?.find(a=>a?.image||a?.thumbnail)?.image||e?.articles?.find(a=>a?.image||a?.thumbnail)?.thumbnail||""}
  function safeImage(e){const u=imageUrl(imgFor(e));return u.replace(/"/g,"&quot;")}
  function prefetch(items=[]){items.slice(0,10).forEach(e=>{const u=imageUrl(imgFor(e));if(u){const im=new Image();im.src=u}})}
  function bindImageErrors(root=document){root.querySelectorAll("img[data-direct], img.cardimg, img.detail-image, img.result-image, img.saved-image, img.time-image").forEach(img=>{if(img.dataset.imageBound)return;img.dataset.imageBound="1";img.addEventListener("error",()=>{const direct=img.dataset.direct||img.dataset.source||"";if(direct&&!img.dataset.triedDirect){img.dataset.triedDirect="1";img.src=direct.startsWith("/")?direct:imageUrl(direct);return;}const holder=img.closest(".resultimg,.timepoint,.detailhero,.card");if(holder){img.remove();const f=document.createElement("div");f.className="missing-image";f.innerHTML="<span>Изображение источника недоступно</span>";holder.appendChild(f)}else img.style.display="none";},{once:false})})}
  window.PULSEImages={imageUrl,imgFor,safeImage,prefetch,bindImageErrors,fallbackByTopic};
})();
