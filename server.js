import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
function loadEnv(){try{const raw=require?"":null}catch{} }
try{const raw=await fs.readFile(path.join(__dirname,'.env'),'utf8');for(const line of raw.split(/\r?\n/)){const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'')}}catch{}

const PORT=Number(process.env.PORT||3000);
const TELEGRAM_BOT_TOKEN=String(process.env.TELEGRAM_BOT_TOKEN||'').trim();
const TELEGRAM_WEBAPP_URL=String(process.env.TELEGRAM_WEBAPP_URL||'').trim();
let TELEGRAM_BOT_USERNAME=String(process.env.TELEGRAM_BOT_USERNAME||'').trim().replace(/^@/,'');
const ALLOW_LOCAL_DEV=process.env.ALLOW_LOCAL_DEV!=='false';
const TELEGRAM_AUTH_MAX_AGE=Number(process.env.TELEGRAM_AUTH_MAX_AGE||86400);
const REFRESH_MINUTES=Number(process.env.REFRESH_MINUTES||10);
const MAX_PER_FEED=Math.max(10,Math.min(60,Number(process.env.MAX_ITEMS_PER_FEED||28)));
const DB_FILE=path.join(__dirname,'data','pulse.json');
const PUBLIC_DIR=path.join(__dirname,'public');
const cache={events:[],updatedAt:null,sourceStatus:[],error:null};
const articleMetaCache=new Map();
let db={users:{},saved:{},savedEvents:{},likes:{},hidden:{},activity:{},sessions:[]};
let writeTimer=null;

const BASE_FEEDS=[
 ['Google News RU','https://news.google.com/rss?hl=ru&gl=RU&ceid=RU:ru'],
 ['Google News KZ','https://news.google.com/rss?hl=ru&gl=KZ&ceid=KZ:ru'],
 ['Google News World','https://news.google.com/rss?hl=ru&gl=RU&ceid=RU:ru'],
 ['Business','https://news.google.com/rss/search?q=economy%20business%20finance&hl=ru&gl=RU&ceid=RU:ru'],
 ['Technology','https://news.google.com/rss/search?q=technology%20AI%20science%20cybersecurity&hl=ru&gl=RU&ceid=RU:ru'],
 ['World','https://news.google.com/rss/search?q=world%20geopolitics%20conflict%20international&hl=ru&gl=RU&ceid=RU:ru'],
 ['Auto','https://news.google.com/rss/search?q=automotive%20cars%20EV%20BMW%20Mercedes%20Tesla&hl=ru&gl=RU&ceid=RU:ru']
];
const TOPIC_QUERIES={
 'Новости':'news breaking current events', 'Бизнес':'business economy companies markets', 'Технологии':'technology AI software cybersecurity gadgets', 'Авто':'cars automotive EV BMW Mercedes Tesla', 'Кино и сериалы':'movies cinema series streaming', 'Спорт':'sports football basketball tennis hockey', 'Финансы':'finance banks currency markets investing', 'Локальное':'local city events services transport', 'Путешествия':'travel tourism airlines hotels', 'Наука':'science space research climate', 'Стиль жизни':'lifestyle food fashion culture', 'Парфюмерия':'perfume fragrance beauty', 'Политика':'politics government elections geopolitics', 'Игры':'gaming esports PlayStation Xbox PC', 'Криптовалюты':'crypto bitcoin ethereum blockchain', 'Мир':'world international geopolitics'
};
const TOPIC_KEYWORDS={
 'Новости':['новости','событие','произошел','произошла','сообщил','сообщила','произошло','latest','news'],
 'Бизнес':['бизнес','компания','рынок','акции','экономика','финансы','выручка','прибыль','инвест','стартап','банк','business','markets','company','stocks'],
 'Технологии':['технолог','ии','искусственный интеллект','нейросет','ai','software','приложен','смартфон','кибер','робот','tech'],
 'Авто':['авто','автомобил','машин','электромобил','tesla','bmw','mercedes','toyota','volkswagen','car','cars','ev'],
 'Кино и сериалы':['кино','фильм','сериал','актер','актриса','netflix','hbo','movie','series'],
 'Спорт':['спорт','футбол','баскетбол','теннис','хоккей','матч','турнир','спортсмен','football','basketball','tennis'],
 'Финансы':['финанс','курс','доллар','евро','рубл','ставка','инфляц','биржа','акции','облигац','finance','market'],
 'Локальное':['актау','актобе','астана','алматы','город','область','район','местн','транспорт','local'],
 'Путешествия':['путешеств','туризм','отель','авиарейс','аэропорт','travel','tourism','hotel'],
 'Наука':['наук','исследован','космос','учен','исследователь','science','space','research'],
 'Стиль жизни':['образ жизни','еда','рецепт','мода','культура','лайфстайл','lifestyle','fashion'],
 'Парфюмерия':['парфюм','аромат','духи','fragrance','perfume'],
 'Политика':['политик','правительств','президент','выбор','закон','депутат','санкц','politics','government'],
 'Игры':['игр','гейм','киберспорт','playstation','xbox','steam','gaming','esports'],
 'Криптовалюты':['криптовалют','биткоин','bitcoin','ethereum','ether','blockchain','web3','crypto','defi'],
 'Мир':['мир','международ','войн','конфликт','сша','европ','украин','израил','international','world']
};
const CATEGORY_QUERIES={
 'Новости':'последние новости сегодня события',
 'Бизнес':'бизнес экономика компании рынки акции',
 'Технологии':'технологии искусственный интеллект нейросети кибербезопасность гаджеты',
 'Авто':'автомобили авто электромобили Tesla BMW Mercedes',
 'Кино и сериалы':'кино фильмы сериалы Netflix премьеры',
 'Спорт':'спорт футбол хоккей баскетбол теннис',
 'Финансы':'финансы банки курс доллара инфляция акции рынки',
 'Локальное':'Казахстан города события происшествия',
 'Путешествия':'путешествия туризм авиарейсы отели',
 'Наука':'наука космос исследования ученые',
 'Стиль жизни':'образ жизни мода еда культура',
 'Парфюмерия':'парфюмерия ароматы духи',
 'Политика':'политика правительство президент закон выборы',
 'Игры':'игры гейминг киберспорт PlayStation Xbox PC',
 'Криптовалюты':'криптовалюты биткоин Ethereum blockchain',
 'Мир':'мир международные новости геополитика конфликты'
};
const IMPORTANT=['война','землетряс','катастроф','пожар','авария','взрыв','теракт','санкц','закон','указ','выбор','ставк','инфляц','дефолт','банкрот','запрет','разреш','введен','отмен','обруш','погиб','пострад','угроз','эвакуац','кибератак','утечк','взлом','срочно','breaking'];
const ACTION=['перекрыт','отключ','эвакуац','срок','регистрац','оплат','тариф','ваканс','дедлайн','запрет'];
const POLITICAL_WORDS=['политик','президент','правительств','министр','депутат','выбор','парламент','госдум','санкц','дипломат','мид','закон','указ','оппози','парт','кремл','нато','войн','конфликт'];
const INTERESTS=Object.keys(TOPIC_QUERIES);

