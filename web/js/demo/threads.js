// The demo's showcase threads (docs/demo.md): written by hand, so replies
// answer what they reply to. Classic puzzles with partial progress and
// wrong turns, riddles with the answers in spoilers, and history and
// science people can argue about pleasantly. world.js places them: their
// times are hours before the world is made, and their scores set the votes.
//
// c(author, score, text, ...replies) is a comment. Markdown has no maths
// typesetting here, so maths is in Unicode and code blocks.

const c = (by, score, text, ...replies) => ({ by, score, text, replies });

export const THREADS = [
  // --- Math Puzzles ----------------------------------------------------------------
  {
    community: 'math', by: 'iris', score: 412, hours: 20,
    title: 'Monty Hall: please explain it like I\'m five',
    body: 'You pick one of three doors. Behind one is a car, behind the others, goats. The host, **who knows where the car is**, opens one of the other two doors to show a goat, then offers you the chance to switch.\n\nEveryone says you should switch. But there are two doors left, so isn\'t it 50/50?',
    comments: [
      c('visitor', 3, 'It has to be 50/50. Two doors, one car. The host opening a door doesn\'t change where the car is.',
        c('prime_suspect', 96, 'It doesn\'t change where the car is, but it does tell you something. Your first pick is right 1/3 of the time, and nothing the host does can change that. So the other closed door has to carry the remaining 2/3.\n\nThe host is forced: if you picked a goat (2/3 of the time), he *must* open the only other goat, and the door he leaves shut is the car.',
          c('iris', 41, 'Oh. So switching wins exactly when my first pick was wrong, which is 2 times out of 3. That\'s the bit I was missing.'))),
      c('euler_fan', 154, 'Try it with 100 doors. You pick one. The host, who knows, opens 98 doors with goats and leaves one other door shut.\n\nWould you still say it\'s 50/50 between your random first pick and the one door he carefully avoided?',
        c('kestrel', 37, 'The 100 doors version is what finally convinced me years ago. Your door is a 1% shot. His door is everything else.')),
      c('lab_coat', 88, 'When in doubt, simulate:\n\n```python\nimport random\n\ndef play(switch):\n    car, pick = random.randrange(3), random.randrange(3)\n    opened = next(d for d in range(3) if d != pick and d != car)\n    if switch:\n        pick = next(d for d in range(3) if d not in (pick, opened))\n    return pick == car\n\nn = 100_000\nprint(sum(play(False) for _ in range(n)) / n)  # about 0.333\nprint(sum(play(True) for _ in range(n)) / n)   # about 0.667\n```'),
      c('fjord', 61, 'The detail that matters: the host **knows** and **always** shows a goat. If he opened one of the other doors at random and it just happened to be a goat, then switching really would win only half the time.',
        c('euler_fan', 33, 'Right, that variant is sometimes called "Monty Fall". Same doors, different information, different answer. Probability is about what you know, not just what\'s behind the doors.')),
      c('dune_walker', 24, 'Honestly I\'d keep the goat. Free lawnmower.'),
    ],
  },
  {
    community: 'math', by: 'maple_drift', score: 287, hours: 44,
    title: 'My kid\'s teacher says 0.999… equals 1. Surely there\'s a tiny gap?',
    body: 'The nines go on forever, but it\'s always a little bit less than 1, isn\'t it? I don\'t want to tell my kid the teacher is wrong if they\'re not.',
    comments: [
      c('euler_fan', 132, 'The teacher is right. A quick way to see it:\n\n- 1/3 = 0.333…\n- multiply both sides by 3: 3 × 1/3 = 0.999…\n- and 3 × 1/3 = 1\n\nSo 0.999… = 1. They\'re two ways of writing the same number, like 1/2 and 2/4.',
        c('rook', -4, 'That just moves the problem. Who says 1/3 really equals 0.333…?',
          c('prime_suspect', 71, 'Fair challenge! Here\'s a test that doesn\'t lean on 1/3. If two real numbers are different, their average sits strictly between them. So what number lies between 0.999… and 1? Any decimal you try to write is either below 0.999… or not below 1. There\'s no room, so they\'re the same number.'))),
      c('archivist', 58, 'Another way: 0.999… means 9/10 + 9/100 + 9/1000 + …, a geometric series. Its sum is (9/10) ÷ (1 − 1/10) = 1. The "forever" is exactly what closes the gap: there\'s no last 9 for the gap to hide behind.'),
      c('lumen', 39, 'Fun follow-up for your kid: every decimal that stops has a second spelling. 0.25 is also 0.24999…, and 3 is also 2.999…'),
      c('maple_drift', 27, 'The "name a number in between" one worked. Thank you all, dinner was a lot of fun.'),
    ],
  },
  {
    community: 'math', by: 'prime_suspect', score: 349, hours: 9,
    title: 'The 100 prisoners and 100 boxes. Better than 30%? Really?',
    body: '100 prisoners, numbered 1 to 100. In a room are 100 boxes, and each box holds one of the numbers 1 to 100, shuffled at random. One at a time, each prisoner may open **50** boxes looking for their own number, then leaves without communicating. If **every** prisoner finds their number, they all go free.\n\nThey can agree on a strategy beforehand. Random guessing gives (1/2)¹⁰⁰, essentially zero. Apparently there\'s a strategy that works about 31% of the time. How?',
    comments: [
      c('harbor_light', 12, 'Each prisoner has a 1/2 chance no matter what they do, and there are 100 of them. So it\'s (1/2)¹⁰⁰. I don\'t see how a strategy can beat that.',
        c('euler_fan', 64, 'Each prisoner\'s *own* chance is still 1/2. The trick is to make their successes depend on each other, so they all succeed together or fail together. Hint: think of the boxes as a permutation, and the permutation as cycles.')),
      c('lab_coat', 103, '::: spoiler The strategy\nPrisoner *n* opens box *n*. If it holds number *k*, they open box *k* next, and so on, following the chain.\n\nThe numbers in the boxes form cycles. Prisoner *n* is on the cycle that contains box *n*, and that cycle must come back to box *n*, so the box just before it on the cycle holds the number *n*. They find it within 50 steps exactly when that cycle has length 50 or less.\n\nSo **everyone** succeeds exactly when the shuffle has **no cycle longer than 50**.\n:::',
        c('kestrel', 22, 'Wait, so if one prisoner fails, at least 50 others fail too? That\'s wild.',
          c('lab_coat', 31, 'Yes! A long cycle dooms everyone on it, and with 100 boxes there can only be one cycle longer than 50.'))),
      c('prime_suspect', 77, '::: spoiler The 31%\nThe chance that a random shuffle of 100 has a cycle of length exactly *k* (for *k* > 50) is 1/*k*. Those events can\'t overlap, so\n\nP(success) = 1 − (1/51 + 1/52 + … + 1/100) ≈ 1 − 0.6882 ≈ **0.3118**\n\nAs the number of prisoners grows, this tends to 1 − ln 2 ≈ 0.307. It never drops below that.\n:::'),
      c('fjord', 18, 'I read the spoilers, then read them again, and I still feel cheated by how well it works.'),
    ],
  },

  // --- Riddles -----------------------------------------------------------------------
  {
    community: 'riddles', by: 'riddler', score: 233, hours: 14,
    title: 'Three switches, one bulb, one look',
    body: 'Outside a closed room are three switches. One of them controls a light bulb inside; the other two do nothing. You can flip the switches as much as you like, but you may open the door and go in **only once**.\n\nHow do you work out which switch controls the bulb?\n\n(Answers in spoilers please, so others can try!)',
    comments: [
      c('dune_walker', 9, 'Can I open the door just a crack and peek? Asking for a friend.',
        c('riddler', 19, 'Your friend may open the door once. The crack counts.')),
      c('iris', 87, '::: spoiler My answer\nTurn switch A on and wait ten minutes. Turn A off and turn B on. Go in.\n\n- Bulb on: it\'s B.\n- Bulb off but warm: it\'s A.\n- Bulb off and cold: it\'s C.\n:::',
        c('riddler', 34, 'Correct! Heat is the third bit of information.'),
        c('byte_wrangler', 41, 'Doesn\'t this break with LED bulbs? They barely warm up.',
          c('lab_coat', 29, 'They do warm up a little, but far less than an old filament bulb, so you\'d need a lot of patience and very sensitive fingers. The riddle predates LEDs: it quietly assumes an incandescent bulb that turns about 90% of its power into heat.'))),
      c('ember', 14, 'Bring a phone, call a friend outside, have them flip switches while you watch. Technically I only went in once.'),
    ],
  },
  {
    community: 'riddles', by: 'riddler', score: 198, hours: 31,
    title: 'Two doors, two guards, one question',
    body: 'Two doors: one leads out, the other doesn\'t. Each has a guard. One guard always tells the truth, the other always lies, and you don\'t know which is which. You may ask **one** question, to **one** guard.\n\nWhat do you ask?',
    comments: [
      c('maple_drift', 6, 'Ask a guard "are you the liar?" Wait, no, they\'d both say no.',
        c('riddler', 15, 'Exactly the trap. A question about themselves gives the same answer from both.')),
      c('euler_fan', 72, '::: spoiler Classic answer\nAsk either guard: **"If I asked the other guard which door leads out, which door would he point to?"** Then take the *other* door.\n\nIf you asked the truthful one, he truthfully reports the liar\'s wrong answer. If you asked the liar, he lies about the truthful one\'s right answer. Either way you hear the wrong door.\n:::'),
      c('prime_suspect', 58, '::: spoiler Another one that works\nPoint at a door and ask: **"If I asked you whether this door leads out, would you say yes?"** The truthful guard answers honestly. The liar would say "no" to the inner question, then lies about that, so says "yes". Two lies cancel: both guards answer truthfully about the door.\n:::',
        c('fjord', 21, 'Double negation as a security exploit. I love it.')),
    ],
  },
  {
    community: 'riddles', by: 'kestrel', score: 176, hours: 52,
    title: 'Two ropes that burn unevenly: measure 45 minutes',
    body: 'You have two ropes. Each takes exactly 60 minutes to burn from one end to the other, but they burn **unevenly**: half the rope might be gone in five minutes and the rest take fifty-five. You have a lighter and nothing else.\n\nHow do you measure exactly 45 minutes?',
    comments: [
      c('harbor_light', 4, 'Cut one rope in half for 30 minutes?',
        c('kestrel', 23, 'That\'s the usual first try! Because they burn unevenly, half the length isn\'t half the time.')),
      c('byte_wrangler', 64, '::: spoiler Answer\nLight rope A at **both** ends and rope B at **one** end, at the same time.\n\nRope A burns out after exactly 30 minutes, however uneven it is, because the two flames together cover it twice as fast. At that moment rope B has 30 minutes left, so light B\'s other end too. It burns out 15 minutes later: 30 + 15 = **45**.\n:::',
        c('iris', 18, 'The both-ends trick is so satisfying.')),
      c('euler_fan', 27, 'Follow-up: with just these two ropes, which times can you measure? Starting from the moment you first light something, I get 30, 45, 60 and 90. What about 15 on its own?',
        c('prime_suspect', 12, 'Not from a cold start, I think, but the gap between rope A going out and rope B going out in the answer above is exactly 15.')),
    ],
  },

  // --- History of Science ----------------------------------------------------------------
  {
    community: 'history_of_science', by: 'archivist', score: 321, hours: 26,
    title: 'Eratosthenes measured the Earth with shadows, around 240 BC',
    body: 'Eratosthenes heard that at noon on the summer solstice in Syene (now Aswan), the sun shone straight down a well: no shadows. At the same moment in Alexandria, further north, a vertical stick cast a shadow at about **7.2°**, roughly 1/50 of a full circle.\n\nIf the sun\'s rays are parallel, that angle is the angle between the two cities at the centre of the Earth. So the Earth\'s circumference is about 50 × the distance from Alexandria to Syene. He took that as 5,000 stadia and got **250,000 stadia**.',
    comments: [
      c('lumen', 44, 'How close was he?',
        c('archivist', 67, 'Honestly, nobody is sure, because we don\'t know which stadion he used: the unit varied from place to place. Depending on the choice, his figure comes out anywhere from within a couple of percent of the real 40,000 km to about 15% too big. Either way, a remarkable result for a stick, a well and a lot of walking.')),
      c('lab_coat', 52, 'I do this with my students every year. Two schools a few hundred kilometres apart, a metre stick each, measure shadows at local noon on the same day, and swap results. We usually land within 10 to 20%.'),
      c('fjord', 21, 'So the story that people before Columbus thought the Earth was flat...',
        c('archivist', 58, 'A myth, mostly from the 1800s. Educated people had known the Earth was round since antiquity. The real argument about Columbus was its **size**: he used a much too small figure, which is why he thought Asia was reachable. His critics were right; he was just lucky there was a continent in the way.')),
    ],
  },
  {
    community: 'history_of_science', by: 'byte_wrangler', score: 266, hours: 60,
    title: 'The Mars Climate Orbiter was lost over pounds and newtons (1999)',
    body: 'In 1999 the Mars Climate Orbiter came in far too low and was lost. One piece of ground software reported thruster impulse in **pound-force seconds**, while the navigation software that used those numbers expected **newton-seconds**. A pound-force is about 4.45 newtons, so every small correction was off by that factor, and the error built up over months of cruise.\n\nThe orbiter was meant to pass well over 100 km above the surface. It went in at roughly 57 km.',
    comments: [
      c('prime_suspect', 39, 'This is why I put units in my variable names. `burn_ns`, not `burn`.',
        c('byte_wrangler', 47, 'Or let the type system do it: some languages and libraries make "newton-seconds plus pound-force seconds" a compile error.')),
      c('archivist', 61, 'Worth saying: the investigation didn\'t just blame a conversion. It found the bigger failure was process. The discrepancy showed up in tracking data during the flight, and the checks that should have caught it didn\'t.'),
      c('maple_drift', 33, 'Reminds me of the "Gimli Glider" in 1983: an airliner was fuelled in pounds when the crew needed kilograms, ran out of fuel mid-flight, and glided down to an old airfield. Everyone survived.',
        c('dune_walker', 19, 'And the captain happened to be an experienced glider pilot. Some stories are too good to make up.')),
    ],
  },
  {
    community: 'history_of_science', by: 'archivist', score: 244, hours: 75,
    title: 'The "first computer bug" was a real moth, but it wasn\'t the first bug',
    body: 'On 9 September 1947, operators of the Harvard Mark II found a moth stuck in a relay. They taped it into the logbook with the note: *"First actual case of bug being found."* The page is now in the Smithsonian.\n\nThe joke in that note is the word **actual**: engineers had been calling faults "bugs" for decades. Thomas Edison wrote about bugs in his inventions in the 1870s.',
    comments: [
      c('byte_wrangler', 46, 'And Grace Hopper, who often gets credited with "coining" it?',
        c('archivist', 55, 'She worked on the Mark II and loved telling the moth story, which is a big part of why it\'s famous. But she didn\'t coin the word, and she didn\'t claim to.')),
      c('iris', 28, 'I had no idea the logbook still exists. That\'s my museum trip sorted.'),
      c('lab_coat', 22, 'Debugging, literally: someone with tweezers.'),
    ],
  },

  // --- Ask a Scientist ----------------------------------------------------------------
  {
    community: 'ask_science', by: 'juniper', score: 302, hours: 7,
    title: 'Why is the sky blue and not violet?',
    body: 'I get that blue light scatters more than red. But violet has an even shorter wavelength, so shouldn\'t the sky be violet?',
    comments: [
      c('lab_coat', 141, 'Great question, and you\'re right that violet scatters even more. Air molecules scatter light roughly as 1/λ⁴ (Rayleigh scattering), so shorter wavelengths scatter much more. Three things push the colour we see towards blue:\n\n1. Sunlight has less violet in it than blue to begin with.\n2. Some violet is absorbed high in the atmosphere.\n3. Our eyes are much less sensitive to violet. The mix of scattered colours that reaches us looks sky blue to our cones.',
        c('juniper', 36, 'So the sky is a bit violet, and my eyes are rounding it to blue. I love that.')),
      c('kestrel', 48, 'And sunsets are red for the same reason: near sunset the light goes through much more air, so most of the blue is scattered out of the beam before it reaches you.'),
      c('ember', 25, 'Then why are clouds white?',
        c('lab_coat', 57, 'Cloud droplets are much bigger than the wavelength of light, so they scatter all colours about equally (Mie scattering). Equal amounts of every colour look white. Thick clouds look grey because less light makes it through them.')),
    ],
  },
  {
    community: 'ask_science', by: 'harbor_light', score: 255, hours: 36,
    title: 'Could a penny dropped from a skyscraper actually hurt someone?',
    body: 'Classic playground claim: drop a penny off the Empire State Building and it\'ll go straight through someone\'s head. True?',
    comments: [
      c('lab_coat', 118, 'No. A penny is light and flat, so it tumbles, and air resistance stops it speeding up very quickly. Its terminal velocity is only somewhere around 40 to 80 km/h, reached within a few dozen metres. After that, extra height makes no difference.\n\nIt would sting, maybe leave a mark, but it won\'t break skin, never mind a skull.',
        c('harbor_light', 24, 'So the danger stops after the first few floors. Physics is a spoilsport.')),
      c('fjord', 41, 'Also, the updraft around a tall building tends to push light things back towards the building, so your penny might not even reach the street.'),
      c('euler_fan', 37, 'A dense, streamlined object is a different story, though. Please don\'t drop pens, tools or anything heavy off tall buildings.'),
    ],
  },
  {
    community: 'ask_science', by: 'lumen', score: 231, hours: 66,
    title: 'Why does ice float when almost every other solid sinks in its own liquid?',
    body: 'Most things are denser as solids. Why is water different, and does it matter?',
    comments: [
      c('lab_coat', 96, 'Hydrogen bonds. In ice, each water molecule bonds to four neighbours in an open, hexagonal lattice that holds them further apart than in liquid water, where the bonds keep breaking and the molecules pack closer. Ice is about 9% less dense than water, so it floats.'),
      c('kestrel', 63, 'And it matters enormously: liquid water is densest at about 4 °C. In winter, lakes cool, the 4 °C water sinks to the bottom, and ice forms on top and insulates the rest. Lakes freeze from the top down, so fish survive the winter underneath.',
        c('lumen', 20, 'So ice floating is basically a life-support system for lakes.')),
      c('prime_suspect', 34, 'Is water the only one?',
        c('lab_coat', 41, 'No, a few others expand when they freeze too: silicon, germanium, gallium and bismuth, for example. Water is just the one that happens to matter most to us.')),
    ],
  },

  // --- Math Puzzles, more ---------------------------------------------------------------
  {
    community: 'math', by: 'kestrel', score: 268, hours: 30,
    title: 'Only 23 people for a 50% chance two share a birthday?',
    body: 'I read that in a room of just 23 people there\'s a better than even chance that two of them share a birthday. There are 365 days! That can\'t be right.',
    comments: [
      c('euler_fan', 118, 'It\'s right, and the trick is that you\'re not asking "does someone share **my** birthday". You\'re asking whether **any pair** matches, and 23 people make 23 × 22 ÷ 2 = **253 pairs**. That\'s a lot of chances.',
        c('kestrel', 29, '253 pairs. OK, that changes how it feels.')),
      c('prime_suspect', 84, 'The clean way is to compute the chance that **nobody** matches, then subtract from 1:\n\n```\nP(no match) = 365/365 × 364/365 × 363/365 × … × 343/365 ≈ 0.493\n```\n\nSo P(at least one match) ≈ 0.507. With 70 people it\'s about 99.9%.',
        c('harbor_light', 17, 'Does it matter that birthdays aren\'t spread evenly over the year?',
          c('prime_suspect', 33, 'It only helps: an uneven spread makes matches *more* likely, so 23 is an upper bound on what you need.'))),
      c('iris', 22, 'We tested this in my office of 30 people. Two pairs. Nobody believed me until we checked.'),
    ],
  },
  {
    community: 'math', by: 'euler_fan', score: 301, hours: 55,
    title: 'Hilbert\'s hotel: always room for one more',
    body: 'A hotel has infinitely many rooms, numbered 1, 2, 3, … and every room is full. A new guest arrives. Can you give them a room without sending anyone away?\n\nThen it gets harder: a bus with infinitely many new guests arrives. Then infinitely many such buses.',
    comments: [
      c('lumen', 58, 'One new guest: ask everyone to move from room *n* to room *n* + 1. Room 1 is free.',
        c('euler_fan', 24, 'Yes! Nobody is sent away; everyone just walks one door down. Forever.')),
      c('byte_wrangler', 71, 'Infinite bus: move everyone from room *n* to room 2*n*. Now every odd room is free, and there are infinitely many of those, one for each passenger.'),
      c('prime_suspect', 66, '::: spoiler Infinitely many buses\nOne way: put the guest already in room *n* into room 2ⁿ. Put passenger *j* of bus *i* into room *p*ʲ, where *p* is the (*i* + 1)-th prime (3, 5, 7, …). Powers of different primes never collide, so everyone gets their own room, and plenty are left over.\n\nThe deeper point: every set of guests here is **countable**, and a countable collection of countable sets is still countable.\n:::',
        c('maple_drift', 14, 'And the cleaning staff resign in a body.')),
      c('fjord', 19, 'What *can\'t* the hotel handle?',
        c('euler_fan', 46, 'A bus with one guest for every real number between 0 and 1. Cantor\'s diagonal argument shows there are more of those than there are rooms, so some guest is always left in the lobby.')),
    ],
  },
  {
    community: 'math', by: 'archivist', score: 214, hours: 82,
    title: 'The seven bridges of Königsberg, and the birth of graph theory',
    body: 'The city of Königsberg sat on both banks of a river and on two islands, joined by seven bridges. Residents liked to ask: can you take a walk that crosses every bridge **exactly once**?\n\nIn 1736 Leonhard Euler showed that you can\'t, and how he showed it is more interesting than the answer.',
    comments: [
      c('euler_fan', 92, 'Euler threw away everything except the land masses (dots) and the bridges (lines between them). Then: each time your walk passes *through* a piece of land, it uses two bridges, one in and one out. So every piece of land except the start and the end must have an **even** number of bridges.\n\nIn Königsberg all four pieces of land had an odd number (5, 3, 3 and 3). No such walk exists.',
        c('kestrel', 25, 'So the rule is: a walk using every line exactly once exists only if zero or two dots have an odd number of lines.',
          c('euler_fan', 31, 'Exactly (for a connected drawing). Zero odd dots: you can even end where you started. Two: you must start at one and end at the other.'))),
      c('lab_coat', 37, 'This is the same reason you can draw the "house with an X on its front" without lifting your pen, but only if you start at one of the bottom corners.'),
      c('byte_wrangler', 28, 'And now we use the same idea to plan bin lorry routes and test circuit boards. Not bad for a walking puzzle.'),
    ],
  },
  {
    community: 'math', by: 'lumen', score: 255, hours: 18,
    title: 'Collatz: the simplest problem nobody can solve',
    body: 'Pick a positive whole number. If it\'s even, halve it. If it\'s odd, triple it and add one. Repeat.\n\nStarting from 6: 6, 3, 10, 5, 16, 8, 4, 2, 1. It seems that **every** starting number eventually reaches 1. Nobody has proved it.',
    comments: [
      c('prime_suspect', 74, 'Try 27. It takes **111 steps** to reach 1, and climbs as high as 9,232 on the way. Small numbers can take wild trips.',
        c('lumen', 21, 'I just did 27 by hand. I regret it, but I believe you.')),
      c('byte_wrangler', 52, 'Five lines of Python if you want to explore:\n\n```python\ndef steps(n):\n    count = 0\n    while n != 1:\n        n = n // 2 if n % 2 == 0 else 3 * n + 1\n        count += 1\n    return count\n\nprint(max(range(1, 1000), key=steps))  # 871, which takes 178 steps\n```'),
      c('euler_fan', 61, 'It\'s been checked by computer for every starting number up to around 2⁶⁸, and in 2019 Terence Tao proved that *almost all* starting numbers eventually get very small, in a precise sense. But "almost all" isn\'t "all", and the full conjecture is still open.',
        c('harbor_light', 15, 'Is there a prize?',
          c('euler_fan', 22, 'There have been a few offered over the years, but mostly the prize is that your name would be remembered forever. Mathematicians half-jokingly warn students away from it: it\'s that good at eating time.'))),
    ],
  },

  // --- Riddles, more --------------------------------------------------------------------
  {
    community: 'riddles', by: 'riddler', score: 187, hours: 24,
    title: 'The farmer, the wolf, the goat and the cabbage',
    body: 'A farmer must cross a river with a wolf, a goat and a cabbage. The boat holds the farmer and **one** passenger. Left alone together, the wolf eats the goat, and the goat eats the cabbage.\n\nHow does everyone get across in one piece?',
    comments: [
      c('dune_walker', 5, 'Take the wolf first, it\'s the most dangerous.',
        c('riddler', 16, 'And leave the goat alone with the cabbage? The cabbage would like a word.')),
      c('iris', 69, '::: spoiler Answer\n1. Take the goat across.\n2. Go back alone.\n3. Take the wolf across.\n4. **Bring the goat back.**\n5. Take the cabbage across.\n6. Go back alone.\n7. Take the goat across.\n\nThe trick is step 4: something can go back the way it came.\n:::',
        c('riddler', 21, 'Correct, and step 4 is exactly where everyone gets stuck.')),
      c('byte_wrangler', 33, 'Fun fact: this is a classic first example for breadth-first search. There are only 16 possible states (each of the four is on one bank or the other), so a computer finds the shortest solution instantly.'),
    ],
  },
  {
    community: 'riddles', by: 'maple_drift', score: 159, hours: 41,
    title: 'Measure exactly 4 litres with a 3-litre and a 5-litre jug',
    body: 'You have a tap, a 3-litre jug and a 5-litre jug, with no markings. How do you measure exactly 4 litres?',
    comments: [
      c('riddler', 54, '::: spoiler One way\n1. Fill the 5. Pour from it into the 3 until the 3 is full. The 5 now holds **2**.\n2. Empty the 3, and pour the 2 litres into it.\n3. Fill the 5 again, and top up the 3 (which needs just 1 litre). The 5 now holds **4**.\n:::',
        c('maple_drift', 12, 'Six pours. My kitchen floor disagrees, but it works.')),
      c('euler_fan', 47, 'There\'s a nice rule behind it: with jugs of *a* and *b* litres you can measure any whole number of litres up to the bigger jug that\'s a multiple of gcd(*a*, *b*). Here gcd(3, 5) = 1, so every amount from 1 to 5 is possible.',
        c('kestrel', 16, 'So with a 4 and a 6 you could never get an odd amount.',
          c('euler_fan', 19, 'Right: gcd(4, 6) = 2, so only even amounts.'))),
    ],
  },
  {
    community: 'riddles', by: 'riddler', score: 142, hours: 63,
    title: '"Brothers and sisters I have none…"',
    body: 'A man looks at a portrait and says:\n\n> Brothers and sisters I have none, but that man\'s father is my father\'s son.\n\nWho is in the portrait?',
    comments: [
      c('harbor_light', 7, 'Himself, obviously.',
        c('riddler', 23, 'The most popular answer, and not quite right. Read it slowly.')),
      c('lumen', 58, '::: spoiler Answer\nHe has no brothers, so "my father\'s son" is **himself**. So the line says: "that man\'s father is **me**." The portrait is of his **son**.\n:::',
        c('fjord', 14, 'I\'ve heard this one five times and still had to read the spoiler.')),
    ],
  },
  {
    community: 'riddles', by: 'euler_fan', score: 233, hours: 96,
    title: 'The blue-eyed islanders (the hardest riddle I know)',
    body: 'On an island live 100 people with blue eyes and 100 with brown eyes. Nobody knows their own eye colour, there are no mirrors, and nobody ever talks about eye colour. Every night a ferry comes, and anyone who has **worked out** that they have blue eyes must leave on it. Everyone is a perfect logician, and everyone knows that.\n\nOne day a visitor says, in front of everyone: **"I can see someone with blue eyes."**\n\nWhat happens, and when?',
    comments: [
      c('fjord', 12, 'Nothing happens. Everyone could already see dozens of people with blue eyes, so the visitor told them nothing new.',
        c('euler_fan', 39, 'That\'s the brilliant part of the puzzle: it *seems* like nothing new. Try it with just one blue-eyed islander first, then two.')),
      c('prime_suspect', 81, '::: spoiler Answer\n**On the 100th night, all 100 blue-eyed islanders leave.**\n\nWith one blue-eyed person: they see no blue eyes, so the visitor must mean them. They leave on night 1.\n\nWith two: each sees one other. Each thinks: "if I\'m not blue-eyed, the other one will leave on night 1." When nobody leaves on night 1, both realise they must be blue-eyed too, and both leave on night 2.\n\nThe same argument climbs one step per night, up to 100.\n:::'),
      c('lab_coat', 54, '::: spoiler So what did the visitor add?\nNot the fact itself, but **common knowledge** of it: now everyone knows that everyone knows that everyone knows… that someone has blue eyes. Before the visitor spoke, that chain stopped after a while. It\'s the starting point the night-by-night counting needs.\n:::',
        c('fjord', 21, 'I\'ve read that three times and I think my brain just leapt a level.')),
    ],
  },
  {
    community: 'riddles', by: 'tidepool', score: 121, hours: 47, lang: 'fr',
    title: 'L\'énigme des trois boîtes mal étiquetées',
    body: 'Trois boîtes : une contient des pommes, une des oranges, et une des pommes et des oranges. Les étiquettes « Pommes », « Oranges » et « Pommes et oranges » sont **toutes fausses**.\n\nVous pouvez sortir **un seul fruit** d\'une seule boîte, sans regarder dedans. Comment remettre toutes les étiquettes à la bonne place ?',
    comments: [
      c('sorrel', 46, '::: spoiler Réponse\nSortez un fruit de la boîte étiquetée « Pommes et oranges ». Comme l\'étiquette est fausse, cette boîte ne contient qu\'une seule sorte de fruit : si c\'est une pomme, c\'est la boîte de pommes.\n\nAlors la boîte étiquetée « Oranges » ne peut pas contenir d\'oranges (étiquette fausse) ni de pommes (déjà trouvées) : c\'est le mélange. La dernière contient les oranges.\n:::',
        c('tidepool', 15, 'Exactement ! Tout repose sur le fait que *toutes* les étiquettes sont fausses.')),
      c('quill', 11, 'Très jolie. Je la garde pour le prochain repas de famille.'),
    ],
  },

  // --- History of Science, more ------------------------------------------------------------
  {
    community: 'history_of_science', by: 'archivist', score: 289, hours: 38,
    title: 'John Harrison and the clock that solved longitude',
    body: 'For centuries ships could find their latitude from the sun and stars, but not their **longitude**, and ships were wrecked because of it. In 1714 the British Parliament offered a prize of up to £20,000 for a practical method.\n\nThe idea was simple: carry a clock set to the time at home. Every 15° of longitude is an hour\'s difference in local noon. The problem was building a clock that kept time on a rolling, damp, freezing and sweltering ship. A self-taught carpenter and clockmaker, John Harrison, spent decades doing it.',
    comments: [
      c('lab_coat', 61, 'The numbers are what get me: to find longitude to within half a degree on a six-week voyage, a clock had to lose or gain no more than about three seconds a day.',
        c('archivist', 44, 'And his sea watch, H4, did far better. On its trial voyage to Jamaica in 1761 and 1762, it was out by only about five seconds after more than 80 days at sea.')),
      c('byte_wrangler', 37, 'Did he get the prize?',
        c('archivist', 52, 'Eventually, mostly. The Board of Longitude kept asking for more trials and more proof, and many astronomers favoured a rival method using the moon. He was paid in stages, and in 1773, when he was 80, Parliament granted him a large sum. The clocks themselves survive, and they still run.')),
      c('fjord', 18, 'Nothing more relatable than finishing your project and the client asking for one more round of revisions. For forty years.'),
    ],
  },
  {
    community: 'history_of_science', by: 'lab_coat', score: 236, hours: 70,
    title: 'Did Galileo really drop balls off the Leaning Tower of Pisa?',
    body: 'Every textbook seems to have the picture: Galileo at the top of the tower, two balls of different weights, landing together, Aristotle refuted. How much of it is true?',
    comments: [
      c('archivist', 88, 'Probably not much. The story comes from Galileo\'s student and biographer Vincenzo Viviani, written long afterwards, and Galileo himself never describes doing it. Many historians think it was a thought experiment, or a story that grew in the telling.',
        c('lab_coat', 31, 'So the most famous experiment in physics may never have happened. Wonderful.')),
      c('archivist', 64, 'But someone did do it! In 1586, Simon Stevin and Jan Cornets de Groot dropped two lead balls, one ten times heavier than the other, about 30 feet from a church tower in Delft. They landed so close together that the two thuds sounded as one.'),
      c('kestrel', 29, 'And Galileo\'s real work on falling was with balls rolling down slopes, wasn\'t it? Slowing the fall down so he could time it.',
        c('archivist', 36, 'Exactly. The inclined planes are less dramatic, but that\'s where his measurements actually came from.')),
    ],
  },
  {
    community: 'history_of_science', by: 'byte_wrangler', score: 278, hours: 105,
    title: 'Ada Lovelace\'s Note G, and the "first program" argument',
    body: 'In 1843 Ada Lovelace translated an Italian article about Charles Babbage\'s **Analytical Engine**, a mechanical computer that was never finished, and added notes three times longer than the article. Note G sets out, step by step, how the Engine could calculate **Bernoulli numbers**.\n\nIt\'s often called the first computer program. Is that fair?',
    comments: [
      c('archivist', 72, 'People argue about this every year. Babbage had sketched shorter programs for the Engine himself, years earlier, so "first program" is shaky. Note G is the most complete and detailed one of its time, and it was published.'),
      c('euler_fan', 66, 'What I find more remarkable is her other insight: that the Engine could act on anything that could be expressed in symbols, not just numbers. She wrote that it might compose elaborate pieces of music. That\'s the idea of a general-purpose computer, a century early.',
        c('iris', 23, 'Composing music in 1843. That\'s a lovely thing to have imagined.')),
      c('byte_wrangler', 41, 'And yes, programmers will be delighted to hear that Note G appears to contain a small bug.',
        c('lab_coat', 26, 'Of course it does. It\'s a real program, then.')),
    ],
  },

  // --- Ask a Scientist, more ----------------------------------------------------------------
  {
    community: 'ask_science', by: 'dune_walker', score: 244, hours: 13,
    title: 'Why do we have leap years, and why was 2000 one but 1900 wasn\'t?',
    body: 'I knew "every four years". Then I found out 1900 wasn\'t a leap year. What\'s going on?',
    comments: [
      c('lab_coat', 103, 'A year (from one spring equinox to the next) is about **365.2422** days, not 365.25.\n\nThe old Julian calendar added a leap day every four years, which averages 365.25: about 11 minutes a year too long. By the 1500s the calendar had drifted around 10 days from the seasons.\n\nThe Gregorian calendar (1582) fixed it with three rules:\n\n1. Divisible by 4: leap year.\n2. Except divisible by 100: not a leap year.\n3. Except divisible by 400: leap year after all.\n\nSo 1900 wasn\'t, 2000 was. That averages 365.2425 days, off by only about a day every 3,000 years or so.',
        c('dune_walker', 21, 'The "except, except" is beautiful. Calendar as nested if statements.')),
      c('byte_wrangler', 48, 'And software gets this wrong all the time. Lots of code assumed "every four years", which happened to work for 2000, so the bug only shows up in 2100.'),
      c('archivist', 39, 'When countries switched, they skipped the drift all at once. Britain and its colonies changed in 1752: Wednesday 2 September was followed by Thursday **14** September.'),
    ],
  },
  {
    community: 'ask_science', by: 'iris', score: 287, hours: 50,
    title: 'How do we know the universe is about 13.8 billion years old?',
    body: 'It seems like an incredibly precise number for something nobody was around to see. How do we actually get it?',
    comments: [
      c('lab_coat', 97, 'Several independent lines of evidence point the same way:\n\n- **The expansion.** Galaxies are moving apart. Measure how fast, run the film backwards, and you get roughly when everything was together.\n- **The cosmic microwave background.** The faint glow left over from when the universe became transparent. Its tiny ripples, measured very precisely by satellites like Planck, fit a model that gives about 13.8 billion years.\n- **The oldest stars.** We understand how stars age well enough to date old star clusters at around 12 to 13 billion years. They can\'t be older than the universe, and they aren\'t.',
        c('iris', 24, 'So it\'s not one measurement, it\'s several that agree. That\'s much more convincing.')),
      c('kestrel', 51, 'Worth adding that there\'s a real open puzzle here: different ways of measuring the expansion rate today (the "Hubble constant") disagree by several percent, more than their error bars allow. It\'s called the Hubble tension, and nobody knows yet what\'s behind it.',
        c('lab_coat', 33, 'Yes, and it\'s a good example of science working properly: everyone agrees on roughly 13.8, and the disagreement at the edges is where the interesting work is.')),
    ],
  },
  {
    community: 'ask_science', by: 'quill', score: 213, hours: 86,
    title: 'Why is the sea salty when rivers are fresh?',
    body: 'Rivers flow into the sea all the time, and rivers aren\'t salty. So where does the salt come from?',
    comments: [
      c('lab_coat', 84, 'Rivers *are* a little salty, just far too little to taste. Rain is slightly acidic, and as it runs over rock it dissolves tiny amounts of minerals, which rivers carry to the sea.\n\nAt sea, water evaporates but the dissolved salts stay behind. Over hundreds of millions of years that has concentrated them to about **3.5%** salt. Hot springs on the sea floor add some too.',
        c('quill', 19, 'So the sea is a giant pan that\'s been simmering for a very long time.')),
      c('harbor_light', 38, 'Then why isn\'t the sea getting saltier every year?',
        c('lab_coat', 46, 'Over long times it\'s roughly in balance: salt also leaves the water, settling into sediments on the sea floor and reacting with rock. What comes in about matches what goes out.')),
      c('sorrel', 22, 'The Dead Sea is the extreme version: water flows in but the only way out is evaporation. It\'s close to 10 times saltier than the ocean, and you float like a cork.'),
    ],
  },
  {
    community: 'ask_science', by: 'brightfern', score: 166, hours: 58, lang: 'de',
    title: 'Warum ist der Nachthimmel eigentlich dunkel?',
    body: 'Klingt dumm, ist es aber nicht: Wenn das Universum unendlich groß wäre und überall Sterne hätte, müsste jede Blickrichtung irgendwann auf einen Stern treffen. Dann wäre der ganze Himmel so hell wie die Sonne. Ist er aber nicht. Warum?',
    comments: [
      c('lab_coat', 71, 'Das ist das berühmte **Olberssche Paradoxon**. Die wichtigste Antwort: Das Universum hat ein endliches Alter, etwa 13,8 Milliarden Jahre. Licht von sehr weit entfernten Sternen hat uns einfach noch nicht erreicht, also sehen wir nur einen begrenzten Teil.\n\nDazu kommt die Ausdehnung des Universums: Licht von weit entfernten Galaxien wird zu längeren Wellenlängen verschoben und kommt schwächer an.',
        c('brightfern', 18, 'Also verrät uns schon der dunkle Himmel, dass das Universum nicht ewig existiert. Großartig.')),
      c('archivist', 39, 'Schöne Anekdote: Einer der Ersten, der die Erklärung mit dem endlichen Alter andeutete, war der Schriftsteller Edgar Allan Poe, 1848 in seinem Essay „Eureka“.'),
    ],
  },

  // --- Programming --------------------------------------------------------------------
  {
    community: 'programming', by: 'harbor_light', score: 334, hours: 11,
    title: 'Why does 0.1 + 0.2 give 0.30000000000000004?',
    body: 'I\'m learning to code and just typed this into the console:\n\n```\n> 0.1 + 0.2\n0.30000000000000004\n```\n\nIs my computer broken?',
    comments: [
      c('byte_wrangler', 142, 'Your computer is fine! Most languages store decimals as **binary floating point** (IEEE 754 doubles). In binary, 0.1 is a repeating fraction, like 1/3 is in decimal (0.333…). So the computer stores the nearest value it can, which is very slightly off. Add two slightly-off numbers and the tiny error shows up in the 17th digit.',
        c('harbor_light', 31, 'So 0.1 in my program isn\'t really 0.1. That\'s unsettling.',
          c('byte_wrangler', 44, 'It\'s about 0.1000000000000000055511151231257827. Close enough for physics, not for money.'))),
      c('prime_suspect', 66, 'Practical rules:\n\n- Don\'t compare floats with `==`. Check whether they\'re within a small tolerance.\n- For money, use whole numbers of cents, or a decimal type:\n\n```python\nfrom decimal import Decimal\nDecimal(\'0.1\') + Decimal(\'0.2\') == Decimal(\'0.3\')  # True\n```'),
      c('cobalt_owl', 38, 'There\'s a whole website named after this exact number. Every language gives the same answer, because they\'re all using the same hardware format.'),
    ],
  },
  {
    community: 'programming', by: 'cobalt_owl', score: 241, hours: 34,
    title: 'Off-by-one errors and the fencepost problem',
    body: 'You\'re building a straight fence 100 metres long, with a post every 10 metres. How many posts do you need?\n\nIf you said 10, welcome to the most common bug in programming.',
    comments: [
      c('dune_walker', 21, '10? 100 divided by 10.',
        c('cobalt_owl', 33, 'That\'s the number of *gaps*. You need a post at each end too, so **11** posts for 10 sections.')),
      c('byte_wrangler', 72, 'This is why so many languages count ranges as "start included, end excluded". In Python, `range(0, 10)` is 0 to 9: ten numbers, and the length is just end minus start. Mixing that up with "1 to 10 inclusive" is where the bugs come from.',
        c('prime_suspect', 28, 'Dijkstra wrote a lovely short note in 1982 on exactly this, arguing for numbering from zero with half-open ranges.')),
      c('lumen', 26, 'There are only two hard problems in computer science: cache invalidation, naming things, and off-by-one errors.'),
    ],
  },
  {
    community: 'programming', by: 'byte_wrangler', score: 279, hours: 77,
    title: 'Things I wrongly believed about time',
    body: 'Every one of these has bitten me or someone I work with:\n\n- Every day has 24 hours.\n- Every minute has 60 seconds.\n- Time zones are whole hours from UTC.\n- The clock never goes backwards.\n\nWhat else would you add?',
    comments: [
      c('lab_coat', 58, 'Days have 23 or 25 hours when the clocks change for daylight saving. And minutes have occasionally had 61 seconds, when a **leap second** was added to keep clock time in step with the Earth\'s slightly irregular rotation.'),
      c('iris', 47, 'Time zones: India is UTC+5:30, Nepal is UTC+5:45, and New Zealand\'s Chatham Islands are UTC+12:45 (+13:45 in summer). Some countries have changed their time zone at short notice.',
        c('byte_wrangler', 34, 'Which is why you should never hard-code offsets. Use a proper time zone database and keep it updated.')),
      c('cobalt_owl', 62, 'My rule of thumb: store moments in UTC, convert to local time only for display. **But** for future events people plan in local time, like "9am every Monday" or a meeting next March, store the local time and the time zone **name**, because the offset might change before then.',
        c('kestrel', 19, 'That last bit is the one nobody tells you until your recurring meeting moves by an hour.')),
      c('fjord', 23, 'And "the year has 12 months" holds, but only in the calendar you\'re thinking of.'),
    ],
  },
];
