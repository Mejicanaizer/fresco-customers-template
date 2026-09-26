/** An offset lets independent local QA runs avoid each other's fixture processes. */
export const testPortOffset = Number(process.env.STOREFRONT_TEST_PORT_OFFSET ?? 0);
if (!Number.isInteger(testPortOffset) || testPortOffset < 0 || testPortOffset > 50000) throw new Error('Invalid synthetic test port offset');
export const storefrontOrigin = (business = 0) => `http://127.0.0.1:${5375 + testPortOffset + business}`;
export const ownerOrigin = (business = 0) => `http://127.0.0.1:${5491 + testPortOffset + business}`;
