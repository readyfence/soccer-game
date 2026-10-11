// Roster order matches the 4-3-3 formation in game.js:
// GK, RB, RCB, LCB, LB, RCM, CDM, LCM, RW, ST, LW
// Ratings: [pace, shooting, passing, defending, overall]

const p = (name, back, num, pac, sho, pas, def, ovr) => ({ name, back, num, pac, sho, pas, def, ovr });

export const SLOT_LABELS = ['GK', 'RB', 'RCB', 'LCB', 'LB', 'RCM', 'CDM', 'LCM', 'RW', 'ST', 'LW'];
export const SLOT_POS = ['GK', 'RB', 'CB', 'CB', 'LB', 'CM', 'CDM', 'CM', 'RW', 'ST', 'LW'];
export const SLOT_NUMS = [1, 2, 4, 5, 3, 8, 6, 10, 7, 9, 11];
const POS_ROLE = { GK: 'GK', RB: 'DEF', CB: 'DEF', LB: 'DEF', CM: 'MID', CDM: 'MID', RW: 'FWD', ST: 'FWD', LW: 'FWD' };

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

// FIFA men's top 10. Same 4-3-3 roster order as the clubs.
export const NATIONS = [
  {
    id: 'esp', name: 'Spain', short: 'ESP', kind: 'nation', badge: ['#c60b1e', '#f1bf00', '#1a1a2e'],
    home: { shirt: 0xc60b1e, shorts: 0x1a2340, socks: 0x1a1a1a, trim: 0xf1bf00, number: '#ffffff' },
    away: { shirt: 0x1a2340, shorts: 0x1a2340, socks: 0x1a2340, trim: 0xc60b1e, number: '#ffffff' },
    gk: { shirt: 0x1e90ff, shorts: 0x1e90ff, socks: 0x1e90ff },
    players: [
      p('Unai Simón', 'UNAI', 23, 48, 16, 68, 86, 85),
      p('Dani Carvajal', 'CARVAJAL', 2, 76, 58, 80, 82, 84),
      p('Robin Le Normand', 'LE NORMAND', 3, 70, 40, 68, 84, 83),
      p('Pau Cubarsí', 'CUBARSÍ', 4, 68, 40, 76, 83, 83),
      p('Marc Cucurella', 'CUCURELLA', 12, 78, 54, 76, 80, 84),
      p('Pedri', 'PEDRI', 8, 76, 76, 91, 68, 89),
      p('Rodri', 'RODRI', 16, 62, 78, 90, 86, 90),
      p('Fabián Ruiz', 'FABIÁN', 6, 66, 78, 86, 72, 84),
      p('Lamine Yamal', 'YAMAL', 10, 90, 82, 86, 30, 90),
      p('Álvaro Morata', 'MORATA', 7, 76, 82, 70, 40, 82),
      p('Nico Williams', 'N. WILLIAMS', 17, 94, 78, 78, 32, 85),
    ],
  },
  {
    id: 'arg', name: 'Argentina', short: 'ARG', kind: 'nation', badge: ['#75aadb', '#ffffff', '#f6b40e'],
    home: { shirt: 0x75aadb, shorts: 0x111111, socks: 0xf4f4f4, trim: 0xffffff, number: '#1a2340', pattern: 'stripes', stripe: 0xffffff },
    away: { shirt: 0x1a3a6b, shorts: 0x1a3a6b, socks: 0x1a3a6b, trim: 0xf6b40e, number: '#ffffff' },
    gk: { shirt: 0x2ecc71, shorts: 0x1a1a1a, socks: 0x2ecc71 },
    players: [
      p('Emiliano Martínez', 'DIBU', 23, 50, 18, 62, 88, 88),
      p('Nahuel Molina', 'MOLINA', 26, 82, 62, 74, 76, 81),
      p('Cristian Romero', 'CUTI', 13, 74, 44, 64, 86, 86),
      p('Lisandro Martínez', 'L. MARTÍNEZ', 25, 72, 48, 72, 85, 85),
      p('Nicolás Tagliafico', 'TAGLIAFICO', 3, 76, 56, 72, 78, 80),
      p('Rodrigo De Paul', 'DE PAUL', 7, 72, 74, 84, 74, 82),
      p('Alexis Mac Allister', 'MAC ALLISTER', 20, 70, 78, 86, 74, 85),
      p('Enzo Fernández', 'ENZO', 24, 70, 76, 86, 74, 85),
      p('Lionel Messi', 'MESSI', 10, 76, 90, 92, 34, 88),
      p('Julián Álvarez', 'ÁLVAREZ', 9, 86, 86, 78, 40, 86),
      p('Alejandro Garnacho', 'GARNACHO', 17, 90, 76, 72, 28, 80),
    ],
  },
  {
    id: 'fra', name: 'France', short: 'FRA', kind: 'nation', badge: ['#002395', '#ffffff', '#ed2939'],
    home: { shirt: 0x002395, shorts: 0x002395, socks: 0xed2939, trim: 0xffffff, number: '#ffffff' },
    away: { shirt: 0xf4f4f4, shorts: 0xf4f4f4, socks: 0xf4f4f4, trim: 0x002395, number: '#002395' },
    gk: { shirt: 0xff7a00, shorts: 0x1a1a1a, socks: 0xff7a00 },
    players: [
      p('Mike Maignan', 'MAIGNAN', 16, 52, 18, 74, 88, 88),
      p('Jules Koundé', 'KOUNDÉ', 5, 84, 54, 72, 84, 85),
      p('William Saliba', 'SALIBA', 17, 80, 40, 72, 89, 88),
      p('Ibrahima Konaté', 'KONATÉ', 4, 80, 40, 60, 85, 85),
      p('Theo Hernández', 'T. HERNÁNDEZ', 22, 92, 70, 78, 76, 86),
      p('Eduardo Camavinga', 'CAMAVINGA', 6, 80, 68, 82, 80, 84),
      p('Aurélien Tchouaméni', 'TCHOUAMÉNI', 8, 70, 66, 78, 84, 85),
      p('Adrien Rabiot', 'RABIOT', 14, 72, 74, 80, 76, 83),
      p('Ousmane Dembélé', 'DEMBÉLÉ', 11, 92, 86, 84, 36, 91),
      p('Kylian Mbappé', 'MBAPPÉ', 10, 97, 92, 81, 36, 91),
      p('Bradley Barcola', 'BARCOLA', 7, 92, 76, 76, 28, 83),
    ],
  },
  {
    id: 'eng', name: 'England', short: 'ENG', kind: 'nation', badge: ['#ffffff', '#cf081f', '#002366'],
    home: { shirt: 0xf6f6f6, shorts: 0x00205b, socks: 0xf6f6f6, trim: 0xcf081f, number: '#00205b' },
    away: { shirt: 0xc8102e, shorts: 0xc8102e, socks: 0xc8102e, trim: 0xffffff, number: '#ffffff' },
    gk: { shirt: 0x1faa59, shorts: 0x1faa59, socks: 0x1faa59 },
    players: [
      p('Jordan Pickford', 'PICKFORD', 1, 50, 18, 72, 84, 83),
      p('Trent Alexander-Arnold', 'ARNOLD', 2, 76, 72, 90, 76, 86),
      p('John Stones', 'STONES', 5, 70, 50, 78, 84, 84),
      p('Marc Guéhi', 'GUÉHI', 6, 76, 40, 70, 84, 83),
      p('Rico Lewis', 'LEWIS', 12, 78, 60, 80, 76, 80),
      p('Jude Bellingham', 'BELLINGHAM', 10, 80, 86, 84, 76, 89),
      p('Declan Rice', 'RICE', 4, 74, 76, 84, 86, 88),
      p('Cole Palmer', 'PALMER', 20, 78, 88, 88, 50, 89),
      p('Bukayo Saka', 'SAKA', 7, 88, 84, 86, 50, 88),
      p('Harry Kane', 'KANE', 9, 68, 93, 86, 46, 90),
      p('Anthony Gordon', 'GORDON', 11, 90, 78, 76, 36, 82),
    ],
  },
  {
    id: 'bra', name: 'Brazil', short: 'BRA', kind: 'nation', badge: ['#fcdc00', '#009c3b', '#002776'],
    home: { shirt: 0xfcdc00, shorts: 0x002776, socks: 0xfcdc00, trim: 0x009c3b, number: '#002776' },
    away: { shirt: 0x002776, shorts: 0x002776, socks: 0x002776, trim: 0xfcdc00, number: '#fcdc00' },
    gk: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111 },
    players: [
      p('Alisson Becker', 'ALISSON', 1, 52, 18, 76, 89, 89),
      p('Vanderson', 'VANDERSON', 2, 86, 58, 74, 74, 80),
      p('Éder Militão', 'MILITÃO', 3, 83, 50, 68, 85, 85),
      p('Marquinhos', 'MARQUINHOS', 4, 72, 50, 74, 87, 86),
      p('Carlos Augusto', 'C. AUGUSTO', 6, 80, 62, 76, 76, 80),
      p('Bruno Guimarães', 'BRUNO G.', 8, 72, 74, 86, 80, 86),
      p('André', 'ANDRÉ', 18, 70, 58, 80, 84, 83),
      p('João Gomes', 'J. GOMES', 5, 76, 62, 76, 82, 82),
      p('Raphinha', 'RAPHINHA', 11, 90, 86, 84, 50, 89),
      p('Richarlison', 'RICHARLISON', 9, 82, 82, 70, 48, 82),
      p('Vinícius Júnior', 'VINI JR.', 7, 95, 84, 81, 29, 90),
    ],
  },
  {
    id: 'por', name: 'Portugal', short: 'POR', kind: 'nation', badge: ['#006600', '#ff0000', '#ffcc00'],
    home: { shirt: 0xc8102e, shorts: 0x006633, socks: 0xc8102e, trim: 0xffcc00, number: '#ffffff' },
    away: { shirt: 0xf4f4f4, shorts: 0xf4f4f4, socks: 0xf4f4f4, trim: 0x006633, number: '#c8102e' },
    gk: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111 },
    players: [
      p('Diogo Costa', 'D. COSTA', 1, 50, 16, 70, 85, 84),
      p('João Cancelo', 'CANCELO', 20, 84, 70, 86, 74, 83),
      p('Rúben Dias', 'DIAS', 3, 64, 40, 70, 89, 87),
      p('António Silva', 'A. SILVA', 4, 74, 42, 66, 82, 81),
      p('Nuno Mendes', 'N. MENDES', 5, 92, 60, 78, 80, 86),
      p('Vitinha', 'VITINHA', 8, 76, 76, 90, 74, 89),
      p('João Palhinha', 'PALHINHA', 6, 64, 60, 74, 86, 83),
      p('Bruno Fernandes', 'B. FERNANDES', 10, 70, 86, 90, 62, 87),
      p('Bernardo Silva', 'BERNARDO', 11, 76, 78, 90, 54, 87),
      p('Cristiano Ronaldo', 'RONALDO', 7, 76, 91, 76, 32, 86),
      p('Rafael Leão', 'LEÃO', 17, 94, 80, 78, 30, 85),
    ],
  },
  {
    id: 'ned', name: 'Netherlands', short: 'NED', kind: 'nation', badge: ['#ff6c00', '#ffffff', '#21468b'],
    home: { shirt: 0xff6c00, shorts: 0xf4f4f4, socks: 0xff6c00, trim: 0x21468b, number: '#ffffff' },
    away: { shirt: 0x21468b, shorts: 0x21468b, socks: 0x21468b, trim: 0xff6c00, number: '#ffffff' },
    gk: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111 },
    players: [
      p('Bart Verbruggen', 'VERBRUGGEN', 1, 50, 16, 68, 82, 81),
      p('Denzel Dumfries', 'DUMFRIES', 22, 84, 70, 72, 78, 84),
      p('Virgil van Dijk', 'VAN DIJK', 4, 76, 60, 72, 90, 89),
      p('Matthijs de Ligt', 'DE LIGT', 3, 70, 48, 68, 85, 84),
      p('Nathan Aké', 'AKÉ', 5, 76, 50, 74, 84, 83),
      p('Tijjani Reijnders', 'REIJNDERS', 14, 80, 80, 84, 70, 85),
      p('Frenkie de Jong', 'DE JONG', 21, 80, 70, 88, 76, 86),
      p('Ryan Gravenberch', 'GRAVENBERCH', 8, 78, 70, 80, 80, 85),
      p('Xavi Simons', 'SIMONS', 7, 86, 80, 84, 40, 84),
      p('Memphis Depay', 'MEMPHIS', 10, 80, 84, 80, 34, 83),
      p('Cody Gakpo', 'GAKPO', 11, 84, 82, 78, 40, 84),
    ],
  },
  {
    id: 'bel', name: 'Belgium', short: 'BEL', kind: 'nation', badge: ['#000000', '#fae042', '#ed2939'],
    home: { shirt: 0xc8102e, shorts: 0xc8102e, socks: 0xc8102e, trim: 0xfae042, number: '#ffffff' },
    away: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111, trim: 0xfae042, number: '#fae042' },
    gk: { shirt: 0x3ad6c5, shorts: 0x1a1a1a, socks: 0x3ad6c5 },
    players: [
      p('Koen Casteels', 'CASTEELS', 1, 46, 16, 70, 84, 83),
      p('Timothy Castagne', 'CASTAGNE', 21, 78, 56, 74, 76, 79),
      p('Wout Faes', 'FAES', 4, 70, 40, 66, 80, 79),
      p('Arthur Theate', 'THEATE', 5, 74, 44, 68, 80, 79),
      p('Maxim De Cuyper', 'DE CUYPER', 3, 78, 58, 74, 74, 77),
      p('Youri Tielemans', 'TIELEMANS', 8, 66, 78, 86, 70, 83),
      p('Amadou Onana', 'ONANA', 6, 76, 64, 76, 82, 82),
      p('Kevin De Bruyne', 'DE BRUYNE', 7, 68, 86, 92, 60, 88),
      p('Jérémy Doku', 'DOKU', 11, 94, 72, 76, 28, 83),
      p('Loïs Openda', 'OPENDA', 9, 92, 82, 66, 32, 82),
      p('Leandro Trossard', 'TROSSARD', 10, 80, 82, 82, 40, 83),
    ],
  },
  {
    id: 'ger', name: 'Germany', short: 'GER', kind: 'nation', badge: ['#000000', '#dd0000', '#ffcc00'],
    home: { shirt: 0xf4f4f4, shorts: 0x111111, socks: 0xf4f4f4, trim: 0x111111, number: '#111111' },
    away: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111, trim: 0xf4f4f4, number: '#ffffff' },
    gk: { shirt: 0x3ad6c5, shorts: 0x1a1a1a, socks: 0x3ad6c5 },
    players: [
      p('Manuel Neuer', 'NEUER', 1, 44, 20, 80, 87, 86),
      p('Joshua Kimmich', 'KIMMICH', 6, 68, 74, 90, 80, 88),
      p('Jonathan Tah', 'TAH', 4, 70, 44, 66, 85, 84),
      p('Nico Schlotterbeck', 'SCHLOTTERBECK', 2, 76, 52, 74, 84, 84),
      p('David Raum', 'RAUM', 3, 82, 62, 80, 72, 80),
      p('Jamal Musiala', 'MUSIALA', 10, 84, 82, 84, 58, 89),
      p('Robert Andrich', 'ANDRICH', 23, 64, 66, 76, 82, 80),
      p('Florian Wirtz', 'WIRTZ', 17, 80, 84, 88, 50, 88),
      p('Serge Gnabry', 'GNABRY', 7, 84, 80, 78, 36, 82),
      p('Niclas Füllkrug', 'FÜLLKRUG', 9, 62, 84, 70, 40, 81),
      p('Leroy Sané', 'SANÉ', 19, 90, 78, 80, 32, 83),
    ],
  },
  {
    id: 'ita', name: 'Italy', short: 'ITA', kind: 'nation', badge: ['#009246', '#ffffff', '#ce2b37'],
    home: { shirt: 0x0068a8, shorts: 0x0068a8, socks: 0x0068a8, trim: 0xffffff, number: '#ffffff' },
    away: { shirt: 0xf4f4f4, shorts: 0xf4f4f4, socks: 0xf4f4f4, trim: 0x0068a8, number: '#0068a8' },
    gk: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111 },
    players: [
      p('Gianluigi Donnarumma', 'DONNARUMMA', 1, 50, 20, 64, 89, 89),
      p('Giovanni Di Lorenzo', 'DI LORENZO', 2, 76, 58, 76, 80, 82),
      p('Alessandro Bastoni', 'BASTONI', 23, 70, 52, 80, 87, 87),
      p('Riccardo Calafiori', 'CALAFIORI', 13, 76, 56, 74, 80, 81),
      p('Federico Dimarco', 'DIMARCO', 3, 78, 76, 86, 74, 86),
      p('Nicolò Barella', 'BARELLA', 18, 80, 76, 86, 78, 87),
      p('Samuele Ricci', 'RICCI', 8, 72, 66, 80, 76, 80),
      p('Lorenzo Pellegrini', 'PELLEGRINI', 10, 70, 78, 84, 68, 82),
      p('Federico Chiesa', 'CHIESA', 7, 88, 80, 76, 40, 83),
      p('Mateo Retegui', 'RETEGUI', 11, 76, 84, 66, 38, 81),
      p('Mattia Zaccagni', 'ZACCAGNI', 20, 84, 78, 78, 36, 81),
    ],
  },
];

