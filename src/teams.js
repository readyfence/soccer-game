// Roster order matches the 4-3-3 formation in game.js:
// GK, RB, RCB, LCB, LB, RCM, CDM, LCM, RW, ST, LW
// Ratings: [pace, shooting, passing, defending, overall]

const p = (name, back, num, pac, sho, pas, def, ovr) => ({ name, back, num, pac, sho, pas, def, ovr });

export const CLUBS = [
  {
    id: 'rma', name: 'Real Madrid', short: 'RMA', badge: ['#ffffff', '#d4af37', '#1a2340'],
    home: { shirt: 0xf6f6f6, shorts: 0xf6f6f6, socks: 0xf6f6f6, trim: 0xd4af37, number: '#1a2340' },
    away: { shirt: 0x1a2340, shorts: 0x1a2340, socks: 0x1a2340, trim: 0xd4af37, number: '#ffffff' },
    gk: { shirt: 0x2bb673, shorts: 0x1c1c1c, socks: 0x2bb673 },
    players: [
      p('Thibaut Courtois', 'COURTOIS', 1, 48, 18, 70, 90, 89),
      p('Trent Alexander-Arnold', 'ARNOLD', 12, 76, 72, 90, 76, 86),
      p('Éder Militão', 'MILITÃO', 3, 83, 50, 68, 85, 85),
      p('Dean Huijsen', 'HUIJSEN', 24, 70, 48, 72, 82, 81),
      p('Álvaro Carreras', 'CARRERAS', 18, 84, 52, 74, 78, 81),
      p('Federico Valverde', 'VALVERDE', 8, 88, 82, 84, 80, 88),
      p('Aurélien Tchouaméni', 'TCHOUAMÉNI', 14, 70, 66, 78, 84, 85),
      p('Jude Bellingham', 'BELLINGHAM', 5, 80, 86, 84, 76, 89),
      p('Rodrygo', 'RODRYGO', 11, 88, 82, 80, 34, 85),
      p('Kylian Mbappé', 'MBAPPÉ', 10, 97, 92, 81, 36, 91),
      p('Vinícius Júnior', 'VINI JR.', 7, 95, 84, 81, 29, 90),
    ],
  },
  {
    id: 'mci', name: 'Manchester City', short: 'MCI', badge: ['#6cabdd', '#ffffff', '#1c2c5b'],
    home: { shirt: 0x6cabdd, shorts: 0xffffff, socks: 0x6cabdd, trim: 0x1c2c5b, number: '#1c2c5b' },
    away: { shirt: 0x1c2c5b, shorts: 0x1c2c5b, socks: 0x1c2c5b, trim: 0x6cabdd, number: '#ffffff' },
    gk: { shirt: 0xf2c200, shorts: 0x1a1a1a, socks: 0xf2c200 },
    players: [
      p('Gianluigi Donnarumma', 'DONNARUMMA', 25, 50, 20, 64, 89, 89),
      p('Rico Lewis', 'LEWIS', 82, 78, 60, 80, 76, 80),
      p('Rúben Dias', 'DIAS', 3, 64, 40, 70, 89, 87),
      p('Joško Gvardiol', 'GVARDIOL', 24, 80, 62, 74, 84, 85),
      p('Rayan Aït-Nouri', 'AÏT-NOURI', 21, 84, 60, 76, 76, 81),
      p('Tijjani Reijnders', 'REIJNDERS', 4, 80, 80, 84, 70, 85),
      p('Rodri', 'RODRI', 16, 62, 78, 90, 86, 90),
      p('Phil Foden', 'FODEN', 47, 84, 84, 86, 55, 87),
      p('Rayan Cherki', 'CHERKI', 10, 80, 80, 86, 30, 83),
      p('Erling Haaland', 'HAALAND', 9, 89, 94, 66, 45, 91),
      p('Jérémy Doku', 'DOKU', 11, 94, 72, 76, 28, 83),
    ],
  },
  {
    id: 'fcb', name: 'Barcelona', short: 'FCB', badge: ['#a50044', '#004d98', '#edbb00'],
    home: { shirt: 0xa50044, shorts: 0x004d98, socks: 0x004d98, trim: 0xedbb00, number: '#edbb00', pattern: 'stripes', stripe: 0x004d98 },
    away: { shirt: 0xf0f0f0, shorts: 0xf0f0f0, socks: 0xf0f0f0, trim: 0xa50044, number: '#a50044' },
    gk: { shirt: 0x2e2e2e, shorts: 0x2e2e2e, socks: 0x2e2e2e },
    players: [
      p('Joan García', 'J. GARCÍA', 13, 45, 16, 62, 84, 84),
      p('Jules Koundé', 'KOUNDÉ', 23, 84, 54, 72, 84, 85),
      p('Pau Cubarsí', 'CUBARSÍ', 2, 68, 40, 76, 83, 83),
      p('Ronald Araújo', 'ARAÚJO', 4, 80, 50, 62, 84, 83),
      p('Alejandro Balde', 'BALDE', 3, 92, 56, 74, 74, 82),
      p('Frenkie de Jong', 'DE JONG', 21, 80, 70, 88, 76, 86),
      p('Gavi', 'GAVI', 6, 76, 68, 82, 72, 82),
      p('Pedri', 'PEDRI', 8, 76, 76, 91, 68, 89),
      p('Lamine Yamal', 'YAMAL', 10, 90, 82, 86, 30, 90),
      p('Robert Lewandowski', 'LEWANDOWSKI', 9, 74, 90, 78, 40, 87),
      p('Raphinha', 'RAPHINHA', 11, 90, 86, 84, 50, 89),
    ],
  },
  {
    id: 'liv', name: 'Liverpool', short: 'LIV', badge: ['#c8102e', '#ffffff', '#00b2a9'],
    home: { shirt: 0xc8102e, shorts: 0xc8102e, socks: 0xc8102e, trim: 0xffffff, number: '#ffffff' },
    away: { shirt: 0xf2f2f2, shorts: 0x111111, socks: 0xf2f2f2, trim: 0xc8102e, number: '#c8102e' },
    gk: { shirt: 0x7ad400, shorts: 0x1a1a1a, socks: 0x7ad400 },
    players: [
      p('Alisson Becker', 'ALISSON', 1, 52, 18, 76, 89, 89),
      p('Jeremie Frimpong', 'FRIMPONG', 30, 94, 64, 76, 70, 82),
      p('Ibrahima Konaté', 'KONATÉ', 5, 80, 40, 60, 85, 85),
      p('Virgil van Dijk', 'VAN DIJK', 4, 76, 60, 72, 90, 89),
      p('Milos Kerkez', 'KERKEZ', 6, 86, 52, 74, 76, 81),
      p('Dominik Szoboszlai', 'SZOBOSZLAI', 8, 80, 82, 84, 70, 85),
      p('Ryan Gravenberch', 'GRAVENBERCH', 38, 78, 70, 80, 80, 85),
      p('Florian Wirtz', 'WIRTZ', 7, 80, 84, 88, 50, 88),
      p('Mohamed Salah', 'SALAH', 11, 88, 88, 84, 44, 90),
      p('Alexander Isak', 'ISAK', 9, 86, 88, 76, 34, 88),
      p('Cody Gakpo', 'GAKPO', 18, 84, 82, 78, 40, 84),
    ],
  },
  {
    id: 'fcbay', name: 'Bayern Munich', short: 'BAY', badge: ['#dc052d', '#ffffff', '#0066b2'],
    home: { shirt: 0xdc052d, shorts: 0xdc052d, socks: 0xdc052d, trim: 0xffffff, number: '#ffffff', sleeves: 0xffffff },
    away: { shirt: 0x1a1a1a, shorts: 0x1a1a1a, socks: 0x1a1a1a, trim: 0xdc052d, number: '#dc052d' },
    gk: { shirt: 0x3ad6c5, shorts: 0x1a1a1a, socks: 0x3ad6c5 },
    players: [
      p('Manuel Neuer', 'NEUER', 1, 44, 20, 80, 87, 86),
      p('Konrad Laimer', 'LAIMER', 27, 82, 60, 74, 78, 81),
      p('Dayot Upamecano', 'UPAMECANO', 2, 80, 44, 64, 84, 84),
      p('Jonathan Tah', 'TAH', 4, 70, 44, 66, 85, 84),
      p('Alphonso Davies', 'DAVIES', 19, 95, 62, 76, 76, 83),
      p('Joshua Kimmich', 'KIMMICH', 6, 68, 74, 90, 80, 88),
      p('Leon Goretzka', 'GORETZKA', 8, 76, 78, 80, 78, 82),
      p('Jamal Musiala', 'MUSIALA', 10, 84, 82, 84, 58, 89),
      p('Michael Olise', 'OLISE', 17, 84, 82, 88, 36, 87),
      p('Harry Kane', 'KANE', 9, 68, 93, 86, 46, 90),
      p('Luis Díaz', 'DÍAZ', 14, 90, 80, 80, 40, 86),
    ],
  },
  {
    id: 'ars', name: 'Arsenal', short: 'ARS', badge: ['#ef0107', '#ffffff', '#063672'],
    home: { shirt: 0xef0107, shorts: 0xffffff, socks: 0xef0107, trim: 0xffffff, number: '#ffffff', sleeves: 0xffffff },
    away: { shirt: 0x1f2a44, shorts: 0x1f2a44, socks: 0x1f2a44, trim: 0xef0107, number: '#ffffff' },
    gk: { shirt: 0x6a1b9a, shorts: 0x6a1b9a, socks: 0x6a1b9a },
    players: [
      p('David Raya', 'RAYA', 1, 50, 18, 78, 87, 87),
      p('Jurriën Timber', 'TIMBER', 12, 80, 56, 76, 82, 83),
      p('William Saliba', 'SALIBA', 2, 80, 40, 72, 89, 88),
      p('Gabriel Magalhães', 'GABRIEL', 6, 70, 56, 64, 88, 87),
      p('Riccardo Calafiori', 'CALAFIORI', 33, 76, 56, 74, 80, 81),
      p('Martin Ødegaard', 'ØDEGAARD', 8, 74, 80, 92, 58, 88),
      p('Martín Zubimendi', 'ZUBIMENDI', 36, 66, 66, 84, 82, 85),
      p('Declan Rice', 'RICE', 41, 74, 76, 84, 86, 88),
      p('Bukayo Saka', 'SAKA', 7, 88, 84, 86, 50, 88),
      p('Viktor Gyökeres', 'GYÖKERES', 14, 86, 88, 72, 40, 87),
      p('Gabriel Martinelli', 'MARTINELLI', 11, 90, 78, 76, 42, 83),
    ],
  },
  {
    id: 'psg', name: 'Paris Saint-Germain', short: 'PSG', badge: ['#0a1f44', '#e30613', '#ffffff'],
    home: { shirt: 0x0a1f44, shorts: 0x0a1f44, socks: 0x0a1f44, trim: 0xe30613, number: '#ffffff', pattern: 'center', stripe: 0xe30613 },
    away: { shirt: 0xf4f4f4, shorts: 0xf4f4f4, socks: 0xf4f4f4, trim: 0x0a1f44, number: '#0a1f44' },
    gk: { shirt: 0xff7a00, shorts: 0x1a1a1a, socks: 0xff7a00 },
    players: [
      p('Lucas Chevalier', 'CHEVALIER', 30, 48, 16, 70, 84, 83),
      p('Achraf Hakimi', 'HAKIMI', 2, 93, 76, 82, 78, 89),
      p('Marquinhos', 'MARQUINHOS', 5, 72, 50, 74, 87, 86),
      p('Willian Pacho', 'PACHO', 51, 78, 36, 64, 85, 84),
      p('Nuno Mendes', 'N. MENDES', 25, 92, 60, 78, 80, 86),
      p('Vitinha', 'VITINHA', 17, 76, 76, 90, 74, 89),
      p('João Neves', 'J. NEVES', 87, 80, 70, 84, 80, 86),
      p('Fabián Ruiz', 'FABIÁN', 8, 66, 78, 86, 72, 84),
      p('Désiré Doué', 'DOUÉ', 14, 88, 80, 82, 40, 85),
      p('Ousmane Dembélé', 'DEMBÉLÉ', 10, 92, 86, 84, 36, 91),
      p('Khvicha Kvaratskhelia', 'KVARATSKHELIA', 7, 88, 82, 84, 40, 88),
    ],
  },
  {
    id: 'int', name: 'Inter Milan', short: 'INT', badge: ['#0068a8', '#111111', '#c9a14a'],
    home: { shirt: 0x0068a8, shorts: 0x111111, socks: 0x111111, trim: 0xc9a14a, number: '#ffffff', pattern: 'stripes', stripe: 0x111111 },
    away: { shirt: 0xf4f4f4, shorts: 0xf4f4f4, socks: 0xf4f4f4, trim: 0x0068a8, number: '#0068a8' },
    gk: { shirt: 0x2ecc71, shorts: 0x2ecc71, socks: 0x2ecc71 },
    players: [
      p('Yann Sommer', 'SOMMER', 1, 48, 18, 72, 86, 86),
      p('Denzel Dumfries', 'DUMFRIES', 2, 84, 70, 72, 78, 84),
      p('Francesco Acerbi', 'ACERBI', 15, 56, 42, 68, 85, 83),
      p('Alessandro Bastoni', 'BASTONI', 95, 70, 52, 80, 87, 87),
      p('Federico Dimarco', 'DIMARCO', 32, 78, 76, 86, 74, 86),
      p('Nicolò Barella', 'BARELLA', 23, 80, 76, 86, 78, 87),
      p('Hakan Çalhanoğlu', 'ÇALHANOĞLU', 20, 62, 84, 90, 72, 86),
      p('Henrikh Mkhitaryan', 'MKHITARYAN', 22, 72, 76, 84, 66, 82),
      p('Marcus Thuram', 'THURAM', 9, 88, 82, 74, 40, 85),
      p('Lautaro Martínez', 'LAUTARO', 10, 82, 90, 78, 48, 89),
      p('Pio Esposito', 'ESPOSITO', 94, 76, 76, 66, 36, 76),
    ],
  },
  {
    id: 'che', name: 'Chelsea', short: 'CHE', badge: ['#034694', '#ffffff', '#dba111'],
    home: { shirt: 0x034694, shorts: 0x034694, socks: 0xf4f4f4, trim: 0xdba111, number: '#ffffff' },
    away: { shirt: 0xf5f0e0, shorts: 0x1a1a1a, socks: 0xf5f0e0, trim: 0x034694, number: '#034694' },
    gk: { shirt: 0xe91e63, shorts: 0xe91e63, socks: 0xe91e63 },
    players: [
      p('Robert Sánchez', 'SÁNCHEZ', 1, 46, 16, 72, 81, 80),
      p('Reece James', 'JAMES', 24, 78, 72, 84, 80, 84),
      p('Wesley Fofana', 'FOFANA', 29, 78, 40, 62, 82, 81),
      p('Levi Colwill', 'COLWILL', 6, 72, 46, 74, 82, 82),
      p('Marc Cucurella', 'CUCURELLA', 3, 78, 54, 76, 80, 84),
      p('Moisés Caicedo', 'CAICEDO', 25, 76, 64, 80, 86, 87),
      p('Enzo Fernández', 'E. FERNÁNDEZ', 8, 70, 76, 86, 74, 85),
      p('Cole Palmer', 'PALMER', 10, 78, 88, 88, 50, 89),
      p('Pedro Neto', 'NETO', 7, 90, 76, 80, 40, 84),
      p('João Pedro', 'JOÃO PEDRO', 20, 80, 82, 78, 40, 83),
      p('Estêvão', 'ESTÊVÃO', 41, 88, 76, 78, 30, 80),
    ],
  },
  {
    id: 'mia', name: 'Inter Miami', short: 'MIA', badge: ['#f7b5cd', '#231f20', '#ffffff'],
    home: { shirt: 0xf7b5cd, shorts: 0x231f20, socks: 0xf7b5cd, trim: 0x231f20, number: '#231f20' },
    away: { shirt: 0x231f20, shorts: 0x231f20, socks: 0x231f20, trim: 0xf7b5cd, number: '#f7b5cd' },
    gk: { shirt: 0x4fc3f7, shorts: 0x4fc3f7, socks: 0x4fc3f7 },
    players: [
      p('Óscar Ustari', 'USTARI', 19, 40, 14, 60, 76, 74),
      p('Marcelo Weigandt', 'WEIGANDT', 57, 78, 50, 66, 70, 72),
      p('Maximiliano Falcón', 'FALCÓN', 37, 68, 40, 58, 76, 74),
      p('Noah Allen', 'ALLEN', 32, 74, 38, 60, 72, 70),
      p('Jordi Alba', 'JORDI ALBA', 18, 76, 64, 84, 70, 80),
      p('Rodrigo De Paul', 'DE PAUL', 7, 72, 74, 84, 74, 82),
      p('Sergio Busquets', 'BUSQUETS', 5, 42, 58, 86, 76, 80),
      p('Telasco Segovia', 'SEGOVIA', 8, 76, 72, 76, 60, 75),
      p('Lionel Messi', 'MESSI', 10, 76, 90, 92, 34, 88),
      p('Luis Suárez', 'SUÁREZ', 9, 60, 86, 78, 40, 80),
      p('Tadeo Allende', 'ALLENDE', 21, 88, 76, 70, 36, 76),
    ],
  },
  {
    id: 'nsr', name: 'Al Nassr', short: 'NSR', badge: ['#fcdc00', '#0033a0', '#ffffff'],
    home: { shirt: 0xfcdc00, shorts: 0x0033a0, socks: 0xfcdc00, trim: 0x0033a0, number: '#0033a0' },
    away: { shirt: 0x0b1f4a, shorts: 0x0b1f4a, socks: 0x0b1f4a, trim: 0xfcdc00, number: '#fcdc00' },
    gk: { shirt: 0x2e2e2e, shorts: 0x2e2e2e, socks: 0x2e2e2e },
    players: [
      p('Bento', 'BENTO', 24, 46, 16, 64, 82, 81),
      p('Sultan Al-Ghannam', 'AL-GHANNAM', 2, 80, 54, 70, 72, 74),
      p('Mohamed Simakan', 'SIMAKAN', 3, 82, 44, 64, 80, 80),
      p('Iñigo Martínez', 'IÑIGO', 26, 60, 56, 76, 82, 81),
      p('Nawaf Boushal', 'BOUSHAL', 12, 78, 48, 66, 68, 70),
      p('Marcelo Brozović', 'BROZOVIĆ', 11, 64, 70, 84, 76, 82),
      p('Abdullah Al-Khaibari', 'AL-KHAIBARI', 4, 66, 58, 70, 72, 72),
      p('João Félix', 'JOÃO FÉLIX', 79, 80, 80, 82, 40, 82),
      p('Kingsley Coman', 'COMAN', 21, 90, 76, 78, 34, 82),
      p('Cristiano Ronaldo', 'RONALDO', 7, 76, 91, 76, 32, 86),
      p('Sadio Mané', 'MANÉ', 10, 84, 80, 76, 42, 82),
    ],
  },
];

