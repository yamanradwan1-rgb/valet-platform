import test from "node:test";
import assert from "node:assert/strict";
import {
  guardedSqlConnection, leaseValidUntil, SQL_STATEMENT_TIMEOUT_MS,
  SQL_LEASE_MARGIN_MS,
} from "./v3-sql-lease-watchdog.mjs";

const LEASE_ID = "issue300-r2-w6-v3-offline-proof";
// An intentionally blocked mocked query must never strand a test process if
// the production watchdog regresses. Each offline test has its own hard limit.
const boundedTest=(name,fn)=>test(name,{timeout:2500},async()=>{
  let deadline;
  try {
    return await Promise.race([
      fn(),
      new Promise((_,reject)=>{
        deadline=setTimeout(()=>reject(new Error("OFFLINE_TEST_WATCHDOG_TIMEOUT")),1500);
      }),
    ]);
  } finally {if(deadline)clearTimeout(deadline);}
});
function harness({ expiryMs=60000, startMs=0 }={}) {
  let clock=startMs, signedId=LEASE_ID, validSignature=true, ticker;
  let destroyed=0, ended=0, called=0, queryHang;
  const client={
    connection:{stream:{destroy(){ destroyed++; }}},
    async connect(){},
    async query(statement){
      called++;
      if(statement==="HANG")return new Promise(resolve=>{
        const max=setTimeout(()=>resolve({rows:[{status:"MOCK_QUERY_TIMEOUT"}]}),500);
        queryHang=outcome=>{clearTimeout(max);resolve(outcome);};
      });
      return {rows:[{status:statement}]};
    },
    async end(){ ended++; },
  };
  const checker=()=>{
    if(!validSignature)throw new Error("Unsigned/stale Owner lease");
    return {leaseId:signedId,expiresAt:new Date(expiryMs).toISOString()};
  };
  const guard=guardedSqlConnection(client,{
    assertCurrentLease:checker,
    leaseId:LEASE_ID,
    now:()=>clock,
    tickMs:100,
    setPoll(fn){ticker=fn;return 1;},
    clearPoll(){ticker=null;},
  });
  return {client,guard,
    get called(){return called;},get destroyed(){return destroyed;},get ended(){return ended;},
    setClock(v){clock=v;},setExpiry(v){expiryMs=v;},
    tamper(){validSignature=false;},swapLease(){signedId=LEASE_ID+"-different";},
    tick(){assert(ticker);ticker();},
    releaseQuery(){assert(queryHang);queryHang({rows:[{status:"LATE"}]});},
  };
}

boundedTest("positive signed lease permits multiple transactional queries and closes",async()=>{
  const h=harness();
  const result=await h.guard.run(async(c)=>{
    await c.query("BEGIN");
    await c.query("INSERT");
    await c.query("COMMIT");
    return "COMMITTED";
  });
  assert.equal(result,"COMMITTED");
  assert.equal(h.called,3);
  await h.guard.close();
  assert.equal(h.destroyed,0);
  assert.equal(h.ended,1);
});

boundedTest("before connection reject expired lease and send no SQL",async()=>{
  const h=harness({expiryMs:15000});
  await assert.rejects(h.guard.run(async(c)=>c.query("BEGIN")),/insufficient SQL time margin/);
  assert.equal(h.called,0);
  assert.equal(h.destroyed,1);
  await h.guard.close();
});

boundedTest("before NEXT query verify signed lease and 18-second statement budget",async()=>{
  const h=harness();
  await assert.rejects(h.guard.run(async(c)=>{
    await c.query("BEGIN");
    h.setClock(43000);
    await c.query("COMMIT");
  }),/insufficient SQL time margin/);
  assert.equal(h.called,1);
  assert.equal(h.destroyed,1);
  await h.guard.close();
});

boundedTest("watchdog expires connection mid-running SQL, no late completion PASS",async()=>{
  const h=harness();
  const pending=h.guard.run(async(c)=>{
    await c.query("BEGIN");
    await c.query("HANG");
    return "INVALID_LATE_PASS";
  });
  await new Promise(setImmediate);
  h.setClock(60000);
  h.tick();
  await assert.rejects(pending,/lease expired or insufficient SQL time margin/);
  assert.equal(h.destroyed,1);
  h.releaseQuery();
  await h.guard.close();
  assert.equal(h.called,2);
});

boundedTest("watchdog expires during non-SQL work within a multiquery transaction",async()=>{
  const h=harness();
  let resolveWork;
  const pending=h.guard.run(async(c)=>{
    await c.query("BEGIN");
    await new Promise(r=>{resolveWork=r;});
    await c.query("COMMIT");
    return "UNAUTHORIZED_SUCCESS";
  });
  await new Promise(setImmediate);
  assert.equal(h.called,1);
  h.setClock(60001);
  h.tick();
  await assert.rejects(pending,/lease expired/);
  resolveWork();
  await new Promise(setImmediate);
  assert.equal(h.called,1);
  assert.equal(h.destroyed,1);
  await h.guard.close();
});