// All-time peak XIs — stacked legends, not the current squad.
export const PRIMES = [
  {
    id: 'pbra', name: 'Prime Brazil', short: 'PBR', kind: 'prime', badge: ['#fcdc00', '#009c3b', '#ffd400'],
    home: { shirt: 0xfcdc00, shorts: 0x002776, socks: 0xfcdc00, trim: 0x009c3b, number: '#002776' },
    away: { shirt: 0x009c3b, shorts: 0x009c3b, socks: 0x009c3b, trim: 0xfcdc00, number: '#fcdc00' },
    gk: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111 },
    players: [
      p('Cláudio Taffarel', 'TAFFAREL', 1, 52, 18, 72, 90, 88),
      p('Cafu', 'CAFU', 2, 88, 64, 84, 84, 90),
      p('Lúcio', 'LÚCIO', 3, 82, 52, 70, 90, 89),
      p('Aldair', 'ALDAIR', 4, 72, 44, 72, 90, 88),
      p('Roberto Carlos', 'R. CARLOS', 6, 92, 82, 84, 80, 90),
      p('Zico', 'ZICO', 10, 82, 92, 94, 52, 93),
      p('Dunga', 'DUNGA', 5, 68, 62, 80, 88, 86),
      p('Sócrates', 'SÓCRATES', 8, 74, 86, 92, 58, 90),
      p('Garrincha', 'GARRINCHA', 7, 94, 88, 86, 28, 94),
      p('Pelé', 'PELÉ', 10, 94, 96, 92, 50, 98),
      p('Ronaldo Nazário', 'R9', 9, 96, 95, 80, 32, 96),
    ],
  },
  {
    id: 'pfra', name: 'Prime France', short: 'PFR', kind: 'prime', badge: ['#002395', '#ed2939', '#ffd400'],
    home: { shirt: 0x002395, shorts: 0x002395, socks: 0xed2939, trim: 0xffffff, number: '#ffffff' },
    away: { shirt: 0xf4f4f4, shorts: 0xf4f4f4, socks: 0xf4f4f4, trim: 0x002395, number: '#002395' },
    gk: { shirt: 0xff7a00, shorts: 0x1a1a1a, socks: 0xff7a00 },
    players: [
      p('Fabien Barthez', 'BARTHEZ', 16, 54, 18, 70, 88, 86),
      p('Lilian Thuram', 'THURAM', 15, 86, 48, 74, 90, 90),
      p('Marcel Desailly', 'DESAILLY', 8, 78, 50, 70, 91, 89),
      p('Laurent Blanc', 'BLANC', 5, 68, 62, 80, 88, 87),
      p('Bixente Lizarazu', 'LIZARAZU', 3, 86, 58, 78, 82, 86),
      p('Patrick Vieira', 'VIEIRA', 4, 84, 74, 84, 88, 90),
      p('Didier Deschamps', 'DESCHAMPS', 7, 70, 58, 82, 86, 86),
      p('Zinedine Zidane', 'ZIDANE', 10, 76, 88, 96, 62, 96),
      p('Robert Pires', 'PIRES', 11, 86, 84, 88, 40, 88),
      p('Thierry Henry', 'HENRY', 12, 96, 93, 84, 36, 94),
      p('Michel Platini', 'PLATINI', 10, 78, 92, 94, 48, 94),
    ],
  },
  {
    id: 'parg', name: 'Prime Argentina', short: 'PAR', kind: 'prime', badge: ['#75aadb', '#f6b40e', '#ffd400'],
    home: { shirt: 0x75aadb, shorts: 0x111111, socks: 0xf4f4f4, trim: 0xffffff, number: '#1a2340', pattern: 'stripes', stripe: 0xffffff },
    away: { shirt: 0x1a3a6b, shorts: 0x1a3a6b, socks: 0x1a3a6b, trim: 0xf6b40e, number: '#ffffff' },
    gk: { shirt: 0x2ecc71, shorts: 0x1a1a1a, socks: 0x2ecc71 },
    players: [
      p('Ubaldo Fillol', 'FILLOL', 5, 48, 16, 66, 90, 87),
      p('Javier Zanetti', 'ZANETTI', 4, 84, 62, 82, 86, 89),
      p('Daniel Passarella', 'PASSARELLA', 6, 72, 72, 78, 91, 89),
      p('Roberto Ayala', 'AYALA', 2, 74, 48, 70, 90, 88),
      p('Juan Pablo Sorín', 'SORÍN', 3, 82, 64, 80, 78, 84),
      p('Fernando Redondo', 'REDONDO', 5, 74, 68, 92, 82, 90),
      p('Javier Mascherano', 'MASCHERANO', 14, 72, 52, 80, 90, 87),
      p('Diego Maradona', 'MARADONA', 10, 88, 93, 96, 40, 97),
      p('Lionel Messi', 'MESSI', 10, 92, 94, 95, 34, 94),
      p('Gabriel Batistuta', 'BATISTUTA', 9, 86, 94, 72, 42, 91),
      p('Mario Kempes', 'KEMPES', 10, 88, 92, 80, 44, 90),
    ],
  },
  {
    id: 'pger', name: 'Prime Germany', short: 'PGE', kind: 'prime', badge: ['#000000', '#ffcc00', '#ffd400'],
    home: { shirt: 0xf4f4f4, shorts: 0x111111, socks: 0xf4f4f4, trim: 0x111111, number: '#111111' },
    away: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111, trim: 0xffcc00, number: '#ffffff' },
    gk: { shirt: 0x3ad6c5, shorts: 0x1a1a1a, socks: 0x3ad6c5 },
    players: [
      p('Oliver Kahn', 'KAHN', 1, 50, 18, 68, 93, 91),
      p('Philipp Lahm', 'LAHM', 16, 80, 62, 90, 88, 90),
      p('Franz Beckenbauer', 'DER KAISER', 5, 82, 70, 88, 94, 95),
      p('Matthias Sammer', 'SAMMER', 6, 80, 64, 80, 90, 88),
      p('Paul Breitner', 'BREITNER', 3, 80, 78, 84, 80, 88),
      p('Lothar Matthäus', 'MATTHÄUS', 10, 82, 84, 88, 86, 92),
      p('Michael Ballack', 'BALLACK', 13, 74, 86, 84, 80, 88),
      p('Günter Netzer', 'NETZER', 8, 76, 82, 92, 54, 90),
      p('Karl-Heinz Rummenigge', 'RUMMENIGGE', 11, 90, 91, 80, 40, 91),
      p('Gerd Müller', 'DER BOMBER', 13, 82, 96, 70, 38, 94),
      p('Jürgen Klinsmann', 'KLINSMANN', 18, 88, 90, 74, 36, 89),
    ],
  },
  {
    id: 'pned', name: 'Prime Netherlands', short: 'PNL', kind: 'prime', badge: ['#ff6c00', '#ffd400', '#21468b'],
    home: { shirt: 0xff6c00, shorts: 0xf4f4f4, socks: 0xff6c00, trim: 0x21468b, number: '#ffffff' },
    away: { shirt: 0x21468b, shorts: 0x21468b, socks: 0x21468b, trim: 0xff6c00, number: '#ffffff' },
    gk: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111 },
    players: [
      p('Edwin van der Sar', 'VAN DER SAR', 1, 50, 16, 74, 90, 89),
      p('Wim Suurbier', 'SUURBIER', 2, 82, 50, 72, 80, 83),
      p('Frank Rijkaard', 'RIJKAARD', 8, 78, 70, 84, 90, 90),
      p('Jaap Stam', 'STAM', 3, 76, 48, 66, 91, 88),
      p('Ruud Krol', 'KROL', 5, 80, 58, 80, 86, 87),
      p('Ruud Gullit', 'GULLIT', 10, 86, 88, 88, 74, 92),
      p('Johan Neeskens', 'NEESKENS', 13, 82, 78, 82, 84, 88),
      p('Edgar Davids', 'DAVIDS', 16, 84, 70, 80, 84, 86),
      p('Dennis Bergkamp', 'BERGKAMP', 10, 80, 90, 92, 40, 92),
      p('Marco van Basten', 'VAN BASTEN', 9, 86, 95, 80, 36, 94),
      p('Johan Cruyff', 'CRUYFF', 14, 90, 91, 94, 42, 96),
    ],
  },
  {
    id: 'pita', name: 'Prime Italy', short: 'PIT', kind: 'prime', badge: ['#0068a8', '#ffd400', '#ce2b37'],
    home: { shirt: 0x0068a8, shorts: 0x0068a8, socks: 0x0068a8, trim: 0xffffff, number: '#ffffff' },
    away: { shirt: 0xf4f4f4, shorts: 0xf4f4f4, socks: 0xf4f4f4, trim: 0x0068a8, number: '#0068a8' },
    gk: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111 },
    players: [
      p('Gianluigi Buffon', 'BUFFON', 1, 50, 18, 70, 93, 92),
      p('Gianluca Zambrotta', 'ZAMBROTTA', 19, 84, 62, 78, 84, 86),
      p('Alessandro Nesta', 'NESTA', 13, 76, 42, 74, 94, 92),
      p('Paolo Maldini', 'MALDINI', 3, 80, 50, 80, 96, 94),
      p('Giacinto Facchetti', 'FACCHETTI', 3, 82, 58, 78, 88, 88),
      p('Andrea Pirlo', 'PIRLO', 21, 64, 80, 96, 68, 92),
      p('Gennaro Gattuso', 'GATTUSO', 8, 74, 58, 72, 90, 86),
      p('Francesco Totti', 'TOTTI', 10, 74, 90, 92, 48, 92),
      p('Roberto Baggio', 'BAGGIO', 10, 82, 91, 90, 36, 93),
      p('Paolo Rossi', 'ROSSI', 20, 84, 90, 70, 34, 88),
      p('Alessandro Del Piero', 'DEL PIERO', 10, 84, 90, 88, 34, 91),
    ],
  },
  {
    id: 'prma', name: 'Prime Real Madrid', short: 'PRM', kind: 'prime', badge: ['#ffffff', '#d4af37', '#ffd400'],
    home: { shirt: 0xf6f6f6, shorts: 0xf6f6f6, socks: 0xf6f6f6, trim: 0xd4af37, number: '#1a2340' },
    away: { shirt: 0x1a2340, shorts: 0x1a2340, socks: 0x1a2340, trim: 0xd4af37, number: '#ffffff' },
    gk: { shirt: 0x2bb673, shorts: 0x1c1c1c, socks: 0x2bb673 },
    players: [
      p('Iker Casillas', 'CASILLAS', 1, 54, 18, 72, 92, 91),
      p('Míchel Salgado', 'SALGADO', 2, 80, 52, 74, 82, 84),
      p('Fernando Hierro', 'HIERRO', 4, 70, 78, 84, 90, 90),
      p('Sergio Ramos', 'RAMOS', 4, 80, 70, 76, 90, 89),
      p('Roberto Carlos', 'R. CARLOS', 3, 92, 82, 84, 80, 90),
      p('Zinedine Zidane', 'ZIDANE', 5, 76, 88, 96, 62, 96),
      p('Claude Makélélé', 'MAKÉLÉLÉ', 6, 72, 50, 80, 90, 87),
      p('Luís Figo', 'FIGO', 10, 84, 86, 90, 44, 92),
      p('Cristiano Ronaldo', 'RONALDO', 7, 94, 94, 82, 34, 94),
      p('Ronaldo Nazário', 'R9', 9, 96, 95, 80, 32, 96),
      p('Raúl', 'RAÚL', 7, 86, 92, 84, 40, 91),
    ],
  },
  {
    id: 'pfcb', name: 'Prime Barcelona', short: 'PFC', kind: 'prime', badge: ['#a50044', '#004d98', '#ffd400'],
    home: { shirt: 0xa50044, shorts: 0x004d98, socks: 0x004d98, trim: 0xedbb00, number: '#edbb00', pattern: 'stripes', stripe: 0x004d98 },
    away: { shirt: 0xf0f0f0, shorts: 0xf0f0f0, socks: 0xf0f0f0, trim: 0xa50044, number: '#a50044' },
    gk: { shirt: 0x2e2e2e, shorts: 0x2e2e2e, socks: 0x2e2e2e },
    players: [
      p('Víctor Valdés', 'VALDÉS', 1, 50, 16, 74, 88, 86),
      p('Dani Alves', 'DANI ALVES', 2, 88, 70, 86, 78, 88),
      p('Carles Puyol', 'PUYOL', 5, 76, 48, 70, 92, 90),
      p('Gerard Piqué', 'PIQUÉ', 3, 68, 58, 76, 88, 88),
      p('Eric Abidal', 'ABIDAL', 22, 80, 44, 74, 86, 85),
      p('Xavi Hernández', 'XAVI', 6, 70, 74, 96, 70, 93),
      p('Sergio Busquets', 'BUSQUETS', 16, 58, 62, 90, 86, 89),
      p('Andrés Iniesta', 'INIESTA', 8, 76, 80, 94, 62, 93),
      p('Lionel Messi', 'MESSI', 10, 92, 94, 95, 34, 94),
      p('Samuel Eto\'o', 'ETO\'O', 9, 92, 90, 74, 42, 90),
      p('Ronaldinho', 'RONALDINHO', 10, 88, 88, 92, 32, 94),
    ],
  },
  {
    id: 'pmun', name: 'Prime Man United', short: 'PMU', kind: 'prime', badge: ['#da291c', '#ffd400', '#111111'],
    home: { shirt: 0xda291c, shorts: 0xf4f4f4, socks: 0x111111, trim: 0xffffff, number: '#ffffff' },
    away: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111, trim: 0xda291c, number: '#ffffff' },
    gk: { shirt: 0x1faa59, shorts: 0x1faa59, socks: 0x1faa59 },
    players: [
      p('Peter Schmeichel', 'SCHMEICHEL', 1, 48, 18, 68, 92, 91),
      p('Gary Neville', 'G. NEVILLE', 2, 76, 48, 74, 84, 84),
      p('Rio Ferdinand', 'FERDINAND', 5, 80, 44, 74, 90, 89),
      p('Nemanja Vidić', 'VIDIĆ', 15, 70, 42, 62, 90, 88),
      p('Denis Irwin', 'IRWIN', 3, 78, 64, 80, 84, 86),
      p('Paul Scholes', 'SCHOLES', 18, 70, 88, 94, 70, 91),
      p('Roy Keane', 'KEANE', 16, 74, 70, 82, 90, 89),
      p('Ryan Giggs', 'GIGGS', 11, 88, 80, 86, 50, 90),
      p('David Beckham', 'BECKHAM', 7, 76, 86, 94, 48, 91),
      p('Cristiano Ronaldo', 'RONALDO', 7, 94, 94, 82, 34, 94),
      p('Eric Cantona', 'CANTONA', 7, 80, 90, 88, 48, 91),
    ],
  },
  {
    id: 'pmil', name: 'Prime AC Milan', short: 'PMI', kind: 'prime', badge: ['#fb090b', '#111111', '#ffd400'],
    home: { shirt: 0xfb090b, shorts: 0x111111, socks: 0x111111, trim: 0xffffff, number: '#ffffff', pattern: 'stripes', stripe: 0x111111 },
    away: { shirt: 0xf4f4f4, shorts: 0xf4f4f4, socks: 0xf4f4f4, trim: 0xfb090b, number: '#111111' },
    gk: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111 },
    players: [
      p('Dida', 'DIDA', 1, 50, 16, 66, 88, 87),
      p('Cafu', 'CAFU', 2, 88, 64, 84, 84, 90),
      p('Alessandro Nesta', 'NESTA', 13, 76, 42, 74, 94, 92),
      p('Paolo Maldini', 'MALDINI', 3, 80, 50, 80, 96, 94),
      p('Kakha Kaladze', 'KALADZE', 4, 74, 44, 70, 84, 84),
      p('Andrea Pirlo', 'PIRLO', 21, 64, 80, 96, 68, 92),
      p('Gennaro Gattuso', 'GATTUSO', 8, 74, 58, 72, 90, 86),
      p('Clarence Seedorf', 'SEEDORF', 10, 78, 82, 88, 70, 89),
      p('Kaká', 'KAKÁ', 22, 88, 88, 90, 40, 92),
      p('Andriy Shevchenko', 'SHEVCHENKO', 7, 88, 92, 74, 40, 91),
      p('Filippo Inzaghi', 'INZAGHI', 9, 82, 90, 62, 32, 87),
    ],
  },
  {
    id: 'pbay', name: 'Prime Bayern', short: 'PBY', kind: 'prime', badge: ['#dc052d', '#ffd400', '#0066b2'],
    home: { shirt: 0xdc052d, shorts: 0xdc052d, socks: 0xdc052d, trim: 0xffffff, number: '#ffffff', sleeves: 0xffffff },
    away: { shirt: 0x1a1a1a, shorts: 0x1a1a1a, socks: 0x1a1a1a, trim: 0xdc052d, number: '#dc052d' },
    gk: { shirt: 0x3ad6c5, shorts: 0x1a1a1a, socks: 0x3ad6c5 },
    players: [
      p('Oliver Kahn', 'KAHN', 1, 50, 18, 68, 93, 91),
      p('Philipp Lahm', 'LAHM', 21, 80, 62, 90, 88, 90),
      p('Franz Beckenbauer', 'DER KAISER', 5, 82, 70, 88, 94, 95),
      p('Lúcio', 'LÚCIO', 3, 82, 52, 70, 90, 89),
      p('Paul Breitner', 'BREITNER', 3, 80, 78, 84, 80, 88),
      p('Lothar Matthäus', 'MATTHÄUS', 10, 82, 84, 88, 86, 92),
      p('Bastian Schweinsteiger', 'SCHWEINSTEIGER', 31, 70, 80, 88, 80, 88),
      p('Thomas Müller', 'MÜLLER', 25, 76, 86, 86, 54, 88),
      p('Arjen Robben', 'ROBBEN', 10, 92, 88, 84, 32, 91),
      p('Gerd Müller', 'DER BOMBER', 13, 82, 96, 70, 38, 94),
      p('Franck Ribéry', 'RIBÉRY', 7, 90, 84, 86, 36, 90),
    ],
  },
  {
    id: 'pliv', name: 'Prime Liverpool', short: 'PLI', kind: 'prime', badge: ['#c8102e', '#ffd400', '#00b2a9'],
    home: { shirt: 0xc8102e, shorts: 0xc8102e, socks: 0xc8102e, trim: 0xffffff, number: '#ffffff' },
    away: { shirt: 0xf2f2f2, shorts: 0x111111, socks: 0xf2f2f2, trim: 0xc8102e, number: '#c8102e' },
    gk: { shirt: 0x7ad400, shorts: 0x1a1a1a, socks: 0x7ad400 },
    players: [
      p('Jerzy Dudek', 'DUDEK', 1, 48, 16, 64, 84, 83),
      p('Steve Finnan', 'FINNAN', 3, 76, 50, 74, 80, 80),
      p('Jamie Carragher', 'CARRAGHER', 23, 68, 36, 66, 86, 84),
      p('Sami Hyypiä', 'HYYPIÄ', 4, 64, 48, 68, 86, 84),
      p('John Arne Riise', 'RIISE', 6, 82, 74, 78, 76, 82),
      p('Steven Gerrard', 'GERRARD', 8, 80, 88, 90, 78, 91),
      p('Xabi Alonso', 'ALONSO', 14, 64, 78, 92, 80, 89),
      p('Javier Mascherano', 'MASCHERANO', 20, 72, 52, 80, 90, 87),
      p('Mohamed Salah', 'SALAH', 11, 88, 88, 84, 44, 90),
      p('Fernando Torres', 'TORRES', 9, 90, 90, 72, 36, 89),
      p('Luis Suárez', 'SUÁREZ', 7, 84, 91, 82, 42, 90),
    ],
  },
];

