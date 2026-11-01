# Online two-player

Two people on two computers can play each other over the internet.

## How to play

1. Both open the game (the website's **Play** page) in Chrome, Edge or Safari.
2. One person picks **Two Player → Host a game**. A five-character code appears, like `K7Q2M`.
3. The other picks **Two Player → Join with a code** and types it in.
4. Once connected, the guest picks their club. The host picks theirs and the match length,
   then presses **KICK OFF (ONLINE)**.
5. Each player uses their own keyboard or Xbox controller with the normal one-player controls.
   The host is P1 (left club), the guest is P2 (right club).

Either player can pause with **P**; the host makes substitutions for both sides (the guest's
pause menu has no Substitutions button). At full time the host chooses Rematch or Change teams;
the guest follows. Leaving or closing the tab ends the online game for both.

## How it works

- **Host-authoritative.** The host's browser runs the match exactly like local two-player. The
  guest's controller is sent to the host and drives the P2 player.
- **Snapshots.** 25 times a second the host sends every player's position, facing and animation
  state (the same format the goal replays use), the ball, and the score/clock/state. The guest
  draws them 100 ms behind real time, interpolating between snapshots, so movement stays smooth
  through small network hiccups. The guest never simulates the match itself.
- **Everything else is forwarded.** Commentary, banners, cards, the penalty board, sounds, crowd
  reactions and the full-time screen are replayed on the guest as the host triggers them.
  Substitutions and red cards run the game's own code on the guest so both player lists match.
- **Connection.** WebRTC via [PeerJS](https://peerjs.com) 1.5.5. The free PeerJS cloud server only
  introduces the two browsers; game data then flows directly between them. If a network blocks
  direct connections, PeerJS's free public TURN relay is tried. Two data channels are used:
  reliable (input, events, control) and unreliable (snapshots, so a lost packet never delays
  newer positions).

Code: `src/netcode.js` (codes, input and snapshot packing, interpolation buffer; unit-tested in
`tests/netcode.test.js`), `src/netlink.js` (PeerJS and the test transport), `src/online.js` (match
wiring), and the "online two-player" section of `src/main.js` (menus).

## Limits

- **Some networks can't connect.** Strict school, work or hotel networks can block WebRTC, and the
  free TURN relay can be busy. The join screen says so if the connection fails; a home network
  usually works.
- **The PeerJS cloud server is a free community service.** If it's down, hosting and joining
  fail until it's back (games already in progress keep going).
- **The guest sees the match ~100 ms plus network delay late**, and their own inputs take a round
  trip to the host. Fine across a city; noticeable across continents.
- Online matches are friendlies; Career mode stays single-player.

## Testing without a network

Add `?net=local` to the Play page's address in two tabs of the same browser. Hosting and joining
then use a `BroadcastChannel` between the tabs instead of PeerJS. The automated browser test of
online play uses this.
