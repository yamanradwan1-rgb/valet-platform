import {describe,expect,it,vi} from "vitest";

import {RuntimeDatabaseUnavailableError} from
  "../src/common/database/runtime-database-deadline";
import {verifyRatingFeedbackDatabaseReadiness} from
  "../src/common/database/rating-feedback-database-readiness";

const ready={phase_ready:true,functions_ready:true,
  owner_ready:true,grants_safe:true,guards_ready:true};

describe("Issue 463 opt-in SQL readiness (legacy health unchanged)",()=>{
  it("accepts one fully verified write/read probe",async()=>{
    for(const mode of ["write","read"] as const){
      const query=vi.fn().mockResolvedValue({
        rowCount:1,rows:[{...ready}],
      });
      await expect(verifyRatingFeedbackDatabaseReadiness({query} as never,mode))
        .resolves.toBeUndefined();
      const sql=String(query.mock.calls[0]?.[0]);
      expect(sql).toContain("rating_feedback_is_protected");
      expect(sql).toContain("guest_rating_comments");
      expect(sql).not.toContain("SELECT comment_text");
      if(mode==="read")
        expect(sql).toContain("management_rating_feedback_projection");
    }
  });

  it("fails closed on missing stage/grants/owner/guard and partial result",async()=>{
    for(const key of Object.keys(ready)){
      const query=vi.fn().mockResolvedValue({
        rowCount:1,rows:[{...ready,[key]:false}],
      });
      await expect(verifyRatingFeedbackDatabaseReadiness({query} as never,
        "write")).rejects.toBeInstanceOf(RuntimeDatabaseUnavailableError);
    }
    await expect(verifyRatingFeedbackDatabaseReadiness({
      query:vi.fn().mockResolvedValue({rowCount:0,rows:[]}),
    } as never,"read")).rejects.toBeInstanceOf(RuntimeDatabaseUnavailableError);
    await expect(verifyRatingFeedbackDatabaseReadiness({
      query:vi.fn().mockRejectedValue(Object.assign(new Error("sensitive"),{
        code:"42501",
      })),
    } as never,"read")).rejects.toBeInstanceOf(RuntimeDatabaseUnavailableError);
  });

  it("rejects unknown mode without talking to PG",async()=>{
    const query=vi.fn();
    await expect(verifyRatingFeedbackDatabaseReadiness({
      query,
    } as never,"release" as never)).rejects.toThrow(/readiness mode/);
    expect(query).not.toHaveBeenCalled();
  });
});