export const TEAMS = [...CLUBS, ...NATIONS, ...PRIMES];

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
  'Julián Álvarez': 'skyPoint',
  'Lamine Yamal': 'iceSlide',
  'Harry Kane': 'armsCrossed',
  'Kevin De Bruyne': 'heyJude',
  'Pelé': 'skyPoint',
  'Diego Maradona': 'kiss',
  'Zinedine Zidane': 'zen',
  'Johan Cruyff': 'heyJude',
  'Ronaldo Nazário': 'dance',
  'Thierry Henry': 'armsCrossed',
  'Garrincha': 'dance',
  'Roberto Baggio': 'skyPoint',
  'Marco van Basten': 'armsCrossed',
  'Gerd Müller': 'mask',
  'Franz Beckenbauer': 'heyJude',
  'Andrea Pirlo': 'zen',
  'Ronaldinho': 'dance',
  'Kaká': 'skyPoint',
  'David Beckham': 'heyJude',
  'Steven Gerrard': 'heyJude',
  'Eric Cantona': 'armsCrossed',
  'Raúl': 'kiss',
  'Luís Figo': 'iceSlide',
  'Andrés Iniesta': 'zen',
  'Xavi Hernández': 'zen',
  'Andriy Shevchenko': 'mask',
  'Arjen Robben': 'iceSlide',
  'Franck Ribéry': 'dance',
  'Fernando Torres': 'armsCrossed',
  'Samuel Eto\'o': 'mask',
  'Lev Yashin': 'zen',
  'Franco Baresi': 'heyJude',
  'Bobby Moore': 'heyJude',
  'Eusébio': 'armsCrossed',
  'Ferenc Puskás': 'mask',
  'Alfredo Di Stéfano': 'skyPoint',
  'George Best': 'dance',
  'Bobby Charlton': 'heyJude',
  'Kenny Dalglish': 'kiss',
  'Romário': 'dance',
  'Rivaldo': 'skyPoint',
  'Hristo Stoichkov': 'mask',
  'George Weah': 'armsCrossed',
  'Didier Drogba': 'mask',
  'Zlatan Ibrahimović': 'armsCrossed',
  'Wayne Rooney': 'heyJude',
  'Frank Lampard': 'heyJude',
  'Fabio Cannavaro': 'heyJude',
  'Luka Modrić': 'zen',
  'Toni Kroos': 'zen',
  'Karim Benzema': 'kiss',
  'Neymar': 'dance',
};
const SHOT_SPEC = {
  'Cristiano Ronaldo': { lon: 96, fin: 88 },
  'Lionel Messi': { lon: 89, fin: 98 },
  'Kylian Mbappé': { lon: 84, fin: 88 },
  'Erling Haaland': { lon: 76, fin: 68 },
  'Jude Bellingham': { lon: 86, fin: 84 },
  'Vinícius Júnior': { lon: 70, fin: 86 },
  'Mohamed Salah': { lon: 86, fin: 91 },
  'Harry Kane': { lon: 91, fin: 85 },
  'Robert Lewandowski': { lon: 89, fin: 80 },
  'Lamine Yamal': { lon: 78, fin: 94 },
  'Bukayo Saka': { lon: 76, fin: 91 },
  'Cole Palmer': { lon: 82, fin: 94 },
  'Phil Foden': { lon: 82, fin: 92 },
  'Pedri': { lon: 74, fin: 88 },
  'Kevin De Bruyne': { lon: 93, fin: 90 },
  'Bruno Fernandes': { lon: 91, fin: 88 },
  'Federico Valverde': { lon: 91, fin: 72 },
  'Rodri': { lon: 88, fin: 70 },
  'Hakan Çalhanoğlu': { lon: 90, fin: 86 },
  'Martin Ødegaard': { lon: 78, fin: 90 },
  'Florian Wirtz': { lon: 80, fin: 91 },
  'Jamal Musiala': { lon: 76, fin: 90 },
  'Raphinha': { lon: 84, fin: 88 },
  'Rodrygo': { lon: 80, fin: 86 },
  'Ousmane Dembélé': { lon: 78, fin: 88 },
  'Khvicha Kvaratskhelia': { lon: 74, fin: 90 },
  'Lautaro Martínez': { lon: 80, fin: 86 },
  'Viktor Gyökeres': { lon: 82, fin: 70 },
  'Alexander Isak': { lon: 78, fin: 84 },
  'Julián Álvarez': { lon: 80, fin: 86 },
  'Nico Williams': { lon: 72, fin: 84 },
  'Luis Suárez': { lon: 86, fin: 88 },
  'Pelé': { lon: 94, fin: 93 },
  'Diego Maradona': { lon: 85, fin: 97 },
  'Zinedine Zidane': { lon: 86, fin: 96 },
  'Johan Cruyff': { lon: 86, fin: 95 },
  'Ronaldo Nazário': { lon: 80, fin: 86 },
  'Thierry Henry': { lon: 88, fin: 92 },
  'Garrincha': { lon: 78, fin: 94 },
  'Zico': { lon: 95, fin: 93 },
  'Roberto Carlos': { lon: 97, fin: 70 },
  'Andrea Pirlo': { lon: 94, fin: 90 },
  'Roberto Baggio': { lon: 86, fin: 95 },
  'Francesco Totti': { lon: 88, fin: 93 },
  'Alessandro Del Piero': { lon: 84, fin: 94 },
  'Marco van Basten': { lon: 82, fin: 90 },
  'Dennis Bergkamp': { lon: 86, fin: 94 },
  'Michel Platini': { lon: 88, fin: 94 },
  'Gerd Müller': { lon: 78, fin: 80 },
  'Karl-Heinz Rummenigge': { lon: 88, fin: 82 },
  'Lothar Matthäus': { lon: 92, fin: 78 },
  'Günter Netzer': { lon: 90, fin: 86 },
  'Franz Beckenbauer': { lon: 84, fin: 80 },
  'Ruud Gullit': { lon: 86, fin: 84 },
  'Gabriel Batistuta': { lon: 90, fin: 78 },
  'Mario Kempes': { lon: 86, fin: 82 },
  'Robert Pires': { lon: 80, fin: 90 },
  'Sócrates': { lon: 88, fin: 90 },
  'Ronaldinho': { lon: 82, fin: 95 },
  'Kaká': { lon: 86, fin: 90 },
  'David Beckham': { lon: 95, fin: 92 },
  'Steven Gerrard': { lon: 93, fin: 86 },
  'Paul Scholes': { lon: 90, fin: 88 },
  'Andrés Iniesta': { lon: 78, fin: 92 },
  'Xavi Hernández': { lon: 76, fin: 88 },
  'Xabi Alonso': { lon: 90, fin: 86 },
  'Luís Figo': { lon: 84, fin: 90 },
  'Raúl': { lon: 86, fin: 88 },
  'Eric Cantona': { lon: 84, fin: 88 },
  'Ryan Giggs': { lon: 82, fin: 86 },
  'Andriy Shevchenko': { lon: 86, fin: 84 },
  'Arjen Robben': { lon: 88, fin: 90 },
  'Franck Ribéry': { lon: 80, fin: 88 },
  'Fernando Torres': { lon: 76, fin: 82 },
  'Samuel Eto\'o': { lon: 80, fin: 82 },
  'Iker Casillas': { lon: 40, fin: 40 },
  'Clarence Seedorf': { lon: 86, fin: 86 },
  'Eusébio': { lon: 90, fin: 88 },
  'Ferenc Puskás': { lon: 88, fin: 86 },
  'Alfredo Di Stéfano': { lon: 86, fin: 90 },
  'George Best': { lon: 82, fin: 92 },
  'Bobby Charlton': { lon: 94, fin: 88 },
  'Romário': { lon: 76, fin: 90 },
  'Rivaldo': { lon: 90, fin: 92 },
  'Hristo Stoichkov': { lon: 88, fin: 86 },
  'George Weah': { lon: 80, fin: 84 },
  'Didier Drogba': { lon: 84, fin: 78 },
  'Zlatan Ibrahimović': { lon: 88, fin: 86 },
  'Wayne Rooney': { lon: 88, fin: 84 },
  'Frank Lampard': { lon: 92, fin: 86 },
  'Luka Modrić': { lon: 86, fin: 90 },
  'Toni Kroos': { lon: 92, fin: 88 },
  'Karim Benzema': { lon: 84, fin: 88 },
  'Neymar': { lon: 80, fin: 94 },
};

