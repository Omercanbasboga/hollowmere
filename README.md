# Hollowmere

A match-3 game with a rule on top: matching a creature's tiles fills its ward meter, and once a
meter's full, that creature is sealed for the rest of the run. Seal all five before you run out of
moves and Hollowmere holds. Don't, and it falls.

Play it here: [live link once deployed]

## The setup

Hollowmere used to be a keep. Now it's mostly rubble and things that shouldn't move. You're the
last Warden left, and the wards that kept the depths shut are failing floor by floor.

Five things are crawling up through what's left of it:

- **Grave Moth**: the small stuff, comes up in swarms
- **Bonewretch**: whatever used to hold a sword down here, still trying to
- **Fen Serpent**: the water table isn't supposed to have things living in it
- **Ashling**: a wisp of whatever burned this place the first time
- **Drowspawn**: the one nobody wants to see reach the surface, so it shows up more the harder a
  level gets

## How it plays

Standard match-3 swap rules: click a tile, click an adjacent one, if the swap lines up three or
more of the same creature it clears. Clearing tiles adds to that creature's ward meter (top of the
screen). Fill a meter and that creature is sealed, gone from the board and gone from the refill
pool, which also makes the remaining board a little less crowded.

Every swap that doesn't produce a match is free, it just reverts. Only real matches cost you a move.

## Why it's built this way

The board size, move budget, ward target, and how aggressively Drowspawn shows up are not
hardcoded, they're pulled from a small companion service,
[hollowmere-liveops](https://github.com/Omercanbasboga/hollowmere-liveops), on page load. If that
service is asleep, slow, or you're just running this with no backend at all, it falls back to
sensible defaults and plays exactly the same. The point was to actually be able to tune difficulty
without touching this repo, not to have a backend dependency that can break the game.

## Running locally

It's a static page, no build step:

```bash
python3 -m http.server 8000
```

then open `localhost:8000`. Point `CONFIG_BASE_URL` in `script.js` at wherever the config service
is running if you want the live-ops part to actually do anything.
