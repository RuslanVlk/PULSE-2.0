// PULSE 2.3 — display/news normalization helpers
(function(){
  "use strict";
  const clean=(s="")=>String(s).replace(/https?:\/\/\S+/gi," ").replace(/www\.\S+/gi," ").replace(/\s+/g," ").trim();
  const norm=(s="")=>clean(s).toLowerCase().replace(/ё/g,"е").replace(/[^\p{L}\p{N}\s]/gu," ").replace(/\s+/g," ").trim();
  function russianRatio(s=""){const t=String(s).replace(/\s/g,"");if(!t)return 0;const c=(t.match(/[А-Яа-яЁё]/g)||[]).length;return c/t.length}
  function isRussianEvent(e){return russianRatio(e?.title||"")>=0.18||russianRatio(e?.summary||"")>=0.12||(e?.articles||[]).some(a=>russianRatio(a?.title||"")>=0.18)}
  function localizedTitle(e){if(russianRatio(e?.title||"")>=0.18)return clean(e.title);const a=(e?.articles||[]).find(x=>russianRatio(x?.title||"")>=0.18);return clean(a?.title||e?.title||"Новость")||"Новость"}
  function localizedSummary(e){if(russianRatio(e?.summary||"")>=0.12)return clean(e.summary);const a=(e?.articles||[]).find(x=>russianRatio(x?.summary||"")>=0.12);return clean(a?.summary||e?.summary||"Свежая информация по событию.")||"Свежая информация по событию."}
  function stripDisplayNoise(s="",title=""){let t=clean(s);if(title&&norm(t)===norm(title))return "";t=t.replace(/^(?:reuters|ура\.ру|ria novosti|рбк|интерфакс|тасс)\s*[:—-]\s*/i,"");return clean(t)}
  function normalizeEvent(e){if(!e)return e;return {...e,title:localizedTitle(e),summary:stripDisplayNoise(localizedSummary(e),localizedTitle(e))||"Свежая информация по событию."}}
  window.PULSENormalizer={clean,norm,russianRatio,isRussianEvent,localizedTitle,localizedSummary,stripDisplayNoise,normalizeEvent};
})();
