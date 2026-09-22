module.exports=[66091,e=>e.a(async(t,a)=>{try{var r=e.i(17038),i=e.i(77035),n=e.i(25686),s=t([i]);async function o(e,t){return"begin"in e&&"function"==typeof e.begin?e.begin(e=>t(e)):t(e)}[i]=s.then?(await s)():s;let h=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]),O=["A","2","3","4","5","6","7","8","9","10","J","Q","K"],D=["♠","♥","♦","♣"],U=["2","F","G","T","◆","♛"],k=e=>crypto.getRandomValues(new Uint32Array(1))[0]%e,v=(e,t=200)=>Response.json(e,{status:t}),I=new Map,C=new Map;async function u(e,t,a,r){let i=Date.now(),n=crypto.randomUUID(),s=0;return await t.begin(async t=>{let[o]=await t`
      SELECT nick FROM players WHERE user_id = ${e.user_id} FOR UPDATE
    `,[u]=await t`
      SELECT COALESCE(SUM(amount), 0) AS sum FROM ledger_entries WHERE user_id = ${e.user_id}
    `;s=u?Math.max(0,Number(u.sum)):0;let d=o?.nick||e.nick||"nieznany";await t`
      UPDATE players
      SET updated_at = ${i}
      WHERE user_id = ${e.user_id}
    `,await t`
      UPDATE game_rounds
      SET state = 'cancelled', result = 'Anulowano - wykryto oszustwo', settled_at = ${i}
      WHERE user_id = ${e.user_id} AND state = 'active'
    `,s>0&&await t`
        INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
        VALUES (${crypto.randomUUID()}, ${e.user_id}, 'fraud_penalty', ${-s}, 0, ${i})
      `,await t`
      INSERT INTO fraud_logs (id, user_id, nick, previous_balance, reason, details, created_at)
      VALUES (${n}, ${e.user_id}, ${d}, ${s}, ${a}, ${r||null}, ${i})
    `}),v({error:`Wykryto naruszenie integralności gry (${a}). Twoje saldo zostało wyzerowane.`,balance:0,fraud:!0,fraudLogId:n},403)}function d(e,t){let a=e.bet;return"number"==typeof a&&Number.isFinite(a)?Number.isInteger(a)?a<=0?{ok:!1,fraud:!0,reason:"Niedozwolona ujemna lub zerowa stawka"}:a>7e3?{ok:!1,fraud:!0,reason:`Przekroczono maksymalną stawkę (${a} > 7000)`}:a>t.balance?{ok:!1,fraud:!1,reason:"Za mało żetonów na koncie"}:{ok:!0,bet:a}:{ok:!1,fraud:!0,reason:"Niecałkowita stawka"}:{ok:!1,fraud:!0,reason:"Nieliczbowa lub nieskończona stawka"}}async function l(e,t){let a=new Date;a.setUTCHours(0,0,0,0);let[r]=await e`
    SELECT count(*) as count FROM game_rounds
    WHERE user_id = ${t} AND state = 'settled'
      AND (settled_at >= ${a.getTime()} OR (settled_at IS NULL AND created_at >= ${a.getTime()}))
  `;return r?parseInt(r.count,10):0}async function c(){let e=(await (0,r.headers)()).get("cookie"),t=(0,n.parseCookie)(e,"casino_session");if(!t)throw Error("UNAUTHORIZED");let a=await (0,n.verifySession)(t);if(!a)throw Error("UNAUTHORIZED");return{userId:a.userId,email:a.email,nick:a.nick}}async function E(e,t){let[a]=await e`
    SELECT 
      p.user_id,
      p.email,
      p.nick,
      p.xp,
      p.level,
      p.streak,
      p.last_bonus_day,
      COALESCE(SUM(l.amount), 0)::bigint AS balance
    FROM players p
    LEFT JOIN ledger_entries l ON p.user_id = l.user_id
    WHERE p.user_id = ${t}
    GROUP BY p.user_id, p.email, p.nick, p.xp, p.level, p.streak, p.last_bonus_day
  `;return a?{user_id:a.user_id,email:a.email,nick:a.nick,balance:Number(a.balance),xp:Number(a.xp),level:Number(a.level),streak:Number(a.streak),last_bonus_day:a.last_bonus_day}:null}async function _(){let{userId:e,email:t,nick:a}=await c();await (0,i.initPgTables)();let r=(0,i.getSql)(),n=await E(r,e);if(n){if(a&&n.nick!==a){let[t]=await r`
      SELECT user_id FROM players WHERE nick = ${a} AND user_id != ${e}
    `;t||(await r`UPDATE players SET nick = ${a} WHERE user_id = ${e}`,n.nick=a)}}else{let i=(a||t.split("@")[0]||"Gracz").slice(0,30),s=Date.now();if(await r.begin(async a=>{await a`
        INSERT INTO players (user_id, email, nick, xp, level, streak, created_at, updated_at)
        VALUES (${e}, ${t}, ${i}, 0, 1, 0, ${s}, ${s})
        ON CONFLICT (user_id) DO NOTHING
      `,await a`
        INSERT INTO ledger_entries (id, user_id, type, amount, balance_after, created_at)
        VALUES (${crypto.randomUUID()}, ${e}, 'welcome_bonus', 1000, 1000, ${s})
      `}),!(n=await E(r,e)))throw Error("Nie udało się utworzyć profilu gracza.")}return n}function p(){return{rank:O[k(O.length)],suit:D[k(D.length)]}}function m(e){let t=0,a=0;for(let r of e)"A"===r.rank?(t+=11,a++):t+=["J","Q","K"].includes(r.rank)?10:Number(r.rank);for(;t>21&&a;)t-=10,a--;return t}function w(e){var t,a;let r;return{...e,payload:(t=e.game,a=e.payload,r="string"==typeof a?JSON.parse(a):JSON.parse(JSON.stringify(a)),"mines"===t&&(r.mines=[]),"blackjack"===t&&r.dealer?.length>1&&(r.dealer=[r.dealer[0],{rank:"?",suit:""}]),r)}}async function y(){try{let e=await _(),t=(0,i.getSql)(),[a]=await t`
      SELECT * FROM game_rounds WHERE user_id = ${e.user_id} AND state = 'active' ORDER BY created_at DESC LIMIT 1
    `,r=(await t`
      SELECT 
        l.id,
        l.type,
        l.amount,
        l.balance_after AS "balanceAfter",
        l.created_at AS "createdAt",
        g.game,
        g.result,
        g.bet,
        g.payout
      FROM ledger_entries l
      LEFT JOIN game_rounds g ON l.round_id = g.id
      WHERE l.user_id = ${e.user_id}
      ORDER BY l.created_at DESC
      LIMIT 10
    `).map(e=>({...e,amount:Number(e.amount),balanceAfter:Number(e.balanceAfter),createdAt:Number(e.createdAt),bet:null!==e.bet&&void 0!==e.bet?Number(e.bet):null,payout:null!==e.payout&&void 0!==e.payout?Number(e.payout):null})),[n]=await t`
      SELECT count(*) as count FROM ledger_entries WHERE user_id = ${e.user_id}
    `,s=n?parseInt(n.count,10):0,o=new Date().toISOString().slice(0,10),u=await l(t,e.user_id),[d]=await t`
      SELECT 1 FROM daily_mission_claims WHERE user_id = ${e.user_id} AND claim_day = ${o} AND mission_id = 'daily_5_rounds'
    `,c=(await t`
      SELECT 
        p.nick,
        COALESCE(SUM(l.amount), 0)::bigint AS balance,
        p.level
      FROM players p
      LEFT JOIN ledger_entries l ON p.user_id = l.user_id
      GROUP BY p.user_id, p.nick, p.level
      ORDER BY balance DESC
      LIMIT 5
    `).map(e=>({nick:e.nick,balance:Number(e.balance),level:Number(e.level)}));return v({player:e,active:a?w(a):null,history:r,hasMoreHistory:s>r.length,roundsToday:u,missionClaimed:!!d,missionReward:250,leaders:c,today:o})}catch(e){if(e instanceof Error&&"UNAUTHORIZED"===e.message)return v({error:"Zaloguj się przez Authentik, aby zagrać."},401);return v({error:e instanceof Error?e.message:"Błąd serwera"},500)}}async function g(e){let t=(0,i.getSql)();try{let a=await e.json(),r=await _(),i=function(e){let t=Date.now(),a=C.get(e);if(a?.blockedUntil&&t<a.blockedUntil)return{ok:!1,spam:!1};let r=I.get(e)||0;if(t-r<150){let r=a||{lastViolation:t,count:0};if(t-r.lastViolation<5e3?r.count++:(r.count=1,r.triggered=!1),r.lastViolation=t,r.count>10){let a=!r.triggered;return r.triggered=!0,r.blockedUntil=t+3e4,C.set(e,r),{ok:!1,spam:a}}return C.set(e,r),{ok:!1,spam:!1}}if(I.set(e,t),I.size>5e3)for(let[e,a]of I)t-a>6e4&&I.delete(e);return{ok:!0,spam:!1}}(r.user_id);if(!i.ok){if(i.spam)return u(r,t,"Agresywny spam zapytań / bot flooding");return v({error:"Zbyt wiele zapytań. Odczekaj chwilę."},429)}if("bonus"===a.action){let e=new Date().toISOString().slice(0,10);if(r.last_bonus_day===e)return v({error:"Dzisiejszy bonus został już odebrany."},409);let a=r.last_bonus_day?new Date(r.last_bonus_day+"T00:00:00Z").getTime():0,i=new Date(e+"T00:00:00Z").getTime()-864e5,n=a===i?r.streak+1:1,s=Math.min(100+50*n,1e3),o=Date.now(),u=0;return await t.begin(async t=>{await t`SELECT nick FROM players WHERE user_id = ${r.user_id} FOR UPDATE`;let a=await t`
          INSERT INTO daily_claims(user_id, claim_day, amount, created_at)
          VALUES(${r.user_id}, ${e}, ${s}, ${o})
          ON CONFLICT DO NOTHING
        `;if(0===a.count)throw Error("ALREADY_CLAIMED");let[i]=await t`
          SELECT COALESCE(SUM(amount), 0) as sum FROM ledger_entries WHERE user_id = ${r.user_id}
        `;u=(i?Number(i.sum):0)+s,await t`
          UPDATE players
          SET streak = ${n}, last_bonus_day = ${e}, updated_at = ${o}
          WHERE user_id = ${r.user_id}
        `,await t`INSERT INTO ledger_entries(id, user_id, type, amount, balance_after, created_at)
          VALUES(${crypto.randomUUID()}, ${r.user_id}, 'daily_bonus', ${s}, ${u}, ${o})`}),v({ok:!0,amount:s,balance:u,streak:n})}if("claim_mission"===a.action||"mission"===a.action){let e=new Date().toISOString().slice(0,10);if(await l(t,r.user_id)<5)return v({error:"Musisz rozegrać co najmniej 5 rund, aby odebrać nagrodę."},400);let a=Date.now(),i=0;return await t.begin(async t=>{await t`SELECT nick FROM players WHERE user_id = ${r.user_id} FOR UPDATE`;let n=await t`
          INSERT INTO daily_mission_claims(user_id, claim_day, mission_id, amount, created_at)
          VALUES(${r.user_id}, ${e}, 'daily_5_rounds', ${250}, ${a})
          ON CONFLICT DO NOTHING
        `;if(0===n.count)throw Error("ALREADY_CLAIMED");let[s]=await t`
          SELECT COALESCE(SUM(amount), 0) as sum FROM ledger_entries WHERE user_id = ${r.user_id}
        `;i=(s?Number(s.sum):0)+250,await t`
          UPDATE players
          SET updated_at = ${a}
          WHERE user_id = ${r.user_id}
        `,await t`INSERT INTO ledger_entries(id, user_id, type, amount, balance_after, created_at)
          VALUES(${crypto.randomUUID()}, ${r.user_id}, 'daily_mission', ${250}, ${i}, ${a})`}),v({ok:!0,amount:250,balance:i,missionClaimed:!0})}if("deal_blackjack"===a.action)return $(r,t,a);if("blackjack"===a.action)return f(r,t,a);if("start_mines"===a.action)return N(r,t,a);if("mines"===a.action)return S(r,t,a);return R(r,t,a)}catch(e){if(e instanceof Error&&"UNAUTHORIZED"===e.message)return v({error:"Zaloguj się przez Authentik, aby zagrać."},401);if(e instanceof Error&&("ALREADY_CLAIMED"===e.message||"ROUND_ALREADY_SETTLED"===e.message))return v({error:"Akcja została już przetworzona."},409);if(e instanceof Error&&"INSUFFICIENT_FUNDS"===e.message)return v({error:"Niewystarczające saldo żetonów."},400);return v({error:e instanceof Error?e.message:"Błąd serwera"},500)}}async function R(e,t,a){let r,i=String(a.game||"");if(!["roulette","slots"].includes(i))return v({error:"Nieznana gra."},400);let n=d(a,e);if(!n.ok)return n.fraud?u(e,t,n.reason):v({error:n.reason},400);let s=n.bet,o=0,l="";if("roulette"===i){let e=k(37),t=0===e?"green":h.has(e)?"red":"black",i=String(a.choice||"red"),n=/^\d+$/.test(i),u=n?Number(i)===e:i===t;if("even"===i&&(u=e>0&&e%2==0),"odd"===i&&(u=e%2==1),"low"===i&&(u=e>=1&&e<=18),"high"===i&&(u=e>=19&&e<=36),i.startsWith("dozen")){let t=Number(i.slice(5));u=e>0&&Math.ceil(e/12)===t}let d=n?36:i.startsWith("dozen")?3:2;o=u?s*d:0,l=`${e} \xb7 ${t}`,r={number:e,color:t,choice:i,multiplier:d}}else{let e=Array.from({length:5},()=>Array.from({length:3},()=>U[k(U.length)])),t=e.map(e=>e[1]),a=new Map;t.forEach(e=>a.set(e,(a.get(e)||0)+1));let i=Math.max(...a.values());l=(o=i>=3?s*(5===i?12:4===i?6:2):0)?`Wygrana \xd7${o/s}`:"Brak wygranej",r={reels:e,winning:i>=3}}return T(e,t,i,s,o,l,r)}async function $(e,t,a){let r=d(a,e);if(!r.ok)return r.fraud?u(e,t,r.reason):v({error:r.reason},400);let i=r.bet,[n]=await t`
    SELECT id FROM game_rounds WHERE user_id = ${e.user_id} AND state = 'active'
  `;if(n)return v({error:"Najpierw dokończ aktywną rundę."},409);let s=[p(),p()],o=[p(),p()],l=crypto.randomUUID(),c=Date.now(),E={cards:s,dealer:o,actions:["hit","stand"]},_=0;return(await t.begin(async t=>{await t`SELECT nick FROM players WHERE user_id = ${e.user_id} FOR UPDATE`;let[a]=await t`
      SELECT COALESCE(SUM(amount), 0) as sum FROM ledger_entries WHERE user_id = ${e.user_id}
    `,r=a?Number(a.sum):0;if(r<i)throw Error("INSUFFICIENT_FUNDS");_=r-i,await t`
      UPDATE players
      SET updated_at = ${c}
      WHERE user_id = ${e.user_id}
    `,await t`INSERT INTO game_rounds(id, user_id, game, state, bet, payout, result, payload, revision, created_at)
      VALUES(${l}, ${e.user_id}, 'blackjack', 'active', ${i}, 0, 'W toku', ${JSON.stringify(E)}, 1, ${c})`,await t`INSERT INTO ledger_entries(id, user_id, round_id, type, amount, balance_after, created_at)
      VALUES(${crypto.randomUUID()}, ${e.user_id}, ${l}, 'bet', ${-i}, ${_}, ${c})`}),21===m(s)||21===m(o))?b(e,t,l,{...E},2,_):v({ok:!0,round:w({id:l,game:"blackjack",bet:i,state:"active",payload:E}),balance:_})}async function f(e,t,a){let r=String(a.roundId||""),i=String(a.move||"");return["hit","stand","double"].includes(i)?await t.begin(async a=>{let[n]=await a`
      SELECT * FROM game_rounds WHERE id = ${r} AND user_id = ${e.user_id} AND state = 'active' FOR UPDATE
    `;if(!n)return v({error:"Aktywna runda nie istnieje."},404);let s=JSON.parse(n.payload);if("double"===i){if(2!==s.cards.length)return u(e,t,"Próba podwojenia po dobraniu dodatkowych kart");await a`SELECT nick FROM players WHERE user_id = ${e.user_id} FOR UPDATE`;let[i]=await a`
        SELECT COALESCE(SUM(amount), 0) as sum FROM ledger_entries WHERE user_id = ${e.user_id}
      `,o=i?Number(i.sum):0;if(o<n.bet)return v({error:"Za mało żetonów na podwojenie."},400);let d=Date.now(),l=o-n.bet,c=await a`
        UPDATE game_rounds
        SET bet = bet * 2, revision = revision + 1
        WHERE id = ${n.id} AND revision = ${n.revision} AND state = 'active'
      `;if(0===c.count)throw Error("ROUND_ALREADY_SETTLED");return await a`
        UPDATE players
        SET updated_at = ${d}
        WHERE user_id = ${e.user_id}
      `,await a`INSERT INTO ledger_entries(id, user_id, round_id, type, amount, balance_after, created_at)
        VALUES(${crypto.randomUUID()}, ${e.user_id}, ${n.id}, 'double', ${-n.bet}, ${l}, ${d})`,n.bet*=2,s.cards.push(p()),b(e,a,r,s,n.revision+2,l)}return"hit"===i&&(s.cards.push(p()),21>m(s.cards))?(await a`
          UPDATE game_rounds SET payload = ${JSON.stringify(s)}, revision = revision + 1 WHERE id = ${r} AND revision = ${n.revision} AND state = 'active'
        `,v({ok:!0,round:w({...n,payload:s,revision:n.revision+1})})):b(e,a,r,s,n.revision+1,e.balance)}):v({error:"Nieprawidłowy ruch."},400)}async function b(e,t,a,r,i,n){let[s]=await t`
    SELECT * FROM game_rounds WHERE id = ${a} AND user_id = ${e.user_id} AND state = 'active' FOR UPDATE
  `;if(!s)return v({error:"Runda nie istnieje lub została już zakończona."},404);for(;17>m(r.dealer);)r.dealer.push(p());let o=m(r.cards),u=m(r.dealer),d=o<=21&&(u>21||o>u)?21===o&&2===r.cards.length?Math.floor(2.5*s.bet):2*s.bet:o===u&&o<=21?s.bet:0,l=Math.min(252e3,d),c=l>s.bet?"Wygrana":l===s.bet?"Remis":"Przegrana";return A(e,t,s,l,c,r,n,i)}async function N(e,t,a){let r=d(a,e);if(!r.ok)return r.fraud?u(e,t,r.reason):v({error:r.reason},400);let i=r.bet,n=a.mines;if(void 0!==n&&("number"!=typeof n||!Number.isInteger(n)||n<2||n>12))return u(e,t,`Niedozwolona liczba min: ${n}`);let s=Math.floor(Number(n)||5),[o]=await t`
    SELECT id FROM game_rounds WHERE user_id = ${e.user_id} AND state = 'active'
  `;if(o)return v({error:"Najpierw dokończ aktywną rundę."},409);let l=new Set;for(;l.size<s;)l.add(k(25));let c={mines:[...l],revealed:[],mineCount:s,multiplier:1},E=crypto.randomUUID(),_=Date.now(),p=0;return await t.begin(async t=>{await t`SELECT nick FROM players WHERE user_id = ${e.user_id} FOR UPDATE`;let[a]=await t`
      SELECT COALESCE(SUM(amount), 0) as sum FROM ledger_entries WHERE user_id = ${e.user_id}
    `,r=a?Number(a.sum):0;if(r<i)throw Error("INSUFFICIENT_FUNDS");p=r-i,await t`
      UPDATE players
      SET updated_at = ${_}
      WHERE user_id = ${e.user_id}
    `,await t`INSERT INTO game_rounds(id, user_id, game, state, bet, payout, result, payload, revision, created_at)
      VALUES(${E}, ${e.user_id}, 'mines', 'active', ${i}, 0, 'W toku', ${JSON.stringify(c)}, 1, ${_})`,await t`INSERT INTO ledger_entries(id, user_id, round_id, type, amount, balance_after, created_at)
      VALUES(${crypto.randomUUID()}, ${e.user_id}, ${E}, 'bet', ${-i}, ${p}, ${_})`}),v({ok:!0,round:{id:E,game:"mines",bet:i,state:"active",payload:{...c,mines:[]}},balance:p})}async function S(e,t,a){let r=String(a.roundId||""),i="cashout"===String(a.move),n=a.tile;if(!i&&("number"!=typeof n||!Number.isInteger(n)||n<0||n>24))return u(e,t,`Nieprawidłowe pole w Saperze: ${n}`);let s=Number(n);return await t.begin(async a=>{let[n]=await a`
      SELECT * FROM game_rounds WHERE id = ${r} AND user_id = ${e.user_id} AND state = 'active' FOR UPDATE
    `;if(!n)return v({error:"Aktywna runda nie istnieje."},404);let o=JSON.parse(n.payload);if(i){if(!o.revealed.length)return u(e,t,"Próba cashoutu bez odkrycia żadnego pola");let r=Math.floor(n.bet*o.multiplier),i=Math.min(252e3,r);return A(e,a,n,i,`Cash-out \xd7${o.multiplier.toFixed(2)}`,o,e.balance,n.revision+1)}if(o.revealed.includes(s))return v({error:"Pole już odkryte."},400);if(o.mines.includes(s))return A(e,a,n,0,"Trafiona mina",o,e.balance,n.revision+1);if(o.revealed.push(s),o.multiplier=function(e,t){let a=1;for(let r=0;r<e;r++)a*=(25-t-r)/(25-r);let r=.97/a,i=Math.max(0,r-1)*(t>=5?1:.25+(t-2)/3*.75);return Math.max(1,Math.floor((1+i)*100)/100)}(o.revealed.length,o.mineCount),o.revealed.length===25-o.mineCount){let t=Math.floor(n.bet*o.multiplier),r=Math.min(252e3,t);return A(e,a,n,r,`Maksymalna wygrana \xd7${o.multiplier.toFixed(2)}`,o,e.balance,n.revision+1)}return await a`
      UPDATE game_rounds SET payload = ${JSON.stringify(o)}, revision = revision + 1 WHERE id = ${n.id} AND revision = ${n.revision} AND state = 'active'
    `,v({ok:!0,round:{...n,payload:{...o,mines:[]},revision:n.revision+1}})})}async function T(e,t,a,r,i,n,s){let o=crypto.randomUUID(),u=Date.now(),d=Math.min(252e3,Math.max(0,Number(i))),c=d-Number(r),E=e.xp+10,_=1+Math.floor(E/500),p=0;await t.begin(async t=>{await t`SELECT nick FROM players WHERE user_id = ${e.user_id} FOR UPDATE`;let[i]=await t`
      SELECT COALESCE(SUM(amount), 0) as sum FROM ledger_entries WHERE user_id = ${e.user_id}
    `,l=i?Number(i.sum):0;if(l<r)throw Error("INSUFFICIENT_FUNDS");p=l+c,await t`
      UPDATE players
      SET xp = ${E}, level = ${_}, updated_at = ${u}
      WHERE user_id = ${e.user_id}
    `,await t`INSERT INTO game_rounds(id, user_id, game, state, bet, payout, result, payload, revision, created_at, settled_at)
      VALUES(${o}, ${e.user_id}, ${a}, 'settled', ${r}, ${d}, ${n}, ${JSON.stringify(s)}, 1, ${u}, ${u})`,await t`INSERT INTO ledger_entries(id, user_id, round_id, type, amount, balance_after, created_at)
      VALUES(${crypto.randomUUID()}, ${e.user_id}, ${o}, 'round', ${c}, ${p}, ${u})`});let m=await l(t,e.user_id);return v({ok:!0,round:{id:o,game:a,bet:r,payout:d,result:n,payload:s,state:"settled"},balance:p,xp:E,level:_,roundsToday:m})}async function A(e,t,a,r,i,n,s,u){let d=Date.now(),c=e.xp+10,E=1+Math.floor(c/500),_=Math.min(252e3,Math.max(0,Number(r))),p=0;await o(t,async t=>{let r=await t`
      UPDATE game_rounds
      SET state = 'settled', payout = ${_}, result = ${i}, payload = ${JSON.stringify(n)}, revision = ${u}, settled_at = ${d}
      WHERE id = ${a.id} AND state = 'active'
    `;if(0===r.count)throw Error("ROUND_ALREADY_SETTLED");await t`SELECT nick FROM players WHERE user_id = ${e.user_id} FOR UPDATE`;let[s]=await t`
      SELECT COALESCE(SUM(amount), 0) as sum FROM ledger_entries WHERE user_id = ${e.user_id}
    `;p=(s?Number(s.sum):0)+_,await t`
      UPDATE players
      SET xp = ${c}, level = ${E}, updated_at = ${d}
      WHERE user_id = ${e.user_id}
    `,await t`INSERT INTO ledger_entries(id, user_id, round_id, type, amount, balance_after, created_at)
      VALUES(${crypto.randomUUID()}, ${e.user_id}, ${a.id}, 'payout', ${_}, ${p}, ${d})`});let m=await l(t,e.user_id);return v({ok:!0,round:{...a,state:"settled",payout:_,result:i,payload:n},balance:p,xp:c,level:E,roundsToday:m})}e.s(["GET",0,y,"MAX_BET",0,7e3,"MAX_PAYOUT",0,252e3,"MIN_BET",0,1,"POST",0,g]),a()}catch(e){a(e)}},!1),32463,e=>e.a(async(t,a)=>{try{var r=e.i(2366),i=e.i(28116),n=e.i(42514),s=e.i(70649),o=e.i(34020),u=e.i(75971),d=e.i(41739),l=e.i(62614),c=e.i(75398),E=e.i(87389),_=e.i(76544),p=e.i(75402),m=e.i(75078),w=e.i(98716),y=e.i(42084),g=e.i(93695);e.i(43043);var R=e.i(70181),$=e.i(66091),f=t([$]);[$]=f.then?(await f)():f;let N=new r.AppRouteRouteModule({definition:{kind:i.RouteKind.APP_ROUTE,page:"/api/casino/route",pathname:"/api/casino",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/casino/route.ts",nextConfigOutput:"standalone",userland:$,...{}}),{workAsyncStorage:S,workUnitAsyncStorage:T,serverHooks:A}=N;async function b(e,t,a){a.requestMeta&&(0,s.setRequestMeta)(e,a.requestMeta),N.isDev&&(0,s.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let r="/api/casino/route";r=r.replace(/\/index$/,"")||"/";let n=await N.prepare(e,t,{srcPage:r,multiZoneDraftMode:!1});if(!n)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:$,deploymentId:f,params:b,nextConfig:S,parsedUrl:T,isDraftMode:A,prerenderManifest:h,routerServerContext:O,isOnDemandRevalidate:D,revalidateOnlyGenerated:U,resolvedPathname:k,clientReferenceManifest:v,serverActionsManifest:I}=n,C=(0,d.normalizeAppPath)(r),M=!!(h.dynamicRoutes[C]||h.routes[k]),L=async()=>((null==O?void 0:O.render404)?await O.render404(e,t,T,!1):t.end("This page could not be found"),null);if(M&&!A){let e=!!h.routes[k],t=h.dynamicRoutes[C];if(t&&!1===t.fallback&&!e){if(S.adapterPath)return await L();throw new g.NoFallbackError}}let F=null;!M||N.isDev||A||(F=k,F="/index"===F?"/":F);let H=!0===N.isDev||!M,P=M&&!H;I&&v&&(0,u.setManifestsSingleton)({page:r,clientReferenceManifest:v,serverActionsManifest:I});let x=e.method||"GET",W=(0,o.getTracer)(),z=W.getActiveScopeSpan(),j=!!(null==O?void 0:O.isWrappedByNextServer),V=!!(0,s.getRequestMeta)(e,"minimalMode"),q=(0,s.getRequestMeta)(e,"incrementalCache")||await N.getIncrementalCache(e,S,h,V);null==q||q.resetRequestCache(),globalThis.__incrementalCache=q;let B={params:b,previewProps:h.preview,renderOpts:{experimental:{authInterrupts:!!S.experimental.authInterrupts},cacheComponents:!!S.cacheComponents,supportsDynamicResponse:H,incrementalCache:q,cacheLifeProfiles:S.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,a,r,i)=>N.onRequestError(e,t,r,i,O)},sharedContext:{buildId:$,deploymentId:f}},J=new l.NodeNextRequest(e),Y=new l.NodeNextResponse(t),Z=c.NextRequestAdapter.fromNodeNextRequest(J,(0,c.signalFromNodeResponse)(t));try{let n,s=async e=>N.handle(Z,B).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let a=W.getRootSpanAttributes();if(!a)return;if(a.get("next.span_type")!==E.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${a.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let i=a.get("next.route");if(i){let t=`${x} ${i}`;e.setAttributes({"next.route":i,"http.route":i,"next.span_name":t}),e.updateName(t),n&&n!==e&&(n.setAttribute("http.route",i),n.updateName(t))}else e.updateName(`${x} ${r}`)}),u=async n=>{var o,u;let d=async({previousCacheEntry:i})=>{try{if(!V&&D&&U&&!i)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let r=await s(n);e.fetchMetrics=B.renderOpts.fetchMetrics;let o=B.renderOpts.pendingWaitUntil;o&&a.waitUntil&&(a.waitUntil(o),o=void 0);let u=B.renderOpts.collectedTags;if(!M)return await (0,p.sendResponse)(J,Y,r,B.renderOpts.pendingWaitUntil),null;{let e=await r.blob(),t=(0,m.toNodeOutgoingHttpHeaders)(r.headers);u&&(t[y.NEXT_CACHE_TAGS_HEADER]=u),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let a=void 0!==B.renderOpts.collectedRevalidate&&!(B.renderOpts.collectedRevalidate>=y.INFINITE_CACHE)&&B.renderOpts.collectedRevalidate,i=void 0===B.renderOpts.collectedExpire||B.renderOpts.collectedExpire>=y.INFINITE_CACHE?void 0:B.renderOpts.collectedExpire;return{value:{kind:R.CachedRouteKind.APP_ROUTE,status:r.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:a,expire:i}}}}catch(t){throw(null==i?void 0:i.isStale)&&await N.onRequestError(e,t,{routerKind:"App Router",routePath:r,routeType:"route",revalidateReason:(0,_.getRevalidateReason)({isStaticGeneration:P,isOnDemandRevalidate:D})},!1,O),t}},l=await N.handleResponse({req:e,nextConfig:S,cacheKey:F,routeKind:i.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:h,isRoutePPREnabled:!1,isOnDemandRevalidate:D,revalidateOnlyGenerated:U,responseGenerator:d,waitUntil:a.waitUntil,isMinimalMode:V});if(!M)return null;if((null==l||null==(o=l.value)?void 0:o.kind)!==R.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(u=l.value)?void 0:u.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});V||t.setHeader("x-nextjs-cache",D?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),A&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let c=(0,m.fromNodeOutgoingHttpHeaders)(l.value.headers);return V&&M||c.delete(y.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||t.getHeader("Cache-Control")||c.get("Cache-Control")||c.set("Cache-Control",(0,w.getCacheControlHeader)(l.cacheControl)),await (0,p.sendResponse)(J,Y,new Response(l.value.body,{headers:c,status:l.value.status||200})),null};j&&z?await u(z):(n=W.getActiveScopeSpan(),await W.withPropagatedContext(e.headers,()=>W.trace(E.BaseServerSpan.handleRequest,{spanName:`${x} ${r}`,kind:o.SpanKind.SERVER,attributes:{"http.method":x,"http.target":e.url}},u),void 0,!j))}catch(t){if(t instanceof g.NoFallbackError||await N.onRequestError(e,t,{routerKind:"App Router",routePath:C,routeType:"route",revalidateReason:(0,_.getRevalidateReason)({isStaticGeneration:P,isOnDemandRevalidate:D})},!1,O),M)throw t;return await (0,p.sendResponse)(J,Y,new Response(null,{status:500})),null}}e.s(["handler",0,b,"patchFetch",0,function(){return(0,n.patchFetch)({workAsyncStorage:S,workUnitAsyncStorage:T})},"routeModule",0,N,"serverHooks",0,A,"workAsyncStorage",0,S,"workUnitAsyncStorage",0,T]),a()}catch(e){a(e)}},!1)];

//# sourceMappingURL=_0qmh8wo._.js.map