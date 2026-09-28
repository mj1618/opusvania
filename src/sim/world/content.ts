/**
 * Room content bundled into the sim. JSON under content/ is data, not code, so the sim may import
 * it (tests/unit/sim-purity.test.ts allows JSON under content/). Order = gym play order.
 */

import gym01 from '../../../content/gym/gym-01.json' with { type: 'json' };
import gym02 from '../../../content/gym/gym-02.json' with { type: 'json' };
import gym03 from '../../../content/gym/gym-03.json' with { type: 'json' };
import gym04 from '../../../content/gym/gym-04.json' with { type: 'json' };
import gym05 from '../../../content/gym/gym-05.json' with { type: 'json' };
import gym06 from '../../../content/gym/gym-06.json' with { type: 'json' };
import gym07 from '../../../content/gym/gym-07.json' with { type: 'json' };
import gym08 from '../../../content/gym/gym-08.json' with { type: 'json' };
import gym09 from '../../../content/gym/gym-09.json' with { type: 'json' };
import gym10 from '../../../content/gym/gym-10.json' with { type: 'json' };
import gym11 from '../../../content/gym/gym-11.json' with { type: 'json' };
import gym12 from '../../../content/gym/gym-12.json' with { type: 'json' };
import gym13 from '../../../content/gym/gym-13.json' with { type: 'json' };
import gym14 from '../../../content/gym/gym-14.json' with { type: 'json' };
import hub from '../../../content/gym/hub.json' with { type: 'json' };
import type { RoomFile } from './rooms';

export const ROOM_FILES = [
  hub,
  gym01,
  gym02,
  gym03,
  gym04,
  gym05,
  gym06,
  gym07,
  gym08,
  gym09,
  gym10,
  gym11,
  gym12,
  gym13,
  gym14,
] as unknown as RoomFile[];