const nowIso=()=>new Date().toISOString();
function cleanText(s=''){return String(s).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&#x27;/gi,"'").replace(/&#\d+;/g,' ').replace(/\s+/g,' ').trim()}

function stripNewsNoise(s='',source='',title=''){
 let t=cleanText(s);
 t=t.replace(/https?:\/\/\S+/gi,' ').replace(/www\.\S+/gi,' ');
 t=t.replace(/^(?:reuters|ria novosti|рбк|интерфакс|тасс|ura\.ru|lenta\.ru|meduza|forbes|tengrinews|sputnik)\s*[:—-]\s*/i,'');
 t=t.replace(/\s+(?:reuters|ura\.ru|ria novosti|интерфакс|тасс|рбк)\s*[:—-]\s+/gi,' ');
 if(source){
   const re=new RegExp(`(?:\\s*[|—–-]\\s*)?${String(source).replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')}\\s*$`,'i');
   t=t.replace(re,'');
 }
 if(title && norm(t)===norm(title))t='';
 return cleanText(t);
}
function cleanNewsTitle(title='',source=''){
 let t=stripNewsNoise(title,source);
 t=t.replace(/\s*[|—–-]\s*(?:https?:\/\/\S+|www\.\S+)\s*$/i,'');
 if(source){
   const ns=norm(source), n=norm(t);
   if(ns && n.endsWith(` ${ns}`)) t=t.slice(0,Math.max(0,t.length-source.length-1)).trim().replace(/[|—–-]\s*$/,'').trim();
 }
 return cleanText(t).slice(0,320);
}
function splitSentences(s=''){
 return cleanText(s).split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(x=>x.length>35);
}
function editorialSummary(title,description,body='',source=''){
 const candidates=[body,description].map(x=>stripNewsNoise(x,source,title)).filter(x=>x.length>40);
 const sentences=[];
 for(const text of candidates){
   for(const sentence of splitSentences(text)){
     const ns=norm(sentence);
     if(ns===norm(title))continue;
     if(ns.includes('comprehensive up to date news coverage')||ns.includes('aggregated from sources all over the world by google news'))continue;
     if(/^(reuters|ura ru|ria novosti|интерфакс|тасс)\b/i.test(ns))continue;
     if(!sentences.some(x=>similarity(x,sentence)>.82))sentences.push(sentence);
   }
 }
 if(sentences.length)return sentences.slice(0,3).join(' ').slice(0,620);
 const fallback=candidates[0]||'Источник опубликовал сообщение по этой теме. Подробности доступны в оригинальном материале.';
 return fallback.slice(0,620);
}
function editorialWhy(title,summary,topics,geography){
 const t=norm(`${title} ${summary}`);
 if(/атак|ракет|обстрел|войн|конфликт|взрыв|теракт|погиб|ранен|ударил/.test(t)){
   if(/аэропорт|рейс|авиарейс|самолет/.test(t))return 'Атака может повлиять на безопасность и работу аэропорта, а также привести к задержкам или отменам рейсов.';
   return 'Событие может повлиять на безопасность людей, дальнейшее развитие конфликта и решения властей.';
 }
 if(/ставк|инфляц|курс|доллар|рубл|евро|акци|бирж|банк/.test(t))return 'Изменение может отразиться на ценах, стоимости денег или ожиданиях участников рынка.';
 if(/запуст|релиз|обновлен|нейросет|искусственн|чип|смартфон|приложен|кибер/.test(t))return 'Изменение важно тем, что может повлиять на доступность продукта, возможности пользователей или рынок технологий.';
 if(/автомобил|машин|электромобил|tesla|bmw|mercedes/.test(t))return 'Новость может повлиять на модели, цены, поставки или выбор покупателей на автомобильном рынке.';
 if(/матч|турнир|чемпион|гол|команд|спортсмен/.test(t))return 'Результат меняет текущую ситуацию в турнире, команде или карьере участников.';
 if(/авиарейс|аэропорт|отел|туризм|путешеств/.test(t))return 'Изменение может повлиять на поездки, рейсы, цены или планы путешественников.';
 if(/фильм|сериал|кино|премьера/.test(t))return 'Новость влияет на доступность, релиз или интерес к проекту и его создателям.';
 return 'Здесь важен практический эффект события: что изменилось и кого это может затронуть.';
}

function norm(s=''){return cleanText(s).toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim()}
function tokens(s){return new Set(norm(s).split(/\s+/).filter(w=>w.length>3))}
function similarity(a,b){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let same=0;for(const x of A)if(B.has(x))same++;return same/(A.size+B.size-same)}
function hash(s){return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0,20)}
function safeUrl(url){try{const u=new URL(url);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
function sourceName(item,fallback){return cleanText(item.source?.title||item.creator||fallback||'Источник').replace(/\s+-\s+Google News.*$/i,'')||fallback}
function looksUsefulLanguage(text){const v=cleanText(text);if(!v)return true;const c=(v.match(/[А-Яа-яЁё]/g)||[]).length,l=(v.match(/[A-Za-z]/g)||[]).length;return c>=5||l>=5}
function parseDate(s){const d=new Date(s);return Number.isNaN(d.getTime())?new Date():d}

async function loadDb(){try{db=JSON.parse(await fs.readFile(DB_FILE,'utf8'))}catch{await fs.mkdir(path.dirname(DB_FILE),{recursive:true});await persistDb()}db.users??={};db.saved??={};db.savedEvents??={};db.likes??={};db.hidden??={};db.activity??={};db.sessions??=[];db.sharedEvents??={}}
async function persistDb(){await fs.mkdir(path.dirname(DB_FILE),{recursive:true});await fs.writeFile(DB_FILE,JSON.stringify(db,null,2))}
function schedulePersist(){clearTimeout(writeTimer);writeTimer=setTimeout(()=>persistDb().catch(console.error),250)}
function baseLikes(e){const s=String(e?.id||'0');let n=0;for(const ch of s)n=(n*31+ch.charCodeAt(0))%301;return 8+n}
function userEvent(id,e){
 const liked=new Set(db.likes[id]||[]).has(e.id);
 const saved=new Set(db.saved[id]||[]).has(e.id);
 return {...e,liked,saved,likes:baseLikes(e)+(liked?1:0),
   image:e.image||e.thumbnail||e.articles?.find(a=>a.image)?.image||'',
   articles:(e.articles||[]).map(a=>({...a,image:a.image||a.thumbnail||''}))
 };
}
function interestTextMatches(e,interest){
 const words=TOPIC_KEYWORDS[interest]||[];
 const hay=norm(`${e.title||''} ${e.summary||''} ${(e.articles||[]).map(a=>a.title||'').join(' ')}`);
 return words.some(w=>{const n=norm(w);return n.length>2&&hay.includes(n)});
}


function verifyTelegramInitData(initData){
 if(!TELEGRAM_BOT_TOKEN||!initData)return null;
 try{const p=new URLSearchParams(initData),hashValue=p.get('hash');if(!hashValue)return null;p.delete('hash');const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const secret=crypto.createHmac('sha256','WebAppData').update(TELEGRAM_BOT_TOKEN).digest();const calc=crypto.createHmac('sha256',secret).update(check).digest('hex');if(!crypto.timingSafeEqual(Buffer.from(calc),Buffer.from(hashValue)))return null;const authDate=Number(p.get('auth_date')||0);if(!authDate||Math.abs(Date.now()/1000-authDate)>TELEGRAM_AUTH_MAX_AGE)return null;const user=JSON.parse(p.get('user')||'{}');if(!user.id)return null;return {id:String(user.id),user}}catch{return null}}
function telegramContext(req){const tg=verifyTelegramInitData(String(req.headers['x-telegram-init-data']||''));if(tg)return {id:`tg_${tg.id}`,telegram:tg};if(ALLOW_LOCAL_DEV)return {id:String(req.headers['x-pulse-user']||'local-user').slice(0,80),telegram:null};return null}
function defaultProfile(){return{name:'',country:'',city:'',profession:'',interests:[],priorities:[],otherGeographies:[],createdAt:nowIso(),updatedAt:nowIso(),onboardingDone:false,profileVersion:0,defaultMinutes:5}}
function getUser(id){if(!db.users[id])db.users[id]=defaultProfile();return db.users[id]}

function xmlDecode(s=''){return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;|&#x27;/gi,"'")}
function tagValue(block,tag){const m=block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,'i'));return m?cleanText(xmlDecode(m[1])):''}
function attrValue(block,tag,attr){const m=block.match(new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["']`,'i'));return m?xmlDecode(m[1]):''}
function imageFromBlock(block){const c=[attrValue(block,'media:content','url'),attrValue(block,'media:thumbnail','url'),attrValue(block,'enclosure','url')].map(safeUrl).filter(Boolean);const html=xmlDecode(block);const imgs=[...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m=>safeUrl(m[1])).filter(Boolean);return c[0]||imgs[0]||''}

async function fetchFeed(name,url){const started=Date.now();try{const r=await fetch(url,{headers:{'User-Agent':'PULSE/2.0 News Engine'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);const xml=await r.text();const items=[];const blocks=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];for(const block of blocks.slice(0,MAX_PER_FEED)){const title=tagValue(block,'title'),link=tagValue(block,'link')||attrValue(block,'link','href');if(!title||!link||!looksUsefulLanguage(title))continue;const description=cleanText(tagValue(block,'description')||tagValue(block,'content:encoded'));const date=tagValue(block,'pubDate')||tagValue(block,'dc:date');const source=tagValue(block,'source')||name;items.push({id:hash(`${title}|${link}`),title,description:description.slice(0,1400),link:safeUrl(link),published:parseDate(date).toISOString(),source:sourceName({source:{title:source}},name),sourceFeed:name,forcedTopic:forcedTopic(name),thumbnail:imageFromBlock(block)})}return{name,url,ok:true,count:items.length,ms:Date.now()-started,items}}catch(error){return{name,url,ok:false,count:0,ms:Date.now()-started,error:error.message,items:[]}}}

function tokenHit(hay,word){
 const n=norm(word);
 if(n.length<4)return false;
 if(n.includes(' '))return hay.includes(n);
 return hay.split(' ').some(token=>token===n||(n.length>=5&&token.startsWith(n)));
}
function forcedTopic(name=''){
 const n=norm(name);
 for(const topic of INTERESTS){
   if(n.includes(norm(topic)))return topic;
 }
 if(n.includes('business')||n.includes('эконом'))return 'Бизнес';
 if(n.includes('technology')||n.includes('tech'))return 'Технологии';
 if(n.includes('auto'))return 'Авто';
 if(n.includes('world'))return 'Мир';
 return '';
}
function classify(item){
 const title=norm(item.title||''), desc=norm(item.description||''), t=`${title} ${desc}`;
 const forced=item.forcedTopic||forcedTopic(item.sourceFeed||'');
 const scores=[];
 for(const [name,words] of Object.entries(TOPIC_KEYWORDS)){
   if(name==='Новости')continue;
   let hits=0;
   for(const w of words)if(tokenHit(t,w))hits += tokenHit(title,w)?2:1;
   if(hits>0)scores.push([name,hits]);
 }
 scores.sort((a,b)=>b[1]-a[1]);
 const conflict=/(войн|конфликт|обстрел|ракет|атак|теракт|санкц|президент|правительств|министр|выбор|парламент|дипломат)/.test(t);
 const sport=/(футбол|баскетбол|теннис|хоккей|матч|турнир|гол|чемпион|спортсмен)/.test(t);
 const auto=/(авто|автомобил|электромобил|tesla|bmw|mercedes|toyota|volkswagen)/.test(t);
 const travel=/(аэропорт|авиарейс|отел|туризм|путешеств)/.test(t);
 let primary=forced||'';
 if(conflict)primary=t.includes('президент')||t.includes('правительств')||t.includes('министр')||t.includes('выбор')?'Политика':'Мир';
 else if(sport)primary='Спорт';
 else if(auto)primary='Авто';
 else if(travel)primary='Путешествия';
 else if(scores.length)primary=scores[0][0];
 const topics=primary?[primary,...scores.filter(x=>x[0]!==primary).slice(0,2).map(x=>x[0])]:['Новости'];
 let important=0;for(const x of IMPORTANT)if(tokenHit(t,x))important++;
 let action=0;for(const x of ACTION)if(tokenHit(t,x))action++;
 const geography=[];
 if(/\bказахстан(?:а|е)?\b/i.test(t))geography.push('Казахстан');
 if(/\bросси(?:я|и|ю|ей)|москва|санкт петербург|пермь\b/i.test(t))geography.push('Россия');
 if(/\bукраин(?:а|ы|е|у)|киев\b/i.test(t))geography.push('Украина');
 if(/\bсша|америк|washington|new york\b/i.test(t))geography.push('США');
 if(/\bевроп|германи|франци|британи\b/i.test(t))geography.push('Европа');
 return{topics:[...new Set(topics)],geography,important,action};
}
function eventSimilarity(a,b){const title=similarity(a.title,b.title),body=similarity(`${a.title} ${a.description}`,`${b.title} ${b.description}`),A=tokens(a.title),B=tokens(b.title),overlap=[...A].filter(x=>B.has(x)).length;return Math.max(title,body*.72,overlap>=3?.56:0)+(a.source===b.source?0:.02)}
function makeEvents(raw){
 const events=[];
 const sorted=[...raw].sort((a,b)=>parseDate(b.published)-parseDate(a.published));
 for(const item of sorted){
   item.title=cleanNewsTitle(item.title,item.source);
   item.description=stripNewsNoise(item.description,item.source,item.title);
   const meta=classify(item);
   let e=events.find(x=>eventSimilarity(x.primary,item)>=.52&&Math.abs(parseDate(x.primary.published)-parseDate(item.published))<36*3600000);
   if(!e){
     e={id:hash(`${norm(item.title)}|${item.published.slice(0,10)}`),primary:item,articles:[],sources:new Map(),topics:meta.topics,geography:meta.geography,important:meta.important,action:meta.action};
     events.push(e);
   }
   e.articles.push(item);
   e.sources.set(item.source,item);
   e.important=Math.max(e.important,meta.important);
   e.action=Math.max(e.action,meta.action);
   e.topics=[...new Set([...(e.topics||[]),...(meta.topics||[])])].slice(0,5);
   e.geography=[...new Set([...e.geography,...meta.geography])];
   if(parseDate(item.published)>parseDate(e.primary.published))e.primary=item;
 }
 return events.map(e=>{
   const summary=editorialSummary(e.primary.title,e.primary.description,e.primary.articleBody||'',e.primary.source);
   return {
    id:e.id,
    title:cleanNewsTitle(e.primary.title,e.primary.source),
    summary,
    why:editorialWhy(e.primary.title,summary,e.topics,e.geography),
    published:e.primary.published,
    updatedAt:e.articles.map(x=>x.published).sort().at(-1)||e.primary.published,
    source:e.primary.source,
    sourceCount:e.sources.size,
    sources:[...e.sources.keys()].slice(0,8),
    articles:e.articles.slice(0,10).map(x=>({title:cleanNewsTitle(x.title,x.source),source:x.source,link:x.link,published:x.published,image:x.thumbnail||x.image||'',description:x.description||''})),
    topics:e.topics,
    geography:e.geography,
    importance:Math.min(100,35+e.important*10+Math.min(30,e.sources.size*5)+Math.max(0,20-(Date.now()-parseDate(e.primary.published))/3600000)),
    action:e.action>0,
    image:e.primary.image||e.primary.thumbnail||'',
    link:e.primary.link,
    confirmation:e.sources.size>=3?'Подтверждено':e.sources.size>=2?'Есть независимые сообщения':'Появилось сообщение'
   };
 });
}

async function extractArticlePage(url){
 const target=safeUrl(url);if(!target)return{};
 try{
   const r=await fetch(target,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; PULSE/2.0 News Engine)'},signal:AbortSignal.timeout(6500)});
   if(!r.ok)return{};
   const html=(await r.text()).slice(0,1400000);
   const base=r.url||target;
   let image='',description='',body='';
   const meta=(name,attr='property')=>{
     const re=new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${name}["']`,'i');
     const m=html.match(re);return cleanText(m?.[1]||m?.[2]||'');
   };
   const imagePatterns=[
    /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["'][^"']*image_src[^"']*["'][^>]+href=["']([^"']+)["']/i
   ];
   for(const re of imagePatterns){
     const m=html.match(re),raw=m?.[1]||'';
     if(raw){try{const u=new URL(raw,base).href;if(/^https?:/i.test(u)){image=u;break}}catch{}}
   }
   description=meta('og:description')||meta('description','name')||meta('twitter:description','name');
   const ld=[...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
   for(const m of ld){
     try{
       const data=JSON.parse(m[1].trim()),arr=Array.isArray(data)?data:[data,...(data['@graph']||[])];
       for(const obj of arr){
         if(!image){
           const im=obj?.image,raw=typeof im==='string'?im:(Array.isArray(im)?im[0]:im?.url);
           if(raw){const u=new URL(raw,base).href;if(/^https?:/i.test(u))image=u;}
         }
         if(!body&&typeof obj?.articleBody==='string')body=cleanText(obj.articleBody).slice(0,8000);
         if(!description&&typeof obj?.description==='string')description=cleanText(obj.description);
       }
     }catch{}
   }
   if(!body){
     const blocks=[...html.matchAll(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/gi)].map(m=>cleanText(m[1])).filter(x=>x.length>120);
     body=(blocks.sort((a,b)=>b.length-a.length)[0]||'').slice(0,8000);
   }
   if(!body){
     const ps=[...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m=>cleanText(m[1])).filter(x=>x.length>50);
     body=ps.slice(0,18).join(' ').slice(0,8000);
   }
   return {image,description:stripNewsNoise(description,'',''),body:stripNewsNoise(body,'','')};
 }catch{return{}}
}
async function extractOgImage(url){return (await extractArticlePage(url)).image||''}

async function enrichArticles(raw,limit=140){
 const q=raw.filter(x=>x?.link).slice(0,limit);
 let i=0;
 const worker=async()=>{
   while(i<q.length){
     const item=q[i++];
     const key=item.link||item.guid||item.title;
     let meta=articleMetaCache.get(key);
     if(!meta){
       meta=await extractArticlePage(item.link);
       articleMetaCache.set(key,{...meta,cachedAt:Date.now()});
     }
     if(meta?.image){
       item.image=meta.image;
       item.thumbnail=meta.image;
     }
     if(meta?.description && (!item.description || item.description.length<120)){
       item.description=meta.description;
     }
     if(meta?.body){
       item.articleBody=meta.body;
     }
   }
 };
 await Promise.all(Array.from({length:8},worker));
 return raw;
}

async function enrichEvents(events,limit=14){
 const q=events.filter(e=>e?.articles?.length && (!e.image || !e.summary || e.summary.length<180 || /https?:\/\//i.test(e.summary))).slice(0,limit);
 let i=0;
 const worker=async()=>{
   while(i<q.length){
     const e=q[i++];
     const candidates=[e.link,...(e.articles||[]).map(a=>a.link)].filter(Boolean).slice(0,2);
     for(const link of candidates){
       const page=await extractArticlePage(link);
       if(page.image&&!e.image)e.image=page.image;
       if(page.description||page.body){
         const desc=page.description||'';
         const sum=editorialSummary(e.title,desc,page.body,e.source);
         if(sum.length>90)e.summary=sum;
         e.why=editorialWhy(e.title,e.summary,e.topics||[],e.geography||[]);
         const primary=e.articles?.[0];
         if(primary){
           primary.image=primary.image||page.image||'';
           primary.description=primary.description||page.description||'';
         }
       }
       if(e.image||e.summary.length>=180)break;
     }
   }
 };
 await Promise.all(Array.from({length:5},worker));
 return events;
}

async function resolveImages(events){
 const q=events.filter(e=>!e.image&&e.articles?.length).slice(0,90);
 let i=0;
 const worker=async()=>{
   while(i<q.length){
     const e=q[i++];
     const candidates=[e.link,...(e.articles||[]).map(a=>a.link)].filter(Boolean).slice(0,2);
     for(const link of candidates){
       const image=await extractOgImage(link);
       if(image){e.image=image;break}
     }
   }
 };
 await Promise.all(Array.from({length:10},worker));
 return events;
}

function interestQueries(profile){
 const out=[];
 for(const x of [...(profile.interests||[]),...(profile.priorities||[])]){
   const q=TOPIC_QUERIES[x]; if(q)out.push(`(${q})`);
 }
 if(profile.city)out.push(`"${profile.city}"`);
 if(profile.country)out.push(`"${profile.country}"`);
 return [...new Set(out)];
}
function buildFeeds(profile){
 const feeds=[];
 const qs=interestQueries(profile);
 if(qs.length)feeds.push(['PULSE · персонально',`https://news.google.com/rss/search?q=${encodeURIComponent(qs.join(' OR '))}&hl=ru&gl=KZ&ceid=KZ:ru`]);
 return feeds;
}
const userFeedCache=new Map();
async function fetchPersonalEvents(profile){
 const queries=[];
 for(const x of [...(profile.interests||[]),...(profile.priorities||[])]){
   const q=TOPIC_QUERIES[x]; if(q)queries.push(q);
 }
 if(profile.city)queries.push(`"${profile.city}"`);
 if(profile.country)queries.push(`"${profile.country}"`);
 const unique=[...new Set(queries)].slice(0,8);
 if(!unique.length)return[];
 const results=await Promise.all(unique.map(q=>fetchFeed(`PULSE · ${q}`,`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ru&gl=KZ&ceid=KZ:ru`)));
 const raw=results.flatMap(x=>x.items||[]);
 const exact=new Map();for(const x of raw){const k=norm(x.title);if(!exact.has(k))exact.set(k,x)}
 const events=makeEvents([...exact.values()]);
 await resolveImages(events);
 return events;
}
let refreshPromise=null;

async function refreshNews(){
 if(refreshPromise)return refreshPromise;
 refreshPromise=(async()=>{
  const profiles=Object.values(db.users),feedDefs=[...BASE_FEEDS];
  const wanted=['Бизнес','Технологии','Авто','Спорт','Финансы','Локальное','Наука','Криптовалюты','Мир'];
  for(const cat of wanted){const q=CATEGORY_QUERIES[cat];if(q)feedDefs.push([`PULSE · ${cat}`,`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ru&gl=RU&ceid=RU:ru`])}
  const generalResults=await Promise.all(feedDefs.map(([n,u])=>fetchFeed(n,u))),allResults=[...generalResults];
  for(const profile of profiles){try{const events=await fetchPersonalEvents(profile),raw=events.flatMap(e=>e.articles||[]);allResults.push({name:`PULSE · персонально · ${profile.city||profile.country||profile.name||'профиль'}`,url:'personal',ok:true,count:raw.length,ms:0,items:raw})}catch{}}
  const raw=allResults.flatMap(x=>x.items||[]),exact=new Map();
  for(const x of raw){const k=norm(x.title);if(!exact.has(k))exact.set(k,x)}
  const unique=[...exact.values()];
  await enrichArticles(unique,Math.min(140,unique.length));
  const events=makeEvents(unique);
  await resolveImages(events);
  const merged=new Map(cache.events.map(e=>[e.id,e]));for(const e of events)merged.set(e.id,e);
  cache.events=[...merged.values()].filter(e=>Date.now()-parseDate(e.updatedAt||e.published)<72*3600000).sort((a,b)=>parseDate(b.published)-parseDate(a.published)).slice(0,1200);
  cache.updatedAt=nowIso();
  cache.sourceStatus=allResults.map(({name,url,ok,count,ms,error})=>({name,url,ok,count,ms,error:error||null}));
  cache.error=allResults.some(x=>x.ok)?null:'Все источники недоступны';
  console.log(`PULSE 2.1: ${unique.length} articles -> ${cache.events.length} events; sources ${allResults.filter(x=>x.ok).length}/${allResults.length}`);
 })().finally(()=>{refreshPromise=null});
 return refreshPromise;
}
async function ensurePersonalPool(id){
 const p=getUser(id);
 const key=id;
 const cached=userFeedCache.get(key);
 if(cached && Date.now()-cached.at<120000)return;
 try{
   const personal=await fetchPersonalEvents(p);
   const merged=new Map(cache.events.map(e=>[e.id,e]));
   for(const e of personal)merged.set(e.id,e);
   cache.events=[...merged.values()].sort((a,b)=>parseDate(b.published)-parseDate(a.published)).slice(0,700);
   userFeedCache.set(key,{at:Date.now()});
 }catch(e){console.error('Personal feed refresh failed:',e.message)}
}

function profileTopicMatches(e,p){
 const interests=[...(p.interests||[]),...(p.priorities||[])].filter(Boolean);
 const specific=interests.filter(i=>i!=='Новости');
 const text=norm(`${e.title||''} ${e.summary||''} ${(e.articles||[]).map(a=>a.title||'').join(' ')}`);
 const localHit=(p.city&&text.includes(norm(p.city)))||(p.country&&text.includes(norm(p.country)));
 const politicalHit=POLITICAL_WORDS.some(w=>text.includes(norm(w)))||e.topics?.includes('Политика');
 if(!interests.length)return !politicalHit || !!localHit;
 if(!interests.includes('Политика')&&politicalHit&&!localHit)return false;
 if(!specific.length)return !politicalHit || !!localHit;
 return specific.some(i=>e.topics?.includes(i)||interestTextMatches(e,i)) || (e.important>=3 && !!localHit);
}

function profileScore(e,p){
 const interests=new Set([...(p.interests||[]),...(p.priorities||[])]);
 let personal=0;
 for(const t of e.topics||[])if(interests.has(t))personal+=55;
 const text=norm(`${e.title} ${e.summary}`);
 if(p.profession&&text.includes(norm(p.profession)))personal+=18;
 if(p.city&&text.includes(norm(p.city)))personal+=35;
 if(p.country&&text.includes(norm(p.country)))personal+=12;
 const age=Math.max(0,(Date.now()-parseDate(e.published))/3600000);
 const freshness=Math.max(0,30-Math.min(30,age));
 const relevance=profileTopicMatches(e,p)?35:0;
 return personal+relevance+e.importance*.28+e.action*4+freshness;
}
function rankEvents(id,events,minutes){
 const p=getUser(id),seen=db.activity[id]?.seen||{},hidden=new Set(db.hidden[id]||[]);
 let pool=events.filter(e=>!hidden.has(e.id));
 if((p.interests||[]).length)pool=pool.filter(e=>profileTopicMatches(e,p));
 let scored=pool.map(e=>({...e,score:profileScore(e,p)})).sort((a,b)=>b.score-a.score);
 const fresh=scored.filter(e=>!(seen[e.id]&&(Date.now()-parseDate(e.published)<18*3600000)&&e.importance<80));
 if(fresh.length>=4)scored=fresh;
 const limits={1:60,3:180,5:300,10:600};
 const target={1:2,3:5,5:8,10:14}[minutes]||8;
 const budget=limits[minutes]||300;
 const out=[],usedTopics=new Set();
 let total=0;
 for(const e of scored){
   if(out.length>=target||total>=budget)break;
   const seconds=Math.max(22,Math.min(48,Math.round(18+(e.summary.length/55)+(e.title.length/28))));
   if(total+seconds>budget&&out.length>0)continue;
   out.push({...userEvent(id,e),duration:seconds});
   total+=seconds;
   (e.topics||[]).forEach(t=>usedTopics.add(t));
 }
 if(out.length<target){
   for(const e of scored){
     if(out.length>=target)break;
     if(out.some(x=>x.id===e.id))continue;
     const seconds=Math.max(20,Math.min(42,Math.round(18+(e.summary.length/60))));
     if(total+seconds>budget&&out.length>0)continue;
     out.push({...userEvent(id,e),duration:seconds});total+=seconds;
   }
 }
 if(!out.length&&scored[0])out.push({...userEvent(id,scored[0]),duration:Math.min(48,Math.max(22,secondsFor(scored[0])))});
 return out;
}

function secondsFor(e){return Math.round(16+(String(e.title||'').length/16)+(String(e.summary||'').length/45));}

function queryMatchesEvent(e,q){
 const terms=norm(q).split(/\s+/).filter(x=>x.length>1);
 if(!terms.length)return false;
 const hay=norm([e.title,e.summary,e.source,e.link,...(e.topics||[]),...(e.geography||[]),...(e.sources||[]),...(e.articles||[]).flatMap(a=>[a.title,a.source,a.link,a.description])].join(' '));
 return terms.every(t=>hay.includes(t)) || terms.some(t=>hay.includes(t));
}

async function searchInternet(q){
 const urls=[
  [`Поиск KZ: ${q}`,`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ru&gl=KZ&ceid=KZ:ru`],
  [`Поиск RU: ${q}`,`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ru&gl=RU&ceid=RU:ru`]
 ];
 const results=await Promise.all(urls.map(([name,url])=>fetchFeed(name,url))),raw=results.flatMap(x=>x.items||[]),exact=new Map();
 for(const x of raw){const k=norm(x.title);if(!exact.has(k))exact.set(k,x)}
 const unique=[...exact.values()];
 await enrichArticles(unique,Math.min(50,unique.length));
 const events=makeEvents(unique);await resolveImages(events);return events;
}
function publicImageUrl(url){return url?`/api/image?url=${encodeURIComponent(url)}`:''}
async function proxyImage(req,res,u){
  const target=safeUrl(u.searchParams.get('url')||'');
  if(!target)return json(res,400,{error:'Invalid image URL'});
  try{
    const host=new URL(target).hostname.toLowerCase();
    if(['localhost','127.0.0.1','0.0.0.0','::1'].includes(host)||host.endsWith('.local'))return json(res,403,{error:'Forbidden image host'});
    const r=await fetch(target,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 PULSE/2.0'},signal:AbortSignal.timeout(7000)});
    if(!r.ok)return json(res,404,{error:'Image unavailable'});
    const ct=r.headers.get('content-type')||'';
    if(!ct.startsWith('image/'))return json(res,415,{error:'Not an image'});
    const buf=Buffer.from(await r.arrayBuffer());
    if(buf.length>5*1024*1024)return json(res,413,{error:'Image too large'});
    res.writeHead(200,{'Content-Type':ct,'Cache-Control':'public,max-age=86400,stale-while-revalidate=604800','X-Content-Type-Options':'nosniff'});res.end(buf);
  }catch(e){return json(res,502,{error:'Image fetch failed'})}
}

function json(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(body)}
async function bodyJson(req){let b='';for await(const c of req)b+=c;try{return b?JSON.parse(b):{}}catch{return {}}}
async function telegramSend(chatId,text,reply_markup){if(!TELEGRAM_BOT_TOKEN||!chatId)return;try{await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text,reply_markup})})}catch{}}

async function handle(req,res){const u=new URL(req.url,`http://${req.headers.host||'localhost'}`),pathname=u.pathname;try{
 if(pathname==='/telegram/webhook'&&req.method==='POST'){
  const secret=crypto.createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest('hex').slice(0,32);
  if(req.headers['x-telegram-bot-api-secret-token']!==secret)return json(res,403,{error:'Forbidden'});
  const update=await bodyJson(req),msg=update?.message,txt=String(msg?.text||'').trim();
  if(txt.startsWith('/start')){
    const m=txt.match(/^\/start\s+event_([a-f0-9]+)$/i);
    const eventId=m?.[1]||'';
    const url=eventId?`${TELEGRAM_WEBAPP_URL}/?event=${encodeURIComponent(eventId)}`:TELEGRAM_WEBAPP_URL;
    await telegramSend(msg.chat.id,eventId?'⚡ PULSE\nОткрой карточку новости:':'⚡ PULSE\nВесь интернет — за несколько минут.',{inline_keyboard:[[{text:eventId?'📰 Открыть карточку':'🚀 Запустить PULSE',web_app:{url}}]]});
  }
  return json(res,200,{ok:true})
}
 const publicPaths=new Set(['/api/health','/api/telegram/config','/api/image']);let ctx=null;if(pathname.startsWith('/api/')&&!publicPaths.has(pathname)){ctx=telegramContext(req);if(!ctx)return json(res,401,{error:'Telegram authorization required',code:'TELEGRAM_AUTH_REQUIRED'})}const id=ctx?.id||'';
 if(req.method==='GET'&&pathname==='/api/image')return proxyImage(req,res,u);
 if(req.method==='GET'&&pathname==='/api/health')return json(res,200,{ok:true,updatedAt:cache.updatedAt,error:cache.error,events:cache.events.length,sources:cache.sourceStatus,telegram:{configured:!!TELEGRAM_BOT_TOKEN,webAppConfigured:!!TELEGRAM_WEBAPP_URL}});
 if(req.method==='GET'&&pathname==='/api/telegram/config')return json(res,200,{configured:!!TELEGRAM_BOT_TOKEN,webAppConfigured:!!TELEGRAM_WEBAPP_URL,localDev:ALLOW_LOCAL_DEV});
 if(req.method==='GET'&&pathname==='/api/telegram/me')return json(res,200,ctx?.telegram?{connected:true,telegramId:ctx.telegram.id,user:ctx.telegram.user}:{connected:false,mode:'local'});
 if(req.method==='GET'&&pathname==='/api/profile')return json(res,200,{userId:id,profile:getUser(id),telegram:ctx?.telegram?{id:ctx.telegram.id,user:ctx.telegram.user}:null});
 if(req.method==='PUT'&&pathname==='/api/profile'){const p=getUser(id),b=await bodyJson(req);for(const k of ['name','country','city','profession'])if(b[k]!==undefined)p[k]=cleanText(b[k]).slice(0,100);for(const k of ['interests','priorities','otherGeographies'])if(Array.isArray(b[k]))p[k]=b[k].map(x=>cleanText(x).slice(0,80)).filter(Boolean).slice(0,30);if(b.defaultMinutes)p.defaultMinutes=Math.max(1,Math.min(10,Number(b.defaultMinutes)));p.onboardingDone=Boolean(b.onboardingDone??p.onboardingDone);if(p.onboardingDone&&p.interests.length)p.profileVersion=3;p.updatedAt=nowIso();schedulePersist();return json(res,200,{ok:true,profile:p})}
 if(req.method==='GET'&&pathname==='/api/news'){
  if(cache.events.length<20 || !cache.updatedAt || Date.now()-Date.parse(cache.updatedAt)>180000)await refreshNews();
  await ensurePersonalPool(id);
  const minutes=Math.max(1,Math.min(10,Number(u.searchParams.get('minutes')||getUser(id).defaultMinutes||5)));
  const category=cleanText(u.searchParams.get('category')||'');
  if(category&&CATEGORY_QUERIES[category]){
    try{
      const live=await fetchFeed(`Live ${category}`,`https://news.google.com/rss/search?q=${encodeURIComponent(CATEGORY_QUERIES[category])}&hl=ru&gl=KZ&ceid=KZ:ru`);
      if(live.ok){
        const liveEvents=makeEvents(live.items||[]);
        await resolveImages(liveEvents);
        const merged=new Map(cache.events.map(e=>[e.id,e]));
        liveEvents.forEach(e=>merged.set(e.id,e));
        cache.events=[...merged.values()].sort((a,b)=>parseDate(b.published)-parseDate(a.published)).slice(0,700);
      }
    }catch{}
  }
  const sourcePool=category?cache.events.filter(e=>e.topics?.includes(category)):cache.events;
  const items=rankEvents(id,sourcePool,minutes);
  await enrichEvents(items,12);
  return json(res,200,{updatedAt:cache.updatedAt,items:items.map(e=>userEvent(id,e)),profile:getUser(id),sourceStatus:cache.sourceStatus});
}
 if(req.method==='GET'&&pathname==='/api/digest'){if(cache.events.length<20 || !cache.updatedAt || Date.now()-Date.parse(cache.updatedAt)>180000)await refreshNews();await ensurePersonalPool(id);const minutes=Math.max(1,Math.min(10,Number(u.searchParams.get('minutes')||5)));const items=rankEvents(id,cache.events,minutes);await enrichEvents(items,Math.min(18,items.length));const enriched=items.map(e=>userEvent(id,e));const total=enriched.reduce((s,x)=>s+x.duration,0);return json(res,200,{minutes,items:enriched,totalSeconds:total})}
 if(req.method==='GET'&&pathname==='/api/search'){
  const q=cleanText(u.searchParams.get('q')||'').trim();
  if(!q)return json(res,200,{items:[]});
  const p=getUser(id);
  let local=cache.events.filter(e=>queryMatchesEvent(e,q));
  let remote=[];
  try{remote=await searchInternet(q)}catch{}
  const merged=new Map();
  for(const e of [...local,...remote])if(!merged.has(e.id))merged.set(e.id,e);
  const items0=[...merged.values()].filter(e=>looksUsefulLanguage(e.title)).sort((a,b)=>profileScore(b,p)-profileScore(a,p)).slice(0,60);
  await enrichEvents(items0,18);
  const items=items0.map(e=>userEvent(id,e));
  return json(res,200,{items,query:q});
}
if(req.method==='GET'&&pathname.startsWith('/api/event/')){
  const eid=decodeURIComponent(pathname.slice('/api/event/'.length));
  const found=cache.events.find(e=>e.id===eid)||db.sharedEvents[eid];
  if(!found)return json(res,404,{error:'Event not found'});
  return json(res,200,{item:userEvent(id,found)});
}
if(req.method==='GET'&&pathname.startsWith('/api/share/')){
  const eid=decodeURIComponent(pathname.slice('/api/share/'.length));
  const found=cache.events.find(e=>e.id===eid)||db.sharedEvents[eid];
  if(!found)return json(res,404,{error:'Event not found'});
  db.sharedEvents[eid]=found;
  schedulePersist();
  const target=TELEGRAM_BOT_USERNAME
    ? `https://t.me/${TELEGRAM_BOT_USERNAME}?start=event_${encodeURIComponent(eid)}`
    : `${TELEGRAM_WEBAPP_URL}/?event=${encodeURIComponent(eid)}`;
  return json(res,200,{url:target,eventId:eid});
}
if(req.method==='GET'&&pathname==='/api/saved'){const ids=new Set(db.saved[id]||[]),stored=db.savedEvents[id]||{};const items=[...ids].map(eid=>stored[eid]||cache.events.find(e=>e.id===eid)).filter(Boolean).map(e=>userEvent(id,e));return json(res,200,{items,saved:[...ids]})}
 if(req.method==='POST'&&pathname.startsWith('/api/saved/')){const eid=decodeURIComponent(pathname.slice('/api/saved/'.length));const set=new Set(db.saved[id]||[]);db.savedEvents[id]??={};const e=cache.events.find(x=>x.id===eid);if(set.has(eid)){set.delete(eid);delete db.savedEvents[id][eid]}else{set.add(eid);if(e)db.savedEvents[id][eid]=e}db.saved[id]=[...set];schedulePersist();return json(res,200,{saved:[...set]})}
 if(req.method==='POST'&&pathname.startsWith('/api/like/')){const eid=decodeURIComponent(pathname.slice('/api/like/'.length));const set=new Set(db.likes[id]||[]);set.has(eid)?set.delete(eid):set.add(eid);db.likes[id]=[...set];schedulePersist();return json(res,200,{liked:set.has(eid),likes:baseLikes(cache.events.find(e=>e.id===eid)||{id:eid})+(set.has(eid)?1:0)})}
 if(req.method==='POST'&&pathname.startsWith('/api/hide/')){const eid=decodeURIComponent(pathname.slice('/api/hide/'.length));const set=new Set(db.hidden[id]||[]);set.add(eid);db.hidden[id]=[...set];schedulePersist();return json(res,200,{ok:true})}
 if(req.method==='POST'&&pathname==='/api/activity'){const b=await bodyJson(req);db.activity[id]??={seen:{},opened:0,shared:0,copied:0};const a=db.activity[id];if(b.eventId&&b.type==='seen')a.seen[b.eventId]=nowIso();if(b.type==='opened')a.opened++;if(b.type==='shared')a.shared++;if(b.type==='copied')a.copied++;schedulePersist();return json(res,200,{ok:true})}
 if(req.method==='POST'&&pathname==='/api/session'){const b=await bodyJson(req),minutes=Math.max(1,Math.min(10,Number(b.minutes||5)));db.sessions.push({id:`${id}-${Date.now()}`,userId:id,minutes,startedAt:nowIso()});db.sessions=db.sessions.slice(-500);const p=getUser(id);p.defaultMinutes=minutes;schedulePersist();return json(res,200,{ok:true,minutes})}
 if(req.method==='POST'&&pathname==='/api/refresh'){await refreshNews();return json(res,200,{ok:true,updatedAt:cache.updatedAt,events:cache.events.length})}
 if(req.method==='GET'&&pathname==='/favicon.ico'){res.writeHead(204);return res.end()}
 const rel=pathname==='/'?'index.html':pathname.replace(/^\//,'');const fp=path.normalize(path.join(PUBLIC_DIR,rel));if(!fp.startsWith(PUBLIC_DIR))return json(res,404,{error:'Not found'});const data=await fs.readFile(fp);const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};res.writeHead(200,{'Content-Type':types[path.extname(fp)]||'application/octet-stream'});return res.end(data)
 }catch(e){console.error('PULSE request error',pathname,e.message);return json(res,500,{error:'Internal server error'})}}

await loadDb();
refreshNews().catch(e=>{cache.error=e.message;console.error('Initial refresh failed:',e.message)});
setInterval(()=>refreshNews().catch(e=>{cache.error=e.message;console.error('Refresh failed:',e.message)}),REFRESH_MINUTES*60000);
async function configureTelegram(){if(!TELEGRAM_BOT_TOKEN||!TELEGRAM_WEBAPP_URL)return;try{const mr=await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);const md=await mr.json();TELEGRAM_BOT_USERNAME=md?.result?.username||TELEGRAM_BOT_USERNAME;}catch{} try{const secret=crypto.createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest('hex').slice(0,32);const r=await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:`${TELEGRAM_WEBAPP_URL}/telegram/webhook`,secret_token:secret,allowed_updates:['message']})});const d=await r.json();console.log(d.ok?'Telegram webhook configured: '+TELEGRAM_WEBAPP_URL:d.description)}catch(e){console.error('Telegram webhook error:',e.message)}try{const r=await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setChatMenuButton`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({menu_button:{type:'web_app',text:'Открыть PULSE',web_app:{url:TELEGRAM_WEBAPP_URL}}})});const d=await r.json();if(d.ok)console.log('Telegram Mini App menu configured:',TELEGRAM_WEBAPP_URL);else console.error('Telegram menu error:',d.description)}catch(e){console.error('Telegram menu error:',e.message)}}
configureTelegram();
http.createServer(handle).listen(PORT,()=>console.log(`PULSE 2.0 running on http://localhost:${PORT}`));