function defaultLon(pl) {
  return Math.max(40, Math.min(92, Math.round(pl.sho * 0.78 + pl.pas * 0.16)));
}
function defaultFin(pl) {
  return Math.max(40, Math.min(92, Math.round(pl.sho * 0.50 + pl.pas * 0.44)));
}

export function shotTraits(pl) {
  return { lon: pl.lon ?? defaultLon(pl), fin: pl.fin ?? defaultFin(pl) };
}

function decoratePlayer(pl) {
  pl.celebration = SIGNATURE[pl.name] ?? null;
  const spec = SHOT_SPEC[pl.name];
  pl.lon = spec?.lon ?? defaultLon(pl);
  pl.fin = spec?.fin ?? defaultFin(pl);
  return pl;
}

const BENCH_NAMES = [
  ['Luca Moretti', 'MORETTI'], ['Owen Fraser', 'FRASER'], ['Nico Vargas', 'VARGAS'],
  ['Emile Dubois', 'DUBOIS'], ['Jonas Berg', 'BERG'], ['Marco Silva', 'M. SILVA'],
  ['Yusuf Demir', 'DEMIR'], ['Kai Sato', 'SATO'], ['Andrei Popov', 'POPOV'],
  ['Leo Martins', 'MARTINS'], ['Samir Haddad', 'HADDAD'], ['Felix Braun', 'BRAUN'],
  ['Hugo Nilsen', 'NILSEN'], ['Rafael Costa', 'COSTA'], ['Ilan Kovacs', 'KOVACS'],
  ['Theo Blake', 'BLAKE'], ['Diego Rios', 'RIOS'], ['Milan Horvath', 'HORVATH'],
  ['Callum Reid', 'REID'], ['Omar Farouk', 'FAROUK'], ['Pavel Novak', 'NOVAK'],
  ['Enzo Ricci', 'RICCI'], ['Arne Voss', 'VOSS'], ['Jamal Okoye', 'OKOYE'],
];
const BENCH_ROLES = [
  { role: 'GK', pac: 44, sho: 16, pas: 58, def: 78, drop: 7 },
  { role: 'DEF', pac: 74, sho: 40, pas: 66, def: 80, drop: 5 },
  { role: 'DEF', pac: 76, sho: 38, pas: 64, def: 78, drop: 6 },
  { role: 'MID', pac: 76, sho: 68, pas: 78, def: 64, drop: 5 },
  { role: 'MID', pac: 78, sho: 70, pas: 76, def: 58, drop: 6 },
  { role: 'FWD', pac: 84, sho: 76, pas: 70, def: 36, drop: 5 },
  { role: 'FWD', pac: 82, sho: 74, pas: 68, def: 32, drop: 6 },
];

