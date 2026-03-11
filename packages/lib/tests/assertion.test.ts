// tests/assertion.test.ts
import { assertEquals, assertRejects } from "@std/assert";
import { verifyAssertion } from "../src/assertion.ts";
import { AssertionError } from "../src/errors.ts";
import { generateSyntheticAssertion } from "./fixtures/generate-assertion.ts";
import { exportKeyToPem } from "../src/utils.ts";

const TEST_APP_ID = "TEAMID1234.com.example.testapp";
const TEST_CLIENT_DATA = new TextEncoder().encode(
  JSON.stringify({ action: "test", challenge: "abc123" }),
);

Deno.test("verifyAssertion succeeds with valid synthetic assertion", async () => {
  const fixture = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: TEST_CLIENT_DATA,
    signCount: 1,
  });
  const result = await verifyAssertion(
    { appId: TEST_APP_ID },
    fixture.assertion,
    fixture.clientData,
    fixture.publicKeyPem,
    0,
  );
  assertEquals(result.signCount, 1);
});

Deno.test("verifyAssertion succeeds with sequential assertions", async () => {
  const fixture1 = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: TEST_CLIENT_DATA,
    signCount: 1,
  });
  const result1 = await verifyAssertion(
    { appId: TEST_APP_ID },
    fixture1.assertion,
    fixture1.clientData,
    fixture1.publicKeyPem,
    0,
  );
  assertEquals(result1.signCount, 1);

  const fixture2 = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: new TextEncoder().encode("second request"),
    signCount: 2,
    keyPair: fixture1.keyPair,
  });
  const result2 = await verifyAssertion(
    { appId: TEST_APP_ID },
    fixture2.assertion,
    fixture2.clientData,
    fixture2.publicKeyPem,
    result1.signCount,
  );
  assertEquals(result2.signCount, 2);
});

Deno.test("verifyAssertion rejects wrong key", async () => {
  const fixture = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: TEST_CLIENT_DATA,
    signCount: 1,
  });
  const otherKeyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const wrongPem = await exportKeyToPem(otherKeyPair.publicKey);
  await assertRejects(
    () =>
      verifyAssertion(
        { appId: TEST_APP_ID },
        fixture.assertion,
        fixture.clientData,
        wrongPem,
        0,
      ),
    AssertionError,
  );
});

Deno.test("verifyAssertion rejects counter not incremented", async () => {
  const fixture = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: TEST_CLIENT_DATA,
    signCount: 5,
  });
  await assertRejects(
    () =>
      verifyAssertion(
        { appId: TEST_APP_ID },
        fixture.assertion,
        fixture.clientData,
        fixture.publicKeyPem,
        5,
      ),
    AssertionError,
  );
});

Deno.test("verifyAssertion rejects wrong appId", async () => {
  const fixture = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: TEST_CLIENT_DATA,
    signCount: 1,
  });
  await assertRejects(
    () =>
      verifyAssertion(
        { appId: "WRONG.com.example.otherapp" },
        fixture.assertion,
        fixture.clientData,
        fixture.publicKeyPem,
        0,
      ),
    AssertionError,
  );
});

Deno.test("verifyAssertion rejects tampered clientData", async () => {
  const fixture = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: TEST_CLIENT_DATA,
    signCount: 1,
  });
  await assertRejects(
    () =>
      verifyAssertion(
        { appId: TEST_APP_ID },
        fixture.assertion,
        new TextEncoder().encode("tampered"),
        fixture.publicKeyPem,
        0,
      ),
    AssertionError,
  );
});

Deno.test("verifyAssertion rejects malformed CBOR", async () => {
  const fixture = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: TEST_CLIENT_DATA,
    signCount: 1,
  });
  await assertRejects(
    () =>
      verifyAssertion(
        { appId: TEST_APP_ID },
        new Uint8Array([0xff, 0xff]),
        fixture.clientData,
        fixture.publicKeyPem,
        0,
      ),
    AssertionError,
  );
});

Deno.test("verifyAssertion accepts base64 string inputs", async () => {
  const { encodeBase64 } = await import("@std/encoding/base64");
  const fixture = await generateSyntheticAssertion({
    appId: TEST_APP_ID,
    clientData: TEST_CLIENT_DATA,
    signCount: 1,
  });
  const result = await verifyAssertion(
    { appId: TEST_APP_ID },
    encodeBase64(fixture.assertion),
    fixture.clientData,
    fixture.publicKeyPem,
    0,
  );
  assertEquals(result.signCount, 1);
});
