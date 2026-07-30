export type RequestToken<Key> = Readonly<{
  key: Key;
  generation: number;
}>;

/**
 * Lets async UI loaders ignore responses that no longer belong to the newest
 * request for a key. Invalidating also protects refreshes and entity changes
 * from an older in-flight response repopulating stale state.
 */
export class LatestRequestTracker<Key> {
  private generation = 0;
  private readonly latest = new Map<Key, number>();

  begin(key: Key): RequestToken<Key> {
    const generation = ++this.generation;
    this.latest.set(key, generation);
    return { key, generation };
  }

  isLatest(token: RequestToken<Key>): boolean {
    return this.latest.get(token.key) === token.generation;
  }

  invalidate(key: Key): void {
    this.latest.set(key, ++this.generation);
  }

  invalidateAll(): void {
    this.latest.clear();
    this.generation += 1;
  }
}
