import type { IncomingMessage } from "node:http";
import { describe, expect, test } from "vitest";

import { isDirectWebSocketRequestAuthorized } from "./websocket-server.js";

const CORRECT_PASSWORD_HASH = "$2b$12$OLxyuuP9uLK30Uzc4wQX0O6liuU/Q1t5P2b0Ebf36mULvpVK3DRZW";

function request(input: {
  remoteAddress: string;
  protocol?: string;
  origin?: string;
  host?: string;
  forwardedFor?: string;
}): IncomingMessage {
  return {
    headers: {
      ...(input.protocol ? { "sec-websocket-protocol": input.protocol } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.host ? { host: input.host } : {}),
      ...(input.forwardedFor ? { "x-forwarded-for": input.forwardedFor } : {}),
    },
    socket: { remoteAddress: input.remoteAddress },
  } as unknown as IncomingMessage;
}

describe("direct WebSocket socket-peer authentication", () => {
  test.each(["127.0.0.1", "127.255.255.254", "::1", "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1"])(
    "allows a normalized loopback TCP peer to omit the bearer: %s",
    (remoteAddress) => {
      expect(
        isDirectWebSocketRequestAuthorized(request({ remoteAddress }), CORRECT_PASSWORD_HASH),
      ).toBe(true);
    },
  );

  test.each([
    "192.168.1.20",
    "10.0.0.8",
    "172.16.5.4",
    "::ffff:192.168.1.20",
    "203.0.113.20",
    "2001:db8::20",
  ])("requires the configured password from every non-loopback peer: %s", (remoteAddress) => {
    expect(
      isDirectWebSocketRequestAuthorized(request({ remoteAddress }), CORRECT_PASSWORD_HASH),
    ).toBe(false);
    expect(
      isDirectWebSocketRequestAuthorized(
        request({ remoteAddress, protocol: "paseo.bearer.wrong-password" }),
        CORRECT_PASSWORD_HASH,
      ),
    ).toBe(false);
    expect(
      isDirectWebSocketRequestAuthorized(
        request({ remoteAddress, protocol: "paseo.bearer.correct-password" }),
        CORRECT_PASSWORD_HASH,
      ),
    ).toBe(true);
  });

  test("does not grant local authority from foreign-origin or forwarded request metadata", () => {
    expect(
      isDirectWebSocketRequestAuthorized(
        request({
          remoteAddress: "192.168.1.20",
          origin: "https://foreign.example",
          host: "localhost:6767",
          forwardedFor: "127.0.0.1",
        }),
        CORRECT_PASSWORD_HASH,
      ),
    ).toBe(false);
    expect(
      isDirectWebSocketRequestAuthorized(
        request({
          remoteAddress: "203.0.113.20",
          host: "127.0.0.1:6767",
          forwardedFor: "::1",
        }),
        CORRECT_PASSWORD_HASH,
      ),
    ).toBe(false);
  });

  test("still rejects a wrong password supplied by a loopback peer", () => {
    expect(
      isDirectWebSocketRequestAuthorized(
        request({
          remoteAddress: "127.0.0.1",
          protocol: "paseo.bearer.wrong-password",
        }),
        CORRECT_PASSWORD_HASH,
      ),
    ).toBe(false);
  });
});