export function makeBench(club) {
  if (club.kind === 'dream') {
    const usedName = new Set(club.players.map((pl) => pl.name));
    const usedNum = new Set(club.players.map((pl) => pl.num));
    const out = [];
    for (let i = 0; i < BENCH_ROLES.length; i++) {
      const spec = BENCH_ROLES[i];
      const pick = STAR_POOL.find((pl) => !usedName.has(pl.name) && posFitsRole(pl.pos, spec.role));
      if (!pick) break;
      usedName.add(pick.name);
      let num = pick.num > 11 ? pick.num : 12 + i;
      while (usedNum.has(num)) num++;
      usedNum.add(num);
      out.push(decoratePlayer({
        name: pick.name, back: pick.back, num, pac: pick.pac, sho: pick.sho, pas: pick.pas, def: pick.def, ovr: pick.ovr,
        role: spec.role, pos: pick.pos, era: pick.era,
      }));
    }
    if (out.length === BENCH_ROLES.length) return out;
  }
  const usedNum = new Set(club.players.map((pl) => pl.num));
  const usedName = new Set(club.players.map((pl) => pl.name));
  let h = 2166136261;
  const key = club.id || club.short || 'club';
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const rating = teamRating(club);
  const out = [];
  for (let i = 0; i < BENCH_ROLES.length; i++) {
    const spec = BENCH_ROLES[i];
    let pick = ((h + i * 17) >>> 0) % BENCH_NAMES.length;
    let [name, back] = BENCH_NAMES[pick];
    let guard = 0;
    while (usedName.has(name) && guard++ < BENCH_NAMES.length) {
      pick = (pick + 1) % BENCH_NAMES.length;
      [name, back] = BENCH_NAMES[pick];
    }
    let num = 12 + i + ((h + i * 3) >>> 0) % 9;
    while (usedNum.has(num)) num++;
    usedNum.add(num);
    usedName.add(name);
    const ovr = Math.max(68, Math.min(88, rating - spec.drop + ((h >> i) & 3) - 1));
    const pl = p(name, back, num, spec.pac, spec.sho, spec.pas, spec.def, ovr);
    pl.role = spec.role;
    pl.lon = defaultLon(pl);
    pl.fin = defaultFin(pl);
    out.push(pl);
  }
  return out;
}

