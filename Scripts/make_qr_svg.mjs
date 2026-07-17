#!/usr/bin/env node
import { writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3] ?? "idea-seed-qr.svg";
if (!input) throw new Error("Usage: node Scripts/make_qr_svg.mjs <text> [output.svg]");

const VERSION = 4;
const SIZE = VERSION * 4 + 17;
const DATA_CODEWORDS = 64;
const ECC_PER_BLOCK = 18;
const BLOCKS = 2;
const MASK = 0;

const modules = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
const reserved = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));

function setModule(x, y, value, isReserved = true) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  modules[y][x] = value;
  if (isReserved) reserved[y][x] = true;
}

function drawFinder(x, y) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      const inFinder = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark = inFinder && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setModule(xx, yy, dark);
    }
  }
}

function drawAlignment(cx, cy) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      setModule(cx + dx, cy + dy, dark);
    }
  }
}

function drawFunctionPatterns() {
  drawFinder(0, 0);
  drawFinder(SIZE - 7, 0);
  drawFinder(0, SIZE - 7);

  for (let i = 8; i < SIZE - 8; i += 1) {
    setModule(i, 6, i % 2 === 0);
    setModule(6, i, i % 2 === 0);
  }

  drawAlignment(26, 26);
  setModule(8, SIZE - 8, true);

  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = SIZE - 8; i < SIZE; i += 1) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) bits.push(((value >>> i) & 1) === 1);
}

function makeDataCodewords(text) {
  const bytes = [...new TextEncoder().encode(text)];
  if (bytes.length > 62) throw new Error("Version 4-M byte capacity exceeded");

  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) appendBits(bits, byte, 8);
  const maxBits = DATA_CODEWORDS * 8;
  appendBits(bits, 0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(false);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j += 1) value = (value << 1) | (bits[i + j] ? 1 : 0);
    codewords.push(value);
  }
  for (let pad = 0; codewords.length < DATA_CODEWORDS; pad += 1) {
    codewords.push(pad % 2 === 0 ? 0xec : 0x11);
  }
  return codewords;
}

function gfMultiply(a, b) {
  let result = 0;
  for (let i = 0; i < 8; i += 1) {
    if ((b & 1) !== 0) result ^= a;
    const carry = (a & 0x80) !== 0;
    a = (a << 1) & 0xff;
    if (carry) a ^= 0x1d;
    b >>>= 1;
  }
  return result;
}

function gfPow(power) {
  let value = 1;
  for (let i = 0; i < power; i += 1) value = gfMultiply(value, 2);
  return value;
}

function generatorPolynomial(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= gfMultiply(poly[j], gfPow(i));
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function reedSolomonRemainder(data, degree) {
  const generator = generatorPolynomial(degree);
  const result = Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < degree; i += 1) {
      result[i] ^= gfMultiply(generator[i], factor);
    }
  }
  return result;
}

function makeCodewords(text) {
  const data = makeDataCodewords(text);
  const blocks = [];
  for (let i = 0; i < BLOCKS; i += 1) {
    const start = i * 32;
    const blockData = data.slice(start, start + 32);
    blocks.push({ data: blockData, ecc: reedSolomonRemainder(blockData, ECC_PER_BLOCK) });
  }

  const result = [];
  for (let i = 0; i < 32; i += 1) {
    for (const block of blocks) result.push(block.data[i]);
  }
  for (let i = 0; i < ECC_PER_BLOCK; i += 1) {
    for (const block of blocks) result.push(block.ecc[i]);
  }
  return result;
}

function maskBit(x, y) {
  return (x + y) % 2 === 0;
}

function drawData(codewords) {
  const bits = [];
  for (const codeword of codewords) appendBits(bits, codeword, 8);
  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vert = 0; vert < SIZE; vert += 1) {
      const y = upward ? SIZE - 1 - vert : vert;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (reserved[y][x]) continue;
        let dark = bitIndex < bits.length ? bits[bitIndex] : false;
        if (maskBit(x, y)) dark = !dark;
        setModule(x, y, dark, false);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

function formatBits() {
  let data = (0b00 << 3) | MASK;
  let bits = data << 10;
  const generator = 0b10100110111;
  for (let i = 14; i >= 10; i -= 1) {
    if (((bits >>> i) & 1) !== 0) bits ^= generator << (i - 10);
  }
  return (((data << 10) | bits) ^ 0b101010000010010) & 0x7fff;
}

function drawFormatBits() {
  const bits = formatBits();
  const coordsA = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const coordsB = [
    [SIZE - 1, 8], [SIZE - 2, 8], [SIZE - 3, 8], [SIZE - 4, 8], [SIZE - 5, 8], [SIZE - 6, 8], [SIZE - 7, 8], [SIZE - 8, 8],
    [8, SIZE - 7], [8, SIZE - 6], [8, SIZE - 5], [8, SIZE - 4], [8, SIZE - 3], [8, SIZE - 2], [8, SIZE - 1],
  ];
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >>> i) & 1) !== 0;
    setModule(coordsA[i][0], coordsA[i][1], dark);
    setModule(coordsB[i][0], coordsB[i][1], dark);
  }
}

function makeSvg() {
  const border = 4;
  const scale = 10;
  const size = (SIZE + border * 2) * scale;
  const rects = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (modules[y][x]) rects.push(`<rect x="${(x + border) * scale}" y="${(y + border) * scale}" width="${scale}" height="${scale}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="QR code">
<rect width="100%" height="100%" fill="#fff"/>
<g fill="#000">
${rects.join("\n")}
</g>
</svg>
`;
}

drawFunctionPatterns();
drawData(makeCodewords(input));
drawFormatBits();
writeFileSync(output, makeSvg());
