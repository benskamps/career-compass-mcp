import { describe, it, expect } from "vitest";

// Port validation logic extracted from bin/cli.ts for testing
function validatePort(value: string | undefined): number | { error: string } {
  if (value === undefined) return 3141;
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    return {
      error: `Invalid port "${value}". Must be a number between 1 and 65535.`,
    };
  }
  return port;
}

describe("CLI port validation", () => {
  it("returns default port when no value", () => {
    expect(validatePort(undefined)).toBe(3141);
  });

  it("accepts valid port number", () => {
    expect(validatePort("3000")).toBe(3000);
  });

  it("rejects NaN", () => {
    const result = validatePort("abc");
    expect(result).toHaveProperty("error");
  });

  it("rejects port 0", () => {
    const result = validatePort("0");
    expect(result).toHaveProperty("error");
  });

  it("rejects port above 65535", () => {
    const result = validatePort("70000");
    expect(result).toHaveProperty("error");
  });

  it("accepts port 1", () => {
    expect(validatePort("1")).toBe(1);
  });

  it("accepts port 65535", () => {
    expect(validatePort("65535")).toBe(65535);
  });
});