for (const team of TEAMS) {
  for (const pl of team.players) decoratePlayer(pl);
}

const SEARCH_AKA = {
  'Zlatan Ibrahimović': ['zlatan', 'ibrahimovic', 'ibrahimovitch', 'ibrohimovic', 'ibrohimovitch', 'ibo'],
  'Cristiano Ronaldo': ['cr7', 'ronaldo'],
  'Ronaldo Nazário': ['r9', 'ronaldo nazario', 'il fenomeno'],
  'Lionel Messi': ['messi', 'leo messi'],
  'Johan Cruyff': ['cruyff', 'cruijff'],
  'Zinedine Zidane': ['zidane', 'zizou'],
  'Diego Maradona': ['maradona'],
  'Pelé': ['pele', 'edson'],
};

const EXTRA_STARS = [
  { ...p('Lev Yashin', 'YASHIN', 1, 52, 16, 70, 96, 94), pos: 'GK' },
  { ...p('Franco Baresi', 'BARESI', 6, 76, 48, 78, 96, 93), pos: 'CB' },
  { ...p('Bobby Moore', 'MOORE', 6, 70, 44, 80, 94, 91), pos: 'CB' },
  { ...p('Fabio Cannavaro', 'CANNAVARO', 5, 80, 40, 70, 94, 91), pos: 'CB' },
  { ...p('Eusébio', 'EUSÉBIO', 10, 92, 95, 82, 36, 94), pos: 'ST' },
  { ...p('Ferenc Puskás', 'PUSKÁS', 10, 82, 96, 86, 34, 94), pos: 'ST' },
  { ...p('Alfredo Di Stéfano', 'DI STÉFANO', 9, 86, 92, 90, 60, 95), pos: 'ST' },
  { ...p('George Best', 'BEST', 7, 92, 90, 86, 36, 93), pos: 'RW' },
  { ...p('Bobby Charlton', 'CHARLTON', 9, 82, 92, 90, 48, 93), pos: 'CM' },
  { ...p('Kenny Dalglish', 'DALGLISH', 7, 86, 90, 86, 38, 91), pos: 'ST' },
  { ...p('Romário', 'ROMÁRIO', 11, 90, 94, 78, 30, 92), pos: 'ST' },
  { ...p('Rivaldo', 'RIVALDO', 10, 84, 90, 90, 36, 91), pos: 'LW' },
  { ...p('Hristo Stoichkov', 'STOICHKOV', 8, 88, 91, 84, 40, 90), pos: 'LW' },
  { ...p('George Weah', 'WEAH', 9, 92, 90, 78, 48, 91), pos: 'ST' },
  { ...p('Didier Drogba', 'DROGBA', 11, 84, 90, 74, 50, 89), pos: 'ST' },
  {
    ...p('Zlatan Ibrahimović', 'ZLATAN', 11, 76, 92, 84, 48, 91),
    pos: 'ST',
    aka: ['zlatan', 'ibrahimovic', 'ibrahimovitch', 'ibrohimovic', 'ibrohimovitch', 'ibo'],
  },
  { ...p('Wayne Rooney', 'ROONEY', 10, 86, 90, 84, 52, 90), pos: 'ST' },
  { ...p('Frank Lampard', 'LAMPARD', 8, 72, 90, 86, 70, 89), pos: 'CM' },
  { ...p('Luka Modrić', 'MODRIĆ', 10, 76, 78, 94, 70, 90), pos: 'CM' },
  { ...p('Toni Kroos', 'KROOS', 8, 54, 82, 94, 70, 88), pos: 'CM' },
  { ...p('Karim Benzema', 'BENZEMA', 9, 80, 90, 86, 40, 90), pos: 'ST' },
  { ...p('Neymar', 'NEYMAR', 10, 90, 86, 88, 32, 91), pos: 'LW' },
];

