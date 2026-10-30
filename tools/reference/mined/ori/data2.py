# Second table set: estimates (things beyond pickups, enemies, hazards, the walked route). Game units, y up.

# machine requirements for pickups beyond the room they sit in
PICKUP_REQ = {
    'GladesKeystone1': {'SpiritFlame'}, 'GladesGrenadePool': {'LightBurst', 'Water'}, 'GladesGrenadeTree': {'LightBurst'}, 'GladesMainPool': {'Water'},
    'GladesMainPoolDeep': {'Water'}, 'FronkeyWalkRoof': {'ChargeJump'}, 'AboveFourthHealth': {'Bash'},
    'WallJumpAreaExp': {'ChargeJump'}, 'WallJumpAreaEnergyCell': {'WallJump'}, 'LeftGladesExp': {'WallJump'},
    'LeftGladesKeystone': {'WallJump'}, 'SpiritCavernsKeystone2': {'WallJump'}, 'SpiritCavernsAbilityCell': {'Bash'},
    'GladesLaser': {'DoubleJump'}, 'GladesLaserGrenade': {'LightBurst', 'Bash'}, 'SpiritTreeExp': {'WallJump'},
    'SpiritCavernsTopLeftKeystone': {'WallJump'},
}
# machine gate requirements on room links (both directions unless oneWay in EXITS)
GATE_REQ = {
    ('wake', 'east'): {'ability': {'ChargeJump'}}, ('drop', 'logs'): {'ability': {'SpiritFlame'}}, ('logs', 'drop'): {}, ('drop', 'well'): {}, ('well', 'drop'): {'ability': {'SpiritFlame'}},
    ('crossing', 'signpost'): {'ability': {'Water'}}, ('signpost', 'crossing'): {'ability': {'Water'}},
    ('logs', 'signpost'): {'keys': 2, 'gate': 'g1'}, ('signpost', 'logs'): {'keys': 2, 'gate': 'g1'},
    ('logs', 'cfnook'): {'ability': {'ChargeFlame'}}, ('leftglades', 'upperleft'): {'ability': {'WallJump'}},
    ('leftglades', 'lowercav'): {'keys': 2, 'gate': 'g2'}, ('lowercav', 'uppercav'): {'ability': {'WallJump'}},
    ('lowercav', 'laser'): {'energy': 4}, ('laser', 'laserpond'): {'ability': {'DoubleJump'}},
    ('uppercav', 'porch'): {'keys': 4, 'gate': 'g3'}, ('porch', 'ValleyOfTheWind'): {'ability': {'Later'}},
    ('east', 'MoonGrotto'): {'energy': 4}, ('well', 'BlackRootBurrows'): {'ability': {'WallJump'}},
    ('attic', 'HollowGrove'): {'ability': {'Bash'}},
}

