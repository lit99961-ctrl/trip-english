export async function requestPersistentStorage(): Promise<
  "granted" | "best-effort" | "unsupported"
> {
  if (!navigator.storage?.persist) return "unsupported";
  if (await navigator.storage.persisted()) return "granted";
  return (await navigator.storage.persist()) ? "granted" : "best-effort";
}