function posFitsRole(pos, role) {
  return (POS_ROLE[pos] || 'FWD') === role;
}

function buildStarPool() {
  const byName = new Map();
  const take = (pl, pos, era, club) => {
    const prev = byName.get(pl.name);
    if (!prev || pl.ovr > prev.ovr || (pl.ovr === prev.ovr && era === 'prime')) {
      const next = decoratePlayer({
        name: pl.name, back: pl.back, num: pl.num, pac: pl.pac, sho: pl.sho, pas: pl.pas, def: pl.def, ovr: pl.ovr,
        pos, era: prev && prev.era !== era ? 'both' : era, club,
        aka: SEARCH_AKA[pl.name] || pl.aka || [],
      });
      byName.set(pl.name, next);
    } else if (prev && prev.era !== era) {
      prev.era = 'both';
    }
  };
  for (const team of TEAMS) {
    const era = team.kind === 'prime' ? 'prime' : 'now';
    team.players.forEach((pl, i) => take(pl, SLOT_POS[i] || 'ST', era, team.short));
  }
  for (const pl of EXTRA_STARS) take(pl, pl.pos, 'prime', 'LEGEND');
  return [...byName.values()].sort((a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name));
}

export const STAR_POOL = buildStarPool();

export function bestForSlot(slot, used) {
  const want = SLOT_POS[slot];
  const role = POS_ROLE[want];
  const unused = STAR_POOL.filter((pl) => !used.has(pl.name));
  return unused.find((pl) => pl.pos === want)
    || unused.find((pl) => posFitsRole(pl.pos, role))
    || unused[0]
    || STAR_POOL[0];
}

