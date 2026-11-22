# 3ayni pitch: speech, live demo and Q&A answers

**Event:** IEEE Tech4Health 2.0. **Team:** Eddes Eddes A777 (Mohamed Idriss Mokdadi, Ahmed Ammar).
**Length:** 4 minutes including the demo, then 2 minutes of questions. **Language:** English.
**Deck:** `pitch/html2/3ayni-through-his-eyes.html` (press **N** to see these notes on screen, **T** for the timer).

**The one sentence the jury must remember:**
> 3ayni turns any laptop into a patient's voice and a watch on his heart: it understands what he says *and* what his body shows.

**Who speaks.** Suggested split: **Idriss** speaks the whole pitch. **Ahmed** sits in front of the laptop as the patient for the demo, already calibrated before the pitch starts, and holds the nurse's phone up for the jury. Change it if you prefer; the script works with one speaker.

**Timing:** about 420 spoken words at 120 words per minute (about 3 min 30 s); the demo lines are spoken while the app works, so the total is about 4 minutes. Rehearse with **T**. If you run long, skip slides 6, 16 and 17 with one click each.

---

## The script

### 1. Cover: the eye video
<!-- 0:35 | 68 words -->
In 1995, a French magazine editor, Jean-Dominique Bauby, had a stroke.
His mind was intact. But he could move only his left eyelid. [pause]
And he wrote a book with it.
Someone read the alphabet aloud, the most used letters first.
He blinked at each letter. About two hundred thousand blinks. [pause 3 s]
Thirty years later, our patients still talk like that.
We are team Eddes Eddes A777. This is 3ayni. [click: we dive into the eye]

### 2. Silence
<!-- 0:10 | 22 words -->
We are now inside the eye of Am Hédi, a patient in a Tunisian ward.
He hears everything. He understands everything. [pause] He cannot say one word. [click]

### 3. The question
<!-- 0:08 | 15 words -->
His nurse, Karim, asks: if you hear me, blink once. [click: the eye blinks]
One blink. That is all he has. [click]

### 4. The problem
<!-- 0:02 | silent -->
[click straight on: the slide says it for you]

### 5. Today: blink codes
<!-- 0:12 | 18 words -->
So Karim guesses. Water? [click] No. The light? [click] No. Turn over? [click] No. [click]
He wanted to say: I am in pain. [pause] [click]

### 6. Today: letter boards
<!-- 0:07 | 13 words -->
Or a letter board, like Bauby. Forty seconds of his time for one word. [click]

### 7. Today: the call button
<!-- 0:06 | 12 words -->
The call button is in his hand. His hand cannot press it. [click]

### 8. No solution does all three
<!-- 0:12 | 25 words -->
Eye-gaze tablets cost thousands of euros. Monitors see the heart, not the words.
Nothing today lets him speak, notices his distress, and tells the nurse. [click] [click past "Try it"]

### 10. The solution
<!-- 0:10 | 22 words -->
3ayni does all three, with one laptop camera.
He looks at a tile, the laptop says it in Darija.
The same camera reads his heart rate. [click]

### 11. Made for day and night
<!-- 0:12 | 27 words -->
The nurse chooses his phrases from her phone.
A keyboard puts the most used letters first, like Bauby's alphabet, with suggestions.
And closed eyes choose nothing. [click] [click past "How it works"]

### 13. Live demo
<!-- 1:00 | about 60 words + 40 s of action -->
Let's see it live. Ahmed is our patient. [Alt+Tab to the app]
Ahmed, look at "I want to drink". [the ring fills; the laptop says نحب نشرب]
The message is already on Karim's phone, with his heart rate. [Ahmed holds the phone up]
Now we simulate a crisis. His heart rate rises: you see the word "Simulation" on both screens. [press S]
The laptop compares it with his own normal, learned when he arrived.
It does not alarm at once: the rise must last. [about 14 s after S, the phone shows "Heart rate elevated"]
Now he says: I am in pain. [Ahmed looks at "I am in pain"]
Pain and a racing heart: an urgent alert, with its reason.
Karim taps "I'm on my way". [tap] Am Hédi sees: help is coming. [Alt+Tab back] [click]

### 14. AI where it matters
<!-- 0:02 | silent; say it only if you are ahead of time -->
[click straight on] *(If ahead of time: "We use AI only where rules cannot work: the face and each patient's gaze. Alerts stay simple rules.")*

### 15. What we measured
<!-- 0:08 | 18 words -->
On test signals, the heart rate stays within three beats. Ninety-six tests pass. A hospital pilot comes next. [click]

### 16. Private and honest
<!-- 0:06 | 15 words -->
The video never leaves the laptop. A weak signal shows a dash, never a guess. [click]

### 17. Scaling
<!-- 0:07 | 14 words -->
Next: a cheap infrared camera for the night, one pilot ward, then homes. [click]

