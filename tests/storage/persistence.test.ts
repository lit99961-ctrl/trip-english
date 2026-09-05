import { afterEach, describe, expect, test } from "vitest";
import { requestPersistentStorage } from "../../src/storage/persistence";

const originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");

function setStorage(storage: StorageManager | undefined) {
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: storage
  });
}

afterEach(() => {
  if (originalStorage) {
    Object.defineProperty(navigator, "storage", originalStorage);
  } else {
    Reflect.deleteProperty(navigator, "storage");
  }
});

describe("requestPersistentStorage", () => {
  test("returns unsupported when StorageManager persistence is unavailable", async () => {
    setStorage(undefined);

    await expect(requestPersistentStorage()).resolves.toBe("unsupported");
  });

  test("returns granted when storage is already persistent", async () => {
    let persistCalls = 0;
    const persist = async () => {
      persistCalls += 1;
      return true;
    };
    setStorage({ persisted: async () => true, persist } as StorageManager);

    await expect(requestPersistentStorage()).resolves.toBe("granted");
    expect(persistCalls).toBe(0);
  });

  test("requests persistence when it is not already granted", async () => {
    let persistCalls = 0;
    const persist = async () => {
      persistCalls += 1;
      return true;
    };
    setStorage({ persisted: async () => false, persist } as StorageManager);

    await expect(requestPersistentStorage()).resolves.toBe("granted");
    expect(persistCalls).toBe(1);
  });

  test("returns best-effort when a persistence request is denied", async () => {
    setStorage({ persisted: async () => false, persist: async () => false } as StorageManager);

    await expect(requestPersistentStorage()).resolves.toBe("best-effort");
  });
});
