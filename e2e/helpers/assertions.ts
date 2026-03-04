import { expect, type APIResponse } from "@playwright/test";

/**
 * Assert a successful JSON API response (200) and return the parsed body.
 */
export async function expectSuccessJson(res: APIResponse) {
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.error).toBeUndefined();
  return body;
}

/**
 * Assert an error JSON response with specific status code and error code.
 */
export async function expectErrorJson(
  res: APIResponse,
  status: number,
  code: string,
) {
  expect(res.status()).toBe(status);
  const body = await res.json();
  expect(body.error).toBe(code);
  return body;
}
