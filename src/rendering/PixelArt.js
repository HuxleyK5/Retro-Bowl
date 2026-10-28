// Three-by-five jersey numerals shared by the field sprites and draft cards.
const DIGITS = ['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001001001001','111101111101111','111101111001111'];
export function pixelNumber(value, x, y, color, rect, size = 1) {
  const digits = String(value).padStart(2, '0').slice(-2);
  for (let i = 0; i < digits.length; i++) {
    const glyph = DIGITS[Number(digits[i])] || DIGITS[0];
    for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
      if (glyph[row * 3 + col] === '1') rect(x + (i * 4 + col) * size, y + row * size, size, size, color);
    }
  }
}

export function playerSkin(player) {
  let seed = 0;
  for (const letter of player.id || String(player.number)) seed = (Math.imul(seed, 31) + letter.charCodeAt(0)) >>> 0;
  return ['#e7b28b', '#c58a61', '#965e42', '#633d30'][seed % 4];
}

// The same 40-pixel football bust is used on draft cards and animated field sprites.
export function pixelPlayerBust(player, rect, {
  skin = playerSkin(player), ink = '#14281f', shell = '#e6edd9',
  jersey = '#dce5ce', shade = '#a0b497', trim = '#a3bc77',
  helmetShade = '#91a886', stripe = '#547451', numberColor = '#284432',
} = {}) {
  const broad = ['OL', 'DL', 'LB'].includes(player.specialty) || player.position === 'OL' ? 1 : 0;
  rect(11, 27, 18, 13, ink); rect(6-broad, 29, 28+broad*2, 11, ink);
  rect(3-broad, 33, 34+broad*2, 7, ink);
  rect(12, 28, 16, 12, jersey); rect(7-broad, 30, 26+broad*2, 10, jersey);
  rect(4-broad, 34, 32+broad*2, 6, shade);
  rect(11, 32, 18, 8, jersey); rect(25, 32, 4, 8, shade);
  rect(7-broad, 31, 5, 2, trim); rect(28, 31, 5+broad, 2, trim);
  rect(7-broad, 35, 4, 2, trim); rect(29, 35, 4+broad, 2, trim);
  rect(16, 24, 8, 6, ink); rect(17, 24, 6, 5, skin);
  rect(15, 28, 3, 2, ink); rect(22, 28, 3, 2, ink); rect(18, 30, 4, 1, ink);
  // Stepped helmet shell, two-tone cheek pads and a one-pixel face cage.
  rect(14, 3, 12, 2, ink); rect(11, 5, 18, 3, ink); rect(9, 8, 22, 13, ink);
  rect(10, 9, 20, 11, shell); rect(12, 6, 16, 3, shell); rect(15, 4, 10, 2, shell);
  rect(26, 9, 3, 11, helmetShade); rect(12, 8, 2, 7, '#f7fae7'); rect(14, 6, 4, 2, '#f7fae7');
  rect(19, 4, 2, 12, stripe); rect(18, 5, 1, 10, trim);
  rect(13, 16, 14, 5, ink); rect(14, 17, 11, 1, '#789485');
  rect(14, 21, 12, 5, skin); rect(23, 21, 3, 5, '#00000028');
  rect(10, 20, 3, 4, shell); rect(27, 20, 3, 4, helmetShade);
  rect(11, 21, 1, 2, ink); rect(28, 21, 1, 2, ink);
  rect(12, 23, 1, 4, ink); rect(27, 23, 1, 4, ink);
  rect(13, 24, 14, 1, ink); rect(13, 27, 14, 1, ink);
  rect(15, 28, 10, 1, ink); rect(17, 29, 6, 1, ink);
  rect(16, 23, 1, 4, '#b7c7b0'); rect(23, 23, 1, 4, '#b7c7b0');
  rect(13, 26, 14, 1, '#b7c7b0');
  pixelNumber(player.number, 17, 34, numberColor, rect);
}
