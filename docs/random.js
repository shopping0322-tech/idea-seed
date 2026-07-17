export function secureRandomInteger(maxExclusive, cryptoProvider = globalThis.crypto) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 0x1_0000_0000) {
    throw new RangeError("抽選件数が範囲外です");
  }
  if (!cryptoProvider?.getRandomValues) throw new Error("安全な乱数生成器を利用できません");

  const range = 0x1_0000_0000;
  const limit = range - (range % maxExclusive);
  const buffer = new Uint32Array(1);
  do {
    cryptoProvider.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % maxExclusive;
}
