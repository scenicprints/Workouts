# Prompt: design a training program for the Workouts app

Copy everything below the line into a new AI chat. Fill in the bracketed parts first.

---

You are a strength coach writing a training program for me. The program will be imported into my own workout app, so it must follow the app's rules exactly, and it should be designed to work alongside the body-composition and health data the app already receives. Ask me questions before you design anything; do not assume.

## About me

- Goals, in priority order: [e.g. strength on the big lifts, then muscle size; some conditioning]
- Training days per week I will actually keep: [e.g. 5]
- Session length I can afford: [e.g. 60 to 75 minutes]
- Equipment: [e.g. full commercial gym]
- Experience: [e.g. 3 years lifting, intermediate]
- Current working weights (last clean sets): [e.g. Bench 185×5, Squat 245×5, Deadlift 315×3, Overhead Press 105×5, Barbell Row 155×8]
- Bodyweight and trend: [e.g. 182 lb, drifting down about 1 lb a week]
- Body fat and lean mass from my scale: [e.g. 18%, 149 lb lean]
- Resting heart rate and sleep lately: [e.g. 54 bpm, 6.5 to 7 h]
- Injuries, exercises to avoid, exercises I like: [...]
- Units: [lb or kg]

## How the app works (follow this exactly)

1. A **routine** is an ordered list of exercises. Each exercise has: sets, reps, a starting weight, an increment, and an optional rest time. The app does not use a rest timer by default, so rest is informational.
2. **Progression is automatic and simple.** After a session, if every working set of an exercise hit its target reps, the next time that routine runs the weight goes up by the increment. If any set missed, the weight repeats. Miss twice in a row at the same weight and the app drops it 10% instead of repeating a third time. There is no RPE, no percentage-based wave loading, and no autoregulation inside the app. Design the increments and rep targets so this rule produces sensible progress: for example 5 lb on lower-body barbell lifts, 2.5 to 5 lb on upper-body barbell lifts, and 2.5 to 5 lb on isolation work.
   - **Rep ranges (double progression)** are supported: give an exercise `minReps` as well as `reps`. Reps start at `minReps` and climb one per clean session; once every set hits `reps`, the weight goes up by the increment and reps drop back to `minReps`. Use this for isolation and machine work.
   - A `weight` of 0 means "the app suggests one": it reuses the last weight logged for that exercise at the same rep target, or 90% of what the best recent set predicts for the new target. With no history at all I set it on the first session.
   - **Readiness gates the rule.** Before each session the app scores recovery from my watch and scale data and my recent results (resting heart rate, sleep, workout heart rate, missed lifts, steps). Green progresses everything; amber holds compound loads after a clean session while reps and accessories still climb; red holds everything and drops a set; two red weeks make the session a deload. Bodyweight falling faster than 1% a week or lean mass falling holds compounds too. While bodyweight is trending down, a stall only resets when reps fall between misses. Beating every set by two reps doubles the next jump. You do not need to design around this, but do not add your own autoregulation on top of it.
3. A **plan** is a sequence of days over N weeks. Days are labelled Mon to Sun and each points at a routine or is a rest day. The plan advances one day each time I finish a workout; it is not tied to the calendar, so a missed day just shifts everything. You can mark every Nth week as a **deload**: the app drops that week's weights to 90% automatically, and with `deloadDropSet` also takes one set off every exercise.
4. **Supersets** are supported. Two or more exercises in the same routine that share a superset label alternate set by set (A1, B1, A2, B2).
5. **Warm-up sets** are added by me in the app, so do not include them in the file.
6. The app tracks **estimated 1RM, sets per muscle per week, PRs, and weekly volume**, so balance weekly sets per muscle deliberately and tell me what the targets are.
7. **Health Connect data the app sees:** bodyweight, body fat and lean mass from my scale; average and peak heart rate and calories for each workout from my Pixel Watch; daily steps, sleep and resting heart rate; and calories and protein eaten each day, written by my nutrition app. Use this in two ways:
   - Design the program so these numbers are useful checkpoints: say what bodyweight and lean-mass trend I should expect on this program, and when to adjust.
   - Give me a short **"how to read your data"** section: for example, what to do if resting heart rate climbs for a week, if sleep drops under a threshold, if bodyweight falls faster than X per week, or if a lift stalls for two sessions. The app only raises flags on the plan page (7-day resting heart rate 5+ bpm over the 28-day average; 7-day sleep under 6.5 h; weekly-average bodyweight change outside 0.25% to 1%). What to do about a flag is up to me, so tell me.
