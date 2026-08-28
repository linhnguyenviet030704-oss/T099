import assert from "node:assert/strict";
import { test } from "node:test";

import { dispatchSseJson } from "./sse.ts";

test("SSE error callback được truyền ngược lên caller", () => {
  assert.throws(
    () =>
      dispatchSseJson(
        "error",
        JSON.stringify({ error: "Yêu cầu không an toàn để xử lý" }),
        (event) => {
          const data = event.data as { error: string };
          throw new Error(data.error);
        },
      ),
    /Yêu cầu không an toàn/,
  );
});

test("SSE JSON không hợp lệ bị bỏ qua mà không gọi callback", () => {
  let called = false;
  const dispatched = dispatchSseJson("complete", "{invalid", () => {
    called = true;
  });

  assert.equal(dispatched, false);
  assert.equal(called, false);
});

test("SSE JSON hợp lệ được chuyển đến callback", () => {
  let received: unknown;
  const dispatched = dispatchSseJson("status", '{"step":"routing"}', (event) => {
    received = event;
  });

  assert.equal(dispatched, true);
  assert.deepEqual(received, { event: "status", data: { step: "routing" } });
});