# other things: id, roomId, kind, x, y, label, src, hidden(how, needs) or None
THINGS = [
    ('well-glades', 'well', 'save', 109.9, -257.7, 'Spirit Well (first save; also a teleporter)', 'mined: rando tracker teleporter coordinate (exact)', None),
    ('well-tree', 'tree', 'save', -93, -118, 'Spirit Well at the Spirit Tree', 'mined: rando anchor SpiritTreeRefined (+-2 u)', None),
    ('sein', 'ram', 'pickup-major', -138, -262, 'Sein: Spirit Flame (story pickup on the big log)', 'estimate: walkthroughs (ludo.guide, gamerwalkthroughs) place it west of the ram wall', None),
    ('gate1', 'logs', 'landmark', -15, -215, 'Spirit Gate 1 (2 keystones)', 'mined: rando anchor GladesFirstKeyDoor (+-3 u)', None),
    ('gate2', 'leftglades', 'landmark', -197, -212, 'Spirit Gate 2 to the Spirit Caverns (2 keystones)', 'mined: rando anchor SpiritCavernsDoorOpened (+-4 u)', None),
    ('gate3', 'uppercav', 'landmark', -183, -132, 'Spirit Gate 3 to the Spirit Tree (4 keystones)', 'mined: rando anchor SpiritTreeDoor (+-3 u)', None),
    ('egate-laser', 'lowercav', 'landmark', -166, -186, '4-energy gate (laser cave)', 'mined: rando anchors MidSpiritCaverns/GladesLaserArea (+-4 u)', None),
    ('egate-grotto', 'east', 'landmark', 289, -199, '4-energy gate to Moon Grotto', 'mined: rando anchor DeathGauntletDoor (+-2 u)', None),
    ('signpost', 'signpost', 'landmark', -40, -215, 'Signpost: Spirit Caverns / Hollow Grove / Black Root', 'estimate: wiki text, near rando anchor GladesMain', None),
    ('lever', 'leftglades', 'lever', -200, -222, 'Lever lowering a log bridge (to the map fragment)', 'estimate: wiki + gamerwalkthroughs text', None),
    ('boulder1', 'drop', 'breakable', 78, -224, 'Boulder you pull aside (keystone 1 cave)', 'estimate: wiki text', None),
    ('boulder2', 'upperleft', 'breakable', -265, -214, 'Boulder pushed past the swinging spikes', 'estimate: wiki text', None),
    ('windplant', 'well', 'shortcut', 96, -250, 'Wind plant lift back up (thorn plants around it)', 'estimate: ludo.guide text', None),
    ('logs-swing', 'logs', 'landmark', 15, -206, 'Two swinging logs over the pond', 'estimate: wiki text', None),
    ('mushrooms', 'attic', 'landmark', -90, -195, 'Giant bounce mushrooms', 'estimate: wiki text', None),
    ('tree-fil', 'walljump', 'landmark', -316, -300, "Fil's Ancestral Tree", 'mined: rando WallJumpSkillTree', None),
    ('spirit-tree', 'tree', 'landmark', -98, -100, 'The Spirit Tree (seen in the prologue)', 'files-equivalent: in-game map art', None),
]

# enemies: id, roomId, kind, x, y, behaviour, attack, difficulty, why, patrol/radius, respawns
ENEMIES = [
    ('ram1', 'ram', 'Rammer (scripted ambush)', -70, -258, 'bursts out of a cracked wall and charges; jump it, it breaks the wall and a falling rock kills it',
     'charge; ludo.guide: one hit kills Ori at the start', 3, 'first enemy, can kill at 3 health, but scripted and dodged with one jump', [-110, -50], False),
    ('hop1', 'ram', 'Hopper', -128, -266, 'hops toward Ori and crushes down', 'stomp landing', 2, 'first real fight, a group of three', [-150, -95], False),
    ('hop2', 'ram', 'Hopper', -112, -265, 'hops toward Ori and crushes down', 'stomp landing', 2, 'group of three', [-150, -95], False),
    ('hop3', 'ram', 'Hopper', -96, -263, 'hops toward Ori and crushes down', 'stomp landing', 2, 'group of three', [-150, -95], False),
    ('qcr1', 'crossing', 'Quilled Crawler (ceiling)', 20, -246, 'sits on the ceiling; spits three droplets in a fixed fan when it sees Ori', 'droplets', 1, 'slow, predictable pattern, killed with Spirit Flame', None, False),
    ('cr1', 'drop', 'Crawler', 95, -232, 'on the pole where the wind plant drops you; fires globs that stick to the ground', 'arcing globs', 1, 'stationary, telegraphed', None, False),
    ('hop4', 'attic', 'Hopper', -75, -178, 'hops near the life-cell mushrooms; later used as a Bash anchor', 'stomp landing', 2, 'single hopper on a narrow perch', [-95, -55], False),
    ('fl1', 'lowercav', 'Shooter flower (row 1)', -192, -205, 'stationary plant firing a horizontal row of energy orbs; projectiles are bashable', 'projectile row', 2, 'timing hazard to wall-jump past', None, True),
    ('fl2', 'lowercav', 'Shooter flower (row 2)', -210, -192, 'stationary, fires a row of orbs', 'projectile row', 2, 'timing hazard', None, True),
    ('fl3', 'uppercav', 'Shooter flower (row 3)', -195, -176, 'stationary, fires a row of orbs', 'projectile row', 2, 'timing hazard; secret 6 is reached by bashing its orb', None, True),
    ('fl4', 'uppercav', 'Shooter flower', -212, -160, 'stationary, fires a row of orbs', 'projectile row', 2, 'timing hazard on the climb', None, True),
    ('fl5', 'uppercav', 'Shooter flower', -185, -148, 'stationary, fires a row of orbs', 'projectile row', 2, 'timing hazard near the top keystones', None, True),
    ('hop5', 'laser', 'Hopper', -150, -195, 'hops; its landing breaks the unstable floor above the laser', 'stomp landing', 2, 'lured to break the floor (puzzle use)', [-165, -130], False),
    ('ccr1', 'laserpond', 'Consumed Crawler (hanging)', -150, -137, 'hangs from the ceiling, drops and explodes when Ori is below; bashable', 'explosion', 3, 'big damage; used as Bash anchors', None, False),
    ('ccr2', 'laserpond', 'Consumed Crawler (hanging)', -128, -137, 'hangs from the ceiling, drops and explodes', 'explosion', 3, 'big damage; Bash anchor', None, False),
    ('hop6', 'porch', 'Hopper', -160, -110, 'its landing smashes the floor into the hole with the large container', 'stomp landing', 2, 'single hopper', [-175, -150], False),
]