### 18. Vision
<!-- 0:05 | 16 words -->
[slower] Our vision: a voice for every patient who cannot speak, from a camera already in the room. [click]

### 19. Close
<!-- 0:15 | 30 words -->
Bauby needed two hundred thousand blinks to write one book.
Am Hédi needs one look to say: I am in pain. [pause]
His eyes speak. His heart is heard. [click: the eye closes]
Thank you.

---

## Live demo: how to run it safely

**Before the pitch (10 minutes before):**
1. `npm start` in `E:\IEEE\Tech4Health 2.0\3ayni`. Open http://localhost:3000 and choose the phone camera if you use it.
2. Ahmed sits 50–60 cm from the screen, face lit from the front, and calibrates (15 s). Check the **D** panel: under about 15 % left-right and up-down.
3. Pair the phone (**P**, scan the QR code) over the laptop's hotspot. Press **Enable alert sounds** on the phone.
4. **D**, then **Fast demo timings: on**. Wait about 20 s so the baseline is learned. Close the **D** panel.
5. Open the presentation in a second window, fullscreen (**F**). Practise **Alt+Tab** between them.

**Why Ahmed waits before "I am in pain":** with fast demo timings, the heart rate must stay 25 % above baseline for 8 s before the state becomes "elevated" (about 14 s after pressing **S**). If he says "pain" earlier, the phone gets an *attention* message, not an *urgent* alert. Watch the phone's chip turn to "Heart rate elevated", then go. (Without any choice, the screen itself would ask "Are you in pain?" after 20 s; that is too long for the pitch.)

**If something fails on stage:** don't fix it. Say "Here is the same flow, recorded on our screen", go back to the deck, and let slide 13's animation play (the heart rate climbs, the alarm, Karim rushes in). Offer the jury to try it after the session.

**If a judge wants to try:** say "With pleasure, right after the pitch": calibration takes 15 seconds and the pitch has no spare time.

---

## Memory sheet

**Say word for word:** "In 1995, a French magazine editor, Jean-Dominique Bauby, had a stroke."
**Last lines word for word:** "Bauby needed two hundred thousand blinks to write one book. Am Hédi needs one look to say: I am in pain. His eyes speak. His heart is heard."

**One key word per slide:**
Bauby → silence → one blink → (click) → guesses → letter board → button → all three → one camera → day and night → **demo** (drink, phone, stress, wait for "elevated", pain, urgent, on my way) → (click) → three beats → never leaves → infrared → vision → one look.

---

## Questions and answers (2 minutes)

**How to answer:** two or three sentences, the answer first, then one proof. If you don't know: "We have not measured that yet. It is the first thing our pilot will measure." Backup slides 20–22 hold the short versions: jump to them with the arrow keys.

### Accuracy and safety
**1. How accurate is the camera heart rate?**
On synthetic signals it stays within 3 beats per minute from 52 to 130 bpm, even with flickering light. On real faces it works in front light when the person is still. A weak signal shows a dash, never a number. We have not yet measured it on patients against a pulse oximeter; the app already has the logger to do that in a pilot.

**2. What if the camera gives a wrong heart rate and causes a false alarm?**
An alert needs a rise of 25 % above the patient's own baseline for 45 seconds, and it clears only below 15 %. That hysteresis stops alarms from flapping. Every alert states its reason, and the nurse decides. It adds to clinical monitors, never replaces them.

**3. Can the patient choose something by accident?**
A choice needs a steady look of 1.4 seconds. Closing the eyes cancels everything. When he rests, the screen sleeps to one dot, and only a two-second look at the dot wakes it.

**4. Is it a medical device?**
No. It is an assistive tool for communication with a warning signal. Before any medical claim we would need clinical validation and certification.

### Patients and use
**5. How precise is webcam eye tracking?**
Less precise than an infrared eye tracker, so we use large targets: six phrases, and a keyboard with eight big keys per page. Fifteen seconds of calibration fit a small model to each patient, and the jury can try it after the pitch.

**6. Does it work at night or in the dark?**
With room light, yes. In the dark a normal webcam sees nothing. Our next hardware step is a cheap infrared webcam, which also tracks the eyes better. Professional eye trackers use infrared too.

**7. What if the patient cannot read, or gets tired?**
Every tile has an icon and is spoken aloud in Darija, and the nurse's questions need only yes or no. When he blinks more than usual, selection slows down. Head movement or a single switch are on our roadmap for patients who lose eye control.

**8. What about patients with darker skin?**
Camera heart rate is known to be less accurate on darker skin and in low light, because there is less reflected signal. We say it openly, we grade every reading, and our validation logger is built to measure it across skin tones.

