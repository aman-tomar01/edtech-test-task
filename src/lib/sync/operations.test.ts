import { describe, it, expect } from "vitest";
import {
  compareOperations,
  mergeOperations,
  transformPosition,
  diffToOperations,
  type TextOperation,
} from "./operations";

const base = (overrides: Partial<TextOperation>): TextOperation => ({
  id: "op-1",
  documentId: "doc-1",
  userId: "user-a",
  clientId: "client-1",
  type: "insert",
  position: 0,
  content: "Hello",
  lamportClock: 1,
  timestamp: 1000,
  ...overrides,
});

describe("compareOperations", () => {
  it("orders by lamport clock", () => {
    const a = base({ lamportClock: 1 });
    const b = base({ lamportClock: 2, id: "op-2" });
    expect(compareOperations(a, b)).toBeLessThan(0);
  });

  it("tie-breaks by userId then id", () => {
    const a = base({ userId: "user-a", id: "op-a" });
    const b = base({ userId: "user-b", id: "op-b", lamportClock: 1 });
    expect(compareOperations(a, b)).toBeLessThan(0);
  });
});

describe("mergeOperations", () => {
  it("applies sequential inserts", () => {
    const ops = [
      base({ id: "1", position: 0, content: "Hello", lamportClock: 1 }),
      base({
        id: "2",
        position: 5,
        content: " World",
        lamportClock: 2,
        userId: "user-a",
      }),
    ];
    expect(mergeOperations("", ops)).toBe("Hello World");
  });

  it("handles concurrent inserts deterministically", () => {
    const ops = [
      base({
        id: "a",
        userId: "user-a",
        position: 0,
        content: "A",
        lamportClock: 2,
      }),
      base({
        id: "b",
        userId: "user-b",
        position: 0,
        content: "B",
        lamportClock: 2,
      }),
    ];
    const result = mergeOperations("", ops);
    expect(result).toBe("AB");
  });

  it("applies delete then insert", () => {
    const ops = [
      base({
        id: "1",
        type: "delete",
        position: 0,
        content: "5",
        lamportClock: 1,
      }),
      base({
        id: "2",
        position: 0,
        content: "Hi",
        lamportClock: 2,
      }),
    ];
    expect(mergeOperations("Hello", ops)).toBe("Hi");
  });
});

describe("transformPosition", () => {
  it("shifts position after prior insert", () => {
    const prior = base({ position: 0, content: "XX", lamportClock: 1 });
    const self = base({ position: 5, lamportClock: 2, id: "self" });
    expect(transformPosition(3, prior, self)).toBe(5);
  });
});

describe("diffToOperations", () => {
  it("generates insert for appended text", () => {
    const ops = diffToOperations("Hi", "Hi there", 0, {
      documentId: "d",
      userId: "u",
      clientId: "c",
      idPrefix: "pfx",
    });
    expect(ops.some((o) => o.type === "insert" && o.content === " there")).toBe(
      true
    );
  });

  it("generates delete for removed text", () => {
    const ops = diffToOperations("Hello", "Hel", 0, {
      documentId: "d",
      userId: "u",
      clientId: "c",
      idPrefix: "pfx",
    });
    expect(ops.some((o) => o.type === "delete")).toBe(true);
  });
});

describe("validation limits", () => {
  it("rejects oversized payloads", async () => {
    const { validatePayloadSize } = await import("../validation/schemas");
    const { LIMITS } = await import("../validation/limits");
    expect(validatePayloadSize("x".repeat(LIMITS.MAX_SYNC_PAYLOAD_BYTES + 1))).toBe(
      false
    );
  });
});