function stampSlot(src, slot) {
  return decoratePlayer({
    name: src.name, back: src.back, num: SLOT_NUMS[slot],
    pac: src.pac, sho: src.sho, pas: src.pas, def: src.def, ovr: src.ovr,
    pos: SLOT_POS[slot], era: src.era, club: src.club,
  });
}

export function playersFromNames(names) {
  const used = new Set();
  return SLOT_LABELS.map((_, i) => {
    const want = typeof names?.[i] === 'string' ? names[i].trim() : '';
    let src = want ? STAR_POOL.find((pl) => pl.name === want) : null;
    if (!src || used.has(src.name)) src = bestForSlot(i, used);
    used.add(src.name);
    return stampSlot(src, i);
  });
}

export function emptyDraft() {
  return SLOT_LABELS.map(() => '');
}

export function naturalSlots(pos) {
  return ({
    GK: [0],
    RB: [1, 2],
    CB: [2, 3, 1, 4],
    LB: [4, 3],
    CM: [5, 7, 6],
    CDM: [6, 5, 7],
    RW: [8, 9, 10],
    ST: [9, 8, 10],
    LW: [10, 9, 8],
  })[pos] || [9];
}

function foldText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ovitch$|ovich$/g, 'ovic')
    .replace(/[^a-z0-9]+/g, '');
}

function editDist(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

export function starMatches(pl, query) {
  const raw = String(query || '').trim();
  if (!raw) return true;
  const keys = [pl.name, pl.back, ...(pl.aka || [])].map(foldText).filter(Boolean);
  const tokens = raw.split(/\s+/).map(foldText).filter((t) => t.length >= 2);
  if (!tokens.length) return keys.some((k) => k.includes(foldText(raw)));
  return tokens.every((t) => keys.some((k) => {
    if (k.includes(t) || t.includes(k)) return true;
    return [k, ...String(pl.name).toLowerCase().split(/\s+/).map(foldText)].some((w) => (
      w.startsWith(t) || t.startsWith(w) || (t.length >= 5 && w.length >= 5 && editDist(t, w) <= 2)
    ));
  }));
}

export function autoDreamNames() {
  const used = new Set();
  return SLOT_LABELS.map((_, i) => {
    const src = bestForSlot(i, used);
    used.add(src.name);
    return src.name;
  });
}

const DREAM_KIT = {
  kind: 'dream',
  badge: ['#111111', '#ffd400', '#ffffff'],
  home: { shirt: 0x111111, shorts: 0x111111, socks: 0x111111, trim: 0xffd400, number: '#ffd400' },
  away: { shirt: 0xf4e27a, shorts: 0x111111, socks: 0xf4e27a, trim: 0x111111, number: '#111111' },
  gk: { shirt: 0xffd400, shorts: 0x111111, socks: 0xffd400 },
};

function loadDreamNames(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '');
    if (Array.isArray(raw) && raw.every((n) => typeof n === 'string')) {
      return SLOT_LABELS.map((_, i) => raw[i] || '');
    }
  } catch { /* ignore */ }
  return emptyDraft();
}

function makeDreamClub(id, short, store, names) {
  const draft = SLOT_LABELS.map((_, i) => names[i] || '');
  return {
    ...DREAM_KIT,
    id,
    name: 'Dream Team',
    short,
    store,
    draft,
    players: playersFromNames(draft),
  };
}

export const DREAM = {
  user: makeDreamClub('dream', 'DRM', 'socker-draft-user', loadDreamNames('socker-draft-user')),
  ai: makeDreamClub('dream2', 'DR2', 'socker-draft-ai', loadDreamNames('socker-draft-ai')),
};

export function setDreamPlayers(club, names) {
  club.draft = SLOT_LABELS.map((_, i) => names[i] || '');
  club.players = playersFromNames(club.draft);
  try { localStorage.setItem(club.store, JSON.stringify(club.draft)); } catch { /* ignore */ }
  return club;
}

export function draftedCount(club) {
  return (club.draft || []).filter(Boolean).length;
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
