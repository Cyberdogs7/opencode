import { describe, expect, test } from "bun:test"
import { KeyRing } from "../src/session/runner/key-ring"

describe("KeyRing", () => {
  test("exhaustPrefix uses the provided TTL instead of the default", () => {
    KeyRing.reset()
    const keys = ["a", "b"]
    // pick marks "one of" the keys as last used for prefix
    const first = KeyRing.pick("p", keys)!
    KeyRing.exhaustPrefix("p", 100)
    const second = KeyRing.pick("p", keys)
    expect(second).not.toBe(first)
  })

  test("single-key ring still returns the only key", () => {
    KeyRing.reset()
    expect(KeyRing.pick("p", ["only"])).toBe("only")
  })

  test("empty ring returns undefined", () => {
    KeyRing.reset()
    expect(KeyRing.pick("p", [])).toBeUndefined()
  })
})