// Signature celebrations (see celebrations.js); everyone else gets a generic one.
const SIGNATURE = {
  'Cristiano Ronaldo': 'siuu',
  'Lionel Messi': 'skyPoint',
  'Kylian Mbappé': 'armsCrossed',
  'Erling Haaland': 'zen',
  'Jude Bellingham': 'heyJude',
  'Vinícius Júnior': 'dance',
  'Mohamed Salah': 'prayer',
  'Sadio Mané': 'prayer',
  'Bukayo Saka': 'iceSlide',
  'Cole Palmer': 'cold',
  'Viktor Gyökeres': 'mask',
  'Luis Suárez': 'kiss',
};
for (const club of CLUBS) {
  for (const pl of club.players) pl.celebration = SIGNATURE[pl.name] ?? null;
}

export function teamRating(club) {
  const s = club.players.reduce((a, pl) => a + pl.ovr, 0);
  return Math.round(s / club.players.length);
}

function hexDist(a, b) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return Math.hypot(ar - br, ag - bg, ab - bb) / 441;
}

// Pick the AI club's kit so it doesn't clash with the user's home kit.
export function resolveKits(userClub, aiClub) {
  const user = userClub.home;
  const clash = userClub.id === aiClub.id
    || hexDist(user.shirt, aiClub.home.shirt) < 0.3
    || hexDist(user.shorts, aiClub.home.shorts) + hexDist(user.shirt, aiClub.home.shirt) < 0.45;
  return { user, ai: clash ? aiClub.away : aiClub.home };
}