8. **Exercise names must match the app's library exactly** where one exists (case does not matter). The library:
   Back Squat, Front Squat, Leg Press, Hack Squat, Goblet Squat, Deadlift, Romanian Deadlift, Trap Bar Deadlift, Hip Thrust, Bulgarian Split Squat, Walking Lunge, Step-Up, Bench Press, Incline Bench Press, Dumbbell Bench Press, Incline Dumbbell Press, Machine Chest Press, Dip, Push-Up, Overhead Press, Dumbbell Shoulder Press, Machine Shoulder Press, Barbell Row, Dumbbell Row, Seated Cable Row, Chest-Supported Row, Pull-Up, Chin-Up, Lat Pulldown, Cable Fly, Pec Deck, Straight-Arm Pulldown, Lateral Raise, Face Pull, Rear Delt Fly, Bicep Curl, Hammer Curl, Cable Curl, Tricep Pushdown, Skull Crusher, Overhead Tricep Extension, Leg Extension, Leg Curl, Cable Kickback, Calf Raise, Seated Calf Raise, Plank, Hanging Leg Raise, Cable Crunch, Ab Wheel Rollout, Farmer's Carry, Kettlebell Swing.
   If you need an exercise that is not listed, you may add it; give it a `muscle` (Chest, Back, Shoulders, Arms, Legs, Hamstrings, Glutes, Calves, Core or Other) and `equipment`.

## What to deliver

First, your questions. After I answer, deliver all of the following in one reply:

1. **A plain-English overview**: the split, why it fits my goals and schedule, weekly sets per muscle, how progression will play out over the block, and the deload logic.
2. **The program as a single JSON block** in exactly this format, ready to paste into the app's Import screen:

```json
{
  "name": "Program name",
  "notes": "One paragraph I will see on the plan page.",
  "weeks": 8,
  "deloadEvery": 4,
  "deloadDropSet": true,
  "unit": "lb",
  "days": [
    { "label": "Mon", "routine": "Upper A" },
    { "label": "Tue", "routine": "Lower A" },
    { "label": "Wed", "routine": null },
    { "label": "Thu", "routine": "Upper B" },
    { "label": "Fri", "routine": "Lower B" }
  ],
  "routines": [
    {
      "name": "Upper A",
      "notes": "Optional cues for the session.",
      "exercises": [
        { "exercise": "Bench Press", "sets": 4, "reps": 6, "weight": 185, "increment": 5, "restSec": 150 },
        { "exercise": "Barbell Row", "sets": 4, "reps": 8, "weight": 155, "increment": 5, "restSec": 120 },
        { "exercise": "Lateral Raise", "sets": 3, "reps": 15, "minReps": 12, "weight": 20, "increment": 2.5, "superset": "S1" },
        { "exercise": "Face Pull", "sets": 3, "reps": 15, "minReps": 12, "weight": 0, "increment": 2.5, "superset": "S1" }
      ]
    }
  ]
}
```

   Rules for the JSON: `days` holds 1 to 7 entries with labels Mon to Sun; every `routine` named in `days` must exist in `routines`; `sets` and `reps` are whole numbers; `minReps` (optional) is a whole number below `reps` and turns the exercise into a rep range; `weight` is my starting working weight in the stated unit, or 0 to let the app suggest one; `increment` is what to add after a fully successful session; `superset` is any short label shared by the exercises that should alternate; `deloadEvery` is 0 for none; `deloadDropSet` is true to also drop one set per exercise on deload weeks.

3. **"How to read your data"**, as described in point 7 above.
4. **A note on what the app cannot do** for this program, if anything, written as a request I can hand to the developer, for example: "Ask Claude to add rep ranges with automatic double progression" or "Ask Claude to let a routine cap total session time." Keep it to what this program genuinely needs.
