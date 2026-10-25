import { G } from './ctx';
export const setBoss = (name: string | null, sub = '') => G.world.host.hud.bossBar(name, sub);