boundedTest("W12 regression: rejected callback then close then resumed COMMIT never reaches raw client",async()=>{
  const h=harness();
  let releaseWork, completeLate;
  const lateResult=new Promise(resolve=>{completeLate=resolve;});
  const pending=h.guard.run(async(c)=>{
    await c.query("BEGIN");
    await new Promise(resolve=>{releaseWork=resolve;});
    try {
      await c.query("COMMIT");
      completeLate("UNAUTHORIZED_COMMIT");
    } catch(error) {
      completeLate(error.code);
    }
  });
  await new Promise(setImmediate);
  assert.equal(h.called,1);
  h.setClock(60001);
  h.tick();
  await assert.rejects(pending,/lease expired/);
  await h.guard.close();
  const rawCallsAfterClose=h.called;
  releaseWork();
  assert.equal(await lateResult,"W6_V3_SQL_LEASE_ABORT");
  assert.equal(h.called,rawCallsAfterClose);
  assert.equal(h.called,1);
  await assert.rejects(h.client.query("COMMIT"),/lease rejected/);
  assert.equal(h.called,1);
});

boundedTest("normal close permanently denies a callback resumed after close",async()=>{
  const h=harness();
  let releaseWork, completeLate;
  const lateResult=new Promise(resolve=>{completeLate=resolve;});
  const pending=h.guard.run(async(c)=>{
    await c.query("BEGIN");
    await new Promise(resolve=>{releaseWork=resolve;});
    try {await c.query("COMMIT");completeLate("UNAUTHORIZED_COMMIT");}
    catch(error) {completeLate(error.code);}
  });
  await new Promise(setImmediate);
  await h.guard.close();
  const rawCallsAfterClose=h.called;
  releaseWork();
  assert.equal(await lateResult,"W6_V3_SQL_LEASE_ABORT");
  await assert.rejects(pending,/connection permanently closed/);
  assert.equal(h.called,rawCallsAfterClose);
  assert.equal(h.called,1);
});

boundedTest("watchdog revokes signed Owner lease upon signature tampering or lease swap",async()=>{
  for(const revoke of ["tamper","swapLease"]){
    const h=harness();
    let release;
    const pending=h.guard.run(async(c)=>{
      await c.query("BEGIN");
      await new Promise(r=>{release=r;});
      await c.query("COMMIT");
    });
    await new Promise(setImmediate);
    h[revoke]();
    h.tick();
    await assert.rejects(pending,/signed Owner SQL lease rejected/);
    release();
    await new Promise(setImmediate);
    assert.equal(h.called,1);
    assert.equal(h.destroyed,1);
    await h.guard.close();
  }
});

boundedTest("post-callback check rejects expiry without an additional SQL query",async()=>{
  const h=harness();
  const pending=h.guard.run(async(c)=>{
    await c.query("BEGIN");
    h.setClock(60000);
    return {falselySuccessful:true};
  });
  await assert.rejects(pending,/lease expired/);
  assert.equal(h.destroyed,1);
  await h.guard.close();
});

boundedTest("signed authority continues to be watched during slow connection close",async()=>{
  const h=harness();
  await h.guard.run(async(c)=>c.query("BEGIN"));
  h.client.end=()=>new Promise(()=>{});
  const closing=h.guard.close();
  await new Promise(setImmediate);
  h.setClock(60001);
  h.tick();
  await assert.rejects(closing,/lease expired/);
  assert.equal(h.destroyed,1);
});

boundedTest("every direct query revalidates signed bytes before it reaches PostgreSQL",async()=>{
  const h=harness();
  await assert.rejects(h.guard.run(async(c)=>{
    await c.query("BEGIN");
    h.tamper();
    await c.query("COMMIT");
  }),/signed Owner SQL lease rejected/);
  assert.equal(h.called,1);
  assert.equal(h.destroyed,1);
  await h.guard.close();
});

boundedTest("expiry margin uses entire 15s statement timeout plus 3s safety margin",()=>{
  assert.equal(SQL_STATEMENT_TIMEOUT_MS,15000);
  assert.equal(SQL_LEASE_MARGIN_MS,3000);
  const checker=()=>({leaseId:LEASE_ID,expiresAt:new Date(18000).toISOString()});
  assert.equal(leaseValidUntil(checker,()=>0,LEASE_ID,18000),18000);
  assert.throws(()=>leaseValidUntil(checker,()=>1,LEASE_ID,18000),
    /insufficient SQL time margin/);
});
