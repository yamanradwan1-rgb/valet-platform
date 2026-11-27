import assert from "node:assert/strict";
import {test} from "node:test";

import {
  classifyRatingFeedbackGrants,
  assertRatingFeedbackTransition,
} from "./rating-feedback-provision-state.mjs";

const dormant={guestBearer:false,guestBrowser:false,phase:false,
  approveNotice:false,revokeNotice:false,approveDisposition:false,
  applyDisposition:false,expire:false,reader:false,nested:false};
const p2={...dormant,guestBearer:true,guestBrowser:true,phase:true,
  approveNotice:true,revokeNotice:true,approveDisposition:true,
  applyDisposition:true,expire:true};
const p5={...p2,reader:true,nested:true};

test("grant matrix identifies exact dormant P2_TEST/P5_TEST stages",()=>{
  assert.equal(classifyRatingFeedbackGrants(dormant),"PREPARE");
  assert.equal(classifyRatingFeedbackGrants(p2),"P2_TEST");
  assert.equal(classifyRatingFeedbackGrants(p5),"P5_TEST");
  assert.throws(()=>classifyRatingFeedbackGrants({...p5,nested:false}),
    /partial|unexpected/);
  assert.throws(()=>classifyRatingFeedbackGrants({...p2,revokeNotice:false}),
    /partial|unexpected/);
  assert.throws(()=>classifyRatingFeedbackGrants({...dormant,reader:true}),
    /partial|unexpected/);
});

test("only forward monotonic disposable transitions/replays allowed",()=>{
  assertRatingFeedbackTransition("PREPARE","P2_TEST");
  assertRatingFeedbackTransition("P2_TEST","P2_TEST");
  assertRatingFeedbackTransition("P2_TEST","P5_TEST");
  assertRatingFeedbackTransition("P5_TEST","P5_TEST");
  assert.throws(()=>assertRatingFeedbackTransition("PREPARE","P5_TEST"),
    /stage/);
  assert.throws(()=>assertRatingFeedbackTransition("P5_TEST","P2_TEST"),
    /stage/);
  assert.throws(()=>assertRatingFeedbackTransition("P5_TEST","PREPARE"),
    /stage/);
  assert.throws(()=>assertRatingFeedbackTransition("PREPARE","RELEASE"),
    /release/);
});
