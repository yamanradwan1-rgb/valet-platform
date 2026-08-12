import { Injectable } from "@nestjs/common";

import type { PostgresTransaction } from "../../common/database/postgres";
import { requestRetrievalInTransaction } from "./request-retrieval-command";

@Injectable()
export class RequestRetrievalService {
  executeInTransaction(
    transaction: PostgresTransaction,
    valetSessionId: string,
  ) {
    return requestRetrievalInTransaction(transaction, valetSessionId);
  }
}
