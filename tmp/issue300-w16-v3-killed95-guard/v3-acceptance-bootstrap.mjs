export function createBootstrap(ctx){
  const { assert, names, checkSourceBoundary, validateSignedLease, admissionSamples, inspect, run, output, dockerName, volume, port, label, owner, role, anchorSha, dbs, image, assertOwned, sql, state, privateFile, manifestFile, existsSync, writeFileSync, chmodSync, randomBytes, net } = ctx;
function savePrivate(){
  assert(!existsSync(privateFile),"V3 private file already present");
  writeFileSync(privateFile,JSON.stringify({name:dockerName,volume,label,port,owner,
    dbs,role,ownerPassword:state.secrets.ownerPassword,runtimePassword:state.secrets.runtimePassword},
  null,2),{flag:"wx",mode:0o600});
  chmodSync(privateFile,0o600);
  if(process.platform==="win32"){
    const principal=run("whoami",[]);
    run("icacls",[privateFile,"/inheritance:r","/grant:r",principal+":(F)"]);
  }
}
async function portFree(){
  const server=net.createServer();
  await new Promise((done,fail)=>server.once("error",fail).listen(port,"127.0.0.1",done));
  await new Promise(done=>server.close(done));
}
async function launch(){
  assert(names.length===96,"Source migrations not 96");
  state.currentSha=checkSourceBoundary();
  state.lease=validateSignedLease();
  const resourceMeasurements=await admissionSamples();
  // Signed owner lease may expire during safety samples.
  assert(validateSignedLease().leaseId===state.lease.leaseId,
    "Signed owner lease invalid after measured safety sampling");
  assert(!inspect()&&!existsSync(privateFile),"V3 Docker/private resource already present");
  try{run("docker",["volume","inspect",volume]);throw Error("Volume already exists");}catch(e){
    if(e.message==="Volume already exists")throw e;
  }
  await portFree();
  output("preflight","PASS",{sourceAnchor:anchorSha,actualIntegrationHead:state.currentSha,
    ownerLeaseId:state.lease.leaseId,ownerLeaseExpiresAt:state.lease.expiresAt,
    migrationFilesIdentical:true,safetySamples:resourceMeasurements,port,dockerName,volume});
  state.secrets={ownerPassword:randomBytes(32).toString("hex"),runtimePassword:randomBytes(32).toString("hex")};
  savePrivate();
  run("docker",["volume","create","--label","com.vaylet.task="+label,volume]);
  const env={...process.env,POSTGRES_USER:owner,POSTGRES_DB:dbs.upgrade,
    POSTGRES_PASSWORD:state.secrets.ownerPassword};
  run("docker",["run","-d","--name",dockerName,
    "--label","com.vaylet.task="+label,"--label","com.vaylet.owner=w6",
    "--label","com.vaylet.source-anchor="+anchorSha,
    "--mount","type=volume,source="+volume+",target=/var/lib/postgresql/data",
    "-p","127.0.0.1:"+port+":5432","--memory","384m","--memory-swap","512m",
    "--cpus","0.7","-e","POSTGRES_USER="+owner,"-e","POSTGRES_DB="+dbs.upgrade,
    "-e","POSTGRES_PASSWORD="+state.secrets.ownerPassword,image,
    "-c","shared_buffers=32MB","-c","max_connections=18","-c","work_mem=1MB",
    "-c","maintenance_work_mem=32MB"],env,60000);
  state.dockerId=assertOwned(inspect(),true);state.ownership=true;
  let ready=false;
  for(let n=0;n<35;n++){
    try{
      const actual=await sql(dbs.upgrade,async(c)=>(await c.query("SELECT current_user AS who,current_database() AS db,current_setting('server_version_num')::int AS v")).rows[0]);
      assert(actual.who===owner&&actual.db===dbs.upgrade&&actual.v===170010,"Unexpected PG identity");
      ready=true;break;
    }catch{await new Promise(r=>setTimeout(r,600));}
  }
  assert(ready,"V3 auth bootstrap P1000/PG17.10 identity mismatch");
  writeFileSync(manifestFile,JSON.stringify({sourceSha:anchorSha,actualIntegrationHead:state.currentSha,dockerId:state.dockerId,name:dockerName,
    label,volume,port,dbs,owner,role,postgres:"17.10",memoryMiB:384,cpuLimit:0.7,
    privateFileRelative:"tmp/issue300-r2-w6-v3-owned/pg-private-v3.json"},null,2),{flag:"wx",mode:0o600});
  output("new_v3_resource","PASS",{dockerId:state.dockerId,name:dockerName,label,volume,
    port,postgres:"17.10",owner,role,databases:dbs});
}
async function createDb(name){
  await sql(dbs.upgrade,c=>c.query('CREATE DATABASE "'+name+'"'));
}
  return { launch, createDb };
}