### Technology and AI
**9. Where exactly is the AI?**
A neural network finds the face and the eyes; rules cannot do that. A small model learns each patient's gaze in 15 seconds. Another small model suggests the most likely phrases and puts distress phrases first when the heart races. The alerts are plain rules on purpose, because nurses must trust and understand them.

**10. Why not ChatGPT or another large language model?**
It would need the internet, it would be slow, and it cannot explain its choices. Our small model runs on the laptop in under a millisecond and learns this one patient.

**11. How does the camera see a heartbeat?**
Each heartbeat pushes blood into the skin, and blood absorbs green light. The skin colour changes by about 0.1 %. We average over a thousand skin pixels and use a published method, POS, that cancels lighting changes. Then a frequency analysis finds the pulse.

### Privacy, cost and competition
**12. Where does the data go?**
The video is processed in the laptop's browser and never stored or sent. Only phrases, alerts and numbers go to the nurse's phone, on the local network, after pairing with a QR code. It works with no internet.

**13. How much does it cost?**
The software runs on a laptop and webcam the hospital already has. There is no subscription and no special device. A cheap infrared webcam is the only optional extra.

**14. Apple and Google already have free eye control. Why 3ayni?**
They let a person use a phone with their eyes. 3ayni is built for a hospital bed: it reads the heart too, joins both signals, alerts the nurse, speaks Darija, and runs on any laptop.

**15. What did you test, and what is real?**
The app works end to end and 96 automated tests pass. The suggestion results come from simulated care routines, not patients. The next step is a pilot in one Tunisian ward to measure real accuracy.

---

## Other hook options (if you prefer another opening)

1. **Bauby's blinks (used above).** Genre: modern historical event (France, 1995–1997). Pattern: mirror story (A1).
   `true ✓ (2 sources) | fits the core message ✓ (same frequency alphabet as our keyboard) | surprise high | 35 s ✓ | easy to say ✓ | callback ✓ (blinks vs one look)`
2. **Stephen Hawking's cheek.** Genre: science. Pattern: mirror story.
   "Stephen Hawking explained the universe with one muscle in his cheek. A sensor on his glasses saw it move. In 2013 he managed about one or two words per minute. He had Intel's engineers. Our patients have a nurse who guesses."
   `true ✓ (Intel CTO figure, 2013) | fits ✓ | surprise medium | 20 s ✓ | easy ✓ | callback medium`
3. **Puzzle question.** Pattern: A3.
   "How do you ask for water when the only thing you can move is your eyelid? [pause] And how does your nurse know you are in pain if you cannot say it?"
   `no facts needed ✓ | fits ✓ | surprise medium | 10 s ✓ | easy ✓ | callback ✓`
4. **Bold contrast.** Pattern: A4.
   "A blink is the smallest movement a body can make. For some patients, it is the only one left: their only yes, their only no, their only way to say 'I am in pain'."
   `no facts needed ✓ | fits ✓ | surprise medium | 12 s ✓ | easy ✓ | callback ✓`

---

## Sources

- Bauby, about 200,000 blinks and about two minutes per word: [The Diving Bell and the Butterfly, Wikipedia](https://en.wikipedia.org/wiki/The_Diving_Bell_and_the_Butterfly), citing J.-T. Dahlburg, ["A Writer's Spirit Soared With a Blink of His Eye", Los Angeles Times, 15 March 1997](https://www.latimes.com/archives/la-xpm-1997-03-15-mn-38526-story.html).
- Bauby, blinks counted by his stenographer: ["Paralyzed writer found way to soar", The Spokesman-Review, 11 March 1997](https://www.spokesman.com/stories/1997/mar/11/paralyzed-writer-found-way-to-soar/).
- Bauby, stroke on 8 December 1995, left eyelid, frequency-ordered alphabet (E, S, A, R, I, N, T, U, L…), transcriber Claude Mendibil, death on 9 March 1997: [Jean-Dominique Bauby, Wikipedia](https://en.wikipedia.org/wiki/Jean-Dominique_Bauby); working pattern: [Elizabeth Day interviews Claude Mendibil, The Guardian, 27 January 2008](https://www.theguardian.com/film/2008/jan/27/2).
- Hawking, one or two words per minute (Intel CTO Justin Rattner, 2013): [PCWorld](https://www.pcworld.com/article/436659/intel-swiftkey-upgrade-stephen-hawkings-communication-technology.html); cheek sensor and ACAT: [Intel press release, 2014](https://www.intc.com/news-events/press-releases/detail/380/new-intel-created-system-offers-professor-stephen-hawking), [Scientific American](https://www.scientificamerican.com/article/intel-helps-hawking-communicate/).
- 3ayni figures (3 bpm on test signals, 96 tests, 40 s for "PAIN" on the letter board model, 1.4 s dwell, 25 % / 15 % alert thresholds): this project's code and tests, see `3ayni-how-it-works.md`.