# hazards (estimates): roomId, kind, x0,x1,y0,y1, label
HAZARDS = [
    ('crossing', 'hazard', 25, 34, -262, -259, 'purple thorn plants (Spirit Flame clears them)'),
    ('well', 'hazard', 86, 104, -258, -256, 'thorn plants around the wind plant'),
    ('wake', 'hazard', 262, 266, -214, -188, 'bramble wall (blocks the way east at first)'),
    ('upperleft', 'hazard', -280, -255, -241, -230, 'swinging/rotating spike blades'),
    ('laser', 'hazard', -168, -118, -191, -190, 'laser beam (blocked with the boulder)'),
    ('uppercav', 'hazard', -224, -212, -152, -149, 'thorn pit (top-left keystone)'),
]
BREAKABLES = [
    ('ram', 'breakable', -62, -58, -264, -252, 'cracked wall the Rammer breaks'),
    ('cfnook', 'breakable', -3, 3, -202, -197, 'wall broken by Charge Flame (later)'),
    ('laser', 'breakable', -153, -143, -199, -197, 'unstable floor a Hopper breaks'),
    ('porch', 'breakable', -164, -156, -114, -112, 'floor a Hopper smashes (hole to the container)'),
]
DOORS = [
    ('logs', -16, -14, -222, -208, 'gate1'), ('leftglades', -201, -193, -215, -213, 'gate2'),
    ('uppercav', -187, -179, -131, -129, 'gate3'), ('lowercav', -167, -165, -192, -180, 'egate-laser'),
    ('east', 288, 290, -206, -192, 'egate-grotto'),
]

# the walked critical route (game units), with minute guesses at a few events
ROUTE = [
    (184, -220, 'start', 0), (138, -205, '', None), (100, -241, 'drop through the log', 1), (45, -252, '', None),
    (-27, -256, 'energy cell 1 (Soul Link)', 2), (-45, -258, '', None), (-62, -258, 'Rammer ambush', 3),
    (-138, -262, 'Sein: Spirit Flame', 4), (-112, -265, 'three Hoppers', 5), (-154, -271, 'secret 2', 6),
    (-45, -258, '', None), (45, -252, '', None), (110, -257.7, 'Spirit Well', 8), (100, -241, 'wind plant up', None),
    (83, -222, 'keystone 1', 9), (60, -218, '', None), (-11, -206, 'keystone 2 (swinging logs)', 10),
    (-15, -215, 'gate 1', 11), (-40, -215, 'signpost', None), (-115, -225, '', None), (-195, -240, '', None),
    (-195, -250, '', None), (-195, -282, '', None), (-316, -300, 'Wall Jump', 15), (-195, -282, '', None),
    (-195, -250, '', None), (-215, -228, '', None), (-238, -212, 'keystone 2-2 (boulder)', 19), (-215, -228, '', None),
    (-184, -227, 'map fragment', 20), (-130, -245, '', None), (-81, -248, 'map stone', 21),
    (-59, -244, 'keystone 2-1', 22), (-130, -245, '', None), (-197, -214, 'gate 2', 23),
    (-182, -193, 'cavern key 1', 24), (-217, -183, 'cavern key 2', 25), (-200, -181, '', None),
    (-177, -154, 'cavern key 3', 27), (-217, -146, 'cavern key 4', 28), (-183, -130, 'gate 3', 29),
    (-181, -115, '', None), (-162, -116, '', None), (-93, -118, 'Spirit Tree', 31), (-30, -126, '', None),
    (8, -127, 'exit to the Hollow Grove', 33),
]
