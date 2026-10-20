import assert from "node:assert/strict";

// Every declared reader must actually serve all four HTTP workloads for the
// whole ten-minute interval. Aggregate sample counts cannot hide idle clients.
export function assertReaderCoverage(raw, readers, startedAt, finishedAt,
  endpoints, minSuccess=1000) {
  assert(Number.isInteger(readers) && readers>=1);
  const start=Date.parse(startedAt), finish=Date.parse(finishedAt);
  assert(Number.isFinite(start) && Number.isFinite(finish));
  assert(finish-start>=600_000,"Real reader phase shorter than 10 minutes");
  assert.deepEqual(Object.keys(raw).sort(),[...endpoints].sort());
  const buckets=Array.from({length:readers},()=>[]);
  for(const endpoint of endpoints){
    const rows=raw[endpoint];
    assert(Array.isArray(rows));
    assert(rows.filter((r)=>r.status===200).length>=minSuccess,
      `Insufficient actual successful ${endpoint} HTTP samples`);
    for(const sample of rows){
      assert(Number.isInteger(sample.reader) &&
        sample.reader>=0 && sample.reader<readers);
      assert(sample.status===200,"Reader HTTP non-200 is not acceptable");
      assert(Number.isFinite(sample.elapsedMs) && sample.elapsedMs>=0);
      assert(Number.isFinite(sample.epochMs) &&
        sample.epochMs>=start && sample.epochMs<=finish+1000);
      buckets[sample.reader].push({...sample,endpoint});
    }
  }
  for(const [index,rows] of buckets.entries()){
    assert(rows.length>=20,`Declared reader ${index} did not run`);
    assert.deepEqual(new Set(rows.map((r)=>r.endpoint)),new Set(endpoints),
      `Declared reader ${index} skipped an endpoint`);
    rows.sort((a,b)=>a.epochMs-b.epochMs);
    assert(rows[0].epochMs-start<=30_000,
      `Declared reader ${index} started too late`);
    assert(finish-rows.at(-1).epochMs<=30_000,
      `Declared reader ${index} ended early`);
    for(let j=1;j<rows.length;j++)
      assert(rows[j].epochMs-rows[j-1].epochMs<=45_000,
        `Declared reader ${index} inactive for over 45 seconds`);
  }
  return {readers,successfulSamples:Object.fromEntries(endpoints.map((key)=>
    [key,raw[key].length]))};
}
