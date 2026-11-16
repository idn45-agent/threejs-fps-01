// buy.js — the buy menu: weapons, grenades and kevlar, spent from
// state.round.money during the buy phase (keys 1-6, toggled with B).
// Prices are the economy; the firing numbers live in weapon.js.
import { pushFeed } from './state.js';
import { equipWeapon } from './weapon.js';

export const BUY_ITEMS = [
  { key: 1, id: 'rifle', name: 'VK-7 Longshot', price: 2700, kind: 'weapon', desc: 'Rifle — accurate, 30-rd mag' },
  { key: 2, id: 'smg', name: 'K-9 SMG', price: 1500, kind: 'weapon', desc: 'Fast fire, close quarters' },
  { key: 3, id: 'shotgun', name: 'M-88 Scattergun', price: 1100, kind: 'weapon', desc: '6 pellets, devastating up close' },
  { key: 4, id: 'pistol', name: 'P-12 Sidearm', price: 0, kind: 'weapon', desc: 'Free — your starting pistol' },
  { key: 5, id: 'grenade', name: 'R-4 Grenade', price: 300, kind: 'grenade', desc: 'Throw with G — timed fuse, AoE' },
  { key: 6, id: 'kevlar', name: 'Kevlar Vest', price: 650, kind: 'kevlar', desc: 'Takes 30% off incoming damage' },
];

export function buyItem(state, key, audio) {
  const item = BUY_ITEMS.find((i) => i.key === key);
  if (!item) return false;
  const r = state.round;
  if (r.money < item.price) {
    pushFeed(state, `Not enough money for ${item.name} ($${item.price})`);
    if (audio) audio.deny();
    return false;
  }
  if (item.kind === 'kevlar' && state.player.kevlar) {
    pushFeed(state, 'Kevlar already worn');
    if (audio) audio.deny();
    return false;
  }
  r.money -= item.price;
  if (item.kind === 'weapon') {
    equipWeapon(state, item.id);
    pushFeed(state, `Bought ${item.name}`);
  } else if (item.kind === 'grenade') {
    state.player.grenades += 1;
    pushFeed(state, `Bought R-4 Grenade (${state.player.grenades} carried)`);
  } else if (item.kind === 'kevlar') {
    state.player.kevlar = true;
    pushFeed(state, 'Bought Kevlar Vest');
  }
  if (audio) audio.buy();
  return true;
}
