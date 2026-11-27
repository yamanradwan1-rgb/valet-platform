export interface Issue463BrowserProxy {
  origin: string;
  armLostRatingResponse(): void;
  observations(): { ratingPosts: number; droppedSuccessfulResponses: number };
  close(): Promise<void>;
}
export function startIssue463BrowserProxy(apiOrigin: string): Promise<Issue463BrowserProxy>;
